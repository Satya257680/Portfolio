import { moreProjectsUrl, projects } from '../data/portfolioData.js';
import ExternalLink from './ExternalLink.jsx';
import GlassCard from './GlassCard.jsx';
import Icon from './Icon.jsx';
import ProjectPreview from './ProjectPreview.jsx';
import SectionTitle from './SectionTitle.jsx';

function ProjectCard({ p }) {
  const mainLink = p.links.repo || p.links.live;
  return (
    <GlassCard as="article" className="project">
      <div className="project__media">
        {p.image ? <img src={p.image} alt={`${p.name} screenshot`} loading="lazy" /> : <ProjectPreview type={p.preview} />}
      </div>
      <div className="project__body">
        <div className="project__head">
          <div>
            <h3>{p.name}</h3>
            <p className="project__subtitle">{p.subtitle}</p>
          </div>
          {mainLink ? (
            <ExternalLink href={mainLink} className="project__open" aria-label={`Open ${p.name} (new tab)`}>
              <Icon name="external" size={18} />
            </ExternalLink>
          ) : null}
        </div>
        <p className="project__desc">{p.description}</p>
        <ul className="project__tags">
          {p.tags.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <div className="project__links">
          {p.links.live ? (
            <ExternalLink href={p.links.live} className="text-link">
              Live <Icon name="arrowUpRight" size={14} />
            </ExternalLink>
          ) : null}
          {p.links.repo ? (
            <ExternalLink href={p.links.repo} className="text-link">
              Code <Icon name="arrowUpRight" size={14} />
            </ExternalLink>
          ) : null}
          {!p.links.live && !p.links.repo ? <span className="project__note">Source code on request</span> : null}
        </div>
      </div>
    </GlassCard>
  );
}

export default function Projects() {
  return (
    <section id="projects" className="section" aria-labelledby="projects-title">
      <div className="container">
        <SectionTitle
          id="projects"
          icon="layers"
          title="Featured Projects"
          action={
            <ExternalLink href={moreProjectsUrl} className="btn btn--outline btn--small">
              View All Projects
            </ExternalLink>
          }
        />
        <div className="projects">
          {projects.map((p) => (
            <ProjectCard key={p.id} p={p} />
          ))}
        </div>
      </div>
    </section>
  );
}
