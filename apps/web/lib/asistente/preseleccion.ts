// «Pregúntale a CAYLA» (ADR-0536, actividad 1): la preselección local de guías, sin IA y sin red.
//
// Es la pasada 1 del asistente: con lo que la persona escribió, busca las guías interactivas (ADR-0389) que más se parecen, entre las
// pantallas que su rol ve. Hoy es todo lo que hay (el «modo básico»); cuando llegue la IA (actividad 2), le pasa solo estas guías en vez
// del catálogo entero, y sigue siendo la respuesta cuando la IA no está (tope del mes, la API no responde). Por eso no puede depender de
// nada de afuera.

import { moduloDeRuta } from "../actividad-reglas";
import { guiaDeRuta, normalizar } from "../guias/reglas";
import type { Guia, PasoGuia } from "../guias/tipos";

/** Palabras que no dicen QUÉ se busca («¿cómo hago para…?»): sin ellas, «cómo» no empataría con media tienda. */
const PALABRAS_VACIAS = new Set([
  "como", "que", "donde", "cuando", "cual", "cuanto", "cuantos", "quien", "porque", "por", "para", "con", "sin", "una", "uno", "unos", "unas",
  "los", "las", "del", "al", "el", "la", "lo", "le", "les", "de", "en", "es", "un", "y", "o", "a", "se", "me", "mi", "mis", "tu", "su", "sus",
  "yo", "esta", "este", "esto", "eso", "esa", "ese", "hay", "hago", "hacer", "hace", "puedo", "puede", "quiero", "necesito", "tengo", "tiene",
  "veo", "ver", "estan", "pasa", "algo", "cosa", "sistema", "cayla", "aqui", "ahi", "ya", "no", "si", "mas", "muy", "bien",
]);

/**
 * Lo que en la tienda se dice de dos maneras, por su raíz. Pocas y probadas: una equivalencia de más hace empatar lo que no tiene que
 * ver. Van también los verbos que cambian de raíz al conjugarse («cierro» / «cerrar», «devuelvo» / «devolución»).
 */
const EQUIVALENTES: Record<string, readonly string[]> = {
  bolet: ["comprobant"],
  factur: ["comprobant"],
  plat: ["diner"],
  stock: ["existenci", "inventari"],
  prend: ["product"],
  client: ["miembr"],
  vend: ["vent"],
  vent: ["vend"],
  cierr: ["cerr"],
  devuelv: ["devolu", "devolv"],
  devolv: ["devolu"],
  // Lo que salió de la evaluación fija (`evaluacion/casos.json`, 2026-10-27): «mando prendas a Trujillo» es un traslado, «cuánto le
  // debemos» es Por pagar, «cuántas unidades quedan» son las existencias y «cada vendedora» es «cada persona» de Rendimiento.
  mand: ["trasl"],
  debem: ["pag"],
  deud: ["pag"],
  unidad: ["existenci"],
  vendedor: ["person"],
};

/**
 * La forma «como suena» de una palabra ya sin tildes, para que una falta de ortografía de tienda no la vuelva otra: v→b, z→s, c antes
 * de e/i→s y si no→k, qu→k, ll→y, g antes de e/i→j (gue/gui siguen con g), la h muda del inicio fuera y la de adentro como j («caha» es
 * «caja»), n antes de b/p→m («canbio») y una letra repetida seguida, una sola («caaja», «cierre» y «cierro»). Se aplica igual a la
 * pregunta y a la guía, así las dos llegan al mismo cajón. La «ch» se respeta.
 */
