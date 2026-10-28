import type { VarianteListado } from "./catalogo-v2";
import { variantesQueSeVenden } from "./productos-vista";
import type { LugaresDeVariante } from "./stock-en-sede-reglas";
import { compararTallas } from "./tallas";

/* ====================================================================
   Vista rápida de producto (Catálogo ▸ Productos ▸ Grilla) · la MATRIZ color × talla.
   Maqueta A «Matriz» elegida por Felipe el 2026-10-05 (docs/maquetas/catalogo-modal-producto-2026-10/).

   Por qué una matriz: la vista rápida de antes listaba una fila por variante. Pantalón Nuki (6 colores × 3 tallas) eran
   18 filas de 41 px: los cuatro botones quedaban bajo el pliegue, el color era texto repetido y nunca se veía «todo el
   Camel». Aquí las variantes que `fn_productos_listado` ya trae se acomodan en filas (color) y columnas (talla). Lógica
   pura: no pide nada al servidor ni decide reglas de negocio; solo ordena lo que ya se sabe y redacta qué va a imprimir
   el botón de etiquetas.

   Lo que NO cambia: qué variantes cuentan (`variantesQueSeVenden`: una talla retirada no se lista ni se cuenta, salvo que
   TODAS lo estén) ni de dónde sale el número de cada celda (`useStockEnSede`, la misma lectura de siempre).
   ==================================================================== */

/** Lo que se sabe del stock de la sede, por variante: `null` = todavía no se lee, o no se pudo (nunca pintar un 0 que no es cierto). */
export type StockPorVariante = ReadonlyMap<string, number> | null;

/** El hex de un color sin hex (`coloresDe` usa el mismo gris): un dato faltante no tumba la fila. */
export const HEX_SIN_COLOR = "#8A8A8A"; // tema-fijo: color de DATO (la muestra de una variante sin hex), no de interfaz
/** La columna de las variantes sin talla (un accesorio): se rotula «Única», no queda en blanco. */
export const TALLA_UNICA = "Única";

export type CeldaMatriz = {
  varianteId: string;
  color: string | null;
  talla: string | null;
  /** «Camel M»: cómo se nombra esta variante en un aviso o en el botón de etiquetas. */
  nombre: string;
  codigo: string;
  precio: number;
  activo: boolean;
  /** `null` = no se sabe todavía. */
  unidades: number | null;
  /** El precio no es el que más se repite en la prenda: la celda lo dice (una talla a S/10 entre tallas de S/79.90 no pasa inadvertida). */
  precioDistinto: boolean;
  /** Qué tanto del mayor stock de la matriz tiene esta celda (0 a 1): la barrita. `null` si no se sabe. */
  nivel: number | null;
};

export type FilaColor = {
  /** Clave estable de la fila: el nombre del color, o `""` para las variantes sin color. */
  clave: string;
  nombre: string;
  hex: string;
  fotoUrl: string | null;
  /** Una por columna, en el orden de `Matriz.columnas`; `null` = esa prenda no existe en esa talla. */
  celdas: (CeldaMatriz | null)[];
  total: number | null;
};

export type ColumnaTalla = {
  clave: string;
  nombre: string;
  varianteIds: string[];
  total: number | null;
};

export type Matriz = {
  filas: FilaColor[];
  columnas: ColumnaTalla[];
  celdas: CeldaMatriz[];
  nVariantes: number;
  /** Unidades de la sede en toda la prenda; `null` si no se sabe. */
  totalGeneral: number | null;
  precioBase: number;
  /** Todas las variantes valen lo mismo: el precio se dice UNA vez, arriba. */
  precioUnico: boolean;
  precioMin: number;
  precioMax: number;
};

/** El precio que más se repite entre las variantes; en un empate, el más bajo (el que menos sorprende en un descuento). */
export function precioBaseDe(precios: readonly number[]): number {
  const cuenta = new Map<number, number>();
  for (const p of precios) cuenta.set(p, (cuenta.get(p) ?? 0) + 1);
  let mejor = precios[0] ?? 0;
  let veces = 0;
  for (const [p, n] of cuenta) if (n > veces || (n === veces && p < mejor)) [mejor, veces] = [p, n];
  return mejor;
}

