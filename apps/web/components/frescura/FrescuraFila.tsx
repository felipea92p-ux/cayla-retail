"use client";

import { ChevronRight } from "lucide-react";
import type { KeyboardEvent } from "react";
import { Chip } from "@/components/ui/Chip";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import type { AparienciaPrenda, CategoriaVisual } from "@/lib/frescura";
import type { FilaDeDecision } from "@/lib/frescura-decisiones-pantalla";
import { APROXIMADO, type FilaVista } from "@/lib/frescura-pantalla";
import { EstadoChip, ICONO_SUGERENCIA } from "./piezas";

// Una prenda (modelo+color) de Frescura del piso: la fila de la tabla en la computadora y la tarjeta en el celular. Una fila =
// una prenda = una frase (Formidable, ADR-0350): la prenda con su miniatura (la foto o, sin foto, el ícono de su categoría sobre
// su color, ADR-0333), UNA palabra de estado en lenguaje de tienda con los días que lleva, y UNA frase de qué hacer. Todo lo demás
// —las tallas, la rapidez, lo vendido, el porqué— vive en la hoja de detalle, a un toque. Toda la fila abre esa hoja: no tiene
// controles adentro, así que tocar cualquier parte es la misma acción (y Enter o Espacio con el teclado).

/** Las columnas de la tabla, UNA vez: el encabezado de cada categoría y cada fila usan esta misma plantilla. */
export const PLANTILLA_FRESCURA = "md:grid-cols-[minmax(230px,1.5fr)_minmax(150px,0.85fr)_minmax(230px,1.6fr)_76px]";

/** Por debajo de este ancho la tabla se desliza dentro de su tarjeta, como `Tabla` (nunca la página entera). */
export const ANCHO_MINIMO_TABLA = "md:min-w-[760px]";

/**
 * Lo que se decidió (paso 4b): con una decisión vigente reemplaza a las preguntas («Decidida · se cambió de lugar · se revisa el
 * mar 6»); cuando ya terminó, cuenta cómo le fue y las preguntas de abajo salen de ESE resultado. Nunca rojo.
 */
function Decision({ d }: { d: FilaDeDecision }) {
  return (
    <div className="flex flex-col items-start gap-1">
      <Chip tono={d.chip.tono} className="!px-2 !text-[12.5px] !leading-[18px]">
        {d.chip.texto}
      </Chip>
      <span className="text-[12.5px] leading-snug text-tinta/80">{d.frase}</span>
    </div>
  );
}

/** «Qué hacer»: UNA frase —la primera sugerencia— y, si hay más, «y 1 más en el detalle»: el resto vive a un toque (ley 2 y 6). */
function QueHacer({ fila, decision }: { fila: FilaVista; decision: FilaDeDecision | null }) {
  if (decision?.vigente) return <Decision d={decision} />;
  if (fila.sugerencias.length === 0) return decision ? <Decision d={decision} /> : <span className="text-[13px] text-taupe">{fila.nada}</span>;
  const [primera, ...otras] = fila.sugerencias;
  const Icono = ICONO_SUGERENCIA[primera.clave];
  return (
    <div className="flex flex-col items-start gap-1.5">
      {decision && <Decision d={decision} />}
      <span className="flex items-start gap-1.5 text-[13.5px] leading-snug">
        <Icono aria-hidden strokeWidth={1.6} className="mt-0.5 h-3.5 w-3.5 shrink-0 text-taupe" />
        <span>{primera.texto}</span>
      </span>
      {otras.length > 0 && <span className="pl-5 text-[12.5px] text-taupe">y {otras.length} más en el detalle</span>}
    </div>
  );
}

