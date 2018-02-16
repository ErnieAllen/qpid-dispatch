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
/* global d3 */

var QDR = (function (QDR) {
  QDR.module.controller('QDR.ChordController', ['$scope', 'QDRService', '$location', '$timeout', function($scope, QDRService, $location, $timeout) {

    $scope.noValues = false;
    if (!QDRService.management.connection.is_connected()) {
      QDR.redirectWhenConnected($location, 'chord1');
      return;
    }

    var outerRadius = 720 / 2,
      innerRadius = outerRadius - 130,
      textRadius = innerRadius + 20,
      arcPadding = .04;

    var transitionDuration = 1000;
    var fill = d3.scale.category20c();

    var chord = d3.layout.chord()
      .padding(arcPadding);

    var last_chord = chord, last_chords;

    var arc = d3.svg.arc()
      .startAngle(function(d) { return d.startAngle; })
      .endAngle(function(d) { return d.endAngle; })
      .innerRadius(innerRadius)
      .outerRadius(textRadius);

    var svg;
    var initSvg = function () {
      d3.select('#chord svg').remove();
      svg = d3.select('#chord').append('svg')
        .attr('width', outerRadius * 2)
        .attr('height', outerRadius * 2)
        .append('g')
        .attr('id', 'circle')
        .attr('transform', 'translate(' + outerRadius + ',' + outerRadius + ')');

      // when mouse is over a segment of the circle, its chords are visible
      svg.append('circle')
        .attr('r', textRadius)
        .on('mouseover', mouseout);
    };
    initSvg();
    function mouseout() {
      svg.selectAll('.chord').classed('fade', false);
    }

    var chordNames = [];
    var getMatrix = function (cb) {
      let name2Index = {};
      chordNames = QDRService.management.topology.nodeNameList();
      chordNames.forEach(function(n, i) {
        name2Index[n] = i;
      });
      QDRService.management.topology.fetchAllEntities([
        {entity: 'router.node', attrs: ['id', 'index']},
        {entity: 'router.link', attrs: ['linkType', 'linkDir', 'owningAddr', 'ingressHistogram']}], 
      function(results) {
        // construct the matrix
        let matrix = [];
        for (let nodeId in results) {
          // get a map of router ids to index into ingressHistogram for the links for this router 
          let col2Name = [];
          let routerNode = results[nodeId]['router.node'];
          let idIndex = routerNode.attributeNames.indexOf('id');
          for (let i=0; i<routerNode.results.length; i++) {
            col2Name.push(routerNode.results[i][idIndex]);
          }

          let nname = QDRService.management.topology.nameFromId(nodeId);
          let row = matrix[name2Index[nname]];
          if (!row)
            row = matrix[name2Index[nname]] = Array.apply(null, Array(chordNames.length)).map(Number.prototype.valueOf,0);
          
          let routerLinks = results[nodeId]['router.link'];
          for (let i=0; i<routerLinks.results.length; i++) {
            let link = QDRService.utilities.flatten(routerLinks.attributeNames, routerLinks.results[i]);
            // if the link is an outbound/enpoint/non console
            if (link.linkType === 'endpoint' && link.linkDir === 'out' && !link.owningAddr.startsWith('Ltemp.')) {
              for (let j=0; j<chordNames.length; j++) {
                let messages = link.ingressHistogram[j];
                let col = name2Index[col2Name[j]];
                if (!row[col])
                  row[col] = 0;
                row[col] += messages;
              }
            }
            
          }
        }
        cb(matrix);
      });
    };

    var hasValues = function (matrix) {
      return matrix.some(function (row) {
        return row.some(function (col) {
          return col !== 0;
        });
      });
    };
    var render = function (matrix) {
      if (!hasValues(matrix)) {
        $scope.noValues = true;
        return;
      }
      chord.matrix(matrix);
      // hide 'no data' message 
      $timeout( function () {
        $scope.noValues = false;
      });

      // save the number of chords
      last_chords = chord.chords().length;

      // create arcs
      svg.append('svg:g')
        .attr('class', 'arcs')
        .selectAll('path')
        .data(chord.groups)
        .enter().append('svg:path')
        .style('fill', function(d) { return fill(d.index); })
        .style('stroke', function(d) { return fill(d.index); })
        .attr('d', arc)
        .on('mouseover', mouseover);

      // create chords
      svg.append('svg:g')
        .attr('class', 'chords')
        .selectAll('path')
        .data(chord.chords)
        .enter().append('svg:path')
        .style('stroke', function(d) { return d3.rgb(fill(d.source.index)).darker(); })
        .style('fill', function(d) { return fill(d.source.index); })
        .style('opacity', 1)
        .attr('d', d3.svg.chord().radius(innerRadius))
        .attr('visibility', function(d) { return d.source.value > 0.0029 ? 'visible' : 'hidden'; })
        .append('title').text(function(d) {
          return chordNames[d.source.index]
            + ' → ' + chordNames[d.target.index]
            + ': ' + formatPercent(d.source.value)
            + '\n' + chordNames[d.target.index]
           + ' → ' + chordNames[d.source.index]
           + ': ' + formatPercent(d.target.value);
        });

      // create labels
      var ticks = svg.append('svg:g')
        .attr('class', 'ticks')
        .selectAll('g')
        .data(chord.groups)
        .enter().append('svg:g')
        .on('mouseover', function(d, i) { mouseover(d, i, chord); })
        .attr('class', 'group')
        .selectAll('g')
        .data(groupTicks)
        .enter().append('svg:g')
        .attr('class', 'routers')
        .attr('transform', function(d) {
          return 'rotate(' + (d.angle * 180 / Math.PI - 90) + ')'
                + 'translate(' + textRadius + ',0)';
        });
  
      ticks.append('svg:line')
        .attr('x1', 1)
        .attr('y1', 0)
        .attr('x2', 5)
        .attr('y2', 0)
        .attr('stroke', '#000');
  
      ticks.append('svg:rect')
        .attr('transform', function(d) {
          return d.angle > Math.PI ? 'rotate(180)translate(-16)' : null;
        });

      ticks.append('svg:text')
        .attr('x', 8)
        .attr('dy', '.35em')
        .attr('text-anchor', function(d) {
          return d.angle > Math.PI ? 'end' : null;
        })
        .attr('transform', function(d) {
          return d.angle > Math.PI ? 'rotate(180)translate(-16)' : null;
        })
        .text(function(d) { return d.label; });

      svg.selectAll('.routers')
        .each(function () { 
          var bbox = d3.select(this).select('text').node().getBBox();
          d3.select(this).select('rect')
            .attr('width', bbox.width)
            .attr('height', bbox.height)
            .attr('x', bbox.x)
            .attr('y', bbox.y);
        });
    };
    getMatrix(render);

    function rerender(matrix) {
      if (!hasValues(matrix)) {
        return;
      }
      var chord = d3.layout.chord()
        .padding(arcPadding)
        .matrix(matrix);

      // if there is a new chord then we can't transition. we need to redraw
      if (chord.chords().length != last_chords) {
        initSvg();
        render(matrix);
        return;
      }

      // update arcs
      svg.select('.arcs')
        .selectAll('path')
        .data(chord.groups)
        .transition()
        .duration(transitionDuration)
        .attrTween('d', arcTween(last_chord))
        .select('title').text(function(d, i) {
          return chordNames[i] + ': ' + formatPercent(d.value) + ' of origins';
        });
    
      // update chords
      svg.select('.chords')
        .selectAll('path')
        .data(chord.chords)
        .transition()
        .duration(transitionDuration)
        .attrTween('d', chordTween(last_chord))
        .select('title').text(function(d) {
          return chordNames[d.source.index]
              + ' → ' + chordNames[d.target.index]
              + ': ' + formatPercent(d.source.value)
              + '\n' + chordNames[d.target.index]
              + ' → ' + chordNames[d.source.index]
              + ': ' + formatPercent(d.target.value);
        });

      // update ticks
      svg.selectAll('.ticks')
        .selectAll('.group')
        .data(chord.groups)
        .selectAll('.routers')
        .data(groupTicks)
        .transition()
        .duration(transitionDuration)
        .attr('transform', function(d) {
          return 'rotate(' + (d.angle * 180 / Math.PI - 90) + ')'
         + 'translate(' + textRadius + ',0)';
        });
      last_chord = chord;
    }
    var doUpdate = function () {
      getMatrix( function (matrix) {
        rerender(matrix);
      });
    };
    var interval = setInterval(doUpdate, transitionDuration);

    var chordl = d3.svg.chord().radius(innerRadius);
    function arcTween(chord) {
      return function(d,i) {
        let interpolate = d3.interpolate(chord.groups()[i], d);

        return function(t) {
          return arc(interpolate(t));
        };
      };
    }

    function chordTween(chord) {
      return function(d,i) {
        i = Math.min(chord.chords().length - 1, i);
        let interpolate = d3.interpolate(chord.chords()[i], d);

        return function(t) {
          return chordl(interpolate(t));
        };
      };
    }

    function groupTicks(d) {
      var k = d.value ? (d.endAngle - d.startAngle) / d.value : 0;
      return [{
        angle: d.value * k / 2 + d.startAngle,
        label: chordNames[d.index]
      }];
    }

    function mouseover(d, i) {
      d3.selectAll('.chords path').classed('fade', function(p) {
        return p.source.index != i
      && p.target.index != i;
      });
    }

    var formatPercent = d3.format('.1');
    $scope.$on('$destroy', function() {
      clearInterval(interval);
      d3.select('#chord').remove();
    });

  }]);
  return QDR;

} (QDR || {}));

