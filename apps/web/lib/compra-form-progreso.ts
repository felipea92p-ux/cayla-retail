// Lógica PURA del formulario «Registrar comprobante» (/compras/nueva): qué le falta a la compra para poder
// registrarse, cuánto lleva avanzado y qué decirle a quien tipea el costo de una línea.
//
// Por qué vive aquí y no dentro de `CompraFormV2.tsx`: (1) es una sola fuente de verdad — la lista de pendientes
// que se ve junto al botón, la barra «Listo N de 4» y los avisos de `onSubmit` salen TODOS de `requisitosDeCompra`,
// así que no pueden contradecirse (el botón no puede estar activo con un pendiente en pantalla, ni al revés);
// (2) no depende de React ni de archivos `"use client"`, así un Server Component puede importarla sin romper.
//
// Ojo: esto NO decide nada que la base no decida. Las reglas de fondo (contado ⇒ pago por el total, la misma
// serie-número no se registra dos veces, IGV solo en factura) las hace cumplir la RPC `registrar_compra`; esto solo
// espeja las que ya validaba la pantalla, en el mismo orden y con los mismos mensajes.

import { soles } from "./compras-reglas";

/** Un requisito por cada cosa que hace falta, en el orden en que se piden. */
export type ClaveRequisito = "proveedor" | "documento" | "lineas" | "pago";

export type LineaParaProgreso = { productoId: string; cantidad: number; costoUnitario: string };

export type EntradaRequisitos = {
  proveedorId: string;
  serie: string;
  numero: string;
  lineas: readonly LineaParaProgreso[];
  condicion: "contado" | "credito";
  pagarAhora: boolean;
  fechaVencimiento: string;
  /** Solo para el texto del aviso: cómo se está tipeando el costo. */
  conIgv: boolean;
  total: number;
  /** Suma de los medios de pago tipeados. */
  sumaPagos: number;
  /** Posición del primer medio de pago sin monto válido, o -1 si todos lo tienen. */
  indicePagoSinMonto: number;
};

export type Requisito = {
  clave: ClaveRequisito;
  ok: boolean;
  /** Lo que se le pide a la persona, escrito como condición («Proveedor», «Serie y número del documento»). */
  texto: string;
  /** Mientras está pendiente: el detalle corto de qué falta exactamente. Null si el texto ya lo dice todo. */
  falta: string | null;
  /** El aviso (y el campo al que lleva el cursor) que da `onSubmit` cuando este requisito no se cumple. */
  error: { mensaje: string; enfocar: string } | null;
};

const TOLERANCIA = 0.005;

export function requisitosDeCompra(e: EntradaRequisitos): Requisito[] {
  // 1 · Proveedor
  const proveedorOk = e.proveedorId !== "";
  const proveedor: Requisito = {
    clave: "proveedor",
    ok: proveedorOk,
    texto: "Proveedor",
    falta: null,
    error: proveedorOk ? null : { mensaje: "Elige un proveedor.", enfocar: "compra-proveedor" },
  };

  // 2 · Serie y número, tal como figuran en el documento
  const sinSerie = e.serie.trim() === "";
  const sinNumero = e.numero.trim() === "";
  const documentoOk = !sinSerie && !sinNumero;
  const documento: Requisito = {
    clave: "documento",
    ok: documentoOk,
    texto: "Serie y número del documento",
    falta: sinSerie && !sinNumero ? "Falta la serie" : !sinSerie && sinNumero ? "Falta el número" : null,
    error: documentoOk ? null : { mensaje: "El comprobante necesita serie y número, tal como figuran en el documento.", enfocar: sinSerie ? "compra-serie" : "compra-numero" },
  };

  // 3 · Al menos una línea con producto y costo. Una línea sin producto se ignora (es un renglón de más);
  // una con producto pero sin costo bloquea: «costo 0» es válido, «costo sin escribir» no.
  const validas = e.lineas.filter((l) => l.productoId && l.cantidad > 0);
  const sinCosto = e.lineas.findIndex((l) => l.productoId && l.cantidad > 0 && (l.costoUnitario === "" || Number(l.costoUnitario) < 0));
  const lineasOk = validas.length > 0 && sinCosto < 0;
  const lineas: Requisito = {
    clave: "lineas",
    ok: lineasOk,
    texto: "Al menos una línea con producto y costo",
    falta: sinCosto >= 0 ? `Falta el costo de la línea ${sinCosto + 1}` : null,
    error: lineasOk
      ? null
      : validas.length === 0
        ? { mensaje: "Agrega al menos una línea con producto y cantidad.", enfocar: "compra-linea-0-producto" }
        : { mensaje: `Cada línea necesita su costo unitario (${e.conIgv ? "con" : "sin"} IGV).`, enfocar: `compra-linea-${sinCosto}-costo` },
  };

  // 4 · Pago. Contado: obligatorio y por el total. Crédito: opcional (o «sin pago por ahora»), pero con vencimiento.
  const hayPago = e.condicion === "contado" || e.pagarAhora;
  const contado = e.condicion === "contado";
  let error: Requisito["error"] = null;
  let falta: string | null = null;
  if (e.condicion === "credito" && !e.fechaVencimiento) {
    error = { mensaje: "Una compra al crédito necesita fecha de vencimiento.", enfocar: "compra-vence" };
    falta = "Falta la fecha de vencimiento";
  } else if (hayPago && e.indicePagoSinMonto >= 0) {
    error = {
      mensaje: contado ? "Cada medio de pago necesita su monto." : "Escribe el monto del pago o desmarca 'Registrar un pago ahora'.",
      enfocar: `compra-pagos-monto-${Math.max(0, e.indicePagoSinMonto)}`,
    };
    falta = "Falta el monto de un medio de pago";
  } else if (hayPago && contado && Math.abs(e.sumaPagos - e.total) > TOLERANCIA) {
    error = { mensaje: `Al contado el pago debe sumar el total (${soles(e.total)}); los medios suman ${soles(e.sumaPagos)}.`, enfocar: "compra-pagos-monto-0" };
    falta = e.sumaPagos < e.total ? `Faltan ${soles(e.total - e.sumaPagos)} para el total` : `Sobran ${soles(e.sumaPagos - e.total)} sobre el total`;
  } else if (hayPago && e.sumaPagos > e.total + TOLERANCIA) {
    error = { mensaje: `El pago (${soles(e.sumaPagos)}) supera el total del comprobante (${soles(e.total)}).`, enfocar: "compra-pagos-monto-0" };
    falta = `Sobran ${soles(e.sumaPagos - e.total)} sobre el total`;
  }
  // «Sin pago por ahora» no exige nada por sí mismo, pero tampoco se marca como hecho mientras falte algo antes:
  // un visto verde en el paso 4 con la factura vacía sería mentira.
  const previosOk = proveedorOk && documentoOk && lineasOk;
  const pagoOk = error === null && (hayPago ? true : previosOk);
  const pago: Requisito = {
    clave: "pago",
    ok: pagoOk,
    texto: hayPago ? (contado ? "Pago por el total" : "Monto del pago de ahora") : "Sin pago por ahora (queda por pagar)",
    // El detalle del pago solo sirve cuando ya hay líneas: sin total no tiene sentido decir «faltan S/ 0.00».
    falta: !pagoOk && lineasOk ? falta : null,
    error,
  };

  return [proveedor, documento, lineas, pago];
}

