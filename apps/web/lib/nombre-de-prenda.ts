// El estándar de nombres de CAYLA (ADR-0556, Felipe 2026-10-28): «<Tipo> <Flor>», y lo demás va abajo, en la línea que se arma sola.
//
// EL PROBLEMA. Cada quien inventaba su nombre: nombres de mujer (Emma), de naturaleza (Brisa) y descripciones metidas en el nombre
// («Falda Plisada Luna», «Blusa Negra Aurora»). Así nadie pide una prenda por su nombre, el color se repite en dos lugares y la misma
// prenda se carga dos veces con nombres distintos. La investigación (docs/investigacion/2026-10-28-como-nombran-sus-prendas-las-grandes-
// tiendas.md) mostró que las marcas que venden a un cliente que vuelve bautizan: Reformation («Juliette Dress»), Aritzia («Effortless
// Pant»). Felipe eligió flores como tema: el colibrí de la marca vive de ellas.
//
// CONTRATO
//   PROMETE: (1) el tipo de prenda sale de la categoría (`tiposDeCategoria`): nadie vuelve a escribir «Blusa» y nadie escribe «Blusa»
//            dentro de Casacas; una categoría con dos tipos («Camisas y Blusas») ofrece los dos. (2) La flor que se sugiere es la primera
//            de `FLORES` que todavía no usa ninguna prenda de esa categoría, sin azar ni red: dos sedes con el mismo catálogo ven la misma.
//            (3) `avisosDelNombre` dice, en lenguaje de tienda, qué rompe la regla (un color, una talla, un número, «oferta»…).
//            (4) `lineaDescriptiva` arma «Manga globo · Lino · Rayas» con lo que la ficha ya sabe.
//   ASUME:   que el nombre completo se sigue guardando entero en `productos.referencia` («Blusa Dalia»): esto no toca la base.
//   NO HACE: no bloquea nada. Los avisos son «sugerido», nunca un candado (CLAUDE.md, «Guía de foco»): lo que frena crear sigue siendo
//            lo de siempre (vacío, el nombre idéntico de la base). Tampoco decide nada para belleza, papelería ni lo que no es moda: ahí el
//            nombre es libre y descriptivo («Bolsa de papel mediana»).

import { tituloReferencia } from "./alta-producto";
import { claveTexto } from "./nombres-parecidos";

/** Las familias donde una prenda lleva nombre propio. Belleza, papelería y una familia nueva quedan libres (se describen). */
export const FAMILIAS_CON_NOMBRE_PROPIO: readonly string[] = ["indumentaria", "calzado", "accesorios", "bisuteria"];

/**
 * El tipo de prenda de cada categoría, por `categorias.prefijo` (clave estable: el nombre visible se renombra). El primero es el de
 * fábrica; una categoría que junta dos cosas («Camisas y Blusas», «Bolsos y Carteras») ofrece las dos y la persona elige con un toque.
 * Una categoría que un Líder crea sin deploy no está aquí: su nombre queda libre, nunca toma el tipo de otra.
 */
export const TIPOS_POR_CATEGORIA: Readonly<Record<string, readonly string[]>> = {
  // ---- indumentaria ----
  ABR: ["Abrigo"],
  BLZ: ["Blazer"],
  BOD: ["Body"],
  CMS: ["Blusa", "Camisa"],
  CAS: ["Casaca"],
  CHA: ["Chaleco"],
  CMP: ["Chompa"],
  CON: ["Conjunto"],
  ENT: ["Enterizo"],
  FAL: ["Falda"],
  JEA: ["Jean"],
  PAN: ["Pantalón"],
  SUD: ["Polera"],
  POL: ["Polo"],
  LEN: ["Bralette", "Brasier", "Trusa"],
  SHO: ["Short"],
  TOP: ["Top"],
  VES: ["Vestido"],
  // ---- calzado ----
  BAI: ["Bailarina"],
  BOT: ["Bota"],
  BOI: ["Botín"],
  MSN: ["Mocasín"],
  SAN: ["Sandalia"],
  ZAP: ["Zapatilla"],
  ZFO: ["Zapato"],
  // ---- accesorios ----
  CAR: ["Cartera", "Bolso"],
  CIN: ["Cinturón"],
  GOR: ["Sombrero", "Gorro"],
  LSO: ["Lentes"],
  MOC: ["Mochila"],
  BUF: ["Pañoleta", "Pañuelo"],
  REL: ["Reloj"],
  RIN: ["Riñonera"],
  // ---- bisutería ----
  ANL: ["Anillo"],
  ARE: ["Aretes"],
  COL: ["Collar"],
  PUL: ["Pulsera"],
};

