// «Llegó el comprobante» (ADR-0588, `20261031154000_gastos_llego_el_comprobante.sql`): un gasto pagado sin comprobante recibe su boleta, factura o
// recibo por honorarios y queda como si se hubiera registrado con él al contado, sin mover plata. Lo puro de la hoja: cuándo se ofrece, qué falta, qué
// se manda y qué pasa al guardar. La base vuelve a exigir todo (`agregar_comprobante_a_gasto`).
import { validarRuc } from "@cayla-retail/shared";
import { soles } from "./compras-reglas";
import { esDelViaje } from "./gastos-corregir-reglas";
import { igvDeFactura, partirSerieNumero, textoMes, type GastoFila } from "./gastos-reglas";
import type { CampoDeGuia } from "./guia-campos";
import { serieNumeroLegible } from "./hoja-gasto-reglas";
import { UMBRAL_BANCARIZACION } from "./no-deducible-reglas";

export const RPC_AGREGAR_COMPROBANTE = "agregar_comprobante_a_gasto";

export type PapelTardio = "factura" | "boleta" | "recibo_por_honorarios";

export const PAPELES_TARDIOS: readonly { valor: PapelTardio; texto: string }[] = [
  { valor: "factura", texto: "Factura" },
  { valor: "boleta", texto: "Boleta" },
  { valor: "recibo_por_honorarios", texto: "Recibo por honorarios" },
];

const NOMBRE_DEL_PAPEL: Record<PapelTardio, string> = { factura: "factura", boleta: "boleta", recibo_por_honorarios: "recibo por honorarios" };

/** Se ofrece a un gasto vigente que se pagó sin comprobante (no a una planilla de movilidad ni a uno del viaje). El fondo y el mes los dice la base. */
export function puedeRecibirComprobante(g: Pick<GastoFila, "estado" | "compraId" | "comprobanteTipo" | "categoria">): boolean {
  return g.estado === "vigente" && !g.compraId && g.comprobanteTipo === "sin_comprobante" && !esDelViaje(g.categoria);
}

export type BorradorComprobante = {
  tipo: PapelTardio | "";
  ruc: string;
  razonSocial: string;
  serieNumero: string;
  /** La fecha que dice el papel: con ella entra a Impuestos. Arranca en la del gasto. */
  fecha: string;
  /** El IGV que dice el papel (lo trae el QR); sin él, el de la tasa de su fecha, como al registrar. */
  igv: number | null;
};

export function borradorInicial(g: Pick<GastoFila, "fecha">): BorradorComprobante {
  return { tipo: "", ruc: "", razonSocial: "", serieNumero: "", fecha: g.fecha, igv: null };
}

/** El IGV que tendrá el comprobante: solo una factura lo lleva. */
export function igvDelPapel(b: Pick<BorradorComprobante, "tipo" | "igv">, monto: number): number {
  if (b.tipo !== "factura") return 0;
  return b.igv ?? igvDeFactura(monto);
}

/** Lo primero que falta para poder guardar (las mismas reglas que la base), o `null`. */
export function problemaDelComprobante(b: BorradorComprobante, ctx: { proveedorListo: boolean; hoy: string; monto: number }): string | null {
  if (!b.tipo) return "Elige qué comprobante llegó.";
  if (!ctx.proveedorListo) return validarRuc(b.ruc).valido ? "Escribe la razón social." : "Escribe el RUC del comprobante.";
  if (!serieNumeroLegible(b.serieNumero)) return "Escribe la serie y el número, como F001-2231.";
  if (!b.fecha) return "Di la fecha del comprobante.";
  if (b.fecha > ctx.hoy) return "La fecha del comprobante no puede ser futura.";
  const igv = igvDelPapel(b, ctx.monto);
  if (igv < 0 || (b.tipo === "factura" && igv >= ctx.monto)) return "El IGV tiene que estar entre cero y el total.";
  return null;
}

