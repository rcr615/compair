# -*- coding: utf-8 -*-
from __future__ import unicode_literals
from contextlib import contextmanager
import copy
import json
import unittest
import mock
import uuid
import sys
import os
import factory.fuzzy

from flask_testing import TestCase
from os.path import dirname
from flask.testing import FlaskClient
from six import wraps

from compair import create_app
from compair.manage.database import populate
from compair.core import db
from compair.models import User, XAPILog
from compair.tests import test_app_settings
from lti import ToolConsumer
from lti.utils import parse_qs

# Tests Checklist
# - Unauthenticated users refused access with 401
# - Authenticated but unauthorized users refused access with 403
# - Non-existent entry errors out with 404
# - If post request, bad input format gets rejected with 400

def json_recorder(filename, key=None):
    """
    This decorator will load the fixture, inject data to the function and write back to the file.

    It also writes the json value (ret_value.json) of the return from wrapped function to the file.

    :param filename: filename to load
    :param key: key to use for the return result
    :return: decorator factory
    """
    def _decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            file_path_name = '{}/../../data/fixtures/{}'.format(dirname(__file__), filename)
            with open(file_path_name, 'r') as f:
                try:
                    data = json.load(f)
                except ValueError:
                    data = {}

            def collect_from_response(resp_key, response):
                data[resp_key] = {
                    'body': response.json,
                    'status_code': response.status_code
                }
                data['_modified'] = True

            ret = func(*(args + (collect_from_response,)), **kwargs)
            if ret is None and '_modified' not in data:
                return
            dict_key = func.__name__ if key is None else key
            if ret is not None:
                collect_from_response(dict_key, ret)

            del data['_modified']
            with open(file_path_name, 'w') as f:
                json.dump(data, f, indent=4)
        return wrapper
    return _decorator

@contextmanager
def suppress_stdout():
    old_stdout = sys.stdout
    sys.stdout = open(os.devnull, "w")
    try:
        yield
    finally:
        sys.stdout.close()
        sys.stdout = old_stdout

class ComPAIRTestCase(TestCase):
    def create_app(self):
        app = create_app(settings_override=test_app_settings)
        return app

    def setUp(self):
        db.create_all()
        with suppress_stdout():
            populate(default_data=True)
        # reset login settings in case tests fail
        self.app.config['APP_LOGIN_ENABLED'] = True
        self.app.config['CAS_LOGIN_ENABLED'] = True
        self.app.config['SAML_LOGIN_ENABLED'] = True
        self.app.config['LTI_LOGIN_ENABLED'] = True

    def tearDown(self):
        db.session.remove()
        db.drop_all()

class ComPAIRXAPITestCase(ComPAIRTestCase):
    compair_source_category = {
        'id': 'http://xapi.learninganalytics.ubc.ca/category/compair',
        'definition': {'type': 'http://id.tincanapi.com/activitytype/source'},
        'objectType': 'Activity'
    }

    def create_app(self):
        settings = test_app_settings.copy()
        settings['XAPI_ENABLED'] = True
        app = create_app(settings_override=settings)
        return app

    def generate_tracking(self, with_duration=False, **kargs):
        tracking = {
            'registration': str(uuid.uuid4())
        }
        if with_duration:
            tracking['duration'] = "PT02.475S"

        if kargs:
            tracking.update(kargs)

        return tracking

    def _validate_and_cleanup_statement(self, statement):
        # check categories
        categories = statement['context']['contextActivities']['category']
        self.assertIn(self.compair_source_category, categories)
        categories.remove(self.compair_source_category)

        self.assertEqual(statement['context']['platform'], 'https://localhost:8888/')
        del statement['context']['platform']

        if len(categories) == 0:
            del statement['context']['contextActivities']['category']
        if len(statement['context']['contextActivities']) == 0:
            del statement['context']['contextActivities']
        if len(statement['context']) == 0:
            del statement['context']

        # check timestamp
        self.assertIsNotNone(statement['timestamp'])

    def get_and_clear_statement_log(self, has_request=False):
        statements = []
        for xapi_log in XAPILog.query.all():
            statement = json.loads(xapi_log.statement)

            self._validate_and_cleanup_statement(statement)

            statements.append(statement)
        XAPILog.query.delete()
        return statements

    def get_third_party_actor(self, user, homepage, identifier):
        return {
            'account': {'homePage': homepage, 'name': identifier },
            'name': user.fullname,
            'objectType': 'Agent'
        }

    def get_compair_actor(self, user):
        return {
            'account': {'homePage': 'https://localhost:8888/', 'name': user.uuid },
            'name': user.fullname,
            'objectType': 'Agent'
        }

