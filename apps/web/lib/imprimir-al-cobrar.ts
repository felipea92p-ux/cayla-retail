/**
 * «Imprimir solo al cobrar» (Felipe, 2026-11-16): en la caja, confirmar el cobro ya imprime la boleta, sin el segundo toque de
 * «Imprimir y nueva venta». Es el primer paso de que la venta se cierre sola (lo que sigue es que la confirme el aviso de Izipay).
 *
 * Es una preferencia de ESTE equipo, no de la cuenta, y arranca APAGADA: solo la enciende el equipo de caja que imprime sin diálogo
 * (Chrome con `--kiosk-printing`, `docs/OPERACION-IMPRESORA-TERMICA.md`). Encendida en un celular o en un equipo sin ese ajuste, cada
 * venta abriría el diálogo de impresión sola, que es peor que el botón.
 *
 * La regla pura (`queHacerAlRegistrar`) decide qué pasa con la hoja «Venta registrada»; el componente solo la obedece.
 */
import { preferenciaLocal } from "./preferencia-local";

const VALORES = ["si", "no"] as const;

/** La preferencia del equipo (`localStorage`). Úsala con `useSyncExternalStore(p.suscribir, p.leer, p.leerEnServidor)`. */
export const imprimirAlCobrar = preferenciaLocal<(typeof VALORES)[number]>("cayla-imprimir-al-cobrar", VALORES, "no");

/** Lo que hace la hoja «Venta registrada» apenas se abre. */
export type AlRegistrar =
  /** Como siempre: espera a que la cajera apriete «Imprimir y nueva venta». */
  | "esperar"
  /** Imprime sola y se queda abierta: hay vuelto que entregar y la cajera tiene que verlo. */
  | "imprimir-y-quedarse"
  /** Imprime sola y vuelve a una venta nueva: no hay nada más que hacer con esta. */
  | "imprimir-y-seguir";

export function queHacerAlRegistrar(p: {
  /** ¿Este equipo tiene encendido «Imprimir solo al cobrar»? */
  encendido: boolean;
  /** ¿La venta trae su comprobante? Sin él (no se pudo leer) no hay nada que imprimir. */
  hayComprobante: boolean;
  /** ¿Se guardó sin conexión? Todavía no tiene serie ni número: no hay comprobante que imprimir. */
  sinConexion: boolean;
  /** El vuelto total de los pagos en efectivo, en soles. */
  vuelto: number;
}): AlRegistrar {
  if (!p.encendido || !p.hayComprobante || p.sinConexion) return "esperar";
  return p.vuelto > 0 ? "imprimir-y-quedarse" : "imprimir-y-seguir";
}
