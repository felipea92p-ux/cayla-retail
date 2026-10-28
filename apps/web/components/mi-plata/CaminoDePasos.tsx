import { Check } from "lucide-react";

// El camino de una tarea en tramos con nombre (maqueta docs/maquetas/mis-compras-rediseno-2026-10/, Felipe 2026-10-24): una raya por paso
// que dice en cuál vas y cuáles faltan. Lo hecho va en verde con su ✓, el de ahora en tinta y en seminegrita, lo que falta en arena. Lo usan
// el camino de la ronda («Abre tu ronda · Anota · Manda · Ciérrala») y los 3 pasos de «Compré ropa». Sin JavaScript propio: la dibuja el
// servidor. `ahora` fuera de 0…pasos−1 pinta todo como hecho (la tarea terminó).
export function CaminoDePasos({ pasos, ahora, etiqueta, guia }: { pasos: readonly string[]; ahora: number; etiqueta: string; guia?: string }) {
  return (
    <ol aria-label={etiqueta} data-guia={guia} className="grid gap-1" style={{ gridTemplateColumns: `repeat(${pasos.length}, minmax(0, 1fr))` }}>
      {pasos.map((p, i) => {
        const hecho = i < ahora;
        const enCurso = i === ahora;
        return (
          <li
            key={p}
            aria-current={enCurso ? "step" : undefined}
            className={`flex min-w-0 flex-col items-start gap-1.5 text-xs leading-tight ${hecho ? "text-verde" : enCurso ? "font-semibold text-tinta" : "text-taupe"}`}
          >
            <span aria-hidden className={`block h-1 w-full rounded-full ${hecho ? "bg-verde" : enCurso ? "bg-tinta" : "bg-sand"}`} />
            <span className="inline-flex items-start gap-0.5">
              {hecho && <Check className="mt-px h-3 w-3 shrink-0" aria-hidden />}
              {p}
              {hecho && <span className="sr-only"> (hecho)</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
