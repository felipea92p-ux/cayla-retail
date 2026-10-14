import { z } from "zod";
import { pctTexto } from "./portada";

// El catálogo de la tienda (ADR-0408, actividad 3): lo que se publicó en Catálogo ▸ Vitrina web, tal como lo devuelve
// `retail.tienda_catalogo()`. La base decide qué se ve y a qué precio (el web y el de la campaña, con la regla de la caja); aquí solo
// se valida la forma y se prepara lo que dibuja la tarjeta. Sin stock: los niveles por tienda son la actividad 4.

const esquemaColor = z.object({
  codigo: z.string().min(1),
  nombre: z.string().min(1),
  hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable(),
  foto: z.string().url().nullable(),
});

const esquemaPrenda = z.object({
  id: z.string().uuid(),
  codigo: z.string().nullable(),
  nombre: z.string().min(1),
  categoria: z.object({ nombre: z.string().min(1), prefijo: z.string().nullable() }).nullable(),
  precio_web: z.number().positive(),
  // Lo menos y lo más que paga el cliente por una talla del modelo (con la campaña, si toca alguna).
  precio: z.number().positive(),
  precio_hasta: z.number().positive(),
  campana: z.object({ nombre: z.string().min(1), pct: z.number().positive() }).nullable(),
  colores: z.array(esquemaColor),
  fotos: z.array(z.string().url()).max(2),
});

export type Color = z.infer<typeof esquemaColor>;
export type Prenda = {
  id: string;
  codigo: string | null;
  nombre: string;
  categoria: { nombre: string; prefijo: string | null } | null;
  precioWeb: number;
  precio: number;
  precioHasta: number;
  campana: { nombre: string; pct: number } | null;
  colores: Color[];
  fotos: string[];
};

/**
 * Lo que devuelve la base. Una prenda con un dato raro se descarta sola (las demás se ven igual); si la respuesta entera no tiene
 * la forma de un catálogo, `null`: la página dice que no se pudo cargar, nunca se cae (principio 9).
 */
export function interpretarCatalogo(dato: unknown): Prenda[] | null {
  const lista = z.object({ prendas: z.array(z.unknown()) }).safeParse(dato);
  if (!lista.success) return null;
  return lista.data.prendas.flatMap((p) => {
    const r = esquemaPrenda.safeParse(p);
    if (!r.success) return [];
    const d = r.data;
    return [{
      id: d.id,
      codigo: d.codigo,
      nombre: d.nombre,
      categoria: d.categoria,
      precioWeb: d.precio_web,
      precio: d.precio,
      precioHasta: d.precio_hasta,
      campana: d.campana,
      colores: d.colores,
      fotos: d.fotos,
    }];
  });
}

/* ---------------- La tarjeta ---------------- */

/** «S/ 74.90», «S/ 1,250.00»: como lo escribe la caja. */
export const soles = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export type PrecioTarjeta = {
  /** Lo que paga el cliente: «S/ 65.90», o «Desde S/ 65.90» si la campaña toca solo algunas tallas o colores. */
  principal: string;
  /** El precio web tachado, solo si hay descuento. */
  anterior: string | null;
  oferta: boolean;
};

export function precioTarjeta(p: Prenda): PrecioTarjeta {
  const conDescuento = p.precio < p.precioWeb;
  const desde = p.precio < p.precioHasta;
  return {
    principal: `${desde ? "Desde " : ""}${soles(p.precio)}`,
    anterior: conDescuento ? soles(p.precioWeb) : null,
    oferta: conDescuento,
  };
}

/** La insignia roja de la foto: «−12 %». */
export const insigniaOferta = (p: Prenda): string | null => (p.campana && p.precio < p.precioWeb ? `−${pctTexto(p.campana.pct)} %` : null);

/** Las muestras de color de la tarjeta: hasta `max`, y cuántas más hay. */
export function muestras(p: Prenda, max = 5): { visibles: Color[]; mas: number } {
  return { visibles: p.colores.slice(0, max), mas: Math.max(0, p.colores.length - max) };
}

/** Las dos fotos de la tarjeta: la principal y la que aparece al pasar el mouse. Sin fotos del modelo, la de su primer color que tenga
 *  una (propuesta c: un color sin foto propia se ve con la principal, y al revés). */
export function fotosDeTarjeta(p: Prenda): [string | null, string | null] {
  const primera = p.fotos[0] ?? p.colores.find((c) => c.foto)?.foto ?? null;
  return [primera, p.fotos[1] ?? null];
}

/** El color con que se dibuja la prenda sin foto: el de su primer color (es un dato de la prenda, no del tema). */
export const colorDeDibujo = (p: Prenda): string | null => p.colores[0]?.hex ?? null;

/** La silueta de la prenda sin foto, por su categoría (`categorias.prefijo`, nunca el nombre visible, que se renombra). Lo que no es
 *  ropa (calzado, bisutería, accesorios) cae en la percha: no promete una forma que no tiene. */
