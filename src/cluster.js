var wmu = require('./utils.js');

var ids = 1;

var Cluster = function (parent, zoom, zoomRange, geo, settings) {
    this._parent = parent;
    this._settings = settings;
    this._geo = geo;
    this._id = ids++;
    this._zoom = zoom;
    this._zoomRange = zoomRange;
    this._children = [];
    this._points = {};
    this._pointToChild = {};
    this._connections = [];
    this._bounds = geo.createBounds();
    this._center = geo.createLatLng(0, 0);
    this._state = 'normal';
};

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
            this._bounds = this._geo.createBounds();
            var latLngs = [];
            for (var pId in this._points) {
                if (this._points.hasOwnProperty(pId)) {
                    latLngs.push(this._points[pId]._latLng);
                }
            }
            this._bounds = this._geo.extendBounds(this._bounds, latLngs);
            return !!latLngs.length;
        } else {
            return true;
        }
    },

    addPoints: function(points) {
        var i, hasPoint = false, latLngs = [];

        for (i = 0;  i < points.length; ++i) {
            var point = points[i];
            if (this._points[point._id]) continue;
            this._points[point._id] = point;
            latLngs.push(point._latLng);
            if (this._parent) {
                this._parent._pointToChild[point._id] = this;
            }
            hasPoint = true;
        }

        this._bounds = this._geo.extendBounds(this._bounds, latLngs);

        if (hasPoint) {
            this._bestPoint = null;
            this._center = this._geo.getBoundsCenter(this._bounds);
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
                dis = distancePointsSquared(self, point, self._center);
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

    if (nextZoom > self._geo.maxZoom) return;

    for (i = 0; i < points.length; ++i) {
        point = points[i];
        child = chooseBest(self, point._latLng, point._latLng, self._children);
        if (!child) {
            child = new Cluster(self, nextZoom, self._geo.maxZoom - nextZoom + 1, self._geo, self._settings);
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

function chooseBest(self, center, latLngOrBounds, chilren, max) {
    var smallestArea = Number.MAX_VALUE,
        smallestChild;

    for (var i = 0; i < chilren.length; i++) {
        var bounds = chilren[i]._bounds;
        var distance = distancePointsSquared(self, center, self._geo.getBoundsCenter(bounds));
        var childMax = max || Math.pow(chilren[i]._settings.zoomBoxes[chilren[i]._zoom].max, 2);
        if (distance < childMax) {
            var area = rankInsert(self, latLngOrBounds, bounds);
            if (area < smallestArea) {
                smallestChild = chilren[i];
                smallestArea = area;
            }
        }
    }

    return smallestChild;
}

function rankInsert(self, latLngOrBounds, bounds) {
    //todo, optimise
    // currently the change in area (R-tree)
    var newBounds = self._geo.extendBounds(self._geo.createBounds(), [bounds, latLngOrBounds]),
        newSpan = self._geo.getBoundsSpan(newBounds),
        oldSpan = self._geo.getBoundsSpan(bounds);

    return (newSpan._lat * newSpan._lng) - (oldSpan._lat * oldSpan._lng);
}


function splitChildren(self, zoom, zoomRange) {
    var newChildren = [], i, j,
        newChild, seeds;

    if (!self._children.length) {
        for (i in self._points) {
            if (!self._points.hasOwnProperty(i)) continue;
            newChild = new Cluster(self, self._geo.maxZoom, 1, self._geo, self._settings);
            newChild.addPoints([self._points[i]]);
            self._children.push(newChild);
        }
        if (--zoomRange == 0) return true;
    }

    if (self._children.length < 3) {
        seeds = self._children;
    } else {
        seeds = [getFurthest(self, self._center, self._children)];
        seeds.push(getFurthest(self, seeds[0]._center, self._children));
    }

    for (i = 0; i < seeds.length; ++i) {
        newChild = new Cluster(self, zoom, zoomRange, self._geo, self._settings);
        newChildren.push(newChild);
        newChild._bounds = self._geo.extendBounds(newChild._bounds, [seeds[i]._bounds])
    }

    for (i = 0; i < self._children.length; ++i) {
        var child = self._children[i];
        newChild = chooseBest(self, self._geo.getBoundsCenter(child._bounds), child._bounds, newChildren, Number.MAX_VALUE);
        if (!newChild) {
            newChild = new Cluster(self, zoom, zoomRange, self._geo, self._settings);
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
        newChild._center = self._geo.getBoundsCenter(newChild._bounds);
        newChild._zoomRange = findZoomRange(newChild);
        if (newChild._zoomRange < zoomRange) {
            splitChildren(newChild, newChild._zoom + newChild._zoomRange, zoomRange - newChild._zoomRange)
        }
    }

    return true;
}

function getFurthest(self, latLng, children) {
    var maxDis = 0, maxChild;
    for (var i = 0; i < children.length; ++i) {
        var child = children[i];
        var dis = distancePointsSquared(self, latLng, child._center);
        if (dis > maxDis) {
            maxDis = dis;
            maxChild = child;
        }
    }
    return maxChild;
}

function mergeChild(self, newCluster, child) {
    newCluster._bounds = self._geo.extendBounds(newCluster._bounds, [child._bounds]);
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
    var span = self._geo.getBoundsSpan(self._bounds),
        bigDis,
        top = self._zoom,
        bottom = self._zoom + self._zoomRange - 1;

    if (span._lat > span._lng) {
        bigDis = span._lat;
    } else {
        bigDis = span._lng;
    }

    while (bottom > top && self._settings.zoomBoxes[bottom].max < bigDis) bottom--;

    return bottom - top + 1;
}

function distancePointsSquared(self, p1, p2) {
    var latLng1 = p1._lat != null ? p1 : self._geo.getLatLng(p1._latLng || p1);
    var latLng2 = p2._lat != null ? p2 : self._geo.getLatLng(p2._latLng || p2);
    return distanceLatLngsSquared(latLng1._lat, latLng1._lng, latLng2._lat, latLng2._lng);
}

function distanceLatLngsSquared(lat1, lng1, lat2, lng2) {
    var dx = lat1 - lat2;
    var dy = lng1 - lng2;
    return dx*dx+dy*dy;
}

module.exports = Cluster;