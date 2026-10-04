import { normalizarBusqueda } from "./combo-reglas";

// La categoría de una «prenda sin registrar» sugerida desde lo que la asesora escribe (ADR-0328, decisión técnica 6; ADR-0290).
//
// EL PROBLEMA. En la caja, una prenda sin etiqueta se cobra anotando categoría, talla y color (ADR-0179). La categoría se elige a mano y
// a veces no calza con lo que la asesora misma escribe: en AQP hay ventas descritas «Jean…» guardadas como Pantalones, y el ADR-0328 cita
// una correa anotada como «Collares». El mix del piso (ADR-0329) aprende de esa categoría: Jeans parecía no venderse.
//
// CONTRATO
//   PROMETE: con la descripción y las categorías ACTIVAS, la categoría que esa descripción nombra y la palabra que la delató; `null` si
//            la descripción no nombra ninguna prenda o si dos categorías empatan de verdad (mejor callar que sugerir mal).
//   ASUME:   cada categoría trae su `prefijo` (la clave estable, ADR-0290: nunca el nombre visible, que se renombra) y su `nombre`.
//   NO HACE: no elige por nadie. Es una sugerencia que la asesora confirma con un toque (`PrendaSinRegistrarModal`); nunca se aplica sola.
//
// CÓMO LEE UNA DESCRIPCIÓN. En castellano la prenda va primero y lo que la describe después: «chaqueta jean» es una chaqueta de jean,
// «jean azul» es un jean. Por eso gana la PRIMERA palabra que nombra una prenda (y, en el mismo lugar, la frase más larga: «enterizo de
// baño» es traje de baño, no enterizo). Las palabras que no nombran prendas («linda», «tiro alto», «28») se saltan. Única excepción
// escrita: un pantalón de jean ES un jean (`REFINAR`), porque CAYLA separa Jeans de Pantalones (vocabulario cerrado, 20260912235500).
//
// DE DÓNDE SALEN LAS PALABRAS de cada categoría, en este orden: (1) la tabla curada `SINONIMOS_POR_CATEGORIA`, por prefijo, con el
// vocabulario de tienda peruano (chompa, polera, casaca, correa, canguro…); (2) el propio nombre de la categoría, partido en «/» e «y»
// («Gorros y Sombreros» → gorro, sombrero). Así una categoría que un Líder crea sin deploy también se sugiere, por su nombre.
// Singular y plural valen lo mismo («pantalones» = «pantalón»), sin tildes ni mayúsculas.

export type CategoriaParaSugerir = { id: string; nombre: string; prefijo: string | null };

export type CategoriaSugerida = {
  categoriaId: string;
  nombre: string;
  /** La palabra (o frase) de la descripción que la delató, tal como la escribió la asesora: «jean», «Correa». */
  palabra: string;
};

/**
 * Vocabulario de tienda por `categorias.prefijo`. Felipe lo veta y lo cambia aquí, en un solo lugar. Una palabra ambigua no entra
 * (p. ej. «pendiente», que es arete pero también «por hacer»; «set», que es conjunto pero también «set de aretes»; «cargo», que choca
 * con «Cargo especial»): una sugerencia equivocada es peor que ninguna.
 */
