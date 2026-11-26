/**
 * La estación de impresión de la caja (Felipe, 2026-11-16): la ventana «CAYLA Caja» imprime las boletas que se vendieron en
 * el piso (`retail.impresiones`, migración 20261116204000). Solo funciona donde se imprime sin cuadro: la ventana marcada como
 * caja o la Mac cuyo ayudante tiene la ticketera; en otro lado el cuadro de impresión de Chrome se abriría solo cada vez. La voz dice cada boleta que salió (decisión de Felipe: con su
 * interruptor), sin mirar la pantalla.
 */
import { preferenciaLocal } from "./preferencia-local";
import type { Ventana } from "./ventana-de-impresion";

const VALORES = ["si", "no"] as const;

/**
 * ¿Esta ventana imprime lo que se vende en el piso? Es del equipo y, **desde el 2026-11-24, viene encendida** (Felipe: la boleta del celular
 * tiene que salir sola en la caja). No es un riesgo en otros equipos: solo trabaja donde se imprime sin cuadro (`estacionActiva`: la
 * ventana «CAYLA Caja» o la Mac con la ticketera en su ayudante). En el celular o en la Mac de la oficina, que valga «si» no hace nada. Lo
 * que alguien apagó a mano sigue apagado.
 */
export const estacionDeLaCaja = preferenciaLocal<(typeof VALORES)[number]>("cayla-estacion-de-la-caja", VALORES, "si");
/** ¿La estación dice en voz alta cada boleta que sale? Encendida de fábrica: es lo que pidió Felipe; se apaga si molesta. */
export const vozDeLaEstacion = preferenciaLocal<(typeof VALORES)[number]>("cayla-voz-de-la-estacion", VALORES, "si");

/** Cada cuánto la estación revisa la cola aunque no llegue ningún aviso (el respaldo del tiempo real). */
export const REVISAR_CADA_MS = 10_000;
/** Después de un aviso de venta nueva, una segunda mirada: el celular pide la boleta un instante después de cobrar. */
export const SEGUNDA_MIRADA_MS = 2500;

/** La estación imprime sin cuadro: en la ventana «CAYLA Caja» (Windows, `--kiosk-printing`) o en una Mac cuyo ayudante tiene la
 *  ticketera (`porAyudante`, ADR-0670 act. 2026-11-16), desde el Chrome de siempre. */
export function estacionActiva(ventana: Ventana, estacion: (typeof VALORES)[number], porAyudante = false): boolean {
  return (ventana === "caja" || porAyudante) && estacion === "si";
}

/** Lo que dice la voz: «Boleta de 79 soles con 90 lista». Montos en palabras de tienda, sin «céntimos» ni decimales. */
export function fraseDeVoz(tipo: "boleta" | "factura" | "nota_venta", total: number): string {
  const centimos = Math.round(total * 100);
  const soles = Math.floor(centimos / 100);
  const resto = centimos % 100;
  const monto = `${soles} ${soles === 1 ? "sol" : "soles"}${resto ? ` con ${String(resto).padStart(2, "0")}` : ""}`;
  if (tipo === "factura") return `Factura de ${monto} lista`;
  if (tipo === "nota_venta") return `Nota de venta de ${monto} lista`;
  return `Boleta de ${monto} lista`;
}
