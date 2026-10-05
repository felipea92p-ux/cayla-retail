"use client";

import { Shirt } from "lucide-react";
import type { KeyboardEvent } from "react";
import { Chip } from "@/components/ui/Chip";
import type { FilaDeDecision } from "@/lib/frescura-decisiones-pantalla";
import { QUIZA_MAS, palabraDias, type FilaVista, type RapidezVista } from "@/lib/frescura-pantalla";
import { EstadoChip, ICONO_SUGERENCIA, NivelChip } from "./piezas";

// Una prenda (modelo+color) de Frescura del piso: la fila de la tabla en la computadora y la tarjeta en el celular
// (maqueta `docs/maquetas/frescura-3c-2026-09/`, colores A y frases C). Toda la fila abre su hoja de detalle: no tiene
// controles adentro, así que tocar cualquier parte es la misma acción (y Enter o Espacio con el teclado).

/** Las columnas de la tabla, UNA vez: el encabezado de cada categoría y cada fila usan esta misma plantilla. */
export const PLANTILLA_FRESCURA =
  "md:grid-cols-[minmax(150px,1.4fr)_124px_76px_minmax(116px,0.9fr)_minmax(112px,0.95fr)_50px_minmax(140px,1.25fr)]";

/** Por debajo de este ancho la tabla se desliza dentro de su tarjeta, como `Tabla` (nunca la página entera). Con el
 *  lateral abierto, a 1280 px la tarjeta mide 928: la tabla entra entera (la maqueta lo pedía sin desplazamiento). */
export const ANCHO_MINIMO_TABLA = "md:min-w-[880px]";

function Tallas({ fila, leyenda = false }: { fila: FilaVista; leyenda?: boolean }) {
  const hayApartadas = fila.tallas.some((t) => t.apartadas > 0);
  return (
    <div>
      {leyenda && <span className="mb-1 block text-[11px] text-taupe">Tallas: piso · almacén{hayApartadas ? " · apartadas" : ""}</span>}
      <span className="flex flex-wrap gap-1">
        {fila.tallas.map((t) => (
          <span
            key={t.varianteId}
            title={`Talla ${t.talla}: ${t.piso} en el piso, ${t.almacen} en el almacén${t.apartadas ? `, ${t.apartadas} apartadas` : ""}`}
            className="inline-flex min-w-[38px] flex-col items-center rounded-[7px] bg-hueso px-1 py-[3px] text-[11.5px] leading-tight"
          >
            <b className="text-[10.5px] font-semibold text-taupe">{t.talla}</b>
            <span className="tabular-nums">
              {t.piso}·{t.almacen}
            </span>
            {t.apartadas > 0 && <span className="text-[10px] font-semibold text-taupe">{t.apartadas} ap.</span>}
          </span>
        ))}
      </span>
    </div>
  );
}

function Dias({ fila, derecha = false }: { fila: FilaVista; derecha?: boolean }) {
  if (fila.dias === null)
    return (
      <span className={`whitespace-nowrap text-sm text-taupe ${derecha ? "text-right" : ""}`}>
        <b className="font-display text-[20px] font-semibold leading-none">—</b>
      </span>
    );
  return (
    <span className={`block whitespace-nowrap text-sm ${derecha ? "text-right" : ""}`}>
      <b className="font-display text-[20px] font-semibold leading-none tabular-nums">{fila.dias}</b> {palabraDias(fila.dias)}
      {fila.quizaMas && <span className="block text-[11px] leading-snug text-taupe">{QUIZA_MAS}</span>}
      {fila.apartada && <span className="block whitespace-normal text-[11px] leading-snug text-taupe">parado: está apartada</span>}
    </span>
  );
}

function Rapidez({ r, vendio }: { r: RapidezVista; vendio?: string | null }) {
  return (
    <div className="flex flex-col items-start gap-0.5">
      <span className="text-[13.5px] leading-snug">{r.texto}</span>
      {r.detalle && <span className="text-xs tabular-nums leading-snug text-taupe">{r.detalle}</span>}
      {r.porque && <span className="text-xs leading-snug text-taupe">{r.porque}</span>}
      {vendio && <span className="text-xs leading-snug text-taupe md:hidden">{vendio}</span>}
      {r.nivel && r.nivel !== "solido" && (
        <span className="mt-1">
          <NivelChip nivel={r.nivel} />
        </span>
      )}
    </div>
  );
}

/**
 * Lo que se decidió (paso 4b): con una decisión vigente reemplaza a las preguntas («Decidida · se cambió de lugar · se revisa el
 * mar 6»); cuando ya terminó, cuenta cómo le fue y las preguntas de abajo salen de ESE resultado. Nunca rojo.
 */
