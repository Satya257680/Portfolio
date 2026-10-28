import { useEffect, useState } from 'react';
import { navLinks, profile } from '../data/portfolioData.js';
import useActiveSection from '../hooks/useActiveSection.js';
import Icon from './Icon.jsx';

const sectionIds = navLinks.map((l) => l.id);

export default function Navbar({ theme, onToggleTheme }) {
  const active = useActiveSection(sectionIds) || 'home';
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const isDark = theme === 'dark';

  return (
    <header className={`navbar ${scrolled ? 'navbar--scrolled' : ''}`}>
      <nav className="navbar__inner container" aria-label="Main navigation">
        <a href="#home" className="brand" onClick={() => setOpen(false)}>
          <span className="brand__avatar">
            <img src={profile.avatar} alt="" width="44" height="44" />
            <span className="brand__online" aria-hidden="true" />
          </span>
          <span className="brand__text">
            <span className="brand__name">
              {profile.firstName} <span className="grad-text">{profile.lastName}</span>
            </span>
            <span className="brand__sub">{profile.navSubtitle}</span>
          </span>
        </a>

        <ul id="nav-menu" className={`navbar__links ${open ? 'is-open' : ''}`}>
          {navLinks.map((link) => (
            <li key={link.id}>
              <a
                href={`#${link.id}`}
                className={active === link.id ? 'is-active' : ''}
                aria-current={active === link.id ? 'true' : undefined}
                onClick={() => setOpen(false)}
              >
                {link.label}
              </a>
            </li>
          ))}
          <li className="navbar__menu-resume">
            <a href={profile.resumeFile} target="_blank" rel="noopener noreferrer" className="btn btn--outline btn--small">
              View Resume <Icon name="external" size={16} />
            </a>
          </li>
        </ul>

        <div className="navbar__actions">
          <button
            type="button"
            className={`theme-toggle ${isDark ? 'is-dark' : 'is-light'}`}
            onClick={onToggleTheme}
            aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
            aria-pressed={!isDark}
          >
            <Icon name="sun" size={15} className="theme-toggle__sun" />
            <span className="theme-toggle__knob" aria-hidden="true" />
            <Icon name="moon" size={14} className="theme-toggle__moon" />
          </button>
          <a href={profile.resumeFile} target="_blank" rel="noopener noreferrer" className="btn btn--outline btn--small navbar__resume">
            View Resume <Icon name="external" size={16} />
          </a>
          <button
            type="button"
            className="navbar__toggle"
            aria-expanded={open}
            aria-controls="nav-menu"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((v) => !v)}
          >
            <Icon name={open ? 'close' : 'menu'} size={22} />
          </button>
        </div>
      </nav>
    </header>
  );
}
