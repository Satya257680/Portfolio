import { Glyph } from './SocialIcon.jsx';

// Decorative "Let's build something amazing together" laptop scene (pure SVG + CSS).
export default function ConnectIllustration() {
  return (
    <div className="connect-art" aria-hidden="true">
      <span className="connect-art__glow" />
      <span className="float-tile float-tile--github">
        <Glyph id="github" size={30} />
      </span>
      <span className="float-tile float-tile--linkedin">
        <Glyph id="linkedin" size={26} />
      </span>
      <span className="float-tile float-tile--mail">
        <Glyph id="mail" size={26} />
      </span>
      <span className="float-tile float-tile--small">
        <Glyph id="linkedin" size={16} />
      </span>

      <svg className="connect-art__laptop" viewBox="0 0 360 260">
        <defs>
          <linearGradient id="scr" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#4f46e5" />
            <stop offset="0.55" stopColor="#7c3aed" />
            <stop offset="1" stopColor="#2563eb" />
          </linearGradient>
          <linearGradient id="base" x1="0" x2="1">
            <stop offset="0" stopColor="#1e293b" />
            <stop offset="0.5" stopColor="#64748b" />
            <stop offset="1" stopColor="#1e293b" />
          </linearGradient>
        </defs>
        {/* screen */}
        <g transform="translate(70 18) skewY(-6)">
          <rect width="220" height="150" rx="10" fill="#0b1024" stroke="#6d7dff" strokeOpacity="0.7" strokeWidth="2" />
          <rect x="8" y="8" width="204" height="134" rx="6" fill="url(#scr)" />
          <text x="22" y="54" fill="#fff" fontFamily="Poppins, sans-serif" fontSize="17" fontWeight="600" fontStyle="italic">
            Let’s
          </text>
          <text x="22" y="80" fill="#fff" fontFamily="Poppins, sans-serif" fontSize="17" fontWeight="600" fontStyle="italic">
            Build Something
          </text>
          <text x="22" y="106" fill="#fff" fontFamily="Poppins, sans-serif" fontSize="17" fontWeight="600" fontStyle="italic">
            Amazing Together
          </text>
          <text x="176" y="34" fill="#c7d2fe" fontFamily="monospace" fontSize="13">
            {'</>'}
          </text>
        </g>
        {/* keyboard base */}
        <path d="M40 200 L300 172 L340 196 L80 226 Z" fill="url(#base)" />
        <path d="M80 226 L340 196 L340 202 L82 233 Z" fill="#0f172a" />
        <path d="M90 204 L290 182 L310 194 L112 217 Z" fill="#0f172a" opacity="0.6" />
        {/* plant */}
        <g transform="translate(318 120)">
          <path d="M14 70 C2 50 4 24 0 6 M14 70 C18 44 30 30 34 10 M14 70 C10 50 22 40 18 22" stroke="#22c55e" strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M0 70h30l-4 26H4Z" fill="#7c2d12" />
        </g>
      </svg>
    </div>
  );
}