function fonetica(palabra: string): string {
  return palabra
    .replace(/ch/g, "#")
    .replace(/^h/, "")
    .replace(/gu([ei])/g, "G$1")
    .replace(/g([ei])/g, "j$1")
    .replace(/G/g, "g")
    .replace(/h/g, "j")
    .replace(/q(u(?=[ei]))?/g, "k")
    .replace(/c([ei])/g, "s$1")
    .replace(/c/g, "k")
    .replace(/z/g, "s")
    .replace(/v/g, "b")
    .replace(/ll/g, "y")
    .replace(/n([bp])/g, "m$1")
    .replace(/([a-z])\1+/g, "$1")
    .replace(/#/g, "ch");
}

/** Las palabras vacías, ya en su forma fonética: «kiero» y «aser» también son vacías. */
const VACIAS = new Set([...PALABRAS_VACIAS].map(fonetica));

/** Las equivalencias, ya en su forma fonética (sus claves son raíces, y la raíz de la forma fonética es la forma fonética de la raíz). */
const EQUIVALENTES_FONETICOS: ReadonlyMap<string, readonly string[]> = (() => {
  const salida = new Map<string, string[]>();
  for (const [clave, valores] of Object.entries(EQUIVALENTES)) {
    const k = fonetica(clave);
    salida.set(k, [...new Set([...(salida.get(k) ?? []), ...valores.map(fonetica)])]);
  }
  return salida;
})();

/** Las que parecen conjugadas y no lo son: sin esto, «taller» y «talla» serían la misma raíz. En su forma fonética («tayer»). */
const ENTERAS = new Set(["taller", "talleres"].map(fonetica));

/**
 * Las terminaciones que se recortan, de la más larga a la más corta (la primera que deja 3 letras o más gana). En su forma fonética:
 * «-ción» se recorta como «-sion», así «debolusion» y «devolución» quedan en la misma raíz.
 */
const TERMINACIONES = ["aciones", "iciones", "ciones", "acion", "icion", "cion", "adas", "idas", "ados", "idos", "ada", "ida", "ado", "ido", "ar", "er", "ir", "as", "es", "os", "a", "e", "o", "s", "i"].map(fonetica);

/**
 * La raíz de una palabra (ya en su forma fonética): sin su terminación («anulo», «anular» y «anulada» son «anul»; «boleta» y «boletas»,
 * «bolet»). Tosca a propósito, sin diccionario que mantener: en una tienda alcanza. Antes eran las primeras 4 letras, y «talla» empataba
 * con «taller» y «compras» con «comprobante».
 */
function raiz(palabra: string): string {
  if (ENTERAS.has(palabra)) return palabra;
  for (const t of TERMINACIONES) {
    if (palabra.endsWith(t) && palabra.length - t.length >= 3) return palabra.slice(0, -t.length);
  }
  return palabra;
}

/**
 * Las raíces de un texto, en su forma fonética, sin las palabras vacías ni las de menos de 3 letras. También las usa `conocimiento.ts`:
 * como la pregunta y lo que se compara pasan por aquí, las dos quedan en la misma forma.
 */
export function raices(texto: string): Set<string> {
  const salida = new Set<string>();
  for (const palabra of normalizar(texto).split(/[^a-z0-9]+/)) {
    if (palabra.length < 3) continue;
    const sonido = fonetica(palabra);
    if (VACIAS.has(sonido)) continue;
    salida.add(raiz(sonido));
  }
  return salida;
}

/**
 * Cuántas letras mal se le perdonan a dos raíces para darlas por la misma: ninguna si la más corta tiene 3 letras o menos («tay» de talla
 * no puede acercarse a nada), una si tiene de 4 a 6 y dos desde 7. Se mira la más corta para que una raíz larga no arrastre a una chica.
 */
function errorPermitido(a: string, b: string): number {
  const corta = Math.min(a.length, b.length);
  return corta <= 3 ? 0 : corta <= 6 ? 1 : 2;
}

/**
 * Si dos raíces están a `tope` letras o menos (Damerau-Levenshtein, con la letra cambiada de lugar: «apratr» y «apartr» están a 1). Corta
 * apenas una fila entera pasa el tope: casi todas las comparaciones se descartan en la primera o segunda letra.
 */
function aDistancia(a: string, b: string, tope: number): boolean {
  if (Math.abs(a.length - b.length) > tope) return false;
  let antes = new Array<number>(b.length + 1).fill(0);
  let fila = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const nueva = new Array<number>(b.length + 1);
    nueva[0] = i;
    let menor = i;
    for (let j = 1; j <= b.length; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(fila[j]! + 1, nueva[j - 1]! + 1, fila[j - 1]! + costo);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, antes[j - 2]! + 1);
      nueva[j] = d;
      if (d < menor) menor = d;
    }
    if (menor > tope) return false;
    antes = fila;
    fila = nueva;
  }
  return fila[b.length]! <= tope;
}

/** Si dos raíces son la misma con una falta de ortografía de por medio (iguales también cuentan). */
function seParecen(a: string, b: string): boolean {
  if (a === b) return true;
  const tope = errorPermitido(a, b);
  return tope > 0 && aDistancia(a, b, tope);
}

/** Cuánto vale empatar por parecido en vez de por la raíz exacta: la mitad, para no desordenar lo que hoy acierta. */
const PESO_APROXIMADO = 0.5;

/**
 * Una palabra buscada: las formas que empatan de lleno (su raíz y sus equivalentes) y las que empatan por parecido (las mismas, más las
 * equivalencias de una clave que se le parece: «bolta» trae lo de «boleta»).
 */
type Buscada = { exactas: readonly string[]; cercanas: readonly string[] };

function buscadasDe(pregunta: string): Buscada[] {
  return [...raices(pregunta)].map((r) => {
    const exactas = [r, ...(EQUIVALENTES_FONETICOS.get(r) ?? [])];
    const cercanas = [...exactas];
    for (const [clave, valores] of EQUIVALENTES_FONETICOS) {
      if (clave !== r && seParecen(clave, r)) cercanas.push(clave, ...valores);
    }
    return { exactas, cercanas: [...new Set(cercanas)] };
  });
}

