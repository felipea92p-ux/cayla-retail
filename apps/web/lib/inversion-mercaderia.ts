import { leerInversion, type CampanaInversion } from "./inversion-mercaderia-reglas";
import { ejemploDeInversion } from "./inversion-mercaderia-ejemplo";
import type { Lectura } from "./resumen-finanzas";

// Lo que el Plan de campaña entrega para «Inversión en mercadería» del Resumen de Finanzas. SOLO LEE.
//
// Hoy la base NO lo entrega: el Plan todavía no guarda la lista de pagos ni «se ve en el Resumen», y no existe la función que las lee (decidido con
// Felipe el 2026-10-26; la construye la sesión del Plan de campaña). Mientras tanto el Resumen no ofrece nada: `datos: null` quiere decir «esta base
// aún no lo trae» y el bloque, la capa de la caja y el ícono «Qué se ve» no se dibujan (la «marca soportado» del ADR-0499). Cuando la función
// exista, ESTA es la única función que cambia: llama a la RPC, pasa su resultado por `leerInversion` y dice qué falló sin inventar un cero.
//
// Para verla armada con cifras de ejemplo en el computador de desarrollo: `/finanzas/resumen?inversion=ejemplo`. En producción esa marca se ignora: un
// número de ejemplo nunca sale en una pantalla real.
export async function getInversionMercaderia(hoy: string, ejemplo: boolean): Promise<Lectura<CampanaInversion[] | null>> {
  if (ejemplo && process.env.NODE_ENV !== "production") return { datos: leerInversion(ejemploDeInversion(hoy)), falla: null };
  return { datos: null, falla: null };
}
