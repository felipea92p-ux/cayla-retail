// Finanzas ▸ Resumen, «Cada sede, junta» (tarea 27 de «Las 36»). Junta lo que estaba por partes: de Ganancias y pérdidas, lo que vendió, costó, gastó y dejó cada sede; del Balance por tienda,
// lo que tiene en su cajón y su caja fuerte.
//
// PROMETE: cada fila se lee de corrido (vendió − costó − gastó = dejó) y las filas suman la de CAYLA. El Taller y la Empresa van aparte y no se reparten entre las tiendas (ADR-0485 §11).
// Los bancos no aparecen por sede: son de CAYLA entera y repartirlos sería inventar un número.
// ASUME: las cifras llegan de la base. Aquí no se calcula plata nueva: solo se junta y se ordena.

import type { UnidadBalance } from "./balance-reglas";
import { colorDeSede, nombreCortoSede, SEDE_EMPRESA, type ClaveSede, type ColorSede } from "./finanzas-telar-reglas";
import type { FilaER } from "./resultados-reglas";

export type SedeJunta = {
  clave: ClaveSede;
  nombre: string;
  color: ColorSede;
  vendio: number;
  /** Lo que costaron las prendas, con sus fletes y mermas: lo que separa lo vendido del margen. */
  costo: number;
  gastos: number;
  dejo: number;
  /** Cajón y caja fuerte. `null` si no se sabe (una caja abierta, una lectura caída) o si la sede no tiene (la Empresa). */
  tiene: number | null;
};

export type SedesJuntas = {
  tiendas: SedeJunta[];
  /** El Taller y la Empresa: no venden y no se reparten. */
  aparte: SedeJunta[];
  total: SedeJunta;
};

const ORDEN: Record<ColorSede, number> = { tru: 0, aqp: 1, lim: 2, otra: 3, tal: 4, emp: 5 };
const r2 = (n: number) => Math.round(n * 100) / 100;

function deLaFila(f: FilaER, tiene: number | null): SedeJunta {
  const empresa = f.unidad === "empresa";
  return {
    clave: empresa ? SEDE_EMPRESA : (f.ubicacionId ?? ""),
    nombre: empresa ? "Empresa" : nombreCortoSede(f.nombre),
    color: empresa ? "emp" : colorDeSede({ nombre: f.nombre, tipo: f.unidad }),
    vendio: f.ventas,
    costo: r2(f.ventas - f.margen),
    gastos: r2(f.margen - f.resultado),
    dejo: f.resultado,
    tiene,
  };
}

/** `null` si no hay al menos dos sedes que juntar. Sin la lectura del Balance, la columna «En caja» queda sin dato en vez de decir cero. */
export function sedesJuntas(filas: readonly FilaER[], unidades: readonly UnidadBalance[] | null): SedesJuntas | null {
  const cajaDe = (id: string | null) => unidades?.find((u) => u.ubicacionId === id)?.caja ?? null;
  const lugares = filas
    .filter((f) => f.unidad !== "consolidado")
    .map((f) => deLaFila(f, f.unidad === "empresa" ? null : cajaDe(f.ubicacionId)))
    .filter((s) => s.clave)
    .sort((a, b) => ORDEN[a.color] - ORDEN[b.color] || a.nombre.localeCompare(b.nombre, "es"));
  if (lugares.length < 2) return null;

  const consolidado = filas.find((f) => f.unidad === "consolidado");
  const sumar = (de: (s: SedeJunta) => number) => r2(lugares.reduce((a, s) => a + de(s), 0));
  // Una caja sin dato deja el total sin dato: un total que le falta una tienda se lee como si estuviera completo. La Empresa no cuenta: no tiene caja.
  const conCaja = lugares.filter((s) => s.color !== "emp");
  const tiene = conCaja.every((s) => s.tiene !== null) ? r2(conCaja.reduce((a, s) => a + (s.tiene ?? 0), 0)) : null;
  const total: SedeJunta = consolidado
    ? { ...deLaFila(consolidado, tiene), clave: "todas", nombre: "CAYLA", color: "otra" }
    : { clave: "todas", nombre: "CAYLA", color: "otra", vendio: sumar((s) => s.vendio), costo: sumar((s) => s.costo), gastos: sumar((s) => s.gastos), dejo: sumar((s) => s.dejo), tiene };
  return {
    tiendas: lugares.filter((s) => s.color !== "tal" && s.color !== "emp"),
    aparte: lugares.filter((s) => s.color === "tal" || s.color === "emp"),
    total,
  };
}
