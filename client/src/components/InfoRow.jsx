import { certifications, education, languages } from '../data/portfolioData.js';
import { Glyph } from './SocialIcon.jsx';
import Icon from './Icon.jsx';
import SectionTitle from './SectionTitle.jsx';
import SkillLogo from './SkillLogo.jsx';

// Three-column band: Education · Certifications & Achievements · Languages
export default function InfoRow() {
  return (
    <div className="section section--band inforow-wrap">
      <div className="container inforow">
        <section id="education" className="inforow__col" aria-labelledby="education-title">
          <SectionTitle id="education" icon="cap" title="Education" />
          <ol className="edu-timeline">
            {education.map((e) => (
              <li key={e.qualification}>
                <span className="edu-timeline__badge" aria-hidden="true">
                  <Icon name="cap" size={18} />
                </span>
                <div>
                  <h3>{e.qualification}</h3>
                  <p>{e.institution}</p>
                  <p className="edu-timeline__meta">
                    {e.period} <span aria-hidden="true">|</span> <strong>{e.result}</strong>
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section id="certifications" className="inforow__col" aria-labelledby="certifications-title">
          <SectionTitle id="certifications" icon="medal" title="Certifications & Achievements" />
          <ul className="cert-list">
            {certifications.map((c) => (
              <li key={c.title}>
                <span className={`cert-list__icon tone-text--${c.color}`} aria-hidden="true">
                  {c.icon === 'geeksforgeeks' ? <Glyph id="geeksforgeeks" size={26} /> : c.icon === 'sap' ? <SkillLogo name="sap" size={30} /> : <Icon name={c.icon} size={26} />}
                </span>
                <div>
                  <h3>{c.title}</h3>
                  <p>{c.subtitle}</p>
                  <p className="cert-list__date">{c.date}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="inforow__col" aria-labelledby="languages-title">
          <SectionTitle id="languages" icon="languages" title="Languages" />
          <ul className="lang-list">
            {languages.map((l) => (
              <li key={l.name}>
                <div className="lang-list__row">
                  <strong>{l.name}</strong>
                  <span>{l.level}</span>
                </div>
                <div className="lang-list__track" aria-hidden="true">
                  <span style={{ width: `${l.bar}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
