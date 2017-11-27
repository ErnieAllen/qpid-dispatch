/*
Licensed to the Apache Software Foundation (ASF) under one
or more contributor license agreements.  See the NOTICE file
distributed with this work for additional information
regarding copyright ownership.  The ASF licenses this file
to you under the Apache License, Version 2.0 (the
"License"); you may not use this file except in compliance
with the License.  You may obtain a copy of the License at

  http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing,
software distributed under the License is distributed on an
"AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
KIND, either express or implied.  See the License for the
specific language governing permissions and limitations
under the License.
*/
/**
 * @module QDR
 */
var QDR = (function(QDR) {

  /**
   * @method TopologyController
   *
   * Controller that handles the QDR topology page
   */
  QDR.module.controller("QDR.TopologyController", ['$scope', '$rootScope', 'QDRService', '$location', '$timeout', '$uibModal',
    function($scope, $rootScope, QDRService, $location, $timeout, $uibModal) {

      var address = '/policy'

      var Group = function (d, name, parent) {
        c = angular.copy(d)
        c.name = name
        c.parent = parent
        c.type = 'group'
        return c
      }

      var VHost = function (d, schema) {
        this.name = d.id
        this.parent = 'Policy'
        this.type = 'vhost'
        for (var attr in d) {
          if (schema.entityTypes.vhost.attributes[attr] && attr !== 'id') {
            if (attr === 'groups') {
              this.children = []
              for (var group in d['groups']) {
                this.children.push(new Group(d[attr][group], group, this.name))
              }
              this.children.push(new Group({add: true}, '', this.name))
            } else
              this[attr] = d[attr]
          }
        }
      }

      var Adapter = function () {}
      Adapter.treeFromDB = function (dbModel, schema) {
        var policy = dbModel['policy']
        var vhosts = dbModel['vhosts']
        var treeModel = {data: [], level: 'policy'}

        // no policy, use 1st (and only) vhost as tree root
        if (policy.empty || true) {
          treeModel.level = 'vhost'
          treeModel.data = new VHost(vhosts[0], schema)
        } else {
          policy.name = 'Policy'
          policy.type = 'policy'
          policy.children = []

          for (var i=0; i<vhosts.length; i++) {
            policy.children.push(new VHost(vhosts[i], schema))
          }
          var addVhost = new VHost({id: ''}, schema)
          addVhost.add = true
          policy.children.push(addVhost)

          treeModel.data = policy
        }
        return treeModel
      }

      Adapter.DBFromTree = function (treeModel, schema) {
        var DBModel = {policy: this.policyCopy(treeModel, schema)}
        DBModel.vhosts = []
        for (var i=0; i<treeModel.children.length; ++i) {
          if (!treeModel.children[i].add)
            DBModel.vhosts.push(this.vhostCopy(treeModel.children[i], schema))
        }
        return DBModel
      }
      Adapter.policyCopy = function (d, schema) {
        var c = {}
        for (var attr in d) {
          if (schema.entityTypes.policy.attributes[attr] && attr !== 'name')
            c[attr] = d[attr]
        }
        return c
      }
      Adapter.vhostCopy = function (d, schema) {
        var c = {groups: {}}
        for (var attr in d) {
          if (attr === 'children') {
            for (var i=0; i<d.children.length; i++) {
              if (!d.children[i].add) {
                var group = this.groupCopy(d.children[i], schema)
                var groupName = Object.keys(group)[0]
                c.groups[groupName] = group[groupName]
              }
            }
          } else if (schema.entityTypes.vhost.attributes[attr]) {
            if (attr !== 'id') {
              if (attr === 'name')
                c['id'] = d[attr]
              else
                c[attr] = d[attr]
            }
          }
        }
        return c
      }
      Adapter.groupCopy = function (d, schema) {
        var groupName = d.name
        var c = {}
        c[groupName] = {}
        for (var attr in d) {
          if (attr !== 'name') {
            if (schema.entityTypes.group.attributes[attr]) {
              c[groupName][attr] = d[attr]
            }
          }
        }
        return c
      }

      var schema;
      var treeData;
      QDRService.management.connection.addConnectAction( function () {
        QDR.log.info("connected to dispatch network on " + host + ":" + port)

        QDRService.management.getSchema(function () {
          schema = QDRService.management.schema()
          delete schema.entityTypes.policy.attributes.policyDir
          schema.entityTypes['group'] = {
            attributes: {
              name: {
                'default': '',
                type: 'string',
                description: 'The name for this group'
              },
              users: {
                'default': "",
                type: 'string',
                description: 'Comma separated list of authenticated users in this group.'
              },
              remoteHosts: {
                'default': "",
                type: 'string',
                description: 'List of remote hosts from which the users may connect. List values may be host names, numeric IP addresses, numeric IP address ranges, or the wildcard *. An empty list denies all access.'
              },
              maxFrameSize: {
                'default': "2^31-1",
                type: 'integer',
                description: 'Largest frame that may be sent on this connection. (AMQP Open, max-frame-size)'
              },
              maxSessions: {
                'default': 65535,
                type: 'integer',
                description: 'Maximum number of sessions that may be created on this connection. (AMQP Open, channel-max)'
              },
              maxSessionWindow: {
                'default': '2^31-1',
                type: 'integer',
                description: 'Incoming capacity for new sessions. (AMQP Begin, incoming-window)'
              },
              maxMessageSize: {
                'default': '0 (no limit)',
                type: 'integer',
                description: 'Largest message size supported by links created on this connection. If this field is zero there is no maximum size imposed by the link endpoint. (AMQP Attach, max-message-size)'
              },
              maxSenders: {
                'default': '2^31-1',
                type: 'integer',
                description: 'Maximum number of sending links that may be created on this connection.'
              },
              maxReceivers: {
                'default': '2^31-1',
                type: 'integer',
                description: 'Maximum number of receiving links that may be created on this connection.'
              },
              allowDynamicSource: {
                'default': false,
                type: 'boolean',
                description: 'This connection is allowed to create receiving links using the Dynamic Link Source feature.'
              },
              allowAnonymousSender: {
                'default': false,
                type: 'boolean',
                description: 'This connection is allowed to create sending links using the Anonymous Sender feature.'
              },
              allowUserIdProxy: {
                'default': false,
                type: 'boolean',
                description: 'This connection is allowed to send messages with a user_id property that differs from the connection’s authenticated user id.'
              },
              sources: {
                'default': '',
                type: 'string',
                description: 'List of Source addresses allowed when creating receiving links. This list may be expressed as a CSV string or as a list of strings. An empty list denies all access.'
              },
              targets: {
                'default': '',
                type: 'string',
                description: 'List of Target addresses allowed when creating sending links. This list may be expressed as a CSV string or as a list of strings. An empty list denies all access.'
              }
            }
          }
          console.log("got schema")
          QDRService.management.connection.send([], address, "GET-POLICY")
            .then( function (success) {
              console.log("got initial policy tree")
              treeModel = Adapter.treeFromDB(success.response, schema)
              treeData = treeModel.data
              $scope.topLevel = treeModel.level
              if ($scope.topLevel === 'vhost')
                $('.legend.policy').css('display', 'none')
              initTree($scope.topLevel)
            }, function (error) {
              Core.notification("error", "unable to get initial policy")
            })
        })

      })
      var host = $location.host()
      var port = $location.port()
      var connectOptions = {address: host, port: port, reconnect: true}
      QDRService.management.connection.connect(connectOptions)

      $scope.formMode = 'edit'
      $scope.showForm = 'policy'

/*
      policy = {
          <global settings>
      }

      vhost = {
          id: vhost-name
          <connection limits>
          groups: {
              group-name: {
                  <user group settings>
              }
          }
      }
*/
      $scope.savePolicy = function () {
        var DBModel = Adapter.DBFromTree(treeData, schema)
        QDRService.management.connection.send(DBModel, address, "SAVE-POLICY")
          .then( function (success_response) {
            console.log(success_response.response)
            Core.notification("success", "saved policy")
          }, function (error_response) {
            Core.notification("error", "save policy failed")
          })
      }

      var initTree = function (level) {
        // association of classes with shapes
        var classesMap = {
            add: "cross",
            policy: "circle",
            vhost: "square",
            group: "diamond"
        }

        var tmargin = {top: 20, right: 120, bottom: 20, left: 80},
          twidth = 600 - tmargin.right - tmargin.left,
          theight = 500 - tmargin.top - tmargin.bottom;

        var ti = 0,
          duration = 750,
          root;

        var tree = d3.layout.tree()
          .size([theight, twidth]);

        var diagonal = d3.svg.diagonal()
          .projection(function(d) { return [d.y, d.x]; });

        var tsvg = d3.select("#topology").append("svg")
          .attr("width", twidth + tmargin.right + tmargin.left)
          .attr("height", theight + tmargin.top + tmargin.bottom)
          .append("g")
          .attr("transform", "translate(" + tmargin.left + "," + tmargin.top + ")");

        root = treeData;
        root.x0 = theight / 2;
        root.y0 = 0;

        update(root);
        d3.select('g.'+level).classed('selected', true)
        $timeout( function () {
          $scope.showForm = level
          $scope.formData = root
          $scope.shadowData = angular.copy(root)
          $('.all-forms :input:visible:enabled:first').focus()
        })

        d3.select(self.frameElement).style("height", "500px");

        function update(source) {

          // Compute the new tree layout.
          var tnodes = tree.nodes(root).reverse(),
            tlinks = tree.links(tnodes);

          // Normalize for fixed-depth.
          tnodes.forEach(function(d) { d.y = d.depth * 180; });

          // Update the nodes…
          var tnode = tsvg.selectAll("g.node")
            .data(tnodes, function(d) { return d.id || (d.id = ++ti); });

          // Enter any new nodes at the parent's previous position.
          var nodeEnter = tnode.enter().append("g")
            .attr("class", function (d) {return "node " + d.type + (d.add ? " add" : '')})
            .attr("transform", function(d) { return "translate(" + source.y0 + "," + source.x0 + ")"; })
            .on("click", click)

          // use a shape for a node depending on its class
          nodeEnter.append("path")
            //.style("stroke", "black")
            //.style("fill", "white")
            .attr("d", d3.svg.symbol()
                 .size(200)
                 .type(function(d) {
                    //if (d.add)
                    //  return classesMap['add']
                    return classesMap[d.type]
                  }))

          nodeEnter.append("text")
            .attr("x", function(d) { return d.children || d._children ? -13 : 13; })
            .attr("dy", ".35em")
            .attr("text-anchor", function(d) { return d.children || d._children ? "end" : "start"; })
            .text(function(d) { return d.add ? ("Add " + d.type) : d.name })
            .style("fill-opacity", 1e-6);

          nodeEnter.append("svg:title")
            .text(function(d) {
              if (d.add) {
                return "Click to add a " + d.type
              }
            return "Clock to edit this " + d.type
            })

          //d3.selectAll()

          // Transition nodes to their new position.
          var nodeUpdate = tnode.transition()
            .duration(duration)
            .attr("transform", function(d) { return "translate(" + d.y + "," + d.x + ")"; });

          nodeUpdate.select("path")
            .attr("transform", "scale(1)")

          nodeUpdate.select("text")
            .style("fill-opacity", 1);

          // Transition exiting nodes to the parent's new position.
          var nodeExit = tnode.exit().transition()
            .duration(duration)
            .attr("transform", function(d) { return "translate(" + source.y + "," + source.x + ")"; })
            .remove();

          nodeExit.select("path")
            .attr("transform", "scale(" + 1e-6 + ")")

          nodeExit.select("text")
            .style("fill-opacity", 1e-6);

          // Update the links…
          var tlink = tsvg.selectAll("path.link")
            .data(tlinks, function(d) { return d.target.id; });

          // Enter any new links at the parent's previous position.
          tlink.enter().insert("path", "g")
            .attr("class", "link")
            .attr("d", function(d) {
            var o = {x: source.x0, y: source.y0};
            return diagonal({source: o, target: o});
            });

          // Transition links to their new position.
          tlink.transition()
            .duration(duration)
            .attr("d", diagonal);

          // Transition exiting nodes to the parent's new position.
          tlink.exit().transition()
            .duration(duration)
            .attr("d", function(d) {
            var o = {x: source.x, y: source.y};
            return diagonal({source: o, target: o});
            })
            .remove();

          // Stash the old positions for transition.
          tnodes.forEach(function(d) {
          d.x0 = d.x;
          d.y0 = d.y;
          });
        }

        $scope.formData = {}
        $scope.$watch('currentForm.$dirty', function(newVal, oldVal) {
          if (oldVal != newVal) {
            var body = $('body')
            var w = $(window)
            var allForms = $('.all-forms')
            var topology = $('#topology')
            var height = Math.max(Math.max(Math.max(allForms.height(), topology.height(), body.height()), w.height())) + 100
            var makeModalDiv = $('#gmodal')
            if (newVal) {
              makeModalDiv.addClass("ismodal")
              makeModalDiv.height(height)
            } else {
              makeModalDiv.removeClass("ismodal")
              makeModalDiv.height(0)
          }
          }
        })

        var warnPlaceholder = function (name, newVal) {
          var element = $("input[name='"+name+"']")
          if (!angular.isDefined(newVal)) {
            newVal = element.val()
          }
          if (!angular.isDefined(newVal) || (newVal.trim() === '')) {
            element.addClass("warning")
          } else {
            element.removeClass("warning")
          }
        }
        $scope.$watch('formData.sources', function (newVal, oldVal) {
          if (oldVal != newVal) {
            warnPlaceholder('sources', newVal)
          }
        })
        $scope.$watch('formData.targets', function (newVal, oldVal) {
          if (oldVal != newVal) {
            warnPlaceholder('targets', newVal)
          }
        })
        function click(d) {
          var selected = d3.select(this).classed("selected")
          // clicked on the current node
          if (selected)
            return

          $timeout( (function () {
            // remove all selected classes from all nodes
            d3.selectAll('svg .selected').each(function (ds) {
              d3.select(this).classed('selected', false)
            })
            // set selected on this node
            d3.select(this).classed("selected", true)
            showForm(d)
            $scope.formMode = d.add ? 'add' : 'edit'
            $('.all-forms :input:visible:enabled:first').focus()
          }).bind(this))
          //$scope.validateName(d.type)
          return;

          // collapse / expand the child nodes
          if (d.children) {
            d._children = d.children;
            d.children = null;
          } else {
            d.children = d._children;
            d._children = null;
          }
          update(d);
        }

        var showForm = function (d) {
          $scope.showForm = d.type
          $scope.formData = d
          $scope.shadowData = angular.copy(d)
          // let new form load before accessing its elements
          $timeout( function () {
            warnPlaceholder('sources')
            warnPlaceholder('targets')
          })
        }

        var treeNode = function (d) {
          this.name = d.name
          this.type = d.type
          this.parent = d.parent
        }

        var setAddVhost = function (d) {
          d.name = ""
          d.type = "vhost"
          d.add = true
        }
        var setAddGroup = function (d) {
          // remove any attributes in the schema
          var attributes = schema.entityTypes['group'].attributes
          for (var dattr in d) {
            if (angular.isDefined(attributes[dattr]))
              delete d[dattr]
          }
          d.name = ""
          d.type = "group"
          d.add = true
        }

        var revert = function (target, source) {
          var entity = schema.entityTypes[source.type]
          for (var attr in entity.attributes) {
            if (angular.isDefined(target[attr]) && !angular.isDefined(source[attr]) )
              delete target[attr]
            if (angular.isDefined(source[attr]) && (attr !== 'id'))
              target[attr] = source[attr]
          }
          $scope.currentForm.$setPristine()
        }
        var trimAll = function (d) {
          var attributes = schema.entityTypes[d.type].attributes
          for (var dattr in d) {
            if (angular.isDefined(attributes[dattr]) && attributes[dattr].type === 'string' && (typeof d[dattr] == 'string'))
              d[dattr] = d[dattr].trim()
          }
        }
        $scope.formDelete = function () {
          var req = {type: $scope.showForm}
          if ($scope.showForm === 'vhost')
            req.vhost = $scope.formData['name']
          else if ($scope.showForm === 'group') {
            req.vhost = $scope.formData.parent.name
            req.group = $scope.formData['name']
          }
          QDRService.management.connection.send(req, address, "DELETE")
            .then( function (success_response) {
              console.log(success_response.response)
              if (success_response.response != "OK") {
                Core.notification("error", "delete failed: " + success_response.response)
              } else
                Core.notification("success", $scope.showForm + " deleted")
            }, function (error_response) {
              Core.notification("error", "save policy failed")
            })

        }

        $scope.formEditOK = function (d, form) {
          trimAll(d)
          form.$setPristine()
          //deselectAll()
          if (d.add)
            return $scope.formAddOK(d)

          $timeout( function () {
            revert($scope.shadowData, d)
            //$scope.formMode = 'view'
            d3.selectAll("g." + d.type + " text").each(function(dt) {
              if (dt.name === d.name)
                d3.select(this).text(d.name);
            });
            $scope.savePolicy()
          })
        }
        $scope.formAddOK = function (d) {
          $timeout( function () {
            // copy the form's values to a new node
            var n = new treeNode(d)
            revert(n, d)
            n.parent = d.parent.name
            // revert the add node's values
            if (d.type === 'vhost') {
              setAddVhost(d)
              var g = new treeNode(d)
              setAddGroup(g)
              g.parent = n.name
              n.children = [g]
            } else {
              setAddGroup(d)
            }
            revert($scope.shadowData, d)

            d.parent.children.splice(d.parent.children.length-1, 0, n)

            update(d.parent)
            $scope.savePolicy()
          })
        }

        var deselectAll = function () {
          d3.selectAll('svg .selected').each(function () {
            d3.select(this).classed('selected', false)
          })
        }
        $scope.formCancel = function () {
          $timeout( function () {
            //Core.notification('warning', $scope.formMode + " " + $scope.formData.type + ' cancelled')
            // restore any changed data
            revert($scope.formData, $scope.shadowData)
          })
        }
        $scope.formValue = function (attr) {
          if ($scope.formData[attr])
            return formData.attr
          else {
            return 'Defaults to ' + schema.entityTypes[$scope.formData.type].attributes[attr]['default']
          }
        }

        $scope.defaultGroup = false
        $scope.dupUserGroup = ''
        $scope.dupUserName = ''

        $scope.$watch('formData.name', function(newVal, oldVal) {
          $scope.defaultGroup = (newVal === '$default')
        })
      }

    }
  ]);

  return QDR;
}(QDR || {}));

  QDR.module.directive('duplicateSiblingName', [function () {
    return {
      restrict: 'A',
      require: 'ngModel',
      link: function(scope, element, attr, ngModel) {

        ngModel.$validators.duplicateName = function(modelValue, viewValue) {
          var root = scope.$parent.formData.parent
          var id = scope.$parent.formData.id
          var notDuplicate = true;
          if (modelValue.trim() !== '' && root.children) {
            for (var i=0; i<root.children.length; i++) {
              // skip self
              if (root.children[i].id !== id) {
                if (root.children[i].name.toLowerCase().trim() === modelValue.toLowerCase().trim()) {
                  notDuplicate = false
                  break
                }
              }
            }
          }
          return notDuplicate;
        }
      }
    }
  }])

  QDR.module.directive('duplicateUser', [function () {
    return {
      restrict: 'A',
      require: 'ngModel',
      link: function(scope, element, attr, ngModel) {
        var root = scope.$parent.formData.parent
        var msg = function (group, user, same) {
          if (!same)
            scope.$parent.dupUserMsg = "User can be in only one group for this vhost. The user "+user+" was also found in "+group+"."
          else
            scope.$parent.dupUserMsg = "The user "+user+" appears in this list multiple times."

        }
        var cmp = function (root, users, id, i) {
          if (!angular.isDefined(root.children[i].users))
            return false
          var nusers = root.children[i].users.python_split(' ')
          var found = false
          for (var j=0; j<users.length; j++) {
            found = nusers.some ( function (nuser) {
              if (users.indexOf(nuser) >= 0) {
                msg(root.children[i].name, nuser, false)
                return true
              }
              return false
            })
            if (found) {
              break;
            }
          }
          return found
        }

        ngModel.$validators.duplicateUser = function(modelValue, viewValue) {
          var notDuplicate = true;
          if (modelValue && modelValue.trim() !== '') {
            var id = scope.$parent.formData.id
            // make sure there are no duplicated user names in this group
            var users = modelValue.python_split(' ')
            for (var i=0; i<root.children.length; i++) {
              // skip self
              if (root.children[i].id !== id) {
                if (cmp(root, users, id, i)) {
                  notDuplicate = false
                  break
                }
              } else {
                // prevent same name appearing twice in this edit field
                notDuplicate = !users.some(function(user, idx){
                    if (users.indexOf(user, idx+1) !== -1) {
                      msg(root.children[i].name, user, true)
                      return true
                    }
                    return false
                });
              }
            }
          }
          return notDuplicate;
        }
      }
    }
  }])
