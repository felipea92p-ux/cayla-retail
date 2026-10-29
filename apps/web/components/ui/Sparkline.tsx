/**
 * Mini-tendencia (ADR-0128): la forma de una serie en 46×18 px, sin ejes ni números — el número ya está
 * al lado; esto solo dice si sube, baja o si fue un solo mes. Se dibuja al llegar la fila y `pathLength=1`
 * hace que se pueda redibujar al pasar el mouse por ella (`.group:hover .trazo-al-pasar`, globals.css) sin medir la línea.
 * Sin datos (todo cero) no dibuja nada: una línea plana en cero no informa, ocupa lugar.
 * `lleno`: ocupa todo el ancho de su caja, 30 px de alto, con un área suave debajo (la franja de cifras de Tráfico, ADR-0568).
 */
export function Sparkline({
  serie,
  indice = 0,
  className = "",
  lleno = false,
}: {
  serie: number[];
  /** Posición de la fila: desfasa el trazo de entrada. */
  indice?: number;
  className?: string;
  /** Todo el ancho de su caja y 30 px de alto, con el área debajo de la línea. */
  lleno?: boolean;
}) {
  const max = Math.max(...serie, 0);
  if (max <= 0 || serie.length < 2) return null;
  // `lleno` se dibuja en un lienzo de la proporción real (200×30, estirado apenas) para que el trazo no se deforme: `vector-effect` rompería
  // el `pathLength` del que vive la animación del trazo (la línea salía cortada en pedazos).
  const [ancho, alto] = lleno ? [200, 30] : [46, 18];
  const puntos = serie.map((v, i) => `${((i / (serie.length - 1)) * ancho).toFixed(1)},${(alto - 1 - (v / max) * (alto - 3)).toFixed(1)}`);
  const trazo = `M${puntos.join(" L")}`;
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${ancho} ${alto}`}
      preserveAspectRatio={lleno ? "none" : undefined}
      className={`${lleno ? "block h-[30px] w-full" : "h-[18px] w-[46px] shrink-0"} overflow-visible ${className}`}
    >
      {lleno && <path d={`${trazo} L${ancho},${alto} L0,${alto} Z`} className="fill-tinta/[0.07]" />}
      <path
        d={trazo}
        pathLength={1}
        fill="none"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        stroke="currentColor"
        className={`trazo-linea anim-trazo trazo-al-pasar transition-colors duration-300 group-hover:text-tinta ${lleno ? "text-tinta/60" : "text-tinta/30"}`}
        style={{ ["--i" as string]: indice }}
      />
    </svg>
  );
}
