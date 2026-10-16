// El medidor de confianza de Finanzas (ADR-0417, Fase 1): qué tan cierto es el número del mes, y qué falta para que lo sea.
//
// La base manda HECHOS (`fn_finanzas_confianza`, 20261015235000): cuánto del costo es estimado, cuántos fijos hay, cuántas
// entradas sin factura, si hay saldos de arranque, si la tarjeta pasa por «por abonar», si la planilla está pagada, cuántos
// bancos se cuadraron. Aquí vive la CALIFICACIÓN: cada hecho es una pieza con un peso (cuánto del número depende de él), y
// el porcentaje es lo logrado sobre lo posible. Los pesos son una decisión de diseño que se ajusta mirando, no una medida: por
// eso están en la web y no en una migración.
//
// Lenguaje de tienda: nada de «devengo» ni «conciliación bancaria» en lo que lee Felipe; «cuadrar el banco», «cargar los
// alquileres». Cada pieza dice dónde se arregla.

import { soles } from "./flujo-caja-reglas";

export type EstadoPieza = "ok" | "parcial" | "falta" | "sin_dato";

export type HechosConfianza = {
  mes: string;
  hasta: string;
  corte: string | null;
  costo: { unidadesEstimadas: number; ventaEstimada: number; unidadesSinCosto: number; ventaSinCosto: number; unidadesTotal: number; ventaTotal: number };
  fijos: { configurados: number; sedesActivas: number; sedesConFijos: number; faltanMes: number };
  facturas: { lotesSinFactura: number; egresosSinClasificar: number };
  saldos: { registrados: number; bancos: number };
  tarjeta: { porAbonarCuentas: number; directoAlBanco: boolean; cobrosMes: number };
  planilla: { visible: boolean; mesPagada: boolean };
  conciliacion: { bancos: number; conciliadosMes: number };
};

export type PiezaConfianza = {
  clave: "costo" | "fijos" | "facturas" | "saldos" | "tarjeta" | "planilla" | "conciliacion";
  titulo: string;
  estado: EstadoPieza;
  /** Una frase en lenguaje de tienda: qué hay y qué falta. */
  detalle: string;
  /** Cuánto del número depende de esta pieza (los pesos suman 100). */
  peso: number;
  /** Lo que esta pieza aporta hoy, entre 0 y `peso`. */
  logrado: number;
  /** A dónde ir para arreglarlo, y cómo se llama el paso. */
  href?: string;
  accion?: string;
};

export type Confianza = {
  /** 0–100. Lo logrado sobre lo posible, sin contar las piezas sin dato. */
  pct: number;
  nivel: "alto" | "medio" | "bajo";
  piezas: PiezaConfianza[];
  /** La frase que acompaña al porcentaje. */
  frase: string;
};

/** Los pesos: cuánto del «te quedan» depende de cada fuente. Suman 100. @internal lo cruza la prueba */
export const PESOS: Record<PiezaConfianza["clave"], number> = {
  costo: 30,
  fijos: 20,
  facturas: 15,
  saldos: 10,
  tarjeta: 10,
  planilla: 10,
  conciliacion: 5,
};

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v !== "" && Number.isFinite(Number(v)) ? Number(v) : 0);
const bool = (v: unknown): boolean => v === true || v === "true";
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** El JSON de `fn_finanzas_confianza` → hechos tipados. Lo que falte vale 0 o false: una pieza sin dato se ve como «falta», nunca como «ok». */
export function leerHechosConfianza(data: unknown): HechosConfianza {
  const d = obj(data);
  const c = obj(d.costo), f = obj(d.fijos), fa = obj(d.facturas), s = obj(d.saldos), t = obj(d.tarjeta), p = obj(d.planilla), k = obj(d.conciliacion);
  return {
    mes: typeof d.mes === "string" ? d.mes : "",
    hasta: typeof d.hasta === "string" ? d.hasta : "",
    corte: typeof d.corte === "string" ? d.corte : null,
    costo: {
      unidadesEstimadas: num(c.unidades_estimadas), ventaEstimada: num(c.venta_estimada),
      unidadesSinCosto: num(c.unidades_sin_costo), ventaSinCosto: num(c.venta_sin_costo),
      unidadesTotal: num(c.unidades_total), ventaTotal: num(c.venta_total),
    },
    fijos: { configurados: num(f.configurados), sedesActivas: num(f.sedes_activas), sedesConFijos: num(f.sedes_con_fijos), faltanMes: num(f.faltan_mes) },
    facturas: { lotesSinFactura: num(fa.lotes_sin_factura), egresosSinClasificar: num(fa.egresos_sin_clasificar) },
    saldos: { registrados: num(s.registrados), bancos: num(s.bancos) },
    tarjeta: { porAbonarCuentas: num(t.por_abonar_cuentas), directoAlBanco: bool(t.directo_al_banco), cobrosMes: num(t.cobros_mes) },
    planilla: { visible: bool(p.visible), mesPagada: bool(p.mes_pagada) },
    conciliacion: { bancos: num(k.bancos), conciliadosMes: num(k.conciliados_mes) },
  };
}