export type ProgresoCompra = {
  listos: number;
  total: number;
  completo: boolean;
  /** Los tres tramos de la pantalla: Documento (1), Líneas (2), Pago (3). */
  tramos: { documento: boolean; lineas: boolean; pago: boolean };
};

export function progresoDeCompra(requisitos: readonly Requisito[]): ProgresoCompra {
  const ok = (c: ClaveRequisito) => requisitos.find((r) => r.clave === c)?.ok ?? false;
  const listos = requisitos.filter((r) => r.ok).length;
  return {
    listos,
    total: requisitos.length,
    completo: requisitos.length > 0 && listos === requisitos.length,
    tramos: {
      documento: ok("proveedor") && ok("documento"),
      lineas: ok("lineas"),
      // El pago por el total depende de que las líneas estén bien.
      pago: ok("pago") && ok("lineas"),
    },
  };
}

// ---------- Ayuda bajo el costo unitario ----------

export type AyudaCosto =
  | { tipo: "usar"; ultimo: number }
  | { tipo: "igual"; ultimo: number }
  | { tipo: "sube" | "baja"; ultimo: number; pct: number };

/**
 * Qué decirle a quien tipea el costo de una línea, comparándolo con el costo que el catálogo ya conoce de esa
 * prenda. `ultimo` y `tipeado` deben estar en la MISMA base (con o sin IGV: usa `costoParaTipear`). Si no se
 * conoce el costo, no hay ayuda (null): mejor callar que comparar contra cero.
 * Menos de 5 % de diferencia es «igual»: no vale la pena avisar por centavos.
 */
export function ayudaDeCosto(ultimo: number | null, tipeado: string): AyudaCosto | null {
  if (ultimo === null || !(ultimo > 0)) return null;
  const c = Number(tipeado);
  if (tipeado.trim() === "" || !Number.isFinite(c)) return { tipo: "usar", ultimo };
  const razon = (c - ultimo) / ultimo;
  if (Math.abs(razon) < 0.05) return { tipo: "igual", ultimo };
  return { tipo: razon > 0 ? "sube" : "baja", ultimo, pct: Math.round(Math.abs(razon) * 100) };
}

/**
 * El costo que el catálogo conoce para una línea: el de la variante si se eligió talla y color; si la línea es
 * «sin desglose», el de la prenda solo cuando todas sus variantes cuestan lo mismo (si difieren, ninguno es «el»
 * costo y comparar contra uno cualquiera engañaría). Null = no se sabe. Siempre SIN IGV, como lo guarda la base.
 */
export function costoConocido(variantesDelProducto: readonly { varianteId: string; costo: number }[], varianteId: string): number | null {
  if (varianteId) {
    const v = variantesDelProducto.find((x) => x.varianteId === varianteId);
    return v && v.costo > 0 ? v.costo : null;
  }
  if (variantesDelProducto.length === 0) return null;
  const primero = variantesDelProducto[0].costo;
  if (!(primero > 0)) return null;
  return variantesDelProducto.every((v) => Math.abs(v.costo - primero) < 0.005) ? primero : null;
}
