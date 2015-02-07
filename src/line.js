var Point = require('./point');
var wmu = require('./utils.js');

var ids = 1;

var Line = function(points, data) {
    if (points instanceof Line) {
        return points;
    } else if (this instanceof Line) {
        this._id = ids++;
        this._points = copyPoints(points);
        this._data = data;
    } else {
        return new Line(points, data);
    }
};

wmu.extend(Line.prototype, {
    getPoints: function() {
        return this._points;
    },
    getData: function() {
        return this._data;
    }
});

function copyPoints(points) {
    var copy = [];
    for (var i = 0; i < points.length; ++i) {
        copy.push(Point(points[i]));
    }
    return copy;
}

module.exports = Line;

