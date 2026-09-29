"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { CalendarDays } from "lucide-react";
import { BuscadorDebounced } from "@/components/ui/BuscadorDebounced";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { Desplegable } from "@/components/ui/campos";
import { usePosicionAnclada } from "@/components/ui/useAnclaje";
import type { CambiosUrl } from "@/components/useResumenUrl";
import { guardarParElegido } from "@/lib/resumen-periodos-guardados";
import { etiquetaRangoLarga, PRESETS_PERIODO, textoPildoraPeriodo, type PeriodoResuelto, type PresetPeriodo, type Rango } from "@/lib/resumen-periodo";
import type { AlcanceResumen } from "@/lib/resumen-filtros";

// La franja de mando del Análisis de inventario. Todo cambio va a la URL (`useResumenUrl`) y el
// servidor recalcula.
//
// UNA SOLA TARJETA, «PERÍODO ANALIZADO», la misma en las dos pestañas (2026-09-29, Felipe: «literalmente el mismo
// componente, no una segunda versión parecida»). `MarcoPeriodoAnalizado` la dibuja —contenedor, etiqueta, medidas,
// buscador— y lo único que cambia entre pestañas es lo que se le pone en la fila de arriba:
//
//   DESEMPEÑO (`modo = "desempeno"`): «cómo se comportó el inventario en el período». Arriba, los atajos de período
//   (7, 30, 90 días, Este mes, Personalizado) y el filtro de categoría; debajo, la búsqueda a todo el ancho. Lo que define
//   QUÉ se mira (el alcance de cifras, gráficos y tabla). La banda de sell-through se mudó a la cabecera de la tabla
//   (2026-09-22): solo recorta la tabla. No hay «Comparar con» (para eso está la otra pestaña) ni filtros de cobertura o
//   estado: dependían del stock de hoy, y esta pantalla no lo mira.
//
//   COMPARAR PERÍODOS (`modo = "comparar"`): «qué cambió entre dos períodos». Arriba, dos píldoras —«Período A: 1 ago. →
//   30 ago.» y «Período B: 31 ago. → 29 sep.»— y nada más: sin atajos (aquí siempre hay DOS períodos y se eligen
//   escribiendo las fechas), sin categoría (2026-09-29: el único filtro que quedaba era la búsqueda, y es la misma de
//   Desempeño) y sin fila fija para avisos: si hay algo que la persona deba saber —A anterior al historial, períodos que
//   duran distinto o se superponen— aparece bajo las píldoras y desaparece cuando ya no aplica. Tocar una píldora abre EL
//   MISMO selector de fechas (`PopoverRango`) que «Personalizado» en Desempeño, sin nada propio de A o B adentro
//   (2026-09-22, Felipe): Desde y Hasta escritos a mano, Cancelar y Aplicar. «Sin comparación» no existe: sin A no hay qué
//   comparar. Elegir A o B deja los dos períodos en la URL y los recuerda (`resumen-periodos-guardados.ts`).

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
 *  caso de «Personalizado», que antes se posicionaba contra la tarjeta entera por eso mismo).
 *
 *  OJO (2026-09-29, ADR-0277): lo de «Desde» listo para teclear que dice arriba HOY NO OCURRE, ni aquí ni en Comparar: el
 *  efecto de abajo pide el foco antes de que exista el formulario (`usePosicionAnclada` mide en un `useLayoutEffect`, así que
 *  el primer render devuelve `null`) y no vuelve a correr. Se dejó así a propósito —activarlo abriría el teclado del celular
 *  al tocar «Personalizado», «Período A» o «Período B»—; está en el backlog para que Felipe decida. */
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

/** «PERÍODO ANALIZADO» y, debajo, la fila de píldoras del período: los atajos y «Personalizado» en Desempeño; A y B en
 *  Comparar. Es la MISMA pieza en las dos pestañas: la etiqueta, la separación y el envoltorio no se reescriben. */
function BloquePeriodo({ rol, etiqueta, children }: { rol: "radiogroup" | "group"; etiqueta: string; children: ReactNode }) {
  return (
    <div className="max-w-full">
      <span className={ETIQUETA}>Período analizado</span>
      <div className="mt-1.5 max-w-full">
        {/* Guía oficial (ADR-0169): píldoras que se envuelven en el celular, en vez de un segmento que se corta. */}
        <div role={rol} aria-label={etiqueta} className="flex flex-wrap gap-1.5">
          {children}
        </div>
      </div>
    </div>
  );
}

type AccionActualizar = (cambios: CambiosUrl, opciones?: { tipeado?: boolean }) => void;

/** La tarjeta de «PERÍODO ANALIZADO»: papel, borde sand, esquina redondeada y 16 px de aire (`card-cayla`), la fila de
 *  arriba, un aviso SOLO si lo hay, y la búsqueda a todo el ancho. Desempeño y Comparar la dibujan con este mismo
 *  componente: cambiar una medida acá la cambia en las dos. `selectores` son los paneles de fechas (portales: no ocupan
 *  lugar en la tarjeta). */
