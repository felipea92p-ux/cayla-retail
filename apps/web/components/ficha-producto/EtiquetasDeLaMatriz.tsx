"use client";

import { MuestraEtiqueta } from "@/components/MuestraEtiqueta";
import { TarjetaMuestraBase } from "@/components/alta-producto/GrillaMuestras";
import { GRUPOS_ETIQUETA, ORDEN_GRUPOS_ETIQUETA, estiloConocido } from "@/lib/etiqueta-grupos";
import { cuentaEtiqueta } from "@/lib/matriz-ficha-reglas";
import type { FilaFicha } from "@/lib/variantes-ficha-reglas";

/** Una etiqueta que la cuenta puede poner, con su grupo (Rotación, Artesanal, Campaña, General) para dibujarla como en Atributos. */
export type EtiquetaMatriz = { valor: string; texto: string; estilo: string };

// Las etiquetas de la pestaña «Etiquetas» de la matriz (Felipe 2026-10-03): DEBAJO de la tabla, con todo el ancho, y dibujadas
// como en Catálogo ▸ Atributos ▸ Etiquetas (la misma `MuestraEtiqueta` y los mismos grupos), para reconocerlas por su dibujo y
// no leyendo nombres. Se elige UNA: es el «pincel» con que se tocan las celdas de arriba. Cada tarjeta dice cuántas tallas la
// llevan, con una barra que se llena al ponerla (respuesta a la acción, ADR-0136; sin bucle, apagada con reduced-motion).

/** Las etiquetas en el orden en que se dibujan: por grupo (como en Atributos) y por nombre. La primera es la que viene elegida. */
export function ordenarEtiquetas<E extends EtiquetaMatriz>(etiquetas: readonly E[]): E[] {
  return ORDEN_GRUPOS_ETIQUETA.flatMap((estilo) =>
    etiquetas.filter((e) => estiloConocido(e.estilo) === estilo).sort((a, b) => a.texto.localeCompare(b.texto, "es"))
  );
}

export function EtiquetasDeLaMatriz({
  etiquetas,
  filas,
  elegida,
  onElegir,
  onEnTodas,
  avisoEtiquetas,
  deshabilitado,
}: {
  etiquetas: readonly EtiquetaMatriz[];
  filas: readonly FilaFicha[];
  elegida: string | null;
  onElegir: (id: string) => void;
  /** Pone (o quita) la elegida en todas las activas. */
  onEnTodas: (poner: boolean) => void;
  avisoEtiquetas?: string;
  deshabilitado: boolean;
}) {
  if (etiquetas.length === 0) {
    return <p className="text-[12.5px] italic text-tinta/55">Todavía no hay etiquetas aprobadas.</p>;
  }
  const grupos = ORDEN_GRUPOS_ETIQUETA.map((estilo) => ({
    estilo,
    ...GRUPOS_ETIQUETA[estilo],
    etiquetas: ordenarEtiquetas(etiquetas).filter((e) => estiloConocido(e.estilo) === estilo),
  })).filter((g) => g.etiquetas.length > 0);
  const nombre = elegida ? (etiquetas.find((e) => e.valor === elegida)?.texto ?? null) : null;
  const cuenta = elegida ? cuentaEtiqueta(filas, elegida) : null;

  return (
    <section aria-label="Etiquetas" className="space-y-3 rounded-xl border border-sand bg-papel p-3 @lg:p-4" id="matriz-etiquetas">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5">
        <p className="text-[13px] text-tinta">
          {nombre && cuenta ? (
            <>
              <b className="font-semibold">{nombre}</b>{" "}
              <span className="text-taupe">
                · la {cuenta.con === 1 ? "lleva 1 talla" : `llevan ${cuenta.con} tallas`} de {cuenta.de}
              </span>
            </>
          ) : (
            "Elige una etiqueta"
          )}
        </p>
        {elegida && cuenta && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <button type="button" disabled={deshabilitado || cuenta.con === cuenta.de} onClick={() => onEnTodas(true)} className="btn-cayla btn-enlace text-[12.5px]">
              Poner en todas
            </button>
            <button type="button" disabled={deshabilitado || cuenta.con === 0} onClick={() => onEnTodas(false)} className="btn-cayla btn-enlace text-[12.5px]">
              Quitar de todas
            </button>
          </div>
        )}
      </div>

      {grupos.map((g) => (
        <div key={g.estilo} role="group" aria-label={g.grupo}>
          <p className="label-cayla mb-1.5 flex items-center gap-1.5 text-[11px] text-tinta/65">
            <span aria-hidden className={`inline-block h-1.5 w-1.5 rounded-full ${g.dot}`} />
            {g.grupo}
          </p>
          {/* Más ancha que la grilla del alta: aquí cada tarjeta lleva también cuántas tallas la tienen, y el nombre entra entero. */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(132px,1fr))]">
            {g.etiquetas.map((et) => {
              const c = cuentaEtiqueta(filas, et.valor);
              const marcada = et.valor === elegida;
              return (
                <TarjetaMuestraBase key={et.valor} elegido={marcada} deshabilitado={deshabilitado} onClick={() => onElegir(et.valor)} title={`Elegir «${et.texto}» para ponerla o quitarla`}>
                  <MuestraEtiqueta nombre={et.texto} estilo={estiloConocido(et.estilo)} className="h-10 w-full" />
                  <span className="truncate px-0.5" title={et.texto}>
                    {marcada && <span aria-hidden>✓ </span>}
                    {et.texto}
                  </span>
                  <span className="px-0.5 text-[10.5px] tabular-nums text-taupe">
                    {c.con === 0 ? "ninguna talla" : c.con === c.de ? "todas las tallas" : `${c.con} de ${c.de} tallas`}
                  </span>
                  <span aria-hidden className="mx-0.5 mb-0.5 block h-[3px] overflow-hidden rounded-full bg-sand/70">
                    <span
                      className="block h-full rounded-full bg-tinta/70 transition-[width] duration-300 ease-cayla motion-reduce:transition-none"
                      style={{ width: c.de > 0 ? `${(c.con / c.de) * 100}%` : "0%" }}
                    />
                  </span>
                </TarjetaMuestraBase>
              );
            })}
          </div>
        </div>
      ))}

      {avisoEtiquetas && <p className="text-xs text-tinta/55">{avisoEtiquetas}</p>}
    </section>
  );
}
