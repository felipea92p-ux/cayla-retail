import { z } from "zod";
import { soles, type Color, type PrecioTarjeta } from "./catalogo";
import { pctTexto } from "./portada";
import { esquemaNivel, hayAlgo, type Nivel } from "./stock";

// La ficha de una prenda (ADR-0408, actividad 4; maqueta v4, `vProducto`), tal como la devuelve `retail.tienda_ficha(p_producto,
// p_sede)`: el modelo con su precio en la tienda elegida (o el mayor, con «Todas») y la campaña, sus colores, tallas y fotos, y por cada
// talla de cada color su precio y su NIVEL en cada tienda de la web (`lib/stock.ts`). Aquí se valida la forma y se decide lo que
// muestra la pantalla al elegir color y talla. Lógica pura, con su prueba al lado.

// Un color con un dato raro no tumba la ficha: sin su color, la muestra sale neutra; sin su foto, se ve con la del modelo.
const esquemaColor = z.object({
  codigo: z.string().min(1),
  nombre: z.string().min(1),
  hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().catch(null),
  foto: z.string().url().nullable().catch(null),
});

const esquemaCampana = z.object({
  id: z.string().uuid().optional(),
  nombre: z.string().min(1),
  pct: z.number().positive(),
  // Último día de la campaña (fecha de Lima); null si no tiene fecha de término.
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().catch(null),
});

const esquemaVariante = z
  .object({
    id: z.string().uuid(),
    color: z.string().min(1).nullable(),
    talla: z.string().uuid().nullable(),
    precio: z.number().positive(),
    precio_final: z.number().nonnegative(),
    campana: esquemaCampana.nullable().catch(null),
    stock: z.record(z.string(), esquemaNivel),
    total: esquemaNivel,
  })
  .refine((v) => v.precio_final <= v.precio);

const esquemaFicha = z.object({
  sede: z.string().uuid().nullable().catch(null),
  umbral: z.number().int().min(1).max(3).catch(3),
  sedes: z.array(z.object({ id: z.string().uuid(), nombre: z.string().min(1) })).catch([]),
  prenda: z
    .object({
      id: z.string().uuid(),
      codigo: z.string().nullable(),
      nombre: z.string().min(1),
      descripcion: z.string().min(1).nullable().catch(null),
      categoria: z.object({ nombre: z.string().min(1), prefijo: z.string().nullable() }).nullable(),
      precio: z.number().positive(),
      precio_final: z.number().nonnegative(),
      desde: z.boolean(),
      campana: esquemaCampana.nullable().catch(null),
      colores: z.array(esquemaColor).min(1),
      tallas: z.array(z.object({ id: z.string().uuid().nullable(), nombre: z.string().min(1).nullable() })).min(1),
      fotos: z.array(z.object({ url: z.string().url(), color: z.string().nullable() })).catch([]),
      variantes: z.array(z.unknown()),
    })
    .refine((p) => p.precio_final <= p.precio),
});

export type Campana = z.infer<typeof esquemaCampana>;
export type Variante = {
  id: string;
  color: string | null;
  talla: string | null;
  precio: number;
  precioFinal: number;
  campana: Campana | null;
  /** El nivel en cada tienda de la web, por su id. */
  stock: Record<string, Nivel>;
  /** El nivel en todas las tiendas de la web juntas. */
  total: Nivel;
};
export type Talla = { id: string | null; nombre: string };
export type Ficha = {
  /** La tienda cuyo precio usó la base (`null`: «Todas»). */
  sede: string | null;
  /** Desde cuántas unidades se ve el número (Configuración ▸ Tienda web). */
  umbral: number;
  /** Las tiendas de la web, en su orden: las filas de la tabla. */
  sedes: { id: string; nombre: string }[];
  id: string;
  nombre: string;
  descripcion: string | null;
  categoria: { nombre: string; prefijo: string | null } | null;
  precio: number;
  precioFinal: number;
  desde: boolean;
  campana: Campana | null;
  colores: Color[];
  tallas: Talla[];
  fotos: { url: string; color: string | null }[];
  variantes: Variante[];
};

/**
 * Lo que devuelve la base: la ficha, `"no_esta"` si la base dice que ese modelo no se ve en la web (la página dice «Esta prenda ya no
 * está»), o `null` si la respuesta no tiene la forma de una ficha (la página dice que no se pudo cargar). Una talla con un dato raro se
 * deja fuera; las demás se ven.
 */
export function interpretarFicha(dato: unknown): Ficha | "no_esta" | null {
  if (dato === null) return "no_esta";
  const r = esquemaFicha.safeParse(dato);
  if (!r.success) return null;
  const { sede, umbral, sedes, prenda: p } = r.data;
  const variantes = p.variantes.flatMap((v): Variante[] => {
    const x = esquemaVariante.safeParse(v);
    if (!x.success) return [];
    const d = x.data;
    return [{ id: d.id, color: d.color, talla: d.talla, precio: d.precio, precioFinal: d.precio_final, campana: d.campana, stock: d.stock, total: d.total }];
  });
  if (variantes.length === 0) return null;
  return {
    sede,
    umbral,
    sedes,
    id: p.id,
    nombre: p.nombre,
    descripcion: p.descripcion,
    categoria: p.categoria,
    precio: p.precio,
    precioFinal: p.precio_final,
    desde: p.desde,
    campana: p.campana,
    colores: p.colores,
    tallas: p.tallas.map((t) => ({ id: t.id, nombre: t.nombre ?? "Única" })),
    fotos: p.fotos,
    variantes,
  };
}

/** ¿Este id puede ser el de una prenda? (un uuid). Si no, la página es «no está» sin preguntarle a la base. */
export const esIdDePrenda = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

