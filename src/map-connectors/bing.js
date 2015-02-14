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
