// Lo que falta recibir de un comprobante de Producción (ADR-0133, F4d). Puro: sin Supabase ni React.
//
// Hasta el 2026-11-25 aquí vivían también las reglas de la pantalla Recibir del Taller (agrupar por comprobante, armar la recepción y
// su resumen). Esa pantalla se retiró sin uso (ADR-0702): la tela se compra y se recibe en un paso en Insumos ▸ «Llegó una compra».
// Queda la forma de una línea por recibir, que leen el Resumen y Órdenes de Producción para saber qué está facturado y no llegó.

import type { UnidadInsumo } from "./insumos-reglas";

export type LineaPorRecibir = {
  comprobanteId: string;
  proveedor: string;
  tipo: string;
  serie: string;
  numero: string;
  fechaEmision: string;
  itemId: string;
  insumoId: string;
  insumo: string;
  unidad: UnidadInsumo;
  facturado: number;
  recibido: number;
  cerrado: number;
  pendiente: number;
};
