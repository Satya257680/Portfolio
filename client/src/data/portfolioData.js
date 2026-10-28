/**
 * Central content file — every section of the site reads from here.
 * Edit text, links and lists in this one place. Set a link to null to hide its button.
 */

export const profile = {
  name: 'Satyajit Nayak',
  firstName: 'Satyajit',
  lastName: 'Nayak',
  headline: 'IT Officer | Full Stack Developer',
  navSubtitle: 'Full Stack Developer',
  availability: 'Available for Opportunities',

  intro:
    'At Mi Arcus Retails Private Limited, I work on developing and maintaining web-based business applications that support retail operations and internal workflows. My work spans frontend development, backend APIs, database management, and application deployment, with a focus on reliability, usability, and solving practical business problems. I also use AI tools in my daily workflow to explore technical solutions, troubleshoot issues, understand new concepts, and improve development efficiency while carefully reviewing and testing the results.',

  avatar: '/avatar.jpg',
  photo: '/profile.jpg',
  photoAlt: 'Satyajit Nayak in a leather jacket at India Gate, New Delhi, in the evening',
  resumeFile: '/Satyajit_Nayak_Resume.pdf',
  quote: 'Building scalable solutions for real-world problems.',
  currentLocation: 'Ludhiana, Punjab, India',
  homeLocation: 'Balasore, Odisha, India',
};
export const socials = [
  { id: 'linkedin', label: 'LinkedIn', handle: 'linkedin.com/in/satyajit-nayak-981185247', url: 'https://www.linkedin.com/in/satyajit-nayak-981185247/' },
  { id: 'github', label: 'GitHub', handle: 'github.com/Satya257680', url: 'https://github.com/Satya257680' },
  { id: 'instagram', label: 'Instagram', handle: '@icon_boy_satyas', url: 'https://www.instagram.com/icon_boy_satyas/?hl=en' },
  { id: 'facebook', label: 'Facebook', handle: 'Satyajit Nayak', url: 'https://www.facebook.com/profile.php?id=100082445244045' },
  { id: 'youtube', label: 'YouTube', handle: '@icon_boy_satyas', url: 'https://www.youtube.com/@icon_boy_satyas' },
  { id: 'whatsapp', label: 'WhatsApp', handle: '+91 73270 96390', url: 'https://wa.me/917327096390' },
];

export const navLinks = [
  { id: 'home', label: 'Home' },
  { id: 'about', label: 'About' },
  { id: 'skills', label: 'Skills' },
  { id: 'experience', label: 'Experience' },
  { id: 'projects', label: 'Projects' },
  { id: 'education', label: 'Education' },
  { id: 'certifications', label: 'Certifications' },
  { id: 'contact', label: 'Contact' },
];

// Hero info card (right side)
export const heroInfo = [
  { icon: 'pin', color: 'violet', label: 'Location', lines: ['Ludhiana, Punjab, India', 'From Balasore, Odisha'] },
  { icon: 'briefcase', color: 'blue', label: 'Current Role', lines: ['IT Officer (Full Stack Developer)', 'Mi Arcus Retails Private Limited'] },
  { icon: 'cap', color: 'cyan', label: 'Education', lines: ['B.Tech CSE', 'Centurion University of Technology and Management'] },
];

// Job start date — the "months of experience" stat is calculated from this, so it stays accurate.
export const experienceStart = '2026-07-09';


