// examples-data.js — single source of truth for worked-example indexes and sidebars.
// Mirrors demos-data.js. Copy to k3smith.github.io/assets/scripts/examples-data.js
// To add a worked example: add an entry to the appropriate module's `examples` array.

const EXAMPLE_COURSES = [
  {
    id: 'met320',
    name: 'MET 320 — Machine Elements',
    term: 'ODU',
    index: '/examples/met320/index.html',
    modules: [
      {
        number: 1,
        title: 'Design Process & Materials',
        examples: [
          {
            file: 'M01-WE1A-ConvertToSI.html',
            name: 'Worked Example 1.1-A: Converting shaft properties to SI',
            description: 'Steps through the 7-step engineering process to convert area, section modulus, moment of inertia, and torque to SI units.',
          },
        ],
      },
    ],
  },
  {
    id: 'met475',
    name: 'MET 475 — Marine Engineering I',
    term: 'ODU',
    index: '/examples/met475/index.html',
    modules: [],
  },
];

/** Flat list of all worked examples for a course (for sidebar). */
function getExamplesForCourse(courseId) {
  const course = EXAMPLE_COURSES.find((c) => c.id === courseId);
  if (!course) return [];
  return course.modules.flatMap((mod) =>
    mod.examples.map((example) => ({
      ...example,
      module: mod.number,
      moduleTitle: mod.title,
      link: `${course.index.replace('index.html', '')}${example.file}`,
    }))
  );
}

function getExampleCourse(courseId) {
  return EXAMPLE_COURSES.find((c) => c.id === courseId);
}
