import { z } from "zod";
import { insigniasDeLaTarjeta, leerInsignias, type Insignia, type InsigniasDeLaTarjeta } from "./insignias";
import { parametrosDeFiltros, type Elegido } from "./filtros-color-talla";
import { pctTexto } from "./portada";
import { esquemaStockModelo, type StockModelo } from "./stock";
import type { Lista } from "./listas";

// Las listas y lo de arriba de cada una viven en `listas.ts`, sin zod: el esqueleto de la lista (del navegador) escribe su título real.
export { cabeceraDeLista, leerLista, type Lista } from "./listas";

// El catálogo de la tienda (ADR-0408, actividades 3 a 5): lo que se publicó en Catálogo ▸ Vitrina web, tal como lo devuelve
// `retail.tienda_catalogo(p_sede)`. La base decide qué se ve y a qué precio: el de la tienda elegida o, con «Todas», el mayor entre las
// tiendas de la web (no hay precio web: Felipe, 2026-10-14), con la campaña encima según la regla de la caja; cuánto hay en cada
// tienda como NIVEL (`lib/stock.ts`), nunca la cifra; si está en «Lo nuevo» y su puesto en «Más vendidos», nunca cuántas se vendieron.
// Aquí solo se valida la forma y se prepara lo que dibujan la tarjeta y las listas.

const esquemaColor = z.object({
  codigo: z.string().min(1),
  nombre: z.string().min(1),
  hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable(),
  foto: z.string().url().nullable(),
});

const esquemaPrenda = z
  .object({
    id: z.string().uuid(),
    codigo: z.string().nullable(),
    nombre: z.string().min(1),
    categoria: z.object({ nombre: z.string().min(1), prefijo: z.string().nullable() }).nullable(),
    // La familia de la categoría (indumentaria, accesorios…), para ubicar en su sección una categoría que la tabla de grupos no conoce. Una base
    // que todavía no la manda no rompe nada: queda sin familia.
    categoria_familia: z.string().nullish().catch(null),
    // De qué empresa es la prenda (CAYLA o CLAURE, ADR-0465). Sin el dato (una base que aún no lo manda), la tarjeta no dibuja la insignia.
    empresa: z.object({ clave: z.string().min(1), nombre: z.string().min(1) }).nullable().catch(null),
    // El precio del modelo en la tienda elegida (con «Todas», el mayor entre las tiendas de la web).
    precio: z.number().positive(),
    // Lo que paga el cliente con la campaña (el mismo `precio` si no hay); `desde`: la campaña no toca a todas sus tallas por igual.
    precio_final: z.number().nonnegative(),
    desde: z.boolean(),
    // La campaña que da ese precio, con su id (para agrupar las ofertas) y su último día (fecha de Lima, o null sin fecha de término).
    campana: z
      .object({
        id: z.string().uuid().nullish().catch(null),
        nombre: z.string().min(1),
        pct: z.number().positive(),
        hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish().catch(null),
      })
      .nullable(),
    colores: z.array(esquemaColor),
    fotos: z.array(z.string().url()).max(2),
    // El nivel del modelo en cada tienda de la web y en todas. Si llega raro, sin dato: la tarjeta no dice nada del stock y el
    // filtro por tienda no la esconde (no se afirma lo que no se sabe).
    stock: esquemaStockModelo.nullable().catch(null),
    // «Lo nuevo»: hace cuántos días llegó (0 a 30; null si está fijado en la Vitrina y llegó antes). null si no está.
    nuevo: z.object({ dias: z.number().int().min(0).max(30).nullable() }).nullable().catch(null),
    // Su puesto en «Más vendidos» (1 a 20), o null. Nunca las unidades.
    vendidos: z.number().int().min(1).max(20).nullable().catch(null),
    // Las insignias asignadas en Catálogo ▸ Insignias que ve el cliente (ADR-0489, act. c): todas, en el orden de la base; la tarjeta decide cuántas
    // caben (`insigniasAsignadasDeTarjeta`). Sin el campo (una base que aún no lo manda), ninguna: nunca un error.
    insignias: z.array(z.unknown()).catch([]),
  })
  .refine((p) => p.precio_final <= p.precio);

