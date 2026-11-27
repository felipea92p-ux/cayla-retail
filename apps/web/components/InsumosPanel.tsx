"use client";

import { useState } from "react";
import { ArrowLeftRight, ChevronRight, Layers, Package, SearchX } from "lucide-react";
import { Ayuda } from "@/components/Ayuda";
import { BarraAvance, type TonoBarraAvance } from "@/components/ui/BarraAvance";
import { soles } from "@/lib/compras-reglas";
import { diaLima, hoyLima } from "@/lib/fechas-lima";
import { Boton } from "@/components/ui/campos";
import { Buscador } from "@/components/ui/Buscador";
import { Chip, type TonoChip } from "@/components/ui/Chip";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { MenuAcciones } from "@/components/ui/MenuAcciones";
import { ParDato, Pares } from "@/components/ui/ParDato";
import { Pestanas } from "@/components/ui/Pestanas";
import { Encabezado, Tabla, celda, fila } from "@/components/ui/Tabla";
import { BotonVerMas, FilasDeMas } from "@/components/ui/VerMas";
import { IngresarInsumoModal } from "@/components/InsumoModales";
import type { ProveedorParaCompra } from "@/components/insumos-taller/CompraDelInsumo";
import { AjustarLoteModal } from "@/components/insumos-taller/AjustarLoteModal";
import { LlegoUnaCompraModal } from "@/components/insumos-taller/LlegoUnaCompraModal";
import { ProveedorDelLoteModal } from "@/components/insumos-taller/ProveedorDelLoteModal";
import { CorregirIngresoModal } from "@/components/insumos-taller/CorregirIngresoModal";
import { EditarTelaModal } from "@/components/insumos-taller/EditarTelaModal";
import { FichaDeLaTelaModal } from "@/components/insumos-taller/FichaDeLaTelaModal";
import { RestaurarIngresoModal } from "@/components/insumos-taller/RestaurarIngresoModal";
import { RetirarColorModal } from "@/components/insumos-taller/RetirarColorModal";
import { NuevaTelaModal } from "@/components/insumos-taller/NuevaTelaModal";
import { NuevoAvioModal } from "@/components/insumos-taller/NuevoAvioModal";
import type { ClaseDeAvio } from "@/lib/avio-clases-reglas";
import type { ColorAlta } from "@/lib/alta-producto";
import { fichaDeLaTela, type VocabularioDeTelas } from "@/lib/insumos-ficha-reglas";
import {
  TIPOS_INSUMO,
  UNIDADES_INSUMO,
  cantidadTexto,
  loteMasAntiguoConSaldo,
  textoDeMovimiento,
  tramoDeSaldo,
  type EstadoInsumo,
  type LoteConSaldo,
  type MaterialVista,
  type TipoInsumo,
} from "@/lib/insumos-reglas";
import {
  alcanzaPara,
  coincideConBusqueda,
  costoPor,
  detalleDeLote,
  diaEnPalabras,
  fichaParaLeer,
  insigniasDeLaTela,
  insumosPorAcabarse,
  minimoTexto,
  nombreDeInsumoParaLeer,
  tarjetasDeInsumos,
  textoDeLlegoMas,
  tituloDeEliminado,
  tituloDeLote,
  tituloDeTarjeta,
} from "@/lib/insumos-vista";
import type { IngresoEliminado, InsumoVista, InsumosDelTaller } from "@/lib/insumos";
import { LapizEditar } from "@/components/ui/BotonEditar";
import { coloresConNombreDesfasado } from "@/lib/editar-tela-reglas";
import { costoUnitarioTexto } from "@/lib/monto-plata-reglas";
import { Vacio } from "@/components/ui/Vacio";
import { Aviso } from "@/components/ui/Aviso";
import { EnlaceVer } from "@/components/ui/EnlaceVer";
import type { AvisoDeTelaCortada } from "@/lib/telas-cortadas-sin-anotar-reglas";
import { TituloGrupo, TituloSeccion } from "@/components/ui/TituloSeccion";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";

// Insumos del Taller (ADR-0133, F3): tela y avíos. Lo que hay por lote, cuánto dura y qué falta. El saldo es la suma del
// ledger, nunca un número que alguien edite; por eso el libro de movimientos solo se agrega, no se corrige. Los costos de
// cada lote los ve quien ve Producción parado en el Taller (Felipe, 2026-10-15, ADR-0400 actividad 6: `veCostos`); el VALOR
// total de lo guardado (el capital en insumos) es una cifra del líder y no es de portada: se pide con un toque (ADR-0400,
// «Pantallas» punto 4). Crear el catálogo, ingresar lotes y completar la ficha de una tela (tejido y color, de donde
// «Nueva orden» saca su sugerencia) siguen siendo del líder.
//
// «Producción más clara» (Felipe 2026-11-26; maqueta docs/maquetas/produccion-resumen-2026-11/): la pantalla se lee de arriba
// abajo sin saber nada. Arriba, tres acciones («Llegó una compra», «Nueva tela o avío» y «Más»); después «Por acabarse», lo que
// hoy pide comprar, con su botón; después las pestañas «Telas | Avíos | Movimientos» con su buscador, y una tarjeta por tela con
// una fila por color. Cada dato es una pieza con su nombre (rótulo arriba y valor abajo, o una insignia): nunca una línea de
// datos separados por un punto. El código de cada insumo ya no va a la vista. No cambia quién puede qué ni lo que se guarda.

type Vista = TipoInsumo | "movimientos";

