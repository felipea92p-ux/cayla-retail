import type { VarianteListado } from "./catalogo-v2";
import { variantesQueSeVenden } from "./productos-vista";
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
