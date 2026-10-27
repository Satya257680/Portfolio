import { contact, navLinks, profile, socials } from '../data/portfolioData.js';
import Icon from './Icon.jsx';
import SocialIcon from './SocialIcon.jsx';

export default function Footer() {
  const footerSocials = [
    ...socials.filter((s) => ['linkedin', 'github', 'instagram', 'youtube'].includes(s.id)),
    { id: 'mail', label: `Email ${contact.email}`, url: `mailto:${contact.email}` },
    { id: 'whatsapp', label: 'WhatsApp', url: contact.whatsapp },
  ];
  return (
    <footer className="footer">
      <div className="container footer__inner">
        <p className="footer__copy">© {new Date().getFullYear()} {profile.name}. All rights reserved.</p>
        <nav aria-label="Footer">
          <ul className="footer__links">
            {navLinks.map((l) => (
              <li key={l.id}>
                <a href={`#${l.id}`}>{l.label}</a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="footer__right">
          <div className="footer__socials">
            {footerSocials.map((s) => (
              <SocialIcon key={s.id} id={s.id} href={s.url} label={s.label} className="social-icon--sm" />
            ))}
          </div>
          <a href="#home" className="to-top" aria-label="Back to top">
            <Icon name="arrowUp" size={18} />
          </a>
        </div>
      </div>
    </footer>
  );
}
