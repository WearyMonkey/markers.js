# Markers.js

A library for adding animated marker clusters to Google, Mapbox or Bing maps.

[Demos](http://wearymonkey.github.io/markers.js)

- [Features](#features)
- [API](#api)
    - [wm.Markers](#wmmarker)
    - [wm.Point](#wmpoint)
    - [wm.Line](#wmline)
    - [wm.Cluster](#wmcluster)
- [Installation](#installation)
    - [Google](#google)
    - [Bing](#bing)
    - [Mapbox](#mapbox)
- [Licensing](#licensing)

## Features

* Clusters animate as they expand and collapse
* Muliple map provider support (Google, Bing, Mapbox and simlple to add more)
* Fast, handle 100,000s of markers, only draws what's visible
* Connect markers with lines that also animate
* No library dependencies
* Small, less than 5kb when gzipped
* Event hooks
* Expand and Collapse nodes programmatically
* Customisable markers and polylines

## API

### wm.Markers

The main class for adding animated markers and lines to the map.

#### Constructor

```javascript
var markers = new wm.Markers(map, options)
```

* `map`: The google, bing or mapbox map
* `options.createMarker`: A function for creating map markers for a cluster, defaults to the map providers default marker. See more details below.
* `options.createPolyline`: A function for creating map polylines for a line, defaults to the map providers default polyline. See more details below.

##### options.createMarker

A function that takes a `wm.Cluster` and returns a map marker, e.g. a `google.maps.Marker` for google, a `L.marker` for Mapbox or a `Microsoft.Maps.Pushpin` for Bing. This  method can be used for creating custom markers, e.g. images, HTML etc. The setting of the marker location is handled by wm.Markers. The passed in `wm.Cluster` can be used for retrieving the amount of points represented by the marker, and their data. See the `wm.Cluster` docs for more details.

e.g.

```javascript
createMarker: function (cluster) {
	return new google.maps.Marker();
}
```

##### options.createPolyline

A function that takes a `wm.Line` and returns a map polyline, e.g. a `google.maps.Polyline` for google, a `L.polyline` for Mapbox or a `Microsoft.Maps.Polyline` for Bing. This function can be used for creating custom polylines, e.g. setting the color and style. 

e.g. 
```javascript
createPolyline: function(line) {
	return new google.maps.Polyline();
}

```

#### addPoints

```javascript
markers.addPoints(points)
```

* `Points`: An array of `wm.Point`s or the map providers Latitude longitude class, e.g. `google.maps.LatLng`

Returns an array of `wm.Points` that were added.

#### removePoints
```javascript
markers.removePoints(points)
```
* `Points`: An array of `wm.Point`s

#### addLine
```javascript
markers.addLine(line, options)
```

* `line`: Either a `wm.Line`, array of `wm.Points` or array of the map providers latitude longitude class e.g. `google.maps.LatLng`. A line will be drawn between clusters containing the given points.
* `options.addPoints`: (default `false`), if true, the points contained in the line will be added before adding the line.

Returns the added `wm.Line`, either the original passed in or the one created from the array of points.

#### removeLine
```javascript
markers.removeLine(line)
```

* `line`: the `wm.Line` to remove
* `options.removePoints`" (default `false`), if true, the points contained in the line will also be removed.


### wm.Point

Represents a latitude and longitude on the map that will be clustered. It can contain a data object which can store any developer info required, e.g. thumbnails, labels etc.

#### Constructor
```javascript
var point = new wm.Point(latLng, data);
```
* `latLng`: The map providers latitude longitude class, e.g. a `google.maps.LatLng` for google, a `L.latLng` for Mapbox or a `Microsoft.Maps.Location` for Bing.
* `data`: A value that can be later retrieved with `getData`

#### getLatLng
```javascript
point.getLatLng()
```

Returns the latitude longitude value originaly provided in the constructor.

#### getData
```javascript
point.getData()
```

Returns the data value originaly provided in the constructor.

### wm.Line

Represents a series of points that will connected by a line. The line verticies will be clustered and animated as theh user zooms in and out.

#### Constructor
```javascript
var line = new wm.Line(points, data);
```
* `points`: An array of `wm.Points` or the map providers latitude longitude class, e.g. `google.maps.LatLng`
* `data`: A value associated with the line that can be retrieved with `getData`

#### getPoints
```
var points = line.getPoints();
```

Returns the array of `wm.Point`s

#### getData
```
var data = line.getData();
```

Returns the associated data originally passed in the constructor

### wm.Cluster

Represents a group of wm.Points and wm.Lines that have been clustered together. `wm.Cluster`s are created by `wm.Marker`
and are not created directly by the developer.

#### getBounds

Returns the bounds of the contained points, e.g. a `google.maps.Bounds`

#### getCenter

Returns the latitude longitude center of the cluster bounds, e.g. a `google.maps.LatLng`

#### getDisplayCenter

Returns the latitude longitude of where the cluster will be drawn. This may be different from center if centering mode
of `wm.Marker` is not `bounds-center`. e.g. a `google.maps.LatLng`.

#### getPoints

Returns an array of  `wm.Point`s contained in the cluster.

#### getMarker

Returns the marker used to represent the cluster on the map, originally created by the `createMarker` function. May be
`null` if the cluster is not currently visible. E.g., a `google.maps.Marker`

#### getParent

Returns the parent `wm.Cluster`

#### getZoomRange

Returns the zoom levels that this cluster is visible at.
```javascript
{
    from: <the lowest zoom level the cluster is visible e.g. 0>,
    to: <the highest zoom level the cluster is visible e.g. 5>
}
```

## Installation

```
bower install markersjs
```

### Google

```html
<script type="text/javascript" src="https://maps.googleapis.com/maps/api/js?key=<key>"> </script>
<script src="bower_components/markers.js/dist/markers.google.com"></script>

<script>
    var mastHeadMap = new google.maps.Map(document.getElementById('google-map'), {
        center: { lat: -33.86, lng: 151.2094},
        zoom: 10
    });

    google.maps.event.addListenerOnce(mastHeadMap, 'idle', function() {
        var markers = new wm.Markers(mastHeadMap);

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
<script src="bower_components/markers.js/dist/markers.google.com"></script>

<script>
    var bingMap = new Microsoft.Maps.Map(document.getElementById("bing-map"), {
        credentials:"key",
        center: new Microsoft.Maps.Location(-33.86, 151.2094),
        zoom: 10
    });

    var bingMarkers = new wm.Markers(bingMap);

    bingMarkers.addLine([
        new Microsoft.Maps.Location(-27.4679, 153.0278),
        new Microsoft.Maps.Location(-33.86, 151.2094)
    ], {addPoints: true});
</script>
```

### Mapbox

```html
<script src='https://api.tiles.mapbox.com/mapbox.js/v2.1.5/mapbox.js'></script>
<script src="bower_components/markers.js/dist/markers.google.com"></script>

<script>
    L.mapbox.accessToken = 'key';
    var mapBoxMap = L.mapbox.map('mapbox-map', 'examples.map-i86nkdio')
        .setView([-33.86, 151.2094], 10)
        .on('ready', function () {
            var markers = new wm.Markers(mapBoxMap);

            markers.addLine([
                L.latLng(-27.4679, 153.0278),
                L.latLng(-33.86, 151.2094)
            ], {addPoints: true});
        });
</script>
```

## Licensing

MIT (http://www.opensource.org/licenses/mit-license.php)