export const SINONIMOS_POR_CATEGORIA: Readonly<Record<string, readonly string[]>> = {
  // ---- indumentaria ----
  ABR: ["abrigo", "tapado", "gabardina", "trench", "sobretodo"],
  BLZ: ["blazer", "saco"],
  BLU: ["blusa"],
  BOD: ["body", "bodysuit"],
  CMS: ["camisa"],
  CAS: ["casaca", "chaqueta", "chamarra", "cortaviento", "rompevientos", "bomber", "campera"],
  CHA: ["chaleco"],
  CMP: ["chompa", "sueter", "sweater", "jersey", "cardigan", "pullover"],
  CON: ["conjunto", "dos piezas", "2 piezas"],
  ENT: ["enterizo", "jumpsuit", "overol", "jardinero", "mameluco"],
  FAL: ["falda", "minifalda", "pollera"],
  JEA: ["jean", "denim", "vaquero"],
  PAN: ["pantalon", "palazzo", "legging", "leggin", "jogger", "culotte"],
  SUD: ["polera", "sudadera", "hoodie"],
  POL: ["polo", "camiseta", "remera", "t shirt", "tshirt", "playera"],
  LEN: ["lenceria", "ropa interior", "brasier", "sosten", "bralette", "calzon", "trusa", "tanga", "panty", "panties"],
  SHO: ["short", "bermuda", "hot pant"],
  TOP: ["top", "crop top", "croptop", "bustier", "corset", "bividi"],
  TBA: ["bikini", "trikini", "tankini", "traje de bano", "ropa de bano", "terno de bano", "enterizo de bano"],
  VES: ["vestido"],
  // ---- calzado ----
  BAI: ["bailarina", "balerina"],
  BOT: ["bota"],
  BOI: ["botin"],
  MSN: ["mocasin", "loafer"],
  SAN: ["sandalia", "chancla"],
  ZAP: ["zapatilla", "tenis", "sneaker"],
  ZFO: ["zapato", "stiletto"],
  // ---- accesorios ----
  CAR: ["cartera", "bolso", "clutch", "tote"],
  CIN: ["cinturon", "correa"],
  GOR: ["gorro", "gorra", "sombrero", "boina", "chullo", "visera"],
  LSO: ["lentes", "gafas", "anteojos", "lentes de sol"],
  MOC: ["mochila"],
  BUF: ["panuelo", "panoleta", "bufanda", "chalina", "foulard", "pashmina"],
  REL: ["reloj", "relojes"],
  // En el Perú «canguro» es la riñonera; «polera canguro» sigue siendo polera porque la prenda va primero.
  RIN: ["rinonera", "canguro"],
  // ---- belleza ----
  MAQ: ["maquillaje", "labial", "rimel", "delineador", "rubor", "gloss"],
  // ---- bisutería ----
  ANL: ["anillo", "sortija"],
  ARE: ["arete", "zarcillo"],
  COL: ["collar", "gargantilla", "cadena", "choker"],
  PUL: ["pulsera", "brazalete", "esclava"],
  // ---- papelería ---- (el NOMBRE «Colores» no cuenta solo: «color» es un atributo de cualquier prenda, ver `PALABRAS_QUE_NO_SON_PRENDA`)
  UTC: ["crayola", "lapices de colores", "colores escolares"],
  LAP: ["lapicero", "boligrafo"],
  LIB: ["libreta", "cuaderno", "agenda"],
  UOF: ["resaltador", "engrapador", "engrapadora", "tijera", "post it"],
};

/** Un pantalón de jean ES un jean: si la prenda es de `de` y más adelante aparece una de `con`, la categoría es `a`. */
const REFINAR: readonly { de: string; con: readonly string[]; a: string }[] = [{ de: "PAN", con: ["jean", "denim", "vaquero"], a: "JEA" }];

/** Palabras que pueden ser el NOMBRE de una categoría pero que, solas, describen cualquier prenda: no la delatan. */
const PALABRAS_QUE_NO_SON_PRENDA = new Set(["color", "talla", "otro", "otra", "vario", "general", "articulo", "producto", "prenda"]);

/**
 * Singular de una palabra ya normalizada, lo justo para que «pantalones», «collares», «lápices» y «jeans» calcen con su forma de una.
 * Se aplica igual a la descripción y a las palabras de cada categoría: lo que importa es que las dos lleguen a la misma forma.
 */
export function singular(palabra: string): string {
  if (palabra.length <= 3) return palabra;
  if (palabra.endsWith("ces")) return `${palabra.slice(0, -3)}z`;
  // «-es» tras l, n, r, d o y es plural de una palabra que termina en consonante (pantalón·es, collar·es); tras otra letra, la «e» es
  // de la palabra (arete·s, traje·s). «Relojes» queda «reloje»: por eso la tabla trae «reloj» y «relojes».
  if (palabra.endsWith("es") && "lnrdy".includes(palabra.at(-3) ?? "")) return palabra.slice(0, -2);
  if (palabra.endsWith("s")) return palabra.slice(0, -1);
  return palabra;
}

/** Las palabras de un texto, sin tildes ni mayúsculas ni signos, cada una en singular. */
export const formas = (texto: string): string[] => {
  const n = normalizarBusqueda(texto);
  return n ? n.split(" ").map(singular) : [];
};

type Termino = { categoria: CategoriaParaSugerir; formas: string[]; peso: number };

/** El nombre de la categoría partido en sus prendas: «Gorros y Sombreros» → gorro · sombrero; «Ropa interior/Lencería» → ropa interior · lencería. */
function partesDelNombre(nombre: string): string[] {
  return nombre
    .split(/\/|,|\s+y\s+/i)
    .map((p) => p.trim())
    .filter(Boolean);
}

function terminosDe(c: CategoriaParaSugerir): Termino[] {
  const partes = partesDelNombre(c.nombre);
  // Un nombre de una sola prenda («Blusas») pesa como la tabla curada; uno que junta dos («Camisas y Blusas») pesa menos: si «Blusas»
  // también existiera activa, «blusa» es suya.
  const pesoNombre = partes.length === 1 ? 2 : 1;
  const out: Termino[] = [];
  for (const s of c.prefijo ? (SINONIMOS_POR_CATEGORIA[c.prefijo] ?? []) : []) out.push({ categoria: c, formas: formas(s), peso: 2 });
  for (const p of partes) {
    const f = formas(p);
    if (f.length === 0 || (f.length === 1 && PALABRAS_QUE_NO_SON_PRENDA.has(f[0]!))) continue;
    out.push({ categoria: c, formas: f, peso: pesoNombre });
  }
  return out;
}

