// «Por definir» en Mis compras (ADR-0660, Felipe 2026-11-13): las prendas que se anotaron sin saber qué son o sin su precio de venta, el aviso
// que las cuenta («3 prendas a la espera de definir categoría») y la hoja «Definir», que llena lo que falta. Sin Supabase ni React: la usan el
// servidor (Revisar compras, Mis compras, el Inicio) y la hoja, y se prueba en `por-definir-reglas.test.ts`.
//
// La base decide qué se puede definir (`definir_prenda_de_compra`): lo que aquí falta es lo mismo que allá se rechaza. Esta lógica no agrega
// reglas de negocio (ADR-0284).

import type { CampoDeGuia } from "./guia-campos";
import { faltaEnPaso, leerPrecioVenta } from "./compra-rapida-reglas";

export const RPC_COMPRAS_POR_DEFINIR = "fn_compras_por_definir";
export const RPC_DEFINIR_PRENDA = "definir_prenda_de_compra";

/** Un modelo que espera: las líneas de una compra con el mismo nombre (una por tienda), y qué le falta. */
export type ModeloPorDefinir = {
  /** Las líneas de la compra: se definen todas juntas. */
  ids: string[];
  papelId: string;
  nombre: string;
  cantidad: number;
  /** Lo que costó cada una: ayuda a ponerle precio. */
  costo: number | null;
  categoriaPorDefinir: boolean;
  precioPorDefinir: boolean;
  /** La que ya tiene, si solo espera el precio. */
  categoriaId: string | null;
  categoria: string | null;
  marca: string | null;
  admitePrecioCero: boolean;
  proveedor: string;
  compradora: string;
  mia: boolean;
  tiendas: string[];
  /** Ya salió en un envío que la tienda todavía no abre. */
  enCamino: boolean;
  fecha: string | null;
};

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const numero = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** Lo que manda `fn_compras_por_definir`. Una fila que no se entiende se descarta (nunca se inventa). */
export function leerPorDefinir(data: unknown): ModeloPorDefinir[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((x): ModeloPorDefinir[] => {
    if (!x || typeof x !== "object") return [];
    const o = x as Record<string, unknown>;
    const ids = Array.isArray(o.ids) ? o.ids.filter((i): i is string => typeof i === "string" && i !== "") : [];
    const papelId = texto(o.papel_id);
    const nombre = texto(o.nombre);
    const categoriaPorDefinir = o.categoria_por_definir === true;
    const precioPorDefinir = o.precio_por_definir === true;
    if (ids.length === 0 || !papelId || !nombre || (!categoriaPorDefinir && !precioPorDefinir)) return [];
    return [
      {
        ids,
        papelId,
        nombre,
        cantidad: Math.max(0, Math.trunc(numero(o.cantidad) ?? 0)),
        costo: numero(o.costo),
        categoriaPorDefinir,
        precioPorDefinir,
        categoriaId: texto(o.categoria_id),
        categoria: texto(o.categoria),
        marca: texto(o.marca),
        admitePrecioCero: o.admite_precio_cero === true,
        proveedor: texto(o.proveedor) ?? "Proveedor",
        compradora: texto(o.compradora) ?? "Compras",
        mia: o.mia === true,
        tiendas: Array.isArray(o.tiendas) ? o.tiendas.filter((t): t is string => typeof t === "string") : [],
        enCamino: o.en_camino === true,
        fecha: texto(o.fecha),
      },
    ];
  });
}

const prendas = (n: number) => (n === 1 ? "1 prenda" : `${n} prendas`);

/**
 * El aviso, en palabras de Felipe: «3 prendas a la espera de definir categoría». Si además (o solo) esperan su precio, lo dice aparte. Cada
 * modelo cuenta una vez, aunque vaya a dos tiendas. Sin nada que espere, `null` (no se dibuja un aviso vacío).
 */
export function textoAvisoPorDefinir(modelos: readonly Pick<ModeloPorDefinir, "categoriaPorDefinir" | "precioPorDefinir">[]): {
  titulo: string;
  detalle: string | null;
} | null {
  const sinCategoria = modelos.filter((m) => m.categoriaPorDefinir).length;
  const sinPrecio = modelos.filter((m) => m.precioPorDefinir).length;
  if (sinCategoria === 0 && sinPrecio === 0) return null;
  if (sinCategoria === 0) return { titulo: `${prendas(sinPrecio)} a la espera de precio sugerido`, detalle: null };
  const titulo = `${prendas(sinCategoria)} a la espera de definir categoría`;
  if (sinPrecio === 0) return { titulo, detalle: null };
  const ambas = modelos.filter((m) => m.categoriaPorDefinir && m.precioPorDefinir).length;
  const soloPrecio = sinPrecio - ambas;
  const partes = [
    ambas > 0 ? (ambas === sinCategoria ? (ambas === 1 ? "también espera su precio" : "también esperan su precio") : `${ambas} también ${ambas === 1 ? "espera" : "esperan"} su precio`) : null,
    soloPrecio > 0 ? `${prendas(soloPrecio)} más ${soloPrecio === 1 ? "espera" : "esperan"} solo su precio` : null,
  ].filter(Boolean);
  return { titulo, detalle: partes.join(" · ") };
}

