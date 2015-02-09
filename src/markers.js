var Cluster = require('./cluster.js');
require('./cluster_search.js');
var wmu = require('./utils.js');
var Point = require('./point.js');
var Line = require('./line.js');

var defaults = {
    animationSteps: 30,
    animationInterval: 16,
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
    this._clusterRoot = new Cluster(null, 0, this._geo.maxZoom+1, this._geo, { zoomBoxes: getZoomBoxes(this._geo) } );
    this._listeners = [];

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
        var oldState = cluster._state,
            newState = state,
            nextRoot,
            root = cluster;

        if (newState == oldState) return;

        if (state == 'normal') {
            while ((nextRoot = root._parent) && nextRoot._state !== 'normal') root = nextRoot;
            state = oldState == 'collapsed' ? 'expanded' : 'collapsed';
        }

        if (state == 'collapsed') {
            zoomOut(this, root, this._map.getZoom(), root);
            root.setState(newState, true);
        } else if (state == 'expanded') {
            root.setState(newState, true);
            zoomIn(this, root, this._map.getZoom(), root);
        }
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

    if (!center) center = cluster.getDisplayCenter();
    self._geo.setMarkerPosition(cluster._marker, center);

    // visible event
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

    if (!connection.polyline) {
        connection.polyline = self._options.createPolyline(connection._line);
    }

    self._geo.setPolylinePath(connection.polyline, [
        connection._displayCluster1.getDisplayCenter(),
        connection._displayCluster2.getDisplayCenter()
    ]);

    // visible event
    if (!connection._visible) {
        self._geo.showPolyline(self._map, connection.polyline);
        connection._visible = true;
        trigger(self, 'lineShown', {line: connection._line});
    }

    return connection.polyline;
}

function hideCluster(self, cluster, destroy) {
    if (cluster._marker) {
        // hidden event
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
    if (connection.polyline) {
        // hidden event
        self._geo.hidePolyline(self._map, connection.polyline);
        connection._visible = false;
        trigger(self, 'lineHidden', {line: connection._line});
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