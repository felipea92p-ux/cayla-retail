// Por pagar de Producción y consolidado de deuda (ADR-0133, F4c; D-I). Puro: sin Supabase ni React.

import { diasHasta, redondear2, type ComprobanteProduccion } from "./comprobantes-produccion-reglas";

export type TramoClave = "vencido" | "semana" | "mes" | "despues";

export type Tramo = { clave: TramoClave; etiqueta: string; monto: number; comprobantes: ComprobanteProduccion[] };

const ETIQUETA_TRAMO: Record<TramoClave, string> = { vencido: "Vencido", semana: "Vence en 7 días", mes: "Vence en 30 días", despues: "Más adelante" };

/** Lo que se debe (vigente y con saldo), del más urgente al menos: vencido, esta semana, este mes, después. Dentro de cada tramo, el que vence primero. */
export function tramosPorPagar(lista: ComprobanteProduccion[], hoy: string): Tramo[] {
  const pendientes = lista.filter((c) => c.estado === "vigente" && c.saldo > 0);
  const claveDe = (c: ComprobanteProduccion): TramoClave => {
    if (c.vencido) return "vencido";
    if (!c.fechaVencimiento) return "despues";
    const d = diasHasta(c.fechaVencimiento, hoy);
    return d <= 7 ? "semana" : d <= 30 ? "mes" : "despues";
  };
  const porVenc = (a: ComprobanteProduccion, b: ComprobanteProduccion) => (a.fechaVencimiento ?? "9999-12-31").localeCompare(b.fechaVencimiento ?? "9999-12-31") || a.proveedor.localeCompare(b.proveedor, "es");
  return (["vencido", "semana", "mes", "despues"] as const)
    .map((clave) => {
      const comprobantes = pendientes.filter((c) => claveDe(c) === clave).sort(porVenc);
      return { clave, etiqueta: ETIQUETA_TRAMO[clave], monto: redondear2(comprobantes.reduce((s, c) => s + c.saldo, 0)), comprobantes };
    })
    .filter((t) => t.comprobantes.length > 0);
}

export type DeudaFila = { origen: "compras" | "produccion"; proveedorId: string; proveedor: string; comprobantes: number; saldo: number; vencido: number; proximoVencimiento: string | null };

export type ResumenDeuda = {
  total: number;
  vencido: number;
  porOrigen: Record<"compras" | "produccion", { saldo: number; vencido: number; proveedores: number }>;
  /** Parte de Producción sobre el total (0 a 1), para la barra. `null` si no se debe nada. */
  parteProduccion: number | null;
};

export function resumenDeuda(filas: DeudaFila[]): ResumenDeuda {
  const porOrigen = { compras: { saldo: 0, vencido: 0, proveedores: 0 }, produccion: { saldo: 0, vencido: 0, proveedores: 0 } };
  for (const f of filas) {
    const o = porOrigen[f.origen];
    o.saldo += f.saldo;
    o.vencido += f.vencido;
    o.proveedores++;
  }
  porOrigen.compras.saldo = redondear2(porOrigen.compras.saldo);
  porOrigen.produccion.saldo = redondear2(porOrigen.produccion.saldo);
  porOrigen.compras.vencido = redondear2(porOrigen.compras.vencido);
  porOrigen.produccion.vencido = redondear2(porOrigen.produccion.vencido);
  const total = redondear2(porOrigen.compras.saldo + porOrigen.produccion.saldo);
  return { total, vencido: redondear2(porOrigen.compras.vencido + porOrigen.produccion.vencido), porOrigen, parteProduccion: total > 0 ? porOrigen.produccion.saldo / total : null };
}

export type IgvMes = { mes: string; igvCompras: number; igvProduccion: number; igvNotasCredito: number; igvNeto: number };

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** «septiembre 2026» a partir de `2026-09-01`. */
export function nombreDeMes(mes: string): string {
  const [a, m] = mes.split("-");
  return `${MESES[Number(m) - 1] ?? mes} ${a}`;
}
