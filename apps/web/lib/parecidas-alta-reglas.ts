// Reglas puras de «¿ya tenemos esta prenda?» — comparan lo tecleado en el alta contra las prendas que ya existen. Sin React ni red.
//
// EL PROBLEMA. Dos sedes cargan la MISMA prenda con nombres distintos («Camisa Lara» / «Blusa Lara», «Lara Camisa», «Polo G 44»)
// y el stock queda partido en dos fichas. Comparar el texto del nombre no alcanza: cada integrante escribe distinto, y lo que hace
// «la misma prenda» es el DISEÑO, que solo la persona ve mirando foto y stock. Este archivo no decide: ORDENA lo que ya existe
// según cuánto se parece a lo tecleado, dice POR QUÉ en una frase de tienda, y solo FRENA el idéntico exacto.
//
// CONTRATO
//   PROMETE: dado lo tecleado (`ConsultaAlta`) y las prendas existentes (`CandidataAlta[]`), devuelve la lista ya ordenada con su
//            nivel (identico | casi_igual | parecida | contexto), el motivo, la frase corta y los códigos de la marca leídos de
//            cada lado. Es determinista (misma entrada, misma salida: sin Date.now ni azar, el «ahora» viene en la consulta) y el
//            puntaje de una candidata NO depende de las otras candidatas: todo lo que cambia su puntaje (nombres de marca y categoría
//            incluidos) viaja en la consulta, nunca se deduce de la lista. `buscarEnHoja` filtra la lista por texto (un CÓDIGO no filtra:
//            solo ordena) sin tocar los avisos, que siempre se calculan sobre todas.
//   ASUME:   que `claveReferencia` (alta-producto.ts) es espejo de retail.fn_clave_referencia y que `dentroDeUnaEdicion` (aquí)
//            es espejo de retail.fn_dentro_de_una_edicion: por eso `identico` y `casi_igual` dicen lo mismo que la base.
//            Que el léxico (parecidas-lexico.ts) y los pesos son una primera foto SIN calibrar con altas reales: el corte
//            `UMBRAL_PARECIDA_PROVISIONAL` solo decide el color de la alerta, nunca frena.
//            Que una marca que nombra sus prendas por código («Polo G44», «Polo G45»…) verá a todas sus hermanas avisar siempre: un
//            código distinto no baja del corte (decisión de Felipe, 2026-09-30). Se revisa con altas reales, no antes.
//   NO HACE: no toca precio ni costo (ni los recibe); no decide si dos prendas son la misma; no fusiona; no filtra por tiempo
//            (la fecha solo desempata y rotula); no usa el material como veto; no lee la red ni el reloj. Un código de la marca
//            DISTINTO no prueba otro diseño (una reedición cambia de código): solo baja el ORDEN un poco y se muestra sin veredicto.
//
// La técnica es la «A» de la investigación (docs/investigacion/2026-09-29-duplicados-de-producto.md, secciones 4.2 y 5.2):
// conjuntos de tokens con léxico, similitud por coseno con peso por rareza, conflictos por campo y marca/categoría como peso blando.
// Lo que cambia frente al banco de pruebas está en el bloque «DIFERENCIAS CON EL BANCO» más abajo, cada una con su medida.

import { claveReferencia } from "./alta-producto";
import type { CoincidenciaBusqueda, ResultadoBusquedaHoja } from "./parecidas-alta-vista";
import {
  LEXICO_PARECIDAS,
  type CondicionAlias,
  type ConfianzaLexico,
  type DominioSinonimo,
  type LexicoParecidas,
} from "./parecidas-lexico";
import {
  UMBRAL_PARECIDA_PROVISIONAL,
  type AmbitoParecidas,
  type CandidataAlta,
  type ConsultaAlta,
  type MotivoParecida,
  type NivelParecida,
  type ParecidaAlta,
  type ResultadoParecidas,
} from "./parecidas-alta-tipos";

// =====================================================================================================================
// DIFERENCIAS CON EL BANCO (bench/a_final.mjs → A_final_con_prior). Con el peso y los parámetros del banco inyectados (`crearMotor`
// con su IDF, su vocabulario y sus penalizaciones), este módulo daba el MISMO puntaje que el scorer del banco en los 117.370 pares
// del corpus (0 diferencias) hasta el paso 7. Los pasos 8 a 10 se apartan del banco a propósito: con el banco inyectado difieren 8.886
// pares (110 por más de 0,01 y 22 por más de 0,05; la mayoría porque el IDF del corpus cambia cuando una silueta deja de partirse).
// Cada diferencia de abajo se midió sola, sumándola a la anterior, con el arnés del banco
// (validación: 150 grupos, PR-AUC de pares «principal», IC95 por bootstrap de grupos). Entre corchetes, el PR-AUC de ese paso:
//   0. Banco exacto ................................................................................ 0,927 [0,850–0,974]
//   1. Sin vocabulario observado ni frecuencia del corpus: el singularizador usa solo el léxico y el corrector de tipeos solo
//      toca palabras a una edición de un sustantivo del léxico que no sean palabras conocidas ............ 0,928 [0,858–0,974]
//   2. Peso ESTÁTICO en vez del IDF del corpus: el navegador no tiene corpus, y así el puntaje de una candidata no cambia cuando
//      aparece otra. Sale de la clase de la palabra (tipo 1, atributo/silueta 2,5, material 2,5, nombre propio 5) . 0,926 [0,842–0,975]
//   3. Un código de la marca distinto ya NO multiplica ×0,4 el puntaje (decisión de Felipe, 2026-09-30: una reedición cambia de
//      código): solo ×0,85 en el ORDEN. Medido sobre el puntaje 0,917; sobre el orden ..................... 0,923 [0,838–0,971]
//   4. El patrón ya no veta (×0,4 en el banco) y tejido + patrón pesan ≤ 0,15 en total (D10: pista débil) ......... 0,917 [0,839–0,964]
//   5. Un código se compara junto con su temporada (SS24 311 ≠ SS25 311); el banco solo miraba el número ........... 0,917 [0,839–0,964]
//   6. Sensibilidad, para que el conjunto dorado (12 avisos y 4 negativos) pase entero: atributo/silueta pesa 3, el conflicto
//      de silueta ×0,7 y que SOLO UN lado diga «Petit»/«Plus» ×0,6 (dos valores distintos siguen en ×0,4). Cuesta ~3 puntos de F1
//      en el corte 0,48 y nada de PR-AUC. Sobre el puntaje 0,914 [0,830–0,961]; sobre el orden ............. 0,919 [0,838–0,963]
//   7. Un dígito suelto en el nombre es versión («Polo Lara 2»); dos son una talla («Nika 38»): ya no separan el diseño. Y el código
//      «G 44» con espacio se lee como «G44». Ninguna de las dos cambia UN solo puntaje de los 117.370 pares del corpus.
//   8. Marca y categoría llegan como ids (`marcaId`, `categoriaId`) Y como NOMBRES dentro de la consulta (`marca`, `categoria`): ya no se
//      deducen de las candidatas. Antes, sin los nombres, 98 de 1.200 comparaciones (8 %) cambiaban de puntaje según qué otras candidatas
//      llegaran («Pantalones» contra una marca que solo tiene «Jeans» perdía la categoría vecina: 0,699 contra 0,899); ahora, 0 de 1.200.
//      Sobre el corpus (117.370 pares) el puntaje cambia en 7.495 pares: los más grandes son categorías vecinas que ahora se reconocen
//      («Body Carmela» ~ «Top Carmela», 0,64 → 0,82). PR-AUC de producción sin cambio: 0,914 [0,830–0,961] y 0,919 [0,838–0,963].
//   9. Una silueta compuesta, dicha en el NOMBRE con sus palabras separadas o en otro orden, vale igual que seguida: «Comfo Wide Leg Corto»,
//      «Wide Leg Comfo Corto» o «Pierna Ancha Corto Comfo» son «Wide Leg Corto Comfo» (antes 0,09: contexto). Solo la compuesta que define el
//      léxico, y solo en el nombre: permutar cualquier frase sería peligroso («Top Larga Manga Corta» se leería «manga larga» + «corta»), y en
//      la descripción («Palazo corto») «corto» puede hablar de otra cosa. «Wide Leg» y «Wide Leg Corto Comfo» siguen sin avisarse (0,14:
//      contexto), que es lo que decidió Felipe. Costo medido en el corpus: 4 pares pasan de contexto a parecida, todos con el mismo nombre
//      propio y un largo de diferencia («Palazo Billie» ~ «Palazo Billie Corto»), que es el aviso que ya daba la forma seguida («Wide Leg
//      Corto Cleo» ~ «Wide Leg Cleo», 0,515) y lo que piden los casos 7 y 8 del conjunto dorado; un aviso de más es el error barato. El flujo real
//      no cambia (recall@1 0,995 y @3 1,000 con marca) salvo 2 avisos de más en 280 primeras altas (61 → 63); PR-AUC 0,913 [0,830–0,960]
//      sobre el puntaje y 0,919 [0,838–0,963] sobre el orden.
//  10. Un código se lee con su prefijo entero («Modelo 311» era «ELO311»: la alternancia probaba «mod» antes que «modelo») y con su letra final
//      pegada («SS25311A» = «SS25 311A»); ninguno de los dos aparece en el corpus. Y `tramoDeCodigo` dice dónde está el código en el texto
//      TAL COMO SE ESCRIBIÓ, que casi nunca es la forma normalizada que devuelve `codigoDeMarca`.
// El corte 0,48 (`UMBRAL_PARECIDA_PROVISIONAL`) lo fija el contrato y es el del banco. Con estos pesos el mejor corte sería ~0,60-0,64
// (F1 0,91 en entrenamiento y 0,84 en validación, contra 0,89 y 0,81 en 0,48): en 0,48 la alerta es más sensible (recall 1,00 y 0,92,
// precisión 0,80 y 0,73). Se deja así a propósito: avisar de más es el error barato y el alta NUNCA frena por debajo de `casi_igual`.
// =====================================================================================================================

