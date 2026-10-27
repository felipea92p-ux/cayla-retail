// Plan de campaña — CÓMO PAGAR la campaña sin que la caja se quede corta (ADR-0527, actualización «la caja», #13 de la auditoría). Lógica pura, sin React ni red.
//
// EL PROBLEMA. «Cuándo se paga» arma las tandas y los pagos, pero la persona no ve lo que de verdad importa: ¿mi caja aguanta esto? Finanzas ya sabe lo que entra y sale de las próximas semanas
// (`fn_flujo_caja_proyeccion`) y tiene un mínimo de caja que el dueño escribió. Esto pone los pagos de la compra encima de esa caja y compara las formas de pagar.
//
// QUÉ SE COMPARA. Las tandas (cuándo se PIDE) las decide la persona, y pedir lo más tarde que llega a tiempo ya es lo mejor para la caja. Lo que cambia la caja es **cómo se paga lo pedido**: al
// contado, a 30 o 60 días, con anticipo. Por eso se compara una forma de pago contra otra, aplicada a las MISMAS tandas, y la pregunta que responde es la útil: «¿aguanto al contado? Si no, ¿cuánto
// crédito necesito?». Las formas con crédito dependen de que el proveedor las dé (hoy ningún proveedor lo tiene cargado): se muestran, con lo que hay que confirmar, y nunca se recomiendan solas.
//
// LO QUE ES Y LO QUE NO ES. Es una COMPARACIÓN contra la caja que Finanzas ya proyecta, no una predicción: no promete probabilidades ni «ganancias de otros años» (Sinatra trae soles por día, sin costo ni
// margen, y el ERP lleva semanas). Para no engañar con una sola cifra, cada forma se mide dos veces: con lo que Finanzas espera cobrar y **si se cobra 20 % menos**. Ese 20 % es un «¿y si me va peor?»
// puesto a la vista, no una estadística, y la pantalla lo dice así. El colchón es el mínimo de caja que el dueño ya escribió en Finanzas; aquí no se adivina otro.
//
// CONTRATO
//   PROMETE: que la caja «con la compra» sea la de Finanzas (la misma proyección y la misma cuenta, `cajaConCompra`) menos los pagos de la pantalla; que una forma que depende de crédito NUNCA se
//            recomiende sola; que solo se diga «aguanta» si la caja no baja del mínimo (ni de cero), y que si nada alcanza se diga en vez de elegir «la menos mala» en silencio.
//   ASUME: que la proyección trae sus semanas completas y que los pagos de antes de hoy ya salieron (están en el saldo de hoy): no se restan otra vez.
//   NO HACE: no guarda nada, no cambia la proyección de Finanzas ni sabe si un proveedor da crédito de verdad.

import { fechaEnPalabras, type PagoCaja } from "./caja-proxima-reglas";
import { leerProyeccion, type Proyeccion } from "./flujo-caja-reglas";
import { cajaConCompra, type CajaConCompra } from "./inversion-mercaderia-reglas";
import { FORMAS_DE_PAGO, ORDEN_DE_FORMAS, pagosDeLasTandas, type FormaDePago, type PagoDeCompra, type Tanda } from "./plan-compra-inversion";

/** La caja de las próximas 12 semanas tal como llega a la pantalla del Plan: cruda (la lee `leerProyeccion` en el navegador) o por qué no hay: `sin_permiso` (la caja es de CAYLA entera y la base se la da solo a un líder de equipo) o `falla`. */
export type FlujoDelPlan = { estado: "ok"; datos: unknown } | { estado: "sin_permiso" } | { estado: "falla" };

/** La caja leída, o null si no hay (no se pidió, no se tiene permiso, falló o llegó sin semanas): nunca una caja inventada. */
export function leerLaCaja(flujo: FlujoDelPlan | null): Proyeccion | null {
  if (flujo?.estado !== "ok") return null;
  try {
    const p = leerProyeccion(flujo.datos);
    return p.semanas.length > 0 && p.hoy !== "" ? p : null;
  } catch {
    return null;
  }
}

/** El «¿y si me va peor?»: cuánto menos se cobra que lo que Finanzas espera. Puesto a la vista, no medido. */
export const BAJA_DE_COBROS = 0.2;

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * La misma proyección con menos cobros: cada semana entra `baja` (20 %) menos y el saldo de cada cierre baja lo acumulado que no se cobró. Los pagos y las salidas no cambian: solo se cobra menos.
 */
