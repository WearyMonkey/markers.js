(function() {
    var bingMap = new Microsoft.Maps.Map(document.getElementById("bing-map"), {
        credentials:"Ap2wc7PXX3W7HJAJ5_sqOs2pngVo8SFwyGVTaUGm6oXAGJOnzJ8kwjmtO6HIX9l0",
        center: new Microsoft.Maps.Location(-33.86, 151.2094),
        zoom: 10
    });

    var bingMarkers = new wm.Markers(bingMap, {
        mapConnector: wm.mapConnectors.bing
    });

    bingMarkers.addLine([
        new Microsoft.Maps.Location(-27.4679, 153.0278),
        new Microsoft.Maps.Location(-33.86, 151.2094),
        new Microsoft.Maps.Location(-33.9167, 151.2500),
        new Microsoft.Maps.Location(-33.9121, 151.2629),
        new Microsoft.Maps.Location(-33.9461, 151.1772)
    ], {addPoints: true});
})();

