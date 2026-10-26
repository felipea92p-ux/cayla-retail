// Tienda web ▸ Vitrina (ADR-0408, actividad 3): qué modelos se ven en la tienda online y cómo entran a «Lo nuevo». Lógica pura:
// se importa desde el servidor y desde el cliente, y se prueba con `vitrina-reglas.test.ts`.
//
// No hay precio web (Felipe, 2026-10-14): en la web cada modelo vale lo que vale en la tienda elegida (`fn_precio_en_sede`) y, con
// «Todas», lo más que vale entre las tiendas de la web. Por eso aquí no hay precio, ni costo, ni margen: se cambian en la ficha.
//
// CONTRATO
//   PROMETE: leer lo que devuelve `retail.fn_vitrina_modelos()` (y cada modelo que devuelve `vitrina_guardar_modelo`) sin caerse
//            ante un dato raro; las cifras y los filtros de la pantalla; y los errores de la base en palabras de tienda.
//   ASUME:   que la base es la que decide (si se puede mostrar, la versión): aquí solo se adelanta para no mandar algo que va a
//            volver rechazado.
//   NO HACE: leer la base ni decidir permisos.

import { normalizarBusqueda } from "./combo-reglas";
import { nombreCortoSede } from "./stock-por-sede";

export type EnLoNuevo = "automatico" | "fijo" | "quitado";
/** Por qué un modelo NO se puede mostrar en la web (`fn_vitrina_por_que_no`, 20261015122000): `empaque` (de una familia fuera de los
 *  motores —bolsas, cajas—: se vende desde el ticket, en la caja; «Solo ropa en la web», Felipe 2026-10-15), `sin_precio` (ninguna
 *  tienda que se ve en la web la ofrece: sin precio en su ficha ni el propio de una de esas tiendas; el precio de la prenda es siempre
 *  el de la tienda, Felipe 2026-10-15) o `no_se_vende` (descontinuado, de prueba o sin tallas activas). */
export type PorQueNoSeMuestra = "empaque" | "sin_precio" | "no_se_vende";
export type ColorVitrina = { codigo: string; nombre: string; hex: string | null; foto: string | null };
export type StockTienda = { ubicacionId: string; cantidad: number };
export type EstadoVitrina = {
  publicado: boolean;
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
  /** Activo, no de prueba, ropa (no empaque) y con precio en alguna tienda que se ve en la web (el de su ficha o el propio de esa
   *  tienda): si no, aunque esté encendido no se ve en la web. */
  publicable: boolean;
  /** Por qué no se puede mostrar (`null` si se puede, o si la base todavía no lo dice: entonces vale la razón de siempre). */
  porQueNo: PorQueNoSeMuestra | null;
  foto: string | null;
  colores: ColorVitrina[];
  tallas: number;
  stock: StockTienda[];
  /** `null`: nunca estuvo en la vitrina. */
  vitrina: EstadoVitrina | null;
};
export type TiendaVitrina = { id: string; nombre: string };
export type LecturaVitrina = { tiendas: TiendaVitrina[]; modelos: ModeloVitrina[] };

/** El tope de la descripción: el mismo de la base (`vitrina_productos`). */
export const MAX_DESCRIPCION_WEB = 600;

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const numero = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? n : null;
};
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const esEnLoNuevo = (v: unknown): v is EnLoNuevo => v === "automatico" || v === "fijo" || v === "quitado";
const esPorQueNo = (v: unknown): v is PorQueNoSeMuestra => v === "empaque" || v === "sin_precio" || v === "no_se_vende";

