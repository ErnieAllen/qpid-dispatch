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
/**
 * @module QDR
 */
var QDR = (function(QDR) {

  QDR.module.controller("QDR.NodeDialogController", function($scope, QDRService, $uibModalInstance, node, entityType, context, entityKey) {
    var newname = node.name
    $scope.context = context
    if (!angular.isDefined(context))
      $scope.context = 'new'
    $scope.title = ((context && context !== 'new') ? "Edit " : "Add ") + entityType + " section"
    var schema = QDRService.schema;
    //var myEntities = ['router', 'log', 'listener'];
    //var myEntities = ['router'];
    var myEntities = []
    myEntities.push(entityType)
    var readOnlyAttrs = { 'router': ['version', 'id', 'identity'],
                          'log': ['name', 'identity'],
                          'linkRoute': ['identity'],
                          "sslProfile": ['identity'],
                          "connector": ['identity']}

    var typeMap = {
      integer: 'number',
      string: 'text',
      path: 'text',
      boolean: 'boolean'
    };
    var newLinks = $('path.temp').toArray(); // jquery array of new links for the added router
    var separatedEntities = []; // additional entities required if a link is reversed
    var myPort = 0,
      myAddr = '0.0.0.0'; // port and address for new router
    $scope.entities = [];

    var maxPort = 22000;

    // construct an object that contains all the info needed for a single tab's fields
    var entity = function(actualName, tabName, humanName, ent, icon, link) {
      var nameIndex = -1; // the index into attributes that the name field was placed
      var index = 0;
      var info = {
          actualName: actualName,
          tabName: tabName,
          humanName: humanName,
          description: ent.description,
          icon: angular.isDefined(icon) ? icon : '',
          references: ent.references,
          link: link,

          attributes: $.map(ent.attributes, function(value, key) {
            // skip read-only fields
            if (readOnlyAttrs[tabName] && readOnlyAttrs[tabName].indexOf(key) >= 0)
              return null;
            // skip deprecated and statistics fields
            if (key == value.description.startsWith('Deprecated') || value.graph)
              return null;
            var val = value['default'];
            if (key == 'name')
              nameIndex = index;
            index++;
            return {
              name: key,
              humanName: QDRService.humanify(key),
              description: value.description,
              type: typeMap[value.type],
              rawtype: value.type,
              input: typeof value.type == 'string' ? value.type == 'boolean' ? 'boolean' : 'input' : 'select',
              selected: val ? val : undefined,
              'default': value['default'],
              value: val,
              required: value.required,
              unique: value.unique
            };
          })
        }
        // move the 'name' attribute to the 1st position
      if (nameIndex > -1) {
        var tmp = info.attributes[0];
        info.attributes[0] = info.attributes[nameIndex];
        info.attributes[nameIndex] = tmp;
      }
      return info;
    }

    // remove the annotation fields
    var stripAnnotations = function(entityName, ent, annotations) {
      if (ent.references) {
        var newEnt = {
          attributes: {}
        };
        ent.references.forEach(function(annoKey) {
          if (!annotations[annoKey])
            annotations[annoKey] = {};
          annotations[annoKey][entityName] = true; // create the key/consolidate duplicates
          var keys = Object.keys(schema.annotations[annoKey].attributes);
          for (var attrib in ent.attributes) {
            if (keys.indexOf(attrib) == -1) {
              newEnt.attributes[attrib] = ent.attributes[attrib];
            }
          }
          // add a field for the reference name
          newEnt.attributes[annoKey] = {
            type: 'string',
            description: 'Name of the ' + annoKey + ' section.',
            'default': annoKey,
            required: true
          };
        })
        newEnt.references = ent.references;
        newEnt.description = ent.description;
        return newEnt;
      }
      return ent;
    }

    var annotations = {};
    myEntities.forEach(function(entityName) {
      var ent = schema.entityTypes[entityName];
      var hName = QDRService.humanify(entityName);
      if (entityName == 'listener')
        hName = "Listener for clients";
      var noAnnotations = stripAnnotations(entityName, ent, annotations);
      var ediv = entity(entityName, entityName, hName, noAnnotations, undefined);

      if (node[entityName+'s'] && context in node[entityName+'s']) {
        // fill form with existing data
        var o = node[entityName+'s'][context]
        ediv.attributes.forEach( function (attr) {
          if (attr['name'] in o) {
            attr['value'] = o[attr['name']]
            // if the form has a select dropdown, set the selected to the current value
            if (Array.isArray(attr['rawtype']))
              attr.selected = attr['value']
          }
        })
      }

      if (ediv.actualName == 'router') {
        ediv.attributes.forEach( function (attr) {
          if (attr['name'] in node) {
            attr['value'] = node[attr['name']]
          }
        })
        // if we have any new links (connectors), then the router's mode should be interior
        var roleAttr = ediv.attributes.filter(function(attr) {
          return attr.name == 'mode'
        })[0];
        if (newLinks.length) {
          roleAttr.value = roleAttr.selected = "interior";
        } else {
          roleAttr.value = roleAttr.selected = "standalone";
        }
      }
      if (ediv.actualName == 'container') {
        ediv.attributes.filter(function(attr) {
          return attr.name == 'containerName'
        })[0].value = newname + "-container";
      }
      if (ediv.actualName == 'listener' && context === 'new') {
        // find max port number that is used in all the listeners
        ediv.attributes.filter(function(attr) {
          return attr.name == 'port'
        })[0].value = ++maxPort;
      }
      if (ediv.actualName == 'linkRoute') {
        ediv.attributes.forEach( function (attr) {
          if (attr['name'] in node) {
            attr['value'] = node[attr['name']]
          }
        })
      }
      // special case for required log.module since it doesn't have a default
      if (ediv.actualName == 'log') {
        // initialize module to 'DEFAULT'
        var moduleAttr = ediv.attributes.filter(function(attr) {
          return attr.name == 'module'
        })[0];
        moduleAttr.value = moduleAttr.selected = "DEFAULT";
        // adding a new log section and we already have a section. select 1st unused module
        if (context === 'new' && node.logs) {
          var modules = ent.attributes.module.type
          var availableModules = modules.filter( function (module) {
             return !(module in node.logs)
          })
          if (availableModules.length > 0) {
            moduleAttr.value = moduleAttr.selected = availableModules[0]
          }
        } else if (node.logs && context in node.logs) {
          // fill form with existing data
          var log = node.logs[context]
          ediv.attributes.forEach( function (attr) {
            if (attr['name'] in log) {
              attr['value'] = log[attr['name']]
              if (attr['name'] == 'module')
                attr.selected = attr['value']
            }
          })
        }
      }
      $scope.entities.push(ediv);
    })

    // add a tab for each annotation that was found
    var annotationEnts = [];
    for (var key in annotations) {
      ent = angular.copy(schema.annotations[key]);
      ent.attributes.name = {
        type: "string",
        unique: true,
        description: "Unique name that is used to refer to this set of attributes."
      }
      var ediv = entity(key, key + 'tab', QDRService.humanify(key), ent, undefined);
      ediv.attributes.filter(function(attr) {
        return attr.name == 'name'
      })[0].value = key;
      $scope.entities.push(ediv);
      annotationEnts.push(ediv);
    }

    // add an additional listener tab if any links are reversed
    ent = schema.entityTypes['listener'];
    newLinks.some(function(link) {
      if (link.__data__.right) {
        var noAnnotations = stripAnnotations('listener', ent, annotations);
        var ediv = entity("listener", "listener0", "Listener (internal)", noAnnotations, undefined);
        ediv.attributes.filter(function(attr) {
          return attr.name == 'port'
        })[0].value = ++maxPort;
        // connectors from other routers need to connect to this addr:port
        myPort = maxPort;
        myAddr = ediv.attributes.filter(function(attr) {
          return attr.name == 'host'
        })[0].value

        // override the role. 'normal' is the default, but we want inter-router
        ediv.attributes.filter(function(attr) {
          return attr.name == 'role'
        })[0].selected = 'inter-router';
        separatedEntities.push(ediv);
        return true; // stop looping
      }
      return false; // continue looping
    })

    // Add connector tabs for each new link on the topology graph
    ent = schema.entityTypes['connector'];
    newLinks.forEach(function(link, i) {
      var noAnnotations = stripAnnotations('connector', ent, annotations);
      var ediv = entity('connector', 'connector' + i, " " + link.__data__.source.name, noAnnotations, link.__data__.right, link)

      // override the connector role. 'normal' is the default, but we want inter-router
      ediv.attributes.filter(function(attr) {
        return attr.name == 'role'
      })[0].selected = 'inter-router';

      // find the addr:port of the inter-router listener to use
      var listener = nodeInfo[link.__data__.source.key]['.listener'];
      var attrs = listener.attributeNames;
      for (var i = 0; i < listener.results.length; ++i) {
        var res = listener.results[i];
        var role = QDRService.valFor(attrs, res, 'role');
        if (role == 'inter-router') {
          ediv.attributes.filter(function(attr) {
              return attr.name == 'host'
            })[0].value =
            QDRService.valFor(attrs, res, 'host')
          ediv.attributes.filter(function(attr) {
              return attr.name == 'port'
            })[0].value =
            QDRService.valFor(attrs, res, 'port')
          break;
        }
      }
      if (link.__data__.right) {
        // connectors from other nodes need to connect to the new router's listener addr:port
        ediv.attributes.filter(function(attr) {
          return attr.name == 'port'
        })[0].value = myPort;
        ediv.attributes.filter(function(attr) {
          return attr.name == 'host'
        })[0].value = myAddr;

        separatedEntities.push(ediv)
      } else
        $scope.entities.push(ediv);
    })
    Array.prototype.push.apply($scope.entities, separatedEntities);

    // update the description on all the annotation tabs
    annotationEnts.forEach(function(ent) {
      var shared = Object.keys(annotations[ent.actualName]);
      ent.description += " These fields are shared by " + shared.join(" and ") + ".";

    })

    $scope.testPattern = function(attr) {
      if (attr.rawtype == 'path')
        return /^(\/)?([^/\0]+(\/)?)+$/;
      //return /^(.*\/)([^/]*)$/;
      return /(.*?)/;
    }

    $scope.attributeDescription = '';
    $scope.attributeType = '';
    $scope.attributeRequired = '';
    $scope.attributeUnique = '';
    $scope.active = 'router'
    $scope.fieldsetDivs = "/fieldsetDivs.html"
    $scope.setActive = function(tabName) {
      $scope.active = tabName
    }
    $scope.isActive = function(tabName) {
      return $scope.active === tabName
    }
    $scope.showDescription = function(attr, e) {
        $scope.attributeDescription = attr.description;
        var offset = jQuery(e.currentTarget).offset()
        jQuery('.attr-description').offset({
          top: offset.top
        })

        $scope.attributeType = "Type: " + JSON.stringify(attr.rawtype, null, 1);
        $scope.attributeRequired = attr.required ? 'required' : '';
        $scope.attributeUnique = attr.unique ? 'Must be unique' : '';
      }
      // handle the save button click
      // copy the dialog's values to the original node
    $scope.save = function() {
      $uibModalInstance.close({
        entities: $scope.entities,
        annotations: annotations
      });
    }
    $scope.cancel = function() {
      $uibModalInstance.close()
    };
    $scope.del = function() {
      $uibModalInstance.close({del: true})
    }

    $scope.selectAnnotationTab = function(tabName) {
      var tabs = $("#tabs").tabs();
      tabs.tabs("select", tabName);
    }

    var initTabs = function() {
        var div = angular.element("#tabs");
        if (!div.width()) {
          setTimeout(initTabs, 100);
          return;
        }
        $("#tabs")
          .tabs()
          .addClass('ui-tabs-vertical ui-helper-clearfix');
      }
      // start the update loop
    initTabs();

  });

  return QDR;
}(QDR || {}));