export type Color = z.infer<typeof esquemaColor>;
export type CampanaPrenda = { id: string | null; nombre: string; pct: number; hasta: string | null };
export type Prenda = {
  id: string;
  codigo: string | null;
  nombre: string;
  categoria: { nombre: string; prefijo: string | null; familia?: string | null } | null;
  empresa: { clave: string; nombre: string } | null;
  precio: number;
  precioFinal: number;
  desde: boolean;
  campana: CampanaPrenda | null;
  colores: Color[];
  fotos: string[];
  stock: StockModelo | null;
  nuevo: { dias: number | null } | null;
  vendidos: number | null;
  /** Las insignias de Catálogo ▸ Insignias de la prenda (sin las de descuento: ese es el sello rojo), por grupo y nombre. */
  insignias: Insignia[];
};

/** El catálogo leído: sus prendas y la tienda cuyo precio usó la base (`null`: «Todas»). */
export type Catalogo = { sede: string | null; prendas: Prenda[] };

/**
 * Lo que devuelve la base. Una prenda con un dato raro se descarta sola (las demás se ven igual); si la respuesta entera no tiene
 * la forma de un catálogo, `null`: la página dice que no se pudo cargar, nunca se cae (principio 9).
 */
export function interpretarCatalogo(dato: unknown): Catalogo | null {
  const lista = z.object({ sede: z.string().uuid().nullable().catch(null), prendas: z.array(z.unknown()) }).safeParse(dato);
  if (!lista.success) return null;
  return {
    sede: lista.data.sede,
    prendas: lista.data.prendas.flatMap((p) => {
      const r = esquemaPrenda.safeParse(p);
      if (!r.success) return [];
      const d = r.data;
      return [{
        id: d.id,
        codigo: d.codigo,
        nombre: d.nombre,
        categoria: d.categoria ? { ...d.categoria, familia: d.categoria_familia ?? null } : null,
        empresa: d.empresa,
        precio: d.precio,
        precioFinal: d.precio_final,
        desde: d.desde,
        campana: d.campana ? { id: d.campana.id ?? null, nombre: d.campana.nombre, pct: d.campana.pct, hasta: d.campana.hasta ?? null } : null,
        colores: d.colores,
        fotos: d.fotos,
        stock: d.stock,
        nuevo: d.nuevo,
        vendidos: d.vendidos,
        insignias: leerInsignias(d.insignias),
      }];
    }),
  };
}

/* ---------------- La tarjeta ---------------- */

/** «S/ 74.90», «S/ 1,250.00»: como lo escribe la caja. */
export const soles = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export type PrecioTarjeta = {
  /** Lo que paga el cliente: «S/ 65.90», o «Desde S/ 65.90» si la campaña toca solo algunas tallas o colores. Un modelo que cuesta
   *  distinto en cada tienda NO dice «Desde»: con «Todas» dice el mayor, y baja al elegir la tienda (Felipe, 2026-10-14). */
  principal: string;
  /** El precio del modelo tachado, solo si hay descuento. */
  anterior: string | null;
  oferta: boolean;
};

export function precioTarjeta(p: Prenda): PrecioTarjeta {
  const conDescuento = p.precioFinal < p.precio;
  return {
    principal: `${conDescuento && p.desde ? "Desde " : ""}${soles(conDescuento ? p.precioFinal : p.precio)}`,
    anterior: conDescuento ? soles(p.precio) : null,
    oferta: conDescuento,
  };
}

/** La insignia roja de la foto: «−12 %». */
export const insigniaOferta = (p: Prenda): string | null => (p.campana && p.precioFinal < p.precio ? `−${pctTexto(p.campana.pct)} %` : null);

/** Una insignia de la foto de la tarjeta: de qué es y qué dice. */
export type InsigniaTarjeta = { clave: "puesto" | "oferta" | "nuevo" | "empresa"; texto: string };

