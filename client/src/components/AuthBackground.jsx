const OFFSETS = [0, 4, 8, 12, 16, 20];

function Swirl({ d }) {
  return (
    <g>
      {OFFSETS.map((o, i) => (
        <path
          key={o}
          d={d}
          transform={`translate(${o * 0.8} ${o})`}
          strokeWidth={Math.max(0.6, 3.2 - i * 0.5)}
          strokeOpacity={0.9 - i * 0.12}
        />
      ))}
    </g>
  );
}

export default function AuthBackground({ children }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-brand-600 via-brand-600 to-brand-500 px-4 py-6 md:justify-start md:pl-[9vw]">
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 1200 800"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="ep-wind" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1200" y2="0">
            <stop offset="0" stopColor="#C8E6E2" stopOpacity="0" />
            <stop offset="0.5" stopColor="#63C1BB" stopOpacity="0.9" />
            <stop offset="1" stopColor="#C8E6E2" stopOpacity="0.45" />
          </linearGradient>
          <filter id="ep-wind-glow" x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="1.6" />
          </filter>
        </defs>
        <g fill="none" stroke="url(#ep-wind)" strokeLinecap="round" filter="url(#ep-wind-glow)">
          <Swirl d="M700 520 C760 300 1000 220 1120 330 C1210 415 1150 560 1030 560 C940 560 900 480 950 420" />
          <Swirl d="M520 700 C700 560 900 640 1100 520 C1180 470 1220 400 1200 340" />
          <Swirl d="M600 160 C760 90 960 120 1160 210" />
          <Swirl d="M80 640 C200 700 380 700 460 600 C520 520 470 440 400 470" />
        </g>
      </svg>

      <div className="relative z-10 w-full max-w-md">{children}</div>
    </div>
  );
}