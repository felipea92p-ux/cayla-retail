// Reglas puras de «Lo que le compré a este proveedor» (ficha y lista de Proveedores, 2026-10-24). Sin I/O: se prueban sin base.
//
// DOS ORÍGENES que nunca se suman a escondidas (ADR-0502, actualización 2026-10-24 (b), `fn_proveedor_prendas`, 20261024231000):
//   · COMPRAS (exacto): lo que llegó por una recepción, con el costo de su factura o de su lote.
//   · CARGA INICIAL (estimado): lo que ya estaba cuando se cargó el inventario, al costo de la carga («costo por confirmar»).
// Lo de UNIDADES (vendidas, rotación, sin venta) vale para los dos. Lo de DINERO (margen, plata parada, «margen bajo») se calcula solo
// con lo que tiene costo real; con carga inicial se dice «Costo por confirmar» en vez de un veredicto de dinero.

import { ritmoDeDatos, textoSemanas } from "./proveedor-ritmo-reglas";

export type PrendaDeProveedor = {
  productoId: string;
  referencia: string;
  codigo: string | null;
  marca: string | null;
  categoria: string | null;
  /** Compras + carga inicial. */
  unidadesCompradas: number;
  /** Las que llegaron por una recepción (costo real). */
  unidadesCompras: number;
  /** De las de Compras, las que llegaron sin factura (un envío sin guía): costo del lote, no de una factura. */
  unidadesSinFactura: number;
  /** Las de la carga inicial (estimadas). */
  unidadesCarga: number;
  /** Igual que `unidadesCarga`: lo que no tiene una recepción que lo respalde. */
  unidadesEstimadas: number;
  gasto: number;
  gastoCompras: number;
  gastoCarga: number;
  costoPromedio: number | null;
  unidadesVendidas: number;
  ingresoVendido: number;
  costoVendido: number;
  stockActual: number;
  primeraEntrada: string | null;
  ultimaVenta: string | null;
  conFactura: boolean;
};

/** Desde qué parte de lo comprado debe tener costo real (origen Compras) para hablar de dinero (margen, plata parada). */
export const COSTO_REAL_MIN_PCT = 50;

export type TotalesPrendas = {
  prendas: number;
  unidadesCompradas: number;
  unidadesCompras: number;
  unidadesSinFactura: number;
  unidadesCarga: number;
  unidadesEstimadas: number;
  gasto: number;
  gastoCompras: number;
  gastoCarga: number;
  /** Qué parte de lo comprado ya tiene costo real (llegó por Compras), 0–100. */
  costoRealPct: number;
  /** `true` cuando el dinero (margen, plata parada) todavía no se puede afirmar. */
  costoPorConfirmar: boolean;
  unidadesVendidas: number;
  ingresoVendido: number;
  costoVendido: number;
  /** Ganancia de lo ya vendido: ingreso − costo de esas unidades. */
  gananciaVendida: number;
  /** Margen sobre lo vendido, 0–100; `null` si no se vendió nada o el costo está por confirmar. */
  margenPct: number | null;
  /** De lo comprado, cuánto ya se vendió, 0–100 (nunca más de 100). Es de UNIDADES: vale para los dos orígenes. */
  vendidoPct: number | null;
  /** Unidades que siguen en estantes (nunca más de lo comprado). */
  unidadesEnEstantes: number;
  /** Plata en estantes de lo que tiene costo real (origen Compras). */
  plataEnStock: number;
  /** Prendas de las que no se vendió ni una unidad (unidades: vale para los dos orígenes). */
  prendasSinVenta: number;
  /** Plata que sigue en estantes en esas prendas, solo de origen Compras (dinero). */
  plataSinVenta: number;
};

export type GrupoDeMarca = TotalesPrendas & { marca: string; prendasLista: PrendaDeProveedor[] };

export const SIN_MARCA = "Sin marca";

const redondear = (n: number) => Math.round(n * 100) / 100;

export function pct(parte: number, total: number): number | null {
  if (!(total > 0)) return null;
  return Math.max(0, Math.min(100, (parte / total) * 100));
}

/** ¿Esta prenda tiene costo real? (la mitad o más de lo comprado llegó por Compras). */
export function tieneCostoReal(p: Pick<PrendaDeProveedor, "unidadesCompras" | "unidadesCompradas">): boolean {
  return (pct(p.unidadesCompras, p.unidadesCompradas) ?? 0) >= COSTO_REAL_MIN_PCT;
}

