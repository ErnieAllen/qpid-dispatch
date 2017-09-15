#!/usr/bin/env python
#
# Licensed to the Apache Software Foundation (ASF) under one
# or more contributor license agreements.  See the NOTICE file
# distributed with this work for additional information
# regarding copyright ownership.  The ASF licenses this file
# to you under the Apache License, Version 2.0 (the
# "License"); you may not use this file except in compliance
# with the License.  You may obtain a copy of the License at
#
#   http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied.  See the License for the
# specific language governing permissions and limitations
# under the License.
#

import argparse
from pprint import pprint
import os, sys, inspect
import string
import random
from glob import glob
from mock import *
import SimpleHTTPServer
import SocketServer
import json

import pdb

def id_generator(size=6, chars=string.ascii_uppercase + string.digits):
    return ''.join(random.choice(chars) for _ in range(size))

get_class = lambda x: globals()[x]
sectionKeys = {"log": "module", "sslProfile": "name", "connector": "name", "listener": "port"}

# borrowed from qpid-dispatch/python/qpid_dispatch_internal/management/config.py
def _parse(lines):
    """Parse config file format into a section list"""
    begin = re.compile(r'([\w-]+)[ \t]*{') # WORD {
    end = re.compile(r'}')                 # }
    attr = re.compile(r'([\w-]+)[ \t]*:[ \t]*(.+)') # WORD1: VALUE
    pattern = re.compile(r'([\w-]+)[ \t]*:[ \t]*([\S]+).*')

    def sub(line):
        """Do substitutions to make line json-friendly"""
        line = line.strip()
        if line.startswith("#"):
            return ""
        # 'pattern:' is a special snowflake.  It allows '#' characters in
        # its value, so they cannot be treated as comment delimiters
        if line.split(':')[0].strip().lower() == "pattern":
            line = re.sub(pattern, r'"\1": "\2",', line)
        else:
            line = line.split('#')[0].strip()
            line = re.sub(begin, r'["\1", {', line)
            line = re.sub(end, r'}],', line)
            line = re.sub(attr, r'"\1": "\2",', line)
        return line

    js_text = "[%s]"%("\n".join([sub(l) for l in lines]))
    spare_comma = re.compile(r',\s*([]}])') # Strip spare commas
    js_text = re.sub(spare_comma, r'\1', js_text)
    # Convert dictionary keys to camelCase
    sections = json.loads(js_text)
    #Config.transform_sections(sections)
    return sections

class DirectoryConfigs(object):
    def __init__(self, path='./'):
        self.path = path
        self.configs = {}

        files = glob(path + '*.conf')
        for file in files:
            with open(file) as f:
                self.configs[file] = _parse(f)

    def asSection(self, s):
        cname = s[0][0].upper() + s[0][1:] + "Section"
        try:
            c = get_class(cname)
            return c(**s[1])
        except KeyError, e:
            return None

