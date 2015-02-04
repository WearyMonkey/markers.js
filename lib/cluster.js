//steal(

//).then(function () {
        var MAX_ZOOM = 20;

        var Cluster = wm.Cluster = function (parent, zoom, zoomRange, settings) {
            this.parent = parent;
            this.settings = settings;
            this.id = Cluster.ids++;
            this.zoom = zoom;
            this.zoomRange = zoomRange;
            this.nodes = [];
            this.pages = {};
            this.pagesCount = 0;
            this.bounds = new google.maps.LatLngBounds();
            this.center = this.bounds.getCenter();
            this.connections = [];
            this.sequenceToChild = [];
            this.pageToSeq = {};
        };

        Cluster.makeRootCluster = function(connections) {
            return new Cluster(null, 0, MAX_ZOOM+1, { zoomBoxes: getZoomBoxes(), maxZoom: MAX_ZOOM, connections: connections} );
        };

        Cluster.ids = 1;

        Cluster.States = {
            Normal: 0,
            Collapsed: 1,
            Expanded: 2
        };

        Cluster.prototype.getBounds = function () {
            return this.bounds;
        };

        Cluster.prototype.getCenter = function () {
            return this.center;
        };

        Cluster.prototype.getDisplayCenter = function() {
            return this.getBestPage().point;
        };

        Cluster.prototype.getPages = function () {
            return $.map(this.pages, function (page) {
                return page
            });
        };

        Cluster.prototype.getId = function () {
            return this.id;
        };

        Cluster.prototype.getMarker = function () {
            return this.marker;
        };

        Cluster.prototype.getParent = function () {
            return this.parent;
        };

        Cluster.prototype.getState = function() {
            return this.state;
        };

        Cluster.prototype.setState = function(state, recurse) {
            this.state = state;
            if (recurse) {
                for (var i = 0; i < this.nodes.length; ++i) {
                    this.nodes[i].setState(state, true);
                }
            }
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
            this.bestPage = null;

            if (this.parent) {
                this.parent.removePageFromConnections(page);
            }

            for (var i = 0; i < this.nodes.length; ++i) {
                var child = this.nodes[i];
                if (!child.removePage(page)) {
                    this.nodes.splice(i, 1);
                    --i;
                }
            }

            return this.pagesCount;
        };

        Cluster.prototype.addPage = function (page, point) {
            point = point || page.point;
            if (this.pages[page.local.id]) return;
            this.pages[page.local.id] = page;
            this.pagesCount++;
            this.bestPage = null;

            if (!this.bounds.contains(point)) {
                this.bounds.extend(point);
                this.center = this.bounds.getCenter();
            }

            if (this.parent) {
                this.parent.addPageToConnections(this, page);
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

        Cluster.prototype.addPageToConnections = function(node, page) {
            if (!this.settings.connections) return;

            var seq = page.local.mapSequence;
            this.pageToSeq[page.local.id] = seq;

            if (!isSeq(seq)) return;
            else if (this.sequenceToChild[seq]) this.sequenceToChild.splice(seq, 0, node);
            else this.sequenceToChild[seq] = node;

            var prevNode = this.sequenceToChild[seq-1];
            var nextNode = this.sequenceToChild[seq+1];

            addConnection(this, seq-1, prevNode, node, true);
            addConnection(this, seq, node, nextNode, false);
        };

        Cluster.prototype.removePageFromConnections = function(page) {
            if (!this.settings.connections) return;

            var newSeq = page.local.mapSequence; // if no story_id, then page has been removed from story and sequence is considered null
            var oldSeq = this.pageToSeq[page.local.id];
            this.pageToSeq[page.local.id] = newSeq;

            if (isSeq(oldSeq)) {
                var prevNode = this.sequenceToChild[oldSeq-1];
                var nextNode = this.sequenceToChild[oldSeq+1];

                this.sequenceToChild.splice(oldSeq, 1);
                this.connections.splice(oldSeq, 1);
                addConnection(this, oldSeq-1, prevNode, nextNode, true);
            }

            if (isSeq(newSeq)) {
                this.sequenceToChild.splice(newSeq, 0, null);
                this.connections.splice(newSeq, 0, null);
                this.connections[newSeq-1] = null;
            }
        };

        Cluster.prototype.isPrimary = function(zoom) {
            if (typeof zoom == 'undefined') {
                return !!this.primary;
            } else {
                var parent = this;
                do {
                    if (parent.zoom <= zoom) {
                        return !!parent.primary;
                    }
                } while (parent = parent.getParent());

                return false;
            }
        };

        Cluster.prototype.getBestPage = function () {
            var i, parent, parentsBest, dis, page,
                centerLat = this.center.lat(),
                centerLng = this.center.lng(),
                shortestDis = Number.MAX_VALUE;

            if (!this.bestPage) {
                parent = this.getParent();
                parentsBest = parent && parent.getBestPage();
                if (parentsBest && this.pages[parentsBest.local.id] != null) {
                    this.bestPage = parentsBest;
                } else {
                    for (i in this.pages) {
                        page = this.pages[i];
                        dis = wmu.distanceLatLngsSquared(page.point.lat(), page.point.lng(), centerLat, centerLng);
                        if (dis < shortestDis) {
                            this.bestPage = page;
                            shortestDis = dis;
                        }
                        //else if (dis == shortestDis && page.getScore() > this.bestPage.getScore()) {
                        //    this.bestPage = page;
                        //}
                    }
                }
            }

            return this.bestPage;
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

            self.nodes = [];
            self.connections = [];
            self.sequenceToChild = [];

            for (i = 0; i < newNodes.length; ++i) {
                newNode = newNodes[i];
                for (j = 0; j < newNode.nodes.length; ++j) {
                    mergeChild(self, newNode, newNode.nodes[j]);
                }
            }

            return true;
        }

        function mergeChild(self, newCluster, child) {
            self.nodes.push(newCluster);
            child.parent = newCluster;
            for (var i in child.pages) {
                var page = child.pages[i];
                newCluster.pages[page.local.id] = page;
                newCluster.pagesCount++;
                self.addPageToConnections(newCluster, page)
            }
        }

        function addConnection(self, seq, cluster1, cluster2, replace) {
            var connection;
            if (seq < 0 || !cluster1 || !cluster2 || cluster1.id === cluster2.id) connection = null;
            else connection = {
                id: Cluster.ids++,
                cluster1: cluster1,
                cluster2: cluster2,
                path: null
            };

            if (replace || !self.connections[seq]) self.connections[seq] = connection;
            else self.connections.splice(seq, 0, connection);

            return true;
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
            }

            return true;
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