import { borrar, guardar, leer } from "./almacen-local";
import type { CambiosDeCosto, CambiosDePrecio } from "./recepcion-combinaciones-reglas";
import type { CostosDePrendas, DecisionCierre } from "./recepcion-conteo-reglas";

// Lo decidido en Cerrar no se pierde al recargar (Felipe 2026-11-03): un «No vino», un costo corregido o un precio de venta viven en la pantalla hasta apretar «Cerrar», y un F5 los borraba. Lo contado
// no pasa por aquí: eso se guarda en la base, solo, al dejar de tocar.
//
// DÓNDE VIVE. En ESTE navegador (`localStorage`), por envío, hasta cerrarlo. No hay un estado «a medio cerrar» en la base y no hace falta: nada de esto vale hasta que quien cierra lo confirma. Otra persona
// en otro aparato no lo ve. ADR-0129 había quitado un borrador así del formulario viejo de Recibir: este es de otra pantalla y lo pidió Felipe mirando lo que costaba (ver ADR-0604).
//
// CONTRATO
//   PROMETE: que leer, guardar y borrar no lanzan nunca (ventana privada, disco lleno, datos bloqueados: la pantalla sigue como si no hubiera borrador); que lo leído se VALIDA (uno viejo o a medias se
//            ignora, no rompe la pantalla); y que guarda solo lo que la persona CAMBIÓ, nunca lo que ya traía: si la base trae otro costo mañana, manda la base.
//   ASUME: que la pantalla muestra lo restaurado y deja empezar de cero. Todo cambio de precio se vuelve a confirmar antes de cerrar (`ConfirmarPrecios`).
//   NO HACE: no guarda `confirmaCosto` (un costo atípico se confirma mirándolo, no se hereda de ayer) y no sobrevive a un cierre o una reapertura: `generacion` cambia con cada uno.

const VERSION = 1;
/** Un borrador olvidado no se ofrece para siempre: dos semanas son más de lo que tarda en cerrarse un envío. */
const DURA_MS = 14 * 86_400_000;

const claveDelBorrador = (envioId: string): string => `cayla:recibir-cierre:${envioId}`;
const claveDelPaso = (envioId: string): string => `cayla:recibir-paso:${envioId}`;

/** Lo que cambió la persona en una línea. */
export type LoDecididoEnLinea = Partial<Pick<DecisionCierre, "costo" | "faltanteCausa" | "sobranteCausa" | "nota">>;

export type FotoDelCierre = {
  decisiones: Readonly<Record<string, LoDecididoEnLinea>>;
  /** El costo propio de cada prenda, por línea: solo el que cambió. */
  costosPrenda: Readonly<Record<string, CostosDePrendas>>;
  /** El costo por combinación entero; `null` si es el que ya venía guardado. */
  cambiosCosto: CambiosDeCosto | null;
  cambiosPrecio: CambiosDePrecio;
  nota: string;
  /** Lo escrito en «Número de guía»; `null` si es el que ya venía. */
  guia: string | null;
  proveedorId: string;
  duenoId: string;
};

/** La foto sin nada decidido: de ahí arrancan las pruebas y el costo que se anota al crear una prenda. La pantalla arma la suya con lo que tiene. */
export const FOTO_VACIA: FotoDelCierre = { decisiones: {}, costosPrenda: {}, cambiosCosto: null, cambiosPrecio: {}, nota: "", guia: null, proveedorId: "", duenoId: "" };

/** Lo que la persona cambió de una decisión, campo por campo. `confirmaCosto` nunca viaja. */
export function decisionCambiada(inicial: DecisionCierre, ahora: DecisionCierre): LoDecididoEnLinea {
  const r: LoDecididoEnLinea = {};
  if (ahora.costo !== inicial.costo) r.costo = ahora.costo;
  if (ahora.faltanteCausa !== inicial.faltanteCausa) r.faltanteCausa = ahora.faltanteCausa;
  if (ahora.sobranteCausa !== inicial.sobranteCausa) r.sobranteCausa = ahora.sobranteCausa;
  if (ahora.nota !== inicial.nota) r.nota = ahora.nota;
  return r;
}

