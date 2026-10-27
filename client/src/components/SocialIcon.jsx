import { brands } from '../data/brandIcons.js';
import Icon from './Icon.jsx';

// Round glass icon link for socials (brand glyph in current colour).
export function Glyph({ id, size = 18 }) {
  if (id === 'mail') return <Icon name="mail" size={size} />;
  const b = brands[id];
  if (!b) return <Icon name={id} size={size} />;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={b.path} fill="currentColor" />
    </svg>
  );
}

export default function SocialIcon({ id, href, label, className = '' }) {
  const external = /^https?:/.test(href);
  return (
    <a
      href={href}
      className={`social-icon social-icon--${id} ${className}`}
      aria-label={external ? `${label} (opens in a new tab)` : label}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      <Glyph id={id} />
    </a>
  );
}
