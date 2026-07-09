// demos-data.js — single source of truth for educational demo indexes and sidebars.
// Copy this file to k3smith.github.io/assets/scripts/demos-data.js

const DEMO_COURSES = [
  {
    id: 'met320',
    name: 'MET 320 — Machine Elements',
    term: 'ODU',
    index: '/demos/met320/index.html',
    modules: [
      {
        number: 1,
        title: 'Design Process & Materials',
        demos: [
          {
            file: 'M01-01-GearReducerDemo.html',
            name: 'Gear Reducer Drive System',
            description: 'Explore speed ratios, torque, and power through a multi-stage gear reducer.',
          },
          {
            file: 'M01-02-TensileTestLab.html',
            name: 'Virtual Tensile Test Lab',
            description: 'Stress–strain curves, yield, ultimate strength, and ductile vs. brittle behavior.',
          },
          {
            file: 'M01-03-SteelDecoderGame.html',
            name: 'Steel Decoder Challenge',
            description: 'Practice decoding AISI steel designations and heat-treatment suffixes.',
          },
        ],
      },
      {
        number: 2,
        title: 'Stress Analysis',
        demos: [
          {
            file: 'M02-08-MohrsCircleDemo.html',
            name: "Mohr's Circle",
            description: 'Interactive plane-stress element and Mohr\'s circle for principal stresses.',
          },
        ],
      },
      {
        number: 3,
        title: 'Fatigue & Flexible Drives',
        demos: [
          {
            file: 'M03-03-GoodmanDiagramDemo.html',
            name: 'Goodman Diagram',
            description: 'Plot mean and alternating stress; check modified Goodman safety factor.',
          },
          {
            file: 'M03-05-BeltDriveDemo.html',
            name: 'V-Belt Drive Kinematics',
            description: 'Center distance, pulley diameters, belt speed, and arc of contact.',
          },
        ],
      },
      {
        number: 4,
        title: 'Gears',
        demos: [
          {
            file: 'M04-01-GearMeshDemo.html',
            name: 'Gear Mesh & Involute Action',
            description: 'Module, pitch diameter, center distance, and involute tooth contact.',
          },
        ],
      },
      {
        number: 6,
        title: 'Shafts & Bearings',
        demos: [
          {
            file: 'M06-02-ShaftDesignDemo.html',
            name: 'Shaft Loading & Design',
            description: 'Combined bending and torsion; von Mises stress and diameter iteration.',
          },
        ],
      },
      {
        number: 7,
        title: 'Fits & Fasteners',
        demos: [
          {
            file: 'M07-02-FitsVisualizerDemo.html',
            name: 'Fits & Tolerance Zones',
            description: 'Visualize hole/shaft tolerance zones and ISO fit designations.',
          },
        ],
      },
      {
        number: 8,
        title: 'Springs',
        demos: [
          {
            file: 'M08-03-SpringDesignerDemo.html',
            name: 'Compression Spring Designer',
            description: 'Wire diameter, mean coil diameter, active coils, and spring rate.',
          },
        ],
      },
    ],
  },
];

/** Flat list of all demos for a course (for sidebar). */
function getDemosForCourse(courseId) {
  const course = DEMO_COURSES.find((c) => c.id === courseId);
  if (!course) return [];
  return course.modules.flatMap((mod) =>
    mod.demos.map((demo) => ({
      ...demo,
      module: mod.number,
      moduleTitle: mod.title,
      link: `${course.index.replace('index.html', '')}${demo.file}`,
    }))
  );
}

function getCourse(courseId) {
  return DEMO_COURSES.find((c) => c.id === courseId);
}
