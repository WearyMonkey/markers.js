//steal(
//    './group.js'
//).then(function () {
        var MAX_ZOOM = 20;
        var Group = wm.Group;

        var Cluster = wm.Cluster = function (parent, zoom, zoomRange, settings) {
            this.parent = parent;
            this.settings = settings;
            this.id = Cluster.ids++;

            this.zoom = zoom;
            this.zoomRange = zoomRange;

            settings.groups = settings.groups || [];

            if (!parent) {
                settings.groups = $.map(settings.groups, function (groupType) {
                    return groupType.replace(/\./g, ":")
                });
            }

            this.groups = {};
            for (var i = 0; i < settings.groups.length; i++) {
                this.groups[settings.groups[i]] = {};
            }

            this.nodes = [];
            this.pages = {};
            this.pagesCount = 0;
            this.bounds = new google.maps.LatLngBounds();
            this.center = this.bounds.getCenter();
            this.connections = [];
            this.sequenceToChild = {};
        };

        Cluster.makeRootCluster = function(group, connections) {
            return new Cluster(null, 0, MAX_ZOOM+1, { groups: [group], zoomBoxes: getZoomBoxes(), maxZoom: MAX_ZOOM, connections: connections} );
        };

        Cluster.ids = 1;

        Cluster.States = Group.States;
        var States = Cluster.States;

        Cluster.prototype.getBounds = function () {
            return this.bounds;
        };

        Cluster.prototype.getCenter = function () {
            return this.center;
        };

        Cluster.prototype.getDisplayCenter = function () {
            return this.center;
        };

        Cluster.prototype.getGroup = function (type, id) {
            var typeGroups = this.groups[type];
            return typeGroups ? typeGroups[id] : undefined;
        };

        Cluster.prototype.getGroups = function () {
            return this.groups;
        };

        Cluster.prototype.getPages = function () {
            return $.map(this.pages, function (page) {
                return page
            });
        };

        Cluster.prototype.getId = function () {
            return this.id;
        };

        Group.prototype.getMarker = function () {
            return this.marker;
        };

        Cluster.prototype.getParent = function () {
            return this.parent;
        };

        Cluster.prototype.getZoomRange = function () {
            return {from:this.zoom, to:this.zoom + this.zoomRange - 1};
        };

        Cluster.prototype.isInZoomRange = function (zoom) {
            return zoom >= this.zoom && zoom < this.zoom + this.zoomRange;
        };

        Cluster.prototype.removePage = function (page) {
            if (!this.pages[page.local.id]) return this.pagesCount;

            delete this.pages[page.local.id];
            this.pagesCount--;

            for (var i = 0; i < this.nodes.length; ++i) {
                var child = this.nodes[i];
                if (!child.removePage(page)) {
                    this.nodes.splice(i, 1);
                    --i;
                }
            }

            for (var groupType in this.groups) {
                for (var groupId in this.groups[groupType]) {
                    var group = this.groups[groupType][groupId];
                    if (group && !group.removePage(page)) {
                        delete this.groups[groupType][groupId];
                    }
                }
            }

            return this.pagesCount;
        };

        Cluster.prototype.addPage = function (page, point) {
            point = point || page.point;
            if (this.pages[page.local.id]) return;
            this.pages[page.local.id] = page;
            this.pagesCount++;
            addPageToGroups(this, page, point);

            if (!this.bounds.contains(point)) {
                this.bounds.extend(point);
                this.center = this.bounds.getCenter();
            }

            addToChildren(this, page, point);

            var oldZoomRange = this.zoomRange;
            this.zoomRange = findZoomRange(this);

            if (this.zoomRange < oldZoomRange) {
                splitChildren(this, this.zoom + this.zoomRange, oldZoomRange - this.zoomRange)
            }

            if (this.zoomRange == 0) {
                removeSelf(this);
            }
        };

        function addToChildren(self, page, point) {
            var nextZoom = self.zoom + self.zoomRange;

            if (nextZoom > self.settings.maxZoom) return;

            var node = chooseBest(point, self.nodes);

            if (!node) {
                node = new Cluster(self, nextZoom, self.settings.maxZoom - nextZoom + 1, self.settings);
                self.nodes.push(node);
            }

            node.addPage(page, point);
        }

        function chooseBest(insert, nodes, max) {
            var smallestArea = Number.MAX_VALUE,
                smallestNode,
                center = insert.getCenter ? insert.getCenter() : insert;

            for (var i = 0; i < nodes.length; i++) {
                var bounds = nodes[i].bounds;
                var distance = wmu.distancePointsSquared(center, bounds.getCenter());
                var childMax = max || Math.pow(nodes[i].settings.zoomBoxes[nodes[i].zoom].max, 2);
                if (distance < childMax) {
                    var area = rankInsert(insert, bounds);
                    if (area < smallestArea) {
                        smallestNode = nodes[i];
                        smallestArea = area;
                    }
                }
            }

            return smallestNode;
        }

        function rankInsert(insert, bounds) {
            //todo, optimise
            // currently the change in area (R-tree)
            var newBounds = new google.maps.LatLngBounds();
            newBounds.union(bounds);
            if (insert instanceof google.maps.LatLngBounds) {
                newBounds.union(insert)
            } else {
                newBounds.extend(insert);
            }
            var newSpan = newBounds.toSpan(),
                oldSpan = bounds.toSpan();
            return (newSpan.lat() * newSpan.lng()) - (oldSpan.lat() * oldSpan.lng());
        }


        function splitChildren(self, zoom, zoomRange) {
            var newNodes = [], i, j,
                newNode, seeds, dis, maxDis = 0;

            if (!self.nodes.length) {
                for (i in self.pages) {
                    newNode = new Cluster(self, self.settings.maxZoom, 1, self.settings);
                    newNode.addPage(self.pages[i]);
                    self.nodes.push(newNode);
                }
                if (--zoomRange == 0) return true;
            }

            if (self.nodes.length < 3) {
                seeds = self.nodes;
            } else {
                for (i = 0; i < self.nodes.length; ++i) {
                    for (j = i + 1; j < self.nodes.length; ++j) {
                        dis = wmu.distancePointsSquared(self.nodes[i].bounds.getCenter(), self.nodes[j].bounds.getCenter());
                        if (dis > maxDis) {
                            seeds = [self.nodes[i], self.nodes[j]];
                            maxDis = dis;
                        }
                    }
                }
            }

            for (i = 0; i < seeds.length; ++i) {
                newNode = new Cluster(self, zoom, zoomRange, self.settings);
                newNodes.push(newNode);
                newNode.bounds.union(seeds[i].bounds);
            }

            for (i = 0; i < self.nodes.length; ++i) {
                var child = self.nodes[i];
                newNode = chooseBest(child.bounds, newNodes, Number.MAX_VALUE);
                if (!newNode) {
                    newNode = new Cluster(self, zoom, zoomRange, self.settings);
                    newNodes.push(newNode);
                }
                newNode.nodes.push(child);
                newNode.bounds.union(child.bounds);
                newNode.center = newNode.bounds.getCenter();
            }

            // clear the groups childrens
            $.each(self.groups, function (groupType, groupMap) {
                $.each(groupMap, function (groupId, group) {
                    group.nodes = [];
                    group.connections = [];
                    group.sequenceToChild = [];
                });
            });

            for (i = 0; i < newNodes.length; ++i) {
                newNode = newNodes[i];
                for (j = 0; j < newNode.nodes.length; ++j) {
                    mergeChild(newNode, newNode.nodes[j]);
                }
            }

            self.nodes = newNodes;
            return true;

            function mergeChild(newCluster, child) {
                child.parent = newCluster;
                for (var i in child.pages) {
                    var page = child.pages[i];
                    var point = page.point;
                    newCluster.pages[page.local.id] = page;
                    newCluster.pagesCount++;
                    addPageToGroups(newCluster, page, point, child);
                }
            }
        }

        function removeSelf(self) {
            if (!self.parent) return false;

            var parentNodes = self.parent.nodes,
                newZoom = self.zoom, i;
            for (i = 0; i < parentNodes.length; ++i) {
                if (parentNodes[i] == self) {
                    parentNodes.splice(i, 1);
                }
            }

            for (i = 0; i < self.nodes.length; ++i) {
                var child = self.nodes[i];
                child.zoomRange += child.zoom - newZoom;
                child.zoom = newZoom;
                child.parent = self.parent;
                parentNodes.push(child);
                $.each(child.groups, function (groupType, groups) {
                    $.each(groups, function (groupId, group) {
                        self.parent.groups[groupType][groupId].addChild(group);
                    });
                });
            }

            return true;
        }

        function addPageToGroups(self, page, point, child) {
            for (var i = 0; i < self.settings.groups.length; ++i) {
                var groupType = self.settings.groups[i];
                var groupIds = $.makeArray(wmu.deepGet(groupType.replace(/:/g, "."), page));
                for (var j = 0; j < groupIds.length; ++j) {
                    var groupId = groupIds[j],
                        group = self.groups[groupType][groupId];
                    if (!group) {
                        group = self.groups[groupType][groupId] = new Group(self, groupType, groupId, self.settings.connections);
                        if (self.parent) {
                            var parentGroup = self.parent.groups[groupType] && self.parent.groups[groupType][groupId];
                            if (parentGroup) parentGroup.addChild(group);
                            else addPageToGroups(self.parent, page, point, self);
                        }
                    }
                    group.addPage(page, point);

                    // the a child already exists (during a split) then we add it and set up the connections
                    if (child) {
                        var childGroup = child.groups[groupType][groupId];
                        if (!childGroup) {
                            addPageToGroups(child, page, point);
                        } else if (group.addChild(childGroup)) {
                            for (var k = 0; k < childGroup.pages.length; ++k) {
                                group.addPageToConnections(childGroup, childGroup.pages[k]);
                            }
                        }
                    }
                }
            }
        }

        function findZoomRange(self) {
            var span = self.bounds.toSpan(),
                smallDis, bigDis,
                top = self.zoom,
                bottom = self.zoom + self.zoomRange - 1;

            if (span.lat() > span.lng()) {
                smallDis = span.lng();
                bigDis = span.lat();
            } else {
                smallDis = span.lat();
                bigDis = span.lng();
            }

            while (bottom > top && self.settings.zoomBoxes[bottom].max < bigDis) bottom--;

            return bottom - top + 1;
        }

        function getZoomBoxes() {
            if (!Cluster.zoomBoxes) {
                var zoomBoxes = Cluster.zoomBoxes = [];

                var minDis = 84.375,
                    maxDis = 112.6,
                    scale = 1;

                for (var z = 0; z <= MAX_ZOOM; z++) {
                    zoomBoxes[z] = {
                        min: (minDis / scale),
                        max: (maxDis / scale)
                    };
                    scale <<= 1;
                }
            }

            return Cluster.zoomBoxes;
        }
    //});