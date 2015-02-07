(function() {

    var ids = 1;

    wm.Point = function(latLng, data) {
        if (latLng instanceof wm.Point) {
            return latLng;
        } else if (this instanceof wm.Point) {
            this._id = ids++;
            if (latLng instanceof google.maps.LatLng) {
                this._latLng = latLng;
                this._data = data;
            } else {
                this._latLng = latLng.latLng;
                this._data = latLng.data;
                this._sequence = latLng.sequence;
            }
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
