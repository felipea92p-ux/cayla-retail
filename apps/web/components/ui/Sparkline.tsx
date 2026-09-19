/**
 * Mini-tendencia (ADR-0122): la forma de una serie en 46×18 px, sin ejes ni números — el número ya está
 * al lado; esto solo dice si sube, baja o si fue un solo mes. `pathLength=1` hace que el trazo se pueda
 * redibujar al pasar el mouse por la fila (`.group:hover .trazo-al-pasar`, globals.css) sin medir la línea.
 * Sin datos (todo cero) no dibuja nada: una línea plana en cero no informa, ocupa lugar.
 */
export function Sparkline({ serie, className = "" }: { serie: number[]; className?: string }) {
  const max = Math.max(...serie, 0);
  if (max <= 0) return null;
  const puntos = serie.map((v, i) => `${((i / (serie.length - 1)) * 46).toFixed(1)},${(17 - (v / max) * 15).toFixed(1)}`);
  return (
    <svg aria-hidden viewBox="0 0 46 18" className={`h-[18px] w-[46px] shrink-0 overflow-visible ${className}`}>
      <path
        d={`M${puntos.join(" L")}`}
        pathLength={1}
        fill="none"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        stroke="currentColor"
        className="trazo-linea trazo-al-pasar text-tinta/30 transition-colors duration-300 group-hover:text-tinta"
      />
    </svg>
  );
}
