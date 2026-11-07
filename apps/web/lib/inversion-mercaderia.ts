import { leerInversion, type CampanaInversion } from "./inversion-mercaderia-reglas";
import { ejemploDeInversion } from "./inversion-mercaderia-ejemplo";
import { leerInversionDeLasCampanas } from "./plan-compra-inversion-lectura";
import { clienteDeLectura } from "./plan-compra-inversion-servidor";
import type { Lectura } from "./resumen-finanzas";

// Lo que el Plan de campaña entrega para «Inversión en mercadería» del Resumen de Finanzas. SOLO LEE.
//
// Desde el 2026-10-26 (ADR-0527) el Plan guarda la lista de pagos y «si Finanzas la ve» (`fn_plan_compra_pagos`), y esta función arma, por campaña, lo que `leerInversion` espera con las MISMAS
// cuentas del Plan (`lib/plan-compra-inversion-lectura.ts`). `datos: null` quiere decir «esto no se ofrece»: la cuenta no tiene el módulo «Plan de campaña», o la base aún no trae la función
// (la «marca soportado» del ADR-0499); el bloque, la capa de la caja y el ícono «Qué se ve» no se dibujan. Una lectura que se cae no es un cero: `falla` lo dice y el Resumen lo muestra.
//
// Para verla armada con cifras de ejemplo en el computador de desarrollo: `/finanzas/resumen?inversion=ejemplo`. En producción esa marca se ignora: un
// número de ejemplo nunca sale en una pantalla real.
export async function getInversionMercaderia(hoy: string, ejemplo: boolean): Promise<Lectura<CampanaInversion[] | null>> {
  if (ejemplo && process.env.NODE_ENV !== "production") return { datos: leerInversion(ejemploDeInversion(hoy)), falla: null };
  const lectura = await leerInversionDeLasCampanas(await clienteDeLectura(), hoy);
  return { datos: lectura.datos === null ? null : leerInversion(lectura.datos), falla: lectura.falla };
}
