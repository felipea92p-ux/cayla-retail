// Reglas puras de «Lo que le compré a este proveedor» (ficha de Proveedores, 2026-10-24). Sin I/O: se prueban sin base.
//
// Qué es «comprado»: las entradas de inventario al costo de la prenda, y la línea de factura cuando existe
// (`fn_proveedor_prendas`, 20261024221000). Lo vendido sale de ventas completadas con el costo que tenía al venderse.

export type PrendaDeProveedor = {
  productoId: string;
  referencia: string;
  codigo: string | null;
  marca: string | null;
  categoria: string | null;
  unidadesCompradas: number;
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
  /** Plata que sigue en estantes: stock actual al costo promedio de cada prenda. */
  plataEnStock: number;
};

export type GrupoDeMarca = TotalesPrendas & { marca: string; prendasLista: PrendaDeProveedor[] };

export const SIN_MARCA = "Sin marca";

const redondear = (n: number) => Math.round(n * 100) / 100;

export function pct(parte: number, total: number): number | null {
  if (!(total > 0)) return null;
  return Math.max(0, Math.min(100, (parte / total) * 100));
}

export function totalesDePrendas(prendas: readonly PrendaDeProveedor[]): TotalesPrendas {
  let unidadesCompradas = 0, gasto = 0, unidadesVendidas = 0, ingresoVendido = 0, costoVendido = 0, plataEnStock = 0;
  for (const p of prendas) {
    unidadesCompradas += p.unidadesCompradas;
    gasto += p.gasto;
    unidadesVendidas += p.unidadesVendidas;
    ingresoVendido += p.ingresoVendido;
    costoVendido += p.costoVendido;
    plataEnStock += p.stockActual * (p.costoPromedio ?? 0);
  }
  const gananciaVendida = ingresoVendido - costoVendido;
  return {
    prendas: prendas.length,
    unidadesCompradas,
    gasto: redondear(gasto),
    unidadesVendidas,
    ingresoVendido: redondear(ingresoVendido),
    costoVendido: redondear(costoVendido),
    gananciaVendida: redondear(gananciaVendida),
    margenPct: ingresoVendido > 0 ? (gananciaVendida / ingresoVendido) * 100 : null,
    vendidoPct: pct(unidadesVendidas, unidadesCompradas),
    plataEnStock: redondear(plataEnStock),
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
