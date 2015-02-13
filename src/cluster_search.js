var wmu = require('./utils.js');
var Cluster = require('./cluster.js');

wmu.extend(Cluster.prototype, {
    getContainedClustersAndConnections: function(bounds, zoom, prevZoom, expandField, preExpandField) {
        var clusters = [],
            connections = [],
            ancestors = this.getAncestors();

        for (var i = ancestors.length - 1; i >= 0; --i) {
            var ancestor = ancestors[i];
            if (ancestor && (ancestor._zoom + ancestor._zoomRange - 1) < zoom) {
                findConnections(ancestor, connections);
            }
        }

        if (this._geo.boundsIntersects(this._bounds, bounds)) {
            search(this, null, 0, 0, bounds, false, prevZoom, zoom, expandField, preExpandField, clusters, connections);
        }

        return {
            clusters: clusters,
            connections: connections
        };
    }
});

function search(cluster, parent, prevExpandDepth, expandDepth, bounds, isPointId, prevZoom, zoom, expandField, preExpandField, clusters, connections) {
    expandDepth = Math.max(cluster[expandField] != null ? cluster[expandField] : cluster[preExpandField], expandDepth - 1, 0);
    prevExpandDepth = Math.max(cluster[preExpandField] != null ? cluster[preExpandField] : cluster[expandField], prevExpandDepth - 1, 0);

    var inZoomRange = (cluster._zoom + cluster._zoomRange - 1) >= zoom && expandDepth == 0;
    var atBottom = !cluster._children.length || cluster._expandDepth == -1;

    if (atBottom || inZoomRange) {
        clusters.push({cluster: cluster, parent: parent});
    } else {
        if ((cluster._zoom + cluster._zoomRange - 1) >= prevZoom && prevExpandDepth == 0) {
            parent = cluster;
        }

        if (connections) {
            findConnections(cluster, parent, prevExpandDepth, expandDepth, prevZoom, zoom, expandField, preExpandField, connections);
        }

        for (var i = 0; i < cluster._children.length; ++i) {
            var child = cluster._children[i];
            if ((isPointId && child._points[bounds]) || (!isPointId && cluster._geo.boundsIntersects(child._bounds, bounds))) {
                search(child, parent, prevExpandDepth, expandDepth, bounds, isPointId, prevZoom, zoom, expandField, preExpandField, clusters, connections);
            }
        }
    }

    return clusters;
}

function findConnections(cluster, parent, prevExpandDepth, expandDepth, prevZoom, zoom, expandField, preExpandField, connections) {
    for (var i = 0; i < cluster._connections.length; i++) {
        var connection = cluster._connections[i];
        connection._displayCluster1 = search(connection._cluster1, parent, prevExpandDepth, expandDepth, connection._pointId1, true, prevZoom, zoom, expandField, preExpandField, [])[0];
        connection._displayCluster2 = search(connection._cluster2, parent, prevExpandDepth, expandDepth, connection._pointId2, true, prevZoom, zoom, expandField, preExpandField, [])[0];
        connections.push(connection);
    }
}