/**
 * Las insignias de la foto, de arriba abajo: el puesto en Más vendidos, la campaña, «Nuevo» y la empresa de la prenda (ADR-0465, Felipe
 * 2026-10-20: la de la empresa es la de «Nuevo» con su nombre, y va DEBAJO de «Nuevo»; si la tarjeta no la tiene, va ARRIBA de todas).
 */
export function insigniasDeTarjeta(p: Prenda, { puesto, sinNuevo = false }: { puesto?: number | null; sinNuevo?: boolean } = {}): InsigniaTarjeta[] {
  const oferta = insigniaOferta(p);
  const nueva = Boolean(p.nuevo) && !sinNuevo;
  const empresa: InsigniaTarjeta[] = p.empresa ? [{ clave: "empresa", texto: p.empresa.nombre }] : [];
  return [
    ...(nueva ? [] : empresa),
    ...(puesto ? [{ clave: "puesto" as const, texto: `N.º ${puesto}` }] : []),
    ...(oferta ? [{ clave: "oferta" as const, texto: oferta }] : []),
    ...(nueva ? [{ clave: "nuevo" as const, texto: "Nuevo" }, ...empresa] : []),
  ];
}

/**
 * Las insignias de Catálogo ▸ Insignias que caben en la tarjeta (ADR-0489, act. c; Felipe 2026-10-23): el tope es de 3 EN TOTAL —el descuento, «Nuevo»
 * y el puesto cuentan, igual que las asignadas— y lo que no cabe se dice en un «+2». La empresa (CAYLA o CLAURE) no cuenta. Con las mismas opciones
 * que `insigniasDeTarjeta`, que es lo que la tarjeta ya dibuja de lo suyo.
 */
export function insigniasAsignadasDeTarjeta(p: Prenda, opciones: { puesto?: number | null; sinNuevo?: boolean } = {}): InsigniasDeLaTarjeta {
  const propias = insigniasDeTarjeta(p, opciones).filter((i) => i.clave !== "empresa").length;
  // «Nuevo» se mira por lo que la prenda ES (llegó hace poco), no por si la lista lo escribe en cada tarjeta: en «Lo nuevo» tampoco se repite.
  return insigniasDeLaTarjeta(p.insignias, { propias, nuevo: p.nuevo !== null, masVendido: opciones.puesto != null });
}

/** Las muestras de color de la tarjeta: hasta `max`, y cuántas más hay. Con colores elegidos en los filtros (`elegidos`: sus códigos, ADR-0512)
 *  esos van primero, para que se vean aunque la prenda tenga más de las que caben. */
export function muestras(p: Prenda, max = 5, elegidos: readonly string[] = []): { visibles: Color[]; mas: number } {
  const colores = elegidos.length > 0 ? [...p.colores.filter((c) => elegidos.includes(c.codigo)), ...p.colores.filter((c) => !elegidos.includes(c.codigo))] : p.colores;
  return { visibles: colores.slice(0, max), mas: Math.max(0, colores.length - max) };
}

/** Las dos fotos de la tarjeta: la principal y la que aparece al pasar el mouse. Sin fotos del modelo, la de su primer color que tenga
 *  una (propuesta c: un color sin foto propia se ve con la principal, y al revés). Con un color elegido en los filtros (`color`, su código,
 *  ADR-0512) que tiene foto propia, esa va primero: se ve la prenda en el color que se buscó (si no tiene, la de siempre). */
export function fotosDeTarjeta(p: Prenda, color: string | null = null): [string | null, string | null] {
  const delColor = color ? p.colores.find((c) => c.codigo === color)?.foto ?? null : null;
  if (delColor) return [delColor, [...p.fotos, ...p.colores.map((c) => c.foto)].find((f) => f && f !== delColor) ?? null];
  const primera = p.fotos[0] ?? p.colores.find((c) => c.foto)?.foto ?? null;
  return [primera, p.fotos[1] ?? null];
}

