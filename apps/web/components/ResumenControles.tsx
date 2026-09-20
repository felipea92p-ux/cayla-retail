"use client";

import { useState } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";
import { BuscadorDebounced } from "@/components/ui/BuscadorDebounced";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { ALTO_CONTROL, SelectNativo } from "@/components/ui/campos";
import type { CambiosUrl } from "@/components/useResumenUrl";
import type { ModoResumen } from "@/lib/resumen-comparacion";
import { etiquetaRango, MODOS_COMPARACION, PRESETS_PERIODO, type ModoComparacion, type PeriodoResuelto, type PresetPeriodo, type Rango } from "@/lib/resumen-periodo";
import { OPCIONES_SELL_THROUGH, type AlcanceResumen, type FiltroSellThrough } from "@/lib/resumen-filtros";

// La franja de mando del Análisis de inventario. Todo cambio va a la URL (`useResumenUrl`) y el
// servidor recalcula.
//
// DESEMPEÑO (`modo = "desempeno"`): «cómo se comportó el inventario en el período». Una sola barra:
// el período, los dos filtros que hablan del período (categoría y sell-through) y la búsqueda debajo,
// a todo el ancho. No hay «Comparar con» (para eso está la otra pestaña) ni filtros de cobertura o
// estado: dependían del stock de hoy, y esta pantalla no lo mira.
//
// COMPARAR PERÍODOS (`modo = "comparar"`): CONTEXTO de la página, no otra card protagonista (2026-09-19).
// Por defecto es una línea compacta «A · fecha → B · fecha» + un botón «Cambiar períodos» que despliega
// el mismo configurador de siempre (los presets de B y «comparar con» de A); el período analizado sigue
// siendo B y «Comparar con» A (anterior, mismo período del año pasado u «Otro período…» con fechas a mano;
// «Sin comparación» no existe: sin A no hay qué comparar). La búsqueda NO vive aquí: se mudó al Detalle
// (Vista general no filtra productos, los explica).

const ETIQUETA = "label-cayla text-[10px] text-tinta/65";

function Filtro({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className={`${ETIQUETA} block whitespace-nowrap`}>{etiqueta}</span>
      {children}
    </label>
  );
}

/** El popover de dos fechas («Período personalizado» de B, «Período A» de la comparación). */
function PopoverRango({
  titulo,
  desde,
  hasta,
  onDesde,
  onHasta,
  onCancelar,
  onAplicar,
}: {
  titulo: string;
  desde: string;
  hasta: string;
  onDesde: (v: string) => void;
  onHasta: (v: string) => void;
  onCancelar: () => void;
  onAplicar: () => void;
}) {
  const rangoValido = desde !== "" && hasta !== "" && desde <= hasta;
  return (
    <div className="absolute left-4 top-[calc(100%-0.25rem)] z-20 w-[min(22rem,calc(100%-2rem))] rounded-lg border border-tinta/15 bg-papel p-4 shadow-lg">
      <p className="label-cayla text-[11px] text-tinta">{titulo}</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <CampoFecha etiqueta="Desde" valor={desde} onValor={onDesde} />
        <CampoFecha etiqueta="Hasta" valor={hasta} onValor={onHasta} />
      </div>
      {!rangoValido && desde !== "" && hasta !== "" && <p className="mt-2 text-xs text-rojo-profundo">«Desde» no puede ser posterior a «Hasta».</p>}
      <div className="mt-4 flex justify-end gap-3">
        <button type="button" onClick={onCancelar} className="label-cayla text-[11px] text-tinta/65 hover:text-tinta">
          Cancelar
        </button>
        <button
          type="button"
          disabled={!rangoValido}
          onClick={onAplicar}
          className="label-cayla rounded-md bg-tinta px-4 py-2.5 text-[11px] text-crema transition-colors hover:bg-rojo disabled:cursor-not-allowed disabled:opacity-40"
        >
          Aplicar
        </button>
      </div>
    </div>
  );
}

