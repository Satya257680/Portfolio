import { contact, heroInfo, profile, socials } from '../data/portfolioData.js';
import Icon from './Icon.jsx';
import SocialIcon from './SocialIcon.jsx';
import Stats from './Stats.jsx';

const heroSocials = ['linkedin', 'github', 'mail', 'whatsapp'];

function HeroWaves() {
  // Decorative neon light ribbons drawn with SVG (no images).
  return (
    <svg className="hero__waves" viewBox="0 0 1440 720" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="wave-a" x1="0" x2="1">
          <stop offset="0" stopColor="#3b6bff" stopOpacity="0" />
          <stop offset="0.45" stopColor="#4f7cff" stopOpacity="0.9" />
          <stop offset="1" stopColor="#a855f7" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="wave-b" x1="0" x2="1">
          <stop offset="0" stopColor="#a855f7" stopOpacity="0" />
          <stop offset="0.6" stopColor="#c084fc" stopOpacity="0.8" />
          <stop offset="1" stopColor="#3b82f6" stopOpacity="0" />
        </linearGradient>
        <filter id="wave-glow" x="-10%" y="-50%" width="120%" height="200%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>
      <g fill="none" strokeLinecap="round">
        <path d="M380 640C620 520 760 300 1000 260s300 60 440-40" stroke="url(#wave-a)" strokeWidth="14" filter="url(#wave-glow)" opacity="0.55" />
        <path d="M380 640C620 520 760 300 1000 260s300 60 440-40" stroke="url(#wave-a)" strokeWidth="2" />
        <path d="M520 700C760 600 880 420 1100 360s260 10 340-60" stroke="url(#wave-b)" strokeWidth="10" filter="url(#wave-glow)" opacity="0.5" />
        <path d="M520 700C760 600 880 420 1100 360s260 10 340-60" stroke="url(#wave-b)" strokeWidth="1.5" />
        <path d="M700 80c180 120 300 140 460 90s220-90 280-70" stroke="url(#wave-b)" strokeWidth="1.2" opacity="0.7" />
        <path d="M0 520c160-40 260-20 380 40" stroke="url(#wave-a)" strokeWidth="1.2" opacity="0.5" />
      </g>
    </svg>
  );
}

export default function Hero() {
  const hrefFor = (id) =>
    id === 'mail' ? `mailto:${contact.email}` : id === 'whatsapp' ? contact.whatsapp : socials.find((s) => s.id === id)?.url;
  const labelFor = (id) => (id === 'mail' ? `Email ${contact.email}` : socials.find((s) => s.id === id)?.label);

  return (
    <section id="home" className="hero" aria-labelledby="hero-title">
      <div className="hero__bg" aria-hidden="true">
        <HeroWaves />
      </div>

      <div className="container">
        <div className="hero__grid">
          <div className="hero__copy">
            <p className="badge-available">
              <span className="dot" aria-hidden="true" />
              {profile.availability}
            </p>
            <p className="hero__hi">Hi, I’m</p>
            <h1 id="hero-title" className="hero__title">
              {profile.firstName} <span className="grad-text">{profile.lastName}</span>
            </h1>
            <p className="hero__role">{profile.headline}</p>
            <p className="hero__intro">{profile.intro}</p>

            <div className="hero__actions">
              <a href={profile.resumeFile} download className="btn btn--primary">
                Download Resume <Icon name="download" size={18} />
              </a>
              <a href="#projects" className="btn btn--outline">
                View My Work <Icon name="arrowRight" size={18} />
              </a>
            </div>

            <div className="hero__socials">
              {heroSocials.map((id) => (
                <SocialIcon key={id} id={id} href={hrefFor(id)} label={labelFor(id)} />
              ))}
            </div>
          </div>

          <div className="hero__photo-wrap">
            <figure className="hero__photo">
              <img src={profile.photo} alt={profile.photoAlt} width="640" height="800" fetchpriority="high" />
              <figcaption className="hero__signature" aria-hidden="true">
                {profile.name}
              </figcaption>
            </figure>
            <div className="hero__chip glass">
              <span className="hero__chip-icon" aria-hidden="true">
                <Icon name="code" size={18} />
              </span>
              <span>
                Full Stack
                <br />
                Developer
              </span>
            </div>
          </div>

          <div className="hero__side">
            <ul className="info-card glass">
              {heroInfo.map((row) => (
                <li key={row.label} className="info-card__row">
                  <span className={`tone-icon tone-icon--${row.color}`} aria-hidden="true">
                    <Icon name={row.icon} size={20} />
                  </span>
                  <span>
                    <span className="info-card__label">{row.label}</span>
                    {row.lines.map((l) => (
                      <span key={l} className="info-card__line">
                        {l}
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
            <blockquote className="quote-card glass">
              <span className="quote-card__mark" aria-hidden="true">
                “
              </span>
              <p>{profile.quote}</p>
              <span className="quote-card__mark quote-card__mark--end" aria-hidden="true">
                ”
              </span>
            </blockquote>
          </div>
        </div>

        <Stats />
      </div>
    </section>
  );
}
