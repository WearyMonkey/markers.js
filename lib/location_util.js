var Cluster = wm.Cluster;
var LocationUtil = wm.LocationUtil = function(map, options) {
    var maxZoom = 20;

    this.animationSteps = 10;
    this.animationInterval = 50;
    this.visibleClusters = [];
    this.visibleConnections = [];
    this.keepKey = 0;
    this.debug = options.debug;
    this.map = map;
    this.googleMap = map;
    this.prevZoom = this.googleMap.getZoom();

    this.updateClusterFn = options.updateClusterFn;
    this.createMarkerFn = options.createMarkerFn;
    this.createPolylineFn = options.createPolylineFn;
    this.clusterDisplayedFn = options.clusterDisplayedFn;
    this.clusterHiddenFn = options.clusterHiddenFn;
    this.connectionHiddenFn = options.connectionHiddenFn;
    this.connectionHiddenFn = options.connectionHiddenFn;
    this.options = options;
    this.searchGroup = ["id"];
    this.clusterRoot = wm.Cluster.makeRootCluster("id", true);

    $([this.clusterRoot]).bind("updated.location_util", function() {
        this.resetViewport();
    }.bind(this));

    this.resetViewport();

    var self = this;
    this.boundsListener = google.maps.event.addListener(self.googleMap, 'bounds_changed', function() {
        var zoom = self.googleMap.getZoom();
        if (zoom < 0 || zoom > maxZoom) return;

        self.resetViewport();

        self.prevZoom = zoom;
        self.prevBounds = map.getBounds();

        drawDebug(self);
    });
};

