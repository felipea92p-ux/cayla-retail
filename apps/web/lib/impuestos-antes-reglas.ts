// Finanzas ▸ Impuestos: «Antes de declarar», UNA sola lista (El telar, Felipe 2026-10-23). Hasta hoy la pantalla tenía dos que
// decían lo mismo con textos, enlaces y botones distintos («Antes de declarar» del pulso y «Para revisar antes de declarar»).
// Lo que puede hacer que pagues de más o que SUNAT te observe, del mes que se mira, lo que frena primero.
// Cada cosa tiene la forma de un pendiente de «Te toca» (contrato de la barra común, docs/maquetas/finanzas-telar-2026-10/),
// para que la barra la lea tal cual cuando exista. Lógica pura sobre lo que `fn_impuestos_panel` ya trae.

import { avisoUmbral, nombreMes, type PanelImpuestos } from "./impuestos-reglas";
import { solesRedondo } from "./gastos-reglas";

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Un pendiente de Impuestos, con la forma de «Te toca». `href` nulo: no hay a dónde ir (se conversa con el contador). */
export type PendienteImpuesto = {
  modulo: "impuestos";
  id: string;
  /** «frena»: SUNAT lo rechazó y hay que volver a emitirlo; «avisa»: puede hacer que pagues de más o que SUNAT te observe. */
  estado: "frena" | "avisa";
  titulo: string;
  detalle: string;
  verbo: string | null;
  href: string | null;
};

const COMPROBANTES = "/vender/comprobantes";

/** Una línea de la lista compacta de Impuestos (versión «E · B++», ADR-0573): lo que falta, con su monto. El detalle va al pasar el mouse. */
export type LineaPendiente = {
  id: string;
  /** «rojo» frena, «ambar» avisa, «gris» informa. */
  tono: "rojo" | "ambar" | "gris";
  texto: string;
  monto: number;
  detalle: string;
  /** Dónde se arregla; null: se conversa con el contador. */
  href: string | null;
};

/** Lo que hay que ver antes de declarar, en una línea por tema y con su monto. Mismas cuentas de `antesDeDeclarar`, con menos palabras; el aviso de las 250 UIT va en la tarjeta del límite, no aquí. */
export function pendientesCompactos(p: PanelImpuestos): LineaPendiente[] {
  const r = p.revisar;
  const gastos = `/finanzas/gastos?mes=${p.mes}&ver=todas`;
  const lista: LineaPendiente[] = [];
  if (r.rechazados.n > 0)
    lista.push({ id: "rechazados", tono: "rojo", texto: `${plural(r.rechazados.n, "rechazado", "rechazados")} por SUNAT`, monto: r.rechazados.total, detalle: "No entran al IGV hasta volver a emitirlos.", href: COMPROBANTES });
  if (r.sinAceptar.n > 0)
    lista.push({ id: "sin_aceptar", tono: "ambar", texto: `${plural(r.sinAceptar.n, "venta", "ventas")} sin aceptar`, monto: r.sinAceptar.total, detalle: "Se reintentan solos; si siguen así, revísalos.", href: COMPROBANTES });
  if (r.sinComprobante.n > 0)
    lista.push({ id: "sin_comprobante", tono: "ambar", texto: `${plural(r.sinComprobante.n, "venta", "ventas")} sin comprobante`, monto: r.sinComprobante.total, detalle: "Su IGV no está en esta cuenta: díselo al contador.", href: COMPROBANTES });
  if (r.boletas.n > 0)
    lista.push({ id: "boletas", tono: "ambar", texto: `${plural(r.boletas.n, "compra", "compras")} con boleta`, monto: r.boletas.total, detalle: "Una boleta no da IGV: pide factura.", href: r.boletas.gastos > 0 ? gastos : null });
  if (r.igvPerdido.n > 0)
    lista.push({ id: "igv_perdido", tono: "rojo", texto: "IGV que no se descuenta", monto: r.igvPerdido.igv, detalle: "Facturas de S/ 2,000 o más pagadas en efectivo o desde un fondo.", href: gastos });
  if (r.honorarios.n > 0)
    lista.push({ id: "honorarios", tono: "gris", texto: plural(r.honorarios.n, "recibo de honorarios", "recibos de honorarios"), monto: r.honorarios.total, detalle: "Retención de 8 %: lo confirma el contador.", href: null });
  return lista;
}

