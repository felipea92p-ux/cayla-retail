// Reglas puras de «Lo que le compré a este proveedor» (ficha de Proveedores, 2026-10-24). Sin I/O: se prueban sin base.
//
// Qué es «comprado»: el mayor entre las entradas de inventario y (vendido + stock actual), al costo de la prenda; lo que sobra sobre
// las entradas es ESTIMADO (`unidadesEstimadas`) y la pantalla lo dice. La línea de una factura vigente manda y es exacta
// (`fn_proveedor_prendas`, 20261024221000). Lo vendido sale de ventas completadas con el costo que tenía al venderse.

export type PrendaDeProveedor = {
  productoId: string;
  referencia: string;
  codigo: string | null;
  marca: string | null;
  categoria: string | null;
  unidadesCompradas: number;
  /** De las compradas, cuántas se reconstruyeron (vendido + stock) porque no hay entrada que las respalde. */
  unidadesEstimadas: number;
  gasto: number;
  costoPromedio: number | null;
  unidadesVendidas: number;
  ingresoVendido: number;
  costoVendido: number;
  stockActual: number;
  primeraEntrada: string | null;
  ultimaVenta: string | null;
  conFactura: boolean;
};

export type TotalesPrendas = {
  prendas: number;
  unidadesCompradas: number;
  unidadesEstimadas: number;
  gasto: number;
  unidadesVendidas: number;
  ingresoVendido: number;
  costoVendido: number;
  /** Ganancia de lo ya vendido: ingreso − costo de esas unidades. */
  gananciaVendida: number;
  /** Margen sobre lo vendido, 0–100; `null` si todavía no se vendió nada. */
  margenPct: number | null;
  /** De lo comprado, cuánto ya se vendió, 0–100 (nunca más de 100). */
  vendidoPct: number | null;
  /** Plata que sigue en estantes: stock actual (nunca más de lo comprado) al costo promedio de cada prenda. */
  plataEnStock: number;
  /** Prendas de las que no se vendió ni una unidad, y la plata que sigue en estantes de ellas. */
  prendasSinVenta: number;
  plataSinVenta: number;
};

export type GrupoDeMarca = TotalesPrendas & { marca: string; prendasLista: PrendaDeProveedor[] };

export const SIN_MARCA = "Sin marca";

const redondear = (n: number) => Math.round(n * 100) / 100;

export function pct(parte: number, total: number): number | null {
  if (!(total > 0)) return null;
  return Math.max(0, Math.min(100, (parte / total) * 100));
}

export function totalesDePrendas(prendas: readonly PrendaDeProveedor[]): TotalesPrendas {
  let unidadesCompradas = 0, unidadesEstimadas = 0, gasto = 0, unidadesVendidas = 0, ingresoVendido = 0, costoVendido = 0, plataEnStock = 0, prendasSinVenta = 0, plataSinVenta = 0;
  for (const p of prendas) {
    unidadesCompradas += p.unidadesCompradas;
    unidadesEstimadas += p.unidadesEstimadas;
    gasto += p.gasto;
    unidadesVendidas += p.unidadesVendidas;
    ingresoVendido += p.ingresoVendido;
    costoVendido += p.costoVendido;
    const enEstantes = Math.min(p.stockActual, p.unidadesCompradas) * (p.costoPromedio ?? 0);
    plataEnStock += enEstantes;
    if (p.unidadesVendidas === 0) {
      prendasSinVenta += 1;
      plataSinVenta += enEstantes;
    }
  }
  const gananciaVendida = ingresoVendido - costoVendido;
  return {
    prendas: prendas.length,
    unidadesCompradas,
    unidadesEstimadas,
    gasto: redondear(gasto),
    unidadesVendidas,
    ingresoVendido: redondear(ingresoVendido),
    costoVendido: redondear(costoVendido),
    gananciaVendida: redondear(gananciaVendida),
    margenPct: ingresoVendido > 0 ? (gananciaVendida / ingresoVendido) * 100 : null,
    vendidoPct: pct(unidadesVendidas, unidadesCompradas),
    plataEnStock: redondear(plataEnStock),
    prendasSinVenta,
    plataSinVenta: redondear(plataSinVenta),
  };
}