/** Cuántos «Por acabarse» se ven de entrada: dos filas de dos. Los demás bajan con «Ver N más». */
const POR_ACABARSE_A_LA_VISTA = 4;

/** Las columnas de un color cuando la tarjeta es ancha: Color, Cuánto queda (la barra), Quedan, Alcanza para, Estado y la flecha. Angosta, la fila se apila. */
const COLUMNAS_COLOR = "@min-[48rem]:grid-cols-[minmax(0,1.1fr)_minmax(0,1.5fr)_7rem_9.5rem_9.5rem_1.25rem]";
/** El ancla de cada pestaña para la guía interactiva (ADR-0389). Con la forma `{ guia: "…" }` para que el escáner de las guías (`guias/escaner.mjs`) la lea, como en `LoDemasEnOrden`. */
const GUIA_DE_PESTANA: Record<TipoInsumo, { guia: string }> = { tela: { guia: "prod-insumos.pestana-telas" }, avio: { guia: "prod-insumos.pestana-avios" } };
/** Las columnas de «Movimientos». */
const COLUMNAS_LIBRO = "sm:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_9rem_8rem_8rem_7rem]";

/** El tejido de una tela con su nombre (el del vocabulario de Catálogo); `null` si no se dijo. */
const vocabularioTejido = (v: VocabularioDeTelas, m: MaterialVista): string | null => (m.tejidoId ? (v.tejidos.find((t) => t.id === m.tejidoId)?.nombre ?? null) : null);

const TONO_ESTADO: Record<EstadoInsumo["tono"], TonoChip> = { sin_saldo: "rojo", bajo: "ambar", bien: "verde", sin_minimo: "neutro" };
// La barra de avance del sistema (ronda 13): en tinta; el rojo y el ámbar los pone el estado del insumo (sin saldo, bajo el mínimo).
const TONO_RIEL: Record<EstadoInsumo["tono"], TonoBarraAvance> = { sin_saldo: "rojo", bajo: "ambar", bien: "tinta", sin_minimo: "tinta" };

