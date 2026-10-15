import { z } from "zod";
import { cuantasPrendas, precioTarjeta, soles, type PrecioTarjeta } from "./catalogo";

// «Arma tu look» (ADR-0408, actividad 11; maqueta v4, `vLooks`, `vLook`, `lamina`, `lookInfo`; propuesta h): las combinaciones que el ERP
// arma en Vitrina web ▸ Looks, tal como las devuelven `retail.tienda_looks(p_sede)` y `retail.tienda_look(p_id, p_sede)`. La base decide qué
// look se ve (encendido y con todas sus prendas a la vista) y cuánto vale cada prenda: EXACTAMENTE lo que dice el catálogo para la tienda
// elegida (con «Todas», el mayor entre las tiendas de la web), con la campaña encima. Aquí solo se valida la forma y se prepara lo que
// se dibuja; elegir las tallas es estado de la página (nada se guarda hasta que la bolsa lo reciba).

const uuid = z.string().uuid();

const esquemaTalla = z.object({
  variante_id: uuid,
  talla: z.string().min(1),
  // Si hay algo disponible en alguna tienda de la web. Nunca la cifra (ADR-0408, DECIDÍ 6).
  hay: z.boolean(),
});

const esquemaPieza = z.object({
  posicion: z.number().int().min(1).max(4),
  // Dónde va en la lámina: en % del ancho y del alto, y cuánto gira (los de la maqueta).
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  ancho: z.number().positive().max(100),
  giro: z.number().min(-45).max(45),
  prenda: z
    .object({
      id: uuid,
      nombre: z.string().min(1),
      categoria: z.object({ nombre: z.string().min(1), prefijo: z.string().nullable() }).nullable(),
      precio: z.number().positive(),
      precio_final: z.number().nonnegative(),
      desde: z.boolean(),
      campana: z.object({ nombre: z.string().min(1), pct: z.number().positive() }).nullable(),
    })
    .refine((p) => p.precio_final <= p.precio),
  color: z.object({ codigo: z.string().min(1), nombre: z.string().min(1), hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable() }),
  foto: z.string().url().nullable(),
  tallas: z.array(esquemaTalla).optional(),
});

const esquemaLook = z.object({
  id: uuid,
  nombre: z.string().min(1),
  frase: z.string().min(1).nullable(),
  numero: z.number().int().positive(),
  de: z.number().int().positive(),
  total: z.number().positive(),
  total_final: z.number().nonnegative(),
  desde: z.boolean(),
  piezas: z.array(esquemaPieza).min(2).max(4),
});

export type TallaLook = { varianteId: string; talla: string; hay: boolean };
export type PiezaLook = {
  posicion: number;
  x: number;
  y: number;
  ancho: number;
  giro: number;
  prenda: {
    id: string;
    nombre: string;
    categoria: { nombre: string; prefijo: string | null } | null;
    precio: number;
    precioFinal: number;
    desde: boolean;
    campana: { nombre: string; pct: number } | null;
  };
  color: { codigo: string; nombre: string; hex: string | null };
  foto: string | null;
  /** Solo en un look abierto (`tienda_look`): sus tallas, en orden. */
  tallas: TallaLook[];
};
export type Look = {
  id: string;
  nombre: string;
  frase: string | null;
  /** «Look 2 de 4». */
  numero: number;
  de: number;
  total: number;
  totalFinal: number;
  desde: boolean;
  piezas: PiezaLook[];
};

/** Un look tal como llega; `null` si algo no tiene la forma: un look se ve completo o no se ve (no se dibuja a medias). */
function leerUno(dato: unknown): Look | null {
  const r = esquemaLook.safeParse(dato);
  if (!r.success) return null;
  const d = r.data;
  return {
    id: d.id,
    nombre: d.nombre,
    frase: d.frase,
    numero: d.numero,
    de: d.de,
    total: d.total,
    totalFinal: d.total_final,
    desde: d.desde,
    piezas: [...d.piezas]
      .sort((a, b) => a.posicion - b.posicion)
      .map((p) => ({
        posicion: p.posicion,
        x: p.x,
        y: p.y,
        ancho: p.ancho,
        giro: p.giro,
        prenda: {
          id: p.prenda.id,
          nombre: p.prenda.nombre,
          categoria: p.prenda.categoria,
          precio: p.prenda.precio,
          precioFinal: p.prenda.precio_final,
          desde: p.prenda.desde,
          campana: p.prenda.campana,
        },
        color: p.color,
        foto: p.foto,
        tallas: (p.tallas ?? []).map((t) => ({ varianteId: t.variante_id, talla: t.talla, hay: t.hay })),
      })),
  };
}

const envoltura = z.object({ sede: uuid.nullable().catch(null) });

/** Lo que devuelve `tienda_looks`: los looks que se ven y la tienda cuyo precio se usó (`null` = «Todas»). Si la respuesta entera no
 *  tiene esa forma, `null`: la página dice que no se pudo cargar, nunca se cae (principio 9). Un look raro se deja fuera. */
export function interpretarLooks(dato: unknown): { sede: string | null; looks: Look[] } | null {
  const r = envoltura.extend({ looks: z.array(z.unknown()) }).safeParse(dato);
  if (!r.success) return null;
  return {
    sede: r.data.sede,
    looks: r.data.looks.flatMap((l) => {
      const leido = leerUno(l);
      return leido ? [leido] : [];
    }),
  };
}