/** Las prendas agrupadas por marca (una marca puede venir de varios proveedores y un proveedor traer varias marcas). Mayor gasto primero. */
export function agruparPorMarca(prendas: readonly PrendaDeProveedor[]): GrupoDeMarca[] {
  const mapa = new Map<string, PrendaDeProveedor[]>();
  for (const p of prendas) {
    const marca = p.marca?.trim() || SIN_MARCA;
    mapa.set(marca, [...(mapa.get(marca) ?? []), p]);
  }
  return [...mapa.entries()]
    .map(([marca, lista]) => ({ marca, prendasLista: [...lista].sort((a, b) => b.gasto - a.gasto), ...totalesDePrendas(lista) }))
    .sort((a, b) => b.gasto - a.gasto || a.marca.localeCompare(b.marca, "es"));
}

/** Cuánto pesa una parte del gasto en el total, 0–100. */
export function pesoDelGasto(gasto: number, total: number): number {
  return pct(gasto, total) ?? 0;
}

// ---------------------------------------------------------------------------
// Ranking de proveedores (lista de Proveedores): la misma cuenta, una fila por proveedor (`fn_proveedores_rendimiento`).
// ---------------------------------------------------------------------------

export type RendimientoProveedor = {
  proveedorId: string;
  nombre: string;
  prendas: number;
  unidadesCompradas: number;
  unidadesEstimadas: number;
  gasto: number;
  unidadesVendidas: number;
  ingresoVendido: number;
  costoVendido: number;
  plataEnStock: number;
  prendasSinVenta: number;
  plataSinVenta: number;
};

/** Con menos unidades vendidas que esto no se juzga a un proveedor: dos ventas no son una tendencia. */
export const MIN_VENDIDAS_PARA_JUZGAR = 10;
export const MARGEN_BAJO_PCT = 35;
export const PARADO_PCT = 40;

export type Veredicto = { tono: "verde" | "ambar" | "pizarra"; texto: string; porque: string };

export function margenDe(r: Pick<RendimientoProveedor, "ingresoVendido" | "costoVendido">): number | null {
  return r.ingresoVendido > 0 ? ((r.ingresoVendido - r.costoVendido) / r.ingresoVendido) * 100 : null;
}

/** Una palabra por proveedor, con su porqué. Con pocas ventas dice «Pocas ventas»: no inventa una conclusión. */
export function veredictoDe(r: RendimientoProveedor): Veredicto {
  const margen = margenDe(r);
  const vendidoPct = pct(r.unidadesVendidas, r.unidadesCompradas) ?? 0;
  const paradoPct = pct(r.plataSinVenta, r.gasto) ?? 0;
  if (r.unidadesVendidas < MIN_VENDIDAS_PARA_JUZGAR) {
    return { tono: "pizarra", texto: "Pocas ventas", porque: `Solo ${r.unidadesVendidas} unidades vendidas: todavía no alcanza para juzgarlo.` };
  }
  if (paradoPct >= PARADO_PCT) {
    return { tono: "ambar", texto: "Plata parada", porque: `El ${Math.round(paradoPct)} % de lo que gastaste está en prendas que no se han vendido.` };
  }
  if (margen != null && margen < MARGEN_BAJO_PCT) {
    return { tono: "ambar", texto: "Margen bajo", porque: `Ganas ${Math.round(margen)} % de lo que vendes: menos de ${MARGEN_BAJO_PCT} %.` };
  }
  return { tono: "verde", texto: "Rinde", porque: `Vendiste el ${Math.round(vendidoPct)} % de lo comprado${margen != null ? ` con ${Math.round(margen)} % de margen` : ""}.` };
}

/** Los proveedores ordenados por lo que gastaste, con su peso sobre el total gastado. */
export function rankingDeProveedores(filas: readonly RendimientoProveedor[]): (RendimientoProveedor & { pesoPct: number; margenPct: number | null; vendidoPct: number | null; veredicto: Veredicto })[] {
  const total = filas.reduce((a, f) => a + f.gasto, 0);
  return [...filas]
    .sort((a, b) => b.gasto - a.gasto || a.nombre.localeCompare(b.nombre, "es"))
    .map((f) => ({ ...f, pesoPct: pesoDelGasto(f.gasto, total), margenPct: margenDe(f), vendidoPct: pct(f.unidadesVendidas, f.unidadesCompradas), veredicto: veredictoDe(f) }));
}
