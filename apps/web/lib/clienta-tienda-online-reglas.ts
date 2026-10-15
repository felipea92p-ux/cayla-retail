// La ficha de un cliente y la tienda online (ADR-0408, Felipe 2026-10-15). Lógica pura, sin React ni red: lee lo que contesta
// `fn_clienta_tienda_online` (20261015123000) y arma lo que la hoja de la ficha dice con eso. La prueba `clienta-tienda-online-reglas.test.ts`.
//
// Tres cosas. Las dos primeras solo avisan; la tercera (anonimizar con un pedido PAGADO sin entregar) espera, como la base:
//   · ARCHIVAR con un pedido web en curso (por confirmar, confirmado sin pagar o pagado sin entregar). Felipe: la hoja avisa antes de
//     confirmar y deja seguir; la conservación del Club (3 años) ya no anonimiza sola a quien tiene un pedido en curso (20261015055000).
//     Lo que pasa de verdad, en cada caso (las funciones de la base, no una promesa de la pantalla):
//       - archivar: el pedido sigue —la tienda lo confirma, lo cobra y lo entrega como siempre (`confirmar_pedido_web`,
//         `entregar_pedido_web` no miran si la ficha está archivada) y la persona lo sigue viendo en «Mis pedidos»
//         (`tienda_mis_pedidos`)—; lo que ya no puede es separar otro (`crear_pedido_web` exige la ficha activa);
//       - anonimizar: su cuenta de la tienda online se cierra en la misma escritura (`clientas_cuenta_web_al_anonimizar`): ya no
//         entra a ver su pedido ni el código para recogerlo, y el pedido se queda sin su nombre ni su celular para avisarle.
//   · EDITAR el correo de una ficha con cuenta en la tienda online: el correo con que entra allá no cambia desde aquí.
//   · ANONIMIZAR con un pedido web pagado y sin entregar: espera (20261015131000, `frenaAnonimizar`); el interruptor se apaga y dice por qué.

/** Un pedido web en curso, como lo devuelve la base. */
export type PedidoWebEnCurso = { codigo: string; estado: "por_confirmar" | "confirmado" | "pagado"; tienda: string };

/** Lo que la ficha tiene en la tienda online. */
export type TiendaOnlineDeLaClienta = { cuentaWeb: boolean; pedidosEnCurso: PedidoWebEnCurso[] };

const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const ESTADOS_EN_CURSO = new Set(["por_confirmar", "confirmado", "pagado"]);

/**
 * La respuesta de `fn_clienta_tienda_online` → lo que la hoja usa. null si no tiene la forma esperada (la base sin la migración, o
 * una respuesta rara): entonces la hoja no avisa nada, como si no hubiera tienda online (principio 9: no se cae la ficha).
 */
export function leerTiendaOnline(json: unknown): TiendaOnlineDeLaClienta | null {
  if (!esObjeto(json) || typeof json.cuenta_web !== "boolean" || !Array.isArray(json.pedidos_en_curso)) return null;
  const pedidosEnCurso = json.pedidos_en_curso
    .map((p) =>
      esObjeto(p) && typeof p.codigo === "string" && typeof p.estado === "string" && ESTADOS_EN_CURSO.has(p.estado)
        ? { codigo: p.codigo, estado: p.estado as PedidoWebEnCurso["estado"], tienda: typeof p.tienda === "string" ? p.tienda : "" }
        : null,
    )
    .filter((p): p is PedidoWebEnCurso => p !== null);
  return { cuentaWeb: json.cuenta_web, pedidosEnCurso };
}

/** Dónde va el pedido, en palabras de la tienda. */
export function estadoDelPedido(estado: PedidoWebEnCurso["estado"]): string {
  if (estado === "por_confirmar") return "por confirmar";
  if (estado === "confirmado") return "confirmado, falta pagar";
  return "pagado, falta entregar";
}

