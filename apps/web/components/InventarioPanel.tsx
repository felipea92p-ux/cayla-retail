"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { ArrowDownToLine, ArrowRight, Check, ChevronRight, Clock, ListChecks, Moon, PackageX, ScanLine, ShoppingBag, SignpostBig, Tag, TriangleAlert, X } from "lucide-react";
import { urlRotulos } from "@/lib/rotulos-reglas";
import { IconoPercha } from "@/components/ui/IconoPercha";
import { Tabla, Encabezado, celda } from "@/components/ui/Tabla";
import { Chip } from "@/components/ui/Chip";
import { Casilla } from "@/components/ui/Casilla";
import { MiniaturaPrenda, categoriaDe } from "@/components/ui/PrendaCelda";
import { MuestraColor } from "@/components/ui/MuestraColor";
import { PaginacionLocal } from "@/components/ui/PaginacionLocal";
import { useSedeActiva } from "@/components/SedeActiva";
import { paginar, paginarSinPartirGrupos } from "@/lib/paginacion";
import { Modal } from "@/components/ui/Modal";
import { AjustarInventarioModal } from "@/components/AjustarInventarioModal";
// «Pedir para una clienta» (PedirOtraSedeModal) no vuelve: el rediseño del cajón (2026-09-28) no tiene esa entrada — el
// mismo criterio ya documentado para «Apartar»/«Retirar del piso»/«Dónde más hay». `EliminarProductoModal` (ADR-0252,
// trasplantado de main tras el PR #574) sí: es una función real de la app que el rediseño no debía perder.
import { EliminarProductoModal } from "@/components/EliminarProductoModal";
import { alternarMarcasDePrenda, permisosDelDetalle } from "@/lib/existencias-permisos";
import { ResolverDanadosModal } from "@/components/ResolverDanadosModal";
import { ApartadosModal } from "@/components/ApartadosModal";
import { ResumenStockOverlay } from "@/components/ResumenStockOverlay";
import { RitmoRecientePopover } from "@/components/RitmoRecientePopover";
import { hoyLima, resumirApartados, type Apartado } from "@/lib/apartados-reglas";
import { ChipAlerta, ChipMantener } from "@/components/ExistenciasChips";
import { ExistenciasVacio } from "@/components/ExistenciasVacio";
import { ParaHoy, type AccionTarea } from "@/components/existencias/ParaHoy";
import { entradaPorColgar, porColgarDeLaSede, tareasParaHoy, type TipoTareaHoy } from "@/lib/existencias-para-hoy";
import { ExistenciasPorPrenda } from "@/components/ExistenciasPorPrenda";
import { ExistenciasTarjetas } from "@/components/ExistenciasTarjetas";
import { conteoDeLista, opcionesOrden, ordenarModelos, tarjetasDeExistencias, type OrdenPrendas } from "@/lib/existencias-tarjetas";
import { PanelTalla, type FlujoPedido, type MarcaDelFiltro } from "@/components/existencias/PanelTalla";
import { AnilloMision } from "@/components/existencias/AnilloMision";
import { mejorOrigen } from "@/lib/existencias-flujos";
import { usePistola } from "@/components/ui/usePistola";
import { tallasQueFaltan } from "@/lib/reponer-prenda-reglas";
import { EscanerBusqueda } from "@/components/EscanerBusqueda";
import { agruparPorPrenda, deLaPrenda, tallasPorPrenda, coloresDelModelo, MAX_VARIANTES_EN_URL, ordenarPorListaDelDia, tallaPorCodigo, urlBajarAlPiso, urlEtiquetas, urlTrasladar, type PrendaAgrupada } from "@/lib/existencias-prendas";
import { explicarVacio, palabrasBuscables, sinStockQueCoincide, textoSinStock, type ClaveFiltro, type FiltroActivo, type ProductoSinStock } from "@/lib/existencias-vacio";
import { marcasDeLaSede } from "@/lib/existencias-catalogo-reglas";
import { resumenRed } from "@/lib/stock-por-sede";
import { descargarCsv } from "@/lib/exportar-csv";
import { avisoPausaDelPiso, AYUDA_HOY, estadoHoyDeTalla, hoyDeTalla, TEXTO_HOY, TIPOS_HOY, TONO_HOY } from "@/lib/existencias-hoy";
import { pidePiso } from "@/lib/piso-plan";
import { conteosDeFiltros, contarFiltrosActivos, filtrarExistencias, indiceDeExistencias, tallasEnCurva, tieneCondicion, valorOfrecido, valoresOfrecidos, ROTULO_CONDICION, type FiltrosElegidos } from "@/lib/existencias-filtros";
import { textoDeFamilia } from "@/lib/colores-familias";
import type { ColorDeCatalogo } from "@/lib/existencias-catalogo";
import { useFiltrosExistencias } from "@/components/useFiltrosExistencias";
import { FiltrosExistencias, ID_BUSCADOR_EXISTENCIAS } from "@/components/FiltrosExistencias";
import type { EstadoPanelFiltros } from "@/lib/panel-filtros";
import { textoCoberturaPiso, textoRitmoReciente } from "@/lib/resumen-formato";
import { clavePercha, ordenarPorModeloColorTalla } from "@/lib/inventario-reglas";
import type { PoliticaOperativaInventario } from "@/lib/politica-operativa-inventario";
import type { FilaExistencias, ResumenExistencias, PrendaDanada } from "@/lib/inventario-v2";
// Solo el TIPO: `lib/sububicaciones.ts` importa el cliente de servidor (`next/headers`) y este archivo es "use client";
// importar un valor de ahí rompe el build de Vercel (Turbopack lo rechaza aunque `tsc` y vitest pasen).
import type { Sububicacion } from "@/lib/sububicaciones";

const TODAS = "__todas__";

/** Sin lista del día (el motor no respondió, o el piso está en pausa): la misma referencia en cada render, para no rehacer el orden. */
const SIN_LISTA: readonly string[] = [];

/** El punto de la leyenda de la tabla, en el tono de cada caso de «Hoy». */
const PUNTO_HOY = { ambar: "bg-ambar", verde: "bg-verde", pizarra: "bg-pizarra" } as const;

/** El caso de «Hoy» de UNA talla (columna de la tabla «Por talla»): las mismas palabras y el mismo tono que el filtro, la tarjeta y
 *  el cajón. «Por colgar» dice cuántas se pueden bajar; «Sin stock atrás», si viene algo en camino; «En pausa», que espera el
 *  cuadre del piso. «N/D» solo cuando no se sabe (el motor no respondió). */
function ChipHoy({ f }: { f: FilaExistencias }) {
  const h = estadoHoyDeTalla(f);
  if (!h) return <span className="text-xs text-tinta/40">N/D</span>;
  if (h === "por_colgar") {
    const n = f.almacenDisponible ?? 0;
    return (
      <ChipAlerta titulo={`En el piso no queda ninguna para vender; en el almacén hay ${n} que se ${n === 1 ? "puede" : "pueden"} colgar`}>
        {TEXTO_HOY.por_colgar} · {n} {n === 1 ? "ud" : "uds"}
      </ChipAlerta>
    );
  }
  if (h === "mantener") return <ChipMantener titulo={AYUDA_HOY.mantener}>{TEXTO_HOY.mantener}</ChipMantener>;
  return (
    <>
      <Chip tono={TONO_HOY[h]} className="text-xs">
        <span title={AYUDA_HOY[h]}>{TEXTO_HOY[h]}</span>
      </Chip>
      {h === "sin_stock_atras" && f.enTransito > 0 && (
        <span className="basis-full text-[11px] leading-tight text-taupe">
          {f.enTransito} {f.enTransito === 1 ? "ud" : "uds"} en camino
        </span>
      )}
    </>
  );
}
/** El buscador, para devolverle el foco cuando un botón del estado vacío (que se desmonta al volver las filas) lo tenía. */
function enfocarBuscador() {
  requestAnimationFrame(() => document.getElementById(ID_BUSCADOR_EXISTENCIAS)?.focus());
}
/** Filas por página de la tabla (Felipe, 2026-09-22: «que solo se vean 15»). Pintar TODAS las variantes
 *  de una tienda —cada una con foto, chips, botones y menú— era lo que hacía lenta la pantalla. */
const FILAS_POR_PAGINA = 15;

/** «Mostrando 1–15 de 120 prendas»; con filtro, «Mostrando 1–15 de 40 (de 120 prendas)». */
function textoMostrando(p: { desde: number; hasta: number; totalPaginas: number }, filtradas: number, total: number): string {
  const prendas = total === 1 ? "prenda" : "prendas";
  if (p.totalPaginas <= 1) return `Mostrando ${filtradas} de ${total} ${prendas}`;
  const rango = `Mostrando ${p.desde}–${p.hasta} de`;
  return filtradas === total ? `${rango} ${total} ${prendas}` : `${rango} ${filtradas} (de ${total} ${prendas})`;
}


/** La celda de «Cobertura piso» (2026-09-25, sobre el Ritmo reciente — ledger único): cuánto dura el
 *  piso de hoy al ritmo reciente. Nunca NaN, nunca infinito: lo que no se puede estimar dice «No
 *  estimable», nunca una cobertura fabricada. El tooltip trae el contexto completo (sección 11 del
 *  pedido): piso, almacén, total de la sede y una cobertura TOTAL aproximada — nunca una columna
 *  propia, solo contexto para distinguir «me falta inventario» de «tengo, pero está en almacén».
 *
 *  Diseño aprobado (2026-09-28): la cifra va en una etiqueta suave. Rojo cuando ya no queda piso («0 d»), ámbar mientras
 *  «Acción hoy» pide reponer; sin acción, texto llano. El color sigue a «Acción hoy» (única fuente de verdad) y a la
 *  cobertura solo para el «0 d»: la cobertura nunca decide nada, solo informa. */
function CeldaCoberturaPiso({ f }: { f: FilaExistencias }) {
  const c = f.coberturaPiso;
  if (!c) {
    return (
      <span className="text-xs text-tinta/40" title="Todavía no se pudo calcular">
        N/D
      </span>
    );
  }
  const pideReponer = pidePiso(f.planPiso?.accion);
  const etiqueta = c.tipo === "agotado" ? "bg-ambar/15 text-ambar-profundo" : c.tipo === "medida" && pideReponer ? "bg-ambar/15 text-ambar-profundo" : null;
  const piso = f.piso ?? 0;
  const almacen = f.almacen ?? 0;
  const totalSede = piso + almacen;
  const coberturaTotal =
    f.ritmoReciente?.tipo === "medida" && f.ritmoReciente.unidadesDia > 0 && totalSede > 0 ? Math.round((totalSede / f.ritmoReciente.unidadesDia) * 10) / 10 : null;
  const ayuda = [
    `Piso: ${piso}`,
    c.tipo === "medida" ? `Cobertura piso: ${textoCoberturaPiso(c)}` : null,
    `Almacén: ${almacen}`,
    `Total sede: ${totalSede}`,
    coberturaTotal !== null ? `Cobertura total aproximada: ${coberturaTotal} días` : null,
  ]
    .filter(Boolean)
    .join("\n");
  return etiqueta ? (
    <span className={`inline-flex min-w-[3.1rem] items-center justify-center rounded-lg px-2.5 py-1 text-[13px] font-semibold tabular-nums ${etiqueta}`} title={ayuda}>
      {textoCoberturaPiso(c)}
    </span>
  ) : (
    <span className="text-xs tabular-nums text-tinta/65" title={ayuda}>
      {textoCoberturaPiso(c)}
    </span>
  );
}

