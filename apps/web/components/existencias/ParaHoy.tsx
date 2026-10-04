"use client";

import Link from "next/link";
import { useState, type CSSProperties, type ReactNode } from "react";
import { ArrowRight, ChevronDown } from "lucide-react";
import { TAREAS_A_LA_VISTA, type TareaHoy, type TipoTareaHoy, type TonoTareaHoy } from "@/lib/existencias-para-hoy";

/* ====================================================================
   «Para hoy» (rediseño de Existencias, 2026-10-04): lo pendiente de la sede como frases con su cifra y un solo botón, en el
   orden en que conviene hacerlas (`tareasParaHoy`). Reemplaza las cuatro tarjetas fijas de «Prioridades de hoy», que se
   dibujaban aunque dijeran 0.

   Una tarea = una fila: un punto del tono (ámbar hay que hacerlo aquí, rojo ya se pasó un plazo, pizarra informativo), la cifra
   en la serif de la casa seguida de su frase, una línea de por qué y, a la derecha, LA acción, en botón claro: el único oscuro de
   la pantalla es el de la cabecera («Bajar al piso»). Con el primero oscuro aquí también había dos botones negros que decían lo
   mismo, uno encima del otro (visto en la primera captura, 2026-10-04). Se ven tres; el resto, a un toque.

   En el celular (bajo `sm`) entra PLEGADO: una línea con la primera tarea y cuántas más hay, que se abre al tocarla (la maqueta
   aprobada en la ronda 2: «Para hoy: 24 por colgar · 2 más ›»). Abierto, cada tarea con su frase completa ocupaba más de una
   pantalla y empujaba las prendas a la tercera.
   ==================================================================== */

export type AccionTarea = { texto: string; href?: string; onClick?: () => void };

const PUNTO: Record<TonoTareaHoy | "verde", string> = {
  ambar: "bg-ambar ring-ambar/20",
  rojo: "bg-rojo ring-rojo/20",
  pizarra: "bg-pizarra ring-pizarra/20",
  verde: "bg-verde ring-verde/20",
};

function Boton({ accion }: { accion: AccionTarea }) {
  const clase = "btn-cayla btn-secundario btn-chico shrink-0 gap-1.5 whitespace-nowrap";
  const contenido = (
    <>
      {accion.texto}
      <ArrowRight aria-hidden className="h-3.5 w-3.5" strokeWidth={1.75} />
    </>
  );
  return accion.href ? (
    <Link href={accion.href} className={clase}>
      {contenido}
    </Link>
  ) : (
    <button type="button" onClick={accion.onClick} className={clase}>
      {contenido}
    </button>
  );
}

export function ParaHoy({
  tareas,
  acciones,
  verCuales,
  extra,
}: {
  tareas: readonly TareaHoy[];
  /** El botón de cada tarea. Sin acción, la fila solo informa (quien mira no tiene el módulo que la resuelve). */
  acciones: Partial<Record<TipoTareaHoy, AccionTarea>>;
  /** «Ver cuáles»: filtra la lista de abajo con ese caso (por colgar, sin nada atrás). */
  verCuales?: Partial<Record<TipoTareaHoy, () => void>>;
  /** A la derecha del título: los accesos que no son tareas (el resumen por categoría, las apartadas). */
  extra?: ReactNode;
}) {
  const [todas, setTodas] = useState(false);
  const [abiertoMovil, setAbiertoMovil] = useState(false);
  const primera = tareas[0];
  const visibles = todas ? tareas : tareas.slice(0, TAREAS_A_LA_VISTA);
  const ocultas = tareas.length - visibles.length;

  return (
    <section aria-labelledby="para-hoy-titulo" className="card-cayla anim-sube overflow-hidden" style={{ "--i": 2 } as CSSProperties}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-5 pb-2 pt-4 max-sm:px-4">
        <h2 id="para-hoy-titulo" className="font-display text-[22px] leading-tight text-tinta">
          Para hoy
        </h2>
        {extra && <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">{extra}</div>}
      </div>

      {/* Celular: la línea plegada. En pantallas más anchas no existe y la lista va siempre abierta. */}
      {primera && (
        <button
          type="button"
          onClick={() => setAbiertoMovil((v) => !v)}
          aria-expanded={abiertoMovil}
          aria-controls="para-hoy-lista"
          className="flex w-full items-center gap-3 border-t border-sand/70 px-4 py-3 text-left sm:hidden"
        >
          <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ring-4 ${PUNTO[primera.tono]}`} />
          <span className="min-w-0 flex-1 text-[15px] text-tinta">
            {primera.cifra !== null && <span className="mr-1.5 font-display text-[22px] tabular-nums">{primera.cifra.toLocaleString("es-PE")}</span>}
            <span className="font-medium">{primera.texto}</span>
            {tareas.length > 1 && <span className="text-taupe"> · {tareas.length - 1} más</span>}
          </span>
          <ChevronDown aria-hidden className={`h-4 w-4 shrink-0 text-taupe transition-transform duration-300 ease-cayla motion-reduce:transition-none ${abiertoMovil ? "rotate-180" : ""}`} />
        </button>
      )}

      {tareas.length === 0 ? (
        <div className="flex items-center gap-4 border-t border-sand/70 px-5 py-4 max-sm:px-4">
          <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ring-4 ${PUNTO.verde}`} />
          <p className="text-[15px] text-tinta">
            Todo al día. <span className="text-taupe">No hay nada pendiente en el piso ni en el almacén de esta sede.</span>
          </p>
        </div>
      ) : (
        <ol id="para-hoy-lista" className={abiertoMovil ? "" : "max-sm:hidden"}>
          {visibles.map((t) => {
            const accion = acciones[t.tipo];
            const alVer = verCuales?.[t.tipo];
            return (
              <li
                key={t.tipo}
                className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-t border-sand/70 px-5 py-3 max-sm:grid-cols-[auto_minmax(0,1fr)] max-sm:px-4"
              >
                <span aria-hidden className={`h-2.5 w-2.5 shrink-0 self-start rounded-full ring-4 max-sm:mt-2.5 sm:self-center ${PUNTO[t.tono]}`} />
                <div className="min-w-0">
                  <p className="flex flex-wrap items-baseline gap-x-2 text-[15px] leading-6 text-tinta">
                    {t.cifra !== null && <span className="font-display text-[26px] leading-none tabular-nums">{t.cifra.toLocaleString("es-PE")}</span>}
                    <span className="font-medium">{t.texto}</span>
                  </p>
                  <p className="mt-0.5 text-[13px] leading-5 text-taupe">
                    {t.detalle}
                    {alVer && (
                      <>
                        {" "}
                        <button type="button" onClick={alVer} className="font-medium text-tinta underline decoration-tinta/30 underline-offset-[3px] hover:decoration-tinta">
                          Ver cuáles
                        </button>
                      </>
                    )}
                  </p>
                </div>
                {accion && (
                  <div className="max-sm:col-start-2">
                    <Boton accion={accion} />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {(ocultas > 0 || (todas && tareas.length > TAREAS_A_LA_VISTA)) && (
        <div className={`border-t border-sand/70 px-5 py-2.5 max-sm:px-4 ${abiertoMovil ? "" : "max-sm:hidden"}`}>
          <button type="button" onClick={() => setTodas((v) => !v)} aria-expanded={todas} className="text-[13px] font-medium text-taupe hover:text-tinta">
            {todas ? "Ver menos" : `Ver ${ocultas} ${ocultas === 1 ? "pendiente más" : "pendientes más"}`}
          </button>
        </div>
      )}
    </section>
  );
}