$.extend(LocationUtil.prototype, {

    addPoint: function(point) {
      this.clusterRoot.addPage({id: 1, local:{id: point.seq, mapSequence: point.seq}, point: point.latLng}, point.latLng);
    },

    destroy: function() {
        for (var i = 0; i < this.visibleClusters.length; ++i) {
            this.hideCluster(this.visibleClusters[i], true);
        }

        for (i = 0; i < this.visibleConnections.length; ++i) {
            this.hideConnection(this.visibleConnections[i], true);
        }

        if (this.options.storyGroup) this.options.storyGroup.stopExplore();

        $([this.clusterRoot]).unbind("updated.location_util");

        if (this.boundsListener) google.maps.event.removeListener(this.boundsListener);
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
            this.zoomOut(root, this.googleMap.getZoom(), root);
            root.setState(newState, true);
        } else if (state == Cluster.States.Expanded) {
            root.setState(newState, true);
            this.zoomIn(root, this.googleMap.getZoom(), root);
        }
    },

    /**
     * Private methods
     */

    showCluster: function(cluster, center) {
        if (!this.createMarkerFn) return null;
        cluster.keepKey = this.keepKey;
        this.visibleClusters.push(cluster);

        var primary = cluster.isPrimary(this.googleMap.getZoom());
        if (!cluster.marker) {
            cluster.marker = this.createMarkerFn(cluster, primary);
        } else {
            this.updateClusterFn(cluster, primary);
        }

        cluster.wasPrimary = primary;

        if (!center) center = cluster.getDisplayCenter();
        if (!center.equals(cluster.marker.getPosition())) cluster.marker.setPosition(center);

        if (!cluster.marker.getMap())
        {
            cluster.marker.setMap(this.googleMap);
            if (this.clusterDisplayedFn) this.clusterDisplayedFn(cluster);
        }

        return cluster.marker;
    },

    showConnection: function(connection) {
        if (!this.createPolylineFn) return null;
        connection.keepKey = this.keepKey;
        this.visibleConnections.push(connection);

        if (!connection.polyline) {
            connection.polyline = this.createPolylineFn(connection.group1, connection.group2);
        }

        connection.polyline.setPath(new google.maps.MVCArray([connection.displayGroup1.getDisplayCenter(), connection.displayGroup2.getDisplayCenter()]));

        if (!connection.polyline.getMap()) {
            connection.polyline.setMap(this.googleMap);
            if (this.connectionDisplayedFn) this.connectionDisplayedFn(connection);
        }

        return connection.polyline;
    },

    hideCluster: function(cluster, destroy) {
        if (cluster.marker) {
            if (this.clusterHiddenFn) this.clusterHiddenFn(cluster);
            cluster.marker.setMap(null);
            if (destroy) delete cluster.marker;
        }
    },

    hideConnection: function(connection, destroy) {
        if (connection.polyline) {
            if (this.connectionHiddenFn) this.connectionHiddenFn(connection);
            connection.polyline.setMap(null);
            if (destroy) delete connection.polyline;
        }
    },

    move: function (root) {
        var self = this, i;
        var visible = root.getContainedClustersAndConnections(getSearchBounds(this), this.googleMap.getZoom(), this.searchGroup);
        for (i = 0; i < visible.clusters.length; ++i) {
            self.showCluster(visible.clusters[i]);
        }
        for (i = 0; i < visible.connections.length; ++i) {
            this.showConnection(visible.connections[i]);
        }
    },

    zoomIn: function(root, zoom, overrideParent) {
        var visible = root.getContainedClustersAndConnections(getSearchBounds(this), zoom, this.searchGroup);
        var childMarkers = [];
        var mapZoom = this.googleMap.getZoom();
        var self = this;

        function addChild(parent, child) {
            parent = overrideParent || parent;
            if (parent == child) return false;
            if (overrideParent || parent && parent.getZoomRange().to == mapZoom-1) {
                var marker = self.showCluster(child, parent.getDisplayCenter());
                if (!marker) {
                    console.log("Null Marker");
                    return false;
                }
                marker.dLat = (child.getDisplayCenter().lat() - parent.getDisplayCenter().lat()) / self.animationSteps;
                marker.dLng = (child.getDisplayCenter().lng() - parent.getDisplayCenter().lng()) / self.animationSteps;
                marker.inPlace = false;
                childMarkers.push(marker);

                self.hideCluster(parent);
                return true;
            } else {
                self.showCluster(child);
                return false;
            }
        }


        var childrenToAnimate = this.getChildrenToAnimate(visible, root, addChild);
        var childPolylines = this.getPolylinesToAnimate(visible.connections, childrenToAnimate);

        this.animate(childMarkers, childPolylines);
    },

    zoomOut: function(root, zoom, overrideParent) {
        var visible = root.getContainedClustersAndConnections(getSearchBounds(this), zoom, this.searchGroup);
        var self = this;
        var childMarkers = [];
        var mapZoom = this.googleMap.getZoom();

        function addChild(parent, child) {
            parent = overrideParent || parent;
            if (parent == child) return false;
            if (overrideParent || parent && parent.getZoomRange().to == mapZoom) {
                var marker = self.showCluster(child);
                if (!marker) {
                    console.log("Null Marker");
                    return false;
                }
                marker.dLat = (parent.getDisplayCenter().lat() - child.getDisplayCenter().lat()) / self.animationSteps;
                marker.dLng = (parent.getDisplayCenter().lng() - child.getDisplayCenter().lng()) / self.animationSteps;
                childMarkers.push(marker);

                return true;
            } else {
                self.showCluster(child);
                return false;
            }
        }

        var animatedChildren = this.getChildrenToAnimate(visible, root, addChild);
        var animatedPolylines = this.getPolylinesToAnimate(visible.connections, animatedChildren);

        this.animate(childMarkers, animatedPolylines, function() {
            self.resetViewport();
        });
    },

    getChildrenToAnimate: function(visible, root, addChildfn) {
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
            if (!childrenToAnimate[child.id] && (!checkRoot || checkAncestor(parent, root)) && addChildfn(parent, child)) {
                //todo make sure the page at the center is above the overs so it doesnt flash
                //$(child.marker.getElement()).css("z-index", child.getBestPage() == parent.getBestPage() ? 100 : null);
                childrenToAnimate[child.id] = child;
            }
        }

        for (i = 0; i < visible.clusters.length; ++i) {
            add(visible.clusters[i].getParent(), visible.clusters[i], false);
        }

        var check = root.parent !== null;
        for (i = 0; i < visible.connections.length; i++) {
            var connection = visible.connections[i];
            add(connection.displayGroup1.getParent(), connection.displayGroup1, check);
            add(connection.displayGroup2.getParent(), connection.displayGroup2, check);
        }

        return childrenToAnimate;
    },

    getPolylinesToAnimate: function(connections, animatedClusters) {
        var toAnimate = [];
        for (var i = 0; i < connections.length; ++i) {
            var connection = connections[i],
                polyline = this.showConnection(connection),
                group1 = animatedClusters[connection.displayGroup1.id],
                group2 = animatedClusters[connection.displayGroup2.id];

            if (!polyline) continue;

            polyline.dLat1 = polyline.dLng1 = polyline.dLat2 = polyline.dLng2 = null;
            if (group1) {
                polyline.dLat1 = group1.marker.dLat;
                polyline.dLng1 = group1.marker.dLng;
                polyline.getPath().setAt(0, group1.marker.getPosition());
            }
            if (group2) {
                polyline.dLat2 = group2.marker.dLat;
                polyline.dLng2 = group2.marker.dLng;
                polyline.getPath().setAt(1, group2.marker.getPosition());
            }
            if (group1 || group2) {
                toAnimate.push(polyline);
            }
        }
        return toAnimate;
    },

    animate: function(markers, polylines, done) {
        var self = this;
        var steps = 0;
        this.interval = setInterval(function() {
            if (steps < self.animationSteps) {
                var i;
                for (i = 0; i < markers.length; ++i) {
                    var marker = markers[i];
                    var oldPos = marker.getPosition();
                    marker.setPosition(new google.maps.LatLng(oldPos.lat() + marker.dLat, oldPos.lng() + marker.dLng));
                }
                for (i = 0; i < polylines.length; ++i) {
                    var polyline = polylines[i];
                    if (typeof polyline.dLat1 !== "undefined") {
                        var oldPos1 = polyline.getPath().getAt(0);
                        polyline.getPath().setAt(0, new google.maps.LatLng(oldPos1.lat() + polyline.dLat1, oldPos1.lng() + polyline.dLng1));
                    }
                    if (typeof polyline.dLat2 !== "undefined") {
                        var oldPos2 = polyline.getPath().getAt(1);
                        polyline.getPath().setAt(1, new google.maps.LatLng(oldPos2.lat() + polyline.dLat2, oldPos2.lng() + polyline.dLng2));
                    }
                }
            } else if (steps == self.animationSteps) {
                clearInterval(self.interval);

                if (done) done();
            }
            ++steps;
        }, self.animationInterval);
    },

    resetViewport: function() {
        var self = this, i = 0,
            oldVisibleClusters = this.visibleClusters,
            oldVisibleConnections = this.visibleConnections;

        this.keepKey = (this.keepKey + 1) % 0xDEADBEEF; // mod random big value to stop it from overflowing
        this.visibleClusters = [];
        this.visibleConnections = [];

        clearInterval(this.interval);

        var zoomShift = this.googleMap.getZoom() - this.prevZoom;
        if (zoomShift == 1) {
            this.zoomIn(this.clusterRoot, this.googleMap.getZoom());
        } else if (zoomShift == -1) {
            this.zoomOut(this.clusterRoot, this.googleMap.getZoom()+1);
        } else {
            this.move(this.clusterRoot);
        }

        // push hiding to the next event loop to fix a small flicker
        setTimeout(function() {
            for (i = 0; i < oldVisibleClusters.length; ++i) {
                var cluster = oldVisibleClusters[i];
                if (cluster.keepKey != self.keepKey) {
                    self.hideCluster(cluster);
                }
            }

            for (i = 0; i < oldVisibleConnections.length; ++i) {
                var connection = oldVisibleConnections[i];
                if (connection.keepKey != self.keepKey) {
                    self.hideConnection(connection);
                }
            }
        }, 0);
    }
});

