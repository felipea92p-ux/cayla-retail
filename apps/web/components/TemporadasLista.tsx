"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { avisar } from "@/components/ui/Avisos";
import { Chip } from "@/components/ui/Chip";
import { Modal } from "@/components/ui/Modal";
import { Encabezado, Tabla, TABLA, celda, fila, type Columna } from "@/components/ui/Tabla";
import { Boton, CampoTexto, Desplegable, Segmentado } from "@/components/ui/campos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { ConfirmarConResponsable } from "@/components/ConfirmarConResponsable";
import type { Confirmacion } from "@/lib/confirmar-catalogo";
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
  MAX_ASIGNAR_POR_VEZ,
  primerAnioVisible,
  revisarFechas,
  textoAsignar,
  textoCambioCategoria,
  vecinas,
  type DatosPestanaTemporadas,
  type FechaEnEdicion,
  type RevisionFecha,
} from "@/lib/temporadas-pantalla";

/**
 * La pestaña «Temporadas» de Productos ▸ Atributos (ADR-0246). A diferencia de las otras cinco, la lista es CERRADA
 * (nueve valores que siembra la base): no se propone, no se aprueba ni se rechaza. Lo que sí se hace aquí:
 *   1. ver las nueve y cuándo termina cada una;
 *   2. el calendario de estaciones por año (SENAMHI): solo el LÍDER corrige una fecha, y solo si esa estación no empezó;
 *   3. la temporada por defecto de cada categoría, con la cifra de prendas que se reclasifican ANTES de guardar;
 *   4. la lista «Sin temporada», para completarla en lote (todo o nada).
 * Lo que la base resolvió (qué temporada tiene cada prenda) llega armado del servidor; tras cada guardado se vuelve a
 * pedir (`router.refresh`), así la pantalla nunca calcula por su cuenta una regla que vive en la base.
 */

type Carga = { datos: DatosPestanaTemporadas } | { nota: string } | null;

async function enviar(cuerpo: Record<string, unknown>, responsable: ControlResponsable): Promise<{ ok: true; datos: Record<string, unknown> } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/productos/temporadas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...responsable.encabezados() },
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

function Pestana({ datos, puedeEditar, esLider, abreFicha }: { datos: DatosPestanaTemporadas; puedeEditar: boolean; esLider: boolean; abreFicha: boolean }) {
  // Catálogo firma cada guardado con el combo «Responsable» (ADR-0161), siempre DENTRO de la ventana que guarda.
  const responsable = useResponsable();
  const [confirmando, setConfirmando] = useState<Confirmacion | null>(null);
  const enCurso = datos.calendario.find((e) => e.en_curso) ?? null;
  const sinTemporada = datos.sinTemporada.length;

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-tinta/75">
        {enCurso && (
          <span>
            Estación en curso: <b className="font-semibold text-tinta">{NOMBRE_ESTACION[enCurso.estacion]}</b>
            <span className="text-taupe"> · desde el {textoInstanteLima(enCurso.inicio)}</span>
          </span>
        )}
        <a href="#sin-temporada" className="btn-cayla btn-enlace text-sm">
          {sinTemporada === 0 ? "Todas las prendas tienen temporada" : `${sinTemporada} ${sinTemporada === 1 ? "prenda" : "prendas"} sin temporada`}
        </a>
      </div>

      <SeccionLista temporadas={datos.temporadas} porTemporada={datos.porTemporada} />
      <SeccionCalendario calendario={datos.calendario} anioHoy={datos.anioHoy} esLider={esLider} responsable={responsable} />
      <SeccionCategorias datos={datos} puedeEditar={puedeEditar} responsable={responsable} onConfirmar={setConfirmando} />
      <SeccionSinTemporada datos={datos} puedeEditar={puedeEditar} abreFicha={abreFicha} responsable={responsable} onConfirmar={setConfirmando} />

      {confirmando && <ConfirmarConResponsable confirmacion={confirmando} control={responsable} onClose={() => setConfirmando(null)} />}
    </div>
  );
}

function TituloSeccion({ id, sobre, titulo, bajada }: { id: string; sobre: string; titulo: string; bajada: string }) {
  return (
    <div className="space-y-1">
      <p className="label-cayla text-[11px] text-tinta/65">{sobre}</p>
      <h2 id={id} className="font-display text-xl text-tinta">
        {titulo}
      </h2>
      <p className="max-w-3xl text-sm text-taupe">{bajada}</p>
    </div>
  );
}

