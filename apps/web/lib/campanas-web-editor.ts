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
// El borrador edita UNO de dos modos: un ambiente del catálogo (con sus colores y sus textos) o una imagen propia (con el color de su botón). El
// movimiento y «dónde se ve» son de los dos. El parche viaja como llaves sueltas.

import {
  AMBIENTES_CAMPANA,
  CUENTAS_CAMPANA,
  DURACIONES_CAMPANA,
  EFECTOS_CAMPANA,
  ENTRADAS_CAMPANA,
  FRANJAS_CAMPANA,
  INTENSIDADES_CAMPANA,
  ambienteDeCampana,
  coloresDeImagenDeCampana,
  comprobarLectura,
  comprobarLecturaDeImagen,
  coloresDeCampana,
  TOPE_BAJADA_CAMPANA,
  TOPE_BOTON_CAMPANA,
  TOPE_TITULAR_CAMPANA,
  esColorHex,
  esRutaDeImagenDeCampana,
  limpiarTextoDeCampana,
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
import { campanaDeJson, fechaCortaDicha, type CampanaWeb, type EstadoDiseno, type ModoDiseno } from "./campanas-web-reglas";

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
  /** Las rutas de las imágenes en el almacén (solo con `modo = imagen`): la horizontal y la vertical opcional. */
  imagenRuta: string | null;
  imagenVerticalRuta: string | null;
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
    imagenRuta: esRutaDeImagenDeCampana(v.imagen_ruta) ? v.imagen_ruta : null,
    imagenVerticalRuta: esRutaDeImagenDeCampana(v.imagen_vertical_ruta) ? v.imagen_vertical_ruta : null,
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
  /** Uno de los dos modos: un ambiente del catálogo o la imagen propia. Cada uno guarda lo suyo y al volver se encuentra como lo dejó. */
  modo: ModoDiseno;
  /** El ambiente elegido, o `null` si todavía no eligió ninguno. */
  plantilla: AmbienteCampana | null;
  /** Las rutas de las imágenes ya subidas (modo imagen): la horizontal y la vertical opcional. */
  imagen: string | null;
  imagenVertical: string | null;
  paleta: number;
  /** Un color propio: el acento del ambiente o, con imagen, el del botón «Ver la campaña». `null` = el de la paleta o el de fábrica. */
  acento: string | null;
  /** El movimiento: con el ambiente nacen su efecto y su franja de fábrica; lo demás nace de siempre. El líder los cambia a gusto. */
  franja: FranjaCampana;
  entrada: EntradaCampana;
  efecto: EfectoCampana;
  intensidad: IntensidadCampana;
  duracion: DuracionCampana;
  cuenta: CuentaCampana;
  /** Los tres textos cortos de la portada, TAL COMO se escriben (con su espacio al final mientras se teclea); vacío = sin texto (sale el nombre de la
   *  campaña, sin bajada y con «Ver la campaña»). Al guardar se limpian (`limpiarTextoDeCampana`). */
  titular: string;
  bajada: string;
  boton: string;
  /** Dónde se ve: qué piezas de la tienda viste el diseño. */
  donde: Donde;
};

export const BORRADOR_VACIO: BorradorDiseno = {
  modo: "ambiente", plantilla: null, imagen: null, imagenVertical: null, paleta: 0, acento: null,
  franja: "rota", entrada: "telon", efecto: "ninguno", intensidad: "poca", duracion: "una", cuenta: "siempre",
  titular: "", bajada: "", boton: "",
  donde: DONDE_TODO,
};

/** Los topes de las tres cajas de texto. */
export const TOPES_TEXTO = { titular: TOPE_TITULAR_CAMPANA, bajada: TOPE_BAJADA_CAMPANA, boton: TOPE_BOTON_CAMPANA } as const;
export type LlaveDeTexto = keyof typeof TOPES_TEXTO;

const esAmbiente = (v: string | null): v is AmbienteCampana => AMBIENTES_CAMPANA.some((a) => a.clave === v);

/** El borrador con que abre el editor: lo guardado, o vacío si la campaña aún no tiene diseño. Un diseño de un ambiente que el catálogo ya no conoce
 *  abre vacío (hay que volver a elegir). */
export function borradorDe(ficha: Pick<FichaCampana, "diseno">): BorradorDiseno {
  const d = ficha.diseno;
  if (!d) return { ...BORRADOR_VACIO, donde: { ...DONDE_TODO } };
  const comun = {
    paleta: d.paleta, acento: d.acento,
    franja: d.franja, entrada: d.entrada, efecto: d.efecto, intensidad: d.intensidad, duracion: d.duracion, cuenta: d.cuenta,
    titular: d.titular ?? "", bajada: d.bajada ?? "", boton: d.boton ?? "",
    donde: { ...d.donde },
    imagen: d.imagenRuta, imagenVertical: d.imagenVerticalRuta,
  };
  if (d.modo === "imagen") return { ...comun, modo: "imagen", plantilla: null };
  if (!esAmbiente(d.plantilla)) return { ...BORRADOR_VACIO, donde: { ...DONDE_TODO } };
  return { ...comun, modo: "ambiente", plantilla: d.plantilla };
}