type RaicesDeGuia = { titulo: Set<string>; resumen: Set<string>; pasos: { paso: PasoGuia; titulo: Set<string>; texto: Set<string> }[] };

/** Las raíces de cada guía se sacan una sola vez: la búsqueda corre en cada tecla y las guías no cambian mientras la página vive. */
const RAICES_DE_GUIA = new WeakMap<Guia, RaicesDeGuia>();
function raicesDeGuia(guia: Guia): RaicesDeGuia {
  let r = RAICES_DE_GUIA.get(guia);
  if (!r) {
    r = {
      titulo: raices(guia.titulo),
      resumen: raices(guia.resumen),
      pasos: guia.pasos.map((p) => ({ paso: p, titulo: raices(p.titulo), texto: raices(p.texto) })),
    };
    RAICES_DE_GUIA.set(guia, r);
  }
  return r;
}

/**
 * Las pantallas que cuelgan de una entrada del menú pero piden OTRO módulo que esa entrada (su página llama a `exigirModulo` con otro):
 * `moduloDeRuta` las da como de la entrada, y ofrecerlas por colgar le mostraría al rol una pantalla que no ve. Solo salen si son una
 * entrada de su menú. `preseleccion.test.ts` lee cada página y falla si aparece una nueva que no está aquí.
 */
export const PIDEN_OTRO_MODULO: ReadonlySet<string> = new Set([
  "/productos/familias",
  "/compras/por-pagar",
  "/compras/ordenes",
  "/compras/ordenes/nueva",
  "/compras/fondos",
  "/compras/ordenes/comprobante/[id]",
  "/compras/ordenes/editar/[id]",
  "/compras/ordenes/envio/[id]",
  "/compras/ordenes/ver/[id]",
]);

/** Cuántas pantallas que se abren desde otra se le muestran a la IA para armar una tarea, y de cuántas candidatas se buscan. */
const HIJAS_MAXIMO = 4;
const HIJAS_DE_LAS_PRIMERAS = 3;

/**
 * Las pantallas que se abren DESDE una candidata y no tienen entrada propia, porque piden un id (Editar producto se abre desde la ficha
 * de una prenda en Productos). Una tarea pasa por ellas («agrega un color a la blusa Catalina 7»: Productos → la prenda → Editar →
 * Agregar color → guardar), pero no hay a dónde llevar a la persona: se llega tocando el paso anterior. Solo las que cuelgan
 * directamente de la dirección de una candidata con entrada en el menú, y no las que piden otro módulo.
 */
export function pantallasQueSeAbrenDesde(sugerencias: readonly Sugerencia[], guias: readonly Guia[]): Sugerencia[] {
  const ya = new Set(sugerencias.map((s) => s.guia.id));
  const salida: Sugerencia[] = [];
  for (const s of sugerencias.slice(0, HIJAS_DE_LAS_PRIMERAS)) {
    if (s.href === null) continue;
    const base = s.guia.ruta.replace(/\/\([^)]+\)/g, "");
    for (const g of guias) {
      const ruta = g.ruta.replace(/\/\([^)]+\)/g, "");
      if (salida.length >= HIJAS_MAXIMO || ya.has(g.id) || !ruta.startsWith(`${base}/[`) || PIDEN_OTRO_MODULO.has(ruta)) continue;
      ya.add(g.id);
      salida.push({ guia: g, href: null, paso: null, puntos: 0 });
    }
  }
  return salida;
}

/** Cuánto pesa encontrar una palabra en cada parte de la guía: el título dice de qué es la pantalla; el texto de un paso, un detalle. */
const PESO = { titulo: 5, resumen: 3, pasoTitulo: 2, pasoTexto: 1 } as const;

export type Sugerencia = {
  guia: Guia;
  /** Dónde llevar a la persona: la entrada del menú de esa guía, o `null` si es la pantalla donde ya está. */
  href: string | null;
  /** El paso que mejor responde, para mostrarlo («Paso: Anular la boleta»). `null` si solo empató el título. */
  paso: PasoGuia | null;
  puntos: number;
};

/**
 * Las guías que más se parecen a la pregunta, entre las que esta cuenta puede abrir: las de las entradas de su menú (`rutasDelMenu`, ya
 * resueltas por rol), la de la pantalla donde está y las que cuelgan de una entrada sin pedir un id y son del MISMO módulo (Historial de
 * cierres cuelga de Caja; Nuevo traslado, de Traslados). Una que cuelga pero tiene su propio módulo (Por pagar, bajo Compras) no se
 * ofrece por colgar: su rol podría no verla. Una guía de una pantalla con id (`/compras/[id]`) solo sale si la persona ya está ahí: no hay
 * a dónde llevarla sin un id.
 */
