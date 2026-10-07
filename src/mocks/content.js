// Exam content for the mock API. Texts marked "wireframe" are copied from the approved
// wireframes; the rest is sample content written in the same voice. All of it is sample data.

const MAX = 2.5

const q = (id, text, short, rubric, followUps, bank) => ({ id, text, short, rubric: rubric ? { criteria: rubric, maxScore: MAX } : null, followUps, bank })

// Viva 1: Architecture styles (SWD392). Main questions and follow-ups: wireframe (ReviewAttempt, InterviewRoom).
export const VIVA1 = [
  q('v1q1', 'What is the difference between a layered architecture and a modular monolith?',
    'Layered architecture versus modular monolith',
    'Full score: layers split by technical concern, modules split by business capability, and a modular monolith is still one deployment. Part score: the split without the deployment point.',
    ['Can the modules of a modular monolith be deployed separately?', 'What stops one module from reading another module’s tables?'],
    {
      good: ['A layered architecture splits the code by technical concern, like controllers, services and repositories. A modular monolith splits it by business capability, like exams or users, and it is still deployed as one unit.', 'Correct on layers versus modules and on the single deployment.'],
      mid: ['Layers are horizontal, like the web layer and the data layer. Modules are vertical, one per feature, but I am not sure how they are deployed.', 'Correct split between layers and modules. The deployment point is missing.'],
      weak: ['They are mostly the same idea, the code is split into folders.', 'Did not separate technical layers from business modules.'],
    }),
  q('v1q2', 'Explain when you would choose a modular monolith over microservices for a new product. What would make you change that decision later?',
    'When to choose a modular monolith over microservices',
    'Full score: names simplicity of one deployment and an unclear domain as reasons, and at least one trigger for extracting a service such as uneven scaling, team growth or independent releases. Part score: reasons without a trigger.',
    ['You said a modular monolith is simpler to deploy. What happens to that advantage when two modules need to scale very differently?', 'So which module would you extract first, and what would you change in its data before you split it out?'],
    {
      good: ['For a new product with a small team I would start with a modular monolith, because it is simpler to deploy and to change while the domain is still unclear. I would split a module out when its load becomes very uneven or when a separate team needs to release it on its own.', 'Good reasons for starting with a modular monolith and clear triggers for extracting a service.'],
      mid: ['A modular monolith is easier to start with, so for a new product I would use it. Later we can move to microservices.', 'Reasons for starting are fine. No trigger for changing the decision.'],
      weak: ['Microservices are more modern, so I would use them from the start.', 'Did not compare the two or give a reason based on the product.'],
    }),
  q('v1q3', 'What does an API gateway do in a microservice system, and what should it not do?',
    'What does an API gateway do, and what should it not do?',
    'Full score: routing, authentication and cross-cutting concerns such as rate limiting, and that business logic stays out of the gateway. Part score: what it does without what it should not do.',
    ['Should business rules live in the gateway? Why or why not?', 'What happens to every request if the gateway goes down?'],
    {
      good: ['It is the single entry point. It routes requests, checks the token and can rate limit. It should not hold business rules, because then every change to a rule means changing the gateway.', 'Named routing and authentication and kept business logic out of the gateway.'],
      mid: ['It is the single entry point. It routes requests to the right service and checks the token before the request goes in.', 'Named routing and authentication. Did not say that business logic should stay out of the gateway.'],
      weak: ['It is like a load balancer for the database.', 'Confused the gateway with a load balancer.'],
    }),
  q('v1q4', 'Compare broker-based messaging with direct HTTP calls between services.',
    'Broker-based messaging versus direct HTTP calls',
    'Full score: decoupling in time, what happens when the consumer is down, and the cost in tracing and eventual consistency. Part score: decoupling without the trade-offs.',
    ['If the consumer is offline for an hour, what happens to the messages in each approach?', 'Which approach makes it harder to follow one request across services?'],
    {
      good: ['A broker decouples the services in time, so the producer does not wait and messages wait in the queue if the consumer is down. HTTP calls are simpler to trace, but both sides must be up at the same time.', 'Clear on decoupling in time and on message loss when the consumer is down.'],
      mid: ['A broker is asynchronous and HTTP is synchronous. The broker is better for performance.', 'Named asynchronous versus synchronous. The failure case was not explained.'],
      weak: ['HTTP is faster so it is always better.', 'No comparison of failure behaviour or coupling.'],
    }),
]

