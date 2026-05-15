// v1: placeholder banner generator. Returns a deterministic data-URL SVG so we
// have something visual without external API calls. Swap this module out when
// real image generation is wired up — the rest of the pipeline only cares
// about { url, alt }.

function hashHue(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 360;
}

export function generateBanner(opts: { title: string; brand: string }): {
  url: string;
  alt: string;
} {
  const hue = hashHue(opts.title);
  const safeTitle = opts.title.replace(/[<>&"]/g, "");
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 630'>
    <defs>
      <linearGradient id='g' x1='0' x2='1' y1='0' y2='1'>
        <stop offset='0%' stop-color='hsl(${hue}, 70%, 35%)'/>
        <stop offset='100%' stop-color='hsl(${(hue + 40) % 360}, 70%, 20%)'/>
      </linearGradient>
    </defs>
    <rect width='1200' height='630' fill='url(#g)'/>
    <text x='60' y='90' font-family='Inter, system-ui, sans-serif' font-size='28' fill='rgba(255,255,255,0.7)' font-weight='600'>${opts.brand}</text>
    <foreignObject x='60' y='150' width='1080' height='420'>
      <div xmlns='http://www.w3.org/1999/xhtml' style='font-family:Inter,system-ui,sans-serif;color:white;font-size:64px;font-weight:700;line-height:1.15;'>${safeTitle}</div>
    </foreignObject>
  </svg>`;
  const url = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  return { url, alt: `${opts.brand} — ${opts.title}` };
}