/** Una línea por pedido: «W-0012 · pagado, falta entregar · Tienda Trujillo». */
export function lineaDelPedido(p: PedidoWebEnCurso): string {
  return [p.codigo, estadoDelPedido(p.estado), p.tienda].filter(Boolean).join(" · ");
}

/**
 * Lo que dice la hoja de archivar si la ficha tiene pedidos web en curso; null si no tiene (o no se pudo leer). `anonimizar`: el
 * interruptor «Anonimizar sus datos» encendido, que es lo que cambia la consecuencia.
 */
export function avisoAlArchivar(
  t: TiendaOnlineDeLaClienta | null,
  anonimizar: boolean,
): { titulo: string; pedidos: string[]; texto: string } | null {
  const n = t?.pedidosEnCurso.length ?? 0;
  if (!t || n === 0) return null;
  const uno = n === 1;
  return {
    titulo: uno ? "Tiene un pedido de la tienda online en curso" : `Tiene ${n} pedidos de la tienda online en curso`,
    pedidos: t.pedidosEnCurso.map(lineaDelPedido),
    texto: anonimizar
      ? `Si anonimizas la ficha, se cierra su cuenta de la tienda online: ya no podrá ver ${uno ? "su pedido" : "sus pedidos"} ni el código para recoger, y no quedará su nombre ni su celular para avisarle. Mejor espera a que ${uno ? "se entregue" : "se entreguen"}.`
      : `Si archivas la ficha, ${uno ? "el pedido sigue" : "los pedidos siguen"} igual en la tienda y ${uno ? "lo" : "los"} sigue viendo en su cuenta. Lo que ya no podrá es separar otro.`,
  };
}

/** Bajo la caja del correo, si tiene cuenta en la tienda online: el correo con que entra allá no cambia aquí (lo cambia ella con un
 *  código; si lo perdió, «Restablecer acceso», 20261015132000). */
export function notaDelCorreoDeEntrada(t: TiendaOnlineDeLaClienta | null): string | null {
  return t?.cuentaWeb
    ? "Tiene cuenta en la tienda online: entra con su propio correo, que no cambia desde aquí. Si lo perdió, usa «Restablecer acceso» en su ficha."
    : null;
}

/**
 * ¿Hay que esperar para anonimizar? Sí, con un pedido web PAGADO y sin entregar (Felipe 2026-10-15, 20261015131000): la base no anonimiza
 * (`anonimizar_pedido_web_pagado`, en sus tres caminos) para no dejar sin dueño un pedido por el que ya pagó. Lo que dice la hoja, con
 * las mismas palabras que la base; null si se puede. Archivar sin anonimizar sigue igual.
 */
export function frenaAnonimizar(t: TiendaOnlineDeLaClienta | null): string | null {
  const pagados = t?.pedidosEnCurso.filter((p) => p.estado === "pagado") ?? [];
  if (pagados.length === 0) return null;
  const uno = pagados.length === 1;
  const cuales = pagados.map((p) => [p.codigo, p.tienda].filter(Boolean).join(" · ")).join("; ");
  return uno
    ? `Todavía no se puede anonimizar: tiene un pedido de la tienda online pagado y sin entregar (${cuales}). Sus datos se pueden borrar cuando lo recoja o cuando se anule el pedido. Archivar sí se puede.`
    : `Todavía no se puede anonimizar: tiene ${pagados.length} pedidos de la tienda online pagados y sin entregar (${cuales}). Sus datos se pueden borrar cuando los recoja o cuando se anulen. Archivar sí se puede.`;
}

/** Lo que borra «Anonimizar» (el pie del interruptor). Con cuenta en la tienda online, además se cierra. */
export function pieDeAnonimizar(t: TiendaOnlineDeLaClienta | null): string {
  return [
    "Borra documento, celular, correo, cumpleaños, tallas y su lugar en el club (sale del club y de las novedades).",
    t?.cuentaWeb ? "Su cuenta de la tienda online se cierra." : null,
    "Sus compras y apartados NO se tocan — solo desaparece quién es. No se puede deshacer.",
  ]
    .filter(Boolean)
    .join(" ");
}
