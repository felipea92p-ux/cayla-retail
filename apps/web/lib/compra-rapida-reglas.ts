import { soles } from "./compras-reglas";
import { leerMontoPlata } from "./monto-plata-reglas";
import { problemaDeMonto } from "./fondos-reglas";
import type { CampoDeGuia } from "./guia-campos";

// Compras simple (ADR-0480, actividad 3): «Compré ropa» desde el celular. Las reglas puras: leer lo que manda la base (vieja o rota: nunca
// se cae), buscar proveedores por nombre y por lo que venden, los habituales de uno, lo que se dice en cada paso, lo que falta en el paso del
// papel (lo MISMO que rechaza `registrar_compra_rapida`, 20261023005000: la guía no agrega reglas, ADR-0284) y lo que se manda a la base.
// Sin Supabase: lo importan el servidor y la pantalla.

// Cada llamada nombra su constante (`.rpc(RPC_X as never, …)`): así la lee la prueba de cobertura de roles.
export const RPC_PROVEEDORES_PARA_COMPRAR = "fn_proveedores_para_comprar";
export const RPC_HABITUALES_PROVEEDOR = "fn_habituales_proveedor";
export const RPC_REGISTRAR_COMPRA_RAPIDA = "registrar_compra_rapida";

/** La carpeta de las fotos de los papeles dentro del depósito de las fotos de los gastos del viaje (la base exige que la ruta empiece así). */
export const CARPETA_PAPELES = "papeles/";

/** Cuántos habituales se ven antes de «Ver todos los suyos» (la maqueta aprobada). */
export const HABITUALES_A_LA_VISTA = 6;

export type TipoPapel = "factura" | "boleta" | "nota_venta" | "sin_comprobante";

/** Qué le dio el proveedor, en palabras de la tienda, con su ayuda. */
export const TIPOS_PAPEL: Record<TipoPapel, { nombre: string; ayuda: string }> = {
  factura: { nombre: "Factura", ayuda: "Con RUC" },
  boleta: { nombre: "Boleta", ayuda: "Con número" },
  nota_venta: { nombre: "Nota de venta", ayuda: "Papel simple" },
  sin_comprobante: { nombre: "Sin papel", ayuda: "No me dieron nada" },
};

const numero = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export type ProveedorParaComprar = { id: string; nombre: string; ruc: string | null; categorias: string[]; compras: number; ultima: string | null };

/** Lo que manda `fn_proveedores_para_comprar`: el más comprado primero, como viene. */
export function leerProveedoresParaComprar(data: unknown): ProveedorParaComprar[] {
  if (!Array.isArray(data)) return [];
  return data
    .map((x): ProveedorParaComprar | null => {
      if (!x || typeof x !== "object") return null;
      const o = x as Record<string, unknown>;
      const id = texto(o.id);
      const nombre = texto(o.nombre);
      if (!id || !nombre) return null;
      return {
        id,
        nombre,
        ruc: texto(o.ruc),
        categorias: Array.isArray(o.categorias) ? o.categorias.filter((c): c is string => typeof c === "string") : [],
        compras: Math.max(0, Math.trunc(numero(o.compras) ?? 0)),
        ultima: texto(o.ultima),
      };
    })
    .filter((x): x is ProveedorParaComprar => x !== null);
}

/** Buscar un proveedor: por su nombre (sin tildes ni mayúsculas) y, si se eligió una categoría, solo los que la venden. */
export function filtrarProveedores(lista: readonly ProveedorParaComprar[], q: string, categoriaId: string | null): ProveedorParaComprar[] {
  const n = normalizar(q);
  return lista.filter((p) => (!n || normalizar(p.nombre).includes(n)) && (!categoriaId || p.categorias.includes(categoriaId)));
}

/** Las categorías que vende al menos un proveedor (las píldoras de «¿A quién le compras?»), en el orden del catálogo que se pase. */
export function categoriasConProveedor(lista: readonly ProveedorParaComprar[], categorias: readonly { id: string; nombre: string }[]) {
  const usadas = new Set(lista.flatMap((p) => p.categorias));
  return categorias.filter((c) => usadas.has(c.id));
}