/**
 * La lista de nombres: flores, de 3 a 9 letras, fáciles de decir en el Perú. En este orden se sugieren. Quedan FUERA a propósito las que
 * también son colores (Rosa, Violeta, Lila, Lavanda, Fucsia, Malva): «Blusa Violeta» haría pensar que la blusa es violeta. Dos guiños
 * peruanos: Cantuta (la flor nacional) y Amancae (la flor de Lima). Se agregan al final, nunca en medio: el orden decide qué sigue.
 */
export const FLORES: readonly string[] = [
  "Dalia", "Magnolia", "Camelia", "Gardenia", "Azucena", "Amapola", "Begonia", "Peonía", "Iris", "Lirio",
  "Tulipán", "Hortensia", "Margarita", "Clavel", "Jacinto", "Glicina", "Acacia", "Mimosa", "Azalea", "Freesia",
  "Cantuta", "Amancae", "Retama", "Jazmín", "Orquídea", "Gladiolo", "Anémona", "Alhelí", "Verbena", "Petunia",
  "Zinnia", "Caléndula", "Nardo", "Narciso", "Lantana", "Brezo", "Cala", "Loto", "Girasol", "Bromelia",
  "Heliconia", "Gloxinia", "Prímula", "Vinca", "Gerbera", "Achira", "Ranúnculo", "Celosía", "Amarilis", "Aster",
  "Lobelia", "Nenúfar", "Plumeria", "Protea", "Camomila",
];

/** Lo que mide un nombre propio, en letras. */
export const LARGO_NOMBRE_PROPIO = { min: 3, max: 9 } as const;

/** Colores de siempre, por si el vocabulario de la base no llegó: un nombre con «Negra» se avisa igual. */
const COLORES_BASE = [
  "negro", "blanco", "rojo", "azul", "verde", "amarillo", "rosado", "rosa", "morado", "lila", "violeta", "gris", "marrón", "beige", "crema",
  "celeste", "naranja", "fucsia", "plateado", "dorado", "camel", "nude", "turquesa", "vino", "mostaza", "lavanda", "malva", "coral", "hueso",
];
const TALLAS = ["xxs", "xs", "s", "m", "l", "xl", "xxl", "xxxl", "talla", "unica"];
/** Palabras que no son un nombre: dicen el estado, el precio o la temporada, que cambian y viven en otro lado. */
const PALABRAS_FUERA = ["nuevo", "nueva", "nuevos", "nuevas", "oferta", "ofertas", "promo", "promocion", "liquidacion", "sale", "outlet", "verano", "invierno", "otono", "primavera", "temporada"];

const palabras = (texto: string) => claveTexto(texto).split(/[^a-z0-9ç]+/).filter(Boolean);
/** «negra» y «negro» son el mismo color; «blusas» y «blusa», el mismo tipo. Se compara la palabra sin su última vocal o «s». */
const raiz = (palabra: string) => (palabra.length >= 4 ? palabra.replace(/(es|s)$/, "").replace(/[aeo]$/, "") : palabra);
const conMayuscula = (p: string) => p.charAt(0).toLocaleUpperCase("es") + p.slice(1);

export type ContextoNombre = { prefijo?: string | null; familia?: string | null };

/** Los tipos de prenda de la categoría, el de fábrica primero. Vacío = el nombre es libre (no es moda o la categoría es nueva). */
export function tiposDeCategoria(ctx: ContextoNombre | null | undefined): readonly string[] {
  if (!ctx?.prefijo || !ctx.familia || !FAMILIAS_CON_NOMBRE_PROPIO.includes(ctx.familia)) return [];
  return TIPOS_POR_CATEGORIA[ctx.prefijo] ?? [];
}

/** «Blusa» + «dalia corto» → «Blusa Dalia Corto». Sin nombre propio no hay nombre: «Blusa» sola no cuenta como escrito. */
export function armarReferencia(tipo: string, propio: string): string {
  if (propio.trim() === "") return "";
  return tituloReferencia(`${tipo} ${propio}`);
}

/** Separa un nombre guardado en su tipo y lo demás: «Blusa Dalia» → { tipo: "Blusa", propio: "Dalia" }. Sin tipo reconocible, todo es propio. */
export function separarNombre(referencia: string, tipos: readonly string[]): { tipo: string | null; propio: string } {
  const limpio = referencia.trim().replace(/\s+/g, " ");
  const [primera = "", ...resto] = limpio.split(" ");
  const tipo = tipos.find((t) => raiz(claveTexto(t)) === raiz(claveTexto(primera))) ?? null;
  return tipo ? { tipo, propio: resto.join(" ") } : { tipo: null, propio: limpio };
}

