"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { AlertTriangle, Boxes, ChevronRight, PackagePlus, Sparkles, SlidersHorizontal, Truck } from "lucide-react";
import { crearIndiceBusquedaEspecial, filtrarConBusquedaEspecial } from "@/lib/filtro-busqueda-especial";
import { Tabla, Encabezado, fila, celda } from "@/components/ui/Tabla";
import { CampoTexto, CampoSelect } from "@/components/ui/campos";
import { Chip, type TonoChip } from "@/components/ui/Chip";
import { MenuAcciones } from "@/components/ui/MenuAcciones";
import { PaginacionLocal } from "@/components/ui/PaginacionLocal";
import { useSedeActiva } from "@/components/SedeActiva";
import { paginar, paginarSinPartirGrupos } from "@/lib/paginacion";
import { ReponerPisoModal } from "@/components/ReponerPisoModal";
import { AjustarInventarioModal } from "@/components/AjustarInventarioModal";
import { ResolverDanadosModal } from "@/components/ResolverDanadosModal";
import { ApartarModal } from "@/components/ApartarModal";
import { ApartadosModal } from "@/components/ApartadosModal";
import { DisponibleTotalOverlay } from "@/components/DisponibleTotalOverlay";
import { AnalisisCoberturaOverlay } from "@/components/AnalisisCoberturaOverlay";
import { RecomendacionesOverlay } from "@/components/RecomendacionesOverlay";
import { RitmoRecientePopover } from "@/components/RitmoRecientePopover";
import { hoyLima, resumirApartados, type Apartado } from "@/lib/apartados-reglas";
import { ProductoVarianteCelda } from "@/components/ui/PrendaCelda";
import { ExistenciasVacio } from "@/components/ExistenciasVacio";
import { explicarVacio, palabrasBuscables, sinStockQueCoincide, textoSinStock, type ClaveFiltro, type FiltroActivo, type ProductoSinStock } from "@/lib/existencias-vacio";
import { marcasDeLaSede } from "@/lib/existencias-catalogo-reglas";
import { resumenRed } from "@/lib/stock-por-sede";
import { descargarCsv } from "@/lib/exportar-csv";
import { TEXTO_ACCION_HOY, type Recomendacion, type TipoAccionHoy } from "@/lib/existencias-recomendaciones";
import { coincideConFiltroAccion, coincideConFiltroDanado, OPCIONES_FILTRO_ACCION } from "@/lib/existencias-filtros";
import { textoCoberturaPiso, textoRitmoReciente } from "@/lib/resumen-formato";
import { clavePercha, ordenarPorModeloColorTalla, porColgar, puedeRetirarPiso, resumirPorColgar, type SentidoPiso } from "@/lib/inventario-reglas";
import type { FilaSemana } from "@/lib/existencias-categorias";
import type { PoliticaOperativaInventario } from "@/lib/politica-operativa-inventario";
import type { FilaExistencias, ResumenExistencias, PrendaDanada } from "@/lib/inventario-v2";
import type { Sububicacion } from "@/lib/sububicaciones";

/** «Acción hoy» (2026-09-25): un tono fijo por tipo, no por urgencia — mismo criterio que tenía
 *  `EstadoStock`, para que el color siga significando lo mismo en cada fila. «Sin acción» no lleva
 *  chip (mismo criterio de «Normal»: es la mayoría de las filas, un chip verde ahí sería decoración). */
const TONO_ACCION_HOY: Record<Exclude<TipoAccionHoy, "sin_accion">, TonoChip> = {
  reponer_a_piso: "ambar",
};

const PUNTO_ACCION_HOY: Record<TipoAccionHoy, string> = {
  sin_accion: "bg-verde",
  reponer_a_piso: "bg-ambar",
};

