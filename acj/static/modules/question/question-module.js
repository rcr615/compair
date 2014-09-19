// Provides the services and controllers for questions.
//
(function() {

var module = angular.module('ubc.ctlt.acj.question',
	[
		'angularFileUpload',
		'ngResource',
		'ubc.ctlt.acj.answer',
		'ubc.ctlt.acj.authentication',
		'ubc.ctlt.acj.authorization',
		'ubc.ctlt.acj.comment',
		'ubc.ctlt.acj.common.form',
		'ubc.ctlt.acj.common.mathjax',
		'ubc.ctlt.acj.criteria',
		'ubc.ctlt.acj.judgement',
		'ubc.ctlt.acj.toaster',
		'ubc.ctlt.acj.session'
	]
);

/***** Directives *****/
module.directive(
	'confirmationNeeded',
	function () {
		return {
			restrict: 'A',
			link: function(scope, element, attrs){
				var msg = "Are you sure you want to delete this "+attrs.confirmationNeeded+"?";
				element.bind('click', function() {
					if ( window.confirm(msg) ) {
						return true;
					} else {
						return false;
					}
				});
			}
		}
	}
);

/***** Providers *****/
module.factory(
	"QuestionResource",
	function ($resource)
	{
		var ret = $resource(
			'/api/courses/:courseId/questions/:questionId',
			{questionId: '@id'},
			{
				'getAnswered': {url: '/api/courses/:id/questions/:questionId/answers/count'}
			}
		);
		ret.MODEL = "PostsForQuestions";
		return ret;
	}
);

module.factory(
	"AttachmentResource",
	function ($resource)
	{
		var ret = $resource(
			'/api/attachment/post/:postId/:fileId',
			{postId: '@post_id', fileId: '@file_id'}
		);
		ret.MODEL = "FilesForPosts";
		return ret;
	}
);

/***** Services *****/
module.service('attachService', function(FileUploader, $location, Toaster) {
	var filename = '';
	var alias = '';
	
	var getUploader = function() {
		var uploader = new FileUploader({
			url: '/api/attachment',
			queueLimit: 1,
			autoUpload: true
		});

		filename = '';
		alias = '';

		uploader.onCompleteItem = onComplete();
		uploader.onErrorItem = onError();

		uploader.filters.push({
			name: 'pdfFilter',
			fn: function(item, options) {
				var type = '|' + item.type.slice(item.type.lastIndexOf('/') + 1) + '|';
				return '|pdf|'.indexOf(type) !== -1;
			}
		});

		return uploader;
	}

	var onComplete = function() {
		return function(fileItem, response, status, headers) {
			if (response) {
				filename = response['name'];
				alias = fileItem.file.name;	
			}	
		};
	}

	var onError = function() {
		return function(fileItem, response, status, headers) {
			Toaster.reqerror("Attachment Fail", status);
		};
	}

	var resetName = function() {
		return function() {
			filename = '';
			alias = '';
		}
	}

	var getName = function() {
		return filename;
	}

	var getAlias = function() {
		return alias;
	}	

	return {
		getUploader: getUploader,
		getName: getName,
		getAlias: getAlias,
		resetName: resetName
	};
});

/***** Filters *****/
module.filter("notScoredEnd", function () {
	return function (array, key) {
		if (!angular.isArray(array)) return;
		var scored = array.filter(function(item) {
			return item.scores[key]
		});
		var not_scored = array.filter(function(item) {
			return !item.scores[key]
		});
		return scored.concat(not_scored);
	}
});

/***** Controllers *****/
module.controller("QuestionViewController",
	function($scope, $log, $routeParams, AnswerResource, Authorize, QuestionResource, QuestionCommentResource,
			 AttachmentResource, CoursesCriteriaResource, JudgementResource, CourseResource, required_rounds, Session, Toaster)
	{
		$scope.courseId = $routeParams['courseId'];
		var questionId = $scope.questionId = $routeParams['questionId'];
		Session.getUser().then(function(user) {
		    $scope.loggedInUserId = user.id;
		});
		Authorize.can(Authorize.MANAGE, QuestionResource.MODEL).then(function(result) {
		    $scope.canManagePosts = result;
		});
		$scope.question = {};
		QuestionResource.get({'courseId': $scope.courseId,
			'questionId': questionId}).$promise.then(
				function (ret)
				{
					ret.question.answer_start = new Date(ret.question.answer_start);
					ret.question.answer_end = new Date(ret.question.answer_end);
					ret.question.judge_start = new Date(ret.question.judge_start);
					ret.question.judge_end = new Date(ret.question.judge_end);
					$scope.question = ret.question;

					$scope.sortby = '0';
					$scope.order = 'answer.post.created';
					$scope.answers = ret.question.answers;
					$scope.reverse = true;
					// only sort by scores if scores are available
					if ($scope.answers.length > 0) {
						var answer = $scope.answers[0];
						if (answer['scores'].length > 0) {
							$scope.order = 'scores.'+$scope.sortby+'.score';
						}
					}

					$scope.readDate = Date.parse(ret.question.post.created);

					JudgementResource.count({'courseId': $scope.courseId, 'questionId': questionId,
								'userId': $scope.loggedInUserId}).$promise.then(
						function (ret) {
							$scope.judged_req_met = $scope.canManagePosts || ret.count > $scope.question.num_judgement_req;
						},
						function (ret) {
							Toaster.reqerror("Unable to retrieve the evaluation count", ret);
						}
					);
					AttachmentResource.get({'postId': ret.question.post.id}).$promise.then(
						function (ret) {
							$scope.question.uploadedFile = ret.file;
						},
						function (ret) {
							Toaster.reqerror("Unable to retrieve attachment", ret);
						}
					);
				},
				function (ret)
				{
					Toaster.reqerror("Unable to retrieve question "
						+ questionId, ret);
				}
			);
		QuestionCommentResource.get({'courseId': $scope.courseId,
			'questionId': questionId}).$promise.then(
				function (ret)
				{
					$scope.comments = ret.objects;
				},
				function (ret)
				{
					Toaster.reqerror("Unable to retrieve comments.", ret);
				}
			);
		CoursesCriteriaResource.get({'courseId': $scope.courseId}).$promise.then(
			function (ret) {
				$scope.criteria = ret.objects;
			},
			function (ret) {
				Toaster.reqerror("Unable to retrieve the criteria.", ret);
			}
		);
		QuestionResource.getAnswered({'id': $scope.courseId,
			'questionId': questionId}).$promise.then(
				function (ret) {
					$scope.answered = ret.answered > 0;
				},
				function (ret) {
					Toaster.reqerror("Unable to retrieve your answers", ret);
				}
		);

		CourseResource.getInstructorsLabels({'id': $scope.courseId}).$promise.then(
			function (ret) {
				$scope.instructors = ret.instructors;
			},
			function (ret) {
				Toaster.reqerror("Unable to retrieve instructors", ret);
			}
		);
		// enable tabs
		$('#answers a').click(function (e) {
			e.preventDefault();
			$(this).tab('show');
		});
		$('#comments a').click(function (e) {
			e.preventDefault();
			$(this).tab('show');
		});
	}
);
module.controller("QuestionCreateController",
	function($scope, $log, $location, $routeParams, QuestionResource, required_rounds, Toaster, attachService)
	{
		var courseId = $routeParams['courseId'];
		$scope.question = {};
		$scope.question.can_reply = true; //want default to encourage discussion
		$scope.uploader = attachService.getUploader();
		$scope.resetName = attachService.resetName();
		$scope.recommended_eval = Math.floor(required_rounds / 2);
		// default the setting to the recommended # of evaluations
		$scope.question.num_judgement_req = $scope.recommended_eval; 
		$scope.questionSubmit = function () {
			$scope.submitted = true;
			// answer end datetime has to be after answer start datetime
			if ($scope.question.answer_start >= $scope.question.answer_end) {
				Toaster.error('The answer period is invalid');
				$scope.submitted = false;
				return;
			} else if ($scope.question.availableCheck && !($scope.question.answer_end <= $scope.question.judge_start && $scope.question.judge_start <= $scope.question.judge_end)) {
				Toaster.error('The answer and/or judging period is invalid.');
				$scope.submitted = false;
				return;
			}
			// if option is not checked; make sure no judge dates are saved.
			if (!$scope.question.availableCheck) {
				$scope.question.judge_start = null;
				$scope.question.judge_end = null;
			}
			$scope.question.name = attachService.getName();
			$scope.question.alias = attachService.getAlias();
			QuestionResource.save({'courseId': courseId}, $scope.question).
				$promise.then(
					function (ret)
					{
						$scope.submitted = false;
						Toaster.success("New Question Created!",
							'"' + ret.title + '" should now be listed.');
						$location.path('/course/' + courseId);
					},
					function (ret)
					{
						$scope.submitted = false;
						Toaster.reqerror("Unable to create new question.", ret);
					}
				);
		};
	}
);

module.controller("QuestionEditController",
	function($scope, $log, $location, $routeParams, QuestionResource, AttachmentResource, required_rounds, Toaster, attachService)
	{
		var courseId = $routeParams['courseId'];
		$scope.questionId = $routeParams['questionId'];
		$scope.uploader = attachService.getUploader();
		$scope.resetName = attachService.resetName();
		$scope.recommended_eval = Math.floor(required_rounds / 2);
		$scope.question = {};

		$scope.deleteFile = function(post_id, file_id) {
			AttachmentResource.delete({'postId': post_id, 'fileId': file_id}).$promise.then(
				function (ret) {
					Toaster.success('Attachment deleted successfully');
					$scope.question.uploadedFile = false;
				},
				function (ret) {
					Toaster.reqerror('Attachment deletion failed', ret);
				}
			);
		}

		QuestionResource.get({'courseId': courseId, 'questionId': $scope.questionId}).$promise.then(
			function (ret) {
				ret.question.answer_start = new Date(ret.question.answer_start);
				ret.question.answer_end = new Date(ret.question.answer_end);	
				if (ret.question.judge_start && ret.question.judge_end) {
					ret.question.availableCheck = true;
					ret.question.judge_start = new Date(ret.question.judge_start);
					ret.question.judge_end = new Date(ret.question.judge_end);
				}
				$scope.question = ret.question;
				AttachmentResource.get({'postId': ret.question.post.id}).$promise.then(
					function (ret) {
						$scope.question.uploadedFile = ret.file;
						
					},
					function (ret) {
						Toaster.reqerror("Unable to retrieve attachment", ret);
					}
				);
			},
			function (ret) {
				Toaster.reqerror("Unable to retrieve question "+$scope.questionId, ret);
			}
		);
		$scope.questionSubmit = function () {
			$scope.submitted = true;
			// answer end datetime has to be after answer start datetime
			if ($scope.question.answer_start > $scope.question.answer_end) {
				Toaster.error('The answer period is invalid');
				$scope.submitted = false;
				return;
			} else if ($scope.question.availableCheck && !($scope.question.answer_end <= $scope.question.judge_start
				&& $scope.question.judge_start < $scope.question.judge_end)) {
				Toaster.error('The answer and/or judging period is invalid.');
				$scope.submitted = false;
				return;
			}
			$scope.question.name = attachService.getName();
			$scope.question.alias = attachService.getAlias();
			// if option is not checked; make sure no judge dates are saved.
			if (!$scope.question.availableCheck) {
				$scope.question.judge_start = null;
				$scope.question.judge_end = null;
			}
			QuestionResource.save({'courseId': courseId}, $scope.question).$promise.then(
				function() {
					$scope.submitted = false;
					Toaster.success("Question Updated!");
					$location.path('/course/' + courseId);
				 },
				function(ret) { 
					$scope.submitted = false;
					Toaster.reqerror("Question Save Failed.", ret);
				}
			);
		};
	}
);

module.controller("QuestionDeleteController",
	function($scope, $log, $location, $routeParams, QuestionResource, Toaster)
	{
		var courseId = $routeParams['courseId'];
		var questionId = $routeParams['questionId'];
		QuestionResource.delete({'courseId': courseId, 'questionId': questionId}).$promise.then(
			function (ret) {
				Toaster.success("Successfully deleted question " + ret.id);	
				$location.path('/course/'+courseId);
			},
			function (ret) {
				Toaster.reqerror("Question deletion failed", ret);
				$location.path('/course/'+courseId);
			}
		);
	}
);

// End anonymous function
})();