// ---- 1. Las temporadas ------------------------------------------------------------------------------------------------

const PLANTILLA_LISTA = "sm:grid-cols-[minmax(0,14rem)_7rem_minmax(0,1fr)_6rem]";
const COLUMNAS_LISTA: Columna[] = [
  { titulo: "Temporada" },
  { titulo: "Mitad del año", ayuda: "Frescura compara cada prenda con las de su misma mitad del año: Primavera-Verano u Otoño-Invierno." },
  { titulo: "Cuándo termina" },
  { titulo: "Prendas", alinear: "der", ayuda: "Prendas activas que hoy tienen esta temporada (propia, de un color o de su categoría)." },
];

function SeccionLista({ temporadas, porTemporada }: { temporadas: Temporada[]; porTemporada: Record<string, number> }) {
  return (
    <section className="space-y-3" aria-labelledby="temporadas-la-lista">
      <TituloSeccion
        id="temporadas-la-lista"
        sobre="La lista"
        titulo="Las temporadas"
        bajada="Nueve, fijas y sin año: el año de cada prenda sale de la fecha en que llegó a la sede. Una prenda versátil lleva «Primavera-Verano»; un bikini, «Verano»."
      />
      <Tabla>
        <Encabezado columnas={COLUMNAS_LISTA} plantilla={PLANTILLA_LISTA} />
        {[...temporadas]
          .sort((a, b) => a.orden - b.orden)
          .map((t) => (
            <div key={t.clave} className={fila(PLANTILLA_LISTA)} role="row">
              <span className={celda("izq", "text-tinta")}>{t.nombre}</span>
              <span className={celda()}>
                <Chip tono="neutro">{t.mitad === "PV" ? "PV" : t.mitad === "OI" ? "OI" : "Todo el año"}</Chip>
              </span>
              {/* Sin `truncate`: la frase de los clásicos es larga y cortada no se entiende. */}
              <span className="min-w-0 text-tinta/75">{textoFinDeEstacion(t)}</span>
              <span className={celda("der", "text-tinta/75")}>{porTemporada[t.clave] ?? 0}</span>
            </div>
          ))}
      </Tabla>
    </section>
  );
}

// ---- 2. Calendario ----------------------------------------------------------------------------------------------------

// La primera columna aguanta «Primavera» con el chip «En curso» al lado sin cortarlo.
const PLANTILLA_CAL = "sm:grid-cols-[11rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,13rem)_6.5rem]";
const COLUMNAS_CAL: Columna[] = [
  { titulo: "Estación" },
  { titulo: "Empieza", subtitulo: "hora de Perú" },
  { titulo: "Termina", subtitulo: "empieza la siguiente" },
  { titulo: "Fuente" },
  { titulo: "", alinear: "der" },
];

