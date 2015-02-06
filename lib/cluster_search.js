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
                while (ancestors[ancestors.length - 1].parent) ancestors.push(ancestors[ancestors.length - 1].parent);

                for (var i = ancestors.length - 1; i >= 0; --i) {
                    var ancestor = ancestors[i];
                    if (ancestor && (ancestor.zoom + ancestor.zoomRange - 1) < zoom) {
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
        var atBottom = !self.nodes.length;

        if (atBottom || (inZoomRange && self.state != States.Expanded) || self.state == States.Collapsed) {
            addCluster(self, bounds, result.clusters);
        } else {

            findConnections(self, result.connections);

            for (var i = 0; i < self.nodes.length; ++i) {
                var child = self.nodes[i];
                if (child.bounds.intersects(bounds)) {
                    search(child, bounds, zoom, self.zoomRange > 0 ? self : parent, primary, result);
                }
            }
        }

        return result;
    }

    function findConnections(cluster, connections) {
        var connection;

        for (var seq = 0; seq < cluster.connections.length; ++seq) {
            if (!(connection = cluster.connections[seq])) continue;
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
                if (!ids[connection.id]) {
                    ids[connection.id] = true;
                    flatConnections.push(connection);
                    connection.displayCluster1 = connection.cluster1;
                    connection.displayCluster2 = connection.cluster2;
                    var sequence1 = Math.min(sequence, otherSequence);
                    var sequence2 = Math.max(sequence, otherSequence);
                    while ((!connection.displayCluster1.isInZoomRange(zoom) || connection.displayCluster1.state === States.Expanded) && connection.displayCluster1.sequenceToChild[sequence1] && connection.displayCluster1.state !== States.Collapsed)
                        connection.displayCluster1 = connection.displayCluster1.sequenceToChild[sequence1];
                    while ((!connection.displayCluster2.isInZoomRange(zoom) || connection.displayCluster2.state === States.Expanded) && connection.displayCluster2.sequenceToChild[sequence2] && connection.displayCluster2.state !== States.Collapsed) {
                        connection.displayCluster2 = connection.displayCluster2.sequenceToChild[sequence2];
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