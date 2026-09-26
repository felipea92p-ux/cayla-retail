import { clave } from "./buscar-prenda-v2";

/* ====================================================================
   Filtro de búsqueda especial (2026-09-21, primero en Existencias)

   Por qué existe: el buscador de Existencias tomaba lo escrito como UNA sola
   cadena y la buscaba en nombre, SKU y código de barras. «blusa rosado m» no
   encontraba nada —ninguna prenda tiene esa frase entera— y el color y la talla
   ni se miraban. Quien piensa «la blusa rosada, la M» tiene que poder escribirlo
   así, en el orden que se le ocurra.

   Cómo funciona:
   · La consulta se parte en términos (por espacios) y TODOS tienen que
     cumplirse, cada uno en el campo que le toque: uno puede caer en el nombre,
     otro en el color y otro en la talla. Sin mayúsculas ni tildes, y parcial
     mientras se escribe («blu» → Blusa).
   · Un término suelto que es una TALLA que existe en los datos («s», «m», «l»,
     «xl», «30») se compara solo con la talla y exacto. Si también se buscara
     dentro de los nombres, «blusa l» traería todas las blusas: «Blusa» tiene una L.
   · Un término que es un color completo se compara con el color y con sus
     equivalentes: «blanca» = «blanco», «rosada» = «rosado», «cafe» = «marrón».
   · El texto manda sobre el filtro visual de su MISMA dimensión: si escribiste
     «m», la lista de Talla se ignora; si no escribiste ninguna talla, sigue
     aplicando. Lo que el texto no puede decir (categoría, estado…) nunca se ignora.

   · Lo escrito en plural también encuentra el singular («blusas» → Blusa) y los
     códigos se encuentran aunque se escriban sin guiones («blucamblal» →
     BLU-CAM-BLA-L). Las palabras que solo acompañan («talla», «color», «de», «la»…)
     no filtran nada, salvo que sean lo único escrito.

   Talla y color se reconocen contra lo que hay en las filas que se buscan (el
   «vocabulario»), no con una lista fija: así «xl» solo es talla donde existe
   una XL, y un «30» que no es talla sigue buscándose en SKU y códigos.

   Marca y categoría (2026-09-26, Existencias): campos OPCIONALES de `CamposBuscables`.
   Quien no los pasa (Análisis, Movimientos) se comporta exactamente como antes, y la
   copia en SQL de Movimientos no cambia. Se buscan por INICIO DE PALABRA («cay» → Cayla,
   «pol» → Polos; «tica» no trae «Artemisa»), no como trozo suelto, y NO son una dimensión:
   el texto nunca pisa un filtro visual por ellas (una marca «Doradas Chic» no es el color
   Dorado, y «Pantalon Cayla» es un nombre, no la marca CAYLA). Una palabra cuenta como
   inicio también después de «/», «-», «_», «(» («Ropa interior/Lencería» → «lenceria»), y la
   marca se encuentra escrita sin sus puntos o espacios: «yjj» → «y.j.j», «cayla2» → «Cayla 2».
   UN TÉRMINO QUE ES UN COLOR no busca en marca ni categoría (revisión 2026-09-26): «dorada» ya
   se lee como color, y si buscara también la marca «Doradas Chic» traería toda la blusa, de
   cualquier color, según el género con que se escriba. La marca se encuentra con las demás
   palabras («chic», «doradas chic» como texto) o con el filtro Marca. Con
   `ordenar: "relevancia"` las coincidencias más fuertes salen primero; ver `puntajeDeCampos`.

   Lo usan Existencias, Análisis (Desempeño y Comparar períodos) y, con las mismas
   reglas escritas en SQL, Movimientos (`fn_movimientos_variantes`). Las dos versiones
   se mantienen iguales con `filtro-busqueda-especial.casos.json`: los mismos casos,
   las mismas respuestas, verificados aquí y contra Postgres.

   Es puro (no sabe de React ni de Supabase) y no conoce el tipo de la fila: cada
   pantalla dice cómo leer sus campos (`leer`), para que Ventas, Cambios o Conteo
   lo usen sin copiarlo. `filtrarPrendasV2` (la caja) NO se toca: una prueba suya
   fija que ahí dos palabras sueltas no se buscan por separado.
   ==================================================================== */

