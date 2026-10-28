import { useState } from 'react';
import { skillDetails, skills } from '../data/portfolioData.js';
import Icon from './Icon.jsx';
import SectionTitle from './SectionTitle.jsx';
import SkillLogo from './SkillLogo.jsx';

export default function Skills() {
  const [showAll, setShowAll] = useState(false);
  return (
    <section id="skills" className="section" aria-labelledby="skills-title">
      <div className="container">
        <SectionTitle
          id="skills"
          icon="gear"
          title="Tech Stack"
          action={
            <button
              type="button"
              className="btn btn--outline btn--small"
              aria-expanded={showAll}
              aria-controls="skills-detail"
              onClick={() => setShowAll((v) => !v)}
            >
              {showAll ? 'Hide Details' : 'View All Skills'}
            </button>
          }
        />

        <ul className="skill-chips">
          {skills.map((s) => (
            <li key={s.name} className="skill-chip glass">
              <SkillLogo name={s.logo} size={22} />
              <span>{s.name}</span>
            </li>
          ))}
        </ul>

        <div id="skills-detail" className="skill-groups" hidden={!showAll}>
          {Object.entries(skillDetails).map(([group, list]) => (
            <div key={group} className="skill-group glass">
              <h3>
                <Icon name="layers" size={16} /> {group}
              </h3>
              <p>{list.join(' · ')}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
