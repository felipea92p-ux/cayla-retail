// «Revisar precios» (Catálogo ▸ Productos, ADR-0641): lee la lista de `fn_precios_a_revisar` y dice, en palabras de tienda, por qué
// cada prenda está ahí. La cuenta la hace la base (sin IA, gratis); aquí solo se traduce.
//
// PROMETE: filas con números (la base manda strings en numeric), las cuatro cuentas para las cifras, el filtro de la URL validado
//   y una frase corta por prenda. ASUME: las filas vienen de `fn_precios_a_revisar`. NO HACE: no decide qué precio poner.

import { soles } from "./compras-reglas";
import { traducirError, type ErrorEscritura } from "./error-escritura";

export type MotivoPrecio = "pierde_dinero" | "margen_bajo" | "caro" | "barato" | "sin_costo";
/** Los filtros de las cifras (caro y barato van juntos en «lejos de su categoría»). */
export type FiltroPrecio = "pierde_dinero" | "margen_bajo" | "lejos" | "sin_costo";

export const FILTROS_PRECIO: readonly FiltroPrecio[] = ["pierde_dinero", "margen_bajo", "lejos", "sin_costo"];

/** Cuántas por página: una revisión se hace de a pocas. */
export const POR_PAGINA_PRECIOS = 25;

export type PrendaARevisar = {
  productoId: string;
  referencia: string;
  codigo: string | null;
  categoriaId: string;
  categoria: string;
  tejidoId: string | null;
  precio: number;
  /** El costo de la prenda o, si no tiene, el promedio de su categoría (`costoEstimado`). */
  costo: number | null;
  costoEstimado: boolean;
  /** Margen sobre el precio, en %, solo con costo real. */
  margen: number | null;
  medianaCategoria: number | null;
  /** Cuánto se aleja del precio del medio de su categoría, en % (+ arriba, − abajo). */
  desvio: number | null;
  vendidas90: number;
  stock: number;
  motivo: MotivoPrecio;
};

export type CuentasPrecios = { pierde: number; margen: number; lejos: number; sinCosto: number };

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const MOTIVOS = new Set<MotivoPrecio>(["pierde_dinero", "margen_bajo", "caro", "barato", "sin_costo"]);

/** Las filas de la base, leídas. Una fila con un motivo desconocido o sin precio se descarta (no se inventa por qué está). */
export function leerPreciosARevisar(filas: readonly Record<string, unknown>[]): { prendas: PrendaARevisar[]; total: number; cuentas: CuentasPrecios } {
  const primera = filas[0];
  const cuentas: CuentasPrecios = {
    pierde: num(primera?.cuenta_pierde) ?? 0,
    margen: num(primera?.cuenta_margen) ?? 0,
    lejos: num(primera?.cuenta_lejos) ?? 0,
    sinCosto: num(primera?.cuenta_sin_costo) ?? 0,
  };
  const prendas: PrendaARevisar[] = [];
  for (const f of filas) {
    const motivo = String(f.motivo ?? "") as MotivoPrecio;
    const precio = num(f.precio);
    if (!MOTIVOS.has(motivo) || precio === null || precio <= 0 || typeof f.producto_id !== "string" || typeof f.categoria_id !== "string") continue;
    prendas.push({
      productoId: f.producto_id,
      referencia: String(f.referencia ?? ""),
      codigo: typeof f.codigo === "string" ? f.codigo : null,
      categoriaId: f.categoria_id,
      categoria: String(f.categoria ?? ""),
      tejidoId: typeof f.tejido_id === "string" ? f.tejido_id : null,
      precio,
      costo: num(f.costo),
      costoEstimado: f.costo_estimado === true,
      margen: num(f.margen),
      medianaCategoria: num(f.mediana_categoria),
      desvio: num(f.desvio),
      vendidas90: num(f.unidades_90) ?? 0,
      stock: num(f.stock) ?? 0,
      motivo,
    });
  }
  return { prendas, total: num(primera?.total) ?? 0, cuentas };
}

/** El filtro que viene en la URL (`?motivo=`), o ninguno si no es uno de los cuatro. */
export function filtroDeUrl(valor: string | undefined): FiltroPrecio | null {
  return FILTROS_PRECIO.includes(valor as FiltroPrecio) ? (valor as FiltroPrecio) : null;
}

/** Por qué está en la lista: una etiqueta corta (cabe en la columna, junto al «Medio de su categoría») y la frase entera para el
 *  `title`, y su tono. */
export function textoMotivo(p: Pick<PrendaARevisar, "motivo" | "desvio" | "categoria">): { texto: string; frase: string; tono: "rojo" | "ambar" | "pizarra" | "apagado" } {
  const pct = p.desvio === null ? null : Math.round(Math.abs(p.desvio));
  switch (p.motivo) {
    case "pierde_dinero":
      return { texto: "Pierdes en cada venta", frase: "El precio no cubre el costo de la prenda.", tono: "rojo" };
    case "margen_bajo":
      return { texto: "Gana menos de 30 %", frase: "Con su costo real, deja menos de 30 % de margen.", tono: "ambar" };
    case "caro":
      return {
        texto: pct === null ? "Más cara" : `${pct} % más cara`,
        frase: `${pct === null ? "Más cara" : `${pct} % más cara`} que el precio del medio de ${p.categoria}.`,
        tono: "pizarra",
      };
    case "barato":
      return {
        texto: pct === null ? "Más barata" : `${pct} % más barata`,
        frase: `${pct === null ? "Más barata" : `${pct} % más barata`} que el precio del medio de ${p.categoria}.`,
        tono: "pizarra",
      };
    case "sin_costo":
      return { texto: "Sin costo propio", frase: "No tiene costo cargado: su margen no se puede saber.", tono: "apagado" };
  }
}

// ---------------------------------------------------------------------------
// Aplicar un precio propuesto (actividad 4): lo que dice la hoja antes y después.
// ---------------------------------------------------------------------------

/** Los rechazos de `aplicar_precio_propuesto` cuyo mensaje ya está en palabras de tienda (la base lo escribe así). */
const HINTS_APLICAR = new Set(["ya_aplicada", "propuesta_vieja", "precio_cambio", "bajo_el_piso", "propuesta_no_valida"]);

/** Lo que se dice si no se pudo aplicar: el mensaje de la base si es uno de los suyos, o la traducción de siempre. */
export function mensajeAplicar(error: ErrorEscritura): string {
  if (error && error.hint && HINTS_APLICAR.has(error.hint) && error.message) return error.message;
  return traducirError(error, "aplicar el precio");
}

/** Con estos rechazos lo que se ve ya está viejo: la hoja se cierra y la lista se relee. */
export function pideReleer(error: ErrorEscritura): boolean {
  return !!error?.hint && ["ya_aplicada", "precio_cambio", "propuesta_vieja"].includes(error.hint);
}

/** El aviso de éxito: qué cambió y qué no («La talla con precio propio sigue igual»). */
export function textoAplicado(referencia: string, precio: number, r: { cambiadas: number; con_precio_propio: number }): string {
  const base = `${referencia} queda en ${soles(precio)}`;
  if (r.con_precio_propio === 0) return `${base}.`;
  return `${base}. ${r.con_precio_propio === 1 ? "Una talla con precio propio sigue igual" : `${r.con_precio_propio} tallas con precio propio siguen igual`}.`;
}

/** Una propuesta igual al precio de hoy no se aplica: se dice «déjalo como está». */
export function esMismoPrecio(precioHoy: number, propuesto: number): boolean {
  return Math.abs(precioHoy - propuesto) < 0.005;
}