export function preseleccionar({
  pregunta,
  guias,
  rutasDelMenu,
  rutaActual,
  cuantas = 3,
}: {
  pregunta: string;
  guias: readonly Guia[];
  rutasDelMenu: readonly string[];
  rutaActual: string;
  cuantas?: number;
}): Sugerencia[] {
  const buscadas = buscadasDe(pregunta);
  if (buscadas.length === 0) return [];

  // Cuánto empata una palabra buscada con un grupo de raíces de la guía: 1 si de lleno, `PESO_APROXIMADO` si solo por parecido, 0 si no.
  // Lo del parecido se recuerda por raíz de la guía (las ~120 guías repiten mucho vocabulario): cada par se mide una sola vez por búsqueda.
  const recuerdos = buscadas.map(() => new Map<string, boolean>());
  const nivel = (b: number, s: Set<string>): number => {
    const { exactas, cercanas } = buscadas[b]!;
    if (exactas.some((f) => s.has(f))) return 1;
    const recuerdo = recuerdos[b]!;
    for (const r of s) {
      let cerca = recuerdo.get(r);
      if (cerca === undefined) {
        cerca = cercanas.some((f) => seParecen(f, r));
        recuerdo.set(r, cerca);
      }
      if (cerca) return PESO_APROXIMADO;
    }
    return 0;
  };

  // Qué guía es la de cada entrada del menú, con la misma regla del motor (`guiaDeRuta`: una ruta exacta gana a una con `[id]`). Sin
  // eso, la guía de `/inventario/traslados/[id]` se colaba por la entrada «/inventario/traslados/nuevo».
  const entradaDe = new Map<Guia, string>();
  for (const h of rutasDelMenu) {
    const g = guiaDeRuta(h.split(/[?#]/)[0] ?? h, guias);
    if (g && !entradaDe.has(g)) entradaDe.set(g, h);
  }
  const deAqui = guiaDeRuta(rutaActual, guias);
  const entradas = rutasDelMenu.map((h) => h.split(/[?#]/)[0] ?? h).filter((h) => h !== "/");
  /** La entrada de la que cuelga la pantalla de una guía, si se llega sin un id y es del mismo módulo que esa entrada. */
  const colgadaDe = (guia: Guia): string | null => {
    if (guia.ruta.includes("[")) return null;
    const direccion = guia.ruta.replace(/\/\([^)]+\)/g, "") || "/";
    const padre = entradas.filter((e) => direccion.startsWith(`${e}/`)).sort((a, b) => b.length - a.length)[0];
    return padre && !PIDEN_OTRO_MODULO.has(direccion) && moduloDeRuta(direccion) === moduloDeRuta(padre) ? direccion : null;
  };

  const sugerencias: Sugerencia[] = [];
  for (const guia of guias) {
    const aqui = guia === deAqui;
    const entrada = entradaDe.get(guia) ?? colgadaDe(guia);
    if (!aqui && !entrada) continue;

    const { titulo: enTitulo, resumen: enResumen, pasos } = raicesDeGuia(guia);

    let puntos = 0;
    const porPaso = new Map<PasoGuia, number>();
    for (let b = 0; b < buscadas.length; b++) {
      // Cada palabra buscada suma una vez, por el mejor lugar donde aparece: repetirla en diez pasos no hace más relevante la guía. Un
      // empate por parecido vale la mitad, así que el título por parecido (2,5) pierde con el resumen de lleno (3).
      let mejor = Math.max(PESO.titulo * nivel(b, enTitulo), PESO.resumen * nivel(b, enResumen));
      for (const p of pasos) {
        const enPaso = Math.max(PESO.pasoTitulo * nivel(b, p.titulo), PESO.pasoTexto * nivel(b, p.texto));
        if (enPaso === 0) continue;
        porPaso.set(p.paso, (porPaso.get(p.paso) ?? 0) + enPaso);
        mejor = Math.max(mejor, enPaso);
      }
      puntos += mejor;
    }
    if (puntos === 0) continue;

    // El paso que más palabras junta; a igual puntaje, el primero (la guía lo explica antes). Uno sin ancla (la bienvenida) no cuenta.
    let paso: PasoGuia | null = null;
    let puntosPaso = 0;
    for (const [p, n] of porPaso) {
      if (p.ancla !== null && n > puntosPaso) {
        paso = p;
        puntosPaso = n;
      }
    }
    sugerencias.push({ guia, href: aqui ? null : (entrada ?? null), paso, puntos });
  }

  // A igual puntaje gana la pantalla donde está la persona, y después el orden del registro (estable: sin azar).
  return sugerencias
    .map((s, i) => ({ s, i }))
    .sort((a, b) => b.s.puntos - a.s.puntos || Number(b.s.href === null) - Number(a.s.href === null) || a.i - b.i)
    .slice(0, cuantas)
    .map(({ s }) => s);
}
