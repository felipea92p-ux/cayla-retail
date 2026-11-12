// Llevar al stock ahora (ADR-0393, act. 2026-11-03): un modelo sale a la venta sin cerrar todo el envío. Lógica pura: qué se manda a la base, cuándo se ofrece
// el botón y a dónde llevan las acciones de después. Las reglas de verdad viven en `llevar_al_stock_ahora` y `corregir_salida`.

import { lineasEnUrl, MAX_VARIANTES_EN_URL } from "./existencias-prendas";

export const RPC_LLEVAR_AL_STOCK = "llevar_al_stock_ahora";
export const RPC_CORREGIR_SALIDA = "corregir_salida";
export const RPC_SALIDAS_DEL_ENVIO = "fn_salidas_del_envio";

export type LineaDeSalida = { varianteId: string; cantidad: number; talla?: string | null; color?: string | null };

export type SalidaDelEnvio = { id: string; productoId: string; prenda: string; unidades: number; quien: string | null; creadoEn: string; lineas: LineaDeSalida[] };

export type ResultadoDeSalida = { salidaId: string; unidades: number; lineas: LineaDeSalida[]; repetido: boolean };

const lineasDe = (v: unknown): LineaDeSalida[] =>
  Array.isArray(v)
    ? v.flatMap((l: { variante_id?: unknown; cantidad?: unknown; talla?: unknown; color?: unknown }) =>
        typeof l?.variante_id === "string" && Number(l.cantidad) > 0
          ? [{ varianteId: l.variante_id, cantidad: Number(l.cantidad), ...(typeof l.talla === "string" ? { talla: l.talla } : {}), ...(typeof l.color === "string" ? { color: l.color } : {}) }]
          : [],
      )
    : [];

export function leerSalidas(data: unknown): SalidaDelEnvio[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((s: Record<string, unknown>) =>
    typeof s?.id === "string" && typeof s.prenda === "string" && Number(s.unidades) > 0
      ? [{ id: s.id, productoId: String(s.producto_id), prenda: s.prenda, unidades: Number(s.unidades), quien: typeof s.quien === "string" ? s.quien : null, creadoEn: String(s.creado_en), lineas: lineasDe(s.lineas) }]
      : [],
  );
}

export function leerResultadoDeSalida(data: unknown): ResultadoDeSalida | null {
  const d = data as Record<string, unknown> | null;
  if (!d || typeof d.salida_id !== "string" || !(Number(d.unidades) > 0)) return null;
  return { salidaId: d.salida_id, unidades: Number(d.unidades), lineas: lineasDe(d.lineas), repetido: d.repetido === true };
}

/** Cuántas salen, o por qué todavía no se ofrece. Lo que se reparte de más o mal escrito no sale: se corrige antes. */
export function loQueSale(s: { contado: number; invalidas: number; danadasInvalidas: number; danadasDeMas: readonly string[] }, contadas: number, faltaArreglo: boolean): number {
  if (s.invalidas > 0 || s.danadasInvalidas > 0 || s.danadasDeMas.length > 0 || faltaArreglo) return 0;
  if (s.contado <= 0 || s.contado > contadas) return 0;
  return s.contado;
}

export type ArgsLlevarAlStock = {
  p_despacho_id: string;
  p_despacho_item_id: string | null;
  p_extra_posicion: number | null;
  p_version_conteo: number;
  p_producto_id: string;
  p_variantes: { variante_id: string; cantidad: number; danadas: number; danada_solucion: string | null }[];
  p_costo: number | null;
  p_confirma: boolean;
  p_token: string;
};

export function argsLlevarAlStock(p: {
  despachoId: string;
  despachoItemId: string | null;
  extraPosicion: number | null;
  versionConteo: number;
  productoId: string;
  variantes: readonly { varianteId: string; cantidad: number; danadas: number; solucion: string | null }[];
  costo: number | null;
  confirma: boolean;
  token: string;
}): ArgsLlevarAlStock {
  return {
    p_despacho_id: p.despachoId,
    p_despacho_item_id: p.despachoItemId,
    p_extra_posicion: p.despachoItemId ? null : p.extraPosicion,
    p_version_conteo: p.versionConteo,
    p_producto_id: p.productoId,
    p_variantes: p.variantes.map((v) => ({ variante_id: v.varianteId, cantidad: v.cantidad, danadas: v.danadas, danada_solucion: v.danadas > 0 ? v.solucion : null })),
    p_costo: p.costo,
    p_confirma: p.confirma,
    p_token: p.token,
  };
}

/** Las etiquetas de esa tanda y nada más: las del lote entero repetirían lo que salió antes. */
export const urlEtiquetasDeLaTanda = (lineas: readonly LineaDeSalida[]): string => `/etiquetas-de-precio?unidades=${lineasEnUrl([...lineas])}`;

export const urlBajarDeLaTanda = (lineas: readonly LineaDeSalida[]): string =>
  lineas.length > 0 && lineas.length <= MAX_VARIANTES_EN_URL ? `/inventario/bajar?lineas=${lineasEnUrl([...lineas])}` : "/inventario/bajar";

/** Lo último que salió de esa prenda y sigue vigente: es lo que se corrige. */
export const ultimaSalidaDe = (salidas: readonly SalidaDelEnvio[], prenda: string): SalidaDelEnvio | null =>
  [...salidas].reverse().find((s) => s.prenda.trim().toLocaleLowerCase("es") === prenda.trim().toLocaleLowerCase("es")) ?? null;

export const RPC_ENVIOS_A_MEDIAS = "fn_envios_a_medias";

/** A los 3 días, un envío a medias se resalta y también le aparece al líder. */
export const DIAS_PARA_RESALTAR = 3;

export type EnvioAMedias = { id: string; numero: string; sede: string; enStock: number; contadas: number; desde: string };

export function leerEnviosAMedias(data: unknown): EnvioAMedias[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((e: Record<string, unknown>) =>
    typeof e?.id === "string" && typeof e.numero === "string" && typeof e.desde === "string"
      ? [{ id: e.id, numero: e.numero, sede: String(e.sede ?? ""), enStock: Number(e.en_stock) || 0, contadas: Number(e.contadas) || 0, desde: e.desde }]
      : [],
  );
}

/**
 * Lo que ya entró al stock de un envío que se sigue recibiendo, bajo sus prendas en «Envíos por recibir» (Felipe 2026-11-12: ENV-000021 salía
 * arriba con «43 prendas» y abajo, en «Terminados», con lo ya contado, y parecía repetido). Corto: la columna de prendas mide 5 rem.
 * `null` si todavía no entró nada.
 */
export function textoYaEnStock(enStock: number, total: number): string | null {
  if (!(enStock > 0)) return null;
  if (total > 0 && enStock >= total) return "todas en stock";
  return `${enStock.toLocaleString("es-PE")} en stock`;
}

export const diasAMedias = (desde: string, ahora: number = Date.now()): number => Math.max(0, Math.floor((ahora - new Date(desde).getTime()) / 86_400_000));

/** «ENV-000012: 12 de 70 ya en stock · se sigue contando, desde hace 3 días». */
export function textoDeEnvioAMedias(e: EnvioAMedias, ahora: number = Date.now()): string {
  const dias = diasAMedias(e.desde, ahora);
  return `${e.numero}: ${e.enStock.toLocaleString("es-PE")} de ${e.contadas.toLocaleString("es-PE")} ya en stock · se sigue contando${dias > 0 ? `, desde hace ${dias === 1 ? "1 día" : `${dias} días`}` : ""}`;
}
