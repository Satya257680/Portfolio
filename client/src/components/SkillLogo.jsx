import { brands } from '../data/brandIcons.js';

// Brand logos (Simple Icons) plus a few hand-drawn ones that Simple Icons doesn't include.
const custom = {
  vscode: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#0065A9" d="M17.6 1.2 9.3 8.8 4.2 4.9 2 6v12l2.2 1.1 5.1-3.9 8.3 7.6L22 20.6V3.4l-4.4-2.2Z" />
      <path fill="#007ACC" d="M17.6 6.6v10.8L10.4 12l7.2-5.4ZM4.2 9l2.7 3-2.7 3V9Z" />
      <path fill="#1F9CF0" d="M22 3.4 17.6 1.2v21.6L22 20.6V3.4Z" />
    </svg>
  ),
  excel: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="7" y="2" width="15" height="20" rx="2" fill="#21A366" />
      <path fill="#107C41" d="M7 12h15v8a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-8Z" />
      <rect x="2" y="6" width="12" height="12" rx="1.8" fill="#185C37" />
      <path fill="#fff" d="m4.6 8.5h2l1.4 2.4 1.4-2.4h1.9l-2.3 3.5 2.4 3.5h-2l-1.4-2.5-1.5 2.5h-1.9l2.4-3.5-2.4-3.5Z" />
    </svg>
  ),
  word: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="7" y="2" width="15" height="20" rx="2" fill="#41A5EE" />
      <path fill="#2B7CD3" d="M7 9h15v6H7z" />
      <path fill="#185ABD" d="M7 15h15v5a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-5Z" />
      <rect x="2" y="6" width="12" height="12" rx="1.8" fill="#103F91" />
      <path fill="#fff" d="m3.8 8.5h1.6l.9 4.3 1-4.3h1.4l1 4.3.9-4.3h1.6l-1.7 7h-1.5L8 11.2l-1 4.3H5.5l-1.7-7Z" />
    </svg>
  ),
  sql: (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7">
      <ellipse cx="12" cy="5.5" rx="7.5" ry="2.8" />
      <path d="M4.5 5.5v13c0 1.55 3.36 2.8 7.5 2.8s7.5-1.25 7.5-2.8v-13M4.5 12c0 1.55 3.36 2.8 7.5 2.8s7.5-1.25 7.5-2.8" />
    </svg>
  ),
  api: (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="#34d399" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M12 2.5 20 6v6c0 4.6-3.3 8.3-8 9.5C7.3 20.3 4 16.6 4 12V6l8-3.5Z" />
      <path d="m9.5 10-2 2 2 2M14.5 10l2 2-2 2" strokeLinecap="round" />
    </svg>
  ),
};

// Brands whose own colour is too dark on the dark theme use the text colour instead.
const monochrome = new Set(['express', 'github', 'mysql', 'socketdotio', 'jsonwebtokens']);

export default function SkillLogo({ name, size = 22 }) {
  if (custom[name]) {
    return (
      <span className={`skill-logo skill-logo--${name}`} style={{ width: size, height: size }}>
        {custom[name]}
      </span>
    );
  }
  const b = brands[name];
  if (!b) return null;
  return (
    <span className={`skill-logo skill-logo--${name}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d={b.path} fill={monochrome.has(name) ? 'currentColor' : b.hex} />
      </svg>
    </span>
  );
}
