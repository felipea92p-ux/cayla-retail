// «Pregúntale a CAYLA» (ADR-0529, actividad 1): la preselección local de guías, sin IA y sin red.
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

/** Las que parecen conjugadas y no lo son: sin esto, «taller» y «talla» serían la misma raíz. */
const ENTERAS = new Set(["taller", "talleres"]);

/** Las terminaciones que se recortan, de la más larga a la más corta (la primera que deja 3 letras o más gana). */
const TERMINACIONES = ["aciones", "iciones", "ciones", "acion", "icion", "cion", "adas", "idas", "ados", "idos", "ada", "ida", "ado", "ido", "ar", "er", "ir", "as", "es", "os", "a", "e", "o", "s", "i"];

/**
 * La raíz de una palabra: sin su terminación («anulo», «anular» y «anulada» son «anul»; «boleta» y «boletas», «bolet»). Tosca a
 * propósito, sin diccionario que mantener: en una tienda alcanza. Antes eran las primeras 4 letras, y «talla» empataba con «taller» y
 * «compras» con «comprobante».
 */
function raiz(palabra: string): string {
  if (ENTERAS.has(palabra)) return palabra;
  for (const t of TERMINACIONES) {
    if (palabra.endsWith(t) && palabra.length - t.length >= 3) return palabra.slice(0, -t.length);
  }
  return palabra;
}

/** Las raíces de un texto, sin las palabras vacías ni las de menos de 3 letras. También las usa `conocimiento.ts`. */
export function raices(texto: string): Set<string> {
  const salida = new Set<string>();
  for (const palabra of normalizar(texto).split(/[^a-z0-9]+/)) {
    if (palabra.length < 3 || PALABRAS_VACIAS.has(palabra)) continue;
    salida.add(raiz(palabra));
  }
  return salida;
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
]);

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
  const buscadas = [...raices(pregunta)].map((r) => [r, ...(EQUIVALENTES[r] ?? [])]);
  if (buscadas.length === 0) return [];

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

    const enTitulo = raices(guia.titulo);
    const enResumen = raices(guia.resumen);
    const pasos = guia.pasos.map((p) => ({ paso: p, titulo: raices(p.titulo), texto: raices(p.texto) }));

    let puntos = 0;
    const porPaso = new Map<PasoGuia, number>();
    for (const formas of buscadas) {
      const tiene = (s: Set<string>) => formas.some((f) => s.has(f));
      // Cada palabra buscada suma una vez, por el mejor lugar donde aparece: repetirla en diez pasos no hace más relevante la guía.
      let mejor = 0;
      if (tiene(enTitulo)) mejor = PESO.titulo;
      else if (tiene(enResumen)) mejor = PESO.resumen;
      for (const p of pasos) {
        const enPaso = tiene(p.titulo) ? PESO.pasoTitulo : tiene(p.texto) ? PESO.pasoTexto : 0;
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
