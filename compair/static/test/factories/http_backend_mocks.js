var objectAssign = require('object-assign');

var storageFixtures = {};

module.exports.build = function(browser) {
    if (process.env.DISABLE_MOCK == 'true') {
        return;
    }

    storageFixtures = {
        'admin/default_fixture': module.exports.buildStorageFixture(require('../fixtures/admin/default_fixture.js')),
        'admin/cas_fixture': module.exports.buildStorageFixture(require('../fixtures/admin/cas_fixture.js')),

        'instructor/default_fixture': module.exports.buildStorageFixture(require('../fixtures/instructor/default_fixture.js')),
        'instructor/cas_fixture': module.exports.buildStorageFixture(require('../fixtures/instructor/cas_fixture.js')),

        'student/default_fixture': module.exports.buildStorageFixture(require('../fixtures/student/default_fixture.js')),
        'student/cas_fixture': module.exports.buildStorageFixture(require('../fixtures/student/cas_fixture.js'))
    };

    browser.addMockModule('httpBackEndMock', module.exports.httpbackendMock, storageFixtures);
};

module.exports.setStorageFixture = function(browser, fixtureName) {
    return browser.executeScript(function(fixtureName) {
        var injector = angular.element(document).injector();
        var storageFixture = injector.get('storageFixture');
        storageFixture.setCurrentFixture(fixtureName);
    }, fixtureName);
};

module.exports.getLoginDetails = function(fixtureName) {
    return storageFixtures[fixtureName].loginDetails;
};

module.exports.buildStorageFixture = function(storageFixture) {
    var storage = {
        authenticated: false,
        default_criterion: {
            "id": "1abcABC123-abcABC123_Z",
            "user_id": "1abcABC123-abcABC123_Z",
            "name": "Which is better?",
            "description": "<p>Choose the response that you think is the better of the two.</p>",
            "default": true,
            "public": true,
            "compared": false,
            "created": "Sun, 11 Jan 2015 07:45:31 -0000",
            "modified": "Sun, 11 Jan 2015 07:45:31 -0000"
        },
        loginDetails: { id: null, username: null, password: null },
        session: {},
        users: {},
        courses: {},
        // userId -> [ { courseId, courseRole, groupName} ]
        user_courses: {},
        assignments: {},
        // courseId -> [assignmentId]
        course_assignments: {},
        answers: {},
        // courseId -> [answerId]
        course_answers: {},
        // assignmentId -> [answerId]
        assignment_answers: {},
        comparison_examples: [],
        // assignmentId -> [comparisonExampleId]
        assignment_comparison_examples: {},
        criteria: {},
        groups: [],
        lti_consumers: {},
        user_search_results: {
            "objects": [],
            "page":1,
            "pages":1,
            "per_page":20,
            "total":0
        }
    };

    // add fixture data to storage
    if (storageFixture) {
        storage = objectAssign({}, storage, storageFixture);
    }

    // add default criterion is storage criterion is empty
    if (storage.criteria.length == 0) {
        storage.criteria[storage.default_criterion.id] = storage.default_criterion;
    }

    return storage;
};

