"use client";

import { useState } from "react";
import { Shirt } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { Modal } from "@/components/ui/Modal";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { Vacio } from "@/components/ui/Vacio";
import { enteroES, fechaCortaES, solesES } from "@/lib/plan-compra-reglas";
import type { LecturaPropuesta } from "@/lib/plan-compra-propuesta";
import {
  coloresQueMasVendieron,
  contraLaCampanaPasada,
  contraLoEsperado,
  prendasQueMasVendieron,
  type FilaCategoria,
  type LecturaResultados,
} from "@/lib/plan-compra-resultados";

// El detalle de una categoría en Resultados (ADR-0372, C6 · Felipe 2026-10-12: «al darle clic a una fila, qué prendas y de qué colores se
// vendieron más»; y después, «sus ventas contra lo esperado y la campaña pasada»). Solo lee: lo que ya trae `fn_plan_compra_resultados`
// (prenda × color × tienda), filtrado a la categoría, y lo que la propuesta del Plan sabe de la misma campaña el año anterior. Lo que NO se
// vendió no está en esa lectura: para eso está Análisis ▸ No se vende.

const pct = (d: number) => `${d >= 0 ? "+" : "−"}${Math.abs(Math.round(d * 100))} %`;
const tonoDe = (d: number | null) => (d === null ? undefined : d >= 0.02 ? "text-verde" : d <= -0.05 ? "text-rojo-profundo" : undefined);

const ancho = (v: number, max: number) => `${max > 0 ? Math.max(2, (v / max) * 100) : 0}%`;