/** ¿Su tarjeta se ve con una foto (la suya o la de un color)? Si no, se ve con su silueta. */
const tieneFoto = (p: Prenda): boolean => fotosDeTarjeta(p)[0] !== null;

/** Para ordenar con lo que tiene foto adelante. `sort` es estable: dentro de cada parte queda el orden que ya traía la lista. */
export const conFotoPrimero = (a: Prenda, b: Prenda): number => Number(tieneFoto(b)) - Number(tieneFoto(a));

/** El color con que se dibuja la prenda sin foto: el de su primer color o, con un color elegido en los filtros (`color`, su código), el de ese
 *  (es un dato de la prenda, no del tema). */
export const colorDeDibujo = (p: Prenda, color: string | null = null): string | null => (color ? p.colores.find((c) => c.codigo === color)?.hex : null) ?? p.colores[0]?.hex ?? null;

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

/** A dónde lleva una tarjeta: la ficha de la prenda, con la tienda elegida si hay una. */
export const hrefDePrenda = (
  p: Pick<Prenda, "id">,
  sede: string | null = null,
  /** Con color o talla elegidos en los filtros (ADR-0512), la ficha abre ya con eso: `?color=` es el código del color y `?talla=`, la talla. */
  elegido: { color?: string | null; talla?: string | null } = {},
) => {
  const q = [sede ? `sede=${encodeURIComponent(sede)}` : "", elegido.color ? `color=${encodeURIComponent(elegido.color)}` : "", elegido.talla ? `talla=${encodeURIComponent(elegido.talla)}` : ""].filter(Boolean);
  return `/catalogo/${p.id}${q.length > 0 ? `?${q.join("&")}` : ""}`;
};

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

/* ---------------- La lista: cuál, categorías y orden ---------------- */

export type Orden = "destacado" | "precio-asc" | "precio-desc";
export const ORDENES: readonly Orden[] = ["destacado", "precio-asc", "precio-desc"];

const unValor = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** La campaña elegida en las ofertas (`?campana=`, su id); cualquier otra cosa, todas. */
export const leerCampana = (v: string | string[] | undefined): string | null => {
  const c = unValor(v)?.trim();
  return c && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c) ? c.toLowerCase() : null;
};

/** El orden de la URL; cualquier otra cosa, el destacado. */
export const leerOrden = (v: string | string[] | undefined): Orden => {
  const o = unValor(v);
  return ORDENES.includes(o as Orden) ? (o as Orden) : "destacado";
};

/** El botón de orden pasa al siguiente: Destacado → Menor precio → Mayor precio → Destacado. */
export const siguienteOrden = (o: Orden): Orden => ORDENES[(ORDENES.indexOf(o) + 1) % ORDENES.length];

/** Cómo se llama cada orden; el «destacado» es el propio de cada lista (maqueta: «Más reciente» en Lo nuevo, «Ranking» en Más vendidos). */
export function nombreOrden(o: Orden, lista: Lista = "todo"): string {
  if (o === "precio-asc") return "Menor precio";
  if (o === "precio-desc") return "Mayor precio";
  return lista === "nuevo" ? "Más reciente" : lista === "vendidos" ? "Ranking" : "Destacado";
}

/** ¿Tiene descuento? (la campaña baja lo que se paga). */
export const enOferta = (p: Prenda): boolean => p.precioFinal < p.precio;

/** ¿La prenda va en esa lista? Lo nuevo: lo que la base marcó nuevo; Más vendidos: lo que tiene puesto; las ofertas: lo que tiene
 *  descuento (y, si se eligió una campaña, de esa campaña). Los favoritos llegan ya elegidos (`deFavoritos`): todas van. */
export function enLaLista(p: Prenda, lista: Lista, campana: string | null = null): boolean {
  if (lista === "nuevo") return p.nuevo !== null;
  if (lista === "vendidos") return p.vendidos !== null;
  if (lista === "ofertas") return enOferta(p) && (!campana || p.campana?.id === campana);
  return true;
}

