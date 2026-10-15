// Cobrar dentro del pedido web (ADR-0408, actividad 9; maqueta docs/maquetas/tienda-online-2026-10, «Registrar un pago»): la parte
// pura de las hojas «Registrar pago» y «Anular un pago», sin React ni red, para probarla sola.
//
// CONTRATO
//   PROMETE: leer y validar lo que la persona escribe con las MISMAS reglas que `registrar_pago_pedido_web` (más de S/ 0 y hasta dos
//            decimales, nunca más de lo que falta; un pago digital con su n.º de operación de 6 a 12 dígitos; el efectivo sin n.º y
//            con la caja de la tienda abierta), aceptando el monto como lo escribe una persona («12,50», «S/ 12.50»); decir qué monto
//            viene puesto (lo que falta, o nada si es el adelanto de una prenda por conseguir: cuánto lo decide la tienda); cómo se
//            lee cada pago (y si se puede anular); y llevar cada error de la base al campo que lo causó.
//   ASUME:   que la base manda (permisos, caja, el n.º que no se repite, el total): esto es para no ofrecer lo que la base rechazaría y
//            para decirlo en palabras de tienda. Que un pedido se cobra solo «confirmado» y un pago se anula en uno confirmado o anulado.
//            Con el pago que COMPLETA el total nace la venta del pedido con su boleta (actividad 10), que va en la caja del día de su
//            tienda: ese pago pide la caja abierta aunque sea por Yape (la base lo dice antes de anotar nada).
//   NO HACE: emitir la boleta (la emite la base en la misma transacción; la pantalla solo la manda a SUNAT por el camino de Vender),
//            ni cobrar con una pasarela (sus pagos solo se leen).

import { leerMonto, soles } from "./precio-sede-reglas";
import { haceCuanto } from "./vender-hoy-reglas";
import type { EstadoPedidoWeb, PagoDeLista, PedidoDetalle, TonoEstado } from "./pedidos-web-reglas";

// ---------------------------------------------------------------------------------------------------------------------------
// Registrar un pago
// ---------------------------------------------------------------------------------------------------------------------------

/** Los medios que anota la tienda (los que acepta `registrar_pago_pedido_web`). La tarjeta llega solo por una pasarela. */
export type MedioPagoWeb = "yape" | "plin" | "transferencia" | "efectivo";
export const MEDIOS_PAGO_WEB: readonly { clave: MedioPagoWeb; etiqueta: string; corta?: string }[] = [
  { clave: "yape", etiqueta: "Yape" },
  { clave: "plin", etiqueta: "Plin" },
  // En una ficha de celular «Transferencia» no cabe acostada: «Transf.», como en el cobro de Vender.
  { clave: "transferencia", etiqueta: "Transferencia", corta: "Transf." },
  { clave: "efectivo", etiqueta: "Efectivo" },
];

/** Yape, Plin y transferencia llevan su n.º de operación (propuesta a); el efectivo, no. */
export const esDigital = (medio: MedioPagoWeb | null): boolean => medio !== null && medio !== "efectivo";

/** El tope de dígitos del n.º de operación (el de la base: de 6 a 12). */
export const MAX_DIGITOS_OPERACION = 12;

/** El n.º de operación como se guarda: solo dígitos (al copiarlo de la app vienen espacios o guiones), hasta 12. */
export function limpiarOperacion(texto: string): string {
  return texto.replace(/\D/g, "").slice(0, MAX_DIGITOS_OPERACION);
}

/** Lo que se escribe en la hoja. `monto` es texto: se lee recién al validar («12,50» vale). */
export type FormPago = { monto: string; medio: MedioPagoWeb | null; operacion: string };

/** Lo que le falta al monto, o null si está bien. La misma regla de la base: más de S/ 0, dos decimales y no más de lo que falta. */
export function problemaDelMonto(texto: string, falta: number): string | null {
  if (texto.trim() === "") return "Escribe el monto.";
  const monto = leerMonto(texto);
  if (monto === null) return "Escribe el monto: más de S/ 0, con hasta dos decimales.";
  if (monto > falta + 0.001) return `Es más de lo que falta (${soles(falta)}).`;
  return null;
}

/** Lo que le falta al medio. El efectivo entra a la caja de la tienda: sin caja abierta no se cobra. `cajaAbierta` null = no se sabe
 *  (no se bloquea: decide la base). */
export function problemaDelMedio(medio: MedioPagoWeb | null, cajaAbierta: boolean | null, tienda: string): string | null {
  if (!medio) return "Elige cómo pagó.";
  if (medio === "efectivo" && cajaAbierta === false) return `No hay una caja abierta en ${tienda}: ábrela en Caja o elige otro medio.`;
  return null;
}

