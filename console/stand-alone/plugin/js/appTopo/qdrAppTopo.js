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
'use strict';
/* global angular d3 MicroService */

var QDR = (function (QDR) {
  QDR.module.controller('QDR.AppTopoController', ['$scope', 'QDRService', '$location', '$timeout', function($scope, QDRService, $location, $timeout) {

    // if we get here and there is no connection, redirect to the connect page and then 
    // return here once we are connected
    if (!QDRService.management.connection.is_connected()) {
      QDR.redirectWhenConnected($location, 'app');
      return;
    }

    var getSizes = function() {
      const legendWidth = 0;
      const gap = 5;
      let width = $('#appTopo').width() - gap - legendWidth;
      let top = $('#appTopo').offset().top;
      let height = window.innerHeight - top - gap;
      if (width < 10) {
        QDR.log.info('page width and height are abnormal w:' + width + ' height:' + height);
        return [0, 0];
      }
      return [width, height];
    };
    var resize = function() {
      if (!svg)
        return;
      let sizes = getSizes();
      if (sizes[0] > 0) {
        // set attrs and 'resume' force
        svg.attr('width', sizes[0]);
        svg.attr('height', sizes[1]);
        force.size(sizes).resume();
      }
    };

    var nodes, links, width, height;
    let sizes = getSizes();
    width = sizes[0];
    height = sizes[1];
    var svg = d3.select('#appTopo').append('svg')
      .attr('width', width)
      .attr('height', height);

    nodes = [];
    MicroService.reset();
    var node0 = new MicroService.init('Client');
    node0.info = {geo: {lat: 40, long: 40, city: 'Brno'}, ldap: 'ldap', nodeName: 'Canton'};
    node0.connections.push({source: 0, target: 1, si:0});
    node0.connections.push({source: 0, target: 2, si:1});
    nodes.push(node0);

    var node1 = new MicroService.init();
    node1.connections.push({});
    nodes.push(node1);

    var node2 = new MicroService.init();
    node2.connections.push({});
    nodes.push(node2);
    
    var node3 = new MicroService.init('Client');
    node3.connections.push({source: 3, target: 1, si:2});
    node3.connections.push({source: 3, target: 4, si:0});
    node3.connections.push({source: 3, target: 5, si:1});
    nodes.push(node3);

    var node4 = new MicroService.init();
    node4.connections.push({});
    nodes.push(node4);
    
    var node5 = new MicroService.init();
    node5.connections.push({});
    nodes.push(node5);
    
    
    links = [];
    nodes.forEach ( function (node) {
      node.connections.forEach( function (connection) {
        if (angular.isDefined(connection.source)) {
          links.push({source: connection.source, target: connection.target, si: connection.si});
        }
      });
    });

    var savePositions = function () {
      nodes.forEach( function (d) {
        localStorage['QDRAT'+ d.id] = angular.toJson({
          x: Math.round(d.x),
          y: Math.round(d.y),
          fixed: d.fixed ? 1 : 0,
        });
      });
    };

    var force = d3.layout.force()
      .nodes(nodes)
      .links(links)
      .size([width, height])
      .linkDistance(250)
      //.charge(-1)
      .friction(.10)
      .gravity(.01)
      .on('tick', tick)
      .on('end', function () {savePositions();})
      .start();

    function dragstart(d) {
      d3.select(this).classed('fixed', d.fixed = true);
    }
    
    function dblclick(d) {
      d3.select(this).classed('fixed', d.fixed = false);
    }

    var drag = force.drag()
      .on('dragstart', dragstart);
  
    var connectorY = function (cons, h, connectorR, index) {
      var sp = (h - 2*connectorR*cons) / (cons + 1);
      return sp * (index+1) + (2*connectorR*index) + connectorR;
    };

    var micro_services, connectors, connector_info;
    var serviceHeight = 50;
    var serviceWidth = 50;
    var clientHeight = 200;
    var clientWidth = 100;
    var connectorR = 10;
    var draw = function () {
      var diamondSize = 30;

      connectors = svg.selectAll('.service-line')
        .data(links)
        .enter().append('svg:path')
        .attr('class', 'service-line');

      connector_info = svg.selectAll('.service-line-info')
        .data(links)
        .enter().append('svg:g')
        .attr('class', 'service-line-info');
      
      connector_info.append('svg:path')
        .attr('class', 'service-info')
        .attr('d', d3.svg.symbol().size(diamondSize*diamondSize/2).type('diamond'));
      connector_info.append('svg:text')
        .attr('class', 'info-text')
        .attr('y', 8*diamondSize/30)
        .text( '?')
        .attr('text-anchor', 'middle');

      micro_services = svg.selectAll('.micro-service')
        .data(nodes, function (d) { return d.id; })
        .enter().append('svg:g')
        .attr('class', 'micro-service')
        .attr('id', function (d) { return 'ms' + d.id; });
  
      micro_services.each(function (d) {
        var cons = d.connections.length;
        var h = Math.max(d.type === 'Client' ? clientHeight : serviceHeight, cons*connectorR*2);
        if (d.type === 'Client') {
          d3.select(this).append('svg:path')  // client rectangle
            .attr('class', 'service-container')
            .attr('d', function () {
              return d3.rect({x:0, y:0, width: clientWidth, height: h});
            })
            .on('mouseup', savePositions);
        } else {
          d3.select(this).append('svg:circle')  // micro-service circle
            .attr('class', 'service-container service')
            .attr('r', serviceWidth)
            .on('mouseup', savePositions);
        }

        if (d.type === 'Client') {
          let x = d.type === 'Client' ? 0 : serviceWidth;
          d.connections.forEach( function (conn, i) {
            d3.select(this).append('svg:circle')  // connector
              .attr('id', 'mc' + d.id + '_' + i)
              .attr('class', 'service-connection')
              .attr('transform', 'translate(' + x + ',' + connectorY(cons, h, connectorR, i) + ')')
              .attr('r', connectorR);
          }.bind(this));
        }
        onDrag(d);
      });

      // bring the element that was clicked on to the front
      micro_services.on('mousedown', function () {
        let el = d3.select(this).node();
        if (el)
          $(el).appendTo(svg.node());
      });

      // dblclick unfreezes elements
      micro_services.on('dblclick', dblclick);
      // allow auto drag/drop
      micro_services.call(drag);
      // move the connection circles based on relative positions of micro-services and clients
      drag.on('drag', onDrag);
      function onDrag(d) {
        let clients = [], services = [];
        if (d.type === 'Client') {
          clients.push(d);
          d.connections.forEach( function (connection) {
            services.push(nodes[connection.target]);
          });
        } else {
          services.push(d);
          nodes.forEach (function (node) {
            node.connections.forEach( function (connection) {
              if (connection.target === d.id)
                clients.push(node);
            });
          });
        }
        services.forEach( function (service) {
          clients.forEach( function (client) {
            let cx = 0;
            for (var i=0,si=0; i<client.connections.length; i++) {
              if (client.connections[i].target === service.id) {
                si = client.connections[i].si;
                break;
              }
            }
            let cy = connectorY(client.connections.length, clientHeight, connectorR, si);
            let client_circle = d3.select('#mc'+client.id + '_' + si);
            if (service.x < client.x + clientWidth / 2) {
              let cc = client.connections.filter( function (c) {return c.target === service.id;})[0];
              cc['orientation'] = 'left';
            } else {
              let cc = client.connections.filter( function (c) {return c.target === service.id;})[0];
              cc['orientation'] = 'right';
              cx = clientWidth;
            }
            client_circle.attr('transform', function () {return 'translate('+cx+','+cy+')';});
          });
        });
      }
    };
    draw();

    function tick() {
      micro_services
        .attr('transform', function(d) { return 'translate(' + d.x + ',' + d.y + ')'; });

      let getPositions = function (d) {
        var cons = d.source.connections.length;
        var h = Math.max(d.source.type === 'Client' ? clientHeight : serviceHeight, cons*connectorR*2);
        var sy = connectorY(cons, h, connectorR, d.si) + d.source.y;
        let sx = d.source.x;
        let tx = d.target.x;
        let ty = d.target.y;
        let sconn = d.source.connections.filter( function (c) {return c.si === d.si;})[0];
        if (sconn.orientation === 'right')
          sx += clientWidth;

        // find the point where the line meets the target circle
        // needed in order to put the info diamond in the center of the line
        let dx = sx - tx;
        let dy = sy - ty;
        let dh = Math.sqrt(dx*dx + dy*dy);
        let dxc = serviceWidth * dx / dh;
        let dyc = serviceWidth * dy / dh;
        tx = tx + dxc;
        ty = ty + dyc;
        return {sx: sx, tx: tx, sy: sy, ty: ty};
      };
      connectors
        .attr('d', function (d) {
          let pos = getPositions(d);
          return 'M' + pos.sx + ',' + pos.sy + 'L' + pos.tx + ',' + pos.ty; 
        });

      connector_info
        .attr('transform', function (d) {
          let pos = getPositions(d);
          return 'translate(' + (pos.sx + pos.tx) / 2 + ',' + (pos.sy + pos.ty) / 2 + ')';
        });
    }
    window.addEventListener('resize', resize);

    $scope.$on('$destroy', function() {
      //QDR.log.debug("scope on destroy");
      savePositions();

      d3.select('#appTopo').remove();
      window.removeEventListener('resize', resize);
    });

  }]);
  return QDR;

} (QDR || {}));
