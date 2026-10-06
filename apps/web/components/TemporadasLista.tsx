"use client";

import Link from "next/link";
import { Fragment, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { avisar } from "@/components/ui/Avisos";
import { Chip } from "@/components/ui/Chip";
import { Modal } from "@/components/ui/Modal";
import { BotonFiltro } from "@/components/ui/BotonFiltro";
import { BarraAtributos, GRILLA_ATRIBUTOS, TarjetaAtributo, TituloGrupo } from "@/components/atributos/kit";
import { MuestraTemporada } from "@/components/MuestraTemporada";
import { textoPrendas } from "@/lib/muestra-atributo-reglas";
import { Volver } from "@/components/ui/Volver";
import { Encabezado, Tabla, TABLA, celda, fila, type Columna } from "@/components/ui/Tabla";
import { Boton, CampoTexto, Desplegable, Segmentado } from "@/components/ui/campos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { ConfirmarConResponsable } from "@/components/ConfirmarConResponsable";
import type { Confirmacion } from "@/lib/confirmar-catalogo";
import { encabezadosOmitidos, type ClaveSinResponsable } from "@/lib/responsable-omitido";
import { useResponsable, type ControlResponsable } from "@/lib/useResponsable";
import {
  calendarioPorAnio,
  faltaAnioSiguiente,
  NOMBRE_ESTACION,
  NOMBRE_FUENTE,
  nombreTemporada,
  opcionesTemporada,
  partesLima,
  SIN_PROPIA,
  textoFinDeEstacion,
  textoInstanteLima,
  type Estacion,
  type EventoCalendario,
  type Temporada,
} from "@/lib/temporada-reglas";
import {
  fechasPorAgregar,
  filtrarSinTemporada,
  grupoDeTemporada,
  GRUPOS_TEMPORADA,
  gruposPorCategoria,
  MAX_ASIGNAR_POR_VEZ,
  ORDEN_GRUPOS_TEMPORADA,
  primerAnioVisible,
  resumenVistas,
  revisarFechas,
  textoAsignar,
  textoCambioCategoria,
  textoDiaLima,
  vecinas,
  vistaTemporadas,
  type DatosPestanaTemporadas,
  type FechaEnEdicion,
  type GrupoSinTemporada,
  type GrupoTemporada,
  type ResumenVistas,
  type RevisionFecha,
  type VistaTemporadas,
} from "@/lib/temporadas-pantalla";

/**
 * La pestaña «Temporadas» de Productos ▸ Atributos (ADR-0246). A diferencia de las otras cinco, la lista es CERRADA
 * (nueve valores que siembra la base): no se propone, no se aprueba ni se rechaza. Pero se VE como las otras cinco
 * (ADR-0261, Felipe 2026-09-28): abre con «Las nueve» en grilla —misma barra de píldoras, mismo título de grupo, misma
 * tarjeta con su dibujo— y el trabajo queda a un clic, en la franja sobre la grilla que dice cuánto falta en cada parte:
 *   · «Por completar»: las prendas sin temporada, agrupadas por categoría, con el atajo de ponérsela a la categoría
 *     (completa el grupo entero) y la asignación en lote para las excepciones (todo o nada);
 *   · «Por categoría»: la temporada por defecto de cada categoría, con la cifra de prendas que se reclasifican ANTES de
 *     guardar;
 *   · «Calendario»: las estaciones por año (SENAMHI); solo el LÍDER corrige una fecha, y solo si esa estación no empezó.
 * La vista vive en la URL (`?vista=`): «Completar» de Productos y el enlace de Categorías abren directo la suya.
 * Lo que la base resolvió (qué temporada tiene cada prenda) llega armado del servidor; tras cada guardado se vuelve a
 * pedir (`router.refresh`), así la pantalla nunca calcula por su cuenta una regla que vive en la base.
 */

/** La entrada escalonada del sistema (`anim-entra`: 420 ms, 38 ms entre piezas), con un tope para que una lista larga no
 *  tarde en asentarse. */
function entra(i: number): { className: string; style: CSSProperties } {
  return { className: "anim-entra", style: { "--i": Math.min(i, 12) } as CSSProperties };
}

type Carga = { datos: DatosPestanaTemporadas } | { nota: string } | null;

// `responsable`: el combo de la pantalla, o la clave de una acción soltada de él (`responsable-omitido.ts`).
async function enviar(cuerpo: Record<string, unknown>, responsable: ControlResponsable | ClaveSinResponsable): Promise<{ ok: true; datos: Record<string, unknown> } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/productos/temporadas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(typeof responsable === "string" ? encabezadosOmitidos(responsable) : responsable.encabezados()) },
      body: JSON.stringify(cuerpo),
    });
    const datos = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: datos.error ?? "No se pudo guardar." };
    return { ok: true, datos };
  } catch {
    return { ok: false, error: "No se pudo hablar con el servidor. Reintenta en un momento." };
  }
}

/**
 * `veProductos`: la cuenta ve el módulo «Productos» (ADR-0161). A esta pestaña se entra con «Categorías, marcas y
 * atributos»; la ficha de una prenda (`/productos/<id>/editar`) pide «Productos» y además poder editar el catálogo. Sin
 * los dos, el nombre de la prenda no enlaza a una puerta que después dice «Sin acceso».
 */
export function TemporadasLista({
  carga,
  puedeEditar,
  esLider,
  veProductos,
}: {
  carga: Carga;
  puedeEditar: boolean;
  esLider: boolean;
  veProductos: boolean;
}) {
  if (!carga || !("datos" in carga)) {
    return <p className="nota-cayla">{carga && "nota" in carga ? carga.nota : "Las temporadas todavía no están activas en esta base."}</p>;
  }
  return <Pestana datos={carga.datos} puedeEditar={puedeEditar} esLider={esLider} abreFicha={puedeEditar && veProductos} />;
}

/** Lo que dura la salida de una vista antes de que entre la otra (`anim-revelar-salida`). */
const SALIDA_MS = 160;

