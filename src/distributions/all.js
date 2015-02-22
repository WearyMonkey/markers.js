window.wm = {
    Markers: require('./../markers.js'),
    Point: require('./../point.js'),
    Line: require('./../line.js'),
    mapConnectors: {
        mapbox: require('./../map-connectors/mapbox.js'),
        google: require('./../map-connectors/google.js'),
        bing: require('./../map-connectors/bing.js')
    }
};