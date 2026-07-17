// Sedes reales de CAYLA (confirmado con el usuario 2026-07-15):
// TRU y AQP son tiendas; LIM es tienda; Taller es la fábrica (producción) — ubicación
// física distinta de LIM aunque esté en la misma ciudad. "Online" NO es una sede: es un
// canal de venta que despacha desde el stock real de alguna de estas 4 sedes.
export const SEDES = ["TRU", "AQP", "LIM", "TALLER"] as const;
export type Sede = (typeof SEDES)[number];

export const TIPOS_SEDE = ["tienda", "fabrica"] as const;
export type TipoSede = (typeof TIPOS_SEDE)[number];

export const CANALES_VENTA = ["tienda", "online"] as const;
export type CanalVenta = (typeof CANALES_VENTA)[number];

export const ROLES = ["lider", "integrante"] as const;
export type Rol = (typeof ROLES)[number];

export const TIPOS_MOVIMIENTO = ["entrada", "salida", "ajuste", "traslado"] as const;
export type TipoMovimiento = (typeof TIPOS_MOVIMIENTO)[number];

// Motivo estructurado para Salidas (antes texto libre). Necesario para distinguir
// "se vendió" de otras razones de salida al calcular velocidad de venta/rotación —
// ver apps/web/lib/inteligencia.ts.
export const MOTIVOS_SALIDA = ["venta", "merma", "regalo", "muestra", "otro"] as const;
export type MotivoSalida = (typeof MOTIVOS_SALIDA)[number];

export const ESTADOS_PRODUCTO = ["activa", "descontinuada", "agotada"] as const;
export type EstadoProducto = (typeof ESTADOS_PRODUCTO)[number];

export const ESTADOS_ORDEN_PRODUCCION = ["planeada", "en_proceso", "completada", "cancelada"] as const;
export type EstadoOrdenProduccion = (typeof ESTADOS_ORDEN_PRODUCCION)[number];

// Constantes del motor de inteligencia de inventario (apps/web/lib/inteligencia.ts).
// Sin tabla de configuración por ahora: no hay datos históricos que justifiquen
// afinar por categoría/sede — se ajustan aquí si la operación real lo pide.
export const UMBRAL_ESTANCADO_DIAS = 45; // días sin ninguna Salida para considerar estancado
export const LEAD_TIME_DIAS = 14; // días asumidos de reposición, para el reorder point
