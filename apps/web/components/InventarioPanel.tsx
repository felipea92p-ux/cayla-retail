"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowDownToLine, ArrowRight, ChevronRight, LayoutGrid, Package, ScanLine, Search, SlidersHorizontal, Table2, Tag, Truck, X } from "lucide-react";
import { crearIndiceBusquedaEspecial, filtrarConBusquedaEspecial } from "@/lib/filtro-busqueda-especial";
import { Tabla, Encabezado, celda } from "@/components/ui/Tabla";
import { Desplegable } from "@/components/ui/campos";
import { Chip, type TonoChip } from "@/components/ui/Chip";
import { Casilla } from "@/components/ui/Casilla";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { MuestraColor } from "@/components/ui/MuestraColor";
import { PaginacionLocal } from "@/components/ui/PaginacionLocal";
import { useSedeActiva } from "@/components/SedeActiva";
import { paginar, paginarSinPartirGrupos } from "@/lib/paginacion";
import { ReponerPrendaModal } from "@/components/ReponerPrendaModal";
import { SubirAAlmacenModal } from "@/components/SubirAAlmacenModal";
import { AjustarInventarioModal } from "@/components/AjustarInventarioModal";
// «Pedir para una clienta» (PedirOtraSedeModal) no vuelve: el rediseño del cajón (2026-09-28) no tiene esa entrada — el
// mismo criterio ya documentado para «Apartar»/«Retirar del piso»/«Dónde más hay». `EliminarProductoModal` (ADR-0252,
// trasplantado de main tras el PR #574) sí: es una función real de la app que el rediseño no debía perder.
import { EliminarProductoModal } from "@/components/EliminarProductoModal";
import { alternarMarcasDePrenda, permisosDelDetalle } from "@/lib/existencias-permisos";
import { ResolverDanadosModal } from "@/components/ResolverDanadosModal";
import { ApartadosModal } from "@/components/ApartadosModal";
import { ResumenStockOverlay } from "@/components/ResumenStockOverlay";
import { TarjetaReponerAPiso } from "@/components/TarjetaReponerAPiso";
import { RitmoRecientePopover } from "@/components/RitmoRecientePopover";
import { hoyLima, resumirApartados, type Apartado } from "@/lib/apartados-reglas";
import { ChipAlerta, ChipMantener } from "@/components/ExistenciasChips";
import { ExistenciasVacio } from "@/components/ExistenciasVacio";
import { ExistenciasPorPrenda } from "@/components/ExistenciasPorPrenda";
import { ExistenciasTarjetas, agruparPorModelo, opcionesOrden, ordenarModelos, type OrdenPrendas } from "@/components/ExistenciasTarjetas";
import { CajonPrendaExistencias } from "@/components/CajonPrendaExistencias";
import { EscanerBusqueda } from "@/components/EscanerBusqueda";
import { agruparPorPrenda, coloresDelModelo, MAX_VARIANTES_EN_URL, ordenarPorUrgencia, tallaPorCodigo, urlBajarAlPiso, urlEtiquetas, urlTrasladar, type PrendaAgrupada } from "@/lib/existencias-prendas";
import { explicarVacio, palabrasBuscables, sinStockQueCoincide, textoSinStock, type ClaveFiltro, type FiltroActivo, type ProductoSinStock } from "@/lib/existencias-vacio";
import { marcasDeLaSede } from "@/lib/existencias-catalogo-reglas";
import { resumenRed } from "@/lib/stock-por-sede";
import { descargarCsv } from "@/lib/exportar-csv";
import { TEXTO_ACCION_HOY, type TipoAccionHoy } from "@/lib/existencias-recomendaciones";
import { coincideConFiltroAccion, coincideConFiltroDanado, OPCIONES_FILTRO_ACCION, tallasEnCurva, valorOfrecido } from "@/lib/existencias-filtros";
import { useFiltrosExistencias } from "@/components/useFiltrosExistencias";
import { textoCoberturaPiso, textoRitmoReciente } from "@/lib/resumen-formato";
import { clavePercha, ordenarPorModeloColorTalla, porColgar, resumirPorColgar } from "@/lib/inventario-reglas";
import type { PoliticaOperativaInventario } from "@/lib/politica-operativa-inventario";
import type { FilaExistencias, ResumenExistencias, PrendaDanada } from "@/lib/inventario-v2";
import type { Sububicacion } from "@/lib/sububicaciones";

/** «Acción hoy» (2026-09-25): un tono fijo por tipo, no por urgencia — mismo criterio que tenía
 *  `EstadoStock`, para que el color siga significando lo mismo en cada fila. «Sin acción» no lleva
 *  chip (mismo criterio de «Normal»: es la mayoría de las filas, un chip verde ahí sería decoración). */
const TONO_ACCION_HOY: Record<Exclude<TipoAccionHoy, "sin_accion">, TonoChip> = {
  reponer_a_piso: "ambar",
};

const AYUDA_ACCION_HOY: Record<TipoAccionHoy, string> = {
  sin_accion: "Nada que hacer hoy con el piso de esta talla",
  reponer_a_piso: "El piso tiene pocas unidades — regla física de piso",
};

