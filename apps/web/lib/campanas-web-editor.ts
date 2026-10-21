// Tienda web ▸ Campañas ▸ el editor de diseño (maqueta docs/maquetas/campanas-tienda-2026-10, pantalla 2). Lógica pura: se importa desde el
// servidor y desde el cliente, y se prueba con `campanas-web-editor.test.ts`.
//
// CONTRATO
//   PROMETE: leer lo que devuelve `retail.fn_campana_diseno()` sin caerse ante un dato raro; el borrador que se edita (lo que el editor
//            deja cambiar HOY: el ambiente y los colores); el parche mínimo que se manda a `guardar_campana_diseno` (solo lo que cambió);
//            qué le falta al diseño para poder programarse (candado de lectura, el mismo de `comprobarLectura`) y los errores de la base en
//            palabras de tienda.
//   ASUME:   que la base decide qué es válido (los CHECK de `campana_disenos`) y que el catálogo de ambientes y su candado de lectura
//            viven en `@cayla-retail/shared`, los mismos que usa la tienda. Aquí no se inventa ninguna regla: «falta» sale de lo que la base
//            o el candado ya exigen.
//   NO HACE: leer ni escribir en la base, ni decidir permisos (lo hace `fn_exigir_modulo('campanas_web')`).
//
// Esta entrega edita ambiente, colores, movimiento y «dónde se ve». Textos e imagen propia se suman al borrador en las actividades que siguen;
// el parche ya viaja como llaves sueltas, así que sumarlos no cambia nada de lo que hay aquí.

import {
  AMBIENTES_CAMPANA,
  CUENTAS_CAMPANA,
  DURACIONES_CAMPANA,
  EFECTOS_CAMPANA,
  ENTRADAS_CAMPANA,
  FRANJAS_CAMPANA,
  INTENSIDADES_CAMPANA,
  ambienteDeCampana,
  comprobarLectura,
  coloresDeCampana,
  esColorHex,
  type AmbienteCampana,
  type ColoresDeCampana,
  type ComprobacionDeLectura,
  type CuentaCampana,
  type DuracionCampana,
  type EfectoCampana,
  type EntradaCampana,
  type FranjaCampana,
  type IntensidadCampana,
} from "@cayla-retail/shared";
import { campanaDeJson, type CampanaWeb, type EstadoDiseno, type ModoDiseno } from "./campanas-web-reglas";

/** Las cinco piezas de la tienda que el diseño puede vestir. */
export const PIEZAS_DONDE = ["franja", "portada", "catalogo", "sello", "bolsa"] as const;
export type PiezaDonde = (typeof PIEZAS_DONDE)[number];
export type Donde = Record<PiezaDonde, boolean>;
export const DONDE_TODO: Donde = { franja: true, portada: true, catalogo: true, sello: true, bolsa: true };

/** El diseño guardado, completo (lo que devuelve `fn_campana_diseno_json`). */
export type DisenoGuardado = {
  modo: ModoDiseno;
  plantilla: string | null;
  paleta: number;
  acento: string | null;
  franja: FranjaCampana;
  entrada: EntradaCampana;
  efecto: EfectoCampana;
  intensidad: IntensidadCampana;
  duracion: DuracionCampana;
  cuenta: CuentaCampana;
  titular: string | null;
  bajada: string | null;
  boton: string | null;
  donde: Donde;
  estado: EstadoDiseno;
  version: number;
};

export type FichaCampana = { hoy: string; campana: CampanaWeb; diseno: DisenoGuardado | null };

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const entero = (v: unknown, defecto: number): number => (typeof v === "number" && Number.isInteger(v) ? v : defecto);
const dePila = <T extends string>(lista: readonly T[], v: unknown, defecto: T): T => (lista.includes(v as T) ? (v as T) : defecto);

function dondeDeJson(v: unknown): Donde {
  const o = esObjeto(v) ? v : {};
  return Object.fromEntries(PIEZAS_DONDE.map((k) => [k, typeof o[k] === "boolean" ? o[k] : true])) as Donde;
}