class Manager(object):
    def __init__(self, topology, verbose):
        self.topology = topology
        self.verbose = verbose
        self.base = "topologies/"

    def operation(self, op, request):
        m = op.replace("-", "_")
        try:
            method = getattr(self, m)
        except AttributeError:
            print op + " is not implemented yet"
            return None
        if self.verbose:
            print "Got request " + op
        return method(request)

    def GET_LOG(self, request):
        return []

    def GET_SCHEMA(self, request):
        with open("schema.json") as fp:
            data = json.load(fp)
            return data

    def LOAD(self, request):
        topology = request["topology"]
        nodes = []
        links = []
        conn_ports = {}

        dc = DirectoryConfigs('./' + self.base + topology + '/')
        configs = dc.configs

        for index, file in enumerate(configs):
            node = {}
            sections = {}
            for sect in configs[file]:
                section = dc.asSection(sect)
                if section:
                    if section.type == "router":
                        name = section.entries["id"]
                        node["index"] = index
                        node["nodeType"] = unicode("inter-router")
                        node["name"] = name
                        node["routerId"] = name
                        node["key"] = "amqp:/_topo/0/" + name + "/$management"
                        nodes.append(node)

                    if section.type == "connector":
                        # keep a map of port:node-index so we can link the nodes in the next loop
                        conn_ports[section.entries["port"]] = index

                    if section.type in sectionKeys:
                        sectionKey = sectionKeys[section.type]
                        if sectionKey in section.entries:
                            if not section.type in sections:
                                sections[section.type] = {}
                            nodeSection = sections[section.type]
                            nodeSection[section.entries[sectionKey]] = section.entries

            for sectionKey in sections:
                if sectionKey == "listener" or sectionKey == "connector":
                    key = sections[sectionKey].keys()[0]
                    if "role" in sections[sectionKey][key] and sections[sectionKey][key]["role"] == "inter-router":
                        continue
                node[sectionKey+'s'] = sections[sectionKey]

        for index, file in enumerate(configs):
            for sect in configs[file]:
                section = dc.asSection(sect)
                if sect[0] == "listener":
                    if section.entries["port"] in conn_ports:
                        link = {}
                        link["dir"] = unicode("out")
                        link["source"] = conn_ports[section.entries["port"]]
                        link["target"] = index
                        links.append(link)

        return {"nodes": nodes, "links": links, "topology": topology}

    def GET_TOPOLOGY(self, request):
        if self.verbose:
            pprint (self.topology)
        return unicode(self.topology)

    def GET_TOPOLOGY_LIST(self, request):
        return [unicode(f) for f in os.listdir(self.base) if os.path.isdir(self.base + f)]

    def SWITCH(self, request):
        self.topology = request["topology"]
        tdir = './' + self.base + self.topology + '/'
        if not os.path.exists(tdir):
            os.makedirs(tdir)
        return self.LOAD(request)

    def FIND_DIR(self, request):
        dir = request['relativeDir']
        files = request['fileList']
        # find a directory with this name that contains these files


    def SHOW_CONFIG(self, request):
        nodeIndex = request['nodeIndex']
        return self.PUBLISH(request, nodeIndex)

    def PUBLISH(self, request, nodeIndex=None):
        nodes = request["nodes"]
        links = request["links"]
        topology = request["topology"]
        settings = request["settings"]
        class StringFile(object):
            def __init__(self):
                self.s = ""

            def write(self, s):
                self.s += s

            def close(self):
                pass

            def __repr__(self):
                return self.s

        if self.verbose:
            if nodeIndex is None:
                print("PUBLISHing to " + topology)
            else:
                print("Creating config for " + topology + " node " + nodes[nodeIndex]['name'])

        if nodeIndex is None:
            # remove all .conf files from the output dir. they will be recreated below possibly under new names
            for f in glob(self.base + topology + "/*.conf"):
                if self.verbose:
                    print "Removing", f
                os.remove(f)

        #with open(self.base + topology + "/nodeslinks.dat", "w+") as fp:
        #    fp.write(json.dumps({"nodes": nodes, "links": links, "topology": topology}, indent=2))

        http_port = 5675
        conn_port = 21000
        host = "0.0.0.0"
        clients = {}
        connectionId = 1

        for node in nodes:
            node["port_map"] = {}   # used to ensure connectors/listeners between routers use the correct port

        # cache any connections and links for clients first
        for node in nodes:
            if node['nodeType'] != 'inter-router':
                if not node['key'] in clients:
                    clients[node['key']] = {"connections": [], "links": [], "addresses": []}

                for normal in node["normals"]:
                    clients[node['key']]["connections"].append(Connection(node, connectionId).vals())
                    ldir = "in" if node['cdir'] == "in" else "out"
                    owningAddr = "M0" + normal['addr'] if "console_identifier" not in node['properties'] else ""
                    clients[node['key']]["links"].append(RouterLink(node, str(len(clients[node['key']]["links"])),
                                                                    ldir, owningAddr, "endpoint", connectionId).vals())
                    if node['cdir'] == "both":
                        otherAddr = "M0" + normal['addr'] if "console_identifier" not in node['properties'] \
                            else "Ltemp." + id_generator(15)
                        clients[node['key']]["links"].append(RouterLink(node,
                                                                        str(len(clients[node['key']]["links"])), "in",
                                                                        otherAddr, "endpoint", connectionId).vals())
                    connectionId += 1


        # now process all the routers
        for idx, node in enumerate(nodes):
            if node['nodeType'] == 'inter-router':
                if self.verbose:
                    print "------------- processing node", node["name"], "---------------"

                # this should be driven by the schema and not hard coded like this
                nname = node["name"]
                if nodeIndex is None:
                    config_fp = open(self.base + topology + "/" + nname + ".conf", "w+")
                else:
                    config_fp = StringFile()

                # add a router section in the config file
                r = RouterSection(**node)
                if len(links) == 0:
                    r.setEntry('mode', 'standalone')
                r.setEntry('id', node['name'])
                config_fp.write(str(r) + "\n")

                # find all the other nodes that are linked to this node
                nodeCons = []
                # if the link source or target is this node's id
                for link in links:
                    # only process links to other routers. "small" links cls is for a broker and not a router
                    if link['cls'] != "small":
                        toNode = None
                        fromNode = None
                        if nodes[link['target']]['name'] == node['name']:
                            toNode = nodes[link['target']]
                            fromNode = nodes[link['source']]
                            toNode["cdir"] = "in"
                            print "processing links from " + toNode["name"]
                        if nodes[link['source']]['name'] == node['name']:
                            toNode = nodes[link['source']]
                            fromNode = nodes[link['target']]
                            toNode["cdir"] = "out"
                            print "processing links to " + toNode["name"]
                        if toNode:
                            toNode["container"] = fromNode["name"]
                            if toNode["name"] not in fromNode["port_map"]:
                                fromNode['port_map'][toNode["name"]] = str(conn_port)
                                toNode['port_map'][fromNode["name"]] = str(conn_port)
                                conn_port += 1
                            toNode["host"] = host + ':' + fromNode['port_map'][toNode["name"]]
                            nodeCons.append(toNode)
                            connectionId += 1

                # write other sections
                for sectionKey in sectionKeys:
                    if sectionKey+'s' in node:
                        for k in node[sectionKey+'s']:
                            o = node[sectionKey+'s'][k]
                            cname = sectionKey[0].upper() + sectionKey[1:] + "Section"
                            c = get_class(cname)
                            if sectionKey == "listener" and int(o['port']) == http_port:
                                http_port = None
                                config_fp.write("\n# Listener for a console\n")
                            config_fp.write(str(c(**o)) + "\n")

                # add an http listener (unless an http listener is already added)
                if http_port is not None and settings["http"]:
                    l = {"http": True}
                    config_fp.write("\n# Listener for a console\n")
                    config_fp.write(str(ListenerSection(http_port, **l)) + "\n")
                    http_port = None

                if nodeCons:
                    config_fp.write("\n# Connectors/Listeners for inter-router communication\n")
                for toNode in nodeCons:
                    dir = toNode['cdir']
                    connhost, connport = toNode['host'].split(":")
                    if dir == "out":
                        connectorSection = ConnectorSection(connport, **{'host': connhost, 'role': 'inter-router'})
                        config_fp.write(str(connectorSection) + "\n")
                    if dir == "in":
                        listenerSection = ListenerSection(connport, **{'host': connhost, 'role': 'inter-router'})
                        config_fp.write(str(listenerSection) + "\n")

                # return requested config file as string
                if idx == nodeIndex:
                    return str(config_fp)
                config_fp.close()

        return "published"