/** Lo que le falta al n.º de operación (solo un pago digital lo lleva). */
export function problemaDeOperacion(medio: MedioPagoWeb | null, operacion: string): string | null {
  if (!esDigital(medio)) return null;
  if (operacion === "") return "Escribe el n.º de operación que sale en la app o en el banco.";
  if (!/^\d{6,12}$/.test(operacion)) return "El n.º de operación tiene de 6 a 12 dígitos.";
  return null;
}

/** ¿Con este monto el pedido queda pagado completo? (Ahí nace su venta con su boleta, actividad 10.) */
export function completaElPedido(texto: string, falta: number): boolean {
  const monto = leerMonto(texto);
  return monto !== null && falta > 0 && Math.abs(monto - falta) < 0.005;
}

/** El pago que completa el total hace nacer la venta con su boleta, que va en la caja del día de la tienda del pedido: sin caja
 *  abierta no se registra, ni por Yape (la misma regla de `registrar_pago_pedido_web`). `cajaAbierta` null = no se sabe: decide la base. */
export function problemaDeCaja(f: Pick<FormPago, "monto">, falta: number, cajaAbierta: boolean | null, tienda: string): string | null {
  if (cajaAbierta !== false || !completaElPedido(f.monto, falta)) return null;
  return `Con este pago queda pagado completo y sale su boleta, que va en la caja del día: abre la caja de ${tienda}.`;
}

/** El primer reparo para registrar el pago (en el orden de la hoja), o null si se puede. Es lo que apaga el botón. */
export function problemaDelPago(f: FormPago, falta: number, cajaAbierta: boolean | null, tienda: string): string | null {
  return (
    problemaDelMonto(f.monto, falta) ??
    problemaDelMedio(f.medio, cajaAbierta, tienda) ??
    problemaDeOperacion(f.medio, f.operacion) ??
    problemaDeCaja(f, falta, cajaAbierta, tienda)
  );
}

/** Lo que se manda a `registrar_pago_pedido_web` (sin la marca: la pone `useIntento`). null si todavía no se puede. */
export function pagoParaLaBase(
  pedidoId: string,
  f: FormPago,
  falta: number,
  cajaAbierta: boolean | null,
  tienda: string,
): { p_pedido_id: string; p_monto: number; p_medio: MedioPagoWeb; p_numero_operacion: string | null } | null {
  if (problemaDelPago(f, falta, cajaAbierta, tienda) !== null || !f.medio) return null;
  const monto = leerMonto(f.monto);
  if (monto === null) return null;
  return { p_pedido_id: pedidoId, p_monto: monto, p_medio: f.medio, p_numero_operacion: esDigital(f.medio) ? f.operacion : null };
}

/** ¿Este pago es el adelanto de un pedido que espera una prenda? (algo por conseguir o en camino, y todavía sin pagar nada). Cuánto,
 *  lo decide la tienda (Felipe, maqueta v4): por eso el monto no viene puesto. */
export function esAdelanto(p: Pick<PedidoDetalle, "lineas" | "pagado">): boolean {
  return p.pagado === 0 && p.lineas.some((l) => l.estado === "por_conseguir");
}

/** El monto que viene puesto al abrir: lo que falta, o vacío si es un adelanto. */
export function montoDeFabrica(p: Pick<PedidoDetalle, "lineas" | "pagado" | "falta">): string {
  return esAdelanto(p) ? "" : p.falta.toFixed(2);
}

/** La frase bajo el monto cuando está bien. */
export function ayudaDelMonto(p: Pick<PedidoDetalle, "lineas" | "pagado">): string {
  return esAdelanto(p) ? "Adelanto: tú decides cuánto. El resto se cobra al recoger." : "Puede ser una parte: el resto se registra después.";
}

/** Lo que queda después de este pago, para el pie: «Queda pagado completo.» / «Después faltan S/ 30.00.». null sin un monto válido. */
export function despuesDelPago(falta: number, texto: string): string | null {
  const monto = leerMonto(texto);
  if (monto === null || monto > falta + 0.001) return null;
  const queda = Math.round((falta - monto) * 100) / 100;
  return queda <= 0 ? "Con este pago queda pagado completo y sale su boleta." : `Después de este pago faltan ${soles(queda)}.`;
}

/** Lo que dice el aviso de éxito al registrar. `respuesta`: lo que devolvió la base (`falta`, `estado_pedido` y, pagado completo, la
 *  `boleta` que nació con él). */
