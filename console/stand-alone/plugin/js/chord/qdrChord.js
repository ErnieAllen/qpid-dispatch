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
/* global angular d3 separateAddresses aggregateAddresses ChordData qdrRibbon */

var QDR = (function (QDR) {
  QDR.module.controller('QDR.ChordController', ['$scope', 'QDRService', '$location', '$timeout', '$sce', function($scope, QDRService, $location, $timeout, $sce) {

    // if we get here and there is no connection, redirect to the connect page and then 
    // return here once we are connected
    if (!QDRService.management.connection.is_connected()) {
      QDR.redirectWhenConnected($location, 'chord');
      return;
    }

    const CHORDOPTIONSKEY = 'chordOptions';
    const CHORDFILTERKEY = 'chordFilter';
    // flag to show/hide the 'There are no values' message on the html page
    $scope.noValues = true;
    // state of the slider buttons
    $scope.legendOptions = angular.fromJson(localStorage[CHORDOPTIONSKEY]) || {isRate: false, byAddress: false};
    let excludedAddresses = angular.fromJson(localStorage[CHORDFILTERKEY]) || [];
    // colors for the legend and the diagram
    $scope.chordColors = {};
    $scope.arcColors = {};

    // get notified when the byAddress slider is toggled
    $scope.$watch('legendOptions.byAddress', function (newValue, oldValue) {
      if (newValue !== oldValue) {
        d3.select('#legend')
          .classed('byAddress', newValue);
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
    $scope.addressFilterChanged = function () {
      excludedAddresses = [];
      for (let address in $scope.addresses) {
        if (!$scope.addresses[address])
          excludedAddresses.push(address);
      }
      localStorage[CHORDFILTERKEY] = JSON.stringify(excludedAddresses);
      if (chordData) 
        chordData.setFilter(excludedAddresses);

      startOver();
    };
    // called by angular when mouse enters one of the address legends
    $scope.enterLegend = function (addr) {
      if (!$scope.legendOptions.byAddress)
        return;
      // fade all chords that don't have this address 
      let indexes = [];
      chordData.last_matrix.rows.forEach( function (row, r) {
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
      let agg = chordData.last_matrix.aggregate;
      chordData.last_matrix.rows.forEach( function (row, r) {
        if (agg) {
          if (row.chordName === router)
            indexes.push(r);
        } else {
          if (row.ingress === router || row.egress === router)
            indexes.push(r);
        }
      });
      d3.selectAll('.chords path').classed('fade', function(p) {
        return indexes.indexOf(p.source.index) < 0 && indexes.indexOf(p.target.index) < 0;
      });
    };
    $scope.leaveLegend = function () {
      showAllChords();
    };
    $scope.addressClick = function (address) {
      $scope.addresses[address] = !$scope.addresses[address];
      $scope.addressFilterChanged();
    };

    let chordData = new ChordData(QDRService, 
      $scope.legendOptions.isRate, 
      $scope.legendOptions.byAddress ? separateAddresses: aggregateAddresses);
    chordData.setFilter(excludedAddresses);

    // clear the svg and recreate it.
    // called when we switch between showing aggregate diagram and by address diagram
    // also called when a new sender or receiver causes a new chord to show up
    let startOver = function () {
      clearInterval(interval);
      chordData.setRate($scope.legendOptions.isRate);
      chordData.setConverter($scope.legendOptions.byAddress ? separateAddresses: aggregateAddresses);

      initSvg();
      chordData.getMatrix().then(render, function (e) { console.log(e);});
      interval = setInterval(doUpdate, transitionDuration);
      if(!$scope.$$phase) $scope.$apply();
    };

    let getRadius = function () {
      let w = window,
        d = document,
        e = d.documentElement,
        b = d.getElementsByTagName('body')[0],
        x = w.innerWidth || e.clientWidth || b.clientWidth,
        y = w.innerHeight|| e.clientHeight|| b.clientHeight;
      return Math.max(Math.floor((Math.min(x, y) * 0.9) / 2), 300);
    };

    const arcPadding = .06;
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
    let colorGen = d3.scale.category20();
    // The colorGen funtion is not random access. 
    // To get the correct color[19] you first have to get all previous colors
    // I suspect some caching is going on in d3
    for (let i=0; i<20; i++) {
      colorGen(i);
    }
    // arc colors are taken from every other color starting at 0
    let getArcColor = function (n) {
      if (!(n in $scope.arcColors)) {
        let ci = Object.keys($scope.arcColors).length * 2;
        $scope.arcColors[n] = colorGen(ci);
      }
      return $scope.arcColors[n];
    };
    // chord colors are taken from every other color starting at 19 and going backwards
    let getChordColor = function (n) {
      if (!(n in $scope.chordColors)) {
        let ci = 19 - Object.keys($scope.chordColors).length * 2;
        let c = colorGen(ci);
        $scope.chordColors[n] = c;
      }
      return $scope.chordColors[n];
    };
    // return the color associated with a router
    let fillArc = function (matrixValues, row) {
      let router = matrixValues.routerName(row);
      return getArcColor(router);
    };
    // return the color associated with a chord.
    // if viewing by address, the color will be the address color.
    // if viewing aggregate, the color will be the router color of the largest chord ending
    let fillChord = function (matrixValues, d) {
      // aggregate
      if (!$scope.legendOptions.byAddress) {
        return fillArc(matrixValues, d.source.index);
      }
      // by address
      let addr = matrixValues.addressName(d.source.subindex);
      return getChordColor(addr);
    };

    let chord = d3.layout.chord()
      .padding(arcPadding);

    // keep track of previous chords so we can animate to the new values
    let last_chord = chord, last_chord_length;

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

    let emptyCircle = function () {
      $scope.noValues = false;
      $scope.addresses = chordData.getAddresses();
      d3.select('#chord svg .empty').remove();

      let arc = d3.svg.arc()
        .innerRadius(innerRadius)
        .outerRadius(textRadius)
        .startAngle(0)
        .endAngle(Math.PI * 2);

      svg.append('path')
        .attr('class', 'empty')
        .attr('d', arc);
    };

    let genArcColors = function () {
      $scope.arcColors = {};
      let routers = chordData.getRouters();
      routers.forEach( function (router) {
        getArcColor(router);
      });
    };
    let genChordColors = function () {
      $scope.chordColors = {};
      if ($scope.legendOptions.byAddress) {
        $scope.addresses = chordData.getAddresses();
        Object.keys($scope.addresses).forEach( function (address) {
          getChordColor(address);
        });
      }
    };
    let popoverChord = null;
    let popoverArc = null;
    // create the chord diagram
    let render = function (matrix) {
      // populate the arcColors object with a color for each router
      genArcColors();
      genChordColors();

      // if all the addresses are excluded, just show an empty circle
      let chordAddresses = chordData.getAddresses();
      let addressLen = Object.keys(chordAddresses).length;
      if (addressLen > 0 && excludedAddresses.length === addressLen) {
        $timeout( function () {
          emptyCircle();
        });
        return;
      }

      // if there is no data, hide the svg and show a message 
      if (!matrix.hasValues()) {
        //d3.select('#chord svg').remove();
        $timeout( function () {
          $scope.noValues = true;
        });
        return;
      }

      $scope.addresses = chordData.getAddresses();

      // pass just the raw numbers to the library
      chord.matrix(matrix.matrixMessages());
      last_chord = chord;

      // hide 'no data' message 
      $scope.noValues = false;

      // save the number of chords
      last_chord_length = chord.chords().length;

      // create arcs
      let arcGroup = svg.append('svg:g')
        .attr('class', 'arcs')
        .selectAll('path')
        .data(fixArcs(chord.groups, matrix), function (d) {return d.index;});

      let newArcs = arcGroup
        .enter().append('svg:path')
        .style('fill', function(d) { return fillArc(matrix, d.index); })
        .style('stroke', function(d) { return fillArc(matrix, d.index); })
        .attr('d', arcReference)
        .on('mouseover', mouseoverArc)
        .on('mousemove', function (d) {
          popoverArc = d;
          let title = arcTitle(d, matrix);
          $timeout(function () {
            $scope.popoverContent = title;
            $scope.trustedpopoverContent = $sce.trustAsHtml($scope.popoverContent);
          });
          d3.select('#popover-div')
            .style('display', 'block')
            .style('left', d3.event.pageX+'px')
            .style('top', (d3.event.pageY-60)+'px');
        })
        .on('mouseout', function () {
          popoverArc = null;
          d3.select('#popover-div')
            .style('display', 'none');
        });

      // create chords
      let chordGroup = svg.append('svg:g')
        .attr('class', 'chords')
        .selectAll('path')
        .data(chord.chords, function (d) {
          return d.source.index < d.target.index ? 
            d.source.index + '-' + d.target.index :
            d.target.index + '-' + d.source.index;
        });

      let newChords = chordGroup
        .enter().append('svg:path')
        .style('stroke', function(d) { return d3.rgb(fillChord(matrix, d)).darker(); })
        .style('fill', function(d) { return fillChord(matrix, d); })
        .attr('d', chordReference)
        .on('mouseover', mouseoverChord)
        .on('mousemove', function (d) {
          popoverChord = d;
          let title = chordTitle(d, matrix);
          $timeout(function () {
            $scope.popoverContent = title;
          });
          d3.select('#popover-div')
            .style('display', 'block')
            .style('left', d3.event.pageX+'px')
            .style('top', (d3.event.pageY-60)+'px');
        })
        .on('mouseout', function () {
          popoverChord = null;
          d3.select('#popover-div')
            .style('display', 'none');
        });

      // create labels
      let ticks = svg.append('svg:g')
        .attr('class', 'ticks')
        .selectAll('g')
        .data(consolidateLabels(chord.groups, matrix))
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
          return matrix.chordName(d.orgIndex, false);
        })
        .on('mouseover', mouseoverArc);

      if(!$scope.$$phase) $scope.$apply();

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
        address = matrix.rows[r].address + '<br/>';
      }
      let title = address + from
      + ' → ' + to
      + ': ' + formatNumber(d.source.value);
      if (d.target.value > 0 && to !== from) {
        title += ('<br/>' + to
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

    let consolidateLabels = function (fn, matrix) {
      let fixedGroups = fn();
      if (!matrix.aggregate) {
        let consolidatedGroups = [];
        for (let r=0, len=fixedGroups.length, laste=''; r<len; r++) {
          let fg = fixedGroups[r];
          let e = matrix.rows[r].egress;
          if (e !== laste) {
            consolidatedGroups.push({startAngle: fg.startAngle, endAngle: fg.endAngle, index: consolidatedGroups.length, orgIndex: fg.index});
          } else {
            consolidatedGroups[consolidatedGroups.length-1].endAngle = fg.endAngle;
          }
          laste = e;
        }
        fixedGroups = consolidatedGroups;
      } else {
        fixedGroups.forEach( function (fg) {
          fg.orgIndex = fg.index;
        });
      }
      return function () {
        return fixedGroups;
      };
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

    // after the svg is initialized, this is called periodically to animate the diagram to the new positions
    function rerender(matrix) {
      // if all the addresses are excluded, just show an empty circle
      // if all the addresses are excluded, just show an empty circle
      let chordAddresses = chordData.getAddresses();
      let addressLen = Object.keys(chordAddresses).length;
      if (addressLen > 0 && excludedAddresses.length === addressLen) {
        $timeout( function () {
          emptyCircle();
        });
        return;
      }

      // if there is no data, hide the svg and show a message 
      if (!matrix.hasValues()) {
        //d3.select('#chord svg').remove();
        $timeout( function () {
          $scope.noValues = true;
        });
        return;
      }
      $scope.noValues = false;
      $scope.addresses = chordData.getAddresses();

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
        .each(function(d) {
          if (popoverArc && popoverArc.index === d.index) {
            let title = arcTitle(d, matrix);
            $timeout(function () {
              $scope.popoverContent = title;
            });
          }
        });

      // update chords
      svg.select('.chords')
        .selectAll('path')
        .data(rechord.chords)
        .transition()
        .duration(transitionDuration)
        .attrTween('d', chordTween(last_chord))
        .each(function(d) {
          if (popoverChord && popoverChord.source.index === d.source.index && popoverChord.source.subindex === d.source.subindex) {
            let title = chordTitle(d, matrix);
            $timeout(function () {
              $scope.popoverContent = title;
            });
          }
        });

      // update ticks
      svg.selectAll('.ticks')
        .selectAll('.group')
        .data(consolidateLabels(rechord.groups, matrix))
        .selectAll('.routers')
        .data(groupTicks)
        .transition()
        .duration(transitionDuration)
        .attrTween('transform', tickTween(last_chord, matrix));

      svg.selectAll('.routers')
        .each( function () {
          d3.select(this).select('text')
            .attr('text-anchor', function(d) {
              return d.angle > Math.PI ? 'end' : null;
            })
            .attr('transform', function(d) {
              return d.angle > Math.PI ? 'rotate(180)translate(-16)' : null;
            });
        });

      last_chord = rechord;
      if(!$scope.$$phase) $scope.$apply();

    }

    // used to transition chords along a circular path instead of linear
    let chordReference = qdrRibbon().radius(innerRadius);
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
    function tickTween(chord, matrix) {
      return function(d) {
        let groups = consolidateLabels(chord.groups, matrix);
        let i = Math.min(groups().length - 1, d.index);
        let startAngle = (groups()[i].startAngle + groups()[i].endAngle) / 2;
        // d.angle is the ending angle
        let interpolate = d3.interpolateNumber(startAngle, d.angle);
        let same = startAngle === d.angle;
        return function(t) {
          let rot = same ? startAngle : interpolate(t);
          return 'rotate(' + (rot * 180 / Math.PI - 90) + ')'
               + 'translate(' + textRadius + ',0)';
        };
      };
    }

    function groupTicks(d) {
      return [{
        angle: (d.startAngle + d.endAngle) / 2,
        index: d.index,
        orgIndex: d.orgIndex
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
    chordData.getMatrix().then(render, function (e) {
      console.log('error while rendering ' + e);
    });
    // called periodically to refresh the data
    function doUpdate() {
      chordData.getMatrix().then(rerender, function (e) {
        console.log('error while rerendering ' + e);
      });
    }
    let interval = setInterval(doUpdate, transitionDuration);
  
  }]);
  return QDR;

} (QDR || {}));
