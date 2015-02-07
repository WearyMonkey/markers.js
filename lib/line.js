(function() {

    var ids = 1;

    wm.Line = function(points, data) {
        if (points instanceof wm.Line) {
            return points;
        } else if (this instanceof wm.Line) {
            this._id = ids++;
            if (typeof points.length === 'number') {
                this._points = copyPoints(points);
                this._data = data;
            } else {
                this._points = copyPoints(points.points);
                this._data = points.data;
            }
        } else {
            return new wm.Line(points, data);
        }
    };

    wmu.extend(wm.Line.prototype, {
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
            copy.push(wm.Point(points[i]));
        }
        return copy;
    }
})();