const unidadesDe = (stock: StockPorVariante, id: string): number | null => (stock === null ? null : Math.max(0, stock.get(id) ?? 0));
const sumar = (xs: readonly (number | null)[]): number | null => (xs.some((x) => x === null) ? null : xs.reduce<number>((t, x) => t + (x ?? 0), 0));

export function armarMatriz(
  variantes: readonly VarianteListado[],
  stock: StockPorVariante,
  /** Precio propio de la sede que se mira, por variante (ADR-0370): la matriz dice lo que cobra su caja. */
  preciosAqui: Readonly<Record<string, number>> = {},
): Matriz {
  const lista = variantesQueSeVenden(variantes).map((v) => (preciosAqui[v.varianteId] !== undefined ? { ...v, precio: preciosAqui[v.varianteId]! } : v));
  const base = precioBaseDe(lista.map((v) => v.precio));
  const unidades = new Map(lista.map((v) => [v.varianteId, unidadesDe(stock, v.varianteId)]));
  const maximo = Math.max(1, ...[...unidades.values()].map((u) => u ?? 0));

  // Columnas: las tallas sin repetir, en curva (XS · S · M · L); sin talla, una columna «Única».
  const clavesTalla = [...new Set(lista.map((v) => v.talla ?? ""))].sort((a, b) => (a === "" ? 1 : b === "" ? -1 : compararTallas(a, b)));
  // Filas: los colores en el orden en que llegan; sin color, al final.
  const clavesColor: string[] = [];
  for (const v of lista) if (!clavesColor.includes(v.color ?? "")) clavesColor.push(v.color ?? "");
  clavesColor.sort((a, b) => Number(a === "") - Number(b === ""));

  const celda = (v: VarianteListado): CeldaMatriz => {
    const u = unidades.get(v.varianteId) ?? null;
    return {
      varianteId: v.varianteId,
      color: v.color,
      talla: v.talla,
      nombre: [v.color, v.talla].filter(Boolean).join(" ") || (v.codigo ?? "Esta variante"),
      codigo: v.codigo ?? v.sku ?? "—",
      precio: v.precio,
      activo: v.activo,
      unidades: u,
      precioDistinto: v.precio !== base,
      nivel: u === null ? null : u / maximo,
    };
  };

  const todas: CeldaMatriz[] = [];
  const filas: FilaColor[] = clavesColor.map((clave) => {
    const deColor = lista.filter((v) => (v.color ?? "") === clave);
    const celdas = clavesTalla.map((t) => {
      const v = deColor.find((x) => (x.talla ?? "") === t);
      if (!v) return null;
      const c = celda(v);
      todas.push(c);
      return c;
    });
    return {
      clave,
      nombre: clave === "" ? "Sin color" : clave,
      hex: deColor.find((v) => v.colorHex)?.colorHex ?? HEX_SIN_COLOR,
      fotoUrl: deColor.find((v) => v.fotoUrl)?.fotoUrl ?? null,
      celdas,
      total: sumar(celdas.flatMap((c) => (c ? [c.unidades] : []))),
    };
  });
  const columnas: ColumnaTalla[] = clavesTalla.map((t, i) => {
    const deTalla = filas.flatMap((f) => (f.celdas[i] ? [f.celdas[i]!] : []));
    return { clave: t, nombre: t === "" ? TALLA_UNICA : t, varianteIds: deTalla.map((c) => c.varianteId), total: sumar(deTalla.map((c) => c.unidades)) };
  });

  const precios = lista.map((v) => v.precio);
  return {
    filas,
    columnas,
    celdas: todas,
    nVariantes: lista.length,
    totalGeneral: sumar(todas.map((c) => c.unidades)),
    precioBase: base,
    precioUnico: precios.every((p) => p === precios[0]),
    precioMin: precios.length ? Math.min(...precios) : 0,
    precioMax: precios.length ? Math.max(...precios) : 0,
  };
}