function Pestana({ datos, puedeEditar, esLider, abreFicha }: { datos: DatosPestanaTemporadas; puedeEditar: boolean; esLider: boolean; abreFicha: boolean }) {
  // Catálogo firma cada guardado con el combo «Responsable» (ADR-0161), siempre DENTRO de la ventana que guarda.
  const responsable = useResponsable();
  const [confirmando, setConfirmando] = useState<Confirmacion | null>(null);
  const params = useSearchParams();
  const vista = vistaTemporadas(params.get("vista"));
  // La vista que se DIBUJA va un paso detrás de la URL: mientras la anterior sale (160 ms) sigue a la vista; después
  // entra la nueva. Si la URL cambia por otro lado (atrás/adelante), se alcanza aquí mismo, sin salida.
  const [dibujada, setDibujada] = useState<VistaTemporadas>(vista);
  const [saliendo, setSaliendo] = useState(false);
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);
  if (!saliendo && dibujada !== vista) setDibujada(vista);
  const resumen = useMemo(() => resumenVistas(datos), [datos]);

  function elegir(v: VistaTemporadas) {
    if (v === vista) return;
    const q = new URLSearchParams(params.toString());
    q.set("vista", v);
    // Sin ida al servidor: Next sincroniza `useSearchParams` con el historial, y las cuatro vistas ya están cargadas
    // (pedir la página otra vez abriría el loader por un cambio que no trae datos nuevos).
    window.history.pushState(null, "", `?${q.toString()}`);
    if (reloj.current) clearTimeout(reloj.current);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setSaliendo(true);
    reloj.current = setTimeout(() => setSaliendo(false), SALIDA_MS);
  }

  const desfase = 0;
  return (
    <div className="space-y-6">
      <Vuelta enLista={vista === "lista"} onLista={() => elegir("lista")} />

      <div key={dibujada} className={`space-y-6 ${saliendo ? "anim-revelar-salida" : ""}`}>
        {dibujada === "lista" && <VistaNueve temporadas={datos.temporadas} porTemporada={datos.porTemporada} resumen={resumen} onElegir={elegir} />}
        {dibujada === "completar" && (
          <VistaPorCompletar datos={datos} puedeEditar={puedeEditar} abreFicha={abreFicha} responsable={responsable} onConfirmar={setConfirmando} desfase={desfase} />
        )}
        {dibujada === "categorias" && <VistaCategorias datos={datos} puedeEditar={puedeEditar} responsable={responsable} onConfirmar={setConfirmando} desfase={desfase} />}
        {dibujada === "calendario" && <VistaCalendario calendario={datos.calendario} anioHoy={datos.anioHoy} esLider={esLider} responsable={responsable} desfase={desfase} />}
      </div>

      {confirmando && <ConfirmarConResponsable confirmacion={confirmando} control={responsable} onClose={() => setConfirmando(null)} />}
    </div>
  );
}

/**
 * Dos pantallas saltan directo a una vista de esta pestaña: «Completar» del aviso de Productos (a «Por completar») y el
 * enlace de Categorías (a «Por categoría»). Su vuelta va arriba, y solo con su `desde=`: Atributos está en el menú, y quien
 * entra por el lateral no vino de ninguna de las dos. Dentro de una vista de trabajo, además, «← Las nueve temporadas»
 * regresa a la grilla (sin ir al servidor: las cuatro vistas ya están cargadas).
 */
const VUELTAS = {
  productos: { href: "/productos", a: "Productos" },
  categorias: { href: "/productos/categorias", a: "Categorías" },
} as const;

function Vuelta({ enLista, onLista }: { enLista: boolean; onLista: () => void }) {
  const desde = useSearchParams().get("desde");
  const afuera = desde === "productos" || desde === "categorias" ? VUELTAS[desde] : null;
  if (!afuera && enLista) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
      {afuera && <Volver {...afuera} />}
      {!enLista && (
        // Vuelve a la lista sin cambiar la dirección: la vuelta de siempre en su forma de botón (ADR-0354).
        <Volver onClick={onLista} a="Las nueve temporadas" />
      )}
    </div>
  );
}

// ---- La franja de trabajo -----------------------------------------------------------------------------------------------

/**
 * Sobre la grilla: el trabajo de Temporadas y lo que falta en cada parte, a un clic. Reemplaza a las cuatro tarjetas de
 * cifra con que abría la pestaña (#566): ahora abre con la grilla, como las otras cinco (ADR-0261), y lo pendiente no
 * pierde su cifra ni queda escondido. El punto rojo solo aparece mientras haya prendas sin temporada.
 */
function FranjaTrabajo({ resumen: r, onElegir }: { resumen: ResumenVistas; onElegir: (v: VistaTemporadas) => void }) {
  const falta = r.sinTemporada;
  const cifra = (n: number | string) => <b className="font-semibold tabular-nums text-tinta">{n}</b>;
  return (
    <div role="group" aria-label="Trabajo de temporadas" className="flex flex-wrap items-center gap-x-8 gap-y-2.5 rounded-lg bg-hueso/60 px-4 py-3 text-sm text-tinta/80">
      <Atajo accion="Completar" punto={falta > 0 ? "bg-rojo-profundo" : "bg-verde"} onClick={() => onElegir("completar")}>
        {falta > 0 ? (
          <>
            {cifra(falta)} {falta === 1 ? "prenda" : "prendas"} sin temporada
          </>
        ) : (
          "Todas las prendas tienen temporada"
        )}
      </Atajo>
      <Atajo accion="Por categoría" punto={r.categoriasSinTemporada > 0 ? "bg-ambar" : "bg-verde"} onClick={() => onElegir("categorias")}>
        {r.categoriasSinTemporada > 0 ? (
          <>
            {cifra(r.categoriasSinTemporada)} de {r.categorias} {r.categorias === 1 ? "categoría" : "categorías"} sin temporada
          </>
        ) : (
          "Todas las categorías tienen temporada"
        )}
      </Atajo>
      <Atajo accion="Calendario" punto={r.enCurso ? "bg-verde" : "bg-tinta/25"} onClick={() => onElegir("calendario")}>
        {r.enCurso ? (
          <>
            {cifra(NOMBRE_ESTACION[r.enCurso.estacion])} en curso
            {r.enCurso.hasta ? `, termina el ${textoDiaLima(r.enCurso.hasta)}` : ""}
          </>
        ) : (
          "Cuándo empieza cada estación"
        )}
      </Atajo>
    </div>
  );
}

