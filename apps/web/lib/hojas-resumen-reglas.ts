import type { FilaER } from "./resultados-reglas";
import type { TeDejaMes } from "./te-deja-mes-reglas";

// Finanzas ▸ Resumen, camino «A · Bolsillos»: las hojas de detalle (Felipe 2026-11-09, «También las hojas»). Cada cifra grande abre su hoja con la cuenta
// renglón por renglón, y con «Siguiente» se recorren todas sin salir del Resumen. Lógica pura sobre lo que la pantalla ya leyó (`fn_estado_resultados`,
// la proyección de caja, el valor del inventario): no se suma plata nueva, se ordena y se escribe. Cada hoja termina en la pantalla que lo resuelve.

export type ClaveHoja = "plata" | "deja" | "ventas" | "gastos" | "pagos" | "sunat" | "inventario";

/** El orden de «Siguiente»: de la plata al mes, y de lo que viene a la ropa. */
export const ORDEN_HOJAS: readonly ClaveHoja[] = ["plata", "deja", "ventas", "gastos", "pagos", "sunat", "inventario"];

/** La hoja de al lado entre las que hay; `null` en los bordes. */
export function hojaVecina(actual: ClaveHoja, hay: readonly ClaveHoja[], paso: 1 | -1): ClaveHoja | null {
  const lista = ORDEN_HOJAS.filter((c) => hay.includes(c));
  const i = lista.indexOf(actual);
  if (i < 0) return null;
  return lista[i + paso] ?? null;
}

export type Renglon = { texto: string; detalle?: string; monto: number; tipo?: "suma" | "resta" | "total" };
const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * La cuenta del mes: de lo vendido a lo que te deja, con lo que dice la fila del Estado de resultados. Si lo que deja no es margen − gastos (diferencias de
 * caja, otros), la diferencia va en su propio renglón, para que la cuenta cierre. Mientras el mes corre, sigue con lo que falta hasta el estimado.
 */
export function cuentaDelMes(f: FilaER, te: TeDejaMes): Renglon[] {
  const costo = r2(f.ventas - f.margen);
  const filas: Renglon[] = [
    { texto: "Vendiste", detalle: "Sin IGV: el IGV es de SUNAT", monto: f.ventas, tipo: "suma" },
    { texto: "Lo que costaron las prendas", detalle: "Su costo, el flete y lo que se dañó o perdió", monto: -costo, tipo: "resta" },
    { texto: "Te quedó de la ropa", detalle: f.ventas > 0 ? `${Math.round((f.margen / f.ventas) * 100)} de cada S/ 100 vendidos` : "", monto: f.margen, tipo: "total" },
    { texto: "Gastos", detalle: "Sueldos, alquileres, servicios y lo demás", monto: -f.gastos, tipo: "resta" },
  ];
  const otros = r2(f.resultado - (f.margen - f.gastos));
  if (Math.abs(otros) >= 0.5) filas.push({ texto: "Otros", detalle: "Lo que faltó o sobró en caja y otros movimientos", monto: otros, tipo: otros >= 0 ? "suma" : "resta" });
  // «Te faltó» ya dice el signo: la cifra va sin el menos (nunca «Te faltó −S/ 452»).
  const hastaHoy = te.tipo === "estimado" || te.tipo === "sin_estimado";
  filas.push({ texto: hastaHoy ? "Te deja hasta hoy" : f.resultado >= 0 ? "Te dejó" : "Te faltó", monto: hastaHoy ? f.resultado : Math.abs(f.resultado), tipo: "total" });
  if (te.tipo === "estimado") {
    const margen = f.ventas > 0 ? f.margen / f.ventas : 0;
    filas.push(
      { texto: "Lo que falta vender, al ritmo de hoy", detalle: `Te deja ${Math.round(margen * 100)} de cada S/ 100`, monto: r2(te.faltaVender * margen), tipo: "suma" },
      { texto: "Gastos del mes que faltan registrar", detalle: "Sueldos por devengar, fijos y depreciación", monto: -te.faltaGastar, tipo: "resta" },
      { texto: "Te deja (estimado)", detalle: "Si el mes sigue así", monto: te.estimado, tipo: "total" },
    );
  }
  return filas;
}

export type VentaDeTienda = { id: string; nombre: string; ventas: number; cambio: number | null };

/** Lo vendido por tienda, de la que más vende a la que menos, con cuánto cambió contra el período anterior. */
export function ventasPorTienda(filas: readonly FilaER[], antes: readonly FilaER[] | null): VentaDeTienda[] {
  return filas
    .filter((f) => f.unidad === "tienda" && f.ubicacionId)
    .map((f) => {
      const a = antes?.find((x) => x.ubicacionId === f.ubicacionId);
      return { id: f.ubicacionId!, nombre: f.nombre.replace(/^Tienda\s+/i, ""), ventas: r2(f.ventas), cambio: a && a.ventas > 0 ? f.ventas / a.ventas - 1 : null };
    })
    .sort((a, b) => b.ventas - a.ventas);
}

export type GastoDelMes = { nombre: string; monto: number; deCada100: number };

/** En qué se fue la plata del mes: los gastos por rubro, del mayor al menor, con cuánto son de cada S/ 100 gastados. */
export function gastosDelMes(f: FilaER): GastoDelMes[] {
  const juntos = new Map<string, number>();
  for (const d of f.detalleGastos) if (Math.abs(d.monto) >= 0.005) juntos.set(d.nombre, r2((juntos.get(d.nombre) ?? 0) + d.monto));
  const total = [...juntos.values()].reduce((a, b) => a + Math.max(0, b), 0);
  return [...juntos.entries()]
    .map(([nombre, monto]) => ({ nombre, monto, deCada100: total > 0 ? Math.round((Math.max(0, monto) / total) * 100) : 0 }))
    .sort((a, b) => b.monto - a.monto);
}
