import json
from acj.models import PostsForJudgements
from data.fixtures.test_data import JudgementCommentsTestData
from tests.test_acj import ACJTestCase

class EvalCommentsAPITests(ACJTestCase):
	def setUp(self):
		super(EvalCommentsAPITests, self).setUp()
		self.data = JudgementCommentsTestData()
		# may need judgement comment data

	def _build_url(self, course_id, question_id, tail=""):
		url = '/api/courses/' + str(course_id) + '/questions/' + str(question_id) + '/judgements/' +\
			  'comments' + tail
		return url

	def test_get_eval_comments(self):
		url = self._build_url(self.data.get_course().id, self.data.get_questions()[0].id)

		# test login required
		rv = self.client.get(url)
		self.assert401(rv)

		# test unauthorized user
		self.login(self.data.get_unauthorized_instructor().username)
		rv = self.client.get(url)
		self.assert403(rv)
		self.logout()

		# test invalid course id
		self.login(self.data.get_authorized_instructor().username)
		rv = self.client.get(self._build_url(999, self.data.get_questions()[0].id))
		self.assert404(rv)

		# test invalid question id
		rv = self.client.get(self._build_url(self.data.get_course().id, 999))
		self.assert404(rv)

		# test no comments
		rv = self.client.get(self._build_url(self.data.get_course().id, self.data.get_questions()[1].id))
		self.assert200(rv)
		expected = []
		self.assertEqual(expected, rv.json['comments'])

		# test success query
		rv = self.client.get(url)
		self.assert200(rv)
		expected = self.data.get_judge_comment()
		actual = rv.json['comments'][0]
		self.assertEqual(expected.judgements_id, actual['judgement']['id'])
		self.assertEqual(expected.postsforcomments_id, actual['postsforcomments']['id'])
		self.assertEqual(expected.postsforcomments.post.content, actual['postsforcomments']['post']['content'])

	def test_create_eval_comment(self):
		url = self._build_url(self.data.get_course().id, self.data.get_questions()[1].id)
		content = {'judgements': []}
		judge = {
			'id': self.data.get_judge_2().id,
			'comment': "A is better than B because A used the correct formula."
		}
		content['judgements'].append(judge)

		# test login required
		rv = self.client.post(url, data=json.dumps(content), content_type='application/json')
		self.assert401(rv)

		# test unauthorized user
		self.login(self.data.get_authorized_instructor().username)
		rv = self.client.post(url, data=json.dumps(content), content_type='application/json')
		self.assert403(rv)
		self.logout()

		self.login(self.data.get_judging_student().username)
		#test invalid course id
		invalid_url = self._build_url(999, self.data.get_questions()[1].id)
		rv = self.client.post(invalid_url, data=json.dumps(content), content_type='application/json')
		self.assert404(rv)

		# test invalid question id
		invalid_url = self._build_url(self.data.get_course().id, 999)
		rv = self.client.post(invalid_url, data=json.dumps(content), content_type='application/json')
		self.assert404(rv)

		# test successful save
		rv = self.client.post(url, data=json.dumps(content), content_type='application/json')
		self.assert200(rv)
		actual = rv.json['objects'][0]
		self.assertEqual(judge['id'], actual['judgement']['id'])
		self.assertEqual(judge['comment'], actual['postsforcomments']['post']['content'])

		# test invalid judgement id
		content['judgements'][0]['id'] = 999
		rv = self.client.post(url, data=json.dumps(content), content_type='application/json')
		self.assert404(rv)