function Atajo({ accion, punto, onClick, children }: { accion: string; punto: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="group/atajo inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 text-left">
      <span aria-hidden className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${punto}`} />
      <span>{children}</span>
      <span className="label-cayla whitespace-nowrap text-[10.5px] text-tinta/75 underline underline-offset-4 transition-colors group-hover/atajo:text-rojo-profundo">
        {accion} ›
      </span>
    </button>
  );
}

function TituloVista({ titulo, bajada, children, desfase }: { titulo: string; bajada: ReactNode; children?: ReactNode; desfase: number }) {
  const { className, style } = entra(desfase);
  return (
    <div className={`flex flex-wrap items-end justify-between gap-3 ${className}`} style={style}>
      <div className="space-y-1">
        <h2 className="font-display text-xl text-tinta">{titulo}</h2>
        <p className="max-w-3xl text-sm text-taupe">{bajada}</p>
      </div>
      {children}
    </div>
  );
}

// ---- Las nueve, en grilla ------------------------------------------------------------------------------------------------

/**
 * Las nueve como tarjetas, igual que cualquier vocabulario de Atributos: su dibujo, cuántas prendas la tienen hoy (propia,
 * de un color o de su categoría) y cuándo termina. Sin buscador ni «+ Agregar»: son nueve fijas y caben en una pantalla.
 */
function VistaNueve({
  temporadas,
  porTemporada,
  resumen,
  onElegir,
}: {
  temporadas: Temporada[];
  porTemporada: Record<string, number>;
  resumen: ResumenVistas;
  onElegir: (v: VistaTemporadas) => void;
}) {
  const [grupo, setGrupo] = useState<GrupoTemporada | "todas">("todas");
  // La grilla solo se re-asienta cuando la persona cambia un filtro, nunca al cargar la pantalla (ver globals.css).
  const [animar, setAnimar] = useState(false);
  const ordenadas = [...temporadas].sort((a, b) => a.orden - b.orden);
  const delGrupo = (g: GrupoTemporada) => ordenadas.filter((t) => grupoDeTemporada(t) === g);
  const gruposConAlgo = ORDEN_GRUPOS_TEMPORADA.filter((g) => delGrupo(g).length > 0);
  const elegirGrupo = (g: GrupoTemporada | "todas") => {
    setGrupo(g);
    setAnimar(true);
  };
  return (
    <>
      <BarraAtributos
        etiqueta="Filtrar temporadas"
        filtros={
          <>
            <BotonFiltro activo={grupo === "todas"} onClick={() => elegirGrupo("todas")} cuenta={ordenadas.length}>
              Todas
            </BotonFiltro>
            {gruposConAlgo.map((g) => (
              <BotonFiltro key={g} activo={grupo === g} onClick={() => elegirGrupo(grupo === g ? "todas" : g)} cuenta={delGrupo(g).length}>
                {GRUPOS_TEMPORADA[g].grupo}
              </BotonFiltro>
            ))}
          </>
        }
      />

      <FranjaTrabajo resumen={resumen} onElegir={onElegir} />

      <div key={grupo} className={`space-y-6 ${animar ? "anim-asentar" : ""}`}>
        {gruposConAlgo
          .filter((g) => grupo === "todas" || g === grupo)
          .map((g) => (
            <section key={g} className="space-y-3">
              <TituloGrupo punto={GRUPOS_TEMPORADA[g].punto} cuenta={delGrupo(g).length}>
                {GRUPOS_TEMPORADA[g].grupo}
              </TituloGrupo>
              <div className={GRILLA_ATRIBUTOS}>
                {delGrupo(g).map((t) => (
                  <TarjetaAtributo
                    key={t.clave}
                    muestra={<MuestraTemporada temporada={t} />}
                    nombre={t.nombre}
                    detalle={
                      <>
                        <p className="text-[11px] tabular-nums text-tinta/60">{textoPrendas(porTemporada[t.clave] ?? 0)}</p>
                        <p className="text-[11px] text-tinta/60">{textoFinDeEstacion(t)}</p>
                      </>
                    }
                  />
                ))}
              </div>
            </section>
          ))}
      </div>
    </>
  );
}

// ---- 3. Calendario ----------------------------------------------------------------------------------------------------

// La primera columna aguanta «Primavera» con el chip «En curso» al lado sin cortarlo.
const PLANTILLA_CAL = "sm:grid-cols-[11rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,13rem)_6.5rem]";
const COLUMNAS_CAL: Columna[] = [
  { titulo: "Estación" },
  { titulo: "Empieza", subtitulo: "hora de Perú" },
  { titulo: "Termina", subtitulo: "empieza la siguiente" },
  { titulo: "Fuente" },
  { titulo: "", alinear: "der" },
];

function VistaCalendario({
  calendario,
  anioHoy,
  esLider,
  responsable,
  desfase,
}: {
  calendario: EventoCalendario[];
  anioHoy: number;
  esLider: boolean;
  responsable: ControlResponsable;
  desfase: number;
}) {
  const [verAnteriores, setVerAnteriores] = useState(false);
  const [editando, setEditando] = useState<EventoCalendario | null>(null);
  const [agregando, setAgregando] = useState(false);
  const desde = primerAnioVisible(calendario, anioHoy);
  const grupos = calendarioPorAnio(calendario);
  const visibles = verAnteriores ? grupos : grupos.filter((g) => g.anio >= desde);
  const ocultos = grupos.length - visibles.length;
  const faltaSiguiente = faltaAnioSiguiente(calendario, anioHoy);
  // La siembra llega a 2028 y el aviso sale todo el año anterior: que falte el año en curso no debería pasar nunca.
  const faltaEste = faltaAnioSiguiente(calendario, anioHoy - 1);
  let pieza = desfase + 2;

  return (
    <section className="space-y-3" aria-label="Calendario de estaciones">
      <TituloVista
        desfase={desfase}
        titulo="Calendario"
        bajada="Las fechas de SENAMHI (el instante del equinoccio o del solsticio). Una estación termina cuando empieza la siguiente. Solo el líder corrige una fecha, y solo si esa estación todavía no empezó."
      />

      {faltaEste && (
        <p className="nota-cayla">
          Falta el calendario de <b>{anioHoy}</b>. Las estaciones que ya empezaron no se cargan desde aquí: avísale a Felipe.
        </p>
      )}
      {faltaSiguiente && (
        <div className="nota-cayla flex flex-wrap items-center justify-between gap-3">
          <span>
            Falta el calendario de <b>{anioHoy + 1}</b>. Sin él, las prendas de ese año no sabrán cuándo termina su estación.
            {!esLider && " Pídele al líder que lo agregue."}
          </span>
          {esLider && (
            <button type="button" className="btn-cayla btn-secundario btn-chico" onClick={() => setAgregando(true)}>
              Agregar {anioHoy + 1}
            </button>
          )}
        </div>
      )}

      <Tabla {...entra(desfase + 1)}>
        <Encabezado columnas={COLUMNAS_CAL} plantilla={PLANTILLA_CAL} />
        {visibles.map((g) => (
          <Fragment key={g.anio}>
            {/* El año de la fila es el de su llave en el calendario: el verano de diciembre sigue hasta marzo del siguiente. */}
            <p className="anim-entra px-5 pb-1.5 pt-4 text-xs font-semibold text-tinta" style={entra(pieza++).style}>
              {g.anio}
            </p>
            {g.eventos.map((e) => (
              <div
                key={`${e.anio}-${e.estacion}`}
                className={fila(PLANTILLA_CAL, `anim-entra ${e.en_curso || e.editable ? "" : "text-tinta/65"}`)}
                style={entra(pieza++).style}
                role="row"
              >
                <span className={celda("izq", "flex items-center gap-2 text-tinta")}>
                  {NOMBRE_ESTACION[e.estacion]}
                  {e.en_curso && <Chip tono="verde">En curso</Chip>}
                </span>
                <span className={celda("izq", "tabular-nums")}>
                  <span className="text-taupe sm:hidden">Empieza: </span>
                  {textoInstanteLima(e.inicio)}
                </span>
                <span className={celda("izq", "tabular-nums text-tinta/75")}>
                  <span className="text-taupe sm:hidden">Termina: </span>
                  {e.hasta ? textoInstanteLima(e.hasta) : "Falta el año siguiente"}
                </span>
                <span className={celda()}>
                  {e.fuente === "senamhi" ? <span className="text-tinta/75">{NOMBRE_FUENTE.senamhi}</span> : <Chip tono="pizarra">{NOMBRE_FUENTE[e.fuente]}</Chip>}
                </span>
                <span className={celda("der")}>
                  {esLider && e.editable && (
                    <button type="button" className="btn-cayla btn-sutil btn-chico" onClick={() => setEditando(e)} aria-label={`Cambiar el inicio de ${NOMBRE_ESTACION[e.estacion]} ${e.anio}`}>
                      Cambiar
                    </button>
                  )}
                </span>
              </div>
            ))}
          </Fragment>
        ))}
        {ocultos > 0 && (
          <p className={TABLA.pie}>
            <button type="button" className="btn-cayla btn-enlace text-xs" onClick={() => setVerAnteriores(true)}>
              Ver {ocultos === 1 ? "el año anterior" : `los ${ocultos} años anteriores`}
            </button>
          </p>
        )}
      </Tabla>

      {editando && <ModalFecha evento={editando} calendario={calendario} responsable={responsable} onClose={() => setEditando(null)} />}
      {agregando && (
        <ModalAnio anio={anioHoy + 1} calendario={calendario} onClose={() => setAgregando(false)} />
      )}
    </section>
  );
}

/**
 * Fecha y hora de una estación, en hora de Perú. Debajo, el `error` (fecha u hora que no existen: bloquea) o el `aviso`
 * (lo que la base probablemente rechace: no bloquea, quien decide es ella).
 */
function CamposFecha({
  f,
  revision,
  deshabilitado,
  onCambio,
  etiqueta,
}: {
  f: FechaEnEdicion;
  revision: RevisionFecha;
  deshabilitado: boolean;
  onCambio: (f: FechaEnEdicion) => void;
  etiqueta: string;
}) {
  const pie = revision.error ?? revision.aviso;
  return (
    <fieldset className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3" disabled={deshabilitado}>
      <legend className="sr-only">{etiqueta}</legend>
      <CampoTexto
        etiqueta={`${etiqueta} · fecha`}
        type="date"
        value={f.fecha}
        onChange={(ev) => onCambio({ ...f, fecha: ev.target.value })}
        pie={pie}
        tono={revision.error ? "error" : revision.aviso ? "aviso" : "neutro"}
      />
      <CampoTexto etiqueta="Hora de Perú" type="time" value={f.hora} onChange={(ev) => onCambio({ ...f, hora: ev.target.value })} />
    </fieldset>
  );
}

type Fuente = EventoCalendario["fuente"];

// La columna `fuente` dice de dónde sale cada instante (ADR-0246): SENAMHI es la oficial; el Observatorio Naval de EE. UU.
// tiene un minuto de precisión mientras SENAMHI no publica; «ajustada» es una fecha aproximada o corrida a propósito.
const OPCIONES_FUENTE: { valor: Fuente; texto: string }[] = [
  { valor: "ajustada", texto: "La ajusto yo" },
  { valor: "usno", texto: "Observatorio EE. UU." },
  { valor: "senamhi", texto: "SENAMHI" },
];
const PIE_FUENTE: Record<Fuente, string> = {
  ajustada: "Queda «Ajustada por el líder»: una fecha aproximada, o corrida a propósito.",
  usno: "Queda «Por confirmar con SENAMHI»: copiada del Observatorio Naval de EE. UU.",
  senamhi: "Queda como oficial: copiada de lo que publicó SENAMHI.",
};

function ModalFecha({
  evento,
  calendario,
  responsable,
  onClose,
}: {
  evento: EventoCalendario;
  calendario: EventoCalendario[];
  responsable: ControlResponsable;
  onClose: () => void;
}) {
  const router = useRouter();
  const [f, setF] = useState<FechaEnEdicion>(() => ({ anio: evento.anio, estacion: evento.estacion, ...partesLima(evento.inicio) }));
  const [fuente, setFuente] = useState<Fuente>(evento.fuente);
  // Si el líder mueve la fecha sin decir de dónde sale, deja de ser la de SENAMHI (o la del Observatorio): la corrió él.
  // Si elige la fuente a mano, se respeta lo que eligió aunque después toque la fecha.
  const [fuenteElegida, setFuenteElegida] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const limites = useMemo(() => vecinas(calendario, evento.anio, evento.estacion), [calendario, evento.anio, evento.estacion]);
  const [revision] = revisarFechas([f], new Date(), limites);
  const nombre = `${NOMBRE_ESTACION[evento.estacion]} ${evento.anio}`;

  // Guía de foco (CLAUDE.md «Guía de foco»): sale de lo que ya apaga «Guardar fecha» (la fecha revisada y quién firma). La fuente
  // siempre tiene una elegida: solo cuenta como «hecha» cuando la persona la eligió a mano.
  const guia = useGuiaCampos([
    { id: "fecha", nombre: "Fecha y hora", requerido: true, hecho: !!revision.instante, pendiente: revision.error ?? "Escribe la fecha y la hora." },
    { id: "fuente", nombre: "De dónde sale la fecha", requerido: false, hecho: fuenteElegida, pendiente: "" },
    { id: "responsable", nombre: "Quién registra", requerido: true, hecho: responsable.listo, pendiente: "Elige quién registra." },
  ]);

  function cambiarFecha(nueva: FechaEnEdicion) {
    setF(nueva);
    if (!fuenteElegida) setFuente("ajustada");
  }

  async function guardar(cerrar: () => void) {
    if (!revision.instante) return;
    setGuardando(true);
    const r = await enviar({ accion: "fecha", fechas: [{ anio: evento.anio, estacion: evento.estacion, inicio: revision.instante, fuente }] }, responsable);
    setGuardando(false);
    if (!r.ok) {
      avisar.error(r.error);
      return;
    }
    responsable.despues(null);
    avisar.exito(`${nombre}: empieza el ${textoInstanteLima(revision.instante)}`, { detalle: "Los avisos de fin de estación de las tres sedes ya usan la fecha nueva." });
    router.refresh();
    cerrar();
  }

  return (
    <Modal
      titulo={`Cambiar el inicio de ${nombre}`}
      subtitulo={`Fecha guardada: ${textoInstanteLima(evento.inicio)} (${NOMBRE_FUENTE[evento.fuente]}).`}
      ancho="max-w-md"
      onClose={onClose}
      bloqueado={guardando}
    >
      {(cerrar) => (
        <div className="mt-5 space-y-4">
          <CampoGuiado id="fecha" guia={guia} titulo="Fecha y hora de inicio">
            <CamposFecha f={f} revision={revision} deshabilitado={guardando} onCambio={cambiarFecha} etiqueta={NOMBRE_ESTACION[evento.estacion]} />
          </CampoGuiado>
          <CampoGuiado id="fuente" guia={guia}>
            <Segmentado
              etiqueta={guia.etiqueta("fuente", "¿De dónde sale esta fecha?")}
              valor={fuente}
              onValor={(v) => {
                setFuente(v);
                setFuenteElegida(true);
              }}
              opciones={OPCIONES_FUENTE}
              pie={PIE_FUENTE[fuente]}
            />
          </CampoGuiado>
          <p className="text-xs text-taupe">
            Tiene que quedar entre {limites.antes ? `el inicio de ${NOMBRE_ESTACION[limites.antes.estacion].toLowerCase()} (${textoInstanteLima(limites.antes.inicio)})` : "hoy"}
            {limites.despues ? ` y el de ${NOMBRE_ESTACION[limites.despues.estacion].toLowerCase()} (${textoInstanteLima(limites.despues.inicio)})` : ""}.
          </p>
          <CampoGuiado id="responsable" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={guardando} />
          </CampoGuiado>
          <PieGuia guia={guia} listo="Todo listo para guardar." />
          <div className="flex gap-2">
            <Boton peso="fantasma" className="flex-1" onClick={cerrar} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton
              peso="primario"
              className={`flex-1 ${guia.claseConfirmar}`}
              cargando={guardando}
              disabled={!responsable.listo || !revision.instante}
              title={responsable.motivo ?? revision.error ?? guia.frase ?? undefined}
              onClick={() => guardar(cerrar)}
            >
              Guardar fecha
            </Boton>
          </div>
        </div>
      )}
    </Modal>
  );
}

function ModalAnio({
  anio,
  calendario,
  onClose,
}: {
  anio: number;
  calendario: EventoCalendario[];
  onClose: () => void;
}) {
  const router = useRouter();
  // Lo que el líder escribió, por estación. Las filas se arman con cada lectura del calendario (`fechasPorAgregar`): si
  // otra persona agregó alguna estación mientras tanto, sale de la ventana y las que faltan conservan lo escrito. El
  // guardado es todo o nada (`fijar_fechas_temporada`): si falla, no se guardó ninguna y se corrige y reintenta.
  const [escritas, setEscritas] = useState<Partial<Record<Estacion, FechaEnEdicion>>>({});
  // Las prellenadas son aproximadas (a mediodía): por defecto se guardan como «ajustadas», no como del Observatorio.
  const [fuente, setFuente] = useState<Fuente>("ajustada");
  const [guardando, setGuardando] = useState(false);
  const filas = fechasPorAgregar(calendario, anio, escritas);
  // El año nuevo va al final del calendario: cada estación después de la última que ya existe y de la que la precede.
  const ultima = useMemo(() => [...calendario].sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio)).at(-1) ?? null, [calendario]);
  const revision = revisarFechas(filas, new Date(), { antes: ultima, despues: null });
  const hayError = revision.some((r) => !r.instante);

  // Guía de foco: las fechas llegan prellenadas (aproximadas), así que lo único que puede bloquear es una fecha mal escrita o fuera
  // de orden (`hayError`). Las filas son UN campo de grupo; la fuente es opcional (por defecto «La ajusto yo»).
  const guia = useGuiaCampos([
    {
      id: "fechas",
      nombre: "Fechas de las estaciones",
      requerido: true,
      hecho: filas.length > 0 && !hayError,
      pendiente: revision.find((r) => !r.instante)?.error ?? "Revisa las fechas.",
    },
    { id: "fuente", nombre: "De dónde salen las fechas", requerido: false, hecho: fuente !== "ajustada", pendiente: "" },
  ]);

  async function guardar(cerrar: () => void) {
    if (hayError) return;
    setGuardando(true);
    const r = await enviar(
      { accion: "fecha", fechas: filas.map((f, i) => ({ anio: f.anio, estacion: f.estacion, inicio: revision[i].instante, fuente })) },
      "temporada_fechas_anio", // sin responsable (Felipe, 2026-09-29)
    );
    setGuardando(false);
    if (!r.ok) {
      // Todo o nada: no se guardó ninguna. Lo escrito queda en la ventana para corregir y volver a intentar.
      avisar.error(r.error);
      return;
    }
    avisar.exito(`Calendario de ${anio} agregado`, {
      detalle:
        fuente === "senamhi"
          ? "Quedan como las oficiales de SENAMHI."
          : `Quedan «${NOMBRE_FUENTE[fuente]}»: corrígelas con las de SENAMHI cuando las publique.`,
    });
    router.refresh();
    cerrar();
  }

  return (
    <Modal
      titulo={`Agregar el calendario de ${anio}`}
      subtitulo="Vienen con una fecha aproximada, a mediodía. Si tienes las horas de SENAMHI (o del Observatorio Naval de EE. UU. mientras SENAMHI no publique), cópialas y marca de dónde salen."
      ancho="max-w-md"
      onClose={onClose}
      bloqueado={guardando}
    >
      {(cerrar) => (
        <div className="mt-5 space-y-4">
          {filas.length === 0 ? (
            <p className="nota-cayla">Ese año ya está completo.</p>
          ) : (
            <>
              <CampoGuiado id="fechas" guia={guia} titulo="Fechas de inicio de cada estación" className="space-y-4">
                {filas.map((f, i) => (
                  <CamposFecha
                    key={f.estacion}
                    f={f}
                    revision={revision[i]}
                    deshabilitado={guardando}
                    etiqueta={NOMBRE_ESTACION[f.estacion]}
                    onCambio={(nueva) => setEscritas((actual) => ({ ...actual, [nueva.estacion]: nueva }))}
                  />
                ))}
              </CampoGuiado>
              <CampoGuiado id="fuente" guia={guia}>
                <Segmentado etiqueta={guia.etiqueta("fuente", "¿De dónde salen estas fechas?")} valor={fuente} onValor={setFuente} opciones={OPCIONES_FUENTE} pie={PIE_FUENTE[fuente]} />
              </CampoGuiado>
              <PieGuia guia={guia} listo="Todo listo para agregar." />
            </>
          )}
          <div className="flex gap-2">
            <Boton peso="fantasma" className="flex-1" onClick={cerrar} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton
              peso="primario"
              className={`flex-1 ${guia.claseConfirmar}`}
              cargando={guardando}
              disabled={hayError || filas.length === 0}
              title={guia.frase ?? undefined}
              onClick={() => guardar(cerrar)}
            >
              Agregar {anio}
            </Boton>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ---- 2. Por categoría -------------------------------------------------------------------------------------------------

const PLANTILLA_CAT = "sm:grid-cols-[minmax(0,1fr)_minmax(0,16rem)_7rem]";
const COLUMNAS_CAT: Columna[] = [
  { titulo: "Categoría" },
  { titulo: "Temporada por defecto" },
  { titulo: "La heredan", alinear: "der", ayuda: "Prendas activas sin temporada propia: toman la de su categoría." },
];

type FiltroCategorias = "con-prendas" | "todas";

function VistaCategorias({
  datos,
  puedeEditar,
  responsable,
  onConfirmar,
  desfase,
}: {
  datos: DatosPestanaTemporadas;
  puedeEditar: boolean;
  responsable: ControlResponsable;
  onConfirmar: (c: Confirmacion) => void;
  desfase: number;
}) {
  const router = useRouter();
  const [recien, setRecien] = useState<Record<string, { de: string; a: string }>>({});
  const conPrendas = datos.categorias.filter((c) => c.prendas > 0).length;
  // Abre en «Con prendas»: las categorías vacías (hoy son la mayoría) no cambian nada al elegirles temporada. Si ninguna
  // tiene prendas, el filtro no dejaría nada que ver.
  const [filtro, setFiltro] = useState<FiltroCategorias>(conPrendas > 0 ? "con-prendas" : "todas");
  const visibles = filtro === "todas" ? datos.categorias : datos.categorias.filter((c) => c.prendas > 0);
  const valorDe = (c: DatosPestanaTemporadas["categorias"][number]) => {
    const delServidor = c.temporada ?? SIN_PROPIA;
    const r = recien[c.id];
    return r && r.de === delServidor ? r.a : delServidor;
  };
  const opciones = useMemo(() => opcionesTemporada(datos.temporadas), [datos.temporadas]);

  function pedirCambio(c: DatosPestanaTemporadas["categorias"][number], nueva: string) {
    const actual = valorDe(c);
    if (nueva === actual) return;
    const { titulo, bajada } = textoCambioCategoria(c.nombre, nombreTemporada(datos.temporadas, actual), nombreTemporada(datos.temporadas, nueva), c.heredan);
    onConfirmar({
      titulo,
      bajada,
      verbo: "Cambiar",
      accion: async () => {
        const r = await enviar({ accion: "categoria", categoriaId: c.id, temporada: nueva }, responsable);
        if (!r.ok) {
          avisar.error(r.error);
          return;
        }
        responsable.despues(null);
        setRecien((x) => ({ ...x, [c.id]: { de: c.temporada ?? SIN_PROPIA, a: nueva } }));
        avisar.exito(`${c.nombre}: ${nombreTemporada(datos.temporadas, nueva) ?? "sin temporada"} por defecto`);
        router.refresh();
      },
    });
  }

  return (
    <section className="space-y-3" aria-label="La temporada de cada categoría">
      <TituloVista
        desfase={desfase}
        titulo="Por categoría"
        bajada="La que toma una prenda que no tiene la suya («Ropa de baño» → «Verano»). La de la prenda, o la de su color, manda sobre esta. Una subcategoría no hereda la de su categoría padre."
      >
        {datos.categorias.length > 0 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Qué categorías ver">
            <button type="button" className="pildora-cayla" aria-pressed={filtro === "con-prendas"} onClick={() => setFiltro("con-prendas")}>
              Con prendas · {conPrendas}
            </button>
            <button type="button" className="pildora-cayla" aria-pressed={filtro === "todas"} onClick={() => setFiltro("todas")}>
              Todas · {datos.categorias.length}
            </button>
          </div>
        )}
      </TituloVista>
      {datos.categorias.length === 0 ? (
        <p className="nota-cayla">No hay categorías activas.</p>
      ) : (
        <Tabla {...entra(desfase + 1)}>
          <Encabezado columnas={COLUMNAS_CAT} plantilla={PLANTILLA_CAT} />
          {visibles.length === 0 && <p className={TABLA.vacio}>Ninguna categoría activa tiene prendas todavía.</p>}
          {visibles.map((c, i) => {
            const valor = valorDe(c);
            // Cambiar el filtro no re-anima las filas que ya estaban: React conserva su DOM y la animación no se repite.
            return (
              <div key={c.id} className={fila(PLANTILLA_CAT, "anim-entra sm:items-center")} style={entra(desfase + 2 + i).style} role="row">
                <span className={celda("izq", "text-tinta")}>{c.nombre}</span>
                <span className="min-w-0">
                  {puedeEditar ? (
                    <Desplegable
                      valor={valor}
                      onValor={(v) => pedirCambio(c, v)}
                      opciones={opciones}
                      forma="caja"
                      etiquetaAccesible={`Temporada por defecto de ${c.nombre}`}
                    />
                  ) : (
                    <span className={valor ? "text-tinta" : "text-taupe"}>{nombreTemporada(datos.temporadas, valor) ?? "Sin temporada"}</span>
                  )}
                </span>
                <span className={celda("der", "text-tinta/75")}>
                  <span className="sm:hidden">La heredan: </span>
                  {c.heredan}
                </span>
              </div>
            );
          })}
          <p className={TABLA.pie}>
            {visibles.length} de {datos.categorias.length} {datos.categorias.length === 1 ? "categoría" : "categorías"}
            {filtro === "con-prendas" && datos.categorias.length > conPrendas
              ? ` · las otras ${datos.categorias.length - conPrendas} no tienen prendas activas`
              : ""}
          </p>
        </Tabla>
      )}
    </section>
  );
}

// ---- 1. Por completar -------------------------------------------------------------------------------------------------

// En celular la casilla va al lado del nombre (no sola en su renglón) y los colores, debajo del nombre. La marca y el
// proveedor tienen cada uno su columna cuando la TARJETA mide 768 px o más (`@3xl`, no la ventana: con el menú lateral
// abierto una ventana de 1.000 px deja ~800 a la tarjeta); con menos, bajan a una línea rotulada bajo el código.
const PLANTILLA_SIN =
  "grid-cols-[2rem_minmax(0,1fr)] sm:grid-cols-[2rem_minmax(0,1fr)_minmax(0,14rem)] @3xl:grid-cols-[2rem_minmax(0,1fr)_minmax(0,8rem)_minmax(0,8rem)_minmax(0,11rem)]";
const PLANTILLA_SIN_LECTURA =
  "sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)] @3xl:grid-cols-[minmax(0,1fr)_minmax(0,8rem)_minmax(0,8rem)_minmax(0,11rem)]";

// Los títulos de la lista: sin ellos, un nombre suelto a la derecha («Vino», «Zara») no dice si es color, marca o proveedor.
const COLUMNAS_MARCA = "hidden @3xl:block";
const COLUMNAS_SIN: Columna[] = [
  { titulo: "Prenda" },
  { titulo: "Marca", clase: COLUMNAS_MARCA },
  { titulo: "Proveedor", clase: COLUMNAS_MARCA, ayuda: "A quién se le compra habitualmente este modelo." },
  { titulo: "Colores", ayuda: "Los colores de la prenda que todavía no tienen temporada propia." },
];
const COLUMNAS_SIN_EDITA: Columna[] = [{ titulo: <span className="sr-only">Marcar</span> }, ...COLUMNAS_SIN];

function VistaPorCompletar({
  datos,
  puedeEditar,
  abreFicha,
  responsable,
  onConfirmar,
  desfase,
}: {
  datos: DatosPestanaTemporadas;
  puedeEditar: boolean;
  /** Puede abrir la ficha de la prenda (módulo Productos y permiso de catálogo): entonces el nombre enlaza a ella. */
  abreFicha: boolean;
  responsable: ControlResponsable;
  onConfirmar: (c: Confirmacion) => void;
  desfase: number;
}) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [temporada, setTemporada] = useState("");
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  // La temporada elegida en el atajo de cada grupo, y los grupos ya completados que se pliegan mientras la base responde.
  const [eleccion, setEleccion] = useState<Record<string, string>>({});
  const [plegando, setPlegando] = useState<Set<string>>(new Set());
  const [asignando, setAsignando] = useState<Set<string>>(new Set());
  const lista = datos.sinTemporada;
  const visibles = useMemo(() => filtrarSinTemporada(lista, texto), [lista, texto]);
  const grupos = useMemo(() => gruposPorCategoria(visibles, datos.categorias), [visibles, datos.categorias]);
  const idsVisibles = useMemo(() => new Set(visibles.map((p) => p.productoId)), [visibles]);
  const presentes = useMemo(() => new Set(lista.map((p) => p.productoId)), [lista]);
  const marcadasVigentes = [...marcadas].filter((id) => presentes.has(id));
  const elegidas = marcadasVigentes.filter((id) => idsVisibles.has(id));
  const marcadasOcultas = marcadasVigentes.length - elegidas.length;
  const opciones = useMemo(() => opcionesTemporada(datos.temporadas).filter((o) => o.valor !== SIN_PROPIA), [datos.temporadas]);
  const todasVisiblesMarcadas = visibles.length > 0 && visibles.every((p) => marcadas.has(p.productoId));
  const motivo = !temporada
    ? "Elige primero la temporada."
    : elegidas.length === 0
      ? "Marca al menos una prenda."
      : elegidas.length > MAX_ASIGNAR_POR_VEZ
        ? `Son demasiadas de una vez: máximo ${MAX_ASIGNAR_POR_VEZ}.`
        : null;
  const conCategoria = grupos.filter((g) => g.activa).length;
  // Sobre la lista entera, no sobre lo buscado: la nota dice cuánto rinde el atajo, no cuánto se ve ahora.
  const categoriasDeLaLista = useMemo(() => new Set(lista.map((p) => p.categoriaId ?? "")).size, [lista]);

  function alternar(id: string) {
    setMarcadas((actual) => {
      const nuevo = new Set(actual);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });
  }

  function alternarTodas() {
    setMarcadas((actual) => {
      const nuevo = new Set(actual);
      for (const p of visibles) {
        if (todasVisiblesMarcadas) nuevo.delete(p.productoId);
        else nuevo.add(p.productoId);
      }
      return nuevo;
    });
  }

  // El atajo: ponerle la temporada a la categoría completa el grupo entero (y las prendas que entren después).
  function pedirCategoria(g: GrupoSinTemporada) {
    const c = g.activa;
    const nueva = c ? eleccion[c.id] : undefined;
    if (!c || !nueva) return;
    const nombre = nombreTemporada(datos.temporadas, nueva) ?? nueva;
    const { titulo, bajada } = textoCambioCategoria(c.nombre, nombreTemporada(datos.temporadas, c.temporada), nombre, c.heredan);
    onConfirmar({
      titulo,
      bajada,
      verbo: "Cambiar",
      accion: async () => {
        const r = await enviar({ accion: "categoria", categoriaId: c.id, temporada: nueva }, responsable);
        if (!r.ok) {
          avisar.error(r.error);
          return;
        }
        responsable.despues(null);
        const ids = g.prendas.map((p) => p.productoId);
        setMarcadas((actual) => new Set([...actual].filter((id) => !ids.includes(id))));
        setPlegando((x) => new Set(x).add(c.id));
        const n = g.prendas.length;
        avisar.exito(`${c.nombre}: ${nombre} por defecto · ${n} ${n === 1 ? "prenda completada" : "prendas completadas"}`);
        router.refresh();
      },
    });
  }

  function pedirAsignar() {
    if (motivo) return;
    const nombre = nombreTemporada(datos.temporadas, temporada) ?? temporada;
    const ids = elegidas;
    onConfirmar({
      ...textoAsignar(nombre, ids.length),
      accion: async () => {
        const r = await enviar({ accion: "asignar", temporada, productoIds: ids }, responsable);
        if (!r.ok) {
          avisar.error(r.error);
          return;
        }
        responsable.despues(null);
        setMarcadas((actual) => new Set([...actual].filter((id) => !ids.includes(id))));
        setAsignando((x) => new Set([...x, ...ids]));
        const asignadas = typeof r.datos.asignadas === "number" ? r.datos.asignadas : ids.length;
        const saltadas = typeof r.datos.saltadas === "number" ? r.datos.saltadas : 0;
        const detalle =
          saltadas === 1
            ? "1 ya tenía temporada (alguien la puso mientras tanto) y no se tocó."
            : saltadas > 1
              ? `${saltadas} ya tenían temporada (alguien la puso mientras tanto) y no se tocaron.`
              : undefined;
        if (asignadas === 0) avisar.aviso("No se asignó ninguna: todas ya tenían temporada.", { detalle });
        else avisar.exito(`«${nombre}» asignada a ${asignadas} ${asignadas === 1 ? "prenda" : "prendas"}`, { detalle });
        router.refresh();
      },
    });
  }

  if (lista.length === 0) {
    return (
      <section className="space-y-3" aria-label="Prendas por completar">
        <TituloVista desfase={desfase} titulo="Por completar" bajada="Prendas activas sin temporada propia, de un color ni de su categoría." />
        <div className="card-cayla anim-entra p-6 text-center" style={entra(desfase + 1).style}>
          <p className="font-display text-xl text-verde-profundo">Todas las prendas tienen temporada</p>
          <p className="mt-1 text-sm text-taupe">Frescura del piso ya puede avisar a cada una cuándo termina su estación.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3" aria-label="Prendas por completar">
      <TituloVista
        desfase={desfase}
        titulo="Por completar"
        bajada="Prendas activas sin temporada propia, de un color ni de su categoría. Frescura del piso las mide igual que al resto, pero no puede avisarles cuándo termina su estación."
      />

      {puedeEditar && conCategoria > 0 && (
        <p className="nota-cayla anim-entra" style={entra(desfase + 1).style}>
          Estas <b>{lista.length} {lista.length === 1 ? "prenda" : "prendas"}</b> están en{" "}
          <b>
            {categoriasDeLaLista} {categoriasDeLaLista === 1 ? "categoría" : "categorías"}
          </b>
          . Ponle la temporada a la categoría y se completan todas de una vez. Marca una prenda solo si es la excepción de su categoría (un
          polo de manga larga en una categoría de verano).
        </p>
      )}

      <div className="anim-entra flex flex-wrap items-center gap-2" style={entra(desfase + 2).style}>
        <div className="caja-cayla relative flex h-10 min-w-[12rem] flex-1 items-center">
          <Search aria-hidden strokeWidth={1.5} className="pointer-events-none absolute left-3 h-4 w-4 text-taupe" />
          <input
            type="text"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Nombre, código, categoría, marca o color…"
            aria-label="Buscar entre las prendas sin temporada"
            autoComplete="off"
            className="h-full w-full rounded-lg bg-transparent pl-9 pr-3 text-sm text-tinta outline-none placeholder:text-taupe"
          />
        </div>
        {puedeEditar && (
          <button type="button" className="btn-cayla btn-enlace text-sm" onClick={alternarTodas} disabled={visibles.length === 0}>
            {todasVisiblesMarcadas ? "Desmarcar todas" : texto ? "Marcar las que se ven" : "Marcar todas"}
          </button>
        )}
      </div>

      {visibles.length === 0 && <p className="nota-cayla">Ninguna prenda sin temporada coincide con «{texto}».</p>}

      <div className="flex flex-col">
        {grupos.map((g, i) => (
          <GrupoPorCompletar
            key={g.categoriaId ?? "sin-categoria"}
            grupo={g}
            orden={desfase + 3 + i}
            puedeEditar={puedeEditar}
            abreFicha={abreFicha}
            opciones={opciones}
            eleccion={g.activa ? (eleccion[g.activa.id] ?? "") : ""}
            onEleccion={(v) => g.activa && setEleccion((x) => ({ ...x, [g.activa!.id]: v }))}
            onPonerCategoria={() => pedirCategoria(g)}
            plegando={!!g.activa && plegando.has(g.activa.id)}
            marcadas={marcadas}
            asignando={asignando}
            onAlternar={alternar}
          />
        ))}
      </div>

      {puedeEditar && elegidas.length > 0 && (
        // Flota sobre la lista (por eso lleva sombra: ADR-0012) y sube desde abajo UNA vez, al marcar la primera.
        <div className="card-cayla anim-entrada sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 px-4 py-3 shadow-md" role="region" aria-label="Asignar a las marcadas">
          <p className="text-sm text-tinta">
            <b className="font-semibold">
              {elegidas.length} {elegidas.length === 1 ? "prenda marcada" : "prendas marcadas"}
            </b>
            <span className="text-taupe">
              : la temporada se {elegidas.length === 1 ? "le pone solo a ella" : "les pone solo a ellas"}, no a su categoría.
            </span>
            {marcadasOcultas > 0 && (
              <span className="block text-xs text-taupe">
                {marcadasOcultas} {marcadasOcultas === 1 ? "marcada no se ve" : "marcadas no se ven"} con esta búsqueda: no se{" "}
                {marcadasOcultas === 1 ? "asigna" : "asignan"}.
              </span>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-full sm:w-56">
              <Desplegable valor={temporada} onValor={setTemporada} opciones={opciones} forma="caja" marcador="Elegir temporada" etiquetaAccesible="Temporada que se les pone" />
            </div>
            <button type="button" className="btn-cayla btn-primario h-10" disabled={!!motivo} title={motivo ?? undefined} onClick={pedirAsignar}>
              Asignar a {elegidas.length}
            </button>
            <button type="button" className="btn-cayla btn-enlace text-sm" onClick={() => setMarcadas(new Set())}>
              Desmarcar
            </button>
          </div>
        </div>
      )}

      <p className="nota-cayla">
        {puedeEditar ? (
          <>
            La temporada se pone a la prenda con todos sus colores;{" "}
            {abreFicha ? (
              <>
                si un color es de otra temporada, eso va en <b>su ficha</b> (el nombre de cada prenda la abre).
              </>
            ) : (
              <>si un color es de otra temporada, eso se pone en la ficha de la prenda, en Productos: pídeselo a quien vea ese módulo.</>
            )}
          </>
        ) : (
          <>Quien edita el catálogo las completa aquí o en la ficha de cada prenda.</>
        )}
      </p>
    </section>
  );
}

/**
 * Un grupo de «Por completar»: la cabecera con su categoría y el atajo, y sus prendas. Al completarse se PLIEGA (la fila
 * de la grilla va de 1fr a 0fr, 300 ms) mientras la base responde, en vez de desaparecer de un corte cuando llega la
 * lista nueva. La prenda que se asignó en lote se apaga hasta que llega la lista nueva.
 */
function GrupoPorCompletar({
  grupo: g,
  orden,
  puedeEditar,
  abreFicha,
  opciones,
  eleccion,
  onEleccion,
  onPonerCategoria,
  plegando,
  marcadas,
  asignando,
  onAlternar,
}: {
  grupo: GrupoSinTemporada;
  orden: number;
  puedeEditar: boolean;
  abreFicha: boolean;
  opciones: ReturnType<typeof opcionesTemporada>;
  eleccion: string;
  onEleccion: (v: string) => void;
  onPonerCategoria: () => void;
  plegando: boolean;
  marcadas: ReadonlySet<string>;
  asignando: ReadonlySet<string>;
  onAlternar: (id: string) => void;
}) {
  const n = g.prendas.length;
  const plantilla = puedeEditar ? PLANTILLA_SIN : PLANTILLA_SIN_LECTURA;
  const { className, style } = entra(orden);
  return (
    <div
      className={`grid transition-[grid-template-rows,opacity] duration-300 ease-salida ${plegando ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr]"} ${className}`}
      style={style}
      aria-hidden={plegando || undefined}
    >
      <div className="min-h-0 overflow-hidden">
        <div className="pb-3">
          <div className="card-cayla @container overflow-hidden transition-colors hover:border-taupe/35">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 bg-sand/45 px-5 py-3">
              <p className="text-[15px] font-semibold text-tinta">
                {g.categoria}
                <span className="ml-1.5 text-[13px] font-normal text-taupe">
                  {n} {n === 1 ? "prenda" : "prendas"}
                </span>
              </p>
              {puedeEditar && g.activa && (
                <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                  <div className="w-full sm:w-52">
                    <Desplegable valor={eleccion} onValor={onEleccion} opciones={opciones} forma="caja" marcador="Elegir temporada" etiquetaAccesible={`Temporada para toda la categoría ${g.categoria}`} />
                  </div>
                  <button type="button" className="btn-cayla btn-secundario btn-chico w-full sm:w-auto" disabled={!eleccion} title={eleccion ? undefined : "Elige primero la temporada."} onClick={onPonerCategoria}>
                    Ponérsela a la categoría
                  </button>
                </div>
              )}
              {puedeEditar && !g.activa && (
                <p className="text-xs text-taupe">
                  {g.categoriaId ? "Su categoría está desactivada: complétalas una por una." : "Sin categoría: complétalas una por una o ponles categoría en su ficha."}
                </p>
              )}
            </div>
            <Encabezado columnas={puedeEditar ? COLUMNAS_SIN_EDITA : COLUMNAS_SIN} plantilla={plantilla} />
            {g.prendas.map((p) => {
              const marcada = marcadas.has(p.productoId);
              const colores = p.todosSusColores ? p.colores.join(", ") : `Solo ${p.colores.join(", ")}`;
              const contenido = (
                <>
                  <span className={celda()}>
                    {abreFicha ? (
                      <Link href={`/productos/${p.productoId}/editar`} className="block truncate text-tinta hover:text-rojo-profundo hover:underline">
                        {p.nombre}
                      </Link>
                    ) : (
                      <span className="block truncate text-tinta">{p.nombre}</span>
                    )}
                    {p.codigo && <span className="block truncate font-mono text-xs text-taupe">{p.codigo}</span>}
                    {/* Sin columnas de marca y proveedor (tarjeta < @3xl), bajan aquí, cada una con su rótulo. */}
                    <span
                      className="block truncate text-xs text-taupe @3xl:hidden"
                      title={`Marca: ${p.marca ?? "sin registrar"} · Proveedor: ${p.proveedor ?? "sin registrar"}`}
                    >
                      Marca: {p.marca ?? "sin registrar"} · Proveedor: {p.proveedor ?? "sin registrar"}
                    </span>
                  </span>
                  {/* Lo que falta sale como chip ámbar, igual que en Productos (ADR-0283): una prenda puede no tener marca o proveedor. */}
                  <span className={celda("izq", "hidden text-tinta/80 @3xl:block")} title={p.marca ?? "Sin marca"}>
                    {p.marca ?? <Chip tono="ambar" versalitas={false}>Sin marca</Chip>}
                  </span>
                  <span className={celda("izq", "hidden text-tinta/80 @3xl:block")} title={p.proveedor ?? "Sin proveedor"}>
                    {p.proveedor ?? <Chip tono="ambar" versalitas={false}>Sin proveedor</Chip>}
                  </span>
                  <span className={celda("izq", `text-tinta/75 ${puedeEditar ? "col-start-2 sm:col-start-auto" : ""}`)} title={p.colores.join(", ")}>
                    <span className="text-taupe sm:hidden">Colores: </span>
                    {colores}
                  </span>
                </>
              );
              const apagada = asignando.has(p.productoId) ? "opacity-40" : "";
              if (!puedeEditar) {
                return (
                  <div key={p.productoId} className={fila(plantilla, apagada)} role="row">
                    {contenido}
                  </div>
                );
              }
              // Tocable: tinte y la barrita de acento al pasar el mouse (como las filas de Recepciones y Por pagar); la marcada
              // se queda teñida con su barrita.
              return (
                <label
                  key={p.productoId}
                  className={fila(
                    plantilla,
                    `relative cursor-pointer transition-[background-color,opacity] duration-200 before:absolute before:inset-y-2.5 before:left-0 before:w-0.5 before:origin-center before:rounded before:bg-rojo before:transition-transform before:duration-300 before:ease-cayla sm:items-center ${
                      marcada ? "bg-rojo/[0.045] before:scale-y-100" : "before:scale-y-0 hover:bg-tinta/[0.03] hover:before:scale-y-100"
                    } ${apagada}`,
                  )}
                >
                  <span className="flex items-center">
                    <input
                      type="checkbox"
                      checked={marcada}
                      onChange={() => onAlternar(p.productoId)}
                      aria-label={`Marcar ${p.nombre}`}
                      className="h-[18px] w-[18px] cursor-pointer accent-tinta"
                    />
                  </span>
                  {contenido}
                </label>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
