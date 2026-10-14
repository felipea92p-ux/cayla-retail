// Catálogo ▸ Vitrina web (ADR-0408, actividad 3): qué modelos se ven en la tienda online y a qué precio. Lógica pura: se importa
// desde el servidor y desde el cliente, y se prueba con `vitrina-reglas.test.ts`.
//
// CONTRATO
//   PROMETE: leer lo que devuelve `retail.fn_vitrina_modelos()` (y cada modelo que devuelve `vitrina_guardar_modelo`) sin caerse
//            ante un dato raro; las cifras y los filtros de la pantalla; el precio con campaña con la MISMA cuenta de la caja
//            (`descuentoUnitarioPorPorcentaje`, ADR-0403); el precio nuevo de un lote; y los errores de la base en palabras de tienda.
//   ASUME:   que la base es la que decide (precio válido, bajo el costo, versión): aquí solo se adelanta para no mandar algo que va a
//            volver rechazado. El costo llega solo para el líder (`costo: null` para los demás).
//   NO HACE: leer la base ni decidir permisos.

import { normalizarBusqueda } from "./combo-reglas";
import { leerMonto } from "./precio-sede-reglas";
import { nombreCortoSede } from "./stock-por-sede";
import { descuentoUnitarioPorPorcentaje } from "./vender-reglas";

export type EnLoNuevo = "automatico" | "fijo" | "quitado";
export type ColorVitrina = { codigo: string; nombre: string; hex: string | null; foto: string | null };
export type StockTienda = { ubicacionId: string; cantidad: number };
/** La campaña de mayor descuento que toca alguna talla activa hoy; `todas`: si toca todas sus tallas. */
export type CampanaVitrina = { nombre: string; pct: number; todas: boolean };
export type EstadoVitrina = {
  publicado: boolean;
  precioWeb: number;
  enLoNuevo: EnLoNuevo;
  descripcionWeb: string | null;
  version: number;
  actualizadoEn: string | null;
  actualizadoPor: string | null;
};
export type ModeloVitrina = {
  id: string;
  codigo: string | null;
  nombre: string;
  descripcion: string | null;
  categoria: string | null;
  prefijo: string | null;
  familia: string | null;
  /** Activo, no de prueba y con tallas activas: si no, aunque esté encendido no se ve en la web. */
  publicable: boolean;
  /** El precio de tienda (el mayor de sus tallas activas) y el menor, si cambia según la talla. */
  precioTienda: number | null;
  precioTiendaMin: number | null;
  /** Solo para el líder (la base no se lo manda a nadie más). */
  costo: number | null;
  foto: string | null;
  colores: ColorVitrina[];
  tallas: number;
  stock: StockTienda[];
  campana: CampanaVitrina | null;
  /** `null`: nunca estuvo en la vitrina. */
  vitrina: EstadoVitrina | null;
};
export type TiendaVitrina = { id: string; nombre: string };
export type LecturaVitrina = { veCostos: boolean; tiendas: TiendaVitrina[]; modelos: ModeloVitrina[] };

/** El tope del precio web y de la descripción: los mismos de la base (`vitrina_productos`). */
export const PRECIO_WEB_MAXIMO = 99999.99;
export const MAX_DESCRIPCION_WEB = 600;

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const numero = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? n : null;
};
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const esEnLoNuevo = (v: unknown): v is EnLoNuevo => v === "automatico" || v === "fijo" || v === "quitado";

function estadoDeJson(v: unknown): EstadoVitrina | null {
  if (!esObjeto(v)) return null;
  const precioWeb = numero(v.precio_web);
  const version = numero(v.version);
  if (precioWeb === null || version === null) return null;
  return {
    publicado: v.publicado === true,
    precioWeb,
    enLoNuevo: esEnLoNuevo(v.en_lo_nuevo) ? v.en_lo_nuevo : "automatico",
    descripcionWeb: texto(v.descripcion_web),
    version,
    actualizadoEn: texto(v.actualizado_en),
    actualizadoPor: texto(v.actualizado_por),
  };
}

