// Recibir contando primero (ADR-0393, la cara A): la lógica pura del conteo de un envío. Sin React ni red: se importa desde el servidor y
// desde el cliente, y se prueba sola (`recepcion-conteo-reglas.test.ts`).
//
//   PROMETE: leer lo que contestan `fn_envio_conteos`, `guardar_conteo_envio`, `cerrar_conteo_envio`, `resolver_pendiente_envio`,
//   `reabrir_envio`, `abrir_envio_sin_aviso` y `fn_recepcion_pendientes` sin confiar en su forma (la web puede publicarse antes que la
//   migración: lo que falta toma un valor neutro); llevar el borrador de «¿Qué blusas son?» (prendas conocidas con o sin tallas, nuevas por
//   cantidad) y armar lo que guarda cada línea; decir qué le falta al cierre con las MISMAS reglas que `cerrar_conteo_envio` (de aquí sale la
//   guía de foco); armar `p_lineas`; y los textos de lo que quedó («12 en el stock · 8 para después»).
//   NO HACE: no habla con la base ni decide permisos (el módulo Recibir, la sede, quién compró y quién ve el dinero los decide la función).
//
// El vocabulario (ADR-0393): ENVÍO es lo que se cuenta y se cierra; PENDIENTE es lo contado que todavía no está en el stock —sin separar
// (no se sabe qué prendas son), detalle (se sabe la prenda, faltan tallas y colores) o crear (es nueva)—.

import { leerCantidad, limpiarCantidad } from "./alta-producto";
import { esFalloDeRed, traducirError } from "./error-escritura";
import { diaLima } from "./fechas-lima";
import type { CampoDeGuia } from "./guia-campos";
import { leerNumero, aTexto } from "./orden-compra-alta";
import {
  CAUSAS_FALTANTE,
  CAUSAS_SOBRANTE,
  type CausaFaltante,
  type CausaSobrante,
  type Conteo,
  type DetalleEnvio,
  type LineaEnvio,
  type PrendaRecepcion,
  type SolucionDanada,
  mensajeDeLaRecepcion,
} from "./recepcion-envio-reglas";
import { opcionReposicion } from "./nos-debe-reglas";

// ---------------------------------------------------------------------------------------------------------------------------------
// Nombres de la base
// ---------------------------------------------------------------------------------------------------------------------------------

/** Lecturas (empiezan con `fn_`: el loader no bloquea mientras se buscan, `espera-reglas.ts`). */
export const RPC_CONTEOS_ENVIO = "fn_envio_conteos";
export const RPC_PENDIENTES_SEDE = "fn_recepcion_pendientes";
/** Escrituras. `guardar_conteo_envio` se llama con `x-espera: no`: contar una línea no tapa la pantalla. */
export const RPC_GUARDAR_CONTEO = "guardar_conteo_envio";
export const RPC_CERRAR_CONTEO = "cerrar_conteo_envio";
export const RPC_RESOLVER_PENDIENTE = "resolver_pendiente_envio";
export const RPC_REABRIR_ENVIO = "reabrir_envio";
export const RPC_SIN_AVISO = "abrir_envio_sin_aviso";
/** Felipe 2026-10-14: el proveedor de un envío sin aviso que se abrió sin saberlo. */
export const RPC_PONER_PROVEEDOR = "poner_proveedor_envio";
/** Felipe 2026-10-14: el número de guía se escribe o corrige al cerrar (`20261014205000`). */
export const RPC_CORREGIR_GUIA = "corregir_guia_envio";

export const TOPES_CONTEO = { contadas: 99999, descripcionNueva: 200, nota: 300, notaEnvio: 500, motivo: 300, guia: 40 } as const;

/** Pistas que la pantalla trata distinto del mensaje de la base (que ya viene en palabras de tienda). */
export const HINT_CONTEO_CAMBIADO = "conteo_cambiado";

// ---------------------------------------------------------------------------------------------------------------------------------
// Lectores tolerantes
// ---------------------------------------------------------------------------------------------------------------------------------

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const cifra = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const entero = (v: unknown): number => Math.max(0, Math.trunc(cifra(v) ?? 0));
const objeto = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const booleano = (v: unknown): boolean | null => (v === true || v === "true" ? true : v === false || v === "false" ? false : null);

