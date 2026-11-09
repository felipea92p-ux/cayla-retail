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

// ---- Los gráficos de las hojas (Felipe 2026-11-09: «varios modales no tienen gráficos») -------------------------------------------------------
// Cada hoja abre con un gráfico que se entiende antes de leer los renglones: de cada S/ 100, el reparto por rubro, la venta de cada día, la caja día
// por día. Lógica pura sobre lo que la hoja ya tiene; los colores son tokens (los de dato de cada sede, la familia «reparto» para los rubros).

export type TramoHoja = { clave: string; nombre: string; valor: number; color: string };

const ROPA = "var(--color-reparto-arcilla)";
const GASTOS = "var(--color-pizarra)";
const DEJA = "var(--color-verde)";
/** Los rubros de gasto, del mayor al menor: la familia «reparto» del ERP, y el neutro para «Otros». */
const COLORES_RUBRO = ["var(--color-pizarra)", "var(--color-reparto-terracota)", "var(--color-reparto-ocre)", "var(--color-reparto-menta)", "var(--color-reparto-arcilla)"];
const OTROS = "var(--color-grafico-neutro)";

/** De cada S/ 100 vendidos: cuánto fue la ropa, cuánto los gastos y cuánto quedó (o cuánto faltó). La barra se mide contra lo mayor entre lo vendido y lo que salió. */
export function deCadaCien(f: Pick<FilaER, "ventas" | "margen" | "gastos" | "resultado">): { tramos: TramoHoja[]; total: number; frase: string } | null {
  if (f.ventas <= 0) return null;
  const costo = Math.max(0, r2(f.ventas - f.margen));
  const gastos = Math.max(0, f.gastos);
  const deja = Math.max(0, f.resultado);
  const tramos: TramoHoja[] = [
    { clave: "ropa", nombre: "La ropa", valor: costo, color: ROPA },
    { clave: "gastos", nombre: "Los gastos", valor: gastos, color: GASTOS },
    ...(deja > 0 ? [{ clave: "deja", nombre: "Te quedó", valor: deja, color: DEJA }] : []),
  ].filter((t) => t.valor > 0);
  const de100 = (v: number) => Math.round((v / f.ventas) * 100);
  const frase =
    f.resultado >= 0
      ? `De cada S/ 100 vendidos, ${de100(costo)} se fueron en la ropa, ${de100(gastos)} en gastos y ${de100(deja)} te quedaron.`
      : `De cada S/ 100 vendidos, ${de100(costo)} se fueron en la ropa y ${de100(gastos)} en gastos: faltaron ${de100(-f.resultado)} para pagar todo.`;
  return { tramos, total: Math.max(f.ventas, costo + gastos), frase };
}

/** Los rubros de gasto para la barra: los más grandes con su color y, si hay más de `max`, el resto junto en «Otros». */
export function rubrosEnBarra(gastos: readonly GastoDelMes[], max = 5): TramoHoja[] {
  const positivos = gastos.filter((g) => g.monto > 0);
  const caben = positivos.length > max ? positivos.slice(0, max - 1) : positivos;
  const tramos = caben.map((g, i) => ({ clave: g.nombre, nombre: g.nombre, valor: g.monto, color: COLORES_RUBRO[i % COLORES_RUBRO.length]! }));
  const resto = positivos.slice(caben.length);
  if (resto.length) tramos.push({ clave: "otros", nombre: resto.length === 1 ? resto[0]!.nombre : `Otros ${resto.length}`, valor: r2(resto.reduce((a, g) => a + g.monto, 0)), color: OTROS });
  return tramos;
}

const masUnDia = (iso: string) => new Date(Date.parse(`${iso}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/** Lo vendido cada día, del primero al último del período (o hasta hoy), con cero los días sin venta: así se ve el ritmo y no solo los días buenos. */
export function ventasDiaADia(porFecha: Readonly<Record<string, number>>, desde: string, hasta: string, hoy: string): { fecha: string; total: number }[] {
  const fin = hasta < hoy ? hasta : hoy;
  const dias: { fecha: string; total: number }[] = [];
  for (let d = desde; d <= fin && dias.length < 62; d = masUnDia(d)) dias.push({ fecha: d, total: r2(porFecha[d] ?? 0) });
  return dias;
}

/** El color de dato de una sede (el mismo hilo de la barra de Finanzas). */
export function colorDeSede(color: "tru" | "aqp" | "lim" | "tal" | "emp" | "otra" | null | undefined): string {
  return !color || color === "otra" ? OTROS : `var(--color-sede-${color})`;
}