const AYUDA_ACCION_HOY: Record<TipoAccionHoy, string> = {
  sin_accion: "Piso y almacén cubiertos, todo correcto",
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
 *  propia, solo contexto para distinguir «me falta inventario» de «tengo, pero está en almacén». */
function CeldaCoberturaPiso({ f }: { f: FilaExistencias }) {
  const c = f.coberturaPiso;
  if (!c) {
    return (
      <span className="text-xs text-tinta/40" title="Todavía no se pudo calcular">
        N/D
      </span>
    );
  }
  // El color sigue a «Acción hoy» (única fuente de verdad, 2026-09-25) — nunca un umbral aparte:
  // rojo exactamente cuando el motor ya decidió que esta prenda necesita algo hoy.
  const tono = f.accionHoy?.tipo === "reponer_a_piso" ? "text-rojo-profundo" : c.tipo === "agotado" ? "text-tinta/40" : "text-tinta/70";
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
  return (
    <span className={`text-xs font-medium tabular-nums ${tono}`} title={ayuda}>
      {textoCoberturaPiso(c)}
    </span>
  );
}

/** Una de las 4 tarjetas de «Prioridades de hoy» (rediseño 2026-09-22). `urgente` es el acento rojo de
 *  la que más pide algo — mismo criterio que el borde izquierdo de siempre, ahora también con un fondo
 *  y un ícono, y una flecha si es la que abre algo (clic o enlace). */
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
  // Guía oficial (2026-09-22, ADR-0169): papel plano con la línea de sand, sin sombra ni fondo tintado. Lo
  // urgente se dice con la CIFRA en rojo profundo y el borde un punto más cálido, no con una tarjeta rosada.
  const clase = `card-cayla group relative block p-5 text-left transition-colors ${urgente ? "border-rojo/30" : ""} ${
    clickeable ? "hover:bg-sand/30" : ""
  } ${activa ? "bg-sand/40" : ""}`;
  const contenido = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="label-cayla flex items-center gap-2 text-[11px] font-bold text-taupe">
          <Icono aria-hidden className={`h-3.5 w-3.5 ${urgente ? "text-rojo-profundo" : "text-taupe/70"}`} strokeWidth={1.75} />
          {etiqueta}
        </p>
        {clickeable && <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-taupe/50 transition-transform group-hover:translate-x-0.5" />}
      </div>
      <p className="mt-2 flex items-baseline gap-2">
        <span className={`font-display text-[28px] leading-tight tabular-nums ${urgente ? "text-rojo-profundo" : "text-tinta"}`}>{valor.toLocaleString("es-PE")}</span>
        <span className="text-sm text-taupe">{unidad}</span>
      </p>
      <p className="mt-1 text-xs text-taupe">{children}</p>
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
      <button type="button" onClick={onClick} className={`${clase} w-full`} aria-pressed={activa}>
        {contenido}
      </button>
    );
  }
  return <div className={clase}>{contenido}</div>;
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
  apartados,
  esLider,
  puedeAjustar,
  coberturaFallo = null,
  sedeNombre,
  sinStock,
  marcaFallo = null,
  verProductos = false,
  filasSemana,
  deltaSede,
  recomendaciones,
  politica,
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
  /** Apartados ABIERTOS de esta ubicación (ADR-0141), ya ordenados por fecha límite. Vacía en Taller. */
  apartados: Apartado[];
  /** Solo un líder puede resolver una prenda dañada (`resolver_prenda_danada`) —
   *  una integrante puede ABRIR la cola y verla, no marcarla. */
  /** Sigue siendo del líder: resolver y liquidar prendas dañadas. */
  esLider: boolean;
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
  /** Los últimos 7 días de la sede (`getFilasSemanaDeSede`): ritmo de venta, costo/precio/categoría y
   *  el delta vs. hace 7 días — alimenta el overlay de «Disponible total» (el ritmo de la tabla ya no sale de aquí: es el
   *  Ritmo reciente, `existencias-ritmo.ts`). */
  filasSemana: FilaSemana[];
  /** El delta de disponible de TODA la sede en los últimos 7 días, para la tarjeta «Disponible total». */
  deltaSede: { hoy: number; hace7d: number; pct: number | null };
  /** «Ver recomendaciones» (2026-09-22, motor propio desde 2026-09-25): `calcularAccionHoy` corrido
   *  por cada variante de la sede — ya ordenada por urgencia, vacía en Taller. */
  recomendaciones: Recomendacion[];
  /** Política operativa de Inventario (`politica-operativa-inventario.ts`): una sola fuente para
   *  los umbrales que leen el popover de Ritmo reciente y el aviso de «Retirar del piso» (`ReponerPisoModal`). */
  politica: PoliticaOperativaInventario;
}) {
  const router = useRouter();
  const [busqueda, setBusqueda] = useState("");
  const [categoria, setCategoria] = useState(TODAS);
  const [marca, setMarca] = useState(TODAS);
  const [talla, setTalla] = useState(TODAS);
  const [color, setColor] = useState(TODAS);
  // Dos ejes independientes (2026-09-25): «Acción» es SOLO `TipoAccionHoy` (qué debería hacer la
  // vendedora); «Estado» es la condición del inventario (dañado/cuarentena) — no son la misma
  // pregunta, y mezclarlos en un solo dropdown confundía dos clasificaciones distintas.
  const [accion, setAccion] = useState(TODAS);
  const [condicion, setCondicion] = useState(TODAS);
  // Reponer y retirar del piso abren el mismo modal; lo único que cambia es el sentido.
  // Se guarda la prenda y no una copia de su fila: tras un corte de red el modal refresca y sus cifras dicen si llegó.
  const [moviendo, setMoviendo] = useState<{ varianteId: string; sentido: SentidoPiso } | null>(null);
  const filaMoviendo = moviendo ? stock.find((f) => f.varianteId === moviendo.varianteId) : undefined;
  // El control que abrió el modal: al cerrarlo, el teclado vuelve a esa fila y no al principio de la página.
  const volverFoco = useRef<HTMLElement | null>(null);
  // El «⋯» de cada fila, para devolverle el foco (MenuAcciones no expone su botón).
  const menusPorFila = useRef(new Map<string, HTMLElement>());
  function abrirMovimiento(varianteId: string, sentido: SentidoPiso, origen: HTMLElement | null) {
    // Al «⋯» de la fila, que no depende de «Acción hoy»: tras reponer, el refresh suele quitar el botón «Reponer» que abrió.
    volverFoco.current = menusPorFila.current.get(varianteId)?.querySelector("button") ?? origen;
    setMoviendo({ varianteId, sentido });
  }
  const [ajustando, setAjustando] = useState<FilaExistencias | null>(null);
  const [viendoDanados, setViendoDanados] = useState(abrirDanados);
  const [apartando, setApartando] = useState<FilaExistencias | null>(null);
  const [viendoApartados, setViendoApartados] = useState(false);
  const [viendoDisponible, setViendoDisponible] = useState(false);
  const [viendoCobertura, setViendoCobertura] = useState(false);
  const [viendoRecomendaciones, setViendoRecomendaciones] = useState(false);

  const categorias = useMemo(
    () => Array.from(new Set(stock.map((f) => f.categoria).filter((c): c is string => !!c))).sort((a, b) => a.localeCompare(b, "es")),
    [stock]
  );
  // Las marcas de ESTA sede (no las 80 de la tabla `marcas`): un combo con marcas que aquí no tienen ni una prenda solo estorbaría.
  // Con una sola marca el filtro (y la marca en cada fila) sería ruido: aparece desde 2.
  const marcas = useMemo(() => marcasDeLaSede(stock), [stock]);
  const mostrarMarca = marcas.length >= 2;
  // Un filtro que no se ve no puede seguir filtrando: si la lectura de marcas falla tras un `router.refresh` (Reponer, Ajustar) el combo desaparece;
  // sin esto la marca elegida antes seguía activa, invisible, y dejaba la tabla en blanco.
  const marcaEfectiva = mostrarMarca && marcas.includes(marca) ? marca : TODAS;
  const tallas = useMemo(() => Array.from(new Set(stock.map((f) => f.talla).filter((t): t is string => !!t))).sort(), [stock]);
  const colores = useMemo(
    () => Array.from(new Set(stock.map((f) => f.color).filter((c): c is string => !!c))).sort((a, b) => a.localeCompare(b, "es")),
    [stock]
  );
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
  const firmaFiltros = [busqueda, categoria, marcaEfectiva, talla, color, accion, condicion].join("\u0000");
  const [firmaPrevia, setFirmaPrevia] = useState(firmaFiltros);
  if (firmaFiltros !== firmaPrevia) {
    setFirmaPrevia(firmaFiltros);
    setPagina(1);
  }
  // «Por colgar» va ordenada por percha: la página se estira hasta terminar la percha en curso, para que
  // la S y la M de una casaca no queden en la página 1 y su L en la 2.
  const paginaActual =
    condicion === POR_COLGAR ? paginarSinPartirGrupos(filtradas, pagina, FILAS_POR_PAGINA, clavePercha) : paginar(filtradas, pagina, FILAS_POR_PAGINA);
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
  /** Quita todo menos el Estado (búsqueda, categoría, marca, talla, color y Acción). Es el «Ver todas» de «Por colgar»: que la
   *  lista vuelva a ser lo que cuenta la píldora. Quitar Acción nunca esconde una talla por colgar (todas piden «Reponer a
   *  piso»), y dejarla puesta podía trabar la lista: «Sin acción» + «Por colgar» no tiene ni una fila (dos filtros que se
   *  vacían entre sí, lo que esta pantalla no permite). */
  function quitarFiltrosMenosEstado() {
    setBusqueda("");
    setCategoria(TODAS);
    setMarca(TODAS);
    setTalla(TODAS);
    setColor(TODAS);
    setAccion(TODAS);
  }
  function limpiarFiltros() {
    quitarFiltrosMenosEstado();
    setAccion(TODAS);
    setCondicion(TODAS);
  }

  const separaConSububicaciones = Boolean(resumen.separaPisoAlmacen && sububicacionPiso && sububicacionAlmacen);
  // Todo lo que escribe desde la fila firma con el Responsable de la sede ACTIVA: mirando otra (`?ubicacion=`) quedaría
  // allá firmado por alguien de turno acá. Para operar otra sede, se cambia la sede activa en la cabecera.
  const sedeActiva = useSedeActiva();
  const enSedeActiva = sedeActiva?.ubicacionId === ubicacionId;
  // Apartar necesita saber DE DÓNDE (piso o almacén): solo donde la ubicación separa las dos.
  const puedeApartar = separaConSububicaciones && enSedeActiva;
  const puedeReponer = separaConSububicaciones && enSedeActiva;
  const puedeAjustarAqui = puedeAjustar && enSedeActiva;
  const resumenApartados = useMemo(() => resumirApartados(apartados, hoyLima()), [apartados]);
  const separa = resumen.separaPisoAlmacen;

  // «Reponer a piso hoy» (tarjeta A): variantes que ya cuenta `resumen.requierenReposicion`, y las
  // unidades que se podrían bajar del almacén — el mismo `almacenDisponible` que usa el modal de
  // reposición (neto de apartados: lo apartado no se puede mover). MISMA fuente que la tarjeta y
  // la columna (`f.accionHoy`, `existencias-recomendaciones.ts`) — nunca un umbral aparte
  // (`necesitaReponerPiso`, retirado 2026-09-25): dos reglas contando cosas distintas es
  // exactamente la incoherencia que Felipe pidió cerrar.
  const unidadesReponer = useMemo(
    () => stock.reduce((acc, f) => (f.accionHoy?.tipo === "reponer_a_piso" && f.almacenDisponible !== null ? acc + f.almacenDisponible : acc), 0),
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

  // `minmax(13.5rem,1.3fr)`, no `1fr` a secas: con columnas fijas + `truncate` (que habilita min-width
  // automático 0 en la pista), una ventana angosta dejaba "Producto" en 0px. El piso de 13.5rem es la
  // miniatura (36px) más «Casaca Ximena» y su SKU debajo antes de que la Tabla entre a scroll
  // horizontal (`ui/Tabla.tsx`). Rediseño 2026-09-25: «Disponible» se fusionó en «Stock actual P/A»
  // (sección 3 del pedido) y «Cobertura»/«Ritmo (7D)» se reemplazaron por «Cobertura piso»/«Ritmo
  // reciente» — 8 columnas en vez de 9, todas sobre el ledger único.
  const plantilla = separa
    ? "sm:grid-cols-[minmax(13.5rem,1.3fr)_6rem_5rem_9rem_6rem_9rem_minmax(9rem,1fr)_6rem]"
    : "sm:grid-cols-[minmax(13.5rem,1.4fr)_6rem_6rem_minmax(9rem,1fr)_4.5rem]";

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

  return (
    <div className="space-y-6">
      {/* Prioridades de hoy (rediseño 2026-09-22): las 4 cifras que antes eran sueltas, ahora con un
          propósito de acción cada una. A es la más urgente (acento rojo); B abre el desglose por
          categoría; C y D se comportaban igual antes, solo con más presencia visual.
          «Reponer a piso hoy» (2026-09-25) cuenta y filtra por «Acción hoy» — MISMA fuente que la
          columna de la tabla (`calcularAccionHoy`), nunca un semáforo aparte (sección 15). */}
      <div>
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
          <div>
            <h2 className="font-display text-xl text-tinta">Prioridades de hoy</h2>
            <p className="mt-0.5 text-[13px] text-taupe">Acciones sugeridas para impulsar tus ventas en tienda.</p>
          </div>
          {/* Enlaces utilitarios de la sede (2026-09-25): «Ver recomendaciones» ya existía; «Ver análisis
              de cobertura» y «Ver apartados» vivían dentro de la franja «Distribución de stock» que se
              eliminó (pedido de Felipe, sección 19) — se reubican acá para no perder la función. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {separa && (
              <button
                type="button"
                onClick={() => setViendoRecomendaciones(true)}
                className="label-cayla inline-flex items-center gap-1.5 text-[11px] text-rojo hover:underline"
              >
                <Sparkles aria-hidden className="h-3.5 w-3.5" />
                Ver recomendaciones
                {recomendaciones.length > 0 && <span className="tabular-nums text-rojo/70">({recomendaciones.length})</span>}
                <ChevronRight aria-hidden className="h-3.5 w-3.5" />
              </button>
            )}
            {separa && resumen.total > 0 && (
              <button type="button" onClick={() => setViendoCobertura(true)} className="label-cayla text-[11px] text-taupe hover:text-rojo hover:underline">
                Ver análisis de cobertura
              </button>
            )}
            {resumen.apartado > 0 && (
              <button
                type="button"
                onClick={() => setViendoApartados(true)}
                className={`label-cayla text-[11px] hover:underline ${resumenApartados.vencidos > 0 ? "text-rojo-profundo" : "text-taupe hover:text-rojo"}`}
              >
                {resumen.apartado} {resumen.apartado === 1 ? "apartada" : "apartadas"} para clientas
                {resumenApartados.vencidos > 0 && ` · ${resumenApartados.vencidos} ${resumenApartados.vencidos === 1 ? "vencido" : "vencidos"}`}
              </button>
            )}
          </div>
        </div>
        <div className={`mt-3 grid gap-3 ${separa ? "sm:grid-cols-2 xl:grid-cols-4" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
          {separa && (
            <TarjetaPrioridad
              icono={PackagePlus}
              etiqueta="Reponer a piso hoy"
              valor={resumen.requierenReposicion}
              unidad={resumen.requierenReposicion === 1 ? "variante" : "variantes"}
              urgente={resumen.requierenReposicion > 0}
              activa={accion === "reponer_a_piso"}
              onClick={() => {
                const activar = accion !== "reponer_a_piso";
                setAccion(activar ? "reponer_a_piso" : TODAS);
                // Al ponerlo, la vista baja a la tabla para ver lo filtrado; al quitarlo, se queda en la tarjeta.
                if (activar) mostrarTablaFiltrada();
              }}
            >
              {/* `porColgar` exige piso<=0, que siempre cae dentro de la regla de Acción hoy (piso<=umbral
                  → reponer_a_piso): si hay algo «Por colgar», el contador de esta tarjeta ya no es 0, así
                  que no hace falta una tercera rama para avisarlo por separado. No dice «con demanda»
                  (2026-09-26): «Acción hoy» solo mira cuánto queda en el piso, nunca las ventas. */}
              {resumen.requierenReposicion === 0
                ? "Nada pendiente de bajar al piso"
                : `${unidadesReponer.toLocaleString("es-PE")} uds disponibles en almacén para bajar al piso`}
            </TarjetaPrioridad>
          )}
          <TarjetaPrioridad
            icono={Boxes}
            etiqueta="Disponible total"
            valor={resumen.disponible}
            unidad="unidades"
            activa={viendoDisponible}
            onClick={() => setViendoDisponible(true)}
          >
            {deltaSede.pct === null ? "Sin datos de hace 7 días para comparar" :`${deltaSede.pct >= 0 ? "+" : ""}${Math.round(deltaSede.pct)}% vs. semana anterior`}
          </TarjetaPrioridad>
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
              etiqueta="Dañado / Cuarentena"
              valor={danadosPendientes.length}
              unidad={danadosPendientes.length === 1 ? "prenda" : "prendas"}
              urgente={danadosPendientes.length > 0}
              activa={viendoDanados}
              onClick={() => setViendoDanados(true)}
            >
              {danadosPendientes.length === 0 ? "Ninguna prenda dañada pendiente" : "En revisión — liquidar, botar o donar"}
            </TarjetaPrioridad>
          )}
        </div>
      </div>

      {/* Guía oficial (2026-09-22, ADR-0169): los filtros y la tabla viven en UNA tarjeta — lo que se filtra
          y lo filtrado se leen como una sola cosa. Los filtros son cajas hundidas en hueso, sin etiqueta visible.
          `scroll-mt-24` compensa la cabecera fija: con menos, al llegar aquí (paginar, «Reponer a piso hoy») el
          buscador quedaba debajo de ella. */}
      <div ref={tarjetaTablaRef} className="card-cayla scroll-mt-24 overflow-hidden">
      {stock.length > 0 && (
        <div className={`grid gap-x-3 gap-y-1 px-4 pt-4 sm:px-5 sm:pt-5 ${COLUMNAS_FILTROS[3 + (separa ? 2 : 0) + (mostrarMarca ? 1 : 0)]}`}>
          {/* Sin corrector del navegador: «CAYLA», «miramhe» o «pol-0004» no son palabras de diccionario, y el subrayado rojo
              sugería que estaba mal escrito lo que era una marca. */}
          <div className="sm:col-span-full">
            <CampoTexto
              id={ID_BUSCADOR}
              caja
              etiqueta="Buscar"
              placeholder={mostrarMarca ? "Prenda, marca, código, color, talla…" : "Prenda, código, color, talla…"}
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              spellCheck={false}
              autoComplete="off"
            />
          </div>
          {/* La marca, junto al buscador: es lo primero que se sabe de una prenda y la forma más rápida de encontrarla. */}
          {mostrarMarca && (
            <CampoSelect
              caja
              etiqueta="Marca"
              valor={marca}
              onValor={setMarca}
              marcador="Todas"
              opciones={[{ valor: TODAS, texto: "Marca: todas" }, ...marcas.map((m) => ({ valor: m, texto: m }))]}
            />
          )}
          <CampoSelect
            caja
            etiqueta="Categoría"
            valor={categoria}
            onValor={setCategoria}
            marcador="Todas"
            opciones={[{ valor: TODAS, texto: "Categoría: todas" }, ...categorias.map((c) => ({ valor: c, texto: c }))]}
          />
          <CampoSelect
            caja
            etiqueta="Talla"
            valor={talla}
            onValor={setTalla}
            marcador="Todas"
            opciones={[{ valor: TODAS, texto: "Talla: todas" }, ...tallas.map((t) => ({ valor: t, texto: t }))]}
            pie={dichoEnLaBusqueda.talla && talla !== TODAS ? "Se usa lo que escribiste" : undefined}
          />
          <CampoSelect
            caja
            etiqueta="Color"
            valor={color}
            onValor={setColor}
            marcador="Todos"
            opciones={[{ valor: TODAS, texto: "Color: todos" }, ...colores.map((c) => ({ valor: c, texto: c }))]}
            pie={dichoEnLaBusqueda.color && color !== TODAS ? "Se usa lo que escribiste" : undefined}
          />
          {/* «Acción» filtra SOLO por `TipoAccionHoy` (qué debería hacer la vendedora) — «Estado»
              es la condición del inventario (dañado/cuarentena), un eje aparte (2026-09-25:
              mezclarlos en un solo dropdown confundía «qué hacer» con «en qué condición está»). */}
          {separa && (
            <CampoSelect
              caja
              etiqueta="Acción"
              valor={accion}
              onValor={setAccion}
              marcador="Todas"
              opciones={[{ valor: TODAS, texto: "Acción: todas" }, ...OPCIONES_FILTRO_ACCION.map((a) => ({ valor: a, texto: TEXTO_ACCION_HOY[a] }))]}
            />
          )}
          {separa && (
            <CampoSelect
              caja
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
          {/* Una sola fila para la píldora «Por colgar», su aclaración y «Limpiar filtros»: en una tienda la
              fila existe antes de filtrar, así que en escritorio activar «Por colgar» no empuja la tabla (la
              aclaración entra al lado de la píldora). En celular la aclaración baja a su propia línea. */}
          {(separa || hayFiltrosActivos) && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pb-3 pt-1 sm:col-span-full">
              {separa && (
                <button
                  type="button"
                  aria-pressed={condicion === POR_COLGAR}
                  onClick={() => setCondicion((e) => (e === POR_COLGAR ? TODAS : POR_COLGAR))}
                  // Con el filtro puesto sigue clicable aunque llegue a 0 (tras reponer la última): es como se quita.
                  disabled={cuentaPorColgar.tallas === 0 && condicion !== POR_COLGAR}
                  title="Tallas con unidades para bajar del almacén y ninguna para vender en el piso: la clienta no las ve"
                  className="pildora-cayla disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Por colgar
                  <span className="font-normal tabular-nums">
                    · {cuentaPorColgar.tallas} {cuentaPorColgar.tallas === 1 ? "talla" : "tallas"} · {cuentaPorColgar.unidades.toLocaleString("es-PE")}{" "}
                    {cuentaPorColgar.unidades === 1 ? "ud" : "uds"}
                  </span>
                </button>
              )}
              {/* La aclaración de «Por colgar», solo si hay algo por colgar (sobre una lista vacía, «elige
                  cuáles» contradice al «Nada por colgar» de abajo). Dice una de dos cosas:
                  · si otro filtro esconde tallas, cuántas se ven de las que cuenta la píldora — la píldora
                    mira toda la sede, y ver 3 filas bajo «22 tallas» sin saber por qué es un callejón;
                  · si se ven todas, que no es una orden de bajar todo (riesgo que nombró el plan): hay
                    tallas que se guardan a propósito, la lista es para decidir. */}
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
              {hayFiltrosActivos && (
                <span className="ml-auto flex items-center gap-1.5">
                  <SlidersHorizontal aria-hidden className="h-3.5 w-3.5 text-tinta/40" />
                  <button type="button" onClick={limpiarFiltros} className="label-cayla text-[11px] text-taupe underline-offset-2 hover:text-rojo hover:underline">
                    Limpiar filtros
                  </button>
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {separa && coberturaFallo && stock.length > 0 && <p className="px-4 pb-2 text-xs text-ambar sm:px-5">{coberturaFallo}</p>}
      {/* Si la marca no se pudo leer, se dice: sin el aviso, quien escribe una marca y no ve nada creería que no hay prendas. */}
      {marcaFallo && stock.length > 0 && <p className="px-4 pb-2 text-xs text-ambar sm:px-5">{marcaFallo} Mientras tanto no se puede buscar ni filtrar por marca.</p>}
      {/* Hay resultados, pero también productos del catálogo que esta sede no recibió (con el vacío, los cuenta el propio estado vacío). */}
      {/* Desde 3 letras: con una sola («b») casi todo el catálogo «coincide» y la línea aparecía y desaparecía en cada tecla, moviendo la tabla. */}
      {sinRastroAqui.total > 0 && filtradas.length > 0 && busqueda.trim().length >= 3 && (
        <p className="nota-cayla mx-4 mb-3 sm:mx-5">
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
        <p className="p-5 text-sm text-taupe">Esta ubicación no tiene stock todavía.</p>
      ) : filtradas.length === 0 ? (
        // «para vender», no «colgada»: la regla mira lo disponible, y lo colgado pero apartado no cuenta.
        sinNadaPorColgar || !explicacionVacio ? (
          <p className="border-t border-sand p-5 text-sm text-taupe">Nada por colgar: toda talla con algo para bajar del almacén tiene al menos una para vender en el piso.</p>
        ) : (
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
        )
      ) : (
        <Tabla className="rounded-none border-0 border-t border-sand bg-transparent">
          {/* Toda la tabla centrada (Felipe, 2026-09-15) salvo la prenda, que
              va a la izquierda como en su diseño: dos líneas (nombre, y SKU ·
              talla · color) se leen mal centradas. */}
          <Encabezado
            plantilla={plantilla}
            columnas={
              separa
                ? [
                    { titulo: "Producto / variante" },
                    { titulo: "Stock actual", subtitulo: "Piso / Almacén", alinear: "centro", ayuda: "Lo utilizable de hoy en esta sede — nunca cuarentena, nunca lo apartado para clientas" },
                    { titulo: "Cobertura piso", alinear: "centro", ayuda: "Cuánto dura el piso de hoy al Ritmo reciente" },
                    { titulo: "Ritmo reciente", subtitulo: "últimos 7 días", alinear: "centro", ayuda: "Ventas comerciales ÷ días de exposición en piso — toca para ver el detalle" },
                    { titulo: "En camino", alinear: "centro" },
                    { titulo: "Acción hoy", alinear: "centro" },
                    { titulo: "En la red", alinear: "centro" },
                    { titulo: "", alinear: "centro" },
                  ]
                : [
                    { titulo: "Producto / variante" },
                    { titulo: "Stock actual", alinear: "centro" },
                    { titulo: "En camino", alinear: "centro" },
                    { titulo: "En la red", alinear: "centro" },
                    { titulo: "", alinear: "centro" },
                  ]
            }
          />
          {paginaActual.filas.map((f) => {
            const red = resumenRed(f.enRed);
            const tallaColor = [f.talla, f.color].filter(Boolean).join("/");
            return (
              <div key={f.varianteId} className={fila(plantilla)}>
                {/* La misma celda que dibuja Conteo (`ui/PrendaCelda.tsx`). */}
                <ProductoVarianteCelda
                  referencia={f.referencia}
                  sku={f.sku}
                  talla={f.talla}
                  color={f.color}
                  colorHex={f.colorHex}
                  fotoUrl={f.fotoUrl}
                  marca={mostrarMarca ? f.marca : null}
                />
                {/* Las cifras (Stock actual, Cobertura piso, Ritmo reciente, En camino) amontonadas y pegadas a la izquierda
                    eran ilegibles en celular (Felipe, 2026-09-25): acá se agrupan en una grilla de 2×2 con cada una en su propia
                    tarjetita, para que se lean como datos separados, no como una sola oración. `sm:contents` disuelve este
                    envoltorio desde escritorio: ahí cada cifra vuelve a ser su propia columna, en el orden del encabezado — la
                    plantilla `sm:grid-cols` de arriba no cambia. */}
                <div className="col-span-full grid grid-cols-2 gap-2 border-t border-sand/70 pt-3 sm:contents sm:border-0 sm:pt-0">
                  {/* «Stock actual P/A» (2026-09-25, sección 4 del pedido): fusiona Piso·Almacén y
                      Disponible — mostrar los dos por separado era la misma información repetida
                      (Disponible = piso + almacén utilizable). En Taller (sin separación) es un solo
                      número: no hay un split que reportar con rigor.
                      Las cifras son las LIBRES (`pisoDisponible`/`almacenDisponible`, 2026-09-26, al resolver
                      el PR con main): las mismas que decide «Acción hoy», que pinta el ámbar, y que muestra el
                      modal de Reponer. Dibujar lo físico bajo una ayuda que dice «nunca lo apartado» hacía que
                      tabla y modal dieran dos cifras distintas para la misma percha; lo apartado va debajo. */}
                  <span
                    className={celda("centro", "rounded-lg bg-hueso/60 px-2 py-1.5 sm:rounded-none sm:bg-transparent sm:px-0 sm:py-0 text-sm tabular-nums")}
                    title={
                      separa
                        ? `Libre en piso: ${f.pisoDisponible ?? 0}\nLibre en almacén: ${f.almacenDisponible ?? 0}\nTotal libre: ${f.disponible}${f.apartado > 0 ? `\nApartadas para clientas: ${f.apartado}` : ""}`
                        : undefined
                    }
                  >
                    <span className="label-cayla mb-0.5 block text-[10px] text-tinta/45 sm:hidden">Stock actual</span>
                    {separa ? (
                      <>
                        {/* Ámbar exactamente cuando «Acción hoy» ya dice que esta fila necesita algo —
                            misma fuente que la columna, nunca un umbral aparte (2026-09-25). */}
                        <span className={f.accionHoy?.tipo === "reponer_a_piso" ? "text-ambar-profundo" : "text-tinta"}>{f.pisoDisponible}</span>
                        <span className="text-tinta/45"> / </span>
                        <span className="text-tinta">{f.almacenDisponible}</span>
                      </>
                    ) : (
                      <span className="font-semibold text-tinta">{f.disponible}</span>
                    )}
                    {f.apartado > 0 && (
                      <span className="block text-[10px] font-normal leading-3 text-ambar-profundo" title="Siguen en la tienda, pero apartadas para clientas: no se pueden vender">
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
                    <span className={celda("centro", "rounded-lg bg-hueso/60 px-2 py-1.5 sm:rounded-none sm:bg-transparent sm:px-0 sm:py-0 overflow-visible")}>
                      <span className="label-cayla mb-0.5 block text-[10px] text-tinta/45 sm:hidden">Ritmo reciente</span>
                      <RitmoRecientePopover ritmo={f.ritmoReciente ?? null} referencia={f.referencia} sku={f.sku} minDiasExposicionRitmo={politica.minDiasExposicionRitmo} />
                    </span>
                  )}
                  <span className={celda("centro", `rounded-lg bg-hueso/60 px-2 py-1.5 sm:rounded-none sm:bg-transparent sm:px-0 sm:py-0 text-sm tabular-nums ${f.enTransito > 0 ? "text-verde-profundo" : "text-tinta/35"}`)}>
                    <span className="label-cayla mb-0.5 block text-[10px] text-tinta/45 sm:hidden">En camino</span>
                    {f.enTransito > 0 ? `+${f.enTransito}` : "—"}
                  </span>
                </div>
                {/* En celular «Acción hoy» (chips + «Reponer», uno encima del otro) va a la derecha de «En la red», en el hueco
                    que dejaba vacío, en vez de ocupar un renglón propio (Felipe, 2026-09-25). `sm:contents` + `sm:[grid-area:auto]`
                    devuelven cada celda a su columna de escritorio, en el orden del encabezado. */}
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 border-t border-sand/70 pt-3 sm:contents">
                {separa && (
                  <span className={celda("centro", "col-start-2 row-start-1 overflow-visible sm:[grid-area:auto]")}>
                    <span className="flex flex-col items-end gap-1.5 sm:inline-flex sm:flex-row sm:flex-wrap sm:items-center sm:justify-center sm:gap-x-2 sm:gap-y-1">
                      <span className="label-cayla text-[10px] text-tinta/45 sm:hidden">Acción hoy</span>
                      {/* «Por colgar» va primero y en todas las vistas (es un eje, como «Dañado»): sin él, una
                          talla sin nada colgado mostraba solo su Acción hoy, y la encargada no sabía que,
                          además, hoy se cuelga la primera pieza. Las dos son ciertas a la vez: hoy se cuelga lo
                          que hay atrás, y la Acción hoy sigue siendo reponer. La cifra es lo que se puede bajar
                          (disponible, neto de apartados): la suma de estos chips es la de la píldora. */}
                      {porColgar(f) && (
                        <Chip tono="ambar">
                          <span title={`En el piso no queda ninguna para vender; en el almacén hay ${f.almacenDisponible} que se ${f.almacenDisponible === 1 ? "puede" : "pueden"} colgar`}>
                            Por colgar · {f.almacenDisponible} {f.almacenDisponible === 1 ? "ud" : "uds"}
                          </span>
                        </Chip>
                      )}
                      {!f.accionHoy ? (
                        <span className="text-xs text-tinta/40">N/D</span>
                      ) : f.accionHoy.tipo === "sin_accion" ? (
                        <span className="text-[13px] text-taupe" title={AYUDA_ACCION_HOY.sin_accion}>
                          {f.accionHoy.texto}
                        </span>
                      ) : (
                        <Chip tono={TONO_ACCION_HOY[f.accionHoy.tipo]}>
                          <span title={AYUDA_ACCION_HOY[f.accionHoy.tipo]}>{f.accionHoy.texto}</span>
                        </Chip>
                      )}
                      {/* Contexto (2026-09-25, tercera ronda): «Sin stock en almacén», «Sin stock en
                          almacén · 8 uds en camino» — nota corta, nunca reemplaza el chip: la necesidad
                          de piso sigue siendo «Reponer a piso» aunque no haya de dónde bajarlo hoy. */}
                      {/* `whitespace-normal`: la celda hereda `truncate` (una sola línea) y este texto mide ~200 px en una
                          columna de 9 rem: sin partirse, se montaba sobre «En la red». */}
                      {f.accionHoy?.contexto && (
                        <span className="whitespace-normal text-right text-[11px] leading-tight text-taupe sm:text-center">{f.accionHoy.contexto}</span>
                      )}
                      {/* CORREGIDO 2026-09-25 (CASO K del pedido): hasta ahora este botón tenía su PROPIO
                          motor (`necesitaReponerPiso`, un umbral aparte) y podía aparecer aunque la columna
                          dijera «Sin acción» — dos fuentes de verdad decidiendo lo mismo distinto. Ahora la
                          DECISIÓN es la misma que la columna (`f.accionHoy?.tipo === "reponer_a_piso"`), pero
                          desde la tercera ronda (regla física de piso) esa decisión también dispara con
                          almacén en 0 (CASO E/F/G) — ahí no hay nada que bajar, así que el CONTROL además
                          exige `almacenDisponible > 0`: la decisión de dominio y la posibilidad física de
                          ejecutarla son dos preguntas distintas. */}
                      {puedeReponer && f.accionHoy?.tipo === "reponer_a_piso" && f.pisoDisponible !== null && f.almacenDisponible !== null && f.almacenDisponible > 0 && (
                        <button
                          type="button"
                          // Lo apartado para una clienta no se puede bajar del almacén (la base lo rechaza): el modal
                          // ofrece y valida contra lo DISPONIBLE, no contra lo físico (ADR-0141).
                          onClick={(e) => abrirMovimiento(f.varianteId, "bajar", e.currentTarget)}
                          className="btn-cayla btn-primario px-2 py-0.5 text-xs"
                        >
                          Reponer
                        </button>
                      )}
                      {/* Independiente de «Acción hoy»: una prenda puede no pedir nada y tener unidades
                          dañadas en cuarentena al mismo tiempo — no son el mismo eje. Solo informa; la
                          acción de resolver vive en la tarjeta "Dañado". */}
                      {!!f.danado && (
                        <Chip tono="rojo">
                          <span title="En cuarentena, esperando Liquidada/Se botó/Donada">Dañado · {f.danado}</span>
                        </Chip>
                      )}
                      {/* Otro eje independiente: apartada no es lo mismo que dañada ni que sin stock. */}
                      {f.apartado > 0 && (
                        <Chip tono="ambar">
                          <span title="Apartadas para clientas: siguen aquí, pero no se pueden vender ni mover">Apartado · {f.apartado}</span>
                        </Chip>
                      )}
                    </span>
                  </span>
                )}
                <span className={celda("centro", "col-start-1 row-start-1 text-xs sm:[grid-area:auto]")} title={red?.detalle}>
                  <span className="label-cayla mr-1 text-[10px] text-tinta/45 sm:hidden">En la red</span>
                  {red ? (
                    <>
                      <span className="block whitespace-normal text-tinta sm:whitespace-nowrap">
                        Disponible en {red.sedes} {red.sedes === 1 ? "sede" : "sedes"}: {red.total} {red.total === 1 ? "ud" : "uds"}
                      </span>
                      <span className="block truncate text-taupe">{red.detalle}</span>
                    </>
                  ) : (
                    <span className="text-tinta/35">—</span>
                  )}
                </span>
                </div>
                <span className={celda("centro", "overflow-visible border-t border-sand/70 pt-3 sm:border-0 sm:pt-0")}>
                  {/* En celular Apartar/Ajustar iban uno encima del otro, amontonados (Felipe, 2026-09-25):
                      ahora comparten la línea, Apartar pegado a la izquierda y Ajustar pegado a la derecha
                      (junto al «···»). Desde `sm` el grupo Apartar/Ajustar vuelve a apilarse, centrado, con el
                      menú al lado — la misma columna de escritorio de siempre. */}
                  <span className="flex w-full items-center gap-2 sm:w-auto sm:justify-center">
                    <span className="flex min-w-0 flex-1 items-center justify-between gap-2 sm:flex-none sm:flex-col sm:items-center sm:gap-1">
                      {puedeApartar && f.disponible > 0 && (
                        <button
                          type="button"
                          onClick={() => setApartando(f)}
                          className="btn-enlace text-xs"
                        >
                          Apartar
                        </button>
                      )}
                      {/* D-13: ajustar stock fuera de una venta es del líder o de la terminal administrativa (candado real en `registrar_movimiento`, ADR-0160). */}
                      {puedeAjustarAqui && (
                        <button
                          type="button"
                          onClick={() => setAjustando(f)}
                          className="btn-enlace text-xs"
                        >
                          Ajustar
                        </button>
                      )}
                    </span>
                    {/* «···»: las acciones de la fila que no son urgentes. No se inventan acciones que no llevan
                        a ningún lado.
                        - «Retirar del piso» (D-41, 2026-09-25): el camino de vuelta, del piso al almacén. Mismo
                          permiso y mismo modal que «Reponer», pero SIN umbral (`puedeRetirarPiso`): basta que quede
                          algo libre colgado. Vive aquí y NO en «Acción hoy» a propósito: esa celda es lo que el
                          sistema pide y lo que hay en ella se lee como orden. Con «Reponer» al lado (piso 3,
                          almacén 12) la misma celda decía «súbela» y «bájala» a la vez.
                        - El historial del producto (verificado que existe como página propia; `/productos/[id]` a
                          secas SOLO existe como modal interceptado desde DENTRO de /productos, no como destino
                          navegable — de ahí llegando, un `router.push` directo daba 404). */}
                    <span
                      className="contents"
                      ref={(el) => {
                        if (el) menusPorFila.current.set(f.varianteId, el);
                        else menusPorFila.current.delete(f.varianteId);
                      }}
                    >
                      <MenuAcciones
                        // Con talla y color: un lector de pantalla distingue el «⋯» de la M del de la L del mismo modelo.
                        etiqueta={`Más acciones: ${f.referencia}${tallaColor ? ` · ${tallaColor}` : ""}`}
                        items={[
                          ...(puedeReponer && puedeRetirarPiso(f.pisoDisponible)
                            ? [
                                {
                                  clave: "retirar",
                                  etiqueta: "Retirar del piso",
                                  // Como «Reponer»: el modal ofrece y valida contra lo DISPONIBLE (lo apartado no se mueve, ADR-0141).
                                  onSelect: () =>
                                    abrirMovimiento(f.varianteId, "retirar", menusPorFila.current.get(f.varianteId)?.querySelector("button") ?? null),
                                },
                              ]
                            : []),
                          { clave: "historial", etiqueta: "Ver historial del producto", onSelect: () => router.push(`/productos/${f.productoId}/historial`) },
                        ]}
                      />
                    </span>
                  </span>
                </span>
              </div>
            );
          })}
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-xs text-taupe">
            <span className="flex flex-wrap items-center gap-3">
              <span>{textoMostrando(paginaActual, filtradas.length, stock.length)}</span>
              <PaginacionLocal pagina={paginaActual.pagina} totalPaginas={paginaActual.totalPaginas} onPagina={irAPagina} />
              <button
                type="button"
                onClick={exportarCsv}
                className="btn-cayla btn-secundario btn-chico"
              >
                Exportar CSV
              </button>
            </span>
            {separa && (
              <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
                {(["sin_accion", ...OPCIONES_FILTRO_ACCION.filter((a) => a !== "sin_accion")] as TipoAccionHoy[]).map((a) => (
                  <span key={a} className="inline-flex items-center gap-1.5" title={AYUDA_ACCION_HOY[a]}>
                    <span aria-hidden className={`inline-block h-2 w-2 rounded-full ${PUNTO_ACCION_HOY[a]}`} />
                    <span className="text-tinta/80">{a === "sin_accion" ? "Sin acción" : TEXTO_ACCION_HOY[a]}</span>
                    <span className="hidden text-taupe lg:inline">· {AYUDA_ACCION_HOY[a]}</span>
                  </span>
                ))}
              </span>
            )}
          </div>
        </Tabla>
      )}
      </div>

      {moviendo && filaMoviendo && sububicacionPiso && sububicacionAlmacen && (
        <ReponerPisoModal
          sentido={moviendo.sentido}
          // El modal ofrece y valida contra lo DISPONIBLE, no contra lo físico: lo apartado no se mueve (ADR-0141).
          fila={{ ...filaMoviendo, piso: filaMoviendo.pisoDisponible, almacen: filaMoviendo.almacenDisponible }}
          ubicacionId={ubicacionId}
          sububicacionPisoId={sububicacionPiso.id}
          sububicacionAlmacenId={sububicacionAlmacen.id}
          alCerrarEnfocar={volverFoco}
          politica={politica}
          onClose={() => setMoviendo(null)}
        />
      )}

      {ajustando && (
        <AjustarInventarioModal
          productoId={ajustando.productoId}
          ubicacionId={ubicacionId}
          sububicaciones={sububicaciones}
          onClose={() => setAjustando(null)}
        />
      )}

      {viendoDanados && (
        <ResolverDanadosModal pendientes={danadosPendientes} esLider={esLider} otraSede={!enSedeActiva} onClose={() => setViendoDanados(false)} />
      )}

      {apartando && sububicacionPiso && sububicacionAlmacen && (
        <ApartarModal
          fila={apartando}
          ubicacionId={ubicacionId}
          sububicacionPiso={sububicacionPiso}
          sububicacionAlmacen={sububicacionAlmacen}
          onClose={() => setApartando(null)}
        />
      )}

      {viendoApartados && <ApartadosModal apartados={apartados} otraSede={!enSedeActiva} onClose={() => setViendoApartados(false)} />}

      {viendoDisponible && <DisponibleTotalOverlay filas={filasSemana} esLider={esLider} onClose={() => setViendoDisponible(false)} />}

      {viendoCobertura && <AnalisisCoberturaOverlay stock={stock} onClose={() => setViendoCobertura(false)} />}

      {viendoRecomendaciones && <RecomendacionesOverlay recomendaciones={recomendaciones} onClose={() => setViendoRecomendaciones(false)} />}
    </div>
  );
}
