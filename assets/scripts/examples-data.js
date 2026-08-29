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
      {
        number: 2,
        title: 'Stress Analysis & Static Design',
        examples: [
          {
            file: 'M02-WE22A-tension.html',
            name: 'Worked Example 2.2-A: Round bar in tension',
            description: 'Finds axial stress and the safety factor for a round bar in tension using the 7-step process.',
          },
          {
            file: 'M02-WE22B-clevis-pin.html',
            name: 'Worked Example 2.2-B: Clevis pin in double shear and bearing',
            description: 'Checks a clevis pin in double shear and the leg in bearing, and identifies which mode governs.',
          },
          {
            file: 'M02-WE23A-torsion.html',
            name: 'Worked Example 2.3-A: Shaft torque and shear stress',
            description: 'Finds transmitted torque, torsional shear stress, and the shear safety factor for a solid shaft.',
          },
          {
            file: 'M02-WE23B-angle-of-twist.html',
            name: 'Worked Example 2.3-B: Angle of twist of a shaft',
            description: 'Computes the angle of twist and twist rate, and compares them to the 1 degree per meter guideline.',
          },
          {
            file: 'M02-WE24A-bending-diameter.html',
            name: 'Worked Example 2.4-A: Bending stress and diameter selection',
            description: 'Checks a simply supported beam in bending, then sizes the diameter for a target safety factor.',
          },
          {
            file: 'M02-WE24B-cantilever.html',
            name: 'Worked Example 2.4-B: Cantilever bracket',
            description: 'Finds bending stress and safety factor for a cantilever bracket and compares section efficiency.',
          },
          {
            file: 'M02-WE25A-deflection.html',
            name: 'Worked Example 2.5-A: Simply supported shaft deflection',
            description: 'Checks midspan deflection against an L/1000 limit and sizes the shaft up to comply.',
          },
          {
            file: 'M02-WE25B-superposition.html',
            name: 'Worked Example 2.5-B: Superposition of two loads',
            description: 'Adds two off-center load deflections by superposition and checks the stiffness limit.',
          },
          {
            file: 'M02-WE26A-stress-concentration.html',
            name: 'Worked Example 2.6-A: Stepped shaft with a shoulder fillet',
            description: 'Applies a stress-concentration factor at a shoulder fillet to find peak stress and static N.',
          },
          {
            file: 'M02-WE27A-stress-element.html',
            name: 'Worked Example 2.7-A: Setting up the stress element for a shaft',
            description: 'Builds the combined bending-plus-torsion stress element at the critical surface point.',
          },
          {
            file: 'M02-WE28A-mohrs-circle.html',
            name: "Worked Example 2.8-A: Mohr's circle for the shaft",
            description: "Constructs Mohr's circle to find principal stresses and maximum shear from a stress element.",
          },
          {
            file: 'M02-WE29A-von-mises.html',
            name: 'Worked Example 2.9-A: Complete static design check for a shaft',
            description: 'Runs the full von Mises static design check with Kt and redesigns the shaft to pass.',
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