/** Las palabras de la tabla curada de una categoría, para que el combo de categorías también las encuentre («correa» → Cinturones). */
export function sinonimosDeCategoria(prefijo: string | null | undefined): readonly string[] {
  return prefijo ? (SINONIMOS_POR_CATEGORIA[prefijo] ?? []) : [];
}

type Coincidencia = { termino: Termino; desde: number };

function coincidencias(palabras: string[], terminos: Termino[]): Coincidencia[] {
  const out: Coincidencia[] = [];
  for (const termino of terminos) {
    const n = termino.formas.length;
    for (let i = 0; i + n <= palabras.length; i++) {
      if (termino.formas.every((f, j) => palabras[i + j] === f)) out.push({ termino, desde: i });
    }
  }
  return out;
}

/** El texto original de las palabras [desde, desde + n) de la descripción, para decirle a la asesora qué leyó el sistema. */
function textoOriginal(descripcion: string, desde: number, n: number): string {
  const originales = descripcion.normalize("NFC").match(/[\p{L}\p{N}]+/gu) ?? [];
  // `normalizarBusqueda` separa letra y número pegados («2piezas»): si no calzan uno a uno, se muestra la forma normalizada.
  const normal = normalizarBusqueda(descripcion).split(" ");
  const fuente = originales.length === normal.length ? originales : normal;
  return fuente.slice(desde, desde + n).join(" ");
}

/**
 * La categoría que nombra la descripción, o `null`. Determinista: la misma descripción y las mismas categorías dan siempre lo mismo
 * (sin azar ni red: una sede sin señal ve lo mismo).
 */
export function sugerirCategoria(descripcion: string, categorias: readonly CategoriaParaSugerir[]): CategoriaSugerida | null {
  const palabras = formas(descripcion);
  if (palabras.length === 0) return null;
  const terminos = categorias.flatMap(terminosDe);
  const todas = coincidencias(palabras, terminos);
  if (todas.length === 0) return null;

  // La prenda va primero; en el mismo lugar, la frase más larga; y con el mismo largo, la palabra con más peso.
  const primera = Math.min(...todas.map((c) => c.desde));
  const enPrimera = todas.filter((c) => c.desde === primera);
  const largo = Math.max(...enPrimera.map((c) => c.termino.formas.length));
  const largas = enPrimera.filter((c) => c.termino.formas.length === largo);
  const peso = Math.max(...largas.map((c) => c.termino.peso));
  const mejores = largas.filter((c) => c.termino.peso === peso);
  const ids = new Set(mejores.map((c) => c.termino.categoria.id));
  // Dos categorías con la misma palabra y el mismo peso: no hay cómo elegir sin adivinar.
  if (ids.size !== 1) return null;
  const elegida = mejores[0]!;
  let categoria = elegida.termino.categoria;
  let palabra = textoOriginal(descripcion, primera, largo);

  // «Pantalón jean»: un pantalón de jean es un jean.
  const regla = REFINAR.find((r) => r.de === categoria.prefijo);
  if (regla) {
    const destino = categorias.find((c) => c.prefijo === regla.a);
    const despues = palabras.slice(primera + largo);
    const i = despues.findIndex((p) => regla.con.some((c) => formas(c).join(" ") === p));
    if (destino && i >= 0) {
      categoria = destino;
      palabra = textoOriginal(descripcion, primera + largo + i, 1);
    }
  }
  return { categoriaId: categoria.id, nombre: categoria.nombre, palabra };
}

/**
 * Lo que el modal le dice a la asesora, o `null` si no hay nada que decir: la descripción no nombra una prenda, o nombra justo la
 * categoría que ya eligió. Es el único lugar donde se decide CUÁNDO se muestra la sugerencia.
 */
export function sugerenciaParaMostrar(
  descripcionEscrita: string | null,
  categoriaElegidaId: string,
  categorias: readonly CategoriaParaSugerir[],
): CategoriaSugerida | null {
  // La descripción que el sistema armó solo («Pantalones · Negro · Talla 28») no es evidencia: sale de la categoría elegida.
  if (descripcionEscrita === null) return null;
  const s = sugerirCategoria(descripcionEscrita, categorias);
  return s && s.categoriaId !== categoriaElegidaId ? s : null;
}