function Prenda({ fila, muchasSinTemporada, apariencia, categoria }: { fila: FilaVista; muchasSinTemporada: boolean; apariencia: AparienciaPrenda | null; categoria: CategoriaVisual | null }) {
  const meta = [fila.color, fila.temporada].filter(Boolean).join(" · ");
  return (
    <div className="flex min-w-0 items-start gap-3">
      <MiniaturaPrenda fotoUrl={apariencia?.fotoUrl ?? null} colorHex={apariencia?.colorHex ?? null} tamano="xl" prefijo={categoria?.prefijo} familia={categoria?.familia} />
      <div className="min-w-0">
        <div className="text-[15px] font-semibold leading-tight">{fila.nombre}</div>
        {meta && <div className="text-[13px] leading-snug text-taupe">{meta}</div>}
        {(fila.temporadaPasada || (fila.sinTemporada && !muchasSinTemporada)) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1">
            {fila.temporadaPasada && (
              <>
                <Chip tono="ambar" className="!px-2 !text-[12px] !leading-[18px]">
                  Temporada pasada
                </Chip>
                <span className="text-[12px] leading-snug text-taupe">{fila.temporadaPasada}</span>
              </>
            )}
            {fila.sinTemporada && !muchasSinTemporada && (
              <Chip tono="neutro" className="!px-2 !text-[12px] !leading-[18px]">
                ¿De qué temporada es? Complétala
              </Chip>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** El estado en UNA palabra y, debajo, cuánto lleva: «Se está quedando · Lleva 18 días». */
function Estado({ fila, marcarAproximado }: { fila: FilaVista; marcarAproximado: boolean }) {
  // «Aproximado» se dice en la fila solo cuando es la excepción; cuando es la regla, lo dice UN aviso arriba de la tabla.
  const estado = marcarAproximado ? fila.estado : { ...fila.estado, debajo: fila.estado.debajo.filter((d) => d !== APROXIMADO) };
  return (
    <div className="flex flex-col items-start gap-1">
      <EstadoChip estado={estado} />
      {fila.llevaTexto && <span className="text-[13px] leading-snug text-taupe">{fila.llevaTexto}</span>}
    </div>
  );
}

/** Lo que dice que la fila se toca: una flecha; en las que esperan una decisión, «Decidir». No es un botón aparte (toda la fila lo es). */
function Abrir({ fila }: { fila: FilaVista }) {
  return (
    <span aria-hidden className={`flex items-center justify-end gap-0.5 text-[13px] ${fila.porDecidir ? "font-semibold text-ambar-profundo" : "text-taupe"}`}>
      {fila.porDecidir && "Decidir"}
      <ChevronRight strokeWidth={1.8} className="h-4 w-4" />
    </span>
  );
}

/** El filete gris a la izquierda de lo que está «Por decidir». */
const FILETE = "before:pointer-events-none before:absolute before:bottom-3 before:left-0 before:top-3 before:w-0.5 before:rounded-sm before:bg-tinta/35";

export function FrescuraFila({
  fila,
  muchasSinTemporada,
  onAbrir,
  decision,
  marcarAproximado,
  apariencia,
  categoria,
}: {
  fila: FilaVista;
  muchasSinTemporada: boolean;
  onAbrir: () => void;
  decision: FilaDeDecision | null;
  /** «Aproximado» bajo el estado: solo si no hay un aviso único arriba (la regla se dice una vez, la excepción se marca). */
  marcarAproximado: boolean;
  apariencia: AparienciaPrenda | null;
  categoria: CategoriaVisual | null;
}) {
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
      <div className={`hidden items-center gap-x-4 px-5 py-3.5 md:grid ${PLANTILLA_FRESCURA}`}>
        <Prenda fila={fila} muchasSinTemporada={muchasSinTemporada} apariencia={apariencia} categoria={categoria} />
        <Estado fila={fila} marcarAproximado={marcarAproximado} />
        <QueHacer fila={fila} decision={decision} />
        <Abrir fila={fila} />
      </div>

      {/* Celular: una tarjeta con lo mismo, apilado. */}
      <div className="flex flex-col gap-2.5 px-4 py-3.5 md:hidden">
        <div className="flex items-start justify-between gap-3">
          <Prenda fila={fila} muchasSinTemporada={muchasSinTemporada} apariencia={apariencia} categoria={categoria} />
          <Abrir fila={fila} />
        </div>
        <Estado fila={fila} marcarAproximado={marcarAproximado} />
        <QueHacer fila={fila} decision={decision} />
      </div>
    </div>
  );
}
