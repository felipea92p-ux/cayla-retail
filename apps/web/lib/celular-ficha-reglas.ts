// Guardar en la ficha el celular que se escribió para mandarle la boleta (ADR-0288, «Actualización 2026-10-03 (o)», actividad 2).
// Lógica pura, sin React ni red: la usan el Punto de venta (el campo del paso Comprobante y el guardado tras cobrar) y «Venta registrada».
//
// CONTRATO
//   PROMETE: decir CUÁNDO el celular de la boleta se guarda también en la ficha del cliente, qué se le avisa a quien cobra antes de
//            confirmar, y qué se le dice después. Solo se guarda un celular nuevo en una ficha que NO tenía ninguno.
//   ASUME:   quien decide de verdad es la base (`agregar_celular_clienta`: solo agrega, nunca cambia el celular de una ficha ni toca el
//            club). Esta regla solo evita llamar cuando se sabe que no corresponde, y no reemplaza ese candado: una caja que leyó la ficha
//            hace minutos pudo quedar atrás, y la base responde «ya tenía» sin error.
//   NO HACE: no cambia el celular de una ficha que ya tiene uno (ni siquiera uno distinto: cambiarlo le quita la publicidad a una socia),
//            no registra clientes, y no frena nunca el cobro: guardar la ficha es un favor para la próxima compra, no parte de la venta.

import { ajustarCelular, celularValido } from "./club-reglas";

type TipoDelCobro = "boleta" | "factura" | "nota_venta";

export type EntradaCelularFicha = {
  /** El cliente de la venta; `null` = venta sin cliente (no hay ficha donde guardar). */
  clienta: { celular: string | null } | null;
  /** Lo que quedó en el campo del paso Comprobante (solo dígitos; vacío = sin celular). */
  celularBoleta: string;
  tipoComprobante: TipoDelCobro | null;
  /** La cuenta ve el módulo «Clientas» (el mismo permiso que abre la búsqueda): sin él la base rechazaría el guardado. */
  puedeGuardarEnFicha: boolean;
};

const tieneCelular = (celular: string | null | undefined) => ajustarCelular(celular ?? "") !== "";

/** El celular (9 dígitos) que se guardaría en la ficha, o `null` si no corresponde guardar nada. */
export function celularParaLaFicha(e: EntradaCelularFicha): string | null {
  if (!e.clienta || !e.puedeGuardarEnFicha) return null;
  // La nota de venta no tiene PDF que mandar: su campo ni se muestra.
  if (e.tipoComprobante === null || e.tipoComprobante === "nota_venta") return null;
  // Una ficha con celular no se toca, aunque lo escrito sea otro: es el de ESA boleta.
  if (tieneCelular(e.clienta.celular)) return null;
  const celular = ajustarCelular(e.celularBoleta);
  return celularValido(celular) ? celular : null;
}

/** La nota bajo el campo del celular, para que quien cobra sepa qué va a pasar con él; `null` si no hay nada que aclarar. */
export function notaDelCelularDeLaBoleta(e: EntradaCelularFicha): string | null {
  if (e.tipoComprobante === null || e.tipoComprobante === "nota_venta" || !e.clienta) return null;
  if (celularParaLaFicha(e)) return "También se guarda en su ficha, para la próxima compra.";
  const escrito = ajustarCelular(e.celularBoleta);
  if (tieneCelular(e.clienta.celular) && celularValido(escrito) && escrito !== ajustarCelular(e.clienta.celular ?? "")) {
    return "Solo para esta boleta: el celular de su ficha no cambia.";
  }
  return null;
}

/** Qué pasó al guardarlo, para «Venta registrada». `null` = no se intentó, o la ficha ya tenía celular (nada que decir). */
export type CelularEnFicha = "guardado" | "no_se_pudo";

/** La respuesta de `agregar_celular_clienta` → lo que se dice. Un error (red, módulo, función aún sin pegar) NUNCA frena la venta. */
export function resultadoDeGuardarCelular(r: { data: unknown; error: unknown }): CelularEnFicha | null {
  if (r.error) return "no_se_pudo";
  return r.data === true ? "guardado" : null;
}

export function textoCelularEnFicha(r: CelularEnFicha | null | undefined): string | null {
  if (r === "guardado") return "Quedó guardado en su ficha: la próxima compra ya lo trae.";
  if (r === "no_se_pudo") return "No se pudo guardar en su ficha; la boleta se puede enviar igual. La próxima vez habrá que escribirlo de nuevo.";
  return null;
}
