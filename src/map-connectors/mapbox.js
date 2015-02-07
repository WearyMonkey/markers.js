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
        bounds.extend(latLngOrBounds);
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
