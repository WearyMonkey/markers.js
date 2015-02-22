(function() {
    L.mapbox.accessToken = 'pk.eyJ1Ijoid2Vhcnltb25rZXkiLCJhIjoiT1FwMnFrRSJ9.S_x0lt1SAs--0W0tVTkJtw';
    var mapBoxMap = L.mapbox.map('mapbox-map', 'examples.map-i86nkdio')
        .setView([-33.86, 151.2094], 10)
        .on('ready', function () {
            var markers = new wm.Markers(mapBoxMap, {
                mapConnector: wm.mapConnectors.mapbox
            });

            markers.addLine([
                L.latLng(-27.4679, 153.0278),
                L.latLng(-33.86, 151.2094),
                L.latLng(-33.9167, 151.2500),
                L.latLng(-33.9121, 151.2629),
                L.latLng(-33.9461, 151.1772)
            ], {addPoints: true});
        });
})();