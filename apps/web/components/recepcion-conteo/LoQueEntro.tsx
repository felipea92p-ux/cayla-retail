"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Casilla } from "@/components/ui/Casilla";
import { Boton } from "@/components/ui/campos";
import { matrizDeLoQueEntro, type PrendaQueEntro } from "@/lib/recepcion-conteo-reglas";

// Lo que entró al stock de un envío, prenda por prenda (Felipe 2026-11-07: «ahí debe salir el detalle»). Desde el 2026-11-16 (maqueta
// `recibir-cierre-recibo-2026-11`, «hay tanta información que ver») va plegado: una fila por prenda —nombre, tallas y cuántas— que al tocarla abre su
// tabla color × talla, la misma forma que «Recibido por envío». Con 70 casillas sueltas no se veía lo raro (un polo con «Estándar» además de S, M y L);
// en tabla salta. «Elegir de cuáles imprimir» (en «Más» del envío) vuelve cada celda un botón que la saca o la pone en la impresión, y cada prenda trae
// su casilla. Lo elegido vive en el envío cerrado: su «Imprimir N etiquetas» es uno solo. Lo dañado no sale (queda en cuarentena). Nada se guarda.

export function LoQueEntro({
  prendas,
  elegir,
  fuera,
  onCambiar,
  onListo,
}: {
  prendas: readonly PrendaQueEntro[];
  /** Eligiendo de cuáles imprimir: las celdas se tocan y todas las prendas se abren. */
  elegir: boolean;
  /** Las variantes que se sacaron de la impresión (lo de fábrica: ninguna, se imprime todo lo que entró). */
  fuera: ReadonlySet<string>;
  onCambiar: (varianteIds: readonly string[], imprimir: boolean) => void;
  onListo: () => void;
}) {
  const [abiertas, setAbiertas] = useState<ReadonlySet<string>>(new Set());
  if (prendas.length === 0) return null;
  const todas = prendas.flatMap((p) => p.combinaciones.map((c) => c.varianteId));
  const todasDentro = todas.every((id) => !fuera.has(id));

  return (
    <div className="space-y-3" data-guia="recepcion.lo-que-entro">
      <ul className="divide-y divide-sand overflow-hidden rounded-2xl border border-sand" aria-label="Lo que entró al stock">
        {prendas.map((p) => {
          const ids = p.combinaciones.map((c) => c.varianteId);
          const dentro = p.combinaciones.filter((c) => !fuera.has(c.varianteId));
          const etiquetas = dentro.reduce((a, c) => a + c.cantidad, 0);
          const abierta = elegir || abiertas.has(p.nombre);
          const m = matrizDeLoQueEntro(p);
          const idTabla = `entro-${p.nombre.replace(/\W+/g, "-")}`;
          return (
            <li key={p.nombre}>
              <div className="flex items-center gap-3 px-3 py-2.5">
                {elegir && (
                  <Casilla
                    marcada={dentro.length === ids.length}
                    aMedias={dentro.length > 0 && dentro.length < ids.length}
                    onCambio={() => onCambiar(ids, dentro.length < ids.length)}
                    etiqueta={`Etiquetas de ${p.nombre}`}
                  />
                )}
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  aria-expanded={abierta}
                  aria-controls={idTabla}
                  disabled={elegir}
                  onClick={() =>
                    setAbiertas((a) => {
                      const n = new Set(a);
                      if (n.has(p.nombre)) n.delete(p.nombre);
                      else n.add(p.nombre);
                      return n;
                    })
                  }
                >
                  <b className="min-w-0 flex-1 truncate text-[15px] font-semibold text-tinta">{p.nombre}</b>
                  <span className="hidden shrink-0 text-sm text-taupe sm:inline">{m.tallas.join(" · ")}</span>
                  <span className="w-20 shrink-0 text-right font-display text-[20px] leading-none tabular-nums text-tinta">
                    {elegir ? `${etiquetas.toLocaleString("es-PE")}/${p.cantidad.toLocaleString("es-PE")}` : p.cantidad.toLocaleString("es-PE")}
                  </span>
                  {!elegir && <ChevronDown aria-hidden className={`h-4 w-4 shrink-0 text-taupe transition-transform duration-300 ease-cayla ${abierta ? "rotate-180" : ""}`} />}
                </button>
              </div>
              {abierta && (
                <div id={idTabla} className="overflow-x-auto bg-tinta/[0.03] px-3 pb-3 pt-1 sm:pl-6">
                  <table /* unificar-fijo: matriz color × talla de lo que entró, la misma forma que «Recibido por envío» (las matrices de tallas quedan aparte) */ className="rc-entro-matriz min-w-[16rem] !bg-transparent text-sm tabular-nums">
                    <thead>
                      <tr className="text-taupe">
                        <th scope="col" className="py-1.5 pr-3 text-left font-normal">Color</th>
                        {m.tallas.map((t) => (
                          <th key={t} scope="col" className="px-1 py-1.5 text-center font-normal">
                            {t}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {m.filas.map((f) => (
                        <tr key={f.color}>
                          <th scope="row" className="py-1 pr-3 text-left font-normal text-tinta">
                            {f.color}
                          </th>
                          {m.tallas.map((t) => {
                            const c = f.celdas[t];
                            if (!c)
                              return (
                                <td key={t} className="px-1 py-1 text-center text-tinta/30">
                                  <span aria-hidden>·</span>
                                  <span className="sr-only">Sin {t}</span>
                                </td>
                              );
                            const sale = !fuera.has(c.varianteId);
                            return (
                              <td key={t} className="px-1 py-1 text-center">
                                {elegir ? (
                                  <button
                                    type="button"
                                    className="rc-entro-celda"
                                    aria-pressed={sale}
                                    aria-label={`${f.color}, ${t}: ${c.cantidad} ${sale ? "se imprimen" : "no se imprimen"}`}
                                    onClick={() => onCambiar([c.varianteId], !sale)}
                                  >
                                    {c.cantidad}
                                  </button>
                                ) : (
                                  <span className="rc-entro-celda">{c.cantidad}</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {elegir && (
        <div className="flex flex-wrap items-center gap-3">
          <Boton type="button" peso="primario" onClick={onListo}>
            Listo
          </Boton>
          <button type="button" className="btn-cayla btn-enlace" onClick={() => onCambiar(todas, !todasDentro)}>
            {todasDentro ? "Desmarcar todas" : "Marcar todas"}
          </button>
        </div>
      )}
    </div>
  );
}
