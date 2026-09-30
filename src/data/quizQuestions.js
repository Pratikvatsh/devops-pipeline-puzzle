/**
 * DevOps quiz question bank.
 *
 * Each game picks 6 random questions (preferring different categories)
 * and shuffles the options per player. `correctAnswer` refers to the
 * ORIGINAL option id below and is never sent to the browser before
 * the player has answered.
 */
const QUIZ_QUESTIONS = [
  {
    id: 'q1',
    category: 'Git',
    question: 'What is Git primarily used for?',
    options: [
      { id: 'A', text: 'Container orchestration' },
      { id: 'B', text: 'Version control' },
      { id: 'C', text: 'Cloud monitoring' },
      { id: 'D', text: 'Database management' }
    ],
    correctAnswer: 'B',
    explanation:
      'Git is a distributed version control system. It tracks every change to source code so teams can collaborate, review history and roll back safely.'
  },
  {
    id: 'q2',
    category: 'Continuous Integration',
    question: 'What does CI stand for in DevOps?',
    options: [
      { id: 'A', text: 'Continuous Integration' },
      { id: 'B', text: 'Code Installation' },
      { id: 'C', text: 'Continuous Infrastructure' },
      { id: 'D', text: 'Central Integration' }
    ],
    correctAnswer: 'A',
    explanation:
      'Continuous Integration means developers merge code into a shared branch often, and every merge triggers an automated build and test run.'
  },
  {
    id: 'q3',
    category: 'Jenkins',
    question: 'Which tool is commonly associated with CI/CD automation?',
    options: [
      { id: 'A', text: 'Jenkins' },
      { id: 'B', text: 'Photoshop' },
      { id: 'C', text: 'MySQL Workbench' },
      { id: 'D', text: 'Figma' }
    ],
    correctAnswer: 'A',
    explanation:
      'Jenkins is an open-source automation server. It runs pipelines that build, test and deploy code whenever changes are pushed.'
  },
  {
    id: 'q4',
    category: 'Docker',
    question: 'What is Docker primarily used for?',
    options: [
      { id: 'A', text: 'Containerisation' },
      { id: 'B', text: 'Version control' },
      { id: 'C', text: 'UI design' },
      { id: 'D', text: 'SQL querying' }
    ],
    correctAnswer: 'A',
    explanation:
      'Docker packages an application with its dependencies into a container image, so it runs the same way on a laptop, a test server or production.'
  },
  {
    id: 'q5',
    category: 'Automated testing',
    question: 'What is the purpose of automated testing?',
    options: [
      { id: 'A', text: 'To manually configure servers' },
      { id: 'B', text: 'To automatically verify software behaviour' },
      { id: 'C', text: 'To design websites' },
      { id: 'D', text: 'To create databases' }
    ],
    correctAnswer: 'B',
    explanation:
      'Automated tests check that code behaves as expected on every change, catching bugs early without slow manual checks.'
  },
  {
    id: 'q6',
    category: 'Kubernetes',
    question: 'What is Kubernetes primarily used for?',
    options: [
      { id: 'A', text: 'Container orchestration' },
      { id: 'B', text: 'Source-code editing' },
      { id: 'C', text: 'Image editing' },
      { id: 'D', text: 'SQL optimisation' }
    ],
    correctAnswer: 'A',
    explanation:
      'Kubernetes schedules, scales and restarts containers across a cluster of machines. In other words, it orchestrates containers in production.'
  },
  {
    id: 'q7',
    category: 'Pipeline stages',
    question: 'In this game’s pipeline, which stage comes right after Test?',
    options: [
      { id: 'A', text: 'Monitor' },
      { id: 'B', text: 'Deploy' },
      { id: 'C', text: 'Package' },
      { id: 'D', text: 'Code' }
    ],
    correctAnswer: 'C',
    explanation:
      'Once tests pass, the build is packaged into a deployable artifact such as a container image. Only then is it deployed.'
  },
  {
    id: 'q8',
    category: 'Monitoring',
    question: 'What is monitoring used for?',
    options: [
      { id: 'A', text: 'Observing system and application health and performance' },
      { id: 'B', text: 'Writing source code' },
      { id: 'C', text: 'Creating UI designs' },
      { id: 'D', text: 'Compiling source code' }
    ],
    correctAnswer: 'A',
    explanation:
      'Monitoring tracks metrics like uptime, response time and error rates so teams spot problems before users do.'
  },
  {
    id: 'q9',
    category: 'Continuous Integration',
    question: 'Which practice helps developers integrate code changes frequently?',
    options: [
      { id: 'A', text: 'Continuous Integration' },
      { id: 'B', text: 'Manual deployment' },
      { id: 'C', text: 'Manual testing only' },
      { id: 'D', text: 'Waterfall development' }
    ],
    correctAnswer: 'A',
    explanation:
      'With Continuous Integration, small changes are merged several times a day and verified automatically, so conflicts and bugs surface while they are still small.'
  },
  {
    id: 'q10',
    category: 'Infrastructure as Code',
    question: 'What does Infrastructure as Code mean?',
    options: [
      { id: 'A', text: 'Managing infrastructure through code and configuration files' },
      { id: 'B', text: 'Writing mobile applications' },
      { id: 'C', text: 'Encrypting images' },
      { id: 'D', text: 'Designing websites' }
    ],
    correctAnswer: 'A',
    explanation:
      'With IaC, servers, networks and cloud resources are defined in version-controlled files (for example with Terraform), so environments are repeatable and reviewable.'
  },
  {
    id: 'q11',
    category: 'Artifacts',
    question: 'What is a software artifact?',
    options: [
      { id: 'A', text: 'A build output that can be stored or deployed' },
      { id: 'B', text: 'A programming language' },
      { id: 'C', text: 'A network cable' },
      { id: 'D', text: 'A database password' }
    ],
    correctAnswer: 'A',
    explanation:
      'Artifacts are the outputs of a build, such as a JAR file, a binary or a container image. They are stored in a registry and promoted through environments.'
  },
  {
    id: 'q12',
    category: 'DevOps culture',
    question: 'What is one major goal of DevOps?',
    options: [
      { id: 'A', text: 'Improve collaboration and deliver software faster and more reliably' },
      { id: 'B', text: 'Eliminate testing' },
      { id: 'C', text: 'Avoid automation' },
      { id: 'D', text: 'Prevent developers from deploying software' }
    ],
    correctAnswer: 'A',
    explanation:
      'DevOps brings development and operations together, using shared ownership and automation to ship reliable software faster.'
  },
  {
    id: 'q13',
    category: 'Logging',
    question: 'Why do teams collect application logs?',
    options: [
      { id: 'A', text: 'To record events and errors that help debug problems' },
      { id: 'B', text: 'To compress source code' },
      { id: 'C', text: 'To replace automated tests' },
      { id: 'D', text: 'To design the database schema' }
    ],
    correctAnswer: 'A',
    explanation:
      'Logs are time-stamped records of what an application did. When something breaks, they are usually the first place engineers look.'
  },
  {
    id: 'q14',
    category: 'Observability',
    question: 'Observability is usually built on which three signals?',
    options: [
      { id: 'A', text: 'Metrics, logs and traces' },
      { id: 'B', text: 'Pixels, fonts and colours' },
      { id: 'C', text: 'Commits, branches and tags' },
      { id: 'D', text: 'Tables, rows and columns' }
    ],
    correctAnswer: 'A',
    explanation:
      'Metrics show trends, logs show individual events and traces follow a single request across services. Together they explain why a system behaves the way it does.'
  },
  {
    id: 'q15',
    category: 'Continuous Delivery',
    question: 'What is the difference between Continuous Delivery and Continuous Deployment?',
    options: [
      { id: 'A', text: 'Delivery keeps code always ready to release; Deployment releases every passing change automatically' },
      { id: 'B', text: 'They are two names for manual releases' },
      { id: 'C', text: 'Delivery is only used for mobile apps' },
      { id: 'D', text: 'Deployment skips all testing' }
    ],
    correctAnswer: 'A',
    explanation:
      'In Continuous Delivery a person approves the final release. In Continuous Deployment, every change that passes the pipeline goes to production automatically.'
  },
  {
    id: 'q16',
    category: 'Containers',
    question: 'How does a container differ from a virtual machine?',
    options: [
      { id: 'A', text: 'It shares the host operating system kernel, so it is lighter and starts faster' },
      { id: 'B', text: 'It needs its own complete operating system' },
      { id: 'C', text: 'It can only run databases' },
      { id: 'D', text: 'It cannot be moved between machines' }
    ],
    correctAnswer: 'A',
    explanation:
      'Containers isolate processes while sharing the host kernel. That makes them much smaller than virtual machines and quick to start, which suits CI/CD.'
  }
];

const questionById = new Map(QUIZ_QUESTIONS.map((question) => [question.id, question]));

module.exports = { QUIZ_QUESTIONS, questionById };
