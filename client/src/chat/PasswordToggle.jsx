import Icon from '../components/Icon.jsx';

// Eye / eye-off button that shows or hides ONE password input (identified by `controls`).
// It is a real <button type="button">, so it never submits the form, and it is keyboard
// focusable with a visible focus ring (see .cpassword-toggle in chat.css).
// The password value itself is never read, logged or stored here.
export default function PasswordToggle({ shown, onToggle, controls }) {
  const label = shown ? 'Hide password' : 'Show password';
  return (
    <button
      type="button"
      className={`cpassword-toggle ${shown ? 'is-shown' : ''}`}
      onClick={onToggle}
      aria-label={label}
      aria-controls={controls}
      title={label}
    >
      <Icon name={shown ? 'eyeOff' : 'eye'} size={20} />
    </button>
  );
}
