"use client";

import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { CalendarDays } from "lucide-react";
import { BuscadorDebounced } from "@/components/ui/BuscadorDebounced";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { ALTO_CONTROL, SelectNativo } from "@/components/ui/campos";
import { usePosicionAnclada } from "@/components/ui/useAnclaje";
import type { CambiosUrl } from "@/components/useResumenUrl";
import type { ModoResumen } from "@/lib/resumen-comparacion";
import { PRESETS_PERIODO, textoPildoraPeriodo, type ModoComparacion, type PeriodoResuelto, type PresetPeriodo, type Rango } from "@/lib/resumen-periodo";
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
// Desde el diseño de Figma del 2026-09-21 son dos píldoras, «Período A: desde … hasta …» y «Período B: desde …
// hasta …», del alto de todo control (`ALTO_CONTROL`) y alineadas con la línea del selector de Categoría.
// Tocar cualquiera abre EL MISMO selector de fechas (`PopoverRango`) que usa «Personalizado» en Desempeño —
// literal, sin nada propio de A o B adentro (2026-09-22, Felipe): Desde y Hasta escritos a mano, Cancelar y
// Aplicar. Los atajos que A y B tenían antes —A: período anterior o mismo período del año pasado; B: 7, 30, 90
// días y este mes— se quitaron: duplicaban los presets generales (B) o eran un caso de un solo módulo (A), y
// para elegir esas fechas alcanza con escribirlas. «Sin comparación» no existe: sin A no hay qué comparar. La
// búsqueda NO vive aquí: se mudó al Detalle (Vista general no filtra productos, los explica).

const ETIQUETA = "label-cayla text-[10px] text-tinta/65";

// Ancho nominal del selector de fechas (`w-[22rem]` en su propia clase, abajo): lo que usa
// `usePosicionAnclada` para no calcular un `left` que lo saque de la pantalla.
const ANCHO_POPOVER = 352;

function Filtro({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className={`${ETIQUETA} block whitespace-nowrap`}>{etiqueta}</span>
      {children}
    </label>
  );
}

/** El selector de fechas de todo el Análisis (2026-09-21): el de «Personalizado» en Desempeño y el de las
 *  píldoras A y B en Comparar son ESTE, no tres — Felipe lo pidió literal, sin diferencias: título, Desde/Hasta,
 *  Cancelar/Aplicar y nada más (2026-09-22: A y B traían además sus propios atajos —«Período anterior»/«Mismo
 *  período del año anterior» en A, «7/30/90 días · Este mes» repetido en B— y eso era justo lo que los volvía
 *  distintos entre sí; se quitaron, no se escondieron: A y B se eligen escribiendo la fecha, como Personalizado.
 *  Los presets generales de Desempeño, fuera de este panel, siguen intactos). Escribir es lo principal: abre con
 *  las dos fechas del período que se está viendo ya cargadas y «Desde» listo para teclear (seleccionado: lo
 *  escrito reemplaza la fecha), Tab pasa de una a otra y Enter aplica; el calendario de cada campo queda como
 *  ayuda, nunca obligatorio. Los errores van en línea, jamás un alert: una fecha que no existe se marca en su
 *  campo y «Desde» posterior a «Hasta» debajo de los dos. «Aplicar» no se apaga: al intentarlo con algo mal dice
 *  qué y lleva el foco al campo que hay que arreglar (un botón apagado no explica nada). Los topes del período
 *  —no empezar en el futuro, 366 días— siguen siendo del servidor, que avisa con su `advertencia`.
 *
 *  Se ancla a `control` (2026-09-22) con el mismo mecanismo que `MenuAcciones` — portal a `document.body` +
 *  `position: fixed` medida con `getBoundingClientRect` (`useAnclaje.ts`) — así los tres caen igual, pegados
 *  al control que los abrió, sin importar si ese control vive dentro de una franja con `overflow-x-auto` (el
 *  caso de «Personalizado», que antes se posicionaba contra la tarjeta entera por eso mismo). */
