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

    getMarketPosition: function(marker) {
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
        if (latLngOrBounds instanceof google.maps.LatLng) {
            bounds.extend(latLngOrBounds);
        } else if (latLngOrBounds instanceof google.maps.LatLngBounds) {
            bounds.union(latLngOrBounds);
        }
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

    offMapsBoundChange: function(token) {

    },

    getMapZoom: function(map) {
        return map.getZoom();
    },

    getMapBounds: function(map) {
        return map.getBounds();
    }
};