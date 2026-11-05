import { z } from "zod";
import { soles } from "./catalogo";

// El cupón del Club en la bolsa y en el pedido web (20261019224000). El cliente escribe su código en la bolsa; la base dice si sirve
// (`retail.tienda_validar_cupon`, que cuenta los códigos que no existen y bloquea a los 5) y, al separar, lo RESERVA para ese pedido
// (`retail.tienda_separar_con_cupon`): el pedido nace con el total rebajado. Aquí solo se lee la forma y se ponen las cosas en palabras
// de tienda: quien decide es la base, que vuelve a revisar todo al separar.

/** CAY-XXXX-XXXX con el alfabeto de la base (sin 0/O/1/I). */
const FORMA = /^CAY-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;

/**
 * Lo que escribió, como lo guarda la base: en mayúsculas y con sus guiones aunque los haya escrito sin ellos o con espacios
 * («cay 4k7p 9h2m» → «CAY-4K7P-9H2M»). Lo que no se parece a un código se devuelve tal cual, en mayúsculas y sin espacios de los bordes.
 */
export function normalizarCodigo(texto: string): string {
  const limpio = texto.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (/^CAY[A-Z0-9]{8}$/.test(limpio)) return `CAY-${limpio.slice(3, 7)}-${limpio.slice(7, 11)}`;
  return texto.trim().toUpperCase();
}

/** ¿Ya escribió un código entero? Recién ahí se pregunta a la base (no por cada letra). */
export const codigoCompleto = (texto: string) => FORMA.test(normalizarCodigo(texto));

const numero = z.coerce.number().finite();

/** «S/ 20.00» con un espacio que no se parte (ADR-0413): en una frase, «S/» no queda sola al final de un renglón. */
const solesEnFrase = (monto: number) => soles(monto).replace(" ", "\u00a0");

export type MotivoCupon = "no_existe" | "usado" | "reservado" | "vencido" | "minimo" | "cubre_todo" | "bloqueado";

export type ValidacionCupon =
  | { ok: true; codigo: string; valor: number; compraMinima: number; venceEl: string; tuyo: boolean }
  | { ok: false; motivo: MotivoCupon; faltan: number | null };

const esquemaOk = z.object({
  ok: z.literal(true),
  codigo: z.string().regex(FORMA),
  valor: numero.positive(),
  compra_minima: numero.positive(),
  vence_el: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
  tuyo: z.boolean().catch(false),
});
const esquemaNo = z.object({
  ok: z.literal(false),
  motivo: z.enum(["no_existe", "usado", "reservado", "vencido", "minimo", "cubre_todo", "bloqueado"]),
  faltan: numero.nonnegative().nullable().optional(),
});

/** La respuesta de `tienda_validar_cupon`. null si no tiene la forma (se dice «no pudimos revisarlo»). */
export function interpretarValidacion(dato: unknown): ValidacionCupon | null {
  const ok = esquemaOk.safeParse(dato);
  if (ok.success)
    return {
      ok: true,
      codigo: ok.data.codigo,
      valor: ok.data.valor,
      compraMinima: ok.data.compra_minima,
      venceEl: ok.data.vence_el.slice(0, 10),
      tuyo: ok.data.tuyo,
    };
  const no = esquemaNo.safeParse(dato);
  return no.success ? { ok: false, motivo: no.data.motivo, faltan: no.data.faltan ?? null } : null;
}

/** Lo que se le dice al cliente cuando el código no sirve, en palabras de tienda. */
export function mensajeDeCupon(v: Extract<ValidacionCupon, { ok: false }>): string {
  switch (v.motivo) {
    case "no_existe":
      return "No encontramos ese código. Revisa que esté bien escrito.";
    case "usado":
      return "Ese cupón ya se usó.";
    case "reservado":
      return "Ese cupón está reservado para otro pedido web.";
    case "vencido":
      return "Ese cupón ya venció.";
    case "minimo":
      return v.faltan !== null && v.faltan > 0
        ? `Este cupón pide una compra mayor: te faltan ${solesEnFrase(v.faltan)}.`
        : "Este cupón pide una compra mayor.";
    case "cubre_todo":
      return "Este cupón cubre toda tu compra: suma otra prenda para usarlo.";
    case "bloqueado":
      return "Probaste muchos códigos que no existen. Espera unos minutos y vuelve a intentarlo.";
  }
}

