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

class Server(MessagingHandler):
    def __init__(self, url, verbose):
        super(Server, self).__init__()
        self.url = url
        self.verbose = verbose

    def on_start(self, event):
        if self.verbose:
            print("Listening on", self.url)
        self.acceptor = event.container.listen(self.url)

    def on_link_opening(self, event):
        if event.link.remote_target.address:
            event.link.target.address = event.link.remote_target.address
            self.server = event.container.create_sender(event.connection)

    def on_message(self, event):
        print("Received", event.message)
        targetAddress = event.context.link.target.address

        # look for multi-tenant request in the form of /<group_name>/policy
        if self.verbose:
            print ('  target.address', targetAddress)
        parts = targetAddress.split('/')
        vhost = parts[-2]
        policy = parts[-1]
        if vhost == '':
            vhost = None    # got request at address /policy

        op = event.message.properties['operation']
        if self.verbose:
            print ('vhost', vhost, 'policy', policy, 'operation', op)
        response = self.operation(op, event.message.body, vhost)
        self.server.send(Message(address=event.message.reply_to, body=response,
                                 correlation_id=event.message.correlation_id))

    def SAVE_POLICY(self, request, vhost):
        with DB(verbose=self.verbose) as db:
            db.update(request, vhost)
        return u"policy saved"

    def DELETE(self, request, vhost):
        if vhost is not None:
            assert vhost == request['vhost']
        with DB(verbose=self.verbose) as db:
            if request['type'] == 'vhost':
                return db.deleteVhost(request['vhost'])
            elif request['type'] == 'group':
                return db.deleteGroup(request['group'], request['vhost'])
        return unicode('unknown type ' + request['type'])

    def GET_VHOST(self, request, vhost):
        if vhost is None:
            vhost = request['name']
        with DB(verbose=self.verbose) as db:
            return db.getVHosts(vhost)

    def GET_POLICY(self, request, vhost):
        policy = {'empty': True}
        with DB(verbose=self.verbose) as db:
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

parser = argparse.ArgumentParser(description='Serve and persist dispatch router policy settings.')
parser.add_argument("-a", "--address", default="0.0.0.0:25674", help="Addres on which to listen for policy requests (default: %(default)s)")
parser.add_argument('-v', "--verbose", action='store_true', help='verbose output')
args = parser.parse_args()

url = Url(args.address)
try:
    Container(Server(url, True)).run()
except KeyboardInterrupt: pass



