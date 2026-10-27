// Illustrated UI previews for project cards (CSS/SVG artwork, not screenshots).
// Replace with a real screenshot by setting `image` on the project in portfolioData.js.

function Chrome({ children, tone = 'light' }) {
  return (
    <div className={`pv pv--${tone}`}>
      <div className="pv__bar">
        <i />
        <i />
        <i />
        <span className="pv__url" />
      </div>
      <div className="pv__body">{children}</div>
    </div>
  );
}

function Dashboard() {
  return (
    <Chrome>
      <div className="pv-dash">
        <aside className="pv-side pv-side--navy">
          <b />
          {Array.from({ length: 7 }, (_, i) => (
            <span key={i} />
          ))}
        </aside>
        <div className="pv-main">
          <div className="pv-line pv-line--title" />
          <div className="pv-tiles">
            <span className="t-blue" />
            <span className="t-green" />
            <span className="t-amber" />
            <span className="t-pink" />
          </div>
          <div className="pv-bars">
            {[40, 65, 50, 80, 58, 90, 70, 62].map((h, i) => (
              <span key={i} style={{ height: `${h}%` }} />
            ))}
          </div>
        </div>
      </div>
    </Chrome>
  );
}

function Visitors() {
  return (
    <Chrome>
      <div className="pv-dash">
        <aside className="pv-side pv-side--maroon">
          <b />
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} />
          ))}
        </aside>
        <div className="pv-main">
          <div className="pv-line pv-line--title" />
          <div className="pv-split">
            <div className="pv-table">
              {Array.from({ length: 5 }, (_, i) => (
                <span key={i}>
                  <em />
                  <em />
                  <em className={i % 2 ? 'ok' : 'in'} />
                </span>
              ))}
            </div>
            <div className="pv-donut" />
          </div>
        </div>
      </div>
    </Chrome>
  );
}

// Deterministic QR-style pattern (decorative only).
function QrArt() {
  const n = 21;
  const cells = [];
  let seed = 7;
  const rnd = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const inFinder = (x, y) => (x < 8 && y < 8) || (x > n - 9 && y < 8) || (x < 8 && y > n - 9);
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      if (!inFinder(x, y) && rnd() > 0.52) cells.push(<rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" />);
    }
  }
  const finder = (x, y) => (
    <g key={`f${x}${y}`}>
      <rect x={x} y={y} width="7" height="7" />
      <rect x={x + 1} y={y + 1} width="5" height="5" fill="#fff" />
      <rect x={x + 2} y={y + 2} width="3" height="3" />
    </g>
  );
  return (
    <svg viewBox="-1 -1 23 23" className="pv-qr__code" aria-hidden="true">
      <rect x="-1" y="-1" width="23" height="23" fill="#fff" />
      <g fill="#111827">
        {cells}
        {finder(0, 0)}
        {finder(n - 7, 0)}
        {finder(0, n - 7)}
      </g>
    </svg>
  );
}

function Qr() {
  return (
    <div className="pv pv--qr">
      <div className="pv-qr">
        <div className="pv-qr__card">
          <QrArt />
        </div>
        <div className="pv-qr__phone">
          <div className="pv-line pv-line--title" />
          <span className="pv-qr__check">✓</span>
          <div className="pv-line" />
          <div className="pv-line pv-line--short" />
        </div>
      </div>
    </div>
  );
}

function Calculator() {
  return (
    <Chrome>
      <div className="pv-calc">
        <div className="pv-calc__card">
          <div className="pv-line pv-line--title" />
          <span className="pv-input" />
          <span className="pv-input" />
          <span className="pv-input" />
          <span className="pv-btn" />
        </div>
      </div>
    </Chrome>
  );
}

const previews = { dashboard: Dashboard, visitors: Visitors, qr: Qr, calculator: Calculator };

export default function ProjectPreview({ type }) {
  const C = previews[type] || Dashboard;
  return <C />;
}