/** La decisión de una línea con lo que la persona ya había decidido encima de lo que trae hoy. */
export const conLoDecidido = (inicial: DecisionCierre, decidido: LoDecididoEnLinea | undefined): DecisionCierre => (decidido ? { ...inicial, ...decidido } : inicial);

/** Lo que trae cada línea hoy con el costo propio que la persona ya había escrito encima. */
export function conCostosDecididos(iniciales: Readonly<Record<string, CostosDePrendas>>, decididos: Readonly<Record<string, CostosDePrendas>> | undefined): Record<string, CostosDePrendas> {
  const r: Record<string, CostosDePrendas> = { ...iniciales };
  for (const [clave, costos] of Object.entries(decididos ?? {})) r[clave] = { ...(r[clave] ?? {}), ...costos };
  return r;
}

/** De los costos propios de hoy, los que no son los que ya venían. */
export function costosCambiados(iniciales: Readonly<Record<string, CostosDePrendas>>, ahora: Readonly<Record<string, CostosDePrendas>>): Record<string, CostosDePrendas> {
  const r: Record<string, CostosDePrendas> = {};
  for (const [clave, costos] of Object.entries(ahora)) {
    const distintos = Object.entries(costos).filter(([producto, valor]) => valor !== iniciales[clave]?.[producto]);
    if (distintos.length > 0) r[clave] = Object.fromEntries(distintos);
  }
  return r;
}

const mismosCostos = (a: CambiosDeCosto, b: CambiosDeCosto): boolean => {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
};

/** `null` si el costo por combinación es el que ya venía guardado: no hay nada que recordar. */
export const costosDeCombinacionCambiados = (iniciales: CambiosDeCosto, ahora: CambiosDeCosto): CambiosDeCosto | null => (mismosCostos(iniciales, ahora) ? null : ahora);

/** ¿La foto tiene algo que la persona decidió? Sin nada no se guarda, y no se dice «recuperamos lo que decidiste». */
export function hayAlgoDecidido(f: FotoDelCierre): boolean {
  return (
    Object.values(f.decisiones).some((d) => Object.keys(d).length > 0) ||
    Object.keys(f.costosPrenda).length > 0 ||
    f.cambiosCosto !== null ||
    Object.keys(f.cambiosPrecio).length > 0 ||
    f.nota !== "" ||
    f.guia !== null ||
    f.proveedorId !== "" ||
    f.duenoId !== ""
  );
}

const esRegistro = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const texto = (x: unknown): string => (typeof x === "string" ? x : "");

function leerDecision(x: unknown): LoDecididoEnLinea | null {
  if (!esRegistro(x)) return null;
  const r: LoDecididoEnLinea = {};
  if (typeof x.costo === "string") r.costo = x.costo;
  if (typeof x.nota === "string") r.nota = x.nota;
  if (typeof x.faltanteCausa === "string" || x.faltanteCausa === null) r.faltanteCausa = x.faltanteCausa as DecisionCierre["faltanteCausa"];
  if (typeof x.sobranteCausa === "string" || x.sobranteCausa === null) r.sobranteCausa = x.sobranteCausa as DecisionCierre["sobranteCausa"];
  return r;
}

const registroDe = <T,>(x: unknown, leerUno: (v: unknown) => T | null): Record<string, T> => {
  if (!esRegistro(x)) return {};
  const r: Record<string, T> = {};
  for (const [k, v] of Object.entries(x)) {
    const uno = leerUno(v);
    if (uno !== null) r[k] = uno;
  }
  return r;
};

const leerCostos = (x: unknown): CostosDePrendas | null => (esRegistro(x) ? registroDe(x, (v) => (typeof v === "string" ? v : null)) : null);
const leerCifra = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : null);
const leerPrecio = (x: unknown): CambiosDePrecio[string] | null => {
  if (!esRegistro(x)) return null;
  const valor = leerCifra(x.valor);
  return valor !== null && (x.valeEn === "todas" || x.valeEn === "sede") ? { valor, valeEn: x.valeEn } : null;
};