class HttpHandler(SimpleHTTPServer.SimpleHTTPRequestHandler):
    # use GET requests to serve the web pages
    def do_GET(self):
        SimpleHTTPServer.SimpleHTTPRequestHandler.do_GET(self);

    # use PORT requests to send commands
    def do_POST(self):
        content_len = int(self.headers.getheader('content-length', 0))
        if content_len > 0:
            body = self.rfile.read(content_len)
            data = json.loads(body)
            response = self.server.manager.operation(data['operation'], data)
            if response is not None:
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()

                self.wfile.write(json.dumps(response));
                self.wfile.close();
        else:
            return SimpleHTTPServer.SimpleHTTPRequestHandler.do_POST(self)

    # only log if verbose was requested
    def log_request(self, code='-', size='-'):
        if self.server.verbose:
            self.log_message('"%s" %s %s', self.requestline, str(code), str(size))

class ConfigTCPServer(SocketServer.TCPServer):
    def __init__(self, port, manager, verbose):
        SocketServer.TCPServer.__init__(self, ("", port), HttpHandler)
        self.manager = manager
        self.verbose = verbose

Schema.init()
parser = argparse.ArgumentParser(description='Read/Write Qpid Dispatch Router config files.')
parser.add_argument('-p', "--port", type=int, default=8000, help='port to listen for requests from browser')
parser.add_argument('-v', "--verbose", action='store_true', help='verbose output')
parser.add_argument("-t", "--topology", default="config-2", help="which topology to load (default: %(default)s)")
args = parser.parse_args()

try:
    httpd = ConfigTCPServer(args.port, Manager(args.topology, args.verbose), args.verbose)
    print "serving at port", args.port
    httpd.serve_forever()
except KeyboardInterrupt:
    pass