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
import type { CampoDeGuia } from "./guia-campos";
import { leerNumero, aTexto } from "./orden-compra-alta";
import {
  CAUSAS_FALTANTE,
  CAUSAS_SOBRANTE,
  OPCION_OTRO,
  VALOR_OTRO,
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
/** Cambiar el precio de venta de una prenda de este envío, desde la recepción (20261024225000). */
export const RPC_PRECIO_RECEPCION = "cambiar_precio_en_recepcion";
/** ¿Se podría guardar este precio?, con el motivo si no: la misma regla que `cambiar_precio_en_recepcion`, sin guardar nada (`20261026180000`). Lectura. */
export const RPC_VALIDAR_PRECIO = "validar_precio_en_recepcion";
export const RPC_RESOLVER_PENDIENTE = "resolver_pendiente_envio";
/** «Crear ahora» deja la prenda creada en «Para después» (ADR-0393, 2026-10-26; migración `20261026163000`). */
export const RPC_LIGAR_PRENDA = "ligar_prenda_a_pendiente";
export const RPC_REABRIR_ENVIO = "reabrir_envio";
export const RPC_SIN_AVISO = "abrir_envio_sin_aviso";
/** Felipe 2026-10-14: el proveedor de un envío sin aviso que se abrió sin saberlo. */
export const RPC_PONER_PROVEEDOR = "poner_proveedor_envio";
/** Felipe 2026-10-14: el número de guía se escribe o corrige al cerrar (`20261014205000`). */
export const RPC_CORREGIR_GUIA = "corregir_guia_envio";
/** Felipe 2026-10-27: la foto de un papel de la compra que llegó sin ella, desde «Los papeles de la compra» (`20261027210000`). Solo agrega. */
export const RPC_FOTO_PAPEL = "agregar_foto_papel";

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

/** Lo que se escribe de una nueva, como se guarda: sin espacios de más y con el tope. Dos escrituras iguales dan la misma. */
const limpiarDescripcion = (d: string): string => d.trim().replace(/\s+/g, " ").slice(0, TOPES_CONTEO.descripcionNueva);

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
  const texto = limpiarDescripcion(descripcion);
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
 * «Crear ahora» de una nueva ya descrita: la prenda ya existe en el catálogo, así que esas nuevas dejan de estar «por crear» y pasan a ser una
 * prenda conocida, todavía sin tallas ni colores (de ahí en adelante le toca «Tallas y colores ahora»). Cuántas eran se conserva: lo
 * contado no cambia ni se pierde. Si esa prenda ya estaba separada (se creó una que ya existía, «Usar esa prenda»), se juntan: una prenda va
 * una sola vez, como pide la base. Sin esa descripción en lo separado, no toca nada.
 */
export function prendaCreadaDeNueva(s: Separado, descripcion: string, prenda: { productoId: string; nombre: string | null; codigo: string | null }): Separado {
  const nueva = s.nuevas.find((x) => x.descripcion === descripcion);
  if (!nueva) return s;
  return sumarPrenda({ ...s, nuevas: s.nuevas.filter((x) => x !== nueva) }, prenda, nueva.cantidad);
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
  /** ADR-0519: el costo propio de las prendas separadas de esta línea que no cuestan lo que la línea ({producto: costo}); las demás, el de la línea. */
  costosPrendas: Readonly<Record<string, number>>;
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

/** `costos_prendas` del conteo: `{ producto: costo }`. Lo que no es un monto se descarta (la base lo valida al escribirlo). */
function leerCostosPrendas(v: unknown): Record<string, number> {
  const o = objeto(v);
  const r: Record<string, number> = {};
  if (!o) return r;
  for (const [producto, costo] of Object.entries(o)) {
    const n = cifra(costo);
    if (producto && n != null && n >= 0) r[producto] = n;
  }
  return r;
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
    costosPrendas: leerCostosPrendas(r.costos_prendas),
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

/** Lee el precio de venta escrito: obligatorio, mayor que cero y hasta S/ 5 000 (el tope de la base). Vacío no es un problema todavía: aún no se pidió. */
export function leerPrecioNuevo(t: string): { valor: number | null; problema: string | null } {
  const l = leerNumero(t, 2);
  if (l.tipo === "vacio") return { valor: null, problema: null };
  if (l.tipo === "mal") return { valor: null, problema: "Escribe el precio solo con números (ej. 79.90)" };
  if (l.escalado <= 0) return { valor: null, problema: "El precio tiene que ser mayor que cero" };
  if (l.escalado > 500000) return { valor: null, problema: "El precio va hasta S/\u00a05\u00a0000" };
  return { valor: l.escalado / 100, problema: null };
}

/** Un cambio de precio que quien cierra va a confirmar: de compra (la línea) o de venta (la prenda). */
export type CambioDePrecio = {
  tipo: "compra" | "venta";
  nombre: string;
  antes: number | null;
  despues: number;
  alcance: "todas" | "sede" | null;
  /** Solo en una venta: las tallas de la prenda valían distinto (del más barato al más caro). Entonces `antes` no existe y el precio nuevo las iguala. */
  rango?: RangoDePrecio;
};

/** «Precio de compra · Camisas y Blusas · S/ 18.50 → S/ 19.80» o, de venta, con dónde vale. Con tallas de precios distintos, el rango («S/ 69.90 a S/ 79.90 → …»). */
export function textoCambioDePrecio(c: CambioDePrecio, sede: string): string {
  const monto = (n: number) => `S/\u00a0${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const donde = c.tipo === "venta" ? (c.alcance === "sede" ? ` · solo ${sede}` : " · todas las sedes") : "";
  const antes = c.rango ? `${monto(c.rango.desde)} a ${monto(c.rango.hasta)} → ` : c.antes != null ? `${monto(c.antes)} → ` : "sin precio → ";
  return `${antes}${monto(c.despues)}${donde}`;
}

/**
 * Lo que hay que saber cuando un precio de venta pasa por encima de tallas que valían distinto: todas quedan al mismo precio (en la sede, si
 * el precio vale solo para ella). `null` si las tallas valían lo mismo o no es un precio de venta.
 */
export function textoIgualaTallas(c: CambioDePrecio, sede: string): string | null {
  if (c.tipo !== "venta" || !c.rango) return null;
  return c.alcance === "sede" ? `Hoy las tallas valen distinto: en ${sede} todas pasan a venderse a este precio.` : "Hoy las tallas valen distinto: todas pasan a valer este precio.";
}

/** El precio de compra de una línea cambió: lo escrito (válido) contra lo que traía. Sin cambio, o con algo mal escrito (eso lo dice el campo), `null`. */
export function cambioDePrecioDeCompra(nombre: string, antes: string, ahora: string): CambioDePrecio | null {
  const nuevo = leerCostoCierre(ahora);
  if (nuevo.problema || nuevo.valor == null) return null;
  const previo = leerCostoCierre(antes).valor;
  return previo === nuevo.valor ? null : { tipo: "compra", nombre, antes: previo, despues: nuevo.valor, alcance: null };
}

/** El precio de venta de una prenda cambió: lo escrito (válido) contra su precio de hoy. Con precios distintos entre tallas (un rango) cualquier
 *  precio escrito es un cambio; vacío o igual al de hoy, no. */
export function cambioDePrecioDeVenta(nombre: string, actual: { desde: number; hasta: number } | null | undefined, escrito: string, alcance: "todas" | "sede"): CambioDePrecio | null {
  const nuevo = leerPrecioNuevo(escrito);
  if (nuevo.problema || nuevo.valor == null || actual === undefined) return null;
  const hoy = actual && actual.desde === actual.hasta ? actual.desde : null;
  const tallasDistintas = actual && actual.desde !== actual.hasta ? { rango: { desde: actual.desde, hasta: actual.hasta } } : {};
  return hoy === nuevo.valor ? null : { tipo: "venta", nombre, antes: hoy, despues: nuevo.valor, alcance, ...tallasDistintas };
}

/** Un precio de hoy: uno solo, o de el más barato al más caro cuando las tallas valen distinto. */
export type RangoDePrecio = { desde: number; hasta: number };

/** Con qué alcance nace el precio de venta de una prenda (Felipe 2026-10-26): la sede donde se recibe. «Todas las sedes» se elige a propósito. */
export const ALCANCE_DE_FABRICA = "sede" as const;

/** Lo que la pantalla sabe del precio de venta de una prenda: su precio de hoy, lo escrito, dónde vale y por qué la base no lo aceptaría. */
export type PrecioEditado = {
  /** El precio general de hoy (`undefined` mientras se lee, `null` si no hay). */
  actual: RangoDePrecio | null | undefined;
  /** El de ESTA sede hoy: el propio de la tienda si lo tiene y, si no, el general. `undefined` si no se pudo leer (entonces vale el general). */
  actualSede?: RangoDePrecio | null | undefined;
  valor: string;
  alcance: "todas" | "sede";
  /** Por qué la base no guardaría lo escrito (`validar_precio_en_recepcion`): sale junto al campo y se borra al cambiar el precio o el alcance. */
  rechazo?: string | null;
};

/** El precio de hoy contra el que se compara lo escrito: el de la sede si el precio vale solo para ella, si no el general. */
export function hoyDelPrecio(e: Pick<PrecioEditado, "actual" | "actualSede" | "alcance">): RangoDePrecio | null | undefined {
  return e.alcance === "sede" && e.actualSede !== undefined ? e.actualSede : e.actual;
}

/** El precio de hoy como se escribe en el campo («79.90»); vacío si no hay uno solo (un rango, o nada). */
export function precioComoTexto(r: RangoDePrecio | null | undefined): string {
  return r && r.desde === r.hasta ? r.desde.toFixed(2) : "";
}

/**
 * Los cambios de precio de venta de estas prendas, una vez por prenda (aunque esté dos veces), con su nombre: lo escrito contra su precio de
 * hoy (el de la sede o el general, según dónde valga). Lo usan el cierre (las prendas separadas al contar) y «Hacer ahora» (las que se acaban
 * de identificar en «Para después»).
 */
export function cambiosDeVentaDe(
  prendas: readonly { productoId: string; nombre: string | null; codigo: string | null }[],
  ventas: Readonly<Record<string, PrecioEditado>>,
): (CambioDePrecio & { productoId: string })[] {
  const r: (CambioDePrecio & { productoId: string })[] = [];
  for (const p of prendas) {
    const e = ventas[p.productoId];
    if (!e || r.some((x) => x.productoId === p.productoId)) continue;
    const c = cambioDePrecioDeVenta(p.nombre ?? p.codigo ?? "La prenda", hoyDelPrecio(e), e.valor, e.alcance);
    if (c) r.push({ ...c, productoId: p.productoId });
  }
  return r;
}

/**
 * Los precios escritos que no se pueden guardar (no es un número, es cero o pasa de S/ 5 000). Un precio escrito mal NO se ignora al guardar:
 * se dice cuál y por qué, y se lleva al campo. Vacío no es un problema (es «no lo cambio»).
 */
export function problemasDePrecio(
  prendas: readonly { productoId: string; nombre: string | null; codigo: string | null }[],
  ventas: Readonly<Record<string, PrecioEditado>>,
): { productoId: string; nombre: string; texto: string }[] {
  const r: { productoId: string; nombre: string; texto: string }[] = [];
  for (const p of prendas) {
    const e = ventas[p.productoId];
    if (!e || r.some((x) => x.productoId === p.productoId)) continue;
    const { problema } = leerPrecioNuevo(e.valor);
    if (problema) r.push({ productoId: p.productoId, nombre: p.nombre ?? p.codigo ?? "La prenda", texto: problema });
  }
  return r;
}

/** El aviso de un precio que no se puede guardar: «Revisa el precio de venta de Blusa Emma: <motivo>. No se guardó nada.» (con el punto que el motivo no traiga). */
export function avisoDePrecioRechazado(nombre: string, motivo: string, consecuencia: string): string {
  const m = motivo.trim().replace(/[\s.]+$/, "");
  return `Revisa el precio de venta de ${nombre}: ${m}. ${consecuencia}`;
}

/**
 * Lo que contestó `validar_precio_en_recepcion`: «ok»; «rechazado» con el motivo en palabras de tienda (el de la base, que no dice cuánto cuesta
 * la prenda: el costo es dato con permiso); o «sin_respuesta» si no se pudo preguntar (la función todavía no está en la base, un corte de red):
 * entonces se sigue y la base decide al guardar, como antes.
 */
export type ResultadoDeValidar = { estado: "ok" } | { estado: "rechazado"; texto: string } | { estado: "sin_respuesta" };

export function leerValidacionDePrecio(data: unknown, error: { message?: string | null; hint?: string | null; code?: string | null } | null | undefined): ResultadoDeValidar {
  if (error) return { estado: "sin_respuesta" };
  const r = objeto(Array.isArray(data) ? data[0] : data);
  const ok = r ? booleano(r.ok) : null;
  if (!r || ok === null) return { estado: "sin_respuesta" };
  if (ok) return { estado: "ok" };
  const motivo = texto(r.motivo);
  const veredicto = resultadoDelPrecio({ hint: texto(r.hint), message: motivo, code: texto(r.codigo) });
  return { estado: "rechazado", texto: typeof veredicto === "object" ? veredicto.texto : (motivo ?? "No se puede guardar ese precio.") };
}

/**
 * Qué dice la base al cambiar el precio de venta desde «Hacer ahora» (`cambiar_precio_en_recepcion` con el envío cerrado): «ok»; «ajena» —la
 * prenda todavía no es de este envío (se acaba de identificar y aún no entró ni quedó pendiente): se vuelve a intentar con la prenda
 * adentro—; o el texto de por qué no se pudo. Sin la migración pegada, la base sigue diciendo «solo con el envío abierto»: se avisa con
 * palabras de tienda, no con el mensaje de la base («antes de cerrarlo»), que aquí confundiría.
 */
export function resultadoDelPrecio(error: { message?: string | null; hint?: string | null; code?: string | null; details?: string | null } | null | undefined): "ok" | "ajena" | { texto: string } {
  if (!error) return "ok";
  if (error.hint === "precio_prenda_ajena") return "ajena";
  if (error.hint === "precio_envio_no_abierto") return { texto: "Todavía no se puede cambiar el precio desde aquí. Déjalo como estaba o cámbialo en Catálogo ▸ Productos." };
  return { texto: mensajeAlGuardar(error, "cambiar el precio de venta") };
}

/** Un regalo de FUERA de la guía entra a S/ 0 (obsequio, Felipe 2026-10-28): no se pide ni se lee su costo, ni el de sus prendas. Lo que sobra de una línea
 *  de la guía como regalo sigue con el costo de su orden. Es la regla de `cerrar_conteo_envio` (migración 20261028182000). */
export const esRegaloFuera = (l: Pick<LineaParaContar, "linea">, d: Pick<DecisionCierre, "sobranteCausa">): boolean => !l.linea && d.sobranteCausa === "regalo";

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
    const sobra = (dif != null && dif > 0) || (!l.linea && !p.sinAviso && contadasDe(l) > 0);
    // «Otro» se cuenta en una línea (la nota de la línea): sin ella la base no cierra (`recepcion_sobrante_otro`).
    if (sobra && d.sobranteCausa === VALOR_OTRO && !d.nota.trim()) f.push({ clave: "causa", linea: l.clave, texto: `Cuenta qué fue lo de más de ${nombre}` });
    const regalo = esRegaloFuera(l, d);
    if (!l.linea && !p.sinAviso && contadasDe(l) > 0) {
      if (!d.sobranteCausa) f.push({ clave: "causa", linea: l.clave, texto: `Di qué pasa con ${nombre} (no estaba en la guía)` });
      if (!regalo && leerCostoCierre(d.costo).valor == null) f.push({ clave: "costo", linea: l.clave, texto: `Escribe el costo de ${nombre}` });
    }
    if (!regalo && leerCostoCierre(d.costo).problema) f.push({ clave: "costo", linea: l.clave, texto: `Corrige el costo de ${nombre}` });
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
    if (!l.linea && contadasDe(l) > 0 && !esRegaloFuera(l, p.decisiones[l.clave] ?? DECISION_VACIA)) {
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
  /** ADR-0519: el costo propio de las prendas separadas de esta línea que cuestan distinto de la línea ({producto: costo}). Sin nada propio, no va. */
  costos_prendas?: Record<string, number>;
};

/** El costo propio de cada prenda de una línea, como se escribe: `{ clave: "55.50" }`. Solo lo que quien cierra tocó. La clave es el producto de la
 *  prenda ya identificada, o `nueva:<descripción>` para una prenda nueva descrita que todavía no se crea (la base la nombra igual). */
export type CostosDePrendas = Readonly<Record<string, string>>;

/** La clave del costo de una prenda nueva descrita (ADR-0519): su descripción tal cual quedó en el conteo. */
export const claveCostoDeNueva = (descripcion: string): string => `nueva:${descripcion}`;

/** Lo que dice el campo de costo de una prenda: lo suyo si lo tocó (aunque lo haya dejado vacío); si no, el costo de su línea. */
export const costoDePrendaTexto = (textoLinea: string, propios: CostosDePrendas | undefined, clave: string): string =>
  propios && Object.hasOwn(propios, clave) ? (propios[clave] ?? "") : textoLinea;

/** Cada prenda de una línea que se puede costear: las identificadas (con producto) y las nuevas ya descritas. Lo que no tiene nombre todavía no
 *  está aquí (Felipe 2026-10-26: no se cambia el costo de algo que no se sabe qué es). */
export type PrendaConCosto = { clave: string; nombre: string; unidades: number; nueva: boolean; producto: PrendaSeparada | null };

export function prendasConCosto(l: Pick<LineaParaContar, "conteo">): PrendaConCosto[] {
  const sep = l.conteo?.separado;
  if (!sep) return [];
  return [
    ...sep.prendas.map((p): PrendaConCosto => ({ clave: p.productoId, nombre: p.nombre ?? p.codigo ?? "la prenda", unidades: p.cantidad, nueva: false, producto: p })),
    ...sep.nuevas.flatMap((n): PrendaConCosto[] =>
      n.descripcion ? [{ clave: claveCostoDeNueva(n.descripcion), nombre: n.descripcion, unidades: n.cantidad, nueva: true, producto: null }] : [],
    ),
  ];
}

/** Cuántas unidades contadas de la línea todavía no son una prenda con nombre (ni identificada ni descrita): entran con el costo de la línea. */
export function unidadesSinIdentificar(l: Pick<LineaParaContar, "conteo">): number {
  const contadas = l.conteo?.contadas ?? 0;
  return Math.max(0, contadas - prendasConCosto(l).reduce((a, p) => a + p.unidades, 0));
}

/** Lo que cada prenda cuesta de verdad al cerrar: su costo propio si es un monto y distinto del de la línea; vacío o igual al de la línea, el de la línea. */
export function costosPropiosParaCerrar(l: LineaParaContar, textoLinea: string, propios: CostosDePrendas | undefined): Record<string, number> {
  const r: Record<string, number> = {};
  if (!propios) return r;
  const deLinea = leerCostoCierre(textoLinea).valor;
  for (const p of prendasConCosto(l)) {
    if (!Object.hasOwn(propios, p.clave)) continue;
    const c = leerCostoCierre(propios[p.clave] ?? "");
    if (c.problema || c.valor == null || c.valor === deLinea) continue;
    r[p.clave] = c.valor;
  }
  return r;
}

/** Los costos propios que están mal escritos, para frenar «Cerrar» antes de ir a la base (la base los rechaza con las mismas reglas). */
export function costosDePrendaConProblema(
  lineas: readonly LineaParaContar[],
  propios: Readonly<Record<string, CostosDePrendas>>,
): { linea: ClaveLinea; productoId: string; nombre: string; problema: string }[] {
  const r: { linea: ClaveLinea; productoId: string; nombre: string; problema: string }[] = [];
  for (const l of lineas) {
    const t = propios[l.clave];
    if (!t) continue;
    for (const p of prendasConCosto(l)) {
      if (!Object.hasOwn(t, p.clave)) continue;
      const c = leerCostoCierre(t[p.clave] ?? "");
      if (c.problema) r.push({ linea: l.clave, productoId: p.clave, nombre: p.nombre, problema: c.problema });
    }
  }
  return r;
}

/** `p_lineas` de `cerrar_conteo_envio`: una por conteo, con la versión que se vio. Las causas que ya no aplican se sueltan (la base las
 *  rechaza: «De … no falta nada»). */
export function lineasParaCerrar(
  lineas: readonly LineaParaContar[],
  decisiones: Readonly<Record<string, DecisionCierre>>,
  sinAviso: boolean,
  costosPrendas: Readonly<Record<string, CostosDePrendas>> = {},
): LineaParaCerrar[] {
  return lineas
    .filter((l) => l.conteo !== null)
    .map((l) => {
      const c = l.conteo as ConteoDeLinea;
      const d = decisiones[l.clave] ?? DECISION_VACIA;
      const dif = diferenciaDe(l);
      const fuera = !l.linea;
      const sobrante = (dif != null && dif > 0) || (fuera && !sinAviso && c.contadas > 0) ? d.sobranteCausa : null;
      // Lo que llega sin aviso no pregunta la causa (`sobrante` null): ahí no hay regalo que valga.
      const regalo = !l.linea && sobrante === "regalo";
      // Un regalo de fuera de la guía entra a S/ 0: se manda 0 y ningún costo propio (la base los ignora igual).
      const costo = regalo ? 0 : leerCostoCierre(d.costo).valor;
      const propios = regalo ? {} : costosPropiosParaCerrar(l, d.costo, costosPrendas[l.clave]);
      return {
        ...(l.linea ? { despacho_item_id: l.linea.id } : { extra_posicion: c.extraPosicion ?? 0 }),
        version: c.version,
        costo_unitario: fuera && sinAviso && costo == null ? null : costo,
        confirma_costo: regalo ? false : d.confirmaCosto,
        faltante_causa: dif != null && dif < 0 ? d.faltanteCausa : null,
        sobrante_causa: sobrante,
        // La nota de la línea solo es «lo que pasó» de un «Otro»: con otra causa no hay dónde escribirla y lo que quedó escrito antes no viaja.
        nota: sobrante === VALOR_OTRO && d.nota.trim() ? d.nota.trim().slice(0, TOPES_CONTEO.nota) : null,
        ...(Object.keys(propios).length > 0 ? { costos_prendas: propios } : {}),
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
    opciones.push({ ...OPCION_OTRO });
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

// ---- Lo que anotó la compra: las prendas exactas de una línea, de un toque a «¿Qué blusas son?» ---------------------------------------

/**
 * Una prenda que se anotó al comprar, tal como la trae la línea del envío: la del catálogo que se eligió (`prendaElegida`) o, si se anotó
 * «algo nuevo», la que se escribió por su nombre (`descripcion`). Cada línea del envío sale de UNA línea de la compra, así que trae una;
 * la lista deja lugar para más sin cambiar a quien la dibuja.
 */
export type PrendaAnotada = {
  /** La del catálogo; `null` si se anotó solo por su nombre (no está en el catálogo: pasa como «nueva»). */
  productoId: string | null;
  nombre: string;
  codigo: string | null;
  /** Cuántas dijeron que venían de esta prenda. */
  cantidad: number;
};

/** Las prendas exactas que se anotaron al comprar para esta línea, con cuántas eran. Nada de lo que no venía en la guía. */
export function prendasAnotadasDe(l: Pick<LineaParaContar, "linea" | "dijeron">): PrendaAnotada[] {
  if (!l.linea || l.dijeron == null || l.dijeron <= 0) return [];
  const elegida = l.linea.prendaElegida;
  if (elegida) return [{ productoId: elegida.productoId, nombre: elegida.nombre ?? l.linea.descripcion ?? "Prenda del catálogo", codigo: elegida.codigo, cantidad: l.dijeron }];
  const nombre = limpiarDescripcion(l.linea.descripcion ?? "");
  return nombre ? [{ productoId: null, nombre, codigo: null, cantidad: l.dijeron }] : [];
}

/** ¿Ya está en «¿Qué blusas son?»? La del catálogo, por su prenda; la anotada solo por nombre, por su descripción (sin mayúsculas). */
export function estaSeparada(s: Separado, p: PrendaAnotada): boolean {
  if (p.productoId) return s.prendas.some((x) => x.productoId === p.productoId);
  const clave = p.nombre.toLocaleLowerCase("es");
  return s.nuevas.some((n) => n.descripcion?.toLocaleLowerCase("es") === clave);
}

/**
 * Pasa una anotada a lo separado, como si se hubiera elegido desde el buscador: la del catálogo, como prenda conocida (sin tallas: queda por
 * detallar); la que solo tiene nombre, como nueva ya descrita («por crear»). Una nueva sale primero de las «nuevas sin describir» que ya había
 * (quitar una descrita las devuelve ahí): solo se suman las que faltan, así sacarla y volver a pasarla no duplica nada.
 */
export function separarAnotada(s: Separado, p: PrendaAnotada, cantidad: number): Separado {
  const n = Math.max(1, Math.min(TOPES_CONTEO.contadas, Math.trunc(cantidad)));
  if (p.productoId) return sumarPrenda(s, { productoId: p.productoId, nombre: p.nombre, codigo: p.codigo }, n);
  const sinDescribir = nuevasSinDescribir(s);
  return describirNuevas(cambiarNuevasSinDescribir(s, Math.max(sinDescribir, n)), p.nombre, n);
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

/**
 * Lo que dice el botón de cada fila de «Para después»: lo que hace, con las mismas palabras que «¿Qué … son?» al contar («+ Crear ahora»,
 * «Tallas y colores ahora»). Un pendiente «detalle» —una prenda que ya existe y espera sus tallas y colores, sea porque se separó sin
 * ellas o porque se acaba de crear— dice lo que le falta, no el genérico «Hacer ahora» de «Separar».
 */
export const BOTON_DE_PENDIENTE: Record<ParaDespues["tipo"], string> = {
  separar: "Hacer ahora",
  detalle: "Tallas y colores ahora",
  crear: "+ Crear ahora",
};

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
  /** Lo separado y, si quien termina lo pendiente cambió el costo de alguna prenda (ADR-0519), `costos`: `{ producto: costo }` de esas prendas. */
  p_separado: ReturnType<typeof separadoParaBase> & { costos?: Record<string, number> };
  p_confirma_costo: boolean;
  p_token: string;
};

export function argsResolverPendiente(p: {
  despachoId: string;
  linea: Pick<LineaParaContar, "linea" | "conteo">;
  pendienteId: string | null;
  separado: Separado;
  /** El costo propio de las prendas que se identifican ahora (`costosDeHacerAhora`); sin nada, no va y la base hace lo de siempre. */
  costos?: Readonly<Record<string, number>>;
  confirmaCosto?: boolean;
  token: string;
}): ArgsResolverPendiente {
  return {
    p_despacho_id: p.despachoId,
    p_despacho_item_id: p.linea.linea?.id ?? null,
    p_extra_posicion: p.linea.linea ? null : (p.linea.conteo?.extraPosicion ?? null),
    p_pendiente_id: p.pendienteId,
    p_separado: { ...separadoParaBase(p.separado), ...(p.costos && Object.keys(p.costos).length > 0 ? { costos: { ...p.costos } } : {}) },
    p_confirma_costo: p.confirmaCosto ?? false,
    p_token: p.token,
  };
}

// ---- El costo de cada prenda en «Hacer ahora» (ADR-0519 sobre ADR-0393, Felipe 2026-10-27) -----------------------------------------

/**
 * El costo con el que una prenda entra en «Hacer ahora» si nadie lo toca, como se escribe en el campo: el suyo propio que ya quedó en el conteo
 * (o el que se le puso por su descripción cuando era una prenda nueva todavía sin crear: `descripcionNueva`), y si no, el de su línea.
 */
export function costoInicialDePrenda(
  l: Pick<LineaParaContar, "linea" | "conteo"> | null,
  productoId: string,
  descripcionNueva: string | null = null,
): string {
  const propios = l?.conteo?.costosPrendas ?? {};
  const propio = Object.hasOwn(propios, productoId) ? propios[productoId] : descripcionNueva ? propios[claveCostoDeNueva(descripcionNueva)] : undefined;
  return costoComoTexto(propio ?? l?.conteo?.costoUnitario ?? l?.linea?.costoUnitario ?? null);
}

/**
 * Los costos que se escribieron para las prendas que se identifican ahora (una vez por prenda): cuáles se mandan a la base (un monto válido y
 * distinto de lo que la prenda ya costaba; vacío o igual, no), cuáles son un cambio que se confirma, y cuáles están mal escritos (se dicen junto
 * al campo y frenan el guardado). `escritos` trae solo lo que la persona tocó; `inicial` es lo que dice el campo sin tocarlo.
 */
export function costosDeHacerAhora(
  prendas: readonly { productoId: string; nombre: string | null; codigo: string | null }[],
  escritos: Readonly<Record<string, string>>,
  inicial: (productoId: string) => string,
): { costos: Record<string, number>; cambios: (CambioDePrecio & { productoId: string })[]; problemas: { productoId: string; nombre: string; texto: string }[] } {
  const costos: Record<string, number> = {};
  const cambios: (CambioDePrecio & { productoId: string })[] = [];
  const problemas: { productoId: string; nombre: string; texto: string }[] = [];
  const vistos = new Set<string>();
  for (const p of prendas) {
    if (vistos.has(p.productoId) || !Object.hasOwn(escritos, p.productoId)) continue;
    vistos.add(p.productoId);
    const nombre = p.nombre ?? p.codigo ?? "La prenda";
    const lectura = leerCostoCierre(escritos[p.productoId] ?? "");
    if (lectura.problema) {
      problemas.push({ productoId: p.productoId, nombre, texto: lectura.problema });
      continue;
    }
    const cambio = cambioDePrecioDeCompra(nombre, inicial(p.productoId), escritos[p.productoId] ?? "");
    if (!cambio) continue;
    costos[p.productoId] = cambio.despues;
    cambios.push({ ...cambio, productoId: p.productoId });
  }
  return { costos, cambios, problemas };
}

/**
 * Los cambios de costo que la base NO dejó anotados: la respuesta trae el conteo de la línea con el costo de cada prenda, y si lo que se mandó no
 * está ahí es que la base todavía no acepta el costo desde «Hacer ahora» (la migración sin pegar la deja pasar sin error y sin hacer nada). Sin
 * respuesta no se puede saber: no se alarma.
 */
export function costosSinGuardar<T extends { productoId: string; despues: number }>(cambios: readonly T[], conteo: Pick<ConteoDeLinea, "costosPrendas"> | null): T[] {
  if (!conteo) return [];
  return cambios.filter((c) => conteo.costosPrendas[c.productoId] !== c.despues);
}

/** Lo que hay que saber del dinero antes de confirmar en «Hacer ahora»: el costo (si cambia) y el precio de venta (si cambia). */
export function avisoDeConfirmarHacerAhora(cambios: readonly CambioDePrecio[]): string {
  const costo = "El costo cambia lo que cuesta lo que entra ahora, y queda para lo que falte de esa prenda; lo ya recibido no se toca.";
  const venta = "El precio de venta rige desde ahora: lo ya vendido no cambia. Queda en el historial de la prenda.";
  const partes = [cambios.some((c) => c.tipo === "compra") ? costo : null, cambios.some((c) => c.tipo === "venta") ? venta : null].filter((t): t is string => t !== null);
  return partes.join(" ");
}

export function leerResuelto(data: unknown): { entraron: number; quedaronPendientes: number; repetido: boolean; conteo: ConteoDeLinea | null } | null {
  const r = objeto(Array.isArray(data) ? data[0] : data);
  if (!r) return null;
  return { entraron: entero(r.entraron), quedaronPendientes: entero(r.quedaron_pendientes), repetido: booleano(r.repetido) ?? false, conteo: leerConteoDeLinea(r.linea) };
}

export type ArgsLigarPrenda = { p_despacho_id: string; p_pendiente_id: string; p_producto_id: string };

/**
 * «Crear ahora» crea la prenda en el catálogo antes de pedir sus tallas. Si la persona deja las tallas «para después», el pendiente tiene que
 * decirlo: pasa de «por crear» a «sin tallas» de esa prenda (`ligar_prenda_a_pendiente`). Solo un pendiente «crear» espera una prenda; un
 * «detalle» ya la tiene y lo sin separar no es un pendiente: ahí no hay nada que ligar (`null`).
 */
export function argsLigarPrenda(despachoId: string, item: ParaDespues, productoId: string): ArgsLigarPrenda | null {
  return item.tipo === "crear" ? { p_despacho_id: despachoId, p_pendiente_id: item.pendiente.id, p_producto_id: productoId } : null;
}

/**
 * Qué pasó al ligar: «ligado» (el pendiente pasó a «sin tallas»), «sin_cambio» (ya tenía su prenda, o ya se terminó mientras tanto),
 * «no_disponible» (la base todavía no tiene la función: la web se publica antes de pegar la migración, y entonces todo sigue como antes)
 * o «fallo» (cualquier otra cosa: la prenda quedó creada igual, pero «Para después» seguirá diciendo «por crear»).
 */
export type ResultadoDeLigar = "ligado" | "sin_cambio" | "no_disponible" | "fallo";

export function resultadoDeLigar(data: unknown, error: { code?: string | null; hint?: string | null } | null | undefined): ResultadoDeLigar {
  if (error) {
    // PGRST202 (PostgREST) y 42883 (Postgres): la función no existe todavía.
    if (error.code === "PGRST202" || error.code === "42883") return "no_disponible";
    return error.hint === "pendiente_ya_resuelto" ? "sin_cambio" : "fallo";
  }
  const r = objeto(Array.isArray(data) ? data[0] : data);
  const ligado = r ? booleano(r.ligado) : null;
  return ligado === null ? "fallo" : ligado ? "ligado" : "sin_cambio";
}

/** El aviso cuando no se pudo dejar la prenda en «Para después»: la prenda existe, y cómo se arregla. */
export const AVISO_PRENDA_SIN_LIGAR = {
  titulo: "La prenda se creó, pero «Para después» todavía la muestra como por crear",
  detalle: "Se arregla al ponerle tallas y colores. La encuentras también en Catálogo ▸ Productos.",
} as const;

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
  // ADR-0480 (actividad 7): lo recibido ya es del comprobante de la compra.
  if (porQueNo === "reabrir_papel_completado") return "Compras ya completó el papel de esta compra: la corrección la hace Compras";
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
