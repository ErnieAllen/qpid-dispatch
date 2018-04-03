'use strict';
/* global angular MicroService */
var nodes = [], links = [];

MicroService.reset();
let node0 = new MicroService.init('Client');
node0.info = {name: 'Brno', geo: {coordinates: [ 16.60998327501909, 49.200393492726221]}};
node0.connections.push({source: 0, target: 1, si:0});
node0.connections.push({source: 0, target: 2, si:1});
nodes.push(node0);

let node1 = new MicroService.init();
node1.info = {name: 'Toronto', geo: {coordinates: [-79.421966652988431, 43.701925736408441]}};
node1.connections.push({});
nodes.push(node1);

let node2 = new MicroService.init();
node2.info = {name: 'London', geo: {coordinates: [-0.118667702475932, 51.5019405883275]}};
node2.connections.push({});
nodes.push(node2);
    
let node3 = new MicroService.init('Client');
node3.info = {name: 'Raleigh', geo: {coordinates: [-78.644693442484481, 35.818781350745724]}};
node3.connections.push({source: 3, target: 1, si:2});
node3.connections.push({source: 3, target: 4, si:0});
node3.connections.push({source: 3, target: 5, si:1});
nodes.push(node3);

let node4 = new MicroService.init();
node4.info = {name: 'Westford', geo: {coordinates: [-71.4378, 42.5793]}};
node4.connections.push({});
nodes.push(node4);
    
let node5 = new MicroService.init();
node5.info = {name: 'Sudney', geo: {coordinates: [151.1832339501475, -33.91806510862875]}};
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
