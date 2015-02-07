var wmu = require('./utils.js');
var Cluster = require('./cluster.js');
var States = Cluster.States;

wmu.extend(Cluster.prototype, {
    getContainedClustersAndConnections: function(bounds, zoom) {
        var clusters = [],
            connections = {},
            ancestors = this.getAncestors();

        for (var i = ancestors.length - 1; i >= 0; --i) {
            var ancestor = ancestors[i];
            if (ancestor && (ancestor._zoom + ancestor._zoomRange - 1) < zoom) {
                findConnections(ancestor, connections);
            }
        }

        search(this, bounds, zoom, clusters, connections);

        return {
            clusters: clusters,
            connections: flattenConnections(connections, zoom)
        };
    }
});

function search(self, bounds, zoom, clusters, connections) {

    if (!self._geo.boundsIntersects(self._bounds, bounds)) return;

    var inZoomRange = self.isInZoomRange(zoom) && self._state != States.Expanded;
    var atBottom = !self._children.length || self._state == States.Collapsed;

    if (atBottom || inZoomRange) {
        clusters.push(self);
    } else {
        findConnections(self, connections);

        for (var i = 0; i < self._children.length; ++i) {
            search(self._children[i], bounds, zoom, clusters, connections);
        }
    }

    return clusters;
}

function findConnections(cluster, connections) {
    for (var i = 0; i < cluster._connections.length; i++) {
        var connection = cluster._connections[i];
        var p1Connections = connections[connection._pointId1] = connections[connection._pointId1] || {};
        p1Connections[connection._pointId2] = connection;
    }
}

function flattenConnections(connections, zoom) {
    var flatConnections = [],
        ids = {},
        p1Connections, connectionChild, connection;

    for (var point1Id in connections) {
        if (!connections.hasOwnProperty(point1Id)) continue;
        p1Connections = connections[point1Id];
        for (var point2Id in p1Connections) {
            if (!p1Connections.hasOwnProperty(point2Id)) continue;
            connection = p1Connections[point2Id];
            if (!ids[connection._id]) {

                ids[connection._id] = true;
                flatConnections.push(connection);

                connection._displayCluster1 = connection._cluster._pointToChild[connection._pointId1];
                connection._displayCluster2 = connection._cluster._pointToChild[connection._pointId2];

                while (connectionChild = getConnectionChild(zoom, connection._displayCluster1, point1Id)) {
                    connection._displayCluster1 = connectionChild;
                }

                while (connectionChild = getConnectionChild(zoom, connection._displayCluster2, point2Id)) {
                    connection._displayCluster2 = connectionChild;
                }
            }
        }
    }
    return flatConnections;
}

function getConnectionChild(zoom, displayCluster1, point1Id) {
    var inZoomRange = displayCluster1.isInZoomRange(zoom) && displayCluster1._state !== States.Expanded;
    var atBottom = !displayCluster1._pointToChild[point1Id] || displayCluster1._state === States.Collapsed;
    if (!inZoomRange && !atBottom) {
        return displayCluster1._pointToChild[point1Id];
    }
}