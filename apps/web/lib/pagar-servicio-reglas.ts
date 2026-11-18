import type { CampoDeGuia } from "./guia-campos";
import { redondear2, type MetodoPago } from "./comprobantes-produccion-reglas";

// Pagar a un servicio de afuera (ADR-0614, actividad 4). Puro: sin React ni red.
//
// CONTRATO
//   PROMETE: decir qué falta antes de pagar, cuánto se paga con IGV y qué se le manda a `pagar_servicio_de_orden`.
//   ASUME:   es un espejo de lo que ya exige la base; una regla que la base no tenga no se inventa aquí. El monto va sin IGV, como la tarifa.
//   NO HACE: no valida las cuentas de pago (las trae `MediosDePago`).

export const RPC_PAGAR_SERVICIO = "pagar_servicio_de_orden";

export type PapelDelServicio = "factura" | "boleta" | "recibo_por_honorarios" | "sin_comprobante";

export const PAPELES_DEL_SERVICIO: readonly { valor: PapelDelServicio; texto: string }[] = [
  { valor: "factura", texto: "Factura" },
  { valor: "boleta", texto: "Boleta" },
  { valor: "recibo_por_honorarios", texto: "Recibo por honorarios" },
  { valor: "sin_comprobante", texto: "Sin papel" },
];

const IGV_PORCENTAJE = 18;

/** Lo que se paga de verdad: en una factura, el monto sin IGV más su IGV. */
export function totalDelPago(monto: number, papel: PapelDelServicio): { igv: number; total: number } {
  const igv = papel === "factura" ? redondear2((monto * IGV_PORCENTAJE) / 100) : 0;
  return { igv, total: redondear2(monto + igv) };
}

export type PagoDeServicio = {
  monto: number;
  /** Lo que se le debe hoy, sin IGV. */
  falta: number;
  papel: PapelDelServicio;
  serie: string;
  numero: string;
  emision: string;
  hoy: string;
  yaPagado: boolean;
  vence: string;
  medios: readonly { metodo: MetodoPago; monto: number; referencia?: string; cuenta_id?: string }[];
};

export type CampoDelPago = "monto" | "papel" | "pago";
export type ProblemaDelPago = { campo: CampoDelPago; texto: string };

/** Lo que falta para poder guardar, en el orden de la hoja. */
export function problemasDelPago(p: PagoDeServicio): ProblemaDelPago[] {
  const r: ProblemaDelPago[] = [];
  if (!Number.isFinite(p.monto) || p.monto <= 0) r.push({ campo: "monto", texto: "Escribe cuánto vas a pagar, sin IGV." });
  else if (p.monto > p.falta) r.push({ campo: "monto", texto: "Es más de lo que se le debe." });
  if (p.papel !== "sin_comprobante" && (p.serie.trim() === "" || p.numero.trim() === "")) r.push({ campo: "papel", texto: "Escribe la serie y el número del papel." });
  if (p.emision > p.hoy) r.push({ campo: "papel", texto: "La fecha no puede ser futura." });
  if (p.yaPagado) {
    const suma = redondear2(p.medios.reduce((s, m) => s + m.monto, 0));
    if (p.medios.length === 0 || suma !== totalDelPago(p.monto, p.papel).total) r.push({ campo: "pago", texto: "Los medios de pago tienen que sumar justo el total." });
  } else if (p.vence.trim() === "" || p.vence < p.emision) {
    r.push({ campo: "pago", texto: p.vence.trim() === "" ? "Escribe cuándo vence." : "El vencimiento no puede ser anterior a la fecha del papel." });
  }
  return r;
}

export function camposDelPago(faltan: readonly CampoDelPago[], responsableListo: boolean): CampoDeGuia[] {
  return [
    { id: "monto", nombre: "Cuánto", requerido: true, hecho: !faltan.includes("monto"), pendiente: "Escribe cuánto vas a pagar." },
    { id: "papel", nombre: "El papel", requerido: true, hecho: !faltan.includes("papel"), pendiente: "Di qué papel te dio." },
    { id: "pago", nombre: "Cómo se paga", requerido: true, hecho: !faltan.includes("pago"), pendiente: "Di si ya lo pagaste o cuándo vence." },
    { id: "responsable", nombre: "Responsable", requerido: true, hecho: responsableListo, pendiente: "Elige quién lo registra." },
  ];
}

/** Lo que se le manda a `pagar_servicio_de_orden`. Sin papel, la serie y el número los pone la base. */
export function argsDelPago(p: PagoDeServicio, ids: { faseId: string; token: string }) {
  const conPapel = p.papel !== "sin_comprobante";
  return {
    p_fase_id: ids.faseId,
    p_monto: p.monto,
    p_tipo: p.papel,
    p_serie: conPapel ? p.serie.trim() : undefined,
    p_numero: conPapel ? p.numero.trim() : undefined,
    p_fecha_emision: p.emision,
    p_condicion: p.yaPagado ? "contado" : "credito",
    p_fecha_vencimiento: p.yaPagado ? undefined : p.vence,
    p_igv_porcentaje: IGV_PORCENTAJE,
    p_pago: p.yaPagado ? p.medios : undefined,
    p_token: ids.token,
  };
}
