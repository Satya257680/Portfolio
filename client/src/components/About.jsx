import { useState } from 'react';
import { about } from '../data/portfolioData.js';
import GlassCard from './GlassCard.jsx';
import Icon from './Icon.jsx';
import SectionTitle from './SectionTitle.jsx';

export default function About() {
  const [expanded, setExpanded] = useState(false);
  return (
    <section id="about" className="section section--band" aria-labelledby="about-title">
      <div className="container about">
        <div className="about__text">
          <SectionTitle id="about" icon="user" title="About Me" />
          {about.paragraphs.map((p) => (
            <p key={p.slice(0, 20)}>{p}</p>
          ))}
          <div id="about-more" className="about__more" hidden={!expanded}>
            {about.more.map((p) => (
              <p key={p.slice(0, 20)}>{p}</p>
            ))}
          </div>
          <button
            type="button"
            className="btn btn--outline btn--small about__toggle"
            aria-expanded={expanded}
            aria-controls="about-more"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? 'Show Less' : 'Read More'} <Icon name={expanded ? 'arrowUp' : 'arrowRight'} size={16} />
          </button>
        </div>

        <ul className="traits">
          {about.traits.map((t) => (
            <GlassCard as="li" key={t.title} className="trait">
              <span className={`trait__icon tone-text--${t.color}`} aria-hidden="true">
                <Icon name={t.icon} size={30} />
              </span>
              <h3>{t.title}</h3>
              <p>{t.text}</p>
            </GlassCard>
          ))}
        </ul>
      </div>
    </section>
  );
}