/** Las variantes de una fila (un color) o de una columna (una talla), para elegirlas de un toque. */
export const idsDeFila = (f: FilaColor): string[] => f.celdas.flatMap((c) => (c ? [c.varianteId] : []));
export const idsDeColumna = (c: ColumnaTalla): string[] => c.varianteIds;

/** Tocar algo ya elegido lo quita; si falta aunque sea una, las suma todas. Devuelve un conjunto nuevo (React no ve un `Set` mutado). */
export function alternarVariantes(elegidas: ReadonlySet<string>, ids: readonly string[]): Set<string> {
  const sig = new Set(elegidas);
  const todas = ids.length > 0 && ids.every((id) => sig.has(id));
  for (const id of ids) {
    if (todas) sig.delete(id);
    else sig.add(id);
  }
  return sig;
}

/** Deja solo las que todavía existen en la matriz (cambió la página o se refrescó): una elegida que ya no está no puede mandar etiquetas. */
export function soloLasQueExisten(elegidas: ReadonlySet<string>, m: Matriz): Set<string> {
  const vivas = new Set(m.celdas.map((c) => c.varianteId));
  return new Set([...elegidas].filter((id) => vivas.has(id)));
}

export type EtiquetasDeLaSeleccion = {
  /** Lo que dice el botón: «Etiquetas», «Etiqueta · Camel M» o «Etiquetas» + la cuenta aparte. */
  texto: string;
  /** Cuántas variantes elegidas (0 = toda la prenda). */
  cantidad: number;
  /** Para el aviso del `EnlaceEtiquetas`: «Camel M», «Pantalón Nuki», «Las 3 prendas elegidas». */
  que: string;
  varias: boolean;
  /** Lo último que se leyó de la sede para lo que se va a imprimir; `null` si no se sabe. */
  unidades: number | null;
  /** La lectura dice que no hay nada en la sede. NO bloquea el botón: `EnlaceEtiquetas` vuelve a leer fresco al tocarlo
   *  (una lectura vieja de 0 no debe impedir imprimir lo que acaba de entrar); solo sirve para avisarlo antes del clic. */
  sinUnidades: boolean;
};

export function etiquetasDeLaSeleccion(m: Matriz, elegidas: ReadonlySet<string>, referencia: string): EtiquetasDeLaSeleccion {
  const cel = m.celdas.filter((c) => elegidas.has(c.varianteId));
  const unidades = cel.length === 0 ? m.totalGeneral : sumar(cel.map((c) => c.unidades));
  const comun = { cantidad: cel.length, unidades, sinUnidades: unidades === 0 };
  if (cel.length === 0) return { ...comun, texto: "Etiquetas", que: referencia, varias: false };
  if (cel.length === 1) return { ...comun, texto: `Etiqueta · ${cel[0].nombre}`, que: cel[0].nombre, varias: false };
  return { ...comun, texto: "Etiquetas", que: `Las ${cel.length} prendas elegidas`, varias: true };
}

/** Cuántas unidades dice la lectura, con su palabra: «1 unidad», «8 unidades». */
export const unidadesTexto = (n: number): string => `${n.toLocaleString("es-PE")} ${n === 1 ? "unidad" : "unidades"}`;

/** «Hay en otras sedes» para la prenda que aquí no tiene nada: lo que ya redacta `lineasDeStock`, sin repetir. */
export function avisoSinUnidadesAqui(sede: string, detalleOtrasSedes: string | null): string {
  const donde = sede.trim() || "tu sede";
  return detalleOtrasSedes ? `Sin unidades en ${donde}. En otras sedes: ${detalleOtrasSedes}.` : `Sin unidades en ${donde}.`;
}

