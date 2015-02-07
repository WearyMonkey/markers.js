(function() {

    var ids = 1;

    wm.Point = function(latLng, data) {
        if (latLng instanceof wm.Point) {
            return latLng;
        } else if (this instanceof wm.Point) {
            this._id = ids++;
            if (latLng instanceof L.LatLng) {
                this._latLng = latLng;
                this._data = data;
            } else {
                this._latLng = latLng.latLng;
                this._data = latLng.data;
            }
            var parsedLatLng = wm.mapConnectors.mapBox.getLatLng(this._latLng);
            this._lat = parsedLatLng._lat;
            this._lng = parsedLatLng._lng;
        } else {
            return new wm.Point(latLng, data);
        }
    };

    wmu.extend(wm.Point.prototype, {
        getLatLng: function() {
            return this._latLng;
        },
        getData: function() {
            return this._data;
        }
    });
})();
