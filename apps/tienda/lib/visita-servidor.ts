import "server-only";
import { cookies, headers } from "next/headers";
import { after } from "next/server";
import { base } from "./base";
import { esId } from "./bolsa";
import { COOKIE_VISITANTE } from "./visita";

// Tienda web ▸ Tráfico (ADR-0495): anotar los pasos de un visitante en la base, por su puerta (`retail.tienda_anotar_pasos`). Medir no
// puede tumbar nada: si la base no responde, el paso se pierde y queda una línea en el registro; la página y la acción siguen igual
// (principio 9). La base vuelve a revisar cada paso y descarta lo que no calza.
export async function anotarPasos(visitante: string, pasos: readonly object[], region: string | null): Promise<void> {
  if (!pasos.length) return;
  try {
    await base()`select retail.tienda_anotar_pasos(${visitante}::uuid, ${JSON.stringify(pasos)}::text::jsonb, ${region})`;
  } catch (error) {
    console.error(JSON.stringify({ evento: "trafico_anotar", mensaje: error instanceof Error ? error.message : String(error) }));
  }
}

/** Un paso que anota el servidor desde una acción de la tienda: «a la bolsa» (la talla) o «separó» (la marca secreta del pedido). */
export type PasoDelServidor = { paso: 3; variante: string } | { paso: 4; marca: string };

/**
 * Anota pasos desde una acción («Agregar a la bolsa», «Separar») DESPUÉS de responderle al cliente (`after`): la acción no espera a la
 * base ni puede fallar por esto. Solo si la persona ya tiene su número de visitante (lo deja `POST /api/visita` al entrar) y no pidió
 * «no me rastrees».
 */
export async function anotarDesdeLaAccion(pasos: readonly PasoDelServidor[]): Promise<void> {
  try {
    const [almacen, cabeceras] = await Promise.all([cookies(), headers()]);
    const visitante = almacen.get(COOKIE_VISITANTE)?.value;
    if (!pasos.length || !esId(visitante) || cabeceras.get("sec-gpc") === "1") return;
    after(() => anotarPasos(visitante, pasos, null));
  } catch (error) {
    console.error(JSON.stringify({ evento: "trafico_anotar", mensaje: error instanceof Error ? error.message : String(error) }));
  }
}