function PopoverRango({
  id,
  titulo,
  inicial,
  control,
  onCancelar,
  onAplicar,
}: {
  id: string;
  titulo: string;
  /** Las fechas con que abre: las del período que se está viendo (null = todavía sin fechas). */
  inicial: Rango | null;
  /** El control que lo abrió: se ancla debajo de él, alineado a su izquierda. */
  control: RefObject<HTMLElement | null>;
  onCancelar: () => void;
  onAplicar: (rango: Rango) => void;
}) {
  const pos = usePosicionAnclada(control, true, ANCHO_POPOVER);
  const [desde, setDesde] = useState(inicial?.desde ?? "");
  const [hasta, setHasta] = useState(inicial?.hasta ?? "");
  // Aplicar se intentó con algo mal: desde ahí los avisos se ven y se corrigen en vivo.
  const [intentado, setIntentado] = useState(false);
  // «Desde» posterior a «Hasta» solo se avisa cuando ya se salió de «Hasta»: mientras se escribe «Desde»
  // primero (y «Hasta» viene después) sería un aviso falso a mitad de camino.
  const [hastaTocado, setHastaTocado] = useState(false);
  const formulario = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const primero = formulario.current?.querySelector("input");
    primero?.focus();
    primero?.select();
  }, []);

  const completo = desde !== "" && hasta !== "";
  const alReves = completo && desde > hasta;

  const aplicar = (e: FormEvent) => {
    e.preventDefault();
    if (completo && !alReves) return onAplicar({ desde, hasta });
    setIntentado(true);
    formulario.current?.querySelectorAll("input")[desde === "" ? 0 : 1]?.focus();
  };

  // Todavía sin medir el control (primer render tras abrir): un cuadro sin posición se vería en 0,0.
  if (!pos) return null;

  return createPortal(
    <div
      id={id}
      role="group"
      aria-label={titulo}
      style={{ top: pos.top, left: pos.left }}
      className="anim-revelar fixed z-[60] w-[22rem] max-w-[calc(100vw-2rem)] rounded-lg border border-tinta/15 bg-papel p-4 shadow-lg"
    >
      <form ref={formulario} noValidate onSubmit={aplicar}>
        <p className="label-cayla text-[11px] text-tinta">{titulo}</p>
        {/* Lado a lado desde 380px: por debajo, cada campo queda de ~120px y «23/08/2026» (~127px con su
            icono de calendario) se corta; apilados caben en cualquier pantalla. */}
        <div className="mt-3 grid grid-cols-1 gap-3 min-[380px]:grid-cols-2">
          <div>
            <CampoFecha etiqueta="Desde" valor={desde} onValor={setDesde} required estricto revelarError={intentado} />
          </div>
          <div onBlur={() => setHastaTocado(true)}>
            <CampoFecha etiqueta="Hasta" valor={hasta} onValor={setHasta} required estricto revelarError={intentado} />
          </div>
        </div>
        {alReves && (intentado || hastaTocado) && (
          <p role="alert" className="mt-2 text-xs text-rojo-profundo">
            «Desde» no puede ser posterior a «Hasta».
          </p>
        )}
        <div className="mt-4 flex justify-end gap-3">
          <button type="button" onClick={onCancelar} className="label-cayla text-[11px] text-tinta/65 hover:text-tinta">
            Cancelar
          </button>
          <button type="submit" className="btn-cayla btn-primario">
            Aplicar
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}

/** La píldora de un período en «Comparar períodos» (Figma 2026-09-21): ícono de calendario de 14 px + texto de
 *  13 px medium, fondo tinta/4 %, borde tinta/30, radio 8, padding lateral 12, 8 entre ícono y texto. Del alto de
 *  todo control (`ALTO_CONTROL`, 36 px) —el frame la dibujó de 32 y con eso rompía la línea que comparten
 *  pestañas, presets y selector— y abierta (su selector de fechas a la vista) oscurece el borde. Es un botón: en
 *  una ventana angosta el texto se recorta con «…» antes que desbordar la fila.
 *
 *  `ref` (React 19: un componente función lo recibe como prop, sin `forwardRef`) apunta al botón real, para que
 *  `usePosicionAnclada` mida ESTE control y no un contenedor que lo envuelve. */
function PildoraPeriodo({
  texto,
  titulo,
  abierta,
  controla,
  onClick,
  ref,
}: {
  texto: string;
  titulo: string;
  abierta: boolean;
  controla: string;
  onClick: () => void;
  ref?: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-expanded={abierta}
      aria-controls={controla}
      title={titulo}
      className={`inline-flex ${ALTO_CONTROL} min-w-0 max-w-full items-center gap-2 rounded-md border bg-tinta/[0.04] px-3 text-xs font-medium text-tinta transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-rojo/60 ${
        abierta ? "border-tinta/60" : "border-tinta/30 hover:border-tinta/50"
      }`}
    >
      <CalendarDays aria-hidden strokeWidth={1.5} className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{texto}</span>
    </button>
  );
}

