import { brands } from '../data/brandIcons.js';

// Brand logos (Simple Icons) plus a few hand-drawn ones that Simple Icons doesn't include.
const custom = {
  java: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#E76F00" d="M12.1 1.2c2.7 2.1-2.5 4.1-1.7 6.1.4 1.1 2.2 1.7 2.2 3.2 0 1.1-.8 1.9-1.8 2.5.5-1.2-.1-2.1-1.1-3.1C7.5 7.8 8.4 5.7 12.1 1.2Z"/>
      <path fill="#5382A1" d="M6.3 14.3c-2.1.5-3.3 1.2-3.3 2.1 0 1.7 4.1 2.8 9 2.8s9-1.1 9-2.8c0-.9-1.2-1.6-3.3-2.1 1.1.5 1.7 1 1.7 1.5 0 1.1-3.3 1.9-7.4 1.9s-7.4-.8-7.4-1.9c0-.5.6-1 1.7-1.5Z"/>
      <path fill="#5382A1" d="M6.8 12.1c-1.5.5-2.3 1-2.3 1.6 0 1.2 3.3 2 7.5 2s7.5-.8 7.5-2c0-.6-.8-1.1-2.3-1.6.6.4.9.7.9 1 0 .8-2.7 1.4-6.1 1.4s-6.1-.6-6.1-1.4c0-.3.3-.6.9-1Z"/>
    </svg>
  ),
  springboot: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#6DB33F" d="M12 2.2c-4.9 0-8.9 4-8.9 8.9 0 4.1 2.8 7.6 6.6 8.6-.7-1.2-1-2.5-.9-3.8-1.7-1-2.9-2.7-3.2-4.7 1.4 1.7 3.1 2.5 5.1 2.5 3.7 0 6.8-3 6.8-6.8 0-1.2-.3-2.4-.9-3.4 1.6 1.6 2.5 3.8 2.5 6.2 0 5-4.1 9.1-9.1 9.1-.3 0-.7 0-1-.1A8.9 8.9 0 1 0 12 2.2Z"/>
      <path fill="#6DB33F" d="M14.2 1.5c.2 2.2-.7 4-2.5 5.5-1.2 1-2.1 2-2.2 3.5 2.9-.8 5.6-3.1 4.7-9Z"/>
    </svg>
  ),
  code: (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m8 5-6 7 6 7M16 5l6 7-6 7M14 3l-4 18"/>
    </svg>
  ),
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