module.exports.httpbackendMock = function(storageFixtures) {
    angular.module('MyApp.services.mock', []);
    angular.module('httpBackEndMock', ['ngMockE2E'])
    .factory('storageFixture', function() {
        var fixtures = storageFixtures;
        var currentFixture = fixtures['admin/default_fixture'];

        return {
            setCurrentFixture: function(fixtureName) {
                currentFixture = angular.copy(fixtures[fixtureName]);
            },
            storage: function(){
                return currentFixture;
            }
        }
    })
    .run(function($httpBackend, storageFixture) {
        var generateNewId = function(num) {
            var id = ""+num;
            return id + "zabcABC123-abcABC123_Z".substr(id.length);
        };

        // Start Session

        // get current session
        $httpBackend.whenGET('/api/session').respond(function(method, url, data, headers) {
            return storageFixture.storage().authenticated ? [200, storageFixture.storage().session, {}] : [401, {}, {}];
        });

        // get current session permissions
        $httpBackend.whenGET('/api/session/permission').respond(function(method, url, data, headers) {
            return storageFixture.storage().authenticated ? [200, storageFixture.storage().session.permissions, {}] : [401, {}, {}];
        });

        // login
        $httpBackend.whenPOST('/api/login').respond(function(method, url, data, headers) {
            storageFixture.storage().authenticated = true;
            var currentUser = angular.copy(storageFixture.storage().users[storageFixture.storage().loginDetails.id]);
            return [200, currentUser, {}];
        });

        // logout
        $httpBackend.whenDELETE('/api/logout').respond(function(method, url, data, headers) {
            storageFixture.storage().authenticated = false;
            return [202, {}, {}];
        });
        // End Session



        // Start User

        // get user by id
        $httpBackend.whenGET(/\/api\/users\/[A-Za-z0-9_-]{22}$/).respond(function(method, url, data, headers) {
            var id = url.split('/').pop();
            return [200, storageFixture.storage().users[id], {}];
        });

        // create user
        $httpBackend.whenPOST('/api/users').respond(function(method, url, data, headers) {
            data = JSON.parse(data);
            var newUser = {
                "id": generateNewId(_.keys(storageFixture.storage().users).length + 1),
                "username": null,
                "displayname": null,
                "email": null,
                "firstname": null,
                "fullname": null,
                "lastname": null,
                "student_number": null,
                "avatar": "63a9f0ea7bb98050796b649e85481845",
                "created": "Sat, 27 Dec 2014 20:13:11 -0000",
                "modified": "Sun, 11 Jan 2015 02:55:59 -0000",
                "last_online": "Sun, 11 Jan 2015 02:55:59 -0000",
                "system_role": null,
                "uses_compair_login": true
            };

            newUser = angular.merge({}, newUser, data);
            newUser.fullname = newUser.firstname + " " + newUser.lastname;

            storageFixture.storage().users[newUser.id] = newUser;

            var returnData = {
                id: newUser.id,
                displayname: newUser.displayname,
                avatar: newUser.avatar,
                created: newUser.created,
                last_online: newUser.last_online
            }

            return [200, returnData, {}]
        });

        // search for user by text
        $httpBackend.whenGET(/\/api\/users\?.*search\=.*$/).respond(function(method, url, data, headers) {
            return [200, storageFixture.storage().user_search_results, {}];
        });

        // get users
        $httpBackend.whenGET(/\/api\/users\?.*$/).respond(function(method, url, data, headers) {
            var users = _.values(storageFixture.storage().users);

            users = _.sortBy(users, function(user) {
                return user.firstname;
            });

            return [200, {
                "objects": users,
                "page": 1,
                "pages": 1,
                "total": users.length,
                "per_page": 20
            }, {}]
        });

        // get edit button availability
        $httpBackend.whenGET(/\/api\/users\/[A-Za-z0-9_-]{22}\/edit$/).respond(function(method, url, data, headers) {
            var editId = url.replace('/edit', '').split('/').pop();
            var currentUser = angular.copy(storageFixture.storage().users[storageFixture.storage().loginDetails.id]);

            var available = false;
            // admins can edit anyone
            if (currentUser.system_role == "System Administrator") {
                available = true;

            // anyone can edit themselves
            } else if (currentUser.id == editId) {
                available = true;

            // teachers can edit users in their class
            } else if (currentUser.system_role == "Instructor") {

                // if both current user and edit user have courses
                if (storageFixture.storage().user_courses[currentUser.id] && storageFixture.storage().user_courses[editId]) {

                    // check courses current user is instructor of
                    angular.forEach(storageFixture.storage().user_courses[currentUser.id], function(course_and_role) {
                        if (course_and_role.courseRole == "Instructor") {
                            var courseId = course_and_role.courseId;

                            // check if edit user in course
                            angular.forEach(storageFixture.storage().user_courses[currentUser.id], function(course_and_role) {
                                // if edit user in course
                                if (course_and_role.courseId == courseId) {
                                    available = true;
                                }
                            });
                        }
                    });
                }
            }

            return [200, { "available": available }, {}];
        });

        // update user details
        $httpBackend.whenPOST(/\/api\/users\/[A-Za-z0-9_-]{22}$/).respond(function(method, url, data, headers) {
            var data = JSON.parse(data);
            var editId = url.split('/').pop();
            storageFixture.storage().users[editId] = data;
            return [200, data, {}];
        });

        // update user password
        $httpBackend.whenPOST(/\/api\/users\/[A-Za-z0-9_-]{22}\/password$/).respond(function(method, url, data, headers) {
            var editId = url.split('/')[3];
            //no need to actually change the password
            return [200, storageFixture.storage().users[editId], {}];
        });


        // End User


        // Start Courses

        // get current user courses (fake search)
        $httpBackend.whenGET(/\/api\/users\/courses\?.*search=CHEM.*$/).respond(function(method, url, data, headers) {
            var courses = [];

            angular.forEach(_.values(storageFixture.storage().courses), function(course) {
                if (course.name.indexOf("CHEM") !== -1) {
                    courses.push(course)
                }
            });
            courses = _.sortBy(courses, function(course) {
                return course.name;
            });

            return [200, {
                "objects": courses,
                "page": 1,
                "pages": 1,
                "total": courses.length,
                "per_page": 20
            }, {}]
        });

        // get current user courses
        $httpBackend.whenGET(/\/api\/users\/courses\?.*$/).respond(function(method, url, data, headers) {
            var courses = _.values(storageFixture.storage().courses);

            courses = _.sortBy(courses, function(course) {
                return course.name;
            });
            return [200, {
                "objects": courses,
                "page": 1,
                "pages": 1,
                "total": _.keys(storageFixture.storage().courses).length,
                "per_page": 20
            }, {}]
        });

        // get user courses (fake search)
        $httpBackend.whenGET(/\/api\/users\/[A-Za-z0-9_-]{22}\/courses\?.*search=CHEM.*$/).respond(function(method, url, data, headers) {
            var userId = url.split('/')[3];
            var courses = [];

            if (storageFixture.storage().user_courses[userId]) {
                angular.forEach(storageFixture.storage().user_courses[userId], function(userCourseInfo) {

                    var course_copy = angular.copy(storageFixture.storage().courses[userCourseInfo.courseId]);
                    course_copy.course_role = userCourseInfo.courseRole;
                    course_copy.group_name = userCourseInfo.groupName;
                    if (course_copy.name.indexOf("CHEM") !== -1) {
                        courses.push(course_copy)
                    }
                });
            }

            courses = _.sortBy(courses, function(course) {
                return course.name;
            });

            return [200, {
                "objects": courses,
                "page": 1,
                "pages": 1,
                "total": courses.length,
                "per_page": 20
            }, {}]
        });

        // get user courses
        $httpBackend.whenGET(/\/api\/users\/[A-Za-z0-9_-]{22}\/courses\?.*$/).respond(function(method, url, data, headers) {
            var userId = url.split('/')[3];
            var courses = [];

            if (storageFixture.storage().user_courses[userId]) {
                angular.forEach(storageFixture.storage().user_courses[userId], function(userCourseInfo) {

                    var course_copy = angular.copy(storageFixture.storage().courses[userCourseInfo.courseId]);
                    course_copy.course_role = userCourseInfo.courseRole;
                    course_copy.group_name = userCourseInfo.groupName;
                    courses.push(course_copy)
                });
            }

            courses = _.sortBy(courses, function(course) {
                return course.name;
            });

            return [200, {
                "objects": courses,
                "page": 1,
                "pages": 1,
                "total": courses.length,
                "per_page": 20
            }, {}]
        });

        // get current user courses status
        $httpBackend.whenGET(/\/api\/users\/courses\/status\?.*$/).respond(function(method, url, data, headers) {
            var courses = _.values(storageFixture.storage().courses);

            statuses = {}

            angular.forEach(courses, function(coourse) {
                statuses[coourse.id] = {
                    "incomplete_assignments": 0
                }
            });

            return [200, { "statuses": statuses }, {}]
        });

        // create new course
        $httpBackend.whenPOST('/api/courses').respond(function(method, url, data, headers) {
            data = JSON.parse(data);

            var newCourse = {
                "id": generateNewId(_.keys(storageFixture.storage().courses).length + 1),
                "name": data.name,
                "year": data.year,
                "term": data.term,
                "description": data.description,
                "available": true,
                "start_date": data.start_date,
                "end_date": data.end_date,
                "assignment_count": 0,
                "student_assignment_count": 0,
                "student_count": 0,
                "modified": "Sun, 11 Jan 2015 08:44:46 -0000",
                "created": "Sun, 11 Jan 2015 08:44:46 -0000"
            }

            storageFixture.storage().courses[newCourse.id] = newCourse;

            return [200, newCourse, {}];
        });

        // get course by id
        $httpBackend.whenGET(/\/api\/courses\/[A-Za-z0-9_-]{22}$/).respond(function(method, url, data, headers) {
            var id = url.split('/').pop();
            return [200, storageFixture.storage().courses[id], {}];
        });

        // edit course by id
        $httpBackend.whenPOST(/\/api\/courses\/[A-Za-z0-9_-]{22}$/).respond(function(method, url, data, headers) {
            data = JSON.parse(data);

            var id = url.split('/').pop();
            storageFixture.storage().courses[id] = angular.merge(storageFixture.storage().courses[id], data);

            return [200, storageFixture.storage().courses[id], {}];
        });


        // get course users by course id
        $httpBackend.whenGET(/\/api\/courses\/[A-Za-z0-9_-]{22}\/users$/).respond(function(method, url, data, headers){
            var courseId = url.replace('/users', '').split('/').pop();

            var userList = [];

            angular.forEach(storageFixture.storage().users, function(user) {
                if (storageFixture.storage().user_courses[user.id]) {
                    angular.forEach(storageFixture.storage().user_courses[user.id], function(userCoruseInfo) {

                        if (courseId == userCoruseInfo.courseId) {
                            var user_copy = angular.copy(user);
                            user_copy.course_role = userCoruseInfo.courseRole;
                            user_copy.group_name = userCoruseInfo.groupName;

                            userList.push(user_copy);
                        }
                    });
                }
            });
            userList = _.sortBy(userList, function(user) {
                return user.displayname;
            });

            return [200, { 'objects': userList }, {}];
        });

        // get course students by course id
        $httpBackend.whenGET(/\/api\/courses\/[A-Za-z0-9_-]{22}\/users\/students$/).respond(function(method, url, data, headers){
            var courseId = url.split('/')[3];
            var userList = [];

            angular.forEach(storageFixture.storage().users, function(user) {
                if (storageFixture.storage().user_courses[user.id]) {
                    angular.forEach(storageFixture.storage().user_courses[user.id], function(userCoruseInfo) {
                        if (courseId == userCoruseInfo.courseId && userCoruseInfo.courseRole == "Student") {
                            userList.push({
                                course_role: userCoruseInfo.courseRole,
                                id: user.id,
                                group_name: userCoruseInfo.groupName
                            });
                        }
                    });
                }
            });

            return [200, { 'objects': userList }, {}];
        });

        // get course instructor labels
        $httpBackend.whenGET(/\/api\/courses\/[A-Za-z0-9_-]{22}\/users\/instructors\/labels$/).respond(function(method, url, data, headers){
            var courseId = url.replace('/users', '').split('/').pop();

            var userList = {};

            angular.forEach(storageFixture.storage().users, function(user) {
                if (storageFixture.storage().user_courses[user.id]) {
                    angular.forEach(storageFixture.storage().user_courses[user.id], function(userCoruseInfo) {
                        if (courseId == userCoruseInfo.courseId) {
                            if (userCoruseInfo.courseRole == "Instructor") {
                                userList[user.id] = "Instructor";
                            } else if (userCoruseInfo.courseRole == "Teaching Assistant") {
                                userList[user.id] = "Teaching Assistant";
                            }
                        }
                    });
                }
            });

            return [200, { 'objects': userList }, {}];
        });

        // get course groups by course id
        $httpBackend.whenGET(/\/api\/courses\/[A-Za-z0-9_-]{22}\/groups$/).respond(function(method, url, data, headers) {
            return [200, { 'objects': storageFixture.storage().groups }, {}];
        });

        // update user role in course
        $httpBackend.whenPOST(/\/api\/courses\/[A-Za-z0-9_-]{22}\/users\/[A-Za-z0-9_-]{22}$/).respond(function(method, url, data, headers) {
            data = JSON.parse(data);
            var courseId = url.split('/')[3];
            var userId = url.split('/').pop();
            var courseRole = data.course_role;

            var found = false;

            angular.forEach(storageFixture.storage().user_courses[userId], function(userCoruseInfo) {
                if (userCoruseInfo.courseId == courseId) {
                    found = true;
                    userCoruseInfo.courseRole = courseRole;
                }
            });

            if (!found) {
                storageFixture.storage().user_courses[userId] = [
                    { courseId: courseId, courseRole: courseRole, groupName: null }
                ];
            }

            var returnData = {
                course_role: courseRole,
                fullname: storageFixture.storage().users[userId].fullname,
                user_id: userId
            }

            return [200, returnData, {}];
        });

        // drop user from course
        $httpBackend.whenDELETE(/\/api\/courses\/[A-Za-z0-9_-]{22}\/users\/[A-Za-z0-9_-]{22}$/).respond(function(method, url, data, headers) {
            var courseId = url.split('/')[3];
            var userId = url.split('/').pop();

            if (storageFixture.storage().user_courses[userId]) {
                angular.forEach(storageFixture.storage().user_courses[userId], function(userCourseInfo, index) {
                    if (userCourseInfo.courseId == courseId) {
                        storageFixture.storage().user_courses[userId].splice(index, 1);
                    }
                });
            };

            var returnData = {
                fullname: storageFixture.storage().users[userId].fullname,
                user_id: userId,
                course_role: "Dropped"
            }

            return [200, returnData, {}];
        });

        // update user group in course
        $httpBackend.whenPOST(/\/api\/courses\/[A-Za-z0-9_-]{22}\/users\/[A-Za-z0-9_-]{22}\/groups\/.+$/).respond(function(method, url, data, headers) {
            var courseId = url.split('/')[3];
            var userId = url.split('/')[5];
            var groupName = url.split('/').pop();

            angular.forEach(storageFixture.storage().user_courses[userId], function(userCoruseInfo) {
                if (userCoruseInfo.courseId == courseId) {
                    userCoruseInfo.groupName = groupName;
                }
            });

            var returnData = {
                "group_name": groupName
            };

            return [200, returnData, {}];
        });

        // remove user from group in course
        $httpBackend.whenDELETE(/\/api\/courses\/[A-Za-z0-9_-]{22}\/users\/[A-Za-z0-9_-]{22}\/groups$/).respond(function(method, url, data, headers) {
            var courseId = url.split('/')[3];
            var userId = url.split('/')[5];

            angular.forEach(storageFixture.storage().user_courses[userId], function(userCoruseInfo) {
                if (userCoruseInfo.courseId == courseId) {
                    userCoruseInfo.groupName = null;
                }
            });

            var returnData = {
                "course_id": courseId,
                "user_id": userId
            };

            return [200, returnData, {}];
        });

        // get all assignment status in course for current user
        $httpBackend.whenGET(/\/api\/courses\/[A-Za-z0-9_-]{22}\/assignments\/status$/).respond(function(method, url, data, headers){
            var courseId = url.split('/')[3];
            var currentUser = angular.copy(storageFixture.storage().users[storageFixture.storage().loginDetails.id]);

            statuses = {}

            // setup default data
            if (storageFixture.storage().course_assignments[courseId]) {
                angular.forEach(storageFixture.storage().course_assignments[courseId], function(assignmentId) {
                    statuses[assignmentId] = {
                        "answers": {
                            "answered": false,
                            "count": 0,
                            "draft_ids": [],
                            "has_draft": true
                        },
                        "comparisons": {
                            "available": true,
                            "count": 0,
                            "left": 3
                        }
                    }
                });
            }

            // get all answers in course
            if (storageFixture.storage().course_answers[courseId]) {
                angular.forEach(storageFixture.storage().course_answers[courseId], function(answerId) {
                    var answer = storageFixture.storage().answers[answerId];

                    // if answer is by current user, set answered to true for assignment
                    if (answer.user_id == currentUser.id) {
                        statuses[answer.assignment_id]['answers']['answered'] = true;
                        statuses[answer.assignment_id]['answers']['count']++;
                    }
                });
            }

            return [200, {"statuses": statuses}, {}];
        });

        // get current user's criteria
        $httpBackend.whenGET('/api/criteria').respond(function(method, url, data, headers) {
            return [200, { 'objects': storageFixture.storage().criteria }, {}];
        });

        // create new criterion
        $httpBackend.whenPOST('/api/criteria').respond(function(method, url, data, headers) {
            data = JSON.parse(data);

            var currentUser = angular.copy(storageFixture.storage().users[storageFixture.storage().loginDetails.id]);
            var newCriterion = {
                "id": generateNewId(_.keys(storageFixture.storage().criteria).length + 1),
                "user_id": currentUser.id,
                "name": data.name,
                "description": data.description,
                "default": data.default,
                "public": false,
                "compared": false,
                "created": "Mon, 18 Apr 2016 17:38:23 -0000",
                "modified": "Mon, 18 Apr 2016 17:38:23 -0000"
            };

            storageFixture.storage().criteria[newCriterion.id] = newCriterion;

            return [200, newCriterion, {}];
        });

        // update criterion by id
        $httpBackend.whenPOST(/\/api\/criteria\/[A-Za-z0-9_-]{22}$/).respond(function(method, url, data, headers) {
            data = JSON.parse(data);
            var id = url.split('/').pop();

            storageFixture.storage().criteria[id] = angular.merge(storageFixture.storage().criteria[id], data);

            return [200, storageFixture.storage().criteria[id], {}];
        });

        // End Courses



        // Start Assignments

        $httpBackend.whenGET(/\/api\/courses\/[A-Za-z0-9_-]{22}\/assignments$/).respond(function(method, url, data, headers) {
            var id = url.replace('/assignments', '').split('/').pop();

            var assignmentList = [];

            if (storageFixture.storage().course_assignments[id]) {
                angular.forEach(storageFixture.storage().course_assignments[id], function(assignmentId) {
                    assignmentList.push(storageFixture.storage().assignments[assignmentId]);
                });
            }

            return [200, { 'objects': assignmentList }, {}]
        });

        $httpBackend.whenPOST(/\/api\/courses\/[A-Za-z0-9_-]{22}\/assignments$/).respond(function(method, url, data, headers) {
            data = JSON.parse(data);

            var courseId = url.replace('/assignments', '').split('/').pop();
            var currentUser = angular.copy(storageFixture.storage().users[storageFixture.storage().loginDetails.id]);

            var newAssignment = {
                "id": null,
                "name": null,
                "number_of_comparisons": null,
                "total_comparisons_required": null,
                "total_steps_required": null,
                "answer_end": null,
                "answer_start": null,
                "students_can_reply": null,
                "compare_end": null,
                "compare_start": null,
                "after_comparing": false,
                "answer_period": false,
                "answer_count": 0,
                "top_answer_count": 0,
                "available": false,
                "comment_count": 0,
                "criteria": [],
                "evaluation_count": 0,
                "compared": false,
                "compare_period": false,
                "modified": "Wed, 20 Apr 2016 21:50:31 -0000",
                "enable_self_evaluation": false,
                "content": null,
                "file": [],
                "user": angular.copy(currentUser),
                "pairing_algorithm": null,
                "educators_can_compare": null,
                "rank_display_limit": null
            }
            newAssignment = angular.merge(newAssignment, data);
            newAssignment.id = generateNewId(_.keys(storageFixture.storage().assignments).length + 1);
            newAssignment.total_comparisons_required = newAssignment.number_of_comparisons;
            newAssignment.total_steps_required = newAssignment.total_comparisons_required +
                (newAssignment.enable_self_evaluation ? 1 : 0);

            storageFixture.storage().assignments[newAssignment.id] = newAssignment;

            if (!storageFixture.storage().course_assignments[courseId]) {
                storageFixture.storage().course_assignments[courseId] = [];
            }
            storageFixture.storage().course_assignments[courseId].push(newAssignment.id)

            return [200, newAssignment, {}]
        });

        $httpBackend.whenPOST(/\/api\/courses\/[A-Za-z0-9_-]{22}\/assignments\/[A-Za-z0-9_-]{22}$/).respond(function(method, url, data, headers) {
            data = JSON.parse(data);

            var courseId = url.split('/')[3];
            var assignmentId = url.split('/')[5];

            storageFixture.storage().assignments[assignmentId] = angular.merge(storageFixture.storage().assignments[assignmentId], data);

            return [200, storageFixture.storage().assignments[assignmentId], {}]
        });

        $httpBackend.whenPOST(/\/api\/courses\/[A-Za-z0-9_-]{22}\/assignments\/[A-Za-z0-9_-]{22}\/criteria\/[A-Za-z0-9_-]{22}$/).respond(function(method, url, data, headers) {
            return [200, {
                'active': true,
                'criterion': storageFixture.storage().default_criterion
            }, {}];
        });

        // get assignment by course id and assignment id
        $httpBackend.whenGET(/\/api\/courses\/[A-Za-z0-9_-]{22}\/assignments\/[A-Za-z0-9_-]{22}$/).respond(function(method, url, data, headers) {
            var courseId = url.split('/')[3];
            var assignmentId = url.split('/')[5];

            return [200, storageFixture.storage().assignments[assignmentId], {}]
        });

        // get assignment comments
        $httpBackend.whenGET(/\/api\/courses\/[A-Za-z0-9_-]{22}\/assignments\/[A-Za-z0-9_-]{22}\/comments$/).respond(function(method, url, data, headers) {
            var courseId = url.split('/')[3];
            var assignmentId = url.split('/')[5];

            return [200, {objects: []}, {}]
        });

        // get assignment status for current user
        $httpBackend.whenGET(/\/api\/courses\/[A-Za-z0-9_-]{22}\/assignments\/[A-Za-z0-9_-]{22}\/status$/).respond(function(method, url, data, headers){
            var courseId = url.split('/')[3];
            var currentUser = angular.copy(storageFixture.storage().users[storageFixture.storage().loginDetails.id]);
            var assignmentId = url.split('/')[5];

            // setup default data
            var status = {
                "answers": {
                    "answered": false,
                    "count": 0,
                    "draft_ids": [],
                    "has_draft": true
                },
                "comparisons": {
                    "available": true,
                    "count": 0,
                    "left": 3
                }
            }

            // get all answers in course
            if (storageFixture.storage().course_answers[courseId]) {
                angular.forEach(storageFixture.storage().course_answers[courseId], function(answerId) {
                    var answer = storageFixture.storage().answers[answerId];

                    // if answer is by current user for assignment, set answered to true for assignment
                    if (answer.assignment_id == assignmentId && answer.user_id == currentUser.id) {
                        status.answers.answered = true;
                        status.answers.count += 1;
                    }
                });
            }

            return [200, {"status": status }, {}];
        });

        // get assignment answer comments
        $httpBackend.whenGET(/\/api\/courses\/[A-Za-z0-9_-]{22}\/assignments\/[A-Za-z0-9_-]{22}\/answer_comments\?.*$/).respond(function(method, url, data, headers) {
            var courseId = url.split('/')[3];
            var assignmentId = url.split('/')[5];

            return [200, [], {}]
        });

        // get assignment answers
        $httpBackend.whenGET(/\/api\/courses\/[A-Za-z0-9_-]{22}\/assignments\/[A-Za-z0-9_-]{22}\/answers\?.*$/).respond(function(method, url, data, headers) {
            var courseId = url.split('/')[3];
            var assignmentId = url.split('/')[5];

            return [200, {
                objects: [],
                page: 1,
                pages: 1,
                per_page: 20,
                total: 0
            }, {}]
        });

        // get assignment comparison examples
        $httpBackend.whenGET(/\/api\/courses\/[A-Za-z0-9_-]{22}\/assignments\/[A-Za-z0-9_-]{22}\/comparisons\/examples$/).respond(function(method, url, data, headers) {
            var courseId = url.split('/')[3];
            var assignmentId = url.split('/')[5];

            var exampleList = [];

            if (storageFixture.storage().assignment_comparison_examples[assignmentId]) {
                angular.forEach(storageFixture.storage().assignment_comparison_examples[assignmentId], function(exampleId) {
                    exampleList.push(storageFixture.storage().comparison_examples[exampleId]);
                });
            }

            return [200, { 'objects': exampleList }, {}];
        });

        // create new comparison examples
        $httpBackend.whenPOST(/\/api\/courses\/[A-Za-z0-9_-]{22}\/assignments\/[A-Za-z0-9_-]{22}\/comparisons\/examples$/).respond(function(method, url, data, headers) {
            var courseId = url.split('/')[3];
            var assignmentId = url.split('/')[5];
            data = JSON.parse(data);

            var newComparisonExample = {
                "id": generateNewId(_.keys(storageFixture.storage().assignments).length + 1),
                "answer1_id": data.answer1.id,
                "answer1": data.answer1,
                "answer2_id": data.answer2.id,
                "answer2": data.answer2,
                "assignment_id": assignmentId,
                "course_id": courseId,
                "modified": "Sun, 11 Jan 2015 08:44:46 -0000",
                "created": "Sun, 11 Jan 2015 08:44:46 -0000"
            }

            storageFixture.storage().comparison_examples.push(newComparisonExample);
            storageFixture.storage().assignment_comparison_examples[assignmentId].push(newComparisonExample.id);

            return [200, newComparisonExample, {}];
        });

        // edit assignment comparison examples
        $httpBackend.whenPOST(/\/api\/courses\/[A-Za-z0-9_-]{22}\/assignments\/[A-Za-z0-9_-]{22}\/comparisons\/examples\/[A-Za-z0-9_-]{22}$/).respond(function(method, url, data, headers) {
            var courseId = url.split('/')[3];
            var assignmentId = url.split('/')[5];

            data = JSON.parse(data);

            var id = url.split('/').pop();
            storageFixture.storage().comparison_examples[id] = angular.merge(storageFixture.storage().comparison_examples[id], data);

            return [200, storageFixture.storage().courses[id], {}];
        });

        // delete assignment comparison examples
        $httpBackend.whenDELETE(/\/api\/courses\/[A-Za-z0-9_-]{22}\/assignments\/[A-Za-z0-9_-]{22}\/comparisons\/examples\/[A-Za-z0-9_-]{22}$/).respond(function(method, url, data, headers) {
            var courseId = url.split('/')[3];
            var assignmentId = url.split('/')[5];

            var id = url.split('/').pop();
            storageFixture.storage().comparison_examples[id] = null;

            // remove comparison example from assignment's data
            for(var i = storageFixture.storage().assignment_comparison_examples[assignmentId].length - 1; i >= 0; i--) {
                if(storageFixture.storage().assignment_comparison_examples[assignmentId][i] === id) {
                    array.splice(i, 1);
                }
            }

            return [200, {}, {}];
        });

        // handle lti status
        $httpBackend.whenGET(/\/api\/lti\/status$/).respond(function(method, url, data, headers) {
            return [200, {'valid':false}, {}];
        });

        // End Assignments


        // LTI Consumers

        // get lti consumers
        $httpBackend.whenGET(/\/api\/lti\/consumers\?.*$/).respond(function(method, url, data, headers) {
            var consumers = _.values(storageFixture.storage().lti_consumers);

            return [200, {
                "objects": consumers,
                "page": 1,
                "pages": 1,
                "total": consumers.length,
                "per_page": 20
            }, {}]
        });

        // create new lti consumer
        $httpBackend.whenPOST('/api/lti/consumers').respond(function(method, url, data, headers) {
            data = JSON.parse(data);

            var newConsumer = {
                "id": generateNewId(_.keys(storageFixture.storage().lti_consumers).length + 1),
                "oauth_consumer_key": data.oauth_consumer_key,
                "oauth_consumer_secret": data.oauth_consumer_secret,
                "active": true,
                "created": "Mon, 18 Apr 2016 17:38:23 -0000",
                "modified": "Mon, 18 Apr 2016 17:38:23 -0000"
            }

            storageFixture.storage().lti_consumers[newConsumer.id] = newConsumer;

            return [200, newConsumer, {}];
        });

        // get lti consumer by id
        $httpBackend.whenGET(/\/api\/lti\/consumers\/[A-Za-z0-9_-]{22}$/).respond(function(method, url, data, headers) {
            var id = url.split('/').pop();
            return [200, storageFixture.storage().lti_consumers[id], {}];
        });

        // edit lti consumer by id
        $httpBackend.whenPOST(/\/api\/lti\/consumers\/[A-Za-z0-9_-]{22}$/).respond(function(method, url, data, headers) {
            data = JSON.parse(data);

            var id = url.split('/').pop();
            storageFixture.storage().lti_consumers[id] = angular.merge(storageFixture.storage().lti_consumers[id], data);

            return [200, storageFixture.storage().lti_consumers[id], {}];
        });

        // END LTI Consumers


        // Statements
        $httpBackend.whenPOST(/\/api\/statements$/).respond(function(method, url, data, headers) {
            return [200, { 'success':true }, {}];
        });

        // End Statements

        $httpBackend.whenGET(/.*/).passThrough();
    });

    angular.module('ubc.ctlt.compair.common.xapi')
    .run( ['$location', 'xAPISettings', function($location, xAPISettings) {
        xAPISettings.enabled = true;
        xAPISettings.baseUrl = 'https://localhost:8888/';
    }]);
};
