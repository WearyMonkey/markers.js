(function() {
    var Cluster = wm.Cluster,
        States = Cluster.States;

    wmu.extend(Cluster.prototype, {
        getContainedClustersAndConnections: function(bounds, zoom) {

            var result = {clusters:[], connections:{}},
                parent = this.getParent(),
                primary = true;

            if (parent) {
                var ancestors = [parent];
                while (ancestors[ancestors.length - 1]._parent) ancestors.push(ancestors[ancestors.length - 1]._parent);

                for (var i = ancestors.length - 1; i >= 0; --i) {
                    var ancestor = ancestors[i];
                    if (ancestor && (ancestor._zoom + ancestor._zoomRange - 1) < zoom) {
                        findConnections(ancestor, result.connections);
                    }
                }
            }


            search(this, bounds, zoom, parent, primary, result);

            result.connections = flattenConnections(result.connections, zoom);

            return result;
        }
    });

    function search(self, bounds, zoom, parent, primary, result) {

        var inZoomRange = self.isInZoomRange(zoom);
        var atBottom = !self._nodes.length;

        if (atBottom || (inZoomRange && self._state != States.Expanded) || self._state == States.Collapsed) {
            addCluster(self, bounds, result.clusters);
        } else {

            findConnections(self, result.connections);

            for (var i = 0; i < self._nodes.length; ++i) {
                var child = self._nodes[i];
                if (child._bounds.intersects(bounds)) {
                    search(child, bounds, zoom, self._zoomRange > 0 ? self : parent, primary, result);
                }
            }
        }

        return result;
    }

    function findConnections(cluster, connections) {
        var connection;

        for (var seq = 0; seq < cluster._connections.length; ++seq) {
            if (!(connection = cluster._connections[seq])) continue;
            //if (!connection.bounds.intersects(bounds)) continue; this could have some performance benifits

            // Every sequence has two connections, e.g. seq 3 has connection 2->3 and 3->4
            // seq here is the lower sequence, so if seq is 3, the connection is between 3 and 4
            // so in the below we store connection under gC[3][4], gC[4][3]
            connections[seq] = connections[seq] || {};
            connections[seq + 1] = connections[seq + 1] || {};

            connections[seq][seq + 1] = connection;
            connections[seq + 1][seq] = connection;
        }
    }

    function flattenConnections(connections, zoom) {
        var flatConnections = [],
            ids = {},
            seqConnections;

        for (var sequence in connections) {
            if (!connections.hasOwnProperty(sequence)) continue;
            seqConnections = connections[sequence];
            for (var otherSequence in seqConnections) {
                if (!seqConnections.hasOwnProperty(otherSequence)) continue;
                var connection = seqConnections[otherSequence];
                if (!ids[connection._id]) {

                    ids[connection._id] = true;
                    flatConnections.push(connection);

                    connection._displayCluster1 = connection._cluster1;
                    connection._displayCluster2 = connection._cluster2;

                    var sequence1 = Math.min(sequence, otherSequence);
                    var sequence2 = Math.max(sequence, otherSequence);
                    var displayCluster1 = connection._displayCluster1;
                    var displayCluster2 = connection._displayCluster2;

                    while ((!displayCluster1.isInZoomRange(zoom) || displayCluster1._state === States.Expanded) && displayCluster1._sequenceToChild[sequence1] && displayCluster1._state !== States.Collapsed) {
                        displayCluster1 = connection._displayCluster1 = displayCluster1._sequenceToChild[sequence1];
                    }

                    while ((!displayCluster2.isInZoomRange(zoom) || displayCluster2._state === States.Expanded) && displayCluster2._sequenceToChild[sequence2] && displayCluster2._state !== States.Collapsed) {
                        displayCluster2 = connection._displayCluster2 = displayCluster2._sequenceToChild[sequence2];
                    }
                }
            }

        }
        return flatConnections;
    }

    function addCluster(cluster, bounds, result) {
        if (!bounds.intersects(cluster.getBounds())) return false;
        result.push(cluster);
        return true;
    }
})();