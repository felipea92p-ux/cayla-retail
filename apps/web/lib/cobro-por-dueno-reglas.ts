// Qué número darle a quien paga con Yape o Plin en una sede con dos empresas (hoy Lima). Lógica pura; decisión de Felipe, 2026-11-09.
//
// LA REGLA. Lo de CLAURE se paga al número de Claudia: esa plata es de ella y no pasa por CAYLA. Lo de CAYLA va por el QR de la máquina o,
// si no, al número de CAYLA. Un ticket con prendas de las dos marcas se paga en dos partes, cada una a su número.
//
// POR QUÉ LO DICE LA PANTALLA. De 13 cobros de CAYLA anotados como «Yape» en Lima, 11 habían entrado por el QR, y uno se le pagó al número de
// Claudia. La colaboradora no tenía dónde ver a qué número mandar a la clienta.
//
// EL TOPE DE ESTA PIEZA. Solo dice qué número dar: no decide a qué cuenta va la plata, eso lo hace la base. Sin reparto (una sede con una sola
// empresa, o la base no respondió) no dice nada, y la hoja de cobro queda igual que siempre.

import type { MetodoPagoVenta } from "@cayla-retail/shared";
import type { UnidadesDeDueno } from "./dueno-reglas";

/** La clave de CLAURE en `retail.empresas`. */
const CLAVE_CLAURE = "claure";

const soles = (n: number) => `S/${n.toFixed(2)}`;

type LineaConValor = { cantidad: number; precioFinalUnitario: number };

/** Cuánto vale lo de cada marca en el ticket, ya con descuentos y cupón. */
export type RepartoDelTicket = { claure: number; cayla: number };

/** Lo que la hoja de cobro le dice a la colaboradora. */
export type NumeroQueDar = { titulo: string; detalle: string };

/**
 * ¿Esta prenda del ticket es de CLAURE? En este orden: la empresa que la colaboradora eligió para esa prenda; la única con unidades
 * disponibles en la sede; y, si el reparto no sabe, la insignia de la prenda (`empresa`, que solo tienen las de otra marca).
 */
export function esDeClaure(
  varianteId: string,
  insignia: string | null | undefined,
  duenosPorVariante: Readonly<Record<string, readonly UnidadesDeDueno[]>>,
  elegido: Readonly<Record<string, string>>,
): boolean {
  const duenos = duenosPorVariante[varianteId] ?? [];
  const porEleccion = duenos.find((d) => d.empresaId === elegido[varianteId]);
  if (porEleccion) return porEleccion.clave === CLAVE_CLAURE;
  const conUnidades = duenos.filter((d) => d.cantidad - d.cantidadApartada > 0);
  if (conUnidades.length === 1) return conUnidades[0]!.clave === CLAVE_CLAURE;
  return insignia != null;
}

/** Suma en céntimos lo que vale cada marca. Una línea a 0 (la bolsa de obsequio) no vuelve mixto un ticket: se mide por valor. */
export function repartoDelTicket<L extends LineaConValor>(lineas: readonly L[], deClaure: (linea: L) => boolean): RepartoDelTicket {
  let claure = 0;
  let cayla = 0;
  for (const l of lineas) {
    const valor = Math.max(0, Math.trunc(l.cantidad)) * Math.round(l.precioFinalUnitario * 100);
    if (deClaure(l)) claure += valor;
    else cayla += valor;
  }
  return { claure: claure / 100, cayla: cayla / 100 };
}

const esCelular = (m: MetodoPagoVenta) => m === "yape" || m === "plin";

/**
 * Lo que se le dice a la colaboradora, o `null` si no hay nada que decir. Un ticket de una sola marca habla cuando se elige Yape o Plin.
 * Uno de dos marcas habla desde antes de elegir, porque cambia cómo se cobra, y se calla si ya se cobra todo por otro medio.
 */
export function numeroQueDar(reparto: RepartoDelTicket | null, medios: readonly MetodoPagoVenta[]): NumeroQueDar | null {
  if (!reparto) return null;
  const { claure, cayla } = reparto;
  const porCelular = medios.some(esCelular);
  if (claure > 0 && cayla > 0) {
    if (medios.length > 0 && !porCelular) return null;
    return { titulo: "Este ticket es de dos marcas", detalle: `CLAURE ${soles(claure)} va al número de Claudia. CAYLA ${soles(cayla)}, al QR o a su número.` };
  }
  if (!porCelular) return null;
  if (claure > 0) return { titulo: "Dale el número de Claudia", detalle: "La plata le llega a ella." };
  if (cayla > 0) return { titulo: "Dale el número de CAYLA o el QR", detalle: "Si escaneó el QR de la máquina, marca QR." };
  return null;
}
