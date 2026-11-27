"use client";

import "@/app/estilos/ordenes-lista.css";
import { useEffect, useMemo, useReducer, useState, useSyncExternalStore } from "react";
import { ChevronRight, Factory, FunnelX, Scissors, Shirt } from "lucide-react";
import { NuevaOrdenProduccionForm } from "@/components/NuevaOrdenProduccionForm";
import { FilaDeOrden, PLANTILLA_LISTA } from "@/components/ordenes-lista/FilaDeOrden";
import { MarcoDePagina } from "@/components/ordenes-lista/MarcoDePagina";
import { Aviso } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { Buscador } from "@/components/ui/Buscador";
import { Boton } from "@/components/ui/campos";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Pestanas } from "@/components/ui/Pestanas";
import { Encabezado, TABLA, Tabla, type Columna } from "@/components/ui/Tabla";
import { Vacio } from "@/components/ui/Vacio";
import {
  almacenDelNavegador,
  borrarBorrador,
  guardarBorrador,
  haceCuanto,
  leerBorrador,
  modeloDelBorrador,
  resumenDelBorrador,
  textoDelUltimoBorrador,
  type PartidaDeOrden,
} from "@/lib/borrador-orden";
import type { DecisionProduccion } from "@/lib/decision-produccion";
import type { InsumoVista } from "@/lib/insumos";
import type { OpcionesNuevaOrden, ModeloProducible, OrdenProduccion } from "@/lib/produccion";
import type { VocabularioModeloNuevo } from "@/lib/modelo-nuevo-reglas";
import type { TipoOrden } from "@/lib/modelo-nuevo-orden-reglas";
import { ordenesParaLaLista, type OrdenParaMolde } from "@/lib/orden-modelo-reglas";
import { DIAS_SIN_MOVERSE } from "@/lib/orden-pagina-reglas";
import {
  caminoDeLasOrdenes,
  pestanaDe,
  cuantasPidenAtencion,
  cuentasDePestanas,
  filtrarFilas,
  ordenarFilas,
  pestanaDeOrdenNueva,
  pieDeLaLista,
  urlSinParametrosDeNueva,
  type ListaDeOrdenes,
  type OrdenCreada,
  type PestanaLista,
  type TramoClave,
} from "@/lib/ordenes-lista-reglas";
import type { Tolerado } from "@/lib/resultado";

// Órdenes de producción del Taller (ADR-0400, actividad 5; «A · Lista», elegida por Felipe el 2026-10-14; rehecha el 2026-11-26 con la maqueta de «Producción más clara»): una fila
// por orden, ordenadas por entrega (decisión de Felipe: el orden no cambia). Arriba, la franja «dónde está cada orden»: UNA placa con «Todas» y cada fase, que filtra al tocarse. La
// tabla lleva las pestañas (En curso, Muestras, Terminadas), una sola píldora («Piden atención») y el buscador; sus columnas van con palabras completas y el motivo de la atención se
// lee en la propia fila. Cada fila lleva a la página de la orden (`/produccion/ordenes/OP-000012`): ahí se hace todo, también pasar al stock, anular y revertir. El cajón de antes se
// retiró (ADR-0614, actividad 15). Toda escritura es una RPC (ninguna toca las tablas directo).

/** Las columnas se ven desde el mismo ancho en que la fila deja de ser una tarjeta (`PLANTILLA_LISTA`). */
const COLUMNAS: Columna[] = [{ titulo: "Orden" }, { titulo: "Prendas", alinear: "der" }, { titulo: "Dónde está" }, { titulo: "Lleva ahí" }, { titulo: "Entrega" }, { titulo: "Atención" }];

/** Hasta cuántos tramos caben en una sola fila con su flecha entre fase y fase; con más, la franja se acomoda en varias filas. */
const TRAMOS_EN_UNA_FILA = 6;

