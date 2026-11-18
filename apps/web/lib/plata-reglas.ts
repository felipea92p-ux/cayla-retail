// Estados financieros ▸ Flujo de efectivo (flujo de efectivo; ADR-0585, actividad 5).
//
// PROMETE: el flujo del mes en el «método directo», que es el que se lee como «cobraste / pagaste»: la plata de cada categoría que ya
// da la base va a una de tres partes (del día a día, compras que duran años, tú y los préstamos), con las diferencias de caja y la
// plata en camino aparte; lo que el cuadro no cubre cuando una cuenta arrancó a mitad del período (ADR-0609); y las recomendaciones.
// Las palabras y las columnas de la pantalla están en `estados-flujo.ts`.
// ASUME: toda cifra viene de la base (`fn_flujo_caja_real`, `fn_flujo_caja_proyeccion`). Aquí no se suma plata nueva: se agrupa lo que
// la base ya dio y se escribe.

import { etiquetaSemana, puntoMasBajo, soles, textoCategoria, type ArranqueCuenta, type CategoriaFlujo, type FlujoReal, type Proyeccion, type SemanaProy } from "./flujo-caja-reglas";
import { fechaCorta } from "./gastos-reglas";
import type { Recomendacion } from "./ganamos-reglas";

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

/** Los medios con que se le cobra a un cliente; lo demás que entra (el dueño, un reembolso) no es cobro. */
const MEDIOS_DE_COBRO: ReadonlySet<string> = new Set(["efectivo", "yape", "plin", "tarjeta", "transferencia", "qr"]);

export type LoQueNoCubre = {
  /** Solo las cuentas que cambian algo: una que arrancó en cero y sin movimientos no le quita nada al cuadro. */
  cuentas: ArranqueCuenta[];
  /** «el 28 oct» o «entre el 23 oct y el 28 oct». */
  cuando: string;
  cobrosFuera: number;
  salidasFuera: number;
  entreCuentasFuera: number;
  comisionFuera: number;
  cobrosEnElCuadro: number;
  /** Lo cobrado en el período de verdad: lo de arriba más lo de antes de arrancar. */
  cobrosDelPeriodo: number;
};

/**
 * Lo que el flujo del período no cubre porque una cuenta arrancó con su saldo a mitad de él (ADR-0609). Lo anterior al arranque ya está dentro
 * de ese saldo: sumarlo lo contaría dos veces, así que se dice aparte y las cifras del puente no cambian. `null`: el período está completo.
 */
export function loQueNoCubre(real: Pick<FlujoReal, "categorias" | "arranques">): LoQueNoCubre | null {
  const cuentas = real.arranques.filter((a) => [a.saldoInicial, a.cobros, a.salidas, a.entreCuentas].some((n) => Math.round(n * 100) !== 0));
  if (!cuentas.length) return null;
  const suma = (f: (a: ArranqueCuenta) => number) => r2(cuentas.reduce((t, a) => t + f(a), 0));
  const fechas = [...new Set(cuentas.map((a) => a.desde))].sort();
  const cobrosFuera = suma((a) => a.cobros);
  const cobrosEnElCuadro = r2(real.categorias.filter((c) => c.lado === "entra" && MEDIOS_DE_COBRO.has(c.clave)).reduce((t, c) => t + c.monto, 0));
  return {
    cuentas,
    cuando: fechas.length === 1 ? `el ${fechaCorta(fechas[0]!)}` : `entre el ${fechaCorta(fechas[0]!)} y el ${fechaCorta(fechas.at(-1)!)}`,
    cobrosFuera,
    salidasFuera: suma((a) => a.salidas),
    entreCuentasFuera: suma((a) => a.entreCuentas),
    comisionFuera: suma((a) => a.comision),
    cobrosEnElCuadro,
    cobrosDelPeriodo: r2(cobrosEnElCuadro + cobrosFuera),
  };
}

export const montoDe = (real: Pick<FlujoReal, "categorias">, clave: string) => real.categorias.filter((c) => c.clave === clave).reduce((a, c) => a + c.monto, 0);

/** Desde cuántos días de caja (sin vender nada) conviene decirlo. */
export const DIAS_DE_CAJA_CORTOS = 15;

/**
 * Qué te recomiendo en Flujo de efectivo (hasta 3, la más urgente arriba). Sale de lo que la pantalla ya muestra: si la plata alcanza
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
  if (real && !loQueNoCubre(real) && ganancia !== null && Math.round(ganancia) > 0 && real.saldoFinal < real.saldoInicial) {
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
