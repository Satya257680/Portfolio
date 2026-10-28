import { profile } from '../data/portfolioData.js';
import Icon from '../components/Icon.jsx';
import { initials, toneFor } from './chatUtils.js';

// Owner → profile photo; group → people icon; visitor → coloured initials.
export default function Avatar({ name, id, isOwner = false, group = false, online = false, size = 44 }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.36) };
  return (
    <span className="cavatar" style={style} aria-hidden="true">
      {isOwner ? (
        <img src={profile.avatar} alt="" width={size} height={size} />
      ) : group ? (
        <span className="cavatar__inner cavatar__inner--group">
          <Icon name="team" size={Math.round(size * 0.5)} />
        </span>
      ) : (
        <span className="cavatar__inner" style={toneFor(id)}>
          {initials(name)}
        </span>
      )}
      {online ? <span className="cavatar__online" /> : null}
    </span>
  );
}
