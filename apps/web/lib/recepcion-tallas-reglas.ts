import { leerCantidad } from "./alta-producto";
import { compararTallas } from "./tallas";
import type { VarianteSeparada } from "./recepcion-conteo-reglas";
import { sumasDe, type Conteo, type MatrizRecepcion, type PrendaRecepcion, type TallaDeLaCategoria, type VarianteRecepcion } from "./recepcion-envio-reglas";

// Las tallas y colores en la misma pantalla de Contar (Felipe 2026-11-02, maqueta `docs/maquetas/recibir-boceto-2026-11/`): la tabla arranca con las tallas de siempre
// de la categoría (`categoria_tallas.habitual`) y se le quitan o se le agregan tallas y colores.
//
// Quitar solo ESCONDE: nunca se borra una variante del catálogo, y lo escrito en esa fila o columna deja de contar. Agregar una que la prenda ya tiene la vuelve a mostrar;
// agregar una que no tiene crea la combinación con la hoja de siempre (`preparar_prenda_al_recibir`): aquí solo se dice cuál pide crear.
//
// Una talla o un color de la tabla se reconoce por su id; `null` (Única, Sin color) se guarda como "".

export const claveDeEje = (id: string | null): string => id ?? "";

type Ids = readonly string[];

const variantesDe = (prenda: Pick<PrendaRecepcion, "variantes">, eje: "talla" | "color", clave: string): VarianteRecepcion[] =>
  prenda.variantes.filter((v) => claveDeEje(eje === "talla" ? v.tallaId : v.colorCodigo) === clave);
const tieneCantidad = (c: Pick<Conteo, "cantidades">, v: VarianteRecepcion): boolean => (leerCantidad(c.cantidades[v.id] ?? "") ?? 0) > 0;

/**
 * Con qué tallas arranca la tabla: las de siempre de la categoría que la prenda tiene, más las que ya traen cantidad (lo escrito nunca se esconde). Si la prenda no tiene
 * ninguna de las de siempre (solo viene en XL), todas las suyas: una tabla vacía no sirve de nada.
 */
export function tallasIniciales(matriz: Pick<MatrizRecepcion, "tallas">, prenda: Pick<PrendaRecepcion, "variantes">, categoria: readonly TallaDeLaCategoria[], conteo: Pick<Conteo, "cantidades">): string[] {
  const habituales = new Set(categoria.filter((t) => t.habitual).map((t) => t.id));
  const elegidas = matriz.tallas.filter((t) => (t.id !== null && habituales.has(t.id)) || variantesDe(prenda, "talla", claveDeEje(t.id)).some((v) => tieneCantidad(conteo, v)));
  return (elegidas.length > 0 ? elegidas : matriz.tallas).map((t) => claveDeEje(t.id));
}

/** Con qué colores arranca: los que ya traen cantidad; si no hay ninguno, todos los de la prenda (se quita el que no llegó). */
export function coloresIniciales(matriz: Pick<MatrizRecepcion, "colores">, prenda: Pick<PrendaRecepcion, "variantes">, conteo: Pick<Conteo, "cantidades">): string[] {
  const conDatos = matriz.colores.filter((c) => variantesDe(prenda, "color", claveDeEje(c.codigo)).some((v) => tieneCantidad(conteo, v)));
  return (conDatos.length > 0 ? conDatos : matriz.colores).map((c) => claveDeEje(c.codigo));
}

export type TallaPorAgregar = { clave: string; texto: string; /** La prenda no la tiene: agregarla crea la combinación. */ crear: boolean };

/** Lo que se puede sumar a la tabla: primero lo que la prenda ya tiene y está escondido, y después lo que la categoría ofrece, de las de siempre a las menos comunes. */
export function tallasPorAgregar(matriz: Pick<MatrizRecepcion, "tallas">, visibles: Ids, categoria: readonly TallaDeLaCategoria[]): TallaPorAgregar[] {
  const usadas = new Set(visibles);
  const deLaPrenda = new Set(matriz.tallas.map((t) => claveDeEje(t.id)));
  const habituales = new Set(categoria.filter((t) => t.habitual).map((t) => t.id));
  const deSiempreAntes = (a: { clave: string; texto: string }, b: { clave: string; texto: string }) => Number(habituales.has(b.clave)) - Number(habituales.has(a.clave)) || compararTallas(a.texto, b.texto);
  const escondidas = matriz.tallas
    .map((t) => ({ clave: claveDeEje(t.id), texto: t.texto }))
    .filter((t) => !usadas.has(t.clave))
    .sort(deSiempreAntes)
    .map((t) => ({ ...t, crear: false }));
  const nuevas = categoria
    .map((t) => ({ clave: t.id, texto: t.valor }))
    .filter((t) => !deLaPrenda.has(t.clave))
    .sort(deSiempreAntes)
    .map((t) => ({ ...t, crear: true }));
  return [...escondidas, ...nuevas];
}

