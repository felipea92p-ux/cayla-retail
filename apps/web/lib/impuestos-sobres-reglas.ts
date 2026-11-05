// Finanzas ▸ Impuestos en «El telar» (Felipe 2026-10-23): un sobre por mes, en lugar de la tabla de los últimos meses.
// Abierto si falta algo (se declara ahora, o no hay pago registrado), punteado si el mes todavía corre, apagado si no hubo
// movimiento. **Sellado (con lacre) solo cuando el sistema sepa que ese mes se pagó**: hoy el pago a SUNAT
// (`movimientos_dinero.tipo = 'pago_sunat'`) no dice de qué mes es, y unirlo es decisión de Felipe; mientras tanto ningún sobre
// se sella: el sistema no afirma lo que no sabe. Lógica pura sobre `fn_impuestos_panel` (historial y estado de cada mes).

import { TEXTO_ESTADO_MES, estadoMes, nombreMes, sumarMeses, type EstadoMesIgv, type MesIgv } from "./impuestos-reglas";

export type Sobre = {
  mes: string;
  /** «Septiembre» (con el año si no es el del mes en curso). */
  nombre: string;
  estado: EstadoMesIgv;
  texto: string;
  tono: (typeof TEXTO_ESTADO_MES)[EstadoMesIgv]["tono"];
  /** Lo que se mira en el sobre: el IGV a pagar o, si quedó a favor, el saldo a favor. */
  monto: number;
  aFavor: boolean;
  forma: "abierto" | "cerrado" | "curso" | "vacio";
  /** El sobre del mes que se mira. */
  elegido: boolean;
  /** El mes que se declara ahora (el anterior al de hoy). */
  aDeclarar: boolean;
};

const FORMA: Record<EstadoMesIgv, Sobre["forma"]> = {
  en_curso: "curso",
  por_declarar: "abierto",
  sin_pago: "abierto",
  a_favor: "cerrado",
  sin_movimiento: "vacio",
};

const Mayus = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** El mes que se declara ahora: el anterior al de hoy. */
export const mesADeclarar = (mesActual: string) => sumarMeses(mesActual, -1);

export function sobresIgv(historial: MesIgv[], mesActual: string, mesElegido: string): Sobre[] {
  return historial.map((m) => {
    const estado = estadoMes(m, mesActual);
    const aFavor = m.aPagar === 0 && m.saldoAFavor > 0;
    return {
      mes: m.mes,
      nombre: `${Mayus(nombreMes(m.mes))}${m.mes.slice(0, 4) !== mesActual.slice(0, 4) ? ` ${m.mes.slice(0, 4)}` : ""}`,
      estado,
      texto: TEXTO_ESTADO_MES[estado].texto,
      tono: TEXTO_ESTADO_MES[estado].tono,
      monto: aFavor ? m.saldoAFavor : m.aPagar,
      aFavor,
      forma: FORMA[estado],
      elegido: m.mes === mesElegido,
      aDeclarar: m.mes === mesADeclarar(mesActual),
    };
  });
}
