/** La franja decorativa del encabezado de Existencias (2026-09-22): prendas colgadas, en el mismo trazo
 *  fino que el isotipo de CAYLA (un solo grosor, sin relleno salvo la percha) — no hay foto real en el
 *  repo para esto, así que se dibuja en el idioma visual que la marca ya usa, en vez de fingir una que
 *  no existe. Puramente decorativa: `aria-hidden`, nunca compite con el texto de al lado. */
export function ExistenciasHero() {
  return (
    <svg viewBox="0 0 320 160" aria-hidden className="h-full w-full text-tinta">
      <rect width="320" height="160" rx="16" fill="var(--color-sand)" opacity="0.35" />
      <line x1="24" y1="34" x2="296" y2="34" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" />
      {[
        { x: 62, alto: 0, tono: 0.9 },
        { x: 122, alto: 10, tono: 0.55 },
        { x: 182, alto: -6, tono: 0.75 },
        { x: 242, alto: 6, tono: 0.4 },
      ].map((p, i) => (
        <g key={i} transform={`translate(${p.x} ${34 + p.alto})`} stroke="currentColor" strokeOpacity={p.tono} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d="M0 0v8" />
          <path d="M-16 8h32l6 8a4 4 0 0 1-4 6H-26a4 4 0 0 1-4-6z" />
          <path d="M-22 22v46a6 6 0 0 0 6 6h32a6 6 0 0 0 6-6V22" />
        </g>
      ))}
    </svg>
  );
}