/** Con el cupón que sirve: «Descuento de S/ 20: tu total queda en S/ 80.». */
export function textoDelDescuento(valor: number, total: number): string {
  const queda = Math.round((total - valor) * 100) / 100;
  return `Descuento de ${solesEnFrase(valor)}: tu total queda en ${solesEnFrase(queda)}.`;
}

export const CUPON_SIN_RESPUESTA = "No pudimos revisar tu cupón ahora. Vuelve a intentarlo en un momento.";

/** Las negativas de «Separar» que son del cupón (los hints de `fn_club_cupon_reservar`). */
export const MENSAJES_CUPON_AL_SEPARAR: Record<string, string> = {
  cupon_no_existe: "No encontramos ese código de cupón. Revísalo o quítalo para separar.",
  cupon_ya_usado: "Ese cupón ya se usó. Quítalo para separar.",
  cupon_reservado: "Ese cupón está reservado para otro pedido web. Quítalo para separar.",
  cupon_vencido: "Ese cupón ya venció. Quítalo para separar.",
  cupon_compra_minima: "Tu bolsa no llega a la compra mínima del cupón. Suma una prenda o quítalo para separar.",
  cupon_cubre_todo: "El cupón cubre toda tu compra: suma otra prenda para usarlo.",
  cupon_bloqueado: "Probaste muchos códigos que no existen. Espera unos minutos y vuelve a intentarlo.",
  club_un_cupon_por_compra: "Un pedido lleva un solo cupón.",
  liquidacion_sin_descuentos: "Una prenda de liquidación no se vende con cupón. Quita el cupón para separar.",
};

/* ------------------------------------------------------------------ El cupón de un pedido */

export type CuponDelPedido = {
  codigo: string;
  valor: number;
  /** Lo que descuenta del pedido ahora (0 si se liberó al quitar prendas). */
  descuento: number;
  estado: "reservado" | "usado" | "liberado";
  liberadoMotivo: "compra_minima" | "cubre_todo" | "pedido_anulado" | "pedido_vencido" | null;
};

const esquemaDelPedido = z.object({
  codigo: z.string().regex(FORMA),
  valor: numero.positive(),
  descuento: numero.nonnegative(),
  estado: z.enum(["reservado", "usado", "liberado"]),
  liberado_motivo: z.enum(["compra_minima", "cubre_todo", "pedido_anulado", "pedido_vencido"]).nullable().catch(null),
});

/** El `cupon` de un pedido de `tienda_mis_pedidos`. Sin cupón (o con un dato raro), null: el pedido se sigue viendo, sin la línea. */
export function leerCuponDelPedido(dato: unknown): CuponDelPedido | null {
  const r = esquemaDelPedido.safeParse(dato);
  if (!r.success) return null;
  return { codigo: r.data.codigo, valor: r.data.valor, descuento: r.data.descuento, estado: r.data.estado, liberadoMotivo: r.data.liberado_motivo };
}

/** Lo que dice el pedido de un cupón que volvió («Tu cupón … volvió a Mi Club porque…»). null si el cupón sigue en el pedido. */
export function textoCuponLiberado(c: CuponDelPedido): string | null {
  if (c.estado !== "liberado") return null;
  const vuelve = `Tu cupón ${c.codigo} volvió a «Mi Club»`;
  switch (c.liberadoMotivo) {
    case "compra_minima":
      return `${vuelve}: al confirmar, la tienda no tenía alguna prenda y lo que queda ya no llega a su compra mínima. Pagas el total sin descuento y puedes usarlo en otra compra mientras siga vigente.`;
    case "cubre_todo":
      return `${vuelve}: al confirmar, la tienda no tenía alguna prenda y el cupón cubría todo lo que queda. Puedes usarlo en otra compra mientras siga vigente.`;
    default:
      return `${vuelve} porque este pedido se cerró. Puedes usarlo en otra compra mientras siga vigente.`;
  }
}