/** Lo que el filtro necesita saber de una fila para buscarla, sea cual sea el tipo de la pantalla. */
export type CamposBuscables = {
  nombre: string;
  sku: string | null;
  codigosBarras: readonly string[];
  /** Otros códigos que se buscan igual que el de barras (código de variante, código de producto). */
  otrosCodigos?: readonly string[];
  color: string | null;
  talla: string | null;
  /** La marca comercial del producto («Miramhe», «Cayla 2»). Opcional: quien no la pasa no la busca. */
  marca?: string | null;
  /** La categoría del producto («Polos», «Camisas y Blusas»). Opcional, igual que la marca. */
  categoria?: string | null;
};

/** Los mismos campos ya sin mayúsculas ni tildes: se normalizan una vez, no en cada tecla. */
export type CamposNormalizados = {
  nombre: string;
  sku: string;
  /** Códigos de barras y demás códigos, tal como se escriben. */
  codigos: string[];
  /** El SKU y todos los códigos sin guiones ni separadores, para encontrarlos aunque se tecleen pegados. */
  compactos: string[];
  color: string;
  talla: string;
  /** La marca sin tildes y con «/», «-», «_», «(», «)» como espacio (el «.» se queda: «y.j.j»). */
  marca: string;
  /** La marca sin puntos, guiones ni espacios («y.j.j» → «yjj», «Cayla 2» → «cayla2»): para encontrarla escrita pegada. */
  marcaCompacta: string;
  categoria: string;
};

/** Sin guiones, guiones bajos, puntos ni barras: «BLU-CAM-BLA-L» → «blucamblal». Solo se usa para comparar códigos. */
const compactar = (texto: string): string => clave(texto).replace(/[-_./]+/g, "");

/** El nombre de una marca o categoría partido en palabras: «Ropa interior/Lencería» → «ropa interior lenceria». Sin tildes ni NBSP ni tabulaciones. */
const enPalabras = (texto: string | null | undefined): string => clave(texto).replace(/[\s/_()-]+/g, " ").trim();

export type IndiceBusquedaEspecial<T> = {
  entradas: { fila: T; campos: CamposNormalizados }[];
  /** Qué tallas y qué palabras de color existen en estas filas: con eso se reconoce qué término suelto es una talla o un color. */
  vocabulario: { tallas: ReadonlySet<string>; palabrasDeColor: ReadonlySet<string> };
};

/** Normaliza los campos de UNA fila (sin mayúsculas ni tildes). Sale de `crearIndiceBusquedaEspecial` para que quien necesite
 *  comparar una fila suelta con una consulta ya interpretada (el «no hay stock en esta sede» de Existencias) use la misma lectura. */
export function normalizarCamposBuscables(c: CamposBuscables): CamposNormalizados {
  const codigos = [...c.codigosBarras, ...(c.otrosCodigos ?? [])].map(clave).filter(Boolean);
  return {
    nombre: clave(c.nombre),
    sku: clave(c.sku),
    codigos,
    compactos: [c.sku ?? "", ...codigos].map(compactar).filter(Boolean),
    color: clave(c.color),
    talla: clave(c.talla),
    marca: enPalabras(c.marca),
    marcaCompacta: compactar(c.marca ?? "").replace(/\s+/g, ""),
    categoria: enPalabras(c.categoria),
  };
}

/** Prepara las filas para buscarlas: normaliza sus campos y junta el vocabulario. Se hace una vez por conjunto de filas. */
export function crearIndiceBusquedaEspecial<T>(filas: readonly T[], leer: (fila: T) => CamposBuscables): IndiceBusquedaEspecial<T> {
  const tallas = new Set<string>();
  const palabrasDeColor = new Set<string>();
  const entradas = filas.map((fila) => {
    const campos = normalizarCamposBuscables(leer(fila));
    if (campos.talla) tallas.add(campos.talla);
    // «Azul marino» aporta «azul» y «marino»: escribir cualquiera de las dos ya dice color.
    for (const palabra of campos.color.split(/[\s-]+/)) if (palabra) palabrasDeColor.add(palabra);
    return { fila, campos };
  });
  return { entradas, vocabulario: { tallas, palabrasDeColor } };
}

// ---------------------------------------------------------------------------
// Equivalencias de color
// ---------------------------------------------------------------------------

// Palabras de uso corriente que el catálogo escribe distinto. Solo lo necesario: el género y el plural
// (blanca, blancas) se resuelven solos, abajo; esto es para lo que no es de género.
const ALIAS_DE_COLOR: Readonly<Record<string, string>> = {
  rosa: "rosado", // «Rosado» y «Palo rosa»: quien escribe «rosa» quiere ambos
  anaranjado: "naranja",
  cafe: "marron", // «Marrón», ya sin tilde
};