/** ¿El borrador ya tiene un diseño que se pueda guardar? Un ambiente elegido (modo ambiente) o una imagen subida (modo imagen). */
export const hayDiseno = (b: Pick<BorradorDiseno, "modo" | "plantilla" | "imagen">): boolean => (b.modo === "imagen" ? b.imagen !== null : b.plantilla !== null);

/** El movimiento con que nace una campaña con imagen: la franja quieta, el telón, sin efecto y la cuenta siempre (el efecto es opcional). */
const MOVIMIENTO_CON_IMAGEN = { franja: "quieta", entrada: "telon", efecto: "ninguno", intensidad: "poca", duracion: "una", cuenta: "siempre" } as const;

/** El movimiento de fábrica del modo y el ambiente en que está el borrador (para saber si el líder ya lo cambió). */
export function movimientoDeFabrica(b: Pick<BorradorDiseno, "modo" | "plantilla">): Pick<BorradorDiseno, "franja" | "entrada" | "efecto" | "intensidad" | "duracion" | "cuenta"> {
  if (b.modo === "imagen") return MOVIMIENTO_CON_IMAGEN;
  const a = ambienteDeCampana(b.plantilla);
  return { franja: a?.franja ?? "rota", entrada: "telon", efecto: a?.efecto ?? "ninguno", intensidad: "poca", duracion: "una", cuenta: "siempre" };
}

/** Pasar de un modo al otro. A la imagen propia: nace con su movimiento de fábrica y sin color propio (el del ambiente era para otro fondo); a un ambiente
 *  ya elegido: vuelve con el movimiento de ese ambiente. Lo escrito, las imágenes ya subidas y «dónde se ve» se conservan: no se pierden al ir y volver. */
export function conModo(b: BorradorDiseno, modo: ModoDiseno): BorradorDiseno {
  if (b.modo === modo) return b;
  if (modo === "imagen") return { ...b, modo, acento: null, ...MOVIMIENTO_CON_IMAGEN };
  const a = ambienteDeCampana(b.plantilla);
  return { ...b, modo, acento: null, paleta: 0, franja: a?.franja ?? "rota", entrada: "telon", efecto: a?.efecto ?? "ninguno", intensidad: "poca", duracion: "una", cuenta: "siempre" };
}

/** La imagen horizontal (o vertical) recién subida. La horizontal es la del computador y la que manda; la vertical, para el celular, es opcional. */
export const conImagen = (b: BorradorDiseno, ruta: string | null): BorradorDiseno => ({ ...b, imagen: ruta, imagenVertical: ruta === null ? null : b.imagenVertical });
export const conImagenVertical = (b: BorradorDiseno, ruta: string | null): BorradorDiseno => ({ ...b, imagenVertical: ruta });

/** Elegir un ambiente: nace con su primera paleta y su movimiento de fábrica (su efecto, su franja y lo demás de siempre), sin color propio (el que
 *  había era para otro fondo). Lo que ya se escribió y lo que ya se eligió de «dónde se ve» se conserva: no depende del ambiente. */
export function conAmbiente(b: BorradorDiseno, clave: AmbienteCampana): BorradorDiseno {
  if (b.plantilla === clave && b.modo === "ambiente") return b;
  const a = ambienteDeCampana(clave)!;
  return {
    ...BORRADOR_VACIO, modo: "ambiente", plantilla: clave, efecto: a.efecto, franja: a.franja, donde: b.donde, titular: b.titular, bajada: b.bajada, boton: b.boton,
    imagen: b.imagen, imagenVertical: b.imagenVertical,
  };
}

/** Cambiar una pieza del movimiento (la franja, la entrada, el efecto…). */
export const conMovimiento = <K extends "franja" | "entrada" | "efecto" | "intensidad" | "duracion" | "cuenta">(b: BorradorDiseno, llave: K, valor: BorradorDiseno[K]): BorradorDiseno => ({ ...b, [llave]: valor });

/** Escribir uno de los textos (se guarda como se escribe: la limpieza es de `parcheDeCambios`). */
export const conTexto = (b: BorradorDiseno, llave: LlaveDeTexto, texto: string): BorradorDiseno => ({ ...b, [llave]: texto.slice(0, TOPES_TEXTO[llave] + 20) });

/** Encender o apagar una pieza de «dónde se ve». */
export const conDonde = (b: BorradorDiseno, pieza: PiezaDonde, encendida: boolean): BorradorDiseno => ({ ...b, donde: { ...b.donde, [pieza]: encendida } });

