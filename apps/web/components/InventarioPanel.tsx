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
  UMBRAL_REPOSICION_PISO,
  type EstadoStock,
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
/** Filtro «Por colgar» (Frescura del piso, 2026-09-25): otro eje aparte del semáforo, como «Dañado» —
 *  una talla por colgar puede tener chip «Reponer piso» o «Stock bajo» según cuánto quede atrás. Vive
 *  en el mismo estado del filtro de Estado (y en su lista) para que la píldora, el select y la tarjeta
 *  «Reponer a piso hoy» sean tres entradas a UN solo filtro y nunca se contradigan. La regla es
 *  `porColgar` (`lib/inventario-reglas.ts`). */
const POR_COLGAR = "__por_colgar__";
const ESTADOS: EstadoStock[] = ["normal", "reponer_piso", "stock_bajo", "sin_stock"];

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
  apartados,
  esLider,
  puedeAjustar,
  coberturaFallo = null,
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
  const [talla, setTalla] = useState(TODAS);
  const [color, setColor] = useState(TODAS);
  const [estado, setEstado] = useState(TODAS);
  const [reponiendo, setReponiendo] = useState<FilaExistencias | null>(null);
  const [ajustando, setAjustando] = useState<FilaExistencias | null>(null);
  const [viendoDanados, setViendoDanados] = useState(false);
  const [apartando, setApartando] = useState<FilaExistencias | null>(null);
  const [viendoApartados, setViendoApartados] = useState(false);
  const [viendoDisponible, setViendoDisponible] = useState(false);
  const [viendoCobertura, setViendoCobertura] = useState(false);
  const [viendoRecomendaciones, setViendoRecomendaciones] = useState(false);

  const categorias = useMemo(
    () => Array.from(new Set(stock.map((f) => f.categoria).filter((c): c is string => !!c))).sort((a, b) => a.localeCompare(b, "es")),
    [stock]
  );
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
  // SKU, código, color y talla, en cualquier orden— y todos deben cumplirse. Si el texto dice una talla o un
  // color, manda sobre el filtro visual de esa dimensión; Categoría y Estado siempre aplican.
  const indiceBusqueda = useMemo(
    () => crearIndiceBusquedaEspecial(stock, (f) => ({ nombre: f.referencia, sku: f.sku, codigosBarras: f.codigosBarras, color: f.color, talla: f.talla })),
    [stock]
  );
  const { filas: filtradas, dimensiones: dichoEnLaBusqueda } = useMemo(() => {
    const resultado = filtrarConBusquedaEspecial(indiceBusqueda, busqueda, {
      talla: talla === TODAS ? null : talla,
      color: color === TODAS ? null : color,
      otros: (f) => {
        if (categoria !== TODAS && f.categoria !== categoria) return false;
        if (estado === DANADO) return (f.danado ?? 0) > 0;
        if (estado === POR_COLGAR) return porColgar(f);
        if (estado !== TODAS && f.estado !== estado) return false;
        return true;
      },
    });
    // «Por colgar» se trabaja por percha (un modelo en un color), no por SKU: sus tallas salen juntas y
    // en su curva, para que la encargada baje la M y la L de la misma casaca en un solo viaje.
    return estado === POR_COLGAR ? { ...resultado, filas: ordenarPorModeloColorTalla(resultado.filas) } : resultado;
  }, [indiceBusqueda, busqueda, talla, color, categoria, estado]);

  // El contador de la píldora mira TODA la sede, no lo filtrado: es la cifra del problema («22 tallas
  // que la clienta no ve»), igual que las tarjetas de arriba. Baja sola después de cada «Reponer».
  const cuentaPorColgar = useMemo(() => resumirPorColgar(stock), [stock]);

  // La tabla pinta UNA página de `filtradas`; las tarjetas, los filtros y el CSV siguen viendo todas.
  // Cambiar cualquier filtro vuelve a la página 1 (ajuste durante el render, sin efecto: la firma de
  // los filtros cambió → se reinicia). `paginar` acota: si un guardado achicó la lista, cae en la última.
  const [pagina, setPagina] = useState(1);
  const firmaFiltros = [busqueda, categoria, talla, color, estado].join("\u0000");
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

  const hayFiltrosActivos = busqueda !== "" || categoria !== TODAS || talla !== TODAS || color !== TODAS || estado !== TODAS;
  function limpiarFiltros() {
    setBusqueda("");
    setCategoria(TODAS);
    setTalla(TODAS);
    setColor(TODAS);
    setEstado(TODAS);
  }

  const puedeReponer = Boolean(resumen.separaPisoAlmacen && sububicacionPiso && sububicacionAlmacen);
  // Apartar necesita saber DE DÓNDE (piso o almacén): solo donde la ubicación separa las dos.
  const puedeApartar = puedeReponer;
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
    const encabezados = ["Prenda", "SKU", "Talla", "Color", "Categoría"];
    if (separa) encabezados.push("Piso", "Almacén");
    encabezados.push("Disponible");
    if (separa) encabezados.push("Apartadas", "Estado");
    encabezados.push("En camino", "En la red");

    const filas = filtradas.map((f) => {
      const fila: (string | number)[] = [f.referencia, f.sku, f.talla ?? "—", f.color ?? "—", f.categoria ?? "—"];
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
              onClick={() => setEstado((e) => (e === "reponer_piso" ? TODAS : "reponer_piso"))}
            >
              {resumen.requierenReposicion === 0 ? "Nada pendiente de bajar al piso" : `${unidadesReponer.toLocaleString("es-PE")} uds disponibles en almacén — con demanda`}
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
            {deltaSede.pct === null ? "Sin base de hace 7 días para comparar" : `${deltaSede.pct >= 0 ? "+" : ""}${Math.round(deltaSede.pct)}% vs. semana anterior`}
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
          y lo filtrado se leen como una sola cosa. Los filtros son cajas hundidas en hueso, sin etiqueta visible. */}
      <div ref={tarjetaTablaRef} className="card-cayla scroll-mt-4 overflow-hidden">
      {stock.length > 0 && (
        <div className={`grid gap-x-3 gap-y-1 px-4 pt-4 sm:px-5 sm:pt-5 ${separa ? "sm:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]" : "sm:grid-cols-[1.4fr_1fr_1fr_1fr]"}`}>
          <CampoTexto caja etiqueta="Buscar" placeholder="Producto, SKU, color, talla…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
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
          {/* Una sola fila para la píldora «Por colgar» y «Limpiar filtros»: en una tienda la fila ya está,
              así que activar un filtro no empuja la tabla hacia abajo (ADR-0185). */}
          {(separa || hayFiltrosActivos) && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pb-3 pt-1 sm:col-span-full">
              {separa && (
                <button
                  type="button"
                  aria-pressed={estado === POR_COLGAR}
                  onClick={() => setEstado((e) => (e === POR_COLGAR ? TODAS : POR_COLGAR))}
                  // Con el filtro puesto sigue clicable aunque llegue a 0 (tras reponer la última): es como se quita.
                  disabled={cuentaPorColgar.tallas === 0 && estado !== POR_COLGAR}
                  title="Tallas con unidades en el almacén y ninguna colgada en el piso: la clienta no las ve"
                  className="pildora-cayla disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Por colgar
                  <span className="font-normal tabular-nums">
                    · {cuentaPorColgar.tallas} {cuentaPorColgar.tallas === 1 ? "talla" : "tallas"} · {cuentaPorColgar.unidades.toLocaleString("es-PE")}{" "}
                    {cuentaPorColgar.unidades === 1 ? "ud" : "uds"}
                  </span>
                </button>
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

      {/* Que no se lea como una orden de bajar todo (riesgo que nombró el plan): hay tallas que se guardan
          a propósito. La lista es para decidir, no una tarea que vaciar. */}
      {separa && estado === POR_COLGAR && stock.length > 0 && (
        <p className="nota-cayla mx-4 mb-4 sm:mx-5">
          <b>Tallas que la clienta no ve:</b> hay en el almacén y en el piso no queda ninguna para vender. Algunas se guardan a
          propósito (fin de temporada), así que no es una orden de bajar todo: elige las que van al piso y usa «Reponer».
        </p>
      )}

      {separa && coberturaFallo && stock.length > 0 && <p className="px-4 pb-2 text-xs text-ambar sm:px-5">{coberturaFallo}</p>}
      {stock.length === 0 ? (
        <p className="p-5 text-sm text-taupe">Esta ubicación no tiene stock todavía.</p>
      ) : filtradas.length === 0 ? (
        <p className="border-t border-sand p-5 text-sm text-taupe">
          {estado === POR_COLGAR && cuentaPorColgar.tallas === 0
            ? "Nada por colgar: toda talla que está en el almacén tiene al menos una colgada en el piso."
            : "Ningún producto coincide con la búsqueda."}
        </p>
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
            return (
              <div key={f.varianteId} className={fila(plantilla)}>
                {/* La misma celda que dibuja Conteo (`ui/PrendaCelda.tsx`). */}
                <ProductoVarianteCelda referencia={f.referencia} sku={f.sku} talla={f.talla} color={f.color} colorHex={f.colorHex} fotoUrl={f.fotoUrl} />
                {separa && (
                  <span className={celda("centro", "text-sm tabular-nums")}>
                    <span className="label-cayla mr-1 text-[10px] text-tinta/45 sm:hidden">Piso · Almacén</span>
                    <span className={(f.pisoDisponible ?? f.piso) !== null && (f.pisoDisponible ?? f.piso)! <= UMBRAL_REPOSICION_PISO ? "text-ambar-profundo" : "text-tinta"}>{f.piso}</span>
                    <span className="text-tinta/45"> · </span>
                    <span className="text-tinta">{f.almacen}</span>
                  </span>
                )}
                <span className={celda("centro", "text-sm font-semibold tabular-nums text-tinta")}>
                  <span className="label-cayla mr-1 text-[10px] text-tinta/45 sm:hidden">Disponible</span>
                  {f.disponible}
                  {f.apartado > 0 && (
                    <span className="block text-[10px] font-normal leading-3 text-ambar-profundo" title="Siguen en la tienda, pero apartadas para clientas: no se pueden vender">
                      {f.apartado} {f.apartado === 1 ? "apartada" : "apartadas"}
                    </span>
                  )}
                </span>
                {separa && (
                  <span className={celda("centro")}>
                    <span className="label-cayla mr-1 text-[10px] text-tinta/45 sm:hidden">Cobertura</span>
                    <CeldaCobertura c={f.cobertura} />
                  </span>
                )}
                <span className={celda("centro", "text-sm tabular-nums text-tinta/80")}>
                  <span className="label-cayla mr-1 text-[10px] text-tinta/45 sm:hidden">Ritmo (7D)</span>
                  {ritmo === null ? <span className="text-tinta/40">N/D</span> : `${ritmo.toFixed(1)} uds/día`}
                </span>
                {separa && (
                  <span className={celda("centro", "overflow-visible")}>
                    <span className="inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
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
                          onClick={() => setReponiendo({ ...f, piso: f.pisoDisponible, almacen: f.almacenDisponible })}
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
                <span className={celda("centro", `text-sm tabular-nums ${f.enTransito > 0 ? "text-verde-profundo" : "text-tinta/35"}`)}>
                  <span className="label-cayla mr-1 text-[10px] text-tinta/45 sm:hidden">En camino</span>
                  {f.enTransito > 0 ? `+${f.enTransito}` : "—"}
                </span>
                <span className={celda("centro", "text-xs")} title={red?.detalle}>
                  <span className="label-cayla mr-1 text-[10px] text-tinta/45 sm:hidden">En la red</span>
                  {red ? (
                    <>
                      <span className="block text-tinta">
                        Disponible en {red.sedes} {red.sedes === 1 ? "sede" : "sedes"}: {red.total} {red.total === 1 ? "ud" : "uds"}
                      </span>
                      <span className="block truncate text-taupe">{red.detalle}</span>
                    </>
                  ) : (
                    <span className="text-tinta/35">—</span>
                  )}
                </span>
                <span className={celda("centro", "overflow-visible")}>
                  <span className="flex items-center justify-center gap-2">
                    <span className="flex flex-col items-center gap-1">
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
                      {puedeAjustar && (
                        <button
                          type="button"
                          onClick={() => setAjustando(f)}
                          className="btn-enlace text-xs"
                        >
                          Ajustar
                        </button>
                      )}
                    </span>
                    {/* «···»: un solo destino real — el historial del producto (verificado que existe como
                        página propia; `/productos/[id]` a secas SOLO existe como modal interceptado desde
                        DENTRO de /productos, no como destino navegable — de ahí llegando, un `router.push`
                        directo daba 404). No se inventan acciones que no llevan a ningún lado. */}
                    <MenuAcciones
                      etiqueta={`Más acciones: ${f.referencia}`}
                      items={[{ clave: "historial", etiqueta: "Ver historial del producto", onSelect: () => router.push(`/productos/${f.productoId}/historial`) }]}
                    />
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

      {reponiendo && sububicacionPiso && sububicacionAlmacen && (
        <ReponerPisoModal
          fila={reponiendo}
          ubicacionId={ubicacionId}
          sububicacionPisoId={sububicacionPiso.id}
          sububicacionAlmacenId={sububicacionAlmacen.id}
          onClose={() => setReponiendo(null)}
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
        <ResolverDanadosModal pendientes={danadosPendientes} esLider={esLider} onClose={() => setViendoDanados(false)} />
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

      {viendoApartados && <ApartadosModal apartados={apartados} onClose={() => setViendoApartados(false)} />}

      {viendoDisponible && <DisponibleTotalOverlay filas={filasSemana} esLider={esLider} onClose={() => setViendoDisponible(false)} />}

      {viendoCobertura && <AnalisisCoberturaOverlay stock={stock} onClose={() => setViendoCobertura(false)} />}

      {viendoRecomendaciones && <RecomendacionesOverlay recomendaciones={recomendaciones} onClose={() => setViendoRecomendaciones(false)} />}
    </div>
  );
}