export function avisoTrasPagar(
  monto: number,
  medio: MedioPagoWeb,
  respuesta: { falta?: unknown; estado_pedido?: unknown; boleta?: unknown } | null,
): { titulo: string; detalle: string } {
  const falta = Number(respuesta?.falta);
  const pagado = respuesta?.estado_pedido === "pagado" || (Number.isFinite(falta) && falta <= 0);
  const enCaja = medio === "efectivo" ? " Entró a la caja." : "";
  const boleta = typeof respuesta?.boleta === "string" && respuesta.boleta.trim() !== "" ? ` Salió su boleta ${respuesta.boleta}.` : "";
  return {
    titulo: `Pago de ${soles(monto)} registrado`,
    detalle: pagado
      ? `El pedido quedó pagado completo.${boleta}${enCaja}`
      : `${Number.isFinite(falta) ? `Faltan ${soles(falta)}.` : "Todavía falta una parte."}${enCaja}`,
  };
}

/** La venta del pedido que acaba de quedar pagado completo (para mandar su boleta a SUNAT por el camino de Vender), o null. */
export function ventaDelPago(respuesta: { estado_pedido?: unknown; venta_id?: unknown } | null): string | null {
  return respuesta?.estado_pedido === "pagado" && typeof respuesta.venta_id === "string" && respuesta.venta_id !== "" ? respuesta.venta_id : null;
}

/** El pago dejó el pedido pagado completo pero la respuesta no trae su venta: pasa al revisar un pago en duda («Revisar si se
 *  guardó» devuelve el pago, no la venta). Hay que leerla para mandar la boleta ya; si no, igual saldría con la cola en unos minutos. */
