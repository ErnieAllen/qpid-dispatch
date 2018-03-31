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

/* global angular d3 topojson nodes links */
/**
 * @module QDR
 */
var QDR = (function(QDR) {
  QDR.module.controller('QDR.GeoController', [function() {

    // possibleCities = ['Boston','Tel Aviv-Yafo', 'Brno', 'Toronto', 'Beijing', 'Ashburn', 'Raleigh'];
    // modified from http://bl.ocks.org/dwtkns/4973620
    var initGlobe = function () {
      d3.select(window)
        .on('mousemove', mousemove)
        .on('mouseup', mouseup);

      var wwidth = 960,
        wheight = 700;
      var serviceRadius = 0.75;
      var lastScale = angular.fromJson(localStorage['QDR.scale']) || 1.5;

      var gcontainer = $('.geology_container');
      var fcontainer = $('.container-fluid');

      var windowHeight = $(window).height();
      var fposition = fcontainer.position();
      gcontainer.height(windowHeight - fposition.top);
      //var sizes = getSizes('geology')
      wwidth = gcontainer.width();
      wheight = gcontainer.height();
      console.log('geo width ' + wwidth + ' height ' + wheight);
      var ypos = fposition.top + (wheight * 0.4);
      var proj = d3.geo.orthographic()
        .translate([wwidth / 2, ypos])
        .clipAngle(90)
        .scale(220);

      var sky = d3.geo.orthographic()
        .translate([wwidth / 2, ypos])
        .clipAngle(90)
        .scale(230);

      var wpath = d3.geo.path().projection(proj).pointRadius(6);
      var wlinks = [],
        arcLines = [];

      var swoosh = d3.svg.line()
        .x(function(d) { return d[0]; })
        .y(function(d) { return d[1]; })
        .interpolate('cardinal')
        .tension(0);

      var graticule = d3.geo.graticule();

      const zoom = d3.behavior.zoom()
        .scaleExtent([1, 18])
        .scale(lastScale)
        .on('zoom', function () {
          let e = d3.event;
          let tx = wwidth/2 * (1 - e.scale);
          let ty = wheight/2 * (1 - e.scale);

          wsvg.attr('transform', 'translate(' + [tx,ty] + ') scale(' + e.scale + ')');
          position_labels();
          localStorage['QDR.scale'] = angular.toJson(d3.event.scale);
        });

      d3.select('#geology svg').remove();
      var wsvg = d3.select('#geology').append('svg')
        .attr('width', wwidth)
        .attr('height', wheight)
        .call(zoom)
        .on('mousedown', mousedown)
        .append('svg:g')
        .attr('transform', 'translate(' + [wwidth/2*(1-lastScale),wheight/2*(1-lastScale)] + ') scale(' + lastScale + ')');

      d3.queue()
        .defer(d3.json, 'plugin/data/world-110m.json')
        .defer(d3.json, 'plugin/data/places1.json')
        .await(ready);

      function ready(error, world, places) {
        var ocean_fill = wsvg.append('defs').append('radialGradient')
          .attr('id', 'ocean_fill')
          .attr('cx', '75%')
          .attr('cy', '25%');
        ocean_fill.append('stop').attr('offset', '5%').attr('stop-color', '#fff');
        ocean_fill.append('stop').attr('offset', '100%').attr('stop-color', '#eef');

        var globe_highlight = wsvg.append('defs').append('radialGradient')
          .attr('id', 'globe_highlight')
          .attr('cx', '75%')
          .attr('cy', '25%');
        globe_highlight.append('stop')
          .attr('offset', '5%').attr('stop-color', '#ffd')
          .attr('stop-opacity','0.6');
        globe_highlight.append('stop')
          .attr('offset', '100%').attr('stop-color', '#ba9')
          .attr('stop-opacity','0.1');

        var globe_shading = wsvg.append('defs').append('radialGradient')
          .attr('id', 'globe_shading')
          .attr('cx', '55%')
          .attr('cy', '45%');
        globe_shading.append('stop')
          .attr('offset','30%').attr('stop-color', '#fff')
          .attr('stop-opacity','0');
        globe_shading.append('stop')
          .attr('offset','100%').attr('stop-color', '#505962')
          .attr('stop-opacity','0.2');

        var drop_shadow = wsvg.append('defs').append('radialGradient')
          .attr('id', 'drop_shadow')
          .attr('cx', '50%')
          .attr('cy', '50%');
        drop_shadow.append('stop')
          .attr('offset','20%')
          .attr('stop-color', '#000')
          .attr('stop-opacity','.5');
        drop_shadow.append('stop')
          .attr('offset','100%').attr('stop-color', '#000')
          .attr('stop-opacity','0');

        wsvg.append('ellipse')
          .attr('cx', wwidth/2)
          .attr('cy', ypos+proj.scale())
          .attr('rx', proj.scale()*.9)
          .attr('ry', proj.scale()*.25)
          .attr('class', 'noclicks')
          .style('fill', 'url(#drop_shadow)');

        wsvg.append('circle')
          .attr('cx', wwidth / 2).attr('cy', ypos)
          .attr('r', proj.scale())
          .attr('class', 'noclicks')
          .style('fill', 'url(#ocean_fill)');

        // for info on how to use d3.geo.path see https://github.com/d3/d3-geo#paths
        wsvg.append('path')
          .datum(topojson.feature(world, world.objects.land))
          .attr('class', 'land noclicks')
          .attr('d', wpath);

        wsvg.append('path')
          .datum(graticule)
          .attr('class', 'graticule noclicks')
          .attr('d', wpath);

        wsvg.append('circle')
          .attr('cx', wwidth / 2).attr('cy', ypos)
          .attr('r', proj.scale())
          .attr('class','noclicks')
          .style('fill', 'url(#globe_highlight)');

        wsvg.append('circle')
          .attr('cx', wwidth / 2).attr('cy', ypos)
          .attr('r', proj.scale())
          .attr('class','noclicks')
          .style('fill', 'url(#globe_shading)');

        nodes.forEach( function (node) {
          if (node.info.geo) {
            places.features.forEach( function (f) {
              if (node.info.geo.name === f.properties.NAME) {
                node.geometry = f.geometry;
              }
            });
          }
        });

        /*
          wsvg.append('g').attr('class','points')
            .selectAll('text').data(filtered)
            .enter().append('path')
            .attr('class', 'point')
            .attr('d', wpath);
          */


        // spawn links between clients and services

        let get_coordinates = function (name) {
          let coordinates;
          let ci = places.features.findIndex(function(a) {
            return a.properties.NAME === name;
          });
          if (ci > -1)
            coordinates = places.features[ci].geometry.coordinates;
          return coordinates;
        };
        // spawn links between cities as source/target coord pairs
        places.features.forEach(function(a, i) {
          if (nodes.findIndex( function (client) { return client.info.geo ? client.info.geo.name === a.properties.NAME : false;}) > -1) {
            places.features.forEach(function(b, j) {
              if (nodes.findIndex( function (client) { return client.info.geo ? client.info.geo.name === b.properties.NAME : false;}) > -1) {
                if (j > i) {  // avoid duplicates
                  wlinks.push({
                    source: a.geometry.coordinates,
                    target: b.geometry.coordinates
                  });
                }
              }
            });
          }
        });
        wlinks = [];
        nodes.forEach ( function (node) {
          if (node.type === 'Client') {
            node.connections.forEach( function (connection) {
              if (angular.isDefined(connection.source) && angular.isDefined(connection.target)) {
                let scoord = get_coordinates(nodes[connection.source].info.geo.name);
                let tcoord = get_coordinates(nodes[connection.target].info.geo.name);
                wlinks.push({
                  source: scoord,
                  target: tcoord
                });
              }
            });
          }
        });
        // build geoJSON features from links array
        wlinks.forEach(function(e) {
          var feature =   { 'type': 'Feature', 'geometry': { 'type': 'LineString', 'coordinates': [e.source,e.target] }};
          arcLines.push(feature);
        });

        wsvg.append('g').attr('class','arcs')
          .selectAll('path').data(arcLines)
          .enter().append('path')
          .attr('class','arc')
          .attr('d',wpath);

        wsvg.append('g').attr('class','flyers')
          .selectAll('path').data(wlinks)
          .enter().append('path')
          .attr('class','flyer')
          .attr('d', function(d) { return swoosh(flying_arc(d)); });

        let adjust_longitude = function (lat, deg) {
          let dist = d3.scale.linear()
            .domain([90, 0])
            .range([0, Math.PI/2]);
          let x = Math.max(Math.sin(dist(lat)), 0.1);
          return deg/x;
        };

        let diamonds = [];
        wlinks.forEach( function (link) {
          var mid = location_along_arc(link.source, link.target, .5);
          let x = mid[0], y = mid[1];
          let coordinates = [];
          const yoff = 1;
          const xoff = adjust_longitude(y, 0.7);
          coordinates[0] = [x-xoff, y];
          coordinates[1] = [x, y-yoff];
          coordinates[2] = [x+xoff, y];
          coordinates[3] = [x, y+yoff];
          coordinates[4] = coordinates[0];

          let feature = {type: 'Feature', geometry: {type: 'LineString', coordinates: coordinates}};
          diamonds.push(feature);
        });
        wsvg.append('g').attr('class', 'diamondShadow')
          .selectAll('path').data(diamonds)
          .enter().append('path')
          .attr('class', 'diamond-shadow')
          .attr('d', wpath);

        let clients = nodes.filter( function (n) { return n.geometry ? n.type === 'Client' : false; });
        let services = nodes.filter( function (n) { return n.geometry ? n.type !== 'Client' : false; });

        clients = [];
        nodes.forEach ( function (n) {
          if (n.geometry && n.type === 'Client') {
            let coordinates = [];
            let x = n.geometry.coordinates[0];
            let y = n.geometry.coordinates[1];
            const xoff = adjust_longitude(y, 1);
            const yoff = 1.5;
            coordinates[0] = [x - xoff, y - yoff];
            coordinates[1] = [x + xoff, y - yoff];
            coordinates[2] = [x + xoff, y + yoff];
            coordinates[3] = [x - xoff, y + yoff];
            coordinates[4] = coordinates[0];
            let feature = {type: 'Feature', geometry: {type: 'LineString', coordinates: coordinates}};
            clients.push(feature);
          }
        });

        wsvg.append('g').attr('class', 'clients')
          .selectAll('path').data(clients)
          .enter().append('path')
          .attr('class', 'sclient')
          .attr('d', wpath);
        /*
        wsvg.append('g').attr('class', 'clients')
          .selectAll('rect').data(clients)
          .enter().append('rect')
          .attr('class', 'client')
          .attr('x', 0)
          .attr('y', 0)
          .attr('rx', 4)
          .attr('ry', 4)
          .attr('width', 50)
          .attr('height', 100);
*/

        services = [];
        nodes.forEach ( function (n) {
          if (n.geometry && n.type !== 'Client') {
            services.push(n.geometry);
          }
        });
        wsvg.append('g').attr('class', 'services')
          .selectAll('path').data(services)
          .enter().append('path')
          .attr('class', 'sservice')
          .attr('d', function(d) { 
            return wpath(d3.geo.circle().origin(d.coordinates).angle(serviceRadius)()); 
          });
        /*
        wsvg.append('g').attr('class','points')
          .selectAll('path').data(services)
          .enter().append('path')
          .attr('class', 'point')
          .attr('d', wpath);
          */
        /*
        wsvg.append('g').attr('class', 'services')
          .selectAll('circle').data(services)
          .enter().append('circle')
          .attr('class', 'service')
          .attr('cx', 0)
          .attr('cy', 0)
          .attr('r', 20);
*/
        wsvg.append('g').attr('class', 'diamonds')
          .selectAll('path').data(diamonds)
          .enter().append('path')
          .attr('class', 'diamond')
          .attr('d', d3.geo.path().projection(sky));

        let labelNodes = nodes.filter( function ( node ) {
          return (node.geometry);
        });
        wsvg.append('g').attr('class','labels')
          .selectAll('text').data(labelNodes)
          .enter().append('text')
          .attr('class', 'label')
          .text(function(d) { 
            return d.info.name; 
          });
        position_labels();
        refresh();
      }

      function flying_arc(pts) {
        var source = pts.source,
          target = pts.target;

        var mid = location_along_arc(source, target, .5);
        var result = [ proj(source),
          sky(mid),
          proj(target) ];
        return result;
      }

      function position_labels() {
        var centerPos = proj.invert([wwidth/2,wheight/2]);
        var arc = d3.geo.greatArc();

        wsvg.selectAll('.label')
          .attr('transform', function(d) {
            var loc = proj(d.geometry.coordinates);
            loc[0] -= 3;
            loc[1] -= 7;
            return 'translate(' + loc + ') scale(' + (1/zoom.scale()) + ')';
          })
          .style('display',function(d) {
            var z = arc.distance({source: d.geometry.coordinates, target: centerPos});
            return (z > 1.57) ? 'none' : 'inline';
          });
        /*
        wsvg.selectAll('.client')
          .attr('transform', function (d) {
            var loc = proj(d.geometry.coordinates);
            loc[0] -= 1.5;
            loc[1] -= 2.5;
            return 'translate(' + loc + ') scale(' + (1/zoom.scale()) + ')';
          })
          .style('display',function(d) {
            var z = arc.distance({source: d.geometry.coordinates, target: centerPos});
            return (z > 1.57) ? 'none' : 'inline';
          });
          */
        /*
        wsvg.selectAll('.service')
          .attr('transform', function (d) {
            var loc = proj(d.geometry.coordinates);
            return 'translate(' + loc + ') scale(' + (1/zoom.scale()) + ')';
          })
          .style('display',function(d) {
            var z = arc.distance({source: d.geometry.coordinates, target: centerPos});
            return (z > 1.57) ? 'none' : 'inline';
          });
          */
      }

      function refresh() {
        wsvg.selectAll('.land').attr('d', wpath);
        wsvg.selectAll('.point').attr('d', wpath);
        wsvg.selectAll('.graticule').attr('d', wpath);
        wsvg.selectAll('.arc').attr('d', wpath);
        wsvg.selectAll('.sclient').attr('d', wpath);
        wsvg.selectAll('.sservice')
          .attr('d', function(d) { 
            return wpath(d3.geo.circle().origin(d.coordinates).angle(serviceRadius)()); 
          });

        wsvg.selectAll('.diamond-shadow').attr('d', wpath);
        wsvg.selectAll('.flyer').attr('d', function(d) { return swoosh(flying_arc(d)); })
          .attr('opacity', function(d) {
            return fade_at_edge(d);
          });
        wsvg.selectAll('.diamond').attr('d', d3.geo.path().projection(sky) )
          .attr('opacity', function(d) {
            return fade_at_edge(d);
          });

        position_labels();
      }
      function fade_at_edge(d) {
        var centerPos = proj.invert([wwidth/2,wheight/2]),
          arc = d3.geo.greatArc(),
          start, end;
          // function is called on 2 different data structures..
        if (d.source) {
          start = d.source,
          end = d.target;
        }
        else {
          start = d.geometry.coordinates[0];
          end = d.geometry.coordinates[1];
        }

        var start_dist = 1.57 - arc.distance({source: start, target: centerPos}),
          end_dist = 1.57 - arc.distance({source: end, target: centerPos});

        var fade = d3.scale.linear().domain([-.1,0]).range([0,.1]);
        var dist = start_dist < end_dist ? start_dist : end_dist;
        return Math.min(fade(dist), 1);
      }

      function location_along_arc(start, end, loc) {
        var interpolator = d3.geo.interpolate(start,end);
        return interpolator(loc);
      }
      // modified from http://bl.ocks.org/1392560
      var m0, o0;
      o0 = angular.fromJson(localStorage['QDR.rotate']) || [0, -15];
      if (o0) {
        proj.rotate(o0);
        sky.rotate(o0);
      }

      function mousedown() {
        m0 = [d3.event.pageX, d3.event.pageY];
        o0 = proj.rotate();
        d3.event.preventDefault();
      }
      function mousemove() {
        if (m0) {
          var m1 = [d3.event.pageX, d3.event.pageY];
          var o1 = [o0[0] + (m1[0] - m0[0]) / 6, o0[1] + (m0[1] - m1[1]) / 6];
          o1[1] = Math.max(Math.min(o1[1], 90), -90);
          proj.rotate(o1);
          sky.rotate(o1);
          refresh();
        }
      }
      function mouseup() {
        if (m0) {
          mousemove();
          m0 = null;
          localStorage['QDR.rotate'] = angular.toJson(proj.rotate());
        }
      }
    };
    initGlobe();

  }]);
  return QDR;
}(QDR || {}));