/** El singular de lo escrito en plural: «blusas» → «blusa», «pantalones» → «pantalon». Vacío si no parece plural o si es un número o código. */
function singularesDe(texto: string): string[] {
  if (/\d/.test(texto)) return [];
  const singulares: string[] = [];
  if (texto.length >= 6 && texto.endsWith("es")) singulares.push(texto.slice(0, -2));
  if (texto.length >= 4 && texto.endsWith("s")) singulares.push(texto.slice(0, -1));
  return singulares;
}

/** Las formas con que se puede escribir un color: la que llegó, su singular, su otro género («blancas» → «blanca» → «blanco») y su alias. */
function formasDeColor(texto: string): string[] {
  const formas = new Set<string>([texto, ...singularesDe(texto)]);
  for (const forma of [...formas]) {
    if (forma.endsWith("a")) formas.add(`${forma.slice(0, -1)}o`);
    else if (forma.endsWith("o")) formas.add(`${forma.slice(0, -1)}a`);
  }
  for (const forma of [...formas]) {
    const alias = ALIAS_DE_COLOR[forma];
    if (alias) formas.add(alias);
  }
  return [...formas];
}

// ---------------------------------------------------------------------------
// Interpretar y aplicar la consulta
// ---------------------------------------------------------------------------

export type TerminoDeBusqueda =
  | { tipo: "talla"; texto: string }
  /** `formas`: lo escrito y sus equivalentes que de verdad existen en los datos («blancas» → «blanco»). */
  | { tipo: "color"; texto: string; formas: string[] }
  /** `singulares`: el singular de lo escrito en plural; se busca solo al comienzo de una palabra del nombre. */
  | { tipo: "texto"; texto: string; singulares: string[] };

/** Qué dimensiones dice el texto: si dice una, el filtro visual de esa dimensión se ignora. */
export type DimensionesExpresadas = { talla: boolean; color: boolean };

export type BusquedaEspecial = {
  terminos: readonly TerminoDeBusqueda[];
  dimensiones: DimensionesExpresadas;
  /** ¿Cumple la fila TODOS los términos? Sin términos (consulta vacía) cumple siempre. */
  coincide: (campos: CamposNormalizados) => boolean;
  /** Qué tan fuerte coincide la fila: la suma, por término, de su mejor campo (`puntajeDeCampos`). Solo ordena; quién entra y quién no lo decide `coincide`. */
  puntaje: (campos: CamposNormalizados) => number;
};

/** Palabras que se escriben por costumbre («blusa talla L», «falda de lino») y no filtran nada. */
const PALABRAS_VACIAS: ReadonlySet<string> = new Set(["talla", "tallas", "color", "colores", "de", "del", "en", "la", "el", "los", "las", "y", "con", "para", "un", "una"]);

const empiezaPalabra = (nombre: string, raiz: string): boolean => ` ${nombre}`.includes(` ${raiz}`);

/** Desde cuántas letras un término sin guiones puede cruzar el guion de un código: con menos, «ine» encontraría «JULI-NEG». */
const LARGO_MINIMO_DE_CODIGO_PEGADO = 4;

/** Desde cuántas letras una marca escrita sin sus puntos o espacios («yjj», «cayla2») se encuentra: con menos, «y» o «ca» traerían casi todo. */
const LARGO_MINIMO_DE_MARCA_PEGADA = 3;

/**
 * ¿Alguna de las formas está en el nombre, SKU, color, talla o en algún código (con o sin guiones)? Los singulares de un
 * plural solo valen al comienzo de una palabra del nombre: «inés» no pierde su «s» para traer todo lo que tenga «ine»
 * dentro de un código, pero «blusas» sí llega a «Blusa».
 *
 * `conMarcaYCategoria` (verdadero salvo para un término que es un COLOR): además busca en la marca y la categoría,
 * por inicio de palabra, y la marca escrita sin puntos ni espacios. Si la pantalla no las pasó, están vacías y nunca aciertan.
 */
function crearBuscador(formas: readonly string[], singulares: readonly string[] = [], conMarcaYCategoria = true): (c: CamposNormalizados) => boolean {
  const compactas = [...new Set(formas.map(compactar).filter((k) => k.length >= LARGO_MINIMO_DE_CODIGO_PEGADO))];
  const marcasPegadas = conMarcaYCategoria ? [...new Set(formas.map(compactar).filter((k) => k.length >= LARGO_MINIMO_DE_MARCA_PEGADA))] : [];
  return (c) =>
    formas.some(
      (f) =>
        c.nombre.includes(f) ||
        c.sku.includes(f) ||
        c.color.includes(f) ||
        c.talla.includes(f) ||
        c.codigos.some((codigo) => codigo.includes(f)) ||
        (conMarcaYCategoria && (empiezaPalabra(c.marca, f) || empiezaPalabra(c.categoria, f)))
    ) ||
    compactas.some((k) => c.compactos.some((codigo) => codigo.includes(k))) ||
    marcasPegadas.some((k) => c.marcaCompacta.startsWith(k)) ||
    singulares.some((raiz) => empiezaPalabra(c.nombre, raiz) || (conMarcaYCategoria && (empiezaPalabra(c.marca, raiz) || empiezaPalabra(c.categoria, raiz))));
}