export function conMenosCobros(p: Proyeccion, baja: number = BAJA_DE_COBROS): Proyeccion {
  let falta = 0;
  const semanas = p.semanas.map((s) => {
    const menos = s.entra * baja;
    falta += menos;
    const saldo = s.saldo - falta;
    return { ...s, entra: s.entra - menos, saldo, bajoMinimo: saldo < p.minimoCaja };
  });
  return { ...p, semanas };
}

/**
 * Los pagos de la pantalla en soles que salen de la caja (con IGV): cada pago es su % de lo que sale de caja y el último toma el residuo (suman EXACTO). Solo cuentan los de hoy en adelante:
 * uno que cayó antes ya salió y está en el saldo de hoy.
 */
export function pagosEnSoles(pagos: readonly PagoDeCompra[], saleDeCaja: number, hoy: string): PagoCaja[] {
  let acumulado = 0;
  const todos = pagos.map((p, i) => {
    const monto = i === pagos.length - 1 ? r2(saleDeCaja - acumulado) : r2((saleDeCaja * p.pct) / 100);
    acumulado += monto;
    return { fecha: p.fecha, monto };
  });
  return todos.filter((p) => p.fecha >= hoy && p.monto > 0);
}

/** Cuántos días de crédito da una forma, en promedio ponderado: 0 al contado; 15 con 50 % de anticipo y el resto a 30; 42 con 30 % de anticipo y el resto a 60. */
export const diasDeCredito = (forma: FormaDePago): number => FORMAS_DE_PAGO[forma].cuotas.reduce((s, c) => s + c.dias * c.parte, 0);

export type FormaParaComparar = {
  clave: FormaDePago;
  nombre: string;
  /** Las mismas tandas de la pantalla, todas con esta forma de pago. */
  tandas: Tanda[];
  /** Lo que tiene que ser cierto para que valga (que el proveedor dé crédito); null si no depende de nadie (el contado). */
  requiere: string | null;
  diasDeCredito: number;
};

const REQUIERE: Record<FormaDePago, string | null> = {
  contado: null,
  d30: "Tu proveedor tiene que darte crédito a 30 días: confírmalo antes de contar con esto.",
  d60: "Tu proveedor tiene que darte crédito a 60 días: confírmalo antes de contar con esto.",
  a50: "Tu proveedor tiene que aceptar la mitad de anticipo y el resto a 30 días: confírmalo antes de contar con esto.",
  a30: "Tu proveedor tiene que aceptar 30 % de anticipo y el resto a 60 días: confírmalo antes de contar con esto.",
};

/** Las cinco formas de pagar, cada una aplicada a las tandas de la pantalla, de la que menos crédito pide a la que más. */
export function formasParaComparar(tandas: readonly Tanda[]): FormaParaComparar[] {
  return ORDEN_DE_FORMAS.map((clave) => ({ clave, nombre: FORMAS_DE_PAGO[clave].nombre, tandas: tandas.map((t) => ({ ...t, forma: clave })), requiere: REQUIERE[clave], diasDeCredito: diasDeCredito(clave) })).sort(
    (a, b) => a.diasDeCredito - b.diasDeCredito,
  );
}

export type FormaEvaluada = FormaParaComparar & {
  pagos: PagoDeCompra[];
  /** La caja con lo que Finanzas espera cobrar; null si la proyección no alcanza a verla. */
  esperado: CajaConCompra | null;
  /** La caja si se cobra 20 % menos. */
  flojo: CajaConCompra | null;
  /** Cuánto sale de caja dentro de lo que la proyección alcanza a ver. */
  saleEnElHorizonte: number;
  /** Con lo esperado, la caja no baja del mínimo (ni de cero). */
  aguantaLoEsperado: boolean;
  /** Aun cobrando 20 % menos, la caja no baja del mínimo (ni de cero). */
  aguantaSiVaPeor: boolean;
};

const sinBajar = (c: CajaConCompra | null, minimo: number): boolean => c !== null && !c.sinPlata && c.masBajo.saldo >= Math.max(0, minimo);

