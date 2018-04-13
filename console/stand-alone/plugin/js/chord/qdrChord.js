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
    const CHORDFILTERKEY =  'chordFilter';
    const DOUGHNUT =        '#chord svg .empty';
    const ERROR_RENDERING = 'Error while rendering ';
    const ARCPADDING = .06;

    // flag to show/hide the router section of the legend
    $scope.noValues = true;
    // state of the option checkboxes
    $scope.legendOptions = angular.fromJson(localStorage[CHORDOPTIONSKEY]) || {isRate: false, byAddress: false};
    // remember which addresses were last selected and restore them when page loads
    let excludedAddresses = angular.fromJson(localStorage[CHORDFILTERKEY]) || [];
    // colors for the legend and the diagram
    $scope.chordColors = {};
    $scope.arcColors = {};

    // get notified when the byAddress checkbox is toggled
    let switchedByAddress = false;
    $scope.$watch('legendOptions.byAddress', function (newValue, oldValue) {
      if (newValue !== oldValue) {
        d3.select('#legend')
          .classed('byAddress', newValue);
        chordData.setConverter($scope.legendOptions.byAddress ? separateAddresses: aggregateAddresses);
        switchedByAddress = true;
        updateNow();
        localStorage[CHORDOPTIONSKEY] = JSON.stringify($scope.legendOptions);
      }
    });
    // get notified when the 'by rate' checkbox is toggled
    $scope.$watch('legendOptions.isRate', function (n, o) {
      if (n !== o) {
        chordData.setRate($scope.legendOptions.isRate);

        let doughnut = d3.select(DOUGHNUT);
        if (!doughnut.empty()) {
          fadeDoughnut();
        }
        updateNow();

        localStorage[CHORDOPTIONSKEY] = JSON.stringify($scope.legendOptions);
      }
    });

    // fade out the empty circle that is shown when there is no traffic
    let fadeDoughnut = function () {
      d3.select(DOUGHNUT)
        .transition()
        .duration(200)
        .attr('opacity', 0)
        .remove();
    };

    // event notification that an address checkbox has changed
    $scope.addressFilterChanged = function () {
      fadeDoughnut();

      excludedAddresses = [];
      for (let address in $scope.addresses) {
        if (!$scope.addresses[address])
          excludedAddresses.push(address);
      }
      localStorage[CHORDFILTERKEY] = JSON.stringify(excludedAddresses);
      if (chordData) 
        chordData.setFilter(excludedAddresses);
      updateNow();
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
      d3.selectAll('path.chord').classed('fade', function(p) {
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
      d3.selectAll('path.chord').classed('fade', function(p) {
        return indexes.indexOf(p.source.index) < 0 && indexes.indexOf(p.target.index) < 0;
      });
    };
    $scope.leaveLegend = function () {
      showAllChords();
    };
    // clicked on the address name. toggle the address checkbox
    $scope.addressClick = function (address) {
      $scope.addresses[address] = !$scope.addresses[address];
      $scope.addressFilterChanged();
    };

    // create an object that will be used to fetch the data
    let chordData = new ChordData(QDRService, 
      $scope.legendOptions.isRate, 
      $scope.legendOptions.byAddress ? separateAddresses: aggregateAddresses);
    chordData.setFilter(excludedAddresses);

    // get the data now in response to a user event (as opposed to periodically)
    let updateNow = function () {
      clearInterval(interval);
      chordData.getMatrix().then(render, function (e) { console.log(ERROR_RENDERING + e);});
      interval = setInterval(doUpdate, transitionDuration);
    };

    // size the diagram based on the browser window size
    let getRadius = function () {
      let w = window,
        d = document,
        e = d.documentElement,
        b = d.getElementsByTagName('body')[0],
        x = w.innerWidth || e.clientWidth || b.clientWidth,
        y = w.innerHeight|| e.clientHeight|| b.clientHeight;
      return Math.max(Math.floor((Math.min(x, y) * 0.9) / 2), 300);
    };

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

    // keep track of previous chords so we can animate to the new values
    let last_chord, last_labels;

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

      svg = svg.append('g')
        .attr('class', 'chart-container');
    };
    initSvg();

    let emptyCircle = function () {
      $scope.noValues = false;
      d3.select(DOUGHNUT).remove();

      let arc = d3.svg.arc()
        .innerRadius(innerRadius)
        .outerRadius(textRadius)
        .startAngle(0)
        .endAngle(Math.PI * 2);

      d3.select('#circle').append('path')
        .attr('class', 'empty')
        .attr('d', arc);
    };

    let genArcColors = function () {
      //$scope.arcColors = {};
      let routers = chordData.getRouters();
      routers.forEach( function (router) {
        getArcColor(router);
      });
    };
    let genChordColors = function () {
      $scope.chordColors = {};
      if ($scope.legendOptions.byAddress) {
        Object.keys($scope.addresses).forEach( function (address) {
          getChordColor(address);
        });
      }
    };
    let chordKey = function (d, matrix) {
      // sort so that if the soure and target are flipped, the chord doesn't
      // get destroyed and recreated
      return getRouterNames(d, matrix).sort().join('-');
    };
    let popoverChord = null;
    let popoverArc = null;

    let getRouterNames = function (d, matrix) {
      let egress, ingress, address;
      // for arcs d will have an index, for chords d will have a source.index and target.index
      let eindex = angular.isDefined(d.index) ? d.index : d.source.index;
      let iindex = angular.isDefined(d.index) ? d.index : d.target.index;
      if (matrix.aggregate) {
        egress = matrix.rows[eindex].chordName;
        ingress = matrix.rows[iindex].chordName;
        address = '';
      } else {
        egress = matrix.rows[eindex].egress;
        ingress = matrix.rows[eindex].ingress;
        address = matrix.rows[eindex].address;
      }
      return [ingress, egress, address];
    };
    // popup title when mouse is over a chord
    // shows the address, from and to routers, and the values
    let chordTitle = function (d, matrix) {
      let rinfo = getRouterNames(d, matrix);
      let from = rinfo[0], to = rinfo[1], address = rinfo[2];
      if (!matrix.aggregate) {
        address += '<br/>';
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

    let getChordData = function (rechord, matrix) {
      let data = rechord.chords();
      data.forEach( function (d) {
        d.key = chordKey(d, matrix, false);
        d.color = fillChord(matrix, d);
      });
      return data;
    };

    let consolidateArcs = function (fn, matrix) {
      let fixedGroups = fn();
      if (!matrix.aggregate) {
        let consolidatedGroups = [];
        for (let r=0, len=fixedGroups.length, laste=''; r<len; r++) {
          let fg = fixedGroups[r];
          let e = matrix.rows[r].egress;
          let key = matrix.chordName(fg.index, false);
          if (e !== laste) {
            consolidatedGroups.push({
              startAngle: fg.startAngle, 
              endAngle: fg.endAngle, 
              angle: (fg.endAngle + fg.startAngle)/2, 
              index: consolidatedGroups.length, 
              orgIndex: fg.index,
              key: key,
              components: [fg.index]
            });
          } else {
            let g = consolidatedGroups[consolidatedGroups.length-1];
            g.endAngle = fg.endAngle;
            g.angle = (fg.startAngle + fg.endAngle)/2;
            g.key = key;
            g.components.push(fg.index);
          }
          laste = e;
        }
        fixedGroups = consolidatedGroups;
      } else {
        fixedGroups.forEach( function (fg) {
          fg.orgIndex = fg.index;
          fg.angle = (fg.endAngle + fg.startAngle)/2;
          fg.key = matrix.chordName(fg.index, false);
          fg.components = [fg.index];
        });
      }
      return fixedGroups;
    };

    let theyveBeenWarned = false;
    // create and/or update the chord diagram
    function render(matrix) {
      $scope.addresses = chordData.getAddresses();
      // populate the arcColors object with a color for each router
      genArcColors();
      genChordColors();

      // if all the addresses are excluded, update the message
      let addressLen = Object.keys($scope.addresses).length;
      $scope.allAddressesFiltered = false;
      if (addressLen > 0 && excludedAddresses.length === addressLen) {
        $scope.allAddressesFiltered = true;
      }

      $scope.noValues = false;
      let matrixMessages, duration = switchedByAddress ? 0 : transitionDuration;
      switchedByAddress = false;

      // if there is no data, show an empty circle and a message
      if (!matrix.hasValues()) {
        $timeout( function () {
          $scope.noValues = $scope.arcColors.length === 0;
          if (!theyveBeenWarned) {
            theyveBeenWarned = true;
            let msg = 'There is no message traffic';
            if (addressLen !== 0)
              msg += ' for the selected addresses';
            $.notify($('#noTraffic'), msg, {clickToHide: false, autoHide: false, arrowShow: false, className: 'Warning'});
          }
        });
        emptyCircle();
        matrixMessages = [];
      } else {
        matrixMessages = matrix.matrixMessages();
        $('.notifyjs-wrapper').hide();
        theyveBeenWarned = false;
        fadeDoughnut();
      }

      // create a new chord layout so we can animate between the last one and this one
      let rechord = d3.layout.chord()
        .padding(ARCPADDING)
        .matrix(matrixMessages);

      // The chord layout has a function named .groups() that returns the
      // data for the arcs. We decorate this data with a unique key.
      rechord.arcData = consolidateArcs(rechord.groups, matrix);

      // join the decorated data with a d3 selection
      let arcsGroup = svg.selectAll('g.arc')
        .data(rechord.arcData, function (d) {return d.key;});

      // get a d3 selection of all the new arcs that have been added
      let newArcs = arcsGroup.enter().append('svg:g')
        .attr('class', 'arc');

      // each new arc is an svg:path that has a fixed color
      newArcs.append('svg:path')
        .style('fill', function(d) { 
          return fillArc(matrix, d.orgIndex);
        })
        .style('stroke', function(d) { return fillArc(matrix, d.orgIndex); });

      // attach event listeners to all arcs (new or old)
      arcsGroup
        .on('mouseover', mouseoverArc)
        .on('mousemove', function (d) {
          popoverArc = d;
          $timeout(function () {
            $scope.trustedpopoverContent = $sce.trustAsHtml(arcTitle(d, matrix));
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

      // animate the arcs path to it's new location
      arcsGroup.select('path')
        .transition()
        .duration(duration)
        //.ease('linear')
        .attrTween('d', arcTween(last_chord))
      
      // check if the mouse is hovering over an arc. if so, update the tooltip
      arcsGroup
        .each(function(d) {
          if (popoverArc && popoverArc.index === d.index) {
            $timeout(function () {
              $scope.trustedpopoverContent = $sce.trustAsHtml(arcTitle(d, matrix));
            });
          }
        });

      // animate the removal of any arcs that went away
      arcsGroup.exit()
        .transition()
        .duration(duration/2)
        .attrTween('d', arcTweenExit)
        .remove(); //remove after transitions are complete

      // put a label on each group
      let tickGroup = svg.selectAll('g.tick')
        .data(rechord.arcData, function (d) {
          return d.key;
        });

      // new arcs get a group containing a tick
      let enteringTicks = tickGroup.enter().append('svg:g')
        .attr('class', 'tick');

      enteringTicks.append('svg:line')
        .attr('opacity', 0)
        .attr('x1', 1)
        .attr('y1', 0)
        .attr('x2', 5)
        .attr('y2', 0)
        .attr('stroke', '#000');

      // give the new ticks names
      enteringTicks.append('text')
        .attr('class', 'tick-text')
        .attr('x', 8)
        .attr('dy', '.35em')
        .attr('opacity', 0)
        .text(function(d) {
          return matrix.chordName(d.orgIndex, false);
        });

      // fade in
      enteringTicks.select('text')
        .transition()
        .duration(duration)
        .attr('opacity', 1);

      enteringTicks.select('line')
        .transition()
        .duration(duration)
        .attr('opacity', 1);

      tickGroup
        .on('mouseover', mouseoverArc);

      // orient the text every update
      tickGroup.select('text.tick-text')
        .attr('text-anchor', function(d) {
          return d.angle > Math.PI ? 'end' : null;
        })
        .attr('transform', function(d) {
          return d.angle > Math.PI ? 'rotate(180) translate(-16)' : null;
        });

      // move the group to new location around the circle
      tickGroup
        .transition()
        .duration(duration)
        //.ease('linear')
        .attrTween('transform', tickTween(last_labels));

      // selection of lables to be removed
      let exitingTicks = tickGroup.exit();

      // fade them out and then remove them
      exitingTicks.select('text')
        .attr('class', 'fading-tick')
        .transition()
        .duration(duration/2)
        .attr('opacity', 0)
        .each('end', function () {
          exitingTicks.remove();
        });

      // decorate the chord layout's .chord() data with key, color, and orgIndex
      rechord.chordData = getChordData(rechord, matrix);
      let chordPaths = svg.selectAll('path.chord')
        .data(rechord.chordData, function (d) { return d.key;});

      // new chords are paths
      chordPaths.enter().append('path')
        .attr('class', 'chord')
        .attr('opacity', 1);

      // do multiple concurrent tweens on the chords
      chordPaths
        .call(tweenChordEnds, duration, last_chord)
        .call(tweenChordColor, duration, last_chord, 'stroke')
        .call(tweenChordColor, duration, last_chord, 'fill');

      // if the mouse is hovering over a chord, update it's tooltip
      chordPaths
        .each(function(d) {
          if (popoverChord && popoverChord.source.index === d.source.index && popoverChord.source.subindex === d.source.subindex) {
            $timeout(function () {
              $scope.trustedpopoverContent = $sce.trustAsHtml(chordTitle(d, matrix));
            });
          }
        });

      // attach mouse event handlers to the chords
      chordPaths
        .on('mouseover', mouseoverChord)
        .on('mousemove', function (d) {
          popoverChord = d;
          $timeout(function () {
            $scope.trustedpopoverContent = $sce.trustAsHtml(chordTitle(d, matrix));
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

      // animate the removal of chords
      chordPaths.exit()
        .attr('class', 'exiting-chord')
        .transition()
        .duration(duration/2)
        .attrTween('d', chordTweenExit)
        .remove(); //remove after transitions are complete

      // keep track of this layout so we can animate from this layout to the next layout
      last_chord = rechord;
      last_labels = last_chord.arcData;
      if(!$scope.$$phase) $scope.$apply();
    }

    // used to transition chords along a circular path instead of linear.
    // qdrRibbon is a replacement for d3.svg.chord() that avoids the twists
    let chordReference = qdrRibbon().radius(innerRadius);

    // used to transition arcs along a curcular path instead of linear
    let arcReference = d3.svg.arc()
      .startAngle(function(d) { return d.startAngle; })
      .endAngle(function(d) { return d.endAngle; })
      .innerRadius(innerRadius)
      .outerRadius(textRadius);

    // animate the disappearance of an arc by shrinking it to its center point
    function arcTweenExit(d) {
      let angle = (d.startAngle+d.endAngle)/2;
      let to = {startAngle: angle, endAngle: angle};
      let tween = d3.interpolate(d, to);
      return function (t) {
        return arcReference( tween(t) );
      };
    }
    // animate the exit of a chord by shrinking it to the center points of its arcs
    function chordTweenExit(d) {
      let angle = function (d) {
        return (d.startAngle + d.endAngle) / 2;
      };
      let from = {source: {startAngle: d.source.startAngle, endAngle: d.source.endAngle}, 
        target: {startAngle: d.target.startAngle, endAngle: d.target.endAngle}};
      let to = {source: {startAngle: angle(d.source), endAngle: angle(d.source)},
        target: {startAngle: angle(d.target), endAngle: angle(d.target)}};
      let tween = d3.interpolate(from, to);

      return function (t) {
        return chordReference( tween(t) );
      };
    }

    // Animate an arc from its old location to its new.
    // If the arc is new, grow the arc from its startAngle to its full size
    function arcTween(oldLayout) {
      var oldGroups = {};
      if (oldLayout) {
        oldLayout.arcData.forEach( function(groupData) {
          oldGroups[ groupData.index ] = groupData;
        });
      }
      return function (d) {
        var tween;
        var old = oldGroups[d.index];
        if (old) { //there's a matching old group
          tween = d3.interpolate(old, d);
        }
        else {
          //create a zero-width arc object
          var emptyArc = {startAngle:d.startAngle,
            endAngle:d.startAngle};
          tween = d3.interpolate(emptyArc, d);
        }
            
        return function (t) {
          return arcReference( tween(t) );
        };
      };
    }

    // animate all the chords to their new positions
    function tweenChordEnds(chords, duration, last_layout) {
      let oldChords = {};
      if (last_layout) {
        last_layout.chordData.forEach( function(d) {
          oldChords[ d.key ] = d;
        });
      }
      chords.each(function (d) {
        let chord = d3.select(this);
        // This version of d3 doesn't support multiple concurrent transitions on the same selection.
        // Since we want to animate the chord's path as well as its color, we create a dummy selection
        // and use that to directly transition each chord
        d3.select({})
          .transition()
          .duration(duration)
          .tween('attr:d', function () {
            let old = oldChords[ d.key ], interpolate;
            if (old) {
              // avoid swapping the end of cords where the source/target have been flipped
              // Note: the chord's colors will be swapped in a different tween
              if (old.source.index === d.target.index &&
                  old.source.subindex === d.target.subindex) {
                let s = old.source;
                old.source = old.target;
                old.target = s;
              }
            } else {
              // there was no old chord so make a fake one
              old = {
                source: { startAngle: d.source.startAngle,
                  endAngle: d.source.startAngle},
                target: { startAngle: d.target.startAngle,
                  endAngle: d.target.startAngle}
              };
            }
            interpolate = d3.interpolate(old, d);
            return function(t) {
              chord.attr('d', chordReference(interpolate(t)));
            };
          });
      });
    }

    // animate a chord to its new color
    function tweenChordColor(chords, duration, last_layout, style) {
      let oldChords = {};
      if (last_layout) {
        last_layout.chordData.forEach( function(d) {
          oldChords[ d.key ] = d;
        });
      }
      chords.each(function (d) {
        let chord = d3.select(this);
        d3.select({})
          .transition()
          .duration(duration)
          .tween('style:'+style, function () {
            let old = oldChords[ d.key ], interpolate;
            let oldColor = '#CCCCCC', newColor = d.color;
            if (old) {
              oldColor = old.color;
            }
            if (style === 'stroke') {
              oldColor = d3.rgb(oldColor).darker(3);
              newColor = d3.rgb(newColor).darker(3);
            }
            interpolate = d3.interpolate(oldColor, newColor);
            return function(t) {
              chord.style(style, interpolate(t));
            };
          });
      });
    }

    // animate the arc labels to their new locations
    function tickTween(oldArcs) {
      var oldTicks = {};
      if (oldArcs) {
        oldArcs.forEach( function(d) {
          oldTicks[ d.orgIndex ] = d;
        });
      }
      let angle = function (d) {
        return (d.startAngle + d.endAngle) / 2;
      };
      return function (d) {
        var tween;
        var old = oldTicks[d.orgIndex];
        let start = angle(d);
        let startTranslate = textRadius - 40;
        if (old) { //there's a matching old group
          start = angle(old);
          startTranslate = textRadius;
        }
        tween = d3.interpolateNumber(start, angle(d));
        let same = start === angle(d);
        let tsame = startTranslate === textRadius;
        // disable the translate for now
        tsame = true;

        let transTween = d3.interpolateNumber(startTranslate, textRadius);

        return function (t) {
          let rot = same ? start : tween(t);
          if (isNaN(rot))
            rot = 0;
          let tra = tsame ? textRadius : transTween(t);
          return 'rotate(' + (rot * 180 / Math.PI - 90) + ') '
          + 'translate(' + tra + ',0)';
        };
      };
    }

    // fade all chords that don't belong to the given arc index
    function mouseoverArc(d) {
      let components = d.components;
      d3.selectAll('path.chord').classed('fade', function(p) {
        return components.indexOf(p.source.index) < 0 && components.indexOf(p.target.index) < 0;
      });
    }

    // fade all chords except the given one
    function mouseoverChord(d) {
      svg.selectAll('path.chord').classed('fade', function(p) {
        return !(p.source.index === d.source.index && p.target.index === d.target.index);
      });
    }

    function showAllChords() {
      svg.selectAll('path.chord').classed('fade', false);
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
      console.log(ERROR_RENDERING + e);
    });
    // called periodically to refresh the data
    function doUpdate() {
      chordData.getMatrix().then(render, function (e) {
        console.log(ERROR_RENDERING + e);
      });
    }
    let interval = setInterval(doUpdate, transitionDuration);
  
  }]);
  return QDR;

} (QDR || {}));
