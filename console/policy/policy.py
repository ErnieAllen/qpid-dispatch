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

# modified from qpid-proton/examples/python/server.py

from __future__ import print_function
import argparse

from proton import Message, Url
from proton.handlers import MessagingHandler
from proton.reactor import Container

from db import DB
import pdb

class Server(MessagingHandler):
    def __init__(self, url, address, verbose):
        super(Server, self).__init__()
        self.url = url
        self.address = address
        self.verbose = verbose

    def on_start(self, event):
        print("Listening on", self.url)
        self.container = event.container
        self.conn = event.container.connect(self.url, properties={u'client_itentifier': u'policy_server'})
        self.receiver = event.container.create_receiver(self.conn, self.address)
        self.receiver2 = event.container.create_receiver(self.conn, '/bob.com')
        self.receiver3 = event.container.create_receiver(self.conn, '/alice.com')
        self.server = self.container.create_sender(self.conn, None)

    def SAVE_POLICY(self, request, vhost):
        with DB() as db:
            db.update(request, vhost)
        return u"policy saved"

    def DELETE(self, request, vhost):
        if vhost is not None:
            assert vhost == request['vhost']
        with DB() as db:
            if request['type'] == 'vhost':
                return db.deleteVhost(request['vhost'])
            elif request['type'] == 'group':
                return db.deleteGroup(request['group'], request['vhost'])
        return unicode('unknown type ' + request['type'])

    def GET_VHOST(self, request, vhost):
        if vhost is None:
            vhost = request['name']
        with DB() as db:
            return db.getVHosts(vhost)

    def GET_POLICY(self, request, vhost):
        policy = {'empty': True}
        with DB() as db:
            if vhost is None:
                policy = db.getPolicy()
            vhosts = db.getVhosts(vhost)

        return {'policy': policy, 'vhosts': vhosts}

    def operation(self, op, request, vhost):
        m = op.replace("-", "_")
        try:
            method = getattr(self, m)
        except AttributeError:
            print (op + " is not implemented yet")
            return u'not implemented'
        if self.verbose:
            print ("Got request " + op)
        return method(request, vhost)

    def on_message(self, event):
        print("Received", event.message)
        if not event.message.address:
            print ('received messages without an address field. ignoring.')
            return

        # look for multi-tenant request in the form of <group_name>/policy
        vhost, policy = event.message.address.split('/')
        if vhost == '':
            vhost = None    # got request at address /policy

        # for testing, sending to /bob.com or /alice.com simulates bob.com/policy and alice.com/policy
        if event.message.address != ('/'+self.address):
            print('event.message.address', event.message.address)
            print('self.address', self.address)
            vhost = policy  # set vhost to string after the /
            print ('setting vhost to ', policy)

        op = event.message.properties['operation']
        response = self.operation(op, event.message.body, vhost)
        self.server.send(Message(address=event.message.reply_to, body=response,
                            correlation_id=event.message.correlation_id))

parser = argparse.ArgumentParser(description='Serve and persist policy options.')
parser.add_argument("-a", "--address", default="0.0.0.0:20000/policy", help="which policy to load (default: %(default)s)")
parser.add_argument('-v', "--verbose", action='store_true', help='verbose output')
args = parser.parse_args()

url = Url(args.address)

try:
    Container(Server(url, url.path, args.verbose)).run()
except KeyboardInterrupt: pass