export type Habitual = {
  clave: string;
  productoId: string | null;
  nombre: string;
  categoriaId: string;
  categoria: string;
  marcaId: string | null;
  marca: string | null;
  /** Cuántas veces se le compró aquí; 0 = está en el catálogo con ese proveedor, todavía no se le compró desde aquí. */
  veces: number;
  ultimaFecha: string | null;
  ultimaCantidad: number | null;
  costo: number | null;
  venta: number | null;
};

/** Lo que manda `fn_habituales_proveedor`: lo más comprado primero, como viene. */
export function leerHabituales(data: unknown): Habitual[] {
  if (!Array.isArray(data)) return [];
  return data
    .map((x): Habitual | null => {
      if (!x || typeof x !== "object") return null;
      const o = x as Record<string, unknown>;
      const clave = texto(o.clave);
      const nombre = texto(o.nombre);
      const categoriaId = texto(o.categoria_id);
      if (!clave || !nombre || !categoriaId) return null;
      return {
        clave,
        productoId: texto(o.producto_id),
        nombre,
        categoriaId,
        categoria: texto(o.categoria) ?? "",
        marcaId: texto(o.marca_id),
        marca: texto(o.marca),
        veces: Math.max(0, Math.trunc(numero(o.veces) ?? 0)),
        ultimaFecha: texto(o.ultima_fecha),
        ultimaCantidad: numero(o.ultima_cantidad),
        costo: numero(o.costo),
        venta: numero(o.venta),
      };
    })
    .filter((x): x is Habitual => x !== null);
}

/** Las píldoras de «¿Qué le compras hoy?»: cada categoría de sus habituales con cuántos hay, si son más de una. */
export function categoriasDeHabituales(lista: readonly Habitual[]): { id: string; nombre: string; cuantos: number }[] {
  const porId = new Map<string, { id: string; nombre: string; cuantos: number }>();
  for (const h of lista) {
    const c = porId.get(h.categoriaId) ?? { id: h.categoriaId, nombre: h.categoria, cuantos: 0 };
    c.cuantos += 1;
    porId.set(h.categoriaId, c);
  }
  return porId.size > 1 ? [...porId.values()] : [];
}

/** La línea chica de una tarjeta de habitual: lo de la vez pasada, o lo que dice el catálogo si nunca se le compró aquí. */
export function textoHabitual(h: Habitual): string | null {
  if (h.veces > 0 && h.ultimaCantidad != null && h.costo != null) {
    return `La vez pasada: ${h.ultimaCantidad} a ${soles(h.costo)}${h.venta != null ? ` · se vendió a ${soles(h.venta)}` : ""}`;
  }
  if (h.venta != null) return `En el catálogo: se vende a ${soles(h.venta)}`;
  return null;
}

export type LineaCompra = {
  /** La clave del habitual del que salió (para decir «Ya va» en su tarjeta). */
  clave: string;
  productoId: string | null;
  categoriaId: string;
  marcaId: string | null;
  nombre: string;
  categoria: string;
  cantidad: number;
  costo: number;
  venta: number | null;
  destinoId: string;
};

export const totalDeLineas = (lineas: readonly Pick<LineaCompra, "cantidad" | "costo">[]): number =>
  Math.round(lineas.reduce((s, l) => s + l.cantidad * l.costo, 0) * 100) / 100;

export const prendasDeLineas = (lineas: readonly Pick<LineaCompra, "cantidad">[]): number => lineas.reduce((s, l) => s + l.cantidad, 0);

/** «¿Cuántas compraste?»: un entero de 1 a 99 999 (la regla de las líneas de una orden). */
export function leerCantidad(t: string): number | null {
  const limpio = t.trim();
  if (!/^\d+$/.test(limpio)) return null;
  const n = Number(limpio);
  return n >= 1 && n <= 99999 ? n : null;
}

/** Un precio de una prenda (costo o venta): de S/ 0 a S/ 99 999.99, con hasta dos decimales. Vacío o ilegible, null. */
export function leerPrecio(t: string): number | null {
  const n = leerMontoPlata(t);
  // Dos decimales como máximo (0.29 × 100 da 28.999…: se compara con un margen, no con ===).
  if (n == null || n < 0 || n > 99999.99 || Math.abs(Math.round(n * 100) - n * 100) > 1e-6) return null;
  return n;
}