/* ---- Piso y almacén (Felipe 2026-10-12: «no sé si esa cantidad es del almacén o la tienda») ----
   El número de cada celda era TODO lo de la sede —lo colgado en el piso y lo guardado en el almacén— sin decirlo. Ahora la ficha lo
   reparte: «Dónde» elige qué cuenta la matriz (Todo · Piso · Almacén) y, en «Todo», la barrita de cada celda va en dos tonos. Los lugares
   salen de `lugaresEnSede`, la misma lectura de la sede; aquí solo se eligen y se redactan. «Todo» no cambia: sigue siendo el número que
   decide cuántas etiquetas salen. */

export type Donde = "todo" | "piso" | "almacen";
/** Dónde está cada unidad, por variante; `null` = todavía no se lee, o no se pudo. */
export type LugaresPorVariante = ReadonlyMap<string, LugaresDeVariante> | null;
export type RepartoLugares = LugaresDeVariante & { total: number };

/** Cuánto de esas prendas hay en cada lugar de la sede. Una prenda sin fila no suma nada (`stock` solo guarda lo que hay). */
export function repartoDe(lugares: ReadonlyMap<string, LugaresDeVariante>, ids: readonly string[]): RepartoLugares {
  const r: LugaresDeVariante = { piso: 0, almacen: 0, danadas: 0, sinLugar: 0 };
  for (const id of ids) {
    const l = lugares.get(id);
    if (!l) continue;
    r.piso += l.piso;
    r.almacen += l.almacen;
    r.danadas += l.danadas;
    r.sinLugar += l.sinLugar;
  }
  return { ...r, total: r.piso + r.almacen + r.danadas + r.sinLugar };
}

/**
 * El reparto de la prenda entera (las variantes de la matriz), o `null` si no hay nada que repartir: la lectura no llegó, o nada está ni
 * en el piso ni en el almacén (el Taller no separa; una prenda sin unidades aquí ya tiene su aviso). Con `null` la ficha no ofrece
 * «Dónde»: tres opciones con 0 en dos de ellas solo confunden.
 */
export function repartoDeLaPrenda(m: Matriz, lugares: LugaresPorVariante): RepartoLugares | null {
  if (!lugares || m.totalGeneral === null) return null;
  const r = repartoDe(lugares, m.celdas.map((c) => c.varianteId));
  return r.piso + r.almacen > 0 ? r : null;
}

/** Lo que dibuja la matriz según «Dónde»: «Todo» es la lectura de siempre; «Piso» o «Almacén», solo lo de ese lugar. */
export function stockSegunDonde(donde: Donde, stock: StockPorVariante, lugares: LugaresPorVariante): StockPorVariante {
  if (donde === "todo" || stock === null || lugares === null) return stock;
  return new Map([...lugares].map(([id, l]) => [id, l[donde]]));
}

/** La barrita de dos tonos de una celda en «Todo»: qué parte está en el piso y qué parte en el almacén (de 0 a 1; lo que falta para 1 son
 *  dañadas o prendas sin ubicar). `null` si la celda no tiene nada que partir. */
export function partesDeLaCelda(lugares: LugaresPorVariante, varianteId: string): { piso: number; almacen: number } | null {
  const l = lugares?.get(varianteId);
  if (!l) return null;
  const total = l.piso + l.almacen + l.danadas + l.sinLugar;
  return total > 0 ? { piso: l.piso / total, almacen: l.almacen / total } : null;
}

const danadasTexto = (n: number) => (n === 1 ? "1 dañada" : `${n} dañadas`);

/** «4 en el piso · 3 en almacén»: solo los lugares con algo, para lo que se eligió en la matriz. Vacío si no hay nada. */
export function textoLugares(r: LugaresDeVariante): string {
  const partes: string[] = [];
  if (r.piso > 0) partes.push(`${r.piso} en el piso`);
  if (r.almacen > 0) partes.push(`${r.almacen} en almacén`);
  if (r.danadas > 0) partes.push(danadasTexto(r.danadas));
  if (r.sinLugar > 0) partes.push(`${r.sinLugar} sin ubicar`);
  return partes.join(" · ");
}

