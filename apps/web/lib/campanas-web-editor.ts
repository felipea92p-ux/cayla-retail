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
// Esta entrega edita ambiente y colores. Movimiento, textos, imagen propia y «dónde se ve» se suman al borrador en las actividades que
// siguen; el parche ya viaja como llaves sueltas, así que sumarlos no cambia nada de lo que hay aquí.

import {
  AMBIENTES_CAMPANA,
  ambienteDeCampana,
  comprobarLectura,
  coloresDeCampana,
  esColorHex,
  type AmbienteCampana,
  type ColoresDeCampana,
  type ComprobacionDeLectura,
} from "@cayla-retail/shared";
import { campanaDeJson, type CampanaWeb, type EstadoDiseno, type ModoDiseno } from "./campanas-web-reglas";

/** El diseño guardado, completo (lo que devuelve `fn_campana_diseno_json`). */
export type DisenoGuardado = {
  modo: ModoDiseno;
  plantilla: string | null;
  paleta: number;
  acento: string | null;
  franja: string;
  entrada: string;
  efecto: string;
  intensidad: string;
  duracion: string;
  cuenta: string;
  titular: string | null;
  bajada: string | null;
  boton: string | null;
  estado: EstadoDiseno;
  version: number;
};

export type FichaCampana = { hoy: string; campana: CampanaWeb; diseno: DisenoGuardado | null };

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const entero = (v: unknown, defecto: number): number => (typeof v === "number" && Number.isInteger(v) ? v : defecto);

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
    franja: texto(v.franja) ?? "rota",
    entrada: texto(v.entrada) ?? "telon",
    efecto: texto(v.efecto) ?? "ninguno",
    intensidad: texto(v.intensidad) ?? "poca",
    duracion: texto(v.duracion) ?? "una",
    cuenta: texto(v.cuenta) ?? "siempre",
    titular: texto(v.titular),
    bajada: texto(v.bajada),
    boton: texto(v.boton),
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
  /** Con el ambiente nacen su efecto y su franja de fábrica; las actividades que siguen los dejan cambiar. */
  efecto: string;
  franja: string;
};

export const BORRADOR_VACIO: BorradorDiseno = { plantilla: null, paleta: 0, acento: null, efecto: "ninguno", franja: "rota" };

const esAmbiente = (v: string | null): v is AmbienteCampana => AMBIENTES_CAMPANA.some((a) => a.clave === v);

/** El borrador con que abre el editor: lo guardado, o vacío si la campaña aún no tiene diseño (o es de imagen propia, que llega después). */
export function borradorDe(ficha: Pick<FichaCampana, "diseno">): BorradorDiseno {
  const d = ficha.diseno;
  if (!d || d.modo !== "ambiente" || !esAmbiente(d.plantilla)) return { ...BORRADOR_VACIO };
  return { plantilla: d.plantilla, paleta: d.paleta, acento: d.acento, efecto: d.efecto, franja: d.franja };
}

/** Elegir un ambiente: nace con su primera paleta, su efecto y su franja de fábrica, y sin color propio (el que había era para otro fondo). */
export function conAmbiente(b: BorradorDiseno, clave: AmbienteCampana): BorradorDiseno {
  if (b.plantilla === clave) return b;
  const a = ambienteDeCampana(clave)!;
  return { plantilla: clave, paleta: 0, acento: null, efecto: a.efecto, franja: a.franja };
}

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
 *  ambiente. Si la campaña no tenía diseño se manda lo mínimo para crearlo (modo y ambiente) más lo que se apartó de fábrica. */
export function parcheDeCambios(guardado: BorradorDiseno | null, ahora: BorradorDiseno): Record<string, unknown> | null {
  if (!ahora.plantilla) return null;
  const parche: Record<string, unknown> = {};
  if (!guardado || !guardado.plantilla) {
    parche.modo = "ambiente";
    parche.plantilla = ahora.plantilla;
    parche.paleta = ahora.paleta;
    parche.acento = ahora.acento;
    parche.efecto = ahora.efecto;
    parche.franja = ahora.franja;
    return parche;
  }
  if (ahora.plantilla !== guardado.plantilla) parche.plantilla = ahora.plantilla;
  if (ahora.paleta !== guardado.paleta) parche.paleta = ahora.paleta;
  if (ahora.acento !== guardado.acento) parche.acento = ahora.acento;
  if (ahora.efecto !== guardado.efecto) parche.efecto = ahora.efecto;
  if (ahora.franja !== guardado.franja) parche.franja = ahora.franja;
  return Object.keys(parche).length ? parche : null;
}

// ---------------------------------------------------------------- Qué falta

export type PasoDelEditor = "ambiente" | "colores";

/** Lo que le falta al diseño para poder programarse, en el orden de las pantallas: elegir un ambiente y que sus letras se lean. */
export function faltanDelDiseno(b: BorradorDiseno): { paso: PasoDelEditor; texto: string }[] {
  if (!b.plantilla) return [{ paso: "ambiente", texto: "elegir un ambiente" }];
  if (b.acento !== null && !esColorHex(b.acento)) return [{ paso: "colores", texto: "un color que sea #rrggbb" }];
  return lecturaDelBorrador(b).ok ? [] : [{ paso: "colores", texto: "un color que se lea bien" }];
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
