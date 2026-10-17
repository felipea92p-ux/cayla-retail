"use client";

import { useMemo, useState } from "react";
import { Factory, FunnelX, Scissors, Shirt } from "lucide-react";
import { AnularOrdenModal, RevertirOrdenModal } from "@/components/OrdenModales";
import { NuevaOrdenProduccionForm } from "@/components/NuevaOrdenProduccionForm";
import { OrdenPanel } from "@/components/OrdenPanel";
import { FilaDeOrden, PLANTILLA_LISTA } from "@/components/ordenes-lista/FilaDeOrden";
import { Aviso } from "@/components/ui/Aviso";
import { Buscador } from "@/components/ui/Buscador";
import { Boton } from "@/components/ui/campos";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Pestanas } from "@/components/ui/Pestanas";
import { Encabezado, TABLA, Tabla, type Columna } from "@/components/ui/Tabla";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";
import type { DecisionProduccion } from "@/lib/decision-produccion";
import type { ConsumoDeOrden, InsumoVista } from "@/lib/insumos";
import type { OpcionesNuevaOrden, ModeloProducible, OrdenProduccion } from "@/lib/produccion";
import type { VocabularioModeloNuevo } from "@/lib/modelo-nuevo-reglas";
import type { TipoOrden } from "@/lib/modelo-nuevo-orden-reglas";
import { ordenesParaLaLista } from "@/lib/orden-modelo-reglas";
import type { FaseClave } from "@/lib/orden-fases-reglas";
import { DIAS_SIN_MOVERSE } from "@/lib/orden-pagina-reglas";
import {
  cifrasHoyEnElTaller,
  conEtapasDeAntes,
  cuentasDeFiltros,
  cuentasDePestanas,
  datoHoyEnElTaller,
  filtrarFilas,
  ordenarFilas,
  pieDeLaLista,
  type FiltroDeLista,
  type ListaDeOrdenes,
  type PestanaLista,
} from "@/lib/ordenes-lista-reglas";
import type { Tolerado } from "@/lib/resultado";

// Órdenes de producción del Taller (ADR-0400, actividad 5; «A · Lista», elegida por Felipe el 2026-10-14): una fila por lote, ordenadas por entrega, y la fase es un dato de la fila (un chip
// con quién la tiene). Arriba, «Hoy en el Taller» cuenta por fase y filtra al tocarse; la tabla lleva las pestañas En curso · Muestras · Terminadas, las píldoras de filtro y el buscador.
// Cada fila lleva a la página de la orden (`/produccion/ordenes/OP-000012`); lo que NO se hace en esa página todavía —pasar al stock, anular, revertir— sigue abriendo el cajón de siempre
// (`?orden=<id>`) hasta la actividad 6. Toda escritura es una RPC (ninguna toca las tablas directo).

const COLUMNAS: Columna[] = [
  { titulo: "Orden" },
  { titulo: "Prendas", alinear: "der", clase: "hidden @min-[900px]:block" },
  { titulo: "Fase · quién la tiene" },
  { titulo: "En la fase", clase: "hidden @min-[900px]:block" },
  { titulo: "Entrega", clase: "hidden @min-[900px]:block" },
  { titulo: "Pide algo", clase: "hidden @min-[620px]:block" },
];

