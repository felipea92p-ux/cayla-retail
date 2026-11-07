"use client";

import { useState } from "react";
import { Casilla } from "@/components/ui/Casilla";
import { BotonImprimir } from "@/components/ui/BotonImprimir";
import { loQueEntroPorPrenda, urlEtiquetasDeLoQueEntro } from "@/lib/recepcion-conteo-reglas";
import type { RecibidoEnvio } from "@/lib/recepcion-envio-reglas";

// Lo que ya entró al stock de un envío, prenda por prenda y talla por talla (Felipe 2026-11-07): antes solo decía «Blusa Amancae ×5» y la etiqueta se
// imprimía de todo o de nada. Aquí se ve qué entró de cada talla y color, y se marca de cuáles imprimir. Arranca con todo marcado: lo normal es etiquetar
// todo lo que llegó. Lo dañado no sale (queda en cuarentena). Solo arma el enlace: nada se guarda.

const talla = (c: { talla: string | null; color: string | null }) => [c.talla ?? "Única", c.color].filter(Boolean).join(" · ");

export function LoQueEntro({ despachoId, recibidos }: { despachoId: string; recibidos: readonly RecibidoEnvio[] | null }) {
  const prendas = loQueEntroPorPrenda(recibidos);
  const todas = prendas.flatMap((p) => p.combinaciones.map((c) => c.varianteId));
  const [marcadas, setMarcadas] = useState<ReadonlySet<string>>(() => new Set(todas));
  if (prendas.length === 0) return null;

  const cambiar = (ids: readonly string[], marcar: boolean) =>
    setMarcadas((m) => {
      const s = new Set(m);
      for (const id of ids) {
        if (marcar) s.add(id);
        else s.delete(id);
      }
      return s;
    });
  const enlace = urlEtiquetasDeLoQueEntro(despachoId, prendas, marcadas);
  const todasMarcadas = todas.every((id) => marcadas.has(id));

  return (
    <div className="space-y-3" data-guia="recepcion.lo-que-entro">
      <ul className="divide-y divide-sand overflow-hidden rounded-2xl border border-sand" aria-label="Lo que entró al stock">
        {prendas.map((p) => {
          const ids = p.combinaciones.map((c) => c.varianteId);
          const cuantas = ids.filter((id) => marcadas.has(id)).length;
          return (
            <li key={p.nombre} className="space-y-2 px-3 py-2.5">
              <label className="flex cursor-pointer items-center gap-3">
                <Casilla marcada={cuantas === ids.length} aMedias={cuantas > 0 && cuantas < ids.length} onCambio={() => cambiar(ids, cuantas < ids.length)} etiqueta={`Etiquetas de ${p.nombre}`} />
                <b className="min-w-0 flex-1 truncate text-[15px] font-semibold text-tinta">{p.nombre}</b>
                <span className="shrink-0 text-sm tabular-nums text-taupe">
                  {p.cantidad} {p.cantidad === 1 ? "prenda" : "prendas"}
                </span>
              </label>
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(11rem,13rem))] gap-x-6 gap-y-1.5 pl-8" aria-label={`Tallas y colores de ${p.nombre}`}>
                {p.combinaciones.map((c) => (
                  <li key={c.varianteId}>
                    <label className="flex cursor-pointer items-center gap-2.5 text-sm">
                      <Casilla marcada={marcadas.has(c.varianteId)} onCambio={() => cambiar([c.varianteId], !marcadas.has(c.varianteId))} etiqueta={`Etiquetas de ${p.nombre}, ${talla(c)}`} />
                      <span className="min-w-0 flex-1 truncate text-tinta">{talla(c)}</span>
                      <span className="shrink-0 font-semibold tabular-nums text-tinta">×{c.cantidad}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        {enlace ? (
          <BotonImprimir href={enlace.href}>{`Imprimir ${enlace.etiquetas} ${enlace.etiquetas === 1 ? "etiqueta" : "etiquetas"}`}</BotonImprimir>
        ) : (
          <p className="text-sm text-taupe">Marca de qué prendas quieres la etiqueta.</p>
        )}
        <button type="button" className="btn-cayla btn-enlace" onClick={() => cambiar(todas, !todasMarcadas)}>
          {todasMarcadas ? "Desmarcar todas" : "Marcar todas"}
        </button>
      </div>
    </div>
  );
}