export type ColorPorAgregar = { clave: string; texto: string; crear: boolean };

/** Los colores que se pueden sumar: los que la prenda tiene y están escondidos; después, los del catálogo, en su orden. */
export function coloresPorAgregar(matriz: Pick<MatrizRecepcion, "colores">, visibles: Ids, catalogo: readonly { codigo: string; nombre: string }[]): ColorPorAgregar[] {
  const usados = new Set(visibles);
  const deLaPrenda = new Set(matriz.colores.map((c) => claveDeEje(c.codigo)));
  const escondidos = matriz.colores.filter((c) => !usados.has(claveDeEje(c.codigo))).map((c) => ({ clave: claveDeEje(c.codigo), texto: c.nombre, crear: false }));
  const nuevos = catalogo.filter((c) => !deLaPrenda.has(c.codigo)).map((c) => ({ clave: c.codigo, texto: c.nombre, crear: true }));
  return [...escondidos, ...nuevos];
}

/** Lo que se quita al esconder una fila o columna: sus cantidades y sus dañadas. También dice cuántas prendas había, para el aviso de «Deshacer». */
function quitar(conteo: Conteo, variantes: readonly VarianteRecepcion[]): { conteo: Conteo; perdidas: number } {
  const cantidades = { ...conteo.cantidades };
  const danadas = { ...conteo.danadas };
  let perdidas = 0;
  for (const v of variantes) {
    perdidas += leerCantidad(cantidades[v.id] ?? "") ?? 0;
    delete cantidades[v.id];
    delete danadas[v.id];
  }
  return { conteo: { ...conteo, cantidades, danadas }, perdidas };
}

export const quitarTalla = (conteo: Conteo, prenda: Pick<PrendaRecepcion, "variantes">, clave: string) => quitar(conteo, variantesDe(prenda, "talla", clave));
export const quitarColor = (conteo: Conteo, prenda: Pick<PrendaRecepcion, "variantes">, clave: string) => quitar(conteo, variantesDe(prenda, "color", clave));

/** Una talla nueva cae en su lugar de la curva (XS antes de S), no al final. */
export function ordenarTallasVisibles(matriz: Pick<MatrizRecepcion, "tallas">, visibles: Ids): string[] {
  const usadas = new Set(visibles);
  return matriz.tallas.map((t) => claveDeEje(t.id)).filter((k) => usadas.has(k));
}

export type CuadreDeTallas = { estado: "cuadra" | "faltan" | "sobran" | "vacia"; texto: string };

/** Lo repartido contra lo contado en el contador. */
export function cuadreDeTallas(contadas: number, repartidas: number): CuadreDeTallas {
  const miles = (n: number) => n.toLocaleString("es-PE");
  if (repartidas === 0) return { estado: "vacia", texto: `Reparte las ${miles(contadas)}` };
  if (repartidas === contadas) return { estado: "cuadra", texto: "Cuadra con lo contado" };
  return repartidas < contadas ? { estado: "faltan", texto: `Faltan ${miles(contadas - repartidas)} por repartir` } : { estado: "sobran", texto: `Te pasaste por ${miles(repartidas - contadas)}` };
}

/** ¿Lo escrito ya es lo guardado? Sin importar el orden: si es lo mismo, no se vuelve a escribir en la base. */
export function mismasVariantes(a: readonly VarianteSeparada[] | null, b: readonly VarianteSeparada[] | null): boolean {
  const huella = (vs: readonly VarianteSeparada[] | null) =>
    (vs ?? [])
      .filter((v) => v.cantidad > 0)
      .map((v) => `${v.varianteId}:${v.cantidad}:${v.danadas}:${v.danadas > 0 ? (v.solucion ?? "") : ""}`)
      .sort()
      .join("|");
  return huella(a) === huella(b);
}

/**
 * ¿Lo escrito se puede guardar? Solo si reparte justo lo contado: en la base, las tallas de una prenda siempre suman su cantidad (si no, el conteo se soltaría de sus tallas). Con
 * dañadas, además, ninguna de más y dicho si tienen arreglo. Mientras tanto, lo escrito espera en la pantalla.
 */
export function tallasListas(conteo: Conteo, prenda: Pick<PrendaRecepcion, "variantes"> | null, contadas: number): boolean {
  if (!prenda || contadas <= 0) return false;
  const s = sumasDe(conteo, prenda);
  if (s.invalidas > 0 || s.contado !== contadas) return false;
  if (!conteo.conDanadas) return true;
  return s.danadasInvalidas === 0 && s.danadasDeMas.length === 0 && (s.danadas === 0 || conteo.arreglo !== null);
}
