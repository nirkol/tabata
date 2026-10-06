/** Stroke width of the progress ring around the counter (matches .ring-track / .ring-progress). */
export const RING_STROKE = 8;

/**
 * The progress ring drawn around the counter on the Run and Timer screens: a rounded
 * rectangle starting at the top center, going clockwise. `setFraction(1)` is full.
 */
export function createRing(): { svg: SVGSVGElement; draw(box: HTMLElement): void; setFraction(f: number): void } {
  const svgNs = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNs, 'svg');
  svg.setAttribute('class', 'ring');
  svg.setAttribute('aria-hidden', 'true');
  const track = document.createElementNS(svgNs, 'path');
  track.setAttribute('class', 'ring-track');
  const ring = document.createElementNS(svgNs, 'path');
  ring.setAttribute('class', 'ring-progress');
  ring.setAttribute('pathLength', '100');
  ring.setAttribute('data-testid', 'run-ring');
  svg.append(track, ring);
  return {
    svg,
    draw(box) {
      const w = box.clientWidth;
      const hgt = box.clientHeight;
      const i = RING_STROKE / 2;
      const r = Math.min(40, hgt / 4);
      const x0 = i, y0 = i, x1 = w - i, y1 = hgt - i;
      const cx = w / 2;
      const d = [
        `M ${cx} ${y0}`,
        `H ${x1 - r}`, `A ${r} ${r} 0 0 1 ${x1} ${y0 + r}`,
        `V ${y1 - r}`, `A ${r} ${r} 0 0 1 ${x1 - r} ${y1}`,
        `H ${x0 + r}`, `A ${r} ${r} 0 0 1 ${x0} ${y1 - r}`,
        `V ${y0 + r}`, `A ${r} ${r} 0 0 1 ${x0 + r} ${y0}`,
        `Z`,
      ].join(' ');
      svg.setAttribute('viewBox', `0 0 ${w} ${hgt}`);
      track.setAttribute('d', d);
      ring.setAttribute('d', d);
    },
    setFraction(f) {
      ring.style.strokeDashoffset = String(100 * (1 - f));
    },
  };
}
