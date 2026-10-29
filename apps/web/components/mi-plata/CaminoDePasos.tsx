import { Fragment, type ReactNode } from "react";
import { Check } from "lucide-react";

// El camino de una tarea en tramos con nombre (maqueta docs/maquetas/mis-compras-rediseno-2026-10/, Felipe 2026-10-24): una raya por paso
// que dice en cuál vas y cuáles faltan. Lo hecho va en verde con su ✓, el de ahora en tinta y en seminegrita, lo que falta en arena. Lo usan
// el camino de la ronda («Abre tu ronda · Anota · Manda · Ciérrala») y los 3 pasos de «Apunte de compras». Sin JavaScript propio: la dibuja el
// servidor. `ahora` fuera de 0…pasos−1 pinta todo como hecho (la tarea terminó).
//
// `enLinea` (Mis compras en PC, maqueta mis-compras-pc-mesa-2026-10, Felipe 2026-10-28): desde `lg`, en vez de las rayitas, un paso a paso a todo el
// ancho —el círculo de cada paso unido al siguiente por una línea— y, a su derecha, `lado` («Ronda RC-000004 · desde hoy 17:36»). En el celular
// siguen las rayitas, con `lado` debajo. Las dos versiones viven en el DOM y una sola se ve (la otra, `display: none`: el lector lee una).
export function CaminoDePasos({
  pasos,
  ahora,
  etiqueta,
  guia,
  enLinea = false,
  lado,
}: {
  pasos: readonly string[];
  ahora: number;
  etiqueta: string;
  guia?: string;
  enLinea?: boolean;
  lado?: ReactNode;
}) {
  const rayitas = (
    <ol
      aria-label={etiqueta}
      data-guia={enLinea ? undefined : guia}
      className={`grid gap-1 ${enLinea ? "lg:hidden" : ""}`}
      style={{ gridTemplateColumns: `repeat(${pasos.length}, minmax(0, 1fr))` }}
    >
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
  if (!enLinea) return rayitas;
  return (
    <div data-guia={guia}>
      {rayitas}
      {lado && <p className="mt-2 text-xs text-taupe lg:hidden">{lado}</p>}
      <div className="hidden items-center gap-5 lg:flex">
        <ol aria-label={etiqueta} className="flex min-w-0 flex-1 items-center">
          {pasos.map((p, i) => {
            const hecho = i < ahora;
            const enCurso = i === ahora;
            return (
              <Fragment key={p}>
                <li aria-current={enCurso ? "step" : undefined} className={`flex shrink-0 items-center gap-2 text-sm ${hecho ? "text-verde" : enCurso ? "font-semibold text-tinta" : "text-taupe"}`}>
                  <span
                    aria-hidden
                    className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${hecho ? "bg-verde/15 text-verde" : enCurso ? "bg-tinta text-crema" : "bg-sand text-taupe"}`}
                  >
                    {hecho ? <Check className="h-3 w-3" /> : i + 1}
                  </span>
                  <span className="whitespace-nowrap">
                    {p}
                    {hecho && <span className="sr-only"> (hecho)</span>}
                  </span>
                </li>
                {/* La línea que une un paso con el siguiente: todas del mismo largo, sea cual sea el texto de cada paso. */}
                {i < pasos.length - 1 && <li aria-hidden className={`mx-3 h-0.5 min-w-5 flex-1 rounded-full ${hecho ? "bg-verde/55" : "bg-sand"}`} />}
              </Fragment>
            );
          })}
        </ol>
        {lado && <span className="whitespace-nowrap text-xs text-taupe">{lado}</span>}
      </div>
    </div>
  );
}
