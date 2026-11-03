const P = {
  back: 'M15 18l-6-6 6-6',
  next: 'M9 18l6-6-6-6',
  search: 'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3',
  folder: 'M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z',
  plus: 'M12 5v14M5 12h14',
  gear: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  play: 'M7 4.5v15l13-7.5z',
  pause: 'M8 5v14M16 5v14',
  prev: 'M15 18l-6-6 6-6',
  skipb: 'M6 5v14M19 5l-9 7 9 7z',
  skipf: 'M18 5v14M5 5l9 7-9 7z',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z',
  drop: 'M12 3s6 6.6 6 11a6 6 0 11-12 0c0-4.4 6-11 6-11z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  more: 'M12 5h.01M12 12h.01M12 19h.01',
  star: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  edit: 'M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4',
  move: 'M3 7h6l2 2h10v10H3zM12 12v5M9.5 14.5L12 12l2.5 2.5',
  close: 'M6 6l12 12M18 6L6 18',
  layers: 'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5',
  sliders: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4',
  refresh: 'M20 11A8 8 0 006 6.3L4 8M4 4v4h4M4 13a8 8 0 0014 4.7l2-1.7M20 20v-4h-4',
  book: 'M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2V5zM4 21h15',
  sun: 'M12 16a4 4 0 100-8 4 4 0 000 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z',
  scroll: 'M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4',
  eyeoff: 'M3 3l18 18M10.6 6.1A9.7 9.7 0 0112 6c6 0 10 6 10 6a17 17 0 01-3.2 3.7M6.6 7.6A17 17 0 002 12s4 7 10 7a9.6 9.6 0 004-.9',
  collection: 'M5 7h14M7 3h10M4 11h16v10H4z',
};

export function Icon({ n, size = 22, sw = 1.9, fill = false, class: c = '' }) {
  return (
    <svg class={'ic ' + c} width={size} height={size} viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke="currentColor" stroke-width={sw} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d={P[n]} />
    </svg>
  );
}

export function Logo({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#ffb066" />
          <stop offset="1" stop-color="#ff5a00" />
        </linearGradient>
      </defs>
      <path d="M24 4c7 8 13 15 13 23a13 13 0 01-26 0C11 19 17 12 24 4z" fill="url(#lg)" />
      <path d="M17 29c0 4 3 7 7 7" stroke="#fff" stroke-opacity=".7" stroke-width="2.4" stroke-linecap="round" fill="none" />
    </svg>
  );
}
