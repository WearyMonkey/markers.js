//steal(
//
//).then(function() {


        var googleMaps = [],
            availableMaps = [],
            googleMapsDef = $.Deferred();

        can.Construct("R7.Utils.Mapping.Map",
            {
                _googleMaps: googleMaps,
                _availableMaps: availableMaps,

                createMap: function($element, bounds) {
                    return createGoogleMap($element, true).pipe(function(mapContainer) {
                        return new R7.Utils.Mapping.Map(mapContainer, $element, bounds);
                    });
                },

                getMapDeferred: function() {
                    return googleMapsDef.promise();
                },

                googleMapsReady: function() {
                    googleMapsDef.resolve();
                }
            },
            {
                init: function(mapContainer, $element, bounds) {
                    var self = this;
                    this.map = mapContainer.map;
                    this.$element = $element;
                    this.mapContainer = mapContainer;
                    $element.append(mapContainer.$ele);
                    this.map.setOptions(getDefaults());

                    this.$element.onDomAttach(function() {
                        self.resized();
                        if (bounds) {
                            _.defer(_.bind(self.panTo, self), bounds);  //browser needs a chance to complete previous map ops, for panTo to take effect
                        }
                    });
                },

                destroy: function() {
                    this.mapContainer.$ele.remove();
                    availableMaps.push($.Deferred().resolve(this.mapContainer));
                },

                resized: function() {
                    var map = this.map;
                    if (map) {
                        var center = map.getCenter();
                        google.maps.event.trigger(map, 'resize');
                        map.setCenter(center);
                    }
                },

                panTo: function(to) {
                    var defaultZoom = 6;

                    if (to.zoom || to.center) {
                        if (to.zoom) this.map.setZoom(to.zoom);
                        if (to.center) this.map.setCenter($.parsePoint(to.center));
                        return;
                    }

                    var bounds;
                    if (to instanceof R7.Models.Page) {
                        var point = to.point && $.parsePoint(to.point),
                            zoom = to.place && to.place.address_path && R7.MapUtils.getZoomLevelForAddressPath(to.place.address_path);

                        if (point && zoom) {
                            //Try to figure out bounds using center and address level
                            //default: zoom = 6
                            zoom = Math.max(defaultZoom, zoom);

                            bounds = getBoundsForZoomAndCenter(zoom,
                                point,
                                this.$element.width(),
                                this.$element.height());
                        } else if (to.place && to.place.info && to.place.info.viewport) {
                            bounds = $.parseBounds(to.place.info.viewport);
                        } else {
                            bounds = getBoundsForZoomAndCenter(defaultZoom,
                                point,
                                this.$element.width(),
                                this.$element.height());
                        }

                        if(point && bounds) bounds = adjustViewport(point, bounds);


                    } else if (to instanceof R7.Models.Place) {
                        bounds = $.parseBounds(to.info && to.info.viewport)
                    } else if (to instanceof google.maps.LatLng) {
                        bounds = to;
                    } else {
                        bounds = $.parseBounds(to);
                    }

                    bounds = adjustBounds(bounds);

                    if (bounds) this.map.fitBounds(bounds);

                },

                getBounds: function() {
                    var canvasProjection = this.mapContainer.canvasProjection;
                    if (canvasProjection && canvasProjection.getWorldWidth() <= this.$element.width()) {
                        return R7.MapUtils.getGlobalBounds();
                    } else {
                        return this.map.getBounds();
                    }
                },

                drawBounds: function(bounds, color) {
                    var rects = this.rects = (this.rects || []);
                    rects.push(createRect(this.map, bounds, color || "FF0000"));
                },

                getElement: function() {
                    return this.$element;
                },

                getMap: function() {
                    return this.map;
                }
            });

        function createGoogleMap($element) {
            if (availableMaps.length) {
                return availableMaps.pop();
            } else {
                var mapDeferred = googleMapsDef.pipe(function() {
                    var drawDeferred = $.Deferred(),
                        options = $.extend({
                            center: new google.maps.LatLng(0, 0),
                            zoom: 2,
                            mapTypeId: google.maps.MapTypeId.ROADMAP, // options: TERRAIN, SATELLITE, HYBRID
                            minZoom: 2
                        }, getDefaults()),
                        $map = $("<div style='position: absolute; top: 0; width: 100%; height:100%;'>").appendTo($element);

                    var map = new google.maps.Map($map[0], options),
                        overlay = new google.maps.OverlayView(),
                        mapContainer = {
                            map: map,
                            $ele: $map
                        };

                    overlay.draw = function () {
                        overlay.draw = function() {};
                        $.extend(mapContainer, {
                            canvasProjection: overlay.getProjection(),
                            production: map.getProjection()
                        });
                        drawDeferred.resolve(mapContainer);
                    };

                    overlay.setMap(map);

                    return drawDeferred;
                });

                googleMaps.push(mapDeferred);

                return mapDeferred;
            }
        }

        /**
         * If bounds are smaller than an area that is smaller than (6 lat * 12 lng), the functions returns exanded bounds
         * @param bounds (required) an instance of LatLng or LatLngBounds
         */
        function adjustBounds(bounds) {
            var MIN_NS_SPAN = 3,
                MIN_EW_SPAN = 5,
                newBounds = bounds;

            if (bounds instanceof google.maps.LatLng) {
                // A total hack to show an area around the point
                // calling setCenter and setZoom does not work if a fitBounds was recently called
                newBounds = new google.maps.LatLngBounds(
                    new google.maps.LatLng(bounds.lat() - MIN_NS_SPAN/2, bounds.lng() - MIN_EW_SPAN/2),
                    new google.maps.LatLng(bounds.lat() + MIN_NS_SPAN/2, bounds.lng() + MIN_EW_SPAN/2)
                );
            } else if (bounds instanceof google.maps.LatLngBounds) {
                var span = bounds.toSpan();
                var center = bounds.getCenter();
                var newSW, newNE, newSWLat, newSWLng, newNELat, newNELng;

                if (span.lat() < MIN_NS_SPAN) {
                    newSWLat = center.lat() - MIN_NS_SPAN/2;
                    newNELat = center.lat() + MIN_NS_SPAN/2;
                }
                if(span.lng() < MIN_EW_SPAN) {
                    newSWLng = center.lng() - MIN_EW_SPAN/2;
                    newNELng = center.lng() + MIN_EW_SPAN/2;
                }
                newSW = new google.maps.LatLng(
                    newSWLat? newSWLat : bounds.getSouthWest().lat(),
                    newSWLng? newSWLng : bounds.getSouthWest().lng());
                newNE = new google.maps.LatLng(
                    newNELat? newNELat : bounds.getNorthEast().lat(),
                    newNELng? newNELng : bounds.getNorthEast().lng());
                newBounds = new google.maps.LatLngBounds(newSW, newNE);
            }
            return newBounds;
        }

        //if the point doesn't lie in the central 25% area of the bounds,
        //change the bounds to centralize the map
        //todo this doesn't work very well/at all when the bounding box is near extreme lats
        //Input:
        // point: google.maps.LatLng,
        // bounds: google.maps.LatLngBounds
        function adjustViewport(point, bounds) {
            var newBounds = bounds;
            var span = bounds.toSpan();
            var centralArea = new google.maps.LatLngBounds(
                new google.maps.LatLng(bounds.getSouthWest().lat()+span.lat()/4, bounds.getSouthWest().lng()+span.lng()/4),
                new google.maps.LatLng(bounds.getNorthEast().lat()-span.lat()/4, bounds.getNorthEast().lng()-span.lng()/4)
            );
            if (!centralArea.contains(point)) {
                newBounds = new google.maps.LatLngBounds(
                    new google.maps.LatLng(point.lat()-span.lat()/2, point.lng()-span.lng()/2),
                    new google.maps.LatLng(point.lat()+span.lat()/2, point.lng()+span.lng()/2)
                );
            }
            return newBounds;
        }

        function getBoundsForZoomAndCenter(zoom, center, pixelWidth, pixelHeight) {
            var MAP_TILE_WIDTH = 256;
            var lngSpan = (pixelWidth*360/Math.pow(2, zoom)/MAP_TILE_WIDTH);
            var latSpan = (pixelHeight*180/Math.pow(2, zoom)/MAP_TILE_WIDTH);

            return new google.maps.LatLngBounds(
                new google.maps.LatLng((center.lat() - latSpan / 2), (center.lng() - lngSpan / 2)),
                new google.maps.LatLng((center.lat() + latSpan / 2), (center.lng() + lngSpan / 2))
            );
        }


        function createRect(map, bounds, color) {
            return new google.maps.Rectangle({
                fillOpacity: 0,
                strokeOpacity: 1,
                strokeColor: color,
                strokeWeight: 2,
                clickable: false,
                map: map,
                bounds: bounds
            });
        }

        var defaultOptions;
        function getDefaults() {
            return defaultOptions = defaultOptions || {
                disableDefaultUI: false,
                draggable: true,
                disableDoubleClickZoom: false,
                keyboardShortcuts: true,
                scrollwheel: true,
                mapTypeControl: true,
                mapTypeControlOptions: {
                    style: google.maps.MapTypeControlStyle.DEFAULT,
                    position: google.maps.ControlPosition.TOP_RIGHT
                },
                panControl: true,
                panControlOptions: {
                    position: google.maps.ControlPosition.TOP_LEFT
                },
                rotateControl: false,
                rotateControlOptions: {
                    position: google.maps.ControlPosition.TOP_LEFT
                },
                zoomControl: true,
                zoomControlOptions: {
                    style: google.maps.ZoomControlStyle.DEFAULT,
                    position: google.maps.ControlPosition.TOP_LEFT
                },
                scaleControl: true,
                scaleControlOptions: {
                    position: google.maps.ControlPosition.BOTTOM_LEFT
                },
                streetViewControl: true,
                streetViewControlOptions: {
                    position: google.maps.ControlPosition.TOP_LEFT
                },
                styles: [
                    { featureType: "administrative.neighborhood", stylers: [ { visibility: "off" } ] },
                    { featureType: "road.local", stylers: [ { visibility: "off" } ] },
                    { featureType: "transit.line", stylers: [ { visibility: "off" } ] },
                    { featureType: "road.arterial", stylers: [ { visibility: "simplified" } ] }
                ]
            };
        }
    //});