class ComPAIRAPITestCase(ComPAIRTestCase):
    api = None
    resource = None

    @contextmanager
    def login(self, username, password="password"):
        payload = json.dumps({
            'username': username,
            'password': password
        })
        rv = self.client.post('/api/login', data=payload, content_type='application/json', follow_redirects=True)
        self.assert200(rv)
        yield rv
        self.client.delete('/api/logout', follow_redirects=True)

    @contextmanager
    def cas_login(self, cas_username, follow_redirects=True):
        response_mock = mock.MagicMock()
        response_mock.success = True
        response_mock.user = cas_username
        response_mock.attributes = {}

        with mock.patch('compair.api.login.validate_cas_ticket', return_value=response_mock):
            rv = self.client.get('/api/cas/auth?ticket=mock_ticket', follow_redirects=follow_redirects)
            if follow_redirects:
                self.assert200(rv)
            yield rv
            self.client.delete('/api/logout', follow_redirects=True)

    @contextmanager
    def saml_login(self, saml_unique_identifier, follow_redirects=True):
        response_mock = mock.MagicMock()
        response_mock.get_errors.return_value = []
        response_mock.is_authenticated.return_value = True
        response_mock.get_attributes.return_value = {
            'urn:oid:0.9.2342.19200300.100.1.1': [saml_unique_identifier]
        }
        response_mock.get_nameid.return_value = "saml_mock_nameid"
        response_mock.get_session_index.return_value = "saml_session_index"

        with mock.patch('compair.api.login.get_saml_auth_response', return_value=response_mock):
            rv = self.client.post('/api/saml/auth', follow_redirects=follow_redirects)
            if follow_redirects:
                self.assert200(rv)
            yield rv
            self.client.delete('/api/logout', follow_redirects=True)

    @contextmanager
    def lti_launch(self, lti_consumer, lti_resource_link_id,
                         assignment_uuid=None, query_assignment_uuid=None,
                         nonce=None, timestamp=None, follow_redirects=True,
                         invalid_launch=False, **kwargs):
        launch_url = "http://localhost/api/lti/auth"
        oauth_signature = kwargs.pop('oauth_signature', None)
        launch_params = kwargs.copy()
        launch_params['resource_link_id'] = lti_resource_link_id
        if assignment_uuid:
            launch_params['custom_assignment'] = assignment_uuid
        if query_assignment_uuid:
            launch_url = launch_url+"?assignment="+query_assignment_uuid

        # add basic required launch parameters
        if not 'lti_version' in launch_params:
           launch_params['lti_version'] = "LTI-1p0"

        if not 'lti_message_type' in launch_params:
           launch_params['lti_message_type'] = "basic-lti-launch-request"

        if 'roles' in launch_params and launch_params.get('roles') == None:
            launch_params.pop('roles')

        tool_consumer = ToolConsumer(
            lti_consumer.oauth_consumer_key,
            lti_consumer.oauth_consumer_secret,
            params=launch_params,
            launch_url=launch_url
        )

        # overwrite lti_version and lti_message_type if needed (set by lti.LaunchParams)
        if 'lti_version' in launch_params and launch_params.get('lti_version') == None:
            tool_consumer.launch_params._params.pop('lti_version')

        if 'lti_message_type' in launch_params and launch_params.get('lti_message_type') == None:
            tool_consumer.launch_params._params.pop('lti_message_type')

        if invalid_launch:
            with mock.patch.object(ToolConsumer, 'has_required_params', return_value=True):
                launch_request = tool_consumer.generate_launch_request(nonce=nonce, timestamp=timestamp)
        else:
            launch_request = tool_consumer.generate_launch_request(nonce=nonce, timestamp=timestamp)

        launch_data = parse_qs(launch_request.body.decode('utf-8'))

        # overwrite oauth_signature for tests
        if invalid_launch and oauth_signature:
            launch_data['oauth_signature'] = oauth_signature

        rv = self.client.post('/api/lti/auth', data=launch_data, follow_redirects=follow_redirects)
        yield rv
        rv.close()

    @contextmanager
    def impersonate(self, original_user, target_user):
        with self.login(original_user.username) if original_user else contextlib.suppress():
            rv = self.client.post('/api/impersonate/' + target_user.uuid,
                content_type='application/json', follow_redirects=True)
            self.assert200(rv)
            yield rv
            rv = self.client.delete('/api/impersonate', follow_redirects=True)
            self.assert200(rv)

    def get_url(self, **values):
        return self.api.url_for(self.resource, **values)

class ComPAIRAPIDemoTestCase(ComPAIRAPITestCase):
    def setUp(self):
        db.create_all()
        with suppress_stdout():
            populate(default_data=True, sample_data=True)
        self.app.config['DEMO_INSTALLATION'] = True


class SessionTests(ComPAIRAPITestCase):
    def test_loggedin_user_session(self):
        with self.login('root', 'password'):
            rv = self.client.get('/api/session')
            self.assert200(rv)
            root = rv.json
            root_user = User.query.filter_by(username="root").first()
            self.assertEqual(root['id'], root_user.uuid)

    def test_non_loggedin_user_session(self):
        rv = self.client.get('/api/session')
        self.assert401(rv)
