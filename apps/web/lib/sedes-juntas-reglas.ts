// Finanzas ▸ Resumen, «Cada sede, junta» (tarea 27 de «Las 36»). Junta lo que estaba por partes: de Ganancias y pérdidas, lo que vendió, costó, gastó y dejó cada sede; del Balance por tienda,
// lo que tiene en su cajón y su caja fuerte.
//
// PROMETE: cada fila se lee de corrido (con IGV: vendió − IGV − de CLAURE − costó − gastó = dejó; sin la lectura del IGV: vendió − costó − gastó = dejó) y las filas suman la de CAYLA.
// El Taller y la Empresa van aparte y no se reparten entre las tiendas (ADR-0485 §11). Los bancos no aparecen por sede: son de CAYLA entera y repartirlos sería inventar un número.
// ASUME: las cifras llegan de la base, y el IGV de las ventas viene en `igvCobrado` (ADR-0624). Aquí no se calcula plata nueva: solo se junta y se ordena.

import type { UnidadBalance } from "./balance-reglas";
import { IGV_DE_CLAURE } from "./cuenta-claure-reglas";
import { colorDeSede, nombreCortoSede, SEDE_EMPRESA, type ClaveSede, type ColorSede } from "./finanzas-telar-reglas";
import type { FilaER } from "./resultados-reglas";

/** Bajo la tabla, si alguna sede vendió de CLAURE: qué es la línea «de CLAURE» y quién pone su IGV. */
export const NOTA_CLAURE_JUNTAS = `La línea «de CLAURE» va sin IGV: se cobró en la tienda, pero es de CLAURE y no llega a «Dejó». Su IGV sale con el RUC de CAYLA y va en la columna IGV. ${IGV_DE_CLAURE}`;

export type SedeJunta = {
  clave: ClaveSede;
  nombre: string;
  color: ColorSede;
  /** Todo lo vendido en la sede con IGV, también lo de CLAURE (Felipe 2026-11-09); sin IGV y solo lo de CAYLA si no se pudo leer (`SedesJuntas.conIgv`). */
  vendio: number;
  /** El IGV de esas ventas, también el de CLAURE, porque la boleta sale con el RUC de CAYLA: es de SUNAT, así que no entra a lo que dejó. `null` si no se pudo leer. */
  igv: number | null;
  /** Lo vendido de CLAURE, sin IGV: está en `vendio` pero es de CLAURE, así que tampoco entra a lo que dejó. 0 si no vendió o no se pudo leer. */
  claure: number;
  /** Lo que costaron las prendas, con sus fletes y mermas: lo que separa lo vendido del margen. */
  costo: number;
  gastos: number;
  dejo: number;
  /** Cajón y caja fuerte. `null` si no se sabe (una caja abierta, una lectura caída) o si la sede no tiene (la Empresa). */
  tiene: number | null;
  /** Cuánto de lo vendido lleva costo estimado («63.1»). `null` si no vende o no se pudo leer. */
  pctEstimado: number | null;
};

export type SedesJuntas = {
  tiendas: SedeJunta[];
  /** El Taller y la Empresa: no venden y no se reparten. */
  aparte: SedeJunta[];
  total: SedeJunta;
  /** Se pudo leer el IGV de las ventas de todas las columnas: «Vendió» va con IGV y hay columna IGV. */
  conIgv: boolean;
};

const ORDEN: Record<ColorSede, number> = { tru: 0, aqp: 1, lim: 2, otra: 3, tal: 4, emp: 5 };
const r2 = (n: number) => Math.round(n * 100) / 100;

function deLaFila(f: FilaER, tiene: number | null, conIgv: boolean, pctEstimado: number | null = null): SedeJunta {
  const empresa = f.unidad === "empresa";
  const igv = conIgv ? (f.igvCobrado ?? 0) : null;
  const claure = conIgv ? (f.claureSinIgv ?? 0) : 0;
  return {
    clave: empresa ? SEDE_EMPRESA : (f.ubicacionId ?? ""),
    nombre: empresa ? "Empresa" : nombreCortoSede(f.nombre),
    color: empresa ? "emp" : colorDeSede({ nombre: f.nombre, tipo: f.unidad }),
    vendio: r2(f.ventas + (igv ?? 0) + claure),
    igv,
    claure,
    costo: r2(f.ventas - f.margen),
    gastos: r2(f.margen - f.resultado),
    dejo: f.resultado,
    tiene,
    pctEstimado,
  };
}

/** `null` si no hay al menos dos sedes que juntar. Sin la lectura del Balance, la columna «En caja» queda sin dato en vez de decir cero. */
export function sedesJuntas(filas: readonly FilaER[], unidades: readonly UnidadBalance[] | null, pctEstimados: Readonly<Record<string, number | null>> | null = null): SedesJuntas | null {
  const cajaDe = (id: string | null) => unidades?.find((u) => u.ubicacionId === id)?.caja ?? null;
  // Todas las columnas o ninguna: una tabla no mezcla ventas con IGV y sin IGV.
  const conIgv = filas.length > 0 && filas.every((f) => f.igvCobrado !== undefined);
  const lugares = filas
    .filter((f) => f.unidad !== "consolidado")
    .map((f) => deLaFila(f, f.unidad === "empresa" ? null : cajaDe(f.ubicacionId), conIgv, f.unidad === "tienda" && f.ubicacionId ? (pctEstimados?.[f.ubicacionId] ?? null) : null))
    .filter((s) => s.clave)
    .sort((a, b) => ORDEN[a.color] - ORDEN[b.color] || a.nombre.localeCompare(b.nombre, "es"));
  if (lugares.length < 2) return null;

  const consolidado = filas.find((f) => f.unidad === "consolidado");
  const sumar = (de: (s: SedeJunta) => number) => r2(lugares.reduce((a, s) => a + de(s), 0));
  // Una caja sin dato deja el total sin dato: un total que le falta una tienda se lee como si estuviera completo. La Empresa no cuenta: no tiene caja.
  const conCaja = lugares.filter((s) => s.color !== "emp");
  const tiene = conCaja.every((s) => s.tiene !== null) ? r2(conCaja.reduce((a, s) => a + (s.tiene ?? 0), 0)) : null;
  const total: SedeJunta = consolidado
    ? { ...deLaFila(consolidado, tiene, conIgv, pctEstimados?.todas ?? null), clave: "todas", nombre: "CAYLA", color: "otra" }
    : { clave: "todas", nombre: "CAYLA", color: "otra", vendio: sumar((s) => s.vendio), igv: conIgv ? sumar((s) => s.igv ?? 0) : null, claure: sumar((s) => s.claure), costo: sumar((s) => s.costo), gastos: sumar((s) => s.gastos), dejo: sumar((s) => s.dejo), tiene, pctEstimado: pctEstimados?.todas ?? null };
  return {
    tiendas: lugares.filter((s) => s.color !== "tal" && s.color !== "emp"),
    aparte: lugares.filter((s) => s.color === "tal" || s.color === "emp"),
    total,
    conIgv,
  };
}