/** Cuánto se queda marcada la orden recién abierta: la animación corre una vez; pasado esto, la fila vuelve a ser una más. */
const MS_ORDEN_RECIEN = 6000;

/** El almacén del navegador solo avisa de lo que cambió OTRA pestaña; lo de esta se lee al repintarse. */
function suscribirseAlAlmacen(alCambiar: () => void) {
  window.addEventListener("storage", alCambiar);
  return () => window.removeEventListener("storage", alCambiar);
}

/** «Blusa Emma, 120 prendas, hace 5 min»: de qué es y cuánto va, para saber si es la que quieres seguir. */
function textoDelBorrador(foto: Parameters<typeof resumenDelBorrador>[0], guardadoEn: string, nombres: ReadonlyMap<string, string>): string {
  const { modelo, prendas } = resumenDelBorrador(foto, nombres);
  return [modelo, prendas > 0 ? `${prendas} ${prendas === 1 ? "prenda" : "prendas"}` : "sin cantidades todavía", haceCuanto(guardadoEn)].join(", ");
}

export function OrdenesLista({
  tallerId,
  tallerNombre,
  lista,
  falla,
  ordenes,
  modelos,
  esLider,
  hoy,
  insumos,
  decision,
  nuevaInicial = null,
  sugeridaInicial = false,
  tipoInicial = "produccion",
  puedeEditarCatalogo = false,
  vocabulario = null,
  opcionesNuevaOrden = null,
  historialDeMoldes = null,
}: {
  tallerId: string;
  tallerNombre: string;
  /** Las órdenes ya armadas para la lista (`getListaDeOrdenes`); `null` si no se pudieron leer (entonces `falla` dice qué). */
  lista: ListaDeOrdenes | null;
  falla: string | null;
  /** Las órdenes con el formato de siempre: alimentan el cajón (pasar al stock, anular), «Nueva orden» y el consejo de la red. */
  ordenes: OrdenProduccion[];
  modelos: ModeloProducible[];
  esLider: boolean;
  hoy: string;
  insumos: InsumoVista[];
  /** Solo el líder (F5): lo que aconseja la red al abrir una orden. */
  decision: Tolerado<DecisionProduccion> | null;
  /** Enlaces del Resumen (F6) y de la página de la orden: `?nueva=<modelo>` abre «Nueva orden» con el modelo elegido (`auto` = el primero). */
  nuevaInicial?: string | null;
  /** `&sugerida=1` (solo desde «Abrir orden sugerida» del Resumen): «Nueva orden» llega con la matriz ya llena con la sugerencia de la red. */
  sugeridaInicial?: boolean;
  /** `?tipo=muestra` (ADR-0361): el tipo con que se abre «Nueva orden» al volver de crear un modelo nuevo. */
  tipoInicial?: TipoOrden;
  /** Quien edita el catálogo puede crear el modelo que falta desde aquí (`fn_puede_editar_catalogo`, ADR-0361). */
  puedeEditarCatalogo?: boolean;
  /** Tallas, colores y categorías para «Modelo nuevo» dentro de la orden (ADR-0361). */
  vocabulario?: Tolerado<VocabularioModeloNuevo> | null;
  /** Lo que «Nueva orden» ofrece elegir (ADR-0400): servicios con su lista de precios, consumo por modelo, tela comprometida. Secundario. */
  opcionesNuevaOrden?: Tolerado<OpcionesNuevaOrden> | null;
  /** Las órdenes del Taller que dicen qué modelos ya tienen molde (`moldeDelModelo`). `null` si no se pudo leer: la hoja pregunta en vez de deducir. */
  historialDeMoldes?: readonly OrdenParaMolde[] | null;
}) {
  const [nuevaAbierta, setNuevaAbierta] = useState(nuevaInicial !== null);
  // La sugerencia del Resumen se aplica UNA vez, a la apertura que vino por la URL: la URL no cambia al cerrar ni al guardar, así que sin esto cada «+ Nueva orden» la volvería a escribir.
  const [sugeridaPendiente, setSugeridaPendiente] = useState(sugeridaInicial);
  const [pestana, setPestana] = useState<PestanaLista>("en_curso");
  // El tramo tocado en la franja (`null` = «Todas») y la píldora «Piden atención».
  const [tramo, setTramo] = useState<TramoClave | null>(null);
  const [piden, setPiden] = useState(false);
  const [texto, setTexto] = useState("");
  // La orden que se acaba de abrir (su id): su fila respira en verde una vez y se lleva a la vista (ADR-0509).
  const [recien, setRecien] = useState<string | null>(null);
  // De dónde arranca «Nueva orden» cuando no es en blanco (un borrador que se retoma, o lo que deja «crear otra»). Cada partida hace nacer el formulario de nuevo (`key`).
  const [partida, setPartida] = useState<PartidaDeOrden | null>(null);
  const [vuelta, setVuelta] = useState(0);
  // El borrador que quedó guardado en este navegador (ADR-0509). El texto crudo es lo que se compara (una cadena es estable); el almacén solo avisa de otras pestañas, así que la lista se
  // vuelve a leer cuando ella misma se repinta: al cerrar el formulario, al descartar o al volver de otra pantalla.
  const [, repintar] = useReducer((n: number) => n + 1, 0);
  const textoBorrador = useSyncExternalStore(suscribirseAlAlmacen, () => textoDelUltimoBorrador(almacenDelNavegador(), tallerId), () => null);
  const borradorGuardado = useMemo(() => leerBorrador(textoBorrador), [textoBorrador]);
  const nombresDeModelos = useMemo(() => new Map(modelos.map((m) => [m.productoId, m.referencia] as const)), [modelos]);
  useEffect(() => {
    if (!recien) return;
    const t = window.setTimeout(() => setRecien(null), MS_ORDEN_RECIEN);
    return () => window.clearTimeout(t);
  }, [recien]);

  const filas = useMemo(() => lista?.filas ?? [], [lista]);
  // Para la lista de «Nueva orden»: cuántas órdenes abiertas tiene cada modelo y cuáles fueron los últimos (ADR-0396).
  const paraLaLista = useMemo(() => ordenesParaLaLista(ordenes), [ordenes]);
  // La franja cuenta las órdenes de la pestaña abierta: en «En curso» los lotes y en «Muestras» las muestras, para que «Todas» y cada tramo den lo mismo que la lista de abajo. En «Terminadas» no hay abiertas: se cuentan todas las que siguen en el Taller.
  const camino = useMemo(() => caminoDeLasOrdenes(pestana === "terminadas" ? filas : filas.filter((f) => pestanaDe(f) === pestana)), [filas, pestana]);
  const cuentas = useMemo(() => cuentasDePestanas(filas), [filas]);
  const visibles = useMemo(() => ordenarFilas(filtrarFilas(filas, { pestana, tramo, piden, texto }), pestana), [filas, pestana, tramo, piden, texto]);
  const cuantasPiden = useMemo(() => cuantasPidenAtencion(filas, { pestana, tramo, texto }), [filas, pestana, tramo, texto]);
  const hayFiltro = tramo !== null || piden || texto.trim() !== "";
  const primeraConAtencion = visibles.find((f) => f.atencion.length > 0)?.id ?? null;
  const pie = pieDeLaLista(visibles.length, pestana, hayFiltro);

  function quitarFiltros() {
    setTramo(null);
    setPiden(false);
    setTexto("");
  }

  // Al abrirse la orden, la lista va a la pestaña donde quedó (una muestra cae en «Muestras») sin filtros que la escondan, y la marca. La fila llega con el refresco que el formulario hace al guardar.
  function alCrearse(o: OrdenCreada & { esMuestra: boolean; seguiraAbierta: boolean }) {
    // Con «crear otra» la persona sigue armando la siguiente: la lista no se la lleva de la vista (la orden queda en la lista y el aviso lleva a ella).
    if (o.seguiraAbierta) return;
    setPestana(pestanaDeOrdenNueva(o.esMuestra));
    quitarFiltros();
    setRecien(o.id);
  }

  // `?nueva=` (Resumen, Análisis, Nuevo producto) abre la hoja desde la URL, y la URL no cambia sola: con F5 la hoja volvía a abrirse aunque la orden ya estuviera creada. Al cerrar o guardar se limpia.
  function limpiarUrlDeNueva() {
    const actual = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const limpia = urlSinParametrosDeNueva(actual);
    if (limpia !== actual) window.history.replaceState(null, "", limpia);
  }

  // Con el compositor ya abierto, «+ Nueva orden» no hace nada nuevo: lo lleva a la vista.
  function abrirNueva() {
    if (nuevaAbierta) document.querySelector("[data-compositor-orden]")?.scrollIntoView({ block: "start", behavior: "smooth" });
    else {
      setPartida(null);
      setNuevaAbierta(true);
    }
  }

  /** El formulario nace de nuevo con esta partida: un borrador que se retoma, o lo que deja «crear otra». */
  function empezarDesde(nueva: PartidaDeOrden) {
    setPartida(nueva);
    setVuelta((n) => n + 1);
    setSugeridaPendiente(false);
    setNuevaAbierta(true);
  }

  function descartarElBorrador() {
    if (!borradorGuardado) return;
    const guardado = borradorGuardado;
    const almacen = almacenDelNavegador();
    const modelo = modeloDelBorrador(guardado.foto);
    if (modelo) borrarBorrador(almacen, tallerId, modelo);
    repintar();
    // Descartar no se puede deshacer en la base, pero un borrador sí se puede devolver: se vuelve a guardar tal cual, con su hora de antes.
    avisar.exito("Borrador descartado", {
      accion: {
        texto: "Deshacer",
        onClick: () => {
          guardarBorrador(almacen, tallerId, guardado.foto, new Date(guardado.guardadoEn));
          repintar();
        },
      },
    });
  }

  const nuevaOrden = (
    <Boton peso="primario" data-guia="prod-ordenes.nueva" onClick={abrirNueva}>
      + Nueva orden
    </Boton>
  );

  let cuerpo: React.ReactNode;
  if (falla || !lista) {
    cuerpo = (
      <Aviso tono="error" titulo="No se pudieron leer las órdenes">
        {falla ?? "Vuelve a intentarlo en un momento; si sigue, avísale a tu líder."}
      </Aviso>
    );
  } else if (filas.length === 0) {
    // Con el compositor abierto, él ocupa el lugar de «Todavía no se abrió ninguna orden» (arriba, bajo la cabecera).
    cuerpo = nuevaAbierta ? null : (
      <div className="card-cayla">
        <Vacio icono={<Factory />} titulo="Todavía no se abrió ninguna orden" acciones={modelos.length > 0 ? nuevaOrden : null}>
          Una orden es un lote de un modelo: cuántas prendas por talla y color, quién hace cada fase y su tela.
        </Vacio>
      </div>
    );
  } else {
    cuerpo = (
      <>
        {/* «Dónde está cada orden»: UNA placa con «Todas» y cada fase en el orden de la ruta. Cada tramo filtra la lista; tocarlo de nuevo, o tocar «Todas», lo quita. */}
        <div role="group" aria-label="Dónde está cada orden" data-guia="prod-ordenes.cifras" className="card-cayla ol-camino anim-entra">
          <div className="ol-camino-rejilla" data-una-fila={camino.tramos.length + 1 <= TRAMOS_EN_UNA_FILA ? "" : undefined}>
            <button type="button" className="ol-tramo" data-todas="" data-cero={camino.todas.ordenes === 0 ? "" : undefined} aria-pressed={tramo === null} onClick={() => setTramo(null)}>
              <span className="ol-tramo-n">
                <CifraQueCuenta valor={camino.todas.ordenes} alMontar />
              </span>
              <span className="min-w-0">
                <span className="ol-tramo-nombre">Todas</span>
                <span className="ol-tramo-prendas">{camino.todas.prendas}</span>
              </span>
            </button>
            {camino.tramos.map((t, i) => (
              <button key={t.clave} type="button" className="ol-tramo" data-cero={t.ordenes === 0 ? "" : undefined} aria-pressed={tramo === t.clave} onClick={() => setTramo((actual) => (actual === t.clave ? null : t.clave))}>
                {i > 0 && (
                  <span aria-hidden className="ol-tramo-flecha">
                    <ChevronRight />
                  </span>
                )}
                <span className="ol-tramo-n">
                  <CifraQueCuenta valor={t.ordenes} alMontar />
                </span>
                <span className="min-w-0">
                  <span className="ol-tramo-nombre">{t.titulo}</span>
                  <span className="ol-tramo-prendas">{t.prendas}</span>
                </span>
                {t.atencion && (
                  <span className="ol-tramo-punto">
                    <span className="sr-only">Hay algo por atender</span>
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <Tabla className="@container">
          <div className="flex flex-wrap items-center gap-x-3.5 gap-y-3 p-4">
            <Pestanas
              guia="prod-ordenes.pestanas"
              items={[
                { clave: "en_curso", etiqueta: "En curso", conteo: cuentas.en_curso },
                { clave: "muestras", etiqueta: "Muestras", conteo: cuentas.muestras },
                { clave: "terminadas", etiqueta: "Terminadas", conteo: cuentas.terminadas },
              ]}
              activa={pestana}
              etiquetaAccesible="Qué órdenes ver"
              onCambio={(clave) => setPestana(clave as PestanaLista)}
              idIndicador="ordenes-lista"
            />
            {/* Un solo filtro: las que piden atención. Se ve si hay alguna (o si ya está puesto, para poder quitarlo). */}
            {(cuantasPiden > 0 || piden) && (
              <button type="button" className="pildora-cayla" data-guia="prod-ordenes.filtros" aria-pressed={piden} onClick={() => setPiden((v) => !v)}>
                Piden atención
                <span className="ml-1.5 font-medium tracking-normal tabular-nums">{cuantasPiden}</span>
              </button>
            )}
            <Buscador valor={texto} onCambio={setTexto} placeholder="Buscar modelo, color u orden" atajo guia="prod-ordenes.buscador" className="w-full @min-[60rem]:ml-auto @min-[60rem]:w-72" />
          </div>

          <div data-resultados>
            {visibles.length === 0 ? (
              hayFiltro ? (
                // El verbo es «Limpiar» + qué, nunca «Quitar filtros» (ADR-0358, accion.limpiar): si lo único puesto es la búsqueda, se borra la búsqueda.
                <Vacio
                  tamano="chico"
                  icono={<FunnelX />}
                  accion={{ texto: tramo === null && !piden ? "Borrar la búsqueda" : "Limpiar filtros", onClick: quitarFiltros }}
                  className="py-5"
                >
                  Ninguna orden coincide con lo que elegiste.
                </Vacio>
              ) : (
                <Vacio
                  tamano="chico"
                  icono={pestana === "muestras" ? <Shirt /> : <Scissors />}
                  accion={pestana === "en_curso" && modelos.length > 0 ? { texto: "Abrir una orden", onClick: abrirNueva } : undefined}
                  className="py-5"
                >
                  {pestana === "en_curso" ? "No hay órdenes en curso." : pestana === "muestras" ? "No hay muestras en desarrollo." : "Todavía no se cerró ninguna orden."}
                </Vacio>
              )
            ) : (
              <>
                {/* `pr-8`: el mismo relleno de la fila (que guarda lugar para su flecha), para que cada título caiga sobre su columna. */}
                <Encabezado visible="hidden @min-[60rem]:grid" plantilla={`${PLANTILLA_LISTA} pr-8`} columnas={COLUMNAS} />
                {visibles.map((f, i) => (
                  <FilaDeOrden key={f.id} f={f} primera={i === 0} guiaAtencion={f.id === primeraConAtencion} recien={f.id === recien} />
                ))}
              </>
            )}
          </div>

          {visibles.length > 0 && (
            <div className={`${TABLA.pie} flex flex-wrap items-center justify-between gap-x-4 gap-y-1`}>
              <span>{pie.cuenta}</span>
              <span>{pie.orden}</span>
            </div>
          )}
        </Tabla>
      </>
    );
  }

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        sede={tallerNombre}
        titulo="Órdenes"
        subtitulo="Cada orden, en qué fase está y quién la tiene. Toca una para ver y anotar lo que terminaste."
        ayuda={
          <>
            Una orden pide <b>atención solo por tres causas</b>: la entrega ya pasó, la tela no alcanza o lleva {DIAS_SIN_MOVERSE} días sin que nadie anote nada. El motivo se lee en su fila. Lo que está <b>afuera</b> aparece con el nombre de quien lo
            tiene.
          </>
        }
        acciones={nuevaOrden}
      />

      {/* Lo escrito en «Nueva orden» y no abierto queda guardado en este navegador (ADR-0509): aquí se ofrece seguir o soltarlo. */}
      {!nuevaAbierta && borradorGuardado && (
        <Aviso
          tono="info"
          titulo="Hay una orden a medias en este computador"
          guia="prod-ordenes.borrador"
          accion={
            <span className="flex flex-wrap gap-2">
              <Boton type="button" peso="fantasma" onClick={() => empezarDesde({ foto: borradorGuardado.foto, deBorrador: true })}>
                Retomar
              </Boton>
              <Boton type="button" peso="peligro" onClick={descartarElBorrador}>
                Descartar
              </Boton>
            </span>
          }
        >
          {textoDelBorrador(borradorGuardado.foto, borradorGuardado.guardadoEn, nombresDeModelos)}
        </Aviso>
      )}

      {/* «Nueva orden» (ADR-0509): se arma aquí, con la lista a la vista debajo. Antes era una hoja de 1080 px que la tapaba. */}
      {nuevaAbierta && (
        <NuevaOrdenProduccionForm
          key={vuelta}
          tallerId={tallerId}
          modelos={modelos}
          decision={decision}
          partida={partida}
          productoInicialId={partida ? null : nuevaInicial}
          sugeridaInicial={sugeridaPendiente && !partida}
          tipoInicial={tipoInicial}
          puedeEditarCatalogo={puedeEditarCatalogo}
          vocabulario={vocabulario}
          opciones={opcionesNuevaOrden}
          historialDeMoldes={historialDeMoldes}
          insumos={insumos}
          hoy={hoy}
          abiertas={paraLaLista.abiertas}
          recientes={paraLaLista.recientes}
          marco={MarcoDePagina}
          onCreada={alCrearse}
          onOtra={empezarDesde}
          onRetomar={(b) => empezarDesde({ foto: b.foto, deBorrador: true })}
          onClose={() => {
            setNuevaAbierta(false);
            setSugeridaPendiente(false);
            setPartida(null);
            limpiarUrlDeNueva();
          }}
        />
      )}

      {modelos.length === 0 && !nuevaAbierta && (
        <div className="card-cayla">
          <Vacio
            icono={<Shirt />}
            titulo="Todavía no hay modelos"
            acciones={
              <Boton peso="primario" onClick={() => setNuevaAbierta(true)}>
                + Crear el primer modelo
              </Boton>
            }
          >
            Créalo aquí mismo: un modelo nuevo se abre ya con su orden de producción.
          </Vacio>
        </div>
      )}

      {cuerpo}

    </div>
  );
}
