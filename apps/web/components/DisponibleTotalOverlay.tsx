"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, TrendingDown, TrendingUp } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { formatoSolesCompacto } from "@/lib/resumen-formato";
import { agruparPorCategoria, variantesDeCategoria, type CategoriaResumen } from "@/lib/existencias-categorias";
import type { FilaSemana } from "@/lib/existencias-categorias";

/* ====================================================================
   DisponibleTotalOverlay · click en «Disponible total» (2026-09-22)

   Dos niveles en el MISMO panel (`Modal`, ADR-0136 — hereda el movimiento del
   sistema, no define ninguno propio): categorías → variantes de una. `filas`
   es la semana (`getFilasSemanaDeSede`): trae el delta vs. hace 7 días y,
   solo para líder (`FilaResumen.costo` viaja null si no lo es), costo y
   precio para valorar el stock.

   «Causa» del cambio (promoción, temporada…): no hay ningún dato del
   sistema que la sostenga con confianza (investigado 2026-09-22 — ver
   BITACORA); se dice una vez, neutral, en el encabezado del detalle, nunca
   inventada por variante. */

function Delta({ pct, unidades }: { pct: number | null; unidades: number }) {
  if (unidades === 0) return <span className="label-cayla text-[10px] text-tinta/45">Sin cambio</span>;
  const sube = unidades > 0;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium tabular-nums ${sube ? "text-verde-profundo" : "text-rojo-profundo"}`}>
      {sube ? <TrendingUp aria-hidden className="h-3.5 w-3.5" /> : <TrendingDown aria-hidden className="h-3.5 w-3.5" />}
      {pct === null ? `${sube ? "+" : ""}${unidades} uds` : `${sube ? "+" : ""}${Math.round(pct)}%`}
    </span>
  );
}

function FilaCategoria({ c, onClick }: { c: CategoriaResumen; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center justify-between gap-4 rounded-lg px-4 py-3.5 text-left transition-colors hover:bg-sand/40 focus-visible:bg-sand/40 focus-visible:outline-none"
    >
      <span className="min-w-0">
        <span className="block text-sm text-tinta">{c.nombre}</span>
        <span className="text-xs text-tinta/55">
          {c.variantes} {c.variantes === 1 ? "variante" : "variantes"} · {c.disponible.toLocaleString("es-PE")} uds disponibles
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-3">
        <Delta pct={c.deltaPct} unidades={c.deltaUnidades} />
        <ChevronRight aria-hidden className="h-4 w-4 text-tinta/35 transition-transform group-hover:translate-x-0.5" />
      </span>
    </button>
  );
}

export function DisponibleTotalOverlay({ filas, esLider, onClose }: { filas: FilaSemana[]; esLider: boolean; onClose: () => void }) {
  const [categoriaId, setCategoriaId] = useState<string | null>(null);
  const categorias = useState(() => agruparPorCategoria(filas))[0];
  const categoria = categorias.find((c) => c.id === categoriaId) ?? null;
  const variantes = categoriaId ? variantesDeCategoria(filas, categoriaId) : [];

  return (
    <Modal
      titulo={categoria ? categoria.nombre : "Disponible por categoría"}
      subtitulo={categoria ? undefined : "Cómo cambió el stock disponible de cada categoría en los últimos 7 días."}
      onClose={onClose}
      ancho="max-w-xl"
      variante="papel"
    >
      {categoria && (
        <button
          type="button"
          onClick={() => setCategoriaId(null)}
          className="label-cayla -mt-1 mb-3 inline-flex items-center gap-1 text-[11px] text-tinta/65 hover:text-rojo"
        >
          <ChevronLeft aria-hidden className="h-3.5 w-3.5" />
          Todas las categorías
        </button>
      )}

      {!categoria && (
        <div className="-mx-2 max-h-[24rem] divide-y divide-tinta/10 overflow-y-auto">
          {categorias.length === 0 ? (
            <p className="px-2 py-6 text-sm text-tinta/55">Sin categorías con stock disponible.</p>
          ) : (
            categorias.map((c) => <FilaCategoria key={c.id} c={c} onClick={() => setCategoriaId(c.id)} />)
          )}
        </div>
      )}

      {categoria && (
        <div className="space-y-4">
          {/* Costo/margen: solo llega a líder (`FilaResumen.costo`, null para el resto) — nunca se
              inventa un total cuando la base no lo mandó. */}
          <div className="grid grid-cols-3 gap-3 rounded-lg border border-tinta/10 bg-sand/25 p-3.5">
            <div>
              <p className="label-cayla text-[10px] text-tinta/55">Costo del stock</p>
              <p className="mt-0.5 font-display text-lg text-tinta">{esLider && categoria.costoTotal !== null ? formatoSolesCompacto(categoria.costoTotal) : "—"}</p>
            </div>
            <div>
              <p className="label-cayla text-[10px] text-tinta/55">Si se vendiera todo</p>
              <p className="mt-0.5 font-display text-lg text-tinta">{esLider && categoria.montoPotencial !== null ? formatoSolesCompacto(categoria.montoPotencial) : "—"}</p>
            </div>
            <div>
              <p className="label-cayla text-[10px] text-tinta/55">Margen estimado</p>
              <p className="mt-0.5 font-display text-lg text-verde-profundo">{esLider && categoria.margenEstimado !== null ? formatoSolesCompacto(categoria.margenEstimado) : "—"}</p>
            </div>
          </div>
          <p className="text-xs text-tinta/55">
            {esLider
              ? categoria.variantesSinCosto > 0
                ? `${categoria.variantesSinCosto} ${categoria.variantesSinCosto === 1 ? "variante" : "variantes"} sin costo registrado, no incluida${categoria.variantesSinCosto === 1 ? "" : "s"} en el total. `
                : ""
              : "El costo y el margen solo los ve un líder de equipo. "}
            Sin causa registrada para el cambio de esta semana — el sistema no liga hoy un stock que sube o baja a una promoción o temporada concreta.
          </p>

          <div className="-mx-2 max-h-[20rem] divide-y divide-tinta/10 overflow-y-auto">
            {variantes.map((v) => (
              <div key={v.varianteId} className="flex items-center gap-3 px-2 py-2.5">
                <MiniaturaPrenda fotoUrl={v.fotoUrl} colorHex={v.colorHex} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-tinta">{v.referencia}</span>
                  <span className="block truncate text-xs text-tinta/55">
                    <span className="font-mono">{v.sku}</span>
                    {v.talla && ` · ${v.talla}`}
                    {v.ritmoUdsDia !== null && ` · ${v.ritmoUdsDia.toFixed(1)} uds/día`}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm font-semibold tabular-nums text-tinta">{v.disponible}</span>
                  <Delta pct={null} unidades={v.deltaUnidades} />
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
