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

var svgPopup = function (svg, ele, html) {

  let diamond = d3.select(ele).node();
  let bbox = diamond.getBoundingClientRect();

  d3.select('#bubble').remove();
  let divID = 'popupDiv';
  let div = document.getElementById(divID);
  if (div)
    div.parentNode.removeChild(div);

  /*  
let c = svg.append('svg:g')
  .attr('id', 'bubble')
  .attr('transform', 'translate('+(bbox.x)+','+bbox.y+')');
let pop = c.append('svg:g')
  .attr('transform', 'scale(1e-6)');
pop.append('svg:rect')
  .attr('rx', 6)
  .attr('ry', 6)
  .attr('x', -12.5)
  .attr('y', -12.5)
  .attr('width', 250)
  .attr('height', 250)
  .style('fill', '#FAFAFA')
  .style('stroke', 'black')
  .style('stroke-width', '0.5px');
pop.transition().duration(250).attr('transform', 'scale(1)')
*/
  div = document.createElement('div');
  div.setAttribute('id', divID);
  div.style.left = (bbox.x + 20) + 'px';
  div.style.top =  (bbox.y + 30) + 'px';
  div.innerHTML = html();
  document.body.appendChild(div);
  d3.select('#'+divID).transition().duration(250)
    .style('opacity', '1')
    .style('width', '220px')
    .style('height', '280px')
    .each('end', function () {
    //d3.select(this).style('overflow-y', 'auto');
    });
};