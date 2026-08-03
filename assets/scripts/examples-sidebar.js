// examples-sidebar.js — mirrors demos-sidebar.js for worked examples.
// Requires examples-data.js loaded first.

function renderExamplesSidebar(options = {}) {
  const { courseId = null, currentExampleFile = null } = options;

  const sidebar = document.createElement('div');
  sidebar.className = 'sidebar';

  const heading = document.createElement('h2');
  heading.textContent = 'Worked Examples';
  sidebar.appendChild(heading);

  const allIndex = document.createElement('a');
  allIndex.href = '/examples/index.html';
  allIndex.textContent = 'All Courses';
  if (!courseId && !currentExampleFile) {
    allIndex.style.fontWeight = 'bold';
    allIndex.style.color = 'darkblue';
  }
  sidebar.appendChild(allIndex);

  EXAMPLE_COURSES.forEach((course) => {
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
    const course = getExampleCourse(courseId);
    if (course) {
      const moduleHeading = document.createElement('h2');
      moduleHeading.textContent = course.id.toUpperCase() + ' Examples';
      sidebar.appendChild(moduleHeading);

      getExamplesForCourse(courseId).forEach((example) => {
        if (currentExampleFile === example.file) {
          const currentItem = document.createElement('div');
          currentItem.textContent = example.name;
          currentItem.style.fontWeight = 'bold';
          currentItem.style.color = 'darkblue';
          currentItem.style.padding = '10px';
          currentItem.style.fontSize = '0.9em';
          sidebar.appendChild(currentItem);
        } else {
          const link = document.createElement('a');
          link.href = example.link;
          link.textContent = example.name;
          link.style.fontSize = '0.9em';
          sidebar.appendChild(link);
        }
      });
    }
  }

  const navHeading = document.createElement('h2');
  navHeading.textContent = 'Navigation';
  sidebar.appendChild(navHeading);

  const demosLink = document.createElement('a');
  demosLink.href = '/demos/index.html';
  demosLink.textContent = 'Educational Demos';
  sidebar.appendChild(demosLink);

  const homeLink = document.createElement('a');
  homeLink.href = '/index.html';
  homeLink.textContent = 'Go to Home Page';
  sidebar.appendChild(homeLink);

  document.body.prepend(sidebar);
}