/** ¿La palabra completa `palabra` es una de las palabras de `texto`? («cayla» está en «cayla 2»; «cay» no.) */
const esPalabraCompleta = (texto: string, palabra: string): boolean => ` ${texto} `.includes(` ${palabra} `);

/**
 * Qué tan fuerte coincide UNA fila con UN término de texto (o color): el mejor campo gana, 0 si ninguno.
 * Escala: código completo 100 > nombre desde inicio de palabra 60 = marca completa 60 > marca desde inicio 50 >
 * nombre en medio 40 = categoría 40 > color o talla 30 > código parcial 10. Pensada para ordenar unas cuantas
 * miles de filas por tecla, no para medir nada: lo que importa es que una marca escrita entera gane a un trozo
 * perdido dentro de un código. Va aparte de `crearBuscador` a propósito: aquello decide quién entra (y tiene su copia
 * en SQL, verificada con los mismos casos); esto solo decide el orden y solo existe en pantalla.
 */
function puntajeDeCampos(formas: readonly string[], singulares: readonly string[], c: CamposNormalizados, conMarcaYCategoria = true): number {
  const compactas = formas.map(compactar).filter((k) => k.length >= LARGO_MINIMO_DE_CODIGO_PEGADO);
  const marcasPegadas = conMarcaYCategoria ? formas.map(compactar).filter((k) => k.length >= LARGO_MINIMO_DE_MARCA_PEGADA) : [];
  let mejor = 0;
  const subir = (puntos: number) => {
    if (puntos > mejor) mejor = puntos;
  };
  // `menos`: lo que se resta cuando la coincidencia es por un singular que el motor derivó («mias» → «mia»): lo escrito tal cual gana el desempate.
  const enNombreMarcaOCategoria = (f: string, menos: number) => {
    if (empiezaPalabra(c.nombre, f)) subir(60 - menos);
    if (!conMarcaYCategoria) return;
    if (c.marca && esPalabraCompleta(c.marca, f)) subir(60 - menos);
    else if (empiezaPalabra(c.marca, f)) subir(50 - menos);
    if (empiezaPalabra(c.categoria, f)) subir(40 - menos);
  };
  for (const f of formas) {
    if (c.sku === f || c.codigos.includes(f)) subir(100);
    enNombreMarcaOCategoria(f, 0);
    if (c.nombre.includes(f)) subir(40);
    if (c.color.includes(f) || c.talla.includes(f)) subir(30);
    if (c.sku.includes(f) || c.codigos.some((codigo) => codigo.includes(f))) subir(10);
  }
  // Los singulares de un plural solo valen donde `crearBuscador` los deja: nombre, marca y categoría, al inicio de una palabra.
  for (const raiz of singulares) enNombreMarcaOCategoria(raiz, 5);
  if (compactas.some((k) => c.compactos.some((codigo) => codigo.includes(k)))) subir(10);
  if (marcasPegadas.some((k) => c.marcaCompacta.startsWith(k))) subir(50);
  return mejor;
}

