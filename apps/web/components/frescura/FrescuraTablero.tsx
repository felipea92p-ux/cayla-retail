"use client";

import { Chip } from "@/components/ui/Chip";
import { BarraApilada } from "@/components/ui/BarraApilada";
import { CLASE_TRAMO_BARRA, NOMBRE_TRAMO_BARRA, TRAMOS_BARRA, segmentosDe, type FilaTablero } from "@/lib/frescura-pantalla";

// El tablero por categoría de Frescura del piso (nivel 1; ADR-0208, act. 2026-10-07, decisión 3 de Felipe): «¿Cómo está el piso?»
// de un vistazo. Una fila por categoría: su nombre y cuántas prendas cuelgan, la barra de sus unidades por estado (los colores A de
// los chips: verde recién llegada · neutro en su tiempo · ámbar se está quedando · tinta hay que moverla), cuántas esperan decisión
// y con qué vara se juzgó. Toda la fila es un botón: tocarla deja en la lista de abajo solo esa categoría (y otra vez, la suelta).
// La leyenda se dice UNA vez, al pie. Sin nada colgado, el tablero no se dibuja (el vacío lo dice la tabla).

export function FrescuraTablero({ filas, elegida, onElegir }: { filas: readonly FilaTablero[]; elegida: string | null; onElegir: (categoriaId: string | null) => void }) {
  if (filas.length === 0) return null;
  const conUnidades = TRAMOS_BARRA.filter((t) => filas.some((f) => f.unidades[t] > 0));
  return (
    <section aria-label="Cómo está el piso, por categoría" className="border-b border-sand px-4 pb-3 pt-4 sm:px-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-display text-[20px] leading-tight sm:text-[22px]">Cómo está el piso</h2>
        <span className="text-[12.5px] text-taupe">Toca una categoría para ver solo sus prendas</span>
      </div>
      <div className="mt-2 divide-y divide-sand">
        {filas.map((f) => {
          const activa = elegida === f.categoriaId;
          const segmentos = segmentosDe(f);
          return (
            <button
              key={f.categoriaId}
              type="button"
              aria-pressed={activa}
              onClick={() => onElegir(activa ? null : f.categoriaId)}
              className={`fila-cayla grid w-full grid-cols-1 items-center gap-x-4 gap-y-1.5 py-2.5 text-left md:grid-cols-[minmax(150px,1fr)_minmax(200px,2fr)_112px_112px] ${activa ? "bg-sand/60" : ""}`}
            >
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-semibold leading-tight">{f.nombre}</span>
                <span className="block text-[12.5px] leading-snug text-taupe">
                  {f.prendas} {f.prendas === 1 ? "prenda" : "prendas"} · {f.total} {f.total === 1 ? "unidad" : "unidades"}
                </span>
              </span>
              {/* La barra y, debajo, sus cifras en texto (nunca solo al pasar el mouse: Formidable, ley 6); el lector de pantalla
                  ya las oye en el resumen de la barra, así que aquí van ocultas para él. */}
              <span className="min-w-0">
                <BarraApilada segmentos={segmentos} />
                {segmentos.length > 0 && (
                  <span aria-hidden className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] leading-snug text-taupe tabular-nums">
                    {segmentos.map((s) => (
                      <span key={s.clave} className="flex items-center gap-1" title={s.nombre}>
                        <span className={`inline-block h-2 w-2 rounded-full ${s.clase}`} />
                        {s.valor}
                      </span>
                    ))}
                  </span>
                )}
              </span>
              <span className={`text-[13.5px] tabular-nums ${f.porDecidir > 0 ? "font-semibold text-ambar-profundo" : "text-taupe"}`}>
                {f.porDecidir > 0 ? `${f.porDecidir} por decidir` : "Nada por decidir"}
              </span>
              <span className="md:justify-self-start">
                <Chip tono={f.vara.tono} className="!px-2 !text-[12px] !leading-[18px]">
                  {f.vara.texto}
                </Chip>
              </span>
            </button>
          );
        })}
      </div>
      <ul aria-label="Qué significa cada color" className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-taupe">
        {conUnidades.map((t) => (
          <li key={t} className="flex items-center gap-1.5">
            <span aria-hidden className={`inline-block h-2.5 w-2.5 rounded-full ${CLASE_TRAMO_BARRA[t]}`} />
            {NOMBRE_TRAMO_BARRA[t]}
          </li>
        ))}
      </ul>
    </section>
  );
}
