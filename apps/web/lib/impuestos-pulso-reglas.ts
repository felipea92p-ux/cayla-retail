// Impuestos en camino A («La respuesta», Felipe 2026-10-15): arriba de las cifras, «¿cuánto le debo a SUNAT?» con la cifra
// grande, la cuenta que la explica (cobrado − descontado − saldo a favor = IGV; + renta a cuenta = total). Lo que falta
// hacer antes de declarar vive en `impuestos-antes-reglas.ts` (una sola lista). Lógica pura sobre lo que `fn_impuestos_panel` ya trae; no repite ninguna regla tributaria.

import { soles } from "./flujo-caja-reglas";
import { nombreMes, sumarMeses, type PanelImpuestos } from "./impuestos-reglas";

const r2 = (n: number) => Math.round(n * 100) / 100;
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export type TramoImpuesto = { clave: string; nombre: string; monto: number; tipo: "entra" | "sale" | "queda" | "suma"; detalle?: string };

export type PulsoImpuestos =
  | {
      estado: "a_pagar" | "a_favor";
      mes: string;
      /** Lo que se paga: el IGV del mes más el pago a cuenta de renta, si se conoce. */
      total: number;
      igv: number;
      aFavor: number;
      renta: number | null;
      /** «le pagas» · «te queda a favor». */
      verbo: string;
      frase: string;
      deCada: string;
      cuenta: TramoImpuesto[];
    }
  | { estado: "sin_mes"; mes: string; frase: string };

export function pulsoImpuestos(p: PanelImpuestos): PulsoImpuestos {
  const mes = nombreMes(p.mes);
  const siguiente = nombreMes(sumarMeses(p.mes, 1));
  const f = p.foco;
  if (!f) return { estado: "sin_mes", mes: p.mes, frase: `Todavía no hay comprobantes de ${mes}.` };
  const tasa = p.parametros.igv ? Math.round(p.parametros.igv.valor * 100) : 18;
  const renta = p.renta.monto !== null ? r2(p.renta.monto) : null;
  const igv = r2(f.aPagar);
  const aFavor = r2(f.saldoAFavor);
  const total = r2(igv + (renta ?? 0));
  // Un mes sin ventas ni compras con factura (ni saldo que arrastre) no queda «a favor S/ 0»: no hay nada que contar.
  if (igv === 0 && aFavor === 0 && f.debito === 0 && f.credito === 0)
    return { estado: "sin_mes", mes: p.mes, frase: `En ${mes} no hubo ventas ni compras con factura en el sistema: no hay IGV que pagar ni saldo a favor.` };
  const estado = igv > 0 ? "a_pagar" : "a_favor";
  const cuenta: TramoImpuesto[] = [
    { clave: "cobrado", nombre: "IGV que cobraste al vender", monto: r2(f.debito), tipo: "entra", detalle: `${plural(f.comprobantes, "comprobante", "comprobantes")} de ${mes}.` },
    { clave: "descontado", nombre: "IGV que descuentas por tus compras con factura", monto: r2(f.credito), tipo: "sale" },
  ];
  if (f.saldoAnterior > 0) cuenta.push({ clave: "anterior", nombre: "Saldo a favor que traías", monto: r2(f.saldoAnterior), tipo: "sale" });
  cuenta.push(
    estado === "a_pagar"
      ? { clave: "igv", nombre: "IGV a pagar", monto: igv, tipo: "queda" }
      : { clave: "igv", nombre: "Te queda a favor", monto: aFavor, tipo: "queda", detalle: "Se descuenta del IGV del mes que viene." }
  );
  if (renta !== null) {
    cuenta.push({ clave: "renta", nombre: `Pago a cuenta de renta (${p.renta.tasa !== null ? `${Math.round(p.renta.tasa * 1000) / 10} %` : "el porcentaje del régimen"} de lo vendido sin IGV)`, monto: renta, tipo: "suma" });
    // Con saldo a favor el IGV no se paga, pero la renta sí: la cuenta cierra igual, con lo que de verdad sale.
    cuenta.push({ clave: "total", nombre: estado === "a_pagar" ? "Total a SUNAT" : "Pagas a SUNAT (solo la renta)", monto: total, tipo: "queda" });
  }
  const frase =
    estado === "a_pagar"
      ? `Por lo que vendiste en ${mes}, en ${siguiente} le pagas a SUNAT ${soles(total)}${renta !== null ? ` (${soles(igv)} de IGV y ${soles(renta)} de renta a cuenta)` : ""}. El día exacto depende del último dígito de tu RUC.`
      : `${mes.charAt(0).toUpperCase()}${mes.slice(1)} te dejó ${soles(aFavor)} de IGV a favor: no pagas IGV y ese saldo se descuenta el mes que viene.${renta !== null && renta > 0 ? ` La renta a cuenta sí se paga: ${soles(renta)}.` : ""}`;
  return {
    estado, mes: p.mes, total, igv, aFavor, renta,
    verbo: estado === "a_pagar" ? "le pagas" : "te queda a favor",
    frase,
    deCada: `De cada S/ ${100 + tasa} que cobras, S/ ${tasa} son de SUNAT; te devuelven el IGV que pagaste en tus compras con factura.`,
    cuenta,
  };
}
