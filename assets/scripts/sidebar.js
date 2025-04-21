// sidebar.js

const projects = [
    { name: 'ODIN', link: '/projects/odin/index.html' },
    { name: 'CIMA', link: '/projects/cima/index.html' },
    { name: 'CyberShield H₂O', link: '/projects/cybershield-h2o/index.html' },
    { name: 'Port Cyber-Physical System', link: '/projects/port-cps/index.html' },
  ];
  
  // function to render sidebar
  function renderSidebar(currentProject) {
    const sidebar = document.createElement('div');
    sidebar.className = 'sidebar';
    sidebar.appendChild(document.createElement('h2')).textContent = 'Projects';
  
    projects.forEach(project => {
      if (project.name === currentProject) {
        const currentItem = document.createElement('div');
        currentItem.textContent = project.name;
        currentItem.style.fontWeight = 'bold';
        currentItem.style.color = 'darkblue'; // Highlight current project
        sidebar.appendChild(currentItem);
      } else {
        const link = document.createElement('a');
        link.href = project.link;
        link.textContent = project.name;
        sidebar.appendChild(link);
      }
    });

    sidebar.appendChild(document.createElement('h2')).textContent = 'Navigation';

    const link = document.createElement('a');
    link.href = '/index.html';
    link.textContent = 'Go to Home Page';
    sidebar.appendChild(link);
  
    document.body.prepend(sidebar);
  }
  