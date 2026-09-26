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
import { hoyLima, resumirApartados, type Apartado } from "@/lib/apartados-reglas";
import { ProductoVarianteCelda } from "@/components/ui/PrendaCelda";
import { ExistenciasVacio } from "@/components/ExistenciasVacio";
import { explicarVacio, palabrasBuscables, sinStockQueCoincide, textoSinStock, type ClaveFiltro, type FiltroActivo, type ProductoSinStock } from "@/lib/existencias-vacio";
import { marcasDeLaSede } from "@/lib/existencias-catalogo-reglas";
import { resumenRed } from "@/lib/stock-por-sede";
import { descargarCsv } from "@/lib/exportar-csv";
import type { Recomendacion } from "@/lib/existencias-recomendaciones";
import {
  ACCION_ESTADO_STOCK,
  clavePercha,
  DIAS_RITMO_RECIENTE,
  ETIQUETA_ESTADO_STOCK,
  necesitaReponerPiso,
  ordenarPorModeloColorTalla,
  porColgar,
  resumirPorColgar,
  puedeRetirarPiso,
  UMBRAL_REPOSICION_PISO,
  type EstadoStock,
  type SentidoPiso,
} from "@/lib/inventario-reglas";
import { textoCobertura } from "@/lib/resumen-formato";
import { bandaDeCobertura, calcularVelocidad, type Cobertura } from "@/lib/resumen-reglas";
import type { FilaSemana } from "@/lib/existencias-categorias";
import type { FilaExistencias, ResumenExistencias, PrendaDanada } from "@/lib/inventario-v2";
import type { Sububicacion } from "@/lib/sububicaciones";

// «Normal» no lleva chip: es la mayoría de las filas y un chip verde en cada
// una sería decoración (brandbook: el semáforo nunca es adorno). Los tres
// estados que piden algo sí se pintan — el ojo va solo a donde hay tarea.
const TONO_ESTADO: Record<Exclude<EstadoStock, "normal">, TonoChip> = {
  reponer_piso: "ambar",
  stock_bajo: "rojo",
  sin_stock: "neutro",
};

const PUNTO_ESTADO: Record<EstadoStock, string> = {
  normal: "bg-verde",
  reponer_piso: "bg-ambar",
  stock_bajo: "bg-rojo",
  sin_stock: "bg-tinta/35",
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
/** Filtro de "Dañado" (2026-09-17): eje aparte del semáforo piso/almacén —
 *  reemplazó al filtro compuesto "Piden atención" (Felipe: "el estado PIDE
 *  ATENCIÓN lo vamos a cambiar por DAÑADO"). Las tres cosas que antes sumaba
 *  ese filtro (reponer_piso/stock_bajo/sin_stock) se siguen viendo, una por
 *  una, en el propio filtro de Estado y en la leyenda de abajo — no se
 *  perdió nada, solo dejó de tener un atajo agregado propio. */
const DANADO = "__danado__";
/** Filtro «Por colgar» (Frescura del piso, 2026-09-25): otro eje aparte del semáforo, como «Dañado». La
 *  regla es `porColgar` (`lib/inventario-reglas.ts`). Vive en el mismo estado que el filtro de Estado (y en
 *  su lista), así la píldora, el select y la tarjeta «Reponer a piso hoy» se EXCLUYEN: activar uno apaga
 *  el otro, nunca se apilan dos filtros que se vacían entre sí.
 *
 *  Lo que NO comparten es la cuenta: la tarjeta cuenta solo el estado «Reponer piso» (reserva sana atrás,
 *  decisión de Felipe), y una talla por colgar con 10 o menos en el almacén lleva chip «Stock bajo» (pedir
 *  traslado). Las dos lecturas son ciertas a la vez, así que la pantalla no las esconde: la fila lleva su
 *  chip «Por colgar» ANTES del semáforo (la acción de hoy: colgarla) y, si la tarjeta da 0 mientras hay
 *  tallas por colgar, su texto remite a esta lista en vez de decir «nada pendiente». */
const POR_COLGAR = "__por_colgar__";
const ESTADOS: EstadoStock[] = ["normal", "reponer_piso", "stock_bajo", "sin_stock"];

/** Los filtros visuales que NO son texto, en UN solo lugar: la tabla los aplica y el estado vacío los «relaja» de a uno para
 *  decir cuál está dejando la pantalla en blanco. `omitir` = los que se ignoran en esa cuenta. */
function pasaFiltros(f: FilaExistencias, filtros: { categoria: string; marca: string; estado: string }, omitir?: ReadonlySet<ClaveFiltro>): boolean {
  if (!omitir?.has("categoria") && filtros.categoria !== TODAS && f.categoria !== filtros.categoria) return false;
  if (!omitir?.has("marca") && filtros.marca !== TODAS && f.marca !== filtros.marca) return false;
  if (omitir?.has("estado") || filtros.estado === TODAS) return true;
  if (filtros.estado === DANADO) return (f.danado ?? 0) > 0;
  if (filtros.estado === POR_COLGAR) return porColgar(f);
  return f.estado === filtros.estado;
}

/** El buscador ocupa su propia fila y debajo van de 3 a 5 combos (Marca solo con 2 o más marcas; Estado solo donde se separa piso y almacén). Con
 *  el buscador y los 5 combos en UNA fila, a 1440-1490 px con el lateral abierto los combos partían su texto en dos líneas y el placeholder se cortaba
 *  (medido en la revisión, 2026-09-26): la herramienta que más se usa merece el ancho completo, y los combos, uno igual a otro. */
const COLUMNAS_FILTROS: Record<number, string> = {
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-2 xl:grid-cols-4",
  5: "sm:grid-cols-3 xl:grid-cols-5",
};
// Los cortes salen de la cuenta, no del gusto: «Categoría: todas» necesita ~152 px, así que 5 combos piden ~850 px de tarjeta. Con el lateral
// abierto (17 rem + márgenes) eso ocurre desde 1280 px de ventana (`xl`); a 1024 px quedan ~640 px y caben tres por fila.

function fechaHora(iso: string) {
  return new Date(iso).toLocaleString("es-PE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Lima" });
}