// ---------------------------------------------------------------------------------------------------------------------
// Configuración del puntaje (todo lo que se puede ajustar sin tocar la forma del algoritmo)
// ---------------------------------------------------------------------------------------------------------------------

export type ConfigPuntaje = {
  /** Peso del texto de cada campo frente al nombre (= 1). Tejido + patrón ≤ 0,15 en total (D10: pista débil). */
  pesoTexto: { descripcion: number; tejido: number; patron: number };
  /** Multiplicadores por conflicto entre campos (1 = no aplica). */
  penal: {
    pack: number;
    version: number;
    /** Igual que `pack` y `version`, pero cuando SOLO UN lado dice algo (uno escribió «Petit», el otro no): pesa menos que dos valores distintos. */
    packUnilateral: number;
    versionUnilateral: number;
    atributo: number;
    silueta: number;
    extra: number;
    patron: number;
    codigo: number;
  };
  /** Cuánto sube el texto cuando el código de la marca es el mismo (0 = nada). */
  bonoCodigo: number;
  /** Peso de una palabra a una edición de tipeo de otra (1 = igual; las transposiciones cuentan completas). */
  rho: number;
  /** Marca y categoría como PESO blando, nunca bloqueo. */
  prior: { marca: number; categoria: number; categoriaVecina: number };
  /** Multiplicador del ORDEN (no del puntaje) cuando los códigos de la marca son distintos. */
  ordenCodigoDistinto: number;
  /** Comparar el código junto con su temporada (SS24 311 ≠ SS25 311). */
  temporadaEnCodigo: boolean;
};

export const CONFIG_POR_DEFECTO: ConfigPuntaje = {
  pesoTexto: { descripcion: 0.4, tejido: 0.08, patron: 0.07 },
  penal: { pack: 0.4, version: 0.4, packUnilateral: 0.4, versionUnilateral: 0.6, atributo: 0.4, silueta: 0.7, extra: 0.2, patron: 1, codigo: 1 },
  bonoCodigo: 0.5,
  rho: 0.5,
  prior: { marca: 0.4, categoria: 0.7, categoriaVecina: 0.9 },
  ordenCodigoDistinto: 0.85,
  temporadaEnCodigo: true,
};

/** Dos puntajes dentro de la misma banda de este ancho cuentan como «igual fuerza» y se desempatan por fecha, stock y nombre. */
const ANCHO_BANDA_ORDEN = 0.05;

// ---------------------------------------------------------------------------------------------------------------------
// Texto base
// ---------------------------------------------------------------------------------------------------------------------

const sinTildes = (s: string | null | undefined): string => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const soloPalabras = (s: string): string[] => s.replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);

const INVARIABLES = new Set(LEXICO_PARECIDAS.plurales.invariables);
const IRREGULARES = LEXICO_PARECIDAS.plurales.irregulares;
const ES_CATEGORIA_DE_ACCESORIOS = /aretes|collares|pulseras|anillos|relojes|maquillaje|bolsos|mochilas|lentes|cinturones|gorros|panuelos|papeleria|lapicero/;
const FONETICOS: readonly (readonly [string, string])[] = [["b", "v"], ["s", "z"], ["s", "c"], ["c", "k"], ["g", "j"], ["i", "y"]];
const RANGO_CONFIANZA: Record<ConfianzaLexico, number> = { alta: 2, media: 1 };

/** Regla de singular genérica para lo que el léxico no conoce: «pantalones» → «pantalon», «blusas» → «blusa», «jeans» → «jean». */
function singularGenerico(t: string): string {
  if (t.length <= 3 || /^\d/.test(t)) return t;
  if (/(ss|us|is)$/.test(t)) return t;
  if (t.length > 4 && /[lnrzd]es$/.test(t)) return t.slice(0, -2);
  if (t.endsWith("s")) return t.slice(0, -1);
  return t;
}

/**
 * ¿Están a distancia EXACTAMENTE uno (Damerau-Levenshtein de cadena óptima): una letra cambiada, de más, de menos, o dos letras
 * contiguas cambiadas de lugar? Igual a `damerau(a, b) === 1` pero sin armar la matriz: se llama miles de veces por consulta.
 */
export function distanciaUno(a: string, b: string): boolean {
  const la = a.length;
  const lb = b.length;
  if (a === b || Math.abs(la - lb) > 1) return false;
  let i = 0;
  while (i < la && i < lb && a.charAt(i) === b.charAt(i)) i++;
  if (la === lb) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true; // una letra cambiada
    return a.charAt(i) === b.charAt(i + 1) && a.charAt(i + 1) === b.charAt(i) && a.slice(i + 2) === b.slice(i + 2); // dos contiguas intercambiadas
  }
  const [corta, larga] = la < lb ? [a, b] : [b, a];
  return larga.slice(i + 1) === corta.slice(i); // una letra de más o de menos
}

/**
 * Espejo de `retail.fn_dentro_de_una_edicion(a, b)`: verdadero si dos CLAVES difieren en 0 o 1 edición (una letra de más, de
 * menos o cambiada). Idénticas también dan verdadero: quien llama distingue con igualdad. Una transposición («ab» → «ba») son
 * DOS ediciones. Recorre igual que la función de Postgres, letra a letra, sin alinear de más.
 */
export function dentroDeUnaEdicion(a: string, b: string): boolean {
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 1;
  let j = 1;
  let dif = 0;
  while (i <= la && j <= lb) {
    if (a.charAt(i - 1) === b.charAt(j - 1)) {
      i++;
      j++;
    } else {
      dif++;
      if (dif > 1) return false;
      if (la === lb) {
        i++;
        j++;
      } else if (la > lb) {
        i++;
      } else {
        j++;
      }
    }
  }
  return dif + (la - i + 1) + (lb - j + 1) <= 1;
}

// ---------------------------------------------------------------------------------------------------------------------
// Tablas derivadas del léxico (frases → canónico), armadas una vez por motor
// ---------------------------------------------------------------------------------------------------------------------

type DominioFrase = DominioSinonimo | "silueta" | "atributo";
type EntradaFrase = {
  canon: string;
  dominio: DominioFrase;
  conf: ConfianzaLexico;
  condicion: CondicionAlias | null;
  alias?: string;
  categoria?: string;
  prendas?: readonly string[];
  grupo?: string;
};
type Tablas = {
  frases: Map<string, EntradaFrase[]>;
  maxLen: number;
  /** Palabras sueltas que el léxico sabe que son una prenda, accesorio, calzado o tejido (para singularizar y corregir tipeos). */
  sustantivos: Set<string>;
  prendasPalabra: Set<string>;
  compuestos: Map<string, readonly string[]>;
  ruido: Set<string>;
  ambiguos: Set<string>;
  /** Canónicos que son un tipo de prenda («camisa», «polo»): pesan poco y no cuentan como «el modelo». */
  tiposCanon: Set<string>;
  /** Canónicos de atributo o silueta («manga_larga», «wide_leg»): pesan algo más que un tipo y menos que un nombre propio. */
  atributosCanon: Set<string>;
  /** Canónicos de material («algodon», «denim»). */
  materialesCanon: Set<string>;
  conocidas: Set<string>;
  abreviaturas: { re: RegExp; larga: string }[];
  patronesPrecio: RegExp[];
  patronesOrden: { nombre: string; campo: "codigo" | "temporada" | "pack" | "descartar"; re: RegExp }[];
  diferenciadores: Set<string>;
  vecinas: readonly (readonly string[])[];
  /** Siluetas que el léxico arma con OTRA silueta + un atributo («wide leg corto» = «wide leg» + «corto»): se reconocen aunque no vengan juntas ni en ese orden. */
  compuestas: readonly SiluetaCompuesta[];
};

/** «wide_leg_corto» = `parte` («wide_leg», en el grupo de siluetas `grupoSil`) + `resto` («corto», en el grupo de atributos `grupoAttr`). */
type SiluetaCompuesta = { canon: string; parte: string; grupoSil: string; resto: string; grupoAttr: string };