export function ResumenControles({
  modo = "desempeno",
  periodo,
  alcance,
  categorias,
  actualizar,
  sellThrough = "todos",
  modoComparacion = "anterior",
  rangoComparacion = null,
}: {
  modo?: ModoResumen;
  periodo: PeriodoResuelto;
  alcance: AlcanceResumen;
  categorias: { id: string; nombre: string; variantes: number }[];
  actualizar: (cambios: CambiosUrl) => void;
  /** Solo Desempeño: la banda de sell-through elegida. */
  sellThrough?: FiltroSellThrough;
  /** Solo Comparar: cómo se eligió A y el rango con que se compara hoy (precarga las fechas de «Otro período…»). */
  modoComparacion?: ModoComparacion;
  rangoComparacion?: Rango | null;
}) {
  const comparando = modo === "comparar";
  // Un solo popover de fechas abierto a la vez: el del período (B) o el de «Otro período…» (A).
  const [abierto, setAbierto] = useState<"periodo" | "comparacion" | null>(null);
  // Solo Comparar: el configurador completo arranca cerrado (el contexto es la línea compacta A → B).
  const [config, setConfig] = useState(false);
  const [desde, setDesde] = useState(periodo.desde);
  const [hasta, setHasta] = useState(periodo.hasta);
  const [desdeA, setDesdeA] = useState(rangoComparacion?.desde ?? "");
  const [hastaA, setHastaA] = useState(rangoComparacion?.hasta ?? "");

  const elegirPreset = (p: PresetPeriodo) => {
    if (p === "personalizado") {
      setDesde(periodo.desde);
      setHasta(periodo.hasta);
      setAbierto((a) => (a === "periodo" ? null : "periodo"));
      return;
    }
    setAbierto(null);
    actualizar({ preset: p === "30d" ? null : p, desde: null, hasta: null });
  };

  const abrirComparacion = () => {
    setDesdeA(rangoComparacion?.desde ?? "");
    setHastaA(rangoComparacion?.hasta ?? "");
    setAbierto((a) => (a === "comparacion" ? null : "comparacion"));
  };

  const elegirComparacion = (valor: ModoComparacion) => {
    if (valor === "personalizado") return abrirComparacion();
    setAbierto(null);
    actualizar({ comparar: valor === "anterior" ? null : valor, cdesde: null, chasta: null });
  };

  const opcionesComparacion = MODOS_COMPARACION.filter((m) => m.valor !== "ninguna");

  // Las piezas se arman una vez y las usan las dos composiciones.
  const chipsPeriodo = (
    <div className="max-w-full">
      <span className={ETIQUETA}>
        {comparando ? (
          <>
            Período B <span className="normal-case tracking-normal text-tinta/50">(el que analizas)</span>
          </>
        ) : (
          "Período analizado"
        )}
      </span>
      <div className="mt-1.5 max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div role="radiogroup" aria-label={comparando ? "Período B" : "Período analizado"} className="inline-flex overflow-hidden rounded-md border border-tinta/15 bg-papel">
          {PRESETS_PERIODO.map((p) => {
            const activo = periodo.preset === p.valor && !(p.valor === "personalizado" && abierto !== "periodo" && periodo.preset !== "personalizado");
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
  );

  const selectorCategoria = (
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
  );

  const popoverPeriodo = abierto === "periodo" && (
    <PopoverRango
      titulo={comparando ? "Período B personalizado" : "Período personalizado"}
      desde={desde}
      hasta={hasta}
      onDesde={setDesde}
      onHasta={setHasta}
      onCancelar={() => setAbierto(null)}
      onAplicar={() => {
        setAbierto(null);
        actualizar({ preset: "personalizado", desde, hasta });
      }}
    />
  );

  // DESEMPEÑO: una sola barra. Arriba, el período a la izquierda y los dos filtros a la derecha (se
  // acomodan solos debajo del período si no caben); abajo, la búsqueda a todo el ancho.
  if (!comparando) {
    return (
      <div className="card-cayla relative min-w-0 space-y-4 p-4">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          {chipsPeriodo}
          {/* En celular los dos filtros se reparten el ancho de la fila; desde `sm` son de 11 rem cada uno. */}
          <div className="flex w-full min-w-0 flex-wrap items-end gap-x-4 gap-y-3 sm:w-auto">
            <div className="min-w-0 flex-1 sm:w-44 sm:flex-none">{selectorCategoria}</div>
            <div className="min-w-0 flex-1 sm:w-44 sm:flex-none">
              <Filtro etiqueta="Sell-through">
                <SelectNativo value={sellThrough} onChange={(e) => actualizar({ st: e.target.value === "todos" ? null : (e.target.value as FiltroSellThrough) })}>
                  {OPCIONES_SELL_THROUGH.map((o) => (
                    <option key={o.valor} value={o.valor}>
                      {o.texto}
                    </option>
                  ))}
                </SelectNativo>
              </Filtro>
            </div>
          </div>
        </div>
        <BuscadorDebounced valorUrl={alcance.q} onBuscar={(v) => actualizar({ q: v || null })} />
        {popoverPeriodo}
      </div>
    );
  }

  // COMPARAR PERÍODOS: contexto compacto «A → B» + «Cambiar períodos» (despliega el configurador de
  // siempre) + la categoría, un único filtro relevante acá. La búsqueda vive en Detalle.
  const anioDistinto = rangoComparacion ? rangoComparacion.desde.slice(0, 4) !== periodo.desde.slice(0, 4) || rangoComparacion.hasta.slice(0, 4) !== periodo.hasta.slice(0, 4) : false;
  return (
    <div className="relative min-w-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
        <p className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-sm">
          <span className="text-tinta/50">A ·</span>
          <span className="font-medium text-tinta">{rangoComparacion ? etiquetaRango(rangoComparacion, anioDistinto) : "—"}</span>
          <span aria-hidden className="text-tinta/35">
            →
          </span>
          <span className="sr-only">contra</span>
          <span className="text-tinta/50">B ·</span>
          <span className="font-medium text-tinta">{periodo.etiqueta}</span>
        </p>
        <button
          type="button"
          onClick={() => setConfig((c) => !c)}
          aria-expanded={config}
          aria-controls="comparar-config"
          className={`label-cayla inline-flex ${ALTO_CONTROL} items-center gap-1.5 whitespace-nowrap rounded-md border px-3 text-[11px] transition-colors ${
            config ? "border-tinta/30 bg-tinta/[0.04] text-tinta" : "border-tinta/15 text-tinta/70 hover:border-tinta/30 hover:text-tinta"
          }`}
        >
          <CalendarDays aria-hidden strokeWidth={1.5} className="h-3.5 w-3.5" />
          Cambiar períodos
          <ChevronDown aria-hidden strokeWidth={1.5} className={`h-3.5 w-3.5 transition-transform ${config ? "rotate-180" : ""}`} />
        </button>
        <div className="ml-auto w-full min-w-0 sm:ml-auto sm:w-44">{selectorCategoria}</div>
      </div>

      {config && (
        <div id="comparar-config" className="anim-revelar card-cayla relative mt-3 flex min-w-0 flex-wrap items-end gap-x-5 gap-y-3 p-4">
          {chipsPeriodo}

          <Filtro etiqueta="Período A · comparar con">
            <div className="mt-1.5 w-[11.5rem]">
              <SelectNativo value={modoComparacion} onChange={(e) => elegirComparacion(e.target.value as ModoComparacion)} aria-label="Período A: comparar con">
                {opcionesComparacion.map((m) => (
                  <option key={m.valor} value={m.valor}>
                    {m.texto}
                  </option>
                ))}
              </SelectNativo>
            </div>
          </Filtro>

          {/* «Otro período…» ya elegido: las fechas a la vista, y un clic para cambiarlas (el desplegable
              no avisa al volver a elegir la misma opción). */}
          {modoComparacion === "personalizado" && rangoComparacion && (
            <button
              type="button"
              onClick={abrirComparacion}
              aria-label={`Cambiar las fechas de comparación: ${etiquetaRango(rangoComparacion, true)}`}
              className={`label-cayla inline-flex ${ALTO_CONTROL} items-center gap-1.5 self-end whitespace-nowrap rounded-md border border-tinta/15 bg-papel px-3 text-[11px] text-tinta/80 transition-colors hover:border-tinta/40`}
            >
              <CalendarDays aria-hidden strokeWidth={1.5} className="h-3.5 w-3.5" />
              {etiquetaRango(rangoComparacion, anioDistinto)}
            </button>
          )}

          {popoverPeriodo}
          {abierto === "comparacion" && (
            <PopoverRango
              titulo="Período A · el que se compara"
              desde={desdeA}
              hasta={hastaA}
              onDesde={setDesdeA}
              onHasta={setHastaA}
              onCancelar={() => setAbierto(null)}
              onAplicar={() => {
                setAbierto(null);
                actualizar({ comparar: "personalizado", cdesde: desdeA, chasta: hastaA });
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
