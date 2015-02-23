(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
window.wm = {
    Markers: require('./../markers.js'),
    Point: require('./../point.js'),
    Line: require('./../line.js'),
    mapConnectors: {
        mapbox: require('./../map-connectors/mapbox.js'),
        google: require('./../map-connectors/google.js'),
        bing: require('./../map-connectors/bing.js')
    }
};
},{"./../line.js":4,"./../map-connectors/bing.js":5,"./../map-connectors/google.js":6,"./../map-connectors/mapbox.js":7,"./../markers.js":8,"./../point.js":9}],2:[function(require,module,exports){
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
    this._expandDepth = 0
};

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

    getExpandDepth: function() {
        return this._expandDepth;
    },

    getZoomRange: function() {
        return {from:this._zoom, to:this._zoom + this._zoomRange - 1};
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
                    _cluster1: pointToChild[pointId],
                    _cluster2: pointToChild[prePointId],
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
    var i, parentsBest, dis, point,
        shortestDis = Number.MAX_VALUE;

    if (!self._bestPoint) {
        parentsBest = self._parent && getBestPoint(self._parent);
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
        child = chooseBest(self, point._latLng, self._children);
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

function chooseBest(self, center, children) {
    return getFurthestOrClosest(self, center, children, true);
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
        seeds = [getFurthestOrClosest(self, self._center, self._children)];
        seeds.push(getFurthestOrClosest(self, seeds[0]._center, self._children));
    }

    for (i = 0; i < seeds.length; ++i) {
        newChild = new Cluster(self, zoom, zoomRange, self._geo, self._settings);
        newChildren.push(newChild);
        newChild._center = self._geo.getBoundsCenter(seeds[i]._bounds);
    }

    for (i = 0; i < self._children.length; ++i) {
        var child = self._children[i];
        newChild = chooseBest(self, self._geo.getBoundsCenter(child._bounds), newChildren);
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

function getFurthestOrClosest(self, latLng, clusters, closest) {
    var bestDis = closest ? Number.MAX_VALUE : 0, bestChild;
    for (var i = 0; i < clusters.length; ++i) {
        var child = clusters[i];
        var dis = distancePointsSquared(self, latLng, child._center);
        if ((closest && dis < bestDis) || (!closest && dis > bestDis)) {
            bestDis = dis;
            bestChild = child;
        }
    }
    return bestChild;
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
},{"./utils.js":10}],3:[function(require,module,exports){
var wmu = require('./utils.js');
var Cluster = require('./cluster.js');

wmu.extend(Cluster.prototype, {
    getContainedClustersAndConnections: function(bounds, zoom, prevZoom, expandField, preExpandField) {
        var clusters = [],
            connections = [];

        if (this._geo.boundsIntersects(this._bounds, bounds)) {
            search(this, null, 0, 0, bounds, false, prevZoom, zoom, expandField, preExpandField, clusters, connections);
        }

        return {
            clusters: clusters,
            connections: connections
        };
    }
});

function search(cluster, parent, prevExpandDepth, expandDepth, bounds, isPointId, prevZoom, zoom, expandField, preExpandField, clusters, connections) {
    expandDepth = Math.max(cluster[expandField] != null ? cluster[expandField] : cluster[preExpandField], expandDepth - 1, 0);
    prevExpandDepth = Math.max(cluster[preExpandField] != null ? cluster[preExpandField] : cluster[expandField], prevExpandDepth - 1, 0);

    var inZoomRange = (cluster._zoom + cluster._zoomRange - 1) >= zoom && expandDepth == 0;
    var atBottom = !cluster._children.length || cluster._expandDepth == -1;

    if (atBottom || inZoomRange) {
        clusters.push({cluster: cluster, parent: parent});
    } else {
        if ((cluster._zoom + cluster._zoomRange - 1) >= prevZoom && prevExpandDepth == 0) {
            parent = cluster;
        }

        if (connections) {
            findConnections(cluster, parent, prevExpandDepth, expandDepth, prevZoom, zoom, expandField, preExpandField, connections);
        }

        for (var i = 0; i < cluster._children.length; ++i) {
            var child = cluster._children[i];
            if ((isPointId && child._points[bounds]) || (!isPointId && cluster._geo.boundsIntersects(child._bounds, bounds))) {
                search(child, parent, prevExpandDepth, expandDepth, bounds, isPointId, prevZoom, zoom, expandField, preExpandField, clusters, connections);
            }
        }
    }

    return clusters;
}

function findConnections(cluster, parent, prevExpandDepth, expandDepth, prevZoom, zoom, expandField, preExpandField, connections) {
    for (var i = 0; i < cluster._connections.length; i++) {
        var connection = cluster._connections[i];
        connection._displayCluster1 = search(connection._cluster1, parent, prevExpandDepth, expandDepth, connection._pointId1, true, prevZoom, zoom, expandField, preExpandField, [])[0];
        connection._displayCluster2 = search(connection._cluster2, parent, prevExpandDepth, expandDepth, connection._pointId2, true, prevZoom, zoom, expandField, preExpandField, [])[0];
        connections.push(connection);
    }
}
},{"./cluster.js":2,"./utils.js":10}],4:[function(require,module,exports){
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


},{"./point":9,"./utils.js":10}],5:[function(require,module,exports){
module.exports = {
    maxZoom: 20,

    createMarker: function () {
        return new Microsoft.Maps.Pushpin();
    },

    createPolyline: function() {
        return new Microsoft.Maps.Polyline([]);
    },

    createLatLng: function(lat, lng) {
        return new Microsoft.Maps.Location(lat, lng);
    },

    getLatLng: function(latLng) {
        return {_lat: latLng.latitude, _lng: latLng.longitude}
    },

    getMarkerPosition: function(marker) {
        return marker.getLocation();
    },

    setMarkerPosition: function(marker, latLng) {
        marker.setLocation(latLng);
    },

    getPolylinePath: function(polyline) {
        return polyline.getLocations().slice();
    },

    setPolylinePath: function(polyline, latLngs) {
        polyline.setLocations(latLngs);
    },

    showMarker: function(map, marker) {
        map.entities.push(marker);
    },

    showPolyline: function(map, polyline) {
        map.entities.push(polyline);
    },

    hideMarker: function(map, marker) {
        map.entities.remove(marker);
    },

    hidePolyline: function(map, polyline) {
        map.entities.remove(polyline);
    },

    createBounds: function() {
        return new Microsoft.Maps.LocationRect();
    },

    extendBounds: function(bounds, latLngOrBounds) {
        var locations = bounds.center ? [bounds.getNorthwest(), bounds.getSoutheast()] : [];
        for (var i = 0; i < latLngOrBounds.length; ++i) {
            var latLngOrBound = latLngOrBounds[i];
            if (latLngOrBound instanceof Microsoft.Maps.LocationRect && latLngOrBound.center) {
                locations.push(latLngOrBound.getNorthwest());
                locations.push(latLngOrBound.getSoutheast());
            } else {
                locations.push(latLngOrBound);
            }
        }
        return Microsoft.Maps.LocationRect.fromLocations(locations)
    },

    getBoundsCenter: function(bounds) {
        return bounds.center;
    },

    boundsIntersects: function(bounds1, bounds2) {
        if (!bounds1.center || !bounds2.center) return false;
        else return bounds1.intersects(bounds2);
    },

    getBoundsSpan: function(bounds) {
       return {_lat: bounds.height || 0, _lng: bounds.width || 0};
    },

    onMapBoundsChange: function(map, callback) {
        Microsoft.Maps.Events.addHandler(map, 'viewchangeend', callback);
    },

    off: function(token) {
        Microsoft.Maps.Events.removeHandler(token);
    },

    getMapZoom: function(map) {
        return map.getZoom();
    },

    getMapBounds: function(map) {
        return map.getBounds();
    },

    onMarkerClicked: function(marker, callback) {
        return Microsoft.Maps.Events.addHandler(marker, 'click', callback);
    }
};

},{}],6:[function(require,module,exports){
module.exports = {
    maxZoom: 20,

    createMarker: function () {
        return new google.maps.Marker();
    },

    createPolyline: function() {
        return new google.maps.Polyline();
    },

    createLatLng: function(lat, lng) {
        return new google.maps.LatLng(lat, lng);
    },

    getLatLng: function(latLng) {
        return {_lat: latLng.lat(), _lng: latLng.lng()}
    },

    getMarkerPosition: function(marker) {
        return marker.getPosition();
    },

    setMarkerPosition: function(marker, latLng) {
        marker.setPosition(latLng);
    },

    getPolylinePath: function(polyline) {
        return polyline.getPath().getArray().slice();
    },

    setPolylinePath: function(polyline, latLngs) {
        polyline.setPath(new google.maps.MVCArray(latLngs));
    },

    showMarker: function(map, marker) {
        marker.setMap(map);
    },

    showPolyline: function(map, polyline) {
        polyline.setMap(map);
    },

    hideMarker: function(map, marker) {
        marker.setMap(null);
    },

    hidePolyline: function(map, polyline) {
        polyline.setMap(null);
    },

    createBounds: function() {
        return new google.maps.LatLngBounds()
    },

    extendBounds: function(bounds, latLngOrBounds) {
        for (var i = 0; i < latLngOrBounds.length; ++i) {
            var latLngOrBound = latLngOrBounds[i];
            if (latLngOrBound instanceof google.maps.LatLng) {
                bounds.extend(latLngOrBound);
            } else if (latLngOrBound instanceof google.maps.LatLngBounds) {
                bounds.union(latLngOrBound);
            }
        }
        return bounds;
    },

    getBoundsCenter: function(bounds) {
        return bounds.getCenter();
    },

    boundsIntersects: function(bounds1, bounds2) {
        return bounds1.intersects(bounds2);
    },

    getBoundsSpan: function(bounds) {
        var span = bounds.toSpan();
        return {_lat: span.lat(), _lng: span.lng()};
    },

    onMapBoundsChange: function(map, callback) {
        return google.maps.event.addListener(map, 'bounds_changed', callback);
    },

    off: function(token) {
        google.maps.event.removeListener(token);
    },

    getMapZoom: function(map) {
        return map.getZoom();
    },

    getMapBounds: function(map) {
        return map.getBounds();
    },

    onMarkerClicked: function(marker, callback) {
        return google.maps.event.addListener(marker, 'click', callback);
    }
};
},{}],7:[function(require,module,exports){
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

    getMarkerPosition: function(marker) {
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
        return {thing: map, event: 'move', callback: callback};
    },

    off: function(token) {
        token.thing.off(token.event, token.callback);
    },

    getMapZoom: function(map) {
        return map.getZoom();
    },

    getMapBounds: function(map) {
        return map.getBounds();
    },

    onMarkerClicked: function(marker, callback) {
        marker.on('click', callback);
        return {thing: marker, event: 'click', callback: callback};
    }
};

},{}],8:[function(require,module,exports){
var Cluster = require('./cluster.js');
require('./cluster_search.js');
var wmu = require('./utils.js');
var Point = require('./point.js');
var Line = require('./line.js');

var Markers = function(map, options) {
    var self = this;

    this._visibleClusters = [];
    this._visibleConnections = [];
    this._keepKey = 0;
    this._map = map;
    this._zoom = this._prevZoom = this._map.getZoom();
    this._geo = options.mapConnector || (wm.defaultMapConnector && wm.mapConnectors && wm.mapConnectors[wm.defaultMapConnector]);
    this._options = wmu.extend({
        animationSteps: 30,
        animationInterval: 16,
        createMarker: this._geo.createMarker,
        createPolyline: this._geo.createPolyline
    }, options);
    this._clusterRoot = new Cluster(null, 0, this._geo.maxZoom+1, this._geo, { zoomBoxes: getZoomBoxes(this._geo) } );
    this._listeners = [];

    resetViewport(this);

    this._boundsListener = self._geo.onMapBoundsChange(map, function() {
        var zoom = self._geo.getMapZoom(map);
        if (zoom < 0 || zoom > self._geo.maxZoom) return;
        self._prevZoom = self._zoom;
        self._zoom = zoom;

        resetViewport(self);

        self._prevZoom = zoom;
        self._prevBounds = self._geo.getMapBounds(map);
    });
};

wmu.extend(Markers.prototype, {

    on: function(eventName, callback) {
        this._listeners.push({event: eventName, callback: callback});
        return this;
    },

    off: function(eventName, callback) {
        for (var i = 0; i < this._listeners.length; ++i) {
            var listener = this._listeners[i];
            if (listener.event == eventName && (!callback || callback == listener.callback)) {
                this._listeners.splice(i--, 1);
            }
        }
        return this;
    },

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

        if (this._boundsListener) {
            this._geo.offMapsBoundChange(this._boundsListener);
        }
    },

    setClusterState: function(cluster, state) {
        if (state == 'normal') {
            while (cluster && cluster._expandDepth == 0) cluster = cluster._parent;
        }

        if (!cluster) return;

        var oldExpandDepth = cluster._expandDepth,
            collapse;

        cluster._oldExpandDepth = oldExpandDepth;

        if (state == 'normal') {
            cluster._expandDepth = 0;
            if (oldExpandDepth > 0) {
                collapse = true;
            } else if (oldExpandDepth < 0) {
                collapse = false;
            }
        } else if (state == 'collapsed') {
            cluster._expandDepth = -1;
            collapse = true;
        } else if (state == 'expanded') {
            cluster._expandDepth = 1;
            collapse = false;
        }

        resetViewport(this, collapse);

        delete cluster._oldExpandDepth;
    }
});

function trigger(self, event, data) {
    var re = new RegExp('^' + event + '(\\..*)?$');
    for (var i = 0; i < self._listeners.length; ++i) {
        var listener = self._listeners[i];
        if (listener.event.match(re)) {
            listener.callback(wmu.extend({markers: self}, data));
        }
    }
}

function showCluster(self, cluster, center) {
    cluster._keepKey = self._keepKey;
    self._visibleClusters.push(cluster);

    if (!cluster._marker) {
        cluster._marker = self._options.createMarker(cluster);
        cluster._clickListener = self._geo.onMarkerClicked(cluster._marker, function() {
            trigger(self, 'clusterClicked', {cluster: cluster});
        });
    }

    cluster._dLat = cluster._dLng = null;

    self._geo.setMarkerPosition(cluster._marker, center || cluster.getDisplayCenter());

    if (!cluster._visible) {
        self._geo.showMarker(self._map, cluster._marker);
        cluster._visible = true;
        trigger(self, 'clusterShown', {cluster: cluster});
    }

    return cluster._marker;
}

function showConnection(self, connection) {
    connection._keepKey = self._keepKey;
    self._visibleConnections.push(connection);

    connection._polyline = connection._polyline || self._options.createPolyline(connection._line);

    self._geo.setPolylinePath(connection._polyline, [
        connection._displayCluster1.cluster._marker ?
            self._geo.getMarkerPosition(connection._displayCluster1.cluster._marker) :
            connection._displayCluster1.cluster.getDisplayCenter(),
        connection._displayCluster2.cluster._marker ?
            self._geo.getMarkerPosition(connection._displayCluster2.cluster._marker) :
            connection._displayCluster2.cluster.getDisplayCenter()
    ]);

    if (!connection._visible) {
        self._geo.showPolyline(self._map, connection._polyline);
        connection._visible = true;
        trigger(self, 'lineShown', {line: connection._line});
    }

    return connection._polyline;
}

function hideCluster(self, cluster, destroy) {
    if (cluster._marker) {
        self._geo.hideMarker(self._map, cluster._marker);
        cluster._visible = false;
        trigger(self, 'clusterHidden', {cluster: cluster});
        if (destroy) {
            self._geo.off(cluster._clickListener);
            delete cluster._marker;
        }
    }
}

function hideConnection(self, connection, destroy) {
    if (connection._polyline) {
        self._geo.hidePolyline(self._map, connection._polyline);
        connection._visible = false;
        trigger(self, 'lineHidden', {line: connection._line});
        if (destroy) delete connection._polyline;
    }
}

function move(self) {
    var i,
        visible = self._clusterRoot.getContainedClustersAndConnections(getSearchBounds(self), self._zoom, self._prevZoom, '_expandDepth', '_oldExpandDepth');

    for (i = 0; i < visible.clusters.length; ++i) {
        showCluster(self, visible.clusters[i].cluster);
    }
    for (i = 0; i < visible.connections.length; ++i) {
        showConnection(self, visible.connections[i]);
    }
}

function zoomIn(self) {
    var visible = self._clusterRoot.getContainedClustersAndConnections(getSearchBounds(self), self._zoom, self._prevZoom, '_expandDepth', '_oldExpandDepth');
    prepareAnimations(self, visible, false);
}

function zoomOut(self) {
    var visible = self._clusterRoot.getContainedClustersAndConnections(getSearchBounds(self), self._prevZoom, self._zoom, '_oldExpandDepth', '_expandDepth');
    prepareAnimations(self, visible, true);
}

function prepareAnimations(self, visible, collapse) {
    var i;

    for (i = 0; i < visible.clusters.length; ++i) {
        addChildAnimation(self, visible.clusters[i], collapse);
    }

    for (i = 0; i < visible.connections.length; i++) {
        var connection = visible.connections[i];
        addChildAnimation(self, connection._displayCluster1, collapse);
        addChildAnimation(self, connection._displayCluster2, collapse);
        showConnection(self, connection);
    }

    animate(self);
}

function addChildAnimation(self, parentChild, collapse) {
    var parent = parentChild.parent,
        child =  parentChild.cluster;

    // this cluster has already been processed
    if (child._keepKey == self._keepKey) return;

    if (parent) {
        var to = collapse ? parent : child,
            from = collapse ? child : parent,
            toLatLng = self._geo.getLatLng(to.getDisplayCenter()),
            fromLatLng = self._geo.getLatLng(from.getDisplayCenter());

        showCluster(self, child, from.getDisplayCenter());

        child._dLat = (toLatLng._lat - fromLatLng._lat) / self._options.animationSteps;
        child._dLng = (toLatLng._lng - fromLatLng._lng) / self._options.animationSteps;
    } else {
        showCluster(self, child);
    }
}

function animate(self) {
    var steps = 0, i,
        interval = self._options.animationInterval;

    step();
    function step() {
        if (steps++ < self._options.animationSteps) {
            for (i = 0; i < self._visibleClusters.length; ++i) {
                var cluster = self._visibleClusters[i],
                    marker = self._visibleClusters[i]._marker;
                if (!cluster._dLat && !cluster._dLng) continue;

                var movedLatLng = getMovedLatLng(self, self._geo.getMarkerPosition(marker), cluster);
                self._geo.setMarkerPosition(marker, movedLatLng);
            }

            for (i = 0; i < self._visibleConnections.length; ++i) {
                var connection = self._visibleConnections[i],
                    cluster1 = connection._displayCluster1.cluster,
                    cluster2 = connection._displayCluster2.cluster;

                if (!cluster1._dLat && !cluster2._dLat && !cluster1._dLng && !cluster2._dLng) continue;

                var polyline = connection._polyline,
                    polyPath = self._geo.getPolylinePath(polyline);

                polyPath[0] = getMovedLatLng(self, polyPath[0], cluster1);
                polyPath[1] = getMovedLatLng(self, polyPath[1], cluster2);
                self._geo.setPolylinePath(polyline, polyPath);
            }
            self._timeout = setTimeout(step, interval)
        } else {
            resetViewport(self);
        }
    }
}

function getMovedLatLng(self, oldLatLng, delta) {
    if (!delta || (!delta._dLat && !delta._dLng)) return oldLatLng;
    var oldPos = self._geo.getLatLng(oldLatLng);
    return self._geo.createLatLng(oldPos._lat + delta._dLat, oldPos._lng + delta._dLng);
}

function resetViewport(self, collapse) {
    var oldVisibleClusters = self._visibleClusters,
        oldVisibleConnections = self._visibleConnections;

    self._keepKey = (self._keepKey + 1) % 0xDEADBEEF; // mod random big value to stop it from overflowing
    self._visibleClusters = [];
    self._visibleConnections = [];

    clearTimeout(self._timeout);

    if (collapse === false || self._prevZoom < self._zoom) {
        zoomIn(self);
    } else if (collapse === true || self._prevZoom > self._zoom) {
        zoomOut(self);
    } else {
        move(self);
    }

    // push hiding to the next event loop to fix a small flicker
    setTimeout(function() {
        var i;
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
}

function getZoomBoxes(geo) {
    var zoomBoxes = [],
        minDis = 84.375,
        maxDis = 112.6,
        scale = 1;

    for (var z = 0; z <= geo.maxZoom; z++) {
        zoomBoxes[z] = {
            min: (minDis / scale),
            max: (maxDis / scale)
        };
        scale <<= 1;
    }
    
    return zoomBoxes;
}


module.exports = Markers;
},{"./cluster.js":2,"./cluster_search.js":3,"./line.js":4,"./point.js":9,"./utils.js":10}],9:[function(require,module,exports){
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
},{"./utils.js":10}],10:[function(require,module,exports){
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
},{}]},{},[1])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvZGlzdHJpYnV0aW9ucy9hbGwuanMiLCJzcmMvY2x1c3Rlci5qcyIsInNyYy9jbHVzdGVyX3NlYXJjaC5qcyIsInNyYy9saW5lLmpzIiwic3JjL21hcC1jb25uZWN0b3JzL2JpbmcuanMiLCJzcmMvbWFwLWNvbm5lY3RvcnMvZ29vZ2xlLmpzIiwic3JjL21hcC1jb25uZWN0b3JzL21hcGJveC5qcyIsInNyYy9tYXJrZXJzLmpzIiwic3JjL3BvaW50LmpzIiwic3JjL3V0aWxzLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDVEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcldBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0R0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25HQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZZQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIndpbmRvdy53bSA9IHtcbiAgICBNYXJrZXJzOiByZXF1aXJlKCcuLy4uL21hcmtlcnMuanMnKSxcbiAgICBQb2ludDogcmVxdWlyZSgnLi8uLi9wb2ludC5qcycpLFxuICAgIExpbmU6IHJlcXVpcmUoJy4vLi4vbGluZS5qcycpLFxuICAgIG1hcENvbm5lY3RvcnM6IHtcbiAgICAgICAgbWFwYm94OiByZXF1aXJlKCcuLy4uL21hcC1jb25uZWN0b3JzL21hcGJveC5qcycpLFxuICAgICAgICBnb29nbGU6IHJlcXVpcmUoJy4vLi4vbWFwLWNvbm5lY3RvcnMvZ29vZ2xlLmpzJyksXG4gICAgICAgIGJpbmc6IHJlcXVpcmUoJy4vLi4vbWFwLWNvbm5lY3RvcnMvYmluZy5qcycpXG4gICAgfVxufTsiLCJ2YXIgd211ID0gcmVxdWlyZSgnLi91dGlscy5qcycpO1xuXG52YXIgaWRzID0gMTtcblxudmFyIENsdXN0ZXIgPSBmdW5jdGlvbiAocGFyZW50LCB6b29tLCB6b29tUmFuZ2UsIGdlbywgc2V0dGluZ3MpIHtcbiAgICB0aGlzLl9wYXJlbnQgPSBwYXJlbnQ7XG4gICAgdGhpcy5fc2V0dGluZ3MgPSBzZXR0aW5ncztcbiAgICB0aGlzLl9nZW8gPSBnZW87XG4gICAgdGhpcy5faWQgPSBpZHMrKztcbiAgICB0aGlzLl96b29tID0gem9vbTtcbiAgICB0aGlzLl96b29tUmFuZ2UgPSB6b29tUmFuZ2U7XG4gICAgdGhpcy5fY2hpbGRyZW4gPSBbXTtcbiAgICB0aGlzLl9wb2ludHMgPSB7fTtcbiAgICB0aGlzLl9wb2ludFRvQ2hpbGQgPSB7fTtcbiAgICB0aGlzLl9jb25uZWN0aW9ucyA9IFtdO1xuICAgIHRoaXMuX2JvdW5kcyA9IGdlby5jcmVhdGVCb3VuZHMoKTtcbiAgICB0aGlzLl9jZW50ZXIgPSBnZW8uY3JlYXRlTGF0TG5nKDAsIDApO1xuICAgIHRoaXMuX2V4cGFuZERlcHRoID0gMFxufTtcblxud211LmV4dGVuZChDbHVzdGVyLnByb3RvdHlwZSwge1xuICAgIGdldEJvdW5kczogZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9ib3VuZHM7XG4gICAgfSxcblxuICAgIGdldENlbnRlcjogZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9jZW50ZXI7XG4gICAgfSxcblxuICAgIGdldERpc3BsYXlDZW50ZXI6IGZ1bmN0aW9uKCkge1xuICAgICAgICByZXR1cm4gZ2V0QmVzdFBvaW50KHRoaXMpLl9sYXRMbmc7XG4gICAgfSxcblxuICAgIGdldFBvaW50czogZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBwb2ludHMgPSBbXTtcbiAgICAgICAgZm9yICh2YXIgaSBpbiB0aGlzLl9wb2ludHMpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLl9wb2ludHMuaGFzT3duUHJvcGVydHkoaSkpIHBvaW50cy5wdXNoKHRoaXMuX3BvaW50c1tpXSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHBvaW50cztcbiAgICB9LFxuXG4gICAgZ2V0TWFya2VyOiBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX21hcmtlcjtcbiAgICB9LFxuXG4gICAgZ2V0UGFyZW50OiBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3BhcmVudDtcbiAgICB9LFxuXG4gICAgZ2V0RXhwYW5kRGVwdGg6IGZ1bmN0aW9uKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fZXhwYW5kRGVwdGg7XG4gICAgfSxcblxuICAgIGdldFpvb21SYW5nZTogZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiB7ZnJvbTp0aGlzLl96b29tLCB0bzp0aGlzLl96b29tICsgdGhpcy5fem9vbVJhbmdlIC0gMX07XG4gICAgfSxcblxuICAgIHJlbW92ZVBvaW50czogZnVuY3Rpb24ocG9pbnRzKSB7XG4gICAgICAgIHZhciBpLCBoYXNQb2ludCA9IGZhbHNlO1xuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgcG9pbnRzLmxlbmd0aDsgKytpKSB7XG4gICAgICAgICAgICB2YXIgcG9pbnQgPSBwb2ludHNbaV07XG4gICAgICAgICAgICBpZiAoIXRoaXMuX3BvaW50c1twb2ludC5faWRdKSBjb250aW51ZTtcbiAgICAgICAgICAgIGRlbGV0ZSB0aGlzLl9wb2ludHNbcG9pbnQuX2lkXTtcbiAgICAgICAgICAgIGhhc1BvaW50ID0gdHJ1ZTtcblxuICAgICAgICAgICAgaWYgKHRoaXMuX3BhcmVudCkge1xuICAgICAgICAgICAgICAgIGRlbGV0ZSB0aGlzLl9wYXJlbnQuX3BvaW50VG9DaGlsZFtwb2ludC5faWRdO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGhhc1BvaW50KSB7XG4gICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgdGhpcy5fY2hpbGRyZW4ubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgICAgICAgICB2YXIgY2hpbGQgPSB0aGlzLl9jaGlsZHJlbltpXTtcbiAgICAgICAgICAgICAgICBpZiAoIWNoaWxkLnJlbW92ZVBvaW50cyhwb2ludHMpKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX2NoaWxkcmVuLnNwbGljZShpLCAxKTtcbiAgICAgICAgICAgICAgICAgICAgLS1pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5fYmVzdFBvaW50ID0gbnVsbDtcbiAgICAgICAgICAgIHRoaXMuX2JvdW5kcyA9IHRoaXMuX2dlby5jcmVhdGVCb3VuZHMoKTtcbiAgICAgICAgICAgIHZhciBsYXRMbmdzID0gW107XG4gICAgICAgICAgICBmb3IgKHZhciBwSWQgaW4gdGhpcy5fcG9pbnRzKSB7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuX3BvaW50cy5oYXNPd25Qcm9wZXJ0eShwSWQpKSB7XG4gICAgICAgICAgICAgICAgICAgIGxhdExuZ3MucHVzaCh0aGlzLl9wb2ludHNbcElkXS5fbGF0TG5nKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLl9ib3VuZHMgPSB0aGlzLl9nZW8uZXh0ZW5kQm91bmRzKHRoaXMuX2JvdW5kcywgbGF0TG5ncyk7XG4gICAgICAgICAgICByZXR1cm4gISFsYXRMbmdzLmxlbmd0aDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIGFkZFBvaW50czogZnVuY3Rpb24ocG9pbnRzKSB7XG4gICAgICAgIHZhciBpLCBoYXNQb2ludCA9IGZhbHNlLCBsYXRMbmdzID0gW107XG5cbiAgICAgICAgZm9yIChpID0gMDsgIGkgPCBwb2ludHMubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgICAgIHZhciBwb2ludCA9IHBvaW50c1tpXTtcbiAgICAgICAgICAgIGlmICh0aGlzLl9wb2ludHNbcG9pbnQuX2lkXSkgY29udGludWU7XG4gICAgICAgICAgICB0aGlzLl9wb2ludHNbcG9pbnQuX2lkXSA9IHBvaW50O1xuICAgICAgICAgICAgbGF0TG5ncy5wdXNoKHBvaW50Ll9sYXRMbmcpO1xuICAgICAgICAgICAgaWYgKHRoaXMuX3BhcmVudCkge1xuICAgICAgICAgICAgICAgIHRoaXMuX3BhcmVudC5fcG9pbnRUb0NoaWxkW3BvaW50Ll9pZF0gPSB0aGlzO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaGFzUG9pbnQgPSB0cnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5fYm91bmRzID0gdGhpcy5fZ2VvLmV4dGVuZEJvdW5kcyh0aGlzLl9ib3VuZHMsIGxhdExuZ3MpO1xuXG4gICAgICAgIGlmIChoYXNQb2ludCkge1xuICAgICAgICAgICAgdGhpcy5fYmVzdFBvaW50ID0gbnVsbDtcbiAgICAgICAgICAgIHRoaXMuX2NlbnRlciA9IHRoaXMuX2dlby5nZXRCb3VuZHNDZW50ZXIodGhpcy5fYm91bmRzKTtcbiAgICAgICAgICAgIGFkZFRvQ2hpbGRyZW4odGhpcywgcG9pbnRzKTtcblxuICAgICAgICAgICAgdmFyIG9sZFpvb21SYW5nZSA9IHRoaXMuX3pvb21SYW5nZTtcbiAgICAgICAgICAgIHRoaXMuX3pvb21SYW5nZSA9IGZpbmRab29tUmFuZ2UodGhpcyk7XG5cbiAgICAgICAgICAgIGlmICh0aGlzLl96b29tUmFuZ2UgPCBvbGRab29tUmFuZ2UpIHtcbiAgICAgICAgICAgICAgICBzcGxpdENoaWxkcmVuKHRoaXMsIHRoaXMuX3pvb20gKyB0aGlzLl96b29tUmFuZ2UsIG9sZFpvb21SYW5nZSAtIHRoaXMuX3pvb21SYW5nZSlcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHRoaXMuX3pvb21SYW5nZSA9PSAwKSB7XG4gICAgICAgICAgICAgICAgcmVtb3ZlU2VsZih0aGlzKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICBhZGRMaW5lOiBmdW5jdGlvbihsaW5lKSB7XG4gICAgICAgIHZhciBwb2ludFRvQ2hpbGQgPSB0aGlzLl9wb2ludFRvQ2hpbGQsXG4gICAgICAgICAgICBzZWVuQ2hpbGRyZW4gPSB7fTtcblxuICAgICAgICBmb3IgKHZhciBpID0gMTsgaSA8IGxpbmUuX3BvaW50cy5sZW5ndGg7ICsraSkge1xuICAgICAgICAgICAgdmFyIHBvaW50SWQgPSBsaW5lLl9wb2ludHNbaV0uX2lkO1xuICAgICAgICAgICAgdmFyIHByZVBvaW50SWQgPSBsaW5lLl9wb2ludHNbaSAtIDFdLl9pZDtcbiAgICAgICAgICAgIHZhciBjaGlsZCA9IHBvaW50VG9DaGlsZFtwb2ludElkXTtcbiAgICAgICAgICAgIHZhciBwcmVDaGlsZCA9IHBvaW50VG9DaGlsZFtwcmVQb2ludElkXTtcblxuICAgICAgICAgICAgaWYgKGNoaWxkICYmIHByZUNoaWxkICYmIGNoaWxkICE9IHByZUNoaWxkKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fY29ubmVjdGlvbnMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgIF9pZDogaWRzKyssXG4gICAgICAgICAgICAgICAgICAgIF9wb2ludElkMTogcG9pbnRJZCxcbiAgICAgICAgICAgICAgICAgICAgX3BvaW50SWQyOiBwcmVQb2ludElkLFxuICAgICAgICAgICAgICAgICAgICBfY2x1c3RlcjE6IHBvaW50VG9DaGlsZFtwb2ludElkXSxcbiAgICAgICAgICAgICAgICAgICAgX2NsdXN0ZXIyOiBwb2ludFRvQ2hpbGRbcHJlUG9pbnRJZF0sXG4gICAgICAgICAgICAgICAgICAgIF9saW5lOiBsaW5lXG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGNoaWxkKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFzZWVuQ2hpbGRyZW5bY2hpbGQuX2lkXSkge1xuICAgICAgICAgICAgICAgICAgICBzZWVuQ2hpbGRyZW5bY2hpbGQuX2lkXSA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIGNoaWxkLmFkZExpbmUobGluZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSxcblxuICAgIHJlbW92ZUxpbmU6IGZ1bmN0aW9uKGxpbmUpIHtcbiAgICAgICAgdmFyIHNlZW5DaGlsZHJlbiA9IHt9LFxuICAgICAgICAgICAgY29ubmVjdGlvbnMgPSB0aGlzLl9jb25uZWN0aW9ucztcblxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGNvbm5lY3Rpb25zLmxlbmd0aDsgKytpKSB7XG4gICAgICAgICAgICB2YXIgY29ubmVjdGlvbiA9IGNvbm5lY3Rpb25zW2ldO1xuICAgICAgICAgICAgaWYgKGNvbm5lY3Rpb24uX2xpbmUgPT0gbGluZSkge1xuXG4gICAgICAgICAgICAgICAgY29ubmVjdGlvbnMuc3BsaWNlKGktLSwgMSk7XG5cbiAgICAgICAgICAgICAgICB2YXIgY2hpbGQxID0gdGhpcy5fcG9pbnRUb0NoaWxkW2Nvbm5lY3Rpb24uX3BvaW50SWQxXTtcbiAgICAgICAgICAgICAgICB2YXIgY2hpbGQyID0gdGhpcy5fcG9pbnRUb0NoaWxkW2Nvbm5lY3Rpb24uX3BvaW50SWQyXTtcbiAgICAgICAgICAgICAgICBpZiAoIXNlZW5DaGlsZHJlbltjaGlsZDEuX2lkXSkgY2hpbGQxLnJlbW92ZUxpbmUobGluZSk7XG4gICAgICAgICAgICAgICAgaWYgKCFzZWVuQ2hpbGRyZW5bY2hpbGQyLl9pZF0pIGNoaWxkMi5yZW1vdmVMaW5lKGxpbmUpO1xuICAgICAgICAgICAgICAgIHNlZW5DaGlsZHJlbltjaGlsZDEuX2lkXSA9IHRydWU7XG4gICAgICAgICAgICAgICAgc2VlbkNoaWxkcmVuW2NoaWxkMi5faWRdID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbn0pO1xuXG4gZnVuY3Rpb24gZ2V0QmVzdFBvaW50KHNlbGYpIHtcbiAgICB2YXIgaSwgcGFyZW50c0Jlc3QsIGRpcywgcG9pbnQsXG4gICAgICAgIHNob3J0ZXN0RGlzID0gTnVtYmVyLk1BWF9WQUxVRTtcblxuICAgIGlmICghc2VsZi5fYmVzdFBvaW50KSB7XG4gICAgICAgIHBhcmVudHNCZXN0ID0gc2VsZi5fcGFyZW50ICYmIGdldEJlc3RQb2ludChzZWxmLl9wYXJlbnQpO1xuICAgICAgICBpZiAocGFyZW50c0Jlc3QgJiYgc2VsZi5fcG9pbnRzW3BhcmVudHNCZXN0Ll9pZF0gIT0gbnVsbCkge1xuICAgICAgICAgICAgc2VsZi5fYmVzdFBvaW50ID0gcGFyZW50c0Jlc3Q7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBmb3IgKGkgaW4gc2VsZi5fcG9pbnRzKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFzZWxmLl9wb2ludHMuaGFzT3duUHJvcGVydHkoaSkpIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIHBvaW50ID0gc2VsZi5fcG9pbnRzW2ldO1xuICAgICAgICAgICAgICAgIGRpcyA9IGRpc3RhbmNlUG9pbnRzU3F1YXJlZChzZWxmLCBwb2ludCwgc2VsZi5fY2VudGVyKTtcbiAgICAgICAgICAgICAgICBpZiAoZGlzIDwgc2hvcnRlc3REaXMpIHtcbiAgICAgICAgICAgICAgICAgICAgc2VsZi5fYmVzdFBvaW50ID0gcG9pbnQ7XG4gICAgICAgICAgICAgICAgICAgIHNob3J0ZXN0RGlzID0gZGlzO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBzZWxmLl9iZXN0UG9pbnQ7XG59XG5cbmZ1bmN0aW9uIGFkZFRvQ2hpbGRyZW4oc2VsZiwgcG9pbnRzKSB7XG4gICAgdmFyIGNoaWxkVG9Qb2ludHMgPSB7fSxcbiAgICAgICAgbmV4dFpvb20gPSBzZWxmLl96b29tICsgc2VsZi5fem9vbVJhbmdlLFxuICAgICAgICBpLCBjaGlsZCwgcG9pbnQsIHBvaW50c1RvQWRkO1xuXG4gICAgaWYgKG5leHRab29tID4gc2VsZi5fZ2VvLm1heFpvb20pIHJldHVybjtcblxuICAgIGZvciAoaSA9IDA7IGkgPCBwb2ludHMubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgcG9pbnQgPSBwb2ludHNbaV07XG4gICAgICAgIGNoaWxkID0gY2hvb3NlQmVzdChzZWxmLCBwb2ludC5fbGF0TG5nLCBzZWxmLl9jaGlsZHJlbik7XG4gICAgICAgIGNoaWxkVG9Qb2ludHNbY2hpbGQuX2lkXSA9IGNoaWxkVG9Qb2ludHNbY2hpbGQuX2lkXSB8fCBbXTtcbiAgICAgICAgY2hpbGRUb1BvaW50c1tjaGlsZC5faWRdLnB1c2gocG9pbnQpO1xuICAgIH1cblxuICAgIGZvciAoaSA9IDA7IGkgPCBzZWxmLl9jaGlsZHJlbjsgKytpKSB7XG4gICAgICAgIGNoaWxkID0gc2VsZi5fY2hpbGRyZW5baV07XG4gICAgICAgIHBvaW50c1RvQWRkID0gY2hpbGRUb1BvaW50c1tjaGlsZC5faWRdO1xuICAgICAgICBpZiAocG9pbnRzVG9BZGQpIHtcbiAgICAgICAgICAgIGNoaWxkLmFkZFBvaW50cyhwb2ludHNUb0FkZClcbiAgICAgICAgfVxuICAgIH1cbn1cblxuZnVuY3Rpb24gY2hvb3NlQmVzdChzZWxmLCBjZW50ZXIsIGNoaWxkcmVuKSB7XG4gICAgcmV0dXJuIGdldEZ1cnRoZXN0T3JDbG9zZXN0KHNlbGYsIGNlbnRlciwgY2hpbGRyZW4sIHRydWUpO1xufVxuXG5mdW5jdGlvbiBzcGxpdENoaWxkcmVuKHNlbGYsIHpvb20sIHpvb21SYW5nZSkge1xuICAgIHZhciBuZXdDaGlsZHJlbiA9IFtdLCBpLCBqLFxuICAgICAgICBuZXdDaGlsZCwgc2VlZHM7XG5cbiAgICBpZiAoIXNlbGYuX2NoaWxkcmVuLmxlbmd0aCkge1xuICAgICAgICBmb3IgKGkgaW4gc2VsZi5fcG9pbnRzKSB7XG4gICAgICAgICAgICBpZiAoIXNlbGYuX3BvaW50cy5oYXNPd25Qcm9wZXJ0eShpKSkgY29udGludWU7XG4gICAgICAgICAgICBuZXdDaGlsZCA9IG5ldyBDbHVzdGVyKHNlbGYsIHNlbGYuX2dlby5tYXhab29tLCAxLCBzZWxmLl9nZW8sIHNlbGYuX3NldHRpbmdzKTtcbiAgICAgICAgICAgIG5ld0NoaWxkLmFkZFBvaW50cyhbc2VsZi5fcG9pbnRzW2ldXSk7XG4gICAgICAgICAgICBzZWxmLl9jaGlsZHJlbi5wdXNoKG5ld0NoaWxkKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoLS16b29tUmFuZ2UgPT0gMCkgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgaWYgKHNlbGYuX2NoaWxkcmVuLmxlbmd0aCA8IDMpIHtcbiAgICAgICAgc2VlZHMgPSBzZWxmLl9jaGlsZHJlbjtcbiAgICB9IGVsc2Uge1xuICAgICAgICBzZWVkcyA9IFtnZXRGdXJ0aGVzdE9yQ2xvc2VzdChzZWxmLCBzZWxmLl9jZW50ZXIsIHNlbGYuX2NoaWxkcmVuKV07XG4gICAgICAgIHNlZWRzLnB1c2goZ2V0RnVydGhlc3RPckNsb3Nlc3Qoc2VsZiwgc2VlZHNbMF0uX2NlbnRlciwgc2VsZi5fY2hpbGRyZW4pKTtcbiAgICB9XG5cbiAgICBmb3IgKGkgPSAwOyBpIDwgc2VlZHMubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgbmV3Q2hpbGQgPSBuZXcgQ2x1c3RlcihzZWxmLCB6b29tLCB6b29tUmFuZ2UsIHNlbGYuX2dlbywgc2VsZi5fc2V0dGluZ3MpO1xuICAgICAgICBuZXdDaGlsZHJlbi5wdXNoKG5ld0NoaWxkKTtcbiAgICAgICAgbmV3Q2hpbGQuX2NlbnRlciA9IHNlbGYuX2dlby5nZXRCb3VuZHNDZW50ZXIoc2VlZHNbaV0uX2JvdW5kcyk7XG4gICAgfVxuXG4gICAgZm9yIChpID0gMDsgaSA8IHNlbGYuX2NoaWxkcmVuLmxlbmd0aDsgKytpKSB7XG4gICAgICAgIHZhciBjaGlsZCA9IHNlbGYuX2NoaWxkcmVuW2ldO1xuICAgICAgICBuZXdDaGlsZCA9IGNob29zZUJlc3Qoc2VsZiwgc2VsZi5fZ2VvLmdldEJvdW5kc0NlbnRlcihjaGlsZC5fYm91bmRzKSwgbmV3Q2hpbGRyZW4pO1xuICAgICAgICBuZXdDaGlsZC5fY2hpbGRyZW4ucHVzaChjaGlsZCk7XG4gICAgfVxuXG4gICAgc2VsZi5fY2hpbGRyZW4gPSBuZXdDaGlsZHJlbjtcbiAgICBzZWxmLl9wb2ludFRvQ2hpbGQgPSB7fTtcblxuICAgIGZvciAoaSA9IDA7IGkgPCBuZXdDaGlsZHJlbi5sZW5ndGg7ICsraSkge1xuICAgICAgICBuZXdDaGlsZCA9IG5ld0NoaWxkcmVuW2ldO1xuICAgICAgICBmb3IgKGogPSAwOyBqIDwgbmV3Q2hpbGQuX2NoaWxkcmVuLmxlbmd0aDsgKytqKSB7XG4gICAgICAgICAgICBtZXJnZUNoaWxkKHNlbGYsIG5ld0NoaWxkLCBuZXdDaGlsZC5fY2hpbGRyZW5bal0pO1xuICAgICAgICB9XG4gICAgICAgIG5ld0NoaWxkLl9jZW50ZXIgPSBzZWxmLl9nZW8uZ2V0Qm91bmRzQ2VudGVyKG5ld0NoaWxkLl9ib3VuZHMpO1xuICAgICAgICBuZXdDaGlsZC5fem9vbVJhbmdlID0gZmluZFpvb21SYW5nZShuZXdDaGlsZCk7XG4gICAgICAgIGlmIChuZXdDaGlsZC5fem9vbVJhbmdlIDwgem9vbVJhbmdlKSB7XG4gICAgICAgICAgICBzcGxpdENoaWxkcmVuKG5ld0NoaWxkLCBuZXdDaGlsZC5fem9vbSArIG5ld0NoaWxkLl96b29tUmFuZ2UsIHpvb21SYW5nZSAtIG5ld0NoaWxkLl96b29tUmFuZ2UpXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gbWVyZ2VDaGlsZChzZWxmLCBuZXdDbHVzdGVyLCBjaGlsZCkge1xuICAgIG5ld0NsdXN0ZXIuX2JvdW5kcyA9IHNlbGYuX2dlby5leHRlbmRCb3VuZHMobmV3Q2x1c3Rlci5fYm91bmRzLCBbY2hpbGQuX2JvdW5kc10pO1xuICAgIGNoaWxkLl9wYXJlbnQgPSBuZXdDbHVzdGVyO1xuICAgIGZvciAodmFyIGkgaW4gY2hpbGQuX3BvaW50cykge1xuICAgICAgICBpZiAoIWNoaWxkLl9wb2ludHMuaGFzT3duUHJvcGVydHkoaSkpIGNvbnRpbnVlO1xuICAgICAgICB2YXIgcG9pbnQgPSBjaGlsZC5fcG9pbnRzW2ldO1xuICAgICAgICBuZXdDbHVzdGVyLl9wb2ludHNbcG9pbnQuX2lkXSA9IHBvaW50O1xuICAgICAgICBuZXdDbHVzdGVyLl9wb2ludFRvQ2hpbGRbcG9pbnQuX2lkXSA9IGNoaWxkO1xuICAgICAgICBzZWxmLl9wb2ludFRvQ2hpbGRbcG9pbnQuX2lkXSA9IG5ld0NsdXN0ZXI7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBnZXRGdXJ0aGVzdE9yQ2xvc2VzdChzZWxmLCBsYXRMbmcsIGNsdXN0ZXJzLCBjbG9zZXN0KSB7XG4gICAgdmFyIGJlc3REaXMgPSBjbG9zZXN0ID8gTnVtYmVyLk1BWF9WQUxVRSA6IDAsIGJlc3RDaGlsZDtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGNsdXN0ZXJzLmxlbmd0aDsgKytpKSB7XG4gICAgICAgIHZhciBjaGlsZCA9IGNsdXN0ZXJzW2ldO1xuICAgICAgICB2YXIgZGlzID0gZGlzdGFuY2VQb2ludHNTcXVhcmVkKHNlbGYsIGxhdExuZywgY2hpbGQuX2NlbnRlcik7XG4gICAgICAgIGlmICgoY2xvc2VzdCAmJiBkaXMgPCBiZXN0RGlzKSB8fCAoIWNsb3Nlc3QgJiYgZGlzID4gYmVzdERpcykpIHtcbiAgICAgICAgICAgIGJlc3REaXMgPSBkaXM7XG4gICAgICAgICAgICBiZXN0Q2hpbGQgPSBjaGlsZDtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gYmVzdENoaWxkO1xufVxuXG5mdW5jdGlvbiByZW1vdmVTZWxmKHNlbGYpIHtcbiAgICBpZiAoIXNlbGYuX3BhcmVudCkgcmV0dXJuIGZhbHNlO1xuXG4gICAgdmFyIHNpYmxpbmdzID0gc2VsZi5fcGFyZW50Ll9jaGlsZHJlbixcbiAgICAgICAgbmV3Wm9vbSA9IHNlbGYuX3pvb20sIGk7XG4gICAgZm9yIChpID0gMDsgaSA8IHNpYmxpbmdzLmxlbmd0aDsgKytpKSB7XG4gICAgICAgIGlmIChzaWJsaW5nc1tpXSA9PSBzZWxmKSB7XG4gICAgICAgICAgICBzaWJsaW5ncy5zcGxpY2UoaSwgMSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmb3IgKGkgPSAwOyBpIDwgc2VsZi5fY2hpbGRyZW4ubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgdmFyIGNoaWxkID0gc2VsZi5fY2hpbGRyZW5baV07XG4gICAgICAgIGNoaWxkLl96b29tUmFuZ2UgKz0gY2hpbGQuX3pvb20gLSBuZXdab29tO1xuICAgICAgICBjaGlsZC5fem9vbSA9IG5ld1pvb207XG4gICAgICAgIGNoaWxkLl9wYXJlbnQgPSBzZWxmLl9wYXJlbnQ7XG4gICAgICAgIHNpYmxpbmdzLnB1c2goY2hpbGQpO1xuICAgIH1cblxuICAgIHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiBmaW5kWm9vbVJhbmdlKHNlbGYpIHtcbiAgICB2YXIgc3BhbiA9IHNlbGYuX2dlby5nZXRCb3VuZHNTcGFuKHNlbGYuX2JvdW5kcyksXG4gICAgICAgIGJpZ0RpcyxcbiAgICAgICAgdG9wID0gc2VsZi5fem9vbSxcbiAgICAgICAgYm90dG9tID0gc2VsZi5fem9vbSArIHNlbGYuX3pvb21SYW5nZSAtIDE7XG5cbiAgICBpZiAoc3Bhbi5fbGF0ID4gc3Bhbi5fbG5nKSB7XG4gICAgICAgIGJpZ0RpcyA9IHNwYW4uX2xhdDtcbiAgICB9IGVsc2Uge1xuICAgICAgICBiaWdEaXMgPSBzcGFuLl9sbmc7XG4gICAgfVxuXG4gICAgd2hpbGUgKGJvdHRvbSA+IHRvcCAmJiBzZWxmLl9zZXR0aW5ncy56b29tQm94ZXNbYm90dG9tXS5tYXggPCBiaWdEaXMpIGJvdHRvbS0tO1xuXG4gICAgcmV0dXJuIGJvdHRvbSAtIHRvcCArIDE7XG59XG5cbmZ1bmN0aW9uIGRpc3RhbmNlUG9pbnRzU3F1YXJlZChzZWxmLCBwMSwgcDIpIHtcbiAgICB2YXIgbGF0TG5nMSA9IHAxLl9sYXQgIT0gbnVsbCA/IHAxIDogc2VsZi5fZ2VvLmdldExhdExuZyhwMS5fbGF0TG5nIHx8IHAxKTtcbiAgICB2YXIgbGF0TG5nMiA9IHAyLl9sYXQgIT0gbnVsbCA/IHAyIDogc2VsZi5fZ2VvLmdldExhdExuZyhwMi5fbGF0TG5nIHx8IHAyKTtcbiAgICByZXR1cm4gZGlzdGFuY2VMYXRMbmdzU3F1YXJlZChsYXRMbmcxLl9sYXQsIGxhdExuZzEuX2xuZywgbGF0TG5nMi5fbGF0LCBsYXRMbmcyLl9sbmcpO1xufVxuXG5mdW5jdGlvbiBkaXN0YW5jZUxhdExuZ3NTcXVhcmVkKGxhdDEsIGxuZzEsIGxhdDIsIGxuZzIpIHtcbiAgICB2YXIgZHggPSBsYXQxIC0gbGF0MjtcbiAgICB2YXIgZHkgPSBsbmcxIC0gbG5nMjtcbiAgICByZXR1cm4gZHgqZHgrZHkqZHk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gQ2x1c3RlcjsiLCJ2YXIgd211ID0gcmVxdWlyZSgnLi91dGlscy5qcycpO1xudmFyIENsdXN0ZXIgPSByZXF1aXJlKCcuL2NsdXN0ZXIuanMnKTtcblxud211LmV4dGVuZChDbHVzdGVyLnByb3RvdHlwZSwge1xuICAgIGdldENvbnRhaW5lZENsdXN0ZXJzQW5kQ29ubmVjdGlvbnM6IGZ1bmN0aW9uKGJvdW5kcywgem9vbSwgcHJldlpvb20sIGV4cGFuZEZpZWxkLCBwcmVFeHBhbmRGaWVsZCkge1xuICAgICAgICB2YXIgY2x1c3RlcnMgPSBbXSxcbiAgICAgICAgICAgIGNvbm5lY3Rpb25zID0gW107XG5cbiAgICAgICAgaWYgKHRoaXMuX2dlby5ib3VuZHNJbnRlcnNlY3RzKHRoaXMuX2JvdW5kcywgYm91bmRzKSkge1xuICAgICAgICAgICAgc2VhcmNoKHRoaXMsIG51bGwsIDAsIDAsIGJvdW5kcywgZmFsc2UsIHByZXZab29tLCB6b29tLCBleHBhbmRGaWVsZCwgcHJlRXhwYW5kRmllbGQsIGNsdXN0ZXJzLCBjb25uZWN0aW9ucyk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgY2x1c3RlcnM6IGNsdXN0ZXJzLFxuICAgICAgICAgICAgY29ubmVjdGlvbnM6IGNvbm5lY3Rpb25zXG4gICAgICAgIH07XG4gICAgfVxufSk7XG5cbmZ1bmN0aW9uIHNlYXJjaChjbHVzdGVyLCBwYXJlbnQsIHByZXZFeHBhbmREZXB0aCwgZXhwYW5kRGVwdGgsIGJvdW5kcywgaXNQb2ludElkLCBwcmV2Wm9vbSwgem9vbSwgZXhwYW5kRmllbGQsIHByZUV4cGFuZEZpZWxkLCBjbHVzdGVycywgY29ubmVjdGlvbnMpIHtcbiAgICBleHBhbmREZXB0aCA9IE1hdGgubWF4KGNsdXN0ZXJbZXhwYW5kRmllbGRdICE9IG51bGwgPyBjbHVzdGVyW2V4cGFuZEZpZWxkXSA6IGNsdXN0ZXJbcHJlRXhwYW5kRmllbGRdLCBleHBhbmREZXB0aCAtIDEsIDApO1xuICAgIHByZXZFeHBhbmREZXB0aCA9IE1hdGgubWF4KGNsdXN0ZXJbcHJlRXhwYW5kRmllbGRdICE9IG51bGwgPyBjbHVzdGVyW3ByZUV4cGFuZEZpZWxkXSA6IGNsdXN0ZXJbZXhwYW5kRmllbGRdLCBwcmV2RXhwYW5kRGVwdGggLSAxLCAwKTtcblxuICAgIHZhciBpblpvb21SYW5nZSA9IChjbHVzdGVyLl96b29tICsgY2x1c3Rlci5fem9vbVJhbmdlIC0gMSkgPj0gem9vbSAmJiBleHBhbmREZXB0aCA9PSAwO1xuICAgIHZhciBhdEJvdHRvbSA9ICFjbHVzdGVyLl9jaGlsZHJlbi5sZW5ndGggfHwgY2x1c3Rlci5fZXhwYW5kRGVwdGggPT0gLTE7XG5cbiAgICBpZiAoYXRCb3R0b20gfHwgaW5ab29tUmFuZ2UpIHtcbiAgICAgICAgY2x1c3RlcnMucHVzaCh7Y2x1c3RlcjogY2x1c3RlciwgcGFyZW50OiBwYXJlbnR9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBpZiAoKGNsdXN0ZXIuX3pvb20gKyBjbHVzdGVyLl96b29tUmFuZ2UgLSAxKSA+PSBwcmV2Wm9vbSAmJiBwcmV2RXhwYW5kRGVwdGggPT0gMCkge1xuICAgICAgICAgICAgcGFyZW50ID0gY2x1c3RlcjtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChjb25uZWN0aW9ucykge1xuICAgICAgICAgICAgZmluZENvbm5lY3Rpb25zKGNsdXN0ZXIsIHBhcmVudCwgcHJldkV4cGFuZERlcHRoLCBleHBhbmREZXB0aCwgcHJldlpvb20sIHpvb20sIGV4cGFuZEZpZWxkLCBwcmVFeHBhbmRGaWVsZCwgY29ubmVjdGlvbnMpO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBjbHVzdGVyLl9jaGlsZHJlbi5sZW5ndGg7ICsraSkge1xuICAgICAgICAgICAgdmFyIGNoaWxkID0gY2x1c3Rlci5fY2hpbGRyZW5baV07XG4gICAgICAgICAgICBpZiAoKGlzUG9pbnRJZCAmJiBjaGlsZC5fcG9pbnRzW2JvdW5kc10pIHx8ICghaXNQb2ludElkICYmIGNsdXN0ZXIuX2dlby5ib3VuZHNJbnRlcnNlY3RzKGNoaWxkLl9ib3VuZHMsIGJvdW5kcykpKSB7XG4gICAgICAgICAgICAgICAgc2VhcmNoKGNoaWxkLCBwYXJlbnQsIHByZXZFeHBhbmREZXB0aCwgZXhwYW5kRGVwdGgsIGJvdW5kcywgaXNQb2ludElkLCBwcmV2Wm9vbSwgem9vbSwgZXhwYW5kRmllbGQsIHByZUV4cGFuZEZpZWxkLCBjbHVzdGVycywgY29ubmVjdGlvbnMpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGNsdXN0ZXJzO1xufVxuXG5mdW5jdGlvbiBmaW5kQ29ubmVjdGlvbnMoY2x1c3RlciwgcGFyZW50LCBwcmV2RXhwYW5kRGVwdGgsIGV4cGFuZERlcHRoLCBwcmV2Wm9vbSwgem9vbSwgZXhwYW5kRmllbGQsIHByZUV4cGFuZEZpZWxkLCBjb25uZWN0aW9ucykge1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgY2x1c3Rlci5fY29ubmVjdGlvbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdmFyIGNvbm5lY3Rpb24gPSBjbHVzdGVyLl9jb25uZWN0aW9uc1tpXTtcbiAgICAgICAgY29ubmVjdGlvbi5fZGlzcGxheUNsdXN0ZXIxID0gc2VhcmNoKGNvbm5lY3Rpb24uX2NsdXN0ZXIxLCBwYXJlbnQsIHByZXZFeHBhbmREZXB0aCwgZXhwYW5kRGVwdGgsIGNvbm5lY3Rpb24uX3BvaW50SWQxLCB0cnVlLCBwcmV2Wm9vbSwgem9vbSwgZXhwYW5kRmllbGQsIHByZUV4cGFuZEZpZWxkLCBbXSlbMF07XG4gICAgICAgIGNvbm5lY3Rpb24uX2Rpc3BsYXlDbHVzdGVyMiA9IHNlYXJjaChjb25uZWN0aW9uLl9jbHVzdGVyMiwgcGFyZW50LCBwcmV2RXhwYW5kRGVwdGgsIGV4cGFuZERlcHRoLCBjb25uZWN0aW9uLl9wb2ludElkMiwgdHJ1ZSwgcHJldlpvb20sIHpvb20sIGV4cGFuZEZpZWxkLCBwcmVFeHBhbmRGaWVsZCwgW10pWzBdO1xuICAgICAgICBjb25uZWN0aW9ucy5wdXNoKGNvbm5lY3Rpb24pO1xuICAgIH1cbn0iLCJ2YXIgUG9pbnQgPSByZXF1aXJlKCcuL3BvaW50Jyk7XG52YXIgd211ID0gcmVxdWlyZSgnLi91dGlscy5qcycpO1xuXG52YXIgaWRzID0gMTtcblxudmFyIExpbmUgPSBmdW5jdGlvbihwb2ludHMsIGRhdGEpIHtcbiAgICBpZiAocG9pbnRzIGluc3RhbmNlb2YgTGluZSkge1xuICAgICAgICByZXR1cm4gcG9pbnRzO1xuICAgIH0gZWxzZSBpZiAodGhpcyBpbnN0YW5jZW9mIExpbmUpIHtcbiAgICAgICAgdGhpcy5faWQgPSBpZHMrKztcbiAgICAgICAgdGhpcy5fcG9pbnRzID0gY29weVBvaW50cyhwb2ludHMpO1xuICAgICAgICB0aGlzLl9kYXRhID0gZGF0YTtcbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gbmV3IExpbmUocG9pbnRzLCBkYXRhKTtcbiAgICB9XG59O1xuXG53bXUuZXh0ZW5kKExpbmUucHJvdG90eXBlLCB7XG4gICAgZ2V0UG9pbnRzOiBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3BvaW50cztcbiAgICB9LFxuICAgIGdldERhdGE6IGZ1bmN0aW9uKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fZGF0YTtcbiAgICB9XG59KTtcblxuZnVuY3Rpb24gY29weVBvaW50cyhwb2ludHMpIHtcbiAgICB2YXIgY29weSA9IFtdO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcG9pbnRzLmxlbmd0aDsgKytpKSB7XG4gICAgICAgIGNvcHkucHVzaChQb2ludChwb2ludHNbaV0pKTtcbiAgICB9XG4gICAgcmV0dXJuIGNvcHk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gTGluZTtcblxuIiwibW9kdWxlLmV4cG9ydHMgPSB7XG4gICAgbWF4Wm9vbTogMjAsXG5cbiAgICBjcmVhdGVNYXJrZXI6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBNaWNyb3NvZnQuTWFwcy5QdXNocGluKCk7XG4gICAgfSxcblxuICAgIGNyZWF0ZVBvbHlsaW5lOiBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBNaWNyb3NvZnQuTWFwcy5Qb2x5bGluZShbXSk7XG4gICAgfSxcblxuICAgIGNyZWF0ZUxhdExuZzogZnVuY3Rpb24obGF0LCBsbmcpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBNaWNyb3NvZnQuTWFwcy5Mb2NhdGlvbihsYXQsIGxuZyk7XG4gICAgfSxcblxuICAgIGdldExhdExuZzogZnVuY3Rpb24obGF0TG5nKSB7XG4gICAgICAgIHJldHVybiB7X2xhdDogbGF0TG5nLmxhdGl0dWRlLCBfbG5nOiBsYXRMbmcubG9uZ2l0dWRlfVxuICAgIH0sXG5cbiAgICBnZXRNYXJrZXJQb3NpdGlvbjogZnVuY3Rpb24obWFya2VyKSB7XG4gICAgICAgIHJldHVybiBtYXJrZXIuZ2V0TG9jYXRpb24oKTtcbiAgICB9LFxuXG4gICAgc2V0TWFya2VyUG9zaXRpb246IGZ1bmN0aW9uKG1hcmtlciwgbGF0TG5nKSB7XG4gICAgICAgIG1hcmtlci5zZXRMb2NhdGlvbihsYXRMbmcpO1xuICAgIH0sXG5cbiAgICBnZXRQb2x5bGluZVBhdGg6IGZ1bmN0aW9uKHBvbHlsaW5lKSB7XG4gICAgICAgIHJldHVybiBwb2x5bGluZS5nZXRMb2NhdGlvbnMoKS5zbGljZSgpO1xuICAgIH0sXG5cbiAgICBzZXRQb2x5bGluZVBhdGg6IGZ1bmN0aW9uKHBvbHlsaW5lLCBsYXRMbmdzKSB7XG4gICAgICAgIHBvbHlsaW5lLnNldExvY2F0aW9ucyhsYXRMbmdzKTtcbiAgICB9LFxuXG4gICAgc2hvd01hcmtlcjogZnVuY3Rpb24obWFwLCBtYXJrZXIpIHtcbiAgICAgICAgbWFwLmVudGl0aWVzLnB1c2gobWFya2VyKTtcbiAgICB9LFxuXG4gICAgc2hvd1BvbHlsaW5lOiBmdW5jdGlvbihtYXAsIHBvbHlsaW5lKSB7XG4gICAgICAgIG1hcC5lbnRpdGllcy5wdXNoKHBvbHlsaW5lKTtcbiAgICB9LFxuXG4gICAgaGlkZU1hcmtlcjogZnVuY3Rpb24obWFwLCBtYXJrZXIpIHtcbiAgICAgICAgbWFwLmVudGl0aWVzLnJlbW92ZShtYXJrZXIpO1xuICAgIH0sXG5cbiAgICBoaWRlUG9seWxpbmU6IGZ1bmN0aW9uKG1hcCwgcG9seWxpbmUpIHtcbiAgICAgICAgbWFwLmVudGl0aWVzLnJlbW92ZShwb2x5bGluZSk7XG4gICAgfSxcblxuICAgIGNyZWF0ZUJvdW5kczogZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiBuZXcgTWljcm9zb2Z0Lk1hcHMuTG9jYXRpb25SZWN0KCk7XG4gICAgfSxcblxuICAgIGV4dGVuZEJvdW5kczogZnVuY3Rpb24oYm91bmRzLCBsYXRMbmdPckJvdW5kcykge1xuICAgICAgICB2YXIgbG9jYXRpb25zID0gYm91bmRzLmNlbnRlciA/IFtib3VuZHMuZ2V0Tm9ydGh3ZXN0KCksIGJvdW5kcy5nZXRTb3V0aGVhc3QoKV0gOiBbXTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsYXRMbmdPckJvdW5kcy5sZW5ndGg7ICsraSkge1xuICAgICAgICAgICAgdmFyIGxhdExuZ09yQm91bmQgPSBsYXRMbmdPckJvdW5kc1tpXTtcbiAgICAgICAgICAgIGlmIChsYXRMbmdPckJvdW5kIGluc3RhbmNlb2YgTWljcm9zb2Z0Lk1hcHMuTG9jYXRpb25SZWN0ICYmIGxhdExuZ09yQm91bmQuY2VudGVyKSB7XG4gICAgICAgICAgICAgICAgbG9jYXRpb25zLnB1c2gobGF0TG5nT3JCb3VuZC5nZXROb3J0aHdlc3QoKSk7XG4gICAgICAgICAgICAgICAgbG9jYXRpb25zLnB1c2gobGF0TG5nT3JCb3VuZC5nZXRTb3V0aGVhc3QoKSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGxvY2F0aW9ucy5wdXNoKGxhdExuZ09yQm91bmQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBNaWNyb3NvZnQuTWFwcy5Mb2NhdGlvblJlY3QuZnJvbUxvY2F0aW9ucyhsb2NhdGlvbnMpXG4gICAgfSxcblxuICAgIGdldEJvdW5kc0NlbnRlcjogZnVuY3Rpb24oYm91bmRzKSB7XG4gICAgICAgIHJldHVybiBib3VuZHMuY2VudGVyO1xuICAgIH0sXG5cbiAgICBib3VuZHNJbnRlcnNlY3RzOiBmdW5jdGlvbihib3VuZHMxLCBib3VuZHMyKSB7XG4gICAgICAgIGlmICghYm91bmRzMS5jZW50ZXIgfHwgIWJvdW5kczIuY2VudGVyKSByZXR1cm4gZmFsc2U7XG4gICAgICAgIGVsc2UgcmV0dXJuIGJvdW5kczEuaW50ZXJzZWN0cyhib3VuZHMyKTtcbiAgICB9LFxuXG4gICAgZ2V0Qm91bmRzU3BhbjogZnVuY3Rpb24oYm91bmRzKSB7XG4gICAgICAgcmV0dXJuIHtfbGF0OiBib3VuZHMuaGVpZ2h0IHx8IDAsIF9sbmc6IGJvdW5kcy53aWR0aCB8fCAwfTtcbiAgICB9LFxuXG4gICAgb25NYXBCb3VuZHNDaGFuZ2U6IGZ1bmN0aW9uKG1hcCwgY2FsbGJhY2spIHtcbiAgICAgICAgTWljcm9zb2Z0Lk1hcHMuRXZlbnRzLmFkZEhhbmRsZXIobWFwLCAndmlld2NoYW5nZWVuZCcsIGNhbGxiYWNrKTtcbiAgICB9LFxuXG4gICAgb2ZmOiBmdW5jdGlvbih0b2tlbikge1xuICAgICAgICBNaWNyb3NvZnQuTWFwcy5FdmVudHMucmVtb3ZlSGFuZGxlcih0b2tlbik7XG4gICAgfSxcblxuICAgIGdldE1hcFpvb206IGZ1bmN0aW9uKG1hcCkge1xuICAgICAgICByZXR1cm4gbWFwLmdldFpvb20oKTtcbiAgICB9LFxuXG4gICAgZ2V0TWFwQm91bmRzOiBmdW5jdGlvbihtYXApIHtcbiAgICAgICAgcmV0dXJuIG1hcC5nZXRCb3VuZHMoKTtcbiAgICB9LFxuXG4gICAgb25NYXJrZXJDbGlja2VkOiBmdW5jdGlvbihtYXJrZXIsIGNhbGxiYWNrKSB7XG4gICAgICAgIHJldHVybiBNaWNyb3NvZnQuTWFwcy5FdmVudHMuYWRkSGFuZGxlcihtYXJrZXIsICdjbGljaycsIGNhbGxiYWNrKTtcbiAgICB9XG59O1xuIiwibW9kdWxlLmV4cG9ydHMgPSB7XG4gICAgbWF4Wm9vbTogMjAsXG5cbiAgICBjcmVhdGVNYXJrZXI6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBnb29nbGUubWFwcy5NYXJrZXIoKTtcbiAgICB9LFxuXG4gICAgY3JlYXRlUG9seWxpbmU6IGZ1bmN0aW9uKCkge1xuICAgICAgICByZXR1cm4gbmV3IGdvb2dsZS5tYXBzLlBvbHlsaW5lKCk7XG4gICAgfSxcblxuICAgIGNyZWF0ZUxhdExuZzogZnVuY3Rpb24obGF0LCBsbmcpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBnb29nbGUubWFwcy5MYXRMbmcobGF0LCBsbmcpO1xuICAgIH0sXG5cbiAgICBnZXRMYXRMbmc6IGZ1bmN0aW9uKGxhdExuZykge1xuICAgICAgICByZXR1cm4ge19sYXQ6IGxhdExuZy5sYXQoKSwgX2xuZzogbGF0TG5nLmxuZygpfVxuICAgIH0sXG5cbiAgICBnZXRNYXJrZXJQb3NpdGlvbjogZnVuY3Rpb24obWFya2VyKSB7XG4gICAgICAgIHJldHVybiBtYXJrZXIuZ2V0UG9zaXRpb24oKTtcbiAgICB9LFxuXG4gICAgc2V0TWFya2VyUG9zaXRpb246IGZ1bmN0aW9uKG1hcmtlciwgbGF0TG5nKSB7XG4gICAgICAgIG1hcmtlci5zZXRQb3NpdGlvbihsYXRMbmcpO1xuICAgIH0sXG5cbiAgICBnZXRQb2x5bGluZVBhdGg6IGZ1bmN0aW9uKHBvbHlsaW5lKSB7XG4gICAgICAgIHJldHVybiBwb2x5bGluZS5nZXRQYXRoKCkuZ2V0QXJyYXkoKS5zbGljZSgpO1xuICAgIH0sXG5cbiAgICBzZXRQb2x5bGluZVBhdGg6IGZ1bmN0aW9uKHBvbHlsaW5lLCBsYXRMbmdzKSB7XG4gICAgICAgIHBvbHlsaW5lLnNldFBhdGgobmV3IGdvb2dsZS5tYXBzLk1WQ0FycmF5KGxhdExuZ3MpKTtcbiAgICB9LFxuXG4gICAgc2hvd01hcmtlcjogZnVuY3Rpb24obWFwLCBtYXJrZXIpIHtcbiAgICAgICAgbWFya2VyLnNldE1hcChtYXApO1xuICAgIH0sXG5cbiAgICBzaG93UG9seWxpbmU6IGZ1bmN0aW9uKG1hcCwgcG9seWxpbmUpIHtcbiAgICAgICAgcG9seWxpbmUuc2V0TWFwKG1hcCk7XG4gICAgfSxcblxuICAgIGhpZGVNYXJrZXI6IGZ1bmN0aW9uKG1hcCwgbWFya2VyKSB7XG4gICAgICAgIG1hcmtlci5zZXRNYXAobnVsbCk7XG4gICAgfSxcblxuICAgIGhpZGVQb2x5bGluZTogZnVuY3Rpb24obWFwLCBwb2x5bGluZSkge1xuICAgICAgICBwb2x5bGluZS5zZXRNYXAobnVsbCk7XG4gICAgfSxcblxuICAgIGNyZWF0ZUJvdW5kczogZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiBuZXcgZ29vZ2xlLm1hcHMuTGF0TG5nQm91bmRzKClcbiAgICB9LFxuXG4gICAgZXh0ZW5kQm91bmRzOiBmdW5jdGlvbihib3VuZHMsIGxhdExuZ09yQm91bmRzKSB7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGF0TG5nT3JCb3VuZHMubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgICAgIHZhciBsYXRMbmdPckJvdW5kID0gbGF0TG5nT3JCb3VuZHNbaV07XG4gICAgICAgICAgICBpZiAobGF0TG5nT3JCb3VuZCBpbnN0YW5jZW9mIGdvb2dsZS5tYXBzLkxhdExuZykge1xuICAgICAgICAgICAgICAgIGJvdW5kcy5leHRlbmQobGF0TG5nT3JCb3VuZCk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGxhdExuZ09yQm91bmQgaW5zdGFuY2VvZiBnb29nbGUubWFwcy5MYXRMbmdCb3VuZHMpIHtcbiAgICAgICAgICAgICAgICBib3VuZHMudW5pb24obGF0TG5nT3JCb3VuZCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGJvdW5kcztcbiAgICB9LFxuXG4gICAgZ2V0Qm91bmRzQ2VudGVyOiBmdW5jdGlvbihib3VuZHMpIHtcbiAgICAgICAgcmV0dXJuIGJvdW5kcy5nZXRDZW50ZXIoKTtcbiAgICB9LFxuXG4gICAgYm91bmRzSW50ZXJzZWN0czogZnVuY3Rpb24oYm91bmRzMSwgYm91bmRzMikge1xuICAgICAgICByZXR1cm4gYm91bmRzMS5pbnRlcnNlY3RzKGJvdW5kczIpO1xuICAgIH0sXG5cbiAgICBnZXRCb3VuZHNTcGFuOiBmdW5jdGlvbihib3VuZHMpIHtcbiAgICAgICAgdmFyIHNwYW4gPSBib3VuZHMudG9TcGFuKCk7XG4gICAgICAgIHJldHVybiB7X2xhdDogc3Bhbi5sYXQoKSwgX2xuZzogc3Bhbi5sbmcoKX07XG4gICAgfSxcblxuICAgIG9uTWFwQm91bmRzQ2hhbmdlOiBmdW5jdGlvbihtYXAsIGNhbGxiYWNrKSB7XG4gICAgICAgIHJldHVybiBnb29nbGUubWFwcy5ldmVudC5hZGRMaXN0ZW5lcihtYXAsICdib3VuZHNfY2hhbmdlZCcsIGNhbGxiYWNrKTtcbiAgICB9LFxuXG4gICAgb2ZmOiBmdW5jdGlvbih0b2tlbikge1xuICAgICAgICBnb29nbGUubWFwcy5ldmVudC5yZW1vdmVMaXN0ZW5lcih0b2tlbik7XG4gICAgfSxcblxuICAgIGdldE1hcFpvb206IGZ1bmN0aW9uKG1hcCkge1xuICAgICAgICByZXR1cm4gbWFwLmdldFpvb20oKTtcbiAgICB9LFxuXG4gICAgZ2V0TWFwQm91bmRzOiBmdW5jdGlvbihtYXApIHtcbiAgICAgICAgcmV0dXJuIG1hcC5nZXRCb3VuZHMoKTtcbiAgICB9LFxuXG4gICAgb25NYXJrZXJDbGlja2VkOiBmdW5jdGlvbihtYXJrZXIsIGNhbGxiYWNrKSB7XG4gICAgICAgIHJldHVybiBnb29nbGUubWFwcy5ldmVudC5hZGRMaXN0ZW5lcihtYXJrZXIsICdjbGljaycsIGNhbGxiYWNrKTtcbiAgICB9XG59OyIsIm1vZHVsZS5leHBvcnRzID0ge1xuICAgIG1heFpvb206IDIwLFxuXG4gICAgY3JlYXRlTWFya2VyOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBMLm1hcmtlcigpO1xuICAgIH0sXG5cbiAgICBjcmVhdGVQb2x5bGluZTogZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiBMLnBvbHlsaW5lKFtdKTtcbiAgICB9LFxuXG4gICAgY3JlYXRlTGF0TG5nOiBmdW5jdGlvbihsYXQsIGxuZykge1xuICAgICAgICByZXR1cm4gTC5sYXRMbmcobGF0LCBsbmcpO1xuICAgIH0sXG5cbiAgICBnZXRMYXRMbmc6IGZ1bmN0aW9uKGxhdExuZykge1xuICAgICAgICByZXR1cm4ge19sYXQ6IGxhdExuZy5sYXQsIF9sbmc6IGxhdExuZy5sbmd9XG4gICAgfSxcblxuICAgIGdldE1hcmtlclBvc2l0aW9uOiBmdW5jdGlvbihtYXJrZXIpIHtcbiAgICAgICAgcmV0dXJuIG1hcmtlci5nZXRMYXRMbmcoKTtcbiAgICB9LFxuXG4gICAgc2V0TWFya2VyUG9zaXRpb246IGZ1bmN0aW9uKG1hcmtlciwgbGF0TG5nKSB7XG4gICAgICAgIG1hcmtlci5zZXRMYXRMbmcobGF0TG5nKTtcbiAgICB9LFxuXG4gICAgZ2V0UG9seWxpbmVQYXRoOiBmdW5jdGlvbihwb2x5bGluZSkge1xuICAgICAgICByZXR1cm4gcG9seWxpbmUuZ2V0TGF0TG5ncygpLnNsaWNlKCk7XG4gICAgfSxcblxuICAgIHNldFBvbHlsaW5lUGF0aDogZnVuY3Rpb24ocG9seWxpbmUsIGxhdExuZ3MpIHtcbiAgICAgICAgcG9seWxpbmUuc2V0TGF0TG5ncyhsYXRMbmdzKTtcbiAgICB9LFxuXG4gICAgc2hvd01hcmtlcjogZnVuY3Rpb24obWFwLCBtYXJrZXIpIHtcbiAgICAgICAgbWFya2VyLmFkZFRvKG1hcCk7XG4gICAgfSxcblxuICAgIHNob3dQb2x5bGluZTogZnVuY3Rpb24obWFwLCBwb2x5bGluZSkge1xuICAgICAgICBwb2x5bGluZS5hZGRUbyhtYXApO1xuICAgIH0sXG5cbiAgICBoaWRlTWFya2VyOiBmdW5jdGlvbihtYXAsIG1hcmtlcikge1xuICAgICAgICBtYXAucmVtb3ZlTGF5ZXIobWFya2VyKTtcbiAgICB9LFxuXG4gICAgaGlkZVBvbHlsaW5lOiBmdW5jdGlvbihtYXAsIHBvbHlsaW5lKSB7XG4gICAgICAgIG1hcC5yZW1vdmVMYXllcihwb2x5bGluZSk7XG4gICAgfSxcblxuICAgIGNyZWF0ZUJvdW5kczogZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiBMLmxhdExuZ0JvdW5kcyhbXSk7XG4gICAgfSxcblxuICAgIGV4dGVuZEJvdW5kczogZnVuY3Rpb24oYm91bmRzLCBsYXRMbmdPckJvdW5kcykge1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxhdExuZ09yQm91bmRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBib3VuZHMuZXh0ZW5kKGxhdExuZ09yQm91bmRzW2ldKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gYm91bmRzO1xuICAgIH0sXG5cbiAgICBnZXRCb3VuZHNDZW50ZXI6IGZ1bmN0aW9uKGJvdW5kcykge1xuICAgICAgICByZXR1cm4gYm91bmRzLmdldENlbnRlcigpO1xuICAgIH0sXG5cbiAgICBib3VuZHNJbnRlcnNlY3RzOiBmdW5jdGlvbihib3VuZHMxLCBib3VuZHMyKSB7XG4gICAgICAgIGlmICghYm91bmRzMS5nZXROb3J0aEVhc3QoKSB8fCAhYm91bmRzMi5nZXROb3J0aEVhc3QoKSkgcmV0dXJuIGZhbHNlO1xuICAgICAgICBlbHNlIHJldHVybiBib3VuZHMxLmludGVyc2VjdHMoYm91bmRzMik7XG4gICAgfSxcblxuICAgIGdldEJvdW5kc1NwYW46IGZ1bmN0aW9uKGJvdW5kcykge1xuICAgICAgICB2YXIgbncgPSBib3VuZHMuZ2V0Tm9ydGhXZXN0KCkgfHwge2xhdDogMCwgbG5nOiAwfTtcbiAgICAgICAgdmFyIHNlID0gYm91bmRzLmdldFNvdXRoRWFzdCgpIHx8IHtsYXQ6IDAsIGxuZzogMH07XG4gICAgICAgIHJldHVybiB7X2xhdDogbncubGF0IC0gc2UubGF0LCBfbG5nOiBzZS5sbmcgLSBudy5sbmd9O1xuICAgIH0sXG5cbiAgICBvbk1hcEJvdW5kc0NoYW5nZTogZnVuY3Rpb24obWFwLCBjYWxsYmFjaykge1xuICAgICAgICBtYXAub24oJ21vdmUnLCBjYWxsYmFjayk7XG4gICAgICAgIHJldHVybiB7dGhpbmc6IG1hcCwgZXZlbnQ6ICdtb3ZlJywgY2FsbGJhY2s6IGNhbGxiYWNrfTtcbiAgICB9LFxuXG4gICAgb2ZmOiBmdW5jdGlvbih0b2tlbikge1xuICAgICAgICB0b2tlbi50aGluZy5vZmYodG9rZW4uZXZlbnQsIHRva2VuLmNhbGxiYWNrKTtcbiAgICB9LFxuXG4gICAgZ2V0TWFwWm9vbTogZnVuY3Rpb24obWFwKSB7XG4gICAgICAgIHJldHVybiBtYXAuZ2V0Wm9vbSgpO1xuICAgIH0sXG5cbiAgICBnZXRNYXBCb3VuZHM6IGZ1bmN0aW9uKG1hcCkge1xuICAgICAgICByZXR1cm4gbWFwLmdldEJvdW5kcygpO1xuICAgIH0sXG5cbiAgICBvbk1hcmtlckNsaWNrZWQ6IGZ1bmN0aW9uKG1hcmtlciwgY2FsbGJhY2spIHtcbiAgICAgICAgbWFya2VyLm9uKCdjbGljaycsIGNhbGxiYWNrKTtcbiAgICAgICAgcmV0dXJuIHt0aGluZzogbWFya2VyLCBldmVudDogJ2NsaWNrJywgY2FsbGJhY2s6IGNhbGxiYWNrfTtcbiAgICB9XG59O1xuIiwidmFyIENsdXN0ZXIgPSByZXF1aXJlKCcuL2NsdXN0ZXIuanMnKTtcbnJlcXVpcmUoJy4vY2x1c3Rlcl9zZWFyY2guanMnKTtcbnZhciB3bXUgPSByZXF1aXJlKCcuL3V0aWxzLmpzJyk7XG52YXIgUG9pbnQgPSByZXF1aXJlKCcuL3BvaW50LmpzJyk7XG52YXIgTGluZSA9IHJlcXVpcmUoJy4vbGluZS5qcycpO1xuXG52YXIgTWFya2VycyA9IGZ1bmN0aW9uKG1hcCwgb3B0aW9ucykge1xuICAgIHZhciBzZWxmID0gdGhpcztcblxuICAgIHRoaXMuX3Zpc2libGVDbHVzdGVycyA9IFtdO1xuICAgIHRoaXMuX3Zpc2libGVDb25uZWN0aW9ucyA9IFtdO1xuICAgIHRoaXMuX2tlZXBLZXkgPSAwO1xuICAgIHRoaXMuX21hcCA9IG1hcDtcbiAgICB0aGlzLl96b29tID0gdGhpcy5fcHJldlpvb20gPSB0aGlzLl9tYXAuZ2V0Wm9vbSgpO1xuICAgIHRoaXMuX2dlbyA9IG9wdGlvbnMubWFwQ29ubmVjdG9yIHx8ICh3bS5kZWZhdWx0TWFwQ29ubmVjdG9yICYmIHdtLm1hcENvbm5lY3RvcnMgJiYgd20ubWFwQ29ubmVjdG9yc1t3bS5kZWZhdWx0TWFwQ29ubmVjdG9yXSk7XG4gICAgdGhpcy5fb3B0aW9ucyA9IHdtdS5leHRlbmQoe1xuICAgICAgICBhbmltYXRpb25TdGVwczogMzAsXG4gICAgICAgIGFuaW1hdGlvbkludGVydmFsOiAxNixcbiAgICAgICAgY3JlYXRlTWFya2VyOiB0aGlzLl9nZW8uY3JlYXRlTWFya2VyLFxuICAgICAgICBjcmVhdGVQb2x5bGluZTogdGhpcy5fZ2VvLmNyZWF0ZVBvbHlsaW5lXG4gICAgfSwgb3B0aW9ucyk7XG4gICAgdGhpcy5fY2x1c3RlclJvb3QgPSBuZXcgQ2x1c3RlcihudWxsLCAwLCB0aGlzLl9nZW8ubWF4Wm9vbSsxLCB0aGlzLl9nZW8sIHsgem9vbUJveGVzOiBnZXRab29tQm94ZXModGhpcy5fZ2VvKSB9ICk7XG4gICAgdGhpcy5fbGlzdGVuZXJzID0gW107XG5cbiAgICByZXNldFZpZXdwb3J0KHRoaXMpO1xuXG4gICAgdGhpcy5fYm91bmRzTGlzdGVuZXIgPSBzZWxmLl9nZW8ub25NYXBCb3VuZHNDaGFuZ2UobWFwLCBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIHpvb20gPSBzZWxmLl9nZW8uZ2V0TWFwWm9vbShtYXApO1xuICAgICAgICBpZiAoem9vbSA8IDAgfHwgem9vbSA+IHNlbGYuX2dlby5tYXhab29tKSByZXR1cm47XG4gICAgICAgIHNlbGYuX3ByZXZab29tID0gc2VsZi5fem9vbTtcbiAgICAgICAgc2VsZi5fem9vbSA9IHpvb207XG5cbiAgICAgICAgcmVzZXRWaWV3cG9ydChzZWxmKTtcblxuICAgICAgICBzZWxmLl9wcmV2Wm9vbSA9IHpvb207XG4gICAgICAgIHNlbGYuX3ByZXZCb3VuZHMgPSBzZWxmLl9nZW8uZ2V0TWFwQm91bmRzKG1hcCk7XG4gICAgfSk7XG59O1xuXG53bXUuZXh0ZW5kKE1hcmtlcnMucHJvdG90eXBlLCB7XG5cbiAgICBvbjogZnVuY3Rpb24oZXZlbnROYW1lLCBjYWxsYmFjaykge1xuICAgICAgICB0aGlzLl9saXN0ZW5lcnMucHVzaCh7ZXZlbnQ6IGV2ZW50TmFtZSwgY2FsbGJhY2s6IGNhbGxiYWNrfSk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH0sXG5cbiAgICBvZmY6IGZ1bmN0aW9uKGV2ZW50TmFtZSwgY2FsbGJhY2spIHtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLl9saXN0ZW5lcnMubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgICAgIHZhciBsaXN0ZW5lciA9IHRoaXMuX2xpc3RlbmVyc1tpXTtcbiAgICAgICAgICAgIGlmIChsaXN0ZW5lci5ldmVudCA9PSBldmVudE5hbWUgJiYgKCFjYWxsYmFjayB8fCBjYWxsYmFjayA9PSBsaXN0ZW5lci5jYWxsYmFjaykpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9saXN0ZW5lcnMuc3BsaWNlKGktLSwgMSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfSxcblxuICAgIGFkZExpbmU6IGZ1bmN0aW9uKGxpbmUsIG9wdGlvbnMpIHtcbiAgICAgICAgbGluZSA9IExpbmUobGluZSk7XG4gICAgICAgIGlmIChvcHRpb25zICYmIG9wdGlvbnMuYWRkUG9pbnRzID09PSB0cnVlKSB7XG4gICAgICAgICAgICB0aGlzLl9jbHVzdGVyUm9vdC5hZGRQb2ludHMobGluZS5fcG9pbnRzKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLl9jbHVzdGVyUm9vdC5hZGRMaW5lKGxpbmUpO1xuICAgICAgICByZXNldFZpZXdwb3J0KHRoaXMpO1xuICAgICAgICByZXR1cm4gbGluZTtcbiAgICB9LFxuXG4gICAgcmVtb3ZlTGluZTogZnVuY3Rpb24obGluZSwgb3B0aW9ucykge1xuICAgICAgICB0aGlzLl9jbHVzdGVyUm9vdC5yZW1vdmVMaW5lKGxpbmUpO1xuXG4gICAgICAgIGlmIChvcHRpb25zICYmIG9wdGlvbnMucmVtb3ZlUG9pbnRzID09PSB0cnVlKSB7XG4gICAgICAgICAgICB0aGlzLl9jbHVzdGVyUm9vdC5yZW1vdmVQb2ludHMobGluZS5fcG9pbnRzKTtcbiAgICAgICAgfVxuICAgICAgICByZXNldFZpZXdwb3J0KHRoaXMpO1xuICAgIH0sXG5cbiAgICBhZGRQb2ludDogZnVuY3Rpb24ocG9pbnQpIHtcbiAgICAgICAgcG9pbnQgPSBQb2ludChwb2ludCk7XG4gICAgICAgIHRoaXMuX2NsdXN0ZXJSb290LmFkZFBvaW50cyhbcG9pbnRdKTtcbiAgICAgICAgcmVzZXRWaWV3cG9ydCh0aGlzKTtcbiAgICAgICAgcmV0dXJuIHBvaW50O1xuICAgIH0sXG5cbiAgICByZW1vdmVQb2ludDogZnVuY3Rpb24ocG9pbnQpIHtcbiAgICAgICAgdGhpcy5fY2x1c3RlclJvb3QucmVtb3ZlUG9pbnRzKFtwb2ludF0pO1xuICAgICAgICByZXNldFZpZXdwb3J0KHRoaXMpO1xuICAgIH0sXG5cbiAgICBhZGRQb2ludHM6IGZ1bmN0aW9uKHBvaW50cykge1xuICAgICAgICB2YXIgd21Qb2ludHMgPSBbXTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBwb2ludHMubGVuZ3RoOyArK2kpIHdtUG9pbnRzLnB1c2goUG9pbnQocG9pbnRzW2ldKSk7XG4gICAgICAgIHRoaXMuX2NsdXN0ZXJSb290LmFkZFBvaW50KHdtUG9pbnRzKTtcbiAgICAgICAgcmVzZXRWaWV3cG9ydCh0aGlzKTtcbiAgICAgICAgcmV0dXJuIHdtUG9pbnRzO1xuICAgIH0sXG5cbiAgICByZW1vdmVQb2ludHM6IGZ1bmN0aW9uKHBvaW50cykge1xuICAgICAgICB0aGlzLl9jbHVzdGVyUm9vdC5yZW1vdmVQb2ludHMocG9pbnRzKTtcbiAgICAgICAgcmVzZXRWaWV3cG9ydCh0aGlzKTtcbiAgICB9LFxuXG4gICAgZGVzdHJveTogZnVuY3Rpb24oKSB7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5fdmlzaWJsZUNsdXN0ZXJzLmxlbmd0aDsgKytpKSB7XG4gICAgICAgICAgICBoaWRlQ2x1c3Rlcih0aGlzLCB0aGlzLl92aXNpYmxlQ2x1c3RlcnNbaV0sIHRydWUpO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9yIChpID0gMDsgaSA8IHRoaXMuX3Zpc2libGVDb25uZWN0aW9ucy5sZW5ndGg7ICsraSkge1xuICAgICAgICAgICAgaGlkZUNvbm5lY3Rpb24odGhpcywgdGhpcy5fdmlzaWJsZUNvbm5lY3Rpb25zW2ldLCB0cnVlKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLl9ib3VuZHNMaXN0ZW5lcikge1xuICAgICAgICAgICAgdGhpcy5fZ2VvLm9mZk1hcHNCb3VuZENoYW5nZSh0aGlzLl9ib3VuZHNMaXN0ZW5lcik7XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgc2V0Q2x1c3RlclN0YXRlOiBmdW5jdGlvbihjbHVzdGVyLCBzdGF0ZSkge1xuICAgICAgICBpZiAoc3RhdGUgPT0gJ25vcm1hbCcpIHtcbiAgICAgICAgICAgIHdoaWxlIChjbHVzdGVyICYmIGNsdXN0ZXIuX2V4cGFuZERlcHRoID09IDApIGNsdXN0ZXIgPSBjbHVzdGVyLl9wYXJlbnQ7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIWNsdXN0ZXIpIHJldHVybjtcblxuICAgICAgICB2YXIgb2xkRXhwYW5kRGVwdGggPSBjbHVzdGVyLl9leHBhbmREZXB0aCxcbiAgICAgICAgICAgIGNvbGxhcHNlO1xuXG4gICAgICAgIGNsdXN0ZXIuX29sZEV4cGFuZERlcHRoID0gb2xkRXhwYW5kRGVwdGg7XG5cbiAgICAgICAgaWYgKHN0YXRlID09ICdub3JtYWwnKSB7XG4gICAgICAgICAgICBjbHVzdGVyLl9leHBhbmREZXB0aCA9IDA7XG4gICAgICAgICAgICBpZiAob2xkRXhwYW5kRGVwdGggPiAwKSB7XG4gICAgICAgICAgICAgICAgY29sbGFwc2UgPSB0cnVlO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChvbGRFeHBhbmREZXB0aCA8IDApIHtcbiAgICAgICAgICAgICAgICBjb2xsYXBzZSA9IGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKHN0YXRlID09ICdjb2xsYXBzZWQnKSB7XG4gICAgICAgICAgICBjbHVzdGVyLl9leHBhbmREZXB0aCA9IC0xO1xuICAgICAgICAgICAgY29sbGFwc2UgPSB0cnVlO1xuICAgICAgICB9IGVsc2UgaWYgKHN0YXRlID09ICdleHBhbmRlZCcpIHtcbiAgICAgICAgICAgIGNsdXN0ZXIuX2V4cGFuZERlcHRoID0gMTtcbiAgICAgICAgICAgIGNvbGxhcHNlID0gZmFsc2U7XG4gICAgICAgIH1cblxuICAgICAgICByZXNldFZpZXdwb3J0KHRoaXMsIGNvbGxhcHNlKTtcblxuICAgICAgICBkZWxldGUgY2x1c3Rlci5fb2xkRXhwYW5kRGVwdGg7XG4gICAgfVxufSk7XG5cbmZ1bmN0aW9uIHRyaWdnZXIoc2VsZiwgZXZlbnQsIGRhdGEpIHtcbiAgICB2YXIgcmUgPSBuZXcgUmVnRXhwKCdeJyArIGV2ZW50ICsgJyhcXFxcLi4qKT8kJyk7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBzZWxmLl9saXN0ZW5lcnMubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgdmFyIGxpc3RlbmVyID0gc2VsZi5fbGlzdGVuZXJzW2ldO1xuICAgICAgICBpZiAobGlzdGVuZXIuZXZlbnQubWF0Y2gocmUpKSB7XG4gICAgICAgICAgICBsaXN0ZW5lci5jYWxsYmFjayh3bXUuZXh0ZW5kKHttYXJrZXJzOiBzZWxmfSwgZGF0YSkpO1xuICAgICAgICB9XG4gICAgfVxufVxuXG5mdW5jdGlvbiBzaG93Q2x1c3RlcihzZWxmLCBjbHVzdGVyLCBjZW50ZXIpIHtcbiAgICBjbHVzdGVyLl9rZWVwS2V5ID0gc2VsZi5fa2VlcEtleTtcbiAgICBzZWxmLl92aXNpYmxlQ2x1c3RlcnMucHVzaChjbHVzdGVyKTtcblxuICAgIGlmICghY2x1c3Rlci5fbWFya2VyKSB7XG4gICAgICAgIGNsdXN0ZXIuX21hcmtlciA9IHNlbGYuX29wdGlvbnMuY3JlYXRlTWFya2VyKGNsdXN0ZXIpO1xuICAgICAgICBjbHVzdGVyLl9jbGlja0xpc3RlbmVyID0gc2VsZi5fZ2VvLm9uTWFya2VyQ2xpY2tlZChjbHVzdGVyLl9tYXJrZXIsIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgdHJpZ2dlcihzZWxmLCAnY2x1c3RlckNsaWNrZWQnLCB7Y2x1c3RlcjogY2x1c3Rlcn0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBjbHVzdGVyLl9kTGF0ID0gY2x1c3Rlci5fZExuZyA9IG51bGw7XG5cbiAgICBzZWxmLl9nZW8uc2V0TWFya2VyUG9zaXRpb24oY2x1c3Rlci5fbWFya2VyLCBjZW50ZXIgfHwgY2x1c3Rlci5nZXREaXNwbGF5Q2VudGVyKCkpO1xuXG4gICAgaWYgKCFjbHVzdGVyLl92aXNpYmxlKSB7XG4gICAgICAgIHNlbGYuX2dlby5zaG93TWFya2VyKHNlbGYuX21hcCwgY2x1c3Rlci5fbWFya2VyKTtcbiAgICAgICAgY2x1c3Rlci5fdmlzaWJsZSA9IHRydWU7XG4gICAgICAgIHRyaWdnZXIoc2VsZiwgJ2NsdXN0ZXJTaG93bicsIHtjbHVzdGVyOiBjbHVzdGVyfSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGNsdXN0ZXIuX21hcmtlcjtcbn1cblxuZnVuY3Rpb24gc2hvd0Nvbm5lY3Rpb24oc2VsZiwgY29ubmVjdGlvbikge1xuICAgIGNvbm5lY3Rpb24uX2tlZXBLZXkgPSBzZWxmLl9rZWVwS2V5O1xuICAgIHNlbGYuX3Zpc2libGVDb25uZWN0aW9ucy5wdXNoKGNvbm5lY3Rpb24pO1xuXG4gICAgY29ubmVjdGlvbi5fcG9seWxpbmUgPSBjb25uZWN0aW9uLl9wb2x5bGluZSB8fCBzZWxmLl9vcHRpb25zLmNyZWF0ZVBvbHlsaW5lKGNvbm5lY3Rpb24uX2xpbmUpO1xuXG4gICAgc2VsZi5fZ2VvLnNldFBvbHlsaW5lUGF0aChjb25uZWN0aW9uLl9wb2x5bGluZSwgW1xuICAgICAgICBjb25uZWN0aW9uLl9kaXNwbGF5Q2x1c3RlcjEuY2x1c3Rlci5fbWFya2VyID9cbiAgICAgICAgICAgIHNlbGYuX2dlby5nZXRNYXJrZXJQb3NpdGlvbihjb25uZWN0aW9uLl9kaXNwbGF5Q2x1c3RlcjEuY2x1c3Rlci5fbWFya2VyKSA6XG4gICAgICAgICAgICBjb25uZWN0aW9uLl9kaXNwbGF5Q2x1c3RlcjEuY2x1c3Rlci5nZXREaXNwbGF5Q2VudGVyKCksXG4gICAgICAgIGNvbm5lY3Rpb24uX2Rpc3BsYXlDbHVzdGVyMi5jbHVzdGVyLl9tYXJrZXIgP1xuICAgICAgICAgICAgc2VsZi5fZ2VvLmdldE1hcmtlclBvc2l0aW9uKGNvbm5lY3Rpb24uX2Rpc3BsYXlDbHVzdGVyMi5jbHVzdGVyLl9tYXJrZXIpIDpcbiAgICAgICAgICAgIGNvbm5lY3Rpb24uX2Rpc3BsYXlDbHVzdGVyMi5jbHVzdGVyLmdldERpc3BsYXlDZW50ZXIoKVxuICAgIF0pO1xuXG4gICAgaWYgKCFjb25uZWN0aW9uLl92aXNpYmxlKSB7XG4gICAgICAgIHNlbGYuX2dlby5zaG93UG9seWxpbmUoc2VsZi5fbWFwLCBjb25uZWN0aW9uLl9wb2x5bGluZSk7XG4gICAgICAgIGNvbm5lY3Rpb24uX3Zpc2libGUgPSB0cnVlO1xuICAgICAgICB0cmlnZ2VyKHNlbGYsICdsaW5lU2hvd24nLCB7bGluZTogY29ubmVjdGlvbi5fbGluZX0pO1xuICAgIH1cblxuICAgIHJldHVybiBjb25uZWN0aW9uLl9wb2x5bGluZTtcbn1cblxuZnVuY3Rpb24gaGlkZUNsdXN0ZXIoc2VsZiwgY2x1c3RlciwgZGVzdHJveSkge1xuICAgIGlmIChjbHVzdGVyLl9tYXJrZXIpIHtcbiAgICAgICAgc2VsZi5fZ2VvLmhpZGVNYXJrZXIoc2VsZi5fbWFwLCBjbHVzdGVyLl9tYXJrZXIpO1xuICAgICAgICBjbHVzdGVyLl92aXNpYmxlID0gZmFsc2U7XG4gICAgICAgIHRyaWdnZXIoc2VsZiwgJ2NsdXN0ZXJIaWRkZW4nLCB7Y2x1c3RlcjogY2x1c3Rlcn0pO1xuICAgICAgICBpZiAoZGVzdHJveSkge1xuICAgICAgICAgICAgc2VsZi5fZ2VvLm9mZihjbHVzdGVyLl9jbGlja0xpc3RlbmVyKTtcbiAgICAgICAgICAgIGRlbGV0ZSBjbHVzdGVyLl9tYXJrZXI7XG4gICAgICAgIH1cbiAgICB9XG59XG5cbmZ1bmN0aW9uIGhpZGVDb25uZWN0aW9uKHNlbGYsIGNvbm5lY3Rpb24sIGRlc3Ryb3kpIHtcbiAgICBpZiAoY29ubmVjdGlvbi5fcG9seWxpbmUpIHtcbiAgICAgICAgc2VsZi5fZ2VvLmhpZGVQb2x5bGluZShzZWxmLl9tYXAsIGNvbm5lY3Rpb24uX3BvbHlsaW5lKTtcbiAgICAgICAgY29ubmVjdGlvbi5fdmlzaWJsZSA9IGZhbHNlO1xuICAgICAgICB0cmlnZ2VyKHNlbGYsICdsaW5lSGlkZGVuJywge2xpbmU6IGNvbm5lY3Rpb24uX2xpbmV9KTtcbiAgICAgICAgaWYgKGRlc3Ryb3kpIGRlbGV0ZSBjb25uZWN0aW9uLl9wb2x5bGluZTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIG1vdmUoc2VsZikge1xuICAgIHZhciBpLFxuICAgICAgICB2aXNpYmxlID0gc2VsZi5fY2x1c3RlclJvb3QuZ2V0Q29udGFpbmVkQ2x1c3RlcnNBbmRDb25uZWN0aW9ucyhnZXRTZWFyY2hCb3VuZHMoc2VsZiksIHNlbGYuX3pvb20sIHNlbGYuX3ByZXZab29tLCAnX2V4cGFuZERlcHRoJywgJ19vbGRFeHBhbmREZXB0aCcpO1xuXG4gICAgZm9yIChpID0gMDsgaSA8IHZpc2libGUuY2x1c3RlcnMubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgc2hvd0NsdXN0ZXIoc2VsZiwgdmlzaWJsZS5jbHVzdGVyc1tpXS5jbHVzdGVyKTtcbiAgICB9XG4gICAgZm9yIChpID0gMDsgaSA8IHZpc2libGUuY29ubmVjdGlvbnMubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgc2hvd0Nvbm5lY3Rpb24oc2VsZiwgdmlzaWJsZS5jb25uZWN0aW9uc1tpXSk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiB6b29tSW4oc2VsZikge1xuICAgIHZhciB2aXNpYmxlID0gc2VsZi5fY2x1c3RlclJvb3QuZ2V0Q29udGFpbmVkQ2x1c3RlcnNBbmRDb25uZWN0aW9ucyhnZXRTZWFyY2hCb3VuZHMoc2VsZiksIHNlbGYuX3pvb20sIHNlbGYuX3ByZXZab29tLCAnX2V4cGFuZERlcHRoJywgJ19vbGRFeHBhbmREZXB0aCcpO1xuICAgIHByZXBhcmVBbmltYXRpb25zKHNlbGYsIHZpc2libGUsIGZhbHNlKTtcbn1cblxuZnVuY3Rpb24gem9vbU91dChzZWxmKSB7XG4gICAgdmFyIHZpc2libGUgPSBzZWxmLl9jbHVzdGVyUm9vdC5nZXRDb250YWluZWRDbHVzdGVyc0FuZENvbm5lY3Rpb25zKGdldFNlYXJjaEJvdW5kcyhzZWxmKSwgc2VsZi5fcHJldlpvb20sIHNlbGYuX3pvb20sICdfb2xkRXhwYW5kRGVwdGgnLCAnX2V4cGFuZERlcHRoJyk7XG4gICAgcHJlcGFyZUFuaW1hdGlvbnMoc2VsZiwgdmlzaWJsZSwgdHJ1ZSk7XG59XG5cbmZ1bmN0aW9uIHByZXBhcmVBbmltYXRpb25zKHNlbGYsIHZpc2libGUsIGNvbGxhcHNlKSB7XG4gICAgdmFyIGk7XG5cbiAgICBmb3IgKGkgPSAwOyBpIDwgdmlzaWJsZS5jbHVzdGVycy5sZW5ndGg7ICsraSkge1xuICAgICAgICBhZGRDaGlsZEFuaW1hdGlvbihzZWxmLCB2aXNpYmxlLmNsdXN0ZXJzW2ldLCBjb2xsYXBzZSk7XG4gICAgfVxuXG4gICAgZm9yIChpID0gMDsgaSA8IHZpc2libGUuY29ubmVjdGlvbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdmFyIGNvbm5lY3Rpb24gPSB2aXNpYmxlLmNvbm5lY3Rpb25zW2ldO1xuICAgICAgICBhZGRDaGlsZEFuaW1hdGlvbihzZWxmLCBjb25uZWN0aW9uLl9kaXNwbGF5Q2x1c3RlcjEsIGNvbGxhcHNlKTtcbiAgICAgICAgYWRkQ2hpbGRBbmltYXRpb24oc2VsZiwgY29ubmVjdGlvbi5fZGlzcGxheUNsdXN0ZXIyLCBjb2xsYXBzZSk7XG4gICAgICAgIHNob3dDb25uZWN0aW9uKHNlbGYsIGNvbm5lY3Rpb24pO1xuICAgIH1cblxuICAgIGFuaW1hdGUoc2VsZik7XG59XG5cbmZ1bmN0aW9uIGFkZENoaWxkQW5pbWF0aW9uKHNlbGYsIHBhcmVudENoaWxkLCBjb2xsYXBzZSkge1xuICAgIHZhciBwYXJlbnQgPSBwYXJlbnRDaGlsZC5wYXJlbnQsXG4gICAgICAgIGNoaWxkID0gIHBhcmVudENoaWxkLmNsdXN0ZXI7XG5cbiAgICAvLyB0aGlzIGNsdXN0ZXIgaGFzIGFscmVhZHkgYmVlbiBwcm9jZXNzZWRcbiAgICBpZiAoY2hpbGQuX2tlZXBLZXkgPT0gc2VsZi5fa2VlcEtleSkgcmV0dXJuO1xuXG4gICAgaWYgKHBhcmVudCkge1xuICAgICAgICB2YXIgdG8gPSBjb2xsYXBzZSA/IHBhcmVudCA6IGNoaWxkLFxuICAgICAgICAgICAgZnJvbSA9IGNvbGxhcHNlID8gY2hpbGQgOiBwYXJlbnQsXG4gICAgICAgICAgICB0b0xhdExuZyA9IHNlbGYuX2dlby5nZXRMYXRMbmcodG8uZ2V0RGlzcGxheUNlbnRlcigpKSxcbiAgICAgICAgICAgIGZyb21MYXRMbmcgPSBzZWxmLl9nZW8uZ2V0TGF0TG5nKGZyb20uZ2V0RGlzcGxheUNlbnRlcigpKTtcblxuICAgICAgICBzaG93Q2x1c3RlcihzZWxmLCBjaGlsZCwgZnJvbS5nZXREaXNwbGF5Q2VudGVyKCkpO1xuXG4gICAgICAgIGNoaWxkLl9kTGF0ID0gKHRvTGF0TG5nLl9sYXQgLSBmcm9tTGF0TG5nLl9sYXQpIC8gc2VsZi5fb3B0aW9ucy5hbmltYXRpb25TdGVwcztcbiAgICAgICAgY2hpbGQuX2RMbmcgPSAodG9MYXRMbmcuX2xuZyAtIGZyb21MYXRMbmcuX2xuZykgLyBzZWxmLl9vcHRpb25zLmFuaW1hdGlvblN0ZXBzO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHNob3dDbHVzdGVyKHNlbGYsIGNoaWxkKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGFuaW1hdGUoc2VsZikge1xuICAgIHZhciBzdGVwcyA9IDAsIGksXG4gICAgICAgIGludGVydmFsID0gc2VsZi5fb3B0aW9ucy5hbmltYXRpb25JbnRlcnZhbDtcblxuICAgIHN0ZXAoKTtcbiAgICBmdW5jdGlvbiBzdGVwKCkge1xuICAgICAgICBpZiAoc3RlcHMrKyA8IHNlbGYuX29wdGlvbnMuYW5pbWF0aW9uU3RlcHMpIHtcbiAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBzZWxmLl92aXNpYmxlQ2x1c3RlcnMubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgICAgICAgICB2YXIgY2x1c3RlciA9IHNlbGYuX3Zpc2libGVDbHVzdGVyc1tpXSxcbiAgICAgICAgICAgICAgICAgICAgbWFya2VyID0gc2VsZi5fdmlzaWJsZUNsdXN0ZXJzW2ldLl9tYXJrZXI7XG4gICAgICAgICAgICAgICAgaWYgKCFjbHVzdGVyLl9kTGF0ICYmICFjbHVzdGVyLl9kTG5nKSBjb250aW51ZTtcblxuICAgICAgICAgICAgICAgIHZhciBtb3ZlZExhdExuZyA9IGdldE1vdmVkTGF0TG5nKHNlbGYsIHNlbGYuX2dlby5nZXRNYXJrZXJQb3NpdGlvbihtYXJrZXIpLCBjbHVzdGVyKTtcbiAgICAgICAgICAgICAgICBzZWxmLl9nZW8uc2V0TWFya2VyUG9zaXRpb24obWFya2VyLCBtb3ZlZExhdExuZyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBzZWxmLl92aXNpYmxlQ29ubmVjdGlvbnMubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgICAgICAgICB2YXIgY29ubmVjdGlvbiA9IHNlbGYuX3Zpc2libGVDb25uZWN0aW9uc1tpXSxcbiAgICAgICAgICAgICAgICAgICAgY2x1c3RlcjEgPSBjb25uZWN0aW9uLl9kaXNwbGF5Q2x1c3RlcjEuY2x1c3RlcixcbiAgICAgICAgICAgICAgICAgICAgY2x1c3RlcjIgPSBjb25uZWN0aW9uLl9kaXNwbGF5Q2x1c3RlcjIuY2x1c3RlcjtcblxuICAgICAgICAgICAgICAgIGlmICghY2x1c3RlcjEuX2RMYXQgJiYgIWNsdXN0ZXIyLl9kTGF0ICYmICFjbHVzdGVyMS5fZExuZyAmJiAhY2x1c3RlcjIuX2RMbmcpIGNvbnRpbnVlO1xuXG4gICAgICAgICAgICAgICAgdmFyIHBvbHlsaW5lID0gY29ubmVjdGlvbi5fcG9seWxpbmUsXG4gICAgICAgICAgICAgICAgICAgIHBvbHlQYXRoID0gc2VsZi5fZ2VvLmdldFBvbHlsaW5lUGF0aChwb2x5bGluZSk7XG5cbiAgICAgICAgICAgICAgICBwb2x5UGF0aFswXSA9IGdldE1vdmVkTGF0TG5nKHNlbGYsIHBvbHlQYXRoWzBdLCBjbHVzdGVyMSk7XG4gICAgICAgICAgICAgICAgcG9seVBhdGhbMV0gPSBnZXRNb3ZlZExhdExuZyhzZWxmLCBwb2x5UGF0aFsxXSwgY2x1c3RlcjIpO1xuICAgICAgICAgICAgICAgIHNlbGYuX2dlby5zZXRQb2x5bGluZVBhdGgocG9seWxpbmUsIHBvbHlQYXRoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHNlbGYuX3RpbWVvdXQgPSBzZXRUaW1lb3V0KHN0ZXAsIGludGVydmFsKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmVzZXRWaWV3cG9ydChzZWxmKTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuZnVuY3Rpb24gZ2V0TW92ZWRMYXRMbmcoc2VsZiwgb2xkTGF0TG5nLCBkZWx0YSkge1xuICAgIGlmICghZGVsdGEgfHwgKCFkZWx0YS5fZExhdCAmJiAhZGVsdGEuX2RMbmcpKSByZXR1cm4gb2xkTGF0TG5nO1xuICAgIHZhciBvbGRQb3MgPSBzZWxmLl9nZW8uZ2V0TGF0TG5nKG9sZExhdExuZyk7XG4gICAgcmV0dXJuIHNlbGYuX2dlby5jcmVhdGVMYXRMbmcob2xkUG9zLl9sYXQgKyBkZWx0YS5fZExhdCwgb2xkUG9zLl9sbmcgKyBkZWx0YS5fZExuZyk7XG59XG5cbmZ1bmN0aW9uIHJlc2V0Vmlld3BvcnQoc2VsZiwgY29sbGFwc2UpIHtcbiAgICB2YXIgb2xkVmlzaWJsZUNsdXN0ZXJzID0gc2VsZi5fdmlzaWJsZUNsdXN0ZXJzLFxuICAgICAgICBvbGRWaXNpYmxlQ29ubmVjdGlvbnMgPSBzZWxmLl92aXNpYmxlQ29ubmVjdGlvbnM7XG5cbiAgICBzZWxmLl9rZWVwS2V5ID0gKHNlbGYuX2tlZXBLZXkgKyAxKSAlIDB4REVBREJFRUY7IC8vIG1vZCByYW5kb20gYmlnIHZhbHVlIHRvIHN0b3AgaXQgZnJvbSBvdmVyZmxvd2luZ1xuICAgIHNlbGYuX3Zpc2libGVDbHVzdGVycyA9IFtdO1xuICAgIHNlbGYuX3Zpc2libGVDb25uZWN0aW9ucyA9IFtdO1xuXG4gICAgY2xlYXJUaW1lb3V0KHNlbGYuX3RpbWVvdXQpO1xuXG4gICAgaWYgKGNvbGxhcHNlID09PSBmYWxzZSB8fCBzZWxmLl9wcmV2Wm9vbSA8IHNlbGYuX3pvb20pIHtcbiAgICAgICAgem9vbUluKHNlbGYpO1xuICAgIH0gZWxzZSBpZiAoY29sbGFwc2UgPT09IHRydWUgfHwgc2VsZi5fcHJldlpvb20gPiBzZWxmLl96b29tKSB7XG4gICAgICAgIHpvb21PdXQoc2VsZik7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgbW92ZShzZWxmKTtcbiAgICB9XG5cbiAgICAvLyBwdXNoIGhpZGluZyB0byB0aGUgbmV4dCBldmVudCBsb29wIHRvIGZpeCBhIHNtYWxsIGZsaWNrZXJcbiAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgaTtcbiAgICAgICAgZm9yIChpID0gMDsgaSA8IG9sZFZpc2libGVDbHVzdGVycy5sZW5ndGg7ICsraSkge1xuICAgICAgICAgICAgdmFyIGNsdXN0ZXIgPSBvbGRWaXNpYmxlQ2x1c3RlcnNbaV07XG4gICAgICAgICAgICBpZiAoY2x1c3Rlci5fa2VlcEtleSAhPSBzZWxmLl9rZWVwS2V5KSB7XG4gICAgICAgICAgICAgICAgaGlkZUNsdXN0ZXIoc2VsZiwgY2x1c3Rlcik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgb2xkVmlzaWJsZUNvbm5lY3Rpb25zLmxlbmd0aDsgKytpKSB7XG4gICAgICAgICAgICB2YXIgY29ubmVjdGlvbiA9IG9sZFZpc2libGVDb25uZWN0aW9uc1tpXTtcbiAgICAgICAgICAgIGlmIChjb25uZWN0aW9uLl9rZWVwS2V5ICE9IHNlbGYuX2tlZXBLZXkpIHtcbiAgICAgICAgICAgICAgICBoaWRlQ29ubmVjdGlvbihzZWxmLCBjb25uZWN0aW9uKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0sIDApO1xufVxuXG4vLyBBZGQgYSBidWZmZXIgdG8gdGhlIHNlYXJjaCBib3VuZHNcbi8vIGFuZCBhbHNvIGNsYW1wIGl0IHRvIHRoZSBib3VuZHMgb2YgdGhlIGVhcnRoLlxuZnVuY3Rpb24gZ2V0U2VhcmNoQm91bmRzKHNlbGYpIHtcbiAgICByZXR1cm4gc2VsZi5fZ2VvLmdldE1hcEJvdW5kcyhzZWxmLl9tYXApO1xufVxuXG5mdW5jdGlvbiBnZXRab29tQm94ZXMoZ2VvKSB7XG4gICAgdmFyIHpvb21Cb3hlcyA9IFtdLFxuICAgICAgICBtaW5EaXMgPSA4NC4zNzUsXG4gICAgICAgIG1heERpcyA9IDExMi42LFxuICAgICAgICBzY2FsZSA9IDE7XG5cbiAgICBmb3IgKHZhciB6ID0gMDsgeiA8PSBnZW8ubWF4Wm9vbTsgeisrKSB7XG4gICAgICAgIHpvb21Cb3hlc1t6XSA9IHtcbiAgICAgICAgICAgIG1pbjogKG1pbkRpcyAvIHNjYWxlKSxcbiAgICAgICAgICAgIG1heDogKG1heERpcyAvIHNjYWxlKVxuICAgICAgICB9O1xuICAgICAgICBzY2FsZSA8PD0gMTtcbiAgICB9XG4gICAgXG4gICAgcmV0dXJuIHpvb21Cb3hlcztcbn1cblxuXG5tb2R1bGUuZXhwb3J0cyA9IE1hcmtlcnM7IiwidmFyIHdtdSA9IHJlcXVpcmUoJy4vdXRpbHMuanMnKTtcblxudmFyIGlkcyA9IDE7XG5cbnZhciBQb2ludCA9IGZ1bmN0aW9uKGxhdExuZywgZGF0YSkge1xuICAgIGlmIChsYXRMbmcgaW5zdGFuY2VvZiBQb2ludCkge1xuICAgICAgICByZXR1cm4gbGF0TG5nO1xuICAgIH0gZWxzZSBpZiAodGhpcyBpbnN0YW5jZW9mIFBvaW50KSB7XG4gICAgICAgIHRoaXMuX2lkID0gaWRzKys7XG4gICAgICAgIHRoaXMuX2xhdExuZyA9IGxhdExuZztcbiAgICAgICAgdGhpcy5fZGF0YSA9IGRhdGE7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIG5ldyBQb2ludChsYXRMbmcsIGRhdGEpO1xuICAgIH1cbn07XG5cbndtdS5leHRlbmQoUG9pbnQucHJvdG90eXBlLCB7XG4gICAgZ2V0TGF0TG5nOiBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2xhdExuZztcbiAgICB9LFxuICAgIGdldERhdGE6IGZ1bmN0aW9uKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fZGF0YTtcbiAgICB9XG59KTtcblxubW9kdWxlLmV4cG9ydHMgPSBQb2ludDsiLCJtb2R1bGUuZXhwb3J0cyA9IHtcbiAgICBleHRlbmQ6IGZ1bmN0aW9uKHRhcmdldCkge1xuICAgICAgICBmb3IgKHZhciBpID0gMTsgaSA8IGFyZ3VtZW50cy5sZW5ndGg7ICsraSkge1xuICAgICAgICAgICAgdmFyIHNvdXJjZSA9IGFyZ3VtZW50c1tpXTtcbiAgICAgICAgICAgIGZvciAodmFyIGtleSBpbiBzb3VyY2UpIHtcbiAgICAgICAgICAgICAgICBpZiAoc291cmNlLmhhc093blByb3BlcnR5KGtleSkpIHRhcmdldFtrZXldID0gc291cmNlW2tleV07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRhcmdldDtcbiAgICB9XG59OyJdfQ==