// Add a buffer to the search bounds
// and also clamp it to the bounds of the earth.
function getSearchBounds(self) {
    var mapBounds = self.map.getBounds();
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

function drawDebug(self) {
    if (!self.debug) return;

    var zoomBoxRectMax = !self.debug ? null : new google.maps.Rectangle({
        fillOpacity:0,
        strokeOpacity:1,
        strokeColor:"00FF00",
        strokeWeight:2,
        clickable:false
    });

    var zoomBoxRectMin = !self.debug ? null : new google.maps.Rectangle({
        fillOpacity:0,
        strokeOpacity:1,
        strokeColor:"00FF00",
        strokeWeight:2,
        clickable:false
    });

    var center = self.prevBounds.getCenter();
    var zoomBoxes = Cluster.zoomBoxes;
    var min = zoomBoxes[self.googleMap.getZoom()].min / 2;
    var max = zoomBoxes[self.googleMap.getZoom()].max / 2;
    zoomBoxRectMin.setBounds(new google.maps.LatLngBounds(
        new google.maps.LatLng(center.lat() - min, center.lng() - min),
        new google.maps.LatLng(center.lat() + min, center.lng() + min)
    ));
    zoomBoxRectMax.setBounds(new google.maps.LatLngBounds(
        new google.maps.LatLng(center.lat() - max, center.lng() - max),
        new google.maps.LatLng(center.lat() + max, center.lng() + max)
    ));
    zoomBoxRectMin.setMap(self.googleMap);
    zoomBoxRectMax.setMap(self.googleMap);
}