function disenoGuardadoDeJson(v: unknown): DisenoGuardado | null {
  if (!esObjeto(v)) return null;
  const modo = v.modo === "ambiente" || v.modo === "imagen" ? v.modo : null;
  const estado = v.estado === "programado" ? "programado" : v.estado === "borrador" ? "borrador" : null;
  if (!modo || !estado) return null;
  return {
    modo,
    plantilla: texto(v.plantilla),
    paleta: entero(v.paleta, 0),
    acento: texto(v.acento),
    franja: dePila(FRANJAS_CAMPANA, v.franja, "rota"),
    entrada: dePila(ENTRADAS_CAMPANA, v.entrada, "telon"),
    efecto: dePila(EFECTOS_CAMPANA, v.efecto, "ninguno"),
    intensidad: dePila(INTENSIDADES_CAMPANA, v.intensidad, "poca"),
    duracion: dePila(DURACIONES_CAMPANA, v.duracion, "una"),
    cuenta: dePila(CUENTAS_CAMPANA, v.cuenta, "siempre"),
    titular: texto(v.titular),
    bajada: texto(v.bajada),
    boton: texto(v.boton),
    donde: dondeDeJson(v.donde),
    estado,
    version: Math.max(1, entero(v.version, 1)),
  };
}

/** Lo que devolvió `fn_campana_diseno()`; `null` si no es de la forma pedida (la pantalla lo dice en vez de abrir un editor vacío). */
export function leerFichaCampana(dato: unknown): FichaCampana | null {
  if (!esObjeto(dato)) return null;
  const hoy = texto(dato.hoy);
  const campana = campanaDeJson(dato.campana);
  if (!hoy || !campana) return null;
  return { hoy, campana, diseno: disenoGuardadoDeJson(dato.diseno) };
}

// ---------------------------------------------------------------- El borrador que se edita

export type BorradorDiseno = {
  /** El ambiente elegido, o `null` si todavía no eligió ninguno. */
  plantilla: AmbienteCampana | null;
  paleta: number;
  /** Un color propio para el acento, o `null` para usar el de la paleta. */
  acento: string | null;
  /** El movimiento: con el ambiente nacen su efecto y su franja de fábrica; lo demás nace de siempre. El líder los cambia a gusto. */
  franja: FranjaCampana;
  entrada: EntradaCampana;
  efecto: EfectoCampana;
  intensidad: IntensidadCampana;
  duracion: DuracionCampana;
  cuenta: CuentaCampana;
  /** Dónde se ve: qué piezas de la tienda viste el diseño. */
  donde: Donde;
};

export const BORRADOR_VACIO: BorradorDiseno = {
  plantilla: null, paleta: 0, acento: null,
  franja: "rota", entrada: "telon", efecto: "ninguno", intensidad: "poca", duracion: "una", cuenta: "siempre",
  donde: DONDE_TODO,
};

const esAmbiente = (v: string | null): v is AmbienteCampana => AMBIENTES_CAMPANA.some((a) => a.clave === v);

/** El borrador con que abre el editor: lo guardado, o vacío si la campaña aún no tiene diseño (o es de imagen propia, que llega después). */
export function borradorDe(ficha: Pick<FichaCampana, "diseno">): BorradorDiseno {
  const d = ficha.diseno;
  if (!d || d.modo !== "ambiente" || !esAmbiente(d.plantilla)) return { ...BORRADOR_VACIO };
  return {
    plantilla: d.plantilla, paleta: d.paleta, acento: d.acento,
    franja: d.franja, entrada: d.entrada, efecto: d.efecto, intensidad: d.intensidad, duracion: d.duracion, cuenta: d.cuenta,
    donde: { ...d.donde },
  };
}

/** Elegir un ambiente: nace con su primera paleta y su movimiento de fábrica (su efecto, su franja y lo demás de siempre), sin color propio (el que
 *  había era para otro fondo). Lo que ya se eligió de «dónde se ve» se conserva: no depende del ambiente. */
export function conAmbiente(b: BorradorDiseno, clave: AmbienteCampana): BorradorDiseno {
  if (b.plantilla === clave) return b;
  const a = ambienteDeCampana(clave)!;
  return {
    ...BORRADOR_VACIO, plantilla: clave, efecto: a.efecto, franja: a.franja, donde: b.donde,
  };
}

/** Cambiar una pieza del movimiento (la franja, la entrada, el efecto…). */
export const conMovimiento = <K extends "franja" | "entrada" | "efecto" | "intensidad" | "duracion" | "cuenta">(b: BorradorDiseno, llave: K, valor: BorradorDiseno[K]): BorradorDiseno => ({ ...b, [llave]: valor });

/** Encender o apagar una pieza de «dónde se ve». */
export const conDonde = (b: BorradorDiseno, pieza: PiezaDonde, encendida: boolean): BorradorDiseno => ({ ...b, donde: { ...b.donde, [pieza]: encendida } });

