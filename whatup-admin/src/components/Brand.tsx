// Served from public/ — same file the favicon uses (index.html).
const logoUrl = '/whatup-logo.png';

export function Brand({ size = 40 }: { size?: number }) {
  return (
    <div className="brand">
      <img src={logoUrl} alt="WhatUp logo" width={size} height={size} className="brand__logo" />
      <div className="brand__text">
        <span className="brand__name">
          What<span className="brand__name-accent">Up</span>
        </span>
        <span className="brand__tag">Admin</span>
      </div>
    </div>
  );
}
