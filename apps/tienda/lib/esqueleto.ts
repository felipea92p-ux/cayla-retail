import { esIdDePrenda } from "./ficha";

// Qué forma tiene el esqueleto que se ve mientras llega una página (Felipe 2026-10-15: «cuando presiono en una prenda para ver el
// detalle no da la sensación de carga»). Un mismo `loading.tsx` cubre varias páginas (el del catálogo cubre el Inicio, la lista, la ficha
// y los looks; el de la cuenta, «Mi perfil» y sus páginas), así que la forma sale de la dirección a la que se va: la ficha de una prenda
// se anuncia con la foto grande y sus datos, «Mi perfil» con su saludo y sus cuadros, la bolsa y los pedidos con su lista, y lo demás con
// la grilla de prendas. Así lo que brilla tiene la forma de lo que llega y nada salta al llegar. Lógica pura, con su prueba al lado.

export type FormaEsqueleto = "grilla" | "lista" | "ficha" | "perfil";

export function formaDeLaRuta(ruta: string): FormaEsqueleto {
  const limpia = ruta.length > 1 ? ruta.replace(/\/+$/, "") : ruta;
  const ficha = /^\/catalogo\/([^/]+)$/.exec(limpia);
  if (ficha && esIdDePrenda(ficha[1])) return "ficha";
  if (limpia === "/cuenta") return "perfil";
  if (limpia.startsWith("/cuenta/") || limpia === "/bolsa" || limpia.startsWith("/bolsa/")) return "lista";
  return "grilla";
}
