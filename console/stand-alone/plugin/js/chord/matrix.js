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
/* global */

const MIN_CHORD_THRESHOLD = 0.01;

// public Matrix object
function valuesMatrix(aggregate) {
  this.rows = [];
  this.aggregate = aggregate;
  this.test = false;
  //westford -> brno   2
  //canton -> westford 1
  // row receives column sends
  //            brno      canton   westford
  //this.mtest = [[0,0,2,0], [0,0,0,0], [0,1,0,0], [0,0,0,0]];
  this.mtest = [
    [
      0,
      0,
      424.7434435575827,
      611.7445838084378
    ],
    [
      672.7480045610034,
      363.7400228050171,
      0,
      0
    ],
    [
      0,
      0,
      0,
      0
    ],
    [
      415.0513112884835,
      585.5188141391106,
      648.8027366020525,
      356.89851767388825
    ]
  ];
}
// a matrix row
let valuesMatrixRow = function(r, chordName, ingress, egress, address) {
  this.chordName = chordName || '';
  this.address = address || '';
  this.ingress = ingress || '';
  this.egress = egress || '';
  this.index = r;
  this.cols = [];
  this.debug = false;
  for (let c=0; c<r; c++) {
    this.addCol(0);
  }
};
// a matrix column
let valuesMatrixCol = function(messages, row, c) {
  this.messages = messages;
  this.addresses = [];
  this.index = c;
  this.row = row;
};

valuesMatrix.prototype.debug = function (debug) {
  this.test = debug;
};
valuesMatrix.prototype.setmtest = function (m) {
  this.mtest[0][0] = +m.z0;
  this.mtest[0][1] = +m.z1;
  this.mtest[0][2] = +m.z2;
  this.mtest[0][3] = +m.z3;
  this.mtest[1][0] = +m.o0;
  this.mtest[1][1] = +m.o1;
  this.mtest[1][2] = +m.o2;
  this.mtest[1][3] = +m.o3;
  this.mtest[2][0] = +m.t0;
  this.mtest[2][1] = +m.t1;
  this.mtest[2][2] = +m.t2;
  this.mtest[2][3] = +m.t3;
  this.mtest[3][0] = +m.h0;
  this.mtest[3][1] = +m.h1;
  this.mtest[3][2] = +m.h2;
  this.mtest[3][3] = +m.h3;
};
// initialize a matrix with empty data with size rows and columns
valuesMatrix.prototype.zeroInit = function (size) {
  for (let r=0; r<size; r++) {
    this.addRow();
  }
};
// return true of any of the matrix cells have messages
valuesMatrix.prototype.hasValues = function () {
  return this.rows.some(function (row) {
    return row.cols.some(function (col) {
      return col.messages > MIN_CHORD_THRESHOLD;
    });
  });
};

// extract a square matrix with just the values from the object matrix
valuesMatrix.prototype.matrixMessages = function () {
  let m = emptyMatrix(this.rows.length);
  this.rows.forEach( function (row, r) {
    row.cols.forEach( function (col, c) {
      m[r][c] = col.messages;
    });
  });
  if (this.test) {
    console.log('returning test data' + this.mtest);
    return this.mtest;
  }
  return m;
};

valuesMatrix.prototype.chordName = function (i, ingress) {
  if (this.aggregate)
    return this.rows[i].chordName;
  return (ingress ? this.rows[i].ingress : this.rows[i].egress);

};
valuesMatrix.prototype.routerName = function (i) {
  return this.aggregate ? this.rows[i].chordName : this.rows[i].egress;
};
valuesMatrix.prototype.sortKey = function (i) {
  return this.rows[i].egress + '-' + this.rows[i].ingress + '-' + this.rows[i].address;
};
valuesMatrix.prototype.addressName = function (i) {
  return this.rows[i].address;
};
valuesMatrix.prototype.addRow = function (chordName, ingress, egress, address) {
  let rowIndex = this.rows.length;
  let newRow = new valuesMatrixRow(rowIndex, chordName, ingress, egress, address);
  this.rows.push(newRow);
  // add new column to all rows
  for (let r=0; r<=rowIndex; r++) {
    this.rows[r].addCol(0, r);
  }
  return rowIndex;
};
valuesMatrix.prototype.indexOf = function (chordName) {
  return this.rows.findIndex( function (row) {
    return row.chordName === chordName;
  });
};
valuesMatrix.prototype.addValue = function (r, c, value) {
  this.rows[r].cols[c].addMessages(value.messages);
  this.rows[r].cols[c].addAddress(value.address);
};
valuesMatrixRow.prototype.addCol = function (messages) {
  this.cols.push(new valuesMatrixCol(messages, this, this.cols.length));
};
valuesMatrixCol.prototype.addMessages = function (messages) {
  if (!(this.messages === MIN_CHORD_THRESHOLD && messages === MIN_CHORD_THRESHOLD))
    this.messages += messages;
};
valuesMatrixCol.prototype.addAddress = function (address) {
  this.addresses.push(address);
};
valuesMatrix.prototype.getChordList = function () {
  return this.rows.map( function (row) {
    return row.chordName;
  });
};
valuesMatrix.prototype.sorted = function () {
  let newChordList = this.getChordList();
  newChordList.sort();
  let m = new valuesMatrix(this.aggregate);
  m.zeroInit(this.rows.length);
  this.rows.forEach( function (row) {
    let chordName = row.chordName;
    row.cols.forEach( function (col, c) {
      let newRow = newChordList.indexOf(chordName);
      let newCol = newChordList.indexOf(this.rows[c].chordName);
      m.rows[newRow].chordName = chordName;
      m.rows[newRow].address = row.address;
      m.rows[newRow].ingress = row.ingress;
      m.rows[newRow].egress = row.egress;
      m.rows[newRow].cols[newCol].messages = col.messages;
      m.rows[newRow].cols[newCol].addresses = col.addresses;
    }.bind(this));
  }.bind(this));
  return m;
};

// private helper function
let emptyMatrix = function (size) {
  let matrix = [];
  for(let i=0; i<size; i++) {
    matrix[i] = [];
    for(let j=0; j<size; j++) {
      matrix[i][j] = 0;
    }
  }
  return matrix;
};
