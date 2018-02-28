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

    const CHORDOPTIONSKEY = 'chordOptions';
    // flag to show/hide the 'There are no values' message on the html page
    $scope.noValues = true;
    // state of the slider buttons
    $scope.legendOptions = angular.fromJson(localStorage[CHORDOPTIONSKEY]) || {isRate: false, byAddress: false};
    // colors for the legend and the diagram
    $scope.chordColors = {};
    $scope.arcColors = {};

    // get notified when the byAddress slider is toggled
    $scope.$watch('legendOptions.byAddress', function (newValue, oldValue) {
      if (newValue !== oldValue) {
        startOver();
        localStorage[CHORDOPTIONSKEY] = JSON.stringify($scope.legendOptions);
      }
    });
    // get notified when the rate slider is toggled
    $scope.$watch('legendOptions.isRate', function (newValue, oldValue) {
      if (newValue !== oldValue) {
        startOver();
        localStorage[CHORDOPTIONSKEY] = JSON.stringify($scope.legendOptions);
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

    let fake_data = false;
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

    let getRadius = function () {
      let w = window,
        d = document,
        e = d.documentElement,
        b = d.getElementsByTagName('body')[0],
        x = w.innerWidth || e.clientWidth || b.clientWidth,
        y = w.innerHeight|| e.clientHeight|| b.clientHeight;
      return Math.floor((Math.min(x, y) * 0.9) / 2);
    };

    const arcPadding = .04;
    // diagram sizes that change when browser is resized
    let outerRadius, innerRadius, textRadius;
    let setSizes = function () {
      // size of circle + text
      outerRadius = getRadius();
      // size of chords
      innerRadius = outerRadius - 130;
      // arc ring around chords
      textRadius = Math.min(innerRadius * 1.1, innerRadius + 15);
    };
    setSizes();

    // TODO: handle window resizes
    /*
    let updateWindow  = function () {
      setSizes();
      startOver();
    };
    d3.select(window).on('resize.updatesvg', updateWindow);        
    */

    // used for animation duration and the data refresh interval 
    let transitionDuration = 1000;
    // format with commas
    let formatNumber = d3.format(',.1f');

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
        .attr('transform', 'translate(' + outerRadius + ',' + outerRadius + ')');

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
        let fake = [
          {
            'ingress': 'Canton',
            'egress': 'Brno',
            'address': 'Fashion',
            'messages': 506694,
            'key': 'BrnoCantonFashion'
          },
          {
            'ingress': 'Canton',
            'egress': 'Brno',
            'address': 'Weather',
            'messages': 234285,
            'key': 'BrnoCantonWeather'
          },
          {
            'ingress': 'Raleigh',
            'egress': 'Brno',
            'address': 'Sports',
            'messages': 348726,
            'key': 'BrnoRaleighSports'
          },
          {
            'ingress': 'Brno',
            'egress': 'Canton',
            'address': 'Fashion',
            'messages': 183248,
            'key': 'CantonBrnoFashion'
          },
          {
            'ingress': 'Canton',
            'egress': 'Canton',
            'address': 'Fashion',
            'messages': 569779,
            'key': 'CantonCantonFashion'
          },
          {
            'ingress': 'Westford',
            'egress': 'Canton',
            'address': 'News',
            'messages': 60927,
            'key': 'CantonWestfordNews'
          },
          {
            'ingress': 'Canton',
            'egress': 'Westford',
            'address': 'News',
            'messages': 692268,
            'key': 'WestfordCantonNews'
          },
          {
            'ingress': 'Westford',
            'egress': 'Westford',
            'address': 'News',
            'messages': 96905,
            'key': 'WestfordWestfordNews'
          }
        ];
        if (fake_data) {
          let values = fake;
          if (last_values.values) {
            values = [];
            last_values.values.forEach( function (lv) {
              let newMessages = Math.floor((Math.random() * 10)) + 10;
              values.push({ingress: lv.ingress, 
                egress:  lv.egress, 
                address: lv.address, 
                messages: lv.messages + newMessages});
            });
          }
  
          // sort the raw data by egress router name
          genKeys(values);
          sortByKeys(values);

          if ($scope.legendOptions.isRate) {
            let rateValues = calcRate(values, last_values);
            last_values.values = angular.copy(values);
            last_values.timestamp = Date.now();
            values = rateValues;
          } else {
            last_values.values = angular.copy(values);
            last_values.timestamp = Date.now();
          }
          // convert the raw data to a matrix
          let matrix = filter(values);
          last_matrix = matrix;
          // resolve the promise
          resolve(matrix);
          return;
        }
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
          } else {
            last_values.values = angular.copy(values);
            last_values.timestamp = Date.now();
          }
          // convert the raw data to a matrix
          let matrix = filter(values);
          last_matrix = matrix;
          // resolve the promise
          resolve(matrix);
        });
      }));
    };

    // compare the current values to the last_values and return the rate/second
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
          messages: Math.max(rate, 0.01)
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
        .on('mouseover', mouseoverArc)
        .append('title').text(function (d) {
          return arcTitle(d, matrix);
        });
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
        address = matrix.rows[r].address + '\n';
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
    let arcTitle = function (d, matrix) {
      let egress, value = 0;
      if (matrix.aggregate) {
        egress = matrix.rows[d.index].chordName;
        value = d.value;
      }
      else {
        egress = matrix.rows[d.index].egress;
        matrix.rows.forEach( function (row) {
          if (row.egress === egress) {
            row.cols.forEach(function (col) {
              value += col.messages;
            });
          }
        });
      }
      return egress + ': ' + formatNumber(value);
    };

    // when viewing by address, adjust the arc's start and end angles so all arcs from a router are adjacent
    let fixArcs = function (fn, matrix) {
      let gap = 0;
      let fixedGroups = fn();
      if (!matrix.aggregate) {
        for (let r=0, len=fixedGroups.length-1; r<len; r++) {
          if (matrix.rows[r].egress === matrix.rows[r+1].egress) {
            let midAngle = (fixedGroups[r].endAngle + fixedGroups[r+1].startAngle) / 2;
            fixedGroups[r].endAngle = midAngle - gap;
            fixedGroups[r+1].startAngle = midAngle + gap;
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
        .attrTween('d', arcTween(last_chord))
        .select('title').text(function (d) {
          return arcTitle(d, matrix);
        });
    
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
        .attrTween('transform', tickTween(last_chord));
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
        // avoid swapping cords that have similar begin and end arcs
        let old = chord.chords()[i];
        if (old.source.index === d.target.index &&
            old.source.subindex === d.target.subindex) {
          let s = old.source;
          old.source = old.target;
          old.target = s;
        }
        let interpolate = d3.interpolate(old, d);
        return function(t) {
          return chordReference(interpolate(t));
        };
      };
    }

    // animate the labels along a circular path
    function tickTween(chord) {
      return function(d) {
        let i = Math.min(chord.groups().length - 1, d.index);
        let startAngle = (chord.groups()[i].startAngle + chord.groups()[i].endAngle) / 2;
        // d.angle is the ending angle
        let interpolate = d3.interpolateNumber(startAngle, d.angle);
        return function(t) {
          return 'rotate(' + (interpolate(t) * 180 / Math.PI - 90) + ')'
               + 'translate(' + textRadius + ',0)';
        };
      };
    }

    function groupTicks(d) {
      return [{
        angle: (d.startAngle + d.endAngle) / 2,
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
      d3.select(window).on('resize.updatesvg', null);        
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

