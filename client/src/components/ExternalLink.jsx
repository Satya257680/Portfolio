// Safe external link: opens in a new tab with rel="noopener noreferrer".
export default function ExternalLink({ href, children, ...rest }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
      {children}
    </a>
  );
}