/** Lo que queda en estantes de lo que tiene costo real, al costo de la factura o del lote. */
export function plataRealEnEstantes(p: PrendaDeProveedor): number {
  if (p.unidadesCompras <= 0) return 0;
  return Math.min(p.stockActual, p.unidadesCompras) * (p.gastoCompras / p.unidadesCompras);
}

export function totalesDePrendas(prendas: readonly PrendaDeProveedor[]): TotalesPrendas {
  let unidadesCompradas = 0, unidadesCompras = 0, unidadesSinFactura = 0, unidadesCarga = 0, unidadesEstimadas = 0;
  let gasto = 0, gastoCompras = 0, gastoCarga = 0, unidadesVendidas = 0, ingresoVendido = 0, costoVendido = 0;
  let unidadesEnEstantes = 0, plataEnStock = 0, prendasSinVenta = 0, plataSinVenta = 0;
  for (const p of prendas) {
    unidadesCompradas += p.unidadesCompradas;
    unidadesCompras += p.unidadesCompras;
    unidadesSinFactura += p.unidadesSinFactura;
    unidadesCarga += p.unidadesCarga;
    unidadesEstimadas += p.unidadesEstimadas;
    gasto += p.gasto;
    gastoCompras += p.gastoCompras;
    gastoCarga += p.gastoCarga;
    unidadesVendidas += p.unidadesVendidas;
    ingresoVendido += p.ingresoVendido;
    costoVendido += p.costoVendido;
    unidadesEnEstantes += Math.min(p.stockActual, p.unidadesCompradas);
    const real = plataRealEnEstantes(p);
    plataEnStock += real;
    if (p.unidadesVendidas === 0) {
      prendasSinVenta += 1;
      plataSinVenta += real;
    }
  }
  const costoRealPct = pct(unidadesCompras, unidadesCompradas) ?? 0;
  const costoPorConfirmar = costoRealPct < COSTO_REAL_MIN_PCT;
  const gananciaVendida = ingresoVendido - costoVendido;
  return {
    prendas: prendas.length,
    unidadesCompradas,
    unidadesCompras,
    unidadesSinFactura,
    unidadesCarga,
    unidadesEstimadas,
    gasto: redondear(gasto),
    gastoCompras: redondear(gastoCompras),
    gastoCarga: redondear(gastoCarga),
    costoRealPct,
    costoPorConfirmar,
    unidadesVendidas,
    ingresoVendido: redondear(ingresoVendido),
    costoVendido: redondear(costoVendido),
    gananciaVendida: redondear(gananciaVendida),
    margenPct: !costoPorConfirmar && ingresoVendido > 0 ? (gananciaVendida / ingresoVendido) * 100 : null,
    vendidoPct: pct(unidadesVendidas, unidadesCompradas),
    unidadesEnEstantes,
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
  /** La producción propia (el Taller): va aparte, fuera del ranking y de los veredictos. */
  esTaller: boolean;
  prendas: number;
  unidadesCompradas: number;
  unidadesCompras: number;
  unidadesSinFactura: number;
  unidadesCarga: number;
  unidadesEstimadas: number;
  gasto: number;
  gastoCompras: number;
  gastoCarga: number;
  unidadesVendidas: number;
  ingresoVendido: number;
  costoVendido: number;
  plataEnStock: number;
  prendasSinVenta: number;
  /** Dinero: solo de origen Compras. */
  plataSinVenta: number;
  /** La primera entrada de lo que se le compró y lo que sigue en estantes: lo que hace falta para medir el ritmo (`proveedor-ritmo-reglas.ts`). */
  primeraEntrada: string | null;
  unidadesEnEstantes: number;
};

/** Con menos unidades vendidas que esto no se juzga a un proveedor: dos ventas no son una tendencia. */
export const MIN_VENDIDAS_PARA_JUZGAR = 10;
export const MARGEN_BAJO_PCT = 35;

export type Veredicto = { tono: "verde" | "ambar" | "pizarra"; texto: string; porque: string };

export function margenDe(r: Pick<RendimientoProveedor, "ingresoVendido" | "costoVendido">): number | null {
  return r.ingresoVendido > 0 ? ((r.ingresoVendido - r.costoVendido) / r.ingresoVendido) * 100 : null;
}

export const costoRealPctDe = (r: Pick<RendimientoProveedor, "unidadesCompras" | "unidadesCompradas">) => pct(r.unidadesCompras, r.unidadesCompradas) ?? 0;

/**
 * Una palabra por proveedor, con su porqué. **El ritmo manda y es el MISMO del aviso «frenar» de la lista** (`ritmoDeDatos`, ADR-0502 act. (d)):
 * si vender lo que le queda tardaría una temporada o más, dice «Rota lento» aunque haya vendido poco. Con pocas ventas y buen ritmo dice «Pocas
 * ventas»: no inventa una conclusión. Con la carga inicial como mayoría dice «Costo por confirmar»: el dinero (margen) todavía no es real.
 */
export function veredictoDe(r: RendimientoProveedor, hoy: string): Veredicto {
  const margen = margenDe(r);
  const vendidoPct = pct(r.unidadesVendidas, r.unidadesCompradas) ?? 0;
  const ritmo = ritmoDeDatos({ unidadesVendidas: r.unidadesVendidas, unidadesCompradas: r.unidadesCompradas, unidadesEnEstantes: r.unidadesEnEstantes, primeraEntrada: r.primeraEntrada }, hoy);
  if (ritmo.lento) {
    return {
      tono: "ambar",
      texto: "Rota lento",
      porque: `Vender lo que le queda tardaría ${textoSemanas(ritmo)} (${ritmo.vendidas.toLocaleString("es-PE")} vendidas en ${Math.round(ritmo.semanas)} semanas, ${ritmo.enEstantes.toLocaleString("es-PE")} siguen en estantes).`,
    };
  }
  if (r.unidadesVendidas < MIN_VENDIDAS_PARA_JUZGAR) {
    return { tono: "pizarra", texto: "Pocas ventas", porque: `Solo ${r.unidadesVendidas} unidades vendidas: todavía no alcanza para juzgarlo.` };
  }
  const real = costoRealPctDe(r);
  if (real < COSTO_REAL_MIN_PCT) {
    return {
      tono: "pizarra",
      texto: "Costo por confirmar",
      porque: `Solo el ${Math.round(real)} % de lo que le compraste llegó por Compras con su costo real; el resto viene de la carga inicial. Vendiste el ${Math.round(vendidoPct)} % de lo comprado.`,
    };
  }
  if (margen != null && margen < MARGEN_BAJO_PCT) {
    return { tono: "ambar", texto: "Margen bajo", porque: `Ganas ${Math.round(margen)} % de lo que vendes: menos de ${MARGEN_BAJO_PCT} %.` };
  }
  return { tono: "verde", texto: "Rinde", porque: `Vendiste el ${Math.round(vendidoPct)} % de lo comprado${margen != null ? ` con ${Math.round(margen)} % de margen` : ""}.` };
}

export type FilaDeRanking = RendimientoProveedor & { pesoPct: number; margenPct: number | null; vendidoPct: number | null; costoRealPct: number; veredicto: Veredicto };

/** El ranking de proveedores externos por lo que gastaste, y aparte la producción propia (el Taller) con su peso en el gasto total. */
export function rankingDeProveedores(filas: readonly RendimientoProveedor[], hoy: string): { ranking: FilaDeRanking[]; taller: (RendimientoProveedor & { pesoPct: number }) | null } {
  const total = filas.reduce((a, f) => a + f.gasto, 0);
  const externos = filas.filter((f) => !f.esTaller);
  const taller = filas.find((f) => f.esTaller) ?? null;
  const costoReal = (f: RendimientoProveedor) => costoRealPctDe(f);
  return {
    ranking: [...externos]
      .sort((a, b) => b.gasto - a.gasto || a.nombre.localeCompare(b.nombre, "es"))
      .map((f) => ({
        ...f,
        pesoPct: pesoDelGasto(f.gasto, total),
        margenPct: costoReal(f) >= COSTO_REAL_MIN_PCT ? margenDe(f) : null,
        vendidoPct: pct(f.unidadesVendidas, f.unidadesCompradas),
        costoRealPct: costoReal(f),
        veredicto: veredictoDe(f, hoy),
      })),
    taller: taller ? { ...taller, pesoPct: pesoDelGasto(taller.gasto, total) } : null,
  };
}