export function DetalleCategoriaResultados({
  r,
  categoria,
  tiendaInicial,
  pesos,
  propuesta,
  onClose,
}: {
  r: LecturaResultados;
  categoria: FilaCategoria;
  tiendaInicial: string | null;
  /** El peso de cada día de la campaña (la forma del año pasado), para «lo esperado a hoy». */
  pesos: readonly number[];
  /** La propuesta del Plan (C4): trae lo vendido en la misma campaña del año anterior; null si no se pudo leer. */
  propuesta: LecturaPropuesta | null;
  onClose: () => void;
}) {
  const [tienda, setTienda] = useState<string | null>(tiendaInicial);
  const prendas = prendasQueMasVendieron(r, tienda, 15, categoria.id);
  const colores = coloresQueMasVendieron(r, tienda, 10, categoria.id);
  const porTienda = r.tiendas
    .map((t) => ({ t, unidades: r.filas.filter((f) => f.categoria === categoria.id && f.tienda === t.id).reduce((s, f) => s + f.unidades, 0) }))
    .filter((x) => x.unidades > 0);
  const unidades = r.filas.filter((f) => f.categoria === categoria.id && (tienda === null || f.tienda === tienda)).reduce((s, f) => s + f.unidades, 0);
  // El plan es de toda CAYLA: contra lo esperado se mide siempre con todas las tiendas. La campaña pasada sí sigue a la píldora de tienda.
  const esperado = contraLoEsperado(r, categoria.id, pesos);
  const pasada = contraLaCampanaPasada(propuesta, categoria.id, tienda);
  const anioPasado = pasada?.desde.slice(0, 4);
  const terminada = esperado?.terminada ?? r.hoy > r.plan.hasta;
  const contraPasada = pasada && pasada.conDato.length > 0 && pasada.unidades > 0 && terminada ? unidades / pasada.unidades - 1 : null;
  const maxPrenda = Math.max(0, ...prendas.map((p) => p.unidades));
  const maxColor = Math.max(0, ...colores.map((c) => c.unidades));
  const maxTienda = Math.max(0, ...porTienda.map((x) => x.unidades));

  return (
    <Modal titulo={categoria.nombre} subtitulo={`${r.plan.nombre} · ${categoria.familia} · ${enteroES.format(unidades)} ${unidades === 1 ? "prenda vendida" : "prendas vendidas"}`} onClose={onClose} variante="hoja" ancho="max-w-2xl" conCerrar>
      <div className="space-y-6">
        {r.tiendas.length > 1 && (
          <div role="group" aria-label="Tienda" className="flex flex-wrap gap-2">
            <button type="button" className="pildora-cayla" aria-pressed={tienda === null} onClick={() => setTienda(null)}>
              Todas
            </button>
            {r.tiendas.map((t) => (
              <button key={t.id} type="button" className="pildora-cayla" aria-pressed={tienda === t.id} onClick={() => setTienda(t.id)}>
                {t.nombre}
              </button>
            ))}
          </div>
        )}

        <div data-guia="plan-resultados.contra" className="grid gap-3 sm:grid-cols-2">
          <TarjetaCifra
            etiqueta={tienda === null ? "Contra lo esperado" : "Contra lo esperado · toda CAYLA"}
            valor={esperado ? (esperado.diferencia !== null ? pct(esperado.diferencia) : enteroES.format(esperado.vendidas)) : null}
            tono={tonoDe(esperado?.diferencia ?? null)}
            pie={esperado ? `Flojo ${enteroES.format(esperado.plan.flojo)} · normal ${enteroES.format(esperado.plan.normal)} · bueno ${enteroES.format(esperado.plan.bueno)}` : undefined}
          >
            {esperado
              ? `${enteroES.format(esperado.vendidas)} vendidas de ${enteroES.format(esperado.esperado)} esperadas ${esperado.terminada ? "en la campaña" : "a hoy"}${tienda === null ? "" : " (el plan es de todas las tiendas)"}`
              : "Esta categoría no tuvo plan: no hay con qué comparar."}
          </TarjetaCifra>
          <TarjetaCifra
            etiqueta={anioPasado ? `Contra la campaña de ${anioPasado}` : "Contra la campaña pasada"}
            valor={pasada && pasada.conDato.length > 0 ? (contraPasada !== null ? pct(contraPasada) : enteroES.format(pasada.unidades)) : null}
            unidad={pasada && pasada.conDato.length > 0 && contraPasada === null ? "prendas" : undefined}
            tono={tonoDe(contraPasada)}
            noSePudoLeer={pasada === null}
            pie={pasada && pasada.conDato.length > 0 && pasada.sinDato.length > 0 ? `Sin dato de ${pasada.sinDato.join(" y ")}: todavía no vendía en el ERP` : undefined}
          >
            {pasada === null
              ? "No se pudo leer la campaña pasada. Vuelve a abrir en un momento."
              : pasada.conDato.length === 0
                ? "Sin datos de la campaña pasada: en esas fechas el ERP todavía no vendía, y lo de antes (Sinatra) son soles por tienda, sin categorías."
                : contraPasada !== null
                  ? `${enteroES.format(unidades)} esta vez y ${enteroES.format(pasada.unidades)} del ${fechaCortaES(pasada.desde)} al ${fechaCortaES(pasada.hasta)} de ${anioPasado}`
                  : `vendió en toda esa campaña (del ${fechaCortaES(pasada.desde)} al ${fechaCortaES(pasada.hasta)}); esta vez van ${enteroES.format(unidades)}, hasta ayer`}
          </TarjetaCifra>
        </div>

        {/* La frase contra el plan («entre el normal y el bueno») ya la dice la tarjeta de arriba: aquí solo lo que no dice. */}
        {categoria.agotadaEn.length > 0 && (
          <div>
            <Chip tono="ambar">Se agotó en {categoria.agotadaEn.join(" y ")}</Chip>
          </div>
        )}

        {tienda === null && porTienda.length > 1 && (
          <section>
            <h3 className="text-[13px] font-semibold text-tinta">Por tienda</h3>
            <ol className="mt-2 space-y-1.5">
              {porTienda.map(({ t, unidades: u }) => (
                <li key={t.id} className="grid grid-cols-[7rem_minmax(0,1fr)_3rem] items-center gap-3 text-sm">
                  <span className="truncate text-tinta/80">{t.nombre}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-sand">
                    <span className="block h-full rounded-full bg-tinta/60" style={{ width: ancho(u, maxTienda) }} />
                  </span>
                  <span className="text-right tabular-nums text-tinta">{enteroES.format(u)}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        <section>
          <h3 className="text-[13px] font-semibold text-tinta">Las prendas que más se vendieron</h3>
          {prendas.length === 0 ? (
            <Vacio tamano="chico" icono={<Shirt />} titulo={tienda === null ? "Todavía no se vendió ninguna" : "En esta tienda no se vendió ninguna"}>
              Cuando se venda una prenda de {categoria.nombre}, aparece aquí con su color.
            </Vacio>
          ) : (
            <ol className="mt-2 divide-y divide-sand">
              {prendas.map((p, i) => (
                <li key={p.clave} className="grid grid-cols-[1.5rem_minmax(0,1fr)_minmax(0,8rem)_3rem_6rem] items-center gap-3 py-2 text-sm">
                  <span className="text-xs tabular-nums text-taupe">{i + 1}</span>
                  <span className="flex min-w-0 items-center gap-2">
                    {/* El color de la prenda es dato: no cambia con el tema (ADR-0336, regla 3). */}
                    <span data-color-dato aria-hidden className="h-3.5 w-3.5 flex-none rounded-full border border-sand" style={p.hex ? { backgroundColor: p.hex } : undefined} />
                    <span className="truncate text-tinta">
                      {p.prenda}
                      {p.color && <span className="text-taupe"> · {p.color}</span>}
                    </span>
                  </span>
                  <span className="h-2 overflow-hidden rounded-full bg-sand">
                    <span className={`block h-full rounded-full ${i === 0 ? "bg-rojo" : "bg-tinta/60"}`} style={{ width: ancho(p.unidades, maxPrenda) }} />
                  </span>
                  <span className="text-right tabular-nums text-tinta">{enteroES.format(p.unidades)}</span>
                  <span className="text-right tabular-nums text-tinta/70">{solesES(p.soles)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        {colores.length > 0 && (
          <section>
            <h3 className="text-[13px] font-semibold text-tinta">Por color</h3>
            <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {colores.map((c) => (
                <li key={c.codigo} className="grid grid-cols-[minmax(0,1fr)_minmax(0,6rem)_2.5rem] items-center gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span data-color-dato aria-hidden className="h-3.5 w-3.5 flex-none rounded-full border border-sand" style={c.hex ? { backgroundColor: c.hex } : undefined} />
                    <span className="truncate text-tinta">{c.nombre}</span>
                  </span>
                  <span className="h-2 overflow-hidden rounded-full bg-sand">
                    <span className="block h-full rounded-full bg-tinta/60" style={{ width: ancho(c.unidades, maxColor) }} />
                  </span>
                  <span className="text-right tabular-nums text-tinta">{enteroES.format(c.unidades)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="nota-cayla">
          Aquí está lo que se vendió. Lo que casi no se movió (prendas con stock y pocas ventas) está en Inventario ▸ Análisis, en «No se vende».
        </p>
      </div>
    </Modal>
  );
}