export type Persona = { id: string; nombre: string | null };
function persona(v: unknown): Persona | null {
  const r = objeto(v);
  const id = r ? texto(r.id) : null;
  return id ? { id, nombre: r ? texto(r.nombre) : null } : null;
}
function idNombre(v: unknown): { id: string; nombre: string } | null {
  const r = objeto(v);
  const id = r ? texto(r.id) : null;
  const nombre = r ? texto(r.nombre) : null;
  return id && nombre ? { id, nombre } : null;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Lo separado: el borrador de «¿Qué blusas son?»
// ---------------------------------------------------------------------------------------------------------------------------------

/** Una talla y color de una prenda separada, con lo que llegó y cuántas de esas vinieron dañadas. */
export type VarianteSeparada = {
  varianteId: string;
  cantidad: number;
  danadas: number;
  solucion: SolucionDanada | null;
  /** Lo que la base dice de la variante (para mostrarla): talla, color y su código. */
  talla: string | null;
  color: string | null;
  codigo: string | null;
};

/** Una prenda conocida: cuántas eran y, si se detallaron, sus tallas y colores (con eso entran al stock al cerrar). */
export type PrendaSeparada = {
  productoId: string;
  nombre: string | null;
  codigo: string | null;
  cantidad: number;
  variantes: VarianteSeparada[] | null;
};

/** Lo nuevo: solo cuántas (decisión 8); describirlas es parte del pendiente «crear». */
export type NuevaSeparada = { cantidad: number; descripcion: string | null };

export type Separado = { prendas: PrendaSeparada[]; nuevas: NuevaSeparada[] };

export const SEPARADO_VACIO: Separado = { prendas: [], nuevas: [] };

function leerVarianteSeparada(v: unknown): VarianteSeparada | null {
  const r = objeto(v);
  const varianteId = r ? texto(r.variante_id) : null;
  if (!r || !varianteId) return null;
  const sol = texto(r.danada_solucion) ?? texto(r.solucion);
  return {
    varianteId,
    cantidad: entero(r.cantidad),
    danadas: entero(r.danadas),
    solucion: sol === "pendiente" || sol === "sin_solucion" ? sol : null,
    talla: texto(r.talla),
    color: texto(r.color),
    codigo: texto(r.codigo),
  };
}

export function leerSeparado(v: unknown): Separado {
  const r = objeto(v);
  if (!r) return SEPARADO_VACIO;
  const prendas = lista(r.prendas)
    .map((p): PrendaSeparada | null => {
      const o = objeto(p);
      const productoId = o ? texto(o.producto_id) : null;
      if (!o || !productoId) return null;
      const vars = Array.isArray(o.variantes) ? o.variantes.map(leerVarianteSeparada).filter((x): x is VarianteSeparada => x !== null) : null;
      return { productoId, nombre: texto(o.nombre), codigo: texto(o.codigo), cantidad: entero(o.cantidad), variantes: vars };
    })
    .filter((p): p is PrendaSeparada => p !== null && p.cantidad > 0);
  const nuevas = lista(r.nuevas)
    .map((n): NuevaSeparada | null => {
      const o = objeto(n);
      return o && entero(o.cantidad) > 0 ? { cantidad: entero(o.cantidad), descripcion: texto(o.descripcion) } : null;
    })
    .filter((n): n is NuevaSeparada => n !== null);
  return { prendas, nuevas };
}

/** Cuántas se separaron (prendas conocidas + nuevas). */
export const totalSeparado = (s: Separado): number => s.prendas.reduce((a, p) => a + p.cantidad, 0) + s.nuevas.reduce((a, n) => a + n.cantidad, 0);

/** Cuántas de lo separado ya tienen tallas y colores (entran al stock al cerrar). */
export const detalladas = (s: Separado): number => s.prendas.filter((p) => p.variantes !== null).reduce((a, p) => a + p.cantidad, 0);

/** Lo separado en la forma que guarda la base (`p_separado`): sin los nombres, con las tallas en 0 fuera. */
export function separadoParaBase(s: Separado): {
  prendas: { producto_id: string; cantidad: number; variantes: { variante_id: string; cantidad: number; danadas: number; danada_solucion: SolucionDanada | null }[] | null }[];
  nuevas: { cantidad: number; descripcion: string | null }[];
} {
  return {
    prendas: s.prendas
      .filter((p) => p.cantidad > 0)
      .map((p) => ({
        producto_id: p.productoId,
        cantidad: p.cantidad,
        variantes:
          p.variantes === null
            ? null
            : p.variantes
                .filter((v) => v.cantidad > 0)
                .map((v) => ({ variante_id: v.varianteId, cantidad: v.cantidad, danadas: v.danadas, danada_solucion: v.danadas > 0 ? v.solucion : null })),
      })),
    nuevas: s.nuevas.filter((n) => n.cantidad > 0).map((n) => ({ cantidad: n.cantidad, descripcion: n.descripcion?.trim() || null })),
  };
}

/** Una prenda conocida más (si ya estaba, suma una). */
export function sumarPrenda(s: Separado, p: { productoId: string; nombre: string | null; codigo: string | null }, n = 1): Separado {
  const ya = s.prendas.find((x) => x.productoId === p.productoId);
  if (ya) return cambiarCantidadPrenda(s, p.productoId, ya.cantidad + n);
  return { ...s, prendas: [...s.prendas, { productoId: p.productoId, nombre: p.nombre, codigo: p.codigo, cantidad: Math.max(1, n), variantes: null }] };
}

/** Cambia cuántas eran de una prenda. En 0 se quita. Si estaba detallada y el número ya no coincide, el detalle se suelta (vuelve a «sin tallas»). */
export function cambiarCantidadPrenda(s: Separado, productoId: string, cantidad: number): Separado {
  const n = Math.max(0, Math.min(TOPES_CONTEO.contadas, Math.trunc(cantidad)));
  if (n === 0) return quitarPrenda(s, productoId);
  return {
    ...s,
    prendas: s.prendas.map((p) =>
      p.productoId !== productoId ? p : { ...p, cantidad: n, variantes: p.variantes && sumaVariantes(p.variantes) === n ? p.variantes : null },
    ),
  };
}

export const quitarPrenda = (s: Separado, productoId: string): Separado => ({ ...s, prendas: s.prendas.filter((p) => p.productoId !== productoId) });

const sumaVariantes = (vs: readonly VarianteSeparada[]): number => vs.reduce((a, v) => a + v.cantidad, 0);

/** Las tallas y colores de una prenda separada (la matriz): su cantidad pasa a ser la suma (perdonar antes que preguntar, ley 7). Sin nada,
 *  vuelve a «sin tallas». */
export function detallarPrenda(s: Separado, productoId: string, variantes: readonly VarianteSeparada[]): Separado {
  const vs = variantes.filter((v) => v.cantidad > 0).map((v) => ({ ...v, danadas: Math.min(v.danadas, v.cantidad) }));
  return {
    ...s,
    prendas: s.prendas.map((p) => (p.productoId !== productoId ? p : vs.length ? { ...p, cantidad: sumaVariantes(vs), variantes: vs } : { ...p, variantes: null })),
  };
}

/**
 * Las tallas y colores de una prenda separada, desde la hoja de tallas. Si al detallar se vio que era OTRA prenda («Cambiar», o la que se
 * creó con «Es nueva»), la fila pasa a ser la nueva; si esa ya estaba separada, se juntan (una prenda va una sola vez, como pide la base).
 */
export function ponerTallas(
  s: Separado,
  productoIdOriginal: string,
  prenda: { productoId: string; nombre: string | null; codigo: string | null },
  variantes: readonly VarianteSeparada[],
): Separado {
  const vs = variantes.filter((v) => v.cantidad > 0);
  if (prenda.productoId === productoIdOriginal) return detallarPrenda(s, productoIdOriginal, vs);
  const sinLaOriginal = quitarPrenda(s, productoIdOriginal);
  const ya = sinLaOriginal.prendas.find((p) => p.productoId === prenda.productoId);
  if (!ya) {
    return {
      ...sinLaOriginal,
      prendas: [...sinLaOriginal.prendas, { productoId: prenda.productoId, nombre: prenda.nombre, codigo: prenda.codigo, cantidad: sumaVariantes(vs), variantes: vs.length ? vs : null }],
    };
  }
  const juntas = new Map((ya.variantes ?? []).map((v) => [v.varianteId, { ...v }] as const));
  for (const v of vs) {
    const e = juntas.get(v.varianteId);
    juntas.set(v.varianteId, e ? { ...e, cantidad: e.cantidad + v.cantidad, danadas: e.danadas + v.danadas, solucion: e.solucion ?? v.solucion } : { ...v });
  }
  const todas = [...juntas.values()];
  return {
    ...sinLaOriginal,
    prendas: sinLaOriginal.prendas.map((p) =>
      p.productoId !== prenda.productoId ? p : ya.variantes ? { ...p, cantidad: sumaVariantes(todas), variantes: todas } : { ...p, cantidad: p.cantidad + sumaVariantes(vs), variantes: null },
    ),
  };
}

/** De la matriz contada (el texto de cada celda, como en la recepción de la fase 4) a las tallas y colores de la prenda separada. */
export function variantesDeConteo(c: Conteo, prenda: Pick<PrendaRecepcion, "variantes">): VarianteSeparada[] {
  const r: VarianteSeparada[] = [];
  for (const v of prenda.variantes) {
    const n = leerCantidad(c.cantidades[v.id] ?? "") ?? 0;
    if (n <= 0) continue;
    const d = c.conDanadas ? Math.min(n, leerCantidad(c.danadas[v.id] ?? "") ?? 0) : 0;
    r.push({ varianteId: v.id, cantidad: n, danadas: d, solucion: d > 0 ? c.arreglo : null, talla: v.talla, color: v.color, codigo: v.codigo });
  }
  return r;
}

/** Al revés: las tallas ya separadas como la matriz las muestra (para seguir corrigiéndolas). */
export function conteoDeVariantes(vs: readonly VarianteSeparada[] | null): Conteo {
  const cantidades: Record<string, string> = {};
  const danadas: Record<string, string> = {};
  let arreglo: SolucionDanada | null = null;
  for (const v of vs ?? []) {
    cantidades[v.varianteId] = String(v.cantidad);
    if (v.danadas > 0) {
      danadas[v.varianteId] = String(v.danadas);
      arreglo = arreglo ?? v.solucion;
    }
  }
  return { cantidades, danadas, conDanadas: Object.keys(danadas).length > 0, arreglo };
}

/** Cuántas nuevas sin describir (las que no tienen descripción se juntan en una sola fila «Nuevas»). */
export const nuevasSinDescribir = (s: Separado): number => s.nuevas.filter((n) => !n.descripcion).reduce((a, n) => a + n.cantidad, 0);

/** Pone cuántas nuevas sin describir hay (la fila «Nuevas, no están en el catálogo»). Las descritas no se tocan. */
export function cambiarNuevasSinDescribir(s: Separado, cantidad: number): Separado {
  const n = Math.max(0, Math.min(TOPES_CONTEO.contadas, Math.trunc(cantidad)));
  const descritas = s.nuevas.filter((x) => x.descripcion);
  return { ...s, nuevas: n > 0 ? [...descritas, { cantidad: n, descripcion: null }] : descritas };
}

/**
 * «Describir ahora» (maqueta A): de las nuevas sin describir, `cantidad` pasan a llevar lo que son («Blusa con lazo, rosada, S y M»).
 * Siguen siendo nuevas «por crear» (se crean después, en «Hacer ahora»), pero quien las crea ya sabe qué son. La misma descripción se
 * junta; no se describen más de las que hay sin describir.
 */
export function describirNuevas(s: Separado, descripcion: string, cantidad: number): Separado {
  const texto = descripcion.trim().replace(/\s+/g, " ").slice(0, TOPES_CONTEO.descripcionNueva);
  const sin = nuevasSinDescribir(s);
  const n = Math.min(sin, Math.max(0, Math.trunc(cantidad)));
  if (!texto || n === 0) return s;
  const clave = texto.toLocaleLowerCase("es");
  const ya = s.nuevas.some((x) => x.descripcion?.toLocaleLowerCase("es") === clave);
  const descritas = ya
    ? s.nuevas.filter((x) => x.descripcion).map((x) => (x.descripcion?.toLocaleLowerCase("es") === clave ? { ...x, cantidad: x.cantidad + n } : x))
    : [...s.nuevas.filter((x) => x.descripcion), { cantidad: n, descripcion: texto }];
  return cambiarNuevasSinDescribir({ ...s, nuevas: descritas }, sin - n);
}

/** Quita una descripción: esas nuevas vuelven a «sin describir» (no se pierden de lo contado). */
export function quitarNuevaDescrita(s: Separado, descripcion: string): Separado {
  const quitada = s.nuevas.find((x) => x.descripcion === descripcion);
  if (!quitada) return s;
  const sin = nuevasSinDescribir(s);
  return cambiarNuevasSinDescribir({ ...s, nuevas: s.nuevas.filter((x) => x.descripcion !== descripcion) }, sin + quitada.cantidad);
}

/** Cuántas son de una nueva ya descrita (al menos 1: para que sean 0, se quita). */
export function cambiarCantidadNuevaDescrita(s: Separado, descripcion: string, cantidad: number): Separado {
  const n = Math.max(1, Math.min(TOPES_CONTEO.contadas, Math.trunc(cantidad)));
  return { ...s, nuevas: s.nuevas.map((x) => (x.descripcion === descripcion ? { ...x, cantidad: n } : x)) };
}

/**
 * Lo que se guarda de una línea: si lo separado pasa de lo contado, el número sube (perdonar antes que preguntar, ley 7 de /formidable): la
 * pantalla lo dice («Separaste más de lo que contaste: el conteo pasa a 12»). En un envío reabierto lo contado no baja de lo que ya entró.
 */
export function contadasParaGuardar(contadas: number, s: Separado, enStock = 0): { contadas: number; subio: boolean } {
  const base = Math.max(0, Math.min(TOPES_CONTEO.contadas, Math.trunc(contadas)));
  const minimo = enStock + totalSeparado(s);
  return base >= minimo ? { contadas: base, subio: false } : { contadas: minimo, subio: true };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Lo contado de un envío (`fn_envio_conteos`)
// ---------------------------------------------------------------------------------------------------------------------------------

export type PendienteDeLinea = {
  id: string;
  tipo: "detalle" | "crear";
  cantidad: number;
  /** Lo que todavía no entró de él. */
  quedan: number;
  producto: { id: string; nombre: string | null; codigo: string | null } | null;
  descripcion: string | null;
  estado: "pendiente" | "resuelto" | "anulado";
  anotadoPor: Persona | null;
  anotadoEn: string | null;
};

export type ConteoDeLinea = {
  /** La línea del envío; null si es algo que no estaba en la guía (`extraPosicion`). */
  despachoItemId: string | null;
  extraPosicion: number | null;
  /** Solo lo de fuera de la guía trae de quién, qué categoría y qué marca (una línea lo saca de su orden). */
  proveedor: { id: string; nombre: string } | null;
  categoria: { id: string; nombre: string; prefijo: string | null; familia: string | null } | null;
  marca: { id: string; nombre: string } | null;
  contadas: number;
  separado: Separado;
  costoUnitario: number | null;
  version: number;
  contadoPor: Persona | null;
  contadoEn: string | null;
  enStock: number;
  /** Con el envío cerrado: lo que nadie dijo qué es. Abierto: lo contado que el borrador no separó. */
  sinSeparar: number;
  pendientes: PendienteDeLinea[];
};

export type CierreDelEnvio = { tipo: "cierre" | "reapertura"; motivo: string | null; hechoPor: Persona | null; hechoEn: string | null; porDetallar: number | null; faltan: number | null };

export type ConteosDelEnvio = {
  despachoId: string;
  estado: string | null;
  origen: "compra" | "sin_aviso";
  /** Un envío sin aviso que se abrió sin saber de quién es (Felipe 2026-10-14): se cuenta igual y el proveedor se pone antes de cerrar. */
  proveedorPorConfirmar: boolean;
  proveedores: { id: string; nombre: string }[];
  conteos: ConteoDeLinea[];
  cierres: CierreDelEnvio[];
  /** Solo con el envío cerrado. */
  reabrir: { sePuede: boolean; porQueNo: string | null } | null;
};

/**
 * ¿Hace falta el vocabulario (categorías, tallas, colores) con el envío ya cerrado? Solo si quedan pendientes: «Hacer ahora» separa, pone
 * tallas o crea la prenda, y para eso necesita el catálogo. Un envío cerrado sin pendientes no lo lee (una lectura menos por pantalla).
 */
/**
 * Un envío abierto en la lista de la puerta que llegó sin aviso: no trae ni órdenes ni líneas (uno de Compras siempre trae al menos una).
 * Solo vale con la base de ADR-0393 (`fn_envios_por_recibir` manda las líneas siempre); la puerta lo pregunta solo entonces.
 */
export function esEnvioSinAviso(e: { lineas: number; ordenes: readonly string[] }): boolean {
  return e.lineas === 0 && e.ordenes.length === 0;
}

/** Cómo se lee en la puerta un envío sin aviso que alguien dejó abierto: sin «0 prendas», que confunde, y de quién es si se sabe
 *  (`proveedor`: su nombre, «proveedor por confirmar», o `null` si no se pudo leer). */
export function detalleDeEnvioSinAviso(e: { numeroGuia: string | null }, proveedor: string | null = null): string {
  return ["Llegó sin aviso: se sigue contando", proveedor, e.numeroGuia ? `guía ${e.numeroGuia}` : null].filter(Boolean).join(" · ");
}

/** De quién es un envío sin aviso, para la puerta: su proveedor, «proveedor por confirmar», o `null` si no se sabe. */
export function proveedorDelSinAviso(c: ConteosDelEnvio | null): string | null {
  if (!c) return null;
  if (c.proveedorPorConfirmar) return "proveedor por confirmar";
  return c.proveedores[0]?.nombre ?? null;
}

export function necesitaCatalogoAlCerrar(conteos: ConteosDelEnvio | null): boolean {
  return !!conteos && conteos.estado === "cerrado" && conteos.conteos.some((c) => c.pendientes.some((p) => p.estado === "pendiente"));
}

function leerPendiente(v: unknown): PendienteDeLinea | null {
  const r = objeto(v);
  const id = r ? texto(r.id) : null;
  const tipo = r ? texto(r.tipo) : null;
  const estado = r ? texto(r.estado) : null;
  if (!r || !id || (tipo !== "detalle" && tipo !== "crear") || (estado !== "pendiente" && estado !== "resuelto" && estado !== "anulado")) return null;
  const p = objeto(r.producto);
  return {
    id,
    tipo,
    cantidad: entero(r.cantidad),
    quedan: entero(r.quedan),
    producto: p && texto(p.id) ? { id: texto(p.id) as string, nombre: texto(p.nombre), codigo: texto(p.codigo) } : null,
    descripcion: texto(r.descripcion),
    estado,
    anotadoPor: persona(r.anotado_por),
    anotadoEn: texto(r.anotado_en),
  };
}

function leerConteoDeLinea(v: unknown): ConteoDeLinea | null {
  const r = objeto(v);
  if (!r) return null;
  const despachoItemId = texto(r.despacho_item_id);
  const extra = cifra(r.extra_posicion);
  if (!despachoItemId && extra == null) return null;
  const cat = objeto(r.categoria);
  return {
    despachoItemId,
    extraPosicion: despachoItemId ? null : extra,
    proveedor: idNombre(r.proveedor),
    categoria: cat && texto(cat.id) && texto(cat.nombre) ? { id: texto(cat.id) as string, nombre: texto(cat.nombre) as string, prefijo: texto(cat.prefijo), familia: texto(cat.familia) } : null,
    marca: idNombre(r.marca),
    contadas: entero(r.contadas),
    separado: leerSeparado(r.separado),
    costoUnitario: cifra(r.costo_unitario),
    version: Math.max(1, entero(r.version)),
    contadoPor: persona(r.contado_por),
    contadoEn: texto(r.contado_en),
    enStock: entero(r.en_stock),
    sinSeparar: entero(r.sin_separar),
    pendientes: lista(r.pendientes).map(leerPendiente).filter((p): p is PendienteDeLinea => p !== null),
  };
}

/** Lee `fn_envio_conteos`. `null` si la base no lo dice (envío que no existe, o la base todavía sin la migración). */
export function leerConteosDelEnvio(data: unknown): ConteosDelEnvio | null {
  const r = objeto(Array.isArray(data) ? data[0] : data);
  const despachoId = r ? texto(r.despacho_id) : null;
  if (!r || !despachoId) return null;
  const reabrir = objeto(r.reabrir);
  return {
    despachoId,
    estado: texto(r.estado),
    origen: texto(r.origen) === "sin_aviso" ? "sin_aviso" : "compra",
    proveedorPorConfirmar: booleano(r.proveedor_por_confirmar) ?? false,
    proveedores: lista(r.proveedores).map(idNombre).filter((p): p is { id: string; nombre: string } => p !== null),
    conteos: lista(r.conteos).map(leerConteoDeLinea).filter((c): c is ConteoDeLinea => c !== null),
    cierres: lista(r.cierres)
      .map((c): CierreDelEnvio | null => {
        const o = objeto(c);
        const tipo = o ? texto(o.tipo) : null;
        if (!o || (tipo !== "cierre" && tipo !== "reapertura")) return null;
        const res = objeto(o.resultado);
        return { tipo, motivo: texto(o.motivo), hechoPor: persona(o.hecho_por), hechoEn: texto(o.hecho_en), porDetallar: res ? cifra(res.por_detallar) : null, faltan: res ? cifra(res.faltan) : null };
      })
      .filter((c): c is CierreDelEnvio => c !== null),
    reabrir: reabrir ? { sePuede: booleano(reabrir.se_puede) ?? false, porQueNo: texto(reabrir.por_que_no) } : null,
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Las líneas que se cuentan: las de la guía y lo que no estaba en ella
// ---------------------------------------------------------------------------------------------------------------------------------

/** La clave de una línea en la pantalla: «item:<id>» o «extra:<n>». */
export type ClaveLinea = `item:${string}` | `extra:${number}`;
export const claveDe = (c: Pick<ConteoDeLinea, "despachoItemId" | "extraPosicion">): ClaveLinea =>
  c.despachoItemId ? `item:${c.despachoItemId}` : `extra:${c.extraPosicion ?? 0}`;

/** Una línea para contar: lo que viene de la guía (si viene) y lo contado (si ya se contó). */
export type LineaParaContar = {
  clave: ClaveLinea;
  /** La línea del envío; null en lo de fuera de la guía. */
  linea: LineaEnvio | null;
  conteo: ConteoDeLinea | null;
  categoria: { id: string; nombre: string; prefijo: string | null; familia: string | null } | null;
  marca: { id: string; nombre: string } | null;
  proveedor: { id: string; nombre: string } | null;
  /** «Dijeron»: lo que salió en el envío. null = sin guía (fuera de la guía o sin aviso): nada con qué comparar. */
  dijeron: number | null;
};

/** Las líneas en el orden del envío (las de la guía primero) y después lo de fuera de la guía, por su posición. */
export function lineasParaContar(d: Pick<DetalleEnvio, "lineas">, c: Pick<ConteosDelEnvio, "conteos"> | null): LineaParaContar[] {
  const porClave = new Map((c?.conteos ?? []).map((k) => [claveDe(k), k] as const));
  const deLaGuia: LineaParaContar[] = d.lineas.map((l) => ({
    clave: `item:${l.id}` as ClaveLinea,
    linea: l,
    conteo: porClave.get(`item:${l.id}`) ?? null,
    categoria: l.categoria,
    marca: l.marca,
    proveedor: l.proveedor,
    dijeron: l.enviado,
  }));
  const fuera: LineaParaContar[] = (c?.conteos ?? [])
    .filter((k) => k.extraPosicion != null)
    .sort((a, b) => (a.extraPosicion ?? 0) - (b.extraPosicion ?? 0))
    .map((k) => ({ clave: claveDe(k), linea: null, conteo: k, categoria: k.categoria, marca: k.marca, proveedor: k.proveedor, dijeron: null }));
  return [...deLaGuia, ...fuera];
}

/** Lo de fuera de la guía que quedó en 0 se quitó al contar: no se muestra ni se cierra. */
export const lineaVisible = (l: LineaParaContar): boolean => l.linea !== null || (l.conteo?.contadas ?? 0) > 0;

/** Lo contado de una línea (0 si nadie la contó). */
export const contadasDe = (l: LineaParaContar): number => l.conteo?.contadas ?? 0;

/** Lo contado contra lo que dijeron: negativo, faltan; positivo, sobran; null, sin guía (nada con qué comparar). */
export const diferenciaDe = (l: LineaParaContar): number | null => (l.dijeron == null ? null : contadasDe(l) - l.dijeron);

export const textoPrendas = (n: number): string => `${n} ${n === 1 ? "prenda" : "prendas"}`;

/** Lo que dice el chip del contador: «Cuadra: llegaron las 40», «Faltan 2», «Sobran 3», «12 contadas». */
export function veredictoDe(l: LineaParaContar): { texto: string; tono: "verde" | "ambar" | "neutro" } {
  const n = contadasDe(l);
  if (l.dijeron == null) return n ? { texto: `${n} contadas`, tono: "neutro" } : { texto: "Cuenta y escribe el número", tono: "neutro" };
  if (!l.conteo) return { texto: `Dijeron ${l.dijeron}. Cuenta y escribe el número.`, tono: "neutro" };
  const d = n - l.dijeron;
  if (d === 0) return { texto: `Cuadra: llegaron las ${l.dijeron}`, tono: "verde" };
  return d < 0
    ? { texto: `Faltan ${-d}. Puedes seguir: lo explicas al cerrar.`, tono: "ambar" }
    : { texto: `Sobran ${d}. Puedes seguir: lo explicas al cerrar.`, tono: "ambar" };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Guardar una línea (`guardar_conteo_envio`)
// ---------------------------------------------------------------------------------------------------------------------------------

export type ArgsGuardarConteo = {
  p_despacho_id: string;
  p_despacho_item_id: string | null;
  p_contadas: number;
  p_separado: ReturnType<typeof separadoParaBase>;
  p_version: number | null;
  p_extra_posicion: number | null;
  p_proveedor_id: string | null;
  p_categoria_id: string | null;
  p_marca_id: string | null;
};

/** Lo que guarda una línea: la de la guía por su id; lo de fuera de la guía por su posición (o, nuevo, por su categoría y marca). */
export function argsGuardarConteo(p: {
  despachoId: string;
  linea: Pick<LineaParaContar, "linea" | "conteo">;
  contadas: number;
  separado: Separado;
  nuevo?: { proveedorId: string | null; categoriaId: string; marcaId: string | null };
}): ArgsGuardarConteo {
  const extra = p.linea.linea ? null : (p.linea.conteo?.extraPosicion ?? null);
  return {
    p_despacho_id: p.despachoId,
    p_despacho_item_id: p.linea.linea?.id ?? null,
    p_contadas: p.contadas,
    p_separado: separadoParaBase(p.separado),
    // Una línea que todavía no llegó a la base (versión 0, la que se ve mientras se escribe) no dice versión.
    p_version: p.linea.conteo && p.linea.conteo.version > 0 ? p.linea.conteo.version : null,
    p_extra_posicion: extra,
    p_proveedor_id: extra == null && !p.linea.linea ? (p.nuevo?.proveedorId ?? null) : null,
    p_categoria_id: extra == null && !p.linea.linea ? (p.nuevo?.categoriaId ?? null) : null,
    p_marca_id: extra == null && !p.linea.linea ? (p.nuevo?.marcaId ?? null) : null,
  };
}

/** Lo que contesta `guardar_conteo_envio`: la línea guardada y, si pisaste lo de otra persona, qué tenía. */
export function leerGuardado(data: unknown): { conteo: ConteoDeLinea; pisaste: { contadas: number; quien: string | null } | null } | null {
  const r = objeto(Array.isArray(data) ? data[0] : data);
  const conteo = leerConteoDeLinea(r);
  if (!r || !conteo) return null;
  const p = objeto(r.pisaste);
  return { conteo, pisaste: p ? { contadas: entero(p.contadas), quien: persona(p.contado_por)?.nombre ?? null } : null };
}

/** «Lucía había puesto 38: quedó tu 40». */
export const textoPisaste = (p: { contadas: number; quien: string | null }, ahora: number): string =>
  `${p.quien ? primerNombre(p.quien) : "Otra persona"} había puesto ${p.contadas}: quedó tu ${ahora}`;

export const primerNombre = (n: string | null | undefined): string => (n ?? "").trim().split(/\s+/)[0] ?? "";

// ---------------------------------------------------------------------------------------------------------------------------------
// Cerrar (`cerrar_conteo_envio`)
// ---------------------------------------------------------------------------------------------------------------------------------

/** Lo que decide quien cierra por cada línea: el costo (decisión 6), qué pasó con lo que no cuadró y una nota. */
export type DecisionCierre = {
  costo: string;
  confirmaCosto: boolean;
  faltanteCausa: CausaFaltante | null;
  sobranteCausa: CausaSobrante | null;
  nota: string;
};

export const DECISION_VACIA: DecisionCierre = { costo: "", confirmaCosto: false, faltanteCausa: null, sobranteCausa: null, nota: "" };

/** El costo como se escribe: 25 → «25.00». */
export const costoComoTexto = (n: number | null): string => (n == null ? "" : aTexto(Math.round(n * 100), 2));

/** La decisión inicial de una línea: el costo del envío (o el que ya quedó en el conteo), sin causas. */
export function decisionInicial(l: LineaParaContar): DecisionCierre {
  return { ...DECISION_VACIA, costo: costoComoTexto(l.conteo?.costoUnitario ?? l.linea?.costoUnitario ?? null) };
}

/** Lee el costo escrito: vacío es «sin costo» (null); algo que no es un monto, un problema. */
export function leerCostoCierre(t: string): { valor: number | null; problema: string | null } {
  const l = leerNumero(t, 2);
  if (l.tipo === "vacio") return { valor: null, problema: null };
  if (l.tipo === "mal") return { valor: null, problema: l.motivo === "negativo" ? "El costo no puede ser negativo" : "Escribe el costo solo con números (ej. 25.50)" };
  if (l.escalado > 9999999) return { valor: null, problema: "El costo va de S/\u00a00 a S/\u00a099 999.99" };
  return { valor: l.escalado / 100, problema: null };
}

export type FaltaCierre = { clave: "contar" | "causa" | "costo" | "responsable"; linea: ClaveLinea | null; texto: string };

/**
 * Lo que frena «Cerrar», con las MISMAS reglas que `cerrar_conteo_envio`: toda línea de la guía contada (aunque sea en 0), la causa de lo
 * que no cuadró, el costo de lo de fuera de la guía (salvo un envío sin aviso) y quién cierra. Separar y detallar NO frenan: son pendientes.
 */
export function faltaParaCerrar(p: {
  lineas: readonly LineaParaContar[];
  decisiones: Readonly<Record<string, DecisionCierre>>;
  sinAviso: boolean;
  responsable: boolean;
}): FaltaCierre[] {
  const f: FaltaCierre[] = [];
  for (const l of p.lineas) {
    if (!lineaVisible(l)) continue;
    const nombre = nombreDeLinea(l);
    if (l.linea && !l.conteo) {
      f.push({ clave: "contar", linea: l.clave, texto: `Cuenta ${nombre} (aunque no haya llegado nada)` });
      continue;
    }
    const d = p.decisiones[l.clave] ?? DECISION_VACIA;
    const dif = diferenciaDe(l);
    if (dif != null && dif < 0 && !d.faltanteCausa) f.push({ clave: "causa", linea: l.clave, texto: `Di por qué faltan ${-dif} de ${nombre}` });
    if (dif != null && dif > 0 && !d.sobranteCausa) f.push({ clave: "causa", linea: l.clave, texto: `Di qué pasa con las ${dif} de más de ${nombre}` });
    if (!l.linea && !p.sinAviso && contadasDe(l) > 0) {
      if (!d.sobranteCausa) f.push({ clave: "causa", linea: l.clave, texto: `Di qué pasa con ${nombre} (no estaba en la guía)` });
      if (leerCostoCierre(d.costo).valor == null) f.push({ clave: "costo", linea: l.clave, texto: `Escribe el costo de ${nombre}` });
    }
    if (leerCostoCierre(d.costo).problema) f.push({ clave: "costo", linea: l.clave, texto: `Corrige el costo de ${nombre}` });
  }
  if (!p.responsable) f.push({ clave: "responsable", linea: null, texto: "Elige quién cierra" });
  return f;
}

/** Los campos de la guía de foco del cierre (ADR-0284): los mismos que `faltaParaCerrar`, también los ya hechos (llevan su ✓). */
export function camposDelCierre(
  p: Parameters<typeof faltaParaCerrar>[0] & {
    /** Llegó sin aviso y sin saber de quién (Felipe 2026-10-14): `cerrar_conteo_envio` no cierra sin proveedor (`envio_sin_proveedor`). */
    proveedorPorConfirmar?: boolean;
    proveedorElegido?: boolean;
    /** Lo escrito en «Número de guía» (Felipe 2026-10-14): opcional, se corrige si el papel dice otra cosa. */
    guia?: string;
  },
): CampoDeGuia[] {
  const falta = faltaParaCerrar(p);
  const campos: CampoDeGuia[] = [];
  for (const l of p.lineas) {
    if (!lineaVisible(l)) continue;
    const nombre = nombreDeLinea(l);
    const dif = diferenciaDe(l);
    const pideCausa = (dif != null && dif !== 0 && l.conteo) || (!l.linea && !p.sinAviso && contadasDe(l) > 0);
    if (l.linea && !l.conteo) {
      campos.push({ id: idCampoCierre("contar", l.clave), nombre, requerido: true, hecho: false, pendiente: `Cuenta ${nombre} (aunque no haya llegado nada).` });
      continue;
    }
    if (pideCausa) {
      const f = falta.find((x) => x.clave === "causa" && x.linea === l.clave);
      campos.push({ id: idCampoCierre("causa", l.clave), nombre: `Qué pasó · ${nombre}`, requerido: true, hecho: !f, pendiente: f ? `${f.texto}.` : "" });
    }
    if (!l.linea && contadasDe(l) > 0) {
      const f = falta.find((x) => x.clave === "costo" && x.linea === l.clave);
      campos.push({
        id: idCampoCierre("costo", l.clave),
        nombre: `Costo · ${nombre}`,
        // Sin aviso el costo es opcional, pero uno mal escrito frena: si no, se descartaría en silencio y la persona creería que lo puso.
        requerido: !p.sinAviso || leerCostoCierre((p.decisiones[l.clave] ?? DECISION_VACIA).costo).problema !== null,
        hecho: !f && (p.sinAviso ? leerCostoCierre((p.decisiones[l.clave] ?? DECISION_VACIA).costo).valor != null : true),
        pendiente: f ? `${f.texto}.` : "Sin costo entra igual: llega con la factura.",
      });
    }
  }
  if (p.guia !== undefined) {
    campos.push({ id: "guia", nombre: "Número de guía", requerido: false, hecho: p.guia.trim() !== "", pendiente: "Si el papel de la guía dice otra cosa, corrígela." });
  }
  if (p.proveedorPorConfirmar) {
    campos.push({ id: "proveedor", nombre: "De quién llegó", requerido: true, hecho: p.proveedorElegido === true, pendiente: "Elige de quién llegó: pregúntale a Compras." });
  }
  campos.push({ id: "responsable", nombre: "Quién cierra", requerido: true, hecho: p.responsable, pendiente: "Elige quién cierra." });
  return campos;
}

/** El id de un campo del cierre en la guía y en el DOM (`data-campo`). */
export const idCampoCierre = (tipo: "contar" | "causa" | "costo", clave: ClaveLinea): string => `${tipo}-${clave.replace(":", "-")}`;

/** Los campos de la guía del conteo: cada línea de la guía, hecha cuando ya tiene su número (aunque sea 0). Lo de fuera de la guía no
 *  pide nada (es lo que se agrega). */
export function camposDelConteo(lineas: readonly LineaParaContar[]): CampoDeGuia[] {
  // Sin nada en la lista (un envío sin aviso recién abierto) no se puede cerrar: lo que sigue es agregar lo que llegó.
  if (lineas.length === 0) {
    return [{ id: ID_CAMPO_AGREGAR, nombre: "Lo que llegó", requerido: true, hecho: false, pendiente: "Agrega la primera categoría que llegó y cuéntala." }];
  }
  return lineas
    .filter((l) => l.linea)
    .map((l) => ({
      id: idCampoConteo(l.clave),
      nombre: nombreDeLinea(l),
      requerido: true,
      hecho: l.conteo !== null,
      pendiente: `Cuenta ${nombreDeLinea(l)} y escribe cuántas llegaron.`,
    }));
}

export const idCampoConteo = (clave: ClaveLinea): string => `contar-${clave.replace(":", "-")}`;

/** El botón «+ Agregar lo que llegó», cuando la lista está vacía. */
export const ID_CAMPO_AGREGAR = "contar-agregar";

export type LineaParaCerrar = {
  despacho_item_id?: string;
  extra_posicion?: number;
  version: number;
  costo_unitario: number | null;
  confirma_costo: boolean;
  faltante_causa: CausaFaltante | null;
  sobrante_causa: CausaSobrante | null;
  nota: string | null;
};

/** `p_lineas` de `cerrar_conteo_envio`: una por conteo, con la versión que se vio. Las causas que ya no aplican se sueltan (la base las
 *  rechaza: «De … no falta nada»). */
export function lineasParaCerrar(lineas: readonly LineaParaContar[], decisiones: Readonly<Record<string, DecisionCierre>>, sinAviso: boolean): LineaParaCerrar[] {
  return lineas
    .filter((l) => l.conteo !== null)
    .map((l) => {
      const c = l.conteo as ConteoDeLinea;
      const d = decisiones[l.clave] ?? DECISION_VACIA;
      const dif = diferenciaDe(l);
      const fuera = !l.linea;
      const costo = leerCostoCierre(d.costo).valor;
      return {
        ...(l.linea ? { despacho_item_id: l.linea.id } : { extra_posicion: c.extraPosicion ?? 0 }),
        version: c.version,
        costo_unitario: fuera && sinAviso && costo == null ? null : costo,
        confirma_costo: d.confirmaCosto,
        faltante_causa: dif != null && dif < 0 ? d.faltanteCausa : null,
        sobrante_causa: (dif != null && dif > 0) || (fuera && !sinAviso && c.contadas > 0) ? d.sobranteCausa : null,
        nota: d.nota.trim() ? d.nota.trim().slice(0, TOPES_CONTEO.nota) : null,
      };
    });
}

/** Las causas que se ofrecen para una línea: faltante o sobrante (lo de fuera de la guía siempre es sobrante). «Es la reposición de lo que
 *  faltó» solo si el proveedor debe algo de esa categoría y marca (`deudaPendiente`, fase 5a: `fn_envio_detalle`). */
export function causasDe(
  l: LineaParaContar,
  deudaPendiente = 0,
  sinAviso = false,
): { tipo: "faltante" | "sobrante"; opciones: { valor: string; texto: string; ayuda: string }[] } | null {
  // Lo que llega sin aviso no tiene con qué compararse: nada sobra ni falta, y no se pregunta qué pasó (igual que `faltaParaCerrar`).
  if (sinAviso && !l.linea) return null;
  const dif = diferenciaDe(l);
  if (dif != null && dif < 0) return { tipo: "faltante", opciones: [...CAUSAS_FALTANTE] };
  if ((dif != null && dif > 0) || (!l.linea && contadasDe(l) > 0)) {
    const opciones: { valor: string; texto: string; ayuda: string }[] = [...CAUSAS_SOBRANTE];
    if (deudaPendiente > 0) {
      const r = opcionReposicion(deudaPendiente, l.proveedor?.nombre ?? null, { categoria: l.categoria?.nombre, marca: l.marca?.nombre });
      opciones.push({ valor: r.valor, texto: r.texto, ayuda: r.ayuda });
    }
    return { tipo: "sobrante", opciones };
  }
  return null;
}

/** La marca de una línea (Felipe 2026-10-14: lo que no estaba en la guía puede no tenerla): la suya o «Sin marca» (`id` vacío). */
export type MarcaDeLinea = { id: string | null; nombre: string };
/** El valor de «Sin marca» en un combo (la base recibe `null`). */
export const SIN_MARCA = "sin-marca";
export function marcaDeLinea(l: { marca: { id: string; nombre: string } | null }): MarcaDeLinea {
  return l.marca ?? { id: null, nombre: "Sin marca" };
}

export function nombreDeLinea(l: Pick<LineaParaContar, "categoria" | "marca" | "linea">): string {
  const base = [l.categoria?.nombre, l.categoria ? marcaDeLinea(l).nombre : null].filter(Boolean).join(" · ") || "esta línea";
  return l.linea?.descripcion ? `${base} · ${l.linea.descripcion}` : base;
}

/** El texto del botón principal: «Cerrar el envío · 40 contadas en Tienda TRU». */
export function textoBotonCerrar(contadas: number, sede: string | null, reabierto: boolean): string {
  return `${reabierto ? "Cerrar de nuevo" : "Cerrar el envío"} · ${contadas} ${contadas === 1 ? "contada" : "contadas"}${sede ? ` en ${sede}` : ""}`;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Lo que queda para después (el envío cerrado)
// ---------------------------------------------------------------------------------------------------------------------------------

export type ParaDespues =
  | { tipo: "separar"; linea: ClaveLinea; cantidad: number; titulo: string; sub: string }
  | { tipo: "detalle"; linea: ClaveLinea; pendiente: PendienteDeLinea; cantidad: number; titulo: string; sub: string }
  | { tipo: "crear"; linea: ClaveLinea; pendiente: PendienteDeLinea; cantidad: number; titulo: string; sub: string };

/** Lo que queda por terminar, línea por línea: lo sin separar, cada «detalle» y cada «crear» con lo que todavía no entró. */
export function paraDespues(lineas: readonly LineaParaContar[]): ParaDespues[] {
  const r: ParaDespues[] = [];
  for (const l of lineas) {
    const c = l.conteo;
    if (!c) continue;
    const nombre = nombreDeLinea(l);
    if (c.sinSeparar > 0) r.push({ tipo: "separar", linea: l.clave, cantidad: c.sinSeparar, titulo: `Separar ${textoPrendas(c.sinSeparar)}`, sub: `${nombre} · no se sabe qué prendas son` });
    for (const p of c.pendientes) {
      if (p.estado !== "pendiente" || p.quedan <= 0) continue;
      if (p.tipo === "detalle") r.push({ tipo: "detalle", linea: l.clave, pendiente: p, cantidad: p.quedan, titulo: `${p.producto?.nombre ?? "Prenda"} · ${p.quedan} sin tallas`, sub: `${nombre} · faltan tallas y colores` });
      else r.push({ tipo: "crear", linea: l.clave, pendiente: p, cantidad: p.quedan, titulo: `${p.quedan === 1 ? "1 prenda nueva" : `${p.quedan} prendas nuevas`}${p.descripcion ? ` · ${p.descripcion}` : ""}`, sub: `${nombre} · por crear en el catálogo` });
    }
  }
  return r;
}

/**
 * Lo que pasa al cerrar, en dos cifras (formidable 2026-10-13, cambio 3): cuántas se pueden vender ya (lo que entra al stock: lo que ya
 * estaba y lo que el borrador trae con tallas y colores) y cuántas quedan guardadas en el almacén para terminar después. La prueba
 * ciega leyó «Al stock 0 · 5 para después» como «no quedaron registradas»: se dice qué significa para la tienda.
 */
export function resumenDelCierre(lineas: readonly LineaParaContar[]): { sePuedenVender: number; guardadas: number } {
  let sePuedenVender = 0;
  let guardadas = 0;
  for (const l of lineas) {
    if (!lineaVisible(l)) continue;
    const entra = (l.conteo?.enStock ?? 0) + detalladas(l.conteo?.separado ?? SEPARADO_VACIO);
    sePuedenVender += entra;
    guardadas += Math.max(0, contadasDe(l) - entra);
  }
  return { sePuedenVender, guardadas };
}

/** La línea sobre el botón de cerrar: «Al cerrar: 0 se pueden vender ya · 5 quedan guardadas para terminar después.» */
export function textoResumenDelCierre(r: { sePuedenVender: number; guardadas: number }): string {
  const vender = `${r.sePuedenVender} ${r.sePuedenVender === 1 ? "se puede" : "se pueden"} vender ya`;
  if (r.guardadas === 0) return `Al cerrar: ${vender}.`;
  return `Al cerrar: ${vender} · ${r.guardadas} ${r.guardadas === 1 ? "queda guardada" : "quedan guardadas"} para terminar después.`;
}

export type VeredictoDelCerrado = {
  titulo: string;
  texto: string;
  /** La insignia al lado del título; `null` si el botón ya dice lo que sigue. */
  chip: { tono: "verde" | "neutro"; texto: string } | null;
  /** El botón que lleva a terminar lo primero de «Para después»; `null` si no hay nada pendiente o ya hay prendas para etiquetar. */
  accion: string | null;
};

/**
 * Qué dice el envío cerrado sobre el stock (formidable 2026-10-13, cambio 1). Con algo adentro: listas para etiquetar. Sin nada adentro y
 * con pendientes: un veredicto —están guardadas pero todavía no se pueden vender— y la acción que lo resuelve. La prueba ciega esperaba ver
 * sus prendas en el inventario y no leyó «Todavía nada entró al stock» como «falta esto». Siempre «prendas» (no la categoría: «las 5
 * polos» no concuerda).
 */
export function veredictoDelCerrado(lineas: readonly LineaParaContar[], pendientes: readonly ParaDespues[]): VeredictoDelCerrado {
  const { enStock } = cifrasDelEnvio(lineas);
  if (enStock > 0) {
    return {
      titulo: `${textoPrendas(enStock)} ya ${enStock === 1 ? "está" : "están"} en el stock del almacén`,
      texto: `${enStock === 1 ? "Es la que ya tiene" : "Son las que ya tienen"} tallas y colores. Todo llegó sin etiqueta: lo que sigue es imprimir la etiqueta de precio y colgarlas.`,
      chip: { tono: "verde", texto: "Listas para etiquetar" },
      accion: null,
    };
  }
  const guardadas = pendientes.reduce((a, p) => a + p.cantidad, 0);
  if (guardadas === 0) {
    return { titulo: "Nada entró al stock", texto: "En este envío no se contó ninguna prenda.", chip: { tono: "neutro", texto: "Sin prendas" }, accion: null };
  }
  const una = guardadas === 1;
  const tipos = new Set(pendientes.map((p) => p.tipo));
  const solo = tipos.size === 1 ? pendientes[0].tipo : null;
  const falta =
    solo === "separar"
      ? una ? "decir qué modelo es, con su talla y su color" : "decir qué modelo es cada una, con su talla y su color"
      : solo === "detalle"
        ? una ? "ponerle su talla y su color" : "ponerles su talla y su color"
        : solo === "crear"
          ? una ? "crearla en el catálogo, con su talla y su color" : "crearlas en el catálogo, con su talla y su color"
          : "terminar lo de abajo: qué modelo es cada una, su talla y su color";
  const primera = pendientes[0].tipo;
  // Con un solo pendiente, su «Hacer ahora» está justo abajo: un segundo botón que hace lo mismo hizo dudar a la prueba ciega
  // (formidable, lista aparte del 2026-10-14; Felipe mandó resolverla). Con dos o más, el botón lleva al primero.
  const unSoloPendiente = pendientes.length === 1;
  return {
    titulo: una ? "La prenda está guardada, pero todavía no se puede vender" : `Las ${guardadas} prendas están guardadas, pero todavía no se pueden vender`,
    texto: `${una ? "Está" : "Están"} en el almacén. Para ${una ? "venderla" : "venderlas"} falta ${falta}.${unSoloPendiente ? " Se hace abajo, con «Hacer ahora»." : ""}`,
    chip: null,
    accion: unSoloPendiente
      ? null
      : primera === "separar" ? (una ? "Separarla ahora" : "Separarlas ahora") : primera === "detalle" ? (una ? "Ponerle tallas ahora" : "Ponerles tallas ahora") : una ? "Crearla ahora" : "Crearlas ahora",
  };
}

/**
 * La balanza «Dijeron / Contaste» de la maqueta A: el brazo se inclina hacia donde hay más (±9°, 1,6° por prenda de diferencia) y la
 * insignia dice el veredicto. Sin lo que dijeron (un envío sin aviso), no hay con qué comparar y el brazo queda derecho.
 */
export function veredictoDeLaBalanza(dijeron: number | null, contadas: number): { estado: "neutro" | "verde" | "ambar"; texto: string; angulo: number } {
  if (dijeron == null) return { estado: "neutro", texto: "Llegó sin aviso: no hay con qué comparar", angulo: 0 };
  const d = contadas - dijeron;
  const angulo = Math.max(-9, Math.min(9, d * 1.6));
  if (contadas === 0) return { estado: "neutro", texto: "Todavía no contaste", angulo };
  if (d === 0) return { estado: "verde", texto: "Cuadra con lo que dijeron", angulo: 0 };
  return { estado: "ambar", texto: d < 0 ? `Faltan ${-d}` : `Sobran ${d}`, angulo };
}

/**
 * Lo que dice el riel bajo cada paso (maqueta A): en «¿Qué llegó?», de qué envío se trata; en «Contar», cuánto va contado y cuánto queda
 * para después; en «Cerrar», qué se hace ahí o que ya se cerró.
 */
export function subtitulosDelRiel(p: {
  estado: string;
  numero: string;
  enviado: number;
  sinAviso: boolean;
  proveedor: string | null;
  contadas: number;
  paraDespues: number;
}): Record<"1" | "2" | "3", string> {
  const llego = p.sinAviso ? [p.proveedor, "sin aviso"].filter(Boolean).join(" · ") : `${p.numero} · ${textoPrendas(p.enviado)}`;
  const contar =
    p.estado === "en_camino"
      ? "Por categoría"
      : p.contadas === 0
        ? "Por categoría"
        : `${p.contadas.toLocaleString("es-PE")} ${p.contadas === 1 ? "contada" : "contadas"}${p.paraDespues > 0 ? ` · ${p.paraDespues.toLocaleString("es-PE")} para después` : ""}`;
  return { "1": llego, "2": contar, "3": p.estado === "cerrado" ? "Cerrado" : "Lo que no cuadró y quién cerró" };
}

/** La insignia de la cabecera (maqueta A: «1 fardo en camino», «6 pendientes del fardo»): en qué está el envío, en una línea. */
export function insigniaDelEnvio(estado: string, pendientes: number): { tono: "pizarra" | "ambar" | "verde" | "neutro"; texto: string } {
  if (estado === "en_camino") return { tono: "pizarra", texto: "En camino" };
  if (estado === "abierto") return { tono: "ambar", texto: "Contando" };
  if (estado === "cerrado") return pendientes > 0 ? { tono: "pizarra", texto: `${pendientes} ${pendientes === 1 ? "pendiente" : "pendientes"} del envío` } : { tono: "verde", texto: "Recibido" };
  return { tono: "neutro", texto: "Anulado" };
}

/**
 * La columna «Para después» del cierre (maqueta A): qué queda guardado de una línea y por qué, una frase por cosa —una prenda sin tallas,
 * las nuevas (descritas o no) y lo que nadie separó—. Vacía si todo entra al stock.
 */
export function detalleParaDespues(l: LineaParaContar): string[] {
  const c = l.conteo;
  if (!c) return [];
  const cat = (l.categoria?.nombre ?? "prendas").toLowerCase();
  const r: string[] = [];
  for (const p of c.separado.prendas) if (p.variantes === null && p.cantidad > 0) r.push(`${p.nombre ?? "Prenda"} · ${p.cantidad} sin tallas ni colores`);
  for (const n of c.separado.nuevas) {
    if (n.cantidad <= 0) continue;
    r.push(n.descripcion ? `${n.descripcion} · ${n.cantidad} por crear` : `${n.cantidad} ${cat} ${n.cantidad === 1 ? "nueva" : "nuevas"} por crear`);
  }
  const sinSeparar = Math.max(0, contadasDe(l) - (c.enStock ?? 0) - totalSeparado(c.separado));
  if (sinSeparar > 0) r.push(`${sinSeparar} ${cat} sin separar`);
  return r;
}

/** Las prendas que ya se pueden vender, juntas por nombre («Blusa Aurora ×12»): lo bueno de lo recibido (sin las dañadas), de más a menos. */
export function prendasQueEntraron(recibidos: readonly { prenda: string | null; cantidad: number; danadas: number }[] | null): { nombre: string; cantidad: number }[] {
  const por = new Map<string, number>();
  for (const r of recibidos ?? []) {
    const buenas = r.cantidad - r.danadas;
    if (buenas > 0) por.set(r.prenda ?? "Prenda", (por.get(r.prenda ?? "Prenda") ?? 0) + buenas);
  }
  return [...por.entries()].map(([nombre, cantidad]) => ({ nombre, cantidad })).sort((a, b) => b.cantidad - a.cantidad || a.nombre.localeCompare(b.nombre, "es"));
}

/** Lo que entró al stock del envío y lo que falta: las dos cifras del cierre. */
export function cifrasDelEnvio(lineas: readonly LineaParaContar[]): { contadas: number; enStock: number; porDetallar: number; dijeron: number | null } {
  let contadas = 0;
  let enStock = 0;
  let dijeron = 0;
  let conGuia = false;
  for (const l of lineas) {
    contadas += contadasDe(l);
    enStock += l.conteo?.enStock ?? 0;
    if (l.dijeron != null) {
      dijeron += l.dijeron;
      conGuia = true;
    }
  }
  return { contadas, enStock, porDetallar: Math.max(0, contadas - enStock), dijeron: conGuia ? dijeron : null };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// «Hacer ahora» (`resolver_pendiente_envio`), reabrir y sin aviso
// ---------------------------------------------------------------------------------------------------------------------------------

export type ArgsResolverPendiente = {
  p_despacho_id: string;
  p_despacho_item_id: string | null;
  p_extra_posicion: number | null;
  p_pendiente_id: string | null;
  p_separado: ReturnType<typeof separadoParaBase>;
  p_confirma_costo: boolean;
  p_token: string;
};

export function argsResolverPendiente(p: {
  despachoId: string;
  linea: Pick<LineaParaContar, "linea" | "conteo">;
  pendienteId: string | null;
  separado: Separado;
  confirmaCosto?: boolean;
  token: string;
}): ArgsResolverPendiente {
  return {
    p_despacho_id: p.despachoId,
    p_despacho_item_id: p.linea.linea?.id ?? null,
    p_extra_posicion: p.linea.linea ? null : (p.linea.conteo?.extraPosicion ?? null),
    p_pendiente_id: p.pendienteId,
    p_separado: separadoParaBase(p.separado),
    p_confirma_costo: p.confirmaCosto ?? false,
    p_token: p.token,
  };
}

export function leerResuelto(data: unknown): { entraron: number; quedaronPendientes: number; repetido: boolean; conteo: ConteoDeLinea | null } | null {
  const r = objeto(Array.isArray(data) ? data[0] : data);
  if (!r) return null;
  return { entraron: entero(r.entraron), quedaronPendientes: entero(r.quedaron_pendientes), repetido: booleano(r.repetido) ?? false, conteo: leerConteoDeLinea(r.linea) };
}

/** «4 prendas entraron al stock» / «2 quedaron por crear». */
export function textoResuelto(r: { entraron: number; quedaronPendientes: number }): string {
  const partes = [];
  if (r.entraron) partes.push(`${textoPrendas(r.entraron)} ${r.entraron === 1 ? "entró" : "entraron"} al stock`);
  if (r.quedaronPendientes) partes.push(`${r.quedaronPendientes} ${r.quedaronPendientes === 1 ? "quedó" : "quedaron"} para después`);
  return partes.join(" · ") || "Listo";
}

/** Por qué no se puede reabrir, en palabras de tienda (la pista de `fn_envio_reabrir_bloqueo`). */
export function textoNoSeReabre(porQueNo: string | null): string {
  if (porQueNo === "reabrir_deuda_resuelta") return "Compras ya resolvió parte de lo que faltó: la corrección la hace Compras";
  if (porQueNo === "reabrir_reposicion_saldo") return "Lo de más de este envío ya saldó lo que el proveedor debía: la corrección la hace Compras";
  return "Ya no se puede reabrir";
}

export const leerEnvioAbierto = (data: unknown): { despachoId: string; numero: string | null; version: number | null; repetido: boolean } | null => {
  const r = objeto(Array.isArray(data) ? data[0] : data);
  const id = r ? texto(r.despacho_id) : null;
  return r && id ? { despachoId: id, numero: texto(r.numero), version: cifra(r.version), repetido: booleano(r.repetido) ?? false } : null;
};

// ---------------------------------------------------------------------------------------------------------------------------------
// El aviso de la sede (decisión 4: Inicio, la cabecera de Recibir y Catálogo ▸ Productos ▸ Por crear)
// ---------------------------------------------------------------------------------------------------------------------------------

export type PendientesDeLaSede = {
  porSeparar: number;
  porDetallar: number;
  porCrear: number;
  total: number;
  desde: string | null;
  envios: { despachoId: string; numero: string | null; cerradoEn: string | null; porSeparar: number; porDetallar: number; porCrear: number }[];
};

export const SIN_PENDIENTES: PendientesDeLaSede = { porSeparar: 0, porDetallar: 0, porCrear: 0, total: 0, desde: null, envios: [] };

/**
 * «Llegó esta semana» lee los lotes, y un envío cerrado sin nada en el stock no tiene lote: la prueba ciega creyó que no había llegado nada
 * (formidable, lista aparte del 2026-10-14; Felipe mandó resolverla). Lo que quedó por terminar de los envíos cerrados desde `desde` (un día
 * de Lima): cuántos envíos y cuántas prendas. Esas filas ya están en el aviso de arriba; aquí solo se cuentan para no decir «no llegó nada».
 */
export function guardadoDesde(p: PendientesDeLaSede | null, desde: string): { envios: number; prendas: number } {
  const envios = (p?.envios ?? []).filter((e) => {
    const dia = diaLima(e.cerradoEn);
    return dia != null && dia >= desde;
  });
  return { envios: envios.length, prendas: envios.reduce((a, e) => a + e.porSeparar + e.porDetallar + e.porCrear, 0) };
}

/** Lo que dice «Llegó esta semana» de lo guardado: el vacío (si no entró nada al stock) o la línea de abajo (si algo entró). `null` si no hay. */
export function textoGuardadoEstaSemana(g: { envios: number; prendas: number }, sede: string, hayEnElStock: boolean): string | null {
  if (g.prendas === 0) return null;
  const cuantas = `${g.prendas.toLocaleString("es-PE")} ${g.prendas === 1 ? "prenda" : "prendas"}`;
  return hayEnElStock
    ? `Además llegaron ${cuantas} que todavía no están en el stock: arriba, en lo que falta terminar.`
    : `Esta semana no entró nada al stock de ${sede}, pero llegaron ${cuantas} que todavía están por terminar: arriba, en lo que falta terminar.`;
}

export function leerPendientesDeLaSede(data: unknown): PendientesDeLaSede {
  const r = objeto(Array.isArray(data) ? data[0] : data);
  if (!r) return SIN_PENDIENTES;
  return {
    porSeparar: entero(r.por_separar),
    porDetallar: entero(r.por_detallar),
    porCrear: entero(r.por_crear),
    total: entero(r.total),
    desde: texto(r.desde),
    envios: lista(r.envios)
      .map((e) => {
        const o = objeto(e);
        const id = o ? texto(o.despacho_id) : null;
        return o && id
          ? { despachoId: id, numero: texto(o.numero), cerradoEn: texto(o.cerrado_en), porSeparar: entero(o.por_separar), porDetallar: entero(o.por_detallar), porCrear: entero(o.por_crear) }
          : null;
      })
      .filter((e): e is PendientesDeLaSede["envios"][number] => e !== null),
  };
}

/** «8 prendas para terminar en 2 envíos» (o null si no hay nada). */
export function textoAvisoPendientes(p: Pick<PendientesDeLaSede, "total" | "envios">): string | null {
  if (p.total <= 0) return null;
  const envios = p.envios.length;
  return `${textoPrendas(p.total)} para terminar${envios > 1 ? ` en ${envios} envíos` : ""}`;
}

/** Cuántos días lleva lo más antiguo (para el tono del aviso: más de 7 días es lo que ADR-0393 vigila). */
export function diasDesde(desde: string | null, hoy: Date = new Date()): number | null {
  if (!desde) return null;
  const t = Date.parse(desde);
  return Number.isFinite(t) ? Math.max(0, Math.floor((hoy.getTime() - t) / 86_400_000)) : null;
}

/**
 * Lo que se escribe en la caja del contador. Solo dígitos, hasta 4 (como la matriz: una cantidad imposible ni se puede escribir), así la
 * caja muestra siempre lo que se guarda. Vacío NO es 0: es «todavía escribiendo», y no se guarda nada (chaos 2026-10-13: borrar para
 * reescribir guardaba un 0, y una categoría de fuera de la guía en 0 desaparecía de la lista con la persona escribiendo).
 */
export function leerContadas(t: string): { texto: string; contadas: number | null } {
  const texto = limpiarCantidad(t);
  return { texto, contadas: texto === "" ? null : Number(texto) };
}

/**
 * Las categorías que se ven en la lista del conteo: las de la guía, lo de fuera de la guía con algo contado, lo agregado en esta visita
 * (aunque esté en 0) y la que se está contando (aunque la persona la haya bajado a 0: si se va de la lista, no la puede volver a subir).
 */
export function lineasALaVista(lineas: readonly LineaParaContar[], agregados: ReadonlySet<string>, foco: ClaveLinea | null): LineaParaContar[] {
  return lineas.filter((l) => lineaVisible(l) || agregados.has(l.clave) || l.clave === foco);
}

/**
 * El error de un guardado de la recepción en palabras de tienda. La base ya habla castellano (sus pistas `recepcion_*`); la red caída no
 * se muestra cruda. Como cada guardado lleva su token (un reintento con el mismo token no repite nada), se puede decir que vuelva a
 * intentar sin miedo, aunque no se sepa si llegó a guardarse.
 */
export function mensajeAlGuardar(error: { message?: string | null; hint?: string | null; code?: string | null; details?: string | null } | null | undefined, contexto: string): string {
  const deLaRecepcion = mensajeDeLaRecepcion(error);
  if (deLaRecepcion) return deLaRecepcion;
  const e = error ? { message: error.message ?? "", code: error.code ?? null, details: error.details ?? null, hint: error.hint ?? null } : null;
  if (e && esFalloDeRed(e)) {
    return `Se cortó la conexión al ${contexto}: no sabemos si llegó a guardarse. Revisa el internet y vuelve a intentarlo: si ya se guardó, no se repite.`;
  }
  return traducirError(e, contexto);
}
