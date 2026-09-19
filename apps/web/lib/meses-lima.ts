// El «mes» de las pantallas financieras (Gastos, Estado de Resultados…): se lee de `?mes=aaaa-mm` en la
// URL, se puede compartir y «atrás» funciona. Es un mes CALENDARIO de Lima. Sin parámetro (o con basura),
// el mes en curso. Una sola definición: dos pantallas que entiendan «mes» distinto muestran cifras distintas.

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export type MesLima = { anio: number; mes: number };

/** Lee `?mes=aaaa-mm`; si falta o es inválido, devuelve `actual`. */
export function leerMes(param: string | undefined, actual: MesLima): MesLima {
  const m = param && /^(\d{4})-(0[1-9]|1[0-2])$/.exec(param);
  return m ? { anio: Number(m[1]), mes: Number(m[2]) } : actual;
}

export const claveMes = ({ anio, mes }: MesLima): string => `${anio}-${String(mes).padStart(2, "0")}`;

export function desplazarMes({ anio, mes }: MesLima, delta: number): MesLima {
  const i = anio * 12 + (mes - 1) + delta;
  return { anio: Math.floor(i / 12), mes: (i % 12) + 1 };
}

/** Primer y último día del mes como `aaaa-mm-dd` (el último día no depende de la zona horaria). */
export function rangoDelMes({ anio, mes }: MesLima): { desde: string; hasta: string } {
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const mm = String(mes).padStart(2, "0");
  return { desde: `${anio}-${mm}-01`, hasta: `${anio}-${mm}-${String(ultimo).padStart(2, "0")}` };
}

export const tituloMes = ({ anio, mes }: MesLima): string => `${MESES[mes - 1]} ${anio}`;