const FILTROS: { valor: FiltroDeLista; texto: string }[] = [
  { valor: "todas", texto: "Todas" },
  { valor: "afuera", texto: "Afuera" },
  { valor: "piden", texto: "Piden algo" },
  { valor: "listas", texto: "Listas para el stock" },
];

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
  consumosPorOrden,
  decision,
  ordenInicialId = null,
  nuevaInicial = null,
  sugeridaInicial = false,
  tipoInicial = "produccion",
  puedeEditarCatalogo = false,
  vocabulario = null,
  opcionesNuevaOrden = null,
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
  consumosPorOrden: Record<string, ConsumoDeOrden[]>;
  /** Solo el líder (F5): lo que aconseja la red al abrir una orden. */
  decision: Tolerado<DecisionProduccion> | null;
  /** Enlaces del Resumen (F6) y de la página de la orden: `?orden=<id>` abre su cajón; `?nueva=<modelo>` abre «Nueva orden» con el modelo elegido (`auto` = el primero). */
  ordenInicialId?: string | null;
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
}) {
  const [abiertaId, setAbiertaId] = useState<string | null>(ordenInicialId && ordenes.some((o) => o.id === ordenInicialId) ? ordenInicialId : null);
  const [nuevaAbierta, setNuevaAbierta] = useState(nuevaInicial !== null);
  // La sugerencia del Resumen se aplica UNA vez, a la apertura que vino por la URL: la URL no cambia al cerrar ni al guardar, así que sin esto cada «+ Nueva orden» la volvería a escribir.
  const [sugeridaPendiente, setSugeridaPendiente] = useState(sugeridaInicial);
  const [anulando, setAnulando] = useState<OrdenProduccion | null>(null);
  const [revirtiendo, setRevirtiendo] = useState<OrdenProduccion | null>(null);
  const [pestana, setPestana] = useState<PestanaLista>("en_curso");
  const [fase, setFase] = useState<FaseClave | null>(null);
  const [filtro, setFiltro] = useState<FiltroDeLista>("todas");
  const [texto, setTexto] = useState("");

  // Una orden abierta antes de las fases no trae ninguna: su lugar se lee de las etapas de siempre (las que ya traen `ordenes`).
  const filas = useMemo(() => {
    const etapas = new Map(ordenes.map((o) => [o.id, o.etapas] as const));
    return (lista?.filas ?? []).map((f) => conEtapasDeAntes(f, etapas.get(f.id)));
  }, [lista, ordenes]);
  // Para la lista de «Nueva orden»: cuántas órdenes abiertas tiene cada modelo y cuáles fueron los últimos (ADR-0396).
  const paraLaLista = useMemo(() => ordenesParaLaLista(ordenes), [ordenes]);
  const cifras = useMemo(() => cifrasHoyEnElTaller(filas), [filas]);
  const cuentas = useMemo(() => cuentasDePestanas(filas), [filas]);
  const visibles = useMemo(() => ordenarFilas(filtrarFilas(filas, { pestana, fase, filtro, texto }), pestana), [filas, pestana, fase, filtro, texto]);
  const porFiltro = useMemo(() => cuentasDeFiltros(filas, { pestana, fase, texto }), [filas, pestana, fase, texto]);
  const hayFiltro = fase !== null || filtro !== "todas" || texto.trim() !== "";
  const abierta = ordenes.find((o) => o.id === abiertaId && o.estado !== "anulada") ?? null;
  const primeraConPorque = visibles.find((f) => f.causas.length > 0)?.id ?? null;
  const pie = pieDeLaLista(visibles.length, pestana, hayFiltro);

  function quitarFiltros() {
    setFase(null);
    setFiltro("todas");
    setTexto("");
  }

  const nuevaOrden = (
    <Boton peso="primario" data-guia="prod-ordenes.nueva" onClick={() => setNuevaAbierta(true)}>
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
    cuerpo = (
      <div className="card-cayla">
        <Vacio icono={<Factory />} titulo="Todavía no se abrió ninguna orden" acciones={modelos.length > 0 ? nuevaOrden : null}>
          Una orden es un lote de un modelo: cuántas prendas por talla y color, quién hace cada fase y la tela que lleva. Ábrela aquí y la verás avanzar fase por fase.
        </Vacio>
      </div>
    );
  } else {
    cuerpo = (
      <>
        <section className="space-y-3">
          <TituloSeccion dato={datoHoyEnElTaller(filas)}>
            Hoy en el Taller
          </TituloSeccion>
          <div data-guia="prod-ordenes.cifras" className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(9.5rem, 1fr))" }}>
            {cifras.map((c, i) => (
              <TarjetaCifra
                key={c.clave}
                etiqueta={c.titulo}
                punto={c.lotes === 0 ? "neutro" : c.atencion ? "ambar" : "verde"}
                valor={<CifraQueCuenta valor={c.lotes} alMontar />}
                unidad={c.lotes === 1 ? "lote" : "lotes"}
                onClick={() => setFase((f) => (f === c.clave ? null : c.clave))}
                activa={fase === c.clave}
                className="anim-entra"
                style={{ ["--i" as string]: i }}
              >
                {c.contexto}
              </TarjetaCifra>
            ))}
            <TarjetaCifra
              etiqueta="Al stock este mes"
              punto="verde"
              valor={<CifraQueCuenta valor={lista.alStockMes.prendas} alMontar />}
              unidad={lista.alStockMes.prendas === 1 ? "prenda" : "prendas"}
              className="anim-entra"
              style={{ ["--i" as string]: cifras.length }}
            >
              {lista.alStockMes.lotes === 0 ? "ningún lote todavía" : `${lista.alStockMes.lotes} ${lista.alStockMes.lotes === 1 ? "lote" : "lotes"} que pasaron al stock del Taller`}
            </TarjetaCifra>
          </div>
        </section>

        <Tabla className="@container">
          <div className="space-y-3 p-4">
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
            <div className="flex flex-wrap items-center gap-x-3 gap-y-3">
              <div role="group" aria-label="Filtrar las órdenes" data-guia="prod-ordenes.filtros" className="flex flex-wrap gap-2">
                {FILTROS.filter((f) => f.valor === "todas" || f.valor === filtro || porFiltro[f.valor] > 0 || f.valor === "afuera").map((f) => (
                  <button key={f.valor} type="button" className="pildora-cayla" aria-pressed={filtro === f.valor} onClick={() => setFiltro(f.valor)}>
                    {f.texto}
                    <span className="ml-1.5 font-medium tracking-normal tabular-nums">{porFiltro[f.valor]}</span>
                  </button>
                ))}
              </div>
              <Buscador valor={texto} onCambio={setTexto} placeholder="Buscar por modelo, color u orden" atajo guia="prod-ordenes.buscador" className="ml-auto w-full @min-[620px]:w-80" />
            </div>
          </div>

          <div data-resultados>
            {visibles.length === 0 ? (
              hayFiltro ? (
                // El verbo es «Limpiar» + qué, nunca «Quitar filtros» (ADR-0358, accion.limpiar): si lo único puesto es la búsqueda, se borra la búsqueda.
                <Vacio
                  tamano="chico"
                  icono={<FunnelX />}
                  accion={{ texto: fase === null && filtro === "todas" ? "Borrar la búsqueda" : "Limpiar filtros", onClick: quitarFiltros }}
                  className="py-5"
                >
                  Ninguna orden coincide con lo que elegiste.
                </Vacio>
              ) : (
                <Vacio
                  tamano="chico"
                  icono={pestana === "muestras" ? <Shirt /> : <Scissors />}
                  accion={pestana === "en_curso" && modelos.length > 0 ? { texto: "Abrir una orden", onClick: () => setNuevaAbierta(true) } : undefined}
                  className="py-5"
                >
                  {pestana === "en_curso" ? "No hay órdenes en curso." : pestana === "muestras" ? "No hay muestras en desarrollo." : "Todavía no se cerró ninguna orden."}
                </Vacio>
              )
            ) : (
              <>
                <Encabezado visible="hidden @min-[620px]:grid" plantilla={PLANTILLA_LISTA} columnas={COLUMNAS} />
                {visibles.map((f, i) => (
                  <FilaDeOrden key={f.id} f={f} primera={i === 0} guiaPorque={f.id === primeraConPorque} onAbrirCajon={() => setAbiertaId(f.id)} />
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

        <p className="nota-cayla">
          Una orden se pone en <b>rojo solo por tres causas</b>: la entrega ya pasó, la tela no alcanza o lleva {DIAS_SIN_MOVERSE} días sin moverse. «¿Por qué?» te lo explica en una línea. Lo que está <b>afuera</b> aparece con el
          nombre de quien lo tiene y cuántas prendas.
        </p>
      </>
    );
  }

  return (
    <div className="space-y-6">
      <EncabezadoPagina sede={tallerNombre} titulo="Órdenes" subtitulo="Cada lote, en qué fase está y quién lo tiene. Toca uno para ver y anotar lo que terminaste." acciones={nuevaOrden} />

      {modelos.length === 0 && (
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

      {abierta && (
        <OrdenPanel
          key={abierta.id}
          orden={abierta}
          tallerId={tallerId}
          esLider={esLider}
          hoy={hoy}
          insumos={insumos}
          consumos={consumosPorOrden[abierta.id] ?? []}
          onCerrar={() => setAbiertaId(null)}
          onAnular={() => setAnulando(abierta)}
          onRevertir={() => setRevirtiendo(abierta)}
        />
      )}
      {nuevaAbierta && (
        <NuevaOrdenProduccionForm
          tallerId={tallerId}
          modelos={modelos}
          decision={decision}
          productoInicialId={nuevaInicial}
          sugeridaInicial={sugeridaPendiente}
          tipoInicial={tipoInicial}
          puedeEditarCatalogo={puedeEditarCatalogo}
          vocabulario={vocabulario}
          opciones={opcionesNuevaOrden}
          insumos={insumos}
          hoy={hoy}
          abiertas={paraLaLista.abiertas}
          recientes={paraLaLista.recientes}
          onClose={() => {
            setNuevaAbierta(false);
            setSugeridaPendiente(false);
          }}
        />
      )}
      {anulando && <AnularOrdenModal orden={anulando} consumos={consumosPorOrden[anulando.id] ?? []} onClose={() => setAnulando(null)} />}
      {revirtiendo && <RevertirOrdenModal orden={revirtiendo} onClose={() => setRevirtiendo(null)} />}
    </div>
  );
}
