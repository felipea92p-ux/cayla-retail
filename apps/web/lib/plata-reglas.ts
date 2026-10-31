// Estados financieros ▸ ¿Dónde está la plata? (flujo de efectivo; ADR-0585, actividad 5).
//
// PROMETE: el flujo del mes en el «método directo», que es el que se lee como «cobraste / pagaste»: la plata de cada categoría que ya
// da la base va a una de tres partes (del día a día, compras que duran años, tú y los préstamos), con las diferencias de caja y la
// plata en camino aparte; el puente de cómo empezó a cómo terminó el mes; la frase que explica por qué la plata no siguió a la
// ganancia; y las recomendaciones.
// ASUME: toda cifra viene de la base (`fn_flujo_caja_real`, `fn_flujo_caja_proyeccion`). Aquí no se suma plata nueva: se agrupa lo que
// la base ya dio y se escribe.

import { etiquetaSemana, puntoMasBajo, soles, textoCategoria, type CategoriaFlujo, type FlujoReal, type Proyeccion, type SemanaProy } from "./flujo-caja-reglas";
import type { Recomendacion } from "./ganamos-reglas";
import type { TramoCascada } from "./pulso-reglas";

export type Actividad = "operacion" | "inversion" | "financiamiento" | "ajustes";

/** Lo que no está aquí es del día a día (cobrar, pagar mercadería, gastos, sueldos, impuestos, comisiones). */
const ACTIVIDAD: Readonly<Record<string, Actividad>> = {
  activos: "inversion",
  dueno_pone: "financiamiento",
  dueno_saca: "financiamiento",
  pago_tarjeta: "financiamiento",
};

export const PARTES: readonly { clave: Actividad; nombre: string; detalle: string; formal: string }[] = [
  { clave: "operacion", nombre: "Del día a día", detalle: "Vender, comprar mercadería y pagar los gastos", formal: "Efectivo de actividades de operación" },
  { clave: "inversion", nombre: "Compras que duran años", detalle: "Máquinas, muebles y mejoras", formal: "Efectivo de actividades de inversión" },
  { clave: "financiamiento", nombre: "Tú y los préstamos", detalle: "Lo que pusiste, lo que retiraste y las deudas que pagaste", formal: "Efectivo de actividades de financiamiento" },
  { clave: "ajustes", nombre: "Diferencias y plata en camino", detalle: "Faltantes de caja y plata que pasa de una cuenta a otra", formal: "Diferencias de caja y efectivo en tránsito" },
];

export const actividadDe = (c: Pick<CategoriaFlujo, "clave" | "lado">): Actividad => (c.lado === "ajuste" ? "ajustes" : (ACTIVIDAD[c.clave] ?? "operacion"));

/** Con su signo: lo que entra suma, lo que sale resta, un ajuste ya viene con el suyo. */
const conSigno = (c: CategoriaFlujo) => (c.lado === "sale" ? -c.monto : c.monto);
const r2 = (n: number) => Math.round(n * 100) / 100;

export type ParteDelFlujo = { clave: Actividad; nombre: string; detalle: string; formal: string; total: number; lineas: { nombre: string; monto: number }[] };

/** Las tres partes (y las diferencias), cada una con su total y sus categorías por su nombre, de mayor a menor. Sin las vacías. */
export function partesDelFlujo(real: Pick<FlujoReal, "categorias">): ParteDelFlujo[] {
  return PARTES.map((p) => {
    const suyas = real.categorias.filter((c) => actividadDe(c) === p.clave && Math.round(c.monto * 100) !== 0);
    const lineas = suyas.map((c) => ({ nombre: textoCategoria(c.clave), monto: conSigno(c) })).sort((a, b) => Math.abs(b.monto) - Math.abs(a.monto));
    return { ...p, total: r2(lineas.reduce((a, l) => a + l.monto, 0)), lineas };
  }).filter((p) => p.lineas.length);
}

/** El puente del mes: lo que había al empezar, lo que movió cada parte (se toca y muestra sus categorías) y lo que hay al cerrar. */
export function puentePlata(real: FlujoReal, enCurso: boolean): TramoCascada[] {
  const tramos: TramoCascada[] = [{ clave: "inicio", nombre: "Al empezar el mes", monto: real.saldoInicial, tipo: "entra" }];
  for (const p of partesDelFlujo(real)) {
    tramos.push({
      clave: p.clave,
      nombre: p.nombre,
      detalle: p.detalle,
      monto: Math.abs(p.total),
      tipo: p.total >= 0 ? "entra" : "sale",
      lineas: p.lineas.map((l) => ({ nombre: l.nombre, real: l.monto, plan: null })),
    });
  }
  tramos.push({ clave: "fin", nombre: enCurso ? "Hoy" : "Al cerrar el mes", monto: Math.abs(real.saldoFinal), tipo: "queda", ...(real.saldoFinal < 0 ? { negativo: true } : {}) });
  return tramos;
}

const montoDe = (real: Pick<FlujoReal, "categorias">, clave: string) => real.categorias.filter((c) => c.clave === clave).reduce((a, c) => a + c.monto, 0);

/**
 * Por qué la plata no siguió a la ganancia, en una frase. Nombra solo lo que se fue fuera del día a día (las compras que duran, los
 * retiros, la tarjeta), que es lo que separa «gané» de «tengo». Sin la ganancia, dice cuánto subió o bajó.
 */
