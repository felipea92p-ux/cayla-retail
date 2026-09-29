import { claveLocal, guardar, leer } from "./almacen-local";
import { hoyEnLima, resolverRangoPersonalizado, type Rango } from "./resumen-periodo";

// Los dos períodos que la persona dejó elegidos en Análisis › Comparar períodos (2026-09-29, Felipe: «una vez que
// modifique A o B, que no vuelvan a ponerse los de por defecto»).
//
// CONTRATO — lo que promete este módulo y lo que asume:
//   · Promete: si la persona eligió A o B en Comparar, la próxima vez que entre a Comparar con una URL sin fechas
//     (salió del módulo y volvió, cambió de pestaña, abrió el enlace sin fechas) recibe SUS dos períodos, no los de
//     por defecto. Nunca pisa fechas que la URL ya trae, y jamás rompe la pantalla por el almacenamiento.
//   · Asume: que la URL sigue siendo la única fuente de verdad de lo que se está viendo (ADR-0138). Esto NO es un
//     segundo estado: es una memoria que SIEMBRA la URL en el momento de entrar. Por eso vive en `localStorage`
//     (`almacen-local`, el mecanismo que ya usan Vender y Caja: por sede, en ESTE aparato) y no en una cookie que el
//     servidor mezcle en silencio: la caché del router (`staleTimes: { dynamic: 30 }`, next.config.ts) reutiliza 30 s
//     una pantalla ya visitada POR URL, y una URL «vacía» con fechas ocultas en una cookie serviría los períodos
//     anteriores justo cuando la persona espera los últimos que eligió. Con las fechas ESCRITAS en la URL, cada elección
//     es su propia dirección y no hay nada que cachear mal.
//
// Es una preferencia de pantalla de esta máquina, no un dato del negocio (como el lateral plegado, ver
// `lateral-cookie.ts`): no vive en la base. Se guarda por sede y por persona, para que dos personas que comparten el
// navegador de una tienda no se pisen, ni una misma persona mezcle la historia de una sede con la de otra.

/** Lo elegido en Comparar: A es el período contra el que se compara y B el que se analiza. Siempre fechas válidas. */
export type ParElegido = { a: Rango; b: Rango };

/** Los parámetros de URL que son SOLO de Comparar y llevan fechas: B (`bdesde`/`bhasta`) y A (`comparar`, `cdesde`,
 *  `chasta`). `preset`/`desde`/`hasta` no están: son el período de Desempeño y B solo los hereda mientras no se elige. */
const PARAMS_DE_LOS_PERIODOS = ["bdesde", "bhasta", "comparar", "cdesde", "chasta"] as const;

/** La llave donde se guarda lo elegido: una por sede y por persona («terminal» cuando la sesión es de un aparato sin
 *  persona: cada terminal ya está fija a una sola tienda, así que la sede la distingue). */
export function clavePeriodosElegidos(ubicacionId: string, personaId: string | null): string {
  return claveLocal(ubicacionId, `analisis-comparar:${personaId ?? "terminal"}`);
}

/** Lo que hay que escribir en la URL para que ella diga los dos períodos (y el servidor los resuelva con las
 *  mismas reglas de siempre: `comparar=personalizado` es cómo A llega desde «Otro período…»). */
export function cambiosDeUrlDelPar(par: ParElegido): Record<string, string> {
  return { bdesde: par.b.desde, bhasta: par.b.hasta, comparar: "personalizado", cdesde: par.a.desde, chasta: par.a.hasta };
}

/**
 * Pasa dos rangos por las MISMAS reglas con que el servidor resuelve un período elegido a mano (`resolverRangoPersonalizado`:
 * ordena fechas al revés, recorta lo que pasa de hoy, acorta lo que excede un año) y devuelve el par, o null si alguno no
 * sirve (fecha inexistente, empieza en el futuro). Así lo que se guarda es lo que la pantalla realmente mostrará, y una
 * elección inválida nunca pisa la última buena.
 */
export function normalizarPar(a: Rango, b: Rango, hoy: string): ParElegido | null {
  const ra = resolverRangoPersonalizado(a.desde, a.hasta, hoy);
  const rb = resolverRangoPersonalizado(b.desde, b.hasta, hoy);
  return ra && rb ? { a: ra, b: rb } : null;
}

const esRangoCrudo = (v: unknown): v is Rango => typeof v === "object" && v !== null && typeof (v as Rango).desde === "string" && typeof (v as Rango).hasta === "string";

/** Lo leído del almacenamiento es texto de afuera (otra versión, JSON viejo, alguien que lo editó): se valida como
 *  entrada, no se cree. Cualquier cosa rara devuelve null y la pantalla usa los períodos de por defecto. */
export function leerParElegido(crudo: unknown, hoy: string): ParElegido | null {
  if (typeof crudo !== "object" || crudo === null) return null;
  const { a, b } = crudo as { a?: unknown; b?: unknown };
  return esRangoCrudo(a) && esRangoCrudo(b) ? normalizarPar(a, b, hoy) : null;
}

/** ¿La URL ya dice algo de los períodos de Comparar? Si sí, manda ella: lo guardado solo llena el silencio. */
export function urlYaTraePeriodos(tiene: (clave: string) => boolean): boolean {
  return PARAMS_DE_LOS_PERIODOS.some(tiene);
}

/**
 * Lo que hay que sumar a la URL al ENTRAR a Comparar para que traiga los períodos que la persona dejó elegidos: `{}` si
 * la URL ya trae fechas de Comparar (manda ella), si no hay nada guardado, o si el almacenamiento no responde.
 * Se llama en el clic de la pestaña y al montar Comparar (enlace directo sin fechas): siempre desde el navegador.
 */
export function periodosParaSembrar(clave: string, tiene: (clave: string) => boolean, hoy: string = hoyEnLima(new Date())): Record<string, string> {
  if (urlYaTraePeriodos(tiene)) return {};
  const par = leerParElegido(leer<unknown>(clave, null), hoy);
  return par ? cambiosDeUrlDelPar(par) : {};
}

/** Guarda lo que la persona acaba de elegir. `false` si no se pudo o si el par no sirve (no se pisa lo anterior). */
export function guardarParElegido(clave: string, a: Rango, b: Rango, hoy: string = hoyEnLima(new Date())): boolean {
  const par = normalizarPar(a, b, hoy);
  return par ? guardar(clave, par) : false;
}
