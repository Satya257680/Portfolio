import Icon from './Icon.jsx';

// Section header: glowing icon + title with gradient underline + optional action on the right.
export default function SectionTitle({ id, icon, title, action }) {
  return (
    <div className="section-title">
      <span className={`section-title__icon section-title__icon--${icon}`} aria-hidden="true">
        <Icon name={icon} size={26} />
      </span>
      <h2 id={`${id}-title`}>{title}</h2>
      {action ? <div className="section-title__action">{action}</div> : null}
    </div>
  );
}