/** La celda de cobertura (columna propia, rediseño 2026-09-22 — antes era la segunda línea de
 *  «Disponible»): cuánto dura el stock al ritmo de venta de los últimos días. Nunca NaN ni vacío: lo
 *  que no se puede calcular dice «N/D». Rojo/ámbar con los mismos cortes de siempre. */
function CeldaCobertura({ c }: { c: Cobertura | null | undefined }) {
  const ayuda = `Con el ritmo de venta de los últimos ${DIAS_RITMO_RECIENTE} días`;
  if (!c || c.tipo === "sin_historial") {
    return (
      <span className="text-xs text-tinta/40" title={`${ayuda}: todavía no hay historial para calcularlo`}>
        N/D
      </span>
    );
  }
  if (c.tipo === "sin_ventas") {
    return (
      <span className="text-xs text-tinta/50" title={`No se vendió nada en los últimos ${DIAS_RITMO_RECIENTE} días: no hay ritmo con que medir cuánto dura`}>
        Sin ventas
      </span>
    );
  }
  const banda = bandaDeCobertura(c);
  const tono = banda === "critica" ? "text-rojo-profundo" : banda === "atencion" ? "text-ambar-profundo" : banda === "agotado" ? "text-tinta/40" : "text-tinta/70";
  return (
    <span className={`text-xs font-medium tabular-nums ${tono}`} title={`${ayuda}, este stock dura aproximadamente ${textoCobertura(c)}`}>
      {textoCobertura(c)}
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
// tabla más corta: sin piso/almacén ni semáforo, pero con tránsito y red.
//
// Existencias (rediseño 2026-09-22, boceto de Felipe): de tabla de stock a pantalla de acción diaria.
// «Prioridades de hoy» (4 tarjetas) reemplaza las cifras sueltas de antes; la franja de distribución
// (piso/almacén/apartado) abre el análisis de cobertura; «Disponible total» abre el desglose por
// categoría con costo/margen (solo líder) y el delta de 7 días. La tabla suma Cobertura y Ritmo de
// venta (7D) como columnas propias — antes la cobertura vivía como segunda línea de «Disponible».
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
   *  el delta vs. hace 7 días — alimenta la columna «Ritmo de venta (7D)» y el overlay de «Disponible total». */
  filasSemana: FilaSemana[];
  /** El delta de disponible de TODA la sede en los últimos 7 días, para la tarjeta «Disponible total». */
  deltaSede: { hoy: number; hace7d: number; pct: number | null };
  /** «Ver recomendaciones» (2026-09-22): el motor de reposición (`planDeReposicion`, ya existía para
   *  Producción) corrido por cada variante de la sede — ya ordenada por urgencia, vacía en Taller. */
  recomendaciones: Recomendacion[];
}) {
  const router = useRouter();
  const [busqueda, setBusqueda] = useState("");
  const [categoria, setCategoria] = useState(TODAS);
  const [marca, setMarca] = useState(TODAS);
  const [talla, setTalla] = useState(TODAS);
  const [color, setColor] = useState(TODAS);
  const [estado, setEstado] = useState(TODAS);
  // Reponer y retirar del piso abren el mismo modal; lo único que cambia es el sentido.
  // Se guarda la prenda y no una copia de su fila: tras un corte de red el modal refresca y sus cifras dicen si llegó.
  const [moviendo, setMoviendo] = useState<{ varianteId: string; sentido: SentidoPiso } | null>(null);
  const filaMoviendo = moviendo ? stock.find((f) => f.varianteId === moviendo.varianteId) : undefined;
  // El control que abrió el modal: al cerrarlo, el teclado vuelve a esa fila y no al principio de la página.
  const volverFoco = useRef<HTMLElement | null>(null);
  // El «⋯» de cada fila, para devolverle el foco (MenuAcciones no expone su botón).
  const menusPorFila = useRef(new Map<string, HTMLElement>());
  function abrirMovimiento(varianteId: string, sentido: SentidoPiso, origen: HTMLElement | null) {
    // Al «⋯» de la fila, que no depende del semáforo: tras reponer, el refresh suele quitar el botón «Reponer» que abrió.
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
  // Ritmo de venta (7D) por variante — misma fórmula que Análisis (`calcularVelocidad`), acá compacta
  // en un mapa para no recorrer `filasSemana` en cada fila de la tabla.
  const ritmoPorVariante = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const f of filasSemana) m.set(f.varianteId, calcularVelocidad(f).unidadesDia);
    return m;
  }, [filasSemana]);

  // Filtro de búsqueda especial (`lib/filtro-busqueda-especial.ts`): lo escrito se parte en términos —nombre,
  // marca, categoría, código, color y talla, en cualquier orden— y todos deben cumplirse. Si el texto dice una talla o un
  // color, manda sobre el filtro visual de esa dimensión; Categoría, Marca y Estado siempre aplican (el texto no los pisa).
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
        otros: (f) => pasaFiltros(f, { categoria, marca: marcaEfectiva, estado }),
      },
      // Con texto escrito, lo que mejor coincide va primero (una marca entera antes que un trozo perdido en un código), y las
      // tallas de un producto no se separan. «Por colgar» trae su propio orden (por percha) y no se toca.
      estado === POR_COLGAR ? {} : { ordenar: "relevancia", grupo: (f) => f.productoId }
    );
    // «Por colgar» se trabaja por percha (un modelo en un color), no por SKU: sus tallas salen juntas y
    // en su curva, para que la encargada baje la M y la L de la misma casaca en un solo viaje.
    return estado === POR_COLGAR ? { ...resultado, filas: ordenarPorModeloColorTalla(resultado.filas) } : resultado;
  }, [indiceBusqueda, busqueda, talla, color, categoria, marcaEfectiva, estado]);

  // El contador de la píldora mira TODA la sede, no lo filtrado: es la cifra del problema («22 tallas
  // que la clienta no ve»), igual que las tarjetas de arriba. Baja sola después de cada «Reponer».
  const cuentaPorColgar = useMemo(() => resumirPorColgar(stock), [stock]);

  // La tabla pinta UNA página de `filtradas`; las tarjetas, los filtros y el CSV siguen viendo todas.
  // Cambiar cualquier filtro vuelve a la página 1 (ajuste durante el render, sin efecto: la firma de
  // los filtros cambió → se reinicia). `paginar` acota: si un guardado achicó la lista, cae en la última.
  const [pagina, setPagina] = useState(1);
  const firmaFiltros = [busqueda, categoria, marcaEfectiva, talla, color, estado].join("\u0000");
  const [firmaPrevia, setFirmaPrevia] = useState(firmaFiltros);
  if (firmaFiltros !== firmaPrevia) {
    setFirmaPrevia(firmaFiltros);
    setPagina(1);
  }
  // «Por colgar» va ordenada por percha: la página se estira hasta terminar la percha en curso, para que
  // la S y la M de una casaca no queden en la página 1 y su L en la 2.
  const paginaActual =
    estado === POR_COLGAR ? paginarSinPartirGrupos(filtradas, pagina, FILAS_POR_PAGINA, clavePercha) : paginar(filtradas, pagina, FILAS_POR_PAGINA);
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

  const hayFiltrosActivos = busqueda !== "" || categoria !== TODAS || marcaEfectiva !== TODAS || talla !== TODAS || color !== TODAS || estado !== TODAS;
  /** Quita búsqueda, categoría, marca, talla y color, pero deja el Estado puesto. Es el «Ver todas» de «Por colgar»:
   *  que la lista vuelva a ser lo que cuenta la píldora. */
  function quitarFiltrosMenosEstado() {
    setBusqueda("");
    setCategoria(TODAS);
    setMarca(TODAS);
    setTalla(TODAS);
    setColor(TODAS);
  }
  function limpiarFiltros() {
    quitarFiltrosMenosEstado();
    setEstado(TODAS);
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
  const porcentajePiso = resumen.total > 0 && resumen.piso !== null ? Math.round((resumen.piso / resumen.total) * 100) : null;
  const porcentajeAlmacen = resumen.total > 0 && resumen.almacen !== null ? Math.round((resumen.almacen / resumen.total) * 100) : null;
  const porcentajeApartado = resumen.total > 0 ? Math.round((resumen.apartado / resumen.total) * 100) : null;

  // «Reponer a piso hoy» (tarjeta A): variantes que ya cuenta `resumen.requierenReposicion`, y las
  // unidades que se podrían bajar del almacén — el mismo `almacenDisponible` que usa el modal de
  // reposición (neto de apartados: lo apartado no se puede mover).
  const unidadesReponer = useMemo(
    () => stock.reduce((acc, f) => (f.pisoDisponible !== null && f.almacenDisponible !== null && necesitaReponerPiso(f.pisoDisponible, f.almacenDisponible) ? acc + f.almacenDisponible : acc), 0),
    [stock]
  );

  // Exporta lo que la colaboradora está viendo, no todo el inventario: usa
  // `filtradas` (lo que pinta la tabla, TODAS sus páginas —no solo la de la
  // vista—), así que si ya filtró por
  // categoría/talla/color/estado antes de exportar, el CSV trae eso y no de
  // más. Columnas Piso/Almacén/Estado solo si esta ubicación las separa
  // (`separa`) — en Taller siempre son `null` y mostrar tres columnas vacías
  // en cada fila sería ruido, no dato (mismo criterio que ya usa la tabla).
  function exportarCsv() {
    // La columna «Marca» solo si la sede tiene alguna leída: con la lectura caída, una columna de «—» sería ruido.
    const conMarcaEnCsv = marcas.length > 0;
    const encabezados = conMarcaEnCsv ? ["Prenda", "Marca", "Código", "Talla", "Color", "Categoría"] : ["Prenda", "Código", "Talla", "Color", "Categoría"];
    if (separa) encabezados.push("Piso", "Almacén");
    encabezados.push("Disponible");
    if (separa) encabezados.push("Apartadas", "Estado");
    encabezados.push("En camino", "En la red");

    const filas = filtradas.map((f) => {
      const fila: (string | number)[] = conMarcaEnCsv
        ? [f.referencia, f.marca ?? "—", f.sku, f.talla ?? "—", f.color ?? "—", f.categoria ?? "—"]
        : [f.referencia, f.sku, f.talla ?? "—", f.color ?? "—", f.categoria ?? "—"];
      if (separa) fila.push(f.piso ?? "—", f.almacen ?? "—");
      fila.push(f.disponible);
      if (separa) fila.push(f.apartado, f.estado ? ETIQUETA_ESTADO_STOCK[f.estado] : "—");
      fila.push(f.enTransito, resumenRed(f.enRed)?.detalle ?? "—");
      return fila;
    });

    descargarCsv(`existencias_${new Date().toISOString().slice(0, 10)}.csv`, encabezados, filas);
  }

  // `minmax(13.5rem,1.3fr)`, no `1fr` a secas: con columnas fijas + `truncate` (que habilita min-width
  // automático 0 en la pista), una ventana angosta dejaba "Producto" en 0px. El piso de 13.5rem es la
  // miniatura (36px) más «Casaca Ximena» y su SKU debajo antes de que la Tabla entre a scroll
  // horizontal (`ui/Tabla.tsx`) — con Cobertura y Ritmo como columnas propias (antes la cobertura era
  // la segunda línea de «Disponible»), 9 columnas piden más ancho que 1400px: se desplaza, no encima.
  const plantilla = separa
    ? "sm:grid-cols-[minmax(13.5rem,1.3fr)_6.5rem_4.5rem_6rem_7rem_11rem_5rem_minmax(9rem,1fr)_6rem]"
    : "sm:grid-cols-[minmax(13.5rem,1.4fr)_5rem_6rem_5rem_minmax(9rem,1fr)_4.5rem]";

  // Lo que la persona ve en los filtros, para nombrarlo si dejan la tabla en blanco (y para que el estado vacío los quite de a uno).
  const filtroMarcaElegida = marcaEfectiva === TODAS ? null : marcaEfectiva;
  const filtroCategoriaElegida = categoria === TODAS ? null : categoria;
  const filtrosActivos: FiltroActivo[] = [];
  if (categoria !== TODAS) filtrosActivos.push({ clave: "categoria", etiqueta: "Categoría", valor: categoria });
  if (marcaEfectiva !== TODAS) filtrosActivos.push({ clave: "marca", etiqueta: "Marca", valor: marcaEfectiva });
  if (talla !== TODAS) filtrosActivos.push({ clave: "talla", etiqueta: "Talla", valor: talla });
  if (color !== TODAS) filtrosActivos.push({ clave: "color", etiqueta: "Color", valor: color });
  if (estado !== TODAS) {
    filtrosActivos.push({ clave: "estado", etiqueta: "Estado", valor: estado === DANADO ? "Dañado" : estado === POR_COLGAR ? "Por colgar" : ETIQUETA_ESTADO_STOCK[estado as EstadoStock] });
  }
  // Productos que el catálogo tiene pero esta sede NO (ni una fila de stock) y que coinciden con lo escrito. Se avisa aunque haya
  // resultados: quien busca «cayla» y ve Top Aurora («Cayla 2») debe saber que los pantalones de la marca CAYLA existen y aquí no llegaron.
  const sinRastroAqui = useMemo(
    () => (busqueda.trim() ? sinStockQueCoincide(busqueda, indiceBusqueda.vocabulario, sinStock, { filtroMarca: filtroMarcaElegida, filtroCategoria: filtroCategoriaElegida }) : { productos: [], total: 0 }),
    [busqueda, indiceBusqueda, sinStock, filtroMarcaElegida, filtroCategoriaElegida]
  );
  const sinNadaPorColgar = estado === POR_COLGAR && cuentaPorColgar.tallas === 0;
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
              otros: (f) => pasaFiltros(f, { categoria, marca: marcaEfectiva, estado }, omitir),
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
    else setEstado(TODAS);
  }

  return (
    <div className="space-y-6">
      {/* Prioridades de hoy (rediseño 2026-09-22): las 4 cifras que antes eran sueltas, ahora con un
          propósito de acción cada una. A es la más urgente (acento rojo); B abre el desglose por
          categoría; C y D se comportaban igual antes, solo con más presencia visual. */}
      <div>
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
          <div>
            <h2 className="font-display text-xl text-tinta">Prioridades de hoy</h2>
            <p className="mt-0.5 text-[13px] text-taupe">Acciones sugeridas para impulsar tus ventas en tienda.</p>
          </div>
          {/* «Ver recomendaciones»: el motor de reposición (`planDeReposicion`) corrido por variante —
              ya existía para Producción, nadie lo mostraba todavía por sede. Solo donde se vende. */}
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
        </div>
        <div className={`mt-3 grid gap-3 ${separa ? "sm:grid-cols-2 xl:grid-cols-4" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
          {separa && (
            <TarjetaPrioridad
              icono={PackagePlus}
              etiqueta="Reponer a piso hoy"
              valor={resumen.requierenReposicion}
              unidad={resumen.requierenReposicion === 1 ? "variante" : "variantes"}
              urgente={resumen.requierenReposicion > 0}
              activa={estado === "reponer_piso"}
              onClick={() => {
                const activar = estado !== "reponer_piso";
                setEstado(activar ? "reponer_piso" : TODAS);
                // Al ponerlo, la vista baja a la tabla para ver lo filtrado; al quitarlo, se queda en la tarjeta.
                if (activar) mostrarTablaFiltrada();
              }}
            >
              {/* La cifra es solo «Reponer piso» (decisión de Felipe, no se toca). Pero si da 0 y hay tallas sin
                  nada colgado, «nada pendiente de bajar» sería falso: remite a la lista que sí las tiene.
                  Ya NO dice «con demanda» (2026-09-26): la regla (`necesitaReponerPiso`) solo mira cuánto queda en
                  el piso y en el almacén, nunca las ventas; en una sede sin historial (Ritmo «N/D» en cada fila) esa
                  frase afirmaba un dato que la pantalla no tiene. */}
              {resumen.requierenReposicion > 0
                ? `${unidadesReponer.toLocaleString("es-PE")} uds disponibles en almacén para bajar al piso`
                : cuentaPorColgar.tallas > 0
                  ? `Revisa «Por colgar» en la tabla: ${cuentaPorColgar.tallas} ${cuentaPorColgar.tallas === 1 ? "talla" : "tallas"} que la clienta no ve`
                  : "Nada pendiente de bajar al piso"}
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

      {/* Distribución de stock (rediseño 2026-09-22): dónde está lo disponible — piso, almacén y lo
          apartado para clientas, en una sola barra. El botón abre el análisis de cobertura en un
          overlay, no navega. Solo donde la ubicación separa piso/almacén: en Taller no aplica. */}
      {separa && resumen.total > 0 && (
        <div className="card-cayla flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <p className="label-cayla text-[11px] font-bold text-taupe">Distribución de stock en esta tienda</p>
            <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full bg-sand/50">
              <span className="h-full bg-verde transition-all" style={{ width: `${porcentajePiso ?? 0}%` }} title={`${porcentajePiso ?? 0}% en piso`} />
              <span className="h-full bg-ambar/70 transition-all" style={{ width: `${porcentajeAlmacen ?? 0}%` }} title={`${porcentajeAlmacen ?? 0}% en almacén`} />
              {porcentajeApartado !== null && porcentajeApartado > 0 && (
                <button
                  type="button"
                  onClick={() => apartados.length > 0 && setViendoApartados(true)}
                  className="h-full bg-tinta/25 transition-all hover:bg-tinta/40"
                  style={{ width: `${porcentajeApartado}%` }}
                  title={`${porcentajeApartado}% apartado para clientas — clic para ver`}
                />
              )}
            </div>
            <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-xs text-taupe">
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="h-2 w-2 rounded-full bg-verde" />
                {porcentajePiso ?? 0}% en piso · {resumen.piso ?? 0} uds
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="h-2 w-2 rounded-full bg-ambar/70" />
                {porcentajeAlmacen ?? 0}% en almacén · {resumen.almacen ?? 0} uds
              </span>
              {resumen.apartado > 0 && (
                <button type="button" onClick={() => setViendoApartados(true)} className={`inline-flex items-center gap-1.5 hover:text-rojo ${resumenApartados.vencidos > 0 ? "text-rojo-profundo" : ""}`}>
                  <span aria-hidden className={`h-2 w-2 rounded-full ${resumenApartados.vencidos > 0 ? "bg-rojo" : "bg-tinta/25"}`} />
                  {porcentajeApartado ?? 0}% apartado · {resumen.apartado} uds
                  {resumenApartados.vencidos > 0 && ` · ${resumenApartados.vencidos} vencido${resumenApartados.vencidos === 1 ? "" : "s"}`}
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 sm:max-w-xs">
            <p className="hidden text-xs leading-snug text-taupe xl:block">Enfócate en tener los productos clave en piso. Más disponibilidad = más ventas.</p>
            <button
              type="button"
              onClick={() => setViendoCobertura(true)}
              className="btn-cayla btn-secundario shrink-0"
            >
              Ver análisis de cobertura
            </button>
          </div>
        </div>
      )}

      {/* Guía oficial (2026-09-22, ADR-0169): los filtros y la tabla viven en UNA tarjeta — lo que se filtra
          y lo filtrado se leen como una sola cosa. Los filtros son cajas hundidas en hueso, sin etiqueta visible.
          `scroll-mt-24` compensa la cabecera fija: con menos, al llegar aquí (paginar, «Reponer a piso hoy») el
          buscador quedaba debajo de ella. */}
      <div ref={tarjetaTablaRef} className="card-cayla scroll-mt-24 overflow-hidden">
      {stock.length > 0 && (
        <div className={`grid gap-x-3 gap-y-1 px-4 pt-4 sm:px-5 sm:pt-5 ${COLUMNAS_FILTROS[3 + (separa ? 1 : 0) + (mostrarMarca ? 1 : 0)]}`}>
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
          {separa && (
            <CampoSelect
              caja
              etiqueta="Estado"
              valor={estado}
              onValor={setEstado}
              marcador="Todos"
              opciones={[
                { valor: TODAS, texto: "Estado: todos" },
                { valor: DANADO, texto: "Dañado" },
                { valor: POR_COLGAR, texto: "Por colgar" },
                ...ESTADOS.map((e) => ({ valor: e, texto: ETIQUETA_ESTADO_STOCK[e] })),
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
                  aria-pressed={estado === POR_COLGAR}
                  onClick={() => setEstado((e) => (e === POR_COLGAR ? TODAS : POR_COLGAR))}
                  // Con el filtro puesto sigue clicable aunque llegue a 0 (tras reponer la última): es como se quita.
                  disabled={cuentaPorColgar.tallas === 0 && estado !== POR_COLGAR}
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
              {separa && estado === POR_COLGAR && cuentaPorColgar.tallas > 0 && (
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
                    { titulo: "Piso · Almacén", alinear: "centro" },
                    { titulo: "Disponible", alinear: "centro" },
                    { titulo: "Cobertura", alinear: "centro" },
                    { titulo: "Ritmo de venta (7D)", alinear: "centro" },
                    { titulo: "Prioridad / Estado", alinear: "centro" },
                    { titulo: "En camino", alinear: "centro" },
                    { titulo: "En la red", alinear: "centro" },
                    { titulo: "", alinear: "centro" },
                  ]
                : [
                    { titulo: "Producto / variante" },
                    { titulo: "Disponible", alinear: "centro" },
                    { titulo: "Ritmo de venta (7D)", alinear: "centro" },
                    { titulo: "En camino", alinear: "centro" },
                    { titulo: "En la red", alinear: "centro" },
                    { titulo: "", alinear: "centro" },
                  ]
            }
          />
          {paginaActual.filas.map((f) => {
            const red = resumenRed(f.enRed);
            const ritmo = ritmoPorVariante.get(f.varianteId) ?? null;
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
                {/* Las 4 cifras (Piso·Almacén, Disponible, Cobertura, Ritmo) amontonadas y pegadas a la
                    izquierda era ilegible en celular (Felipe, 2026-09-25): acá se agrupan en una grilla de
                    2×2 con cada una en su propia tarjetita, para que se lean como datos separados, no como
                    una sola oración. `sm:contents` disuelve este envoltorio desde escritorio: ahí cada cifra
                    vuelve a ser su propia columna de la tabla, en el mismo orden — la plantilla `sm:grid-cols`
                    de arriba no cambia. */}
                <div className="col-span-full grid grid-cols-2 gap-2 border-t border-sand/70 pt-3 sm:contents sm:border-0 sm:pt-0">
                  {separa && (
                    <span className={celda("centro", "rounded-lg bg-hueso/60 px-2 py-1.5 text-sm tabular-nums sm:rounded-none sm:bg-transparent sm:px-0 sm:py-0")}>
                      <span className="label-cayla mb-0.5 block text-[10px] text-tinta/45 sm:hidden">Piso · Almacén</span>
                      <span className={(f.pisoDisponible ?? f.piso) !== null && (f.pisoDisponible ?? f.piso)! <= UMBRAL_REPOSICION_PISO ? "text-ambar-profundo" : "text-tinta"}>{f.piso}</span>
                      <span className="text-tinta/45"> · </span>
                      <span className="text-tinta">{f.almacen}</span>
                    </span>
                  )}
                  <span className={celda("centro", "rounded-lg bg-hueso/60 px-2 py-1.5 text-sm font-semibold tabular-nums text-tinta sm:rounded-none sm:bg-transparent sm:px-0 sm:py-0")}>
                    <span className="label-cayla mb-0.5 block text-[10px] text-tinta/45 sm:hidden">Disponible</span>
                    {f.disponible}
                    {f.apartado > 0 && (
                      <span className="block text-[10px] font-normal leading-3 text-ambar-profundo" title="Siguen en la tienda, pero apartadas para clientas: no se pueden vender">
                        {f.apartado} {f.apartado === 1 ? "apartada" : "apartadas"}
                      </span>
                    )}
                  </span>
                  {separa && (
                    <span className={celda("centro", "rounded-lg bg-hueso/60 px-2 py-1.5 sm:rounded-none sm:bg-transparent sm:px-0 sm:py-0")}>
                      <span className="label-cayla mb-0.5 block text-[10px] text-tinta/45 sm:hidden">Cobertura</span>
                      <CeldaCobertura c={f.cobertura} />
                    </span>
                  )}
                  <span className={celda("centro", "rounded-lg bg-hueso/60 px-2 py-1.5 text-sm tabular-nums text-tinta/80 sm:rounded-none sm:bg-transparent sm:px-0 sm:py-0")}>
                    <span className="label-cayla mb-0.5 block text-[10px] text-tinta/45 sm:hidden">Ritmo (7D)</span>
                    {ritmo === null ? <span className="text-tinta/40">N/D</span> : `${ritmo.toFixed(1)} uds/día`}
                  </span>
                </div>
                {/* En celular el estado (chip + «Reponer», uno encima del otro) va a la derecha de «En camino» y
                    «En la red», en el hueco que dejaban vacío, en vez de ocupar un renglón propio (Felipe,
                    2026-09-25). `sm:contents` + `sm:[grid-area:auto]` devuelven cada celda a su columna de
                    escritorio en el orden de siempre. */}
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 border-t border-sand/70 pt-3 sm:contents">
                {separa && (
                  <span className={celda("centro", "col-start-2 row-span-2 row-start-1 overflow-visible sm:[grid-area:auto]")}>
                    <span className="flex flex-col items-end gap-1.5 sm:inline-flex sm:flex-row sm:flex-wrap sm:items-center sm:justify-center sm:gap-x-2 sm:gap-y-1">
                      {/* «Por colgar» va primero y en todas las vistas (es un eje, como «Dañado»): sin él, una
                          talla sin nada colgado y con poca reserva mostraba solo «Stock bajo · Pedir traslado»
                          junto a «Reponer», y la encargada no sabía si colgar o pedir. Las dos son ciertas: hoy
                          se cuelga lo que hay atrás, y el traslado repone la reserva. La cifra es lo que se puede
                          bajar (disponible, neto de apartados): la suma de estos chips es la de la píldora. */}
                      {porColgar(f) && (
                        <Chip tono="ambar">
                          <span title={`En el piso no queda ninguna para vender; en el almacén hay ${f.almacenDisponible} que se ${f.almacenDisponible === 1 ? "puede" : "pueden"} colgar`}>
                            Por colgar · {f.almacenDisponible} {f.almacenDisponible === 1 ? "ud" : "uds"}
                          </span>
                        </Chip>
                      )}
                      {f.estado === "normal" || f.estado === null ? (
                        <span className="text-[13px] text-taupe" title={ACCION_ESTADO_STOCK.normal}>
                          Normal
                        </span>
                      ) : (
                        <Chip tono={TONO_ESTADO[f.estado]}>
                          <span title={ACCION_ESTADO_STOCK[f.estado]}>{ETIQUETA_ESTADO_STOCK[f.estado]}</span>
                        </Chip>
                      )}
                      {/* Corregido 2026-09-17: independiente del chip de estado —
                          Felipe: pedir traslado y reponer no se excluyen. Mientras
                          quede algo en el almacén (aunque el chip diga «Stock
                          bajo», reserva crítica) sigue teniendo sentido bajarlo al
                          piso ahora mismo, sin esperar el traslado. */}
                      {puedeReponer && f.pisoDisponible !== null && f.almacenDisponible !== null && necesitaReponerPiso(f.pisoDisponible, f.almacenDisponible) && (
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
                      {/* Independiente del chip de estado: una prenda puede estar
                          "Normal" en piso/almacén y tener unidades dañadas en
                          cuarentena al mismo tiempo — no son el mismo eje. Solo
                          informa; la acción de resolver vive en la tarjeta "Dañado". */}
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
                <span
                  className={celda(
                    "centro",
                    `col-start-1 text-sm tabular-nums sm:[grid-area:auto] ${f.enTransito > 0 ? "text-verde-profundo" : "text-tinta/35"}`,
                  )}
                >
                  <span className="label-cayla mr-1 text-[10px] text-tinta/45 sm:hidden">En camino</span>
                  {f.enTransito > 0 ? `+${f.enTransito}` : "—"}
                </span>
                <span className={celda("centro", "col-start-1 text-xs sm:[grid-area:auto]")} title={red?.detalle}>
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
                          algo libre colgado. Vive aquí y NO en «Prioridad / Estado» a propósito: esa celda es el
                          semáforo y lo que hay en ella se lee como orden del sistema. Con «Reponer» al lado (piso 3,
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
                {ESTADOS.map((e) => (
                  <span key={e} className="inline-flex items-center gap-1.5" title={ACCION_ESTADO_STOCK[e]}>
                    <span aria-hidden className={`inline-block h-2 w-2 rounded-full ${PUNTO_ESTADO[e]}`} />
                    <span className="text-tinta/80">{ETIQUETA_ESTADO_STOCK[e]}</span>
                    <span className="hidden text-taupe lg:inline">· {ACCION_ESTADO_STOCK[e]}</span>
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