export function ResumenControles({
  modo = "desempeno",
  periodo,
  alcance,
  categorias,
  actualizar,
  sellThrough = "todos",
  rangoComparacion = null,
}: {
  modo?: ModoResumen;
  periodo: PeriodoResuelto;
  alcance: AlcanceResumen;
  categorias: { id: string; nombre: string; variantes: number }[];
  actualizar: (cambios: CambiosUrl) => void;
  /** Solo Desempeño: la banda de sell-through elegida. */
  sellThrough?: FiltroSellThrough;
  /** Solo Comparar: cómo se eligió A (período anterior, mismo período del año pasado, u otro escrito a mano).
   *  `ResumenComparacionPanel.tsx` lo sigue mandando — es lo que decide, en `resumen-periodo.ts`, cuál es el
   *  rango por defecto de A — pero este componente ya no lo usa para dibujar nada (2026-09-22: la píldora A ya
   *  no trae atajos propios, así que no hay un botón que necesite saber cuál está activo). */
  modoComparacion?: ModoComparacion;
  rangoComparacion?: Rango | null;
}) {
  const comparando = modo === "comparar";
  // Un solo selector de fechas abierto a la vez: el del período que se analiza (B en Comparar,
  // «Personalizado» en Desempeño) o el de A, el período contra el que se compara.
  const [abierto, setAbierto] = useState<"periodo" | "comparacion" | null>(null);
  const alternar = (cual: "periodo" | "comparacion") => setAbierto((a) => (a === cual ? null : cual));
  // El control que abre cada selector — `usePosicionAnclada` (dentro de `PopoverRango`) mide ESTE elemento,
  // sea la píldora B o el chip «Personalizado»: dos controles distintos según el modo, un solo ref porque
  // nunca se dibujan los dos a la vez.
  const refPeriodo = useRef<HTMLButtonElement>(null);
  const refComparacion = useRef<HTMLButtonElement>(null);

  const elegirPreset = (p: PresetPeriodo) => {
    if (p === "personalizado") return alternar("periodo");
    setAbierto(null);
    actualizar({ preset: p === "30d" ? null : p, desde: null, hasta: null });
  };

  // Las piezas se arman una vez y las usan las dos composiciones.
  const chipsPeriodo = (
    <div className="max-w-full">
      <span className={ETIQUETA}>Período analizado</span>
      <div className="mt-1.5 max-w-full">
        {/* Guía oficial (ADR-0169): píldoras que se envuelven en el celular, en vez de un segmento que se corta. */}
        <div role="radiogroup" aria-label="Período analizado" className="flex flex-wrap gap-1.5">
          {PRESETS_PERIODO.map((p) => {
            const activo = periodo.preset === p.valor && !(p.valor === "personalizado" && abierto !== "periodo" && periodo.preset !== "personalizado");
            return (
              <button
                key={p.valor}
                // Solo «Personalizado» abre un selector: es el único control que `usePosicionAnclada`
                // necesita medir. Los demás presets se aplican solos, sin panel que anclar.
                ref={p.valor === "personalizado" ? refPeriodo : undefined}
                type="button"
                role="radio"
                aria-checked={periodo.preset === p.valor}
                onClick={() => elegirPreset(p.valor)}
                data-activa={activo}
                className="pildora-cayla focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rojo/60"
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

  // El selector del período que se analiza: B en Comparar y «Personalizado» en Desempeño — el mismo panel,
  // sin atajos propios; los presets generales de 7/30/90 días y Este mes se eligen fuera, en `chipsPeriodo`.
  const popoverPeriodo = abierto === "periodo" && (
    <PopoverRango
      id="selector-periodo"
      titulo={comparando ? "Período B · el que analizas" : "Período personalizado"}
      inicial={{ desde: periodo.desde, hasta: periodo.hasta }}
      control={refPeriodo}
      onCancelar={() => setAbierto(null)}
      onAplicar={({ desde, hasta }) => {
        setAbierto(null);
        actualizar({ preset: "personalizado", desde, hasta });
      }}
    />
  );

  // DESEMPEÑO: una sola barra. Arriba, el período a la izquierda y los dos filtros a la derecha (se
  // acomodan solos debajo del período si no caben); abajo, la búsqueda a todo el ancho.
  if (!comparando) {
    return (
      <div className="card-cayla min-w-0 space-y-4 p-4">
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

  // COMPARAR PERÍODOS: dos píldoras —A y B, cada una con SU rango— + la categoría, el único filtro relevante
  // acá. Las tres piezas son del alto de un control y comparten el borde de abajo: la píldora se alinea con la
  // línea del selector (no con su etiqueta, que queda por encima). La búsqueda vive en Detalle. Cada píldora
  // lleva pegado su selector de fechas, para que se abra justo debajo de la que se tocó.
  const anioDistinto = rangoComparacion ? rangoComparacion.desde.slice(0, 4) !== periodo.desde.slice(0, 4) || rangoComparacion.hasta.slice(0, 4) !== periodo.hasta.slice(0, 4) : false;

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2.5">
        <PildoraPeriodo
          ref={refComparacion}
          texto={textoPildoraPeriodo("A", rangoComparacion, anioDistinto)}
          titulo="Período A: contra el que se compara"
          abierta={abierto === "comparacion"}
          controla="selector-comparacion"
          onClick={() => alternar("comparacion")}
        />
        {abierto === "comparacion" && (
          <PopoverRango
            id="selector-comparacion"
            titulo="Período A · el que se compara"
            inicial={rangoComparacion}
            control={refComparacion}
            onCancelar={() => setAbierto(null)}
            onAplicar={({ desde, hasta }) => {
              setAbierto(null);
              actualizar({ comparar: "personalizado", cdesde: desde, chasta: hasta });
            }}
          />
        )}
        <PildoraPeriodo
          ref={refPeriodo}
          texto={textoPildoraPeriodo("B", { desde: periodo.desde, hasta: periodo.hasta }, anioDistinto)}
          titulo="Período B: el que analizas"
          abierta={abierto === "periodo"}
          controla="selector-periodo"
          onClick={() => alternar("periodo")}
        />
        {popoverPeriodo}
        <div className="ml-auto w-full min-w-0 sm:ml-auto sm:w-44">{selectorCategoria}</div>
      </div>
    </div>
  );
}