/** Las flores (en clave) que ya usa alguna prenda de la categoría: la primera palabra después del tipo. */
function floresUsadas(referencias: readonly string[], tipos: readonly string[]): Set<string> {
  const usadas = new Set<string>();
  for (const r of referencias) {
    const { propio } = separarNombre(r, tipos);
    const primera = palabras(propio)[0];
    if (primera) usadas.add(primera);
  }
  return usadas;
}

/**
 * Las próximas flores libres para esta categoría, en el orden de `FLORES`. Salta las que ya usa una prenda de la categoría y las que
 * el vocabulario de colores tiene como color (si un Líder crea el color «Amapola», deja de sugerirse). Si se acaban, vuelve a empezar:
 * la persona elige y el aviso de «ya existe» de la base sigue cuidando el idéntico.
 */
export function floresLibres(o: { referencias: readonly string[]; tipos: readonly string[]; colores?: readonly string[]; cuantas?: number }): string[] {
  const usadas = floresUsadas(o.referencias, o.tipos);
  const colores = new Set((o.colores ?? []).flatMap(palabras).map(raiz));
  const libres = FLORES.filter((f) => !usadas.has(claveTexto(f)) && !colores.has(raiz(claveTexto(f))));
  return (libres.length > 0 ? libres : FLORES).slice(0, o.cuantas ?? 3);
}

export type ReglaNombre = "largo" | "color" | "talla" | "numero" | "palabra" | "tipo-repetido" | "otro-tipo";
export type AvisoNombre = { regla: ReglaNombre; texto: string };

/**
 * Lo que el nombre propio hace distinto de la regla, en lenguaje de tienda. Lo primero que se escribe es la flor («Dalia»); lo que sigue
 * puede decir la versión de un modelo que se repite («Dalia corto»), así que la regla de largo mira solo la primera palabra. `colores` es
 * el vocabulario de la base (nombres y sinónimos de una palabra); `otrosTipos`, los tipos de las demás categorías.
 */
export function avisosDelNombre(propio: string, o: { tipos: readonly string[]; colores?: readonly string[]; otrosTipos?: readonly string[] }): AvisoNombre[] {
  const lista = palabras(propio);
  if (lista.length === 0) return [];
  const avisos: AvisoNombre[] = [];
  const original = propio.trim().split(/\s+/);
  const visible = (i: number) => conMayuscula(original[i] ?? lista[i]);
  const [primera] = lista;

  const tipoIgual = o.tipos.find((t) => raiz(claveTexto(t)) === raiz(primera));
  if (tipoIgual) avisos.push({ regla: "tipo-repetido", texto: `No escribas «${tipoIgual}»: ya lo pone el tipo. Escribe solo el nombre, como «Dalia».` });
  const otroTipo = !tipoIgual ? (o.otrosTipos ?? []).find((t) => raiz(claveTexto(t)) === raiz(primera)) : undefined;
  if (otroTipo) avisos.push({ regla: "otro-tipo", texto: `«${otroTipo}» es otro tipo de prenda: si lo es, cambia la categoría.` });

  const letras = primera.replace(/[^a-zç]/g, "").length;
  if (!tipoIgual && !otroTipo && (letras < LARGO_NOMBRE_PROPIO.min || letras > LARGO_NOMBRE_PROPIO.max)) {
    avisos.push({ regla: "largo", texto: `El nombre es una sola palabra de ${LARGO_NOMBRE_PROPIO.min} a ${LARGO_NOMBRE_PROPIO.max} letras, como «Dalia».` });
  }

  const colores = new Set([...COLORES_BASE, ...(o.colores ?? []).map((c) => claveTexto(c)).filter((c) => !c.includes(" "))].map(raiz));
  const iColor = lista.findIndex((p) => colores.has(raiz(p)));
  if (iColor >= 0) avisos.push({ regla: "color", texto: `«${visible(iColor)}» es un color: va en los colores de la prenda, no en el nombre.` });

  const iTalla = lista.findIndex((p) => TALLAS.includes(p));
  if (iTalla >= 0) avisos.push({ regla: "talla", texto: `«${visible(iTalla).toLocaleUpperCase("es")}» es una talla: va en las tallas de la prenda, no en el nombre.` });

  if (/\d/.test(propio)) avisos.push({ regla: "numero", texto: "Los números no van en el nombre: si es otro diseño, usa otra flor." });

  const iFuera = lista.findIndex((p) => PALABRAS_FUERA.includes(p));
  if (iFuera >= 0) avisos.push({ regla: "palabra", texto: `«${visible(iFuera)}» cambia con el tiempo: no va en el nombre.` });

  return avisos;
}