function estadoDeJson(v: unknown): EstadoVitrina | null {
  if (!esObjeto(v)) return null;
  const version = numero(v.version);
  if (version === null) return null;
  return {
    publicado: v.publicado === true,
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
  return {
    id,
    codigo: texto(v.codigo),
    nombre,
    descripcion: texto(v.descripcion),
    categoria: texto(v.categoria),
    prefijo: texto(v.prefijo),
    familia: texto(v.familia),
    publicable: v.publicable === true,
    // Un modelo que se puede mostrar no tiene porqué, diga lo que diga el dato.
    porQueNo: v.publicable !== true && esPorQueNo(v.por_que_no) ? v.por_que_no : null,
    foto: texto(v.foto),
    colores: lista(v.colores)
      .filter(esObjeto)
      .flatMap((c) => (texto(c.codigo) && texto(c.nombre) ? [{ codigo: texto(c.codigo)!, nombre: texto(c.nombre)!, hex: texto(c.hex), foto: texto(c.foto) }] : [])),
    tallas: numero(v.tallas) ?? 0,
    stock: lista(v.stock)
      .filter(esObjeto)
      .flatMap((s) => (texto(s.ubicacion_id) ? [{ ubicacionId: texto(s.ubicacion_id)!, cantidad: numero(s.cantidad) ?? 0 }] : [])),
    vitrina: estadoDeJson(v.vitrina),
  };
}

/** Lo que devuelve `fn_vitrina_modelos()`. Un dato raro deja la lista vacía, nunca la pantalla caída. */
export function leerVitrina(v: unknown): LecturaVitrina {
  if (!esObjeto(v)) return { tiendas: [], modelos: [] };
  return {
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

/** Es empaque (bolsas, cajas: una familia fuera de los motores): se vende en la caja y no va en la web, nunca. Su interruptor queda
 *  apagado aunque hubiera quedado encendido antes de la regla (Felipe 2026-10-15). */
export const esEmpaque = (m: ModeloVitrina): boolean => m.porQueNo === "empaque";

/** El interruptor de la fila: encendido si está publicado, salvo el empaque, que no va en la web (apagado y quieto). */
export const interruptorEncendido = (m: ModeloVitrina): boolean => Boolean(m.vitrina?.publicado) && !esEmpaque(m);

/** Por qué un modelo no se puede mostrar, como lo dice la pantalla: la insignia de la fila (y su tono) y la frase de la hoja. `null` si
 *  se puede mostrar. El empaque no es un problema que arreglar (se vende en la caja): tono neutro; lo demás sí: ámbar. */
export function razonNoSeMuestra(m: ModeloVitrina): { chip: string; tono: "neutro" | "ambar"; frase: string } | null {
  if (m.publicable) return null;
  if (esEmpaque(m)) {
    return { chip: "Solo en la caja", tono: "neutro", frase: "No va en la web: no es ropa (es empaque, como las bolsas). Se vende desde el ticket, en la caja." };
  }
  // Sin precio en ninguna tienda que se ve en la web (el precio de la prenda es siempre el de la tienda, Felipe 2026-10-15): la web no
  // tiene a cuánto ofrecerla. Se arregla en su ficha, no aquí.
  if (m.porQueNo === "sin_precio") {
    return {
      chip: m.vitrina?.publicado ? "Sin precio: no se ve" : "Sin precio",
      tono: "ambar",
      frase:
        "No se puede mostrar: no tiene precio en ninguna tienda que se ve en la web. Ponle precio en su ficha, en Catálogo ▸ Productos: el de la prenda o el de una de esas tiendas.",
    };
  }
  return {
    chip: m.vitrina?.publicado ? "Ya no se vende: no se ve" : "No se puede vender",
    tono: "ambar",
    // Sin el porqué (una base anterior a 20261015122000), la razón de siempre, que también nombra el precio.
    frase:
      m.porQueNo === "no_se_vende"
        ? "No se puede mostrar: está descontinuado, es de prueba o no tiene tallas activas."
        : "No se puede mostrar: está descontinuado, es de prueba o no tiene tallas activas con precio.",
  };
}

/** Lo libre (sin lo apartado) en todas las tiendas. */
export const libreEnTiendas = (m: ModeloVitrina): number => m.stock.reduce((a, s) => a + Math.max(0, s.cantidad), 0);

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

/** `total` son los modelos de ropa: el empaque no se muestra en la web ni cuenta en «de N modelos». */
export type CifrasVitrina = { seVen: number; total: number; sinStock: number };

export function cifrasDe(modelos: readonly ModeloVitrina[]): CifrasVitrina {
  const visibles = modelos.filter(seVeEnLaWeb);
  return { seVen: visibles.length, total: modelos.filter((m) => !esEmpaque(m)).length, sinStock: visibles.filter((m) => libreEnTiendas(m) === 0).length };
}

/** Los estados por los que se filtra la lista. Los dos primeros son las cifras de arriba; `sin_precio` y `ocultos` son lo que el Resumen
 *  cuenta como «encendidos que no se ven» y lo que alguien apagó. `todos` es solo ropa (Felipe 2026-10-15: «solo ropa en la web»): el
 *  empaque —bolsas, cajas— se vende desde el ticket y no se puede prender, así que no ocupa la lista; se ve con `empaque`. */
export type FiltroVitrina = "todos" | "en_la_web" | "sin_stock" | "sin_precio" | "ocultos" | "empaque";
const FILTROS_VITRINA: readonly FiltroVitrina[] = ["todos", "en_la_web", "sin_stock", "sin_precio", "ocultos", "empaque"];

/** Lo nuevo, como lo guarda la ficha de la vitrina: solo lo que se decidió a mano se puede filtrar (el «automático» depende de cuándo
 *  llegó a una tienda, y la lista no trae ese dato). */
export type FiltroLoNuevo = "todos" | "fijo" | "quitado";
const FILTROS_LO_NUEVO: readonly FiltroLoNuevo[] = ["todos", "fijo", "quitado"];

export type FiltrosVitrina = { estado: FiltroVitrina; categoria: string | null; loNuevo: FiltroLoNuevo };

/** Encendido pero sin verse porque ninguna tienda de la web le pone precio. Lo cuenta el Resumen («N modelos encendidos no se ven») y lo
 *  filtra la lista: una sola definición, para que el número de una pantalla sea el de la otra. */
export const esEncendidoSinPrecio = (m: ModeloVitrina): boolean => Boolean(m.vitrina?.publicado) && !m.publicable && m.porQueNo === "sin_precio";

/** Lo que alguien apagó o nunca encendió: se puede mostrar con un toque. El empaque no cuenta: su interruptor no se puede prender. */
const estaOculto = (m: ModeloVitrina): boolean => !m.vitrina?.publicado && !esEmpaque(m);

function coincideEstado(m: ModeloVitrina, estado: FiltroVitrina): boolean {
  switch (estado) {
    case "en_la_web":
      return seVeEnLaWeb(m);
    case "sin_stock":
      return seVeEnLaWeb(m) && libreEnTiendas(m) === 0;
    case "sin_precio":
      return esEncendidoSinPrecio(m);
    case "ocultos":
      return estaOculto(m);
    case "empaque":
      return esEmpaque(m);
    default:
      return !esEmpaque(m);
  }
}

type FiltrosExtra = { categoria?: string | null; loNuevo?: FiltroLoNuevo };

/** La categoría y Lo nuevo puestos: lo que se suma al estado. */
const pasaExtra = (m: ModeloVitrina, extra: FiltrosExtra): boolean =>
  !(extra.categoria && m.categoria !== extra.categoria) && !(extra.loNuevo && extra.loNuevo !== "todos" && (m.vitrina?.enLoNuevo ?? "automatico") !== extra.loNuevo);

/** La lista según el estado, la categoría, Lo nuevo y lo que se escribió en el buscador. Sin los filtros opcionales, como siempre. */
export function filtrarVitrina(
  modelos: readonly ModeloVitrina[],
  filtro: FiltroVitrina,
  busqueda: string,
  extra: FiltrosExtra = {},
): ModeloVitrina[] {
  const q = normalizarBusqueda(busqueda.trim());
  return modelos.filter((m) => {
    if (!coincideEstado(m, filtro) || !pasaExtra(m, extra)) return false;
    if (!q) return true;
    return normalizarBusqueda(`${m.nombre} ${m.codigo ?? ""} ${m.categoria ?? ""}`).includes(q);
  });
}

/** Cuántos modelos trae cada estado, para decirlo en la lista de la píldora («Ocultos · 6»). Cuentan lo que ya dejaron la categoría y Lo nuevo. */
export function contarPorEstado(modelos: readonly ModeloVitrina[], extra: FiltrosExtra = {}): Record<FiltroVitrina, number> {
  const base = modelos.filter((m) => pasaExtra(m, extra));
  return Object.fromEntries(FILTROS_VITRINA.map((f) => [f, base.filter((m) => coincideEstado(m, f)).length])) as Record<FiltroVitrina, number>;
}

/** Las categorías que hay en la lista, de la A a la Z, con cuántos modelos trae cada una. */
export function categoriasDe(modelos: readonly ModeloVitrina[]): { nombre: string; modelos: number }[] {
  const cuenta = new Map<string, number>();
  for (const m of modelos) if (m.categoria) cuenta.set(m.categoria, (cuenta.get(m.categoria) ?? 0) + 1);
  return [...cuenta].map(([nombre, n]) => ({ nombre, modelos: n })).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/** Los filtros que trae la dirección (`?filtro=sin_precio&categoria=Blusas&lonuevo=fijo`). Un valor que no existe se ignora: un enlace viejo
 *  o escrito a mano abre la lista completa, nunca una pantalla rota. */
export function filtrosDeLaUrl(params: { filtro?: string | string[]; categoria?: string | string[]; lonuevo?: string | string[] }): FiltrosVitrina {
  const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const estado = FILTROS_VITRINA.find((f) => f === uno(params.filtro));
  const loNuevo = FILTROS_LO_NUEVO.find((f) => f === uno(params.lonuevo));
  const categoria = uno(params.categoria)?.trim();
  return { estado: estado ?? "todos", categoria: categoria ? categoria : null, loNuevo: loNuevo ?? "todos" };
}

/** La dirección de la Vitrina ya filtrada: la usan los enlaces del Resumen. */
export function hrefVitrina(filtro: FiltroVitrina): string {
  return filtro === "todos" ? "/tienda-web/vitrina" : `/tienda-web/vitrina?filtro=${filtro}`;
}

/* ---------------- La hoja de un modelo ---------------- */

/** La descripción que se manda: limpia y vacía si es la misma del catálogo (así sigue a la ficha si la ficha cambia). */
export function descripcionParaGuardar(escrita: string, delCatalogo: string | null): string | null {
  const limpia = escrita.replace(/\s+/g, " ").trim();
  if (!limpia) return null;
  return limpia === (delCatalogo ?? "").replace(/\s+/g, " ").trim() ? null : limpia;
}

/* ---------------- Mostrar u ocultar (uno o varios) ---------------- */

export type ModoLote = "mostrar" | "ocultar";

/** Lo que le pasa a cada modelo al mostrar u ocultar, en palabras, y si cambia (lo que `vitrina_mostrar` hace con él). */
export function queLePasa(m: ModeloVitrina, modo: ModoLote): { texto: string; cambia: boolean } {
  if (modo === "ocultar") {
    if (!m.vitrina?.publicado) return { texto: "Ya está oculto", cambia: false };
    // Encendido pero sin verse (un empaque de antes de la regla, uno sin precio en la web, uno descontinuado): ocultarlo solo lo apaga.
    return { texto: seVeEnLaWeb(m) ? "Deja de verse" : "Se apaga: ya no se veía", cambia: true };
  }
  // Solo ropa en la web (Felipe 2026-10-15): el empaque no entra, aunque hubiera quedado encendido antes de la regla.
  if (esEmpaque(m)) return { texto: "No es ropa: se vende en la caja", cambia: false };
  // Sin precio en ninguna tienda que se ve en la web (el precio es el de la tienda, Felipe 2026-10-15): no entra hasta que lo tenga.
  const sinPrecio = m.porQueNo === "sin_precio";
  if (m.vitrina?.publicado) {
    return { texto: m.publicable ? "Ya se ve" : sinPrecio ? "Sin precio en la web: no se ve" : "No se puede vender: no se ve", cambia: false };
  }
  if (!m.publicable) {
    const texto = sinPrecio
      ? "No se puede mostrar: sin precio en las tiendas de la web"
      : m.porQueNo === "no_se_vende"
        ? "No se puede mostrar: descontinuado, de prueba o sin tallas activas"
        : "No se puede mostrar: descontinuado, de prueba o sin tallas con precio";
    return { texto, cambia: false };
  }
  return { texto: "Se verá en la web", cambia: true };
}

/* ---------------- Lo que dice la base ---------------- */

/** Los rechazos de la vitrina en palabras de tienda; `releer`: la pantalla está vieja y conviene recargar. `null` si no es de aquí. */
export function errorDeVitrina(mensaje: string): { titulo: string; detalle?: string; releer?: boolean } | null {
  const detalle = mensaje.replace(/^[\s\S]*?vitrina_[a-z_]+\s*/, "").trim() || undefined;
  if (/vitrina_web_sin_modulo/.test(mensaje)) return { titulo: "Tu rol no tiene la Vitrina web", detalle: "Pídele al líder que la active en Roles y accesos." };
  if (/vitrina_cambio_otro/.test(mensaje)) return { titulo: "Otra persona lo cambió", detalle, releer: true };
  if (/vitrina_no_publicable/.test(mensaje)) return { titulo: "No se puede mostrar en la web", detalle };
  if (/vitrina_no_existe/.test(mensaje)) return { titulo: "Ese modelo ya no existe", detalle, releer: true };
  if (/vitrina_datos_invalidos/.test(mensaje)) return { titulo: "Revisa los datos", detalle };
  return null;
}
