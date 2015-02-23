(function() {
    var mastHeadMap = new google.maps.Map(document.getElementById('google-map'), {
        center: { lat: -33.86, lng: 151.2094},
        zoom: 10
    });

    google.maps.event.addListenerOnce(mastHeadMap, 'idle', function() {
        var markers = new wm.Markers(mastHeadMap, {
            mapConnector: wm.mapConnectors.google
        });

        markers.addLine([
            new google.maps.LatLng(-27.4679, 153.0278),
            new google.maps.LatLng(-33.86, 151.2094),
            new google.maps.LatLng(-33.9167, 151.2500),
            new google.maps.LatLng(-33.9121, 151.2629),
            new google.maps.LatLng(-33.9461, 151.1772)
        ], {addPoints: true});
    });
})();