/** Lo que «Todo» cuenta y no está ni en el piso ni en el almacén: se dice, para que piso + almacén cuadre con «Todo» a la vista. */
export function notaFueraDePisoYAlmacen(r: RepartoLugares): string | null {
  const partes: string[] = [];
  if (r.danadas > 0) partes.push(danadasTexto(r.danadas));
  if (r.sinLugar > 0) partes.push(`${r.sinLugar} sin ubicar`);
  return partes.length > 0 ? `«Todo» incluye ${partes.join(" y ")}` : null;
}

/** Junto a la cifra grande, de dónde es: «en Trujillo» o, al elegir un lugar, «en el piso» / «de Trujillo». */
export function rotuloDeLaCifra(donde: Donde, sedeCorta: string): { linea: string; deSede: string | null } {
  if (donde === "piso") return { linea: "en el piso", deSede: `de ${sedeCorta}` };
  if (donde === "almacen") return { linea: "en almacén", deSede: `de ${sedeCorta}` };
  return { linea: `en ${sedeCorta}`, deSede: null };
}

/** Bajo el nombre de cada color: «5 unidades», o, si no tiene nada, de DÓNDE no tiene («0 en piso» no es «sin unidades»: puede haber
 *  en el almacén). Corto a propósito: cabe en una línea como «24 unidades», y la fila no crece al cambiar de lugar (ADR-0185). Vacío
 *  mientras no se lee. */
export function unidadesDeLaFila(n: number | null, donde: Donde): string {
  if (n === null) return "";
  if (n > 0) return unidadesTexto(n);
  return donde === "piso" ? "0 en piso" : donde === "almacen" ? "0 en almacén" : "sin unidades";
}

/** «7 unidades», «4 unidades en el piso», «3 unidades en almacén»: lo elegido dice de qué lugar es su número. */
export function unidadesEnDonde(n: number, donde: Donde): string {
  return donde === "piso" ? `${unidadesTexto(n)} en el piso` : donde === "almacen" ? `${unidadesTexto(n)} en almacén` : unidadesTexto(n);
}

/* ---- La ficha corta de la prenda (Felipe 2026-10-09: «debería salir el material, el patrón y algo útil») ----
   De qué está hecha y cómo es la tela —lo que el cliente pregunta en el mostrador—, de quién es, y cuánto se vendió: lo que
   la colaboradora usa para recomendarla. Todo viene ya en la fila del listado; aquí solo se redacta. */

export type DatoFicha = { clave: "tejido" | "patron" | "marca" | "vendidas"; rotulo: string; valor: string | null };

/** Unidades vendidas en 30 días, todas las sedes, a partir del promedio diario de `fn_productos_listado` (ventas de 30 días ÷ 30):
 *  se dice el total, no el promedio, para no hablar de estadística en la tienda (ADR-0350, ley 4). */
export function vendidasEn30Dias(demandaDiaria: number): string {
  const n = Math.round((Number.isFinite(demandaDiaria) ? demandaDiaria : 0) * 30);
  if (n <= 0) return "Ninguna en 30 días";
  return `${n} ${n === 1 ? "unidad" : "unidades"} en 30 días`;
}

/** Los datos de la ficha corta, en su orden. `valor: null` = sin registrar (se dice así, no se esconde: es lo que falta en la ficha). */
export function fichaCorta(p: { tejido: string | null; patron: string | null; marca: string | null; demandaDiaria: number }): DatoFicha[] {
  const limpio = (t: string | null) => t?.trim() || null;
  return [
    { clave: "tejido", rotulo: "Material", valor: limpio(p.tejido) },
    { clave: "patron", rotulo: "Patrón", valor: limpio(p.patron) },
    { clave: "marca", rotulo: "Marca", valor: limpio(p.marca) },
    { clave: "vendidas", rotulo: "Vendidas", valor: vendidasEn30Dias(p.demandaDiaria) },
  ];
}