/** ¿Alguna pieza de la tienda queda vestida? */
export const hayDonde = (b: Pick<BorradorDiseno, "donde">): boolean => PIEZAS_DONDE.some((k) => b.donde[k]);

export const conPaleta = (b: BorradorDiseno, paleta: number): BorradorDiseno => ({ ...b, paleta, acento: null });
export const conAcento = (b: BorradorDiseno, acento: string | null): BorradorDiseno => ({ ...b, acento: acento ? acento.toLowerCase() : null });

/** Los colores con que se ve el borrador: los de su paleta (y el acento propio) o, con imagen, el color del botón sobre el grafito de siempre. `null`
 *  si todavía no hay ambiente ni imagen. */
export const coloresDelBorrador = (b: BorradorDiseno): ColoresDeCampana | null =>
  b.modo === "imagen" ? (b.imagen !== null ? coloresDeImagenDeCampana(b.acento) : null) : coloresDeCampana(b.plantilla, b.paleta, b.acento);

export function lecturaDelBorrador(b: BorradorDiseno): { ok: boolean; items: ComprobacionDeLectura[] } {
  const c = coloresDelBorrador(b);
  if (!c) return { ok: false, items: [] };
  return b.modo === "imagen" ? comprobarLecturaDeImagen(c) : comprobarLectura(c);
}

// ---------------------------------------------------------------- Qué cambió → el parche

/** Lo que cambió entre lo guardado y lo que hay en pantalla, como el parche de `guardar_campana_diseno`; `null` si nada cambió o aún no hay un diseño
 *  (ni ambiente ni imagen). `guardado` es `null` si la campaña no tenía diseño: entonces se manda lo mínimo para crearlo más todo lo que se eligió. */
export function parcheDeCambios(guardado: BorradorDiseno | null, ahora: BorradorDiseno): Record<string, unknown> | null {
  if (!hayDiseno(ahora)) return null;
  const parche: Record<string, unknown> = {};
  const crea = !guardado;
  const antes = guardado ?? BORRADOR_VACIO;
  const conImagen = ahora.modo === "imagen";
  if (crea || ahora.modo !== antes.modo) parche.modo = ahora.modo;
  // La base exige: ambiente ⇔ plantilla, e imagen ⇒ plantilla nula y su imagen. Al pasar a imagen se deja la plantilla en null; al volver, va la de siempre.
  if (conImagen) {
    if (!crea && antes.modo === "ambiente" && antes.plantilla !== null) parche.plantilla = null;
    if (crea || ahora.imagen !== antes.imagen) parche.imagen_ruta = ahora.imagen;
    if (crea ? ahora.imagenVertical !== null : ahora.imagenVertical !== antes.imagenVertical) parche.imagen_vertical_ruta = ahora.imagenVertical;
  } else if (crea || ahora.plantilla !== antes.plantilla || antes.modo !== "ambiente") parche.plantilla = ahora.plantilla;
  for (const k of ["paleta", "acento", "franja", "entrada", "efecto", "intensidad", "duracion", "cuenta"] as const) {
    if (crea || ahora[k] !== antes[k]) parche[k] = ahora[k];
  }
  // Los textos son del ambiente; con imagen no se editan. Se comparan YA limpios: escribir un espacio al final no es un cambio, y vaciar la caja es «sin
  // texto» (null).
  if (!conImagen) {
    for (const k of ["titular", "bajada", "boton"] as const) {
      const nuevo = limpiarTextoDeCampana(ahora[k], TOPES_TEXTO[k]);
      const viejo = crea ? null : limpiarTextoDeCampana(antes[k], TOPES_TEXTO[k]);
      if (nuevo !== viejo) parche[k] = nuevo;
    }
  }
  for (const k of PIEZAS_DONDE) if (crea ? ahora.donde[k] !== BORRADOR_VACIO.donde[k] : ahora.donde[k] !== antes.donde[k]) parche[`donde_${k}`] = ahora.donde[k];
  return Object.keys(parche).length ? parche : null;
}

// ---------------------------------------------------------------- Qué falta

export type PasoDelEditor = "ambiente" | "colores" | "movimiento" | "donde";

/** Lo que le falta al diseño para poder programarse, en el orden de las pantallas: elegir un ambiente (o subir la imagen), que sus letras se lean y
 *  que se vea en alguna pieza de la tienda. */
