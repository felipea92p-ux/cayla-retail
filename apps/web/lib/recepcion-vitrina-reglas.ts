// La Vitrina de una prenda en el cierre (rediseño «B» de Recibir, Felipe 2026-10-29): la cara de la prenda con su precio en una etiqueta,
// su costo, lo que se gana por prenda y dónde vale el precio. Escribir en la cara cambia TODAS sus combinaciones a la vez (lo mismo que
// «Mismo precio para las N» de la matriz); «Distinto por talla o color» abre la matriz de siempre. Aquí solo se resume lo que ya dicen las
// combinaciones y lo escrito; las reglas de cada cifra siguen en `recepcion-combinaciones-reglas.ts`.

import { costoEfectivo, precioEfectivo, textoDeRango, type CambiosDeCosto, type CambiosDePrecio, type Combinacion, type ValeEn } from "./recepcion-combinaciones-reglas";

export type CaraDeVitrina = {
  /** El precio si todas las combinaciones valen lo mismo; `null` si varían o no se leyó. */
  precio: number | null;
  /** «S/ 59.90 – 64.90» si varían; lo mismo que `precio` si no. */
  precioTexto: string | null;
  costo: number | null;
  costoTexto: string | null;
  /** Lo que se gana por prenda (precio − costo), de la menor a la mayor; `null` si falta alguna de las dos cifras. */
  ganaTexto: string | null;
  /** Alguna combinación se vendería por debajo de su costo. */
  pierde: boolean;
  /** Dónde vale lo escrito como precio: `null` si no se escribió ninguno (vale lo de hoy). Si hay de las dos, «sede». */
  valeEn: ValeEn | null;
};

const unico = (v: readonly (number | null)[]): number | null => {
  const n = v.filter((x): x is number => x !== null);
  return n.length === v.length && n.length > 0 && n.every((x) => x === n[0]) ? n[0] : null;
};

export function caraDeVitrina(combinaciones: readonly Combinacion[], cambiosCosto: CambiosDeCosto, cambiosPrecio: CambiosDePrecio): CaraDeVitrina {
  const precios = combinaciones.map((c) => precioEfectivo(c, cambiosPrecio));
  const costos = combinaciones.map((c) => costoEfectivo(c, cambiosCosto));
  const margenes = combinaciones.map((_, i) => (precios[i] !== null && costos[i] !== null ? Math.round(((precios[i] as number) - (costos[i] as number)) * 100) / 100 : null));
  const escritos = combinaciones.map((c) => cambiosPrecio[c.varianteId]).filter((x): x is NonNullable<typeof x> => x !== undefined);
  const completos = margenes.every((m) => m !== null) && margenes.length > 0;
  return {
    precio: unico(precios),
    precioTexto: textoDeRango(precios),
    costo: unico(costos),
    costoTexto: textoDeRango(costos),
    ganaTexto: completos ? textoDeRango(margenes) : null,
    pierde: margenes.some((m) => m !== null && m < 0),
    valeEn: escritos.length === 0 ? null : escritos.every((e) => e.valeEn === "todas") ? "todas" : "sede",
  };
}
