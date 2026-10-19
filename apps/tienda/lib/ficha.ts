import { z } from "zod";
import type { Plazos } from "./ayuda";
import { claveCategoria, conFotoPrimero, soles, type Color, type PrecioTarjeta, type Prenda } from "./catalogo";
import { grupoDe } from "./grupos";
import type { Look } from "./looks";
import { pctTexto } from "./portada";
import type { TallaRapida } from "./rapido";
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

/** Cuánto hay de una talla donde la persona mira: en su tienda elegida (cada tienda maneja lo suyo) o, sin tienda elegida, en todas. */
export const nivelAqui = (v: Variante, sedeId: string | null): Nivel | undefined => (sedeId ? v.stock[sedeId] : v.total);

/** El color con que abre la ficha: el pedido (`?color=`) si existe; si no, el primero con foto y con algo en la tienda elegida (o en
 *  alguna, sin tienda); si no, el primero con foto; si no, el primero (maqueta, `vProducto`). */
export function colorInicial(f: Ficha, pedido?: string | null, sedeId: string | null = null): string {
  if (pedido && f.colores.some((c) => c.codigo === pedido)) return pedido;
  const conAlgo = (c: Color) => f.variantes.some((v) => v.color === c.codigo && hayAlgo(nivelAqui(v, sedeId)));
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

/** Lo que dice debajo de una talla sin stock (cada tienda maneja lo suyo, 2026-10-19): «Agotada» si en la tienda elegida no queda (aunque
 *  otra tienda tenga: eso lo dice `pistaOtraTienda`, sin prometerlo); sin tienda elegida, «Agotada» si ninguna tiene. Con stock, o sin
 *  tiendas en la web, nada. */
export function notaDeTalla(v: Variante, sedeElegida: string | null, hayTiendas: boolean): string | null {
  if (!hayTiendas) return null;
  return hayAlgo(nivelAqui(v, sedeElegida)) ? null : "Agotada";
}

/**
 * El botón principal de la ficha (maqueta, `cta` de `vProducto`): sin talla elegida, «Elige tu talla» (apagado); si esa talla hay en la
 * tienda elegida, «Agregar a la bolsa»; si ahí no hay, «Avísame cuando llegue» (cada tienda maneja lo suyo: la tienda no trae de otra,
 * 2026-10-19). Sin tienda elegida (la web sin tiendas), vale lo que haya en todas.
 */
export type BotonDeLaFicha = { tipo: "elige" } | { tipo: "agregar"; varianteId: string } | { tipo: "avisame"; varianteId: string };

export function botonDeLaFicha(elegida: Variante | null, sedeId: string | null = null): BotonDeLaFicha {
  if (!elegida) return { tipo: "elige" };
  return hayAlgo(nivelAqui(elegida, sedeId)) ? { tipo: "agregar", varianteId: elegida.id } : { tipo: "avisame", varianteId: elegida.id };
}

/**
 * La propuesta k (maqueta, `competencia`): con una tienda y una talla elegidas, si otras personas ya separaron en la web lo que queda
 * de esa talla en esa tienda (lo dice la base, solo sí o no: `separadas`), un aviso suave que no frena: «Otra persona ya separó la
 * última en Trujillo. Igual puedes separarla: la tienda te confirma o te ofrece otra opción.». «La última» si el nivel en esa tienda
 * es 1; si no, «las que quedan». Sin nada libre ahí, nada (la talla ya dice «Otra tienda»).
 */
export function avisoOtrosSepararon(
  v: Variante | null,
  sede: { id: string; nombre: string } | null,
  separadas: ReadonlySet<string>,
): string | null {
  if (!v || !sede || !separadas.has(v.id)) return null;
  const nivel = v.stock[sede.id];
  if (!hayAlgo(nivel)) return null;
  const quien = nivel === 1 ? "Otra persona ya separó la última" : "Otras personas ya separaron las que quedan";
  return `${quien} en ${sede.nombre}. Igual puedes separarla: la tienda te confirma o te ofrece otra opción.`;
}

/**
 * Con una tienda elegida y una talla que ahí no hay pero sí en otra tienda de la web: una pista, «Hay en Arequipa.», sin prometer nada:
 * cada tienda maneja lo suyo y la tienda elegida no la trae (Felipe 2026-10-19; antes «la tienda puede traerla de Arequipa»). Con dos
 * tiendas que la tienen: «Hay en Arequipa y Lima.». Sin tienda elegida, con algo ahí o sin otra que tenga, nada.
 */
export function pistaOtraTienda(
  v: Variante | null,
  sede: { id: string; nombre: string } | null,
  sedes: readonly { id: string; nombre: string }[],
): string | null {
  if (!v || !sede || hayAlgo(v.stock[sede.id])) return null;
  const otras = sedes.filter((s) => s.id !== sede.id && hayAlgo(v.stock[s.id])).map((s) => s.nombre);
  if (otras.length === 0) return null;
  const donde = otras.length === 1 ? otras[0] : `${otras.slice(0, -1).join(", ")} y ${otras[otras.length - 1]}`;
  return `Hay en ${donde}.`;
}

/** Lo que dice la ficha junto al botón después de «Agregar a la bolsa»: corto (la barra del celular es angosta) y con la talla, que
 *  es lo que se acaba de elegir; si no entró, la frase de por qué (la del servidor). */
export function lineaAlAgregar(r: { bien: boolean; texto: string }, talla: string, variasTallas: boolean): string {
  if (!r.bien) return r.texto;
  return variasTallas ? `La talla ${talla} ya está en tu bolsa.` : "Ya está en tu bolsa.";
}

/** Lo que responde la base a «¿otros ya separaron lo que queda?» (`{"<talla>": true|false}`): las tallas con sí. Lo que llega raro
 *  se lee como «nadie»: el aviso es una ayuda, nunca un candado. */
export function interpretarSeparadas(dato: unknown): Set<string> {
  const r = z.record(z.string().uuid(), z.boolean()).safeParse(dato);
  return new Set(r.success ? Object.entries(r.data).flatMap(([id, si]) => (si ? [id] : [])) : []);
}

/**
 * «Combínalo con» (maqueta, `combina` de `vProducto`): el PRIMER look que se ve y lleva esta prenda, y las tarjetas de sus otras
 * prendas, en el orden del look y tal como las trae el catálogo (el mismo precio y la misma nota). Sin un look que la lleve (o si
 * sus otras prendas ya no se ven), `null`: la sección no sale.
 */
export function combinaCon(looks: readonly Look[], productoId: string, prendas: readonly Prenda[]): { look: Look; prendas: Prenda[] } | null {
  const look = looks.find((l) => l.piezas.some((x) => x.prenda.id === productoId));
  if (!look) return null;
  const porId = new Map(prendas.map((p) => [p.id, p]));
  const otras = look.piezas.flatMap((x) => {
    const p = x.prenda.id === productoId ? undefined : porId.get(x.prenda.id);
    return p ? [p] : [];
  });
  return otras.length > 0 ? { look, prendas: otras } : null;
}

/**
 * «También te puede gustar» (2026-10-16): las otras prendas de su categoría y, si no llenan la fila, las de su grupo (`lib/grupos.ts`:
 * «Arriba», «Bolsos y accesorios»…), las de su menú («Ropa» o «Accesorios») y después las demás; dentro de cada parte, las que tienen
 * foto primero y en el orden del catálogo. Nunca la misma prenda ni lo que ya sale arriba en «Combínalo con» (`fuera`). Antes eran solo
 * las de su categoría: con una o dos, la fila de la computadora quedaba medio vacía. `ceja`: de dónde salen (su categoría o su grupo,
 * si todas son de ahí; si no, «Sigue mirando»); `ver`: la lista de eso mismo, para su «Ver todo» (sin nada, toda la tienda).
 */
export function parecidasA(
  prenda: { id: string; categoria: { nombre: string; prefijo: string | null } | null },
  prendas: readonly Prenda[],
  { fuera = [], cuantas = 8 }: { fuera?: readonly string[]; cuantas?: number } = {},
): { prendas: Prenda[]; ceja: string; ver: { categoria: string | null; grupo: string | null } } {
  const clave = claveCategoria(prenda.categoria);
  const grupo = clave ? grupoDe(clave) : null;
  const sacar = new Set([prenda.id, ...fuera]);
  // 0: su categoría · 1: su grupo · 2: su menú · 3: lo demás.
  const cercania = (p: Prenda): number => {
    const suya = claveCategoria(p.categoria);
    if (!clave || !suya) return 3;
    if (suya === clave) return 0;
    const g = grupoDe(suya);
    if (grupo && g.clave === grupo.clave) return 1;
    return grupo && g.menu === grupo.menu ? 2 : 3;
  };
  const elegidas = prendas
    .filter((p) => !sacar.has(p.id))
    .map((p) => ({ p, c: cercania(p) }))
    .sort((a, b) => a.c - b.c || conFotoPrimero(a.p, b.p))
    .slice(0, cuantas);
  const lejos = Math.max(0, ...elegidas.map((x) => x.c));
  const prendasElegidas = elegidas.map((x) => x.p);
  if (lejos === 0 && clave && prenda.categoria) return { prendas: prendasElegidas, ceja: prenda.categoria.nombre, ver: { categoria: clave, grupo: null } };
  if (lejos <= 1 && grupo) return { prendas: prendasElegidas, ceja: grupo.nombre, ver: { categoria: null, grupo: grupo.clave } };
  return { prendas: prendasElegidas, ceja: "Sigue mirando", ver: { categoria: null, grupo: null } };
}

/** Una promesa de la tienda junto al botón (el ícono, lo que se promete y su detalle en una línea). */
export type Promesa = { icono: "chat" | "tienda" | "traslado"; titulo: string; texto: string };

const enDias = (n: number) => `${n} ${n === 1 ? "día" : "días"}`;

/**
 * Lo que la tienda ya cumple, dicho junto al botón de comprar (2026-10-16, la confianza a la vista de las marcas grandes): separas sin
 * pagar en la web, recoges en tu tienda y cambias en cualquier tienda CAYLA. Promete lo mismo que «Cómo separar» y «Cambios y
 * devoluciones» (`lib/ayuda.ts`: `pasosParaSeparar`, `avisosParaSeparar`), con sus mismos plazos (`tienda_ayuda()`); sin
 * el plazo, la frase va sin número, nunca uno inventado. La usan la ficha, el look y la bolsa.
 */
export function promesasDeCompra(p: Plazos): Promesa[] {
  return [
    { icono: "chat", titulo: "Separas sin pagar en la web", texto: "La tienda te confirma por WhatsApp y coordinas el pago con ella." },
    {
      icono: "tienda",
      titulo: "Recoges en tu tienda",
      texto: p.diasParaRecoger !== null ? `Hasta ${enDias(p.diasParaRecoger)} después de pagar.` : "En la tienda que elegiste, después de pagar.",
    },
    {
      icono: "traslado",
      titulo: "Cambias en cualquier tienda CAYLA",
      texto:
        p.diasParaCambiar !== null
          ? `Tienes ${enDias(p.diasParaCambiar)}, con tu boleta y la etiqueta puesta.`
          : "Con tu boleta y la etiqueta puesta. El plazo va impreso en tu boleta.",
    },
  ];
}

/** Una talla del «Agregar» rápido de la tarjeta: su nombre y la prenda que agrega (`null`: esa talla no hay, se ve tachada). */
// La forma vive en `rapido.ts` (sin zod, la lee la tarjeta en el navegador).
export type { TallaRapida };

/**
 * El «Agregar» rápido de la tarjeta (maqueta, `rapidoHTML`): el primer color del modelo que tiene algo en la tienda elegida (o, con
 * «Todas», en alguna de la web) y todas sus tallas, cada una con su prenda si hay ahí. Sin ningún color con algo, nada.
 */
export function tallasRapidas(f: Ficha, sedeId: string | null): TallaRapida[] {
  const hay = (v: Variante) => hayAlgo(sedeId ? v.stock[sedeId] : v.total);
  const color = f.colores.find((c) => tallasDelColor(f, c.codigo).some(({ variante }) => hay(variante)));
  if (!color) return [];
  return tallasDelColor(f, color.codigo).map(({ talla, variante }) => ({ talla: talla.nombre, varianteId: hay(variante) ? variante.id : null }));
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