/** La guía de foco (ADR-0284): sale de lo mismo que bloquea guardar (`problemaDelComprobante`). */
export function camposDelComprobante(
  b: BorradorComprobante,
  ctx: { proveedorListo: boolean; hoy: string },
  responsable: { listo: boolean; motivo: string | null },
): CampoDeGuia[] {
  const fechaBien = Boolean(b.fecha) && b.fecha <= ctx.hoy;
  return [
    { id: "tipo", nombre: "Qué llegó", requerido: true, hecho: Boolean(b.tipo), pendiente: "Elige qué comprobante llegó." },
    {
      id: "ruc",
      nombre: "RUC",
      requerido: true,
      hecho: ctx.proveedorListo,
      pendiente: validarRuc(b.ruc).valido ? "Escribe la razón social." : "Escribe el RUC del comprobante.",
    },
    { id: "serie", nombre: "Serie y número", requerido: true, hecho: serieNumeroLegible(b.serieNumero) !== null, pendiente: "Escribe la serie y el número, como F001-2231." },
    { id: "fecha", nombre: "Fecha del comprobante", requerido: true, hecho: fechaBien, pendiente: b.fecha ? "La fecha del comprobante no puede ser futura." : "Di la fecha del comprobante." },
    { id: "responsable", nombre: "Responsable", requerido: true, hecho: responsable.listo, pendiente: responsable.motivo ?? "Elige quién lo agrega." },
  ];
}

export type PayloadComprobanteTardio = {
  p_gasto_id: string;
  p_comprobante: { tipo: PapelTardio; proveedor_id: string; serie: string; numero: string; fecha_emision: string; igv?: number };
};

/** Lo que se manda a `agregar_comprobante_a_gasto`. Solo con el borrador ya sin problemas. */
export function payloadDelComprobante(gastoId: string, b: BorradorComprobante, proveedorId: string): PayloadComprobanteTardio {
  const { serie, numero } = partirSerieNumero(serieNumeroLegible(b.serieNumero) ?? b.serieNumero);
  const tipo = b.tipo as PapelTardio;
  return {
    p_gasto_id: gastoId,
    p_comprobante: {
      tipo,
      proveedor_id: proveedorId,
      serie: serie.trim().toUpperCase(),
      numero: numero.trim(),
      fecha_emision: b.fecha,
      ...(tipo === "factura" && b.igv !== null ? { igv: b.igv } : {}),
    },
  };
}

/** Lo que pasa al guardar, en frases de tienda (para que nadie crea que se paga otra vez). */
export function loQuePasaAlGuardar(g: Pick<GastoFila, "montoTotal" | "medioPago" | "cajaMovimientoId">, b: BorradorComprobante): string[] {
  const papel = b.tipo ? NOMBRE_DEL_PAPEL[b.tipo] : "comprobante";
  const lineas = [`El gasto queda con su ${papel}: deja de contar como «Sin comprobante».`];
  lineas.push(g.cajaMovimientoId ? "La plata ya salió del cajón: no se mueve la caja ni ninguna cuenta." : "La plata ya salió: no se mueve ninguna cuenta.");
  if (b.tipo === "factura") {
    const igv = igvDelPapel(b, g.montoTotal);
    lineas.push(b.fecha ? `Su IGV, ${soles(igv)}, cuenta en Impuestos de ${textoMes(b.fecha.slice(0, 7))}.` : `Su IGV, ${soles(igv)}, cuenta en Impuestos.`);
    if (g.medioPago === "efectivo" && g.montoTotal >= UMBRAL_BANCARIZACION) {
      lineas.push(`Pero se pagó en efectivo y es de ${soles(UMBRAL_BANCARIZACION)} o más: sin banco, su IGV se pierde.`);
    }
  } else if (b.tipo === "boleta") {
    lineas.push("Una boleta no trae IGV que descontar.");
  }
  return lineas;
}
