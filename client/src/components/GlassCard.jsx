import useReveal from '../hooks/useReveal.js';

// Reusable translucent card. `as` lets it render as article/li/div etc.
export default function GlassCard({ as: Tag = 'div', className = '', children, hover = true, ...rest }) {
  const ref = useReveal();
  return (
    <Tag ref={ref} className={`glass reveal ${hover ? 'glass--hover' : ''} ${className}`} {...rest}>
      {children}
    </Tag>
  );
}
