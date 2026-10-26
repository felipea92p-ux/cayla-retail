// Tienda web ▸ Vitrina: con qué precio sale un modelo en cada tienda de la web (la hoja del modelo). Lógica pura: lee lo que devuelve
// `retail.fn_vitrina_precios_modelo(uuid)` (20261026191000) y lo dice en palabras de tienda.
//
// CONTRATO
//   PROMETE: leer esa respuesta sin caerse ante un dato raro (devuelve `null` si no tiene la forma) y decir, por cada tienda de la web, el precio
//            que ve el cliente (el de la talla más cara; con campaña, el que paga y el de lista tachado, y «Desde» si la campaña no toca a todas
//            las tallas por igual) o que ahí no se ofrece; más una línea para quien NO elige tienda (el mayor), solo cuando difiere.
//   ASUME:   que la regla del precio vive en la base (`fn_tienda_precios`, la misma que lee la tienda): aquí no se calcula ningún precio.
//   NO HACE: leer la base, decidir si el modelo se ve en la web ni cambiar un precio (se cambia en su ficha, en Catálogo ▸ Productos).

import { fechaCorta } from "./etiqueta-vigencia";
import { soles } from "./precio-sede-reglas";

export type CampanaDelPrecio = { nombre: string; pct: number | null; hasta: string | null };
export type PrecioEnTienda = {
  id: string | null;
  nombre: string;
  /** La tienda ofrece el modelo (alguna talla activa con precio ahí). */
  seOfrece: boolean;
  /** El precio de lista de la talla más cara. */
  precio: number | null;
  /** Lo que paga el cliente (con la campaña, si hay). */
  precioFinal: number | null;
  /** «Desde»: la campaña no toca a todas las tallas por igual, así que el precio final es el menor. */
  desde: boolean;
  campana: CampanaDelPrecio | null;
};
export type PreciosDelModelo = { sedes: PrecioEnTienda[]; todas: PrecioEnTienda };

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const numero = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? n : null;
};
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);

function campanaDeJson(v: unknown): CampanaDelPrecio | null {
  if (!esObjeto(v)) return null;
  const nombre = texto(v.nombre);
  return nombre ? { nombre, pct: numero(v.pct), hasta: texto(v.hasta) } : null;
}

function precioDeJson(v: unknown, nombre: string): PrecioEnTienda | null {
  if (!esObjeto(v)) return null;
  const precio = numero(v.precio);
  const precioFinal = numero(v.precio_final) ?? precio;
  // Sin precio no se ofrece, diga lo que diga `se_ofrece`: no se inventa un precio.
  const seOfrece = v.se_ofrece === true && precio !== null;
  return {
    id: texto(v.id),
    nombre: texto(v.nombre) ?? nombre,
    seOfrece,
    precio: seOfrece ? precio : null,
    precioFinal: seOfrece ? precioFinal : null,
    desde: seOfrece && v.desde === true,
    campana: seOfrece ? campanaDeJson(v.campana) : null,
  };
}

/** Lo que devuelve `fn_vitrina_precios_modelo`: `{ sedes: [...], todas: {...} }`. `null` si no tiene esa forma. */
export function preciosDelModeloDeJson(v: unknown): PreciosDelModelo | null {
  if (!esObjeto(v) || !Array.isArray(v.sedes)) return null;
  const sedes = v.sedes.map((s) => precioDeJson(s, "Tienda")).filter((s): s is PrecioEnTienda => s !== null);
  const todas = precioDeJson(v.todas, "Sin elegir tienda") ?? { id: null, nombre: "Sin elegir tienda", seOfrece: false, precio: null, precioFinal: null, desde: false, campana: null };
  return { sedes, todas };
}

/** Cómo se dice el precio de una tienda: lo que paga (con «Desde» si corresponde), el de lista tachado si hay campaña, y la campaña. */
export type TextoDePrecio = { principal: string; tachado: string | null; campana: string | null };

export function textoDePrecio(p: PrecioEnTienda): TextoDePrecio {
  if (!p.seOfrece || p.precio === null) return { principal: "No se ofrece: sin precio en esta tienda", tachado: null, campana: null };
  const final = p.precioFinal ?? p.precio;
  const conCampana = final < p.precio;
  const monto = `${p.desde ? "Desde " : ""}${soles(final)}`;
  const c = p.campana;
  const campana = conCampana && c ? [c.nombre, c.pct !== null ? `−${Math.round(c.pct)} %` : null, c.hasta ? `hasta el ${fechaCorta(c.hasta)}` : null].filter(Boolean).join(" · ") : null;
  return { principal: monto, tachado: conCampana ? soles(p.precio) : null, campana };
}

const igual = (a: PrecioEnTienda, b: PrecioEnTienda) => a.precio === b.precio && a.precioFinal === b.precioFinal && a.desde === b.desde;

/** La línea para quien no elige tienda: «Sin elegir tienda, el cliente ve el mayor: S/ 99.90». Solo cuando difiere de lo que dice alguna tienda
 *  que sí lo ofrece (con una sola tienda, o con el mismo precio en todas, repetirla sería ruido). `null` si no hay nada que decir. */
export function lineaSinElegirTienda(p: PreciosDelModelo): string | null {
  const ofrecen = p.sedes.filter((s) => s.seOfrece);
  if (!p.todas.seOfrece || ofrecen.length < 2) return null;
  if (ofrecen.every((s) => igual(s, p.todas))) return null;
  return `Sin elegir tienda, el cliente ve el mayor: ${textoDePrecio(p.todas).principal}.`;
}