const TODAS = "__todas__";
/** El buscador, para devolverle el foco cuando un botón del estado vacío (que se desmonta al volver las filas) lo tenía. */
const ID_BUSCADOR = "existencias-buscar";
function enfocarBuscador() {
  requestAnimationFrame(() => document.getElementById(ID_BUSCADOR)?.focus());
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
/** Filtro de "Dañado" (2026-09-17, separado del filtro «Acción» el 2026-09-25 — REHECHO): eje
 *  aparte de «Acción hoy» —no es una de sus categorías, es una cola operativa distinta
 *  (ADR-0071)— con su PROPIO dropdown («Estado»): mezclarlo con las categorías de `TipoAccionHoy`
 *  confundía «qué hacer hoy» con «en qué condición está el inventario» (dos preguntas
 *  distintas, decisión de Felipe). */
const DANADO = "__danado__";
/** Filtro «Por colgar» (Frescura del piso, ADR-0208; reexpresado sobre el dominio nuevo el 2026-09-25):
 *  eje de Estado, igual que «Dañado» — no es una Acción hoy, es una condición del inventario. La regla
 *  sigue siendo `porColgar` (`lib/inventario-reglas.ts`: piso disponible en 0 y algo disponible en
 *  almacén), que es SIEMPRE un subconjunto de la regla canónica de Acción hoy (piso <= umbral → Reponer
 *  a piso): toda fila «Por colgar» ya sale como «Reponer a piso» por la vía única, sin motor propio ni
 *  segunda regla de reposición — este filtro solo aísla, dentro de las que hay que reponer, las que hoy
 *  no tienen NADA colgado para la clienta.
 *
 *  La fila siempre muestra el chip «Por colgar» junto a su Acción hoy (son dos hechos ciertos a la vez:
 *  hoy se cuelga lo que hay atrás, y la Acción hoy sigue siendo reponer); el filtro de Estado y la
 *  píldora solo controlan qué se ve en la tabla. */
const POR_COLGAR = "__por_colgar__";

/** Los filtros visuales que NO son texto, en UN solo lugar: la tabla los aplica y el estado vacío los «relaja» de a uno para
 *  decir cuál está dejando la pantalla en blanco. `omitir` = los que se ignoran en esa cuenta. «Acción» y «Estado» son dos ejes
 *  (2026-09-25): qué hacer hoy con la talla y en qué condición está; el estado vacío puede quitar uno sin tocar el otro. */
function pasaFiltros(
  f: FilaExistencias,
  filtros: { categoria: string; marca: string; accion: string; condicion: string },
  omitir?: ReadonlySet<ClaveFiltro>
): boolean {
  if (!omitir?.has("categoria") && filtros.categoria !== TODAS && f.categoria !== filtros.categoria) return false;
  if (!omitir?.has("marca") && filtros.marca !== TODAS && f.marca !== filtros.marca) return false;
  if (!omitir?.has("accion") && !coincideConFiltroAccion(f.accionHoy?.tipo, filtros.accion === TODAS ? null : (filtros.accion as TipoAccionHoy))) return false;
  if (omitir?.has("estado")) return true;
  if (!coincideConFiltroDanado(f.danado, filtros.condicion === DANADO)) return false;
  return filtros.condicion !== POR_COLGAR || porColgar(f);
}

/** El buscador ocupa su propia fila y debajo van de 3 a 6 combos (Marca solo con 2 o más marcas; Acción y Estado solo donde se separa piso y almacén). Con
 *  el buscador y los 5 combos en UNA fila, a 1440-1490 px con el lateral abierto los combos partían su texto en dos líneas y el placeholder se cortaba
 *  (medido en la revisión, 2026-09-26): la herramienta que más se usa merece el ancho completo, y los combos, uno igual a otro. */
const COLUMNAS_FILTROS: Record<number, string> = {
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-2 xl:grid-cols-4",
  5: "sm:grid-cols-3 xl:grid-cols-5",
  6: "sm:grid-cols-3 2xl:grid-cols-6",
};
// Los cortes salen de la cuenta, no del gusto: «Categoría: todas» necesita ~152 px, así que 5 combos piden ~850 px de tarjeta. Con el lateral
// abierto (17 rem + márgenes) eso ocurre desde 1280 px de ventana (`xl`); a 1024 px quedan ~640 px y caben tres por fila. Seis combos (con Marca,
// desde que Acción y Estado son dos) piden ~1.000 px: recién a 1536 px (`2xl`); antes, dos filas de tres.

function fechaHora(iso: string) {
  return new Date(iso).toLocaleString("es-PE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Lima" });
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
  const pideReponer = f.accionHoy?.tipo === "reponer_a_piso";
  const etiqueta = c.tipo === "agotado" ? "bg-rojo/10 text-rojo-profundo" : c.tipo === "medida" && pideReponer ? "bg-ambar/15 text-ambar-profundo" : null;
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

/** Una de las 4 tarjetas de «Prioridades de hoy» (diseño aprobado, 2026-09-28). La etiqueta y el ícono en taupe; la cifra y su
 *  unidad en serif. `urgente` es el acento de la que más pide algo: la cifra en rojo profundo, el borde cálido y un fondo rosa
 *  suave. En escritorio las cuatro se reparten el ancho según lo que dicen (`xl:flex-auto`), no en columnas iguales; en
 *  el celular, de a dos y más compactas. Una flecha si es la que abre algo (clic o enlace). */
function TarjetaPrioridad({
  icono: Icono,
  etiqueta,
  valor,
  unidad,
  urgente = false,
  activa = false,
  href,
  onClick,
  children,
}: {
  icono: React.ComponentType<{ className?: string; strokeWidth?: number; "aria-hidden"?: boolean }>;
  etiqueta: string;
  valor: number;
  unidad: string;
  urgente?: boolean;
  activa?: boolean;
  href?: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const clickeable = Boolean(href || onClick);
  // El fondo rosa es OPACO (rojo al 5 % sobre el papel): un `bg-rojo/…` translúcido reemplaza al papel y deja pasar el crema de atrás.
  const clase = `card-cayla group relative flex min-w-0 flex-col items-stretch justify-start p-3.5 text-left transition-colors sm:px-6 sm:pb-[13px] sm:pt-4 xl:flex-auto ${
    urgente ? "border-[color-mix(in_oklab,var(--color-rojo)_18%,var(--color-crema))] bg-[color-mix(in_oklab,var(--color-rojo)_3.5%,var(--color-papel))]" : ""
  } ${clickeable ? (urgente ? "hover:bg-[color-mix(in_oklab,var(--color-rojo)_8%,var(--color-papel))]" : "hover:bg-sand/30") : ""} ${activa ? "bg-sand/40" : ""}`;
  const contenido = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className={`label-cayla flex items-center gap-3 text-[11px] font-bold ${urgente ? "text-rojo-profundo" : "text-taupe"}`}>
          <Icono aria-hidden className={`h-[22px] w-[22px] ${urgente ? "text-rojo-profundo" : "text-taupe/80"}`} strokeWidth={1.4} />
          {etiqueta}
        </p>
        {clickeable && <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-taupe/60 transition-transform group-hover:translate-x-0.5" />}
      </div>
      <p className="mt-2 flex items-baseline gap-2">
        <span className={`font-display text-[26px] leading-none tabular-nums sm:text-[34px] ${urgente ? "text-rojo-profundo" : "text-tinta"}`}>{valor.toLocaleString("es-PE")}</span>
        <span className={`text-base font-medium sm:text-[18px] ${urgente ? "text-rojo-profundo" : "text-taupe"}`}>{unidad}</span>
      </p>
      <p className="mt-1 hidden text-[13.5px] leading-5 text-taupe sm:block">{children}</p>
    </>
  );
  if (href) {
    return (
      <Link href={href} className={clase}>
        {contenido}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${clase} w-full xl:w-auto`} aria-pressed={activa}>
        {contenido}
      </button>
    );
  }
  return <div className={clase}>{contenido}</div>;
}

/** Uno de los combos de filtro de la barra (caja hundida, la misma de todo el ERP pero de 36 px de alto, como el diseño aprobado).
 *  `pie`: la aclaración de «Se usa lo que escribiste» cuando la búsqueda ya dijo esa talla o ese color. */
function FiltroCombo({
  etiqueta,
  valor,
  onValor,
  opciones,
  marcador,
  pie,
}: {
  etiqueta: string;
  valor: string;
  onValor: (v: string) => void;
  opciones: { valor: string; texto: string }[];
  marcador: string;
  pie?: string;
}) {
  return (
    <div className="min-w-0">
      <Desplegable valor={valor} onValor={onValor} opciones={opciones} marcador={marcador} forma="cajaBaja" etiquetaAccesible={etiqueta} />
      {pie && <p className="mt-1 text-xs text-taupe">{pie}</p>}
    </div>
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
  sedeNombre,
  sinStock,
  marcaFallo = null,
  verProductos = false,
  deltaSede,
  comparacionFallo = false,
  politica,
  veTraslados = false,
  puedeBajarAlPiso = false,
  veApartados = false,
  esTienda = false,
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
  /** El nombre de la sede que se mira, para decir «Tienda TRU no lo ha recibido» en el estado vacío. */
  sedeNombre: string;
  /** Los productos ACTIVOS del catálogo que esta sede no tiene (ni una fila de stock): la pantalla nace de `stock`, así que
   *  sin esto una marca cuyos productos la sede nunca recibió («CAYLA» en TRU) no dejaba rastro. */
  sinStock: ProductoSinStock[];
  /** Si la marca de los productos no se pudo leer: el aviso (sin Marca en el buscador ni en los filtros); null = todo bien. */
  marcaFallo?: string | null;
  /** ¿Su rol ve el módulo Productos (ADR-0161)? Sin él, «Ver en Productos» llevaría a «Sin acceso»: los nombres se muestran, sin enlace. */
  verProductos?: boolean;
  /** El delta de disponible de TODA la sede en los últimos 7 días, para la tarjeta «Disponible total». */
  deltaSede: { hoy: number; hace7d: number; pct: number | null };
  /** La lectura de 7 días no respondió (tarea #8): la tarjeta lo dice, en vez de «sin datos», que sería falso. */
  comparacionFallo?: boolean;
  /** Política operativa de Inventario (`politica-operativa-inventario.ts`): una sola fuente para
   *  los umbrales que leen el popover de Ritmo reciente y el aviso de «Subir a almacén» (`SubirAAlmacenModal`). */
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
}) {
  // Los filtros viven en la URL (2026-10-03, misma estructura que Productos): recargar, volver de «Bajar al piso» o abrir un
  // enlace copiado los trae puestos. Cambiar uno reescribe la URL sin volver a pedir la página (`useFiltrosExistencias`).
  const { filtros, busqueda, aplicar, limpiar, teclear, fijarBusqueda, soltarBusqueda } = useFiltrosExistencias(resumen.separaPisoAlmacen);
  const setBusqueda = fijarBusqueda;
  const setCategoria = (v: string) => aplicar({ cat: v === TODAS ? null : v });
  const setMarca = (v: string) => aplicar({ marca: v === TODAS ? null : v });
  const setTalla = (v: string) => aplicar({ talla: v === TODAS ? null : v });
  const setColor = (v: string) => aplicar({ color: v === TODAS ? null : v });
  // Dos ejes independientes (2026-09-25): «Acción» es SOLO `TipoAccionHoy` (qué debería hacer la
  // vendedora); «Estado» es la condición del inventario (dañado/cuarentena) — no son la misma
  // pregunta, y mezclarlos en un solo dropdown confundía dos clasificaciones distintas.
  const accion = filtros.accion ?? TODAS;
  const setAccion = (v: string) => aplicar({ accion: v === TODAS ? null : v });
  const condicion = filtros.estado === "danado" ? DANADO : filtros.estado === "por_colgar" ? POR_COLGAR : TODAS;
  const setCondicion = (v: string) => aplicar({ estado: v === DANADO ? "danado" : v === POR_COLGAR ? "por_colgar" : null });
  const orden = (filtros.orden ?? "relevancia") as OrdenPrendas;
  const setOrden = (v: OrdenPrendas) => aplicar({ orden: v === "relevancia" ? null : v });
  // El control que abrió el modal: al cerrarlo, el teclado vuelve ahí y no al principio de la página.
  const volverFoco = useRef<HTMLElement | null>(null);
  // «Reponer prenda» abre la ventana del MODELO entero (`ReponerPrendaModal`, ADR-0295 y ADR-0317): todos sus colores, una fila cada
  // uno. Se guarda el producto y no una copia de las filas: tras guardar o chocar con otra persona, `router.refresh()` trae las cifras
  // nuevas y la ventana las lee de `stock`, no de lo que había al abrirla.
  const [reponiendo, setReponiendo] = useState<string | null>(null);
  const prendasReponiendo = reponiendo ? coloresDelModelo(stock, reponiendo) : [];
  function abrirReponer(prenda: PrendaAgrupada<FilaExistencias>, origen: HTMLElement | null) {
    volverFoco.current = origen;
    setReponiendo(prenda.productoId);
  }
  // «Subir prenda» (ADR-0300, ADR-0317): la misma idea del lado contrario, con la ventana `SubirAAlmacenModal`.
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const prendasSubiendo = subiendo ? coloresDelModelo(stock, subiendo) : [];
  function abrirSubir(prenda: PrendaAgrupada<FilaExistencias>, origen: HTMLElement | null) {
    volverFoco.current = origen;
    setSubiendo(prenda.productoId);
  }
  const [ajustando, setAjustando] = useState<FilaExistencias | null>(null);
  // «Eliminar el producto» desde el detalle (ADR-0252): el producto entero, no la talla ni el color.
  const [eliminando, setEliminando] = useState<{ productoId: string; referencia: string; estado: string | null } | null>(null);
  const [viendoDanados, setViendoDanados] = useState(abrirDanados);
  const [viendoApartados, setViendoApartados] = useState(false);
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
  // En el celular los combos de filtro viven plegados tras «Filtros» (tarea #6): seis cajas apiladas empujaban la primera
  // prenda dos pantallas más abajo. En computadora siempre están a la vista (la bandera no se usa desde `sm`).
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  // `abrirVariante` (ADR-0241, «Ver en Existencias» desde Movimientos): la prenda entra abierta en esa talla. Si la talla
  // no tiene fila en esta sede (se vendió la última, o es de otra), no se abre nada: la lista de siempre.
  const [abierta, setAbierta] = useState<{ clave: string; varianteId?: string } | null>(() => {
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
  const marca = marcaEfectiva;
  // En su curva (XS · S · M · L, luego la numeración), como la tarjeta: antes iban como texto («10, 2, 4, L, M, S, XL, XS»).
  const tallas = useMemo(() => tallasEnCurva(stock), [stock]);
  const colores = useMemo(
    () => Array.from(new Set(stock.map((f) => f.color).filter((c): c is string => !!c))).sort((a, b) => a.localeCompare(b, "es")),
    [stock]
  );
  const categoria = valorOfrecido(filtros.categoria, categorias) ?? TODAS;
  const talla = valorOfrecido(filtros.talla, tallas) ?? TODAS;
  const color = valorOfrecido(filtros.color, colores) ?? TODAS;
  // Filtro de búsqueda especial (`lib/filtro-busqueda-especial.ts`): lo escrito se parte en términos —nombre,
  // marca, categoría, código, color y talla, en cualquier orden— y todos deben cumplirse. Si el texto dice una talla o un
  // color, manda sobre el filtro visual de esa dimensión; Categoría, Marca, Acción y Estado siempre aplican (el texto no los pisa).
  const indiceBusqueda = useMemo(
    () =>
      crearIndiceBusquedaEspecial(stock, (f) => ({
        nombre: f.referencia,
        sku: f.sku,
        codigosBarras: f.codigosBarras,
        color: f.color,
        talla: f.talla,
        marca: f.marca,
        categoria: f.categoria,
      })),
    [stock]
  );
  const { filas: filtradas, dimensiones: dichoEnLaBusqueda } = useMemo(() => {
    const resultado = filtrarConBusquedaEspecial(
      indiceBusqueda,
      busqueda,
      {
        talla: talla === TODAS ? null : talla,
        color: color === TODAS ? null : color,
        otros: (f) => pasaFiltros(f, { categoria, marca: marcaEfectiva, accion, condicion }),
      },
      // Con texto escrito, lo que mejor coincide va primero (una marca entera antes que un trozo perdido en un código), y las
      // tallas de un producto no se separan. «Por colgar» trae su propio orden (por percha) y no se toca.
      condicion === POR_COLGAR ? {} : { ordenar: "relevancia", grupo: (f) => f.productoId }
    );
    // «Por colgar» se trabaja por percha (un modelo en un color), no por SKU: sus tallas salen juntas y
    // en su curva, para que la encargada baje la M y la L de la misma casaca en un solo viaje.
    return condicion === POR_COLGAR ? { ...resultado, filas: ordenarPorModeloColorTalla(resultado.filas) } : resultado;
  }, [indiceBusqueda, busqueda, talla, color, categoria, marcaEfectiva, accion, condicion]);

  // El contador de la píldora mira TODA la sede, no lo filtrado: es la cifra del problema («22 tallas
  // que la clienta no ve»), igual que las tarjetas de arriba. Baja sola después de cada «Reponer».
  const cuentaPorColgar = useMemo(() => resumirPorColgar(stock), [stock]);

  // La tabla pinta UNA página de `filtradas`; las tarjetas, los filtros y el CSV siguen viendo todas.
  // Cambiar cualquier filtro vuelve a la página 1 (ajuste durante el render, sin efecto: la firma de
  // los filtros cambió → se reinicia). `paginar` acota: si un guardado achicó la lista, cae en la última.
  const [pagina, setPagina] = useState(1);
  const firmaFiltros = [busqueda, categoria, marcaEfectiva, talla, color, accion, condicion, orden].join("\u0000");
  const [firmaPrevia, setFirmaPrevia] = useState(firmaFiltros);
  if (firmaFiltros !== firmaPrevia) {
    setFirmaPrevia(firmaFiltros);
    setPagina(1);
  }
  // «Por colgar» va ordenada por percha: la página se estira hasta terminar la percha en curso, para que
  // la S y la M de una casaca no queden en la página 1 y su L en la 2.
  const paginaActual =
    condicion === POR_COLGAR ? paginarSinPartirGrupos(filtradas, pagina, FILAS_POR_PAGINA, clavePercha) : paginar(filtradas, pagina, FILAS_POR_PAGINA);
  // «Por prenda» pagina PRENDAS, no tallas: 15 prendas por página, cada una con todas sus tallas (que ya no se parten).
  // Sin texto escrito, primero lo que falta en el piso (análisis de Existencias, tarea #5): con 33 de 33 tallas pidiendo
  // reponer, el orden es lo único que dice por dónde empezar. Con texto, manda la relevancia de la búsqueda.
  const sinTexto = busqueda.trim() === "";
  const prendas = useMemo(() => {
    const agrupadas = agruparPorPrenda(filtradas);
    return sinTexto ? ordenarPorUrgencia(agrupadas) : agrupadas;
  }, [filtradas, sinTexto]);
  const paginaPrendas = paginar(prendas, pagina, FILAS_POR_PAGINA);
  // Las tarjetas: una por MODELO (sus colores van en la misma tarjeta), lo ya filtrado, en el orden elegido. Sin `orden` (o con uno que
  // esta sede no ofrece: Taller no separa piso y almacén) queda el orden de siempre.
  const opcionesDeOrden = opcionesOrden(resumen.separaPisoAlmacen);
  const ordenEfectivo = opcionesDeOrden.some((o) => o.valor === orden) ? orden : "relevancia";
  const modelosOrdenados = useMemo(() => ordenarModelos(agruparPorModelo(prendas), ordenEfectivo), [prendas, ordenEfectivo]);
  const paginaTarjetas = paginar(modelosOrdenados, pagina, FILAS_POR_PAGINA);
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

  const hayFiltrosActivos =
    busqueda !== "" || categoria !== TODAS || marcaEfectiva !== TODAS || talla !== TODAS || color !== TODAS || accion !== TODAS || condicion !== TODAS;
  // Cuántos combos están puestos: lo dice el botón «Filtros» del celular, para que un filtro plegado no esconda filas en silencio.
  const combosActivos = [categoria, marcaEfectiva, talla, color, accion, condicion].filter((v) => v !== TODAS).length;
  /** Quita todo menos el Estado (búsqueda, categoría, marca, talla, color y Acción). Es el «Ver todas» de «Por colgar»: que la
   *  lista vuelva a ser lo que cuenta la píldora. Quitar Acción nunca esconde una talla por colgar (todas piden «Reponer a
   *  piso»), y dejarla puesta podía trabar la lista: «Sin acción» + «Por colgar» no tiene ni una fila (dos filtros que se
   *  vacían entre sí, lo que esta pantalla no permite). */
  function quitarFiltrosMenosEstado() {
    limpiar(["estado", "orden"]);
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
  });
  const puedeReponer = permisos.reponerYRetirar;
  const puedeAjustarAqui = permisos.ajustar;
  const resumenApartados = useMemo(() => resumirApartados(apartados, hoyLima()), [apartados]);
  const separa = resumen.separaPisoAlmacen;

  // La prenda abierta sale de TODO el stock, no de lo filtrado: si se abre escaneando o tras un guardado cambia su «Acción
  // hoy», el detalle no se cierra solo por dejar de coincidir con un filtro.
  const prendaAbierta = useMemo(() => (abierta ? (agruparPorPrenda(stock).find((p) => p.clave === abierta.clave) ?? null) : null), [abierta, stock]);
  // Marcar varias y llevarlas a otra pantalla (Bajar al piso, Trasladar, Etiquetas) solo en la sede activa: esas pantallas
  // trabajan siempre sobre la sede de quien las abre, y lo marcado mirando otra se perdería en silencio al llegar.
  const conSeleccion = enSedeActiva;
  const filasMarcadas = useMemo(() => stock.filter((f) => marcadas.has(f.varianteId)), [stock, marcadas]);
  function abrirPrenda(p: Pick<PrendaAgrupada, "clave">, varianteId?: string) {
    setAbierta({ clave: p.clave, varianteId });
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
  /** Un código leído (pistola con Enter, o la cámara): abre la prenda parada en esa talla. Si no es de ninguna prenda de
   *  esta sede, queda escrito en el buscador y el estado vacío explica por qué no aparece. */
  function abrirPorCodigo(codigo: string): boolean {
    const f = tallaPorCodigo(stock, codigo);
    if (!f) {
      setBusqueda(codigo.trim());
      return false;
    }
    setBusqueda("");
    setVerDetalle(true);
    abrirPrenda(agruparPorPrenda([f])[0], f.varianteId);
    return true;
  }

  // «Ver recomendaciones» / «Ver análisis de cobertura» ya no viven en Existencias (rediseño 2026-09-28, cabecera de
  // «Prioridades de hoy» más abajo): `abrirDesdeRecomendacion` (main, PR #575) resolvía un clic dentro de ese overlay
  // retirado — sin overlay, sin destino. La cobertura sigue disponible en Análisis; las recomendaciones, en «Acción hoy»
  // de cada fila y en la tarjeta «Reponer a piso hoy».

  // «Resumen disponible»: dónde está lo LIBRE (neto de apartadas), así piso + almacén suman exactamente la cifra de la tarjeta.
  const libres = useMemo(
    () => ({ piso: stock.reduce((acc, f) => acc + (f.pisoDisponible ?? 0), 0), almacen: stock.reduce((acc, f) => acc + (f.almacenDisponible ?? 0), 0) }),
    [stock]
  );

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
    if (separa) encabezados.push("Piso", "Almacén", "Cobertura piso", "Ritmo reciente", "Acción hoy");
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
          f.accionHoy ? f.accionHoy.texto : "—"
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
  if (talla !== TODAS) filtrosActivos.push({ clave: "talla", etiqueta: "Talla", valor: talla });
  if (color !== TODAS) filtrosActivos.push({ clave: "color", etiqueta: "Color", valor: color });
  if (accion !== TODAS) filtrosActivos.push({ clave: "accion", etiqueta: "Acción", valor: TEXTO_ACCION_HOY[accion as TipoAccionHoy] });
  if (condicion !== TODAS) filtrosActivos.push({ clave: "estado", etiqueta: "Estado", valor: condicion === DANADO ? "Dañado / cuarentena" : "Por colgar" });
  // Productos que el catálogo tiene pero esta sede NO (ni una fila de stock) y que coinciden con lo escrito. Se avisa aunque haya
  // resultados: quien busca «cayla» y ve Top Aurora («Cayla 2») debe saber que los pantalones de la marca CAYLA existen y aquí no llegaron.
  const sinRastroAqui = useMemo(
    () => (busqueda.trim() ? sinStockQueCoincide(busqueda, indiceBusqueda.vocabulario, sinStock, { filtroMarca: filtroMarcaElegida, filtroCategoria: filtroCategoriaElegida }) : { productos: [], total: 0 }),
    [busqueda, indiceBusqueda, sinStock, filtroMarcaElegida, filtroCategoriaElegida]
  );
  const sinNadaPorColgar = condicion === POR_COLGAR && cuentaPorColgar.tallas === 0;
  const explicacionVacio =
    filtradas.length === 0 && stock.length > 0 && !sinNadaPorColgar
      ? explicarVacio({
          consulta: busqueda,
          sede: sedeNombre,
          filtros: filtrosActivos,
          vocabulario: indiceBusqueda.vocabulario,
          palabras: palabrasBuscables(stock),
          // «¿Cuántas prendas se verían si esto no estuviera?»: el mismo filtro de la tabla, sin el texto o sin un filtro visual.
          contar: (consulta, omitir) =>
            filtrarConBusquedaEspecial(indiceBusqueda, consulta, {
              talla: omitir.has("talla") || talla === TODAS ? null : talla,
              color: omitir.has("color") || color === TODAS ? null : color,
              otros: (f) => pasaFiltros(f, { categoria, marca: marcaEfectiva, accion, condicion }, omitir),
            }).filas.length,
          sinStock,
          filtroMarca: filtroMarcaElegida,
          filtroCategoria: filtroCategoriaElegida,
        })
      : null;
  function quitarFiltro(clave: ClaveFiltro) {
    if (clave === "categoria") setCategoria(TODAS);
    else if (clave === "marca") setMarca(TODAS);
    else if (clave === "talla") setTalla(TODAS);
    else if (clave === "color") setColor(TODAS);
    else if (clave === "accion") setAccion(TODAS);
    else setCondicion(TODAS);
  }

  const hrefBajarMarcadas = puedeBajarAlPiso ? urlBajarAlPiso(filasMarcadas) : null;
  const hrefTrasladarMarcadas = veTraslados ? urlTrasladar(filasMarcadas) : null;
  const hrefEtiquetasMarcadas = urlEtiquetas(filasMarcadas);
  const prendasMarcadas = new Set(filasMarcadas.map((f) => clavePercha(f))).size;

  return (
    // En el celular, aire al final para que el botón fijo «Escanear» no tape la última prenda.
    <div className="space-y-6 max-sm:space-y-4 max-sm:pb-24">
      {/* Prioridades de hoy (diseño aprobado por Felipe, 2026-09-28; orden y «Reponer a piso hoy» rediseñados el 2026-09-29): la
          cabecera y las 4 tarjetas — Resumen disponible, Reponer a piso hoy, En camino hacia acá e Incidencias. Sin enlaces utilitarios a la derecha: «Ver
          recomendaciones» y «Ver análisis de cobertura» ya no viven aquí (la cobertura es de Análisis). «Reponer a piso hoy»
          (2026-09-25) cuenta y filtra por «Acción hoy» — MISMA fuente que la columna de la tabla (`calcularAccionHoy`), nunca
          un semáforo aparte (sección 15). */}
      <div>
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
          <div>
            <h2 className="font-display text-[22px] leading-tight text-tinta">Prioridades de hoy</h2>
            <p className="mt-1 hidden text-[13.5px] text-taupe sm:block">Acciones clave para mantener el piso completo y la operación al día.</p>
          </div>
          {/* Solo si hay apartadas: un acceso a su lista, que sin ellas no existe (el diseño aprobado no lo dibuja en su estado normal). */}
          {resumen.apartado > 0 && (
            <button
              type="button"
              onClick={() => setViendoApartados(true)}
              className={`label-cayla text-[11px] hover:underline ${resumenApartados.vencidos > 0 ? "text-rojo-profundo" : "text-taupe hover:text-rojo"}`}
            >
              {resumen.apartado} {resumen.apartado === 1 ? "apartada" : "apartadas"} para clientes
              {resumenApartados.vencidos > 0 && ` · ${resumenApartados.vencidos} ${resumenApartados.vencidos === 1 ? "vencido" : "vencidos"}`}
            </button>
          )}
        </div>
        {/* Orden (Felipe, 2026-09-29): Resumen disponible, Reponer a piso hoy, En camino hacia acá e Incidencias. «Reponer a piso hoy»
            solo dice con qué empezar (`TarjetaReponerAPiso`): hasta tres prendas que piden piso. */}
        {/* En pantalla grande, las tarjetas del mismo ancho (cuatro donde se separa piso y almacén, dos donde no). */}
        <div className={`mt-3.5 grid grid-cols-2 gap-2.5 sm:gap-3.5 ${separa ? "xl:grid-cols-4" : "xl:grid-cols-2"}`}>
          {/* En pantallas angostas el resumen ocupa el renglón entero (la tarjeta de reponer también), para que no quede un hueco al lado. */}
          <div className={`${separa ? "max-xl:col-span-2" : ""} xl:contents`}>
            <TarjetaPrioridad icono={Package} etiqueta="Resumen disponible" valor={resumen.disponible} unidad="uds" activa={viendoDisponible} onClick={() => setViendoDisponible(true)}>
              {/* Donde se separa piso y almacén, dónde está lo disponible. Donde no (Taller), el cambio de 7 días. Al tocarla se abre
                  `ResumenStockOverlay`: prendas por categoría en almacén y piso, lo vendido en el mes y lo que más sale. */}
              {separa
                ? `${libres.piso.toLocaleString("es-PE")} en piso · ${libres.almacen.toLocaleString("es-PE")} en almacén`
                : comparacionFallo
                  ? "No se pudo calcular la comparación ahora"
                  : deltaSede.pct === null
                    ? "Sin datos de hace 7 días para comparar"
                    : `${deltaSede.pct >= 0 ? "+" : ""}${Math.round(deltaSede.pct)}% vs. semana anterior`}
            </TarjetaPrioridad>
          </div>
          {separa && (
            <TarjetaReponerAPiso
              stock={stock}
              onVerPrenda={(p) => {
                setBusqueda(p.referencia);
                mostrarTablaFiltrada();
              }}
            />
          )}
          <TarjetaPrioridad icono={Truck} etiqueta="En camino hacia acá" valor={resumen.enTransito} unidad="unidades" href="/inventario/traslados">
            {enCamino.traslados === 0
              ? "Ningún traslado en camino"
              : `${enCamino.traslados} ${enCamino.traslados === 1 ? "traslado" : "traslados"}${
                  enCamino.proximaLlegada ? ` · el próximo llega ${fechaHora(enCamino.proximaLlegada)}` : ""
                }${enCamino.atrasados > 0 ? ` · ${enCamino.atrasados} ${enCamino.atrasados === 1 ? "atrasado" : "atrasados"}` : ""}`}
          </TarjetaPrioridad>
          {separa && (
            <TarjetaPrioridad
              icono={AlertTriangle}
              etiqueta="Incidencias"
              valor={danadosPendientes.length}
              unidad={danadosPendientes.length === 1 ? "prenda" : "prendas"}
              activa={viendoDanados}
              onClick={() => setViendoDanados(true)}
            >
              {danadosPendientes.length === 0 ? "Ninguna prenda dañada pendiente" : "Dañado / cuarentena pendiente"}
            </TarjetaPrioridad>
          )}
        </div>
      </div>

      {/* Guía oficial (2026-09-22, ADR-0169): los filtros y la tabla viven en UNA tarjeta — lo que se filtra
          y lo filtrado se leen como una sola cosa. Los filtros son cajas hundidas en hueso, sin etiqueta visible.
          `scroll-mt-24` compensa la cabecera fija: con menos, al llegar aquí (paginar, «Reponer a piso hoy») el
          buscador quedaba debajo de ella.

          Con «Ver detalle» (la tabla) sigue siendo UNA tarjeta. Con las tarjetas de prenda (la lista de entrada) los filtros
          son la tarjeta y las prendas van debajo, cada una en la suya. */}
      <div ref={tarjetaTablaRef} className={`scroll-mt-24 ${verDetalle ? "card-cayla overflow-hidden" : ""}`}>
      {stock.length > 0 && (
        // Diseño aprobado (2026-09-28): buscador, cinco combos, el resumen de lo que falta colgar y el selector de vista, uno bajo
        // otro y con poco aire; la tabla arranca justo debajo. Sin píldora «Por colgar» ni texto explicativo sobre la lista.
        <div className={`flex flex-col px-4 pt-4 sm:px-3 sm:pt-3 ${verDetalle ? "" : "card-cayla"}`}>
          {/* Sin corrector del navegador: «CAYLA», «miramhe» o «pol-0004» no son palabras de diccionario, y el subrayado rojo
              sugería que estaba mal escrito lo que era una marca. */}
          <label className="caja-cayla order-1 flex h-[38px] items-center gap-3 px-3.5">
            <span className="sr-only">Buscar</span>
            <Search aria-hidden className="h-[18px] w-[18px] shrink-0 text-tinta/65" strokeWidth={1.6} />
            <input
              id={ID_BUSCADOR}
              type="text"
              placeholder={mostrarMarca ? "Buscar prenda, marca, código, color o talla..." : "Buscar prenda, código, color o talla..."}
              value={busqueda}
              onChange={(e) => teclear(e.target.value)}
              onBlur={soltarBusqueda}
              // La pistola escribe el código y manda Enter: si es el código exacto de una talla, se abre esa prenda. Si no
              // (un nombre, un pedazo), Enter no hace nada y la lista sigue filtrada por lo escrito.
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                if (tallaPorCodigo(stock, busqueda)) abrirPorCodigo(busqueda);
              }}
              enterKeyHint="search"
              spellCheck={false}
              autoComplete="off"
              className="h-full w-full bg-transparent text-[13px] text-tinta outline-none placeholder:text-tinta/55"
            />
          </label>
          {/* En computadora `sm:grid` deja cada combo en su celda; en el celular es una columna que se pliega tras «Filtros» (tarea
              #6) y se ve DEBAJO de la fila del resumen (`order`): así, al abrirla, el botón no se mueve bajo el dedo (ADR-0185). */}
          <div id="existencias-combos" className={`${filtrosAbiertos ? "grid" : "hidden"} order-2 mt-3.5 gap-x-3.5 gap-y-2 max-sm:order-3 sm:grid ${COLUMNAS_FILTROS[3 + (separa ? 2 : 0) + (mostrarMarca ? 1 : 0)]}`}>
            {/* La marca, junto al buscador: es lo primero que se sabe de una prenda y la forma más rápida de encontrarla. */}
            {mostrarMarca && (
              <FiltroCombo
                etiqueta="Marca"
                valor={marca}
                onValor={setMarca}
                marcador="Todas"
                opciones={[{ valor: TODAS, texto: "Marca: todas" }, ...marcas.map((m) => ({ valor: m, texto: m }))]}
              />
            )}
            <FiltroCombo
              etiqueta="Categoría"
              valor={categoria}
              onValor={setCategoria}
              marcador="Todas"
              opciones={[{ valor: TODAS, texto: "Categoría: todas" }, ...categorias.map((c) => ({ valor: c, texto: c }))]}
            />
            <FiltroCombo
              etiqueta="Talla"
              valor={talla}
              onValor={setTalla}
              marcador="Todas"
              opciones={[{ valor: TODAS, texto: "Talla: todas" }, ...tallas.map((t) => ({ valor: t, texto: t }))]}
              pie={dichoEnLaBusqueda.talla && talla !== TODAS ? "Se usa lo que escribiste" : undefined}
            />
            <FiltroCombo
              etiqueta="Color"
              valor={color}
              onValor={setColor}
              marcador="Todos"
              opciones={[{ valor: TODAS, texto: "Color: todos" }, ...colores.map((c) => ({ valor: c, texto: c }))]}
              pie={dichoEnLaBusqueda.color && color !== TODAS ? "Se usa lo que escribiste" : undefined}
            />
            {/* «Acción» filtra SOLO por `TipoAccionHoy` (qué debería hacer la vendedora) — «Estado»
                es la condición del inventario (dañado/cuarentena, por colgar), un eje aparte (2026-09-25:
                mezclarlos en un solo dropdown confundía «qué hacer» con «en qué condición está»). */}
            {separa && (
              <FiltroCombo
                etiqueta="Acción"
                valor={accion}
                onValor={setAccion}
                marcador="Todas"
                opciones={[{ valor: TODAS, texto: "Acción: todas" }, ...OPCIONES_FILTRO_ACCION.map((a) => ({ valor: a, texto: TEXTO_ACCION_HOY[a] }))]}
              />
            )}
            {separa && (
              <FiltroCombo
                etiqueta="Estado"
                valor={condicion}
                onValor={setCondicion}
                marcador="Todos"
                opciones={[
                  { valor: TODAS, texto: "Estado: todos" },
                  { valor: DANADO, texto: "Dañado / cuarentena" },
                  { valor: POR_COLGAR, texto: "Por colgar" },
                ]}
              />
            )}
          </div>
          {/* Una sola fila: a la izquierda cuánto falta colgar (el filtro «Por colgar» sigue en «Estado»); a la derecha, «Limpiar
              filtros» y el selector de vista. Existe antes de filtrar, así que activar un filtro no empuja la tabla. */}
          <div className="order-3 mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 pb-2.5 max-sm:order-2 max-sm:mt-3 max-sm:pb-3 sm:col-span-full">
            {/* Solo en el celular: abre y cierra los combos (tarea #6), con cuántos hay puestos para que un filtro plegado no
                esconda filas en silencio. */}
            <button
              type="button"
              aria-expanded={filtrosAbiertos}
              aria-controls="existencias-combos"
              onClick={() => setFiltrosAbiertos((a) => !a)}
              className="pildora-cayla sm:hidden"
            >
              <SlidersHorizontal aria-hidden className="h-3.5 w-3.5" />
              Filtros
              {combosActivos > 0 && <span className="font-normal tabular-nums">· {combosActivos}</span>}
            </button>
            {/* Cuántas prendas se ven (modelo + color). Las tallas por reponer, con sus unidades en el almacén, ya las dice la
                tarjeta «Reponer a piso hoy». */}
            <p className="text-[13px] text-taupe" aria-live="polite">
              {modelosOrdenados.length} {modelosOrdenados.length === 1 ? "producto" : "productos"} · {separa ? "Vista de piso y almacén" : "Vista de la sede"}
            </p>
            {/* La aclaración de «Por colgar», solo si ese estado está elegido y hay algo por colgar (sobre una lista vacía,
                «elige cuáles» contradice al «Nada por colgar» de abajo). Dice una de dos cosas:
                · si otro filtro esconde tallas, cuántas se ven de las que cuenta el resumen — mira toda la sede, y ver 3 filas
                  bajo «22 tallas» sin saber por qué es un callejón;
                · si se ven todas, que no es una orden de bajar todo (riesgo que nombró el plan): hay tallas que se guardan a
                  propósito, la lista es para decidir. */}
            {separa && condicion === POR_COLGAR && cuentaPorColgar.tallas > 0 && (
              <p className="min-w-[16rem] flex-1 text-xs leading-snug text-taupe">
                {filtradas.length < cuentaPorColgar.tallas ? (
                  <>
                    Ves {filtradas.length} de {cuentaPorColgar.tallas}: la búsqueda u otro filtro esconde el resto.{" "}
                    <button type="button" onClick={quitarFiltrosMenosEstado} className="btn-enlace text-xs">
                      Ver todas
                    </button>
                  </>
                ) : (
                  "Algunas se guardan a propósito (fin de temporada): no es una orden de bajar todo, elige cuáles van al piso."
                )}
              </p>
            )}
            <span className="ml-auto flex items-center gap-3">
              {hayFiltrosActivos && (
                <span className="flex items-center gap-1.5">
                  <SlidersHorizontal aria-hidden className="h-3.5 w-3.5 text-tinta/40" />
                  <button type="button" onClick={limpiarFiltros} className="label-cayla text-[11px] text-taupe underline-offset-2 hover:text-rojo hover:underline">
                    Limpiar filtros
                  </button>
                </span>
              )}
              {/* «Ver detalle» cambia entre las tarjetas (de entrada) y la tabla de siempre; vuelve con «Ver tarjetas». */}
              <button
                type="button"
                aria-pressed={verDetalle}
                title={verDetalle ? "Volver a las tarjetas" : "Ver el detalle en una tabla"}
                onClick={() => {
                  // Las tarjetas no tienen cajón: al volver a ellas se cierra el de la tabla.
                  if (verDetalle) setAbierta(null);
                  setVerDetalle((d) => !d);
                  setPagina(1);
                }}
                className="btn-cayla btn-secundario min-h-[34px] gap-2 px-3 py-1 text-[13px] text-taupe aria-pressed:border-tinta aria-pressed:bg-tinta aria-pressed:text-crema"
              >
                {verDetalle ? <LayoutGrid aria-hidden className="h-4 w-4" strokeWidth={1.5} /> : <Table2 aria-hidden className="h-4 w-4" strokeWidth={1.5} />}
                {verDetalle ? "Ver tarjetas" : "Ver detalle"}
              </button>
              {verDetalle ? (
                // Por prenda (de entrada) o por talla (la tabla con Cobertura y Ritmo, ADR-0231). ADR-0237.
                <span className="flex items-center gap-2.5 text-[13px] text-taupe">
                  Vista:
                  <span role="group" aria-label="Ver la lista" className="inline-flex overflow-hidden rounded-lg border border-tinta/15 bg-papel text-[13px]">
                    {(
                      [
                        ["prenda", "Por prenda"],
                        ["talla", "Por talla"],
                      ] as const
                    ).map(([v, texto]) => (
                      <button
                        key={v}
                        type="button"
                        aria-pressed={vista === v}
                        onClick={() => {
                          setVista(v);
                          setPagina(1);
                        }}
                        className={`px-4 py-1 transition-colors ${vista === v ? "bg-hueso font-medium text-tinta" : "text-taupe hover:text-tinta"}`}
                      >
                        {texto}
                      </button>
                    ))}
                  </span>
                </span>
              ) : (
                <span className="flex items-center gap-2.5 text-[13px] text-taupe">
                  Ordenar por:
                  <span className="w-44">
                    <Desplegable
                      valor={ordenEfectivo}
                      onValor={setOrden}
                      opciones={opcionesDeOrden.map((o) => ({ valor: o.valor, texto: o.texto }))}
                      marcador="Más relevantes"
                      forma="cajaBaja"
                      alineacion="derecha"
                      etiquetaAccesible="Ordenar por"
                    />
                  </span>
                </span>
              )}
            </span>
          </div>
        </div>
      )}

      {separa && coberturaFallo && stock.length > 0 && <p className={`px-4 pb-2 text-xs text-ambar sm:px-5 ${verDetalle ? "" : "pt-3"}`}>{coberturaFallo}</p>}
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
        // «para vender», no «colgada»: la regla mira lo disponible, y lo colgado pero apartado no cuenta.
        sinNadaPorColgar || !explicacionVacio ? (
          <p className={`p-5 text-sm text-taupe ${verDetalle ? "border-t border-sand" : "card-cayla mt-3.5"}`}>Nada por colgar: toda talla con algo para bajar del almacén tiene al menos una para vender en el piso.</p>
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
            puedeReponer={puedeReponer}
            puedeAjustar={puedeAjustarAqui}
            onReponer={(prenda, origen) => {
              setAbierta(null);
              abrirReponer(prenda, origen);
            }}
            onSubir={(prenda, origen) => {
              setAbierta(null);
              abrirSubir(prenda, origen);
            }}
            onAjustar={(f) => {
              setAbierta(null);
              setAjustando(f);
            }}
            // «Ver detalle» de una tarjeta: ese producto en la tabla (donde está el cajón de la prenda).
            onVerDetalle={(p) => {
              setBusqueda(p.referencia);
              setVerDetalle(true);
              setPagina(1);
            }}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-1 pt-4 text-xs text-taupe">
            <span className="flex flex-wrap items-center gap-3">
              <span>
                {paginaTarjetas.totalPaginas > 1 ? `Mostrando ${paginaTarjetas.desde}–${paginaTarjetas.hasta} de ` : "Mostrando "}
                {modelosOrdenados.length} {modelosOrdenados.length === 1 ? "producto" : "productos"} · {filtradas.length} {filtradas.length === 1 ? "talla" : "tallas"}
              </span>
              <PaginacionLocal pagina={paginaTarjetas.pagina} totalPaginas={paginaTarjetas.totalPaginas} onPagina={irAPagina} />
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
                  <span aria-hidden className="inline-block h-2.5 w-3.5 rounded-sm border border-rojo/35 bg-rojo/10" />
                  Sin stock aquí
                </span>
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
                  <span aria-hidden className="inline-block h-2.5 w-3.5 rounded-sm border border-rojo/35 bg-rojo/10" />
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
                    { titulo: <>Acción hoy<span className="@min-[1070px]:hidden"> · En la red</span></> },
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
                className={`grid fila-cayla cursor-pointer gap-x-4 gap-y-2.5 px-5 py-1.5 transition-colors focus-visible:outline-none sm:items-center ${plantilla} ${
                  filaAbierta ? "bg-rojo/[0.07]" : marcadaFila ? "bg-sand/35" : "hover:bg-sand/25 focus-visible:bg-sand/25"
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
                    <MiniaturaPrenda fotoUrl={f.fotoUrl} colorHex={f.colorHex} tamano="md" />
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
                        <span className="label-cayla text-[10px] text-tinta/45 sm:hidden">Acción hoy</span>
                        {/* Solo el diagnóstico, nunca un botón (diseño aprobado). «Por colgar» es lo más específico de «Reponer a piso»
                            (piso en 0 y algo atrás), así que cuando aplica es el chip; si no, «Reponer a piso» o «Mantener». La cifra es lo
                            que se puede bajar (disponible, neto de apartados): la suma de estos chips es la del resumen de arriba. */}
                        {!f.accionHoy ? (
                          <span className="text-xs text-tinta/40">N/D</span>
                        ) : porColgar(f) ? (
                          <ChipAlerta
                            titulo={`En el piso no queda ninguna para vender; en el almacén hay ${f.almacenDisponible} que se ${f.almacenDisponible === 1 ? "puede" : "pueden"} colgar`}
                          >
                            Por colgar · {f.almacenDisponible} {f.almacenDisponible === 1 ? "ud" : "uds"}
                          </ChipAlerta>
                        ) : f.accionHoy.tipo === "sin_accion" ? (
                          <ChipMantener titulo={AYUDA_ACCION_HOY.sin_accion}>{f.accionHoy.texto}</ChipMantener>
                        ) : (
                          <Chip tono={TONO_ACCION_HOY[f.accionHoy.tipo]} className="text-xs">
                            <span title={AYUDA_ACCION_HOY[f.accionHoy.tipo]}>{f.accionHoy.texto}</span>
                          </Chip>
                        )}
                        {/* Contexto (2026-09-25, tercera ronda): «Sin stock en almacén», «Sin stock en almacén · 8 uds en camino» — nota
                            corta, nunca reemplaza al chip: la necesidad de piso sigue siendo «Reponer a piso» aunque no haya de dónde
                            bajarlo hoy. */}
                        {f.accionHoy?.contexto && <span className="basis-full text-[11px] leading-tight text-taupe">{f.accionHoy.contexto}</span>}
                        {/* Independiente de «Acción hoy»: una prenda puede no pedir nada y tener unidades dañadas en cuarentena al
                            mismo tiempo — no son el mismo eje. Solo informa; resolverlas vive en la tarjeta «Incidencias». */}
                        {!!f.danado && (
                          <Chip tono="rojo">
                            <span title="En cuarentena, esperando Liquidada/Se botó/Donada">Dañado · {f.danado}</span>
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
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-rojo" />
                  <span className="text-tinta/80">Por colgar</span>
                  <span className="hidden text-taupe lg:inline">· piso en cero y algo en el almacén</span>
                </span>
                {(["reponer_a_piso", "sin_accion"] as TipoAccionHoy[]).map((a) => (
                  <span key={a} className="inline-flex items-center gap-1.5" title={AYUDA_ACCION_HOY[a]}>
                    <span aria-hidden className={`inline-block h-2 w-2 rounded-full ${a === "sin_accion" ? "bg-verde" : "bg-ambar"}`} />
                    <span className="text-tinta/80">{TEXTO_ACCION_HOY[a]}</span>
                    <span className="hidden text-taupe lg:inline">· {AYUDA_ACCION_HOY[a]}</span>
                  </span>
                ))}
              </span>
            )}
          </div>
        </Tabla>
      )}
      </div>

      {prendasReponiendo.length > 0 && (
        <ReponerPrendaModal
          prendas={prendasReponiendo}
          ubicacionId={ubicacionId}
          sede={sedeNombre}
          alCerrarEnfocar={volverFoco}
          onClose={() => setReponiendo(null)}
        />
      )}

      {prendasSubiendo.length > 0 && (
        <SubirAAlmacenModal
          prendas={prendasSubiendo}
          ubicacionId={ubicacionId}
          sede={sedeNombre}
          politica={politica}
          alCerrarEnfocar={volverFoco}
          onClose={() => setSubiendo(null)}
        />
      )}

      {ajustando && (
        <AjustarInventarioModal
          productoId={ajustando.productoId}
          // Cada fila de Existencias es una prenda (modelo + color): el ajuste muestra solo sus tallas.
          prenda={{ color: ajustando.color, colorHex: ajustando.colorHex, fotoUrl: ajustando.fotoUrl }}
          ubicacionId={ubicacionId}
          sububicaciones={sububicaciones}
          puedeBajarAlPiso={puedeBajarAlPiso}
          onClose={() => setAjustando(null)}
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
        <ResolverDanadosModal pendientes={danadosPendientes} esLider={esLider} otraSede={!enSedeActiva} onClose={() => setViendoDanados(false)} />
      )}

      {viendoApartados && <ApartadosModal apartados={apartados} otraSede={!enSedeActiva} onClose={() => setViendoApartados(false)} />}

      {viendoDisponible && <ResumenStockOverlay stock={stock} separa={separa} ubicacionId={ubicacionId} sedeNombre={sedeNombre} onClose={() => setViendoDisponible(false)} />}

      {/* «Ver análisis de cobertura» (AnalisisCoberturaOverlay) y «Ver recomendaciones» (RecomendacionesOverlay) no vuelven:
          el rediseño del 2026-09-28 los reemplaza por «Prioridades de hoy» y el diagnóstico de cada fila; la cobertura
          sigue disponible en Análisis. Ninguno de los dos componentes se borró del repo (`RecomendacionesOverlay.tsx`
          queda sin usar tras este merge, con el mismo criterio que `DetallePrendaExistencias.tsx`).

          El cajón de la prenda (diseño aprobado, 2026-09-28): el MISMO desde «Por prenda» y «Por talla». Sus acciones no abren un
          modal encima del cajón: lo cierran y abren el suyo (Reponer, Ajustar, Eliminar), que al guardar refresca la pantalla. Sin
          `key`: al tocar otra fila el cajón se queda y solo cambia su contenido. */}
      {prendaAbierta && (
        <CajonPrendaExistencias
          prenda={prendaAbierta}
          separa={separa}
          puedeReponer={puedeReponer}
          enSedeActiva={permisos.etiquetasEHistorial}
          puedeAjustar={puedeAjustarAqui}
          veTraslados={permisos.trasladar}
          puedeEliminar={permisos.eliminar}
          onEliminar={() => {
            setAbierta(null);
            setEliminando({ productoId: prendaAbierta.productoId, referencia: prendaAbierta.referencia, estado: prendaAbierta.tallas[0]?.estadoProducto ?? null });
          }}
          onReponer={(prenda) => {
            setAbierta(null);
            abrirReponer(prenda, null);
          }}
          onSubir={(prenda) => {
            setAbierta(null);
            abrirSubir(prenda, null);
          }}
          onAjustar={(f) => {
            setAbierta(null);
            setAjustando(f);
          }}
          onCerrar={() => setAbierta(null)}
        />
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
              <span className="text-crema/60"> · {filasMarcadas.length} {filasMarcadas.length === 1 ? "talla" : "tallas"}</span>
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
