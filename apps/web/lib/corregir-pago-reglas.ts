// Corregir cómo se pagó una venta (ADR-0365, Felipe 2026-10-09): la hoja «Corregir el pago» del detalle de una venta en Ventas ▸
// Historial. Reglas puras: sin Supabase ni React. La base (`corregir_pagos_venta`) vuelve a verificar todo; aquí se arma lo que la hoja
// muestra y lo que manda, con la MISMA cuenta: los pagos nuevos suman exactamente lo cobrado, y el redondeo del efectivo (ADR-0311) se
// calcula igual que la base (`redondeoDelEfectivo`).
//
// Cómo se reparte: la persona marca los medios con que de verdad pagó. El ÚLTIMO marcado se lleva «lo que falta»; los demás llevan el
// monto que se escribe. Con un solo medio no se escribe nada: se lleva todo. Así la suma nunca puede quedar distinta del total.

import { METODOS_PAGO_VENTA, type MetodoPagoVenta } from "@cayla-retail/shared";
import type { CampoDeGuia } from "./guia-campos";
import { NOMBRE_METODO, type PagoRecibo } from "./recibo-reglas";
import { redondeoDelEfectivo } from "./redondeo-efectivo-reglas";

const aCentimos = (n: number) => Math.round(n * 100);
const deCentimos = (c: number) => c / 100;

/** Los medios que se pueden elegir, en el orden de la hoja de cobro de Vender. */
export const MEDIOS_CORREGIBLES: readonly MetodoPagoVenta[] =
  METODOS_PAGO_VENTA;

/** Lo que la hoja sabe de la venta. `cobrado` es lo que se reparte: los pagos de antes más su redondeo (el adelanto de un apartado no
 *  entra: no se toca). */
export type VentaACorregir = {
  cobrado: number;
  pagosAntes: readonly PagoRecibo[];
  redondeoAntes: number;
};

/** Lo elegido: los medios en el orden en que se marcaron, y el monto escrito de cada uno (texto, como está en la caja). */
export type Reparto = {
  medios: readonly MetodoPagoVenta[];
  montos: Partial<Record<MetodoPagoVenta, string>>;
};

/** El reparto con que abre la hoja: los mismos medios de antes, con sus montos (el efectivo con su redondeo devuelto: la persona ve lo
 *  que se debía, no lo que se entregó en monedas). */
export function repartoInicial(v: VentaACorregir): Reparto {
  const medios = v.pagosAntes.map((p) => p.metodo);
  const montos: Reparto["montos"] = {};
  for (const p of v.pagosAntes)
    montos[p.metodo] = (
      p.metodo === "efectivo" ? p.monto + v.redondeoAntes : p.monto
    ).toFixed(2);
  return { medios, montos };
}

/** Marca o desmarca un medio. El que se marca va al final: es el que se lleva lo que falta. */
export function alternarMedio(r: Reparto, medio: MetodoPagoVenta): Reparto {
  if (r.medios.includes(medio))
    return { ...r, medios: r.medios.filter((m) => m !== medio) };
  return { ...r, medios: [...r.medios, medio] };
}

/** Un monto escrito como lo escribe una persona («40», «40.5», «40,50», «S/ 40»), en céntimos; null si no es un monto. */
export function leerMonto(texto: string | undefined): number | null {
  const limpio = (texto ?? "").replace(/s\/|\s/gi, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(limpio)) return null;
  return aCentimos(Number(limpio));
}

export type PagoCorregido = { metodo: MetodoPagoVenta; monto: number };

export type Calculo = {
  /** Lo que se manda a la base: medio y monto exacto (el efectivo SIN redondear: la base lo redondea). Vacío si aún no cuadra. */
  pagos: PagoCorregido[];
  /** El medio que se lleva lo que falta (el último marcado), o null sin medios. */
  resto: MetodoPagoVenta | null;
  /** Lo que se lleva el resto, en soles; negativo si lo escrito ya pasa el total. */
  montoResto: number;
  /** Lo que se entrega en monedas si hay efectivo y la caja redondea (y su redondeo). */
  efectivo: { aCobrar: number; redondeo: number } | null;
  /** Por qué todavía no se puede guardar, en una frase; null si se puede. */
  problema: string | null;
  /** Es lo mismo que ya estaba: guardar no cambiaría nada. */
  sinCambios: boolean;
};

/** La cuenta de la hoja. `redondea` = la caja redondea el efectivo (`fn_acepta_redondeo_efectivo`). */
export function calcular(
  v: VentaACorregir,
  r: Reparto,
  redondea: boolean,
): Calculo {
  const total = aCentimos(v.cobrado);
  const resto = r.medios.at(-1) ?? null;
  const vacio = (problema: string, montoResto = v.cobrado): Calculo => ({
    pagos: [],
    resto,
    montoResto,
    efectivo: null,
    problema,
    sinCambios: false,
  });
  if (!resto) return vacio("Marca con qué pagó.");

  const escritos: PagoCorregido[] = [];
  for (const m of r.medios.slice(0, -1)) {
    const c = leerMonto(r.montos[m]);
    if (c === null || c <= 0)
      return vacio(`Escribe cuánto fue con ${NOMBRE_METODO[m]}.`);
    escritos.push({ metodo: m, monto: deCentimos(c) });
  }
  const cResto = total - escritos.reduce((a, p) => a + aCentimos(p.monto), 0);
  if (cResto <= 0)
    return vacio(
      `Lo escrito ya llega a S/ ${v.cobrado.toFixed(2)}: no le queda nada a ${NOMBRE_METODO[resto]}.`,
      deCentimos(cResto),
    );

  const pagos = [...escritos, { metodo: resto, monto: deCentimos(cResto) }];
  const enEfectivo = pagos.find((p) => p.metodo === "efectivo");
  const redondeo =
    enEfectivo && redondea ? redondeoDelEfectivo(enEfectivo.monto) : 0;
  const efectivo = enEfectivo
    ? {
        aCobrar: deCentimos(aCentimos(enEfectivo.monto) - aCentimos(redondeo)),
        redondeo,
      }
    : null;
  if (efectivo && efectivo.aCobrar <= 0) {
    return {
      pagos: [],
      resto,
      montoResto: deCentimos(cResto),
      efectivo,
      problema:
        "Menos de S/ 0.10 en efectivo no se puede entregar: pásalo a otro medio.",
      sinCambios: false,
    };
  }
  return {
    pagos,
    resto,
    montoResto: deCentimos(cResto),
    efectivo,
    problema: null,
    sinCambios: esIgual(v, pagos, redondeo),
  };
}