export function faltanDelDiseno(b: BorradorDiseno): { paso: PasoDelEditor; texto: string }[] {
  if (!hayDiseno(b)) return [{ paso: "ambiente", texto: b.modo === "imagen" ? "subir la imagen" : "elegir un ambiente" }];
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
  campana_diseno_incompleto: { titulo: "Falta una pieza de la tienda", detalle: "Enciende al menos una en «Dónde se ve»: si no, programarlo no cambiaría nada." },
  campana_sin_diseno: { titulo: "Esta campaña todavía no tiene diseño", detalle: "Guárdalo primero como borrador." },
  campana_previa_demasiadas: { titulo: "Ya hay 20 enlaces de vista previa vivos", detalle: "Espera a que venzan los anteriores (duran 7 días)." },
};

/** El error de la base (su código está en el mensaje y la frase en `hint`) en un título y un detalle; `null` si no es de las campañas. */
export function errorDeCampanas(mensaje: string): { titulo: string; detalle?: string } | null {
  for (const [codigo, e] of Object.entries(ERRORES)) {
    if (mensaje.includes(codigo)) return e;
  }
  return null;
}

// ---------------------------------------------------------------- Programar, volver a borrador y la vista previa privada

export type AccionesDelDiseno = {
  /** Se puede pasar a «programado»: guardado, sin cambios sueltos, que se lea y que se vea en alguna pieza. */
  programar: boolean;
  /** Si no se puede programar, por qué, en palabras de tienda (`null` si se puede o si ya está programado). */
  porQueNoProgramar: string | null;
  /** Se puede volver a borrador (está programado y la campaña no terminó). */
  aBorrador: boolean;
  /** Se puede crear un enlace de vista previa privada (hay un diseño guardado y la campaña no terminó). */
  vistaPrevia: boolean;
};

/** Qué se puede hacer con el diseño en este momento. Lo que decide la base (versión, módulo, campaña que terminó) se vuelve a comprobar allá: esto solo
 *  evita ofrecer un botón que va a fallar. `guardado` es el borrador tal como está en la base (`null` si la campaña aún no tiene diseño). */
export function accionesDelDiseno({
  terminada,
  estado,
  guardado,
  ahora,
}: {
  terminada: boolean;
  estado: EstadoDiseno | null;
  guardado: BorradorDiseno | null;
  ahora: BorradorDiseno;
}): AccionesDelDiseno {
  const hayGuardado = guardado !== null && estado !== null;
  const sinCambios = parcheDeCambios(guardado, ahora) === null;
  const faltan = faltanDelDiseno(ahora);
  let porQue: string | null = null;
  if (terminada) porQue = "La campaña ya terminó.";
  else if (!hayGuardado) porQue = "Guarda el borrador primero.";
  else if (!sinCambios) porQue = "Guarda tus cambios antes de programar.";
  else if (faltan.length > 0) porQue = `Falta: ${faltan.map((f) => f.texto).join(", ")}.`;
  const programar = estado === "borrador" && porQue === null;
  return {
    programar,
    porQueNoProgramar: estado === "programado" ? null : porQue,
    aBorrador: !terminada && estado === "programado",
    vistaPrevia: !terminada && hayGuardado,
  };
}

/** La dirección de la vista previa privada: la tienda online y la llave (que viaja una sola vez, al crearla). Sin dirección de la tienda, `null`. */
export function enlaceDeVistaPrevia(tienda: string | null | undefined, llave: string): string | null {
  if (!tienda || !/^[0-9a-f]{48}$/.test(llave)) return null;
  try {
    const origen = new URL(tienda);
    if (origen.protocol !== "https:" && origen.protocol !== "http:") return null;
    return `${origen.origin}/vista-previa/${llave}`;
  } catch {
    return null;
  }
}

/** «hasta el 28 oct» de la fecha y hora en que vence el enlace (la hora de Lima). */
export function vencimientoDicho(expiraEn: string): string | null {
  const t = Date.parse(expiraEn);
  if (Number.isNaN(t)) return null;
  const lima = new Date(t - 5 * 3600 * 1000).toISOString().slice(0, 10);
  return `hasta el ${fechaCortaDicha(lima)}`;
}

/** Lo que se estaba intentando cuando algo falló. */
export type AccionDelEditor = "guardar" | "programar" | "aBorrador";

const TITULO_DE_FALLO: Record<AccionDelEditor, string> = {
  guardar: "No se pudo guardar el diseño",
  programar: "No se pudo programar el diseño",
  aBorrador: "No se pudo pasar el diseño a borrador",
};

/** El título del aviso cuando una acción falla. Si la respuesta no llegó (`incierta`: la base pudo haber guardado igual), no afirma que falló y pide
 *  rehacer la pantalla con lo que quedó en la base, para que no se vea un estado viejo ni se reintente con una versión de antes. */
export function avisoDeFallo(accion: AccionDelEditor, incierta: boolean): { titulo: string; rehacerPantalla: boolean } {
  return incierta ? { titulo: "No pudimos confirmar el cambio", rehacerPantalla: true } : { titulo: TITULO_DE_FALLO[accion], rehacerPantalla: false };
}
