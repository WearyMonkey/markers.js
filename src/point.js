var wmu = require('./utils.js');

var ids = 1;

var Point = function(latLng, data) {
    if (latLng instanceof Point) {
        return latLng;
    } else if (this instanceof Point) {
        this._id = ids++;
        this._latLng = latLng;
        this._data = data;
    } else {
        return new Point(latLng, data);
    }
};

wmu.extend(Point.prototype, {
    getLatLng: function() {
        return this._latLng;
    },
    getData: function() {
        return this._data;
    }
});

module.exports = Point;