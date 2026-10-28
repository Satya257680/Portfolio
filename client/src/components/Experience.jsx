import { experience } from '../data/portfolioData.js';
import GlassCard from './GlassCard.jsx';
import SectionTitle from './SectionTitle.jsx';

export default function Experience() {
  return (
    <section id="experience" className="section section--band" aria-labelledby="experience-title">
      <div className="container">
        <SectionTitle id="experience" icon="briefcase" title="Professional Experience" />
        {experience.map((job) => (
          <GlassCard as="article" key={job.role} className="job" hover={false}>
            {job.current ? <span className="job__present">Present</span> : null}
            <div className="job__head">
              <span className="company-logo" aria-hidden="true">
                <img src="/projects/miarcus-logo.png" alt="" />
              </span>
              <div>
                <h3>{job.role}</h3>
                <p className="job__company">{job.company}</p>
                <p className="job__period">{job.period}</p>
              </div>
            </div>
            <ul className="job__points">
              {job.points.map((p) => (
                <li key={p.slice(0, 24)}>{p}</li>
              ))}
            </ul>
          </GlassCard>
        ))}
      </div>
    </section>
  );
}