function construirTablas(lex: LexicoParecidas, extraConoce: ReadonlySet<string> | null): { T: Tablas; singularizar: (t: string) => string } {
  const solasDelLexico = new Set<string>();
  const meterSolas = (w: string) => {
    if (!/\s/.test(w)) solasDelLexico.add(sinTildes(w).replace(/[^a-z0-9]/g, ""));
  };
  for (const s of lex.sinonimos) for (const w of [s.canon, ...s.alias, ...(s.condicionados ?? []).map((c) => c.alias)]) meterSolas(w);
  for (const s of lex.siluetas) for (const w of [s.canon, ...s.alias]) meterSolas(w);
  for (const w of lex.conocidas) solasDelLexico.add(w);

  let sustantivos = new Set<string>();
  const singularizar = (t: string): string => {
    if (INVARIABLES.has(t)) return t;
    const irr = IRREGULARES[t];
    if (irr) return irr;
    if (t.length <= 3 || !t.endsWith("s") || /(ss|us|is)$/.test(t) || /^\d/.test(t)) return t;
    const c1 = t.slice(0, -1);
    const c2 = t.endsWith("es") ? t.slice(0, -2) : null;
    const conoce = (w: string) => (extraConoce?.has(w) ?? false) || sustantivos.has(w) || solasDelLexico.has(w);
    if (conoce(c1)) return c1;
    if (c2 && conoce(c2)) return c2;
    return singularGenerico(t);
  };

  const norm = (s: string) => soloPalabras(sinTildes(s)).map(singularizar);
  const frases = new Map<string, EntradaFrase[]>();
  let maxLen = 1;
  const add = (alias: string, canon: string, meta: Omit<EntradaFrase, "canon">) => {
    const toks = norm(alias);
    if (toks.length === 0 || (toks.length === 1 && toks[0].length < 2)) return;
    const key = toks.join(" ");
    const c = norm(canon).join("_");
    const lista = frases.get(key) ?? [];
    if (lista.some((e) => e.canon === c)) return;
    lista.push({ canon: c, ...meta });
    lista.sort((x, y) => RANGO_CONFIANZA[y.conf] - RANGO_CONFIANZA[x.conf]);
    frases.set(key, lista);
    maxLen = Math.max(maxLen, toks.length);
  };
  for (const s of lex.sinonimos) {
    add(s.canon, s.canon, { dominio: s.dominio, conf: "alta", condicion: null });
    for (const a of s.alias) add(a, s.canon, { dominio: s.dominio, conf: s.confianza, condicion: null, alias: a, categoria: s.categoria ?? "" });
    for (const c of s.condicionados ?? []) add(c.alias, s.canon, { dominio: s.dominio, conf: s.confianza, condicion: c.condicion, alias: c.alias, categoria: s.categoria ?? "" });
  }
  for (const s of lex.siluetas) {
    add(s.canon, s.canon, { dominio: "silueta", conf: "alta", condicion: null, grupo: s.grupo });
    for (const a of s.alias) add(a, s.canon, { dominio: "silueta", conf: s.confianza, condicion: null, prendas: s.prendas, grupo: s.grupo });
  }
  for (const [grupo, lista] of Object.entries(lex.atributos)) {
    for (const a of lista) {
      add(a.canon, a.canon, { dominio: "atributo", conf: "alta", condicion: null, grupo });
      for (const al of a.alias) add(al, a.canon, { dominio: "atributo", conf: a.confianza, condicion: null, grupo });
    }
  }

  sustantivos = new Set<string>();
  const prendasPalabra = new Set<string>();
  const tiposCanon = new Set<string>();
  const atributosCanon = new Set<string>();
  const materialesCanon = new Set<string>();
  for (const [key, lista] of frases) {
    if (!key.includes(" ") && lista.some((e) => ["prenda", "accesorio", "calzado", "tejido"].includes(e.dominio))) sustantivos.add(key);
    if (!key.includes(" ") && lista.some((e) => ["prenda", "accesorio", "calzado"].includes(e.dominio))) prendasPalabra.add(key);
    for (const e of lista) {
      if (["prenda", "accesorio", "calzado"].includes(e.dominio)) tiposCanon.add(e.canon);
      else if (e.dominio === "silueta" || e.dominio === "atributo") atributosCanon.add(e.canon);
      else materialesCanon.add(e.canon);
    }
  }

  const conocidas = new Set<string>();
  const meterConocida = (w: string) => {
    const palabras = /\s/.test(w) ? sinTildes(w).split(/[^a-z0-9]+/).filter(Boolean) : [sinTildes(w).replace(/[^a-z0-9]/g, "")];
    for (const n of palabras) if (n) { conocidas.add(n); conocidas.add(singularGenerico(n)); }
  };
  for (const s of lex.sinonimos) for (const w of [s.canon, ...s.alias, ...(s.condicionados ?? []).map((c) => c.alias)]) meterConocida(w);
  for (const s of lex.siluetas) for (const w of [s.canon, ...s.alias]) meterConocida(w);
  for (const lista of Object.values(lex.atributos)) for (const a of lista) for (const w of [a.canon, ...a.alias]) meterConocida(w);
  for (const w of lex.ruido) meterConocida(w);
  for (const w of lex.conocidas) meterConocida(w);

  // Siluetas compuestas, derivadas del léxico (no escritas a mano): una silueta cuyo canónico empieza con el de OTRA silueta y termina en un
  // atributo («wide leg corto» = «wide leg» + «corto»). Con ellas, «Corto Wide Leg», «Wide Leg Comfo Corto» o «Pierna Ancha Corto» valen igual
  // que «Wide Leg Corto»: el orden en que alguien escribe las palabras no cambia de qué prenda habla. Solo estas: permutar cualquier frase del
  // léxico es peligroso («Top Larga Manga Corta» se leería «manga larga» + «corta» y cambiaría de prenda).
  const compuestas = new Map<string, SiluetaCompuesta>();
  const atributosPorCanon = new Map<string, string>();
  for (const [grupo, lista] of Object.entries(lex.atributos)) for (const a of lista) atributosPorCanon.set(norm(a.canon).join("_"), grupo);
  for (const s of lex.siluetas) {
    const toks = norm(s.canon);
    if (toks.length < 2) continue;
    for (const p of lex.siluetas) {
      const parte = norm(p.canon);
      if (p.grupo !== s.grupo || parte.length >= toks.length || !parte.every((t, i) => toks[i] === t)) continue;
      const resto = toks.slice(parte.length).join("_");
      const grupoAttr = atributosPorCanon.get(resto);
      if (grupoAttr !== undefined) compuestas.set(toks.join("_"), { canon: toks.join("_"), parte: parte.join("_"), grupoSil: s.grupo, resto, grupoAttr });
    }
  }

  const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  const abreviaturas = lex.abreviaturas.map(([corta, larga]) => ({ re: new RegExp(`(?<![a-z0-9])${escapar(corta)}(?![a-z0-9])`, "g"), larga: ` ${larga} ` }));
  const T: Tablas = {
    frases,
    maxLen,
    sustantivos,
    prendasPalabra,
    compuestos: new Map(lex.compuestos.map((c) => [c[0], c.slice(1)] as const)),
    ruido: new Set(lex.ruido),
    ambiguos: new Set(lex.ambiguos),
    tiposCanon,
    atributosCanon,
    materialesCanon,
    conocidas,
    abreviaturas,
    patronesPrecio: lex.patrones.precios.map((p) => new RegExp(p.regex, "g")),
    patronesOrden: lex.patrones.orden.map((p) => ({ nombre: p.nombre, campo: p.campo, re: new RegExp(p.regex, "g") })),
    diferenciadores: new Set(lex.diferenciadores),
    vecinas: lex.categoriasVecinas.map((g) => g.map((c) => sinTildes(c))),
    compuestas: [...compuestas.values()],
  };
  return { T, singularizar };
}

// ---------------------------------------------------------------------------------------------------------------------
// Códigos de la marca («SS25 311», «79-SS24», «G44»)
// ---------------------------------------------------------------------------------------------------------------------

/** Un código de la marca leído del texto. `num` es la parte que lo identifica («311», «79», «g44»); `temp` su temporada si la trae. */
export type CodigoLeido = { num: string; temp: string | null; forma: "temp_num" | "num_temp" | "suelto" };

/** Cómo se muestra: «SS25 311», «79-SS24», «G44». */
function textoDeCodigo(c: CodigoLeido): string {
  if (c.forma === "temp_num" && c.temp) return `${c.temp.toUpperCase()} ${c.num.toUpperCase()}`;
  if (c.forma === "num_temp" && c.temp) return `${c.num.toUpperCase()}-${c.temp.toUpperCase()}`;
  return c.num.toUpperCase();
}

function mismoCodigo(a: CodigoLeido, b: CodigoLeido, conTemporada: boolean): boolean {
  if (a.num !== b.num) return false;
  if (!conTemporada) return true;
  return a.temp === null || b.temp === null || a.temp === b.temp;
}

/** «Ref», «Modelo», «Cód.»…: la palabra que algunos escriben antes del código. Alternancia de la más larga a la más corta (JS toma la primera que calza). */
const PALABRAS_DE_PREFIJO = "codigo|modelo|item|ref|art|mod|cod|sku";
const PREFIJO_DE_CODIGO = new RegExp(`^(?:${PALABRAS_DE_PREFIJO})`);

type Extraido = { codigos: CodigoLeido[]; pack: Set<string> };

/** Saca de un texto (ya en minúsculas y sin tildes) precios, tallas, medidas, packs y códigos; devuelve lo que queda. */
function extraerCodigos(texto: string, T: Tablas, salida: Extraido): string {
  let s = texto;
  for (const re of T.patronesPrecio) s = s.replace(re, " ");
  for (const { nombre, campo, re } of T.patronesOrden) {
    s = s.replace(re, (m: string) => {
      const limpio = m.trim();
      if (campo === "codigo") {
        const compacto = limpio.replace(/[^a-z0-9]/g, "");
        let mm: RegExpExecArray | null;
        if ((mm = /^(ss|fw|aw|pf)(?:20)?(\d{2})(\d{2,4}[a-z]?)$/.exec(compacto))) salida.codigos.push({ num: mm[3], temp: mm[1] + mm[2], forma: "temp_num" });
        else if ((mm = /^(\d{1,4})(ss|fw|aw)(?:20)?(\d{2})$/.exec(compacto))) salida.codigos.push({ num: mm[1], temp: mm[2] + mm[3], forma: "num_temp" });
        // El prefijo MÁS LARGO primero: con «mod» antes que «modelo», «Modelo 311» se leía «ELO311» y «Código 311», «IGO311».
        else if (nombre === "prefijo_de_codigo") salida.codigos.push({ num: compacto.replace(PREFIJO_DE_CODIGO, ""), temp: null, forma: "suelto" });
        else salida.codigos.push({ num: compacto, temp: null, forma: "suelto" });
      } else if (campo === "pack") {
        const c = limpio.replace(/[^a-z0-9]/g, "");
        if (!/(?:pzs?|pzas?|pcs?|piezas?)$/.test(c)) salida.pack.add(c.replace(/^(\d+)(?:unds?|unid(?:ades)?|uds?|docenas?|pares?)$/, "x$1"));
      }
      return " ";
    });
  }
  return s;
}

// ---------------------------------------------------------------------------------------------------------------------
// Análisis de un registro (nombre, descripción, tejido, patrón) a tokens canónicos + campos aparte
// ---------------------------------------------------------------------------------------------------------------------

/** Lo que se compara de una prenda, venga de la consulta o de una candidata. */
export type RegistroComparable = {
  nombre: string;
  descripcion: string | null;
  tejido: string | null;
  patron: string | null;
  marca: string | null;
  categoria: string | null;
};

type ContextoCampo = { catN: string; prendas: Set<string>; campo: "nombre" | "descripcion" | "tejido" | "patron"; marcaToks: string[] | null };
type SalidaTexto = {
  tokens: string[];
  fuente: Map<string, string>;
  codigos: CodigoLeido[];
  pack: Set<string>;
  version: Set<string>;
  attr: Map<string, Set<string>>;
  sil: Map<string, Set<string>>;
};

