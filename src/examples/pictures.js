(function() {
    var marcoPolo = [
        wm.Point(new google.maps.LatLng(45.4375,12.33583), {images: ['venice1', 'venice2']}), // 45°26′15″N 12°20′9″E venice 45.4375 12.3358
        wm.Point(new google.maps.LatLng(32.92778,35.08167), {images: ['acre1', 'acre2']}), // 32°55′40″N 35°04′54″E Acre
        wm.Point(new google.maps.LatLng(41,39.73333), {images: ['trabzon1', 'trabzon2']}), // 41°00′N 39°44′E Trebizond / Trabzon
        wm.Point(new google.maps.LatLng(33.33333,44.43333), {images: ['baghdad1', 'baghdad2']}), // 33°20′00″N 44°26′00″E Baghdad
        wm.Point(new google.maps.LatLng(36.19111,44.00917), {images: ['terbil1', 'terbil2']}), // 36°11′28″N 44°0′33″E Terbil / Erbil
        wm.Point(new google.maps.LatLng(27.18333,56.26667), {images: ['ormuz1']}), // 27°11′N 56°16′E Ormuz / Bandar Abbas
        wm.Point(new google.maps.LatLng(36.75,66.9), {images: ['balkh1']}), // 36°45′N 66°54′E Balkh
        wm.Point(new google.maps.LatLng(39.46667,75.98333), {images: ['kashgar1', 'kashgar2', 'kashgar3']}), // 39°28′N 75°59′E Kashgar
        wm.Point(new google.maps.LatLng(36.03333,103.8), {images: ['lanzhou1', 'lanzhou2']}), // 36°02′N 103°48′E Lanzhou
        wm.Point(new google.maps.LatLng(47.21028,102.84778), {images: ['karakorum1', 'karakorum2']}), // 47°12′37″N 102°50′52″E karakorum
        wm.Point(new google.maps.LatLng(39.91389,116.39167), {images: ['beijing1', 'beijing2', 'beijing3']}), // 39°54′50″N 116°23′30″E Beijing
        wm.Point(new google.maps.LatLng(30.65861,104.06472), {images: ['chengdu1']}), // 30°39′31″N 104°03′53″E Chengdu
        wm.Point(new google.maps.LatLng(21.16667,94.86667), {images: ['pagan1']}), // 21°10′N 94°52′E Pagan
        wm.Point(new google.maps.LatLng(30.25,120.16667), {images: ['hangzhou1', 'hangzhou2']}), // 30°15′N 120°10′E Hangzhou
        wm.Point(new google.maps.LatLng(1.28333,103.83333), {images: ['singapore1', 'singapore2', 'singapore3']}), // 1°17′N 103°50′E Singapore
        wm.Point(new google.maps.LatLng(27.18333,56.26667), {images: ['ormuz1']}), // 27°11′N 56°16′E Ormuz / Bandar Abbas
        wm.Point(new google.maps.LatLng(36.19111,44.00917), {images: ['terbil1', 'terbil2']}), // 36°11′28″N 44°0′33″E Terbil / Erbil
        wm.Point(new google.maps.LatLng(41,39.73333), {images: ['trabzon1', 'trabzon2']}), // 41°00′N 39°44′E Trebizond / Trabzon
        wm.Point(new google.maps.LatLng(41.0122,28.9760), {images: ['constantinople1']}) // 41.0122° N, 28.9760° E constantinople 41.0122 28.9760
    ];

    var mastHeadMap = new google.maps.Map(document.getElementById('masthead-map'), {
        center: { lat: 30, lng: 65},
        zoom: 3,
        "styles": [{"featureType":"landscape","stylers":[{"saturation":-100},{"lightness":65},{"visibility":"on"}]},{"featureType":"poi","stylers":[{"saturation":-100},{"lightness":51},{"visibility":"simplified"}]},{"featureType":"road.highway","stylers":[{"saturation":-100},{"visibility":"simplified"}]},{"featureType":"road.arterial","stylers":[{"saturation":-100},{"lightness":30},{"visibility":"on"}]},{"featureType":"road.local","stylers":[{"saturation":-100},{"lightness":40},{"visibility":"on"}]},{"featureType":"transit","stylers":[{"saturation":-100},{"visibility":"simplified"}]},{"featureType":"administrative.province","stylers":[{"visibility":"off"}]},{"featureType":"water","elementType":"labels","stylers":[{"visibility":"on"},{"lightness":-25},{"saturation":-100}]},{"featureType":"water","elementType":"geometry","stylers":[{"hue":"#ffff00"},{"lightness":-25},{"saturation":-97}]}]
    });

    google.maps.event.addListener(mastHeadMap, 'bounds_changed', function() {
        $("#masthead-map").attr('data-wm-zoom', mastHeadMap.getZoom())
    });

    function createMarkerEle(points) {
        var div = document.createElement('div');
        div.className = "wm-cluster";
        div.style.backgroundImage = 'url(assets/images/' + points[0].getData().images[0] + '.jpg)';
        return div;
    }

    google.maps.event.addListenerOnce(mastHeadMap, 'idle', function() {
        var markers = new wm.Markers(mastHeadMap, {
            mapConnector: wm.mapConnectors.google,
            createMarker: function(cluster) {
                var marker = new GoogleCustomMarker(createMarkerEle(cluster.getPoints()));

                google.maps.event.addListener(marker, "rightclick", function() {
                    markers.setClusterState(cluster, 'normal');
                });

                google.maps.event.addListener(marker, "click", function() {
                    markers.setClusterState(cluster, 'expanded');
                });

                return marker;
            },

            createPolyline: function() {
                return new google.maps.Polyline({
                    strokeColor: "#FF0000",
                    strokeOpacity: "0.5",
                    repeat: false
                });
            }
        });

        markers.addLine(marcoPolo, {addPoints: true});
    });
})();
