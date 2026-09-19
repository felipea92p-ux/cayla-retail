import { crearIndice, coincideConsulta } from "./resumen-busqueda";
import { ETIQUETA_BANDA, BANDAS_COBERTURA, ETIQUETA_ESTADO, type AnalisisVariante, type BandaCobertura, type EstadoResumen } from "./resumen-reglas";
import { SELL_THROUGH_ALTO_PCT, SELL_THROUGH_BAJO_PCT } from "./inventario-reglas";

// Filtros del Resumen (2026-09-19, ADR-0113). Dos capas a propósito:
//
//  · ALCANCE — sede (implícita), categoría y búsqueda. Definen «de qué estamos
//    hablando» y mueven las tarjetas, los gráficos Y la tabla.
//  · VISTA — cobertura, sell-through, estado y orden. Recortan solo la TABLA: se
//    llega a ellos tocando una tarjeta o una banda del gráfico, y si movieran las
//    tarjetas, al tocar «Cobertura crítica» todas las demás tarjetas colapsarían.
//
// Todos se combinan con «y». El período no está acá: no filtra filas, cambia lo
// que significan las métricas históricas (y jamás el stock).

export type FiltroCobertura = "todas" | BandaCobertura;
export type FiltroSellThrough = "todos" | "alto" | "medio" | "bajo" | "sin_dato";
export type FiltroEstado = "todos" | "con_accion" | EstadoResumen;
export type Orden = "prioridad" | "velocidad" | "vendido" | "cobertura";

export type AlcanceResumen = { q: string; categoriaId: string | null };
export type VistaResumen = { cobertura: FiltroCobertura; sellThrough: FiltroSellThrough; estado: FiltroEstado; orden: Orden };

export const ALCANCE_INICIAL: AlcanceResumen = { q: "", categoriaId: null };
export const VISTA_INICIAL: VistaResumen = { cobertura: "todas", sellThrough: "todos", estado: "todos", orden: "prioridad" };

export const OPCIONES_COBERTURA: readonly { valor: FiltroCobertura; texto: string }[] = [
  { valor: "todas", texto: "Todas" },
  ...BANDAS_COBERTURA.map((b) => ({ valor: b as FiltroCobertura, texto: ETIQUETA_BANDA[b] })),
];

export const OPCIONES_SELL_THROUGH: readonly { valor: FiltroSellThrough; texto: string }[] = [
  { valor: "todos", texto: "Todos" },
  { valor: "alto", texto: `Alto (${SELL_THROUGH_ALTO_PCT}% o más)` },
  { valor: "medio", texto: "Medio" },
  { valor: "bajo", texto: `Bajo (menos de ${SELL_THROUGH_BAJO_PCT}%)` },
  { valor: "sin_dato", texto: "Sin dato" },
];

/** Los estados por los que tiene sentido filtrar (lo que ya dicen las tarjetas y los chips). */
const ESTADOS_FILTRABLES: EstadoResumen[] = [
  "agotada_demanda",
  "cobertura_critica",
  "curva_rota",
  "sin_piso",
  "cobertura_baja",
  "alta_demanda",
  "posible_sobrestock",
  "venta_estable",
  "sin_historial",
  "agotada",
  "en_baja",
  "en_alza",
  "descontinuada",
];

export const OPCIONES_ESTADO: readonly { valor: FiltroEstado; texto: string }[] = [
  { valor: "todos", texto: "Todos" },
  { valor: "con_accion", texto: "Con acción sugerida" },
  ...ESTADOS_FILTRABLES.map((e) => ({ valor: e as FiltroEstado, texto: ETIQUETA_ESTADO[e] })),
];

export const OPCIONES_ORDEN: readonly { valor: Orden; texto: string }[] = [
  { valor: "prioridad", texto: "Prioridad" },
  { valor: "velocidad", texto: "Velocidad" },
  { valor: "vendido", texto: "Vendido" },
  { valor: "cobertura", texto: "Cobertura" },
];