export type Analisis = {
  marca: string | null;
  categoria: string | null;
  catN: string;
  nom: string[];
  des: string[];
  tej: string[];
  pat: string[];
  codigos: CodigoLeido[];
  pack: Set<string>;
  version: Set<string>;
  attr: Map<string, Set<string>>;
  sil: Map<string, Set<string>>;
  attrNom: Map<string, Set<string>>;
  /** Canónico → las palabras como las escribió la persona («wide_leg» → «palazo»). Sirve para la frase «Mismo modelo: …». */
  fuente: Map<string, string>;
  vec?: Map<string, number>;
};

/** El motor: léxico ya armado + pesos + caché de análisis. El de producción es uno solo (`ordenarParecidas`); el banco y las pruebas arman otros. */
export type Motor = {
  T: Tablas;
  singularizar: (t: string) => string;
  cfg: ConfigPuntaje;
  /** Peso de un token; las claves de material llevan prefijo «t:» (tejido) o «p:» (patrón). */
  peso: (clave: string) => number;
  /** Cuántas veces aparece una palabra en el catálogo de referencia. Solo el banco de pruebas lo inyecta (ver DIFERENCIAS 1). */
  dfDe: ((t: string) => number) | null;
  cache: Map<string, Analisis>;
};

function unaEdicionOrtografica(t: string, v: string): boolean {
  if (t === v) return false;
  if (t.length === v.length) {
    let i = 0;
    while (i < t.length && t[i] === v[i]) i++;
    if (i < t.length - 1 && t[i] === v[i + 1] && t[i + 1] === v[i] && t.slice(i + 2) === v.slice(i + 2)) return true; // transposición
    if (t.slice(i + 1) !== v.slice(i + 1)) return false;
    return FONETICOS.some(([x, y]) => (t[i] === x && v[i] === y) || (t[i] === y && v[i] === x));
  }
  if (Math.abs(t.length - v.length) !== 1) return false;
  const [corto, largo] = t.length < v.length ? [t, v] : [v, t];
  if (corto.length < 4) return false;
  for (let i = 0; i < largo.length; i++) if (largo.slice(0, i) + largo.slice(i + 1) === corto) return true;
  return false;
}

/** Corrige una palabra rara hacia un sustantivo del léxico si está a UNA edición de tipeo; nunca toca palabras conocidas. */
function corregir(t: string, M: Motor): string {
  const T = M.T;
  if (t.length < 4 || T.conocidas.has(t) || T.sustantivos.has(t) || /\d/.test(t)) return t;
  if (M.dfDe && M.dfDe(t) >= 3) return t;
  let mejor: string | null = null;
  for (const v of T.sustantivos) {
    if (v.length < 4 || Math.abs(v.length - t.length) > 1) continue;
    if (!unaEdicionOrtografica(t, v)) continue;
    const dif = [...v].findIndex((ch, k) => ch !== t[k]);
    const transp = v.length === t.length && distanciaUno(t, v) && [...v].filter((ch, k) => ch !== t[k]).length === 2 && t[dif] === v[dif + 1];
    if (!transp && (t.length < 5 || v.length < 5)) continue;
    if (mejor !== null && mejor !== v) return t; // ambiguo: no se toca
    mejor = v;
  }
  return mejor ?? t;
}

function aplica(e: EntradaFrase, ctx: ContextoCampo, key: string, T: Tablas): boolean {
  // Un alias que el léxico marca como ambiguo solo vale dentro de la categoría CAYLA que le corresponde («malla» no es legging en un reloj).
  if (e.alias !== undefined && e.dominio !== "silueta" && T.ambiguos.has(key) && key !== "canguro" && key !== "set") {
    if (!e.categoria || ctx.catN !== e.categoria) return false;
  }
  if (e.condicion) {
    if (e.condicion === "categoria_rinoneras") return ctx.catN === "rinoneras";
    if (e.condicion === "no_accesorio") return !ES_CATEGORIA_DE_ACCESORIOS.test(ctx.catN);
    return false;
  }
  if (e.prendas) {
    const ok = e.prendas.some((p) => ctx.prendas.has(p));
    if (!ok && !(ctx.prendas.size === 0 && !ctx.catN)) return false; // sin categoría ni prenda conocida no hay contra qué contradecir
  }
  return true;
}

type Pieza = { t: string; o: string };

function analizarTexto(texto: string | null | undefined, ctx: ContextoCampo, M: Motor): SalidaTexto {
  const T = M.T;
  const out: SalidaTexto = { tokens: [], fuente: new Map(), codigos: [], pack: new Set(), version: new Set(), attr: new Map(), sil: new Map() };
  if (!texto) return out;
  const extra: Extraido = { codigos: out.codigos, pack: out.pack };
  let s = extraerCodigos(sinTildes(texto), T, extra);
  s = s.replace(/(?<![a-z0-9])c\/\s?(?=[a-z])/g, "con ");
  for (const { re, larga } of T.abreviaturas) s = s.replace(re, larga);
  // abreviatura con punto: «chomp.» → prefijo de una prenda del léxico
  s = s.replace(/(?<![a-z0-9])([a-z]{3,})\.(?![a-z0-9])/g, (_m: string, w: string) => {
    if (T.prendasPalabra.has(w)) return ` ${w} `;
    for (const p of T.prendasPalabra) if (p.length > w.length && p.startsWith(w)) return ` ${p} `;
    return ` ${w} `;
  });
  let piezas: Pieza[] = soloPalabras(s).map((t) => ({ t, o: t }));
  piezas = piezas.flatMap((p) => (T.compuestos.get(p.t) ?? [p.t]).map((t) => ({ t, o: p.o })));
  piezas = piezas.map((p) => ({ t: M.singularizar(p.t), o: p.o }));
  if (ctx.marcaToks && ctx.marcaToks.length > 0) {
    const m = ctx.marcaToks;
    for (let i = 0; i + m.length <= piezas.length; i++) {
      if (m.every((x, j) => piezas[i + j].t === x) && piezas.length > m.length) {
        piezas.splice(i, m.length);
        break;
      }
    }
  }
  piezas = piezas.map((p) => ({ t: corregir(p.t, M), o: p.o }));
  // frases (sinónimos, siluetas, atributos): coincidencia más larga primero
  const res: Pieza[] = [];
  for (let i = 0; i < piezas.length; ) {
    let hecho = false;
    for (let L = Math.min(T.maxLen, piezas.length - i); L >= 1 && !hecho; L--) {
      const key = piezas.slice(i, i + L).map((p) => p.t).join(" ");
      const lista = T.frases.get(key);
      if (!lista) continue;
      const e = lista.find((x) => aplica(x, ctx, key, T));
      if (!e) continue;
      res.push({ t: e.canon, o: piezas.slice(i, i + L).map((p) => p.o).join(" ") });
      if (e.grupo && e.dominio === "atributo") (out.attr.get(e.grupo) ?? out.attr.set(e.grupo, new Set()).get(e.grupo)!).add(e.canon);
      if (e.dominio === "silueta" && e.grupo) (out.sil.get(e.grupo) ?? out.sil.set(e.grupo, new Set()).get(e.grupo)!).add(e.canon);
      i += L;
      hecho = true;
    }
    if (!hecho) res.push(piezas[i++]);
  }
  piezas = res;
  // Una silueta compuesta con sus palabras sueltas o en otro orden («Wide Leg Comfo Corto») se junta como si vinieran seguidas («Wide Leg Corto»).
  // Solo en el NOMBRE: en la descripción («Palazo corto») «corto» puede hablar de otra cosa y la descripción pesa poco. Solo se juntan la silueta
  // y el atributo que el léxico pide, y las siluetas solo aplican en pantalones y jeans: «Top Corto» no se toca.
  if (ctx.campo === "nombre") {
    for (const k of T.compuestas) {
      const i = piezas.findIndex((p) => p.t === k.parte);
      const j = piezas.findIndex((p) => p.t === k.resto);
      if (i < 0 || j < 0 || piezas.some((p) => p.t === k.canon)) continue;
      const [a, b] = i < j ? [i, j] : [j, i];
      piezas = [...piezas.slice(0, a), { t: k.canon, o: `${piezas[a].o} ${piezas[b].o}` }, ...piezas.slice(a + 1, b), ...piezas.slice(b + 1)];
      const silueta = out.sil.get(k.grupoSil) ?? out.sil.set(k.grupoSil, new Set()).get(k.grupoSil)!;
      if (!piezas.some((p) => p.t === k.parte)) silueta.delete(k.parte);
      silueta.add(k.canon);
      // «corto» ya no es un largo suelto: es parte de la silueta (igual que cuando vienen seguidas)
      if (!piezas.some((p) => p.t === k.resto)) {
        const atributos = out.attr.get(k.grupoAttr);
        atributos?.delete(k.resto);
        if (atributos && atributos.size === 0) out.attr.delete(k.grupoAttr);
      }
    }
  }
  const sinRuido = piezas.filter((p) => !T.ruido.has(p.t));
  piezas = sinRuido.length > 0 ? sinRuido : piezas;
  // restos que son un código (letras + dígitos pegados), una versión (2, ii) o una letra suelta
  const resto: Pieza[] = [];
  for (const p of piezas) {
    const t = p.t;
    if (/^[a-z]{1,3}\d{1,6}[a-z]?$/.test(t)) {
      const m = /^(ss|fw|aw|pf)(\d{2})(\d{2,4}[a-z]?)$/.exec(t); // la letra final («SS25311A») se lee igual que con espacio («SS25 311A»)
      if (m) out.codigos.push({ num: m[3], temp: m[1] + m[2], forma: "temp_num" });
      else out.codigos.push({ num: t, temp: null, forma: "suelto" });
    } else if (T.diferenciadores.has(t)) out.version.add(t);
    else if (/^\d$/.test(t)) {
      // Un dígito suelto en el nombre es una versión («Polo Lara 2»). Dos dígitos son casi siempre una talla («Nika 38»): no separan el diseño.
      if (ctx.campo === "nombre") out.version.add(t);
    } else if (t.length === 1 && /[a-z]/.test(t)) continue;
    else resto.push(p);
  }
  for (const p of resto) if (!out.fuente.has(p.t)) out.fuente.set(p.t, p.o);
  out.tokens = resto.map((p) => p.t);
  return out;
}

