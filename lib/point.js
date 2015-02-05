(function() {

    var ids = 1;

    wm.Point = function(latLng, sequene, data) {
        if (this instanceof wm.Point) {
            this._id = ids++;
            if (latLng instanceof google.maps.LatLng) {
                this._latLng = latLng;
                this._data = data;
                this._sequence = sequene;
            } else {
                this._latLng = latLng.latLng;
                this._data = latLng.data;
                this._sequence = latLng.sequence;
            }
        } else {
            return new wm.Point(latLng, data);
        }
    };

    wm.Point.prototype.getLatLng = function() {
        return this._latLng;
    };

    wm.Point.prototype.getData = function() {
        return this._data;
    };

    wm.Point.prototype.getSequence = function() {
        return this._sequence;
    };
})();
