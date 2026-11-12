import { leerCantidad } from "./alta-producto";
import { conteoDeVariantes, type VarianteSeparada } from "./recepcion-conteo-reglas";
import { matrizDe, sumasDe, type Conteo, type MatrizRecepcion, type PrendaRecepcion, type TallaDeLaCategoria, type VarianteRecepcion } from "./recepcion-envio-reglas";

// Las tallas y colores en la misma pantalla de Contar (Felipe 2026-11-02, maqueta `docs/maquetas/recibir-boceto-2026-11/`): la tabla arranca con las tallas de siempre
// de la categoría (`categoria_tallas.habitual`) y se le quitan o se le agregan tallas y colores.
//
// Quitar solo ESCONDE: nunca se borra una variante del catálogo, y lo escrito en esa fila o columna deja de contar. Agregar una que la prenda ya tiene la vuelve a mostrar;
// agregar una que no tiene crea la combinación con la hoja de siempre (`preparar_prenda_al_recibir`): aquí solo se dice cuál pide crear.
//
// Una talla o un color de la tabla se reconoce por su id; `null` (Única, Sin color) se guarda como "".

export const claveDeEje = (id: string | null): string => id ?? "";

/** Cómo se trabaja un modelo: solo su número, o sus tallas y colores en la misma pantalla. */
export type ModoDeTallas = "despues" | "ahora";

/**
 * El modo de un modelo. Si nadie lo eligió, viene contestado por lo que es (Felipe 2026-11-11, ADR-0645): lo que ya está en el catálogo se reparte ahora, porque casi siempre lo
 * llevan al stock desde el conteo para venderlo ya; lo nuevo que todavía no se creó queda para después. Con tallas guardadas, «ahora» siempre. Antes se preguntaba en cada modelo.
 */
export const modoDeTallas = (elegido: ModoDeTallas | undefined, conTallas: boolean, enCatalogo = false): ModoDeTallas => elegido ?? (conTallas || enCatalogo ? "ahora" : "despues");

/** Lo que dice la tarjeta «Tallas y colores» del contador (ADR-0645). */
export type EstadoDeLaTarjeta = "espera" | "en-stock" | "nueva" | "despues" | "repartir" | "a-medias" | "de-mas" | "lista";

/**
 * Qué dice la tarjeta, por lo que se contó, lo que es la prenda, el modo y cuánto va repartido. `porRepartir` es lo contado menos lo que ya entró al stock: lo que ya entró
 * no se vuelve a repartir.
 */
export function estadoDeLaTarjeta({ contadas, enStock, enCatalogo, modo, repartidas }: { contadas: number; enStock: number; enCatalogo: boolean; modo: ModoDeTallas; repartidas: number }): EstadoDeLaTarjeta {
  if (contadas <= 0) return "espera";
  if (enStock > 0 && contadas === enStock) return "en-stock";
  if (!enCatalogo) return "nueva";
  if (modo === "despues") return "despues";
  const porRepartir = contadas - enStock;
  if (repartidas <= 0) return "repartir";
  if (repartidas < porRepartir) return "a-medias";
  return repartidas > porRepartir ? "de-mas" : "lista";
}

/** ¿Lo que toca ahora en el modelo es repartir sus tallas? Mientras tanto «Listo, siguiente» no es el botón principal: lo es el de la tarjeta. */
export const tocaRepartir = (e: EstadoDeLaTarjeta): boolean => e === "repartir" || e === "a-medias" || e === "de-mas";

/**
 * Un solo botón negro a la vez en Contar (ADR-0645, cambio 2 de /formidable; Felipe 2026-11-11). Quién lo lleva:
 *  - `tarjeta`: al modelo en foco le toca algo en sus tallas (repartir, o llevar al stock lo ya repartido): manda el botón de su tarjeta;
 *  - `cerrar`: no queda nada por contar y a ese modelo no le toca nada: manda «Revisar y cerrar»;
 *  - `siguiente`: el modelo ya tiene su número y queda envío por contar: manda «Listo, siguiente»;
 *  - `ninguno`: todavía no se contó; el protagonista es «Llegaron las N», que no es negro.
 * Antes, con todo contado, «Revisar y cerrar» era negro junto al de la tarjeta, uno en cada mitad.
 */
export type BotonPrincipal = "tarjeta" | "cerrar" | "siguiente" | "ninguno";
export function botonPrincipal({ tarjeta, hayParaLlevar, hayConteo, todoContado }: { tarjeta: EstadoDeLaTarjeta | null; hayParaLlevar: boolean; hayConteo: boolean; todoContado: boolean }): BotonPrincipal {
  if (tarjeta && (tocaRepartir(tarjeta) || (tarjeta === "lista" && hayParaLlevar))) return "tarjeta";
  if (todoContado) return "cerrar";
  return hayConteo ? "siguiente" : "ninguno";
}

/**
 * Los modos antes de cambiar el modelo que se está mirando. Si está en «ahora» porque venía con tallas guardadas (al recargar, nadie lo eligió), queda dicho: el cambio se las puede soltar (una celda que deja de
 * cuadrar, otro número), y si el modo siguiera saliendo de ellas, la tabla se cerraría en la primera tecla (Felipe 2026-11-03). Lo escrito espera en la pantalla hasta que cuadre (ADR-0604). Lo elegido no se toca.
 */
export function modosAlCambiar(modos: Readonly<Record<string, ModoDeTallas>>, clave: string, conTallasGuardadas: boolean): Readonly<Record<string, ModoDeTallas>> {
  return modos[clave] === undefined && conTallasGuardadas ? { ...modos, [clave]: "ahora" } : modos;
}

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

