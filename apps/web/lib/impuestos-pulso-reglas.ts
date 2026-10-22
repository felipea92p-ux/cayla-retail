// Impuestos en camino A («La respuesta», Felipe 2026-10-15): arriba de las cifras, «¿cuánto le debo a SUNAT?» con la cifra
// grande, la cuenta que la explica (cobrado − descontado − saldo a favor = IGV; + renta a cuenta = total) y lo que falta
// hacer antes de declarar. Lógica pura sobre lo que `fn_impuestos_panel` ya trae; no repite ninguna regla tributaria.

import { soles } from "./flujo-caja-reglas";
import { avisoUmbral, nombreMes, sumarMeses, type PanelImpuestos } from "./impuestos-reglas";

const r2 = (n: number) => Math.round(n * 100) / 100;
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export type TramoImpuesto = { clave: string; nombre: string; monto: number; tipo: "entra" | "sale" | "queda" | "suma"; detalle?: string };
export type PorHacer = { clave: string; texto: string; href: string | null };

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
      porHacer: PorHacer[];
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
    if (estado === "a_pagar") cuenta.push({ clave: "total", nombre: "Total a SUNAT", monto: total, tipo: "queda" });
  }
  const porHacer: PorHacer[] = [];
  const r = p.revisar;
  if (r.sinAceptar.n > 0) porHacer.push({ clave: "sin_aceptar", texto: `${plural(r.sinAceptar.n, "comprobante que SUNAT todavía no aceptó", "comprobantes que SUNAT todavía no aceptó")} (${soles(r.sinAceptar.total)}).`, href: "/ventas/comprobantes" });
  if (r.rechazados.n > 0) porHacer.push({ clave: "rechazados", texto: `${plural(r.rechazados.n, "comprobante rechazado", "comprobantes rechazados")} por SUNAT (${soles(r.rechazados.total)}): hay que volver a emitirlos.`, href: "/ventas/comprobantes" });
  if (r.sinComprobante.n > 0) porHacer.push({ clave: "sin_comprobante", texto: `${plural(r.sinComprobante.n, "venta sin comprobante", "ventas sin comprobante")} (${soles(r.sinComprobante.total)}).`, href: "/ventas/comprobantes" });
  if (r.boletas.n > 0) porHacer.push({ clave: "boletas", texto: `${plural(r.boletas.n, "compra con boleta", "compras con boleta")} (${soles(r.boletas.total)}): ese IGV no se descuenta. Pide factura a ${r.boletas.proveedores.slice(0, 2).join(" y ") || "esos proveedores"}.`, href: "/finanzas/gastos" });
  if (r.igvPerdido.n > 0) porHacer.push({ clave: "igv_perdido", texto: `${plural(r.igvPerdido.n, "factura de S/\u00a02,000 o más pagada en efectivo", "facturas de S/\u00a02,000 o más pagadas en efectivo")}: se perdieron ${soles(r.igvPerdido.igv)} de IGV. Paga por el banco.`, href: "/finanzas/gastos" });
  // La alerta anticipada del límite (250 UIT, parámetro): va con lo que hay que hacer antes de declarar, porque cambia el pago a cuenta de renta de lo que viene. Dice qué cuenta
  // (lo registrado en el sistema) y que puede quedar por debajo de la cifra real; nada la deja en pendiente de cargar.
  const av = avisoUmbral(p);
  if ((av.nivel === "aviso" || av.nivel === "cruzado") && av.titulo) porHacer.push({ clave: "aviso_umbral", texto: [av.titulo, av.detalle, av.alcance].filter(Boolean).join(" "), href: null });
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
    porHacer,
  };
}
