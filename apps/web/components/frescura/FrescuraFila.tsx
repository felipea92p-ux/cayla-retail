"use client";

import Link from "next/link";
import type { MouseEvent } from "react";
import { Chip } from "@/components/ui/Chip";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import type { AparienciaPrenda, CategoriaVisual } from "@/lib/frescura";
import type { AccionDecision } from "@/lib/frescura-decisiones-reglas";
import type { FilaDeDecision } from "@/lib/frescura-decisiones-pantalla";
import { APROXIMADO, type AccionFila, type FilaVista } from "@/lib/frescura-pantalla";
import { EstadoChip, ICONO_SUGERENCIA } from "./piezas";

// Una prenda (modelo+color) de Frescura del piso: la fila de la tabla en la computadora y la tarjeta en el celular. Una fila =
// una prenda = una frase (Formidable, ADR-0350): la prenda con su miniatura (la foto o, sin foto, el ícono de su categoría sobre
// su color, ADR-0333), UNA palabra de estado en lenguaje de tienda con los días que lleva, y UNA frase de qué hacer. Todo lo demás
// —las tallas, la rapidez, lo vendido, el porqué— vive en la hoja de detalle, a un toque.
//
// Desde la actualización 2026-10-07 la fila también EJECUTA (`accionDeFila`): la primera sugerencia es un botón con su verbo.
// «La cambié de lugar» anota a un toque por el mismo camino que la hoja (con «Deshacer» 10 s); «Armar traslado», «Retirar del
// piso» y «Ver sus ventas» abren la pantalla que lo hace con la prenda cargada; «Decidir» abre la hoja cuando hay que elegir entre
// opciones. El nombre de la prenda es un botón que abre la hoja (el porqué); con el mouse, toda la fila la abre también, salvo sus
// propios botones.

/** Las columnas de la tabla, UNA vez: el encabezado de cada categoría y cada fila usan esta misma plantilla. */
export const PLANTILLA_FRESCURA = "md:grid-cols-[minmax(230px,1.5fr)_minmax(150px,0.85fr)_minmax(220px,1.5fr)_minmax(170px,auto)]";

/** Por debajo de este ancho la tabla se desliza dentro de su tarjeta, como `Tabla` (nunca la página entera). */
export const ANCHO_MINIMO_TABLA = "md:min-w-[840px]";

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

function Prenda({
  fila,
  muchasSinTemporada,
  apariencia,
  categoria,
  onAbrir,
}: {
  fila: FilaVista;
  muchasSinTemporada: boolean;
  apariencia: AparienciaPrenda | null;
  categoria: CategoriaVisual | null;
  onAbrir: () => void;
}) {
  const meta = [fila.color, fila.temporada].filter(Boolean).join(" · ");
  return (
    <div className="flex min-w-0 items-start gap-3">
      <MiniaturaPrenda fotoUrl={apariencia?.fotoUrl ?? null} colorHex={apariencia?.colorHex ?? null} tamano="xl" prefijo={categoria?.prefijo} familia={categoria?.familia} />
      <div className="min-w-0">
        {/* El nombre es el botón que abre la hoja: el porqué, las tallas y la libreta (también con el teclado). */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAbrir();
          }}
          aria-label={`${fila.nombre}${fila.color ? ` ${fila.color}` : ""}: abrir el detalle`}
          className="block text-left text-[15px] font-semibold leading-tight hover:underline focus-visible:underline"
        >
          {fila.nombre}
        </button>
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

/**
 * El botón de la fila: su verbo, y lo que hace. `anotar` deja la decisión anotada a un toque (y «Deshacer» en el aviso);
 * `enlace` abre la pantalla que hace la cosa; `hoja` abre la hoja para elegir. «¿Por qué?» abre siempre el detalle.
 */
function Accion({
  accion,
  enviando,
  onAnotar,
  onDecidir,
  onAbrir,
}: {
  accion: AccionFila | null;
  enviando: boolean;
  onAnotar: (accion: AccionDecision) => void;
  onDecidir: (opcion: AccionDecision | null) => void;
  onAbrir: () => void;
}) {
  const detener = (e: MouseEvent) => e.stopPropagation();
  return (
    <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 md:justify-end">
      {accion?.tipo === "anotar" && (
        <button
          type="button"
          className="btn-cayla btn-primario btn-chico"
          disabled={enviando}
          onClick={(e) => {
            detener(e);
            onAnotar(accion.accion);
          }}
        >
          {enviando ? "Anotando…" : accion.verbo}
        </button>
      )}
      {accion?.tipo === "enlace" && (
        <Link href={accion.href} className="btn-cayla btn-secundario btn-chico" onClick={detener}>
          {accion.verbo}
        </Link>
      )}
      {accion?.tipo === "hoja" && (
        <button
          type="button"
          className="btn-cayla btn-secundario btn-chico"
          onClick={(e) => {
            detener(e);
            onDecidir(accion.opcion);
          }}
        >
          {accion.verbo}
        </button>
      )}
      <button
        type="button"
        className="btn-cayla btn-enlace text-[13px]"
        onClick={(e) => {
          detener(e);
          onAbrir();
        }}
      >
        ¿Por qué?
      </button>
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
  accion,
  enviando,
  onAnotar,
  onDecidir,
}: {
  fila: FilaVista;
  muchasSinTemporada: boolean;
  onAbrir: () => void;
  decision: FilaDeDecision | null;
  /** «Aproximado» bajo el estado: solo si no hay un aviso único arriba (la regla se dice una vez, la excepción se marca). */
  marcarAproximado: boolean;
  apariencia: AparienciaPrenda | null;
  categoria: CategoriaVisual | null;
  /** El botón de la fila (`accionDeFila`), o null si no hay nada que hacer. */
  accion: AccionFila | null;
  /** Se está anotando ESTA prenda. */
  enviando: boolean;
  onAnotar: (accion: AccionDecision) => void;
  onDecidir: (opcion: AccionDecision | null) => void;
}) {
  return (
    <div
      onClick={onAbrir}
      tabIndex={-1}
      data-prenda={fila.clave}
      className={`fila-cayla relative cursor-pointer border-t border-sand ${fila.porDecidir ? FILETE : ""}`}
    >
      {/* Computadora: una fila de la tabla. */}
      <div className={`hidden items-center gap-x-4 px-5 py-3.5 md:grid ${PLANTILLA_FRESCURA}`}>
        <Prenda fila={fila} muchasSinTemporada={muchasSinTemporada} apariencia={apariencia} categoria={categoria} onAbrir={onAbrir} />
        <Estado fila={fila} marcarAproximado={marcarAproximado} />
        <QueHacer fila={fila} decision={decision} />
        <Accion accion={accion} enviando={enviando} onAnotar={onAnotar} onDecidir={onDecidir} onAbrir={onAbrir} />
      </div>

      {/* Celular: una tarjeta con lo mismo, apilado. */}
      <div className="flex flex-col gap-2.5 px-4 py-3.5 md:hidden">
        <Prenda fila={fila} muchasSinTemporada={muchasSinTemporada} apariencia={apariencia} categoria={categoria} onAbrir={onAbrir} />
        <Estado fila={fila} marcarAproximado={marcarAproximado} />
        <QueHacer fila={fila} decision={decision} />
        <Accion accion={accion} enviando={enviando} onAnotar={onAnotar} onDecidir={onDecidir} onAbrir={onAbrir} />
      </div>
    </div>
  );
}