export function antesDeDeclarar(p: PanelImpuestos): PendienteImpuesto[] {
  const r = p.revisar;
  const mes = nombreMes(p.mes);
  const gastos = `/finanzas/gastos?mes=${p.mes}&ver=todas`;
  const lista: PendienteImpuesto[] = [];
  const pon = (x: Omit<PendienteImpuesto, "modulo">) => lista.push({ modulo: "impuestos", ...x });

  if (r.rechazados.n > 0)
    pon({
      id: "rechazados",
      estado: "frena",
      titulo: `${plural(r.rechazados.n, "comprobante rechazado", "comprobantes rechazados")} por SUNAT`,
      detalle: `Suman ${solesRedondo(r.rechazados.total)} y no entran al IGV hasta que se vuelvan a emitir.`,
      verbo: "Ver en Comprobantes",
      href: COMPROBANTES,
    });
  if (r.sinAceptar.n > 0)
    pon({
      id: "sin_aceptar",
      estado: "avisa",
      titulo: `${plural(r.sinAceptar.n, "venta", "ventas")} de ${mes} sin comprobante aceptado (${solesRedondo(r.sinAceptar.total)})`,
      detalle: "El IGV se reconoce al vender, pero SUNAT debe tenerlos. Se reintentan solos; si siguen así, revísalos.",
      verbo: "Ver en Comprobantes",
      href: COMPROBANTES,
    });
  if (r.sinComprobante.n > 0)
    pon({
      id: "sin_comprobante",
      estado: "avisa",
      titulo: `${plural(r.sinComprobante.n, "venta", "ventas")} sin boleta ni factura (${solesRedondo(r.sinComprobante.total)})`,
      detalle: `Notas de venta o ventas sin comprobante${r.sinComprobante.alegra ? `; ${r.sinComprobante.alegra} las emitió Alegra` : ""}. Su IGV no está en esta cuenta: díselo al contador.`,
      verbo: "Ver en Comprobantes",
      href: COMPROBANTES,
    });
  if (r.boletas.n > 0)
    pon({
      id: "boletas",
      estado: "avisa",
      titulo: `${plural(r.boletas.n, "compra", "compras")} con boleta (${solesRedondo(r.boletas.total)})`,
      detalle: `Una boleta no deja descontar IGV. Si el proveedor emite factura, pídela${r.boletas.proveedores.length ? `: ${r.boletas.proveedores.slice(0, 2).join(" y ")}` : ""}.`,
      verbo: r.boletas.gastos > 0 ? "Ver gastos" : null,
      href: r.boletas.gastos > 0 ? gastos : null,
    });
  if (r.igvPerdido.n > 0)
    pon({
      id: "igv_perdido",
      estado: "avisa",
      titulo: `${solesRedondo(r.igvPerdido.igv)} de IGV que no se descuenta`,
      detalle: `${plural(r.igvPerdido.n, "factura de S/ 2,000 o más pagada", "facturas de S/ 2,000 o más pagadas")} en efectivo o desde un fondo. SUNAT pide pagarlas por el banco: ese IGV ya está restado de tus compras.`,
      verbo: "Ver gastos",
      href: gastos,
    });
  if (r.honorarios.n > 0)
    pon({
      id: "honorarios",
      estado: "avisa",
      titulo: `${plural(r.honorarios.n, "recibo por honorarios", "recibos por honorarios")} este mes`,
      detalle: `${r.honorarios.mayores ? `${plural(r.honorarios.mayores, "es", "son")} de más de S/ 1,500: ` : ""}el contador define si CAYLA debe retener el 8 %. Mientras tanto, se paga el total.`,
      verbo: null,
      href: null,
    });
  // El aviso anticipado del límite (250 UIT, parámetro) cambia el pago a cuenta de lo que viene: va aquí, con lo que se conversa con el contador.
  const av = avisoUmbral(p);
  if ((av.nivel === "aviso" || av.nivel === "cruzado") && av.titulo)
    pon({ id: "aviso_umbral", estado: "avisa", titulo: av.titulo, detalle: [av.detalle, av.alcance].filter(Boolean).join(" "), verbo: null, href: null });

  return lista;
}