// Piso de venta / almacén de tienda (Felipe, 2026-09-14): la pantalla no
// asume que toda ubicación separa piso y almacén — se adapta según lo que
// `getSububicaciones` encontró para ESA ubicación (`resumen.separaPisoAlmacen`),
// nunca por el nombre ("Taller" vs. "Tienda X"). Taller sigue viendo una
// tabla más corta: sin piso/almacén ni «Acción hoy», pero con tránsito y red.
//
// Existencias (rediseño 2026-09-22, boceto de Felipe; reestructurada el 2026-09-25, PR #445): de tabla de
// stock a pantalla de acción diaria. «Prioridades de hoy» (4 tarjetas) reemplaza las cifras sueltas de antes,
// con los enlaces de la sede encima (recomendaciones, análisis de cobertura, apartadas); «Disponible total»
// abre el desglose por categoría con costo/margen (solo líder) y el delta de 7 días. La tabla: Stock actual
// (lo libre en piso / almacén), Cobertura piso, Ritmo reciente, En camino, Acción hoy y En la red.
export function InventarioPanel({
  ubicacionId,
  stock,
  resumen,
  enCamino,
  sububicaciones,
  sububicacionPiso,
  sububicacionAlmacen,
  danadosPendientes,
  abrirDanados = false,
  abrirVariante = null,
  apartados,
  esLider,
  editaCatalogo = false,
  puedeAjustar,
  coberturaFallo = null,
  planFallo = null,
  sedeNombre,
  sinStock,
  marcaFallo = null,
  verProductos = false,
  politica,
  veTraslados = false,
  puedeBajarAlPiso = false,
  veApartados = false,
  esTienda = false,
  panelFiltros = "abierto",
  coloresCatalogo = [],
  sinRegistrar = null,
  destinosParaEnviar = [],
  sedesParaPedir = [],
  listaDelDia = SIN_LISTA,
}: {
  ubicacionId: string;
  stock: FilaExistencias[];
  resumen: ResumenExistencias;
  enCamino: { traslados: number; proximaLlegada: string | null; atrasados: number };
  sububicaciones: Sububicacion[];
  sububicacionPiso: Sububicacion | null;
  sububicacionAlmacen: Sububicacion | null;
  /** Cola de "Dañado" (ADR-0071): prendas en cuarentena esperando Liquidada
   *  / Se botó / Donada. Vacía en Taller (no separa piso/almacén, nunca
   *  recibe devoluciones). */
  danadosPendientes: PrendaDanada[];
  /** Abrir la cola de dañadas al entrar (`?danados=1`, aviso de cuarentena de Devoluciones). */
  abrirDanados?: boolean;
  /** La talla a abrir al llegar (`?variante=`, desde Movimientos: ADR-0241). */
  abrirVariante?: string | null;
  /** Apartados ABIERTOS de esta ubicación (ADR-0141), ya ordenados por fecha límite. Vacía en Taller. */
  apartados: Apartado[];
  /** Solo un líder puede resolver una prenda dañada (`resolver_prenda_danada`) —
   *  una integrante puede ABRIR la cola y verla, no marcarla. */
  /** Sigue siendo del líder: resolver y liquidar prendas dañadas. */
  esLider: boolean;
  /** Edita el catálogo (`puede(persona, "editarCatalogo")`): ve «Eliminar el producto» en el detalle, como en Catálogo (ADR-0252; `permisosDelDetalle`). */
  editaCatalogo?: boolean;
  /** ¿Puede ajustar stock fuera de una venta? Un líder o la terminal administrativa (ADR-0160). */
  puedeAjustar: boolean;
  /** Si la cobertura no se pudo calcular: el aviso (las filas quedan en «N/D»); null = todo bien. */
  coberturaFallo?: string | null;
  /** El motor del piso no respondió (`fn_piso_plan_lectura`): «Hoy» queda en N/D y la pantalla lo dice, en vez de callar. */
  planFallo?: string | null;
  /** El nombre de la sede que se mira, para decir «Tienda TRU no lo ha recibido» en el estado vacío. */
  sedeNombre: string;
  /** Los productos ACTIVOS del catálogo que esta sede no tiene (ni una fila de stock): la pantalla nace de `stock`, así que
   *  sin esto una marca cuyos productos la sede nunca recibió («CAYLA» en TRU) no dejaba rastro. */
  sinStock: ProductoSinStock[];
  /** Si la marca de los productos no se pudo leer: el aviso (sin Marca en el buscador ni en los filtros); null = todo bien. */
  marcaFallo?: string | null;
  /** ¿Su rol ve el módulo Productos (ADR-0161)? Sin él, «Ver en Productos» llevaría a «Sin acceso»: los nombres se muestran, sin enlace. */
  verProductos?: boolean;
  /** Política operativa de Inventario (`politica-operativa-inventario.ts`): las jornadas mínimas que lee el popover de Ritmo
   *  reciente. Lo que el piso pide hoy NO sale de aquí: lo decide el motor del piso y viene en cada fila (`planPiso`). */
  politica: PoliticaOperativaInventario;
  /** ¿Su rol ve Traslados? «Trasladar» (detalle y barra de varias) lleva a «Mover mercadería», que exige ese módulo. */
  veTraslados?: boolean;
  /** ¿Puede usar «Bajar al piso» aquí (su módulo, su sede activa, y la sede separa piso y almacén)? Lo decide la página.
   *  También habilita «Reponer al piso» y «Retirar del piso» de cada talla (ADR-0240: mover piso↔almacén es de ese módulo). */
  puedeBajarAlPiso?: boolean;
  /** ¿Su rol ve «Apartados»? «Apartar» desde Existencias es de ese módulo (ADR-0240). */
  veApartados?: boolean;
  /** Es una tienda: entre tiendas se pide una prenda para una clienta (ADR-0233). */
  esTienda?: boolean;
  /** Si el panel de filtros entra abierto o cerrado en la computadora (cookie de este equipo, leída en el servidor). */
  panelFiltros?: EstadoPanelFiltros;
  /** Los colores del catálogo con su familia, hex y tipo: la lista de Color va agrupada por familia y con su muestra, como en
   *  Productos. Vacío (la lectura falló) = lista plana. */
  coloresCatalogo?: ColorDeCatalogo[];
  /** Ventas sin registrar de esta sede (ADR-0330, viven en Existencias): pendientes y vencidas. `null` = no es una tienda; «fallo» = no se pudo leer. */
  sinRegistrar?: { pendientes: number; vencidas: number } | "fallo" | null;
  /** A qué sedes se puede mandar lo que se sube «para enviar» (ADR-0328 act. 17). Vacío: «Subir prenda» no ofrece enviar. */
  destinosParaEnviar?: readonly { id: string; nombre: string }[];
  /** Las otras tiendas a las que esta sede puede pedir (`sedesParaPedir`): «Pedir a otra sede» del panel de la talla. */
  sedesParaPedir?: readonly { id: string; nombre: string }[];
  /** La lista del día del motor del piso (`PlanDelPiso.listaDelDia`): las tallas para colgar hoy, en orden (lo vendido
   *  ayer primero). La tarjeta «Reponer a piso hoy» y el orden sin búsqueda la siguen, como el Inicio de almacén. */
  listaDelDia?: readonly string[];
}) {
  // Los filtros viven en la URL (2026-10-03, misma estructura que Productos): recargar, volver de «Bajar al piso» o abrir un
  // enlace copiado los trae puestos. Cambiar uno reescribe la URL sin volver a pedir la página (`useFiltrosExistencias`).
  const { filtros, busqueda, aplicar, limpiar, teclear, fijarBusqueda, soltarBusqueda } = useFiltrosExistencias(resumen.separaPisoAlmacen);
  const setBusqueda = fijarBusqueda;
  const setCategoria = (v: string) => aplicar({ cat: v === TODAS ? null : v });
  const setMarca = (v: string) => aplicar({ marca: v === TODAS ? null : v });
  // «Por colgar» (uno de los tres casos de «Hoy», `lib/existencias-hoy.ts`) se trabaja por percha: la lista va ordenada por
  // modelo y color, y debajo de la barra se dice cuántas faltan colgar en toda la sede.
  const porColgarElegido = filtros.hoy === "por_colgar";
  const orden = (filtros.orden ?? "relevancia") as OrdenPrendas;
  const setOrden = (v: OrdenPrendas) => aplicar({ orden: v === "relevancia" ? null : v });
  // El control que abrió el modal: al cerrarlo, el teclado vuelve ahí y no al principio de la página.
  const volverFoco = useRef<HTMLElement | null>(null);
  // Colgar, Colgar varias y Subir se hacen DENTRO del panel de la talla (`PanelTalla` + `FlujoTalla`, maqueta 2026-10-06): las ventanas
  // «Reponer prenda» y «Subir prenda» ya no existen. Ajustar y Reportar dañada conservan su ventana completa para lo que el panel no cubre
  // (varias tallas a la vez, enlazar con un conteo).
  const [ajustando, setAjustando] = useState<FilaExistencias | null>(null);
  // «Eliminar el producto» desde el detalle (ADR-0252): el producto entero, no la talla ni el color.
  const [eliminando, setEliminando] = useState<{ productoId: string; referencia: string; estado: string | null } | null>(null);
  const [viendoDanados, setViendoDanados] = useState(abrirDanados);
  const [viendoApartados, setViendoApartados] = useState(false);
  // «Pendientes»: la ventana con las tareas de «Para hoy» (ya no van en la pantalla).
  const [viendoPendientes, setViendoPendientes] = useState(false);
  // Las cifras «Apartada» y «Dañada» del cajón abren esas mismas ventanas, pero solo con lo de ESA prenda (no la cola entera de
  // la sede). Sin prenda (null) las ventanas muestran todo, como cuando se abren desde «Para hoy» o el aviso de cuarentena.
  const [soloPrenda, setSoloPrenda] = useState<PrendaAgrupada<FilaExistencias> | null>(null);
  // Una ventana abierta desde el cajón de UNA prenda se cierra sola cuando de esa prenda ya no queda nada (se resolvió o se liberó la
  // última): sin esto la lista filtrada quedaba vacía y la ventana decía «no hay nada en esta ubicación» con la sede llena de otras
  // dañadas o apartados (revisión del 2026-10-04). Abierta desde «Para hoy» (sin prenda) nunca se cierra sola: ahí vacío sí es vacío.
  const filtradaVacia =
    soloPrenda !== null &&
    ((viendoDanados && deLaPrenda(danadosPendientes, soloPrenda).length === 0) || (viendoApartados && deLaPrenda(apartados, soloPrenda).length === 0));
  // Se ajusta el estado en el mismo render (patrón de React para estado derivado, sin efecto): la condición se apaga sola al limpiar `soloPrenda`.
  if (filtradaVacia) {
    setViendoDanados(false);
    setViendoApartados(false);
    setSoloPrenda(null);
  }
  const [viendoDisponible, setViendoDisponible] = useState(false);
  // Existencias conectada (ADR-0237): la lista entra agrupada por prenda (modelo + color, con su curva de tallas); «Por
  // talla» es la tabla del #445, una fila por talla con Cobertura y Ritmo. La prenda abierta se guarda por su clave, no
  // una copia: tras reponer o apartar, el `router.refresh` trae las cifras nuevas y el detalle las muestra.
  const [vista, setVista] = useState<"prenda" | "talla">("prenda");
  // La lista de entrada son tarjetas (maqueta `existencias-tarjetas-2026-09`); «Ver detalle» pasa a la tabla de siempre, con su
  // «Vista: Por prenda / Por talla». `orden` solo ordena las tarjetas: la tabla conserva su orden. El cajón de la prenda vive en la
  // tabla: las tarjetas no lo abren, así que llegar «Ver en Existencias» desde Movimientos (`abrirVariante`) o escanear un código
  // (`abrirPorCodigo`) entra por la tabla.
  const [verDetalle, setVerDetalle] = useState(Boolean(abrirVariante));
  // `abrirVariante` (ADR-0241, «Ver en Existencias» desde Movimientos): la prenda entra abierta en esa talla. Si la talla
  // no tiene fila en esta sede (se vendió la última, o es de otra), no se abre nada: la lista de siempre.
  // `flujo`: el panel abre YA en un paso (acción rápida de la tarjeta, «Colgar primero»): la maqueta lo hace así, sin ventana aparte.
  const [abierta, setAbierta] = useState<{ clave: string; varianteId?: string; flujo?: FlujoPedido; vista?: "ficha" } | null>(() => {
    const f = abrirVariante ? stock.find((x) => x.varianteId === abrirVariante) : null;
    return f ? { clave: agruparPorPrenda([f])[0].clave, varianteId: f.varianteId } : null;
  });
  // Las tallas marcadas para actuar sobre varias a la vez (la barra de abajo). Por talla y no por prenda: una prenda
  // marcada son todas sus tallas, y así el filtro «Talla» no cambia lo que se lleva.
  const [marcadas, setMarcadas] = useState<ReadonlySet<string>>(new Set());
  const [camara, setCamara] = useState(false);

  const categorias = useMemo(
    () => Array.from(new Set(stock.map((f) => f.categoria).filter((c): c is string => !!c))).sort((a, b) => a.localeCompare(b, "es")),
    [stock]
  );
  // Las marcas de ESTA sede (no las 80 de la tabla `marcas`): un combo con marcas que aquí no tienen ni una prenda solo estorbaría.
  // Con una sola marca el filtro (y la marca en cada fila) sería ruido: aparece desde 2.
  const marcas = useMemo(() => marcasDeLaSede(stock), [stock]);
  const mostrarMarca = marcas.length >= 2;
  // Un filtro que no se ve no puede seguir filtrando: si la lectura de marcas falla tras un `router.refresh` (Reponer, Ajustar) el combo desaparece;
  // sin esto la marca elegida antes seguía activa, invisible, y dejaba la tabla en blanco. Lo mismo con un valor que llega en la URL y
  // esta sede no tiene (un enlace de otra tienda): no filtra (`valorOfrecido`).
  const marcaEfectiva = (mostrarMarca ? valorOfrecido(filtros.marca, marcas) : null) ?? TODAS;
  // En su curva (XS · S · M · L, luego la numeración), como la tarjeta: antes iban como texto («10, 2, 4, L, M, S, XL, XS»).
  const tallas = useMemo(() => tallasEnCurva(stock), [stock]);
  const colores = useMemo(
    () => Array.from(new Set(stock.map((f) => f.color).filter((c): c is string => !!c))).sort((a, b) => a.localeCompare(b, "es")),
    [stock]
  );
  const categoria = valorOfrecido(filtros.categoria, categorias) ?? TODAS;
  // Talla y Color de varias (2026-10-03). Una familia cuenta si algún color de esta sede es de ella.
  // Los colores de ESTA sede con su familia, hex y tipo (la muestra), para la lista agrupada. Un color que el catálogo no trajo
  // va con el hex de la fila y sin familia: suelto al final, nunca perdido.
  const coloresConMuestra = useMemo(() => {
    const deCatalogo = new Map(coloresCatalogo.map((c) => [c.nombre, c]));
    const hexDeFila = new Map(stock.map((f) => [f.color, f.colorHex]));
    return colores.map((nombre) => {
      const c = deCatalogo.get(nombre);
      return { id: nombre, nombre, hex: c?.hex ?? hexDeFila.get(nombre) ?? null, familia: c?.familia ?? null, tipo: c?.tipo ?? null };
    });
  }, [colores, coloresCatalogo, stock]);
  const tallasElegidas = useMemo(() => valoresOfrecidos(filtros.tallas, tallas), [filtros.tallas, tallas]);
  const coloresElegidos = useMemo(() => valoresOfrecidos(filtros.colores, colores), [filtros.colores, colores]);
  const familiasDeLaSede = useMemo(() => [...new Set(stock.map((f) => f.colorFamilia).filter((x): x is string => !!x))], [stock]);
  const familiasElegidas = useMemo(() => valoresOfrecidos(filtros.familias, familiasDeLaSede), [filtros.familias, familiasDeLaSede]);
  // Filtro de búsqueda especial (`lib/filtro-busqueda-especial.ts`): lo escrito se parte en términos —nombre,
  // marca, categoría, código, color y talla, en cualquier orden— y todos deben cumplirse. Si el texto dice una talla o un
  // color, manda sobre el filtro visual de esa dimensión; Categoría, Marca, Acción y Estado siempre aplican (el texto no los pisa).
  const indiceBusqueda = useMemo(() => indiceDeExistencias(stock), [stock]);
  // Lo que de verdad filtra la lista, ya resuelto contra lo que la sede ofrece: lo leen la lista, la barra y el estado vacío.
  const elegidos: FiltrosElegidos = useMemo(
    () => ({
      q: busqueda,
      categoria: categoria === TODAS ? null : categoria,
      marca: marcaEfectiva === TODAS ? null : marcaEfectiva,
      tallas: tallasElegidas,
      colores: coloresElegidos,
      familias: familiasElegidas,
      hoy: filtros.hoy,
      condicion: filtros.condicion,
    }),
    [busqueda, categoria, marcaEfectiva, tallasElegidas, coloresElegidos, familiasElegidas, filtros.hoy, filtros.condicion]
  );
  // Cuántos productos trae cada opción de la barra, con los demás filtros puestos (se esconden las que vaciarían la lista).
  const conteos = useMemo(() => conteosDeFiltros(indiceBusqueda, elegidos), [indiceBusqueda, elegidos]);
  const { filas: filtradas } = useMemo(() => {
    const resultado = filtrarExistencias(
      indiceBusqueda,
      elegidos,
      undefined,
      // Con texto escrito, lo que mejor coincide va primero (una marca entera antes que un trozo perdido en un código), y las
      // tallas de un producto no se separan. «Por colgar» trae su propio orden (por percha) y no se toca.
      porColgarElegido ? {} : { ordenar: "relevancia", grupo: (f) => f.productoId }
    );
    // «Por colgar» se trabaja por percha (un modelo en un color), no por SKU: sus tallas salen juntas y
    // en su curva, para que la encargada baje la M y la L de la misma casaca en un solo viaje.
    return porColgarElegido ? { ...resultado, filas: ordenarPorModeloColorTalla(resultado.filas) } : resultado;
  }, [indiceBusqueda, elegidos, porColgarElegido]);

  // El contador de la píldora mira TODA la sede, no lo filtrado: es la cifra del problema («22 tallas
  // que el cliente no ve»), igual que «Para hoy». Baja sola después de cada «Reponer». Es la misma cuenta que lee el Inicio de
  // Almacén (`porColgarDeLaSede`), alimentada por el motor del piso: la decisión de cada talla (`planPiso`) y el orden de la lista
  // del día. Los números de «Para hoy», del filtro «Hoy» y del Inicio no pueden discrepar.
  const cuentaPorColgar = useMemo(() => porColgarDeLaSede(stock, listaDelDia), [stock, listaDelDia]);
  // El piso sin cuadrar (ADR-0328, decisión 5): cuántas tallas esperan, para el aviso, la tarjeta y la leyenda. De la misma cuenta.
  const tallasEnPausa = cuentaPorColgar.enPausa;
  // Cuántas tallas tiene cada prenda sin filtros: la tarjeta dice «Solo M · L (de 4 tallas)» cuando un filtro dejó menos.
  const tallasDePrenda = useMemo(() => tallasPorPrenda(stock), [stock]);

  // La tabla pinta UNA página de `filtradas`; las tarjetas, los filtros y el CSV siguen viendo todas.
  // Cambiar cualquier filtro vuelve a la página 1 (ajuste durante el render, sin efecto: la firma de
  // los filtros cambió → se reinicia). `paginar` acota: si un guardado achicó la lista, cae en la última.
  const [pagina, setPagina] = useState(1);
  const firmaFiltros = [busqueda, categoria, marcaEfectiva, tallasElegidas.join(","), coloresElegidos.join(","), familiasElegidas.join(","), filtros.hoy ?? "", filtros.condicion ?? "", orden].join("\u0000");
  const [firmaPrevia, setFirmaPrevia] = useState(firmaFiltros);
  if (firmaFiltros !== firmaPrevia) {
    setFirmaPrevia(firmaFiltros);
    setPagina(1);
  }
  // «Por colgar» va ordenada por percha: la página se estira hasta terminar la percha en curso, para que
  // la S y la M de una casaca no queden en la página 1 y su L en la 2.
  const paginaActual =
    porColgarElegido ? paginarSinPartirGrupos(filtradas, pagina, FILAS_POR_PAGINA, clavePercha) : paginar(filtradas, pagina, FILAS_POR_PAGINA);
  // «Por prenda» pagina PRENDAS, no tallas: 15 prendas por página, cada una con todas sus tallas (que ya no se parten).
  // Sin texto escrito, primero lo que falta en el piso (análisis de Existencias, tarea #5): con 33 de 33 tallas pidiendo
  // reponer, el orden es lo único que dice por dónde empezar. Con texto, manda la relevancia de la búsqueda.
  const sinTexto = busqueda.trim() === "";
  const prendas = useMemo(() => {
    const agrupadas = agruparPorPrenda(filtradas);
    return sinTexto ? ordenarPorListaDelDia(agrupadas, listaDelDia) : agrupadas;
  }, [filtradas, sinTexto, listaDelDia]);
  const paginaPrendas = paginar(prendas, pagina, FILAS_POR_PAGINA);
  // Las tarjetas: una por MODELO (sus colores van en la misma tarjeta), lo ya filtrado, en el orden elegido; con un caso de «Hoy», una
  // por PRENDA, para que sus pastillas sumen la cifra de «Para hoy» (`tarjetasDeExistencias`, ADR-0331 act. c). Sin `orden` (o con uno
  // que esta sede no ofrece: Taller no separa piso y almacén) queda el orden de siempre.
  const opcionesDeOrden = opcionesOrden(resumen.separaPisoAlmacen);
  const ordenEfectivo = opcionesDeOrden.some((o) => o.valor === orden) ? orden : "relevancia";
  const tarjetasOrdenadas = useMemo(() => ordenarModelos(tarjetasDeExistencias(prendas, elegidos.hoy), ordenEfectivo), [prendas, elegidos.hoy, ordenEfectivo]);
  const paginaTarjetas = paginar(tarjetasOrdenadas, pagina, FILAS_POR_PAGINA);
  // Lo que dicen la línea de arriba, el botón de la hoja de filtros y el pie: «6 prendas · 15 tallas por colgar».
  const conteo = conteoDeLista(tarjetasOrdenadas.length, filtradas, elegidos.hoy);
  // «Colgar primero», las tres prendas que más convenía colgar sobre las tarjetas, se quitó el 2026-10-06 (Felipe: «quita esto»): la
  // lista ya va en el orden de la lista del día y el atajo «Por colgar» dice cuáles faltan (ADR-0344, «Quinta vuelta»).
  const filtrosPuestos = contarFiltrosActivos(elegidos);
  // Solo «Hoy» y/o «Condición» (sin texto, talla, color, marca ni categoría): la tarjeta enseña TODAS las tallas del color y atenúa las
  // que no cumplen, como la maqueta. Con otro filtro, las tallas que se ven son las que deja ese filtro (y la tarjeta lo dice).
  const soloHoyOCondicion = sinTexto && (elegidos.hoy !== null || elegidos.condicion !== null) && filtrosPuestos === (elegidos.hoy ? 1 : 0) + (elegidos.condicion ? 1 : 0);
  const tarjetaTablaRef = useRef<HTMLDivElement>(null);
  function irAPagina(n: number) {
    setPagina(n);
    // El paginador está al pie: al cambiar de página, que la tabla empiece a leerse desde arriba.
    const tarjeta = tarjetaTablaRef.current;
    if (tarjeta && tarjeta.getBoundingClientRect().top < 0) tarjeta.scrollIntoView({ block: "start" });
  }
  // «Reponer a piso hoy» filtra una tabla que queda más abajo, fuera de la vista: sin llevarla hasta ahí, el clic
  // parecía no hacer nada (solo cambiaba el fondo de la tarjeta). Se desplaza en el cuadro siguiente, cuando la tabla
  // ya tiene su alto filtrado; suave para que se vea de dónde a dónde se fue, y de una vez con `prefers-reduced-motion`.
  function mostrarTablaFiltrada() {
    requestAnimationFrame(() => {
      const reducido = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      tarjetaTablaRef.current?.scrollIntoView({ block: "start", behavior: reducido ? "auto" : "smooth" });
    });
  }

  /** Quita todo menos «Hoy» (y el orden). Es el «Ver todas» de «Por colgar»: que la lista vuelva a ser lo que cuenta el
   *  resumen de toda la sede. */
  function quitarFiltrosMenosHoy() {
    limpiar(["hoy", "orden"]);
  }
  function limpiarFiltros() {
    limpiar();
  }

  const separaConSububicaciones = Boolean(resumen.separaPisoAlmacen && sububicacionPiso && sububicacionAlmacen);
  // Todo lo que escribe desde la fila firma con el Responsable de la sede ACTIVA: mirando otra (`?ubicacion=`) quedaría
  // allá firmado por alguien de turno acá. Para operar otra sede, se cambia la sede activa en la cabecera.
  const sedeActiva = useSedeActiva();
  const enSedeActiva = sedeActiva?.ubicacionId === ubicacionId;
  // Apartar necesita saber DE DÓNDE (piso o almacén): solo donde la ubicación separa las dos.
  // ADR-0240 (opción A de Felipe): cada escritura es del módulo que la nombra, y la base pide lo mismo
  // (`mover_entre_piso_y_almacen` → «Bajada al piso», `apartar_prenda` → «Apartados»): el botón solo aparece si va a pasar.
  // Una sola función, con su prueba (tarea #11, `lib/existencias-permisos.ts`): un `&&` quitado aquí volvía a abrir
  // «Reponer» a quien no tiene el módulo sin que nada avisara.
  const permisos = permisosDelDetalle({
    separaPisoAlmacen: separaConSububicaciones,
    enSedeActiva,
    puedeBajarAlPiso,
    veApartados,
    puedeAjustar,
    veTraslados,
    esTienda,
    editaCatalogo,
    tieneCuarentena: sububicaciones.some((s) => s.tipo === "cuarentena"),
  });
  const puedeReponer = permisos.reponerYRetirar;
  const puedeAjustarAqui = permisos.ajustar;
  const resumenApartados = useMemo(() => resumirApartados(apartados, hoyLima()), [apartados]);
  const separa = resumen.separaPisoAlmacen;

  // La prenda abierta sale de TODO el stock, no de lo filtrado: si se abre escaneando o tras un guardado cambia su «Acción
  // hoy», el detalle no se cierra solo por dejar de coincidir con un filtro.
  // Los nombres de las tiendas a las que se les puede pedir: la red de stock viene por nombre de sede.
  const tiendasParaPedir = useMemo(() => new Set(sedesParaPedir.map((x) => x.id)), [sedesParaPedir]);
  // Cada prenda (modelo + color) con TODAS sus tallas de la sede: la tarjeta las muestra todas cuando solo filtra «Hoy» o «Condición».
  const prendaPorClave = useMemo(() => new Map(agruparPorPrenda(stock).map((p) => [p.clave, p])), [stock]);
  // Lo que el filtro de la lista marca dentro del panel («Sin stock atrás en este modelo · 2»): «Hoy» o «Condición», como las tarjetas.
  const marcaDelFiltro: MarcaDelFiltro | null = useMemo(() => {
    const hoy = filtros.hoy;
    const condicion = filtros.condicion;
    // El tono del punto, como la maqueta: ámbar lo que se hace aquí (colgar, se acaba, dañada), pizarra lo de afuera, tinta lo apartado.
    // El símbolo es el del botón rápido de ese filtro (`FiltrosRapidos`): la insignia de la talla y el botón que se tocó son la misma figura.
    if (hoy) return { etiqueta: TEXTO_HOY[hoy], coincide: (f: FilaExistencias) => hoyDeTalla(f) === hoy, tono: hoy === "por_colgar" ? "ambar" : hoy === "mantener" ? "tinta" : "pizarra", esColgar: hoy === "por_colgar", simbolo: hoy === "por_colgar" ? IconoPercha : hoy === "mantener" ? Check : PackageX };
    if (condicion)
      return {
        etiqueta: ROTULO_CONDICION[condicion],
        coincide: (f: FilaExistencias) => tieneCondicion(f, condicion),
        tono: condicion === "apartadas" ? "tinta" : condicion === "sin_ventas" ? "pizarra" : "ambar",
        esColgar: false,
        simbolo: condicion === "apartadas" ? ShoppingBag : condicion === "sin_ventas" ? Moon : condicion === "se_acaban" ? Clock : TriangleAlert,
      };
    return null;
  }, [filtros.hoy, filtros.condicion]);
  const prendaAbierta = useMemo(() => (abierta ? (agruparPorPrenda(stock).find((p) => p.clave === abierta.clave) ?? null) : null), [abierta, stock]);
  // Marcar varias y llevarlas a otra pantalla (Bajar al piso, Trasladar, Etiquetas) solo en la sede activa: esas pantallas
  // trabajan siempre sobre la sede de quien las abre, y lo marcado mirando otra se perdería en silencio al llegar.
  const conSeleccion = enSedeActiva;
  const filasMarcadas = useMemo(() => stock.filter((f) => marcadas.has(f.varianteId)), [stock, marcadas]);
  function abrirPrenda(p: Pick<PrendaAgrupada, "clave">, varianteId?: string) {
    setAbierta({ clave: p.clave, varianteId });
  }
  /** Las acciones rápidas de la tarjeta y «Colgar primero» (maqueta: «rapida»): abren el panel YA en su paso, en la talla que más
   *  conviene. Colgar: si al modelo le falta algo en el piso, «Colgar varias» (todas sus tallas y colores); si no, la talla con más
   *  en el almacén. Subir: siempre «Subir varias» (la tabla del modelo). Enviar: la que más tiene guardada. */
  function lanzarDesdeTarjeta(prenda: PrendaAgrupada<FilaExistencias>, tipo: "colgar" | "subir" | "enviar") {
    const modelo = coloresDelModelo(stock, prenda.productoId);
    if (tipo === "colgar" && tallasQueFaltan(modelo).size > 0) {
      setAbierta({ clave: prenda.clave, flujo: { tipo: "colgarVarias", datos: { cant: {} } } });
      return;
    }
    // «Subir a almacén» de la tarjeta abre SIEMPRE la tabla del modelo entero, como «Colgar en el piso» (Felipe, 2026-10-08): se
    // descuelgan varias tallas y colores en una sola operación.
    if (tipo === "subir") {
      if (!modelo.some((c) => c.tallas.some((t) => (t.pisoDisponible ?? 0) > 0))) return;
      setAbierta({ clave: prenda.clave, flujo: { tipo: "subirVarias", datos: { cant: {} } } });
      return;
    }
    const t = [...prenda.tallas].filter((x) => (x.almacenDisponible ?? 0) > 0).sort((x, y) => (y.almacenDisponible ?? 0) - (x.almacenDisponible ?? 0))[0];
    if (!t) return;
    setAbierta({ clave: prenda.clave, varianteId: t.varianteId, flujo: { tipo } });
  }
  function alternarPrenda(p: PrendaAgrupada<FilaExistencias>) {
    setMarcadas((previas) => alternarMarcasDePrenda(previas, p.tallas.map((f) => f.varianteId)));
  }
  /** La casilla del encabezado: si ya están todas las de esta página, las desmarca; si no, las marca todas (por talla, como el resto). */
  function alternarVarias(ids: readonly string[]) {
    setMarcadas((previas) => {
      const todas = ids.length > 0 && ids.every((id) => previas.has(id));
      const siguientes = new Set(previas);
      for (const id of ids) {
        if (todas) siguientes.delete(id);
        else siguientes.add(id);
      }
      return siguientes;
    });
  }
  /** Un código leído (la pistola o la cámara): abre la prenda parada en esa talla. Si no es de ninguna prenda de esta sede,
   *  queda escrito en el buscador y el estado vacío explica por qué no aparece. `antes`: lo que la persona tenía escrito en el
   *  buscador antes de que la pistola escribiera encima; vuelve a su sitio (el filtro que tenía puesto no se pierde). `null`: la
   *  lectura llegó con el cursor fuera del buscador y lo escrito no se toca. */
  function abrirPorCodigo(codigo: string, antes: string | null = ""): boolean {
    const f = tallaPorCodigo(stock, codigo);
    if (!f) {
      setBusqueda(codigo.trim());
      return false;
    }
    if (antes !== null) setBusqueda(antes);
    // Como la maqueta: la etiqueta leída abre el panel de ESA talla, sin salir de las tarjetas.
    abrirPrenda(agruparPorPrenda([f])[0], f.varianteId);
    return true;
  }

  // La pistola, la misma pieza de Vender (`usePistola`): escanear abre el panel lateral de esa talla, mande o no Enter la pistola,
  // esté el cursor en el buscador (lo leído no se pega a lo que había escrito) o fuera de él. Fuera, `leer` no mueve el foco: con
  // el panel abierto, 1–7 son sus atajos y no se le pueden robar (el panel ya ignora un dígito que llega en ráfaga).
  const buscadorRef = useRef<HTMLInputElement>(null);
  usePistola(buscadorRef, {
    fuera: "leer",
    // Fuera del buscador nadie tocó lo escrito: si la talla aparece, se queda como estaba.
    alLeer: ({ codigo, antes, dentro }) => abrirPorCodigo(codigo, dentro ? antes : null),
  });

  // «Ver recomendaciones» / «Ver análisis de cobertura» ya no viven en Existencias (rediseño 2026-09-28, cabecera de
  // «Prioridades de hoy» más abajo): `abrirDesdeRecomendacion` (main, PR #575) resolvía un clic dentro de ese overlay
  // retirado — sin overlay, sin destino. La cobertura sigue disponible en Análisis; las recomendaciones, en «Acción hoy»
  // de cada fila y en la tarjeta «Reponer a piso hoy».


  // «Para hoy»: las tareas de la sede y su botón. «Por colgar» y «sin nada atrás» con la regla de «Hoy» (la misma del filtro y de
  // cada prenda); los nombres con los que empezar, en el orden de la lista del día del motor (lo vendido ayer primero). «Bajar al
  // piso» llega con la lista cargada si cabe en la URL.
  const filasPorColgar = cuentaPorColgar.filas;
  const tareasHoy = useMemo(
    () =>
      tareasParaHoy({
        separa,
        porColgar: entradaPorColgar(cuentaPorColgar),
        // Con el piso sin cuadrar, o con el motor caído, «por colgar» queda en 0: sin esto «Para hoy» decía «Todo al día».
        piso: { enPausa: cuentaPorColgar.enPausa, fallo: planFallo !== null },
        // Lo que ya viene en camino no se pide de nuevo (revisión 2026-10-04: una talla nueva que LIM le envía a TRU salía a la vez en
        // «en camino» y en «pídela a otra sede»).
        sinStockAtras: { tallas: stock.filter((f) => hoyDeTalla(f) === "sin_stock_atras" && f.enTransito === 0).length },
        sinRegistrar,
        danadas: danadosPendientes.length,
        resuelveDanadas: esLider && enSedeActiva,
        apartados: { vencidos: resumenApartados.vencidos },
        enCamino,
      }),
    [separa, cuentaPorColgar, planFallo, stock, sinRegistrar, danadosPendientes.length, esLider, enSedeActiva, resumenApartados.vencidos, enCamino]
  );
  function verHoy(tipo: "por_colgar" | "sin_stock_atras") {
    aplicar({ hoy: tipo });
    mostrarTablaFiltrada();
  }
  const hrefBajarPorColgar = puedeBajarAlPiso ? (urlBajarAlPiso(filasPorColgar) ?? "/inventario/bajar") : null;
  const accionesHoy: Partial<Record<TipoTareaHoy, AccionTarea>> = {
    por_colgar: hrefBajarPorColgar ? { texto: "Bajar al piso", href: hrefBajarPorColgar } : { texto: "Ver cuáles", onClick: () => verHoy("por_colgar") },
    // «Cuadrar el piso» (/inventario/cuadrar, ADR-0328 act. 3) con la misma condición que su acceso en la cabecera
    // (`puedeCuadrarPiso = puedeBajarAlPiso`): una función de Existencias (ADR-0306) en la sede activa que separa piso y almacén.
    // Confirmar el cuadre es de un líder: esa pantalla lo dice. Sin la condición, la fila informa y no lleva botón.
    piso_en_pausa: puedeBajarAlPiso ? { texto: "Cuadrar el piso", href: "/inventario/cuadrar" } : undefined,
    // Sin plan, «Bajar al piso» sigue sirviendo a mano: no depende de lo que recomienda el motor.
    piso_sin_calcular: puedeBajarAlPiso ? { texto: "Bajar al piso", href: "/inventario/bajar" } : undefined,
    // Con la sede en el enlace: la cifra es de ESTA sede, y sin ella un líder llegaba a la cola de todas sus tiendas. La lista vive en
    // Existencias (ADR-0330), bajo el mismo módulo que esta pantalla: quien ve la fila puede resolverla.
    sin_registrar: { texto: "Regularizar", href: `/inventario/por-regularizar?ubicacion=${ubicacionId}` },
    // Solo un líder, en su sede, decide qué se hace con una dañada (`ResolverDanadosModal`); los demás ven la lista.
    danadas: esLider && enSedeActiva ? { texto: "Decidir", onClick: () => setViendoDanados(true) } : { texto: "Ver cuáles", onClick: () => setViendoDanados(true) },
    apartados_vencidos: { texto: "Ver apartados", onClick: () => setViendoApartados(true) },
    traslados_atrasados: veTraslados ? { texto: "Ver traslados", href: "/inventario/traslados" } : undefined,
    en_camino: veTraslados ? { texto: "Ver traslados", href: "/inventario/traslados" } : undefined,
    sin_stock_atras: { texto: "Ver cuáles", onClick: () => verHoy("sin_stock_atras") },
  };
  // «Ver cuáles» junto a la frase solo donde el botón hace OTRA cosa (bajar): si el botón ya es «Ver cuáles», sobraría.
  const verCualesHoy: Partial<Record<TipoTareaHoy, () => void>> = hrefBajarPorColgar ? { por_colgar: () => verHoy("por_colgar") } : {};

  // Exporta lo que la colaboradora está viendo, no todo el inventario: usa
  // `filtradas` (lo que pinta la tabla, TODAS sus páginas —no solo la de la
  // vista—), así que si ya filtró por
  // categoría/talla/color/acción antes de exportar, el CSV trae eso y no de
  // más. Columnas Piso/Almacén/Acción hoy solo si esta ubicación las separa
  // (`separa`) — en Taller siempre son `null` y mostrar columnas vacías
  // en cada fila sería ruido, no dato (mismo criterio que ya usa la tabla).
  function exportarCsv() {
    // La columna «Marca» solo si la sede tiene alguna leída: con la lectura caída, una columna de «—» sería ruido.
    const conMarcaEnCsv = marcas.length > 0;
    const encabezados = conMarcaEnCsv ? ["Prenda", "Marca", "Código", "Talla", "Color", "Categoría"] : ["Prenda", "Código", "Talla", "Color", "Categoría"];
    if (separa) encabezados.push("Piso", "Almacén", "Cobertura piso", "Ritmo reciente", "Hoy");
    encabezados.push("Disponible", "En camino", "En la red");

    const filas = filtradas.map((f) => {
      const fila: (string | number)[] = conMarcaEnCsv
        ? [f.referencia, f.marca ?? "—", f.sku, f.talla ?? "—", f.color ?? "—", f.categoria ?? "—"]
        : [f.referencia, f.sku, f.talla ?? "—", f.color ?? "—", f.categoria ?? "—"];
      if (separa) {
        fila.push(
          f.piso ?? "—",
          f.almacen ?? "—",
          f.coberturaPiso ? textoCoberturaPiso(f.coberturaPiso) : "—",
          f.ritmoReciente ? textoRitmoReciente(f.ritmoReciente) : "—",
          ((h) => (h ? TEXTO_HOY[h] : "—"))(estadoHoyDeTalla(f))
        );
      }
      fila.push(f.disponible, f.enTransito, resumenRed(f.enRed)?.detalle ?? "—");
      return fila;
    });

    descargarCsv(`existencias_${new Date().toISOString().slice(0, 10)}.csv`, encabezados, filas);
  }

  // Columnas de «Por talla» (diseño aprobado, 2026-09-28): casilla | prenda | color y talla | Stock actual | Cobertura | Ritmo | En
  // camino | Acción hoy | En la red | ›. Las cuatro cifras miden 6.75 rem, «Acción hoy» 10.5 rem y el resto se reparte entre la prenda
  // y «En la red»; `minmax(10rem, …)` en la prenda, porque con `1fr` a secas (más `truncate`) una ventana angosta la dejaba en 0.
  //
  // Ese diseño exige ~1200 px de tarjeta, y en una laptop (MacBook Air 1440 px con el lateral abierto: 1086 px) «En la red» quedaba
  // cortada y solo se alcanzaba desplazando una barra que vive al pie de la lista. Lo que cada columna de cifras necesita de verdad
  // (medido en la app) es menos que lo que se le reserva, así que pasan a `minmax(mínimo del contenido, ancho aprobado)`: con espacio
  // de sobra miden lo aprobado; si falta, se comprimen parejo hasta su mínimo (el subtítulo «(Piso / Almacén)» de Stock actual pide
  // 6.25 rem; el título de las otras tres cabe en 5.5 rem; el chip «Por colgar · N uds», en 9.25 rem; color y talla, en 3 rem) sin
  // cortar ni partir nada. La prenda y «En la red» conservan su mínimo aprobado de 10 rem: «Disponible en 2 sedes: 11» mide 154 px y con
  // menos se corta la cifra, que es lo que la persona vino a leer. Además el espacio entre columnas baja de 16 a 12 px por debajo de
  // 1536 px (`2xl`): desde ahí queda exactamente el diseño aprobado. Va en la plantilla, y no en el encabezado y en las filas por
  // separado, para que los dos compartan siempre el mismo valor.
  //
  // Por debajo de ~1070 px de TARJETA (no de ventana: con el lateral abierto una laptop de 1366 px deja 1012 px) esas 10 columnas ya no
  // caben ni comprimidas, y no se puede esconder ninguna sin quitarle un dato a la asesora. Se hace lo que ya hacen `Recepciones` y
  // `Proveedores` con `@container` en la `Tabla`: lo menos decisivo se apila. «En la red» baja al renglón de «Acción hoy» (las dos
  // dicen qué hacer con la prenda: bajarla del almacén o pedirla a otra sede; en el celular ya van juntas) y se quita la flecha `›`.
  // Ahí la tabla cabe entera hasta ~870 px de tarjeta (~1230 px de ventana con el lateral abierto). Cada pieza «solo ancha» lleva la
  // misma condición (`@min-[1070px]`) en el encabezado, la plantilla y las filas: si cambia el umbral, cambia en los tres.
  // Donde no se separa piso y almacén (Taller): sin Cobertura, Ritmo ni Acción hoy, y cabe siempre.
  const plantilla = separa
    ? `${conSeleccion ? "sm:gap-x-3 2xl:gap-x-4 sm:grid-cols-[1.125rem_minmax(10rem,1fr)_3rem_minmax(6.25rem,6.75rem)_repeat(3,minmax(5.5rem,6.75rem))_minmax(10rem,1fr)] @min-[1070px]:grid-cols-[1.125rem_minmax(10rem,1fr)_3rem_minmax(6.25rem,6.75rem)_repeat(3,minmax(5.5rem,6.75rem))_minmax(9.25rem,10.5rem)_minmax(10rem,1fr)_1.25rem]" : "sm:gap-x-3 2xl:gap-x-4 sm:grid-cols-[minmax(10rem,1fr)_3rem_minmax(6.25rem,6.75rem)_repeat(3,minmax(5.5rem,6.75rem))_minmax(10rem,1fr)] @min-[1070px]:grid-cols-[minmax(10rem,1fr)_3rem_minmax(6.25rem,6.75rem)_repeat(3,minmax(5.5rem,6.75rem))_minmax(9.25rem,10.5rem)_minmax(10rem,1fr)_1.25rem]"}`
    : `${conSeleccion ? "sm:grid-cols-[1.125rem_minmax(10rem,1fr)_3.5rem_7rem_7rem_minmax(9rem,1fr)_1.25rem]" : "sm:grid-cols-[minmax(10rem,1fr)_3.5rem_7rem_7rem_minmax(9rem,1fr)_1.25rem]"}`;

  // Lo que la persona ve en los filtros, para nombrarlo si dejan la tabla en blanco (y para que el estado vacío los quite de a uno).
  const filtroMarcaElegida = marcaEfectiva === TODAS ? null : marcaEfectiva;
  const filtroCategoriaElegida = categoria === TODAS ? null : categoria;
  const filtrosActivos: FiltroActivo[] = [];
  if (categoria !== TODAS) filtrosActivos.push({ clave: "categoria", etiqueta: "Categoría", valor: categoria });
  if (marcaEfectiva !== TODAS) filtrosActivos.push({ clave: "marca", etiqueta: "Marca", valor: marcaEfectiva });
  if (tallasElegidas.length) filtrosActivos.push({ clave: "talla", etiqueta: "Talla", valor: tallasElegidas.join(", ") });
  const coloresTexto = [...familiasElegidas.map((x) => `familia ${textoDeFamilia(x)}`), ...coloresElegidos];
  if (coloresTexto.length) filtrosActivos.push({ clave: "color", etiqueta: "Color", valor: coloresTexto.join(", ") });
  if (filtros.hoy) filtrosActivos.push({ clave: "hoy", etiqueta: "Hoy", valor: TEXTO_HOY[filtros.hoy] });
  if (filtros.condicion) filtrosActivos.push({ clave: "condicion", etiqueta: "Condición", valor: ROTULO_CONDICION[filtros.condicion] });
  // Productos que el catálogo tiene pero esta sede NO (ni una fila de stock) y que coinciden con lo escrito. Se avisa aunque haya
  // resultados: quien busca «cayla» y ve Top Aurora («Cayla 2») debe saber que los pantalones de la marca CAYLA existen y aquí no llegaron.
  const sinRastroAqui = useMemo(
    () => (busqueda.trim() ? sinStockQueCoincide(busqueda, indiceBusqueda.vocabulario, sinStock, { filtroMarca: filtroMarcaElegida, filtroCategoria: filtroCategoriaElegida }) : { productos: [], total: 0 }),
    [busqueda, indiceBusqueda, sinStock, filtroMarcaElegida, filtroCategoriaElegida]
  );
  const sinNadaPorColgar = porColgarElegido && cuentaPorColgar.tallas === 0;
  const explicacionVacio =
    filtradas.length === 0 && stock.length > 0 && !sinNadaPorColgar
      ? explicarVacio({
          consulta: busqueda,
          sede: sedeNombre,
          filtros: filtrosActivos,
          vocabulario: indiceBusqueda.vocabulario,
          palabras: palabrasBuscables(stock),
          // «¿Cuántas prendas se verían si esto no estuviera?»: el mismo filtro de la tabla, sin el texto o sin un filtro visual.
          // En productos (modelos): «Quitar Color · 2 productos» trae 2 productos. Con un caso de «Hoy» la lista va por prendas
          // (`tarjetasDeExistencias`) y este número sigue en productos, con su palabra: pendiente en el backlog de ADR-0331 act. c.
          contar: (consulta, omitir) => new Set(filtrarExistencias(indiceBusqueda, { ...elegidos, q: consulta }, omitir).filas.map((f) => f.productoId)).size,
          sinStock,
          filtroMarca: filtroMarcaElegida,
          filtroCategoria: filtroCategoriaElegida,
        })
      : null;
  function quitarFiltro(clave: ClaveFiltro) {
    if (clave === "categoria") setCategoria(TODAS);
    else if (clave === "marca") setMarca(TODAS);
    else if (clave === "talla") aplicar({ talla: null });
    else if (clave === "color") aplicar({ color: null, familia: null });
    else if (clave === "hoy") aplicar({ hoy: null });
    else aplicar({ condicion: null });
  }

  const hrefBajarMarcadas = puedeBajarAlPiso ? urlBajarAlPiso(filasMarcadas) : null;
  const hrefTrasladarMarcadas = veTraslados ? urlTrasladar(filasMarcadas) : null;
  const hrefEtiquetasMarcadas = urlEtiquetas(filasMarcadas);
  // El rótulo es del MODELO (ADR-0366): las tallas marcadas se juntan en sus modelos, sin repetir.
  const hrefRotulosMarcadas = filasMarcadas.length > 0 ? urlRotulos(filasMarcadas.flatMap((f) => (f.productoId ? [f.productoId] : [])), { desde: "existencias" }) : null;
  const prendasMarcadas = new Set(filasMarcadas.map((f) => clavePercha(f))).size;

  return (
    // En el celular, aire al final para que el botón fijo «Escanear» no tape la última prenda.
    <div className="space-y-6 max-sm:space-y-4 max-sm:pb-24">
      {/* «Para hoy» ya no ocupa la primera pantalla (Felipe, 2026-10-05: «como en la maqueta», que arranca con la barra y las tarjetas). Sus tareas
          —cuadrar el piso, ventas sin registrar, dañadas, apartados vencidos— siguen a un toque, en el botón «Pendientes» de la barra (ventana
          `viendoPendientes`, más abajo): sin ella, «Regularizar» y «Decidir» no tendrían entrada desde Existencias (ADR-0330 sacó «Regularizar» de la cabecera). */}

      {/* Guía oficial (2026-09-22, ADR-0169): los filtros y la tabla viven en UNA tarjeta — lo que se filtra
          y lo filtrado se leen como una sola cosa. Los filtros son cajas hundidas en hueso, sin etiqueta visible.
          `scroll-mt-24` compensa la cabecera fija: con menos, al llegar aquí (paginar, «Reponer a piso hoy») el
          buscador quedaba debajo de ella.

          Con «Ver detalle» (la tabla) sigue siendo UNA tarjeta. Con las tarjetas de prenda (la lista de entrada) los filtros
          son la tarjeta y las prendas van debajo, cada una en la suya. */}
      <div ref={tarjetaTablaRef} className={`scroll-mt-24 ${verDetalle ? "card-cayla overflow-hidden" : ""}`}>
      {stock.length > 0 && (
        // La barra de filtros con la estructura de Productos (2026-10-03, `FiltrosExistencias`): buscador, «Filtros · N», panel de
        // píldoras en dos filas, chips de lo puesto, y en la fila del conteo «Copiar enlace», la vista y «Ordenar por».
        <div className={`px-4 pb-3 pt-4 sm:px-5 ${verDetalle ? "" : "card-cayla"}`}>
          <FiltrosExistencias
            busqueda={busqueda}
            onTeclear={teclear}
            buscadorRef={buscadorRef}
            onSoltar={soltarBusqueda}
            // La pistola escribe el código y manda Enter: si es el código exacto de una talla, se abre esa prenda. Si no (un nombre,
            // un pedazo), Enter no hace nada y la lista sigue filtrada por lo escrito.
            onEnter={() => {
              if (tallaPorCodigo(stock, busqueda)) abrirPorCodigo(busqueda);
            }}
            // Corto para que quepa entero a 375 px junto al botón «Filtros» (se cortaba en «…color o tall»). El color se sigue
            // pudiendo escribir: el buscador lo entiende igual.
            placeholder={mostrarMarca ? "Prenda, marca o código…" : "Prenda, talla o código…"}
            separa={separa}
            categorias={categorias}
            tallas={tallas}
            colores={coloresConMuestra}
            marcas={mostrarMarca ? marcas : null}
            elegidos={elegidos}
            conteos={conteos}
            onCambiar={(cambios) => aplicar(cambios)}
            onLimpiar={limpiarFiltros}
            conteo={conteo}
            // El piso sin cuadrar ya no es una franja de texto sobre las tarjetas: va en el atajo «Por colgar» (pausa + su explicación).
            enPausa={separa && !planFallo ? tallasEnPausa : 0}
            avisoPausa={avisoPausaDelPiso(sedeNombre, tallasEnPausa)}
            panelInicial={panelFiltros}
            onEscanear={() => setCamara(true)}
            // `orden` solo ordena las tarjetas: la tabla conserva su orden.
            orden={
              verDetalle
                ? null
                : { valor: ordenEfectivo, porDefecto: "relevancia", opciones: opcionesDeOrden, onValor: (v) => setOrden(v as OrdenPrendas) }
            }
            // El anillo «N de M hoy» de la maqueta, al costado de «Filtros» (2026-10-06): lo resuelto de la foto del día. Abre «Pendientes»
            // (cuadrar el piso, ventas sin registrar, dañadas…). En el Taller, que no tiene piso que colgar, el botón de siempre.
            alLadoDeFiltros={
              esTienda ? (
                <AnilloMision ubicacionId={ubicacionId} filas={stock} tiendas={tiendasParaPedir} pendientes={tareasHoy.length} onAbrir={() => setViendoPendientes(true)} />
              ) : (
                <button
                  type="button"
                  onClick={() => setViendoPendientes(true)}
                  title="Lo pendiente de la sede, en el orden en que conviene hacerlo"
                  className="btn-cayla btn-secundario h-10 shrink-0 gap-2 px-3 py-1 text-[13px] text-taupe"
                >
                  <ListChecks aria-hidden className="h-4 w-4" strokeWidth={1.5} />
                  <span className="max-sm:sr-only">Pendientes</span>
                  {tareasHoy.length > 0 && <b className="rounded-full bg-ambar/[0.13] px-1.5 text-[11px] font-semibold tabular-nums text-ambar-profundo">{tareasHoy.length}</b>}
                </button>
              )
            }
            // Tarjetas, tabla o una fila por talla: en «Filtros ▸ Vista» (2026-10-06, tarde), ya no como icono suelto en la barra.
            verComo={{
              valor: !verDetalle ? "tarjetas" : vista === "prenda" ? "tabla" : "talla",
              onValor: (v) => {
                if (v === "tarjetas") {
                  // Las tarjetas no tienen el cajón de la tabla: al volver a ellas se cierra.
                  if (verDetalle) setAbierta(null);
                  setVerDetalle(false);
                } else {
                  setVerDetalle(true);
                  setVista(v === "tabla" ? "prenda" : "talla");
                }
                setPagina(1);
              },
            }}
            nota={
              <>
                {/* La aclaración de «Por colgar», solo si ese caso de «Hoy» está elegido y hay algo por colgar (sobre una lista vacía,
                    «elige cuáles» contradice al «Nada por colgar» de abajo). Dice una de dos cosas:
                    · si otro filtro esconde tallas, cuántas se ven de las que cuenta el resumen — mira toda la sede, y ver 3 filas
                      bajo «22 tallas» sin saber por qué es un callejón;
                    · si se ven todas, que no es una orden de bajar todo (riesgo que nombró el plan): hay tallas que se guardan a
                      propósito, la lista es para decidir. */}
                {separa && porColgarElegido && cuentaPorColgar.tallas > 0 && (
                  <p className="text-xs leading-snug text-taupe">
                    {filtradas.length < cuentaPorColgar.tallas ? (
                      <>
                        Ves {filtradas.length} de {cuentaPorColgar.tallas}: la búsqueda u otro filtro esconde el resto.{" "}
                        <button type="button" onClick={quitarFiltrosMenosHoy} className="btn-enlace text-xs">
                          Ver todas
                        </button>
                      </>
                    ) : (
                      "Algunas se guardan a propósito (fin de temporada): no es una orden de bajar todo, elige cuáles van al piso."
                    )}
                  </p>
                )}
              </>
            }
          />
        </div>
      )}

      {separa && coberturaFallo && stock.length > 0 && <p className={`px-4 pb-2 text-xs text-ambar sm:px-5 ${verDetalle ? "" : "pt-3"}`}>{coberturaFallo}</p>}
      {separa && planFallo && stock.length > 0 && <p className={`px-4 pb-2 text-xs text-ambar sm:px-5 ${verDetalle ? "" : "pt-3"}`}>{planFallo}</p>}
      {/* El piso sin cuadrar (antes, una franja de texto aquí) lo dice el atajo «Por colgar», en pausa, y la lista vacía de ese atajo. */}
      {/* Si la marca no se pudo leer, se dice: sin el aviso, quien escribe una marca y no ve nada creería que no hay prendas. */}
      {marcaFallo && stock.length > 0 && <p className={`px-4 pb-2 text-xs text-ambar sm:px-5 ${verDetalle ? "" : "pt-3"}`}>{marcaFallo} Mientras tanto no se puede buscar ni filtrar por marca.</p>}
      {/* Hay resultados, pero también productos del catálogo que esta sede no recibió (con el vacío, los cuenta el propio estado vacío). */}
      {/* Desde 3 letras: con una sola («b») casi todo el catálogo «coincide» y la línea aparecía y desaparecía en cada tecla, moviendo la tabla. */}
      {sinRastroAqui.total > 0 && filtradas.length > 0 && busqueda.trim().length >= 3 && (
        <p className={`nota-cayla mx-4 mb-3 sm:mx-5 ${verDetalle ? "" : "mt-3"}`}>
          {textoSinStock(sedeNombre)}{" "}
          {sinRastroAqui.productos.map((p, i) => (
            <span key={p.id}>
              {i > 0 && ", "}
              {verProductos ? (
                <Link href={`/productos?q=${encodeURIComponent(p.referencia)}`} className="underline decoration-tinta/30 underline-offset-2 hover:text-rojo">
                  {p.referencia}
                </Link>
              ) : (
                p.referencia
              )}
              {p.marca ? ` (${p.marca})` : ""}
            </span>
          ))}
          {sinRastroAqui.total > sinRastroAqui.productos.length && ` y ${sinRastroAqui.total - sinRastroAqui.productos.length} más`}.
        </p>
      )}
      {stock.length === 0 ? (
        <p className={`p-5 text-sm text-taupe ${verDetalle ? "" : "card-cayla"}`}>Esta ubicación no tiene stock todavía.</p>
      ) : filtradas.length === 0 ? (
        // «para vender», no «colgada»: la regla mira lo disponible, y lo colgado pero apartado no cuenta. Dice CUÁLES tallas piden
        // piso (las del centro y lo vendido): una talla extrema guardada sin ventas no es «por colgar».
        sinNadaPorColgar && tallasEnPausa > 0 && !planFallo ? (
          // «Por colgar» en pausa: la lista está vacía porque el piso no se cuadró, no porque todo cuelgue. Lo dice aquí, donde se pregunta.
          <div className={`grid gap-2 p-5 text-sm text-taupe ${verDetalle ? "border-t border-sand" : "card-cayla mt-3.5"}`}>
            <p>{avisoPausaDelPiso(sedeNombre, tallasEnPausa)}</p>
            {puedeBajarAlPiso && (
              <Link href="/inventario/cuadrar" className="btn-cayla btn-secundario btn-chico justify-self-start">
                Cuadrar el piso
              </Link>
            )}
          </div>
        ) : sinNadaPorColgar || !explicacionVacio ? (
          <p className={`p-5 text-sm text-taupe ${verDetalle ? "border-t border-sand" : "card-cayla mt-3.5"}`}>Nada por colgar: las tallas del centro y lo vendido ayer u hoy tienen al menos una para vender en el piso.</p>
        ) : (
          <div className={verDetalle ? "" : "card-cayla mt-3.5 overflow-hidden [&>div]:border-t-0"}>
          <ExistenciasVacio
            explicacion={explicacionVacio}
            sede={sedeNombre}
            hayTexto={busqueda.trim() !== ""}
            // Al usar un botón del vacío, el bloque se desmonta (vuelven las filas) y el foco caía al <body>: quien navega con teclado o lector
            // de pantalla perdía su lugar. El buscador es el sitio natural para seguir.
            onQuitarTermino={(consulta) => {
              setBusqueda(consulta);
              enfocarBuscador();
            }}
            onQuitarFiltro={(clave) => {
              quitarFiltro(clave);
              enfocarBuscador();
            }}
            onLimpiarTodo={() => {
              limpiarFiltros();
              enfocarBuscador();
            }}
            hrefCatalogo={verProductos ? (referencia) => `/productos?q=${encodeURIComponent(referencia)}` : undefined}
          />
          </div>
        )
      ) : !verDetalle ? (
        // La lista de entrada: una tarjeta por prenda. Mismas páginas, mismo «Exportar CSV» y misma leyenda que la tabla.
        <div className="mt-3.5">
          <ExistenciasTarjetas
            modelos={paginaTarjetas.filas}
            separa={separa}
            mostrarMarca={mostrarMarca}
            tallasDePrenda={tallasDePrenda}
            puedeReponer={puedeReponer}
            // Las acciones de la tarjeta abren el panel de la talla YA en su paso (maqueta: sin ventana aparte).
            puedeEnviar={veTraslados && enSedeActiva && destinosParaEnviar.length > 0}
            onEnviar={(_tallas, prenda) => prenda && lanzarDesdeTarjeta(prenda, "enviar")}
            // «Colgar en el piso» del pie abre SIEMPRE «Colgar varias», la tabla del modelo (Felipe, 2026-10-07).
            onColgarVarias={(prenda) => setAbierta({ clave: prenda.clave, flujo: { tipo: "colgarVarias", datos: { cant: {} } } })}
            puedeAjustar={puedeAjustarAqui}
            onAjustar={(prenda, fila) => setAbierta({ clave: prenda.clave, varianteId: fila.varianteId, flujo: { tipo: "ajustar" } })}
            onFicha={(prenda) => setAbierta({ clave: prenda.clave, vista: "ficha" })}
            onSubir={(prenda) => lanzarDesdeTarjeta(prenda, "subir")}
            puedePedir={veTraslados && esTienda && enSedeActiva}
            sedesParaPedir={sedesParaPedir}
            onPedir={(prenda, fila) => {
              const mejor = mejorOrigen(fila.enRed, sedesParaPedir);
              setAbierta({ clave: prenda.clave, varianteId: fila.varianteId, flujo: mejor ? { tipo: "pedir", datos: { para: "reponer", origenId: mejor.id, n: 1 }, paso: 2 } : { tipo: "pedir" } });
            }}
            marcaDelFiltro={marcaDelFiltro}
            tallasCompletas={soloHoyOCondicion ? (prenda) => prendaPorClave.get(prenda.clave)?.tallas ?? prenda.tallas : undefined}
            // Tocar una talla abre el panel de ESA talla sin salir de las tarjetas.
            onAbrirTalla={(prenda, fila) => abrirPrenda(prenda, fila.varianteId)}
            // Tocar una talla con algo en almacén: el panel de esa talla, ya en «Colgar en el piso» (Felipe, 2026-10-07).
            onColgarTalla={(prenda, fila) => setAbierta({ clave: prenda.clave, varianteId: fila.varianteId, flujo: { tipo: "colgar" } })}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-1 pt-4 text-xs text-taupe">
            <span className="flex flex-wrap items-center gap-3">
              <span>
                {paginaTarjetas.totalPaginas > 1 ? `Mostrando ${paginaTarjetas.desde}–${paginaTarjetas.hasta} de ` : "Mostrando "}
                {conteo.total} {conteo.total === 1 ? conteo.unidad.uno : conteo.unidad.varios} · {filtradas.length} {filtradas.length === 1 ? "talla" : "tallas"}
              </span>
              <PaginacionLocal pagina={paginaTarjetas.pagina} totalPaginas={paginaTarjetas.totalPaginas} onPagina={irAPagina} />
              <button type="button" onClick={exportarCsv} className="btn-cayla btn-secundario btn-chico">
                Exportar CSV
              </button>
            </span>
            {/* La leyenda de la tabla de las tarjetas (2026-10-07): qué dicen sus dos tonos. */}
            {separa && (
              <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden className="inline-block h-3 w-3.5 rounded-[3px] bg-ambar/[0.14]" />
                  Falta colgar
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden className="inline-block h-3 w-3.5 rounded-[3px] bg-rojo/[0.11]" />
                  Se acabó en esta sede
                </span>
                <span>Toca una talla para colgarla</span>
              </span>
            )}
          </div>
        </div>
      ) : vista === "prenda" ? (
        <Tabla className="rounded-none border-0 border-t border-sand bg-transparent">
          <ExistenciasPorPrenda
            prendas={paginaPrendas.filas}
            separa={separa}
            mostrarMarca={mostrarMarca}
            conSeleccion={conSeleccion}
            seleccion={marcadas}
            onAlternar={alternarPrenda}
            onAlternarTodas={(pagina) => alternarVarias(pagina.flatMap((p) => p.tallas.map((f) => f.varianteId)))}
            abiertaClave={abierta?.clave ?? null}
            onAbrir={abrirPrenda}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-xs text-taupe">
            <span className="flex flex-wrap items-center gap-3">
              <span>
                {paginaPrendas.totalPaginas > 1 ? `Mostrando ${paginaPrendas.desde}–${paginaPrendas.hasta} de ` : "Mostrando "}
                {prendas.length} {prendas.length === 1 ? "prenda" : "prendas"} · {filtradas.length} {filtradas.length === 1 ? "talla" : "tallas"}
              </span>
              <PaginacionLocal pagina={paginaPrendas.pagina} totalPaginas={paginaPrendas.totalPaginas} onPagina={irAPagina} />
              <button type="button" onClick={exportarCsv} className="btn-cayla btn-secundario btn-chico">
                Exportar CSV
              </button>
            </span>
            {separa && (
              <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden className="inline-block h-2.5 w-3.5 rounded-sm border border-taupe/25 bg-hueso" />
                  Piso · almacén de cada talla
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden className="inline-block h-2.5 w-3.5 rounded-sm border border-dashed border-taupe/50" />
                  Sin stock aquí
                </span>
              </span>
            )}
          </div>
        </Tabla>
      ) : (
        <Tabla className="@container rounded-none border-0 border-t border-sand bg-transparent">
          {/* Toda la tabla centrada (Felipe, 2026-09-15) salvo la prenda, que va a la izquierda como en su diseño, y «Acción hoy» y
              «En la red», que se leen de corrido (diseño aprobado, 2026-09-28). La tabla COMUNICA el estado y no ofrece acciones:
              tocar una fila abre el cajón de la prenda, donde viven Reponer, Trasladar, Ajustar, Etiquetas e Historial. */}
          <Encabezado
            plantilla={plantilla}
            grande
            columnas={[
              ...(conSeleccion
                ? [
                    {
                      titulo: (
                        <Casilla
                          marcada={paginaActual.filas.length > 0 && paginaActual.filas.every((f) => marcadas.has(f.varianteId))}
                          aMedias={paginaActual.filas.some((f) => marcadas.has(f.varianteId)) && !paginaActual.filas.every((f) => marcadas.has(f.varianteId))}
                          onCambio={() => alternarVarias(paginaActual.filas.map((f) => f.varianteId))}
                          etiqueta="Marcar todas las tallas de esta página"
                        />
                      ),
                    },
                  ]
                : []),
              { titulo: "Prenda / talla" },
              { titulo: "" },
              ...(separa
                ? [
                    { titulo: "Stock actual", subtitulo: "(Piso / Almacén)", alinear: "centro" as const, ayuda: "Lo utilizable de hoy en esta sede — nunca cuarentena, nunca lo apartado para clientes" },
                    { titulo: "Cobertura piso", alinear: "centro" as const, ayuda: "Cuánto dura el piso de hoy al Ritmo reciente" },
                    { titulo: "Ritmo reciente", alinear: "centro" as const, ayuda: "Ventas comerciales ÷ días de exposición en piso, últimos 7 días — toca para ver el detalle" },
                    { titulo: "En camino", alinear: "centro" as const },
                    // Tarjeta angosta: «En la red» vive debajo del chip de esta misma columna (ver la fila), y el título lo dice.
                    { titulo: <>Hoy<span className="@min-[1070px]:hidden"> · En la red</span></> },
                    { titulo: "En la red", clase: "hidden @min-[1070px]:block" },
                    { titulo: "", clase: "hidden @min-[1070px]:block" },
                  ]
                : [
                    { titulo: "Stock actual", alinear: "centro" as const },
                    { titulo: "En camino", alinear: "centro" as const },
                    { titulo: "En la red" },
                    { titulo: "" },
                  ]),
            ]}
          />
          {paginaActual.filas.map((f) => {
            const red = resumenRed(f.enRed);
            const tallaColor = [f.talla, f.color].filter(Boolean).join("/");
            const clave = clavePercha(f);
            // La fila de la talla tocada (o, si el cajón se abrió desde «Por prenda», todas las de esa prenda) se ve seleccionada.
            const filaAbierta = abierta?.clave === clave && (abierta.varianteId ? abierta.varianteId === f.varianteId : true);
            const marcadaFila = marcadas.has(f.varianteId);
            return (
              <div
                key={f.varianteId}
                role="button"
                tabIndex={0}
                aria-label={`Abrir ${f.referencia}${tallaColor ? ` ${tallaColor}` : ""}`}
                aria-current={filaAbierta || undefined}
                onClick={(e) => {
                  // Un modal o un popover abierto desde esta fila le entrega sus clics por React (ADR-0128): solo cuenta el que nace aquí.
                  if (!e.currentTarget.contains(e.target as Node)) return;
                  abrirPrenda({ clave }, f.varianteId);
                }}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    abrirPrenda({ clave }, f.varianteId);
                  }
                }}
                className={`grid fila-cayla cursor-pointer gap-x-4 gap-y-2.5 px-5 py-1.5 transition-colors sm:items-center ${plantilla} ${
                  filaAbierta ? "bg-hueso/80" : marcadaFila ? "bg-sand/35" : "hover:bg-sand/25 focus-visible:bg-sand/25"
                }`}
              >
                {/* Celular: casilla + prenda arriba. Escritorio: `sm:contents` devuelve cada pieza a su columna, en el orden del encabezado. */}
                <div className="flex min-w-0 items-center gap-3 sm:contents">
                  {conSeleccion && (
                    <span className="flex items-center">
                      <Casilla
                        // La fila abierta se ve seleccionada (casilla y fondo), aunque no esté entre las marcadas para la barra de abajo.
                        marcada={marcadaFila || filaAbierta}
                        onCambio={() => setMarcadas((previas) => alternarMarcasDePrenda(previas, [f.varianteId]))}
                        etiqueta={`Marcar ${f.referencia}${tallaColor ? ` ${tallaColor}` : ""}`}
                      />
                    </span>
                  )}
                  <span className="flex min-w-0 flex-1 items-center gap-3.5">
                    <MiniaturaPrenda fotoUrl={f.fotoUrl} colorHex={f.colorHex} tamano="md" {...categoriaDe(f)} />
                    <span className="min-w-0">
                      <span className="block truncate text-[13.5px] font-semibold leading-snug text-tinta" title={mostrarMarca && f.marca ? `${f.referencia} · ${f.marca}` : f.referencia}>
                        {f.referencia}
                        {mostrarMarca && f.marca && <span className="font-normal text-taupe"> · {f.marca}</span>}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] tracking-wide text-taupe/80">{f.sku}</span>
                      {/* Solo celular: el color y la talla, que en escritorio tienen su propia columna. */}
                      <span className="mt-0.5 flex items-center gap-2 text-xs text-taupe sm:hidden">
                        {f.color && <MuestraColor nombre={f.color} hex={f.colorHex} compacta />}
                        {f.talla}
                      </span>
                    </span>
                  </span>
                </div>
                <span className="hidden items-center gap-2 overflow-visible whitespace-nowrap text-xs text-tinta/65 sm:flex">
                  {f.color && <MuestraColor nombre={f.color} hex={f.colorHex} compacta />}
                  {f.talla}
                </span>
                {/* Las cifras (Stock actual, Cobertura piso, Ritmo reciente, En camino) amontonadas y pegadas a la izquierda
                    eran ilegibles en celular (Felipe, 2026-09-25): acá se agrupan en una grilla de 2×2 con cada una en su propia
                    tarjetita, para que se lean como datos separados, no como una sola oración. `sm:contents` disuelve este
                    envoltorio desde escritorio: ahí cada cifra vuelve a ser su propia columna, en el orden del encabezado — la
                    plantilla `sm:grid-cols` de arriba no cambia. */}
                <div className="col-span-full grid grid-cols-2 gap-2 border-t border-sand/70 pt-3 sm:contents sm:border-0 sm:pt-0">
                  {/* «Stock actual P/A» (2026-09-25, sección 4 del pedido): fusiona Piso·Almacén y Disponible. En Taller (sin
                      separación) es un solo número: no hay un split que reportar con rigor. Las cifras son las LIBRES
                      (`pisoDisponible`/`almacenDisponible`, 2026-09-26): las mismas que decide «Acción hoy» y que muestra el modal de
                      Reponer; lo apartado va debajo. */}
                  <span
                    className={celda("centro", "rounded-lg bg-hueso/60 px-2 py-1.5 sm:rounded-none sm:bg-transparent sm:px-0 sm:py-0 text-[15px] tabular-nums")}
                    title={
                      separa
                        ? `Libre en piso: ${f.pisoDisponible ?? 0}\nLibre en almacén: ${f.almacenDisponible ?? 0}\nTotal libre: ${f.disponible}${f.apartado > 0 ? `\nApartadas para clientes: ${f.apartado}` : ""}`
                        : undefined
                    }
                  >
                    <span className="label-cayla mb-0.5 block text-[10px] text-tinta/45 sm:hidden">Stock actual</span>
                    {separa ? (
                      <>
                        <span className="text-tinta">{f.pisoDisponible}</span>
                        <span className="text-tinta/45"> / </span>
                        <span className="text-tinta">{f.almacenDisponible}</span>
                      </>
                    ) : (
                      <span className="font-semibold text-tinta">{f.disponible}</span>
                    )}
                    {f.apartado > 0 && (
                      <span className="block text-[10px] font-normal leading-3 text-ambar-profundo" title="Siguen en la tienda, pero apartadas para clientes: no se pueden vender">
                        {f.apartado} {f.apartado === 1 ? "apartada" : "apartadas"}
                      </span>
                    )}
                  </span>
                  {separa && (
                    <span className={celda("centro", "rounded-lg bg-hueso/60 px-2 py-1.5 sm:rounded-none sm:bg-transparent sm:px-0 sm:py-0")}>
                      <span className="label-cayla mb-0.5 block text-[10px] text-tinta/45 sm:hidden">Cobertura piso</span>
                      <CeldaCoberturaPiso f={f} />
                    </span>
                  )}
                  {separa && (
                    // El botón del detalle no abre el cajón de la prenda: el clic se queda aquí.
                    <span
                      onClick={(e) => e.stopPropagation()}
                      className={celda("centro", "rounded-lg bg-hueso/60 px-2 py-1.5 sm:rounded-none sm:bg-transparent sm:px-0 sm:py-0 overflow-visible")}
                    >
                      <span className="label-cayla mb-0.5 block text-[10px] text-tinta/45 sm:hidden">Ritmo reciente</span>
                      <RitmoRecientePopover ritmo={f.ritmoReciente ?? null} referencia={f.referencia} sku={f.sku} minDiasExposicionRitmo={politica.minDiasExposicionRitmo} />
                    </span>
                  )}
                  <span className={celda("centro", "rounded-lg bg-hueso/60 px-2 py-1.5 sm:rounded-none sm:bg-transparent sm:px-0 sm:py-0 text-[13px] tabular-nums text-tinta")}>
                    <span className="label-cayla mb-0.5 block text-[10px] text-tinta/45 sm:hidden">En camino</span>
                    {f.enTransito}
                  </span>
                </div>
                {/* En celular «Acción hoy» va a la derecha de «En la red», en el hueco que dejaba vacío, en vez de ocupar un renglón
                    propio (Felipe, 2026-09-25). `sm:contents` + `sm:[grid-area:auto]` devuelven cada celda a su columna de escritorio. */}
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 border-t border-sand/70 pt-3 sm:contents sm:border-0 sm:pt-0">
                  {separa && (
                    <span className={celda("izq", "col-start-2 row-start-1 overflow-visible whitespace-normal sm:[grid-area:auto]")}>
                      <span className="flex flex-col items-end gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-2 sm:gap-y-1">
                        <span className="label-cayla text-[10px] text-tinta/45 sm:hidden">Hoy</span>
                        {/* Solo el diagnóstico, nunca un botón (diseño aprobado), con las MISMAS palabras del filtro «Hoy» y de la
                            tarjeta (`lib/existencias-hoy.ts`, Felipe 2026-10-03). En «Por colgar», lo que se puede bajar (disponible, neto
                            de apartados): la suma de estos chips es la del resumen de arriba. En «Sin stock atrás», si viene algo en camino. */}
                        <ChipHoy f={f} />
                        {/* Independiente de «Acción hoy»: una prenda puede no pedir nada y tener unidades dañadas en cuarentena al
                            mismo tiempo — no son el mismo eje. Solo informa; resolverlas vive en la tarjeta «Incidencias». */}
                        {!!f.danado && (
                          <Chip tono="rojo">
                            <span title="En cuarentena: un líder decide si se arregló y vuelve, o si se liquida, se bota o se dona">Dañado · {f.danado}</span>
                          </Chip>
                        )}
                        {/* Otro eje independiente: apartada no es lo mismo que dañada ni que sin stock. */}
                        {f.apartado > 0 && (
                          <Chip tono="ambar">
                            <span title="Apartadas para clientes: siguen aquí, pero no se pueden vender ni mover">Apartado · {f.apartado}</span>
                          </Chip>
                        )}
                        {/* Solo en escritorio con la tarjeta angosta (< 1070 px): «En la red» no tiene columna propia y va aquí, debajo.
                            En el celular ya tiene su celda, y con la tarjeta ancha también. */}
                        {red && (
                          <span className="basis-full truncate text-[11px] leading-tight text-taupe max-sm:hidden @min-[1070px]:hidden" title={red.detalle}>
                            {red.linea}
                          </span>
                        )}
                      </span>
                    </span>
                  )}
                  <span
                    className={celda(
                      "izq",
                      `col-start-1 row-start-1 text-[13px] text-tinta/75 sm:[grid-area:auto]${separa ? " hidden max-sm:block @min-[1070px]:block" : ""}`
                    )}
                    title={red?.detalle}
                  >
                    <span className="label-cayla mr-1 text-[10px] text-tinta/45 sm:hidden">En la red</span>
                    {red ? red.linea : <span className="text-tinta/35">—</span>}
                  </span>
                </div>
                <span aria-hidden className={`hidden justify-center text-taupe/60 ${separa ? "@min-[1070px]:flex" : "sm:flex"}`}>
                  <ChevronRight className="h-4 w-4" />
                </span>
              </div>
            );
          })}
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-xs text-taupe">
            <span className="flex flex-wrap items-center gap-3">
              <span>{textoMostrando(paginaActual, filtradas.length, stock.length)}</span>
              <PaginacionLocal pagina={paginaActual.pagina} totalPaginas={paginaActual.totalPaginas} onPagina={irAPagina} />
              <button type="button" onClick={exportarCsv} className="btn-cayla btn-secundario btn-chico">
                Exportar CSV
              </button>
            </span>
            {separa && (
              <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
                {/* Solo los casos que hoy existen en la sede (un punto de un caso ausente confundía) y, con el piso sin cuadrar, «En pausa». */}
                {[...TIPOS_HOY.filter((t) => stock.some((f) => hoyDeTalla(f) === t)), ...(tallasEnPausa > 0 ? (["en_pausa"] as const) : [])].map((t) => (
                  <span key={t} className="inline-flex items-center gap-1.5" title={AYUDA_HOY[t]}>
                    <span aria-hidden className={`inline-block h-2 w-2 rounded-full ${PUNTO_HOY[TONO_HOY[t]]}`} />
                    <span className="text-tinta/80">{TEXTO_HOY[t]}</span>
                  </span>
                ))}
              </span>
            )}
          </div>
        </Tabla>
      )}
      </div>

      {ajustando && (
        <AjustarInventarioModal
          productoId={ajustando.productoId}
          // Cada fila de Existencias es una prenda (modelo + color): el ajuste muestra solo sus tallas.
          prenda={{ color: ajustando.color, colorHex: ajustando.colorHex, fotoUrl: ajustando.fotoUrl, categoriaPrefijo: ajustando.categoriaPrefijo, categoriaFamilia: ajustando.categoriaFamilia, categoria: ajustando.categoria }}
          ubicacionId={ubicacionId}
          sububicaciones={sububicaciones}
          puedeBajarAlPiso={puedeBajarAlPiso}
          onClose={() => setAjustando(null)}
          alCerrarEnfocar={volverFoco}
        />
      )}

      {/* ADR-0252: la misma ventana de Catálogo ▸ Productos. No sabe cuántas variantes tiene el producto entero (Existencias
          mira un color en una sede): el texto dice «todas sus tallas y colores» sin el número, y la base decide. Al borrar,
          la ventana refresca la pantalla y la prenda desaparece de la lista. */}
      {eliminando && (
        <EliminarProductoModal
          producto={{ productoId: eliminando.productoId, referencia: eliminando.referencia, estado: eliminando.estado, numVariantes: null }}
          onClose={() => setEliminando(null)}
        />
      )}


      {viendoDanados && (
        <ResolverDanadosModal
          pendientes={soloPrenda ? deLaPrenda(danadosPendientes, soloPrenda) : danadosPendientes}
          esLider={esLider}
          otraSede={!enSedeActiva}
          sede={sedeNombre}
          onClose={() => {
            setViendoDanados(false);
            setSoloPrenda(null);
          }}
        />
      )}

      {viendoApartados && (
        <ApartadosModal
          apartados={soloPrenda ? deLaPrenda(apartados, soloPrenda) : apartados}
          otraSede={!enSedeActiva}
          onClose={() => {
            setViendoApartados(false);
            setSoloPrenda(null);
          }}
        />
      )}

      {viendoDisponible && <ResumenStockOverlay stock={stock} separa={separa} ubicacionId={ubicacionId} sedeNombre={sedeNombre} onClose={() => setViendoDisponible(false)} />}

      {/* «Ver análisis de cobertura» (AnalisisCoberturaOverlay) y «Ver recomendaciones» (RecomendacionesOverlay) no vuelven:
          el rediseño del 2026-09-28 los reemplaza por «Prioridades de hoy» y el diagnóstico de cada fila; la cobertura
          sigue disponible en Análisis. Ninguno de los dos componentes se borró del repo (`RecomendacionesOverlay.tsx`
          queda sin usar tras este merge, con el mismo criterio que `DetallePrendaExistencias.tsx`).

          El cajón de la prenda (diseño aprobado, 2026-09-28): el MISMO desde «Por prenda» y «Por talla». Sus acciones no abren un
          modal encima del cajón: lo cierran y abren el suyo (Reponer, Ajustar, Eliminar), que al guardar refresca la pantalla. Sin
          `key`: al tocar otra fila el cajón se queda y solo cambia su contenido. */}
      {prendaAbierta && (
        <PanelTalla
          colores={coloresDelModelo(stock, prendaAbierta.productoId)}
          claveInicial={prendaAbierta.clave}
          varianteInicial={abierta?.varianteId}
          flujoInicial={abierta?.flujo ?? null}
          vistaInicial={abierta?.vista}
          ubicacionId={ubicacionId}
          sedeNombre={sedeNombre}
          separa={separa}
          puedeReponer={puedeReponer}
          puedeEnviar={veTraslados && enSedeActiva}
          puedeAjustar={puedeAjustarAqui}
          // Apartar y Pedir son de una tienda, mirando su propia sede (las dos funciones de la base lo exigen).
          puedeApartar={veApartados && esTienda && enSedeActiva}
          puedePedir={veTraslados && esTienda && enSedeActiva}
          puedePedirParaCliente={veApartados && esTienda && enSedeActiva}
          destinos={destinosParaEnviar}
          sedesParaPedir={sedesParaPedir}
          sububicacionPisoId={sububicacionPiso?.id ?? null}
          sububicacionAlmacenId={sububicacionAlmacen?.id ?? null}
          marcaDelFiltro={marcaDelFiltro}
          enSedeActiva={permisos.etiquetasEHistorial}
          puedeEliminar={permisos.eliminar}
          puedeReportarDanada={permisos.reportarDanada}
          onAjustarCompleto={(f) => {
            setAbierta(null);
            setAjustando(f);
          }}
          onEliminar={() => {
            setAbierta(null);
            setEliminando({ productoId: prendaAbierta.productoId, referencia: prendaAbierta.referencia, estado: prendaAbierta.tallas[0]?.estadoProducto ?? null });
          }}
          onVerApartadas={
            deLaPrenda(apartados, prendaAbierta).length > 0
              ? () => {
                  setAbierta(null);
                  setSoloPrenda(prendaAbierta);
                  setViendoApartados(true);
                }
              : undefined
          }
          onVerDanadas={
            deLaPrenda(danadosPendientes, prendaAbierta).length > 0
              ? () => {
                  setAbierta(null);
                  setSoloPrenda(prendaAbierta);
                  setViendoDanados(true);
                }
              : undefined
          }
          puedeResolverDanadas={esLider && enSedeActiva}
          onCerrar={() => setAbierta(null)}
        />
      )}

      {viendoPendientes && (
        <Modal titulo="Pendientes de hoy" subtitulo="Lo de la sede, en el orden en que conviene hacerlo" onClose={() => setViendoPendientes(false)} ancho="max-w-2xl">
          {/* Cada botón de una tarea cierra la ventana (`alElegir`) y hace lo suyo: filtrar, abrir Dañadas o Apartados, o ir a otra pantalla. */}
          <ParaHoy
            tareas={tareasHoy}
            acciones={accionesHoy}
            verCuales={verCualesHoy}
            alElegir={() => setViendoPendientes(false)}
            extra={
              <>
                {resumen.apartado > 0 && resumenApartados.vencidos === 0 && (
                  <button type="button" onClick={() => { setViendoPendientes(false); setViendoApartados(true); }} className="text-taupe underline-offset-[3px] hover:text-tinta hover:underline">
                    {resumen.apartado} {resumen.apartado === 1 ? "apartada" : "apartadas"} para clientes
                  </button>
                )}
                <button type="button" onClick={() => { setViendoPendientes(false); setViendoDisponible(true); }} className="text-taupe underline-offset-[3px] hover:text-tinta hover:underline">
                  Resumen por categoría
                </button>
              </>
            }
          />
        </Modal>
      )}

      {camara && (
        <EscanerBusqueda
          titulo="Escanear prenda"
          pista="Centra la etiqueta de la prenda en el cuadro"
          onCodigo={(codigo) => {
            setCamara(false);
            abrirPorCodigo(codigo);
          }}
          onEscribir={() => {
            setCamara(false);
            enfocarBuscador();
          }}
          onClose={() => setCamara(false)}
        />
      )}

      {/* Varias a la vez (ADR-0237): lo marcado llega a la otra pantalla con la lista ya cargada. Cada botón aparece solo si
          su rol ve esa pantalla y hay algo que llevar (Bajar al piso: solo las tallas que se pueden bajar). */}
      {/* Lo marcado que SIGUE en la lista, no el conjunto crudo: tras eliminar un producto marcado (ADR-0252) sus tallas
          ya no están, y la barra quedaba en «0 prendas · 0 tallas» sin botones. */}
      {filasMarcadas.length > 0 && (
        <div
          role="region"
          aria-label="Prendas marcadas"
          className="anim-revelar fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-30 rounded-2xl bg-tinta p-2 text-crema shadow-lg sm:inset-x-auto sm:left-1/2 sm:w-max sm:max-w-[calc(100vw-2rem)] sm:-translate-x-1/2"
        >
          <div className="flex flex-wrap items-center gap-1">
            {/* Celular: la cuenta y la ✕ arriba, los botones debajo a todo el ancho. Escritorio: todo en una fila. */}
            <span className="flex-1 px-3 py-1.5 text-sm sm:flex-none">
              <b className="font-semibold tabular-nums">{prendasMarcadas}</b> {prendasMarcadas === 1 ? "prenda" : "prendas"}
              <span className="text-crema/60 dark:text-crema/75"> · {filasMarcadas.length} {filasMarcadas.length === 1 ? "talla" : "tallas"}</span>
            </span>
            {/* Más de las que caben en un enlace (tarea #7): se dice, en vez de hacer desaparecer los botones sin explicación. */}
            {filasMarcadas.length > MAX_VARIANTES_EN_URL && (
              <span role="status" className="order-last w-full px-3 pb-1 text-xs text-crema/80 sm:order-none sm:w-auto">
                Marcaste {filasMarcadas.length} tallas: se llevan hasta {MAX_VARIANTES_EN_URL} de una vez. Desmarca algunas.
              </span>
            )}
            <span className="order-last grid w-full grid-cols-3 gap-1 sm:order-none sm:flex sm:w-auto">
              {hrefBajarMarcadas && (
                <Link href={hrefBajarMarcadas} className="flex flex-col items-center gap-1 rounded-xl px-3 py-2 text-xs hover:bg-crema/10 sm:flex-row sm:text-sm">
                  <ArrowDownToLine aria-hidden className="h-4 w-4" />
                  Bajar al piso
                </Link>
              )}
              {hrefTrasladarMarcadas && (
                <Link href={hrefTrasladarMarcadas} className="flex flex-col items-center gap-1 rounded-xl px-3 py-2 text-xs hover:bg-crema/10 sm:flex-row sm:text-sm">
                  <ArrowRight aria-hidden className="h-4 w-4" />
                  Trasladar
                </Link>
              )}
              {hrefEtiquetasMarcadas && (
                <Link href={hrefEtiquetasMarcadas} className="flex flex-col items-center gap-1 rounded-xl px-3 py-2 text-xs hover:bg-crema/10 sm:flex-row sm:text-sm">
                  <Tag aria-hidden className="h-4 w-4" />
                  Etiquetas
                </Link>
              )}
              {hrefRotulosMarcadas && (
                <Link href={hrefRotulosMarcadas} className="flex flex-col items-center gap-1 rounded-xl px-3 py-2 text-xs hover:bg-crema/10 sm:flex-row sm:text-sm">
                  <SignpostBig aria-hidden className="h-4 w-4" />
                  Rótulo
                </Link>
              )}
            </span>
            <button
              type="button"
              onClick={() => setMarcadas(new Set())}
              aria-label="Quitar las marcas"
              className="grid h-9 w-9 place-items-center rounded-xl text-crema/70 hover:bg-crema/10 hover:text-crema"
            >
              <X aria-hidden className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Celular: la consulta más frecuente del piso («¿hay en M?») a un toque, fijo al alcance del pulgar — como en Cambios.
          Es una acción de esta pantalla, no navegación (ADR-0206). Con prendas marcadas, su lugar lo toma la barra. */}
      {stock.length > 0 && filasMarcadas.length === 0 && !camara && (
        <div className="fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-crema from-70% to-crema/0 px-4 pt-3 pb-[calc(0.875rem+env(safe-area-inset-bottom))] sm:hidden">
          <button
            type="button"
            onClick={() => setCamara(true)}
            className="flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-tinta text-[15px] font-semibold text-crema active:scale-[0.99]"
          >
            <ScanLine size={19} aria-hidden />
            Escanear prenda
          </button>
        </div>
      )}
    </div>
  );
}