const pct = (parte: number, todo: number) => (todo > 0 ? Math.round((parte / todo) * 100) : 0);
const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

/** La calificación: cada hecho es una pieza con su peso, su estado y una frase; el porcentaje es lo logrado sobre lo posible. */
export function calcularConfianza(h: HechosConfianza): Confianza {
  const piezas: PiezaConfianza[] = [];

  // 1. El costo de lo vendido: lo estimado y lo que sigue en 0, como parte de la venta.
  {
    const peso = PESOS.costo;
    const { ventaTotal, ventaEstimada, ventaSinCosto, unidadesEstimadas, unidadesSinCosto } = h.costo;
    if (ventaTotal <= 0) {
      piezas.push({ clave: "costo", titulo: "Costo de lo vendido", estado: "ok", detalle: "Todavía no hay ventas en el mes.", peso, logrado: peso });
    } else {
      const parte = Math.min(1, (ventaEstimada + ventaSinCosto) / ventaTotal);
      const pe = pct(ventaEstimada, ventaTotal), ps = pct(ventaSinCosto, ventaTotal);
      const trozos: string[] = [];
      if (unidadesEstimadas > 0) trozos.push(`el ${pe} % de lo vendido lleva costo estimado (${unidadesEstimadas} ${plural(unidadesEstimadas, "prenda sin registrar", "prendas sin registrar")})`);
      if (unidadesSinCosto > 0) trozos.push(`el ${ps} % sigue sin costo (${unidadesSinCosto} ${plural(unidadesSinCosto, "prenda", "prendas")})`);
      piezas.push({
        clave: "costo", titulo: "Costo de lo vendido",
        estado: parte === 0 ? "ok" : parte < 0.2 ? "parcial" : "falta",
        detalle: parte === 0 ? "Cada prenda vendida tiene su costo real." : `${trozos.join(" y ")}.`,
        peso, logrado: Math.round(peso * (1 - parte) * 100) / 100,
        href: parte === 0 ? undefined : "/inventario/por-regularizar", accion: parte === 0 ? undefined : "Registrar las prendas",
      });
    }
  }

  // 2. Los gastos fijos: que existan en cada sede y que los del mes ya estén registrados.
  {
    const peso = PESOS.fijos;
    const { configurados, sedesActivas, sedesConFijos, faltanMes } = h.fijos;
    if (configurados === 0) {
      piezas.push({ clave: "fijos", titulo: "Alquileres y servicios", estado: "falta", detalle: "No hay ningún gasto fijo cargado: alquileres, luz, internet, el contador. Sin ellos, «te quedan» sale más alto de lo real.", peso, logrado: 0, href: "/finanzas/gastos?tab=fijos", accion: "Cargar los fijos" });
    } else {
      const cobertura = sedesActivas > 0 ? Math.min(1, sedesConFijos / sedesActivas) : 1;
      const factor = cobertura * (faltanMes > 0 ? 0.6 : 1);
      const ok = cobertura >= 1 && faltanMes === 0;
      const partes: string[] = [];
      if (cobertura < 1) partes.push(`${sedesConFijos} de ${sedesActivas} sedes tienen sus fijos cargados`);
      if (faltanMes > 0) partes.push(`${faltanMes} ${plural(faltanMes, "fijo del mes todavía no está registrado", "fijos del mes todavía no están registrados")}`);
      piezas.push({
        clave: "fijos", titulo: "Alquileres y servicios", estado: ok ? "ok" : "parcial",
        detalle: ok ? `${configurados} ${plural(configurados, "gasto fijo cargado y registrado", "gastos fijos cargados y registrados")} este mes.` : `${partes.join("; ")}.`,
        peso, logrado: Math.round(peso * factor * 100) / 100,
        href: ok ? undefined : "/finanzas/gastos?tab=fijos", accion: ok ? undefined : "Revisar los fijos",
      });
    }
  }

  // 3. Las facturas y las salidas de caja: lo que entró sin papel y lo que salió sin nombre.
  {
    const peso = PESOS.facturas;
    const { lotesSinFactura, egresosSinClasificar } = h.facturas;
    const puntos = (lotesSinFactura === 0 ? 0.5 : 0) + (egresosSinClasificar === 0 ? 0.5 : 0);
    const partes: string[] = [];
    if (lotesSinFactura > 0) partes.push(`${lotesSinFactura} ${plural(lotesSinFactura, "entrada de mercadería sin factura", "entradas de mercadería sin factura")}`);
    if (egresosSinClasificar > 0) partes.push(`${egresosSinClasificar} ${plural(egresosSinClasificar, "salida de caja sin clasificar", "salidas de caja sin clasificar")}`);
    piezas.push({
      clave: "facturas", titulo: "Facturas y salidas de caja",
      estado: puntos === 1 ? "ok" : puntos === 0.5 ? "parcial" : "falta",
      detalle: puntos === 1 ? "Toda la mercadería del mes tiene su factura y cada salida de caja, su motivo." : `${partes.join(" y ")}.`,
      peso, logrado: Math.round(peso * puntos * 100) / 100,
      href: puntos === 1 ? undefined : lotesSinFactura > 0 ? "/finanzas/dinero/por-pagar" : "/finanzas/gastos?tab=egresos",
      accion: puntos === 1 ? undefined : lotesSinFactura > 0 ? "Registrar las facturas" : "Clasificar las salidas",
    });
  }

  // 4. Los saldos de arranque: con cuánto empezó cada banco.
  {
    const peso = PESOS.saldos;
    const { registrados, bancos } = h.saldos;
    const estado: EstadoPieza = bancos === 0 ? "falta" : registrados >= bancos ? "ok" : registrados > 0 ? "parcial" : "falta";
    const logrado = bancos === 0 ? 0 : Math.min(1, registrados / bancos);
    piezas.push({
      clave: "saldos", titulo: "Con cuánto empezaste",
      estado,
      detalle: bancos === 0 ? "No hay ningún banco cargado en Cuentas y dinero." : estado === "ok" ? "Cada banco tiene su saldo de arranque." : registrados === 0 ? "Ningún banco tiene saldo de arranque: la plata que tienes parte de cero." : `${registrados} de ${bancos} bancos tienen su saldo de arranque.`,
      peso, logrado: Math.round(peso * logrado * 100) / 100,
      href: estado === "ok" ? undefined : bancos === 0 ? "/configuracion" : "/finanzas/reportes/balance", accion: estado === "ok" ? undefined : bancos === 0 ? "Crear el banco" : "Anotar los saldos",
    });
  }

  // 5. Tarjeta y QR: si pasan por «por abonar», la comisión se puede registrar; si caen al banco, entran como completos.
  {
    const peso = PESOS.tarjeta;
    const { porAbonarCuentas, directoAlBanco, cobrosMes } = h.tarjeta;
    if (cobrosMes <= 0) {
      piezas.push({ clave: "tarjeta", titulo: "Comisiones de tarjeta y QR", estado: "ok", detalle: "No hubo cobros con tarjeta ni QR este mes.", peso, logrado: peso });
    } else {
      const ok = porAbonarCuentas > 0 && !directoAlBanco;
      const estado: EstadoPieza = ok ? "ok" : porAbonarCuentas > 0 ? "parcial" : "falta";
      piezas.push({
        clave: "tarjeta", titulo: "Comisiones de tarjeta y QR", estado,
        detalle: ok ? "Los cobros con tarjeta y QR esperan en «por abonar» hasta que la máquina deposita: la comisión se registra." : `${soles(cobrosMes)} cobrados con tarjeta y QR entran como si llegaran completos al banco: la comisión no se resta.`,
        peso, logrado: estado === "ok" ? peso : estado === "parcial" ? peso / 2 : 0,
        href: ok ? undefined : "/configuracion", accion: ok ? undefined : "Cuentas «por abonar»",
      });
    }
  }

  // 6. La planilla: solo quien la ve en Dynamic sabe si el mes ya está pagado.
  {
    const peso = PESOS.planilla;
    const { visible, mesPagada } = h.planilla;
    piezas.push(
      !visible
        ? { clave: "planilla", titulo: "Sueldos del mes", estado: "sin_dato", detalle: "Solo el líder ve la planilla de Dynamic.", peso, logrado: 0 }
        : mesPagada
          ? { clave: "planilla", titulo: "Sueldos del mes", estado: "ok", detalle: "La planilla del mes ya está pagada en Dynamic y entra a los números.", peso, logrado: peso }
          : { clave: "planilla", titulo: "Sueldos del mes", estado: "parcial", detalle: "Dynamic todavía no pagó el período: hasta que lo haga, el mes se ve sin sueldos.", peso, logrado: peso / 2 }
    );
  }

  // 7. Cuadrar el banco: cuántos bancos se cuadraron este mes.
  {
    const peso = PESOS.conciliacion;
    const { bancos, conciliadosMes } = h.conciliacion;
    const estado: EstadoPieza = bancos === 0 ? "falta" : conciliadosMes >= bancos ? "ok" : conciliadosMes > 0 ? "parcial" : "falta";
    piezas.push({
      clave: "conciliacion", titulo: "El banco, cuadrado", estado,
      detalle: bancos === 0 ? "No hay bancos que cuadrar." : estado === "ok" ? "Cada banco se cuadró contra su extracto este mes." : conciliadosMes === 0 ? "Ningún banco se cuadró contra su extracto este mes." : `${conciliadosMes} de ${bancos} bancos cuadrados este mes.`,
      peso, logrado: bancos === 0 ? 0 : Math.round(peso * Math.min(1, conciliadosMes / bancos) * 100) / 100,
      href: estado === "ok" ? undefined : bancos === 0 ? "/configuracion" : "/finanzas/dinero/conciliacion",
      accion: estado === "ok" ? undefined : bancos === 0 ? "Crear el banco" : "Cuadrar el banco",
    });
  }

  const conDato = piezas.filter((p) => p.estado !== "sin_dato");
  const posible = conDato.reduce((s, p) => s + p.peso, 0);
  const logrado = conDato.reduce((s, p) => s + p.logrado, 0);
  const valor = posible > 0 ? Math.round((logrado / posible) * 100) : 0;
  const nivel: Confianza["nivel"] = valor >= 85 ? "alto" : valor >= 55 ? "medio" : "bajo";
  const faltan = conDato.filter((p) => p.estado !== "ok").sort((a, b) => (b.peso - b.logrado) - (a.peso - a.logrado)).map((p) => p.titulo.toLowerCase());
  const frase =
    nivel === "alto"
      ? faltan.length ? `El número dice la verdad; solo queda ${faltan[0]}.` : "El número dice la verdad."
      : nivel === "medio"
        ? `Sirve para orientarte, no para decidir. Lo que más falta: ${faltan.slice(0, 2).join(" y ")}.`
        : `Todavía no sirve para decidir. Lo que más falta: ${faltan.slice(0, 2).join(" y ")}.`;
  return { pct: valor, nivel, piezas, frase };
}

/** El tono de insignia de cada estado (ADR-0169: ámbar = a medias, verde = hecho, rojo = falta). */
export function tonoPieza(estado: EstadoPieza): "verde" | "ambar" | "rojo" | "apagado" {
  return estado === "ok" ? "verde" : estado === "parcial" ? "ambar" : estado === "falta" ? "rojo" : "apagado";
}

export function textoEstado(estado: EstadoPieza): string {
  return estado === "ok" ? "Completo" : estado === "parcial" ? "A medias" : estado === "falta" ? "Falta" : "Sin dato";
}