function MarcoPeriodoAnalizado({
  arriba,
  avisos = [],
  q,
  actualizar,
  selectores,
}: {
  arriba: ReactNode;
  /** Lo que la persona debe saber antes de creer una cifra. Sin nada que decir no hay fila ni hueco reservado. */
  avisos?: readonly string[];
  q: string;
  actualizar: AccionActualizar;
  selectores?: ReactNode;
}) {
  return (
    <div className="card-cayla min-w-0 space-y-4 p-4">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">{arriba}</div>
      {avisos.length > 0 && (
        // Pegado a las píldoras que explica (el `space-y-4` de la tarjeta lo separaría de ellas). Ámbar de 11 px, como la
        // advertencia de período de Desempeño: es información, no un error.
        <div role="status" className="-mt-2 space-y-1 text-[11px] text-ambar-profundo">
          {avisos.map((aviso) => (
            <p key={aviso}>{aviso}</p>
          ))}
        </div>
      )}
      {/* `data-buscador-analisis`: «Escribir» desde el escáner del celular pone el foco aquí (AnalisisPrendas). */}
      <div data-buscador-analisis>
        <BuscadorDebounced valorUrl={q} onBuscar={(v) => actualizar({ q: v || null }, { tipeado: true })} />
      </div>
      {selectores}
    </div>
  );
}

/** La píldora de A o de B: la MISMA `pildora-cayla` de los atajos de Desempeño, con el ícono de calendario de
 *  «Personalizado» —que abre el mismo selector de fechas— y las dos fechas a la vista: «Período A: 1 ago. → 30 ago.».
 *  Mientras su selector está abierto se rellena (`data-activa`), como cualquier píldora elegida. Es un botón: en una
 *  ventana angosta el texto se recorta con «…» antes que desbordar la fila.
 *
 *  `ref` (React 19: un componente función lo recibe como prop, sin `forwardRef`) apunta al botón real, para que
 *  `usePosicionAnclada` mida ESTE control y no un contenedor que lo envuelve. */
function PildoraDePeriodo({
  texto,
  nombre,
  ayuda,
  abierta,
  controla,
  onClick,
  ref,
}: {
  texto: string;
  /** Cómo se lee en voz alta: «Período A: desde 1 ago. hasta 30 ago.» (la flecha no se lee bien). */
  nombre: string;
  /** El cuadro que sale al pasar el mouse: qué es este período. */
  ayuda: string;
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
      aria-label={nombre}
      title={ayuda}
      data-activa={abierta}
      className="pildora-cayla min-w-0 max-w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rojo/60"
    >
      <CalendarDays aria-hidden strokeWidth={1.5} className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{texto}</span>
    </button>
  );
}

type Comun = { periodo: PeriodoResuelto; alcance: AlcanceResumen; actualizar: AccionActualizar };
type PropsDesempeno = Comun & { modo?: "desempeno"; categorias: { id: string; nombre: string; variantes: number }[] };
type PropsComparar = Comun & {
  modo: "comparar";
  /** A resuelto por el servidor (siempre existe: sin A no hay qué comparar). `periodo` es B. */
  rangoA: Rango;
  /** Lo que hay que decirle a la persona bajo las píldoras; vacío = no se dibuja nada. */
  avisos: readonly string[];
  /** La llave donde se recuerdan A y B (`clavePeriodosElegidos`): por sede y por persona. */
  claveGuardado: string;
};

export function ResumenControles(props: PropsDesempeno | PropsComparar) {
  return props.modo === "comparar" ? <ControlesComparar {...props} /> : <ControlesDesempeno {...props} />;
}