/** Un modelo como lo manda la base, o `null` si no trae ni su id ni su nombre (no se dibuja a medias). */
export function modeloDeJson(v: unknown): ModeloVitrina | null {
  if (!esObjeto(v)) return null;
  const id = texto(v.id);
  const nombre = texto(v.nombre);
  if (!id || !nombre) return null;
  const campana = esObjeto(v.campana) && texto(v.campana.nombre) && numero(v.campana.pct) !== null
    ? { nombre: texto(v.campana.nombre)!, pct: numero(v.campana.pct)!, todas: v.campana.todas === true }
    : null;
  return {
    id,
    codigo: texto(v.codigo),
    nombre,
    descripcion: texto(v.descripcion),
    categoria: texto(v.categoria),
    prefijo: texto(v.prefijo),
    familia: texto(v.familia),
    publicable: v.publicable === true,
    precioTienda: numero(v.precio_tienda),
    precioTiendaMin: numero(v.precio_tienda_min),
    costo: numero(v.costo),
    foto: texto(v.foto),
    colores: lista(v.colores)
      .filter(esObjeto)
      .flatMap((c) => (texto(c.codigo) && texto(c.nombre) ? [{ codigo: texto(c.codigo)!, nombre: texto(c.nombre)!, hex: texto(c.hex), foto: texto(c.foto) }] : [])),
    tallas: numero(v.tallas) ?? 0,
    stock: lista(v.stock)
      .filter(esObjeto)
      .flatMap((s) => (texto(s.ubicacion_id) ? [{ ubicacionId: texto(s.ubicacion_id)!, cantidad: numero(s.cantidad) ?? 0 }] : [])),
    campana,
    vitrina: estadoDeJson(v.vitrina),
  };
}

/** Lo que devuelve `fn_vitrina_modelos()`. Un dato raro deja la lista vacía, nunca la pantalla caída. */
export function leerVitrina(v: unknown): LecturaVitrina {
  if (!esObjeto(v)) return { veCostos: false, tiendas: [], modelos: [] };
  return {
    veCostos: v.ve_costos === true,
    tiendas: lista(v.tiendas)
      .filter(esObjeto)
      .flatMap((t) => (texto(t.id) && texto(t.nombre) ? [{ id: texto(t.id)!, nombre: texto(t.nombre)! }] : [])),
    modelos: lista(v.modelos).flatMap((m) => {
      const leido = modeloDeJson(m);
      return leido ? [leido] : [];
    }),
  };
}

/* ---------------- Lo que dice cada fila ---------------- */

/** Se ve en la web: encendido y vendible (uno descontinuado después de encenderse ya no se ve). */
export const seVeEnLaWeb = (m: ModeloVitrina): boolean => Boolean(m.vitrina?.publicado) && m.publicable;

/** Lo libre (sin lo apartado) en todas las tiendas. */
export const libreEnTiendas = (m: ModeloVitrina): number => m.stock.reduce((a, s) => a + Math.max(0, s.cantidad), 0);

/** El precio web de hoy, o el que tendría al encenderlo: el de tienda (el precio web nace al encenderlo; la maqueta no dice con
 *  cuánto arranca, así que arranca igual al de tienda y se cambia en la hoja). */
export const precioWebDe = (m: ModeloVitrina): number | null => m.vitrina?.precioWeb ?? m.precioTienda;

/** Lo que paga el cliente con una campaña de `pct` %: la misma cuenta de la caja (el precio baja al múltiplo de S/ 0.10 de abajo). */
export function precioConCampana(precio: number, pct: number | null | undefined): number {
  if (!pct) return precio;
  return Math.round((precio - descuentoUnitarioPorPorcentaje(precio, pct)) * 100) / 100;
}

