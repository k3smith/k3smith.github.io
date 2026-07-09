// demos-sidebar.js — reuse pattern from projects sidebar.js
// Requires demos-data.js loaded first.

function renderDemosSidebar(options = {}) {
  const { courseId = null, currentDemoFile = null } = options;

  const sidebar = document.createElement('div');
  sidebar.className = 'sidebar';

  const demosHeading = document.createElement('h2');
  demosHeading.textContent = 'Educational Demos';
  sidebar.appendChild(demosHeading);

  const allIndex = document.createElement('a');
  allIndex.href = '/demos/index.html';
  allIndex.textContent = 'All Courses';
  if (!courseId && !currentDemoFile) {
    allIndex.style.fontWeight = 'bold';
    allIndex.style.color = 'darkblue';
  }
  sidebar.appendChild(allIndex);

  DEMO_COURSES.forEach((course) => {
    if (courseId === course.id) {
      const current = document.createElement('div');
      current.textContent = course.name;
      current.style.fontWeight = 'bold';
      current.style.color = 'darkblue';
      current.style.padding = '10px';
      sidebar.appendChild(current);
    } else {
      const link = document.createElement('a');
      link.href = course.index;
      link.textContent = course.name;
      sidebar.appendChild(link);
    }
  });

  if (courseId) {
    const course = getCourse(courseId);
    if (course) {
      const moduleHeading = document.createElement('h2');
      moduleHeading.textContent = course.id.toUpperCase() + ' Demos';
      sidebar.appendChild(moduleHeading);

      getDemosForCourse(courseId).forEach((demo) => {
        if (currentDemoFile === demo.file) {
          const currentItem = document.createElement('div');
          currentItem.textContent = demo.name;
          currentItem.style.fontWeight = 'bold';
          currentItem.style.color = 'darkblue';
          currentItem.style.padding = '10px';
          currentItem.style.fontSize = '0.9em';
          sidebar.appendChild(currentItem);
        } else {
          const link = document.createElement('a');
          link.href = demo.link;
          link.textContent = demo.name;
          link.style.fontSize = '0.9em';
          sidebar.appendChild(link);
        }
      });
    }
  }

  const navHeading = document.createElement('h2');
  navHeading.textContent = 'Navigation';
  sidebar.appendChild(navHeading);

  const homeLink = document.createElement('a');
  homeLink.href = '/index.html';
  homeLink.textContent = 'Go to Home Page';
  sidebar.appendChild(homeLink);

  const projectsLink = document.createElement('a');
  projectsLink.href = '/projects/odin/index.html';
  projectsLink.textContent = 'Research Projects';
  sidebar.appendChild(projectsLink);

  document.body.prepend(sidebar);
}
