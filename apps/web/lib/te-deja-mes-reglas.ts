import { gastosQueFaltanDelMes, type FaltaDelMes } from "./equilibrio-mes-reglas";
import type { FilaER } from "./resultados-reglas";
import type { ResumenFinanzas } from "./resumen-finanzas-reglas";

// Finanzas ▸ Resumen, camino «A · Bolsillos», la tarjeta «Noviembre va así» (Felipe 2026-11-09): cuánto te deja el mes.
//
// LA REGLA (decidida por Felipe el 2026-11-09, «Estimado con rango»). Mientras el mes corre:
//   estimado = lo que te deja hasta hoy + el margen de lo que falta vender al ritmo de hoy − los gastos del mes que todavía no están registrados.
// «Al ritmo de hoy» es el mismo de «¿Ya pagaste el mes?» (lo vendido ÷ los días que van × los días del mes) y «los gastos que faltan», los mismos que
// ese equilibrio suma al mes entero (la planilla por devengar, los fijos y la depreciación): las dos piezas no pueden contradecirse.
// El RANGO va sobre lo que falta vender, no sobre lo que ya pasó: ±(4 % + 16 % × la parte del mes que falta). El día 1 es ±20 %; el último día, ±4 %
// (y en un mes cerrado no hay rango: es lo que fue). Es una forma honesta de decir «todavía puede cambiar», no una estadística.
// Sin lo que falta del mes (la lectura se cayó) no se estima: saldría alto, porque faltarían gastos. Se dice, y queda lo de hasta hoy.

export type TeDejaMes =
  | {
      tipo: "estimado";
      estimado: number;
      rango: [number, number];
      hastaHoy: number;
      /** Lo que falta vender al ritmo de hoy (sin IGV) y los gastos del mes que todavía no están. */
      faltaVender: number;
      faltaGastar: number;
      dias: { van: number; total: number };
    }
  | { tipo: "cerrado"; resultado: number; porCien: number | null }
  | { tipo: "tramo"; resultado: number }
  | { tipo: "sin_estimado"; hastaHoy: number; motivo: string }
  | { tipo: "sin_dato"; motivo: string };

const r2 = (n: number) => Math.round(n * 100) / 100;

/** El ancho del rango (una fracción de lo que falta vender) según cuánto del mes ya pasó. */
export function anchoDelRango(van: number, total: number): number {
  const pasado = Math.min(1, Math.max(0, van / Math.max(total, 1)));
  return 0.04 + 0.16 * (1 - pasado);
}

function diasDe(mes: string, hoy: string): { van: number; total: number } {
  const [a, m] = mes.split("-").map(Number) as [number, number];
  const total = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return { total, van: hoy.slice(0, 7) === mes ? Number(hoy.slice(8, 10)) : total };
}

/**
 * `f` es la fila del Estado de resultados de lo que se mira (`filaDeVer`); `unMes`, si el calendario mira un mes entero; `faltaDelMes`, lo que
 * falta gastar del mes en curso (`null` si no se pudo leer).
 */
export function teDejaDelMes(o: {
  f: FilaER | null;
  ver: Pick<ResumenFinanzas["ver"], "todas" | "soloEmpresa" | "ubicacionId">;
  mes: string;
  hoy: string;
  unMes: boolean;
  faltaDelMes: readonly FaltaDelMes[] | null;
}): TeDejaMes {
  const { f, ver, mes, hoy, unMes, faltaDelMes } = o;
  if (!f) return { tipo: "sin_dato", motivo: "Todavía no hay ventas ni gastos en estas fechas." };
  if (!unMes) return { tipo: "tramo", resultado: f.resultado };
  const enCurso = hoy.slice(0, 7) === mes;
  if (!enCurso) return { tipo: "cerrado", resultado: f.resultado, porCien: f.ventas > 0 ? Math.round((f.resultado / f.ventas) * 100) : null };
  if (f.ventas <= 0) return { tipo: "sin_estimado", hastaHoy: f.resultado, motivo: "Todavía no hay ventas este mes: no hay ritmo con qué estimar." };
  if (faltaDelMes === null) return { tipo: "sin_estimado", hastaHoy: f.resultado, motivo: "No se pudo leer lo que falta gastar del mes, así que no se estima: saldría más alto de lo que es." };

  const dias = diasDe(mes, hoy);
  const ritmo = f.ventas / Math.max(dias.van, 1);
  const faltaVender = r2(ritmo * (dias.total - dias.van));
  const margen = f.margen / f.ventas;
  const faltaGastar = Math.max(0, gastosQueFaltanDelMes(f, ver, faltaDelMes));
  const estimado = r2(f.resultado + faltaVender * margen - faltaGastar);
  const ancho = r2(faltaVender * anchoDelRango(dias.van, dias.total) * Math.max(margen, 0));
  return { tipo: "estimado", estimado, rango: [r2(estimado - ancho), r2(estimado + ancho)], hastaHoy: f.resultado, faltaVender, faltaGastar, dias };
}