/** «Tus favoritos»: las prendas del catálogo que el cliente guardó, en el orden en que llegan (lo último guardado primero). No se
 *  filtran por la tienda elegida (maqueta, `vLista`): lo guardado se ve aunque hoy no esté en esa tienda, y la tarjeta dice dónde
 *  hay. Lo que ya no está en la tienda online no llega en el catálogo y no se ve. */
export function deFavoritos(prendas: readonly Prenda[], favoritos: Iterable<string>): Prenda[] {
  const porId = new Map(prendas.map((p) => [p.id, p]));
  return [...favoritos].flatMap((id) => {
    const p = porId.get(id);
    return p ? [p] : [];
  });
}

/** Lo nuevo, de lo que llegó hace menos a lo que llegó hace más (lo fijado sin días, al final); empate, el orden de la base. */
export const porLlegada = (a: Prenda, b: Prenda): number => (a.nuevo?.dias ?? 99) - (b.nuevo?.dias ?? 99);

/** Más vendidos, por su puesto. */
export const porPuesto = (a: Prenda, b: Prenda): number => (a.vendidos ?? 99) - (b.vendidos ?? 99);

export type CampanaVigente = { id: string; nombre: string; pct: number; hasta: string | null; cuantas: number };

/** Las campañas con prendas en oferta y cuántas tiene cada una: la que termina primero adelante (las sin fecha, al final); empate,
 *  el mayor descuento y el nombre. Las píldoras de las ofertas del Inicio y las tarjetas de campaña de la lista. */
export function campanasDe(prendas: readonly Prenda[]): CampanaVigente[] {
  const porId = new Map<string, CampanaVigente>();
  for (const p of prendas) {
    if (!enOferta(p) || !p.campana?.id) continue;
    const c = porId.get(p.campana.id) ?? { id: p.campana.id, nombre: p.campana.nombre, pct: p.campana.pct, hasta: p.campana.hasta, cuantas: 0 };
    c.cuantas += 1;
    porId.set(p.campana.id, c);
  }
  return [...porId.values()].sort(
    (a, b) => (a.hasta ?? "9999").localeCompare(b.hasta ?? "9999") || b.pct - a.pct || a.nombre.localeCompare(b.nombre, "es"),
  );
}

/** La clave de una categoría en la URL: su prefijo (si no tiene, su nombre). */
export const claveCategoria = (c: Prenda["categoria"]): string | null => (c ? c.prefijo ?? c.nombre : null);

export const leerCategoria = (v: string | string[] | undefined): string | null => {
  const c = unValor(v)?.trim();
  return c ? c.slice(0, 80) : null;
};

export type CategoriaLista = { clave: string; nombre: string; cuantas: number; familia?: string | null };

/** Las categorías que tienen algo publicado, de la que más tiene a la que menos (empate: por nombre). */
export function categoriasDe(prendas: readonly Prenda[]): CategoriaLista[] {
  const porClave = new Map<string, CategoriaLista>();
  for (const p of prendas) {
    const clave = claveCategoria(p.categoria);
    if (!clave || !p.categoria) continue;
    const c = porClave.get(clave) ?? { clave, nombre: p.categoria.nombre, cuantas: 0, familia: p.categoria.familia };
    c.cuantas += 1;
    porClave.set(clave, c);
  }
  return [...porClave.values()].sort((a, b) => b.cuantas - a.cuantas || a.nombre.localeCompare(b.nombre, "es"));
}

/** Lo que se ve con la lista, la campaña, la categoría y el orden elegidos. «Destacado» es el orden propio de la lista: en toda la tienda
 *  y en las ofertas, el de la base (lo último que entró a la web primero); en Lo nuevo, lo más reciente; en Más vendidos, el ranking.
 *  Por precio, lo que paga el cliente (con la campaña).
 *
 *  Con «Destacado», lo que tiene foto va adelante y, dentro de cada parte, ese mismo orden (2026-10-16): una lista que abre con siluetas
 *  dibujadas (la percha) no se ve como una tienda, y la primera fila es lo que más se mira. Más vendidos y tus favoritos se quedan con su
 *  orden porque dice algo: el puesto («N.º 1») y lo último que guardaste. Por precio tampoco se toca: la persona pidió ese orden. */