export const about = {
  paragraphs: [
    'I’m Satyajit Nayak, an IT Officer and Full Stack Developer at Mi Arcus Retails Private Limited. Originally from Balasore, Odisha, India, I’m currently based in Ludhiana, Punjab, India, where I work with the company to support IT operations, develop enterprise applications, and improve business workflows through technology.',

    'I completed my schooling in Odisha and pursued my B.Tech in Computer Science and Engineering at Centurion University. I’m a fast learner who enjoys exploring new technologies, adapting to challenges, and continuously improving my technical, analytical, and problem-solving skills.',
  ],

  more: [
    'At Mi Arcus Retails Private Limited, I work across IT operations and full-stack development. My day-to-day responsibilities include developing React and JavaScript interfaces, building Node.js and Express.js REST APIs, working with SQL/MySQL databases, implementing role-aware workflows, dashboards, forms, reports, exports, and validation, and supporting company-server deployments and production issues.',

    'I use AI tools in my daily workflow to explore ideas, understand unfamiliar technologies, troubleshoot errors, improve code, compare implementation approaches, and learn more efficiently. I see AI as a practical assistant that complements human creativity, critical thinking, testing, and technical decision-making.',

    'My projects include enterprise management applications, visitor management systems, QR-based attendance solutions, database-driven platforms, dashboards, and productivity tools. I enjoy working across the development lifecycle, from understanding requirements and designing interfaces to developing APIs, managing databases, testing functionality, and deploying applications.',

    'LinkedIn is where I share my professional journey, experience, technical skills, education, and career interests while connecting with recruiters and technology professionals. GitHub showcases my code, repositories, software projects, and technical experiments, allowing others to explore how I approach development and problem-solving.',

    'Instagram is part of my personal and creative online presence, where I share photos and moments from my life. Facebook helps me stay connected with friends, family, and my wider social circle, keeping my personal connections separate from my professional activities.',

    'I run a YouTube channel called SATYA CREATION, where I create short videos intended to entertain people and put a smile on their faces. I also share a walkthrough of the Mi Arcus Portal, combining my technical experience with my interest in creating useful digital content.',

    'WhatsApp provides a direct way to contact me for professional discussions, collaboration, project-related communication, and relevant opportunities. Together, my social media accounts reflect my professional growth, coding journey, personal interests, creativity, and willingness to connect with others.',

    'I believe in continuous learning, consistency, creativity, and solving real-world problems with a practical mindset. My long-term goal is to grow as a technology professional, contribute to meaningful products, and build reliable, user-friendly solutions that make a real difference.',
  ],

  traits: [
    { icon: 'bulb', color: 'amber', title: 'Problem Solver', text: 'I enjoy breaking down complex problems into simple solutions.' },
    { icon: 'chart', color: 'blue', title: 'Continuous Learner', text: 'Always exploring new technologies and improving my skills.' },
    { icon: 'team', color: 'green', title: 'Team Player', text: 'Collaborate effectively and contribute to meaningful projects.' },
    { 
  icon: 'target',
  color: 'pink',
  title: 'Career Growth',
  text: 'Focused on continuous growth, taking on new challenges, and building impactful technology solutions.'
},
  ],
};


 // `logo` = key in brandIcons.js, or a custom icon name handled in SkillLogo.jsx
export const skills = [
  { name: 'HTML5', logo: 'html5', group: 'Frontend' },
  { name: 'CSS3', logo: 'css3', group: 'Frontend' },
  { name: 'JavaScript', logo: 'javascript', group: 'Frontend' },
  { name: 'React.js', logo: 'react', group: 'Frontend' },

  { name: 'Java', logo: 'java', group: 'Backend' },
  { name: 'Spring Boot', logo: 'springboot', group: 'Backend' },
  { name: 'Node.js', logo: 'nodedotjs', group: 'Backend' },
  { name: 'Express.js', logo: 'express', group: 'Backend' },
  { name: 'REST APIs', logo: 'api', group: 'Backend' },

  { name: 'DSA', logo: 'code', group: 'Programming' },

  { name: 'MySQL', logo: 'mysql', group: 'Database' },
  { name: 'SQL', logo: 'sql', group: 'Database' },

  { name: 'Git', logo: 'git', group: 'Tools' },
  { name: 'GitHub', logo: 'github', group: 'Tools' },
  { name: 'Postman', logo: 'postman', group: 'Tools' },
  { name: 'VS Code', logo: 'vscode', group: 'Tools' },
  { name: 'IntelliJ IDEA', logo: 'intellijidea', group: 'Tools' },

  { name: 'SAP', logo: 'sap', group: 'Additional' },
  { name: 'Excel', logo: 'excel', group: 'Additional' },
  { name: 'Word', logo: 'word', group: 'Additional' },
];

// Shown when "View All Skills" is opened
export const skillDetails = {
  Frontend: [
    'HTML5',
    'CSS3',
    'JavaScript',
    'React.js',
    'Responsive UI development',
  ],

  Backend: [
    'Java',
    'Spring Boot',
    'Node.js',
    'Express.js',
    'REST APIs',
  ],

  Programming: [
    'Data Structures and Algorithms (DSA)',
    'Problem-solving',
    'Object-oriented programming',
  ],

  Database: [
    'SQL',
    'MySQL',
    'CRUD operations',
    'Relational data handling',
  ],

  Tools: [
    'VS Code',
    'IntelliJ IDEA',
    'Git',
    'GitHub',
    'Postman',
  ],

  Additional: [
    'SAP',
    'Microsoft Excel',
    'Microsoft Word',
  ],
};


export const experience = [
  {
    role: 'IT Officer (Full Stack Developer Responsibilities)',
    company: 'Mi Arcus Retails Private Limited',
    period: 'Jul 2026 – Present',
    current: true,
    points: [
      'Develop and maintain the company’s centralized web-based business applications to support retail operations and internal workflows.',
      'Build responsive and user-friendly interfaces using React.js, JavaScript, HTML, and CSS, with a focus on usability and consistent design.',
      'Develop and maintain backend services and REST APIs using Node.js and Express.js to support application features and business processes.',
      'Manage application data using MySQL, including database queries, CRUD operations, data validation, and integration between frontend and backend systems.',
      'Develop and enhance business modules such as user management, departments, stores, checklists, action points, reports, announcements, and operational tracking.',
      'Implement role-based access, form validation, filtering, data exports, and other features to improve application functionality and workflow accuracy.',
      'Deploy website updates to company servers, troubleshoot frontend, backend, API, and database issues, and verify application functionality after releases.',
      'Use AI-assisted development tools to investigate errors, explore technical solutions, understand unfamiliar concepts, and improve coding efficiency while testing changes before implementation.',
    ],
  },
];


