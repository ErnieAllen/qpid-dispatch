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

      var settings = {baseName: "R", http: true}
      $scope.clientAddress = "addr1"
      $scope.panelVisible = true  // show/hide the panel on the left
      $scope.multiData = []
      $scope.selectedClient = [];
      $scope.quiesceState = {}
      var dontHide = false;

      $( document ).ready(function() {

        d3.select(".qdr-topology.pane.left")
          .style("left" , "-480px")
        d3.select(".panel-adjacent")
          .style("margin-left", "10px")
        return;
        var isPaneHidden = localStorage["topoPanel"];
        if (isPaneHidden) {
          $scope.panelVisible = false
          d3.select(".qdr-topology.pane.left")
            .style("left" , "-380px")
          d3.select(".panel-adjacent")
            .style("margin-left", "30px")
        }
      });
      $scope.hideLeftPane = function (duration) {
        localStorage["topoPanel"] = "hide"
        d3.select(".qdr-topology.pane.left")
          .transition().duration(300).ease("sin-in")
          .style("left" , "-380px")

        d3.select(".panel-adjacent")
          .transition().duration(300).ease("sin-in")
          .style("margin-left", "30px")
          .each("end", function () {
            resize()
            $timeout(function () {QDR.log.debug("done with transition. setting scope ");$scope.panelVisible = false})
          })
      }
      $scope.showLeftPane = function () {
        localStorage.removeItem("topoPanel");
        d3.select(".qdr-topology.pane.left")
          .transition().duration(300).ease("sin-out")
          .style("left" , "0px")

        d3.select(".panel-adjacent")
          .transition().duration(300).ease("sin-out")
          .style("margin-left", "430px")
          .each("end", function () {
            resize()
            $timeout(function () {QDR.log.debug("done with transition. setting scope ");$scope.panelVisible = true})
          })
      }

      $scope.Publish = function () {
        doPublish()
      }
      var doPublish = function (nodeIndex, callback) {
        var l = []
        links.forEach( function (link) {
          l.push({source: link.source.index,
                  target: link.target.index,
                  cls: link.cls})
        })
        var props = {nodes: nodes, links: l, topology: $scope.mockTopologyDir, settings: settings}
        if (angular.isDefined(nodeIndex)) {
          op = "SHOW-CONFIG"
          props.nodeIndex = nodeIndex
        } else {
          op = "PUBLISH"
        }
        QDRService.sendMethod(op, props, function (response) {
          if (!angular.isDefined(nodeIndex)) {
            Core.notification('info', props.topology + " published");
            QDR.log.info("published " + $scope.mockTopologyDir)
          } else {
            callback(response)
          }
        })
      }
      $scope.showConfig = function (node) {
        doPublish(node.index, function (response) {
          doShowConfigDialog(response)
        })
      }

      $scope.$watch('mockTopologyDir', function(newVal, oldVal) {
        if (oldVal != newVal) {
          switchTopology(newVal)
        }
      })
      var switchTopology = function (topology) {
        var props = {topology: topology}
        QDRService.sendMethod("SWITCH", props, function (response) {
          nodes = []
          links = []
          var sections = ['log', 'connector', 'sslProfile', 'listener']
          for (var i=0; i<response.nodes.length; ++i) {
            var node = response.nodes[i]
            var anode = aNode(node.key, node.name, node.nodeType, undefined, nodes.length, 100+i*90, 200+(i % 2 ? -100 : 100), undefined, false)
            sections.forEach( function (section) {
              if (node[section+'s']) {
                anode[section+'s'] = node[section+'s']
                anode[section+"Keys"] = Object.keys(anode[section+'s'])
              }
            })
            nodes.push(anode)
          }
          for (var i=0; i<response.links.length; ++i) {
            var link = response.links[i]
            getLink(link.source, link.target, link.dir, "", link.source + '.' + link.target);
          }
          animate = true
          QDR.log.info("switched to " + topology)
          initForceGraph()
          Core.notification('info', "switched to " + props.topology);
        })
      }

      function sourceTarget(skey, tkey, stype, ttype) {
        stype = stype || "inter-router"
        ttype = ttype || "inter-router"
        var source = nodes.findIndex( function (n) {
          return (n.key === skey && n.nodeType === stype)
        })
        var target = nodes.findIndex ( function (n) {
          return (n.key === tkey && n.nodeType === ttype)
        })
        return {source: source, target: target}
      }

      $scope.Clear = function () {
        nodes = []
        links = []
        force.nodes(nodes).links(links).start();
        restart();
      }

      var fixIds = function (list) {
        list.forEach( function (l, i) {
          l.id = i
        })
      }
      var fixUids = function (list) {
        list.forEach( function (l, i) {
          l.uid = l.source.id + "." + l.target.id
        })
      }

      $scope.showActions = function (e) {
        $(document).click();
        e.stopPropagation()
        var position = $('#action_button').position()
        position.top += $('#action_button').height() + 8
        position['display'] = "block"
        $('#action_menu').css(position)
      }
      $scope.delNode = function (node) {
        var i = nodes.length
        while (i--) {
          if (nodes[i].name === node.name) {
            if ($scope.selected_node && $scope.selected_node.name === nodes[i].name)
              $scope.selected_node = null
            nodes.splice(i, 1)
          }
        }
        fixIds(nodes)

        var i = links.length
        while (i--) {
          if (links[i].source.name === node.name || links[i].target.name === node.name) {
            links.splice(i, 1)
          }
        }
        fixUids(links)

        animate = true
        initGraph()
        initForce()
        restart();
      }

      var port = 20000
      var connectionId = 1
      $scope.addToNode = function (type) {
        var id = $scope.contextNode.key
        var clients = nodes.filter ( function (node) {
           return node.nodeType !== 'inter-router' && node.routerId === $scope.contextNode.name
        })
        var clientLen = 0
        clients.forEach (function (client) {
          clientLen += client.normals.length
        })
        var dir = "out"
        if (type === 'sender')
          dir = "in"
        else if (type === 'console' || type === 'both')
          dir = "both"
        var siblings = nodes.filter( function (n) {
          var pass = n.nodeType !== "inter-router" && n.key === id && n.cdir === dir
          if (pass) {
            if ((type === 'console' && !n.properties.console_identifier) ||
              (type !== 'console' && n.properties.console_identifier))
              pass = false
          }
          return pass
        })
        var name = $scope.contextNode.name + "." + (clientLen + 1)
        if (!siblings.length) {
          nodeType = "normal"
          var properties = type === 'console' ? {console_identifier: "Dispatch console"} : {}
          if (type === 'Artemis') {
            properties = {product: 'apache-activemq-artemis'}
            nodeType = "route-container"
          }
          if (type === 'Qpid') {
            properties = {product: 'qpid-cpp'}
            nodeType = "on-demand"
          }
          var node = aNode(id, name, nodeType, undefined, nodes.length, $scope.contextNode.x, $scope.contextNode.y - radius - radiusNormal,
                               $scope.contextNode.id, false, properties)
          node.user = "anonymous"
          node.isEncrypted = false
          node.host = "0.0.0.0:" + port
          node.connectionId = node.id
          node.cdir = dir
          node.normals = [{name: node.name, addr: $scope.clientAddress}]
          nodes.push(node)

          var uid = "connection/" + node.host + ":" + node.connectionId
          getLink($scope.contextNode.id, nodes.length-1, dir, "small", uid);
          ++port
          ++connectionId
        } else {
          siblings[0].normals.push({name: name, addr: $scope.clientAddress})
          //siblings[0].name = siblings[0].routerId + "." + siblings[0].id + "." + siblings[0].normals.length
        }
        force.nodes(nodes).links(links).start();
        initLegend()
        restart();
      }

      if (!QDRService.connected) {
        // we are not connected. we probably got here from a bookmark or manual page reload
        QDRService.redirectWhenConnected("topology");
        return;
      }
      // we are currently connected. setup a handler to get notified if we are ever disconnected
      QDRService.addDisconnectAction(function() {
        QDRService.redirectWhenConnected("topology");
        $scope.$apply();
      })

      var urlPrefix = $location.absUrl();
      urlPrefix = urlPrefix.split("#")[0]
      QDR.log.debug("started QDR.TopologyController with urlPrefix: " + urlPrefix);

      $scope.addingNode = {
        step: 0,
        hasLink: false,
        trigger: ''
      };

      $scope.cancel = function() {
        $scope.addingNode.step = 0;
      }

      $scope.selected_node = null
      var NewRouterName = "__NEW__";
      // mouse event vars
      var selected_link = null,
        mousedown_link = null,
        mousedown_node = null,
        mouseover_node = null,
        mouseup_node = null,
        initial_mouse_down_position = null;

      $scope.modes = [{
          title: 'Topology view',
          name: 'Diagram',
          right: false
        },
        /* {title: 'Add a new router node', name: 'Add Router', right: true} */
      ];
      $scope.mode = "Diagram";
      $scope.contextNode = null; // node that is associated with the current context menu

      $scope.isModeActive = function(name) {
        if ((name == 'Add Router' || name == 'Diagram') && $scope.addingNode.step > 0)
          return true;
        return ($scope.mode == name);
      }
      $scope.selectMode = function(name) {
        if (name == "Add Router") {
          name = 'Diagram';
          if ($scope.addingNode.step > 0) {
            $scope.addingNode.step = 0;
          } else {
            // start adding node mode
            $scope.addingNode.step = 1;
          }
        } else {
          $scope.addingNode.step = 0;
        }

        $scope.mode = name;
      }
      $scope.addAnotherNode = function (calc) {
        resetMouseVars();
        //selected_node = null;
        //selected_link = null;
        // add a new node
        var x = radiusNormal * 4;
        var y = x;;
        var offset = $('#topology').offset();
        if (calc) {
          var w = $('#topology').width()
          var h = $('#topology').height()
          var x = (w + offset.left) / 4
          var y = (h + offset.top) / 4
          var overlap = true
          while (overlap) {
            overlap = false
            for (var i=0; i<nodes.length; i++) {
              if ((Math.abs(nodes[i].x - x) < radiusNormal * 2) &&
                  (Math.abs(nodes[i].y - y) < radiusNormal * 2)) {
                overlap = true
                x += radiusNormal
                if (x + radiusNormal/2 >= offset.left + w) {
                  x = offset.left + radiusNormal/2
                  y += radiusNormal
                  if (y + radiusNormal/2 >= offset.top + h) {
                    x = offset.left + radiusNormal
                    y = offset.top + radiusNormal
                  }
                }
                break;
              }
            }
          }
        } else {
          x = mouseX - offset.left + $(document).scrollLeft();
          y = mouseY - offset.top + $(document).scrollTop();;
        }
        var name = genNewName()
        var nextId = nodes.length //maxNodeIndex() + 1
        //NewRouterName = genNewName();
        var id = "amqp:/_topo/0/" + name + "/$management";
        var node = aNode(id, name, "inter-router", undefined, nextId, x, y, undefined, false)
        node.host = "0.0.0.0:" + port
        ++port
        nodes.push(node);
        $scope.selected_node = node
        force.nodes(nodes).links(links).start();
        restart(false);
      }

      $scope.isRight = function(mode) {
        return mode.right;
      }

      var maxNodeIndex = function () {
        var maxIndex = -1
        nodes.forEach( function (node) {
          if (node.nodeType === "inter-router") {
            if (node.id > maxIndex)
              maxIndex = node.id
          }
        })
        return maxIndex;
      }

      // for ng-grid that shows details for multiple consoles/clients
      // generate unique name for router and containerName
      var genNewName = function() {
        var newName = settings.baseName + "."
        for (var i=0; i<nodes.length; ++i) {
          var found = nodes.some( function (n) {
            return n.name === newName + i
          })
          if (!found)
            return newName + i
        }
        return newName + nodes.length
      }

      $scope.doSettings = function () {
        doSettingsDialog(settings);
      };
      $scope.showNewDlg = function () {
        doNewDialog();
      }
      $scope.reverseLink = function() {
        if (!mousedown_link)
          return;
        var d = mousedown_link;
        for (var i=0; i<links.length; i++) {
          if (links[i].source.index === d.source.index && links[i].target.index === d.target.index ) {
            var tmp = links[i].source
            links[i].source = links[i].target
            links[i].target = tmp
          }
        }
        restart(false);
        tick();
      }
      $scope.removeLink = function() {
        if (!mousedown_link)
          return;
        var d = mousedown_link;
        links.every(function(l, i) {
          if (l.source.id == d.source.id && l.target.id == d.target.id) {
            links.splice(i, 1);
            force.links(links).start();
            return false; // exit the 'every' loop
          }
          return true;
        });
        restart(false);
        tick();
      }
      var setNodesFixed = function (name, b) {
        nodes.some(function (n) {
          if (n.name === name) {
            n.fixed = b;
            return true;
          }
        })
      }
      $scope.editSection = function (node, type, section) {
        doEditDialog(node, type, section)
      }

      $scope.setFixed = function(b) {
        if ($scope.contextNode) {
          $scope.contextNode.fixed = b;
          setNodesFixed($scope.contextNode.name, b)
          savePositions()
        }
        restart();
      }
      $scope.isFixed = function() {
        if (!$scope.contextNode)
          return false;
        return ($scope.contextNode.fixed & 0b1);
      }

      var mouseX, mouseY;
      var relativeMouse = function () {
        var offset = $('#main-container').offset();
        return {left: (mouseX + $(document).scrollLeft()) - 1,
                top: (mouseY  + $(document).scrollTop()) - 1,
                offset: offset
                }
      }
      // event handlers for popup context menu
      $(document).mousemove(function(e) {
        mouseX = e.clientX;
        mouseY = e.clientY;
      });
      $(document).mousemove();
      $(document).click(function(e) {
        $scope.contextNode = null;
        $("#node_context_menu").fadeOut(200);
        $("#svg_context_menu").fadeOut(200);
        $("#action_menu").fadeOut(200);
        $("#link_context_menu").fadeOut(200);
      });

      var radii = {
        'inter-router': 25,
        'normal': 15,
        'on-demand': 15,
        'route-container': 15
      };
      var radius = 25;
      var radiusNormal = 15;
      var svg, lsvg;
      var force;
      var animate = false; // should the force graph organize itself when it is displayed
      var path, circle;
      var savedKeys = {};
      var dblckickPos = [0, 0];
      var width = 0;
      var height = 0;

      var getSizes = function() {
        var legendWidth = 143;
        var gap = 5;
        var width = $('#topology').width() - gap - legendWidth;
        var top = $('#topology').offset().top
        var height = Math.max(window.innerHeight, top) - top - gap;
        if (width < 10) {
          QDR.log.info("page width and height are abnormal w:" + width + " height:" + height)
          return [0, 0];
        }
        return [width, height]
      }
      var resize = function() {
        if (!svg)
          return;
        var sizes = getSizes();
        width = sizes[0]
        height = sizes[1]
        if (width > 0) {
          // set attrs and 'resume' force
          svg.attr('width', width);
          svg.attr('height', height);
          force.size(sizes).resume();
        }
      }
      window.addEventListener('resize', resize);
      var sizes = getSizes()
      width = sizes[0]
      height = sizes[1]
      if (width <= 0 || height <= 0)
        return

      // set up initial nodes and links
      //  - nodes are known by 'id', not by index in array.
      //  - selected edges are indicated on the node (as a bold red circle).
      //  - links are always source < target; edge directions are set by 'left' and 'right'.
      var nodes = [];
      var links = [];

      var aNode = function(id, name, nodeType, nodeInfo, nodeIndex, x, y, resultIndex, fixed, properties) {
        for (var i=0; i<nodes.length; ++i) {
          if (nodes[i].name === name)
            return nodes[i]
        }
        properties = properties || {};
        var routerId = QDRService.nameFromId(id)
        return {
          key: id,
          name: name,
          nodeType: nodeType,
          properties: properties,
          routerId: routerId,
          x: x,
          y: y,
          id: nodeIndex,
          resultIndex: resultIndex,
          fixed: !!+fixed,
          cls: name == NewRouterName ? 'temp' : ''
        };
      };


      var initForm = function(attributes, results, entityType, formFields) {

        while (formFields.length > 0) {
          // remove all existing attributes
          formFields.pop();
        }

        for (var i = 0; i < attributes.length; ++i) {
          var name = attributes[i];
          var val = results[i];
          var desc = "";
          if (entityType.attributes[name])
            if (entityType.attributes[name].description)
              desc = entityType.attributes[name].description;

          formFields.push({
            'attributeName': name,
            'attributeValue': val,
            'description': desc
          });
        }
      }

      var getLinkAddr = function (id, connection, onode) {
        var links = onode[".router.link"]
        if (!links) {
          return $scope.clientAddress
        }
        links.results.forEach( function (linkResult) {
          var link = QDRService.flatten(links.attributeNames, linkResult)
          if (link.linkType === "endpoint" && link.connectionId === connection.identity)
            return link.owningAddr
        })
        return $scope.clientAddress
      }

      var getLinkDir = function (id, connection, onode) {
        var links = onode[".router.link"]
        if (!links) {
          return "unknown"
        }
        var inCount = 0, outCount = 0
        links.results.forEach( function (linkResult) {
          var link = QDRService.flatten(links.attributeNames, linkResult)
          if (link.linkType === "endpoint" && link.connectionId === connection.identity)
            if (link.linkDir === "in")
              ++inCount
            else
              ++outCount
        })
        if (inCount > 0 && outCount > 0)
          return "both"
        if (inCount > 0)
          return "in"
        if (outCount > 0)
          return "out"
        return "unknown"
      }

      var savePositions = function () {
        nodes.forEach( function (d) {
          localStorage[d.name] = angular.toJson({
            x: Math.round(d.x),
            y: Math.round(d.y),
            fixed: d.fixed ? 1 : 0,
          });
        })
      }

      // vary the following force graph attributes based on nodeCount
      // <= 6 routers returns min, >= 80 routers returns max, interpolate linearly
      var forceScale = function(nodeCount, min, max) {
        var count = nodeCount
        if (nodeCount < 6) count = 6
        if (nodeCount > 200) count = 200
        var x = d3.scale.linear()
          .domain([6,200])
          .range([min, max]);
//QDR.log.debug("forceScale(" + nodeCount + ", " + min + ", " + max + "  returns " + x(count) + " " + x(nodeCount))
        return x(count)
      }
      var linkDistance = function (d, nodeCount) {
        if (d.target.nodeType === 'inter-router')
          return forceScale(nodeCount, 150, 20)
        return forceScale(nodeCount, 75, 10)
      }
      var charge = function (d, nodeCount) {
        if (d.nodeType === 'inter-router')
          return forceScale(nodeCount, -1800, -200)
        return -900
      }
      var gravity = function (d, nodeCount) {
        return forceScale(nodeCount, 0.0001, 0.1)
      }

      var initGraph = function () {
        d3.select("#SVG_ID").remove();
        svg = d3.select('#topology')
          .append('svg')
          .attr("id", "SVG_ID")
          .attr('width', width)
          .attr('height', height)
          .on("contextmenu", function(d) {
            if (d3.event.defaultPrevented)
              return;
            d3.event.preventDefault();

            //if ($scope.addingNode.step != 0)
            //  return;
            if (d3.select('#svg_context_menu').style('display') !== 'block')
              $(document).click();
            var rm = relativeMouse()
            d3.select('#svg_context_menu')
              .style('left', (rm.left - 16) + "px")
              .style('top', (rm.top - rm.offset.top) + "px")
              .style('display', 'block');
          })

        svg.append("svg:defs").selectAll('marker')
          .data(["end-arrow", "end-arrow-selected", "end-arrow-small", "end-arrow-highlighted"]) // Different link/path types can be defined here
          .enter().append("svg:marker") // This section adds in the arrows
          .attr("id", String)
          .attr("viewBox", "0 -5 10 10")
          .attr("markerWidth", 4)
          .attr("markerHeight", 4)
          .attr("orient", "auto")
          .classed("small", function (d) {return d.indexOf('small') > -1})
          .append("svg:path")
            .attr('d', 'M 0 -5 L 10 0 L 0 5 z')

        svg.append("svg:defs").selectAll('marker')
          .data(["start-arrow", "start-arrow-selected", "start-arrow-small", "start-arrow-highlighted"]) // Different link/path types can be defined here
          .enter().append("svg:marker") // This section adds in the arrows
          .attr("id", String)
          .attr("viewBox", "0 -5 10 10")
          .attr("refX", 5)
          .attr("markerWidth", 4)
          .attr("markerHeight", 4)
          .attr("orient", "auto")
          .append("svg:path")
            .attr('d', 'M 10 -5 L 0 0 L 10 5 z');

        var grad = svg.append("svg:defs").append("linearGradient")
          .attr("id", "half-circle")
          .attr("x1", "0%")
          .attr("x2", "0%")
          .attr("y1", "100%")
          .attr("y2", "0%");
        grad.append("stop").attr("offset", "50%").style("stop-color", "#C0F0C0");
        grad.append("stop").attr("offset", "50%").style("stop-color", "#F0F000");

        // handles to link and node element groups
        path = svg.append('svg:g').selectAll('path')
        circle = svg.append('svg:g').selectAll('g')

      }

      var initLegend = function () {
        // the legend
        d3.select("#svg_legend svg").remove();
        lsvg = d3.select("#svg_legend")
          .append('svg')
          .attr('id', 'svglegend')
        lsvg = lsvg.append('svg:g')
          .attr('transform', 'translate(' + (radii['inter-router'] + 2) + ',' + (radii['inter-router'] + 2) + ')')
          .selectAll('g');
      }

      var initForce = function () {
        // convert link source/target into node index numbers
        links.forEach( function (link, i) {
          if (link.source.id) {
            link.source = link.source.id
            link.target = link.target.id
          }
        })
        var routerCount = nodes.filter(function (n) {
          return n.nodeType === 'inter-router'
        }).length

        force = d3.layout.force()
          .nodes(nodes)
          .links(links)
          .size([width, height])
          .linkDistance(function(d) { return linkDistance(d, routerCount) })
          .charge(function(d) { return charge(d, routerCount) })
          .friction(.10)
          .gravity(function(d) { return gravity(d, routerCount) })
          .on('tick', tick)
          .on('end', function () {savePositions()})
          .start()
      }
      // initialize the nodes and links array from the QDRService.topology._nodeInfo object
      var initForceGraph = function() {

        mouseover_node = null;
        $scope.selected_node = null;
        selected_link = null;

        initGraph()
        initLegend()

        // mouse event vars
        mousedown_link = null;
        mousedown_node = null;
        mouseup_node = null;

        savePositions()
        // init D3 force layout
        initForce()

        // app starts here
        restart(false);
        force.start();
        tick();
      }

      function getContainerIndex(_id, nodeInfo) {
        var nodeIndex = 0;
        for (var id in nodeInfo) {
          if (QDRService.nameFromId(id) === _id)
            return nodeIndex;
          ++nodeIndex;
        }
        return -1;
      }

      function getLink(_source, _target, dir, cls, uid) {
        for (var i = 0; i < links.length; i++) {
          var s = links[i].source,
              t = links[i].target;
          if (typeof links[i].source == "object") {
            s = s.id;
            t = t.id;
          }
          if (s == _source && t == _target) {
            return i;
          }
          // same link, just reversed
          if (s == _target && t == _source) {
            return -i;
          }
        }

        var link = {
          source: _source,
          target: _target,
          left: dir != "out",
          right: (dir == "out" || dir == "both"),
          cls: cls,
          uid: uid,
        };
        return links.push(link) - 1;
      }


      function resetMouseVars() {
        mousedown_node = null;
        mouseover_node = null;
        mouseup_node = null;
        mousedown_link = null;
      }

      // update force layout (called automatically each iteration)
      function tick() {
        circle.attr('transform', function(d) {
          var cradius;
          if (d.nodeType == "inter-router") {
            cradius = d.left ? radius + 8 : radius;
          } else {
            cradius = d.left ? radiusNormal + 18 : radiusNormal;
          }
          d.x = Math.max(d.x, radiusNormal * 2);
          d.y = Math.max(d.y, radiusNormal * 2);
          d.x = Math.max(0, Math.min(width - cradius, d.x))
          d.y = Math.max(0, Math.min(height - cradius, d.y))
          return 'translate(' + d.x + ',' + d.y + ')';
        });

        // draw directed edges with proper padding from node centers
        path.attr('d', function(d) {
          //QDR.log.debug("in tick for d");
          //console.dump(d);
          var sourcePadding, targetPadding, r;

          if (d.target.nodeType == "inter-router") {
            r = radius;
            //                       right arrow  left line start
            sourcePadding = d.left ? radius + 8 : radius;
            //                      left arrow      right line start
            targetPadding = d.right ? radius + 16 : radius;
          } else {
            r = radiusNormal - 18;
            sourcePadding = d.left ? radiusNormal + 18 : radiusNormal;
            targetPadding = d.right ? radiusNormal + 16 : radiusNormal;
          }
          var dtx = Math.max(targetPadding, Math.min(width - r, d.target.x)),
            dty = Math.max(targetPadding, Math.min(height - r, d.target.y)),
            dsx = Math.max(sourcePadding, Math.min(width - r, d.source.x)),
            dsy = Math.max(sourcePadding, Math.min(height - r, d.source.y));

          var deltaX = dtx - dsx,
            deltaY = dty - dsy,
            dist = Math.sqrt(deltaX * deltaX + deltaY * deltaY),
            normX = deltaX / dist,
            normY = deltaY / dist;
          var sourceX = dsx + (sourcePadding * normX),
            sourceY = dsy + (sourcePadding * normY),
            targetX = dtx - (targetPadding * normX),
            targetY = dty - (targetPadding * normY);
          sourceX = Math.max(0, Math.min(width, sourceX))
          sourceY = Math.max(0, Math.min(width, sourceY))
          targetX = Math.max(0, Math.min(width, targetX))
          targetY = Math.max(0, Math.min(width, targetY))

          return 'M' + sourceX + ',' + sourceY + 'L' + targetX + ',' + targetY;
        });

        if (!animate) {
          animate = true;
          force.stop();
        }
      }

      function nodeFor(name) {
        for (var i = 0; i < nodes.length; ++i) {
          if (nodes[i].name == name)
            return nodes[i];
        }
        return null;
      }

      function genLinkName(d1, d2) {
        return d1.id + "." + d2.id
      }
      function linkFor(source, target) {
        for (var i = 0; i < links.length; ++i) {
          if ((links[i].source == source) && (links[i].target == target))
            return links[i];
          if ((links[i].source == target) && (links[i].target == source))
            return links[i];
        }
        return null;
      }

      function clearPopups() {
        d3.select("#crosssection").style("display", "none");
        $('.hastip').empty();
        d3.select("#multiple_details").style("display", "none")
        d3.select("#link_details").style("display", "none")
        d3.select('#node_context_menu').style('display', 'none');
        d3.select('#action_menu').style('display', 'none');
      }

      function hideLinkDetails() {
        d3.select("#link_details").transition()
          .duration(500)
          .style("opacity", 0)
          .each("end", function(d) {
            d3.select("#link_details").style("display", "none")
          })
      }

      function clerAllHighlights() {
        for (var i = 0; i < links.length; ++i) {
          links[i]['highlighted'] = false;
        }
        for (var i=0; i<nodes.length; ++i) {
          nodes[i]['highlighted'] = false;
        }
      }

      // takes the nodes and links array of objects and adds svg elements for everything that hasn't already
      // been added
      function restart(start) {
        circle.call(force.drag);

        // path (link) group
        path = path.data(links, function(d) {return d.uid});

        // update existing links
        path.classed('selected', function(d) {
            return d === selected_link;
          })
          .classed('highlighted', function(d) {
            return d.highlighted;
          })
          .classed('temp', function(d) {
            return d.cls == 'temp';
          })
          .attr('marker-start', function(d) {
            var sel = d === selected_link ? '-selected' : (d.cls === 'small' ? '-small' : '');
            if (d.highlighted)
              sel = "-highlighted"
            return d.left ? 'url(' + urlPrefix + '#start-arrow' + sel + ')' : '';
          })
          .attr('marker-end', function(d) {
            var sel = d === selected_link ? '-selected' : (d.cls === 'small' ? '-small' : '');
            if (d.highlighted)
              sel = "-highlighted"
            return d.right ? 'url(' + urlPrefix + '#end-arrow' + sel + ')' : '';
          })


        // add new links. if links[] is longer than the existing paths, add a new path for each new element
        path.enter().append('svg:path')
          .attr('class', 'link')
          .attr('marker-start', function(d) {
            var sel = d === selected_link ? '-selected' : (d.cls === 'small' ? '-small' : '');
            return d.left ? 'url(' + urlPrefix + '#start-arrow' + sel + ')' : '';
          })
          .attr('marker-end', function(d) {
            var sel = d === selected_link ? '-selected' : (d.cls === 'small' ? '-small' : '');
            return d.right ? 'url(' + urlPrefix + '#end-arrow' + sel + ')' : '';
          })
          .classed('temp', function(d) {
            return d.cls == 'temp';
          })
          .classed('small', function(d) {
            return d.cls == 'small';
          })
          .on('mouseover', function(d) { // mouse over a path
            if ($scope.addingNode.step > 0) {
              if (d.cls == 'temp') {
                d3.select(this).classed('over', true);
              }
              return;
            }

            mousedown_link = d;
            selected_link = mousedown_link;
            restart();
          })
          .on('mouseout', function(d) { // mouse out of a path
            if ($scope.addingNode.step > 0) {
              if (d.cls == 'temp') {
                d3.select(this).classed('over', false);
              }
              return;
            }
            //QDR.log.debug("showing connections form");
            selected_link = null;
            restart();
          })
          .on("contextmenu", function(d) {  // right click a path
            $(document).click();
            d3.event.preventDefault();

            mousedown_link = d;
            var rm = relativeMouse()
            d3.select('#link_context_menu')
              .style('left', rm.left + "px")
              .style('top', (rm.top - rm.offset.top) + "px")
              .style('display', 'block');
          })
          // left click a path
          .on("click", function (d) {
            var clickPos = d3.mouse(this);
            d3.event.stopPropagation();
            clearPopups();
          })
        // remove old links
        path.exit().remove();

        // circle (node) group
        // nodes are known by id
        circle = circle.data(nodes, function(d) { return d.name });

        var appendTitle = function(g) {
          g.append("svg:title").text(function(d) {
            var x = '';
            if (d.normals && d.normals.length > 1)
              x = " x " + d.normals.length;
            if (QDRService.isConsole(d)) {
              return 'Dispatch console' + x
            }
            if (d.properties.product == 'qpid-cpp') {
              return 'Broker - qpid-cpp' + x
            }
            if (QDRService.isArtemis(d)) {
              return 'Broker - Artemis' + x
            }
            if (d.cdir === 'in')
              return 'Sender' + x
            if (d.cdir === 'out')
              return 'Receiver' + x
            if (d.cdir === 'both')
              return 'Sender/Receiver' + x
            return d.nodeType == 'normal' ? 'client' + x : (d.nodeType == 'on-demand' ? 'broker' : 'Router ' + d.name)
          })
        }

        // update existing nodes visual states
        circle.selectAll('circle')
          .classed('highlighted', function(d) {
            return d.highlighted;
          })
          .classed('selected', function(d) {
            return (d === $scope.selected_node)
          })
          .classed('fixed', function(d) {
            return d.fixed
          })
        // add 'multiple' class to existing <g> elements as needed
          .each(function (d) {
            if (d.normals && d.normals.length > 1) {
              // add the "multiple" class to the parent <g>
              var d3g = d3.select(this.parentElement)
              d3g.attr('class', 'multiple')
              d3g.select('title').remove()
              appendTitle(d3g)
            }
          })

        // add new circle nodes. if nodes[] is longer than the existing paths, add a new path for each new element
        var g = circle.enter().append('svg:g')
          .classed('multiple', function(d) {
            return (d.normals && d.normals.length > 1)
          })

        var appendCircle = function(g) {
          // add new circles and set their attr/class/behavior
          return g.append('svg:circle')
            .attr('class', 'node')
            .attr('r', function(d) {
              return radii[d.nodeType]
            })
            .attr('fill', function (d) {
              if (d.cdir === 'both' && !QDRService.isConsole(d)) {
                return 'url(' + urlPrefix + '#half-circle)'
              }
              return null;
            })
            .classed('fixed', function(d) {
              return d.fixed
            })
            .classed('normal', function(d) {
              return d.nodeType == 'normal' || QDRService.isConsole(d)
            })
            .classed('in', function(d) {
              return d.cdir == 'in'
            })
            .classed('out', function(d) {
              return d.cdir == 'out'
            })
            .classed('selected', function (d) {
              return $scope.selected_node === d
            })
            .classed('inout', function(d) {
              return d.cdir == 'both'
            })
            .classed('inter-router', function(d) {
              return d.nodeType == 'inter-router'
            })
            .classed('on-demand', function(d) {
              return d.nodeType == 'on-demand' || d.nodeType == 'route-container'
            })
            .classed('console', function(d) {
              return QDRService.isConsole(d)
            })
            .classed('artemis', function(d) {
              return QDRService.isArtemis(d)
            })
            .classed('qpid-cpp', function(d) {
              return QDRService.isQpid(d)
            })
            .classed('route-container', function (d) {
              return (!QDRService.isArtemis(d) && !QDRService.isQpid(d) && d.nodeType === 'route-container')
            })
            .classed('client', function(d) {
              return d.nodeType === 'normal' && !d.properties.console_identifier
            })
        }
        appendCircle(g)
          .on('mouseover', function(d) {  // mouseover a circle
            if ($scope.addingNode.step > 0) {
              d3.select(this).attr('transform', 'scale(1.1)');
              return;
            }

            if (d === mousedown_node)
              return;
            // enlarge target node
            d3.select(this).attr('transform', 'scale(1.1)');
            mousedown_node = null;

            if (!$scope.selected_node) {
              return;
            }
            clerAllHighlights()
          })
          .on('mouseout', function(d) { // mouse out for a circle
            // unenlarge target node
            d3.select(this).attr('transform', '');
            clerAllHighlights()
            mouseover_node = null;
            restart();
          })
          .on('mousedown', function(d) { // mouse down for circle
            if (d3.event.button !== 0) { // ignore all but left button
              return;
            }
            mousedown_node = d;
            // mouse position relative to svg
            initial_mouse_down_position = d3.mouse(this.parentElement.parentElement.parentElement).slice();
          })
          .on('mouseup', function(d) {  // mouse up for circle
            if (!mousedown_node)
              return;

            selected_link = null;
            // unenlarge target node
            d3.select(this).attr('transform', '');

            // check for drag
            mouseup_node = d;
            var mySvg = this.parentElement.parentElement.parentElement;
            // if we dragged the node, make it fixed
            var cur_mouse = d3.mouse(mySvg);
            if (cur_mouse[0] != initial_mouse_down_position[0] ||
              cur_mouse[1] != initial_mouse_down_position[1]) {
              return
            }
            // we want a link between the selected_node and this node
            if ($scope.selected_node && d !== $scope.selected_node) {
              if (d.nodeType !== 'inter-router')
                return;

              // add a link from the clicked node to the selected node
              var source = nodes.findIndex( function (n) {
                return (n.key === d.key && n.nodeType === 'inter-router')
              })
              var target = nodes.findIndex( function (n) {
                return (n.key === $scope.selected_node.key && n.nodeType === 'inter-router')
              })
              var curLinkCount = links.length
              var newIndex = getLink(target, source, "out", "", genLinkName(d, $scope.selected_node));
              // there was already a link from selected to clicked node
              if (newIndex != curLinkCount) {
                $scope.selected_node = d
                restart();
                return;
              }
                // add new elements to the svg
              force.links(links).start();
              restart();
              return;

            }

            // if this node was selected, unselect it
            if (mousedown_node === $scope.selected_node) {
              $scope.selected_node = null;
            } else {
              if (d.nodeType !== 'normal' && d.nodeType !== 'on-demand')
                $scope.selected_node = mousedown_node;
            }
            clerAllHighlights()
            mousedown_node = null;
            if (!$scope.$$phase) $scope.$apply()
            restart(false);

          })
          .on("dblclick", function(d) { // circle
            if (d.fixed) {
              d.fixed = false
              setNodesFixed(d.name, false)
              restart() // redraw the node without a dashed line
              force.start(); // let the nodes move to a new position
            }
          })
          .on("contextmenu", function(d) {  // circle
            $(document).click();
            d3.event.preventDefault();
            $scope.contextNode = d;
            if (!$scope.$$phase) $scope.$apply() // we just changed a scope valiable during an async event
            var rm = relativeMouse()
            d3.select('#node_context_menu')
              .style('left', rm.left + "px")
              .style('top', (rm.top - rm.offset.top) + "px")
              .style('display', 'block');
          })
          .on("click", function(d) {  // circle
            if (!mouseup_node)
              return;
            // clicked on a circle
            clearPopups();
            if (!d.normals) {
              // circle was a router or a broker
              if (QDRService.isArtemis(d) && Core.ConnectionName === 'Artemis') {
                $location.path('/jmx/attributes?tab=artemis&con=Artemis')
              }
              return;
            }
            clickPos = d3.mouse(this);
            d3.event.stopPropagation();
          })
        //.attr("transform", function (d) {return "scale(" + (d.nodeType === 'normal' ? .5 : 1) + ")"})
        //.transition().duration(function (d) {return d.nodeType === 'normal' ? 3000 : 0}).ease("elastic").attr("transform", "scale(1)")

        var appendContent = function(g) {
          // show node IDs
          g.append('svg:text')
            .attr('x', 0)
            .attr('y', function(d) {
              var y = 7;
              if (QDRService.isArtemis(d))
                y = 8;
              else if (QDRService.isQpid(d))
                y = 9;
              else if (d.nodeType === 'inter-router')
                y = 4;
              return y;
            })
            .attr('class', 'id')
            .classed('console', function(d) {
              return QDRService.isConsole(d)
            })
            .classed('normal', function(d) {
              return d.nodeType === 'normal'
            })
            .classed('on-demand', function(d) {
              return d.nodeType === 'on-demand'
            })
            .classed('artemis', function(d) {
              return QDRService.isArtemis(d)
            })
            .classed('qpid-cpp', function(d) {
              return QDRService.isQpid(d)
            })
            .text(function(d) {
              if (QDRService.isConsole(d)) {
                return '\uf108'; // icon-desktop for this console
              } else if (QDRService.isArtemis(d)) {
                return '\ue900'
              } else if (QDRService.isQpid(d)) {
                return '\ue901';
              } else if (d.nodeType === 'route-container') {
                return d.properties.product ? d.properties.product[0].toUpperCase() : 'S'
              } else if (d.nodeType === 'normal')
                return '\uf109'; // icon-laptop for clients
              return d.name.length > 7 ? d.name.substr(0, 6) + '...' : d.name;
            });
        }

        appendContent(g)
        appendTitle(g);

        // remove old nodes
        circle.exit().remove();

        // add subcircles
        svg.selectAll('.more').remove();
        svg.selectAll('.multiple')
          .append('svg:path')
            .attr('d', "M1.5,-1 V4 M-1,1.5 H4")
            .attr('class', 'more')
            .attr('transform', "translate(18, -3) scale(2)")

        // dynamically create the legend based on which node types are present
        // the legend
        d3.select("#svg_legend svg").remove();
        lsvg = d3.select("#svg_legend")
          .append('svg')
          .attr('id', 'svglegend')
        lsvg = lsvg.append('svg:g')
          .attr('transform', 'translate(' + (radii['inter-router'] + 2) + ',' + (radii['inter-router'] + 2) + ')')
          .selectAll('g');
        var legendNodes = [];
        legendNodes.push(aNode("Router", "", "inter-router", undefined, 0, 0, 0, 0, false, {}))

        if (!svg.selectAll('circle.console').empty()) {
          legendNodes.push(aNode("Console", "", "normal", undefined, 1, 0, 0, 0, false, {
            console_identifier: 'Dispatch console'
          }))
        }
        if (!svg.selectAll('circle.client.in').empty()) {
          var node = aNode("Sender", "", "normal", undefined, 2, 0, 0, 0, false, {})
          node.cdir = "in"
          legendNodes.push(node)
        }
        if (!svg.selectAll('circle.client.out').empty()) {
          var node = aNode("Receiver", "", "normal", undefined, 3, 0, 0, 0, false, {})
          node.cdir = "out"
          legendNodes.push(node)
        }
        if (!svg.selectAll('circle.client.inout').empty()) {
          var node = aNode("Sender/Receiver", "", "normal", undefined, 4, 0, 0, 0, false, {})
          node.cdir = "both"
          legendNodes.push(node)
        }
        if (!svg.selectAll('circle.qpid-cpp').empty()) {
          legendNodes.push(aNode("Qpid broker", "", "on-demand", undefined, 5, 0, 0, 0, false, {
            product: 'qpid-cpp'
          }))
        }
        if (!svg.selectAll('circle.artemis').empty()) {
          legendNodes.push(aNode("Artemis broker", "", "route-container", '', undefined, 6, 0, 0, 0, false,
          {product: 'apache-activemq-artemis'}))
        }
        if (!svg.selectAll('circle.route-container').empty()) {
          legendNodes.push(aNode("Service", "", "route-container", 'external-service', undefined, 7, 0, 0, 0, false,
          {product: ' External Service'}))
        }
        lsvg = lsvg.data(legendNodes, function(d) {
          return d.key;
        });
        var lg = lsvg.enter().append('svg:g')
          .attr('transform', function(d, i) {
            // 45px between lines and add 10px space after 1st line
            return "translate(0, " + (45 * i + (i > 0 ? 10 : 0)) + ")"
          })

        appendCircle(lg)
        appendContent(lg)
        appendTitle(lg)
        lg.append('svg:text')
          .attr('x', 35)
          .attr('y', 6)
          .attr('class', "label")
          .text(function(d) {
            return d.key
          })
        lsvg.exit().remove();
        var svgEl = document.getElementById('svglegend')
        if (svgEl) {
          var bb;
          // firefox can throw an exception on getBBox on an svg element
          try {
            bb = svgEl.getBBox();
          } catch (e) {
            bb = {
              y: 0,
              height: 200,
              x: 0,
              width: 200
            }
          }
          svgEl.style.height = (bb.y + bb.height) + 'px';
          svgEl.style.width = (bb.x + bb.width) + 'px';
        }

        if (!mousedown_node || !$scope.selected_node)
          return;

        if (!start)
          return;
        // set the graph in motion
        //QDR.log.debug("mousedown_node is " + mousedown_node);
        force.start();

      }

      function mousedown() {
        // prevent I-bar on drag
        //d3.event.preventDefault();

        // because :active only works in WebKit?
        svg.classed('active', true);
      }

      // we are about to leave the page, save the node positions
      $rootScope.$on('$locationChangeStart', function(event, newUrl, oldUrl) {
        //QDR.log.debug("locationChangeStart");
        savePositions()
      });
      // When the DOM element is removed from the page,
      // AngularJS will trigger the $destroy event on
      // the scope
      $scope.$on("$destroy", function(event) {
        //QDR.log.debug("scope on destroy");
        savePositions();
        d3.select("#SVG_ID").remove();
        window.removeEventListener('resize', resize);
      });

      $scope.mockTopologies = []
      $scope.mockTopologyDir = ""
      QDRService.sendMethod("GET-TOPOLOGY-LIST", {}, function (response) {
        $scope.mockTopologies = response.sort()
        QDR.log.info("setting mockTopologies to " + response)
        QDRService.sendMethod("GET-TOPOLOGY", {}, function (response) {
          // this will trigger the watch on this variable which will get the topology
          $timeout(function () {
            $scope.mockTopologyDir = response
          })
        })
      })

      function doShowConfigDialog(config) {
        var d = $uibModal.open({
          dialogClass: "modal dlg-large",
          backdrop: true,
          keyboard: true,
          backdropClick: true,
          controller: 'QDR.ShowConfigDialogController',
          templateUrl: 'show-config-template.html',
          resolve: {
            config: function() {
              return config;
            }
          }
        });
      }

      function doNewDialog() {
        var d = $uibModal.open({
          dialogClass: "modal dlg-large",
          backdrop: true,
          keyboard: true,
          backdropClick: true,
          controller: 'QDR.NewDialogController',
          templateUrl: 'new-config-template.html',
          resolve: {
            list: function() {
              return $scope.mockTopologies;
            }
          }
        });
        $timeout(function () {
          d.result.then(function(result) {
            if (result) {
              // append the new topology to the list of configs and switch to the new one
              if ($scope.mockTopologies.indexOf(result.newTopology) < 0) {
                $scope.mockTopologies.push(result.newTopology)
                $scope.mockTopologies.sort()
              }
              $scope.mockTopologyDir = result.newTopology
            }
          });
        })
      };
      function doSettingsDialog(opts) {
        var d = $uibModal.open({
          dialogClass: "modal dlg-large",
          backdrop: true,
          keyboard: true,
          backdropClick: true,
          controller: 'QDR.SettingsDialogController',
          templateUrl: 'settings-template.html',
          resolve: {
            settings: function() {
              return opts
            }
          }
        });
        $timeout(function () {
          d.result.then(function(result) {
            if (result) {
              Object.assign(settings, result)
            }
          });
        })
      };
      function valFromMapArray(ar, key, val) {
        for (var i=0; i<ar.length; i++) {
          if (ar[i][key] && ar[i][key] === val)
            return ar[i]
        }
        return undefined
      }

      function doEditDialog(node, entity, context) {
        var entity2key = {router: 'name', log: 'module', sslProfile: 'name', connector: 'name', listener: 'port'}
        var d = $uibModal.open({
          dialogClass: "modal dlg-large",
          backdrop: true,
          keyboard: true,
          backdropClick: true,
          controller: 'QDR.NodeDialogController',
          templateUrl: 'node-config-template.html',
          resolve: {
            node: function() {
              return node;
            },
            entityType: function() {
              return entity
            },
            context: function () {
              return context
            },
            entityKey: function () {
              return entity2key[entity]
            }
          }
        });
        $timeout(function () {
          d.result.then(function(result) {
            if (result) {
              if (entity === 'router') {
                var router = valFromMapArray(result.entities, "actualName", "router")
                if (router) {
                    var r = new FormValues(router)
                    r.name(router)
                    Object.assign(node, r.node)
                    initGraph()
                    initForce()
                    restart();
                }
              }
              else {
                var key = entity2key[entity]
                var nodeObj = node[entity+'s']
                if ('del' in result) {
                  delete nodeObj[context]
                } else {
                  var rVals = valFromMapArray(result.entities, "actualName", entity)
                  if (rVals) {
                      var o = new FormValues(rVals)
                      if (!angular.isDefined(nodeObj)) {
                        node[entity+'s'] = {}
                        nodeObj = node[entity+'s']
                      }
                      // we were editing an existing log section and the module was changed
                      else if (o.node[key] !== context && context !== 'new') {
                        delete nodeObj[context]
                      }
                      nodeObj[o.node[key]] = o.node
                  }
                }
                // logKeys is only used by the template to display context-menu items
                node[entity+'Keys'] = Object.keys(nodeObj)
              }
            }
          });
        })
      };

      var FormValues = function (entity) {
          this.node = {};
          for (var i=0; i<entity.attributes.length; i++) {
            var attr = entity.attributes[i]
            if (typeof attr.rawtype === 'object' && attr['selected'])
              attr['value'] = attr['selected']
            this.node[attr['name']] = attr['value']
          }
      };

      FormValues.prototype.name = function (entity) {
          var name = valFromMapArray(entity.attributes, "name", "name")
          if (name) {
            name = name.value
            this.node['name'] = name
            this.node['routerId'] = name
            this.node['key'] = "amqp:/_topo/0/" + name + "/$management"
          }
      };


    }
  ]);

  QDR.module.controller("QDR.ShowConfigDialogController", function ($scope, $uibModalInstance, config) {
    $scope.config = config
    $scope.ok = function () {
      $uibModalInstance.close()
    }
  })

  QDR.module.controller("QDR.NewDialogController", function($scope, $uibModalInstance, list) {
    $scope.newTopology = ""
    $scope.exclude = list
    $scope.inList = function () {
      return $scope.exclude.indexOf($scope.newTopology) >= 0
    }

    $scope.setSettings = function () {
      $uibModalInstance.close({
        newTopology: $scope.newTopology
      });
    }
    $scope.cancel = function () {
      $uibModalInstance.close()
    }
  })

  QDR.module.directive('customOnChange', function() {
    return {
      restrict: 'A',
      link: function (scope, element, attrs) {
        var onChangeHandler = scope.$eval(attrs.customOnChange);
        element.bind('change', onChangeHandler);
      }
    };
  });

  QDR.module.controller("QDR.SettingsDialogController", function($scope, $uibModalInstance, settings) {
    var local_settings = {}
    Object.assign(local_settings, settings)
    $scope.entity = {description: "Settings",
                    attributes: [
                      {name: "baseName", humanName: "New router prefix", input: "input", type: "text", value: local_settings.baseName, required: true},
                      {name: "http", humanName: "Add HTTP listener to one of the routers", input: "boolean", type: "boolean", value: local_settings.http, required: true},
                      //{name: "file", humanName: "Browse for config file folder", input: "file", type: "file", value: "", required: false},
                    ]}

    $scope.uploadFile = function(e){
        var theFiles = e.target.files;
        var relativePath = theFiles[0].webkitRelativePath;
        var folder = relativePath.split("/");
        QDR.log.info(folder[0])
    };

    $scope.setSettings = function () {
      var newSettings = {}
      $scope.entity.attributes.forEach( function (attr) {
        newSettings[attr.name] = attr.value
      })
      $uibModalInstance.close(newSettings);
    }

    $scope.cancel = function () {
      $uibModalInstance.close()
    }

  })


  return QDR;
}(QDR || {}));
