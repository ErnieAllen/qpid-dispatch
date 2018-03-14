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
/* global angular Promise */

function ChordData (QDRService, isRate, converter) {
  this.QDRService = QDRService;
  this.last_matrix = undefined;
  this.last_values = {values: undefined, timestamp: undefined};
  this.isRate = isRate;
  // fn to convert raw data to matrix
  this.converter = converter;
  // object that determines which addresses are excluded
  this.filter = [];
}
ChordData.prototype.setRate = function (isRate) {
  this.isRate = isRate;
};
ChordData.prototype.setConverter = function (converter) {
  this.converter = converter;
};
ChordData.prototype.setFilter = function (filter) {
  this.filter = filter;
};
ChordData.prototype.getAddresses = function () {
  let addresses = {};
  this.last_values.values.forEach( function (lv) {
    if (!(lv.address in addresses)) {
      addresses[lv.address] = this.filter.indexOf(lv.address) < 0;
    }
  }.bind(this));
  return addresses;
};
ChordData.prototype.getRouters = function () {
  let routers = {};
  this.last_values.values.forEach( function (lv) {
    if (!(lv.egress in routers)) {
      routers[lv.egress] = true;
    }
    if (!(lv.ingress in routers)) {
      routers[lv.ingress] = true;
    }
  });
  return Object.keys(routers).sort();
};

ChordData.prototype.applyFilter = function (filter) {
  if (filter)
    this.setFilter(filter);

  return new Promise( (function (resolve) {
    resolve(convert(this, this.last_values));
  }));
};

// construct a square matrix of the number of messages each router has egressed from each router
ChordData.prototype.getMatrix = function () {
  let self = this;
  return new Promise( (function (resolve, reject) {
    // get the router.node and router.link info
    self.QDRService.management.topology.fetchAllEntities([
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
        let egressRouter = self.QDRService.management.topology.nameFromId(nodeId);

        // loop through the router links for this router looking for out/endpoint/non-console links
        let routerLinks = results[nodeId]['router.link'];
        for (let i=0; i<routerLinks.results.length; i++) {
          let link = self.QDRService.utilities.flatten(routerLinks.attributeNames, routerLinks.results[i]);
          // if the link is an outbound/enpoint/non console
          if (link.linkType === 'endpoint' && link.linkDir === 'out' && !link.owningAddr.startsWith('Ltemp.')) {
            // keep track of the raw egress values as well as their ingress and egress routers and the address
            for (let j=0; j<ingressRouters.length; j++) {
              let messages = link.ingressHistogram[j];
              if (messages) {
                values.push({ingress: ingressRouters[j], 
                  egress:  egressRouter, 
                  address: self.QDRService.utilities.addr_text(link.owningAddr), 
                  messages: messages});
              }
            }
          }
        }
      }
      // values is an array of objects like [{ingress: 'xxx', egress: 'xxx', address: 'xxx', messages: ###}, ....]

      // convert the raw values array into a matrix object
      let matrix = convert(self, values);

      // resolve the promise
      resolve(matrix);
    });
  }));
};

// Private functions

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

let genKeys = function (values) {
  values.forEach( function (value) {
    value.key = value.egress + value.ingress + value.address;
  });
};
let sortByKeys = function (values) {
  return values.sort( function (a, b) {
    return a.key > b.key ? 1 : a.key < b.key ? -1 : 0;
  });
};
let convert = function (self, values) {
  // sort the raw data by egress router name
  genKeys(values);
  sortByKeys(values);

  if (self.isRate) {
    let rateValues = calcRate(values, self.last_values);
    self.last_values.values = angular.copy(values);
    self.last_values.timestamp = Date.now();
    values = rateValues;
  } else {
    self.last_values.values = angular.copy(values);
    self.last_values.timestamp = Date.now();
  }
  // convert the raw data to a matrix
  let matrix = self.converter(values, self.filter);
  self.last_matrix = matrix;

  return matrix;
};
