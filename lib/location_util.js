(function() {
    var Cluster = wm.Cluster;

    var defaults = {
        animationSteps: 10,
        animationInterval: 50,
        debug: false,
        createMarker: function() {},
        createPolyline: function() {}
    };

    var Markers = wm.Markers = function(map, options) {
        var maxZoom = 20;

        this.options = wmu.extend({}, defaults, options);
        this.visibleClusters = [];
        this.visibleConnections = [];
        this.keepKey = 0;
        this.map = map;
        this.prevZoom = this.map.getZoom();
        this.clusterRoot = wm.Cluster.makeRootCluster("id", true);

        resetViewport(this);

        var self = this;
        this.boundsListener = google.maps.event.addListener(self.map, 'bounds_changed', function() {
            var zoom = self.map.getZoom();
            if (zoom < 0 || zoom > maxZoom) return;

            resetViewport(self);

            self.prevZoom = zoom;
            self.prevBounds = map.getBounds();

            drawDebug(self);
        });
    };

    wmu.extend(Markers.prototype, {

        addPoint: function(point) {
            this.clusterRoot.addPoint(point);
        },

        removePoint: function(point) {
            this.clusterRoot.removePoint(point);
        },

        addPoints: function(points) {
            for (var i = 0; i < points.length; ++i) {
                this.clusterRoot.addPoint(points[i]);
            }
        },

        removePoints: function(points) {
            for (var i = 0; i < points.length; ++i) {
                this.clusterRoot.removePoint(points[i]);
            }
        },

        destroy: function() {
            for (var i = 0; i < this.visibleClusters.length; ++i) {
                hideCluster(this, this.visibleClusters[i], true);
            }

            for (i = 0; i < this.visibleConnections.length; ++i) {
                hideConnection(this, this.visibleConnections[i], true);
            }

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
                zoomOut(this, root, this.map.getZoom(), root);
                root.setState(newState, true);
            } else if (state == Cluster.States.Expanded) {
                root.setState(newState, true);
                zoomIn(this, root, this.map.getZoom(), root);
            }
        }
    });

    function showCluster(self, cluster, center) {
        cluster.keepKey = self.keepKey;
        self.visibleClusters.push(cluster);

        if (!cluster.marker) {
            cluster.marker = self.options.createMarker(cluster);
        }

        if (!center) center = cluster.getDisplayCenter();
        if (!center.equals(cluster.marker.getPosition())) cluster.marker.setPosition(center);

        if (!cluster.marker.getMap()) {
            cluster.marker.setMap(self.map);
            if (self.clusterDisplayedFn) self.clusterDisplayedFn(cluster);
        }

        return cluster.marker;
    }

    function showConnection(self, connection) {
        connection.keepKey = self.keepKey;
        self.visibleConnections.push(connection);

        if (!connection.polyline) {
            connection.polyline = self.options.createPolyline(connection.cluster1, connection.cluster2);
        }

        connection.polyline.setPath(new google.maps.MVCArray([connection.displayCluster1.getDisplayCenter(), connection.displayCluster2.getDisplayCenter()]));

        if (!connection.polyline.getMap()) {
            connection.polyline.setMap(self.map);
            if (self.connectionDisplayedFn) self.connectionDisplayedFn(connection);
        }

        return connection.polyline;
    }

    function hideCluster(self, cluster, destroy) {
        if (cluster.marker) {
            if (self.clusterHiddenFn) self.clusterHiddenFn(cluster);
            cluster.marker.setMap(null);
            if (destroy) delete cluster.marker;
        }
    }

    function hideConnection(self, connection, destroy) {
        if (connection.polyline) {
            if (self.connectionHiddenFn) self.connectionHiddenFn(connection);
            connection.polyline.setMap(null);
            if (destroy) delete connection.polyline;
        }
    }

    function move(self, root) {
        var i;
        var visible = root.getContainedClustersAndConnections(getSearchBounds(self), self.map.getZoom());
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
        var mapZoom = self.map.getZoom();

        function addChild(parent, child) {
            parent = overrideParent || parent;
            if (parent == child) return false;
            if (overrideParent || parent && parent.getZoomRange().to == mapZoom-1) {
                var marker = showCluster(self, child, parent.getDisplayCenter());
                if (!marker) {
                    console.log("Null Marker");
                    return false;
                }
                marker.dLat = (child.getDisplayCenter().lat() - parent.getDisplayCenter().lat()) / self.options.animationSteps;
                marker.dLng = (child.getDisplayCenter().lng() - parent.getDisplayCenter().lng()) / self.options.animationSteps;
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
        var mapZoom = self.map.getZoom();

        function addChild(parent, child) {
            parent = overrideParent || parent;
            if (parent == child) return false;
            if (overrideParent || parent && parent.getZoomRange().to == mapZoom) {
                var marker = showCluster(self, child);
                if (!marker) {
                    console.log("Null Marker");
                    return false;
                }
                marker.dLat = (parent.getDisplayCenter().lat() - child.getDisplayCenter().lat()) / self.options.animationSteps;
                marker.dLng = (parent.getDisplayCenter().lng() - child.getDisplayCenter().lng()) / self.options.animationSteps;
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
            if (!childrenToAnimate[child.id] && (!checkRoot || checkAncestor(parent, root)) && addChildfn(parent, child)) {
                //todo make sure the point at the center is above the overs so it doesnt flash
                //$(child.marker.getElement()).css("z-index", child.getBestPoint() == parent.getBestPoint() ? 100 : null);
                childrenToAnimate[child.id] = child;
            }
        }

        for (i = 0; i < visible.clusters.length; ++i) {
            add(visible.clusters[i].getParent(), visible.clusters[i], false);
        }

        var check = root.parent !== null;
        for (i = 0; i < visible.connections.length; i++) {
            var connection = visible.connections[i];
            add(connection.displayCluster1.getParent(), connection.displayCluster1, check);
            add(connection.displayCluster2.getParent(), connection.displayCluster2, check);
        }

        return childrenToAnimate;
    }

    function getPolylinesToAnimate(self, connections, animatedClusters) {
        var toAnimate = [];
        for (var i = 0; i < connections.length; ++i) {
            var connection = connections[i],
                polyline = showConnection(self, connection),
                cluster1 = animatedClusters[connection.displayCluster1.id],
                cluster2 = animatedClusters[connection.displayCluster2.id];

            if (!polyline) continue;

            polyline.dLat1 = polyline.dLng1 = polyline.dLat2 = polyline.dLng2 = null;
            if (cluster1) {
                polyline.dLat1 = cluster1.marker.dLat;
                polyline.dLng1 = cluster1.marker.dLng;
                polyline.getPath().setAt(0, cluster1.marker.getPosition());
            }
            if (cluster2) {
                polyline.dLat2 = cluster2.marker.dLat;
                polyline.dLng2 = cluster2.marker.dLng;
                polyline.getPath().setAt(1, cluster2.marker.getPosition());
            }
            if (cluster1 || cluster2) {
                toAnimate.push(polyline);
            }
        }
        return toAnimate;
    }

    function animate(self, markers, polylines, done) {
        var steps = 0;
        self.interval = setInterval(function() {
            if (steps < self.options.animationSteps) {
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
            } else if (steps == self.options.animationSteps) {
                clearInterval(self.interval);

                if (done) done();
            }
            ++steps;
        }, self.options.animationInterval);
    }

    function resetViewport(self) {
        var i = 0,
            oldVisibleClusters = self.visibleClusters,
            oldVisibleConnections = self.visibleConnections;

        self.keepKey = (self.keepKey + 1) % 0xDEADBEEF; // mod random big value to stop it from overflowing
        self.visibleClusters = [];
        self.visibleConnections = [];

        clearInterval(self.interval);

        var zoomShift = self.map.getZoom() - self.prevZoom;
        if (zoomShift == 1) {
            zoomIn(self, self.clusterRoot, self.map.getZoom());
        } else if (zoomShift == -1) {
            zoomOut(self, self.clusterRoot, self.map.getZoom()+1);
        } else {
            move(self, self.clusterRoot);
        }

        // push hiding to the next event loop to fix a small flicker
        setTimeout(function() {
            for (i = 0; i < oldVisibleClusters.length; ++i) {
                var cluster = oldVisibleClusters[i];
                if (cluster.keepKey != self.keepKey) {
                    hideCluster(self, cluster);
                }
            }

            for (i = 0; i < oldVisibleConnections.length; ++i) {
                var connection = oldVisibleConnections[i];
                if (connection.keepKey != self.keepKey) {
                    hideConnection(self, connection);
                }
            }
        }, 0);
    }

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
        if (!self.options.debug) return;

        var zoomBoxRectMax = new google.maps.Rectangle({
            fillOpacity:0,
            strokeOpacity:1,
            strokeColor:"00FF00",
            strokeWeight:2,
            clickable:false
        });

        var zoomBoxRectMin = new google.maps.Rectangle({
            fillOpacity:0,
            strokeOpacity:1,
            strokeColor:"00FF00",
            strokeWeight:2,
            clickable:false
        });

        var center = self.prevBounds.getCenter();
        var zoomBoxes = Cluster.zoomBoxes;
        var min = zoomBoxes[self.map.getZoom()].min / 2;
        var max = zoomBoxes[self.map.getZoom()].max / 2;
        zoomBoxRectMin.setBounds(new google.maps.LatLngBounds(
            new google.maps.LatLng(center.lat() - min, center.lng() - min),
            new google.maps.LatLng(center.lat() + min, center.lng() + min)
        ));
        zoomBoxRectMax.setBounds(new google.maps.LatLngBounds(
            new google.maps.LatLng(center.lat() - max, center.lng() - max),
            new google.maps.LatLng(center.lat() + max, center.lng() + max)
        ));
        zoomBoxRectMin.setMap(self.map);
        zoomBoxRectMax.setMap(self.map);
    }

})();