/** El margen sin IGV de vender a `precio` algo que cuesta `costo` (0,55 = 55 %). Sin costo conocido, `null`. */
export function margenSinIgv(precio: number, costo: number | null): number | null {
  if (costo === null || costo <= 0 || precio <= 0) return null;
  const neto = precio / 1.18;
  return (neto - costo) / neto;
}

/** El margen bajo el cual la hoja avisa (no bloquea): el de la maqueta. */
export const MARGEN_BAJO = 0.25;

/** «igual», «S/ 5.00 menos (−6 %)», «S/ 3.00 más (+4 %)»: el precio web contra el de tienda. */
export function frenteATienda(web: number, tienda: number | null): string | null {
  if (tienda === null || tienda <= 0) return null;
  const dif = Math.round((web - tienda) * 100) / 100;
  if (Math.abs(dif) < 0.005) return "igual";
  const pct = Math.round((dif / tienda) * 100);
  return `S/ ${Math.abs(dif).toFixed(2)} ${dif < 0 ? "menos" : "más"} (${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct)} %)`;
}

/** Lo mismo, corto, para la fila de la lista: «igual», «−S/ 5.00», «+S/ 3.00» (la maqueta). */
export function diferenciaCorta(web: number, tienda: number | null): string | null {
  if (tienda === null || tienda <= 0) return null;
  const dif = Math.round((web - tienda) * 100) / 100;
  if (Math.abs(dif) < 0.005) return "igual";
  return `${dif < 0 ? "−" : "+"}S/ ${Math.abs(dif).toFixed(2)}`;
}

/** «Trujillo 12 · Lima 0»: lo libre de cada tienda, en el orden en que llegan. */
export function stockEnTiendas(m: ModeloVitrina, tiendas: readonly TiendaVitrina[]): { sede: string; cantidad: number }[] {
  const porId = new Map(m.stock.map((s) => [s.ubicacionId, s.cantidad]));
  return tiendas.map((t) => ({ sede: nombreCortoSede(t.nombre), cantidad: Math.max(0, porId.get(t.id) ?? 0) }));
}

/** Los colores sin foto propia: en la web se ven con la foto principal (propuesta c de la maqueta). */
export const coloresSinFoto = (m: ModeloVitrina): number => m.colores.filter((c) => !c.foto).length;

/** Qué hace «Lo nuevo» con este modelo, en una frase para la hoja. */
export function textoLoNuevo(modo: EnLoNuevo): string {
  if (modo === "fijo") return "Fijado a mano: sale en Lo nuevo hasta que lo quites.";
  if (modo === "quitado") return "Lo quitaste de Lo nuevo: no sale ahí aunque haya llegado hace poco.";
  return "Automático: sale en Lo nuevo los primeros 30 días después de llegar a una tienda.";
}

/* ---------------- Cifras y filtros ---------------- */

export type CifrasVitrina = { seVen: number; total: number; sinStock: number };

export function cifrasDe(modelos: readonly ModeloVitrina[]): CifrasVitrina {
  const visibles = modelos.filter(seVeEnLaWeb);
  return { seVen: visibles.length, total: modelos.length, sinStock: visibles.filter((m) => libreEnTiendas(m) === 0).length };
}

export type FiltroVitrina = "todos" | "en_la_web" | "sin_stock";

export function filtrarVitrina(modelos: readonly ModeloVitrina[], filtro: FiltroVitrina, busqueda: string): ModeloVitrina[] {
  const q = normalizarBusqueda(busqueda.trim());
  return modelos.filter((m) => {
    if (filtro === "en_la_web" && !seVeEnLaWeb(m)) return false;
    if (filtro === "sin_stock" && !(seVeEnLaWeb(m) && libreEnTiendas(m) === 0)) return false;
    if (!q) return true;
    return normalizarBusqueda(`${m.nombre} ${m.codigo ?? ""} ${m.categoria ?? ""}`).includes(q);
  });
}

/* ---------------- La hoja de un modelo ---------------- */

/** El precio web como lo escribe una persona («74.90», «74,90», «S/ 74.90»), o `null` si no se puede guardar. */
export function precioWebDeTexto(t: string): number | null {
  const n = leerMonto(t);
  return n !== null && n <= PRECIO_WEB_MAXIMO ? n : null;
}

