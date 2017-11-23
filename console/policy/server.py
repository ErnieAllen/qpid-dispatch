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
import optparse
from proton import Message, Url
from proton.handlers import MessagingHandler
from proton.reactor import Container

from db import DB
import pdb

class Server(MessagingHandler):
    def __init__(self, url, address):
        super(Server, self).__init__()
        self.url = url
        self.address = address
        self.verbose = True
        self.policy = {'policy': {}, 'vhosts': []}

    def on_start(self, event):
        print("Listening on", self.url)
        self.container = event.container
        self.conn = event.container.connect(self.url, properties={u'client_itentifier': u'policy_server'})
        self.receiver = event.container.create_receiver(self.conn, self.address)
        self.server = self.container.create_sender(self.conn, None)

    def SAVE_POLICY(self, request):
        self.policy = request
        with DB('policy.db') as db:
            db.update(self.policy)
        return u"policy saved from server.py"

    def GET_POLICY(self, request):
        '''
        policy = {
            <global settings>
        }
        
        vhosts =
        [
        {
            id: vhost-name
            <connection limits>
            groups: {
                group-name: {
                    <user group settings>
                }
            }
        },
        ...
        ]
        :param request:
        :return: 
        '''
        with DB() as db:
            policy = db.getPolicy()
            print (policy)
            vhosts = db.getVhosts()

        return {'policy': policy, 'vhosts': vhosts}

    def operation(self, op, request):
        m = op.replace("-", "_")
        try:
            method = getattr(self, m)
        except AttributeError:
            print (op + " is not implemented yet")
            return u'not implemented'
        if self.verbose:
            print ("Got request " + op)
        return method(request)

    def on_message(self, event):
        print("Received", event.message)
        op = event.message.properties['operation']
        response = self.operation(op, event.message.body)
        self.server.send(Message(address=event.message.reply_to, body=response,
                            correlation_id=event.message.correlation_id))

parser = optparse.OptionParser(usage="usage: %prog [options]")
parser.add_option("-a", "--address", default="localhost:5672/examples",
                  help="address from which messages are received (default %default)")
opts, args = parser.parse_args()

url = Url(opts.address)

try:
    Container(Server(url, url.path)).run()
except KeyboardInterrupt: pass