function mezclarGrupos(destino: Map<string, Set<string>>, origen: Map<string, Set<string>>): void {
  for (const [g, v] of origen) {
    const s = destino.get(g) ?? new Set<string>();
    for (const y of v) s.add(y);
    destino.set(g, s);
  }
}

function analizarRegistro(r: RegistroComparable, M: Motor): Analisis {
  const llave = `${r.nombre}\u0001${r.descripcion}\u0001${r.tejido}\u0001${r.patron}\u0001${r.categoria}\u0001${r.marca}`;
  const guardado = M.cache.get(llave);
  if (guardado) return guardado;
  const T = M.T;
  const cat = r.categoria ?? "";
  const catN = soloPalabras(sinTildes(cat)).join(" ");
  const prendasCat = new Set(soloPalabras(sinTildes(cat)).map(M.singularizar));
  const prendasNombre = soloPalabras(sinTildes(r.nombre)).map(M.singularizar).filter((t) => T.prendasPalabra.has(t));
  const prendas = new Set([...prendasCat, ...prendasNombre]);
  const marcaToks = r.marca ? soloPalabras(sinTildes(r.marca)).map(M.singularizar) : null;
  const base = { catN, prendas, marcaToks };
  const nom = analizarTexto(r.nombre, { ...base, campo: "nombre" }, M);
  const des = analizarTexto(r.descripcion, { ...base, campo: "descripcion" }, M);
  const tej = analizarTexto(r.tejido, { ...base, campo: "tejido" }, M);
  const pat = analizarTexto(r.patron, { ...base, campo: "patron" }, M);
  const attr = new Map<string, Set<string>>();
  const sil = new Map<string, Set<string>>();
  mezclarGrupos(attr, nom.attr);
  mezclarGrupos(attr, des.attr);
  mezclarGrupos(sil, nom.sil);
  mezclarGrupos(sil, des.sil);
  const attrNom = new Map<string, Set<string>>(nom.attr);
  for (const [g, v] of nom.sil) attrNom.set("sil:" + g, v);
  const codigos: CodigoLeido[] = [];
  for (const c of [...nom.codigos, ...des.codigos]) if (!codigos.some((x) => x.num === c.num && x.temp === c.temp)) codigos.push(c);
  const a: Analisis = {
    marca: r.marca,
    categoria: r.categoria,
    catN,
    nom: nom.tokens,
    des: des.tokens,
    tej: tej.tokens,
    pat: pat.tokens,
    codigos,
    pack: new Set([...nom.pack, ...des.pack]),
    version: new Set([...nom.version, ...des.version]),
    attr,
    sil,
    attrNom,
    fuente: nom.fuente,
  };
  if (M.cache.size > 4000) M.cache.clear();
  M.cache.set(llave, a);
  return a;
}

// ---------------------------------------------------------------------------------------------------------------------
// Peso por rareza, estático, derivado del léxico
// ---------------------------------------------------------------------------------------------------------------------

/** Pesos de la clase de palabra. Un tipo de prenda («camisa», «polo») está en media tienda y no identifica nada; el nombre propio
 *  del modelo («Lara», «Evaluna») sí. Sin corpus, la clase es lo único que hay: sale del léxico, no de una estadística. */
export const PESOS_POR_CLASE = { tipo: 1, atributo: 3, material: 2.5, propio: 5 } as const;

