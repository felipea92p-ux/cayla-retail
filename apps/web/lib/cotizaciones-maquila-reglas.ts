import type { CotizacionMaquila } from "./cotizaciones-maquila";
import { diasEntreFechas } from "./fechas-lima";
import { fechaCorta } from "./compras-reglas";

// Reglas de la pantalla de Cotizaciones de maquila (D-82): en qué estado está la cotización
// vigente de cada categoría, con qué chip, qué línea de detalle y en qué orden se listan.
// Puras y sin servidor: "hoy" entra por parámetro (la fecha de Lima, `hoyLima`), igual que
// `facturacion-codigos-reglas.ts` — mismo criterio, mismo dispositivo, otra tabla.

/** El aviso pide actuar cuando quedan hasta este número de días — pedido explícito de la
 *  tarea ("a 30 días o menos"), más largo que el de un código de descuento (7 días) porque
 *  volver a pedirle una cotización a un taller externo toma más que renovar un código. */
export const DIAS_COTIZACION_POR_VENCER = 30;

export type EstadoCotizacion = "vigente" | "porVencer" | "vencida";

type CotizacionParaEstado = Pick<CotizacionMaquila, "vigenteHasta">;

/** `>=`, no `>`: el día que vence todavía cuenta como vigente — mismo criterio que la RPC
 *  `fn_cotizacion_maquila_vigente` (`vigente_hasta >= current_date`). Los dos tienen que
 *  decir lo mismo: si la pantalla mostrara "vencida" un día antes que la base, alguien
 *  renovaría una cotización que la RPC todavía consideraba buena. */
export function estadoDeCotizacion(c: CotizacionParaEstado, hoy: string): EstadoCotizacion {
  if (c.vigenteHasta < hoy) return "vencida";
  return diasEntreFechas(hoy, c.vigenteHasta) <= DIAS_COTIZACION_POR_VENCER ? "porVencer" : "vigente";
}

/** De todas las cotizaciones cargadas (cualquier cantidad por categoría, historial completo),
 *  la más reciente de cada una — el mismo criterio que `fn_cotizacion_maquila_vigente`
 *  (fecha_cotizacion desc, created_at desc como desempate), pero sin filtrar por vencida:
 *  la pantalla SÍ quiere mostrar la última aunque ya haya vencido (es el aviso). El servidor
 *  ya entrega la lista ordenada así (`getCotizacionesMaquila`); esto solo se queda con la
 *  primera de cada categoría. No modifica el arreglo que recibe. */
export function masRecientePorCategoria(cotizaciones: CotizacionMaquila[]): CotizacionMaquila[] {
  const vistas = new Set<string>();
  const resultado: CotizacionMaquila[] = [];
  for (const c of cotizaciones) {
    if (vistas.has(c.categoriaId)) continue;
    vistas.add(c.categoriaId);
    resultado.push(c);
  }
  return resultado;
}

export type ChipDeCotizacion = { tono: "verde" | "ambar" | "rojo"; texto: string };

// A diferencia de un código de descuento vencido (que simplemente deja de aplicar, sin
// consecuencia), una cotización de maquila vencida SÍ es una falla activa: D-31 dice que el
// Taller se mide contra ella, y sin ninguna vigente `fn_cotizacion_maquila_vigente` devuelve
// null — la medición se queda sin punto de comparación. Por eso, a diferencia de
// `facturacion-codigos-reglas.ts`, acá "vencida" sí lleva rojo.
const CHIP: Record<EstadoCotizacion, ChipDeCotizacion> = {
  vigente: { tono: "verde", texto: "Vigente" },
  porVencer: { tono: "ambar", texto: "Por vencer" },
  vencida: { tono: "rojo", texto: "Vencida" },
};

export function chipDeCotizacion(c: CotizacionParaEstado, hoy: string): ChipDeCotizacion {
  return CHIP[estadoDeCotizacion(c, hoy)];
}

/** La línea bajo el chip: cuándo vence o hace cuánto venció. */
export function detalleDeCotizacion(c: CotizacionParaEstado, hoy: string): string {
  const dias = diasEntreFechas(hoy, c.vigenteHasta);
  if (dias > 0) return dias === 1 ? "Vence mañana" : `Vence en ${dias} d`;
  if (dias === 0) return "Vence hoy";
  const pasados = -dias;
  return pasados === 1 ? "Venció ayer" : `Venció hace ${pasados} d`;
}

const GRUPO: Record<EstadoCotizacion, number> = { vencida: 0, porVencer: 1, vigente: 2 };

/** El orden de la lista: lo que pide actuar primero — vencida, luego por vencer, luego
 *  vigente — y dentro de cada grupo, alfabético por categoría (no hay otra fecha que
 *  desempate mejor: todas dentro del grupo "vencen" en sentidos distintos). No modifica el
 *  arreglo que recibe. */
export function ordenarCotizaciones(cotizaciones: CotizacionMaquila[], hoy: string): CotizacionMaquila[] {
  return [...cotizaciones].sort((a, b) => {
    const diff = GRUPO[estadoDeCotizacion(a, hoy)] - GRUPO[estadoDeCotizacion(b, hoy)];
    return diff || a.categoriaNombre.localeCompare(b.categoriaNombre, "es");
  });
}

/** La vigencia tal como se lee en la fila: "01/03/2026 — 01/09/2026". */
export function textoDeVigencia(c: Pick<CotizacionMaquila, "fechaCotizacion" | "vigenteHasta">): string {
  return `${fechaCorta(c.fechaCotizacion)} — ${fechaCorta(c.vigenteHasta)}`;
}
