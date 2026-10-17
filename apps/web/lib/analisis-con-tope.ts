import type { VistaAnalisis } from "./analisis-tipos";

// Análisis v4 (ADR-0357, «Actualización 2026-10-16 — Análisis para decidir compras»): la BASE DE FALLAS de las lecturas de la pantalla.
// Lógica pura, sin Sentry ni base: la usan `analisis-lectura.ts` (el que lee de verdad), los lectores de `analisis-*.ts` y la pantalla.
// Las pruebas son `analisis-con-tope.test.ts`.
//
// EL PROBLEMA. Cada visita a Análisis lanza de 11 a 17 lecturas a la vez. Si Supabase deja de contestar (el 16-oct a las 21:54 hubo unas
// 100 respuestas 520, 522 y 525), ninguna tenía tope de espera: la pantalla se quedaba colgada. Y cuando una pieza se degradaba con gracia
// (principio 9), el único rastro era un `console.error` que no llega a Sentry: nadie se enteraba. Y si fallaba la lectura de LA TIENDA
// ACTIVA, «Qué pedir» decía «Sin ventas en N días»: se lee como «no se vendió, no pidas».
//
// QUÉ HAY AQUÍ.
//   · `ResultadoLectura<T>`: la forma común de una lectura (ok / sin módulo / no se pudo leer / tope vencido). Cada lector la consume por
//     dentro y devuelve lo mismo de siempre: `fallas` no cambia de significado. A `DatosAnalisis` no sube el resultado crudo sino lo que
//     las pestañas necesitan (`sedesSinLeer`, `frescura`, `fallas`); si A2 o A7 necesitan el motivo por pieza, se sube entonces.
//   · `conTope`: espera una promesa hasta un tope y, si no responde, da por perdida la lectura (sin reintentar).
//   · `crearFrenoDeAvisos`: como máximo un aviso por pieza y por hora, para que una caída de Supabase no mande 11 a 17 avisos por visita.
//   · `avisoDeFalla`: arma lo que se le manda a Sentry. SOLO ids y códigos de error, nunca el mensaje de quien falló (ADR-0424).
//   · `miTiendaSinLeer`: ¿la tienda ACTIVA no se pudo leer? La pantalla lo dice en vez de «sin ventas». Y las decisiones de la pantalla
//     que dependen de eso (`contenidoDeAnalisis`, `hayCuentas`, `confianzaDelDato`, `notaDeFallas`, `textoSiVacio`), puras para probarlas.

/**
 * Cuánto se espera una lectura antes de decir «no se pudo leer» (7 s).
 *
 * POR QUÉ 7 s Y NO 10. El rol `authenticated` tiene `statement_timeout = 8 s` en la base: una consulta lenta la corta la base misma y
 * responde con error (57014), con o sin este tope. Así que este tope SOLO cubre lo que la base no puede cortar: la red entre Vercel y
 * Supabase colgada (la caída del 16-oct no devolvió errores de la base sino 520/522/525 de afuera, o nada). Un tope de 10 s nunca
 * llegaría a ser el que corta una consulta lenta; uno de 7 s, sí, una consulta que va a morir de todos modos. Y no corta una lectura
 * sana pero lenta: la más lenta medida en Análisis fue de 3,8 s (Frescura y el «rinde» son las pesadas), casi la mitad del tope.
 *
 * NO REINTENTA por su cuenta (no hay bucle durante una caída) y NO cancela la petición: solo deja de esperarla. La base sigue con lo suyo
 * hasta su propio tope, sin que la pantalla la espere. Ojo: el cliente de Supabase (postgrest-js) sí reintenta por dentro las lecturas
 * GET y HEAD (`.from().select()`, `head: true`) hasta 3 veces, con 1, 2 y 4 s de espera, cuando la respuesta es 520 o 503 o la red falla.
 * Las RPC son POST y no se reintentan. Este tope las acota igual: pasados 7 s la pantalla ya no espera, siga el reintento o no.
 *
 * LO QUE NO CUBRE. Las lecturas del layout (`fn_mis_modulos`, `fn_es_admin`: las de 40 s del 16-oct), `exigirModulo` y `getUbicaciones` de
 * la página no pasan por aquí.
 */
