// Reglas puras del canal de venta de un apartado (ADR-0607). Sin React ni Supabase: se prueban con `canales-venta-reglas.test.ts`.
//
// El canal dice por dónde se vendió (la tienda física o un canal online como TikTok); lo marca quien aparta y lo exige la base
// (`separar_prendas_online`). Una cuenta solo ve y elige los canales que su rol opera (`fn_canales_de_la_cuenta`).

import type { CanalVenta } from "./roles-reglas";

export type { CanalVenta };

/** Cómo se entrega: la clienta recoge en la tienda o se le envía. */
export type ModoEntrega = "recojo" | "envio";

export const MODOS_DE_ENTREGA: readonly { clave: ModoEntrega; etiqueta: string }[] = [
  { clave: "recojo", etiqueta: "Recojo en tienda" },
  { clave: "envio", etiqueta: "Envío" },
];

/** Lo mismo que exige la base: una dirección de envío tiene entre 5 y 300 letras. */
export const DIRECCION_ENVIO_MIN = 5;
export const DIRECCION_ENVIO_MAX = 300;

export function direccionDeEnvioValida(texto: string): boolean {
  const n = texto.trim().length;
  return n >= DIRECCION_ENVIO_MIN && n <= DIRECCION_ENVIO_MAX;
}

/** El canal con el que abre el formulario: la tienda si la cuenta la opera; si no, el primero que opera. */
export function canalInicialDe(canales: readonly Pick<CanalVenta, "clave">[]): string {
  return canales.find((c) => c.clave === "tienda")?.clave ?? canales[0]?.clave ?? "tienda";
}

/**
 * ¿Se le ofrece elegir el canal? Si la cuenta solo opera la tienda, no hay nada que elegir y el formulario queda como siempre.
 * Si opera un solo canal que no es la tienda (un rol «ventas online»), se muestra fijo para que se vea por dónde vende.
 */
export function ofreceCanal(canales: readonly Pick<CanalVenta, "clave" | "esFisico">[]): boolean {
  return canales.length >= 2 || (canales.length === 1 && !canales[0].esFisico);
}

/** ¿El canal elegido es online (lleva entrega y dirección)? Un canal que no está en la lista se trata como la tienda. */
export function esCanalOnline(canales: readonly Pick<CanalVenta, "clave" | "esFisico">[], clave: string): boolean {
  const c = canales.find((x) => x.clave === clave);
  return !!c && !c.esFisico;
}

/** Lo que el formulario guarda del canal y la entrega, como lo pide la base. */
export type EntregaDelApartado = { canal: string; modoEntrega: ModoEntrega; direccionEnvio: string };

/** Lo que se manda a la base: la tienda sigue por `separar_prendas`; un canal online, por `separar_prendas_online`. */
export function argumentosDeCanal(
  canales: readonly Pick<CanalVenta, "clave" | "esFisico">[],
  e: EntregaDelApartado,
): { rpc: "separar_prendas" } | { rpc: "separar_prendas_online"; p_canal: string; p_modo_entrega: ModoEntrega; p_direccion_envio: string | null } {
  if (!esCanalOnline(canales, e.canal)) return { rpc: "separar_prendas" };
  return {
    rpc: "separar_prendas_online",
    p_canal: e.canal,
    p_modo_entrega: e.modoEntrega,
    p_direccion_envio: e.modoEntrega === "envio" ? e.direccionEnvio.trim() : null,
  };
}

/** El nombre de un canal para mostrar; si no está en la lista (un canal que la cuenta ya no opera), la clave con inicial mayúscula. */
export function nombreDeCanal(canales: readonly Pick<CanalVenta, "clave" | "nombre">[], clave: string): string {
  return canales.find((c) => c.clave === clave)?.nombre ?? (clave ? clave[0].toUpperCase() + clave.slice(1) : "");
}

/** Cómo se entrega un apartado, en palabras de tienda: «Recojo en tienda», «Envío por despachar» o «Enviado». */
export function textoDeEntrega(a: { modoEntrega: ModoEntrega; enviadoEn: string | null }): string {
  if (a.modoEntrega === "recojo") return "Recojo en tienda";
  return a.enviadoEn ? "Enviado" : "Envío por despachar";
}

/** La misma idea en una palabra, para el chip de una lista: «Recojo», «Envío» o «Enviado». */
export function textoCortoDeEntrega(a: { modoEntrega: ModoEntrega; enviadoEn: string | null }): string {
  if (a.modoEntrega === "recojo") return "Recojo";
  return a.enviadoEn ? "Enviado" : "Envío";
}