export function faltaLeerLaVenta(respuesta: { estado_pedido?: unknown; venta_id?: unknown } | null): boolean {
  return respuesta?.estado_pedido === "pagado" && ventaDelPago(respuesta) === null;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Anular un pago
// ---------------------------------------------------------------------------------------------------------------------------

export type MotivoAnularPago = "devuelto_al_cliente" | "error_al_anotar";
export const MOTIVOS_ANULAR_PAGO: readonly { clave: MotivoAnularPago; etiqueta: string }[] = [
  { clave: "devuelto_al_cliente", etiqueta: "Se le devolvió" },
  { clave: "error_al_anotar", etiqueta: "Se anotó por error" },
];

/** ¿Se puede anular (o devolver) este pago desde la hoja? Uno que anotó la tienda, vivo, de un pedido confirmado o anulado. El de un
 *  pedido pagado completo ya no (su boleta sale en ese momento: devolverlo es una nota de crédito, actividad 10); el de una pasarela
 *  se devuelve desde la pasarela. */
export function sePuedeAnular(g: Pick<PagoDeLista, "origen" | "estado">, estadoPedido: EstadoPedidoWeb): boolean {
  return g.origen === "tienda" && g.estado === "aprobado" && (estadoPedido === "confirmado" || estadoPedido === "anulado");
}

/** El reparo para anular, o null si se puede: el motivo, y si es efectivo, la caja abierta (de ella sale la plata). */
export function problemaParaAnular(g: Pick<PagoDeLista, "medio">, motivo: MotivoAnularPago | null, cajaAbierta: boolean | null, tienda: string): string | null {
  if (!motivo) return "Elige por qué se anula.";
  if (g.medio === "efectivo" && cajaAbierta === false) return `No hay una caja abierta en ${tienda}: el efectivo sale de la caja de hoy.`;
  return null;
}

/** Qué pasa con la plata al anular, para el aviso de la hoja. El efectivo sale de la caja abierta del día en que se devuelve, no de la
 *  que lo recibió (decisión de Felipe, ADR-0408 act. c). */
export function efectoDeAnular(g: Pick<PagoDeLista, "medio" | "monto">, motivo: MotivoAnularPago | null, tienda: string): string {
  if (g.medio === "efectivo")
    return `Salen ${soles(g.monto)} de la caja abierta de ${tienda}, la de hoy (aunque se haya cobrado otro día). Si esa caja no tiene ese efectivo, no se puede.`;
  if (motivo === "error_al_anotar") return "No mueve la caja: solo deja de contar como pagado.";
  const como = g.medio === "transferencia" ? "por transferencia" : `por ${nombreDelMedio(g.medio)} o por transferencia`;
  return `No mueve la caja: devuélveselo ${como} y avísale por WhatsApp.`;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Cómo se lee un pago
// ---------------------------------------------------------------------------------------------------------------------------

const NOMBRES: Record<string, string> = { yape: "Yape", plin: "Plin", transferencia: "Transferencia", efectivo: "Efectivo", tarjeta: "Tarjeta" };

export const nombreDelMedio = (medio: string): string => NOMBRES[medio] ?? medio;

/** «S/ 50.00 · Yape · op. 04812793». */
export function textoDelPago(g: Pick<PagoDeLista, "monto" | "medio" | "numeroOperacion">): string {
  return [soles(g.monto), nombreDelMedio(g.medio), g.numeroOperacion ? `op. ${g.numeroOperacion}` : null].filter(Boolean).join(" · ");
}

const MOTIVO_TEXTO: Record<string, string> = {
  devuelto_al_cliente: "se le devolvió al cliente",
  error_al_anotar: "se anotó por error",
  reembolso_pasarela: "la pasarela lo devolvió",
};

/** La línea de abajo de un pago: cuándo, quién y, si es efectivo, a qué caja entró; anulado, cuándo, quién y por qué. */
export function detalleDelPago(
  g: Pick<PagoDeLista, "registradoEn" | "registradoPor" | "medio" | "enCaja" | "estado" | "anuladoEn" | "anuladoPor" | "anuladoMotivo" | "observacion" | "origen">,
  ahora: number,
  tienda: string,
): string {
  if (g.estado === "anulado") {
    return [
      g.anuladoEn ? `Anulado ${haceCuanto(g.anuladoEn, ahora)}` : "Anulado",
      g.anuladoPor ? `por ${g.anuladoPor}` : null,
      g.anuladoMotivo ? MOTIVO_TEXTO[g.anuladoMotivo] ?? null : null,
      g.medio === "efectivo" ? `salió de la caja de ${tienda}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
  }
  if (g.origen === "pasarela" && g.observacion) return g.observacion;
  return [
    g.registradoEn ? haceCuanto(g.registradoEn, ahora) : null,
    g.registradoPor ? `por ${g.registradoPor}` : null,
    g.origen === "pasarela" ? "por la pasarela" : null,
    g.medio === "efectivo" && g.enCaja ? `entró a la caja de ${tienda}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** La insignia de un pago, si dice algo (uno aprobado de un pedido vivo no lleva: es lo normal). */
export function estadoDelPago(g: Pick<PagoDeLista, "estado">, estadoPedido: EstadoPedidoWeb): { texto: string; tono: TonoEstado } | null {
  if (g.estado === "anulado") return { texto: "Anulado", tono: "apagado" };
  if (g.estado === "por_revisar") return { texto: "Por revisar", tono: "ambar" };
  if (g.estado === "pendiente") return { texto: "Pendiente", tono: "pizarra" };
  if (g.estado === "rechazado") return { texto: "Rechazado", tono: "apagado" };
  if (estadoPedido === "anulado") return { texto: "Por devolver", tono: "rojo" };
  return null;
}

/** Lo que la tienda todavía tiene del cliente en un pedido anulado (se le devuelve anulando cada pago). */
export function porDevolver(p: Pick<PedidoDetalle, "estado" | "pagado">): number {
  return p.estado === "anulado" ? p.pagado : 0;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Errores de la base, en el campo que los causó
// ---------------------------------------------------------------------------------------------------------------------------

export type CampoDelPago = "monto" | "medio" | "operacion";

/**
 * Lo que dijo la base al registrar o anular un pago. `campo`: dónde se dice (bajo ese campo); sin campo, va en el aviso de la hoja.
 * `releer`: el pedido cambió mientras la hoja estaba abierta (otra caja lo cobró completo, lo anularon, ya estaba anulado): la hoja se
 * cierra y el pedido se vuelve a leer. Los mensajes de la base ya están en palabras de tienda: se usan tal cual.
 */
export function errorDelPago(
  error: { message?: string; hint?: string | null; code?: string | null } | null | undefined,
): { campo: CampoDelPago | null; titulo: string; detalle: string; releer: boolean } | null {
  if (!error) return null;
  const hint = error.hint ?? "";
  const detalle = (error.message ?? "").trim();
  const campos: Record<string, CampoDelPago> = {
    pedido_web_monto: "monto",
    pedido_web_pasa_el_total: "monto",
    pedido_web_medio: "medio",
    pedido_web_sin_caja: "medio",
    pedido_web_operacion: "operacion",
    pedido_web_operacion_repetida: "operacion",
  };
  if (hint in campos) return { campo: campos[hint]!, titulo: "Revisa este dato", detalle, releer: false };
  if (hint === "efectivo_insuficiente") return { campo: null, titulo: "No hay tanto efectivo en la caja", detalle, releer: false };
  const releen: Record<string, string> = {
    pedido_web_no_cobrable: "El pedido ya cambió",
    pedido_web_pagado: "El pedido ya está pagado completo",
    pedido_web_estado: "Ese pago ya estaba anulado",
  };
  if (hint in releen) return { campo: null, titulo: releen[hint]!, detalle, releer: true };
  if (hint === "pedido_web_motivo") return { campo: null, titulo: "Elige por qué se anula", detalle, releer: false };
  if (hint === "pedido_web_pago_pasarela") return { campo: null, titulo: "Se devuelve desde la pasarela", detalle, releer: false };
  return null;
}
