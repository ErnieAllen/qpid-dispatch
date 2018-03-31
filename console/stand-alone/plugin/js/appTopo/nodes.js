'use strict';
/* global angular MicroService */
var nodes = [], links = [];

MicroService.reset();
let node0 = new MicroService.init('Client');
node0.info = {name: 'QE', geo: {name: 'Brno'}};
node0.connections.push({source: 0, target: 1, si:0});
node0.connections.push({source: 0, target: 2, si:1});
nodes.push(node0);

let node1 = new MicroService.init();
node1.info = {name: 'Toronto', geo: {name: 'Toronto'}};
node1.connections.push({});
nodes.push(node1);

let node2 = new MicroService.init();
node2.info = {name: 'Tel Aviv', geo: {name: 'Tel Aviv-Yafo'}};
node2.connections.push({});
nodes.push(node2);
    
let node3 = new MicroService.init('Client');
node3.info = {name: 'Devel', geo: {name: 'Raleigh'}};
node3.connections.push({source: 3, target: 1, si:2});
node3.connections.push({source: 3, target: 4, si:0});
node3.connections.push({source: 3, target: 5, si:1});
nodes.push(node3);

let node4 = new MicroService.init();
node4.info = {name: 'Boston', geo: {name: 'Boston'}};
node4.connections.push({});
nodes.push(node4);
    
let node5 = new MicroService.init();
node5.info = {name: 'Beijing', geo: {name: 'Beijing'}};
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