// Viva 0: Requirements (SWD392). Questions, follow-ups and Anh's answers: wireframe (StudentReport, ClassStats).
export const VIVA0 = [
  q('v0q1', 'What is the difference between a functional and a non-functional requirement? Give one example of each for an exam system.',
    'Functional versus non-functional requirements',
    'Full score: the distinction plus one measurable example of each. Part score: the distinction with a vague non-functional example.',
    ['How would you make "the system should be fast" testable?'],
    {
      good: ['A functional requirement says what the system does, like a student can start an exam inside the time window. A non-functional one says how well, like the next question appears within three seconds for most answers.', 'Correct distinction with a measurable example of each.'],
      mid: ['Functional is what the system does and non-functional is about quality, like it should be secure.', 'Correct distinction. The non-functional example is not measurable.'],
      weak: ['Functional requirements are the ones that work.', 'Did not explain the difference.'],
    }),
  q('v0q2', 'Who are the stakeholders of an oral exam system, and which of their needs conflict?',
    'Stakeholders and conflicting needs',
    'Full score: students, lecturers, administrators and the school, and one real conflict such as keeping recordings as evidence versus privacy. Part score: stakeholders without a conflict.',
    ['Which need of the school might conflict with what students want?'],
    {
      good: ['Students, lecturers, administrators and the school. Keeping recordings as evidence helps the school, but students care about their privacy, so how long audio is kept is a conflict.', 'Named all stakeholders and a real conflict.'],
      mid: ['The students want a fair score and the lecturers want to save time. They can conflict when the AI is strict.', 'Named students and lecturers, but not administrators or the school.'],
      weak: ['The users of the system.', 'Did not name stakeholders.'],
    }),
  q('v0q3', 'Write a user story with acceptance criteria for publishing an exam session.',
    'User story for publishing a session',
    'Full score: a complete story and testable criteria, including that every question has a rubric. Part score: a story without testable criteria.',
    ['How would a tester check the rubric rule?'],
    {
      good: ['As a lecturer I want to publish a session so that my students can take it. It can only be published with at least one question, a rubric for every question and at least one student.', 'Complete story with testable acceptance criteria.'],
      mid: ['As a lecturer I want to publish the exam so students can see it.', 'A story without acceptance criteria.'],
      weak: ['The lecturer clicks publish.', 'Not written as a user story.'],
    }),
  q('v0q4', 'How do you handle a requirement that changes after development has started?',
    'Handling a changing requirement',
    'Full score: change request, impact analysis and re-prioritising the backlog. Part score: change request only.',
    ['What do you check before you agree to the change?'],
    {
      good: ['We write a change request, check the impact on what is already built and on the schedule, and then re-prioritise the backlog with the customer.', 'Change request, impact analysis and re-prioritising.'],
      mid: ['We write a change request and discuss it with the customer before we change anything.', 'Mentioned change requests, but not impact analysis or re-prioritising the backlog.'],
      weak: ['We just change the code.', 'No process for the change.'],
    }),
]

// Viva 3: Design patterns (draft). Wireframe (SessionSetup); question 4 still has no rubric.
export const VIVA3 = [
  q('v3q1', 'Explain the Strategy pattern and give an example from a system you have built.', 'Strategy pattern',
    'Full score: describes Strategy as interchangeable algorithms behind one interface and gives a concrete example from their own system. Part score: a correct definition without an example.', [], null),
  q('v3q2', 'When would you choose the Observer pattern over direct method calls? What are the risks?', 'Observer pattern',
    'Full score: names loose coupling and one-to-many updates as reasons, and at least one risk such as hard-to-follow flow or subscribers that are never removed. Part score: reasons without risks.', [], null),
  q('v3q3', 'Compare Factory Method and Abstract Factory. When is the extra abstraction worth it?', 'Factory Method versus Abstract Factory',
    'Full score: Factory Method makes one product through a subclass, Abstract Factory makes families of related products, and the extra layer pays off when whole families change together. Part score: the difference without the trade-off.', [], null),
  q('v3q4', 'How does the Repository pattern help when you test business logic?', 'Repository pattern', null, [], null),
]

export const VIVA2 = [
  q('v2q1', 'What is a quality attribute scenario, and what are its six parts?', 'Quality attribute scenarios', 'Full score: names source, stimulus, environment, artifact, response and response measure. Part score: four or five parts.', ['Give a response measure for availability.'], null),
  q('v2q2', 'How would you improve the availability of the exam service during an exam?', 'Availability tactics', 'Full score: at least two tactics such as redundancy, health checks or retries, and what each costs. Part score: tactics without cost.', ['What does each tactic cost you?'], null),
  q('v2q3', 'Which quality attributes conflict in an AI-graded oral exam, and how would you balance them?', 'Conflicting quality attributes', 'Full score: one real conflict, such as latency versus scoring accuracy, and a way to balance it. Part score: a conflict without the balance.', ['How would you measure that trade-off?'], null),
  q('v2q4', 'How do you make a security requirement testable?', 'Testable security requirements', 'Full score: a measurable scenario and a test for it. Part score: a vague requirement.', ['What would the test look like?'], null),
]

export const SWT_VIVA = [
  q('t1q1', 'Explain equivalence partitioning with an example.', 'Equivalence partitioning', 'Full score: partitions, one value per partition and a worked example. Part score: definition only.', ['Which values would you pick?'], null),
  q('t1q2', 'When do you use boundary value analysis, and which values do you test?', 'Boundary value analysis', 'Full score: on and just outside each boundary, with an example. Part score: boundaries without the outside values.', ['What about the value just above the maximum?'], null),
  q('t1q3', 'How does a decision table help you design tests?', 'Decision tables', 'Full score: conditions, actions and one test per rule. Part score: the table without the tests.', ['How many tests does a table with three conditions need?'], null),
]