function Decision({ d }: { d: FilaDeDecision }) {
  return (
    <div className="flex flex-col items-start gap-1">
      <Chip tono={d.chip.tono} className="!px-2 !text-[11.5px] !leading-[18px]">
        {d.chip.texto}
      </Chip>
      <span className="text-[12.5px] leading-snug text-tinta/80">{d.frase}</span>
    </div>
  );
}

function Sugerencias({ fila, decision }: { fila: FilaVista; decision: FilaDeDecision | null }) {
  if (decision?.vigente) return <Decision d={decision} />;
  if (fila.sugerencias.length === 0) return decision ? <Decision d={decision} /> : <span className="text-[12.5px] text-taupe">{fila.nada}</span>;
  return (
    <div className="flex flex-col items-start gap-1.5">
      {decision && <Decision d={decision} />}
      {fila.sugerencias.map((s) => {
        const Icono = ICONO_SUGERENCIA[s.clave];
        return (
          <span key={s.clave} className="flex items-start gap-1.5 text-[13px] leading-snug">
            <Icono aria-hidden strokeWidth={1.6} className="mt-0.5 h-3.5 w-3.5 shrink-0 text-taupe" />
            <span>{s.texto}</span>
          </span>
        );
      })}
    </div>
  );
}

function Prenda({ fila, muchasSinTemporada }: { fila: FilaVista; muchasSinTemporada: boolean }) {
  const meta = [fila.color, fila.temporada].filter(Boolean).join(" · ");
  return (
    <div className="flex min-w-0 gap-2.5">
      <span aria-hidden className="grid h-[42px] w-[34px] shrink-0 place-items-center rounded-[7px] bg-hueso text-taupe">
        <Shirt strokeWidth={1.3} className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0">
        <div className="text-sm font-semibold leading-tight">{fila.nombre}</div>
        {meta && <div className="text-[12.5px] leading-snug text-taupe">{meta}</div>}
        {(fila.temporadaPasada || (fila.sinTemporada && !muchasSinTemporada)) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1">
            {fila.temporadaPasada && (
              <>
                <Chip tono="ambar" className="!px-2 !text-[11.5px] !leading-[18px]">
                  Temporada pasada
                </Chip>
                <span className="text-[11.5px] leading-snug text-taupe">{fila.temporadaPasada}</span>
              </>
            )}
            {fila.sinTemporada && !muchasSinTemporada && (
              <Chip tono="neutro" className="!px-2 !text-[11.5px] !leading-[18px]">
                ¿De qué temporada es? Complétala
              </Chip>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** El filete gris a la izquierda de lo que está «Por decidir». */
const FILETE = "before:pointer-events-none before:absolute before:bottom-3 before:left-0 before:top-3 before:w-0.5 before:rounded-sm before:bg-tinta/35";

export function FrescuraFila({ fila, muchasSinTemporada, onAbrir, decision }: { fila: FilaVista; muchasSinTemporada: boolean; onAbrir: () => void; decision: FilaDeDecision | null }) {
  const alTeclado = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onAbrir();
    }
  };
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onAbrir}
      onKeyDown={alTeclado}
      aria-label={`${fila.nombre}${fila.color ? ` ${fila.color}` : ""}: abrir el detalle`}
      data-prenda={fila.clave}
      className={`fila-cayla relative cursor-pointer border-t border-sand focus-visible:bg-crema/60 ${fila.porDecidir ? FILETE : ""}`}
    >
      {/* Computadora: una fila de la tabla. */}
      <div className={`hidden items-start gap-x-3 px-5 py-3 md:grid ${PLANTILLA_FRESCURA}`}>
        <Prenda fila={fila} muchasSinTemporada={muchasSinTemporada} />
        <Tallas fila={fila} />
        <Dias fila={fila} derecha />
        <EstadoChip estado={fila.estado} />
        <Rapidez r={fila.rapidez} />
        <span className="text-right text-sm tabular-nums">{fila.vendio ?? "—"}</span>
        <Sugerencias fila={fila} decision={decision} />
      </div>

      {/* Celular: una tarjeta, con la leyenda de las tallas y lo vendido dentro de la rapidez. */}
      <div className="flex flex-col gap-2 px-4 py-3.5 md:hidden">
        <div className="flex items-start justify-between gap-3">
          <Prenda fila={fila} muchasSinTemporada={muchasSinTemporada} />
          <Dias fila={fila} derecha />
        </div>
        <EstadoChip estado={fila.estado} apilado={false} />
        <Rapidez r={fila.rapidez} vendio={fila.vendioTexto} />
        <Tallas fila={fila} leyenda />
        <Sugerencias fila={fila} decision={decision} />
      </div>
    </div>
  );
}