/** Cada forma con lo que le pasaría a la caja, con lo esperado y si se cobra 20 % menos. */
export function evaluarFormas(p: Proyeccion, saleDeCaja: number, formas: readonly FormaParaComparar[]): FormaEvaluada[] {
  const peor = conMenosCobros(p);
  return formas.map((f) => {
    const pagos = pagosDeLasTandas(f.tandas);
    const enSoles = pagosEnSoles(pagos, saleDeCaja, p.hoy);
    const esperado = cajaConCompra(p, enSoles);
    const flojo = cajaConCompra(peor, enSoles);
    return { ...f, pagos, esperado, flojo, saleEnElHorizonte: esperado?.salePorLaCompra ?? 0, aguantaLoEsperado: sinBajar(esperado, p.minimoCaja), aguantaSiVaPeor: sinBajar(flojo, p.minimoCaja) };
  });
}

export type Veredicto =
  /** La caja ya viene apretada SIN esta compra: la forma de pagarla no lo arregla. */
  | { tipo: "caja-ya-apretada"; frase: string }
  /** El contado aguanta, aun cobrando 20 % menos: no hace falta crédito. */
  | { tipo: "contado-aguanta"; clave: FormaDePago; frase: string }
  /** El contado aguanta con lo esperado pero no si se cobra 20 % menos: una compra justa. */
  | { tipo: "contado-justo"; clave: FormaDePago; frase: string }
  /** El contado no aguanta; con crédito sí: la forma que menos crédito pide. */
  | { tipo: "pide-credito"; clave: FormaDePago; frase: string }
  /** Ni con crédito alcanza. */
  | { tipo: "ninguna"; frase: string }
  /** Ningún pago cae dentro de lo que la caja alcanza a ver: no hay con qué comparar. */
  | { tipo: "fuera-de-vista"; frase: string };

const soles = (n: number) => `${n < 0 ? "−" : ""}S/ ${Math.round(Math.abs(n)).toLocaleString("es-PE")}`;

/**
 * Lo que se le dice a la persona. Primero, si el contado aguanta (la única forma que no depende de nadie); si no, la forma que MENOS crédito pide y aguanta (preferida la que aguanta aun cobrando
 * 20 % menos); y si ninguna alcanza, que se diga: nunca se elige «la menos mala» en silencio.
 */
export function veredictoDeLaForma(p: Proyeccion, evaluadas: readonly FormaEvaluada[]): Veredicto {
  const contado = evaluadas.find((f) => f.clave === "contado");
  if (!contado || evaluadas.every((f) => f.saleEnElHorizonte <= 0)) {
    return { tipo: "fuera-de-vista", frase: "Ningún pago de esta campaña cae en las 12 semanas que tu caja alcanza a ver (los hay más adelante o ya salieron): todavía no se puede comparar cómo pagarla." };
  }
  // Si la caja ya se queda corta ANTES de esta compra, ninguna forma de pagarla la arregla y la compra no es la culpable: se dice primero (sería injusto decir «esta compra no cabe»).
  const sinLaCompra = cajaConCompra(p, []);
  if (sinLaCompra && !sinBajar(sinLaCompra, p.minimoCaja)) {
    return {
      tipo: "caja-ya-apretada",
      frase: sinLaCompra.sinPlata
        ? `Tu caja ya se queda sin plata el ${fechaEnPalabras(sinLaCompra.sinPlata.fecha)} aun sin esta compra (llega a ${soles(sinLaCompra.masBajo.saldo)}). Cambiar cómo se paga no lo arregla: primero hay que cuidar lo que ya entra y sale.`
        : `Tu caja ya baja de tu mínimo (${soles(p.minimoCaja)}) el ${fechaEnPalabras(sinLaCompra.masBajo.fecha)} aun sin esta compra. Ninguna forma de pagarla la deja sobre tu mínimo.`,
    };
  }
  const minimo = p.minimoCaja > 0 ? ` y no baja de tu mínimo (${soles(p.minimoCaja)})` : "";
  const donde = (f: FormaEvaluada) => `${soles(f.esperado!.masBajo.saldo)} el ${fechaEnPalabras(f.esperado!.masBajo.fecha)}`;
  if (contado.aguantaSiVaPeor) {
    return { tipo: "contado-aguanta", clave: "contado", frase: `Al contado tu caja aguanta: su punto más bajo es ${donde(contado)}${minimo}, y aguanta aun si se cobra 20 % menos. No necesitas crédito.` };
  }
  if (contado.aguantaLoEsperado) {
    return { tipo: "contado-justo", clave: "contado", frase: `Al contado tu caja aguanta con lo que se espera cobrar (su punto más bajo es ${donde(contado)}${minimo}), pero si se cobra 20 % menos queda bajo tu mínimo: es una compra justa.` };
  }
  const conCredito = evaluadas.filter((f) => f.requiere !== null);
  const alMenosCredito = (lista: FormaEvaluada[]) => [...lista].sort((a, b) => a.diasDeCredito - b.diasDeCredito)[0];
  const forma = alMenosCredito(conCredito.filter((f) => f.aguantaSiVaPeor)) ?? alMenosCredito(conCredito.filter((f) => f.aguantaLoEsperado));
  if (forma) {
    return {
      tipo: "pide-credito",
      clave: forma.clave,
      frase: `Al contado tu caja no aguanta esta compra (llega a ${soles(contado.esperado!.masBajo.saldo)} el ${fechaEnPalabras(contado.esperado!.masBajo.fecha)}). Con «${forma.nombre}» sí: su punto más bajo es ${donde(forma)}. Pregúntale a tu proveedor si te lo da.`,
    };
  }
  return { tipo: "ninguna", frase: "Ninguna forma de pagar aguanta tu caja con lo que hoy se espera cobrar. Baja la compra (el tope), junta más plata antes de pedir o pide a otros proveedores." };
}