export const TOPE_LECTURA_MS = 7_000;

/**
 * Desde cuándo una lectura SANA de `fn_analisis_sede` se avisa como lenta (3 s). Es la única que crece con toda la historia de ventas
 * (~115 ms fijos más ~2,3 ms por día de historia; hoy 0,75 s de media): llegaría a los 8 s de la base entre mediados de 2027 y 2028.
 * Es el disparador de «guardar un resumen por tienda y prenda», que se aplazó mientras la lectura no se acercara a esto.
 */
export const LENTA_SEDE_MS = 3_000;

/** Un aviso por pieza y por hora. */
export const AVISOS_CADA_MS = 60 * 60 * 1000;

/** Cada lectura de la pantalla; su nombre es lo que agrupa los avisos en Sentry (`analisis.<pieza>`). */
export type PiezaAnalisis =
  | "sede"
  | "por_llegar"
  | "liquidar_desde"
  | "rinde"
  | "preparacion"
  | "frescura"
  | "conteos"
  | "pedidos_no_atendidos"
  | "precios_de_mi_tienda"
  | "vendido_sin_registrar"
  | "pendientes_por_registrar";

/**
 * Lo que da una lectura. Las cuatro cosas distintas que le pueden pasar:
 *   · `ok`: respondió y se entiende. `datos` puede venir vacío (una tienda sin prendas): eso NO es una falla.
 *   · `sin_modulo`: quien mira no ve el módulo que hace falta (la base no se lo deja leer). No es un error: no se avisa ni se dice
 *     «no se pudo leer», se dice que no se ve. RESERVADO: `leerPieza` no lo produce (no sabe de módulos); hoy lo decide `leerFrescura`
 *     antes de leer y lo guarda en su propio `estado`. Está en el tipo para que A2 (Frescura ausente) lo use sin cambiar la forma.
 *   · `no_se_pudo`: la base devolvió un error, no devolvió nada o devolvió una forma que no se entiende (o la llamada lanzó).
 *   · `tope_vencido`: no respondió en `TOPE_LECTURA_MS`.
 * Para la persona, las dos últimas son lo mismo («no se pudo leer»); se separan para avisar a Sentry.
 */
export type ResultadoLectura<T> = { estado: "ok"; datos: T } | { estado: "sin_modulo" } | { estado: "no_se_pudo" } | { estado: "tope_vencido" };

/** Los datos de una lectura que respondió bien, o `null` si no (sin módulo, error o tope). */
export function datosDe<T>(r: ResultadoLectura<T>): T | null {
  return r.estado === "ok" ? r.datos : null;
}

/**
 * Espera `promesa` hasta `ms`; si no responde, da `valorDeFalla`. Si la promesa falla antes del tope, el error sale tal cual (quien
 * llama decide qué hace con él). El reloj siempre se apaga: no deja nada colgado.
 */
export function conTope<T, F>(promesa: PromiseLike<T>, ms: number, valorDeFalla: F): Promise<T | F> {
  return new Promise<T | F>((resolver, rechazar) => {
    const reloj = setTimeout(() => resolver(valorDeFalla), ms);
    Promise.resolve(promesa).then(
      (valor) => {
        clearTimeout(reloj);
        resolver(valor);
      },
      (error: unknown) => {
        clearTimeout(reloj);
        rechazar(error);
      },
    );
  });
}

/**
 * Dice si una clave puede avisar ahora: la primera vez sí, y no otra vez hasta pasados `cadaMs`. El estado vive en la instancia
 * del servidor (no se comparte entre instancias de Vercel): en el peor caso, una instancia por hora; Sentry agrupa el resto.
 */
export function crearFrenoDeAvisos(cadaMs: number, ahora: () => number = () => Date.now()): (clave: string) => boolean {
  const ultimo = new Map<string, number>();
  return (clave) => {
    const t = ahora();
    const antes = ultimo.get(clave);
    // Un reloj que retrocede (t < antes) no deja al aviso callado horas: se toma como si fuera la primera vez.
    if (antes !== undefined && t >= antes && t - antes < cadaMs) return false;
    ultimo.set(clave, t);
    return true;
  };
}

