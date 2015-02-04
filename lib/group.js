//steal(
//
//).then(function() {

        function isSeq(num) {
            return num != null && num >= 0;
        }

        var Group = wm.Group = function(cluster, groupType, groupId, connections) {
            this.cluster = cluster;
            this.groupType = groupType;
            this.groupId = groupId;
            this.pageMap = {};
            this.pages = [];
            this.bounds = new google.maps.LatLngBounds();
            this.center = this.bounds.getCenter();
            this.marker = null;
            this.nodeMap = {};
            this.nodes = [];
            this.id = Group.ids++;
            this.connections = [];
            this.sequenceToChild = [];
            this.pageToSeq = {};
            this.state = Group.States.Normal;
            this.makeConnections = connections;
            this.bestPage = null;
        };

        Group.sequenceToNodes = {};

        Group.ids = 1;

        Group.States = {
            Normal: 0,
            Collapsed: 1,
            Expanded: 2
        };

        Group.prototype.addPage = function(page, point) {
            if (this.pageMap[page.local.id] != null) return;
            this.bounds.extend(point);
            this.center = this.bounds.getCenter();
            this.pageMap[page.local.id] = this.pages.push(page) - 1;
            this.bestPage = null;

            var shortestDis = Number.MAX_VALUE;

            if (!this.cluster.parent || typeof page.local.mapSequence === "undefined") return;

            var parent = this.cluster.parent.groups[this.groupType][this.groupId];
            parent.addPageToConnections(this, page);
        };

        Group.prototype.getBestPage = function () {
            var i, parent, parentsBest, dis, page,
                centerLat = this.center.lat(),
                centerLng = this.center.lng(),
                shortestDis = Number.MAX_VALUE,
                pages = this.pages,
                len = pages.length;

            if (!this.bestPage) {
                parent = this.getParent();
                parentsBest = parent && parent.getBestPage();
                if (parentsBest && this.pageMap[parentsBest.local.id] != null) {
                    this.bestPage = parentsBest;
                } else {
                    for (i = 0; i < pages.length; ++i) {
                        page = pages[i];
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

        Group.prototype.getBounds = function() {
            return this.bounds;
        };

        Group.prototype.getCenter = function() {
            return this.center;
        };

        Group.prototype.getDisplayCenter = function() {
            return this.getBestPage().point;
        };

        Group.prototype.getContainedClustersAndConnections = function(bounds, zoom) {
            var group = wmu.setValue({}, this.groupType, this.groupId, true);
            return this.cluster.getContainedClustersAndConnections(bounds, zoom, group);
        };

        Group.prototype.getPages = function() {
            return this.pages;
        };

        Group.prototype.getPageMap = function() {
            return this.pageMap;
        };

        Group.prototype.getId = function() {
            return this.id;
        };

        Group.prototype.getMarker = function() {
            return this.marker;
        };

        Group.prototype.getParent = function(ignoreState) {
            // todo, ingore state
            var parentCluster = this.cluster.parent;
            return parentCluster && parentCluster.groups[this.groupType][this.groupId]
        };

        Group.prototype.getState = function() {
            return this.state;
        };

        Group.prototype.getZoomRange = function() {
            var zoomRange = this.cluster.getZoomRange();
            var to = (this.state && this.state !== Group.States.Normal) ? this.cluster.settings.maxZoom : zoomRange.to;
            return {from: zoomRange.from, to: to};
        };

        Group.prototype.isPrimary = function(zoom) {
            if (typeof zoom == 'undefined') return !!this.primary;
            else {
                var parent = this.cluster;
                do {
                    if (parent.zoom <= zoom) {
                        return !!parent.groups[this.groupType][this.groupId].primary;
                    }
                } while (parent = parent.getParent());

                return false;
            }
        };

        Group.prototype.isInZoomRange = function(zoom) {
            return this.cluster.isInZoomRange(zoom);
        };

        Group.prototype.removePage = function(page) {
            var parent = this.getParent();
            var index = this.pageMap[page.local.id];
            if (index != null) {
                delete this.pageMap[page.local.id];
                var last = this.pages.pop();
                if (index != this.pages.length) {
                    this.pages[index] = last;
                    this.pageMap[last.local.id] = index;
                }
                this.bestPage = null;
                if (parent) {
                    parent.removePageFromConnections(page);
                }
                if (parent && !this.pages.length) {
                    for (var i = 0; i < parent.nodes.length; ++i) {
                        if (parent.nodes[i] == this) {
                            parent.nodes.splice(i, 1);
                            break;
                        }
                    }
                }
            }
            return this.pages.length;
        };

        Group.prototype.setState = function(state, recurse) {
            this.state = state;
            if (recurse) {
                for (var i = 0; i < this.nodes.length; ++i) {
                    this.nodes[i].setState(state, true);
                }
            }
        };

        Group.prototype.getGroupId = function() {
            return this.groupId;
        };

        /**
         * Protected Methods
         */
        Group.prototype.addChild = function(group) {
            if (wmu.addUnique(this.nodeMap, group.id)) {
                this.nodes.push(group);
                return true;
            } else {
                return false;
            }
        };

        /**
         * Private Methods
         */
        Group.prototype.addPageToConnections = function(node, page) {
            if (!this.makeConnections) return;

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

        Group.prototype.removePageFromConnections = function(page) {
            if (!this.makeConnections) return;

            var newSeq = typeof page.story_id !== "undefined" && page.local.mapSequence; // if no story_id, then page has been removed from story and sequence is considered null
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

        function addConnection(self, seq, group1, group2, replace) {
            var connection;
            if (seq < 0 || !group1 || !group2 || group1.id === group2.id) connection = null;
            else connection = {
                id: Group.ids++,
                group1: group1,
                group2: group2,
                path: null
            };

            if (replace || !self.connections[seq]) self.connections[seq] = connection;
            else self.connections.splice(seq, 0, connection);

            return true;
        }
    //});