/** Parte lo escrito en términos y decide qué es cada uno: talla, color o texto libre. */
export function interpretarBusquedaEspecial(consulta: string, vocabulario: IndiceBusquedaEspecial<unknown>["vocabulario"]): BusquedaEspecial {
  const escritos = consulta.split(/[\s,;]+/).map(clave).filter(Boolean);
  // Las palabras de compañía se descartan, pero si son TODO lo escrito («el», «de» mientras se teclea «elena», «denim») se buscan como texto.
  const utiles = escritos.filter((texto) => !PALABRAS_VACIAS.has(texto));
  const terminos = (utiles.length > 0 ? utiles : escritos).map((texto): TerminoDeBusqueda => {
    if (vocabulario.tallas.has(texto)) return { tipo: "talla", texto };
    const formas = formasDeColor(texto);
    if (formas.some((forma) => vocabulario.palabrasDeColor.has(forma))) {
      return { tipo: "color", texto, formas: formas.filter((forma) => forma === texto || vocabulario.palabrasDeColor.has(forma)) };
    }
    return { tipo: "texto", texto, singulares: singularesDe(texto) };
  });

  const condiciones = terminos.map((t): ((c: CamposNormalizados) => boolean) => {
    if (t.tipo === "talla") return (c) => c.talla === t.texto;
    // Un color busca como siempre (nombre, SKU, color, talla, códigos), NO en la marca ni la categoría: ver la cabecera.
    if (t.tipo === "color") return crearBuscador(t.formas, [], false);
    return crearBuscador([t.texto], t.singulares);
  });

  const puntajes = terminos.map((t): ((c: CamposNormalizados) => number) => {
    if (t.tipo === "talla") return (c) => (c.talla === t.texto ? 30 : 0);
    if (t.tipo === "color") return (c) => puntajeDeCampos(t.formas, [], c, false);
    return (c) => puntajeDeCampos([t.texto], t.singulares, c);
  });

  return {
    terminos,
    dimensiones: { talla: terminos.some((t) => t.tipo === "talla"), color: terminos.some((t) => t.tipo === "color") },
    coincide: (campos) => condiciones.every((cumple) => cumple(campos)),
    puntaje: (campos) => puntajes.reduce((suma, puntuar) => suma + puntuar(campos), 0),
  };
}

/** Los filtros visuales de la pantalla, tal como están elegidos (`null` = sin elegir). */
export type FiltrosVisuales<T> = {
  talla?: string | null;
  color?: string | null;
  /** Todo lo demás que la pantalla filtra (categoría, estado…): nunca lo ignora el texto. */
  otros?: (fila: T) => boolean;
};

/** Cómo salen las filas. Sin opciones, en el orden en que llegaron (el de siempre). */
export type OpcionesDeOrden<T> = {
  /** `"relevancia"`: las coincidencias más fuertes primero. Solo cuenta con texto escrito; sin texto, el orden original. */
  ordenar?: "relevancia";
  /** Quién forma un solo bloque al ordenar (p. ej. el producto: sus tallas y colores no se separan). Cada bloque vale lo que su mejor fila. */
  grupo?: (fila: T) => string;
};

/** El filtro completo: la consulta escrita + los filtros visuales, con el texto mandando en su dimensión. */
export function filtrarConBusquedaEspecial<T>(
  indice: IndiceBusquedaEspecial<T>,
  consulta: string,
  visuales: FiltrosVisuales<T> = {},
  opciones: OpcionesDeOrden<T> = {}
): { filas: T[]; dimensiones: DimensionesExpresadas } {
  const busqueda = interpretarBusquedaEspecial(consulta, indice.vocabulario);
  const talla = !busqueda.dimensiones.talla && visuales.talla ? clave(visuales.talla) : null;
  const color = !busqueda.dimensiones.color && visuales.color ? clave(visuales.color) : null;
  const elegidas = indice.entradas.filter(
    ({ fila, campos }) =>
      busqueda.coincide(campos) && (talla === null || campos.talla === talla) && (color === null || campos.color === color) && (!visuales.otros || visuales.otros(fila))
  );
  if (opciones.ordenar !== "relevancia" || busqueda.terminos.length === 0) {
    return { filas: elegidas.map((entrada) => entrada.fila), dimensiones: busqueda.dimensiones };
  }
  // Por relevancia: cada bloque vale lo que su mejor fila. Entre bloques iguales manda dónde EMPEZÓ cada uno en el orden original, y
  // dentro de un bloque, el orden original: así las variantes de un producto siguen juntas y en su orden aunque la entrada las
  // intercalara con las de otro. Un `grupo` vacío o sin valor no funde filas ajenas: esa fila es su propio bloque.
  const bloques = new Map<string, { puntaje: number; primera: number }>();
  const conGrupo = elegidas.map((entrada, posicion) => {
    const grupo = opciones.grupo?.(entrada.fila) || `#${posicion}`;
    const puntaje = busqueda.puntaje(entrada.campos);
    const bloque = bloques.get(grupo);
    if (!bloque) bloques.set(grupo, { puntaje, primera: posicion });
    else if (puntaje > bloque.puntaje) bloque.puntaje = puntaje;
    return { entrada, posicion, grupo };
  });
  const filas = conGrupo
    .sort((a, b) => {
      const ba = bloques.get(a.grupo)!;
      const bb = bloques.get(b.grupo)!;
      return bb.puntaje - ba.puntaje || ba.primera - bb.primera || a.posicion - b.posicion;
    })
    .map(({ entrada }) => entrada.fila);
  return { filas, dimensiones: busqueda.dimensiones };
}