/** Lo que devuelve `tienda_look`: el look (o `null` si ya no se ve) y la tienda cuyo precio se usó. `null` si la respuesta es rara. */
export function interpretarLook(dato: unknown): { sede: string | null; look: Look | null } | null {
  const r = envoltura.extend({ look: z.unknown() }).safeParse(dato);
  if (!r.success) return null;
  return { sede: r.data.sede, look: r.data.look === null || r.data.look === undefined ? null : leerUno(r.data.look) };
}

/* ---------------- Lo que se dibuja ---------------- */

/** El precio de una prenda del look, con la misma regla de la tarjeta del catálogo: lo que paga y, si hay campaña, el precio tachado. */
export const precioDePieza = (p: PiezaLook): PrecioTarjeta =>
  precioTarjeta({
    ...p.prenda,
    codigo: null,
    colores: [],
    fotos: [],
    stock: null,
    nuevo: null,
    vendidos: null,
    campana: p.prenda.campana ? { id: null, hasta: null, ...p.prenda.campana } : null,
  });

/** «El look completo S/ 304.70» (o «Desde …» si una campaña no toca todas las tallas de alguna prenda). */
export const totalDelLook = (l: Pick<Look, "totalFinal" | "desde">): string => `${l.desde ? "Desde " : ""}${soles(l.totalFinal)}`;

/** «Look 2 · 3 prendas», la ceja de la tarjeta de un look en la lista. */
export const cejaDeLook = (l: Pick<Look, "numero" | "piezas">): string => `Look ${l.numero} · ${cuantasPrendas(l.piezas.length)}`;

/** La línea de la tarjeta: la frase y el total («desde» si una campaña no toca todas las tallas de alguna prenda). */
export const lineaDeLook = (l: Look): string => [l.frase, `${l.desde ? "desde " : ""}${soles(l.totalFinal)}`].filter(Boolean).join(" · ");

/* ---------------- Direcciones ---------------- */

const conSede = (ruta: string, sede: string | null) => (sede ? `${ruta}?sede=${encodeURIComponent(sede)}` : ruta);

/** «Arma tu look», con la tienda elegida (la clave de `lib/sede-elegida.ts`) o sin ella («Todas»). */
export const hrefLooks = (sede: string | null = null): string => conSede("/looks", sede);
export const hrefLook = (id: string, sede: string | null = null): string => conSede(`/looks/${id}`, sede);

/** La ficha de una prenda del look, con su color ya elegido y la tienda elegida. */
export function hrefDePieza(p: Pick<PiezaLook, "prenda" | "color">, sede: string | null = null): string {
  const q = new URLSearchParams();
  if (sede) q.set("sede", sede);
  q.set("color", p.color.codigo);
  return `/catalogo/${p.prenda.id}?${q.toString()}`;
}

/* ---------------- Elegir las tallas (propuesta h) ---------------- */

/** La talla elegida de cada prenda, por su posición en el look. */
export type TallasElegidas = Readonly<Record<number, string | undefined>>;

/** Al abrir: la prenda de una sola talla que hay ya viene elegida (maqueta, `t-look-bolsa`); las demás, sin elegir. */
export function tallasIniciales(l: Look): TallasElegidas {
  const elegidas: Record<number, string> = {};
  for (const p of l.piezas) if (p.tallas.length === 1 && p.tallas[0].hay) elegidas[p.posicion] = p.tallas[0].varianteId;
  return elegidas;
}

/** Tocar una talla la elige; tocar la elegida la suelta. Una talla que no hay no se elige. */
export function alternarTalla(elegidas: TallasElegidas, l: Look, posicion: number, varianteId: string): TallasElegidas {
  const talla = l.piezas.find((p) => p.posicion === posicion)?.tallas.find((t) => t.varianteId === varianteId);
  if (!talla?.hay) return elegidas;
  return { ...elegidas, [posicion]: elegidas[posicion] === varianteId ? undefined : varianteId };
}

/** Una línea para la bolsa: la variante elegida (modelo, color y talla) y cómo se llama. La bolsa vuelve a pedirle el precio a la base
 *  para la tienda donde se recoge: aquí no viaja ningún precio. */
export type LineaLook = { varianteId: string; productoId: string; nombre: string; color: string; talla: string };

/** Lo que se agrega: una línea por prenda con talla elegida (y que hay). La prenda sin talla no se agrega. */
export function lineasDelLook(l: Look, elegidas: TallasElegidas): LineaLook[] {
  return l.piezas.flatMap((p) => {
    const t = p.tallas.find((x) => x.varianteId === elegidas[p.posicion] && x.hay);
    return t ? [{ varianteId: t.varianteId, productoId: p.prenda.id, nombre: p.prenda.nombre, color: p.color.nombre, talla: t.talla }] : [];
  });
}

/** «Agregar 3 prendas a mi bolsa», «Agregar 1 prenda a mi bolsa». */
export const textoAgregar = (n: number): string => `Agregar ${cuantasPrendas(n)} a mi bolsa`;

/** ¿La prenda no tiene ninguna talla disponible? Se ve, pero no se agrega. */
export const sinTallasPorAhora = (p: PiezaLook): boolean => p.tallas.length > 0 && p.tallas.every((t) => !t.hay);
