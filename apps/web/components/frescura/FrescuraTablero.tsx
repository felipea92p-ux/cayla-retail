"use client";

import type { ReactNode } from "react";
import { Chip } from "@/components/ui/Chip";
import { BarraApilada } from "@/components/ui/BarraApilada";
import { CLASE_TRAMO_BARRA, NOMBRE_TRAMO_BARRA, TRAMOS_BARRA, segmentosDe, type FilaTablero } from "@/lib/frescura-pantalla";

// El tablero por categoría de Frescura del piso (nivel 1; ADR-0208, act. 2026-10-07, decisión 3 de Felipe): «¿Cómo está el piso?»
// de un vistazo. Una fila por categoría: su nombre, la barra de sus unidades por estado (los colores A de los chips: verde recién
// llegada · neutro en su tiempo · ámbar se está quedando · tinta hay que moverla) con sus cifras en texto, cuántas esperan decisión
// (solo si alguna) y con qué vara se juzgó (solo cuando es la excepción: `varaTablero`). Toda la fila es un botón: tocarla deja en
// la lista de abajo solo esa categoría (y otra vez, la suelta). La leyenda se dice UNA vez, al pie. Sin nada colgado, el tablero no
// se dibuja (el vacío lo dice la tabla).
//
// Dos formas (Formidable 2026-10-09, cambio 1): con algo por decidir, COMPACTO —una línea por categoría, ≈36 px, las cifras al lado de
// la barra— para que la primera prenda por decidir entre en la pantalla sin bajar (a 1440×900 asomaba 10 px; a 1024 hacían falta
// 237 px de scroll). Sin nada por decidir, la forma completa: ahí el tablero es el mapa de la semana y vale que ocupe.

export function FrescuraTablero({
  filas,
  elegida,
  onElegir,
  compacto,
  acciones,
}: {
  filas: readonly FilaTablero[];
  elegida: string | null;
  onElegir: (categoriaId: string | null) => void;
  /** Una línea por categoría (hay algo por decidir debajo y la lista tiene que verse). */
  compacto: boolean;
  /** Lo que va a la derecha del título («¿Cómo se lee esto?»). */
  acciones?: ReactNode;
}) {
  if (filas.length === 0) return null;
  const conUnidades = TRAMOS_BARRA.filter((t) => filas.some((f) => f.unidades[t] > 0));
  // Las columnas viven en la grilla madre y cada fila las hereda con `subgrid`: si cada fila fuera su propia grilla, la que lleva
  // chip de vara y la que no tendrían columnas de ancho distinto y las barras saldrían de largos distintos (medido el 2026-10-10:
  // 530 px contra 497). Las dos de la derecha son `auto`: miden lo más ancho que haya en TODAS las filas y se achican a cero si
  // ninguna fila dice nada ahí (en la forma completa, sin nada por decidir, no queda una columna vacía de 112 px). En la forma
  // compacta las cifras de la barra van en su propia columna, por lo mismo: «● 2 ● 2» es más ancho que «● 1» y acortaba la barra.
  const plantilla = compacto
    ? "md:grid-cols-[minmax(170px,1fr)_minmax(240px,2fr)_auto_auto_auto]"
    : "md:grid-cols-[minmax(150px,1fr)_minmax(200px,2fr)_auto_auto]";
  const tramo = compacto ? "md:col-span-5" : "md:col-span-4";
  return (
    <section aria-label="El piso, por categoría" className="border-b border-sand px-4 pb-3 pt-4 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h2 className="font-display text-[20px] leading-tight sm:text-[22px]">Por categoría</h2>
        {acciones}
      </div>
      <div className={`mt-2 divide-y divide-sand md:grid md:gap-x-4 ${plantilla}`}>
        {filas.map((f) => {
          const activa = elegida === f.categoriaId;
          const segmentos = segmentosDe(f);
          // Las cifras de la barra en texto (nunca solo al pasar el mouse: Formidable, ley 6); el lector de pantalla ya las oye en el
          // resumen de la barra, así que aquí van ocultas para él.
          const cifras = segmentos.length > 0 && (
            <span aria-hidden className={`flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] leading-snug text-taupe tabular-nums ${compacto ? "shrink-0" : "mt-1"}`}>
              {segmentos.map((s) => (
                <span key={s.clave} className="flex items-center gap-1" title={s.nombre}>
                  <span className={`inline-block h-2 w-2 rounded-full ${s.clase}`} />
                  {s.valor}
                </span>
              ))}
            </span>
          );
          return (
            <button
              key={f.categoriaId}
              type="button"
              aria-pressed={activa}
              onClick={() => onElegir(activa ? null : f.categoriaId)}
              className={`fila-cayla grid w-full grid-cols-1 items-center gap-x-4 text-left md:grid-cols-subgrid ${tramo} ${compacto ? "gap-y-1 py-1.5" : "gap-y-1.5 py-2.5"} ${activa ? "bg-sand/60" : ""}`}
            >
              {compacto ? (
                <span className="block truncate text-[15px] font-semibold leading-tight">{f.nombre}</span>
              ) : (
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-semibold leading-tight">{f.nombre}</span>
                  <span className="block text-[12.5px] leading-snug text-taupe">
                    {f.prendas} {f.prendas === 1 ? "prenda" : "prendas"} · {f.total} {f.total === 1 ? "unidad" : "unidades"}
                  </span>
                </span>
              )}
              {compacto ? (
                <>
                  <BarraApilada segmentos={segmentos} className="min-w-0" />
                  {cifras}
                </>
              ) : (
                <span className="min-w-0">
                  <BarraApilada segmentos={segmentos} />
                  {cifras}
                </span>
              )}
              {/* «N por decidir» solo cuando hay (Formidable, ley 8: «Nada por decidir» en cada fila era ruido). */}
              <span className="text-[13.5px] font-semibold tabular-nums text-ambar-profundo">{f.porDecidir > 0 ? `${f.porDecidir} por decidir` : ""}</span>
              <span className="md:justify-self-start">
                {f.vara && (
                  // `tachado={false}`: el tono apagado tacha por defecto (es lo que pide «Anulado»); «Sin ventas aún» no es una anulación.
                  <Chip tono={f.vara.tono} tachado={false} className="!px-2 !text-[12px] !leading-[18px]">
                    {f.vara.texto}
                  </Chip>
                )}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[12px] text-taupe">
        <ul aria-label="Qué significa cada color" className="flex flex-wrap gap-x-4 gap-y-1">
          {conUnidades.map((t) => (
            <li key={t} className="flex items-center gap-1.5">
              <span aria-hidden className={`inline-block h-2.5 w-2.5 rounded-full ${CLASE_TRAMO_BARRA[t]}`} />
              {NOMBRE_TRAMO_BARRA[t]}
            </li>
          ))}
        </ul>
        <span>Toca una categoría para ver solo sus prendas</span>
      </div>
    </section>
  );
}
