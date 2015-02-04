//steal(
//    "./cluster.js"
//).then(function () {

        var Cluster = wm.Cluster,
            States = Cluster.States;

        Cluster.prototype.getContainedClustersAndConnections = function (bounds, zoom, groups) {

            var result = {clusters:[], connections:{}},
                parent = this.getParent(),
                primary = true,
                groupsCount = 0;

            groups = normaliseGroups(this, groups);

            forEachGroup(this, groups, function () {
                ++groupsCount;
            });

            if (parent) {
                var ancestors = [parent];
                while (ancestors[ancestors.length - 1].parent) ancestors.push(ancestors[ancestors.length - 1].parent);

                for (var i = ancestors.length - 1; i >= 0; --i) {
                    var ancestor = ancestors[i];
                    if (ancestor && (ancestor.zoom + ancestor.zoomRange - 1) < zoom) {
                        forEachGroup(ancestor, groups, function (group) {
                            findConnections(group, result.connections);
                        });
                    }
                }
            }


            search(this, bounds, zoom, groups, groupsCount, parent, primary, result);

            result.connections = flattenConnections(result.connections, zoom);

            return result;
        };

        function search(self, bounds, zoom, groups, groupsCount, parent, primary, result) {
            var inZoomRange = self.isInZoomRange(zoom);
            var beforeZoomRange = (self.zoom + self.zoomRange - 1) < zoom;

            var atBottom = !self.nodes.length;

            var remainingGroups = groups;
            var remainingGroupsCount = groupsCount;
            var expandedGroups = {};
            var expandedGroupsCount = 0;


            var mostPopularGroup = null,
                highestStory = null,
                setPrimary = primary;

            if (self.settings.connections || self.settings.statesEnabled || inZoomRange) {
                forEachGroup(self, groups, function (group) {
                    //todo track popularity properly
                    mostPopularGroup = group;

                    if (atBottom) {
                        if (addGroup(group, bounds, result.clusters)) primary = false;
                    } else if (group.state == States.Collapsed) {
                        addGroup(group, bounds, result.clusters);
                        if (remainingGroups == groups) remainingGroups = $.extend(true, {}, groups);
                        remainingGroups[group.groupType][group.groupId] = false;
                        --remainingGroupsCount;

                    } else if (group.state == States.Expanded && inZoomRange) {
                        $.setValue(expandedGroups, group.groupType, group.groupId, true);
                        ++expandedGroupsCount;

                    } else if (inZoomRange) {
                        if (addGroup(group, bounds, result.clusters)) primary = false;
                    }

                    if ((beforeZoomRange || group.state === States.Expanded) && group.state !== States.Collapsed) {
                        findConnections(group, result.connections);
                    }
                })
            }

            if (setPrimary && mostPopularGroup) {
                mostPopularGroup.primary = true;
            }

            if (inZoomRange) {
                remainingGroups = expandedGroups;
                remainingGroupsCount = expandedGroupsCount
            }

            if (remainingGroupsCount > 0) {
                for (var i = 0; i < self.nodes.length; ++i) {
                    var child = self.nodes[i];
                    if (child.bounds.intersects(bounds)) {
                        search(child, bounds, zoom, remainingGroups, remainingGroupsCount, self.zoomRange > 0 ? self : parent, primary, result);
                    }
                }
            }

            return result;
        }

        function findConnections(group, connections) {
            var groupConnections = wmu.deepGet(group.groupType + "." + group.groupId, connections, true),
                connection;
            for (var seq = 0; seq < group.connections.length; ++seq) {
                if (!(connection = group.connections[seq])) continue;
                //if (!connection.bounds.intersects(bounds)) continue; this could have some performance benifits

                // Every sequence has two connections, e.g. seq 3 has connection 2->3 and 3->4
                // seq here is the lower sequence, so if seq is 3, the connection is between 3 and 4
                // so in the below we store connection under gC[3][4], gC[4][3]
                groupConnections[seq] = groupConnections[seq] || {};
                groupConnections[seq + 1] = groupConnections[seq + 1] || {};

                groupConnections[seq][seq + 1] = connection;
                groupConnections[seq + 1][seq] = connection;
            }
        }

        function flattenConnections(connections, zoom) {
            var flatConnections = [];
            var ids = {};
            $.each(connections, function (groupType, groups) {
                $.each(groups, function (groupId, groupConnections) {
                    $.each(groupConnections, function (sequence, seqConnections) {
                        for (var otherSequence in seqConnections) {
                            var connection = seqConnections[otherSequence];
                            if (!ids[connection.id]) {
                                ids[connection.id] = true;
                                flatConnections.push(connection);
                                connection.displayGroup1 = connection.group1;
                                connection.displayGroup2 = connection.group2;
                                var sequence1 = Math.min(sequence, otherSequence);
                                var sequence2 = Math.max(sequence, otherSequence);
                                while ((!connection.displayGroup1.cluster.isInZoomRange(zoom) || connection.displayGroup1.state === States.Expanded) && connection.displayGroup1.sequenceToChild[sequence1] && connection.displayGroup1.state !== States.Collapsed)
                                    connection.displayGroup1 = connection.displayGroup1.sequenceToChild[sequence1];
                                while ((!connection.displayGroup2.cluster.isInZoomRange(zoom) || connection.displayGroup2.state === States.Expanded) && connection.displayGroup2.sequenceToChild[sequence2] && connection.displayGroup2.state !== States.Collapsed) {
                                    connection.displayGroup2 = connection.displayGroup2.sequenceToChild[sequence2];
                                }
                            }
                        }
                    });
                });
            });
            return flatConnections;
        }

        function addGroup(group, bounds, result) {
            if (!bounds.intersects(group.getBounds())) return false;
            result.push(group);
            return true;
        }

        function forEachGroup(cluster, groups, fn) {
            var c = 0;
            if (!groups) {
                c = 1;
                fn(cluster);
            } else {
                $.each(groups, function (groupType, groupIds) {
                    $.each(cluster.groups[groupType], function (id, group) {
                        if (groupIds[id]) {
                            ++c;
                            fn(group);
                        }
                    });
                });
            }
            return c;
        }

        function normaliseGroups(self, groups) {
            var groupsObj = {}, groupType, i;

            if (groups == null) {
                return null;
            } else if ($.isArray(groups)) {
                for (i = 0; i < groups.length; i++) {
                    groupType = groups[i].replace(/\./g, ":");
                    groupsObj[groupType] = {};
                    $.each(self.groups[groupType], function (id) {
                        groupsObj[groupType][id] = true;
                    });
                }
            } else if (groups != null && typeof groups == "object") {
                for (groupType in groups) groupsObj[groupType.replace(/\./g, ":")] = normaliseGroupIds(groups[groupType]);
            }
            return groupsObj;
        }

        function normaliseGroupIds(groupIds) {
            if (groupIds == null) return {};
            else if ($.isArray(groupIds)) return $.mapObj(groupIds);
            else if (typeof groupIds == "object") return groupIds;
            else return $.mapObj([groupIds])
        }
    //});