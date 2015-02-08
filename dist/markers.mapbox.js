(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
window.wm = {
    Markers: require('./../markers.js'),
    Point: require('./../point.js'),
    Line: require('./../line.js'),
    mapConnectors: {
        mapbox: require('./../map-connectors/mapbox.js')
    },
    defaultMapConnector: 'mapbox'
};
},{"./../line.js":4,"./../map-connectors/mapbox.js":5,"./../markers.js":6,"./../point.js":7}],2:[function(require,module,exports){
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
};

wmu.extend(Cluster, {
    States: {
        Normal: 0,
        Collapsed: 1,
        Expanded: 2
    },

    makeRootCluster: function(geo) {
        return new Cluster(null, 0, geo.maxZoom+1, geo, { zoomBoxes: getZoomBoxes(geo) } );
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

function getZoomBoxes(geo) {
    if (!Cluster.zoomBoxes) {
        var zoomBoxes = Cluster.zoomBoxes = [];

        var minDis = 84.375,
            maxDis = 112.6,
            scale = 1;

        for (var z = 0; z <= geo.maxZoom; z++) {
            zoomBoxes[z] = {
                min: (minDis / scale),
                max: (maxDis / scale)
            };
            scale <<= 1;
        }
    }

    return Cluster.zoomBoxes;
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
},{"./utils.js":8}],3:[function(require,module,exports){
var wmu = require('./utils.js');
var Cluster = require('./cluster.js');
var States = Cluster.States;

wmu.extend(Cluster.prototype, {
    getContainedClustersAndConnections: function(bounds, zoom) {
        var clusters = [],
            connections = {},
            ancestors = this.getAncestors();

        for (var i = ancestors.length - 1; i >= 0; --i) {
            var ancestor = ancestors[i];
            if (ancestor && (ancestor._zoom + ancestor._zoomRange - 1) < zoom) {
                findConnections(ancestor, connections);
            }
        }

        search(this, bounds, zoom, clusters, connections);

        return {
            clusters: clusters,
            connections: flattenConnections(connections, zoom)
        };
    }
});

function search(self, bounds, zoom, clusters, connections) {

    if (!self._geo.boundsIntersects(self._bounds, bounds)) return;

    var inZoomRange = self.isInZoomRange(zoom) && self._state != States.Expanded;
    var atBottom = !self._children.length || self._state == States.Collapsed;

    if (atBottom || inZoomRange) {
        clusters.push(self);
    } else {
        findConnections(self, connections);

        for (var i = 0; i < self._children.length; ++i) {
            search(self._children[i], bounds, zoom, clusters, connections);
        }
    }

    return clusters;
}

function findConnections(cluster, connections) {
    for (var i = 0; i < cluster._connections.length; i++) {
        var connection = cluster._connections[i];
        var p1Connections = connections[connection._pointId1] = connections[connection._pointId1] || {};
        p1Connections[connection._pointId2] = connection;
    }
}

function flattenConnections(connections, zoom) {
    var flatConnections = [],
        ids = {},
        p1Connections, connectionChild, connection;

    for (var point1Id in connections) {
        if (!connections.hasOwnProperty(point1Id)) continue;
        p1Connections = connections[point1Id];
        for (var point2Id in p1Connections) {
            if (!p1Connections.hasOwnProperty(point2Id)) continue;
            connection = p1Connections[point2Id];
            if (!ids[connection._id]) {

                ids[connection._id] = true;
                flatConnections.push(connection);

                connection._displayCluster1 = connection._cluster._pointToChild[connection._pointId1];
                connection._displayCluster2 = connection._cluster._pointToChild[connection._pointId2];

                while (connectionChild = getConnectionChild(zoom, connection._displayCluster1, point1Id)) {
                    connection._displayCluster1 = connectionChild;
                }

                while (connectionChild = getConnectionChild(zoom, connection._displayCluster2, point2Id)) {
                    connection._displayCluster2 = connectionChild;
                }
            }
        }
    }
    return flatConnections;
}

function getConnectionChild(zoom, displayCluster1, point1Id) {
    var inZoomRange = displayCluster1.isInZoomRange(zoom) && displayCluster1._state !== States.Expanded;
    var atBottom = !displayCluster1._pointToChild[point1Id] || displayCluster1._state === States.Collapsed;
    if (!inZoomRange && !atBottom) {
        return displayCluster1._pointToChild[point1Id];
    }
}
},{"./cluster.js":2,"./utils.js":8}],4:[function(require,module,exports){
var Point = require('./point');
var wmu = require('./utils.js');

var ids = 1;

var Line = function(points, data) {
    if (points instanceof Line) {
        return points;
    } else if (this instanceof Line) {
        this._id = ids++;
        this._points = copyPoints(points);
        this._data = data;
    } else {
        return new Line(points, data);
    }
};

wmu.extend(Line.prototype, {
    getPoints: function() {
        return this._points;
    },
    getData: function() {
        return this._data;
    }
});

function copyPoints(points) {
    var copy = [];
    for (var i = 0; i < points.length; ++i) {
        copy.push(Point(points[i]));
    }
    return copy;
}

module.exports = Line;


},{"./point":7,"./utils.js":8}],5:[function(require,module,exports){
module.exports = {
    maxZoom: 20,

    createMarker: function () {
        return L.marker();
    },

    createPolyline: function() {
        return L.polyline([]);
    },

    createLatLng: function(lat, lng) {
        return L.latLng(lat, lng);
    },

    getLatLng: function(latLng) {
        return {_lat: latLng.lat, _lng: latLng.lng}
    },

    getMarketPosition: function(marker) {
        return marker.getLatLng();
    },

    setMarkerPosition: function(marker, latLng) {
        marker.setLatLng(latLng);
    },

    getPolylinePath: function(polyline) {
        return polyline.getLatLngs().slice();
    },

    setPolylinePath: function(polyline, latLngs) {
        polyline.setLatLngs(latLngs);
    },

    showMarker: function(map, marker) {
        marker.addTo(map);
    },

    showPolyline: function(map, polyline) {
        polyline.addTo(map);
    },

    hideMarker: function(map, marker) {
        map.removeLayer(marker);
    },

    hidePolyline: function(map, polyline) {
        map.removeLayer(polyline);
    },

    createBounds: function() {
        return L.latLngBounds([]);
    },

    extendBounds: function(bounds, latLngOrBounds) {
        for (var i = 0; i < latLngOrBounds.length; i++) {
            bounds.extend(latLngOrBounds[i]);
        }
        return bounds;
    },

    getBoundsCenter: function(bounds) {
        return bounds.getCenter();
    },

    boundsIntersects: function(bounds1, bounds2) {
        if (!bounds1.getNorthEast() || !bounds2.getNorthEast()) return false;
        else return bounds1.intersects(bounds2);
    },

    getBoundsSpan: function(bounds) {
        var nw = bounds.getNorthWest() || {lat: 0, lng: 0};
        var se = bounds.getSouthEast() || {lat: 0, lng: 0};
        return {_lat: nw.lat - se.lat, _lng: se.lng - nw.lng};
    },

    onMapBoundsChange: function(map, callback) {
        map.on('move', callback);
        return callback;
    },

    offMapsBoundChange: function(token) {
        map.off('move', token);
    },

    getMapZoom: function(map) {
        return map.getZoom();
    },

    getMapBounds: function(map) {
        return map.getBounds();
    }
};

},{}],6:[function(require,module,exports){
var Cluster = require('./cluster.js');
require('./cluster_search.js');
var wmu = require('./utils.js');
var Point = require('./point.js');
var Line = require('./line.js');

var defaults = {
    animationSteps: 10,
    animationInterval: 50,
    debug: false,
    createMarker: function() {},
    createPolyline: function() {}
};

var Markers = function(map, options) {
    var self = this;

    this._visibleClusters = [];
    this._visibleConnections = [];
    this._keepKey = 0;
    this._map = map;
    this._prevZoom = this._map.getZoom();
    this._geo = options.mapConnector || (wm.defaultMapConnector && wm.mapConnectors && wm.mapConnectors[wm.defaultMapConnector]);
    this._options = wmu.extend({}, defaults, {
        createMarker: this._geo.createMarker,
        createPolyline: this._geo.createPolyline
    }, options);
    this._clusterRoot = Cluster.makeRootCluster(this._geo);

    resetViewport(this);

    this._boundsListener = self._geo.onMapBoundsChange(map, function() {
        var zoom = self._geo.getMapZoom(map);
        if (zoom < 0 || zoom > self._geo.maxZoom) return;

        resetViewport(self);

        self._prevZoom = zoom;
        self._prevBounds = self._geo.getMapBounds(map);
    });
};

wmu.extend(Markers.prototype, {

    addLine: function(line, options) {
        line = Line(line);
        if (options && options.addPoints === true) {
            this._clusterRoot.addPoints(line._points);
        }
        this._clusterRoot.addLine(line);
        resetViewport(this);
        return line;
    },

    removeLine: function(line, options) {
        this._clusterRoot.removeLine(line);

        if (options && options.removePoints === true) {
            this._clusterRoot.removePoints(line._points);
        }
        resetViewport(this);
    },

    addPoint: function(point) {
        point = Point(point);
        this._clusterRoot.addPoints([point]);
        resetViewport(this);
        return point;
    },

    removePoint: function(point) {
        this._clusterRoot.removePoints([point]);
        resetViewport(this);
    },

    addPoints: function(points) {
        var wmPoints = [];
        for (var i = 0; i < points.length; ++i) wmPoints.push(Point(points[i]));
        this._clusterRoot.addPoint(wmPoints);
        resetViewport(this);
        return wmPoints;
    },

    removePoints: function(points) {
        this._clusterRoot.removePoints(points);
        resetViewport(this);
    },

    destroy: function() {
        for (var i = 0; i < this._visibleClusters.length; ++i) {
            hideCluster(this, this._visibleClusters[i], true);
        }

        for (i = 0; i < this._visibleConnections.length; ++i) {
            hideConnection(this, this._visibleConnections[i], true);
        }

        if (this._boundsListener) google.maps.event.removeListener(this._boundsListener);
    },

    setClusterState: function(cluster, state) {
        var oldState = cluster.getState(),
            newState = state,
            nextRoot,
            root = cluster;

        if (newState == oldState) return;

        if (state == Cluster.States.Normal) {

            while ((nextRoot = root.getParent(true)) && nextRoot.getState() !== Cluster.States.Normal) root = nextRoot;
            state = oldState == Cluster.States.Collapsed ? Cluster.States.Expanded : Cluster.States.Collapsed;
        }

        if (state == Cluster.States.Collapsed) {
            zoomOut(this, root, this._map.getZoom(), root);
            root.setState(newState, true);
        } else if (state == Cluster.States.Expanded) {
            root.setState(newState, true);
            zoomIn(this, root, this._map.getZoom(), root);
        }
    }
});

function showCluster(self, cluster, center) {
    cluster._keepKey = self._keepKey;
    self._visibleClusters.push(cluster);

    if (!cluster._marker) {
        cluster._marker = self._options.createMarker(cluster);
    }

    if (!center) center = cluster.getDisplayCenter();
    self._geo.setMarkerPosition(cluster._marker, center);

    // visible event
    if (!cluster._visible) {
        self._geo.showMarker(self._map, cluster._marker);
        cluster._visible = true;
    }

    return cluster._marker;
}

function showConnection(self, connection) {
    connection._keepKey = self._keepKey;
    self._visibleConnections.push(connection);

    if (!connection.polyline) {
        connection.polyline = self._options.createPolyline(connection._line, connection._cluster1, connection._cluster2);
    }

    self._geo.setPolylinePath(connection.polyline, [
        connection._displayCluster1.getDisplayCenter(),
        connection._displayCluster2.getDisplayCenter()
    ]);

    // visible event
    if (!connection._visible) {
        self._geo.showPolyline(self._map, connection.polyline);
        connection._visible = true;
    }

    return connection.polyline;
}

function hideCluster(self, cluster, destroy) {
    if (cluster._marker) {
        // hidden event
        self._geo.hideMarker(self._map, cluster._marker);
        cluster._visible = false;
        if (destroy) delete cluster._marker;
    }
}

function hideConnection(self, connection, destroy) {
    if (connection.polyline) {
        // hidden event
        self._geo.hidePolyline(self._map, connection.polyline);
        connection._visible = false;
        if (destroy) delete connection.polyline;
    }
}

function move(self, root) {
    var i;
    var visible = root.getContainedClustersAndConnections(getSearchBounds(self), self._geo.getMapZoom(self._map));
    for (i = 0; i < visible.clusters.length; ++i) {
        showCluster(self, visible.clusters[i]);
    }
    for (i = 0; i < visible.connections.length; ++i) {
        showConnection(self, visible.connections[i]);
    }
}

function zoomIn(self, root, zoom, overrideParent) {
    var visible = root.getContainedClustersAndConnections(getSearchBounds(self), zoom);
    var childMarkers = [];
    var mapZoom = self._geo.getMapZoom(self._map);

    function addChild(parent, child) {
        parent = overrideParent || parent;
        if (parent == child) return false;
        if (overrideParent || parent && parent.getZoomRange().to == mapZoom-1) {
            var marker = showCluster(self, child, parent.getDisplayCenter());
            if (!marker) {
                console.log("Null Marker");
                return false;
            }

            var cLatLng = self._geo.getLatLng(child.getDisplayCenter()),
                pLatLng = self._geo.getLatLng(parent.getDisplayCenter());

            marker.dLat = (cLatLng._lat - pLatLng._lat) / self._options.animationSteps;
            marker.dLng = (cLatLng._lng - pLatLng._lng) / self._options.animationSteps;
            marker.inPlace = false;
            childMarkers.push(marker);

            hideCluster(self, parent);
            return true;
        } else {
            showCluster(self, child);
            return false;
        }
    }


    var childrenToAnimate = getChildrenToAnimate(visible, root, addChild);
    var childPolylines = getPolylinesToAnimate(self, visible.connections, childrenToAnimate);

    animate(self, childMarkers, childPolylines);
}

function zoomOut(self, root, zoom, overrideParent) {
    var visible = root.getContainedClustersAndConnections(getSearchBounds(self), zoom);
    var childMarkers = [];
    var mapZoom = self._geo.getMapZoom(self._map);

    function addChild(parent, child) {
        parent = overrideParent || parent;
        if (parent == child) return false;
        if (overrideParent || parent && parent.getZoomRange().to == mapZoom) {
            var marker = showCluster(self, child);

            var cLatLng = self._geo.getLatLng(child.getDisplayCenter()),
                pLatLng = self._geo.getLatLng(parent.getDisplayCenter());

            marker.dLat = (pLatLng._lat - cLatLng._lat) / self._options.animationSteps;
            marker.dLng = (pLatLng._lng - cLatLng._lng) / self._options.animationSteps;
            childMarkers.push(marker);

            return true;
        } else {
            showCluster(self, child);
            return false;
        }
    }

    var animatedChildren = getChildrenToAnimate(visible, root, addChild);
    var animatedPolylines = getPolylinesToAnimate(self, visible.connections, animatedChildren);

    animate(self, childMarkers, animatedPolylines, function() {
        resetViewport(self);
    });
}

function getChildrenToAnimate(visible, root, addChildfn) {
    var childrenToAnimate = {},
        i;

    function checkAncestor(descendant, ancestor) {
        while (descendant) {
            if (descendant == ancestor) return true;
            descendant = descendant.getParent();
        }
        return false;
    }

    function add(parent, child, checkRoot) {
        if (!childrenToAnimate[child._id] && (!checkRoot || checkAncestor(parent, root)) && addChildfn(parent, child)) {
            //todo make sure the point at the center is above the overs so it doesnt flash
            //$(child.marker.getElement()).css("z-index", child.getBestPoint() == parent.getBestPoint() ? 100 : null);
            childrenToAnimate[child._id] = child;
        }
    }

    for (i = 0; i < visible.clusters.length; ++i) {
        add(visible.clusters[i]._parent, visible.clusters[i], false);
    }

    var check = root._parent !== null;
    for (i = 0; i < visible.connections.length; i++) {
        var connection = visible.connections[i];
        add(connection._displayCluster1._parent, connection._displayCluster1, check);
        add(connection._displayCluster2._parent, connection._displayCluster2, check);
    }

    return childrenToAnimate;
}

function getPolylinesToAnimate(self, connections, animatedClusters) {
    var toAnimate = [];
    for (var i = 0; i < connections.length; ++i) {
        var connection = connections[i],
            polyline = showConnection(self, connection),
            cluster1 = animatedClusters[connection._displayCluster1._id],
            cluster2 = animatedClusters[connection._displayCluster2._id],
            polyStart = null, polyEnd  = null, polyPath = null;

        if (!polyline) continue;

        polyline.dLat1 = polyline.dLng1 = polyline.dLat2 = polyline.dLng2 = null;
        if (cluster1) {
            polyline.dLat1 = cluster1._marker.dLat;
            polyline.dLng1 = cluster1._marker.dLng;
            polyStart = self._geo.getMarketPosition(cluster1._marker);
        }
        if (cluster2) {
            polyline.dLat2 = cluster2._marker.dLat;
            polyline.dLng2 = cluster2._marker.dLng;
            polyEnd = self._geo.getMarketPosition(cluster2._marker);
        }
        if (polyStart || polyEnd) {
            polyPath = self._geo.getPolylinePath(polyline);
            polyPath[0] = polyStart || polyPath[0];
            polyPath[1] = polyEnd || polyPath[1];
            self._geo.setPolylinePath(polyline, polyPath);
            toAnimate.push(polyline);
        }
    }
    return toAnimate;
}

function animate(self, markers, polylines, done) {
    var steps = 0;
    self._interval = setInterval(function() {
        if (steps < self._options.animationSteps) {
            var i;
            for (i = 0; i < markers.length; ++i) {
                var marker = markers[i];
                var movedLatLng = getMovedLatLng(self, self._geo.getMarketPosition(marker), marker.dLat, marker.dLng);
                self._geo.setMarkerPosition(marker, movedLatLng);
            }
            for (i = 0; i < polylines.length; ++i) {
                var polyline = polylines[i];
                var polyPath = self._geo.getPolylinePath(polyline);
                if (typeof polyline.dLat1 !== "undefined") {
                    polyPath[0] = getMovedLatLng(self, polyPath[0], polyline.dLat1, polyline.dLng1);
                }
                if (typeof polyline.dLat2 !== "undefined") {
                    polyPath[1] = getMovedLatLng(self, polyPath[1], polyline.dLat2, polyline.dLng2);
                }
                self._geo.setPolylinePath(polyline, polyPath);
            }
        } else if (steps == self._options.animationSteps) {
            clearInterval(self._interval);

            if (done) done();
        }
        ++steps;
    }, self._options.animationInterval);
}

function getMovedLatLng(self, oldLatLng, dLat, dLng) {
    var oldPos = self._geo.getLatLng(oldLatLng);
    return self._geo.createLatLng(oldPos._lat + dLat, oldPos._lng + dLng);
}

function resetViewport(self) {
    var i = 0,
        oldVisibleClusters = self._visibleClusters,
        oldVisibleConnections = self._visibleConnections;

    self._keepKey = (self._keepKey + 1) % 0xDEADBEEF; // mod random big value to stop it from overflowing
    self._visibleClusters = [];
    self._visibleConnections = [];

    clearInterval(self._interval);

    var zoom = self._geo.getMapZoom(self._map);
    var zoomShift = zoom - self._prevZoom;
    if (zoomShift == 1) {
        zoomIn(self, self._clusterRoot, zoom);
    } else if (zoomShift == -1) {
        zoomOut(self, self._clusterRoot, zoom+1);
    } else {
        move(self, self._clusterRoot);
    }

    // push hiding to the next event loop to fix a small flicker
    setTimeout(function() {
        for (i = 0; i < oldVisibleClusters.length; ++i) {
            var cluster = oldVisibleClusters[i];
            if (cluster._keepKey != self._keepKey) {
                hideCluster(self, cluster);
            }
        }

        for (i = 0; i < oldVisibleConnections.length; ++i) {
            var connection = oldVisibleConnections[i];
            if (connection._keepKey != self._keepKey) {
                hideConnection(self, connection);
            }
        }
    }, 0);
}

// Add a buffer to the search bounds
// and also clamp it to the bounds of the earth.
function getSearchBounds(self) {
    return self._geo.getMapBounds(self._map);

    var mapBounds = self._map.getBounds();
    if (!mapBounds) return mapBounds;

    return expandBoundingBox(mapBounds, 4);
}

function expandBoundingBox(box, factor) {
    var sw = box.getSouthWest();
    var ne = box.getNorthEast();
    var dLat = (ne.lat()-sw.lat())/factor;
    var dLng = (ne.lng()-sw.lng())/factor;

    var swLat = Math.max(-90, sw.lat()-dLat);
    var swLng = sw.lng()-dLng;
    var neLat = Math.min(90, ne.lat()+dLat);
    var neLng = ne.lng()+dLng;

    // some google methods break when Lng Span s actually 360 or 0
    var edge = 180-0.00001;
    if (neLng - swLng <=0 || neLng - swLng >= 360) {
        neLng = edge;
        swLng = -edge;
    }

    return new google.maps.LatLngBounds(
        new google.maps.LatLng( swLat, swLng ),
        new google.maps.LatLng( neLat, neLng )
    );
}

module.exports = Markers;
},{"./cluster.js":2,"./cluster_search.js":3,"./line.js":4,"./point.js":7,"./utils.js":8}],7:[function(require,module,exports){
var wmu = require('./utils.js');

var ids = 1;

var Point = function(latLng, data) {
    if (latLng instanceof Point) {
        return latLng;
    } else if (this instanceof Point) {
        this._id = ids++;
        this._latLng = latLng;
        this._data = data;
    } else {
        return new Point(latLng, data);
    }
};

wmu.extend(Point.prototype, {
    getLatLng: function() {
        return this._latLng;
    },
    getData: function() {
        return this._data;
    }
});

module.exports = Point;
},{"./utils.js":8}],8:[function(require,module,exports){
module.exports = {
    extend: function(target) {
        for (var i = 1; i < arguments.length; ++i) {
            var source = arguments[i];
            for (var key in source) {
                if (source.hasOwnProperty(key)) target[key] = source[key];
            }
        }
        return target;
    }
};
},{}]},{},[1]);