/** ¿Alguna pieza de la tienda queda vestida? */
export const hayDonde = (b: Pick<BorradorDiseno, "donde">): boolean => PIEZAS_DONDE.some((k) => b.donde[k]);

export const conPaleta = (b: BorradorDiseno, paleta: number): BorradorDiseno => ({ ...b, paleta, acento: null });
export const conAcento = (b: BorradorDiseno, acento: string | null): BorradorDiseno => ({ ...b, acento: acento ? acento.toLowerCase() : null });

/** Los colores con que se ve el borrador (paleta + color propio), o `null` si aún no hay ambiente. */
export const coloresDelBorrador = (b: BorradorDiseno): ColoresDeCampana | null => coloresDeCampana(b.plantilla, b.paleta, b.acento);

export function lecturaDelBorrador(b: BorradorDiseno): { ok: boolean; items: ComprobacionDeLectura[] } {
  const c = coloresDelBorrador(b);
  return c ? comprobarLectura(c) : { ok: false, items: [] };
}

// ---------------------------------------------------------------- Qué cambió → el parche

/** Lo que cambió entre lo guardado y lo que hay en pantalla, como el parche de `guardar_campana_diseno`; `null` si nada cambió o aún no hay
 *  ambiente. Si la campaña no tenía diseño se manda lo mínimo para crearlo (modo y ambiente) más todo lo que se eligió. */
export function parcheDeCambios(guardado: BorradorDiseno | null, ahora: BorradorDiseno): Record<string, unknown> | null {
  if (!ahora.plantilla) return null;
  const parche: Record<string, unknown> = {};
  const crea = !guardado || !guardado.plantilla;
  if (crea) {
    parche.modo = "ambiente";
    parche.plantilla = ahora.plantilla;
  } else if (ahora.plantilla !== guardado.plantilla) parche.plantilla = ahora.plantilla;
  const antes = crea ? BORRADOR_VACIO : guardado;
  for (const k of ["paleta", "acento", "franja", "entrada", "efecto", "intensidad", "duracion", "cuenta"] as const) {
    if (crea || ahora[k] !== antes[k]) parche[k] = ahora[k];
  }
  for (const k of PIEZAS_DONDE) if (crea ? ahora.donde[k] !== BORRADOR_VACIO.donde[k] : ahora.donde[k] !== antes.donde[k]) parche[`donde_${k}`] = ahora.donde[k];
  return Object.keys(parche).length ? parche : null;
}

// ---------------------------------------------------------------- Qué falta

export type PasoDelEditor = "ambiente" | "colores" | "movimiento" | "donde";

/** Lo que le falta al diseño para poder programarse, en el orden de las pantallas: elegir un ambiente, que sus letras se lean y que se vea en
 *  alguna pieza de la tienda. */
export function faltanDelDiseno(b: BorradorDiseno): { paso: PasoDelEditor; texto: string }[] {
  if (!b.plantilla) return [{ paso: "ambiente", texto: "elegir un ambiente" }];
  const faltan: { paso: PasoDelEditor; texto: string }[] = [];
  if (b.acento !== null && !esColorHex(b.acento)) faltan.push({ paso: "colores", texto: "un color que sea #rrggbb" });
  else if (!lecturaDelBorrador(b).ok) faltan.push({ paso: "colores", texto: "un color que se lea bien" });
  if (!hayDonde(b)) faltan.push({ paso: "donde", texto: "elegir dónde se ve" });
  return faltan;
}

// ---------------------------------------------------------------- Errores de la base en palabras de tienda

const ERRORES: Record<string, { titulo: string; detalle?: string }> = {
  campana_cambio_otro: { titulo: "Alguien cambió esta campaña", detalle: "Vuelve a abrirla para ver lo que quedó y repite tu cambio." },
  campana_terminada: { titulo: "Esa campaña ya terminó", detalle: "Su diseño ya no se cambia: la tienda volvió sola a verse como siempre." },
  campana_no_existe: { titulo: "Esa campaña ya no existe", detalle: "Vuelve a la lista de campañas." },
  campana_diseno_datos_invalidos: { titulo: "El diseño no es válido", detalle: "Revisa el ambiente y los colores." },
};

/** El error de la base (su código está en el mensaje y la frase en `hint`) en un título y un detalle; `null` si no es de las campañas. */
export function errorDeCampanas(mensaje: string): { titulo: string; detalle?: string } | null {
  for (const [codigo, e] of Object.entries(ERRORES)) {
    if (mensaje.includes(codigo)) return e;
  }
  return null;
}
