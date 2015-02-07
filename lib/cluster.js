(function() {
    var MAX_ZOOM = 20,
        ids = 1;

    var Cluster = wm.Cluster = function (parent, zoom, zoomRange, settings) {
        this._parent = parent;
        this._settings = settings;
        this._id = ids++;
        this._zoom = zoom;
        this._zoomRange = zoomRange;
        this._children = [];
        this._points = {};
        this._pointToChild = {};
        this._connections = [];
        this._bounds = new google.maps.LatLngBounds();
        this._center = this._bounds.getCenter();
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
        getAncestors: function() {
            var ancestors = [],
                parent = this;

            while (parent = parent._parent) ancestors.push(parent);

            return ancestors;
        },

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
                for (var i = 0; i < this._children.length; ++i) {
                    this._children[i].setState(state, true);
                }
            }
        },

        getZoomRange: function() {
            return {from:this._zoom, to:this._zoom + this._zoomRange - 1};
        },

        isInZoomRange: function(zoom) {
            return zoom >= this._zoom && zoom < this._zoom + this._zoomRange;
        },

        removePoints: function(points) {
            var i, hasPoint = false;
            for (i = 0; i < points.length; ++i) {
                var point = points[i];
                if (!this._points[point._id]) continue;
                delete this._points[point._id];
                hasPoint = true;

                if (this._parent) {
                    delete this._parent._pointToChild[point._id];
                }
            }

            if (hasPoint) {
                for (i = 0; i < this._children.length; ++i) {
                    var child = this._children[i];
                    if (!child.removePoints(points)) {
                        this._children.splice(i, 1);
                        --i;
                    }
                }

                this._bestPoint = null;
                this._bounds = new google.maps.LatLngBounds();
                var c = 0;
                for (var pId in this._points) {
                    if (this._points.hasOwnProperty(pId)) {
                        this._bounds.extend(this._points[pId]._latLng);
                        c = c + 1;
                    }
                }
                return !!c;
            } else {
                return true;
            }
        },

        addPoints: function(points) {
            var i, hasPoint = false;

            for (i = 0;  i < points.length; ++i) {
                var point = points[i];
                if (this._points[point._id]) continue;
                this._points[point._id] = point;
                this._bounds.extend(point._latLng);
                if (this._parent) {
                    this._parent._pointToChild[point._id] = this;
                }
                hasPoint = true;
            }

            if (hasPoint) {
                this._bestPoint = null;
                this._center = this._bounds.getCenter();
                addToChildren(this, points);

                var oldZoomRange = this._zoomRange;
                this._zoomRange = findZoomRange(this);

                if (this._zoomRange < oldZoomRange) {
                    splitChildren(this, this._zoom + this._zoomRange, oldZoomRange - this._zoomRange)
                }

                if (this._zoomRange == 0) {
                    removeSelf(this);
                }
            }
        },

        addLine: function(line) {
            var pointToChild = this._pointToChild,
                seenChildren = {};

            for (var i = 1; i < line._points.length; ++i) {
                var pointId = line._points[i]._id;
                var prePointId = line._points[i - 1]._id;
                var child = pointToChild[pointId];
                var preChild = pointToChild[prePointId];

                if (child && preChild && child != preChild) {
                    this._connections.push({
                        _id: ids++,
                        _pointId1: pointId,
                        _pointId2: prePointId,
                        _cluster: this,
                        _line: line
                    })
                }

                if (child) {
                    if (!seenChildren[child._id]) {
                        seenChildren[child._id] = true;
                        child.addLine(line);
                    }
                }
            }
        },

        removeLine: function(line) {
            var seenChildren = {},
                connections = this._connections;

            for (var i = 0; i < connections.length; ++i) {
                var connection = connections[i];
                if (connection._line == line) {

                    connections.splice(i--, 1);

                    var child1 = this._pointToChild[connection._pointId1];
                    var child2 = this._pointToChild[connection._pointId2];
                    if (!seenChildren[child1._id]) child1.removeLine(line);
                    if (!seenChildren[child2._id]) child2.removeLine(line);
                    seenChildren[child1._id] = true;
                    seenChildren[child2._id] = true;
                }
            }
        }
    });

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
    
    function addToChildren(self, points) {
        var childToPoints = {},
            nextZoom = self._zoom + self._zoomRange,
            i, child, point, pointsToAdd;

        if (nextZoom > self._settings.maxZoom) return;

        for (i = 0; i < points.length; ++i) {
            point = points[i];
            child = chooseBest(point._latLng, self._children);
            if (!child) {
                child = new Cluster(self, nextZoom, self._settings.maxZoom - nextZoom + 1, self._settings);
                self._children.push(child);
            }
            childToPoints[child._id] = childToPoints[child._id] || [];
            childToPoints[child._id].push(point);
        }

        for (i = 0; i < self._children; ++i) {
            child = self._children[i];
            pointsToAdd = childToPoints[child._id];
            if (pointsToAdd) {
                child.addPoints(pointsToAdd)
            }
        }
    }

    function chooseBest(insert, chilren, max) {
        var smallestArea = Number.MAX_VALUE,
            smallestChild,
            center = insert.getCenter ? insert.getCenter() : insert;

        for (var i = 0; i < chilren.length; i++) {
            var bounds = chilren[i]._bounds;
            var distance = distancePointsSquared(center, bounds.getCenter());
            var childMax = max || Math.pow(chilren[i]._settings.zoomBoxes[chilren[i]._zoom].max, 2);
            if (distance < childMax) {
                var area = rankInsert(insert, bounds);
                if (area < smallestArea) {
                    smallestChild = chilren[i];
                    smallestArea = area;
                }
            }
        }

        return smallestChild;
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
        var newChildren = [], i, j,
            newChild, seeds;

        if (!self._children.length) {
            for (i in self._points) {
                if (!self._points.hasOwnProperty(i)) continue;
                newChild = new Cluster(self, self._settings.maxZoom, 1, self._settings);
                newChild.addPoints([self._points[i]]);
                self._children.push(newChild);
            }
            if (--zoomRange == 0) return true;
        }

        if (self._children.length < 3) {
            seeds = self._children;
        } else {
            seeds = [getFurthest(self.getCenter(), self._children)];
            seeds.push(getFurthest(seeds[0].getCenter(), self._children));
        }

        for (i = 0; i < seeds.length; ++i) {
            newChild = new Cluster(self, zoom, zoomRange, self._settings);
            newChildren.push(newChild);
            newChild._bounds.union(seeds[i]._bounds);
        }

        for (i = 0; i < self._children.length; ++i) {
            var child = self._children[i];
            newChild = chooseBest(child._bounds, newChildren, Number.MAX_VALUE);
            if (!newChild) {
                newChild = new Cluster(self, zoom, zoomRange, self._settings);
                newChildren.push(newChild);
            }
            newChild._children.push(child);
        }

        self._children = newChildren;
        self._pointToChild = {};

        for (i = 0; i < newChildren.length; ++i) {
            newChild = newChildren[i];
            for (j = 0; j < newChild._children.length; ++j) {
                mergeChild(self, newChild, newChild._children[j]);
            }
            newChild._center = newChild._bounds.getCenter();
            newChild._zoomRange = findZoomRange(newChild);
            if (newChild._zoomRange < zoomRange) {
                splitChildren(newChild, newChild._zoom + newChild._zoomRange, zoomRange - newChild._zoomRange)
            }
        }

        return true;
    }

    function getFurthest(latLng, children) {
        var maxDis = 0, maxChild;
        for (var i = 0; i < children.length; ++i) {
            var child = children[i];
            var dis = distancePointsSquared(latLng, child.getCenter());
            if (dis > maxDis) {
                maxDis = dis;
                maxChild = child;
            }
        }
        return maxChild;
    }

    function mergeChild(self, newCluster, child) {
        newCluster._bounds.union(child._bounds);
        child._parent = newCluster;
        for (var i in child._points) {
            if (!child._points.hasOwnProperty(i)) continue;
            var point = child._points[i];
            newCluster._points[point._id] = point;
            newCluster._pointToChild[point._id] = child;
            self._pointToChild[point._id] = newCluster;
        }
    }

    function removeSelf(self) {
        if (!self._parent) return false;

        var siblings = self._parent._children,
            newZoom = self._zoom, i;
        for (i = 0; i < siblings.length; ++i) {
            if (siblings[i] == self) {
                siblings.splice(i, 1);
            }
        }

        for (i = 0; i < self._children.length; ++i) {
            var child = self._children[i];
            child._zoomRange += child._zoom - newZoom;
            child._zoom = newZoom;
            child._parent = self._parent;
            siblings.push(child);
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