// DESEMPEÑO: el período a la izquierda y el filtro de categoría a la derecha (se acomoda solo debajo del período si no
// cabe); abajo, la búsqueda a todo el ancho.
function ControlesDesempeno({ periodo, alcance, categorias, actualizar }: PropsDesempeno) {
  // El selector de fechas de «Personalizado» (los demás atajos se aplican solos, sin panel que anclar).
  const [abierto, setAbierto] = useState(false);
  // El control que abre el selector: `usePosicionAnclada` (dentro de `PopoverRango`) mide ESTE elemento.
  const refPersonalizado = useRef<HTMLButtonElement>(null);

  const elegirPreset = (p: PresetPeriodo) => {
    if (p === "personalizado") return setAbierto((a) => !a);
    setAbierto(false);
    actualizar({ preset: p === "30d" ? null : p, desde: null, hasta: null });
  };

  return (
    <MarcoPeriodoAnalizado
      arriba={
        <>
          <BloquePeriodo rol="radiogroup" etiqueta="Período analizado">
            {PRESETS_PERIODO.map((p) => (
              <button
                key={p.valor}
                ref={p.valor === "personalizado" ? refPersonalizado : undefined}
                type="button"
                role="radio"
                aria-checked={periodo.preset === p.valor}
                onClick={() => elegirPreset(p.valor)}
                data-activa={periodo.preset === p.valor}
                className="pildora-cayla focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rojo/60"
              >
                {p.valor === "personalizado" && <CalendarDays aria-hidden strokeWidth={1.5} className="h-3.5 w-3.5" />}
                {p.texto}
              </button>
            ))}
          </BloquePeriodo>
          <div className="w-full min-w-0 sm:w-52">
            <Filtro etiqueta="Categoría">
              <Desplegable
                valor={alcance.categoriaId ?? ""}
                onValor={(v) => actualizar({ cat: v || null })}
                opciones={[{ valor: "", texto: "Todas" }, ...categorias.map((c) => ({ valor: c.id, texto: `${c.nombre} (${c.variantes})` }))]}
                etiquetaAccesible="Categoría"
              />
            </Filtro>
          </div>
        </>
      }
      q={alcance.q}
      actualizar={actualizar}
      selectores={
        abierto && (
          <PopoverRango
            id="selector-periodo"
            titulo="Período personalizado"
            inicial={{ desde: periodo.desde, hasta: periodo.hasta }}
            control={refPersonalizado}
            onCancelar={() => setAbierto(false)}
            onAplicar={({ desde, hasta }) => {
              setAbierto(false);
              actualizar({ preset: "personalizado", desde, hasta });
            }}
          />
        )
      }
    />
  );
}

// COMPARAR PERÍODOS: dos píldoras —A y B, cada una con SU rango— en la fila de arriba, y la búsqueda debajo. Cada píldora
// lleva su selector de fechas, que se abre justo debajo de la que se tocó.
function ControlesComparar({ periodo, rangoA, alcance, avisos, claveGuardado, actualizar }: PropsComparar) {
  // Un solo selector de fechas abierto a la vez: el de A o el de B.
  const [abierto, setAbierto] = useState<"a" | "b" | null>(null);
  const alternar = (cual: "a" | "b") => setAbierto((x) => (x === cual ? null : cual));
  const refA = useRef<HTMLButtonElement>(null);
  const refB = useRef<HTMLButtonElement>(null);

  const rangoB: Rango = { desde: periodo.desde, hasta: periodo.hasta };
  // Si los dos períodos no caen en el mismo año se dice el año en ambos: «21 jul → 19 ago» contra «20 ago → 19 sep» de otro
  // año se leería como dos períodos del mismo año.
  const conAnio = rangoA.desde.slice(0, 4) !== rangoB.desde.slice(0, 4) || rangoA.hasta.slice(0, 4) !== rangoB.hasta.slice(0, 4);

  // Elegir A o B deja los DOS en la URL —los enlaces dicen lo que se ve, y la caché del router no confunde una elección con
  // otra— y los recuerda para la próxima vez que se entre a Comparar. Se recuerdan los dos aunque solo se haya tocado uno:
  // lo que la persona ve ahora es su elección, y no se corre solo mañana (el «últimos 30 días» de por defecto sí se corre).
  const aplicar = (a: Rango, b: Rango) => {
    setAbierto(null);
    guardarParElegido(claveGuardado, a, b);
    actualizar({ bdesde: b.desde, bhasta: b.hasta, comparar: "personalizado", cdesde: a.desde, chasta: a.hasta });
  };

  return (
    <MarcoPeriodoAnalizado
      arriba={
        <BloquePeriodo rol="group" etiqueta="Períodos que se comparan">
          <PildoraDePeriodo
            ref={refA}
            texto={textoPildoraPeriodo("A", rangoA, conAnio)}
            nombre={`Período A: ${etiquetaRangoLarga(rangoA, conAnio)}`}
            ayuda="Período A: contra el que se compara"
            abierta={abierto === "a"}
            controla="selector-comparacion"
            onClick={() => alternar("a")}
          />
          <PildoraDePeriodo
            ref={refB}
            texto={textoPildoraPeriodo("B", rangoB, conAnio)}
            nombre={`Período B: ${etiquetaRangoLarga(rangoB, conAnio)}`}
            ayuda="Período B: el que analizas"
            abierta={abierto === "b"}
            controla="selector-periodo"
            onClick={() => alternar("b")}
          />
        </BloquePeriodo>
      }
      avisos={avisos}
      q={alcance.q}
      actualizar={actualizar}
      selectores={
        <>
          {abierto === "a" && (
            <PopoverRango
              id="selector-comparacion"
              titulo="Período A · el que se compara"
              inicial={rangoA}
              control={refA}
              onCancelar={() => setAbierto(null)}
              onAplicar={(a) => aplicar(a, rangoB)}
            />
          )}
          {abierto === "b" && (
            <PopoverRango
              id="selector-periodo"
              titulo="Período B · el que analizas"
              inicial={rangoB}
              control={refB}
              onCancelar={() => setAbierto(null)}
              onAplicar={(b) => aplicar(rangoA, b)}
            />
          )}
        </>
      }
    />
  );
}