/** Lo que falta, para la fila: «Sin categoría», «Sin precio». */
export function faltasDelModelo(m: Pick<ModeloPorDefinir, "categoriaPorDefinir" | "precioPorDefinir">): string[] {
  return [m.categoriaPorDefinir ? "Sin categoría" : null, m.precioPorDefinir ? "Sin precio" : null].filter((x): x is string => x !== null);
}

/** La línea de quién y adónde: «Miyan · lo compró Ana · va a Lima y Trujillo». La compradora no se nombra a sí misma. */
export function detalleDelModelo(m: Pick<ModeloPorDefinir, "proveedor" | "compradora" | "mia" | "tiendas" | "enCamino">): string {
  const tiendas = m.tiendas.map((t) => t.replace(/^Tienda\s+/i, ""));
  const destino = tiendas.length === 0 ? null : `${m.enCamino ? "en camino a" : "va a"} ${tiendas.length === 1 ? tiendas[0] : `${tiendas.slice(0, -1).join(", ")} y ${tiendas.at(-1)}`}`;
  return [m.proveedor, m.mia ? null : `lo compró ${m.compradora.split(" ")[0]}`, destino].filter(Boolean).join(" · ");
}

/** Lo que se escribe en la hoja «Definir». `categoriaId` vacío y `precio` vacío = todavía nada. */
export type BorradorDefinir = { categoriaId: string | null; precio: string };

/**
 * Los campos de la hoja, para la guía de foco. Si el modelo espera las dos cosas, basta UNA (se define solo lo que se sabe): es un campo de
 * grupo, «definir», que envuelve a los dos (ADR-0284, regla de grupo). Si espera una sola, esa es la que falta. Un precio escrito que no sirve
 * deja el grupo pendiente con lo que dice la base. Quien firma, desde una terminal.
 */
export function camposDefinir(
  m: Pick<ModeloPorDefinir, "categoriaPorDefinir" | "precioPorDefinir" | "admitePrecioCero">,
  b: BorradorDefinir,
  admiteCeroElegida: boolean,
  r: { esPersona: boolean; listo: boolean; motivo: string | null },
): CampoDeGuia[] {
  const admiteCero = m.categoriaPorDefinir ? admiteCeroElegida : m.admitePrecioCero;
  const escribioPrecio = m.precioPorDefinir && b.precio.trim() !== "";
  const precioBien = escribioPrecio && leerPrecioVenta(b.precio, admiteCero) !== null;
  const categoriaBien = m.categoriaPorDefinir && b.categoriaId !== null;
  const pendiente =
    escribioPrecio && !precioBien
      ? (faltaEnPaso("venta", b.precio, admiteCero) ?? "Escribe un precio válido.")
      : m.categoriaPorDefinir && m.precioPorDefinir
        ? "Elige qué es o escribe a cuánto se vende (o las dos)."
        : m.categoriaPorDefinir
          ? "Elige qué es."
          : "Escribe a cuánto se vende.";
  const campos: CampoDeGuia[] = [
    {
      id: "definir",
      nombre: m.categoriaPorDefinir && m.precioPorDefinir ? "Qué es o su precio" : m.categoriaPorDefinir ? "Qué es" : "Precio de venta",
      requerido: true,
      hecho: (categoriaBien || precioBien) && !(escribioPrecio && !precioBien),
      pendiente,
    },
  ];
  if (!r.esPersona) campos.push({ id: "responsable", nombre: "Quién define", requerido: true, hecho: r.listo, pendiente: r.motivo ?? "Elige quién define." });
  return campos;
}

/** Lo que se le manda a la base: solo lo que se definió (lo que se deja vacío sigue esperando). `null` si no hay nada. */
export function definirParaBase(
  m: Pick<ModeloPorDefinir, "ids" | "categoriaPorDefinir" | "precioPorDefinir" | "admitePrecioCero">,
  b: BorradorDefinir,
  admiteCeroElegida: boolean,
): { p_item_ids: string[]; p_categoria_id: string | null; p_precio_venta: number | null } | null {
  const categoria = m.categoriaPorDefinir ? b.categoriaId : null;
  const precio = m.precioPorDefinir && b.precio.trim() !== "" ? leerPrecioVenta(b.precio, m.categoriaPorDefinir ? admiteCeroElegida : m.admitePrecioCero) : null;
  if (categoria === null && precio === null) return null;
  return { p_item_ids: [...m.ids], p_categoria_id: categoria, p_precio_venta: precio };
}

/** «Ganas S/ 24.90 por cada una» bajo el precio, si el costo y el precio se leen. */
export function gananciaDefinida(costo: number | null, precio: string, admiteCero: boolean): number | null {
  const venta = leerPrecioVenta(precio, admiteCero);
  return costo == null || venta == null ? null : Math.round((venta - costo) * 100) / 100;
}
