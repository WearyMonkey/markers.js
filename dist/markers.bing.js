/**
 * animated-marker-clusters - A library for animated marker clusters on Google, Mapbox or Bing maps
 * @version v0.0.0
 * @link https://github.com/WearyMonkey/animated-marker-clusters
 * @license MIT
 */
(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
window.wm = {
    Markers: require('./../markers.js'),
    Point: require('./../point.js'),
    Line: require('./../line.js'),
    mapConnectors: {
        bing: require('./../map-connectors/bing.js')
    },
    defaultMapConnector: 'bing'
};
},{"./../line.js":4,"./../map-connectors/bing.js":5,"./../markers.js":6,"./../point.js":7}],2:[function(require,module,exports){
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
},{"./utils.js":8}],3:[function(require,module,exports){
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
