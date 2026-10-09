// El ejemplo de «Por qué» en «Precio distinto en una sede» sigue lo que la persona ya eligió (skill `/sugerir`, ADR-0290):
// la tienda y si el precio queda arriba o abajo del general. Antes de escribir el precio no promete nada.
//
// Fuente, en este orden: precio escrito y distinto del general → «Ej. En Arequipa se vende más cara / más barata»; sin
// precio (o igual al general) → el neutro. El nombre de la tienda sale de la sede elegida, sin «Tienda» delante, que es
// como se dice en la tienda. Puro y determinista.

import { leerMonto } from "./precio-sede-reglas";

export type OrigenMotivo = "precio" | "neutro";

export const MOTIVO_NEUTRO = "Por qué esta tienda tiene otro precio";

/** «Tienda Arequipa» → «Arequipa»; «Boutique Lima» queda igual si no empieza con «Tienda». */
export function nombreCorto(sede: string): string {
  return sede.replace(/^tienda\s+/i, "").trim() || sede;
}

export function sugerirMotivo(h: { sede: string | null; monto: string; general: number | null }): { texto: string; origen: OrigenMotivo } {
  const precio = leerMonto(h.monto);
  if (!h.sede || precio === null || h.general === null || Math.abs(precio - h.general) < 0.005) {
    return { texto: MOTIVO_NEUTRO, origen: "neutro" };
  }
  const donde = nombreCorto(h.sede);
  return precio > h.general
    ? { texto: `Ej. En ${donde} se vende a más`, origen: "precio" }
    : { texto: `Ej. En ${donde} sale mejor a menos`, origen: "precio" };
}
