"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Search, X } from "lucide-react";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { ALTO_CONTROL, SelectNativo } from "@/components/ui/campos";
import type { CambiosUrl } from "@/components/useResumenUrl";
import { MODOS_COMPARACION, PRESETS_PERIODO, type ModoComparacion, type PeriodoResuelto, type PresetPeriodo } from "@/lib/resumen-periodo";
import {
  OPCIONES_COBERTURA,
  OPCIONES_ESTADO,
  OPCIONES_SELL_THROUGH,
  type AlcanceResumen,
  type FiltroCobertura,
  type FiltroEstado,
  type FiltroSellThrough,
  type VistaResumen,
} from "@/lib/resumen-filtros";

// La franja de mando del Resumen: período, comparación, búsqueda y filtros.
// Todo cambio va a la URL (`useResumenUrl`) y el servidor recalcula. El período
// mueve las métricas históricas; el stock que se usa para decidir es siempre el
// actual — por eso ningún control de acá toca el stock.

const ETIQUETA = "label-cayla text-[10px] text-tinta/65";

function Filtro({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className={`${ETIQUETA} block whitespace-nowrap`}>{etiqueta}</span>
      {children}
    </label>
  );
}

export function ResumenControles({
  periodo,
  modoComparacion,
  alcance,
  vista,
  categorias,
  actualizar,
}: {
  periodo: PeriodoResuelto;
  modoComparacion: ModoComparacion;
  alcance: AlcanceResumen;
  vista: VistaResumen;
  categorias: { id: string; nombre: string; variantes: number }[];
  actualizar: (cambios: CambiosUrl) => void;
}) {
  const [q, setQ] = useState(alcance.q);
  // Lo último que ESTE campo mandó a la URL, y lo último que la URL dijo: si la URL
  // cambia por otra vía («Limpiar filtros», una tarjeta) el campo la sigue; si
  // cambió porque el propio campo la mandó, no se le pisa lo que sigue escribiendo.
  const [enviado, setEnviado] = useState(alcance.q);
  const [qEnUrl, setQEnUrl] = useState(alcance.q);
  if (alcance.q !== qEnUrl) {
    setQEnUrl(alcance.q);
    if (alcance.q !== enviado) setQ(alcance.q);
  }
  const [abierto, setAbierto] = useState(false);
  const [desde, setDesde] = useState(periodo.desde);
  const [hasta, setHasta] = useState(periodo.hasta);

  // La búsqueda espera a que termines de escribir: una consulta por tecla sería
  // recalcular toda la sede por cada letra.
  useEffect(() => {
    if (q.trim() === alcance.q.trim()) return;
    const espera = setTimeout(() => {
      const nuevo = q.trim() ? q : "";
      setEnviado(nuevo);
      actualizar({ q: nuevo || null });
    }, 350);
    return () => clearTimeout(espera);
  }, [q, alcance.q, actualizar]);

  const elegirPreset = (p: PresetPeriodo) => {
    if (p === "personalizado") {
      setDesde(periodo.desde);
      setHasta(periodo.hasta);
      setAbierto((a) => !a);
      return;
    }
    setAbierto(false);
    actualizar({ preset: p === "30d" ? null : p, desde: null, hasta: null });
  };

  const rangoValido = desde !== "" && hasta !== "" && desde <= hasta;

  return (
    <div className="grid gap-3 min-[1280px]:grid-cols-[minmax(0,1fr)_minmax(0,0.62fr)]">
      <div className="card-cayla relative flex min-w-0 flex-wrap items-end gap-x-5 gap-y-3 p-4">
        <div className="max-w-full">
          <span className={ETIQUETA}>
            Período analizado <span className="normal-case tracking-normal text-tinta/50">(ventas)</span>
          </span>
          <div className="mt-1.5 max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div role="radiogroup" aria-label="Período analizado" className="inline-flex overflow-hidden rounded-md border border-tinta/15 bg-papel">
            {PRESETS_PERIODO.map((p) => {
              const activo = periodo.preset === p.valor && !(p.valor === "personalizado" && !abierto && periodo.preset !== "personalizado");
              return (
                <button
                  key={p.valor}
                  type="button"
                  role="radio"
                  aria-checked={periodo.preset === p.valor}
                  onClick={() => elegirPreset(p.valor)}
                  className={`label-cayla inline-flex ${ALTO_CONTROL} items-center gap-1.5 whitespace-nowrap px-3 text-[11px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-rojo/60 ${
                    activo ? "bg-tinta text-crema" : "text-tinta/75 hover:bg-tinta/[0.05]"
                  }`}
                >
                  {p.valor === "personalizado" && <CalendarDays aria-hidden strokeWidth={1.5} className="h-3.5 w-3.5" />}
                  {p.texto}
                </button>
              );
            })}
          </div>
          </div>
        </div>

        <Filtro etiqueta="Comparar con">
          <div className="mt-1.5 w-[11.5rem]">
            <SelectNativo value={modoComparacion} onChange={(e) => actualizar({ comparar: e.target.value === "anterior" ? null : e.target.value })} aria-label="Comparar con">
              {MODOS_COMPARACION.map((m) => (
                <option key={m.valor} value={m.valor}>
                  {m.texto}
                </option>
              ))}
            </SelectNativo>
          </div>
        </Filtro>

        <label className="relative block min-w-[14rem] basis-full min-[1560px]:basis-0 min-[1560px]:flex-1">
          <span className="sr-only">Buscar producto, SKU, código de barras, color, talla o palabra clave</span>
          <Search aria-hidden strokeWidth={1.5} className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tinta/45" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            maxLength={120}
            placeholder="Buscar producto, SKU, código de barras, color, talla o palabra clave — ej. blusa blanco L"
            className={`${ALTO_CONTROL} w-full truncate rounded-md border border-tinta/15 bg-papel pl-9 pr-8 text-sm text-tinta outline-none placeholder:text-[13px] placeholder:text-tinta/45 focus:border-rojo/60`}
          />
          {q && (
            <button type="button" aria-label="Borrar la búsqueda" onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-tinta/50 hover:text-tinta">
              <X aria-hidden strokeWidth={1.5} className="h-3.5 w-3.5" />
            </button>
          )}
        </label>

        {abierto && (
          <div className="absolute left-4 top-[calc(100%-0.25rem)] z-20 w-[min(22rem,calc(100%-2rem))] rounded-lg border border-tinta/15 bg-papel p-4 shadow-lg">
            <p className="label-cayla text-[11px] text-tinta">Período personalizado</p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <CampoFecha etiqueta="Desde" valor={desde} onValor={setDesde} />
              <CampoFecha etiqueta="Hasta" valor={hasta} onValor={setHasta} />
            </div>
            {!rangoValido && desde !== "" && hasta !== "" && <p className="mt-2 text-xs text-rojo-profundo">«Desde» no puede ser posterior a «Hasta».</p>}
            <div className="mt-4 flex justify-end gap-3">
              <button type="button" onClick={() => setAbierto(false)} className="label-cayla text-[11px] text-tinta/65 hover:text-tinta">
                Cancelar
              </button>
              <button
                type="button"
                disabled={!rangoValido}
                onClick={() => {
                  setAbierto(false);
                  actualizar({ preset: "personalizado", desde, hasta });
                }}
                className="label-cayla rounded-md bg-tinta px-4 py-2.5 text-[11px] text-crema transition-colors hover:bg-rojo disabled:cursor-not-allowed disabled:opacity-40"
              >
                Aplicar
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="card-cayla grid min-w-0 grid-cols-2 content-start gap-x-4 gap-y-2 p-4 min-[560px]:grid-cols-4 min-[1280px]:grid-cols-2 min-[1560px]:grid-cols-4">
        <Filtro etiqueta="Categoría">
          <SelectNativo value={alcance.categoriaId ?? ""} onChange={(e) => actualizar({ cat: e.target.value || null })}>
            <option value="">Todas</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre} ({c.variantes})
              </option>
            ))}
          </SelectNativo>
        </Filtro>
        <Filtro etiqueta="Cobertura">
          <SelectNativo value={vista.cobertura} onChange={(e) => actualizar({ cob: e.target.value === "todas" ? null : (e.target.value as FiltroCobertura) })}>
            {OPCIONES_COBERTURA.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.texto}
              </option>
            ))}
          </SelectNativo>
        </Filtro>
        <Filtro etiqueta="Sell-through">
          <SelectNativo value={vista.sellThrough} onChange={(e) => actualizar({ st: e.target.value === "todos" ? null : (e.target.value as FiltroSellThrough) })}>
            {OPCIONES_SELL_THROUGH.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.texto}
              </option>
            ))}
          </SelectNativo>
        </Filtro>
        <Filtro etiqueta="Estado">
          <SelectNativo value={vista.estado} onChange={(e) => actualizar({ est: e.target.value === "todos" ? null : (e.target.value as FiltroEstado) })}>
            {OPCIONES_ESTADO.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.texto}
              </option>
            ))}
          </SelectNativo>
        </Filtro>
      </div>
    </div>
  );
}