export function InsumosPanel({
  sede,
  datos,
  tallerId,
  proveedores = [],
  esLider,
  veCostos,
  vocabulario,
  leyoVocabulario,
  colores,
  leyoColores,
  clases,
  leyoClases,
  avisosDeTela = [],
}: {
  /** La sede de la línea de arriba de la cabecera (el Taller). */
  sede: string;
  datos: InsumosDelTaller;
  tallerId: string;
  /** A quién se le puede comprar (solo el líder los lee): «Llegó una compra» pide proveedor (P03). */
  proveedores?: readonly ProveedorParaCompra[];
  esLider: boolean;
  /** Quien ve Producción en el Taller ve el costo de cada lote (no el capital). */
  veCostos: boolean;
  vocabulario: VocabularioDeTelas;
  /** `false`: no se pudieron leer los tejidos y los colores; la ficha lo dice. */
  leyoVocabulario: boolean;
  /** La carta de colores de Catálogo, para «Nueva tela» y «Nuevo avío» (ADR-0554, ADR-0580). */
  colores: ColorAlta[];
  leyoColores: boolean;
  /** Las clases de avío (ADR-0580): de ellas salen la unidad que se propone, si lleva color y qué medida se pide. */
  clases: ClaseDeAvio[];
  leyoClases: boolean;
  /** Las órdenes que ya cortaron con una tela que hay en el estante y todavía no la anotaron (`avisosDeTelaCortada`); vacío si la base no lo dice. */
  avisosDeTela?: AvisoDeTelaCortada[];
}) {
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});
  // «Nuevo avío»: abierta para crear uno (`agregarA: null`) o para sumarle colores a uno que ya existe, igual que la de tela (ADR-0580).
  const [nuevoAvio, setNuevoAvio] = useState<{ agregarA: MaterialVista | null } | null>(null);
  // «Nueva tela»: abierta para crear una (`agregarA: null`) o para sumarle colores a una que ya existe.
  const [nuevaTela, setNuevaTela] = useState<{ agregarA: MaterialVista | null } | null>(null);
  const [ingresando, setIngresando] = useState<{ insumoId: string | null } | null>(null);
  const [comprando, setComprando] = useState<{ insumoId: string | null } | null>(null);
  const [fichando, setFichando] = useState<InsumoVista | null>(null);
  // «Retirar color» (solo el líder): el color de tela que se está retirando de la lista.
  const [retirando, setRetirando] = useState<InsumoVista | null>(null);
  // «Corregir este ingreso» y «Restaurar» (solo el líder): el ingreso de un color que se está corrigiendo, o el eliminado que se está restaurando (ADR-0570).
  const [corrigiendo, setCorrigiendo] = useState<{ insumo: InsumoVista; lote: LoteConSaldo } | null>(null);
  const [ajustando, setAjustando] = useState<{ insumo: InsumoVista; lote: LoteConSaldo } | null>(null);
  const [nombrando, setNombrando] = useState<{ insumo: InsumoVista; lote: LoteConSaldo } | null>(null);
  const [restaurando, setRestaurando] = useState<{ insumo: InsumoVista; eliminado: IngresoEliminado } | null>(null);
  // «Editar tela» (solo el líder): la tela que se está corrigiendo y cuántos colores le llegan los cambios.
  const [editandoTela, setEditandoTela] = useState<{ material: MaterialVista; colores: number; desfasados: number } | null>(null);
  const [verCapital, setVerCapital] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [verTodoLoQueSeAcaba, setVerTodoLoQueSeAcaba] = useState(false);

  const { insumos, libro, capital, eliminados } = datos;
  const hoy = hoyLima();
  const [vista, setVista] = useState<Vista>(() => (insumos.some((i) => i.tipo === "tela") || !insumos.some((i) => i.tipo === "avio") ? "tela" : "avio"));

  const materialDe = (i: InsumoVista) => (i.materialId ? (datos.materiales.find((m) => m.id === i.materialId) ?? null) : null);
  // El buscador filtra en el navegador, por el nombre de la tela o del avío y por el del color (sin tildes ni mayúsculas).
  const encontrados = insumos.filter((i) => coincideConBusqueda(busqueda, i.nombre, materialDe(i)?.nombre, fichaDeLaTela(i, vocabulario).color?.nombre));
  const movimientos = libro.filter((m) => coincideConBusqueda(busqueda, m.insumo));
  const deLaVista = vista === "movimientos" ? [] : encontrados.filter((i) => i.tipo === vista);
  const tarjetas = vista === "movimientos" ? [] : tarjetasDeInsumos(deLaVista, datos.materiales);
  const porAcabarse = insumosPorAcabarse(insumos);
  const primeraTelaId = vista === "tela" ? (tarjetas.find((t) => t.material)?.material?.id ?? null) : null;
  let indice = 0;

  const pideCompra = (i: InsumoVista, k: number) => (
    <article key={i.id} className="insumos-placa insumo-por-acabarse @container">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 px-5 py-4 @min-[30rem]:grid-cols-[auto_minmax(0,1fr)_auto]">
        <span aria-hidden className="vd-lente grid size-11 place-items-center rounded-full text-tinta">
          {i.tipo === "tela" ? <Layers className="h-5 w-5" /> : <Package className="h-5 w-5" />}
        </span>
        <div className="min-w-0">
          <p className="text-lg font-semibold leading-snug text-tinta">{nombreDeInsumoParaLeer(i)}</p>
          <Pares className="mt-2">
            <ParDato rotulo="Quedan" tono="ambar">
              {cantidadTexto(i.saldo, i.unidad)}
            </ParDato>
            {i.minimo !== null && <ParDato rotulo="Lo mínimo es">{cantidadTexto(i.minimo, i.unidad)}</ParDato>}
            {i.saldo > 0 && alcanzaPara(i.semanas, i.saldo) !== null && <ParDato rotulo="Alcanza para">{alcanzaPara(i.semanas, i.saldo)}</ParDato>}
          </Pares>
        </div>
        {esLider && (
          <Boton peso="fantasma" className="col-span-2 @min-[30rem]:col-span-1" data-guia={k === 0 ? "prod-insumos.anotar-compra" : undefined} aria-haspopup="dialog" onClick={() => setComprando({ insumoId: i.id })}>
            Anotar compra
          </Boton>
        )}
      </div>
    </article>
  );

  return (
    <div className="space-y-6">
      {/* La cabecera de todo el ERP menos Finanzas (ADR-0358, Felipe 2026-10-14). Tres acciones: la compra (la de todos los días, solo del líder), crear una tela o un avío, y lo que casi nunca se usa, en «Más». */}
      <EncabezadoPagina
        sede={sede}
        titulo="Insumos"
        subtitulo="Tela y avíos del Taller: lo que hay, para cuánto alcanza y qué pedir."
        acciones={
          <>
            {/* «Lo que ya tenías» (el saldo inicial) mete dinero: es del líder. */}
            {esLider && (
              <MenuAcciones
                texto="Más"
                etiqueta="Más acciones de Insumos"
                guia="prod-insumos.mas"
                items={[{ clave: "saldo", etiqueta: "Lo que ya tenías", guia: "prod-insumos.ya-tenias", onSelect: () => setIngresando({ insumoId: null }), motivo: insumos.length === 0 ? "Primero crea una tela o un avío." : undefined }]}
              />
            )}
            {/* Quien ve Producción en el Taller crea telas y colores (ADR-0554, decisión 3) y avíos (ADR-0580, decisión 3 de Felipe). Sin las telas en la base (`hayTelas`) solo se ofrece el avío, como antes. */}
            {datos.hayTelas ? (
              <MenuAcciones
                texto="Nueva tela o avío"
                etiqueta="Crear una tela o un avío"
                guia="prod-insumos.nuevo"
                items={[
                  { clave: "tela", etiqueta: "Nueva tela", guia: "prod-insumos.nueva-tela", onSelect: () => setNuevaTela({ agregarA: null }) },
                  { clave: "avio", etiqueta: "Nuevo avío", guia: "prod-insumos.nuevo-avio", onSelect: () => setNuevoAvio({ agregarA: null }) },
                ]}
              />
            ) : (
              <Boton peso="fantasma" data-guia="prod-insumos.nuevo" onClick={() => setNuevoAvio({ agregarA: null })}>
                + Nuevo avío
              </Boton>
            )}
            {esLider && (
              <Boton peso="primario" data-guia="prod-insumos.comprar" onClick={() => setComprando({ insumoId: null })} disabled={insumos.length === 0}>
                Llegó una compra
              </Boton>
            )}
          </>
        }
      />

      {/* Una orden ya cortó con una tela que acaba de entrar al estante y su libro no la descontó: se dice aquí, donde la persona la carga (ADR-0570, actividad 4). */}
      {avisosDeTela.map((a) => (
        <Aviso key={a.produccionId} tono="atencion" titulo={a.titulo} accion={<EnlaceVer href={a.href}>Ir a la {a.numeroTexto}</EnlaceVer>}>
          {a.texto}
        </Aviso>
      ))}

      {insumos.length === 0 ? (
        <div className="card-cayla">
          <Vacio
            guia="prod-insumos.lista"
            icono={<Layers />}
            titulo="Todavía no hay insumos"
            acciones={
              <Boton peso="primario" onClick={() => setNuevaTela({ agregarA: null })}>
                Crear la primera tela
              </Boton>
            }
          >
            Empieza por tu primera tela.
          </Vacio>
        </div>
      ) : (
        <>
          {/* ==================== por acabarse: lo que hoy pide comprar ==================== */}
          {porAcabarse.length > 0 && (
            <section data-guia="prod-insumos.por-acabarse" className="space-y-3">
              <TituloSeccion cuenta={porAcabarse.length} ayuda="Lo que ya se acabó o quedó por debajo de su mínimo. El mínimo de cada color se pone al crearlo, en «Avísame si baja de».">
                Por acabarse
              </TituloSeccion>
              <div className="grid gap-3 lg:grid-cols-2">{porAcabarse.slice(0, POR_ACABARSE_A_LA_VISTA).map(pideCompra)}</div>
              {porAcabarse.length > POR_ACABARSE_A_LA_VISTA && (
                <>
                  <FilasDeMas abierto={verTodoLoQueSeAcaba} id="insumos-por-acabarse-mas">
                    <div className="grid gap-3 lg:grid-cols-2">{porAcabarse.slice(POR_ACABARSE_A_LA_VISTA).map((i, k) => pideCompra(i, k + POR_ACABARSE_A_LA_VISTA))}</div>
                  </FilasDeMas>
                  <BotonVerMas forma="enlace" abierto={verTodoLoQueSeAcaba} onCambiar={setVerTodoLoQueSeAcaba} texto={`Ver ${porAcabarse.length - POR_ACABARSE_A_LA_VISTA} más`} controla="insumos-por-acabarse-mas" />
                </>
              )}
            </section>
          )}

          {/* ==================== qué se mira: telas, avíos o movimientos; el buscador y, para el líder, lo que vale lo guardado ==================== */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3 pt-2">
            <Pestanas
              guia="prod-insumos.pestanas"
              etiquetaAccesible="Qué ver de los insumos"
              idIndicador="insumos"
              activa={vista}
              onCambio={(clave) => setVista(clave as Vista)}
              items={[
                ...TIPOS_INSUMO.map((t) => ({ clave: t.valor, etiqueta: t.plural, conteo: encontrados.filter((i) => i.tipo === t.valor).length, ayuda: t.ayuda, guia: GUIA_DE_PESTANA[t.valor].guia })),
                { clave: "movimientos", etiqueta: "Movimientos", ayuda: "Lo que entró y lo que salió, del más reciente al más viejo.", guia: "prod-insumos.pestana-movimientos" },
              ]}
            />
            <Buscador guia="prod-insumos.buscar" className="w-full sm:w-72" valor={busqueda} onCambio={setBusqueda} placeholder={vista === "avio" ? "Buscar un avío o un color" : vista === "movimientos" ? "Buscar en los movimientos" : "Buscar una tela o un color"} />
            {/* Lo que vale lo guardado es dinero que el líder mira cuando lo necesita, no una cifra de portada (ADR-0400, «Pantallas» punto 4): entra oculto y se pide con un toque. */}
            {esLider && capital !== null && (
              <span data-guia="prod-insumos.capital" className="sm:ml-auto sm:text-right">
                <ParDato
                  grande
                  rotulo={
                    <>
                      Valor de lo guardado
                      <Ayuda titulo="Valor de lo guardado">Lo que costó la tela y los avíos que quedan en el Taller, cada uno al costo con que entró.</Ayuda>
                    </>
                  }
                >
                  {verCapital ? (
                    <>
                      {soles(capital)}
                      <button type="button" className="btn-enlace ml-2.5 text-detalle font-normal" onClick={() => setVerCapital(false)}>
                        Ocultar
                      </button>
                    </>
                  ) : (
                    <button type="button" className="btn-enlace text-sm font-normal" aria-label="Mostrar el valor de lo guardado" onClick={() => setVerCapital(true)}>
                      Mostrar
                    </button>
                  )}
                </ParDato>
              </span>
            )}
          </div>

          {vista === "movimientos" ? (
            /* ==================== movimientos: el libro, a todo el ancho ==================== */
            <Tabla guia="prod-insumos.libro" className="anim-entra">
              <Encabezado plantilla={COLUMNAS_LIBRO} columnas={[{ titulo: "Qué pasó" }, { titulo: "Tela o avío" }, { titulo: "Orden" }, { titulo: "Lote" }, { titulo: "Día" }, { titulo: "Cantidad", alinear: "der" }]} />
              {movimientos.length === 0 ? (
                busqueda.trim() !== "" ? (
                  <Vacio tamano="chico" icono={<SearchX />} accion={{ texto: "Borrar la búsqueda", onClick: () => setBusqueda("") }}>
                    Ningún movimiento de <b>«{busqueda.trim()}»</b>.
                  </Vacio>
                ) : (
                  <Vacio tamano="chico" icono={<ArrowLeftRight />}>
                    Todavía no se movió nada.
                  </Vacio>
                )
              ) : (
                movimientos.map((m) => {
                  const entra = m.tipo === "compra" || m.tipo === "devolucion" || (m.tipo === "ajuste" && m.cantidad > 0);
                  const dia = diaLima(m.creadoEn);
                  return (
                    <div key={m.id} role="row" className={fila(COLUMNAS_LIBRO)}>
                      <span className={celda("izq", "text-sm font-semibold text-tinta")}>{textoDeMovimiento(m)}</span>
                      <span className={celda("izq", "text-sm text-tinta")}>{nombreDeInsumoParaLeer({ nombre: m.insumo, materialId: insumos.find((i) => i.id === m.insumoId)?.materialId })}</span>
                      <span className={celda("izq", "text-detalle text-secundario")}>{m.orden}</span>
                      <span className={celda("izq", "font-mono text-detalle text-secundario")}>{m.lote}</span>
                      <span className={celda("izq", "text-detalle text-secundario")}>{dia ? diaEnPalabras(dia, hoy) : null}</span>
                      <span className={celda("der")}>
                        <span data-sentido={entra ? "entra" : "sale"} className={`insumos-libro-cantidad inline-block whitespace-nowrap text-detalle font-medium tabular-nums ${entra ? "text-verde-profundo" : "text-tinta"}`}>
                          {entra ? "+" : "−"}
                          {cantidadTexto(Math.abs(m.cantidad), m.unidad)}
                        </span>
                      </span>
                    </div>
                  );
                })
              )}
            </Tabla>
          ) : tarjetas.length === 0 ? (
            <div className="insumos-placa">
              {busqueda.trim() !== "" ? (
                <Vacio guia="prod-insumos.lista" icono={<SearchX />} titulo={`Nada con «${busqueda.trim()}»`} accion={{ texto: "Borrar la búsqueda", onClick: () => setBusqueda("") }}>
                  {vista === "tela" ? "Ninguna tela ni color se llama así." : "Ningún avío ni color se llama así."}
                </Vacio>
              ) : (
                <Vacio
                  guia="prod-insumos.lista"
                  icono={vista === "tela" ? <Layers /> : <Package />}
                  titulo={vista === "tela" ? "Todavía no hay telas" : "Todavía no hay avíos"}
                  acciones={
                    vista === "avio" || datos.hayTelas ? (
                      <Boton peso="primario" onClick={() => (vista === "tela" ? setNuevaTela({ agregarA: null }) : setNuevoAvio({ agregarA: null }))}>
                        {vista === "tela" ? "Crear una tela" : "Crear un avío"}
                      </Boton>
                    ) : undefined
                  }
                />
              )}
            </div>
          ) : (
            /* ==================== una tarjeta por tela (o por avío), una fila por color ==================== */
            <div data-guia="prod-insumos.lista" className="space-y-4">
              {tarjetas.map((t) => {
                const material = t.material;
                const esTela = vista === "tela";
                return (
                  <section key={material?.id ?? "sueltos"} className="insumos-placa @container">
                    {/* Lo de la tela se dice una vez, arriba: su nombre, sus insignias (tejido, de qué está hecha, cómo se compra) y lo que se le puede hacer. */}
                    <div data-guia={material && material.id === primeraTelaId ? "prod-insumos.tela" : undefined} className="insumos-placa-cabecera flex flex-wrap items-center gap-x-3 gap-y-2 px-5 pb-3.5 pt-4">
                      <TituloSeccion nivel={3}>{tituloDeTarjeta(t, vista, tarjetas.length > 1)}</TituloSeccion>
                      {material &&
                        insigniasDeLaTela(material, vocabularioTejido(vocabulario, material)).map((texto) => (
                          <Chip key={texto} versalitas={false}>
                            {texto}
                          </Chip>
                        ))}
                      {material && esTela && (
                        <span className="flex items-center gap-1 @max-[36rem]:w-full @min-[36rem]:ml-auto">
                          <Boton peso="fantasma" className="!px-3 !py-2" data-guia={material.id === primeraTelaId ? "prod-insumos.agregar-colores" : undefined} aria-haspopup="dialog" onClick={() => setNuevaTela({ agregarA: material })}>
                            + Agregar colores
                          </Boton>
                          {esLider && (
                            <LapizEditar
                              que={`la tela ${material.nombre}`}
                              guia={material.id === primeraTelaId ? "prod-insumos.editar-tela" : undefined}
                              onClick={() => {
                                // Todos los colores de la tela, no solo los que el buscador deja a la vista: los cambios le llegan a todos.
                                const susColores = insumos.filter((i) => i.materialId === material.id);
                                setEditandoTela({ material, colores: susColores.length, desfasados: coloresConNombreDesfasado(material, susColores, vocabulario) });
                              }}
                            />
                          )}
                        </span>
                      )}
                    </div>
                    <Encabezado
                      visible="hidden @min-[48rem]:grid"
                      plantilla={COLUMNAS_COLOR}
                      columnas={[{ titulo: material ? "Color" : esTela ? "Tela" : "Avío" }, { titulo: "Cuánto queda" }, { titulo: "Quedan", alinear: "der" }, { titulo: "Alcanza para" }, { titulo: "Estado" }, { titulo: "" }]}
                    />
                    {t.insumos.map((i) => (
                      <FilaInsumo
                        key={i.id}
                        insumo={i}
                        conFicha={material !== null}
                        indice={indice++}
                        hoy={hoy}
                        esLider={esLider}
                        veCostos={veCostos}
                        vocabulario={vocabulario}
                        abierto={!!abiertos[i.id]}
                        onAlternar={() => setAbiertos((a) => ({ ...a, [i.id]: !a[i.id] }))}
                        onIngresar={() => setComprando({ insumoId: i.id })}
                        onFicha={() => setFichando(i)}
                        onRetirar={() => setRetirando(i)}
                        ingresosEditables={datos.ingresosEditables}
                        eliminados={eliminados.filter((e) => e.insumoId === i.id)}
                        onCorregir={(lote) => setCorrigiendo({ insumo: i, lote })}
                        onAjustar={(lote) => setAjustando({ insumo: i, lote })}
                        onNombrar={proveedores.length > 0 ? (lote) => setNombrando({ insumo: i, lote }) : undefined}
                        onRestaurar={(eliminado) => setRestaurando({ insumo: i, eliminado })}
                      />
                    ))}
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}

      {nuevoAvio && (
        <NuevoAvioModal
          key={nuevoAvio.agregarA?.id ?? "nuevo"}
          tallerId={tallerId}
          materiales={datos.materiales}
          clases={clases}
          leyoClases={leyoClases}
          colores={colores}
          leyoColores={leyoColores}
          puedeSaldo={esLider}
          agregarA={nuevoAvio.agregarA}
          coloresDelAvio={insumos.filter((i) => i.materialId && i.materialId === nuevoAvio.agregarA?.id && i.colorCodigo).map((i) => i.colorCodigo as string)}
          alElegirExistente={(m) => setNuevoAvio({ agregarA: m })}
          onClose={() => setNuevoAvio(null)}
        />
      )}
      {nuevaTela && (
        <NuevaTelaModal
          key={nuevaTela.agregarA?.id ?? "nueva"}
          tallerId={tallerId}
          materiales={datos.materiales}
          vocabulario={vocabulario}
          leyoVocabulario={leyoVocabulario}
          colores={colores}
          leyoColores={leyoColores}
          puedeSaldo={esLider}
          agregarA={nuevaTela.agregarA}
          coloresDeLaTela={insumos.filter((i) => i.materialId && i.materialId === nuevaTela.agregarA?.id && i.colorCodigo).map((i) => i.colorCodigo as string)}
          alElegirExistente={(m) => setNuevaTela({ agregarA: m })}
          onClose={() => setNuevaTela(null)}
        />
      )}
      {editandoTela && (
        <EditarTelaModal
          key={editandoTela.material.id}
          material={editandoTela.material}
          cuantosColores={editandoTela.colores}
          coloresDesfasados={editandoTela.desfasados}
          tallerId={tallerId}
          vocabulario={vocabulario}
          leyoVocabulario={leyoVocabulario}
          onClose={() => setEditandoTela(null)}
        />
      )}
      {fichando && <FichaDeLaTelaModal insumo={fichando} vocabulario={vocabulario} leyo={leyoVocabulario} onClose={() => setFichando(null)} />}
      {retirando && <RetirarColorModal key={retirando.id} insumo={retirando} tallerId={tallerId} onClose={() => setRetirando(null)} />}
      {ajustando && <AjustarLoteModal key={ajustando.lote.id} insumo={ajustando.insumo} lote={ajustando.lote} onClose={() => setAjustando(null)} />}
      {nombrando && <ProveedorDelLoteModal key={nombrando.lote.id} insumo={nombrando.insumo} lote={nombrando.lote} proveedores={proveedores} onClose={() => setNombrando(null)} />}
      {corrigiendo && <CorregirIngresoModal key={corrigiendo.lote.id} insumo={corrigiendo.insumo} lote={corrigiendo.lote} veCostos={veCostos} onClose={() => setCorrigiendo(null)} />}
      {restaurando && <RestaurarIngresoModal key={restaurando.eliminado.loteId} insumo={restaurando.insumo} eliminado={restaurando.eliminado} onClose={() => setRestaurando(null)} />}
      {ingresando && <IngresarInsumoModal insumos={insumos} insumoInicialId={ingresando.insumoId} tallerId={tallerId} onClose={() => setIngresando(null)} />}
      {comprando && <LlegoUnaCompraModal insumos={insumos} materiales={datos.materiales} insumoInicialId={comprando.insumoId} tallerId={tallerId} proveedores={proveedores} onClose={() => setComprando(null)} />}
    </div>
  );
}

function FilaInsumo({
  insumo: i,
  conFicha,
  indice,
  hoy,
  esLider,
  veCostos,
  vocabulario,
  abierto,
  onAlternar,
  onIngresar,
  onFicha,
  onRetirar,
  ingresosEditables,
  eliminados,
  onCorregir,
  onAjustar,
  onNombrar,
  onRestaurar,
}: {
  insumo: InsumoVista;
  /** Va dentro de la tarjeta de su tela (o de su avío): la fila se llama por su color. Suelto, por su nombre, con lo que diga su ficha debajo. */
  conFicha: boolean;
  indice: number;
  /** El día de hoy en Lima (`aaaa-mm-dd`): las fechas dicen su año solo si no es este. */
  hoy: string;
  esLider: boolean;
  veCostos: boolean;
  vocabulario: VocabularioDeTelas;
  abierto: boolean;
  onAlternar: () => void;
  onIngresar: () => void;
  onFicha: () => void;
  onRetirar: () => void;
  /** La base ya sabe corregir y eliminar un ingreso: sin ella no se ofrece el lápiz. */
  ingresosEditables: boolean;
  /** Los ingresos de este color que se eliminaron por error (solo los ve el líder). */
  eliminados: IngresoEliminado[];
  onCorregir: (lote: LoteConSaldo) => void;
  /** Un lote ya usado: lo que entró no se cambia, se ajusta lo que queda (ADR-0614, actividad 7). */
  onAjustar: (lote: LoteConSaldo) => void;
  /** Un lote de compra sin proveedor: decir a quién se le compró (ADR-0614, actividad 6). */
  onNombrar?: (lote: LoteConSaldo) => void;
  onRestaurar: (eliminado: IngresoEliminado) => void;
}) {
  const { llenado, marcaMinimo } = tramoDeSaldo(i.saldo, i.minimo);
  const primero = loteMasAntiguoConSaldo(i.lotes);
  const lotes = [...i.lotes].sort((a, b) => a.ingreso.localeCompare(b.ingreso) || a.creadoEn.localeCompare(b.creadoEn));
  const ficha = fichaDeLaTela(i, vocabulario);
  const alcanza = alcanzaPara(i.semanas, i.saldo);
  const conLapiz = esLider && ingresosEditables;

  return (
    <article data-guia="prod-insumos.fila" data-abierto={abierto ? "" : undefined} className="insumo-fila card-cayla anim-entra overflow-hidden" style={{ ["--i" as string]: 2 + indice }}>
      <button
        type="button"
        data-guia={indice === 0 ? "prod-insumos.fila-cabecera" : undefined}
        onClick={onAlternar}
        aria-expanded={abierto}
        className={`insumo-fila-cabecera grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2.5 px-5 py-3.5 text-left outline-none focus-visible:bg-tinta/[0.03] ${COLUMNAS_COLOR}`}
      >
        {/* De qué color es (y, en un insumo suelto, lo que diga su ficha: sin tejido ni color «Nueva orden» no puede proponer la tela del color de la prenda). */}
        <span data-guia={indice === 0 ? "prod-insumos.ficha" : undefined} className="flex min-w-0 items-center gap-3">
          {ficha.color && <span aria-hidden data-color-dato className="size-5 shrink-0 rounded-full border border-tinta/20" style={ficha.color.hex ? { backgroundColor: ficha.color.hex } : undefined} />}
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-tinta">{conFicha ? (ficha.color?.nombre ?? "Sin color") : i.nombre}</span>
            {/* La ficha vacía («Sin tejido ni color») es lo que falta completar: no se escribe más tenue que esto (Formidable de Producción, H11; lo lee `lib/servicios-tarifas-ancho.test.ts`). */}
            {!conFicha && <span className={`block truncate text-detalle ${ficha.tejido === null && ficha.color === null ? "text-tinta/70" : "text-tenue"}`}>{fichaParaLeer(ficha, i.tipo)}</span>}
          </span>
        </span>
        <span className="order-3 col-span-2 min-w-0 @min-[48rem]:order-none @min-[48rem]:col-span-1">
          {/* Sin mínimo no hay contra qué medir: la barra se llenaba entera con 1 m de tela y mentía (P10 del análisis del Taller, 2026-11-02). */}
          {marcaMinimo !== null && <BarraAvance pct={llenado * 100} tono={TONO_RIEL[i.estado.tono]} marca={marcaMinimo * 100} decorativa indice={indice} />}
          <span className={`${marcaMinimo !== null ? "mt-1.5 " : ""}block text-xs text-tenue`}>{minimoTexto(i.minimo, i.unidad)}</span>
        </span>
        <span className="order-5 whitespace-nowrap text-right font-display text-2xl leading-none tabular-nums text-tinta @min-[48rem]:order-none">
          <CifraQueCuenta valor={i.saldo} decimales={UNIDADES_INSUMO[i.unidad].vista} />
          <small className="ml-1 font-sans text-detalle text-tenue">{UNIDADES_INSUMO[i.unidad].corta}</small>
        </span>
        <span className="order-4 min-w-0 text-sm text-tinta @min-[48rem]:order-none">
          {alcanza === null ? (
            <span aria-hidden className="hidden text-tenue @min-[48rem]:inline">
              —
            </span>
          ) : (
            <>
              <span className="text-tenue @min-[48rem]:hidden">Alcanza para </span>
              {alcanza}
            </>
          )}
        </span>
        <span className="order-2 justify-self-end @min-[48rem]:order-none @min-[48rem]:justify-self-start">
          <Chip tono={TONO_ESTADO[i.estado.tono]}>{i.estado.etiqueta}</Chip>
        </span>
        <ChevronRight aria-hidden className={`hidden h-4 w-4 text-tenue transition-transform duration-300 ease-cayla @min-[48rem]:block ${abierto ? "rotate-90" : ""}`} />
      </button>

      {/* Se abre por `grid-template-rows` (ADR-0128): sin medir alturas, sin salto. */}
      <div className={`grid transition-[grid-template-rows] duration-300 ease-cayla ${abierto ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`} inert={!abierto}>
        <div className="min-h-0 overflow-hidden">
          <div className="insumo-lotes border-t border-sand px-5 pb-4 pt-4">
            <TituloGrupo nivel={4}>De dónde viene lo que queda</TituloGrupo>
            {lotes.length === 0 ? (
              <Vacio tamano="chico" alinear="izquierda" className="px-0" icono={<Layers />}>
                Todavía no entró nada.
              </Vacio>
            ) : (
              <ul>
                {lotes.map((l, k) => {
                  const detalle = detalleDeLote(l, hoy);
                  const faltaDecirAQuien = Boolean(onNombrar) && esLider && l.origen === "compra" && !l.proveedor;
                  return (
                    // Ancha: de dónde vino, sus pares, «Se usa primero» y el lápiz, en una fila. Angosta (el celular, o la tarjeta bajo 768 px): el título con su lápiz, los pares debajo y la insignia al final.
                    <li key={l.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-2 border-b border-tinta/[0.06] py-3 last:border-0 @min-[48rem]:grid-cols-[minmax(0,1.3fr)_minmax(0,1.3fr)_auto_auto]">
                      <div className="order-1 min-w-0 @min-[48rem]:order-none">
                        <p className="text-sm font-semibold text-tinta">{tituloDeLote(l, hoy)}</p>
                        {(detalle || faltaDecirAQuien) && (
                          <p className="flex flex-wrap items-baseline gap-x-2 text-detalle text-tenue">
                            {detalle && <span className="min-w-0">{detalle}</span>}
                            {faltaDecirAQuien && onNombrar && (
                              <button type="button" aria-haspopup="dialog" data-guia={indice === 0 && k === 0 ? "prod-insumos.decir-a-quien" : undefined} className="btn-enlace" onClick={() => onNombrar(l)}>
                                Decir a quién
                              </button>
                            )}
                          </p>
                        )}
                        {/* El código del lote y la nota del ingreso (la cuenta de kilos a metros, o «Encontré tela»), cada uno en su línea (P11 del análisis del Taller). */}
                        {l.codigo && (
                          <p className="text-detalle text-tenue">
                            Lote <span className="font-mono">{l.codigo}</span>
                          </p>
                        )}
                        {l.nota && <p className="text-detalle text-tenue">{l.nota}</p>}
                      </div>
                      <Pares className="order-3 col-span-2 @min-[48rem]:order-none @min-[48rem]:col-span-1">
                        <ParDato rotulo="Quedan">{cantidadTexto(l.saldo, i.unidad)}</ParDato>
                        <ParDato rotulo="Entraron">{cantidadTexto(l.cantidadIngresada, i.unidad)}</ParDato>
                        {veCostos && l.costoUnitario !== null && (
                          <ParDato rotulo="Costó">
                            {costoUnitarioTexto(l.costoUnitario)} {costoPor(i.unidad)}
                          </ParDato>
                        )}
                      </Pares>
                      <span className="order-4 col-span-2 empty:hidden @min-[48rem]:order-none @min-[48rem]:col-span-1 @min-[48rem]:empty:block">
                        {primero?.id === l.id && (
                          <Chip tono="pizarra" title="Es el más antiguo que todavía tiene: se descuenta primero">
                            Se usa primero
                          </Chip>
                        )}
                      </span>
                      {/* Un ingreso equivocado se corrige o se elimina aquí (ADR-0570): el lápiz abre una hoja con el motivo; si de ese lote ya salió material, lo que se ajusta es lo que queda. */}
                      {conLapiz && (
                        <LapizEditar
                          className="order-2 @min-[48rem]:order-none"
                          que={l.noSeToca ? "lo que queda de este lote" : "este ingreso"}
                          guia={indice === 0 && k === 0 ? "prod-insumos.corregir-ingreso" : undefined}
                          title={l.noSeToca ? "Ajustar lo que queda" : "Corregir o eliminar este ingreso"}
                          onClick={() => (l.noSeToca ? onAjustar(l) : onCorregir(l))}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {/* Lo eliminado no se borró: queda aquí con su porqué, y «Restaurar» lo devuelve al estante. */}
            {esLider && eliminados.length > 0 && (
              <div className="mt-3">
                <TituloGrupo nivel={4} cuenta={eliminados.length}>
                  {eliminados.length === 1 ? "Ingreso eliminado" : "Ingresos eliminados"}
                </TituloGrupo>
                <ul>
                  {eliminados.map((e) => (
                    <li key={e.loteId} className="flex items-center justify-between gap-3 border-b border-tinta/[0.06] py-2.5 last:border-0">
                      <span className="min-w-0">
                        <span className="block text-sm text-tinta">{tituloDeEliminado(e, i.unidad, hoy)}</span>
                        <span className="block text-detalle text-tenue">«{e.motivo}»</span>
                      </span>
                      <button type="button" className="btn-enlace shrink-0 text-sm" aria-haspopup="dialog" onClick={() => onRestaurar(e)}>
                        Restaurar
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {esLider && (
              <div className="flex flex-wrap gap-2 pt-3">
                <Boton peso="fantasma" className="!px-3 !py-2" data-guia={indice === 0 ? "prod-insumos.llego-mas" : undefined} aria-haspopup="dialog" onClick={onIngresar}>
                  + {textoDeLlegoMas(i)}
                </Boton>
                {/* El tejido y el color de un color de tela son los de su tela (ADR-0554): no se completan aquí. */}
                {!i.materialId && (
                  <Boton peso="discreto" className="!px-3 !py-2" data-guia={indice === 0 ? "prod-insumos.editar-ficha" : undefined} onClick={onFicha}>
                    {ficha.completa ? "Editar la ficha" : i.tipo === "tela" ? "Completar tejido y color" : "Completar el color"}
                  </Boton>
                )}
                {/* Un color elegido por error se retira (se esconde, no se borra): solo el color de una tela, y la base se niega si tiene saldo u órdenes abiertas (ADR-0554). Abre una hoja: es una ventana, no guarda. */}
                {i.materialId && (
                  <Boton peso="peligro" className="!px-3 !py-2" data-guia={indice === 0 ? "prod-insumos.retirar-color" : undefined} aria-haspopup="dialog" onClick={onRetirar}>
                    Retirar color
                  </Boton>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
