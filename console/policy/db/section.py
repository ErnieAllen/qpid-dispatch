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

from __future__ import print_function
import sqlite3
import os
import pdb

class DB(object):
    """DB initializes and manipulates SQLite3 databases."""
    schema = {
        'policy': {'_policy_id': 'INTEGER PRIMARY KEY AUTOINCREMENT',
                   'maxConnections': 'INTEGER',
                   'enableVhostPolicy': 'INTEGER',
                   'defaultVhost': 'TEXT'},
        'vhosts':  {'_vhost_id': 'INTEGER PRIMARY KEY AUTOINCREMENT',
                    'id': 'TEXT NOT NULL',
                    'maxConnections': 'INTEGER',
                    'maxConnectionsPerUser': 'INTEGER',
                    'maxConnectionPerRemoteHost': 'INTEGER',
                    'allowUnknownUser': 'INTEGER'},
        'groups':  {'name': 'TEXT NOT NULL',
                    'users': 'TEXT',
                    'remoteHosts': 'TEXT',
                    'maxFrameSize': 'INTEGER',
                    'maxSessions': 'INTEGER',
                    'maxSessionWindow': 'INTEGER',
                    'maxMessageSize': 'INTEGER',
                    'maxSenders': 'INTEGER',
                    'maxReceivers': 'INTEGER',
                    'allowDynamicSource': 'INTEGER',
                    'allowAnonymousSender': 'INTEGER',
                    'allowUserIdProxy': 'INTEGER',
                    'sources': 'TEXT',
                    'targets': 'TEXT',
                    '_vhost_id': 'INTEGER'}
    }

    constraints = [{'name': 'fk_vhost',
                   'field': '_vhost_id',
                   'reference_table': 'vhosts',
                   'create_table': 'groups'}
    ]

    def __init__(self, database='policy.db'):
        """Initialize a new or connect to an existing database.
        """

        # the database filename
        self.database = database
        self.connection = None

    def __enter__(self):
        self.connect()
        return self

    def __exit__(self, *args):
        self.close()

    def connect(self):
        """Connect to the SQLite3 database."""

        if not os.path.isfile(self.database):
            self.create()
        self.connection = sqlite3.connect(self.database)
        self.cursor = self.connection.cursor()

    def close(self):
        """Close the SQLite3 database."""

        if self.connection:
            self.connection.commit()
            self.connection.close()
            self.connection = None

    def create(self):
        schema = DB.schema
        # create the file
        self.connection = sqlite3.connect(self.database)
        self.cursor = self.connection.cursor()
        self.close()

        # create the tables
        with DB() as db:
            for table in schema:
                cols = ', '.join(["%s %s" % (c, schema[table][c]) for c in schema[table]])
                for c in DB.constraints:
                    if c['create_table'] == table:
                        con = """CONSTRAINT %s
                            FOREIGN KEY (%s)
                            REFERENCES %s(%s)
                            ON DELETE CASCADE""" % (c['name'], c['field'], c['reference_table'], c['field'])
                        cols = (cols + ', ' + con)
                s = "CREATE TABLE %s (%s);" % (table, cols)
                db.execute(s)

            # create the policy record
            s = "INSERT INTO policy DEFAULT VALUES;"
            db.execute(s)

            s = 'CREATE UNIQUE INDEX idx_vhosts_id ON vhosts (id);'
            db.execute(s)

            s = 'CREATE UNIQUE INDEX idx_group_name ON groups (name);'
            db.execute(s)

    def execute(self, statement, values=None):
        """Execute complete SQL statement.

        Selected data is returned as a list of query results. Example:

        for result in db.execute(query):
            for row in result:
                print row
        """
        print ("executing: " + statement)
        try:
            statement = statement.strip()
            if values is None:
                self.cursor.execute(statement)
            else:
                print ("with values:  ", values)
                if type(values) not in (tuple, list):
                    values = [values]
                self.cursor.execute(statement, values)
            # retrieve selected data
            return self.cursor.fetchall()

        except sqlite3.Error as error:
            raise error

    def getTableCols(self, table, filter=False):
        return sorted([n for n in DB.schema[table] if not filter or not n.startswith('_')])

    def vals(self, cols, obj):
        values = []
        for c in cols:
            val = obj.get(c, None)
            if val in (True, False):
                val = val + 0   # True:1 False:0
            values.append(val)
        return values

    def replace_record(self, obj, table, filter = True, set_fields = None):
        cols = self.getTableCols(table, filter)
        values = self.vals(cols, obj)
        names = ','.join(cols)

        if set_fields is not None:
            for field in set_fields:
                idx = cols.index(field['field_name'])
                values[idx] = field['field_value']

        # there must be a unique index so this will
        # update if index value exists, otherwise insert
        s = "REPLACE INTO %s (%s) VALUES (%s);" % (table, names, ','.join(['?'] * len(values)))
        self.execute(s, values)

    def update(self, policyvhosts):
        policy = policyvhosts['policy']
        cols = self.getTableCols('policy', True)
        values = self.vals(cols, policy)
        names = ','.join(['%s=?' % c for c in cols])
        s = 'UPDATE policy SET %s WHERE _policy_id = 1' % names
        self.execute(s, values)

        vhosts = policyvhosts['vhosts']
        for vhost in vhosts:
            self.replace_record(vhost, 'vhosts')
            # get the _vhost_id of this vhost record
            _vhost_id = self.execute('SELECT _vhost_id from vhosts WHERE id = ?', vhost['id'])[0][0]

            groups = vhost.get('groups', {})
            for group in groups:
                self.replace_record(groups[group], 'groups', False, [{'field_name': '_vhost_id',
                                                                      'field_value': _vhost_id},
                                                                     {'field_name': 'name',
                                                                      'field_value': group}])

    def getVhosts(self):
        vhostlist = []
        cols = self.getTableCols('vhosts')
        s = 'SELECT %s FROM vhosts;' % ','.join(cols)
        vhosts = self.execute(s)
        for vRow in vhosts:
            vdict = dict(zip(cols, vRow))
            vhostlist.append(vdict)
            vdict['groups'] = {}

            gcols = self.getTableCols('groups')
            s = 'SELECT %s FROM groups WHERE _vhost_id=?' % ','.join(gcols)
            groups = self.execute(s, vdict['_vhost_id'])
            for gRow in groups:
                gdict = dict(zip(gcols, gRow))
                vdict['groups'][gdict['name']] = gdict

        return vhostlist

    def getPolicy(self):
        cols = self.getTableCols('policy', True)
        s = 'SELECT %s FROM policy;' % ','.join(cols)
        p = self.execute(s)
        return dict(zip(cols, p[0])) if len(p) else {}

if __name__ == '__main__':

    schema = DB.schema
    #setup
    with DB('policy.db') as db:
        for table in schema:
            cols = ', '.join(["%s %s" % (c, schema[table][c]) for c in schema[table]])
            statement = "CREATE TABLE %s (%s);" % (table, cols)
            print (statement)
            print ()
            db.execute(statement)

    '''
    #a single statement
    db.execute(
        ["INSERT INTO source (id, filename) values (8, 'reference.txt');"])

    #a list of complete statements
    db.execute(["INSERT INTO query (id, filename) values (8, 'one.txt');",
                "INSERT INTO query (id, filename) values (9, 'two.txt');"])

    #a list of incomplete statements
    db.execute(["INSERT INTO query (id, filename) ",
                "values (10, 'three.txt');"])

    #retrieving multiple query results
    queries = ['SELECT * FROM source;', 'SELECT * FROM query;']
    for result in db.execute(queries):
        print (result)
    '''