export function bandaSellThrough(pct: number | null): Exclude<FiltroSellThrough, "todos"> {
  if (pct === null) return "sin_dato";
  if (pct >= SELL_THROUGH_ALTO_PCT) return "alto";
  if (pct < SELL_THROUGH_BAJO_PCT) return "bajo";
  return "medio";
}

export function aplicarAlcance(analisis: AnalisisVariante[], alcance: AlcanceResumen): AnalisisVariante[] {
  const consulta = alcance.q.trim();
  return analisis.filter((a) => {
    if (alcance.categoriaId && a.fila.categoriaId !== alcance.categoriaId) return false;
    if (consulta && !coincideConsulta(crearIndice(a.fila), consulta)) return false;
    return true;
  });
}

const tieneAccion = (a: AnalisisVariante) => a.plan.principal !== null;

export function aplicarVista(analisis: AnalisisVariante[], vista: VistaResumen): AnalisisVariante[] {
  const filtradas = analisis.filter((a) => {
    if (vista.cobertura !== "todas" && a.banda !== vista.cobertura) return false;
    if (vista.sellThrough !== "todos" && bandaSellThrough(a.sellThrough) !== vista.sellThrough) return false;
    if (vista.estado === "con_accion") return tieneAccion(a);
    if (vista.estado !== "todos") return a.estados.includes(vista.estado);
    return true;
  });
  switch (vista.orden) {
    case "velocidad":
      return [...filtradas].sort((x, y) => (y.velocidad.unidadesDia ?? -1) - (x.velocidad.unidadesDia ?? -1) || y.velocidad.ventasNetas - x.velocidad.ventasNetas);
    case "vendido":
      return [...filtradas].sort((x, y) => y.velocidad.ventasNetas - x.velocidad.ventasNetas);
    case "cobertura":
      return [...filtradas].sort((x, y) => (x.cobertura.dias ?? Infinity) - (y.cobertura.dias ?? Infinity));
    default:
      return filtradas; // ya viene en orden de prioridad
  }
}

/** Filas por página de «Prioridades». Toda la sede se analiza en el servidor; al
 *  navegador solo viaja una página (nunca miles de variantes). */
export const FILAS_POR_PAGINA = 15;

export function paginar<T>(items: T[], pagina: number, tamano: number): { items: T[]; pagina: number; paginas: number; total: number } {
  const paginas = Math.max(1, Math.ceil(items.length / tamano));
  const actual = Math.min(Math.max(1, Math.trunc(pagina) || 1), paginas);
  return { items: items.slice((actual - 1) * tamano, actual * tamano), pagina: actual, paginas, total: items.length };
}

// ---------------------------------------------------------------------------
// De la URL a los filtros (y de vuelta): todo lo que no se reconoce se ignora.
// ---------------------------------------------------------------------------

type ParamsCrudos = Record<string, string | string[] | undefined>;

const primero = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

function esValor<T extends string>(opciones: readonly { valor: T }[], v: string | undefined): v is T {
  return v !== undefined && opciones.some((o) => o.valor === v);
}

export function leerFiltros(p: ParamsCrudos): { alcance: AlcanceResumen; vista: VistaResumen; pagina: number } {
  const q = (primero(p.q) ?? "").slice(0, 120);
  const cat = primero(p.cat);
  const cob = primero(p.cob);
  const st = primero(p.st);
  const est = primero(p.est);
  const ord = primero(p.orden);
  return {
    alcance: { q, categoriaId: cat && cat.length > 0 ? cat : null },
    vista: {
      cobertura: esValor(OPCIONES_COBERTURA, cob) ? cob : VISTA_INICIAL.cobertura,
      sellThrough: esValor(OPCIONES_SELL_THROUGH, st) ? st : VISTA_INICIAL.sellThrough,
      estado: esValor(OPCIONES_ESTADO, est) ? est : VISTA_INICIAL.estado,
      orden: esValor(OPCIONES_ORDEN, ord) ? ord : VISTA_INICIAL.orden,
    },
    pagina: Math.max(1, Math.trunc(Number(primero(p.pag))) || 1),
  };
}