export function filtrarYOrdenar(
  prendas: readonly Prenda[],
  { categoria, orden, lista = "todo", campana = null }: { categoria: string | null; orden: Orden; lista?: Lista; campana?: string | null },
): Prenda[] {
  const salida = prendas.filter((p) => enLaLista(p, lista, campana) && (!categoria || claveCategoria(p.categoria) === categoria));
  if (orden === "precio-asc") salida.sort((a, b) => a.precioFinal - b.precioFinal || a.nombre.localeCompare(b.nombre, "es"));
  else if (orden === "precio-desc") salida.sort((a, b) => b.precioFinal - a.precioFinal || a.nombre.localeCompare(b.nombre, "es"));
  else if (lista === "nuevo") salida.sort(porLlegada);
  else if (lista === "vendidos") salida.sort(porPuesto);
  if (orden === "destacado" && lista !== "vendidos" && lista !== "favoritos") salida.sort(conFotoPrimero);
  return salida;
}

/** La dirección de la lista con lo elegido (sin repetir lo que ya es por defecto). `sede`: la clave de la tienda elegida
 *  (`lib/sede-elegida.ts`), o `null` para «Todas». */
export function hrefLista({
  sede = null,
  categoria,
  orden,
  lista = "todo",
  campana = null,
  grupo = null,
  menu = null,
  colorTalla = null,
}: {
  sede?: string | null;
  categoria: string | null;
  orden: Orden;
  lista?: Lista;
  campana?: string | null;
  /** Un grupo de categorías (`lib/grupos.ts`, «Arriba», «Bolsos y accesorios»…). Con una categoría elegida no va: ella ya dice el grupo. */
  grupo?: string | null;
  /** Un menú de la cabecera (`lib/grupos.ts`: «ropa», «accesorios»): toda la ropa junta. Se queda aunque se elija un grupo o una categoría
   *  de adentro, para que la lista siga siendo «dentro de la ropa». */
  menu?: string | null;
  /** Lo elegido en los filtros de color y talla (ADR-0512): va como `?color=negro,blanco&talla=M`, en el orden fijo de la tienda y solo lo que
   *  hay. Los favoritos no se filtran: ahí no va. */
  colorTalla?: Elegido | null;
}): string {
  const q = new URLSearchParams();
  if (lista !== "todo") q.set("lista", lista);
  if (sede) q.set("sede", sede);
  if (menu) q.set("menu", menu);
  if (categoria) q.set("categoria", categoria);
  else if (grupo) q.set("grupo", grupo);
  if (lista === "ofertas" && campana) q.set("campana", campana);
  if (orden !== "destacado") q.set("orden", orden);
  const s = [q.toString(), ...(colorTalla && lista !== "favoritos" ? parametrosDeFiltros(colorTalla) : [])].filter(Boolean).join("&");
  return s ? `/catalogo?${s}` : "/catalogo";
}

/** «12 prendas», «1 prenda». */
export const cuantasPrendas = (n: number) => `${n} ${n === 1 ? "prenda" : "prendas"}`;

/**
 * La línea de cuántas hay (maqueta, `vLista`): «12 prendas», «12 prendas en Faldas», «5 prendas en Trujillo · 3 más en otras
 * tiendas», «2 prendas de Faldas en Trujillo». `enOtras`: las que se ven con «Todas» y no están en la tienda elegida.
 */
export function conteoDeLista(n: number, { categoria, tienda, enOtras }: { categoria: string | null; tienda: string | null; enOtras: number }): string {
  const donde = tienda ? `${categoria ? ` de ${categoria}` : ""} en ${tienda}` : categoria ? ` en ${categoria}` : "";
  return `${cuantasPrendas(n)}${donde}${tienda && enOtras > 0 ? ` · ${enOtras} más en otras tiendas` : ""}`;
}
