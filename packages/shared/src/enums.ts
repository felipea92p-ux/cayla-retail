// Sedes reales de CAYLA (confirmado con el usuario 2026-07-15):
// TRU y AQP son tiendas; LIM es tienda; Taller es la fábrica (producción) — ubicación
// física distinta de LIM aunque esté en la misma ciudad. "Online" NO es una sede: es un
// canal de venta que despacha desde el stock real de alguna de estas 4 sedes.
export const SEDES = ["TRU", "AQP", "LIM", "TALLER"] as const;
export type Sede = (typeof SEDES)[number];

export const TIPOS_SEDE = ["tienda", "fabrica", "almacen"] as const;
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

// Fase 2 financiera (apps/web/lib/finanzas.ts, supabase/migrations/0007_finanzas.sql).
export const METODOS_PAGO = ["efectivo", "pos", "yape", "transferencia"] as const;
export type MetodoPago = (typeof METODOS_PAGO)[number];

// Categorías fijas de gasto — todas operativas por definición (el COGS sale de
// variantes.costo × ventas, las mermas de movimientos.motivo='merma'; nunca de una
// fila de Gastos). Lista corta a propósito: no es un plan contable de 60-90 cuentas,
// es lo que necesitan 3 tiendas + 1 taller.
export const GASTO_CATEGORIAS = [
  "alquiler",
  "servicios",
  "planilla",
  "transporte",
  "marketing",
  "mantenimiento",
  "otro",
] as const;
export type GastoCategoria = (typeof GASTO_CATEGORIAS)[number];

// Fase 3: ingreso de mercadería y almacén (supabase/migrations/0008_almacen.sql).
export const ORIGENES_LOTE = ["taller", "proveedor"] as const;
export type OrigenLote = (typeof ORIGENES_LOTE)[number];

export const TIPOS_CONTENEDOR = ["estante", "caja"] as const;
export type TipoContenedor = (typeof TIPOS_CONTENEDOR)[number];

// Motivo al devolver mercadería de tienda a almacén (traslado tienda→almacén) — no
// vendida, dañada (dos destinos posibles: reparar o donar), o hay que devolverla al
// proveedor. Distinto de MOTIVOS_SALIDA, que es para salidas de una sede sin destino.
export const MOTIVOS_DEVOLUCION = ["no_vendida", "danada_reparacion", "danada_donar", "devolver_proveedor"] as const;
export type MotivoDevolucion = (typeof MOTIVOS_DEVOLUCION)[number];

// Taxonomía del catálogo (supabase/migrations/0009_categorias.sql). Familia es fija
// (6, poco probable que cambie); categoría vive en una tabla real porque son ~30
// valores con jerarquía por familia — un Líder puede agregar una nueva sin deploy.
export const FAMILIAS = ["indumentaria", "calzado", "accesorios", "bisuteria", "belleza", "papeleria"] as const;
export type Familia = (typeof FAMILIAS)[number];