/** El aviso de un nombre YA guardado (Editar producto): mira lo que va después del tipo, si se reconoce. */
export function avisosDeReferencia(referencia: string, o: { tipos: readonly string[]; colores?: readonly string[]; otrosTipos?: readonly string[] }): AvisoNombre[] {
  if (o.tipos.length === 0) return [];
  const { tipo, propio } = separarNombre(referencia, o.tipos);
  return avisosDelNombre(tipo ? propio : referencia, { ...o, tipos: tipo ? o.tipos : [] });
}

/** Todos los tipos de las demás categorías: para avisar «Casaca» escrito dentro de Blusas. */
export function otrosTipos(prefijo: string | null | undefined): string[] {
  return Object.entries(TIPOS_POR_CATEGORIA)
    .filter(([p]) => p !== prefijo)
    .flatMap(([, tipos]) => tipos);
}

/**
 * La línea que va bajo el nombre: lo que la ficha ya sabe, de lo particular a lo general. «Manga globo, botones forrados · Lino · Rayas».
 * El patrón «Liso» no se dice (es lo normal). Sin nada, vacía.
 */
export function lineaDescriptiva(o: { detalle: string; tejido: string | null; patron: string | null }): string {
  const detalle = o.detalle.trim().replace(/\s+/g, " ");
  const partes = [detalle ? conMayuscula(detalle) : "", o.tejido?.trim() ?? "", o.patron && claveTexto(o.patron) !== "liso" ? o.patron.trim() : ""];
  return partes.filter(Boolean).join(" · ");
}

/**
 * Palabras con que un proveedor DESCRIBE en vez de nombrar («Blusa dama», «Wide leg», «Polo básico»): no distinguen una prenda de otra, así
 * que no sirven como nombre. Lo que describe va al detalle.
 */
const PALABRAS_QUE_DESCRIBEN = [
  "dama", "damas", "mujer", "mujeres", "hombre", "caballero", "nina", "nino", "unisex", "basico", "basica", "basicos", "moda", "modelo", "mod",
  "estilo", "style", "new", "fashion", "casual", "elegante", "wide", "leg", "oversize", "oversized", "slim", "skinny", "mom", "baggy", "palazzo",
  "cargo", "crop", "cropped", "manga", "larga", "largo", "corta", "corto", "cuello", "tiro", "alto", "alta", "plus", "set", "pack", "color", "colores",
];

/**
 * ¿El nombre que trae el proveedor sirve como nombre de la tienda? (ADR-0556, Felipe 2026-10-28: «proveedor primero, si sirve».)
 * Se le quitan el tipo de prenda, la marca, los códigos y lo que solo describe; si queda un nombre de una o dos palabras que no rompe la regla (sin
 * números, color, talla ni palabras que cambian con el tiempo), ese es: «Polo Evaluna Krisstell» → «Evaluna». Si no, `null` y se sugiere
 * una flor: «SS25 311» es un código, «Blusa dama» describe. El dato del proveedor se guarda igual, aparte, para compras.
 */
export function nombreDelProveedorComoNombre(
  texto: string,
  o: { tipos: readonly string[]; otrosTipos?: readonly string[]; colores?: readonly string[]; marca?: string | null },
): string | null {
  const tiposTodos = new Set([...o.tipos, ...(o.otrosTipos ?? [])].map((t) => raiz(claveTexto(t))));
  const deLaMarca = new Set(palabras(o.marca ?? ""));
  const originales = texto.trim().split(/\s+/).filter(Boolean);
  const quedan = originales.filter((w) => {
    const [p] = palabras(w);
    if (!p) return false;
    // Un código («311», «SS25») se queda en el dato del proveedor, no en el nombre: «Evaluna 311» → «Evaluna».
    return !/\d/.test(p) && !tiposTodos.has(raiz(p)) && !deLaMarca.has(p) && !PALABRAS_QUE_DESCRIBEN.includes(p);
  });
  if (quedan.length === 0 || quedan.length > 2) return null;
  const candidato = tituloReferencia(quedan.join(" "));
  return avisosDelNombre(candidato, { tipos: o.tipos, colores: o.colores, otrosTipos: o.otrosTipos }).length === 0 ? candidato : null;
}