/** Lo que dice bajo el botón gris de un paso de la prenda (la maqueta: el botón dice qué falta). */
export function faltaEnPaso(paso: "cantidad" | "costo" | "venta", t: string): string | null {
  if (paso === "cantidad") return leerCantidad(t) == null ? "Escribe cuántas compraste" : null;
  return leerPrecio(t) == null ? "Escribe el precio" : null;
}

/** La tienda que llega marcada: la de la prenda anterior («Como la anterior»). */
export function tiendaAnterior(lineas: readonly LineaCompra[]): string | null {
  return lineas.at(-1)?.destinoId ?? null;
}

/** «Mandar a Tienda TRU, Tienda LIM»: las tiendas de una compra, sin repetir, en el orden en que se anotaron. */
export function tiendasDeLineas(lineas: readonly LineaCompra[], nombres: ReadonlyMap<string, string>): string[] {
  return [...new Set(lineas.map((l) => l.destinoId))].map((id) => nombres.get(id) ?? "una tienda");
}

/** Lo que queda después de guardar. En negativo no se dice «tienes S/ -40»: gastó más de lo que anotó, y lo que sigue es anotar esa plata. */
export function textoPlataDespues(queda: number): string {
  return queda >= 0
    ? `Ahora tienes ${soles(queda)} para comprar.`
    : `Gastaste ${soles(-queda)} más de lo que anotaste: si te dieron más plata, anótala en «Me dieron plata».`;
}

type Responsable = { esPersona: boolean; listo: boolean; motivo: string | null };

/** Los campos del paso del papel. La foto la pide solo un papel (factura, boleta o nota): sin papel, no. */
export function camposPapel(v: { tipo: TipoPapel | null; conFoto: boolean; monto: string }, r: Responsable): CampoDeGuia[] {
  const monto = problemaDeMonto(v.monto);
  const pideFoto = v.tipo !== null && v.tipo !== "sin_comprobante";
  return [
    { id: "tipo", nombre: "Qué te dieron", requerido: true, hecho: v.tipo !== null, pendiente: "Elige qué papel te dio el proveedor." },
    { id: "foto", nombre: "La foto", requerido: pideFoto, hecho: v.conFoto, pendiente: "Tómale una foto al papel." },
    { id: "monto", nombre: "Cuánto pagaste", requerido: true, hecho: monto === null, pendiente: monto ?? "" },
    ...(r.esPersona ? [] : [{ id: "responsable", nombre: "Quién compró", requerido: true, hecho: r.listo, pendiente: r.motivo ?? "Elige quién compró." }]),
  ];
}

/** Las prendas como las recibe `registrar_compra_rapida`. */
export function lineasParaBase(lineas: readonly LineaCompra[]) {
  return lineas.map((l) => ({
    producto_id: l.productoId,
    categoria_id: l.categoriaId,
    marca_id: l.marcaId,
    descripcion: l.nombre,
    cantidad: l.cantidad,
    costo: l.costo,
    precio_venta: l.venta,
    destino_id: l.destinoId,
  }));
}

/** El paso de la barra de avance (siempre 3, la maqueta): 1 Proveedor · 2 Prendas · 3 Boleta o factura. */
export type PasoCompra = "proveedor" | "habituales" | "cantidad" | "costo" | "venta" | "tienda" | "revisar" | "papel" | "listo";
export function faseDePaso(p: PasoCompra): 1 | 2 | 3 {
  return p === "proveedor" ? 1 : p === "papel" || p === "listo" ? 3 : 2;
}
const DETALLE: Partial<Record<PasoCompra, string>> = { cantidad: "cantidad", costo: "costo", venta: "venta", tienda: "tienda" };
export function textoAvance(p: PasoCompra): string {
  const fase = faseDePaso(p);
  const nombre = fase === 1 ? "Proveedor" : fase === 2 ? "Prendas" : "Boleta o factura";
  return `Paso ${fase} de 3 · ${nombre}${DETALLE[p] ? ` · ${DETALLE[p]}` : ""}`;
}

