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
import { paginar } from "@/lib/paginacion";
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
import { resumenRed } from "@/lib/stock-por-sede";
import { descargarCsv } from "@/lib/exportar-csv";
import { TEXTO_ACCION_HOY, type Recomendacion, type TipoAccionHoy } from "@/lib/existencias-recomendaciones";
import { coincideConFiltroAccion, coincideConFiltroDanado, OPCIONES_FILTRO_ACCION } from "@/lib/existencias-filtros";
import { textoCoberturaPiso, textoRitmoReciente } from "@/lib/resumen-formato";
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
  /** «Ver recomendaciones» (2026-09-22, motor propio desde 2026-09-25): `calcularAccionHoy` corrido
   *  por cada variante de la sede — ya ordenada por urgencia, vacía en Taller. */
  recomendaciones: Recomendacion[];
  /** Política operativa de Inventario (`politica-operativa-inventario.ts`): una sola fuente para
   *  los umbrales que leen el popover de Ritmo reciente y el análisis de cobertura. */
  politica: PoliticaOperativaInventario;
}) {
  const router = useRouter();
  const [busqueda, setBusqueda] = useState("");
  const [categoria, setCategoria] = useState(TODAS);
  const [talla, setTalla] = useState(TODAS);
  const [color, setColor] = useState(TODAS);
  // Dos ejes independientes (2026-09-25): «Acción» es SOLO `TipoAccionHoy` (qué debería hacer la
  // vendedora); «Estado» es la condición del inventario (dañado/cuarentena) — no son la misma
  // pregunta, y mezclarlos en un solo dropdown confundía dos clasificaciones distintas.
  const [accion, setAccion] = useState(TODAS);
  const [condicion, setCondicion] = useState(TODAS);
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
  // Filtro de búsqueda especial (`lib/filtro-busqueda-especial.ts`): lo escrito se parte en términos —nombre,
  // SKU, código, color y talla, en cualquier orden— y todos deben cumplirse. Si el texto dice una talla o un
  // color, manda sobre el filtro visual de esa dimensión; Categoría y Acción siempre aplican.
  const indiceBusqueda = useMemo(
    () => crearIndiceBusquedaEspecial(stock, (f) => ({ nombre: f.referencia, sku: f.sku, codigosBarras: f.codigosBarras, color: f.color, talla: f.talla })),
    [stock]
  );
  const { filas: filtradas, dimensiones: dichoEnLaBusqueda } = useMemo(
    () =>
      filtrarConBusquedaEspecial(indiceBusqueda, busqueda, {
        talla: talla === TODAS ? null : talla,
        color: color === TODAS ? null : color,
        otros: (f) => {
          if (categoria !== TODAS && f.categoria !== categoria) return false;
          if (!coincideConFiltroDanado(f.danado, condicion === DANADO)) return false;
          if (!coincideConFiltroAccion(f.accionHoy?.tipo, accion === TODAS ? null : (accion as TipoAccionHoy))) return false;
          return true;
        },
      }),
    [indiceBusqueda, busqueda, talla, color, categoria, accion, condicion]
  );

  // La tabla pinta UNA página de `filtradas`; las tarjetas, los filtros y el CSV siguen viendo todas.
  // Cambiar cualquier filtro vuelve a la página 1 (ajuste durante el render, sin efecto: la firma de
  // los filtros cambió → se reinicia). `paginar` acota: si un guardado achicó la lista, cae en la última.
  const [pagina, setPagina] = useState(1);
  const firmaFiltros = [busqueda, categoria, talla, color, accion, condicion].join("\u0000");
  const [firmaPrevia, setFirmaPrevia] = useState(firmaFiltros);
  if (firmaFiltros !== firmaPrevia) {
    setFirmaPrevia(firmaFiltros);
    setPagina(1);
  }
  const paginaActual = paginar(filtradas, pagina, FILAS_POR_PAGINA);
  const tarjetaTablaRef = useRef<HTMLDivElement>(null);
  function irAPagina(n: number) {
    setPagina(n);
    // El paginador está al pie: al cambiar de página, que la tabla empiece a leerse desde arriba.
    const tarjeta = tarjetaTablaRef.current;
    if (tarjeta && tarjeta.getBoundingClientRect().top < 0) tarjeta.scrollIntoView({ block: "start" });
  }

  const hayFiltrosActivos = busqueda !== "" || categoria !== TODAS || talla !== TODAS || color !== TODAS || accion !== TODAS || condicion !== TODAS;
  function limpiarFiltros() {
    setBusqueda("");
    setCategoria(TODAS);
    setTalla(TODAS);
    setColor(TODAS);
    setAccion(TODAS);
    setCondicion(TODAS);
  }

  const puedeReponer = Boolean(resumen.separaPisoAlmacen && sububicacionPiso && sububicacionAlmacen);
  // Apartar necesita saber DE DÓNDE (piso o almacén): solo donde la ubicación separa las dos.
  const puedeApartar = puedeReponer;
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
    const encabezados = ["Prenda", "SKU", "Talla", "Color", "Categoría"];
    if (separa) encabezados.push("Piso", "Almacén", "Cobertura piso", "Ritmo reciente", "Acción hoy");
    encabezados.push("Disponible", "En camino", "En la red");

    const filas = filtradas.map((f) => {
      const fila: (string | number)[] = [f.referencia, f.sku, f.talla ?? "—", f.color ?? "—", f.categoria ?? "—"];
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

  return (
    <div className="space-y-6">
      {/* Prioridades de hoy (rediseño 2026-09-22): las 4 cifras que antes eran sueltas, ahora con un
          propósito de acción cada una. A es la más urgente (acento rojo); B abre el desglose por
          categoría; C y D se comportaban igual antes, solo con más presencia visual.
          «Reponer a piso hoy» (2026-09-25) cuenta y filtra por «Acción hoy» — MISMA fuente que la
          columna de la tabla (`planDeReposicion`), nunca `EstadoStock` por separado (sección 15). */}
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
              onClick={() => setAccion((a) => (a === "reponer_a_piso" ? TODAS : "reponer_a_piso"))}
            >
              {resumen.requierenReposicion === 0 ? "Nada pendiente de bajar al piso" : `${unidadesReponer.toLocaleString("es-PE")} uds disponibles en almacén`}
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

      {/* Guía oficial (2026-09-22, ADR-0169): los filtros y la tabla viven en UNA tarjeta — lo que se filtra
          y lo filtrado se leen como una sola cosa. Los filtros son cajas hundidas en hueso, sin etiqueta visible. */}
      <div ref={tarjetaTablaRef} className="card-cayla scroll-mt-4 overflow-hidden">
      {stock.length > 0 && (
        <div className={`grid gap-x-3 gap-y-1 px-4 pt-4 sm:px-5 sm:pt-5 ${separa ? "sm:grid-cols-[1.4fr_1fr_1fr_1fr_1fr_1fr]" : "sm:grid-cols-[1.4fr_1fr_1fr_1fr]"}`}>
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
              ]}
            />
          )}
          {hayFiltrosActivos && (
            <div className="flex items-center gap-1.5 pt-1 sm:col-span-full sm:justify-end sm:pt-0">
              <SlidersHorizontal aria-hidden className="h-3.5 w-3.5 text-tinta/40" />
              <button type="button" onClick={limpiarFiltros} className="label-cayla text-[11px] text-taupe underline-offset-2 hover:text-rojo hover:underline">
                Limpiar filtros
              </button>
            </div>
          )}
        </div>
      )}

      {separa && coberturaFallo && stock.length > 0 && <p className="px-4 pb-2 text-xs text-ambar sm:px-5">{coberturaFallo}</p>}
      {stock.length === 0 ? (
        <p className="p-5 text-sm text-taupe">Esta ubicación no tiene stock todavía.</p>
      ) : filtradas.length === 0 ? (
        <p className="border-t border-sand p-5 text-sm text-taupe">Ningún producto coincide con la búsqueda.</p>
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
            return (
              <div key={f.varianteId} className={fila(plantilla)}>
                {/* La misma celda que dibuja Conteo (`ui/PrendaCelda.tsx`). */}
                <ProductoVarianteCelda referencia={f.referencia} sku={f.sku} talla={f.talla} color={f.color} colorHex={f.colorHex} fotoUrl={f.fotoUrl} />
                {/* «Stock actual P/A» (2026-09-25, sección 4 del pedido): fusiona Piso·Almacén y
                    Disponible — mostrar los dos por separado era la misma información repetida
                    (Disponible = piso + almacén utilizable). En Taller (sin separación) es un solo
                    número: no hay un split que reportar con rigor. */}
                <span className={celda("centro", "text-sm tabular-nums")} title={separa ? `Piso: ${f.piso ?? 0}\nAlmacén: ${f.almacen ?? 0}\nTotal: ${f.disponible}` : undefined}>
                  <span className="label-cayla mr-1 text-[10px] text-tinta/45 sm:hidden">Stock actual</span>
                  {separa ? (
                    <>
                      {/* Ámbar exactamente cuando «Acción hoy» ya dice que esta fila necesita algo —
                          misma fuente que la columna, nunca un umbral aparte (2026-09-25). */}
                      <span className={f.accionHoy?.tipo === "reponer_a_piso" ? "text-ambar-profundo" : "text-tinta"}>{f.piso}</span>
                      <span className="text-tinta/45"> / </span>
                      <span className="text-tinta">{f.almacen}</span>
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
                  <span className={celda("centro")}>
                    <span className="label-cayla mr-1 text-[10px] text-tinta/45 sm:hidden">Cobertura piso</span>
                    <CeldaCoberturaPiso f={f} />
                  </span>
                )}
                {separa && (
                  <span className={celda("centro", "overflow-visible")}>
                    <span className="label-cayla mr-1 text-[10px] text-tinta/45 sm:hidden">Ritmo reciente</span>
                    <RitmoRecientePopover ritmo={f.ritmoReciente ?? null} referencia={f.referencia} sku={f.sku} minDiasExposicionRitmo={politica.minDiasExposicionRitmo} />
                  </span>
                )}
                <span className={celda("centro", `text-sm tabular-nums ${f.enTransito > 0 ? "text-verde-profundo" : "text-tinta/35"}`)}>
                  <span className="label-cayla mr-1 text-[10px] text-tinta/45 sm:hidden">En camino</span>
                  {f.enTransito > 0 ? `+${f.enTransito}` : "—"}
                </span>
                {separa && (
                  <span className={celda("centro", "overflow-visible")}>
                    <span className="label-cayla mr-1 text-[10px] text-tinta/45 sm:hidden">Acción hoy</span>
                    <span className="inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
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
                      {f.accionHoy?.contexto && <span className="text-[11px] text-taupe">{f.accionHoy.contexto}</span>}
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
                          onClick={() => setReponiendo({ ...f, piso: f.pisoDisponible, almacen: f.almacenDisponible })}
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