function crearPesoEstatico(T: Tablas, pesos: { tipo: number; atributo: number; material: number; propio: number }): (clave: string) => number {
  return (clave: string) => {
    const t = clave.startsWith("t:") || clave.startsWith("p:") ? clave.slice(2) : clave;
    if (T.tiposCanon.has(t)) return pesos.tipo;
    if (T.atributosCanon.has(t)) return pesos.atributo;
    if (T.materialesCanon.has(t)) return pesos.material;
    return pesos.propio;
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Similitud: coseno de conjuntos de tokens con peso, conflictos por campo y marca/categoría como peso blando
// ---------------------------------------------------------------------------------------------------------------------

function vectorDe(a: Analisis, M: Motor): Map<string, number> {
  if (a.vec) return a.vec;
  const v = new Map<string, number>();
  const suma = (t: string, w: number) => v.set(t, Math.max(v.get(t) ?? 0, w));
  const { descripcion, tejido, patron } = M.cfg.pesoTexto;
  for (const t of a.nom) suma(t, M.peso(t));
  for (const t of a.des) suma(t, descripcion * M.peso(t));
  for (const t of a.tej) suma("t:" + t, tejido * M.peso("t:" + t));
  for (const t of a.pat) suma("p:" + t, patron * M.peso("p:" + t));
  a.vec = v;
  return v;
}

const esTransposicion = (x: string, y: string): boolean => {
  if (x.length !== y.length || x.length < 4) return false;
  let i = 0;
  while (i < x.length && x[i] === y[i]) i++;
  return i < x.length - 1 && x[i] === y[i + 1] && x[i + 1] === y[i] && x.slice(i + 2) === y.slice(i + 2);
};

/** Las palabras de `vb` que son un tipeo de una palabra de `va` que `vb` no tiene se leen como la de `va` (transposición: peso completo; una edición: `rho`). */
function alinear(va: Map<string, number>, vb: Map<string, number>, rho: number): Map<string, number> {
  let salida: Map<string, number> | null = null;
  for (const [tb, wb] of vb) {
    if (va.has(tb)) continue;
    for (const ta of va.keys()) {
      if (vb.has(ta) || (salida && salida.has(ta))) continue;
      if (Math.abs(ta.length - tb.length) > 1) continue;
      let f = 0;
      if (esTransposicion(ta, tb)) f = 1;
      else if (rho > 0 && ta.length >= 5 && tb.length >= 5 && !ta.includes(":") && distanciaUno(ta, tb)) f = rho;
      if (f > 0) {
        salida ??= new Map(vb);
        salida.delete(tb);
        salida.set(ta, f * Math.min(wb, va.get(ta) ?? 0));
        break;
      }
    }
  }
  return salida ?? vb;
}

function coseno(va: Map<string, number>, vb: Map<string, number>): number {
  if (va.size === 0 || vb.size === 0) return 0;
  let qa = 0;
  let qb = 0;
  let qi = 0;
  for (const w of va.values()) qa += w * w;
  for (const w of vb.values()) qb += w * w;
  for (const [t, w] of va) {
    const w2 = vb.get(t);
    if (w2 !== undefined) qi += w * w2;
  }
  return qa > 0 && qb > 0 ? qi / Math.sqrt(qa * qb) : 0;
}

const GRUPOS_CONFLICTO: Record<string, ReadonlySet<string> | null> = {
  manga: null,
  largo: null,
  tiro: null,
  cuello: new Set(["cuello_v", "cuello_redondo", "escote_u", "cuello_alto", "cuello_camisero", "escote_cuadrado", "escote_corazon"]),
};
const claseDe = (g: string, v: string): string => (g === "cuello" && v === "escote_u" ? "cuello_redondo" : v);
const disjuntos = (A: ReadonlySet<string>, B: ReadonlySet<string>): boolean => {
  for (const x of A) if (B.has(x)) return false;
  return true;
};
const igualesConj = (A: ReadonlySet<string>, B: ReadonlySet<string>): boolean => A.size === B.size && [...A].every((x) => B.has(x));

/** Multiplicador por conflicto entre campos: pack, versión, manga/cuello/largo/tiro, largo dicho de un solo lado, silueta, patrón, código. */
function factorDeConflictos(a: Analisis, b: Analisis, P: ConfigPuntaje["penal"], conTemporada: boolean, sinUnilaterales: boolean): number {
  let f = 1;
  if (P.codigo < 1 && a.codigos.length > 0 && b.codigos.length > 0 && !a.codigos.some((x) => b.codigos.some((y) => mismoCodigo(x, y, conTemporada)))) f *= P.codigo;
  if (!sinUnilaterales) {
    if (!igualesConj(a.pack, b.pack)) f *= a.pack.size > 0 && b.pack.size > 0 ? P.pack : P.packUnilateral;
    if (!igualesConj(a.version, b.version)) f *= a.version.size > 0 && b.version.size > 0 ? P.version : P.versionUnilateral;
  }
  if (P.atributo < 1) {
    for (const [g, nucleo] of Object.entries(GRUPOS_CONFLICTO)) {
      let A = a.attr.get(g);
      let B = b.attr.get(g);
      if (!A || !B) continue;
      if (nucleo) {
        A = new Set([...A].filter((x) => nucleo.has(x)).map((x) => claseDe(g, x)));
        B = new Set([...B].filter((x) => nucleo.has(x)).map((x) => claseDe(g, x)));
      }
      if (A.size > 0 && B.size > 0 && disjuntos(A, B)) f *= P.atributo;
    }
  }
  if (P.extra < 1 && !sinUnilaterales) {
    // un modificador de largo escrito en el NOMBRE de un lado, sin nada del mismo grupo en el otro lado (ni en nombre ni en descripción)
    for (const [x, y] of [[a, b], [b, a]] as const) {
      for (const g of ["largo", "sil:largo"]) {
        const N = x.attrNom.get(g);
        if (!N || N.size === 0) continue;
        const otro = g === "largo" ? y.attr.get("largo") : y.sil.get("largo");
        if (otro && otro.size > 0) continue; // si el otro lado dice algo del grupo, lo decide el conflicto (o la coincidencia)
        f *= P.extra;
        break;
      }
    }
  }
  if (P.patron < 1 && a.pat.length > 0 && b.pat.length > 0 && disjuntos(new Set(a.pat), new Set(b.pat))) f *= P.patron;
  if (P.silueta < 1) {
    for (const [g, A] of a.sil) {
      const B = b.sil.get(g);
      if (B && disjuntos(A, B)) f *= P.silueta;
    }
  }
  return f;
}

/** ¿Se confunden entre sí estas dos categorías (Pantalones ~ Jeans, Camisas y Blusas ~ Tops)? Según el léxico; nunca por ids. */
export function sonCategoriasVecinas(a: string | null, b: string | null, M: Motor = motorDeProduccion()): boolean {
  const x = sinTildes(a);
  const y = sinTildes(b);
  return x !== "" && y !== "" && M.T.vecinas.some((g) => g.includes(x) && g.includes(y));
}

/** Cómo se relacionan la marca y la categoría de la consulta con las de una candidata. */
export type RelacionMarcaCategoria = { marcaDistinta: boolean; categoriaDistinta: boolean; categoriaVecina: boolean };

export type PuntajePar = {
  /** 0..1, SIN el efecto del código distinto (ese solo toca el orden). Es el que se compara con el corte. */
  puntaje: number;
  /** Lo que ordena: el puntaje con el ×0,85 si los códigos de la marca son distintos. */
  orden: number;
  /** Similitud de texto pura (antes de conflictos, marca y categoría). */
  texto: number;
  /** El código de la CONSULTA que coincide con uno de la candidata (y `codigoIgualOtra`, ese mismo código como lo escribió la candidata). */
  codigoIgual: CodigoLeido | null;
  codigoIgualOtra: CodigoLeido | null;
  codigoDistinto: boolean;
  /** Las palabras del modelo que comparten (sin tipos de prenda), como las escribió la consulta. Vacío = ninguna. */
  compartidas: string[];
};

/** Consulta a medio escribir: una sola palabra y ningún otro campo. La falta de pack/versión/largo no es evidencia en contra. */
const esBusquedaCorta = (q: { nombre: string; descripcion: string | null; tejido: string | null; patron: string | null }): boolean =>
  q.nombre.trim().split(/\s+/).filter(Boolean).length <= 1 && !q.descripcion && !q.tejido && !q.patron;

function puntuarPar(q: Analisis, c: Analisis, rel: RelacionMarcaCategoria, corta: boolean, M: Motor): PuntajePar {
  const cfg = M.cfg;
  const vq = vectorDe(q, M);
  const vc = vectorDe(c, M);
  let x = coseno(vq, cfg.rho >= 0 ? alinear(vq, vc, cfg.rho) : vc);
  const texto = x;
  const iguales: { suyo: CodigoLeido; deLaOtra: CodigoLeido }[] = [];
  for (const a of q.codigos) {
    const b = c.codigos.find((k) => mismoCodigo(a, k, cfg.temporadaEnCodigo));
    if (b) iguales.push({ suyo: a, deLaOtra: b });
  }
  const codigoDistinto = q.codigos.length > 0 && c.codigos.length > 0 && iguales.length === 0;
  // un código con letras (E-14, G44) es específico; un número solo (311) choca entre productos ajenos: exige algo de texto en común.
  // Si no lo cumple, el número repetido no cuenta como coincidencia (ni sube el puntaje ni se dice «coincide el código»).
  const coincide = iguales.length > 0 && (iguales.some((k) => /[a-z]/.test(k.suyo.num)) || x >= 0.25);
  if (coincide && cfg.bonoCodigo > 0) x = 1 - (1 - x) * (1 - cfg.bonoCodigo);
  let puntaje = 0;
  if (x > 0) {
    x *= factorDeConflictos(q, c, cfg.penal, cfg.temporadaEnCodigo, corta);
    if (rel.marcaDistinta) x *= cfg.prior.marca;
    if (rel.categoriaDistinta) x *= rel.categoriaVecina ? cfg.prior.categoriaVecina : cfg.prior.categoria;
    puntaje = x < 0 ? 0 : x > 1 ? 1 : x;
  }
  const orden = codigoDistinto ? puntaje * cfg.ordenCodigoDistinto : puntaje;
  // las palabras del modelo en común, en el orden en que la persona las escribió
  const compartidas: string[] = [];
  const propias = new Set(c.nom);
  for (const t of q.nom) {
    if (M.T.tiposCanon.has(t) || !propias.has(t) || compartidas.length >= 6) continue;
    if (!compartidas.includes(t)) compartidas.push(t);
  }
  return {
    puntaje,
    orden,
    texto,
    codigoIgual: coincide ? iguales[0].suyo : null,
    codigoIgualOtra: coincide ? iguales[0].deLaOtra : null,
    codigoDistinto,
    compartidas: compartidas.map((t) => q.fuente.get(t) ?? t.replace(/_/g, " ")),
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// El motor (una instancia por configuración; el de producción es uno solo)
// ---------------------------------------------------------------------------------------------------------------------

export type OpcionesMotor = {
  config?: Omit<Partial<ConfigPuntaje>, "pesoTexto" | "penal" | "prior"> & {
    pesoTexto?: Partial<ConfigPuntaje["pesoTexto"]>;
    penal?: Partial<ConfigPuntaje["penal"]>;
    prior?: Partial<ConfigPuntaje["prior"]>;
  };
  pesosPorClase?: Partial<Record<keyof typeof PESOS_POR_CLASE, number>>;
  /** Solo el banco de pruebas: el peso por rareza medido en su corpus, la frecuencia de cada palabra y el vocabulario observado. */
  pesoDeToken?: (clave: string) => number;
  dfDe?: (t: string) => number;
  vocabularioObservado?: ReadonlySet<string>;
};

export function crearMotor(op: OpcionesMotor = {}): Motor {
  const { T, singularizar } = construirTablas(LEXICO_PARECIDAS, op.vocabularioObservado ?? null);
  const base = CONFIG_POR_DEFECTO;
  const cfg: ConfigPuntaje = {
    ...base,
    ...op.config,
    pesoTexto: { ...base.pesoTexto, ...op.config?.pesoTexto },
    penal: { ...base.penal, ...op.config?.penal },
    prior: { ...base.prior, ...op.config?.prior },
  };
  const peso = op.pesoDeToken ?? crearPesoEstatico(T, { ...PESOS_POR_CLASE, ...op.pesosPorClase });
  return { T, singularizar, cfg, peso, dfDe: op.dfDe ?? null, cache: new Map() };
}

let motorPorDefecto: Motor | null = null;
function motorDeProduccion(): Motor {
  return (motorPorDefecto ??= crearMotor());
}

// ---------------------------------------------------------------------------------------------------------------------
// Códigos de la marca para la pantalla
// ---------------------------------------------------------------------------------------------------------------------

function codigosDeTextos(textos: readonly (string | null | undefined)[], M: Motor): CodigoLeido[] {
  const codigos: CodigoLeido[] = [];
  for (const t of textos) {
    if (!t) continue;
    // analizarTexto también recoge los códigos que quedan pegados al texto («g44» suelto): se reutiliza para leerlos igual que al comparar
    const r = analizarTexto(t, { catN: "", prendas: new Set(), campo: "nombre", marcaToks: null }, M);
    for (const c of r.codigos) if (!codigos.some((x) => x.num === c.num && x.temp === c.temp)) codigos.push(c);
  }
  return codigos;
}

/**
 * Lee el código de la marca escrito en un texto: «SS25 311», «79-SS24», «G44». Devuelve el primero con su forma normalizada
 * (mayúsculas, un espacio o un guion) o `null` si no hay ninguno. Precios, tallas, medidas y packs no son códigos.
 */
export function codigoDeMarca(texto: string, M: Motor = motorDeProduccion()): string | null {
  const c = codigosDeTextos([texto], M)[0];
  return c ? textoDeCodigo(c) : null;
}

/** Entre las partes de un código se aceptan espacios, guiones, rayas y barras: «SS25-311», «ss25 / 311» y «SS25311» son el mismo código. */
const SEPARADORES = "[\\s\\-_/|]*";
const corridas = (s: string): string => (s.match(/[a-z]+|\d+/gi) ?? []).join(SEPARADORES);

/**
 * Dónde está, en el texto TAL COMO LO ESCRIBIERON, el código que `codigoDeMarca` leyó. `codigoDeMarca` devuelve el código normalizado
 * («SS25 311»), que casi nunca es lo escrito («SS25-311», «ss25/311», «SS2025 311», «79 / SS24», «G-44»): esta función devuelve el tramo
 * real (con su prefijo «Ref.», «Mod.», «Modelo»… si lo trae) para que quien lo quite de la descripción no deje el código repetido ni un
 * «Ref.» colgando. `desde` incluido, `hasta` excluido; `null` si el código no está en el texto. No toca nada: solo mide.
 */
export function tramoDeCodigo(texto: string, codigo: string): { desde: number; hasta: number } | null {
  const c = codigo.trim();
  if (!texto || !c) return null;
  let cuerpo: string;
  const conTemporadaAntes = /^(ss|fw|aw|pf)(\d{2}) (\S+)$/i.exec(c); // «SS25 311»
  const conTemporadaDespues = /^(\S+?)-(ss|fw|aw|pf)(\d{2})$/i.exec(c); // «79-SS24»
  if (conTemporadaAntes) cuerpo = `${conTemporadaAntes[1]}${SEPARADORES}(?:20)?${conTemporadaAntes[2]}${SEPARADORES}${corridas(conTemporadaAntes[3])}`;
  else if (conTemporadaDespues) cuerpo = `${corridas(conTemporadaDespues[1])}${SEPARADORES}${conTemporadaDespues[2]}${SEPARADORES}(?:20)?${conTemporadaDespues[3]}`;
  else cuerpo = corridas(c);
  if (cuerpo === "") return null;
  const re = new RegExp(`(?<![a-z0-9])(?:(?:${PALABRAS_DE_PREFIJO})\\.?[\\s:#-]*)?${cuerpo}(?![a-z0-9])`, "i");
  const m = re.exec(texto);
  return m ? { desde: m.index, hasta: m.index + m[0].length } : null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Tiempo: solo rotula y desempata, nunca filtra ni cambia el nivel
// ---------------------------------------------------------------------------------------------------------------------

/** Cuánto puede adelantarse un reloj sin que la fecha deje de ser creíble («hace un momento»). Más allá es un reloj roto o un dato corrupto. */
const TOLERANCIA_RELOJ_MS = 5 * 60_000;

/**
 * «hace 6 min», «hace 21 h», «hace 2 días», «hace 11 meses». `null` si no hay fecha, no se entiende o es del futuro (más de 5 minutos
 * adelante: no se inventa un «hace un momento» para un dato corrupto): la tarjeta entonces no dice nada del tiempo. El «ahora» se
 * inyecta (milisegundos) para que sea determinista.
 */
export function rotuloDeTiempo(creadoEn: string | null, ahora: number): string | null {
  if (!creadoEn) return null;
  const t = Date.parse(creadoEn);
  if (!Number.isFinite(t) || !Number.isFinite(ahora)) return null;
  if (t - ahora > TOLERANCIA_RELOJ_MS) return null;
  const segundos = Math.floor((ahora - t) / 1000);
  if (segundos < 60) return "hace un momento"; // incluye un reloj apenas desfasado (hasta 5 min): no inventa tiempos negativos
  const min = Math.floor(segundos / 60);
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return d === 1 ? "hace 1 día" : `hace ${d} días`;
  const meses = Math.floor(d / 30);
  if (meses < 12) return meses === 1 ? "hace 1 mes" : `hace ${meses} meses`;
  const anios = Math.max(1, Math.floor(d / 365));
  return anios === 1 ? "hace 1 año" : `hace ${anios} años`;
}

// ---------------------------------------------------------------------------------------------------------------------
// Frases de tienda: UNA cosa, sin veredicto («es la misma» / «son distintas» las dice la persona, no el sistema)
// ---------------------------------------------------------------------------------------------------------------------

const titulo = (s: string): string => s.replace(/(^|\s)(\S)/g, (_m, sp: string, l: string) => sp + l.toUpperCase());

/** Devuelve a cada palabra de la frase la tilde con que la escribió la persona («mia» → «Mía»): el análisis trabaja sin tildes, la pantalla no. */
function conTildesDeLaConsulta(frase: string, nombreTecleado: string): string {
  const escritas = new Map<string, string>();
  for (const w of nombreTecleado.split(new RegExp("[^\\p{L}\\p{N}]+", "u"))) if (w) escritas.set(sinTildes(w), w);
  return frase.split(" ").map((p) => escritas.get(p) ?? p).join(" ");
}

/** La frase corta de un motivo. `detalle` completa «Mismo modelo: …» y «Coincide el código: …». */
export function fraseDeMotivo(motivo: MotivoParecida, detalle?: string | null): string {
  switch (motivo) {
    case "mismo_nombre":
      return "Mismo nombre";
    case "una_letra":
      return "Casi igual: una letra de diferencia";
    case "mismo_modelo":
      return detalle ? `Mismo modelo: ${detalle}` : "Mismo modelo";
    case "coincide_codigo":
      return detalle ? `Coincide el código: ${detalle}` : "Coincide el código";
    case "nombre_parecido":
      return "Nombre parecido";
    case "misma_marca_y_categoria":
      return "Misma marca y categoría";
    case "misma_marca_otra_categoria":
      return "Misma marca, otra categoría";
    case "misma_categoria":
      return "Misma categoría";
    case "otra_marca":
      return "De otra marca";
    case "otra_categoria":
      return "De otra categoría";
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// La caja de búsqueda de la hoja «Ver y comparar»: un TEXTO filtra; un CÓDIGO solo ordena y rotula (es una pista, no un veto)
// ---------------------------------------------------------------------------------------------------------------------

const compactoDe = (s: string): string => sinTildes(s).replace(/[^a-z0-9]/g, "");

/** ¿Lo buscado se lee como el código de una etiqueta? Regla de la maqueta aprobada: 3 o más letras o números y al menos un número («SS25 311», «79-SS24», «g44», «311»). */
const buscaUnCodigo = (compacto: string): boolean => compacto.length >= 3 && /\d/.test(compacto);

const frenaElAlta = (p: ParecidaAlta): boolean => p.nivel === "identico" || p.nivel === "casi_igual";

/** Orden estable por (clave ascendente, relevancia descendente): lo que empata queda en el orden en que llegó. */
function ordenarEstable(lista: readonly ParecidaAlta[], clave: (p: ParecidaAlta) => { rango: number; relevancia: number }): ParecidaAlta[] {
  return lista
    .map((p, i) => ({ p, i, ...clave(p) }))
    .sort((a, b) => a.rango - b.rango || b.relevancia - a.relevancia || a.i - b.i)
    .map((x) => x.p);
}

/** ¿El nombre o la descripción de la candidata llevan este código? Por las letras y números pegados («ss25 311» ~ «SS25-311») o por el código ya leído («SS2025 311»). */
function llevaElCodigo(c: CandidataAlta, compacto: string, leido: CodigoLeido | null, M: Motor): boolean {
  if (compactoDe(`${c.referencia} ${c.descripcion ?? ""}`).includes(compacto)) return true;
  if (!leido) return false;
  const a = analizarRegistro({ nombre: c.referencia, descripcion: c.descripcion, tejido: c.tejido, patron: c.patron, marca: c.marca, categoria: c.categoria }, M);
  return a.codigos.some((k) => mismoCodigo(leido, k, M.cfg.temporadaEnCodigo));
}

const empiezaCon = (tokens: readonly string[], w: string): boolean =>
  tokens.some((t) => t.startsWith(w) || (w.length > 3 && w.endsWith("s") && t.startsWith(w.slice(0, -1))));

/**
 * La caja «Busca por nombre o por el código de la etiqueta…» de la hoja. Trabaja sobre la lista que ya ordenó `ordenarParecidas`:
 *  · TEXTO (sin tildes ni mayúsculas, todas las palabras, cada una como comienzo de palabra): deja solo las que coinciden en el nombre,
 *    la descripción, el color, el tejido, el patrón, la temporada, la marca o la categoría. El nombre pesa más que el resto al ordenar, y
 *    `coincideEn` dice en qué campo coincidió lo que el nombre no tiene («Coincide en descripción: …»).
 *  · CÓDIGO (se lee como la maqueta: 3+ caracteres y algún número): NO oculta nada. Sube las que lo llevan en el nombre o la descripción y
 *    dice cuáles son; las demás siguen abajo, porque las reediciones cambian de código y esconderlas empujaría a crear la prenda otra vez.
 * Lo que frena (idéntico, casi igual) va siempre primero, y los avisos de `ResultadoParecidas` no dependen de esta búsqueda: se calculan sobre
 * todas. Sin texto buscable (vacío o solo signos), devuelve la lista tal cual.
 */
export function buscarEnHoja(lista: readonly ParecidaAlta[], busqueda: string, M: Motor = motorDeProduccion()): ResultadoBusquedaHoja {
  const q = busqueda.trim();
  const palabras = soloPalabras(sinTildes(q));
  if (palabras.length === 0) return { lista: [...lista], codigo: null, llevanCodigo: [], coincideEn: {} };

  const compacto = compactoDe(q);
  if (buscaUnCodigo(compacto)) {
    const leido = codigosDeTextos([q], M)[0] ?? null;
    const llevan = lista.filter((p) => llevaElCodigo(p.candidata, compacto, leido, M)).map((p) => p.candidata.id);
    const conjunto = new Set(llevan);
    return {
      lista: ordenarEstable(lista, (p) => ({ rango: frenaElAlta(p) ? 0 : conjunto.has(p.candidata.id) ? 1 : 2, relevancia: 0 })),
      codigo: codigoDeMarca(q, M) ?? q,
      llevanCodigo: llevan,
      coincideEn: {},
    };
  }

  const coincideEn: Record<string, CoincidenciaBusqueda> = {};
  const puntos = new Map<string, number>();
  for (const p of lista) {
    const c = p.candidata;
    const enNombre = soloPalabras(sinTildes(c.referencia));
    const campos: { campo: string; texto: string; tokens: string[] }[] = [];
    const sumar = (campo: string, texto: string | null) => {
      if (texto) campos.push({ campo, texto, tokens: soloPalabras(sinTildes(texto)) });
    };
    sumar("descripción", c.descripcion);
    sumar("color", c.colores.map((x) => x.nombre).join(", "));
    sumar("tejido", c.tejido);
    sumar("patrón", c.patron);
    sumar("temporada", c.temporada);
    const deLaFicha = soloPalabras(sinTildes([c.categoria, c.marca].filter(Boolean).join(" "))); // también se busca, pero no se rotula
    const faltan = palabras.filter((w) => !empiezaCon(enNombre, w));
    if (!faltan.every((w) => campos.some((f) => empiezaCon(f.tokens, w)) || empiezaCon(deLaFicha, w))) continue;
    puntos.set(c.id, 2 * (palabras.length - faltan.length) + faltan.length);
    const unSoloCampo = faltan.length > 0 ? campos.find((f) => faltan.every((w) => empiezaCon(f.tokens, w))) : undefined;
    if (unSoloCampo) coincideEn[c.id] = { campo: unSoloCampo.campo, texto: unSoloCampo.texto };
  }
  return {
    lista: ordenarEstable(
      lista.filter((p) => puntos.has(p.candidata.id)),
      (p) => ({ rango: frenaElAlta(p) ? 0 : 1, relevancia: puntos.get(p.candidata.id) ?? 0 }),
    ),
    codigo: null,
    llevanCodigo: [],
    coincideEn,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// La función principal
// ---------------------------------------------------------------------------------------------------------------------

type Evaluada = {
  c: CandidataAlta;
  nivel: NivelParecida;
  r: PuntajePar;
  motivo: MotivoParecida;
  frase: string;
  afinidad: number;
  reciente: number;
  conStock: boolean;
  codigos: CodigoLeido[];
};

const RANGO_NIVEL: Record<NivelParecida, number> = { identico: 0, casi_igual: 1, parecida: 2, contexto: 3 };

/** El ámbito: con marca, la marca acota (todas sus categorías); sin marca pero con categoría (D5), la categoría; sin ninguna, no hay lista. */
export function ambitoDe(consulta: Pick<ConsultaAlta, "marcaId" | "categoriaId">): AmbitoParecidas {
  if (consulta.marcaId) return "marca";
  if (consulta.categoriaId) return "categoria";
  return "ninguno";
}

function motivoDeContexto(consulta: ConsultaAlta, c: CandidataAlta): { motivo: MotivoParecida; frase: string } {
  if (consulta.marcaId) {
    // una prenda sin marca dentro de la lista de una marca no es «de otra marca»: no tiene ninguna
    if (c.marcaId !== consulta.marcaId) return { motivo: "otra_marca", frase: c.marcaId ? fraseDeMotivo("otra_marca") : "Sin marca" };
    if (consulta.categoriaId && c.categoriaId) {
      return c.categoriaId === consulta.categoriaId
        ? { motivo: "misma_marca_y_categoria", frase: fraseDeMotivo("misma_marca_y_categoria") }
        : { motivo: "misma_marca_otra_categoria", frase: fraseDeMotivo("misma_marca_otra_categoria") };
    }
    // no se sabe la categoría de un lado: lo único cierto es la marca (el tipo de motivo más cercano es «otra categoría», la frase dice la verdad)
    return { motivo: "misma_marca_otra_categoria", frase: "Misma marca" };
  }
  if (consulta.categoriaId && c.categoriaId === consulta.categoriaId) return { motivo: "misma_categoria", frase: fraseDeMotivo("misma_categoria") };
  // sin marca y de otra categoría: solo llega por ser un nombre que la base marcó
  return { motivo: "otra_categoria", frase: fraseDeMotivo("otra_categoria") };
}

/** La fecha para desempatar (ms), o -∞ si no hay, no se entiende o es del futuro (con `ahora`: más de 5 minutos adelante, un reloj roto o un dato corrupto). */
function fechaParaDesempatar(creadoEn: string | null, ahora: number | undefined): number {
  const t = creadoEn ? Date.parse(creadoEn) : Number.NaN;
  if (!Number.isFinite(t)) return Number.NEGATIVE_INFINITY;
  if (ahora !== undefined && Number.isFinite(ahora) && t - ahora > TOLERANCIA_RELOJ_MS) return Number.NEGATIVE_INFINITY;
  return t;
}

/**
 * Ordena las prendas que ya existen según cuánto se parecen a lo tecleado y dice por qué. Con `marcaId` el ámbito es la marca (todas
 * sus categorías); sin marca pero con categoría, la categoría (D5); sin ninguna, la lista sale vacía. NO filtra por marca ni por
 * categoría (quien lee las candidatas ya las acotó; las de otra marca que llegan, como un idéntico, se conservan y solo informan):
 * la marca y la categoría PESAN. NO filtra por texto: la caja de búsqueda de la hoja es `buscarEnHoja`, que trabaja sobre esta lista, así
 * que los avisos (`hayIdentico`…) son siempre los de TODAS y una búsqueda no puede destrabar el «Crear» que frena un idéntico.
 */
export function ordenarParecidas(consulta: ConsultaAlta, candidatas: readonly CandidataAlta[]): ResultadoParecidas {
  return ordenarConMotor(motorDeProduccion(), consulta, candidatas);
}

/** Lo mismo que `ordenarParecidas` con un motor a elegir (otro ajuste de pesos). Lo usan el banco de pruebas y las pruebas del módulo. */
export function ordenarConMotor(M: Motor, consulta: ConsultaAlta, candidatas: readonly CandidataAlta[]): ResultadoParecidas {
  const ambito = ambitoDe(consulta);
  if (ambito === "ninguno") return { lista: [], ambito, hayIdentico: false, hayCasiIgual: false, hayParecida: false };

  // una prenda que llega dos veces (por la marca y por la comprobación de nombres de la base) cuenta una vez
  const vistas = new Set<string>();
  const unicas = candidatas.filter((c) => (vistas.has(c.id) ? false : (vistas.add(c.id), true)));

  // Los nombres viajan en la consulta: si se dedujeran de las candidatas, el puntaje de una cambiaría según qué otras lleguen.
  const marcaNombre = consulta.marcaId ? consulta.marca ?? null : null;
  const categoriaNombre = consulta.categoriaId ? consulta.categoria ?? null : null;
  const registro: RegistroComparable = {
    nombre: consulta.nombre,
    descripcion: consulta.descripcion || null,
    tejido: consulta.tejido,
    patron: consulta.patron,
    marca: marcaNombre,
    categoria: categoriaNombre,
  };
  const q = analizarRegistro(registro, M);
  const corta = esBusquedaCorta(registro);
  const claveConsulta = claveReferencia(consulta.nombre);
  const catVecina = (otra: string | null): boolean => sonCategoriasVecinas(categoriaNombre, otra, M);

  const evaluadas: Evaluada[] = unicas.map((c) => {
    const a = analizarRegistro({ nombre: c.referencia, descripcion: c.descripcion, tejido: c.tejido, patron: c.patron, marca: c.marca, categoria: c.categoria }, M);
    const rel: RelacionMarcaCategoria = {
      marcaDistinta: Boolean(consulta.marcaId && c.marcaId && consulta.marcaId !== c.marcaId),
      categoriaDistinta: Boolean(consulta.categoriaId && c.categoriaId && consulta.categoriaId !== c.categoriaId),
      categoriaVecina: catVecina(c.categoria),
    };
    const r = puntuarPar(q, a, rel, corta, M);
    const claveOtra = claveReferencia(c.referencia);
    let nivel: NivelParecida;
    if (claveConsulta !== "" && claveOtra === claveConsulta) nivel = "identico";
    else if (claveConsulta !== "" && claveOtra !== "" && dentroDeUnaEdicion(claveOtra, claveConsulta)) nivel = "casi_igual";
    else if (r.puntaje >= UMBRAL_PARECIDA_PROVISIONAL) nivel = "parecida";
    else nivel = "contexto";
    // El nivel manda sobre el texto: un idéntico vale 1 y un «casi igual» nunca queda por debajo del corte (el puntaje no contradice al nivel).
    if (nivel === "identico") r.puntaje = 1;
    else if (nivel === "casi_igual") r.puntaje = Math.max(r.puntaje, UMBRAL_PARECIDA_PROVISIONAL);

    let motivo: MotivoParecida;
    let frase: string;
    // El código que coincidió, como lo escribió la OTRA prenda: es el que sale en su tarjeta, y así la frase y el chip dicen lo mismo.
    const codigoTexto = r.codigoIgualOtra ? textoDeCodigo(r.codigoIgualOtra) : null;
    if (nivel === "identico") {
      motivo = "mismo_nombre";
      frase = fraseDeMotivo(motivo);
    } else if (nivel === "casi_igual") {
      motivo = "una_letra";
      frase = fraseDeMotivo(motivo);
    } else if (codigoTexto) {
      motivo = "coincide_codigo";
      frase = fraseDeMotivo(motivo, codigoTexto);
    } else if (nivel === "parecida") {
      const modelo = r.compartidas.length > 0 ? titulo(conTildesDeLaConsulta(r.compartidas.join(" "), consulta.nombre)) : null;
      motivo = modelo ? "mismo_modelo" : "nombre_parecido";
      frase = fraseDeMotivo(motivo, modelo);
    } else {
      ({ motivo, frase } = motivoDeContexto(consulta, c));
    }
    return {
      c,
      nivel,
      r,
      motivo,
      frase,
      afinidad: (consulta.marcaId && c.marcaId === consulta.marcaId ? 1 : 0) + (consulta.categoriaId && c.categoriaId === consulta.categoriaId ? 1 : 0),
      reciente: fechaParaDesempatar(c.creadoEn, consulta.ahora),
      conStock: (c.disponible?.total ?? 0) > 0,
      codigos: a.codigos,
    };
  });

  const hay = (n: NivelParecida) => evaluadas.some((e) => e.nivel === n);
  // Lo que FRENA (idéntico y casi igual) va siempre primero; después, la fuerza del parecido; y solo a igual fuerza, la fecha y el stock.
  evaluadas.sort((x, y) => {
    const porRango = RANGO_NIVEL[x.nivel] - RANGO_NIVEL[y.nivel];
    if (porRango !== 0) return porRango;
    const porEstado = Number(x.c.estado === "descontinuado") - Number(y.c.estado === "descontinuado");
    if (porEstado !== 0) return porEstado;
    const porBanda = Math.round(y.r.orden / ANCHO_BANDA_ORDEN) - Math.round(x.r.orden / ANCHO_BANDA_ORDEN);
    if (porBanda !== 0) return porBanda;
    const porAfinidad = y.afinidad - x.afinidad;
    if (porAfinidad !== 0) return porAfinidad;
    if (y.reciente !== x.reciente) return y.reciente > x.reciente ? 1 : -1;
    const porStock = Number(y.conStock) - Number(x.conStock);
    if (porStock !== 0) return porStock;
    const a = sinTildes(x.c.referencia);
    const b = sinTildes(y.c.referencia);
    return a < b ? -1 : a > b ? 1 : x.c.id < y.c.id ? -1 : x.c.id > y.c.id ? 1 : 0;
  });

  const lista: ParecidaAlta[] = evaluadas.map((e) => ({
    candidata: e.c,
    nivel: e.nivel,
    puntaje: e.r.puntaje,
    motivo: e.motivo,
    frase: e.frase,
    codigo: {
      suyo: e.r.codigoIgual ? textoDeCodigo(e.r.codigoIgual) : q.codigos[0] ? textoDeCodigo(q.codigos[0]) : null,
      deLaOtra: e.r.codigoIgualOtra ? textoDeCodigo(e.r.codigoIgualOtra) : e.codigos[0] ? textoDeCodigo(e.codigos[0]) : null,
      distintos: e.r.codigoDistinto,
    },
  }));
  return { lista, ambito, hayIdentico: hay("identico"), hayCasiIgual: hay("casi_igual"), hayParecida: hay("parecida") };
}
