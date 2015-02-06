(function() {
    var MAX_ZOOM = 20,
        ids = 1;

    var Cluster = wm.Cluster = function (parent, zoom, zoomRange, settings) {
        this.parent = parent;
        this.settings = settings;
        this.id = ids++;
        this.zoom = zoom;
        this.zoomRange = zoomRange;
        this.nodes = [];
        this.points = {};
        this.pointsCount = 0;
        this.bounds = new google.maps.LatLngBounds();
        this.center = this.bounds.getCenter();
        this.connections = [];
        this.sequenceToChild = [];
        this.pointToSeq = {};
    };

    wmu.extend(Cluster, {
        States: {
            Normal: 0,
            Collapsed: 1,
            Expanded: 2
        },
        
        makeRootCluster: function(connections) {
            return new Cluster(null, 0, MAX_ZOOM+1, { zoomBoxes: getZoomBoxes(), maxZoom: MAX_ZOOM, connections: connections} );
        }
    });

    wmu.extend(Cluster.prototype, {
        getBounds: function() {
            return this.bounds;
        },

        getCenter: function() {
            return this.center;
        },

        getDisplayCenter: function() {
            return getBestPoint(this)._latLng;
        },

        getPoints: function() {
            var points = [];
            for (var i in this.points) {
                if (this.points.hasOwnProperty(i)) points.push(this.points[i]);
            }
            return points;
        },

        getId: function() {
            return this.id;
        },

        getMarker: function() {
            return this.marker;
        },

        getParent: function() {
            return this.parent;
        },

        getState: function() {
            return this.state;
        },

        setState: function(state, recurse) {
            this.state = state;
            if (recurse) {
                for (var i = 0; i < this.nodes.length; ++i) {
                    this.nodes[i].setState(state, true);
                }
            }
        },

        getZoomRange: function() {
            return {from:this.zoom, to:this.zoom + this.zoomRange - 1};
        },

        isInZoomRange: function(zoom) {
            return zoom >= this.zoom && zoom < this.zoom + this.zoomRange;
        },

        removePoint: function(point) {
            if (!this.points[point._id]) return this.pointsCount;
            delete this.points[point._id];

            this.pointsCount--;
            this.bestPoint = null;

            if (this.parent) {
                removePointFromConnections(this.parent, point);
            }

            for (var i = 0; i < this.nodes.length; ++i) {
                var child = this.nodes[i];
                if (!child.removePoint(point)) {
                    this.nodes.splice(i, 1);
                    --i;
                }
            }

            return this.pointsCount;
        },

        addPoint: function(point) {
            if (this.points[point._id]) return;
            this.points[point._id] = point;
            this.pointsCount++;
            this.bestPoint = null;

            if (!this.bounds.contains(point._latLng)) {
                this.bounds.extend(point._latLng);
                this.center = this.bounds.getCenter();
            }

            if (this.parent) {
                addPointToConnections(this.parent, this, point);
            }

            addToChildren(this, point);

            var oldZoomRange = this.zoomRange;
            this.zoomRange = findZoomRange(this);

            if (this.zoomRange < oldZoomRange) {
                splitChildren(this, this.zoom + this.zoomRange, oldZoomRange - this.zoomRange)
            }

            if (this.zoomRange == 0) {
                removeSelf(this);
            }
        }
    });

    function addPointToConnections(self, node, point) {
        if (!self.settings.connections) return;

        var seq = point._sequence;
        self.pointToSeq[point._id] = seq;

        if (seq == null) return;
        else if (self.sequenceToChild[seq]) self.sequenceToChild.splice(seq, 0, node);
        else self.sequenceToChild[seq] = node;

        var prevNode = self.sequenceToChild[seq-1];
        var nextNode = self.sequenceToChild[seq+1];

        addConnection(self, seq-1, prevNode, node, true);
        addConnection(self, seq, node, nextNode, false);
    }

    function removePointFromConnections(self, point) {
        if (!self.settings.connections) return;

        var newSeq = point._sequence; // if no story_id, then point has been removed from story and sequence is considered null
        var oldSeq = self.pointToSeq[point._id];
        self.pointToSeq[point._id] = newSeq;

        if (oldSeq != null) {
            var prevNode = self.sequenceToChild[oldSeq-1];
            var nextNode = self.sequenceToChild[oldSeq+1];

            self.sequenceToChild.splice(oldSeq, 1);
            self.connections.splice(oldSeq, 1);
            addConnection(self, oldSeq - 1, prevNode, nextNode, true);
        }

        if (newSeq != null) {
            self.sequenceToChild.splice(newSeq, 0, null);
            self.connections.splice(newSeq, 0, null);
            self.connections[newSeq-1] = null;
        }
    }

     function getBestPoint(self) {
        var i, parent, parentsBest, dis, point,
            centerLat = self.center.lat(),
            centerLng = self.center.lng(),
            shortestDis = Number.MAX_VALUE;

        if (!self.bestPoint) {
            parent = self.getParent();
            parentsBest = parent && getBestPoint(parent);
            if (parentsBest && self.points[parentsBest._id] != null) {
                self.bestPoint = parentsBest;
            } else {
                for (i in self.points) {
                    point = self.points[i];
                    dis = wmu.distanceLatLngsSquared(point._latLng.lat(), point._latLng.lng(), centerLat, centerLng);
                    if (dis < shortestDis) {
                        self.bestPoint = point;
                        shortestDis = dis;
                    }
                    //else if (dis == shortestDis && point.getScore() > self.bestPoint.getScore()) {
                    //    self.bestPoint = point;
                    //}
                }
            }
        }

        return self.bestPoint;
    }
    
    function addToChildren(self, point) {
        var nextZoom = self.zoom + self.zoomRange;

        if (nextZoom > self.settings.maxZoom) return;

        var node = chooseBest(point._latLng, self.nodes);

        if (!node) {
            node = new Cluster(self, nextZoom, self.settings.maxZoom - nextZoom + 1, self.settings);
            self.nodes.push(node);
        }

        node.addPoint(point);
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
            for (i in self.points) {
                newNode = new Cluster(self, self.settings.maxZoom, 1, self.settings);
                newNode.addPoint(self.points[i]);
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
        for (var i in child.points) {
            var point = child.points[i];
            newCluster.points[point._id] = point;
            newCluster.pointsCount++;
            addPointToConnections(self, newCluster, point)
        }
    }

    function addConnection(self, seq, cluster1, cluster2, replace) {
        var connection;
        if (seq < 0 || !cluster1 || !cluster2 || cluster1.id === cluster2.id) connection = null;
        else connection = {
            id: ids++,
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
})();