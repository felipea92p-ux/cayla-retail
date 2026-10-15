import type { Forma } from "./catalogo";

// El buscador de la cabecera (ADR-0408, actividad 5; maqueta v4, `resultadosHTML`): busca mientras se escribe, en el navegador, sobre
// un índice chico que arma el servidor con el catálogo ya leído. Sin tildes ni mayúsculas. Este archivo no carga nada más (sin
// esquemas): va entero al navegador. Lógica pura, con su prueba al lado.

/** Lo que el buscador necesita de cada prenda: nada que no se vea en su tarjeta. */
export type ItemBusqueda = {
  id: string;
  nombre: string;
  categoria: string | null;
  colores: string[];
  /** Lo que paga el cliente en la tienda elegida («S/ 65.90», «Desde S/ 65.90»). */
  precio: string;
  /** «−12 %», si tiene campaña. */
  oferta: string | null;
  href: string;
  foto: string | null;
  optimizar: boolean;
  forma: Forma;
  color: string | null;
};

/** Sin tildes ni mayúsculas: «Camisas y Blusas» → «camisas y blusas», «Pantalón» → «pantalon». */
export const normalizar = (texto: string): string => texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Lo que encuentra: el nombre, la categoría o un color contiene lo escrito. Primero lo que lo tiene en el nombre; hasta `max`. Con
 *  menos de 2 letras, nada (la hoja muestra las categorías para tocar). */
export function buscarEn(items: readonly ItemBusqueda[], escrito: string, max = 8): ItemBusqueda[] {
  const q = normalizar(escrito.trim());
  if (q.length < 2) return [];
  const enNombre = items.filter((i) => normalizar(i.nombre).includes(q));
  const enLoDemas = items.filter((i) => !enNombre.includes(i) && normalizar(`${i.categoria ?? ""} ${i.colores.join(" ")}`).includes(q));
  return [...enNombre, ...enLoDemas].slice(0, max);
}

/** El nombre partido para marcar lo que coincide («Blusa [Em]ma»), o null si lo escrito no está en el nombre. */
export function resaltar(texto: string, escrito: string): [string, string, string] | null {
  const q = normalizar(escrito.trim());
  if (!q) return null;
  const i = normalizar(texto).indexOf(q);
  return i < 0 ? null : [texto.slice(0, i), texto.slice(i, i + q.length), texto.slice(i + q.length)];
}
