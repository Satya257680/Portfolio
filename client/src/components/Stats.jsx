import { certifications, education, experienceStart, projects } from '../data/portfolioData.js';
import Icon from './Icon.jsx';

// Whole months since the job started — updates automatically, so the number is never inflated.
function monthsSince(iso) {
  const start = new Date(`${iso}T00:00:00`);
  const now = new Date();
  let m = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) m -= 1;
  return Math.max(m, 0);
}

export default function Stats() {
  const months = monthsSince(experienceStart);
  const cgpa = (education[0].result.match(/[\d.]+/) || ['—'])[0];
  const expValue = months >= 12 ? `${Math.floor(months / 12)}+` : `${months}+`;
  const expLabel = months >= 12 ? 'Years Experience' : 'Months Experience';

  const items = [
    { icon: 'team', tone: 'blue', value: expValue, label: expLabel },
    { icon: 'tool', tone: 'cyan', value: `${projects.length}+`, label: 'Projects Built' },
    { icon: 'cap', tone: 'violet', value: cgpa, label: 'CGPA (B.Tech)' },
    { icon: 'award', tone: 'green', value: `${certifications.length}`, label: 'Certifications & Awards' },
  ];

  return (
    <ul className="stats glass" aria-label="Highlights">
      {items.map((s) => (
        <li key={s.label} className="stats__item">
          <span className={`tone-icon tone-icon--lg tone-icon--${s.tone}`} aria-hidden="true">
            <Icon name={s.icon} size={24} />
          </span>
          <span>
            <span className="stats__value">{s.value}</span>
            <span className="stats__label">{s.label}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