/** Por qué se avisa: no se pudo (error o sin datos), el tope venció, o respondió pero lenta. */
export type MotivoAviso = "error" | "sin_datos" | "tope_vencido" | "lenta";

/** Lo que se le dice a Sentry: fijo por motivo, nunca el mensaje de quien falló (puede traer lo que la base devolvió). */
const MENSAJE: Record<MotivoAviso, string> = {
  error: "Análisis: la lectura falló",
  sin_datos: "Análisis: la lectura respondió sin datos",
  tope_vencido: "Análisis: la lectura no respondió a tiempo",
  lenta: "Análisis: la lectura tardó más de lo esperado",
};

const ES_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ES_CLAVE_DE_ID = /^[a-z][a-z_]{0,29}$/;
/** Un código de error y nada más: SQLSTATE (`57014`), PostgREST (`PGRST301`) o de la red (`ECONNRESET`). Una frase no pasa. */
const ES_CODIGO = /^[A-Z0-9_]{3,40}$/;

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

function codigoSeguro(v: unknown): string | undefined {
  return typeof v === "string" && ES_CODIGO.test(v) ? v : undefined;
}

/**
 * El código de red que postgrest-js deja DENTRO de `details` cuando `fetch` falla: no lanza un error con `cause`, devuelve
 * `{ message, details, hint, code: "" }`, y `details` termina la línea «Caused by: …» con el código entre paréntesis (`(ENOTFOUND)`).
 * Se toma SOLO ese código, con forma de código; la línea (que trae el motivo y puede traer un host) no viaja.
 */
const CODIGO_EN_DETALLE = /Caused by:[^\n]*\(([A-Z][A-Z0-9_]{2,39})\)\s*(?:\n|$)/;

function codigoDeRed(detalle: unknown): string | undefined {
  if (typeof detalle !== "string") return undefined;
  return CODIGO_EN_DETALLE.exec(detalle)?.[1];
}

/**
 * De un ERROR, solo su código (`error.code`, o el de red de `details`) y el de su causa (`fetch failed` guarda en `cause.code` el motivo
 * real: ENOTFOUND…). Lo que no tiene forma de código no pasa.
 */
function codigosDe(causa: unknown): { codigo?: string; causa?: string } {
  if (!esObjeto(causa)) return {};
  return {
    codigo: codigoSeguro(causa.code) ?? codigoDeRed(causa.details),
    causa: esObjeto(causa.cause) ? codigoSeguro(causa.cause.code) : undefined,
  };
}

/**
 * Lo que `capturarError` recibe para avisar de una pieza: dónde (`analisis.<pieza>`, lo que agrupa en Sentry; la lenta va aparte,
 * `analisis.<pieza>.lenta`, para que una lectura sana pero lenta no se mezcle con las que fallan), un error con mensaje FIJO y el contexto. Del contexto solo salen ids de tienda (con forma de uuid; cualquier otra cosa se descarta) y números: nunca un nombre,
 * una venta ni un DNI. Del error de quien falló solo sale su código, nunca su mensaje.
 */
export function avisoDeFalla(
  pieza: PiezaAnalisis,
  motivo: MotivoAviso,
  ms: number,
  ids: Readonly<Record<string, string>> = {},
  causa?: unknown,
): { donde: string; error: Error; contexto: Record<string, unknown> } {
  const { codigo, causa: deLaCausa } = codigosDe(causa);
  const error = Object.assign(new Error(MENSAJE[motivo], deLaCausa ? { cause: { code: deLaCausa } } : undefined), codigo ? { code: codigo } : {});
  const soloIds = Object.fromEntries(Object.entries(ids).filter(([clave, valor]) => ES_CLAVE_DE_ID.test(clave) && ES_ID.test(valor)));
  return { donde: motivo === "lenta" ? `analisis.${pieza}.lenta` : `analisis.${pieza}`, error, contexto: { pieza, motivo, ms: Math.round(ms), tope_ms: TOPE_LECTURA_MS, ...soloIds } };
}