/** Lo que hay escrito en la tabla de un modelo mientras se reparte: se guarda en la base recién cuando cuadra. */
export type BorradorTallas = {
  conteo: Conteo;
  tallas: string[];
  colores: string[];
  /** Hay algo escrito que no se puede guardar todavía: se perdería al salir. */
  sinGuardar?: boolean;
};

export function borradorDeTallas(prenda: Pick<PrendaRecepcion, "variantes">, ordenColores: readonly string[], categoria: readonly TallaDeLaCategoria[], variantes: readonly VarianteSeparada[] | null): BorradorTallas {
  const matriz = matrizDe(prenda, ordenColores);
  const conteo = conteoDeVariantes(variantes);
  return { conteo, tallas: tallasIniciales(matriz, prenda, categoria, conteo), colores: coloresIniciales(matriz, prenda, conteo) };
}

/**
 * La tabla con que se decide si el número nuevo cuadra: la que se está escribiendo o, si todavía no se tocó (al recargar solo hay lo guardado), lo guardado. Sin esto, cambiar el número soltaba las tallas y la tabla
 * volvía vacía: había que repartir todo otra vez. Sin nada que repartir (el modelo queda en cero), ninguna.
 */
export function tablaParaElNumero(
  tabla: BorradorTallas | undefined,
  prenda: Pick<PrendaRecepcion, "variantes"> | undefined,
  guardadas: readonly VarianteSeparada[] | null,
  ordenColores: readonly string[],
  categoria: readonly TallaDeLaCategoria[],
  porRepartir: number,
): BorradorTallas | undefined {
  if (tabla) return tabla;
  if (!prenda || !guardadas || porRepartir <= 0) return undefined;
  return borradorDeTallas(prenda, ordenColores, categoria, guardadas);
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

export type CuadreDeTallas = { estado: "cuadra" | "faltan" | "sobran" | "vacia" | "danadas"; texto: string };

/**
 * Cómo va lo repartido contra lo contado. «Cuadra» solo si de verdad se guarda: con las dañadas a medias tampoco se guarda, y un «Cuadra» en verde mentía.
 * `tallasListas` y esto dicen lo mismo: lo vigila su prueba.
 */
export function cuadreDeTallas(conteo: Conteo, prenda: Pick<PrendaRecepcion, "variantes">, contadas: number): CuadreDeTallas {
  const miles = (n: number) => n.toLocaleString("es-PE");
  const s = sumasDe(conteo, prenda);
  if (s.contado === 0) return { estado: "vacia", texto: `Reparte las ${miles(contadas)}` };
  if (s.contado < contadas) return { estado: "faltan", texto: `Faltan ${miles(contadas - s.contado)} por repartir` };
  if (s.contado > contadas) return { estado: "sobran", texto: `Te pasaste por ${miles(s.contado - contadas)}` };
  if (conteo.conDanadas && (s.danadasInvalidas > 0 || s.danadasDeMas.length > 0)) return { estado: "danadas", texto: "Revisa las dañadas: aún no se guarda" };
  if (conteo.conDanadas && s.danadas > 0 && conteo.arreglo === null) return { estado: "danadas", texto: "Falta decir si tienen arreglo: aún no se guarda" };
  return { estado: "cuadra", texto: "Cuadra con lo contado" };
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

/** Lo que quedó marcado en la hoja «Tallas y colores de la prenda»: las tallas (por su id) y los colores (por su código). */
export type MarcasDeLaTabla = { tallaIds: readonly string[]; colorCodigos: readonly string[] };

/** Lo que la tabla muestra ahora, como lo entiende la hoja: sin la «talla única» ni el «sin color», que no se marcan. */
export const marcasDeLaTabla = (tabla: Pick<BorradorTallas, "tallas" | "colores">): MarcasDeLaTabla => ({ tallaIds: tabla.tallas.filter((k) => k !== ""), colorCodigos: tabla.colores.filter((k) => k !== "") });

/**
 * La tabla después de la hoja «Tallas y colores de la prenda» (ADR-0645, Felipe 2026-11-11: agregar una talla o un color abre la hoja completa, no un combo): muestra justo lo
 * que quedó marcado. Lo que se desmarcó sale con sus cantidades, como con su ×, y se dice cuántas prendas había para el «Deshacer». Lo que la hoja no maneja (la talla única, el
 * sin color) se queda como estaba.
 */
export function tablaConLoMarcado(tabla: BorradorTallas, prenda: Pick<PrendaRecepcion, "variantes">, antes: MarcasDeLaTabla, marcas: MarcasDeLaTabla): { tabla: BorradorTallas; perdidas: number } {
  const quitadas = (eran: readonly string[], son: readonly string[]) => eran.filter((id) => !son.includes(id));
  const sinTallas = quitadas(antes.tallaIds, marcas.tallaIds);
  const sinColores = quitadas(antes.colorCodigos, marcas.colorCodigos);
  let conteo = tabla.conteo;
  let perdidas = 0;
  for (const t of sinTallas) {
    const r = quitarTalla(conteo, prenda, t);
    conteo = r.conteo;
    perdidas += r.perdidas;
  }
  for (const c of sinColores) {
    const r = quitarColor(conteo, prenda, c);
    conteo = r.conteo;
    perdidas += r.perdidas;
  }
  const con = (visibles: readonly string[], fuera: readonly string[], marcadas: readonly string[]) => [...visibles.filter((k) => !fuera.includes(k)), ...marcadas.filter((k) => !visibles.includes(k))];
  return { tabla: { ...tabla, conteo, tallas: con(tabla.tallas, sinTallas, marcas.tallaIds), colores: con(tabla.colores, sinColores, marcas.colorCodigos) }, perdidas };
}
