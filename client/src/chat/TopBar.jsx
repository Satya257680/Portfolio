import Icon from '../components/Icon.jsx';
import { profile } from '../data/portfolioData.js';

// Top bar of the chat card: menu, profile, "Portfolio Chat", close (back to the portfolio).
export default function TopBar({ mode, menu = null, ownerOnline = false }) {
  return (
    <header className="ctop">
      <div className="ctop__left">
        {menu}
        <a href="/" className="ctop__brand" aria-label="Satyajit Nayak — back to portfolio">
          <span className="ctop__avatar">
            <img src={profile.avatar} alt="" width="44" height="44" />
            {ownerOnline ? <span className="cavatar__online" aria-hidden="true" /> : null}
          </span>
          <span className="ctop__text">
            <span className="ctop__name">
              {profile.firstName} <span className="ctop__accent">{profile.lastName}</span>
            </span>
            <span className="ctop__sub">{mode === 'admin' ? 'Portfolio Chat · Admin' : 'Portfolio Chat'}</span>
          </span>
        </a>
      </div>
      <a href={mode === 'admin' ? '/' : '/#contact'} className="cicon-btn ctop__close" aria-label="Close chat and return to the portfolio">
        <Icon name="close" size={22} />
      </a>
    </header>
  );
}