/**
 * Featured projects for the portfolio.
 * `preview` selects the illustrated card artwork in ProjectPreview.jsx.
 * `image` can point to a real project screenshot in client/public/projects/.
 * `brand` can be used to display a project-specific brand mark.
 */
export const projects = [
  {
    id: 'miarcus',
    name: 'MIARCUS',
    subtitle: 'Enterprise Retail Operations Platform',
    preview: 'dashboard',
    image: '/projects/miarcus-dashboard.png',
    brand: 'MI ARCUS',
    description:
      'A large, centralized retail operations platform built to support day-to-day workflows across multiple stores. It brings together user and role management, departments, designations, stores, checklists and submissions, action points, billing, daily collections, sales teams, visit planning, announcements, galleries, and operational reports. The application connects React-based dashboards and forms with Node.js/Express REST APIs and MySQL data storage, with authenticated access, role-aware permissions, server-side validation, filtering, exports, and operational workflows designed to keep business information organized and accessible.',
    tags: ['React.js', 'Node.js', 'Express.js', 'MySQL', 'JWT Authentication', 'Role-Based Access'],
    links: {
      live: 'https://rytual2.miarcus.com/',
      repo: 'https://github.com/Satya257680/miarcus',
    },
  },

  {
    id: 'vistarax',
    name: 'VistaraX',
    subtitle: 'Visitor Management System',
    preview: 'visitors',
    image: null,
    description:
      'A web-based visitor management application for recording and tracking visitor check-ins and check-outs. It includes searchable visitor records, role-based access, dashboard insights, data exports, JWT-based authentication, and real-time notifications using Socket.IO.',
    tags: ['Node.js', 'Express.js', 'MySQL', 'Socket.IO', 'JWT'],
    links: {
      live: null,
      repo: 'https://github.com/Satya257680/Vistarax',
    },
  },

  {
    id: 'qr-attendance',
    name: 'QR Attendance',
    subtitle: 'QR-Based Attendance System',
    preview: 'qr',
    image: null,
    description:
      'An attendance management project built around QR-code-based attendance workflows. The project focuses on making attendance recording more convenient through QR interactions and a web-based interface, with an emphasis on organized attendance data.',
    tags: ['React.js', 'Node.js', 'MySQL', 'QR Code'],
    links: {
      live: null,
      repo: null,
    },
  },

  {
    id: 'calculation-platform',
    name: 'Calculation Platform',
    subtitle: 'Personal Calculation Platform',
    preview: 'calculator',
    image: null,
    description:
      'A personal web application designed to bring practical calculation workflows into a simple, accessible interface. It focuses on clear user interactions, responsive presentation, and structured handling of calculation-related inputs and results.',
    tags: ['React.js', 'JavaScript', 'SQL'],
    links: {
      live: null,
      repo: null,
    },
  },
];

export const moreProjectsUrl =
  'https://github.com/Satya257680?tab=repositories';

export const education = [
  {
    qualification: 'B.Tech — Computer Science & Engineering',
    institution: 'Centurion University of Technology and Management',
    period: '2022 – 2026',
    result: 'CGPA: 8.6',
  },
  {
    qualification: 'Intermediate — Science (CHSE)',
    institution: 'Bahanaga Higher Secondary School, Balasore',
    period: '2020 -2022',
    result: '71.33%',
  },
  {
    qualification: 'Matriculation (BSE)',
    institution: 'Banabishnupur High School, Balasore',
    period: '2020',
    result: '73.66%',
  },
];

export const certifications = [
  {
    icon: 'sap',
    color: 'amber',
    title: 'SAP Global Certification',
    subtitle: 'ERP Fundamentals & ABAP Development',
    date: 'Sep 2025',
    text: 'SAP ERP processes in Sales (SD), Materials Management (MM) and Finance (FI), plus ABAP data dictionary, internal tables, modularization and report programming.',
  },
  {
    icon: 'geeksforgeeks',
    color: 'green',
    title: 'GeeksforGeeks — Data Structures & Algorithms',
    subtitle: 'Java problem solving',
    date: '2025',
    text: 'Recursion, graphs, trees and dynamic programming; algorithmic efficiency and optimization.',
  },
  {
    icon: 'trophy',
    color: 'orange',
    title: 'Avalanche India Hackathon',
    subtitle: 'Blockchain dApp',
    date: 'Sep 2024',
    text: 'Hackathon dApp built on the Avalanche network — Web3 sign-in, transaction handling and balance checks through public blockchain APIs.',
  },
];

// `level` sets the bar length: native = full, others shorter. No made-up percentages.
export const languages = [
  { name: 'Odia', level: 'Native', bar: 100 },
  { name: 'English', level: 'Communication', bar: 80 },
  { name: 'Hindi', level: 'Conversational', bar: 65 },
];
