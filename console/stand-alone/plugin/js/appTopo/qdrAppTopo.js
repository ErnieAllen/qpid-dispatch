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
/* global angular d3 */

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

    var nodes, links, width, height, nodeCount;
    let sizes = getSizes();
    width = sizes[0];
    height = sizes[1];
    var svg = d3.select('#appTopo').append('svg')
      .attr('width', width)
      .attr('height', height)
      .append('g');

    nodes = [];
    nodes.push({
      type: d3.svg.symbolTypes[~~(Math.random() * d3.svg.symbolTypes.length)],
      size: Math.random() * 300 + 100
    });
    links = [];
  
    var force = d3.layout.force()
      .nodes(nodes)
      .links(links)
      .size([width, height])
      //.linkDistance(function(d) { return linkDistance(d, nodeCount); })
      //.charge(function(d) { return charge(d, nodeCount); })
      //.friction(.10)
      //.gravity(function(d) { return gravity(d, nodeCount); })
      .on('tick', tick)
      //.on('end', function () {savePositions();})
      .start();

    svg.selectAll("path")
      .data(nodes)
      .enter().append("path")
      .attr("transform", function(d) { return "translate(" + d.x + "," + d.y + ")"; })
      .attr("d", d3.svg.symbol()
        .size(function(d) { return d.size; })
        .type(function(d) { return d.type; }))
      .style("fill", "steelblue")
      .style("stroke", "white")
      .style("stroke-width", "1.5px")
      .call(force.drag);

    function tick() {
      svg.selectAll('path')
        .attr('transform', function(d) { return 'translate(' + d.x + ',' + d.y + ')'; });
    }



  }]);
  return QDR;

} (QDR || {}));