// Anh's attempt in Viva 1 (SE1834): wireframe (ReviewAttempt), turn by turn.
export const ANH_VIVA1 = [
  { ai: 2.0, comment: 'Correct on layers versus modules. The first answer said modules can be deployed alone, which is wrong for a modular monolith; the follow-up answer corrected it.',
    turns: [
      { type: 'Main', answer: 'A layered architecture splits the code by technical layer, like controllers, services and repositories. A modular monolith splits it by business module, like exams or users, and each module can be deployed alone.', dur: 64 },
      { type: 'FollowUp', question: 'Can the modules of a modular monolith be deployed separately?', answer: 'No, sorry. It is still one deployment; the modules are only separated in the code and in the database schemas.', dur: 31 },
    ] },
  { ai: 2.0, comment: 'Good reasons for starting with a modular monolith and a clear trigger for extracting a service (uneven scaling). Team growth and independent releases were not mentioned as triggers.',
    turns: [
      { type: 'Main', answer: 'For a new product with a small team I would start with a modular monolith, because it is simpler to deploy and to change while the domain is still unclear.', dur: 72 },
      { type: 'FollowUp', question: 'You said a modular monolith is simpler to deploy. What happens to that advantage when two modules need to scale very differently?', answer: 'If one module, like the AI scoring, needs far more compute than the rest, we still have to scale the whole application together. That wastes resources, so I would extract that module into its own service.', dur: 54 },
    ] },
  { ai: 1.5, comment: 'Named routing and authentication. Did not say that business logic should stay out of the gateway.',
    turns: [{ type: 'Main', answer: 'It is the single entry point. It routes requests to the right service and checks the token before the request goes in.', dur: 49 }] },
  { ai: 2.0, comment: 'Clear on decoupling in time and on message loss when the consumer is down. Tracing trade-off explained in the follow-up.',
    turns: [{ type: 'Main', answer: 'A broker decouples the services in time, so the producer does not wait for the consumer. HTTP calls are simpler but both sides must be up.', dur: 65 }] },
]

// Bao's attempt, stopped when the session closed (question 4 not reached). Answers written for these questions.
export const BAO_VIVA1 = [
  { ai: 2.0, comment: 'Clear contrast with a concrete example. Did not say that a modular monolith is still one deployment.',
    turns: [{ type: 'Main', answer: 'In a layered architecture each layer only talks to the layer below, so a small change like adding a field touches every layer. In a modular monolith each business module owns its own code from the controller down to the data.', dur: 58 }] },
  { ai: 1.5, comment: 'Named the simpler start. The trigger for extracting a service only came after the follow-up and stayed vague.',
    turns: [
      { type: 'Main', answer: 'I would start with the monolith because it is easier to run and debug for a small team.', dur: 47 },
      { type: 'FollowUp', question: 'You said a modular monolith is simpler to deploy. What happens to that advantage when two modules need to scale very differently?', answer: 'I think then it is harder, because you have to scale everything together.', dur: 36 },
    ] },
  { ai: 1.5, comment: 'Correct about routing and the single entry point, with a good security reason. Did not say what must stay out of the gateway.',
    turns: [{ type: 'Main', answer: 'The gateway is the one door into the system. It sends each request to the right service and validates the token, so the services behind it do not have to.', dur: 52 }] },
]

// Anh's report for Viva 0, confirmed: wireframe (StudentReport).
export const ANH_VIVA0 = [
  { ai: 2.0, comment: 'Correct distinction and a good functional example. The first non-functional example ("the system should be fast") had no measurable target; the follow-up answer added one.',
    turns: [
      { type: 'Main', answer: 'A functional requirement says what the system does, like a student can start an exam inside the time window. A non-functional one says how well it does it, for example the system should be fast.', dur: 58 },
      { type: 'FollowUp', question: 'How would you make "the system should be fast" testable?', answer: 'We could say the next question must appear within a few seconds after the student stops answering, and measure that on most answers.', dur: 41 },
    ] },
  { ai: 1.5, comment: 'Named students and lecturers, but not administrators or the school. The conflict between keeping recordings as evidence and student privacy was not mentioned.',
    turns: [{ type: 'Main', answer: 'The students want a fair score and the lecturers want to save time. They can conflict when the AI is strict.', dur: 47 }] },
  { ai: 2.5, comment: 'Complete story with three testable acceptance criteria, including the check that every question has a rubric.',
    turns: [{ type: 'Main', answer: 'As a lecturer I want to publish a session so that my students can take it. It can only be published with at least one question, a rubric for every question and at least one student.', dur: 84 }] },
  { ai: 1.5, comment: 'Mentioned change requests, but not impact analysis or re-prioritising the backlog.',
    turns: [
      { type: 'Main', answer: 'We write a change request and discuss it with the customer before we change anything.', dur: 39 },
      { type: 'FollowUp', question: 'What do you check before you agree to the change?', answer: 'If it breaks something that is already done, and how much time it needs.', dur: 33 },
    ] },
]