/** Lo guardado, validado: lo que no se entiende se deja afuera. */
function leerFoto(x: unknown): FotoDelCierre | null {
  if (!esRegistro(x)) return null;
  return {
    decisiones: registroDe(x.decisiones, leerDecision),
    costosPrenda: registroDe(x.costosPrenda, leerCostos),
    cambiosCosto: esRegistro(x.cambiosCosto) ? registroDe(x.cambiosCosto, leerCifra) : null,
    cambiosPrecio: registroDe(x.cambiosPrecio, leerPrecio),
    nota: texto(x.nota),
    guia: typeof x.guia === "string" ? x.guia : null,
    proveedorId: texto(x.proveedorId),
    duenoId: texto(x.duenoId),
  };
}

/** Lo que se decidió en este envío, o `null` si no hay nada que valga. `generacion`: cuántas veces se cerró o reabrió: lo de otra vuelta ya no vale. */
export function leerBorradorDelCierre(envioId: string, generacion: number, ahora: number = Date.now()): FotoDelCierre | null {
  const crudo = leer<unknown>(claveDelBorrador(envioId), null);
  if (!esRegistro(crudo) || crudo.v !== VERSION) return null;
  const guardadoEn = typeof crudo.guardadoEn === "number" ? crudo.guardadoEn : 0;
  if (crudo.generacion !== generacion || ahora - guardadoEn > DURA_MS) {
    borrar(claveDelBorrador(envioId));
    return null;
  }
  const foto = leerFoto(crudo.foto);
  return foto && hayAlgoDecidido(foto) ? foto : null;
}

/** Guarda lo decidido. Sin nada decidido, borra lo que hubiera: volver a dejarlo todo como venía también es decidir. */
export function guardarBorradorDelCierre(envioId: string, generacion: number, foto: FotoDelCierre, ahora: number = Date.now()): boolean {
  if (!hayAlgoDecidido(foto)) {
    borrar(claveDelBorrador(envioId));
    return true;
  }
  return guardar(claveDelBorrador(envioId), { v: VERSION, generacion, guardadoEn: ahora, foto });
}

export const borrarBorradorDelCierre = (envioId: string): void => borrar(claveDelBorrador(envioId));

/**
 * El costo que se escribió al CREAR una prenda nueva mientras se contaba (ADR-0641 act. 2026-11-11: «costo y precio juntos» en la hoja de la
 * prenda): queda como lo decidido para esa prenda en su línea, y el cierre lo trae puesto, como si se hubiera escrito ahí. Se suma a lo que ya
 * hubiera decidido (nunca lo borra). Como todo el borrador, vive en este navegador hasta cerrar. Devuelve si se pudo guardar.
 */
export function anotarCostoParaElCierre(envioId: string, generacion: number, claveLinea: string, productoId: string, costoTexto: string, ahora: number = Date.now()): boolean {
  const foto = leerBorradorDelCierre(envioId, generacion, ahora) ?? FOTO_VACIA;
  const linea = { ...(foto.costosPrenda[claveLinea] ?? {}), [productoId]: costoTexto };
  return guardarBorradorDelCierre(envioId, generacion, { ...foto, costosPrenda: { ...foto.costosPrenda, [claveLinea]: linea } }, ahora);
}

/** ¿Esta pestaña estaba en Cerrar? Al recargar se vuelve ahí. Por pestaña (`sessionStorage`): en otra, o mañana, se entra a contar como siempre. */
export function estabaEnCerrar(envioId: string): boolean {
  try {
    return typeof window !== "undefined" && window.sessionStorage.getItem(claveDelPaso(envioId)) === "1";
  } catch {
    return false;
  }
}

export function recordarEnCerrar(envioId: string, enCerrar: boolean): void {
  try {
    if (enCerrar) window.sessionStorage.setItem(claveDelPaso(envioId), "1");
    else window.sessionStorage.removeItem(claveDelPaso(envioId));
  } catch {
    // Sin almacenamiento, al recargar se vuelve a contar: lo decidido sigue donde pudo quedar.
  }
}
