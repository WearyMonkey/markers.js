(function() {
    var MAX_ZOOM = 20,
        ids = 1;

    var Cluster = wm.Cluster = function (parent, zoom, zoomRange, settings) {
        this._parent = parent;
        this._settings = settings;
        this._id = ids++;
        this._zoom = zoom;
        this._zoomRange = zoomRange;
        this._nodes = [];
        this._points = {};
        this._pointsCount = 0;
        this._bounds = new google.maps.LatLngBounds();
        this._center = this._bounds.getCenter();
        this._connections = [];
        this._sequenceToChild = [];
        this._pointToSeq = {};
    };

    wmu.extend(Cluster, {
        States: {
            Normal: 0,
            Collapsed: 1,
            Expanded: 2
        },
        
        makeRootCluster: function() {
            return new Cluster(null, 0, MAX_ZOOM+1, { zoomBoxes: getZoomBoxes(), maxZoom: MAX_ZOOM} );
        }
    });

    wmu.extend(Cluster.prototype, {
        getBounds: function() {
            return this._bounds;
        },

        getCenter: function() {
            return this._center;
        },

        getDisplayCenter: function() {
            return getBestPoint(this)._latLng;
        },

        getPoints: function() {
            var points = [];
            for (var i in this._points) {
                if (this._points.hasOwnProperty(i)) points.push(this._points[i]);
            }
            return points;
        },

        getMarker: function() {
            return this._marker;
        },

        getParent: function() {
            return this._parent;
        },

        getState: function() {
            return this._state;
        },

        setState: function(state, recurse) {
            this._state = state;
            if (recurse) {
                for (var i = 0; i < this._nodes.length; ++i) {
                    this._nodes[i].setState(state, true);
                }
            }
        },

        getZoomRange: function() {
            return {from:this._zoom, to:this._zoom + this._zoomRange - 1};
        },

        isInZoomRange: function(zoom) {
            return zoom >= this._zoom && zoom < this._zoom + this._zoomRange;
        },

        removePoint: function(point) {
            if (!this._points[point._id]) return this._pointsCount;
            delete this._points[point._id];

            this._pointsCount--;
            this._bestPoint = null;

            if (this._parent) {
                removePointFromConnections(this._parent, point);
            }

            for (var i = 0; i < this._nodes.length; ++i) {
                var child = this._nodes[i];
                if (!child.removePoint(point)) {
                    this._nodes.splice(i, 1);
                    --i;
                }
            }

            return this._pointsCount;
        },

        addPoint: function(point) {
            if (this._points[point._id]) return;
            this._points[point._id] = point;
            this._pointsCount++;
            this._bestPoint = null;

            if (!this._bounds.contains(point._latLng)) {
                this._bounds.extend(point._latLng);
                this._center = this._bounds.getCenter();
            }

            if (this._parent) {
                addPointToConnections(this._parent, this, point);
            }

            addToChildren(this, point);

            var oldZoomRange = this._zoomRange;
            this._zoomRange = findZoomRange(this);

            if (this._zoomRange < oldZoomRange) {
                splitChildren(this, this._zoom + this._zoomRange, oldZoomRange - this._zoomRange)
            }

            if (this._zoomRange == 0) {
                removeSelf(this);
            }
        }
    });

    function addPointToConnections(self, node, point) {
        var seq = point._sequence;
        self._pointToSeq[point._id] = seq;

        if (seq == null) return;
        else if (self._sequenceToChild[seq]) self._sequenceToChild.splice(seq, 0, node);
        else self._sequenceToChild[seq] = node;

        var prevNode = self._sequenceToChild[seq-1];
        var nextNode = self._sequenceToChild[seq+1];

        addConnection(self, seq-1, prevNode, node, true);
        addConnection(self, seq, node, nextNode, false);
    }

    function removePointFromConnections(self, point) {
        var newSeq = point._sequence; // if no story_id, then point has been removed from story and sequence is considered null
        var oldSeq = self._pointToSeq[point._id];
        self._pointToSeq[point._id] = newSeq;

        if (oldSeq != null) {
            var prevNode = self._sequenceToChild[oldSeq-1];
            var nextNode = self._sequenceToChild[oldSeq+1];

            self._sequenceToChild.splice(oldSeq, 1);
            self._connections.splice(oldSeq, 1);
            addConnection(self, oldSeq - 1, prevNode, nextNode, true);
        }

        if (newSeq != null) {
            self._sequenceToChild.splice(newSeq, 0, null);
            self._connections.splice(newSeq, 0, null);
            self._connections[newSeq-1] = null;
        }
    }

     function getBestPoint(self) {
        var i, parent, parentsBest, dis, point,
            centerLat = self._center.lat(),
            centerLng = self._center.lng(),
            shortestDis = Number.MAX_VALUE;

        if (!self._bestPoint) {
            parent = self.getParent();
            parentsBest = parent && getBestPoint(parent);
            if (parentsBest && self._points[parentsBest._id] != null) {
                self._bestPoint = parentsBest;
            } else {
                for (i in self._points) {
                    if (!self._points.hasOwnProperty(i)) continue;
                    point = self._points[i];
                    dis = distanceLatLngsSquared(point._latLng.lat(), point._latLng.lng(), centerLat, centerLng);
                    if (dis < shortestDis) {
                        self._bestPoint = point;
                        shortestDis = dis;
                    }
                    //else if (dis == shortestDis && point.getScore() > self.bestPoint.getScore()) {
                    //    self.bestPoint = point;
                    //}
                }
            }
        }

        return self._bestPoint;
    }
    
    function addToChildren(self, point) {
        var nextZoom = self._zoom + self._zoomRange;

        if (nextZoom > self._settings.maxZoom) return;

        var node = chooseBest(point._latLng, self._nodes);

        if (!node) {
            node = new Cluster(self, nextZoom, self._settings.maxZoom - nextZoom + 1, self._settings);
            self._nodes.push(node);
        }

        node.addPoint(point);
    }

    function chooseBest(insert, nodes, max) {
        var smallestArea = Number.MAX_VALUE,
            smallestNode,
            center = insert.getCenter ? insert.getCenter() : insert;

        for (var i = 0; i < nodes.length; i++) {
            var bounds = nodes[i]._bounds;
            var distance = distancePointsSquared(center, bounds.getCenter());
            var childMax = max || Math.pow(nodes[i]._settings.zoomBoxes[nodes[i]._zoom].max, 2);
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

        if (!self._nodes.length) {
            for (i in self._points) {
                if (!self._points.hasOwnProperty(i)) continue;
                newNode = new Cluster(self, self._settings.maxZoom, 1, self._settings);
                newNode.addPoint(self._points[i]);
                self._nodes.push(newNode);
            }
            if (--zoomRange == 0) return true;
        }

        if (self._nodes.length < 3) {
            seeds = self._nodes;
        } else {
            for (i = 0; i < self._nodes.length; ++i) {
                for (j = i + 1; j < self._nodes.length; ++j) {
                    dis = distancePointsSquared(self._nodes[i]._bounds.getCenter(), self._nodes[j]._bounds.getCenter());
                    if (dis > maxDis) {
                        seeds = [self._nodes[i], self._nodes[j]];
                        maxDis = dis;
                    }
                }
            }
        }

        for (i = 0; i < seeds.length; ++i) {
            newNode = new Cluster(self, zoom, zoomRange, self._settings);
            newNodes.push(newNode);
            newNode._bounds.union(seeds[i]._bounds);
        }

        for (i = 0; i < self._nodes.length; ++i) {
            var child = self._nodes[i];
            newNode = chooseBest(child._bounds, newNodes, Number.MAX_VALUE);
            if (!newNode) {
                newNode = new Cluster(self, zoom, zoomRange, self._settings);
                newNodes.push(newNode);
            }
            newNode._nodes.push(child);
            newNode._bounds.union(child._bounds);
            newNode._center = newNode._bounds.getCenter();
        }

        self._nodes = [];
        self._connections = [];
        self._sequenceToChild = [];

        for (i = 0; i < newNodes.length; ++i) {
            newNode = newNodes[i];
            for (j = 0; j < newNode._nodes.length; ++j) {
                mergeChild(self, newNode, newNode._nodes[j]);
            }
        }

        return true;
    }

    function mergeChild(self, newCluster, child) {
        self._nodes.push(newCluster);
        child._parent = newCluster;
        for (var i in child._points) {
            if (!child._points.hasOwnProperty(i)) continue;
            var point = child._points[i];
            newCluster._points[point._id] = point;
            newCluster._pointsCount++;
            addPointToConnections(self, newCluster, point)
        }
    }

    function addConnection(self, seq, cluster1, cluster2, replace) {
        var connection;
        if (seq < 0 || !cluster1 || !cluster2 || cluster1._id === cluster2._id) connection = null;
        else connection = {
            _id: ids++,
            _cluster1: cluster1,
            _cluster2: cluster2,
            _path: null
        };

        if (replace || !self._connections[seq]) self._connections[seq] = connection;
        else self._connections.splice(seq, 0, connection);

        return true;
    }

    function removeSelf(self) {
        if (!self._parent) return false;

        var parentNodes = self._parent._nodes,
            newZoom = self._zoom, i;
        for (i = 0; i < parentNodes.length; ++i) {
            if (parentNodes[i] == self) {
                parentNodes.splice(i, 1);
            }
        }

        for (i = 0; i < self._nodes.length; ++i) {
            var child = self._nodes[i];
            child._zoomRange += child._zoom - newZoom;
            child._zoom = newZoom;
            child._parent = self._parent;
            parentNodes.push(child);
        }

        return true;
    }

    function findZoomRange(self) {
        var span = self._bounds.toSpan(),
            bigDis,
            top = self._zoom,
            bottom = self._zoom + self._zoomRange - 1;

        if (span.lat() > span.lng()) {
            bigDis = span.lat();
        } else {
            bigDis = span.lng();
        }

        while (bottom > top && self._settings.zoomBoxes[bottom].max < bigDis) bottom--;

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

    function distancePointsSquared(p1, p2) {
        return distanceLatLngsSquared(p1.lat(), p1.lng(), p2.lat(), p2.lng());
    }

    function distanceLatLngsSquared(lat1, lng1, lat2, lng2) {
        var dx = lat1 - lat2;
        var dy = lng1 - lng2;
        return dx*dx+dy*dy;
    }
})();