function SeccionCalendario({
  calendario,
  anioHoy,
  esLider,
  responsable,
}: {
  calendario: EventoCalendario[];
  anioHoy: number;
  esLider: boolean;
  responsable: ControlResponsable;
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

  return (
    <section className="space-y-3" aria-labelledby="temporadas-calendario">
      <TituloSeccion
        id="temporadas-calendario"
        sobre="Calendario"
        titulo="Cuándo empieza cada estación"
        bajada="Las fechas oficiales de SENAMHI (el instante del equinoccio o del solsticio). Una estación termina cuando empieza la siguiente. Solo el líder corrige una fecha, y solo si esa estación todavía no empezó: lo pasado queda fijo."
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

      <Tabla>
        <Encabezado columnas={COLUMNAS_CAL} plantilla={PLANTILLA_CAL} />
        {visibles.map((g) => (
          <Fragment key={g.anio}>
            {/* El año de la fila es el de su llave en el calendario: el verano de diciembre sigue hasta marzo del siguiente. */}
            <p className="px-5 pb-1.5 pt-4 text-xs font-semibold text-tinta">{g.anio}</p>
            {g.eventos.map((e) => (
              <div key={`${e.anio}-${e.estacion}`} className={fila(PLANTILLA_CAL, e.en_curso || e.editable ? "" : "text-tinta/65")} role="row">
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
        <ModalAnio anio={anioHoy + 1} calendario={calendario} responsable={responsable} onClose={() => setAgregando(false)} />
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
          <CamposFecha f={f} revision={revision} deshabilitado={guardando} onCambio={cambiarFecha} etiqueta={NOMBRE_ESTACION[evento.estacion]} />
          <Segmentado
            etiqueta="¿De dónde sale esta fecha?"
            valor={fuente}
            onValor={(v) => {
              setFuente(v);
              setFuenteElegida(true);
            }}
            opciones={OPCIONES_FUENTE}
            pie={PIE_FUENTE[fuente]}
          />
          <p className="text-xs text-taupe">
            Tiene que quedar entre {limites.antes ? `el inicio de ${NOMBRE_ESTACION[limites.antes.estacion].toLowerCase()} (${textoInstanteLima(limites.antes.inicio)})` : "hoy"}
            {limites.despues ? ` y el de ${NOMBRE_ESTACION[limites.despues.estacion].toLowerCase()} (${textoInstanteLima(limites.despues.inicio)})` : ""}.
          </p>
          <ComboResponsable control={responsable} deshabilitado={guardando} />
          <div className="flex gap-2">
            <Boton peso="fantasma" className="flex-1" onClick={cerrar} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton
              peso="primario"
              className="flex-1"
              cargando={guardando}
              disabled={!responsable.listo || !revision.instante}
              title={responsable.motivo ?? revision.error ?? undefined}
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
  responsable,
  onClose,
}: {
  anio: number;
  calendario: EventoCalendario[];
  responsable: ControlResponsable;
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

  async function guardar(cerrar: () => void) {
    if (hayError) return;
    setGuardando(true);
    const r = await enviar(
      { accion: "fecha", fechas: filas.map((f, i) => ({ anio: f.anio, estacion: f.estacion, inicio: revision[i].instante, fuente })) },
      responsable,
    );
    setGuardando(false);
    if (!r.ok) {
      // Todo o nada: no se guardó ninguna. Lo escrito queda en la ventana para corregir y volver a intentar.
      avisar.error(r.error);
      return;
    }
    responsable.despues(null);
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
              <Segmentado etiqueta="¿De dónde salen estas fechas?" valor={fuente} onValor={setFuente} opciones={OPCIONES_FUENTE} pie={PIE_FUENTE[fuente]} />
            </>
          )}
          <ComboResponsable control={responsable} deshabilitado={guardando} />
          <div className="flex gap-2">
            <Boton peso="fantasma" className="flex-1" onClick={cerrar} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton
              peso="primario"
              className="flex-1"
              cargando={guardando}
              disabled={!responsable.listo || hayError || filas.length === 0}
              title={responsable.motivo ?? undefined}
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

// ---- 3. Por categoría -------------------------------------------------------------------------------------------------

const PLANTILLA_CAT = "sm:grid-cols-[minmax(0,1fr)_minmax(0,16rem)_7rem]";
const COLUMNAS_CAT: Columna[] = [
  { titulo: "Categoría" },
  { titulo: "Temporada por defecto" },
  { titulo: "La heredan", alinear: "der", ayuda: "Prendas activas sin temporada propia: toman la de su categoría." },
];

function SeccionCategorias({
  datos,
  puedeEditar,
  responsable,
  onConfirmar,
}: {
  datos: DatosPestanaTemporadas;
  puedeEditar: boolean;
  responsable: ControlResponsable;
  onConfirmar: (c: Confirmacion) => void;
}) {
  const router = useRouter();
  // Lo recién guardado, mientras llega la lectura nueva del servidor (así el combo no vuelve un instante a lo de antes).
  // Vale solo mientras el servidor siga diciendo lo de ANTES: si ya dice otra cosa (lo nuevo, u otro cambio), manda él.
  const [recien, setRecien] = useState<Record<string, { de: string; a: string }>>({});
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
    <section className="space-y-3" aria-labelledby="temporadas-por-categoria">
      <TituloSeccion
        id="temporadas-por-categoria"
        sobre="Por categoría"
        titulo="La temporada de cada categoría"
        bajada="Es la que toma una prenda que no tiene la suya («Ropa de baño» → «Verano»). La de la prenda, o la de su color, manda sobre esta. Una subcategoría no hereda la de su categoría padre."
      />
      {datos.categorias.length === 0 ? (
        <p className="nota-cayla">No hay categorías activas.</p>
      ) : (
        <Tabla>
          <Encabezado columnas={COLUMNAS_CAT} plantilla={PLANTILLA_CAT} />
          {datos.categorias.map((c) => {
            const valor = valorDe(c);
            return (
              <div key={c.id} className={fila(PLANTILLA_CAT, "sm:items-center")} role="row">
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
        </Tabla>
      )}
    </section>
  );
}

// ---- 4. Sin temporada -------------------------------------------------------------------------------------------------

const PLANTILLA_SIN = "sm:grid-cols-[2rem_minmax(0,1fr)_minmax(0,12rem)_minmax(0,14rem)]";
const PLANTILLA_SIN_LECTURA = "sm:grid-cols-[minmax(0,1fr)_minmax(0,12rem)_minmax(0,14rem)]";

function SeccionSinTemporada({
  datos,
  puedeEditar,
  abreFicha,
  responsable,
  onConfirmar,
}: {
  datos: DatosPestanaTemporadas;
  puedeEditar: boolean;
  /** Puede abrir la ficha de la prenda (módulo Productos y permiso de catálogo): entonces el nombre enlaza a ella. */
  abreFicha: boolean;
  responsable: ControlResponsable;
  onConfirmar: (c: Confirmacion) => void;
}) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [temporada, setTemporada] = useState("");
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const lista = datos.sinTemporada;
  const visibles = useMemo(() => filtrarSinTemporada(lista, texto), [lista, texto]);
  // Se asigna SOLO a lo marcado que se ve: «Marcar las que se ven» promete eso, y una prenda marcada que el buscador
  // esconde no puede recibir una temporada sin que nadie la vea. Las marcas ocultas no se pierden (vuelven al borrar la
  // búsqueda) y el pie dice cuántas son. Tras guardar, la lista vuelve del servidor sin las que ya tienen temporada.
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
        // La ruta salta las que alguien completó mientras la lista estaba abierta (no las pisa): se dice cuántas.
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

  return (
    <section id="sin-temporada" className="scroll-mt-24 space-y-3" aria-labelledby="temporadas-sin-temporada">
      <TituloSeccion
        id="temporadas-sin-temporada"
        sobre={`Sin temporada · ${lista.length}`}
        titulo="Prendas sin temporada"
        bajada="Prendas activas sin temporada propia, de un color ni de su categoría. Frescura las muestra aparte y no puede avisar cuándo termina su estación."
      />

      {lista.length === 0 ? (
        <p className="nota-cayla">Todas las prendas tienen temporada.</p>
      ) : (
        <>
          {/* Filtros y tabla en UNA tarjeta (ADR-0169): buscar, elegir la temporada y asignar a las marcadas. */}
          <Tabla>
            <div className="flex flex-wrap items-center gap-2 px-5 py-3">
              <div className="caja-cayla relative flex h-10 min-w-[12rem] flex-1 items-center">
                <Search aria-hidden strokeWidth={1.5} className="pointer-events-none absolute left-3 h-4 w-4 text-taupe" />
                <input
                  type="text"
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder="Nombre, código, categoría o color…"
                  aria-label="Buscar entre las prendas sin temporada"
                  autoComplete="off"
                  className="h-full w-full rounded-lg bg-transparent pl-9 pr-3 text-sm text-tinta outline-none placeholder:text-taupe"
                />
              </div>
              {puedeEditar && (
                <>
                  <div className="w-full sm:w-60">
                    <Desplegable
                      valor={temporada}
                      onValor={setTemporada}
                      opciones={opciones}
                      forma="caja"
                      marcador="Elegir temporada"
                      etiquetaAccesible="Temporada que se les pone"
                    />
                  </div>
                  <button type="button" className="btn-cayla btn-primario h-10" disabled={!!motivo} title={motivo ?? undefined} onClick={pedirAsignar}>
                    {elegidas.length === 0 ? "Asignar" : `Asignar a ${elegidas.length}`}
                  </button>
                  {/* En el celular la fila de títulos no se ve: la casilla de «todas» va aquí. */}
                  <button type="button" className="btn-cayla btn-enlace text-sm sm:hidden" onClick={alternarTodas} disabled={visibles.length === 0}>
                    {todasVisiblesMarcadas ? "Desmarcar todas" : texto ? "Marcar las que se ven" : "Marcar todas"}
                  </button>
                </>
              )}
            </div>
            {puedeEditar ? (
              <div className={`hidden sm:grid ${TABLA.encabezado} ${PLANTILLA_SIN}`} role="row">
                <span role="columnheader" className={`${TABLA.titulo} flex items-center`}>
                  <input
                    type="checkbox"
                    checked={todasVisiblesMarcadas}
                    onChange={alternarTodas}
                    disabled={visibles.length === 0}
                    aria-label={texto ? "Marcar las que se ven" : "Marcar todas"}
                    className="h-[18px] w-[18px] cursor-pointer accent-tinta"
                  />
                </span>
                <span role="columnheader" className={TABLA.titulo}>Prenda</span>
                <span role="columnheader" className={TABLA.titulo}>Categoría</span>
                <span role="columnheader" className={TABLA.titulo}>Colores sin temporada</span>
              </div>
            ) : (
              <Encabezado columnas={[{ titulo: "Prenda" }, { titulo: "Categoría" }, { titulo: "Colores sin temporada" }]} plantilla={PLANTILLA_SIN_LECTURA} />
            )}
            {visibles.length === 0 && <p className={TABLA.vacio}>Ninguna prenda sin temporada coincide con «{texto}».</p>}
            {visibles.map((p) => (
              <div key={p.productoId} className={fila(puedeEditar ? PLANTILLA_SIN : PLANTILLA_SIN_LECTURA)} role="row">
                {puedeEditar && (
                  <span className="flex items-center">
                    <input
                      type="checkbox"
                      checked={marcadas.has(p.productoId)}
                      onChange={() =>
                        setMarcadas((actual) => {
                          const nuevo = new Set(actual);
                          if (nuevo.has(p.productoId)) nuevo.delete(p.productoId);
                          else nuevo.add(p.productoId);
                          return nuevo;
                        })
                      }
                      aria-label={`Marcar ${p.nombre}`}
                      className="h-[18px] w-[18px] cursor-pointer accent-tinta"
                    />
                  </span>
                )}
                <span className={celda()}>
                  {abreFicha ? (
                    <Link href={`/productos/${p.productoId}/editar`} className="block truncate text-tinta hover:text-rojo-profundo hover:underline">
                      {p.nombre}
                    </Link>
                  ) : (
                    <span className="block truncate text-tinta">{p.nombre}</span>
                  )}
                  {p.codigo && <span className="block truncate font-mono text-xs text-taupe">{p.codigo}</span>}
                </span>
                <span className={celda("izq", p.categoria ? "text-tinta/75" : "text-taupe")}>{p.categoria ?? "Sin categoría"}</span>
                <span className={celda("izq", "text-tinta/75")} title={p.colores.join(", ")}>
                  {p.todosSusColores ? p.colores.join(", ") : `Solo ${p.colores.join(", ")}`}
                </span>
              </div>
            ))}
            <p className={TABLA.pie}>
              {puedeEditar && elegidas.length > 0 ? `${elegidas.length} ${elegidas.length === 1 ? "marcada" : "marcadas"} · ` : ""}
              {visibles.length === lista.length ? `${lista.length} ${lista.length === 1 ? "prenda" : "prendas"}` : `${visibles.length} de ${lista.length}`}
              {puedeEditar && marcadasOcultas > 0 && (
                <b className="font-semibold text-tinta">
                  {" "}
                  · {marcadasOcultas} {marcadasOcultas === 1 ? "marcada no se ve" : "marcadas no se ven"} con esta búsqueda: no se{" "}
                  {marcadasOcultas === 1 ? "asigna" : "asignan"}
                </b>
              )}
            </p>
          </Tabla>

          <p className="nota-cayla">
            {puedeEditar ? (
              <>
                ¿Todas las de una categoría son de la misma temporada? Pónsela <b>a la categoría</b> (arriba) y se completan solas. La temporada
                se pone a la prenda con todos sus colores;{" "}
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
        </>
      )}
    </section>
  );
}