export function fraseDeLaPlata(real: FlujoReal, ganancia: number | null): string {
  const d = Math.round(real.saldoFinal - real.saldoInicial);
  const cambio = d === 0 ? "La plata quedó igual que al empezar el mes" : `La plata ${d > 0 ? "subió" : "bajó"} ${soles(Math.abs(d))} en el mes`;
  if (ganancia === null) return `${cambio}.`;
  const g = Math.round(ganancia);
  const fuera = [
    [montoDe(real, "activos"), "compraste cosas que duran años por"],
    [montoDe(real, "dueno_saca"), "retiraste"],
    [montoDe(real, "pago_tarjeta"), "pagaste la tarjeta de crédito por"],
  ]
    .filter(([m]) => Math.round(m as number) > 0)
    .map(([m, t]) => `${t} ${soles(m as number)}`);
  const lista = fuera.length > 1 ? `${fuera.slice(0, -1).join(", ")} y ${fuera.at(-1)}` : (fuera[0] ?? "");
  if (g > 0 && d < 0) return lista ? `Ganaste ${soles(g)}, pero ${lista}.` : `Ganaste ${soles(g)}, pero la plata bajó ${soles(-d)}: revisa lo que entró y salió del día a día.`;
  if (g > 0) return `Ganaste ${soles(g)} y la plata ${d > 0 ? `subió ${soles(d)}` : "quedó igual"}.`;
  if (g < 0) return `Perdiste ${soles(-g)} en el mes. ${cambio}.`;
  return `${cambio}.`;
}

/** Desde cuántos días de caja (sin vender nada) conviene decirlo. */
export const DIAS_DE_CAJA_CORTOS = 15;

/**
 * Qué te recomiendo en ¿Dónde está la plata? (hasta 3, la más urgente arriba). Sale de lo que la pantalla ya muestra: si la plata alcanza
 * en las próximas semanas, por qué bajó aunque se ganó, los días de caja y el próximo impuesto. Ninguna inventa una regla.
 */
export function recomendacionesPlata({
  real,
  proyeccion,
  semanas,
  ganancia,
  href,
}: {
  real: FlujoReal | null;
  proyeccion: Proyeccion | null;
  /** Lo que viene, semana a semana, tal como está (sin palancas). */
  semanas: readonly SemanaProy[];
  ganancia: number | null;
  href: (ruta: string) => string;
}): Recomendacion[] {
  const out: Recomendacion[] = [];
  const bajo = puntoMasBajo(semanas);
  if (proyeccion && bajo) {
    const semana = etiquetaSemana(bajo.desde, bajo.hasta);
    if (bajo.saldo < proyeccion.minimoCaja) {
      out.push({
        clave: "no-alcanza",
        tono: "error",
        prioridad: 1,
        titulo: `La semana del ${semana} bajas a ${soles(bajo.saldo)}`,
        texto: `${soles(proyeccion.minimoCaja - bajo.saldo)} bajo tu mínimo de caja. Mueve un pago grande o retira menos ese mes; en «¿Y si…?» lo pruebas.`,
        accion: { texto: "Ver lo que se debe", href: href("/finanzas/dinero/por-pagar") },
      });
    } else {
      out.push({
        clave: "alcanza",
        tono: "exito",
        prioridad: 5,
        titulo: `La plata alcanza las próximas ${semanas.length} semanas`,
        texto: `Lo más bajo: ${soles(bajo.saldo)} la semana del ${semana}, ${soles(bajo.saldo - proyeccion.minimoCaja)} sobre tu mínimo.`,
      });
    }
  }
  if (real && ganancia !== null && Math.round(ganancia) > 0 && real.saldoFinal < real.saldoInicial) {
    const fuera = montoDe(real, "activos") + montoDe(real, "dueno_saca");
    if (Math.round(fuera) > 0) {
      out.push({
        clave: "gano-y-bajo",
        tono: "atencion",
        prioridad: 2,
        titulo: `Ganaste ${soles(ganancia)} y la plata bajó ${soles(real.saldoInicial - real.saldoFinal)}`,
        texto: `Se fueron ${soles(fuera)} en compras que duran y retiros. Si vas a comprar algo grande, sepáralo del mes en que retiras.`,
      });
    }
  }
  if (proyeccion?.diasDeCaja !== null && proyeccion?.diasDeCaja !== undefined && proyeccion.diasDeCaja < DIAS_DE_CAJA_CORTOS) {
    out.push({
      clave: "dias",
      tono: "atencion",
      prioridad: 3,
      titulo: `Sin vender, la plata alcanza ${proyeccion.diasDeCaja} ${proyeccion.diasDeCaja === 1 ? "día" : "días"}`,
      texto: `En un día normal salen ${soles(proyeccion.salidasDiarias)}. Con menos de ${DIAS_DE_CAJA_CORTOS} días, una semana floja se nota.`,
    });
  }
  const impuesto = [...(proyeccion?.salidas ?? [])].filter((s) => s.tipo === "impuesto").sort((a, b) => a.fecha.localeCompare(b.fecha))[0];
  if (impuesto) {
    out.push({
      clave: "impuesto",
      tono: "info",
      prioridad: 4,
      titulo: `${impuesto.titulo}: ${soles(impuesto.monto)} el ${impuesto.fecha.slice(8, 10)}/${impuesto.fecha.slice(5, 7)}`,
      texto: "Ya está descontado en lo que viene.",
      accion: { texto: "Ver Impuestos", href: href("/finanzas/impuestos") },
    });
  }
  return out.sort((a, b) => a.prioridad - b.prioridad).slice(0, 3);
}
