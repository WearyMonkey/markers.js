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
        debug: false,
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

        var oldExpandDepth = cluster._expandDepth;
        cluster._oldExpandDepth = oldExpandDepth;

        if (state == 'normal') {
            cluster._expandDepth = 0;
            if (oldExpandDepth > 0) {
                zoomOut(this);
            } else if (oldExpandDepth < 0) {
                zoomIn(this);
            }
        } else if (state == 'collapsed') {
            cluster._expandDepth = -1;
            zoomOut(this);
        } else if (state == 'expanded') {
            cluster._expandDepth = 1;
            zoomIn(this);
        }

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
            self._geo.getMarketPosition(connection._displayCluster1.cluster._marker) :
            connection._displayCluster1.cluster.getDisplayCenter(),
        connection._displayCluster2.cluster._marker ?
            self._geo.getMarketPosition(connection._displayCluster2.cluster._marker) :
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

                var movedLatLng = getMovedLatLng(self, self._geo.getMarketPosition(marker), cluster);
                self._geo.setMarkerPosition(marker, movedLatLng);
            }

            for (i = 0; i < self._visibleConnections.length; ++i) {
                var connection = self._visibleConnections[i],
                    cluster1 = connection._displayCluster1.cluster,
                    cluster2 = connection._displayCluster2.cluster;

                if (!cluster1._dLat == null && cluster2._dLat == null) continue;

                var polyline = connection._polyline,
                    polyPath = self._geo.getPolylinePath(polyline);

                polyPath[0] = getMovedLatLng(self, polyPath[0], cluster1);
                polyPath[1] = getMovedLatLng(self, polyPath[1], cluster2);
                self._geo.setPolylinePath(polyline, polyPath);
            }
            self._timeout = setTimeout(step, interval)
        } else {
            move(self);
        }
    }
}

function getMovedLatLng(self, oldLatLng, delta) {
    if (!delta || (!delta._dLat && !delta._dLng)) return oldLatLng;
    var oldPos = self._geo.getLatLng(oldLatLng);
    return self._geo.createLatLng(oldPos._lat + delta._dLat, oldPos._lng + delta._dLng);
}

function resetViewport(self) {
    var oldVisibleClusters = self._visibleClusters,
        oldVisibleConnections = self._visibleConnections;

    self._keepKey = (self._keepKey + 1) % 0xDEADBEEF; // mod random big value to stop it from overflowing
    self._visibleClusters = [];
    self._visibleConnections = [];

    clearTimeout(self._timeout);

    if (self._prevZoom < self._zoom) {
        zoomIn(self);
    } else if (self._prevZoom > self._zoom) {
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