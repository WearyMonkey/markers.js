# Work in Progress

# Animated Marker Clusters

A library for adding animated marker clusters to Google, Mapbox or Bing maps.

[Demos](http://wearymonkey.github.io/animated-marker-clusters/)

## Features

* Clusters animate as they expand and collapse
* Muliple map provider support (Google, Bing, Mapbox and simlple to add more)
* Fast, handle 100,000's of markers, only draws what's visible
* Connect markers with lines that also animate
* No library dependencies
* Small, less than 5kb when gzipped
* Event hooks
* Expand and Collapse nodes programmatically

## Installation

```
bower install animated-marker-clusters
```

### Google

```html
<script type="text/javascript" src="https://maps.googleapis.com/maps/api/js?key=<key>"> </script>
<script src="bower_components/animated-marker-clusters/dist/markers.google.com"></script>

<script>
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
            new google.maps.LatLng(-33.86, 151.2094)
        ], {addPoints: true});
    });
</script>

```


### Bing
```html
<script charset="UTF-8" type="text/javascript" src="http://ecn.dev.virtualearth.net/mapcontrol/mapcontrol.ashx?v=7.0"></script>
<script src="bower_components/animated-marker-clusters/dist/markers.google.com"></script>

<script>
    var bingMap = new Microsoft.Maps.Map(document.getElementById("bing-map"), {
        credentials:"key",
        center: new Microsoft.Maps.Location(-33.86, 151.2094),
        zoom: 10
    });

    var bingMarkers = new wm.Markers(bingMap, {
        mapConnector: wm.mapConnectors.bing
    });

    bingMarkers.addLine([
        new Microsoft.Maps.Location(-27.4679, 153.0278),
        new Microsoft.Maps.Location(-33.86, 151.2094)
    ], {addPoints: true});
</script>
```

### Mapbox

```html
<script src='https://api.tiles.mapbox.com/mapbox.js/v2.1.5/mapbox.js'></script>
<script src="bower_components/animated-marker-clusters/dist/markers.google.com"></script>

<script>
    L.mapbox.accessToken = 'key';
    var mapBoxMap = L.mapbox.map('mapbox-map', 'examples.map-i86nkdio')
        .setView([-33.86, 151.2094], 10)
        .on('ready', function () {
            var markers = new wm.Markers(mapBoxMap, {
                mapConnector: wm.mapConnectors.mapbox
            });

            markers.addLine([
                L.latLng(-27.4679, 153.0278),
                L.latLng(-33.86, 151.2094)
            ], {addPoints: true});
        });
</script>
```