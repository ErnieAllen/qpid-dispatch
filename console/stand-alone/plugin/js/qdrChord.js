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
/* global angular d3 Promise valuesMatrix */

var QDR = (function (QDR) {
  QDR.module.controller('QDR.ChordController', ['$scope', 'QDRService', '$location', '$timeout', function($scope, QDRService, $location, $timeout) {

    // flag to show/hide the 'There are no values' message on the html page
    $scope.noValues = true;
    // state of the slider buttons
    $scope.legendOptions = {isRate: false, byAddress: false};
    // colors for the legend and the diagram
    $scope.chordColors = {};
    $scope.arcColors = {};

    // get notified when the byAddress slider is toggled
    $scope.$watch('legendOptions.byAddress', function (newValue, oldValue) {
      if (newValue !== oldValue) {
        startOver();
      }
    });
    // get notified when the rate slider is toggled
    $scope.$watch('legendOptions.isRate', function (newValue, oldValue) {
      if (newValue !== oldValue) {
        startOver();
      }
    });

    // called by angular when mouse enters one of the address legends
    $scope.enterLegend = function (addr) {
      // fade all chords that don't have this address 
      let indexes = [];
      last_matrix.rows.forEach( function (row, r) {
        if (row.address === addr) {
          indexes.push(r);
        }
      });
      d3.selectAll('.chords path').classed('fade', function(p) {
        return indexes.indexOf(p.source.index) < 0 && indexes.indexOf(p.target.index) < 0;
      });
    };
    // called by angular when mouse enters one of the router legends
    $scope.enterRouter = function (router) {
      let indexes = [];
      // fade all chords that are not associated with this router
      last_matrix.rows.forEach( function (row, r) {
        if (row.ingress === router || row.egress === router || row.chordName === router)
          indexes.push(r);
      });
      d3.selectAll('.chords path').classed('fade', function(p) {
        return indexes.indexOf(p.source.index) < 0 && indexes.indexOf(p.target.index) < 0;
      });
    };
    $scope.leaveLegend = function () {
      showAllChords();
    };

    // if we get here and there is no connection, redirect to the connect page and then 
    // return here once we are connected
    if (!QDRService.management.connection.is_connected()) {
      QDR.redirectWhenConnected($location, 'chord');
      return;
    }

    // the filter processes the raw data into a matrix suitable for the d3 library
    let setFilter = function () {
      filter = $scope.legendOptions.byAddress ? separateAddresses: aggregateAddresses;
    };
    // clear the svg and recreate it.
    // called when we switch between showing aggregate diagram and by address diagram
    // also called when a new sender or receiver causes a new chord to show up
    let startOver = function () {
      clearInterval(interval);
      setFilter();
      initSvg();
      $timeout( function () {
        $scope.chordColors = {};
        $scope.arcColors = {};
        getMatrix(filter)
          .then( function (matrix) {
            render(matrix);
          });
        interval = setInterval(doUpdate, transitionDuration);
      });
    };
    // diagram constants
    const outerRadius = 720 / 2,
      innerRadius = outerRadius - 130,
      textRadius = innerRadius + 20,
      arcPadding = .04;

    // used for animation duration and the data refresh interval 
    let transitionDuration = 1000;
    // format with commas
    let formatNumber = d3.format(',');

    // colors
    let colorGen = d3.scale.category10();
    // return the color associated with a router
    let fillArc = function (matrixValues, row) {
      let router = matrixValues.routerName(row);
      if (!(router in $scope.arcColors))
        $scope.arcColors[router] = colorGen(Object.keys($scope.arcColors).length);
      return $scope.arcColors[router];
    };
    // return the color associated with a chord.
    // if viewing by address, the color will be the address color.
    // if viewing aggregate, the color will be the router color of the largest chord ending
    let fillChord = function (matrixValues, row, col) {
      if (!$scope.legendOptions.byAddress) {
        return colorGen(row);
      }
      // by address
      let addr = matrixValues.addressName(col);
      if (!(addr in $scope.chordColors))
        $scope.chordColors[addr] = colorGen(Object.keys($scope.chordColors).length + 
                                            Object.keys($scope.arcColors).length);
      return $scope.chordColors[addr];
    };

    let chord = d3.layout.chord()
      .padding(arcPadding);

    // keep track of previous chords so we can animate to the new values
    let last_chord = chord, last_chord_length,
      last_values = {values: undefined, timestamp: undefined}, last_matrix;

    // global pointer to the diagram
    let svg;

    // called once when the page loads and again
    // whenever the number of routers that have egressed messages changes
    let initSvg = function () {
      d3.select('#chord svg').remove();
      svg = d3.select('#chord').append('svg')
        .attr('width', outerRadius * 2)
        .attr('height', outerRadius * 2)
        .append('g')
        .attr('id', 'circle')
        .attr('transform', 'translate(' + outerRadius + ',' + outerRadius + ')')

      // mouseover target for when the mouse leaves the diagram
      svg.append('circle')
        .attr('r', innerRadius * 2)
        .on('mouseover', showAllChords);

      // background circle. will only get a mouseover event if the mouse is between chords
      svg.append('circle')
        .attr('r', innerRadius)
        .on('mouseover', function() { d3.event.stopPropagation(); });

    };
    initSvg();

    // this filter will show an arc per router with the addresses aggregated
    let aggregateAddresses = function (values) {
      let m = new valuesMatrix(true);
      values.forEach (function (value) {
        let chordName = value.egress;
        let egress = value.ingress;
        let row = m.indexOf(chordName);
        if (row < 0) {
          row = m.addRow(chordName);
        }
        let col = m.indexOf(egress);
        if (col < 0) {
          col = m.addRow(egress);
        }
        m.addValue(row, col, value);
      });
      return m.sorted();
    };

    // this filter will show an arc per router-address
    let separateAddresses = function (values) {
      let m = new valuesMatrix(false);
      values.forEach( function (value) {
        let egressChordName = value.egress + value.ingress + value.address;
        let r = m.indexOf(egressChordName);
        if (r < 0) {
          r = m.addRow(egressChordName, value.ingress, value.egress, value.address);
        }
        let ingressChordName = value.ingress + value.egress + value.address;
        let c = m.indexOf(ingressChordName);
        if (c < 0) {
          c = m.addRow(ingressChordName, value.egress, value.ingress, value.address);
        }
        m.addValue(r, c, value);
      });
      return m.sorted();
    };

    // global filter function that converts raw data to a matrix
    let filter = aggregateAddresses; 
    setFilter();

    // construct a square matrix of the number of messages each router has egressed from each router
    let getMatrix = function (filter) {
      // local helper functions to arrange the chords by router
      let sortByKeys = function (values) {
        return values.sort( function (a, b) {
          return a.key > b.key ? 1 : a.key < b.key ? -1 : 0;
        });
      };
      let genKeys = function (values) {
        values.forEach( function (value) {
          value.key = value.egress + value.ingress + value.address;
        });
      };
      return new Promise( (function (resolve, reject) {
        // get the router.node and router.link info
        QDRService.management.topology.fetchAllEntities([
          {entity: 'router.node', attrs: ['id', 'index']},
          {entity: 'router.link', attrs: ['linkType', 'linkDir', 'owningAddr', 'ingressHistogram']}], 
        function(results) {
          if (!results) {
            reject(Error('unable to fetch entities'));
            return;
          }
          // the raw data received from the rouers
          let values = [];

          // for each router in the network
          for (let nodeId in results) {
            // get a map of router ids to index into ingressHistogram for the links for this router.
            // each routers has a different order for the routers
            let ingressRouters = [];
            let routerNode = results[nodeId]['router.node'];
            let idIndex = routerNode.attributeNames.indexOf('id');

            // ingressRouters is an array of router names in the same order that the ingressHistogram values will be in
            for (let i=0; i<routerNode.results.length; i++) {
              ingressRouters.push(routerNode.results[i][idIndex]);
            }

            // the name of the router we are working on
            let egressRouter = QDRService.management.topology.nameFromId(nodeId);

            // loop through the router links for this router looking for out/endpoint/non-console links
            let routerLinks = results[nodeId]['router.link'];
            for (let i=0; i<routerLinks.results.length; i++) {
              let link = QDRService.utilities.flatten(routerLinks.attributeNames, routerLinks.results[i]);
              // if the link is an outbound/enpoint/non console
              if (link.linkType === 'endpoint' && link.linkDir === 'out' && !link.owningAddr.startsWith('Ltemp.')) {
                // keep track of the raw egress values as well as their ingress and egress routers and the address
                for (let j=0; j<ingressRouters.length; j++) {
                  let messages = link.ingressHistogram[j];
                  if (messages) {
                    values.push({ingress: ingressRouters[j], 
                      egress:  egressRouter, 
                      address: QDRService.utilities.addr_text(link.owningAddr), 
                      messages: messages});
                  }
                }
              }
            }
          }
          // sort the raw data by egress router name
          genKeys(values);
          sortByKeys(values);

          if ($scope.legendOptions.isRate) {
            let rateValues = calcRate(values, last_values);
            last_values.values = angular.copy(values);
            last_values.timestamp = Date.now();
            values = rateValues;
          }
          // convert the raw data to a matrix
          let matrix = filter(values);
          last_matrix = matrix;
          // resolve the promise
          resolve(matrix);
        });
      }));
    };

    let calcRate = function (values, last_values) {
      let rateValues = [];
      let now = Date.now();
      let elapsed = last_values.timestamp ? (now - last_values.timestamp) / 1000 : 0;
      values.forEach( function (value) {
        let last_index = last_values.values ? 
          last_values.values.findIndex( function (lv) {
            return lv.ingress === value.ingress &&
            lv.egress === value.egress &&
            lv.address === value.address; 
          }) : -1;
        let rate = 0;
        if (last_index >= 0) {
          rate = (value.messages - last_values.values[last_index].messages) / elapsed;
        }
        rateValues.push({ingress: value.ingress, 
          egress: value.egress, 
          address: value.address,
          messages: rate
        });
      });
      return rateValues;
    };
    // create the chord diagram
    let render = function (matrix) {
      // if there is no data, hide the svg and show a message 
      if (!matrix.hasValues()) {
        d3.select('#chord svg').remove();
        $timeout( function () {
          $scope.noValues = true;
        });
        return;
      }
      // pass just the raw numbers to the library
      chord.matrix(matrix.matrixMessages());
      last_chord = chord;

      // hide 'no data' message 
      $timeout( function () {
        $scope.noValues = false;
      });

      // save the number of chords
      last_chord_length = chord.chords().length;

      // create arcs
      svg.append('svg:g')
        .attr('class', 'arcs')
        .selectAll('path')
        .data(fixArcs(chord.groups, matrix))
        .enter().append('svg:path')
        .style('fill', function(d) { return fillArc(matrix, d.index); })
        .style('stroke', function(d) { return fillArc(matrix, d.index); })
        .attr('d', arcReference)
        .on('mouseover', mouseoverArc);
      // create chords
      svg.append('svg:g')
        .attr('class', 'chords')
        .selectAll('path')
        .data(chord.chords)
        .enter().append('svg:path')
        .style('stroke', function(d) { return d3.rgb(fillChord(matrix, d.source.index, d.source.subindex)).darker(); })
        .style('fill', function(d) { return fillChord(matrix, d.source.index, d.source.subindex); })
        .attr('d', d3.svg.chord().radius(innerRadius))
        .on('mouseover', mouseoverChord)
        .append('title').text(function(d) {
          return chordTitle(d, matrix);
        });

      // create labels
      let ticks = svg.append('svg:g')
        .attr('class', 'ticks')
        .selectAll('g')
        .data(chord.groups)
        .enter().append('svg:g')
        .on('mouseover', mouseoverArc)
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
  
      // needed for a click region
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
        .text(function(d) { 
          return matrix.chordName(d.index, false);
        });

      // size the rects around the labels so they respond to mouse events 
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

    // popup title when mouse is over a chord
    // shows the address, from and to routers, and the values
    let chordTitle = function (d, matrix) {
      let from,to,address;
      if (matrix.aggregate) {
        to = matrix.rows[d.source.index].chordName;
        from = matrix.rows[d.target.index].chordName;
        address = '';
      } else {
        let r = d.source.index;
        from = matrix.rows[r].ingress;
        to = matrix.rows[r].egress;
        address = matrix.rows[r].address + ': ';
      }
      let title = address + from
      + ' → ' + to
      + ': ' + formatNumber(d.source.value);
      if (d.target.value > 0 && to !== from) {
        title += ('\n' + to
        + ' → ' + from
        + ': ' + formatNumber(d.target.value));
      }
      return title;
    };

    // when viewing by address, adjust the arc's start and end angles so all arcs from a router are adjacent
    let fixArcs = function (fn, matrix) {
      let fixedGroups = fn();
      if (!matrix.aggregate) {
        for (let r=0, len=fixedGroups.length-1; r<len; r++) {
          if (matrix.rows[r].egress === matrix.rows[r+1].egress) {
            let midAngle = (fixedGroups[r].endAngle + fixedGroups[r+1].startAngle) / 2;
            fixedGroups[r].endAngle = midAngle - .01;
            fixedGroups[r+1].startAngle = midAngle + .01;
          } 
        }
      }
      return function () {
        return fixedGroups;
      };
    };
    // TODO: add a fixChords function to adjust the chords start and end angles

    // after the svg is initialized, this is called periodically to animate the diagram to the new positions
    function rerender(matrix) {
      // if there is no data, hide the svg and show a message 
      if (!matrix.hasValues()) {
        d3.select('#chord svg').remove();
        $timeout( function () {
          $scope.noValues = true;
        });
        return;
      }
      // create a new chord layout so we can animate between the last one and this one
      let rechord = d3.layout.chord()
        .padding(arcPadding)
        .matrix(matrix.matrixMessages());

      if (!last_chord) {
        last_chord = rechord;
        return;
      }
      // if there is a new chord then we can't transition. we need to redraw
      if (rechord.chords().length != last_chord_length) {
        startOver();
        return;
      }

      last_chord_length = rechord.chords().length;

      // update arcs
      svg.select('.arcs')
        .selectAll('path')
        .data(fixArcs(rechord.groups, matrix))
        .transition()
        .duration(transitionDuration)
        .attrTween('d', arcTween(last_chord));
    
      // update chords
      svg.select('.chords')
        .selectAll('path')
        .data(rechord.chords)
        .transition()
        .duration(transitionDuration)
        .attrTween('d', chordTween(last_chord))
        .select('title').text(function(d) {
          return chordTitle(d, matrix);
        });

      // update ticks
      svg.selectAll('.ticks')
        .selectAll('.group')
        .data(rechord.groups)
        .selectAll('.routers')
        .data(groupTicks)
        .transition()
        .duration(transitionDuration)
        .attr('transform', function(d) {
          return 'rotate(' + (d.angle * 180 / Math.PI - 90) + ')'
         + 'translate(' + textRadius + ',0)';
        });
      last_chord = rechord;
    }

    // used to transition chords along a circular path instead of linear
    let chordReference = d3.svg.chord().radius(innerRadius);
    // used to transition arcs along a curcular path instead of linear
    let arcReference = d3.svg.arc()
      .startAngle(function(d) { return d.startAngle; })
      .endAngle(function(d) { return d.endAngle; })
      .innerRadius(innerRadius)
      .outerRadius(textRadius);

    // animate an acr moving, growing, and shrinking
    function arcTween(chord) {
      return function(d,i) {
        i = Math.min(chord.groups().length - 1, i);
        let interpolate = d3.interpolate(chord.groups()[i], d);

        return function(t) {
          return arcReference(interpolate(t));
        };
      };
    }

    // animate a chord to its new position
    function chordTween(chord) {
      return function(d,i) {
        i = Math.min(chord.chords().length - 1, i);
        let interpolate = d3.interpolate(chord.chords()[i], d);

        return function(t) {
          return chordReference(interpolate(t));
        };
      };
    }

    function groupTicks(d) {
      var k = d.value ? (d.endAngle - d.startAngle) / d.value : 0;
      return [{
        angle: d.value * k / 2 + d.startAngle,
        index: d.index
      }];
    }

    // fade all chords that don't belong to the given arc index
    function mouseoverArc(d, i) {
      d3.selectAll('.chords path').classed('fade', function(p) {
        return p.source.index != i && p.target.index != i;
      });
    }

    // fade all chords except the given one
    function mouseoverChord(d) {
      d3.selectAll('.chords path').classed('fade', function(p) {
        return !(p.source.index === d.source.index && p.target.index === d.target.index);
      });
    }

    function showAllChords() {
      svg.selectAll('.chords path').classed('fade', false);
    }

    // when the page is exited
    $scope.$on('$destroy', function() {
      // stop updated the data
      clearInterval(interval);
      // clean up memory associated with the svg
      d3.select('#chord').remove();
    });

    // get the raw data and render the svg
    getMatrix(filter)
      .then(function (matrix) {
        render(matrix);
      });
    // called periodically to refresh the data
    function doUpdate() {
      getMatrix(filter)
        .then( function (matrix) {
          rerender(matrix);
        });
    }
    let interval = setInterval(doUpdate, transitionDuration*0.90);
  
  }]);
  return QDR;

} (QDR || {}));