/** ¿Lo nuevo es lo que ya había? Se compara como lo compara la base: medio → monto entregado, con el redondeo aparte. */
function esIgual(
  v: VentaACorregir,
  pagos: readonly PagoCorregido[],
  redondeo: number,
): boolean {
  const clave = (lista: { metodo: string; monto: number }[]) =>
    lista
      .map((p) => `${p.metodo}:${aCentimos(p.monto)}`)
      .sort()
      .join("|");
  const antes = [
    ...v.pagosAntes.map((p) => ({
      metodo: p.metodo as string,
      monto: p.monto,
    })),
    ...(v.redondeoAntes > 0
      ? [{ metodo: "redondeo", monto: v.redondeoAntes }]
      : []),
  ];
  const despues = [
    ...pagos.map((p) => ({
      metodo: p.metodo as string,
      monto:
        p.metodo === "efectivo"
          ? deCentimos(aCentimos(p.monto) - aCentimos(redondeo))
          : p.monto,
    })),
    ...(redondeo > 0 ? [{ metodo: "redondeo", monto: redondeo }] : []),
  ];
  return clave(antes) === clave(despues);
}

/** Cuánto cambia el efectivo que la caja espera: positivo = espera más billetes; negativo = menos. Es lo que arregla el cuadre. */
export function cambioEnEfectivo(v: VentaACorregir, c: Calculo): number {
  const antes = v.pagosAntes.find((p) => p.metodo === "efectivo")?.monto ?? 0;
  const despues = c.efectivo?.aCobrar ?? 0;
  return deCentimos(aCentimos(despues) - aCentimos(antes));
}

/** La frase del cuadre, para el pie de la hoja y el aviso de éxito. null si el efectivo no cambia. */
export function fraseDelCuadre(delta: number): string | null {
  if (delta === 0) return null;
  const s = `S/ ${Math.abs(delta).toFixed(2)}`;
  return delta < 0
    ? `La caja va a esperar ${s} menos en efectivo.`
    : `La caja va a esperar ${s} más en efectivo.`;
}

/** Los campos de la guía de foco (ADR-0284): cómo pagó y quién corrige. El motivo es opcional. Sale de lo mismo que bloquea guardar. */
export function camposDeCorregir(
  c: Calculo,
  responsable: { listo: boolean; motivo: string | null },
): CampoDeGuia[] {
  return [
    {
      id: "medios",
      nombre: "Cómo pagó",
      requerido: true,
      hecho: c.problema === null && !c.sinCambios,
      pendiente: c.sinCambios
        ? "Cambia cómo pagó: así ya estaba."
        : (c.problema ?? ""),
    },
    {
      id: "responsable",
      nombre: "Responsable",
      requerido: true,
      hecho: responsable.listo,
      pendiente: responsable.motivo ?? "Elige quién corrige.",
    },
  ];
}

/** ¿Se ofrece corregir? Solo con la caja de la venta abierta y si hay algo cobrado fuera del adelanto (Felipe 2026-10-09). */
export function puedeCorregirPago(d: {
  anulada: boolean;
  cajaAbierta: boolean | null;
  cobrado: number;
}): { ok: true } | { ok: false; motivo: string | null } {
  if (d.anulada) return { ok: false, motivo: null };
  if (d.cobrado <= 0) return { ok: false, motivo: null };
  if (d.cajaAbierta === null) return { ok: false, motivo: null };
  if (!d.cajaAbierta)
    return {
      ok: false,
      motivo:
        "La caja de esta venta ya se cerró: el pago ya no se corrige aquí. El líder lo ajusta con un ingreso o egreso de caja.",
    };
  return { ok: true };
}

/** Los rechazos de `corregir_pagos_venta` que ya vienen dichos en castellano por la base: se muestran tal cual. */
export const HINTS_CORREGIR_PAGO = new Set([
  "venta_no_existe",
  "venta_de_otra_sede",
  "venta_anulada",
  "venta_sin_caja",
  "caja_cerrada",
  "pagos_invalidos",
  "efectivo_muy_chico",
]);

/** Lo que la hoja reparte, desde el detalle de la venta: los pagos sin el adelanto de un apartado, más el redondeo de antes. */
export function ventaACorregir(d: {
  pagos: readonly PagoRecibo[];
  redondeo: number;
}): VentaACorregir {
  const pagosAntes = d.pagos.filter((p) => (p.metodo as string) !== "anticipo");
  const cobrado = deCentimos(
    pagosAntes.reduce((a, p) => a + aCentimos(p.monto), 0) +
      aCentimos(d.redondeo),
  );
  return { cobrado, pagosAntes, redondeoAntes: d.redondeo };
}