export type Forma = "blusa" | "vestido" | "pantalon" | "casaca" | "polo" | "falda" | "bolso" | "percha";
const FORMA_POR_PREFIJO: Record<string, Forma> = {
  CMS: "blusa", BLU: "blusa", TOP: "blusa", LEN: "blusa", TBA: "blusa",
  VES: "vestido", CON: "vestido",
  PAN: "pantalon", JEA: "pantalon", ENT: "pantalon", SHO: "pantalon",
  CAS: "casaca", CHA: "casaca", ABR: "casaca", BLZ: "casaca",
  POL: "polo", BOD: "polo", SUD: "polo", CMP: "polo",
  FAL: "falda",
  CAR: "bolso", MOC: "bolso", RIN: "bolso",
};
export const formaDe = (prefijo: string | null | undefined): Forma => (prefijo ? FORMA_POR_PREFIJO[prefijo] ?? "percha" : "percha");

/** A dónde lleva una tarjeta: la ficha de la prenda (la arma la actividad 4). */
export const hrefDePrenda = (p: Pick<Prenda, "id">) => `/catalogo/${p.id}`;

/** ¿El optimizador de imágenes de Next puede achicar esta foto? Solo si vive en el almacén PÚBLICO de fotos de prendas del origen
 *  que permite `next.config.ts` (`TIENDA_FOTOS_ORIGEN`). Cualquier otra se muestra tal cual: con un host no permitido, `next/image`
 *  no falla en silencio, tumba la página. */
export function fotoOptimizable(url: string, origen: string | undefined): boolean {
  if (!origen) return false;
  try {
    const foto = new URL(url);
    return foto.origin === new URL(origen).origin && foto.pathname.startsWith("/storage/v1/object/public/retail-productos-fotos/");
  } catch {
    return false;
  }
}

/* ---------------- La lista: categorías y orden ---------------- */

export type Orden = "destacado" | "precio-asc" | "precio-desc";
export const ORDENES: readonly Orden[] = ["destacado", "precio-asc", "precio-desc"];
export const NOMBRE_ORDEN: Record<Orden, string> = { destacado: "Destacado", "precio-asc": "Menor precio", "precio-desc": "Mayor precio" };

const unValor = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** El orden de la URL; cualquier otra cosa, el destacado. */
export const leerOrden = (v: string | string[] | undefined): Orden => {
  const o = unValor(v);
  return ORDENES.includes(o as Orden) ? (o as Orden) : "destacado";
};

/** El botón de orden pasa al siguiente: Destacado → Menor precio → Mayor precio → Destacado. */
export const siguienteOrden = (o: Orden): Orden => ORDENES[(ORDENES.indexOf(o) + 1) % ORDENES.length];

/** La clave de una categoría en la URL: su prefijo (si no tiene, su nombre). */
export const claveCategoria = (c: Prenda["categoria"]): string | null => (c ? c.prefijo ?? c.nombre : null);

export const leerCategoria = (v: string | string[] | undefined): string | null => {
  const c = unValor(v)?.trim();
  return c ? c.slice(0, 80) : null;
};

export type CategoriaLista = { clave: string; nombre: string; cuantas: number };

/** Las categorías que tienen algo publicado, de la que más tiene a la que menos (empate: por nombre). */
export function categoriasDe(prendas: readonly Prenda[]): CategoriaLista[] {
  const porClave = new Map<string, CategoriaLista>();
  for (const p of prendas) {
    const clave = claveCategoria(p.categoria);
    if (!clave || !p.categoria) continue;
    const c = porClave.get(clave) ?? { clave, nombre: p.categoria.nombre, cuantas: 0 };
    c.cuantas += 1;
    porClave.set(clave, c);
  }
  return [...porClave.values()].sort((a, b) => b.cuantas - a.cuantas || a.nombre.localeCompare(b.nombre, "es"));
}

/** Lo que se ve con la categoría y el orden elegidos. «Destacado» es el orden de la base: lo último que entró a la web primero. */
export function filtrarYOrdenar(prendas: readonly Prenda[], { categoria, orden }: { categoria: string | null; orden: Orden }): Prenda[] {
  const lista = categoria ? prendas.filter((p) => claveCategoria(p.categoria) === categoria) : [...prendas];
  if (orden === "precio-asc") lista.sort((a, b) => a.precio - b.precio || a.nombre.localeCompare(b.nombre, "es"));
  if (orden === "precio-desc") lista.sort((a, b) => b.precio - a.precio || a.nombre.localeCompare(b.nombre, "es"));
  return lista;
}

/** La dirección de la lista con lo elegido (sin repetir lo que ya es por defecto). */
export function hrefLista({ categoria, orden }: { categoria: string | null; orden: Orden }): string {
  const q = new URLSearchParams();
  if (categoria) q.set("categoria", categoria);
  if (orden !== "destacado") q.set("orden", orden);
  const s = q.toString();
  return s ? `/catalogo?${s}` : "/catalogo";
}

/** «12 prendas», «1 prenda». */
export const cuantasPrendas = (n: number) => `${n} ${n === 1 ? "prenda" : "prendas"}`;