/** Qué le falta al precio web para poder guardarse, en una frase (`null` si está bien). Lo bajo el costo solo se adelanta si la
 *  pantalla conoce el costo (el líder); si no, lo dice la base al guardar. */
export function problemaDePrecioWeb(t: string, costo: number | null): string | null {
  if (t.trim() === "") return "Escribe el precio web.";
  const n = precioWebDeTexto(t);
  if (n === null) return "Escribe un precio mayor que cero, con hasta dos decimales.";
  if (costo !== null && n < costo) return "Ese precio queda por debajo de lo que cuesta la prenda.";
  return null;
}

/** La descripción que se manda: limpia y vacía si es la misma del catálogo (así sigue a la ficha si la ficha cambia). */
export function descripcionParaGuardar(escrita: string, delCatalogo: string | null): string | null {
  const limpia = escrita.replace(/\s+/g, " ").trim();
  if (!limpia) return null;
  return limpia === (delCatalogo ?? "").replace(/\s+/g, " ").trim() ? null : limpia;
}

/* ---------------- El lote ---------------- */

export type DireccionLote = "bajar" | "subir";
export type UnidadLote = "soles" | "pct";

/** El precio nuevo de un modelo en el lote, al céntimo; `null` si queda en cero, negativo o pasa el tope (la fila lo dice). */
export function nuevoPrecioLote(actual: number, direccion: DireccionLote, unidad: UnidadLote, valor: number): number | null {
  if (!Number.isFinite(valor) || valor <= 0) return null;
  const cuanto = unidad === "pct" ? (actual * valor) / 100 : valor;
  const nuevo = Math.round((direccion === "subir" ? actual + cuanto : actual - cuanto) * 100) / 100;
  return nuevo > 0 && nuevo <= PRECIO_WEB_MAXIMO ? nuevo : null;
}

/** «Cuánto» del lote: un monto o un porcentaje positivo (el % de bajar, menos de 100). */
export function valorDeLote(t: string, direccion: DireccionLote, unidad: UnidadLote): number | null {
  const limpio = t.replace(/%/g, "").trim().replace(",", ".");
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(limpio)) return null;
  const n = Number(limpio);
  if (n <= 0) return null;
  if (unidad === "pct" && direccion === "bajar" && n >= 100) return null;
  return n;
}

/* ---------------- Lo que dice la base ---------------- */

/** Los rechazos de la vitrina en palabras de tienda; `releer`: la pantalla está vieja y conviene recargar. `null` si no es de aquí. */
export function errorDeVitrina(mensaje: string): { titulo: string; detalle?: string; releer?: boolean } | null {
  const detalle = mensaje.replace(/^[\s\S]*?vitrina_[a-z_]+\s*/, "").trim() || undefined;
  if (/vitrina_web_sin_modulo/.test(mensaje)) return { titulo: "Tu rol no tiene la Vitrina web", detalle: "Pídele al líder que la active en Roles y accesos." };
  if (/vitrina_precio_bajo_costo/.test(mensaje)) return { titulo: "Ese precio queda bajo el costo", detalle };
  if (/vitrina_precio_invalido/.test(mensaje)) return { titulo: "Revisa el precio web", detalle };
  if (/vitrina_cambio_otro/.test(mensaje)) return { titulo: "Otra persona lo cambió", detalle, releer: true };
  if (/vitrina_no_publicable/.test(mensaje)) return { titulo: "No se puede mostrar en la web", detalle };
  if (/vitrina_sin_precio/.test(mensaje)) return { titulo: "Falta su precio", detalle };
  if (/vitrina_no_existe/.test(mensaje)) return { titulo: "Ese modelo ya no existe", detalle, releer: true };
  if (/vitrina_datos_invalidos/.test(mensaje)) return { titulo: "Revisa los datos", detalle };
  return null;
}
