// Lo que se le debe a un servicio de afuera y todavía no tiene papel (ADR-0614, actividad 3). La base lo deriva (`fn_servicios_por_pagar`:
// devengado − lo documentado); aquí solo se lee y se suma, sin otra regla de dinero.

import { redondear2 } from "./comprobantes-produccion-reglas";

export type ServicioPorPagar = {
  faseId: string;
  numero: number;
  numeroTexto: string;
  producto: string;
  fase: string;
  proveedorId: string | null;
  /** Null: el paso quedó «Pendiente de registrar» y todavía no se sabe quién lo hizo. */
  proveedor: string | null;
  devengado: number;
  documentado: number;
  falta: number;
};

export type ServicioCrudo = {
  fase_id: string;
  numero: number;
  numero_texto: string;
  producto: string;
  fase: string;
  proveedor_id: string | null;
  proveedor: string | null;
  devengado: number | string;
  documentado: number | string;
  falta: number | string;
};

export function servicioDesdeCrudo(f: ServicioCrudo): ServicioPorPagar {
  return {
    faseId: f.fase_id,
    numero: f.numero,
    numeroTexto: f.numero_texto,
    producto: f.producto,
    fase: f.fase,
    proveedorId: f.proveedor_id,
    proveedor: f.proveedor,
    devengado: Number(f.devengado),
    documentado: Number(f.documentado),
    falta: Number(f.falta),
  };
}

export function totalDeServicios(lista: readonly Pick<ServicioPorPagar, "falta">[]): number {
  return redondear2(lista.reduce((s, x) => s + x.falta, 0));
}

/** A dónde lleva «Registrar quién»: la orden, donde esa hoja ya existe. */
export function hrefDeLaOrden(numero: number): string {
  return `/produccion/ordenes/${numero}`;
}
