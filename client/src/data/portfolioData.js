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
    'I build scalable web applications using React, Node.js, Express.js and SQL, with a focus on real-world business solutions. Currently working at Mi Arcus Retails Private Limited, building and maintaining enterprise applications.',
  photo: '/profile.jpg',
  avatar: '/avatar.jpg',
  photoAlt: 'Satyajit Nayak in a leather jacket at India Gate, New Delhi, in the evening',
  resumeFile: '/Satyajit_Nayak_Resume.pdf',
  quote: 'Building scalable solutions for real-world problems.',
  currentLocation: 'Ludhiana, Punjab, India',
  homeLocation: 'Balasore, Odisha, India',
};

export const contact = {
  email: 'satyajit.it.2026@gmail.com',
  phone: '+91 73270 96390',
  phoneHref: 'tel:+917327096390',
  whatsapp: 'https://wa.me/917327096390',
  location: 'Ludhiana, Punjab, India',
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
  { icon: 'cap', color: 'cyan', label: 'Education', lines: ['B.Tech CSE', 'Centurion University'] },
];

// Job start date — the "months of experience" stat is calculated from this, so it stays accurate.
export const experienceStart = '2026-07-09';

export const about = {
  paragraphs: [
    'I’m Satyajit Nayak, an IT Officer and full-stack developer at Mi Arcus Retails Private Limited. I enjoy building and maintaining business applications, working across the frontend and backend, database design, and server deployment.',
    'I’m passionate about creating clean, efficient and user-friendly solutions that solve real problems.',
  ],
  more: [
    'Day to day I work with React and JavaScript interfaces, Node.js/Express REST APIs and SQL/MySQL databases — implementing role-aware workflows, forms, dashboards, exports and validation, and supporting company-server releases and production issues.',
    'Outside work I run a small YouTube channel, SATYA CREATION, with short videos made to put a smile on your face — plus a walkthrough of the Mi Arcus Portal.',
  ],
  traits: [
    { icon: 'bulb', color: 'amber', title: 'Problem Solver', text: 'I enjoy breaking down complex problems into simple solutions.' },
    { icon: 'chart', color: 'blue', title: 'Continuous Learner', text: 'Always exploring new technologies and improving my skills.' },
    { icon: 'team', color: 'green', title: 'Team Player', text: 'Collaborate effectively and contribute to meaningful projects.' },
    { icon: 'target', color: 'pink', title: 'Goal', text: 'To work at Google / Microsoft / Amazon by the age of 25.' },
  ],
};

// `logo` = key in brandIcons.js, or a custom icon name handled in SkillLogo.jsx
export const skills = [
  { name: 'HTML5', logo: 'html5', group: 'Frontend' },
  { name: 'CSS3', logo: 'css3', group: 'Frontend' },
  { name: 'JavaScript', logo: 'javascript', group: 'Frontend' },
  { name: 'React.js', logo: 'react', group: 'Frontend' },
  { name: 'Node.js', logo: 'nodedotjs', group: 'Backend' },
  { name: 'Express.js', logo: 'express', group: 'Backend' },
  { name: 'MySQL', logo: 'mysql', group: 'Database' },
  { name: 'SQL', logo: 'sql', group: 'Database' },
  { name: 'REST APIs', logo: 'api', group: 'Backend' },
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
  Frontend: ['HTML5', 'CSS3', 'JavaScript', 'React.js', 'Responsive UI development'],
  Backend: ['Node.js', 'Express.js', 'REST APIs'],
  Database: ['SQL', 'MySQL', 'CRUD operations', 'Relational data handling'],
  Tools: ['VS Code', 'IntelliJ IDEA', 'Git', 'GitHub', 'Postman'],
  Additional: ['SAP', 'Microsoft Excel', 'Microsoft Word'],
};

export const experience = [
  {
    role: 'IT Officer (Full Stack Development Responsibilities)',
    company: 'Mi Arcus Retails Private Limited',
    period: 'Jul 2026 – Present',
    current: true,
    points: [
      'Develop and maintain centralized business applications for multi-store operations.',
      'Work with React.js, Node.js, Express.js and MySQL to build and deploy business applications.',
      'Design and implement modules for users, stores, reports, checklists, action points and more.',
      'Support server deployment, troubleshoot issues and improve system reliability.',
    ],
  },
];

/**
 * Projects. `preview` picks the illustrated card header (see ProjectPreview.jsx).
 * To use a real screenshot instead, put it in client/public/projects/ and set `image: '/projects/name.png'`.
 */
export const projects = [
  {
    id: 'miarcus',
    name: 'MIARCUS',
    subtitle: 'Enterprise Retail Operations Platform',
    preview: 'dashboard',
    image: null,
    description:
      'Centralized platform for workforce and multi-store operations: users/roles, stores, departments, checklists, action points, billing, daily collections, sales teams, visit planning, announcements and reports.',
    tags: ['React', 'Node.js', 'MySQL'],
    links: { live: 'https://rytual2.miarcus.com', repo: 'https://github.com/Satya257680/miarcus' },
  },
  {
    id: 'vistarax',
    name: 'VistaraX',
    subtitle: 'Visitor Management System',
    preview: 'visitors',
    image: null,
    description:
      'Visitor check-in/check-out with searchable records, role-based access, dashboard insights, exports, real-time Socket.IO notifications and JWT authentication.',
    tags: ['Express.js', 'MySQL', 'Socket.IO'],
    links: { live: null, repo: 'https://github.com/Satya257680/Vistarax' },
  },
  {
    id: 'qr-attendance',
    name: 'QR Attendance',
    subtitle: 'QR Based Attendance System',
    preview: 'qr',
    image: null,
    description: 'An attendance management project built around QR-based attendance workflows.',
    tags: ['React', 'Node.js', 'MySQL'],
    // https://github.com/Satya257680/QR-Attendance was not publicly reachable when checked — paste it here once public.
    links: { live: null, repo: null },
  },
  {
    id: 'calculation-platform',
    name: 'Calculation Platform',
    subtitle: 'Personal Calculation Platform',
    preview: 'calculator',
    image: null,
    description: 'A personal calculation platform focused on practical calculation workflows.',
    tags: ['React', 'JavaScript', 'SQL'],
    // https://github.com/Satya257680/CalculationPlatform was not publicly reachable when checked — paste it here once public.
    links: { live: null, repo: null },
  },
];

export const moreProjectsUrl = 'https://github.com/Satya257680?tab=repositories';

export const education = [
  {
    qualification: 'B.Tech — Computer Science & Engineering',
    institution: 'Centurion University of Technology and Management',
    period: '2022 – Present',
    result: 'CGPA: 8.59',
  },
  {
    qualification: 'Intermediate — Science (CHSE)',
    institution: 'Bahanaga Higher Secondary School, Balasore',
    period: '2022',
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
    icon: 'medal',
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
    text: 'Decentralized web app using Avalanche, MetaMask and Bitcoin APIs — wallet authentication, on-chain transactions and balance verification.',
  },
];

// `level` sets the bar length: native = full, others shorter. No made-up percentages.
export const languages = [
  { name: 'Odia', level: 'Native', bar: 100 },
  { name: 'English', level: 'Communication', bar: 80 },
  { name: 'Hindi', level: 'Conversational', bar: 65 },
];