export type AlertaDeCaja = { tono: "urgente" | "atencion" | "ok" | "info"; titulo: string; detalle: string };

/**
 * La alerta de lo que se ve en la gráfica: la caja se queda sin plata, baja del mínimo, aguanta, o la compra cae fuera de lo visible. `sinLaCompra` dice si la caja YA estaba mal antes de la compra
 * (entonces la forma de pagar no es la culpable y se dice).
 */
export function alertaDeLaCaja(p: Proyeccion, conCompra: CajaConCompra | null, sinLaCompra: CajaConCompra | null): AlertaDeCaja {
  if (!conCompra) return { tono: "info", titulo: "No hay caja que mostrar", detalle: "La proyección de Finanzas no trae semanas todavía." };
  if (conCompra.salePorLaCompra <= 0) {
    return conCompra.fueraDelHorizonte.length > 0
      ? { tono: "info", titulo: "La compra cae más allá de lo que se ve", detalle: `Su primer pago es el ${fechaEnPalabras(conCompra.fueraDelHorizonte[0]!.fecha)}, después de las 12 semanas que la caja alcanza a ver.` }
      : { tono: "info", titulo: "No hay pagos por salir", detalle: "Ningún pago de esta compra cae de hoy en adelante." };
  }
  const yaSinPlata = sinLaCompra?.sinPlata ?? null;
  if (conCompra.sinPlata) {
    return yaSinPlata
      ? { tono: "urgente", titulo: `Tu caja ya se queda sin plata el ${fechaEnPalabras(yaSinPlata.fecha)}`, detalle: `Aun sin esta compra. Con ella llega a ${soles(conCompra.masBajo.saldo)} el ${fechaEnPalabras(conCompra.masBajo.fecha)}.` }
      : {
          tono: "urgente",
          titulo: `Con esta compra tu caja se queda sin plata el ${fechaEnPalabras(conCompra.sinPlata.fecha)}`,
          detalle: `Llega a ${soles(conCompra.masBajo.saldo)} el ${fechaEnPalabras(conCompra.masBajo.fecha)}. Mueve una tanda a otra semana, paga a más días o baja el tope.`,
        };
  }
  if (p.minimoCaja > 0 && conCompra.diasBajoMinimo > 0) {
    return {
      tono: "atencion",
      titulo: `El ${fechaEnPalabras(conCompra.masBajo.fecha)} tu caja baja a ${soles(conCompra.masBajo.saldo)}`,
      detalle: `Es menos que tu mínimo de ${soles(p.minimoCaja)}: ${conCompra.diasBajoMinimo} ${conCompra.diasBajoMinimo === 1 ? "día" : "días"} bajo el mínimo. Mueve una tanda a otra semana, paga a más días o baja el tope.`,
    };
  }
  return {
    tono: "ok",
    titulo: "La caja aguanta el plan",
    detalle: `Su punto más bajo es ${soles(conCompra.masBajo.saldo)} el ${fechaEnPalabras(conCompra.masBajo.fecha)}${p.minimoCaja > 0 ? `: no baja de tu mínimo (${soles(p.minimoCaja)})` : ""}.`,
  };
}
