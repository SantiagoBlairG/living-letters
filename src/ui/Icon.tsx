const PATHS = {
  sound: <><path d="M3 6.5h2.2L8.5 4v8L5.2 9.5H3z" fill="currentColor" stroke="none" /><path d="M10.8 5.6a3.4 3.4 0 0 1 0 4.8M12.6 3.8a6 6 0 0 1 0 8.4" /></>,
  mute: <><path d="M3 6.5h2.2L8.5 4v8L5.2 9.5H3z" fill="currentColor" stroke="none" /><path d="M11 6.2l3 3.6M14 6.2l-3 3.6" /></>,
  sliders: <><path d="M2.5 5h5M11.5 5h2M2.5 11h2M8.5 11h5" /><circle cx="9.5" cy="5" r="1.8" /><circle cx="6.5" cy="11" r="1.8" /></>,
  reset: <><path d="M3.2 8a4.8 4.8 0 1 0 1.5-3.5" /><path d="M3 2.8v2.6h2.6" /></>,
  download: <><path d="M8 2.5v7.2M5 7l3 3 3-3M3 13h10" /></>,
  sparkle: <><path d="M8 2.2l1.3 3.5 3.5 1.3-3.5 1.3L8 11.8 6.7 8.3 3.2 7l3.5-1.3z" fill="currentColor" stroke="none" /><path d="M12.6 11v2.4M11.4 12.2h2.4" /></>,
};

/** Small line icons for the interface, drawn on a 16px grid in the current text colour. */
export function Icon({ name }: { name: keyof typeof PATHS }) {
  return (
    <svg className="icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {PATHS[name]}
    </svg>
  );
}
