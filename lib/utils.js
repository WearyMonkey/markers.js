wmu = {
    deepGet: function(path, from, add) {
        var parts = path.split('.');
        for (var i = 0; i < parts.length && from != null; ++i) {
            if (!from[parts[i]] && add) {
                from[parts[i]] = {};
            }
            from = from[parts[i]];
        }
        return from;
    },

    distancePointsSquared: function(p1, p2) {
        return this.distanceLatLngsSquared(p1.lat(), p1.lng(), p2.lat(), p2.lng());
    },

    distanceLatLngsSquared: function(lat1, lng1, lat2, lng2) {
        var dx = lat1 - lat2;
        var dy = lng1 - lng2;
        return dx*dx+dy*dy;
    },

    addUnique: function(obj, key, val) {
        val = val || true;
        if (obj[key]) { // doesnt check for fasly properly for performance
            return false;
        } else {
            obj[key] = val;
            return true;
        }
    },

    setValue: function() {
        if (!arguments[0]) arguments[0] = {};
        var obj = arguments[0];
        for (var i = 1; i < arguments.length-2; ++i) {
            obj[arguments[i]] = obj[arguments[i]] || {};
            obj = obj[arguments[i]];
        }
        obj[arguments[arguments.length-2]] = arguments[arguments.length-1];
        return arguments[0];
    }
};