/** El color con que abre la ficha: el pedido (`?color=`) si existe; si no, el primero con foto y con algo en alguna tienda; si no,
 *  el primero con foto; si no, el primero (maqueta, `vProducto`). */
export function colorInicial(f: Ficha, pedido?: string | null): string {
  if (pedido && f.colores.some((c) => c.codigo === pedido)) return pedido;
  const conAlgo = (c: Color) => f.variantes.some((v) => v.color === c.codigo && hayAlgo(v.total));
  return (f.colores.find((c) => c.foto && conAlgo(c)) ?? f.colores.find((c) => c.foto) ?? f.colores[0]).codigo;
}

/** Las tallas de un color, en el orden de la tienda, cada una con su variante. */
export function tallasDelColor(f: Ficha, color: string): { talla: Talla; variante: Variante }[] {
  return f.tallas.flatMap((t) => {
    const variante = f.variantes.find((v) => v.color === color && v.talla === t.id);
    return variante ? [{ talla: t, variante }] : [];
  });
}

/** Las fotos con el color elegido primero (sus fotos, en orden) y después las demás. `enOtroColor`: el color no tiene foto propia y se
 *  ve con la del modelo (propuesta c). */
export function fotosDelColor(f: Ficha, color: string): { fotos: string[]; enOtroColor: boolean } {
  const propias = f.fotos.filter((x) => x.color === color).map((x) => x.url);
  const otras = f.fotos.filter((x) => x.color !== color).map((x) => x.url);
  return { fotos: [...propias, ...otras], enOtroColor: propias.length === 0 && otras.length > 0 };
}

/** Lo que dice debajo de una talla sin stock: «Otra tienda» si la elegida no tiene y otra sí; «No hay» si ninguna tiene. Con stock, o
 *  sin tiendas en la web, nada. */
export function notaDeTalla(v: Variante, sedeElegida: string | null, hayTiendas: boolean): string | null {
  if (!hayTiendas) return null;
  if (sedeElegida) {
    if (hayAlgo(v.stock[sedeElegida])) return null;
    return hayAlgo(v.total) ? "Otra tienda" : "No hay";
  }
  return hayAlgo(v.total) ? null : "No hay";
}

/**
 * La talla que decide el precio que se ve: la elegida; sin talla, la primera del color si todas las de ese color cuestan lo mismo (con la
 * misma campaña): el precio ya es exacto. Si no, `null`: se ve el del modelo, como su tarjeta, y se pide elegir la talla.
 */
export function tallaDelPrecio(f: Ficha, color: string, elegida: Variante | null): Variante | null {
  if (elegida) return elegida;
  const delColor = f.variantes.filter((v) => v.color === color);
  const [primera] = delColor;
  if (!primera) return null;
  const igual = (v: Variante) => v.precio === primera.precio && v.precioFinal === primera.precioFinal && v.campana?.nombre === primera.campana?.nombre;
  return delColor.every(igual) ? primera : null;
}

/** El precio que se ve: el de la talla que lo decide (`tallaDelPrecio`) en la tienda elegida o, sin ella, el del modelo (con «Desde»
 *  si la campaña no toca a todas sus tallas por igual). */
export function precioDeLaFicha(f: Ficha, talla: Variante | null): PrecioTarjeta {
  const precio = talla ? talla.precio : f.precio;
  const final = talla ? talla.precioFinal : f.precioFinal;
  const conDescuento = final < precio;
  return {
    principal: `${!talla && conDescuento && f.desde ? "Desde " : ""}${soles(conDescuento ? final : precio)}`,
    anterior: conDescuento ? soles(precio) : null,
    oferta: conDescuento,
  };
}

/** La campaña que se ve: la de la talla que decide el precio o, sin ella, la del modelo. `null` si no baja el precio. */
export function campanaDeLaFicha(f: Ficha, talla: Variante | null): Campana | null {
  if (talla) return talla.precioFinal < talla.precio ? talla.campana : null;
  return f.precioFinal < f.precio ? f.campana : null;
}

/** El chip de la campaña: «−12 % · Aniversario CAYLA». */
export const chipCampana = (c: Campana | null): string | null => (c ? `−${pctTexto(c.pct)} % · ${c.nombre}` : null);

/** Los chips de arriba del nombre que salen del catálogo (actividad 5): «Nuevo · llegó hace 4 días» (o «Nuevo», si está fijado en la
 *  Vitrina) y «N.º 3 en más vendidos». */
export function chipsDelCatalogo(p: { nuevo: { dias: number | null } | null; vendidos: number | null } | null): { texto: string; tono?: "nuevo" }[] {
  if (!p) return [];
  const chips: { texto: string; tono?: "nuevo" }[] = [];
  if (p.nuevo) {
    const d = p.nuevo.dias;
    const cuando = d === null ? "" : d === 0 ? " · llegó hoy" : ` · llegó hace ${d} ${d === 1 ? "día" : "días"}`;
    chips.push({ texto: `Nuevo${cuando}`, tono: "nuevo" });
  }
  if (p.vendidos !== null) chips.push({ texto: `N.º ${p.vendidos} en más vendidos` });
  return chips;
}

/** «3 días 5 h» o, en el último día, «05:12:09»: lo que falta para que termine la campaña (su último día rige completo, en Lima). */
export function faltaParaTerminar(hasta: string, ahora: number): string | null {
  const fin = new Date(`${hasta}T23:59:59-05:00`).getTime();
  const s = Math.floor((fin - ahora) / 1000);
  if (!Number.isFinite(s) || s <= 0) return null;
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const dos = (n: number) => String(n).padStart(2, "0");
  if (d > 0) return `${d} ${d === 1 ? "día" : "días"} ${h} h`;
  return `${dos(h)}:${dos(Math.floor((s % 3600) / 60))}:${dos(s % 60)}`;
}