// ───────────────────────── La tienda activa no se pudo leer ─────────────────────────

/**
 * ¿La tienda ACTIVA (la del selector de sede) no se pudo leer? Si es así, ninguna cifra de la pantalla vale: las listas vienen vacías
 * porque no se leyó, no porque no haya nada. `sedesSinLeer` son los ids de las tiendas que no respondieron.
 */
export function miTiendaSinLeer(datos: { sede: { id: string }; sedesSinLeer: readonly string[] }): boolean {
  return datos.sedesSinLeer.includes(datos.sede.id);
}

/**
 * Lo que dice la pantalla en lugar de «Sin ventas»: `titulo` y `linea` van en el aviso grande de las pestañas; `corto` va en el lugar de
 * una lista o un cuadro que salió vacío porque no se leyó (en lenguaje de tienda: nada de «las listas saldrían vacías»).
 */
export const TEXTO_TIENDA_SIN_LEER = {
  titulo: "No se pudo leer tu tienda",
  linea: "No pude traer las prendas, así que no muestro nada en vez de mostrarte listas vacías. No decidas con esta pantalla: vuelve a intentarlo en un rato.",
  corto: "No se pudo leer tu tienda.",
} as const;

/** El texto de una lista o cuadro de MI tienda que salió vacío: si la tienda no se leyó, que no se pudo leer; si no, la frase de «no hay». */
export function textoSiVacio(datos: { sede: { id: string }; sedesSinLeer: readonly string[] }, siNoHay: string): string {
  return miTiendaSinLeer(datos) ? TEXTO_TIENDA_SIN_LEER.corto : siNoHay;
}

// ───────────────────────── Qué dice la pantalla (decisiones puras) ─────────────────────────

/**
 * Qué se dibuja bajo las pestañas. El orden importa: si la tienda NO cumple las tres condiciones del motor, manda «Todavía no» (su Hoy
 * lee `textoSiVacio` por dentro, porque ahí la lista de prendas sigue saliendo de la tienda); si cumple pero la mía no se leyó, el aviso;
 * y solo si se leyó, la pestaña.
 */
export type ContenidoAnalisis = "todavia-no-hoy" | "todavia-no-otra" | "tienda-sin-leer" | VistaAnalisis;

export function contenidoDeAnalisis({ recomienda, sinLeer, vista }: { recomienda: boolean; sinLeer: boolean; vista: VistaAnalisis }): ContenidoAnalisis {
  if (!recomienda) return vista === "hoy" ? "todavia-no-hoy" : "todavia-no-otra";
  if (sinLeer) return "tienda-sin-leer";
  return vista;
}

/** Si las pestañas dicen cuántas prendas tienen («Se está acabando 4»): solo si se recomienda y la tienda se leyó; si no, «—». */
export function hayCuentas(recomienda: boolean, sinLeer: boolean): boolean {
  return recomienda && !sinLeer;
}

/** Lo que dice el chip de arriba a la derecha: no puede decir «Datos confiables» junto a «No se pudo leer tu tienda». */
export type ConfianzaDelDato = "sin-leer" | "confiable" | "incompleto";

export function confianzaDelDato(puedeHablar: boolean, sinLeer: boolean): ConfianzaDelDato {
  if (sinLeer) return "sin-leer";
  return puedeHablar ? "confiable" : "incompleto";
}

/**
 * La nota gris con lo que no se pudo leer (`fallas`); null si todo respondió. Cierra con «Lo demás está al día» salvo que falte la tienda
 * activa: ahí no se puede decir, y el aviso de arriba dice que no se decida con la pantalla.
 */
export function notaDeFallas(fallas: readonly string[], sinLeer: boolean): string | null {
  if (fallas.length === 0) return null;
  const frase = `${fallas.join(". ")}.`;
  return sinLeer ? frase : `${frase} Lo demás está al día.`;
}
