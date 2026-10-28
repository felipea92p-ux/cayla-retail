// El Pulso: la respuesta («te quedan» / «te faltan») y la cascada de una fila del Estado de resultados, en lenguaje de tienda
// (camino A de las maquetas finanzas-v2-2026-10, Felipe 2026-10-15). Las usa Reportes (`ResultadoPulso`). El Resumen ya no: desde El
// telar (2026-10-23) su respuesta va en la cabecera común (`resumen-telar-reglas.ts`) y el «por qué» es el recorrido de la plata
// (`recorrido-plata-reglas.ts`). Ninguna cifra se calcula aquí de nuevo: solo se decide cómo se dice; lo que no está registrado no se
// inventa (el medidor de confianza, `lib/finanzas-confianza.ts`, dice cuánto creerle).

import { soles } from "./flujo-caja-reglas";
import { mesNombre, type FilaER } from "./resultados-reglas";

const r2 = (n: number) => Math.round(n * 100) / 100;

// ---- 1. La respuesta ----------------------------------------------------------------------------------------------------------

export type Respuesta =
  | {
      estado: "gana" | "pierde" | "empata";
      /** Lo que queda (o falta) a la fecha, en positivo. */
      monto: number;
      vendido: number;
      /** «te quedan» · «te faltan». */
      verbo: string;
      /** «Sí» · «No» · «Ni sí ni no». */
      corto: string;
      explica: string;
    }
  | { estado: "sin_datos"; motivo: string };

/**
 * Los gastos de operación SIN los sueldos ni el desgaste. En el Estado de resultados la base los suma TODOS en `gastos` (las cuentas
 * 62 y 681 son gastos de operación): el Pulso los nombra aparte, así que los otros son lo que queda. Sin esto, «Alquileres, servicios y
 * otros gastos» repetía los sueldos y el desgaste, y «lo fijo del mes» los contaba dos veces (visto con el fixture real, ADR-0453).
 */
const otrosGastos = (f: FilaER): number => Math.max(0, r2(f.gastos - f.planilla - f.depreciacion));

/** La misma respuesta a partir de una fila del Estado de resultados: la usan Resumen y Reportes (una función, una pieza). */
export function respuestaDeFila(f: FilaER, ctx: { mes: string; vende: boolean; taller: boolean }): Respuesta {
  if (f.ventas <= 0 && f.gastos <= 0 && f.planilla <= 0) return { estado: "sin_datos", motivo: `Todavía no hay ventas ni gastos en ${mesNombre(ctx.mes)}.` };
  const res = r2(f.resultado);
  const estado = res > 0 ? "gana" : res < 0 ? "pierde" : "empata";
  const vende = ctx.vende;
  const pagos = [f.costo > 0 ? "la ropa" : null, f.planilla > 0 ? "los sueldos" : null, otrosGastos(f) > 0 ? "los alquileres y los servicios" : null, f.depreciacion > 0 ? "el desgaste de máquinas y muebles" : null].filter(Boolean) as string[];
  const lista = pagos.length ? pagos.join(", ").replace(/, ([^,]*)$/, " y $1") : "lo registrado";
  const explica = !vende
    ? `${ctx.taller ? "El Taller" : "La empresa"} no vende: esto es lo que costó este mes (${lista}).`
    : f.ventas <= 0
      ? `Sin ventas todavía: esto es lo que ya se pagó este mes (${lista}).`
      : estado === "gana"
        ? `De los ${soles(f.ventas)} que vendiste (sin IGV), esto es lo que queda tuyo después de pagar ${lista}.`
        : estado === "pierde"
          ? `Vendiste ${soles(f.ventas)} (sin IGV) y pagar ${lista} costó más que eso.`
          : `Vendiste ${soles(f.ventas)} (sin IGV) y pagar ${lista} costó exactamente eso.`;
  return {
    estado,
    monto: Math.abs(res),
    vendido: f.ventas,
    verbo: !vende ? "costó" : estado === "pierde" ? "te faltan" : "te quedan",
    corto: estado === "gana" ? "Sí" : estado === "pierde" ? "No" : "Ni sí ni no",
    explica,
  };
}

// ---- 3. Por qué ese número: la cascada ---------------------------------------------------------------------------------------

/** `negativo`: solo en «queda», cuando el resultado es una pérdida (`monto` va siempre en positivo; el color sale de aquí). */
export type TramoCascada = { clave: string; nombre: string; monto: number; tipo: "entra" | "sale" | "queda"; detalle?: string; negativo?: boolean };

/** La cascada de una fila del Estado de resultados: la usan Resumen y Reportes. */
export function cascadaDeFila(f: FilaER): TramoCascada[] {
  // Los sueldos (62) y el desgaste (681) ya tienen su tramo: no se repiten en el detalle de «otros gastos».
  const gastosTop = f.detalleGastos.filter((g) => g.cuenta !== "62" && g.cuenta !== "681").sort((a, b) => b.monto - a.monto).slice(0, 3).map((g) => `${g.nombre} ${soles(g.monto)}`);
  const otros = otrosGastos(f);
  const tramos: TramoCascada[] = [{ clave: "ventas", nombre: "Lo que vendiste", monto: f.ventas, tipo: "entra", detalle: "Sin IGV: ese 18 % es de SUNAT." }];
  if (f.costo > 0) tramos.push({ clave: "costo", nombre: "Lo que costó la ropa", monto: f.costo, tipo: "sale", detalle: f.sinCosto > 0 ? `${f.sinCosto} ${f.sinCosto === 1 ? "prenda vendida sin costo" : "prendas vendidas sin costo"}.` : undefined });
  if (f.fletes > 0) tramos.push({ clave: "fletes", nombre: "Fletes de la mercadería", monto: f.fletes, tipo: "sale" });
  if (f.mermas > 0) tramos.push({ clave: "mermas", nombre: "Prendas perdidas o dañadas", monto: f.mermas, tipo: "sale" });
  if (f.planilla > 0) tramos.push({ clave: "planilla", nombre: "Sueldos", monto: f.planilla, tipo: "sale", detalle: f.planillaNota ?? undefined });
  if (otros > 0) tramos.push({ clave: "gastos", nombre: "Alquileres, servicios y otros gastos", monto: otros, tipo: "sale", detalle: gastosTop.length ? gastosTop.join(" · ") : undefined });
  if (f.depreciacion > 0) tramos.push({ clave: "depreciacion", nombre: "Desgaste de máquinas y muebles", monto: f.depreciacion, tipo: "sale" });
  // Lo que la cascada no nombra (un gasto devuelto, una nota de crédito, un ajuste) entra en un tramo propio, para que sumar los
  // tramos dé siempre «te queda»: una cuenta que no cuadra es peor que una línea de más.
  const explicado = tramos.reduce((s, t) => s + (t.tipo === "entra" ? t.monto : -t.monto), 0);
  const ajuste = r2(f.resultado - explicado);
  if (Math.abs(ajuste) >= 0.5) tramos.push({ clave: "ajustes", nombre: ajuste > 0 ? "Otros ajustes a favor" : "Otros ajustes", monto: Math.abs(ajuste), tipo: ajuste > 0 ? "entra" : "sale", detalle: "Devoluciones, notas de crédito o correcciones del mes." });
  tramos.push({ clave: "queda", nombre: f.resultado >= 0 ? "Te queda" : "Te falta", monto: Math.abs(r2(f.resultado)), tipo: "queda", ...(f.resultado < 0 ? { negativo: true } : {}) });
  return tramos;
}

// ---- 4. Qué deja cada lugar -----------------------------------------------------------------------------------------------

