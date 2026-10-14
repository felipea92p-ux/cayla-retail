// La cuenta sellada (ADR-0195 F3b, PLAN-FINANZAS §7 bis): reglas puras de los combos «Sale de», «Entra a» y
// «¿A qué banco?». Todo cobro y pago guarda el MEDIO (cómo) y la CUENTA (dónde), y la cuenta se sella al guardar.
// Aquí solo se decide qué cuentas mostrar para un medio y cuál proponer; la base vuelve a validar todo
// (`retail.fn_cuenta_sirve`, `retail.fn_cuenta_sellada`). Si cambias `sirveParaMedio`, cambia también la función de la base.
//
// El fondo por rendir (ADR-0362 fase 6) es la excepción: `fn_cuentas_para_elegir` no lo lista ni `fn_cuenta_sirve` lo acepta. Solo
// los pagos de Compras lo suman («Mi fondo», `conMiFondo` en `fondos-reglas.ts`) y su regla es la de `retail.fn_fondo_para_pagar`
// (`MEDIOS_DEL_FONDO`): si cambias una, cambia la otra.

import { soles } from "./compras-reglas";

export type TipoCuentaElegible = "cajon" | "caja_fuerte" | "por_rendir" | "banco" | "por_abonar" | "tarjeta_credito" | "fondo";
/** «cobro»: la plata de las clientas (entra por la tienda y, si se devuelve, sale por el mismo camino). «pago»: sale hacia
 *  un proveedor o un gasto. «reembolso»: un proveedor le devuelve plata a CAYLA. */
export type ClaseMovimiento = "cobro" | "pago" | "reembolso";

export type CuentaElegible = {
  id: string;
  nombre: string;
  tipo: TipoCuentaElegible;
  ubicacionId: string | null;
  ubicacionNombre: string | null;
  /** Solo el cajón: si su caja está abierta (del cajón solo sale plata con la caja abierta). */
  cajaAbierta: boolean;
  /** Los medios para los que la base propone esta cuenta en la tienda pedida. */
  propuestaPara: string[];
  /** Solo el fondo por rendir: lo que su dueña tiene en la mano (en negativo, lo que CAYLA le debe). */
  saldo?: number;
};

/** Con qué se paga desde un fondo: lo que acepta `retail.fn_fondo_para_pagar` (con tarjeta, la plata es de CAYLA, no del fondo). */
export const MEDIOS_DEL_FONDO: readonly string[] = ["efectivo", "yape", "plin", "transferencia", "deposito", "otro"];

type Fila = Record<string, unknown>;
const texto = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));

export function leerCuentaElegible(f: Fila): CuentaElegible {
  return {
    id: String(f.id),
    nombre: String(f.nombre ?? ""),
    tipo: String(f.tipo) as TipoCuentaElegible,
    ubicacionId: texto(f.ubicacion_id),
    ubicacionNombre: texto(f.ubicacion_nombre),
    cajaAbierta: f.caja_abierta === true,
    propuestaPara: Array.isArray(f.propuesta_para) ? (f.propuesta_para as unknown[]).map(String) : [],
  };
}

/** Si una cuenta de ese tipo sirve para ese medio. El mismo cuadro que `retail.fn_cuenta_sirve`; el fondo, el de
 *  `retail.fn_fondo_para_pagar` (solo para pagar). */
export function sirveParaMedio(clase: ClaseMovimiento, medio: string, tipo: TipoCuentaElegible): boolean {
  if (tipo === "fondo") return clase === "pago" && MEDIOS_DEL_FONDO.includes(medio);
  if (medio === "efectivo") return clase === "cobro" ? tipo === "cajon" : tipo === "cajon" || tipo === "caja_fuerte" || tipo === "por_rendir";
  if (medio === "tarjeta" && clase === "pago") return tipo === "tarjeta_credito" || tipo === "banco";
  if (medio === "tarjeta" && clase === "cobro") return tipo === "por_abonar" || tipo === "banco";
  if (["yape", "plin", "transferencia", "deposito", "otro", "tarjeta"].includes(medio)) return tipo === "banco";
  return false;
}

/** Se puede elegir ahora: un cajón, solo con su caja abierta. */
export function usable(c: CuentaElegible): boolean {
  return c.tipo !== "cajon" || c.cajaAbierta;
}

export function cuentasParaMedio(cuentas: readonly CuentaElegible[], clase: ClaseMovimiento, medio: string): CuentaElegible[] {
  return cuentas.filter((c) => sirveParaMedio(clase, medio, c.tipo));
}

/** La cuenta que se propone para ese medio: la que dice la base (Configuración, o el cajón abierto de la tienda) y, si no
 *  hay, la primera que sirve. En efectivo sin tienda (el líder paga desde la oficina, el Taller) se propone antes una caja
 *  fuerte que un cajón: que un pago no reste del cierre de una tienda sin que nadie lo haya pedido. Nula si no hay ninguna. */
export function cuentaPropuesta(cuentas: readonly CuentaElegible[], clase: ClaseMovimiento, medio: string): string | null {
  const sirven = cuentasParaMedio(cuentas, clase, medio).filter(usable);
  const dicha = sirven.find((c) => c.propuestaPara.includes(medio));
  if (dicha) return dicha.id;
  // El fondo de quien paga se propone solo cuando él mismo lo dice (efectivo, con plata): nunca por ser «la primera que sirve».
  // Sin banco cargado, una transferencia no sale sola del bolsillo de quien paga: queda por elegir, como antes del fondo.
  const otras = sirven.filter((c) => c.tipo !== "fondo");
  const primera = medio === "efectivo" ? (otras.find((c) => c.tipo !== "cajon") ?? otras[0]) : otras[0];
  return primera?.id ?? null;
}

/** Si la cuenta elegida ya no sirve para el medio (cambió el medio), hay que volver a proponer. */
export function sigueSirviendo(cuentas: readonly CuentaElegible[], clase: ClaseMovimiento, medio: string, cuentaId: string | null | undefined): boolean {
  if (!cuentaId) return false;
  const c = cuentas.find((x) => x.id === cuentaId);
  return !!c && usable(c) && sirveParaMedio(clase, medio, c.tipo);
}

/** La cuenta que va: la que eligió la persona mientras siga sirviendo para el medio; si no, la propuesta. Así el combo
 *  nunca se queda con una cuenta que no calza cuando cambia el medio, sin efectos que reescriban el estado. */
export function cuentaEfectiva(cuentas: readonly CuentaElegible[], clase: ClaseMovimiento, medio: string, elegida: string | null | undefined): string | null {
  return sigueSirviendo(cuentas, clase, medio, elegida) ? (elegida as string) : cuentaPropuesta(cuentas, clase, medio);
}

const MEDIOS_DE: Record<ClaseMovimiento, readonly string[]> = {
  cobro: ["efectivo", "yape", "plin", "tarjeta", "transferencia"],
  pago: ["efectivo", "yape", "plin", "tarjeta", "transferencia", "deposito", "otro"],
  reembolso: ["efectivo", "yape", "plin", "transferencia", "deposito", "otro"],
};

/** Todas las cuentas que sirven para ALGÚN medio de esa clase (el combo «Salió de» que elige la cuenta primero). */
export function cuentasDeLaClase(cuentas: readonly CuentaElegible[], clase: ClaseMovimiento): CuentaElegible[] {
  return cuentas.filter((c) => MEDIOS_DE[clase].some((m) => sirveParaMedio(clase, m, c.tipo)));
}

/** «Salió de» cuando se elige la CUENTA primero (Gastos, como el spike): la elegida mientras se pueda usar; si no, la
 *  propuesta para el medio de siempre (o una transferencia) y, si no hay banco, la de efectivo. */
export function cuentaDeSalida(cuentas: readonly CuentaElegible[], clase: ClaseMovimiento, elegida: string | null | undefined, medioPreferido?: string): string | null {
  if (elegida && cuentasDeLaClase(cuentas, clase).some((c) => c.id === elegida && usable(c))) return elegida;
  return cuentaPropuesta(cuentas, clase, medioPreferido || "transferencia") ?? cuentaPropuesta(cuentas, clase, "efectivo");
}

/** Con un banco, cómo se movió la plata (al pagar un gasto; el depósito solo con comprobante). */
export function mediosDeBanco(conComprobante: boolean): ("transferencia" | "yape" | "plin" | "deposito")[] {
  return conComprobante ? ["transferencia", "yape", "plin", "deposito"] : ["transferencia", "yape", "plin"];
}

/** Si hay alguna cuenta que se pueda elegir para ese medio (si no, el combo dice «agrega un banco en Configuración»). */
export function hayCuentasPara(cuentas: readonly CuentaElegible[], clase: ClaseMovimiento, medio: string): boolean {
  return cuentasParaMedio(cuentas, clase, medio).some(usable);
}

/** El medio que dice la cuenta sola: la plata de un cajón, una caja fuerte o lo del líder es efectivo; la de la tarjeta de
 *  crédito, tarjeta. Un banco no lo dice (puede ser Yape, Plin o transferencia): nulo. */
export function medioDeCuenta(tipo: TipoCuentaElegible): "efectivo" | "tarjeta" | null {
  if (tipo === "cajon" || tipo === "caja_fuerte" || tipo === "por_rendir") return "efectivo";
  if (tipo === "tarjeta_credito") return "tarjeta";
  return null;
}

/** Los grupos del combo, en el orden del spike (`vista-dinero.js` · «Pagar facturas»). El fondo de quien paga va primero
 *  (contrato de la fase 6: «Mi fondo» se le ofrece primero a su dueña). */
export const GRUPOS_CUENTA: readonly { tipo: TipoCuentaElegible; titulo: string }[] = [
  { tipo: "fondo", titulo: "Tu fondo por rendir" },
  { tipo: "banco", titulo: "Bancos y billeteras" },
  { tipo: "caja_fuerte", titulo: "Cajas fuertes" },
  { tipo: "por_rendir", titulo: "Efectivo por rendir" },
  { tipo: "cajon", titulo: "Cajones (resta del cierre de esa caja)" },
  { tipo: "tarjeta_credito", titulo: "Tarjeta de crédito" },
  { tipo: "por_abonar", titulo: "Por abonar (POS)" },
];

export function agruparCuentas(cuentas: readonly CuentaElegible[]): { tipo: TipoCuentaElegible; titulo: string; cuentas: CuentaElegible[] }[] {
  return GRUPOS_CUENTA.map((g) => ({ ...g, cuentas: cuentas.filter((c) => c.tipo === g.tipo) })).filter((g) => g.cuentas.length > 0);
}

/** Cómo se lee una cuenta en el combo: un cajón con la caja cerrada lo dice; el fondo, lo que tiene (o lo que CAYLA le debe). */
export function etiquetaCuenta(c: CuentaElegible): string {
  if (c.tipo === "fondo") {
    const saldo = c.saldo ?? 0;
    if (saldo > 0.005) return `${c.nombre} · tienes ${soles(saldo)}`;
    return saldo < -0.005 ? `${c.nombre} · CAYLA te debe ${soles(-saldo)}` : `${c.nombre} · sin plata`;
  }
  return c.tipo === "cajon" && !c.cajaAbierta ? `${c.nombre} (caja cerrada)` : c.nombre;
}

/**
 * La frase bajo «Sale de» cuando sale del fondo (decisión 32): lo que le queda en la mano o, si no alcanza, que la diferencia la
 * pone ella y CAYLA se la devuelve al rendir. Nunca frena: el pago se registra igual. `usado` es lo que sale del fondo con este
 * pago hasta esa línea (`usadoDelFondo`).
 */
export function ayudaDelFondo(saldo: number, usado: number): string {
  if (usado <= 0.005) {
    if (saldo > 0.005) return `Sale de tu fondo por rendir (tienes ${soles(saldo)}): no toca ninguna caja.`;
    return saldo < -0.005
      ? `CAYLA ya te debe ${soles(-saldo)}: lo que pagues lo pones tú y se suma a lo que te debe.`
      : "Tu fondo no tiene plata: lo que pagues lo pones tú y CAYLA te lo devuelve al rendir.";
  }
  if (usado <= saldo + 0.005) return `Sale de tu fondo: te quedan ${soles(saldo - usado)} en la mano.`;
  if (saldo > 0.005) return `Tu fondo tiene ${soles(saldo)}: los ${soles(usado - saldo)} que faltan los pones tú y CAYLA te los devuelve al rendir.`;
  return `Lo pones tú: CAYLA te deberá ${soles(usado - saldo)} y te lo devuelve al rendir.`;
}

/** Lo que sale del fondo en las líneas de un pago hasta `hasta` (inclusive): la suma de las que van a una cuenta tipo fondo. */
export function usadoDelFondo(
  lineas: readonly { monto: string; metodo: string; cuentaId?: string }[],
  cuentas: readonly CuentaElegible[],
  hasta: number,
): number {
  let suma = 0;
  lineas.forEach((l, i) => {
    if (i > hasta) return;
    const id = cuentaEfectiva(cuentas, "pago", l.metodo, l.cuentaId);
    if (id && cuentas.some((c) => c.id === id && c.tipo === "fondo")) suma += Number(l.monto) || 0;
  });
  return Math.round(suma * 100) / 100;
}

/** Las opciones del combo de cuentas («Sale de», «Entra a», «Salió de»), agrupadas como el spike: con `medio`, solo las
 *  que sirven para ese medio; sin él, todas las de la clase. Un cajón con la caja cerrada se ve, pero no se elige. Es el
 *  combo del sistema (ADR-0209): el mismo en Compras y en Gastos. Sin cuenta elegida, lo dice el marcador del combo. */
export function opcionesDeCuenta(
  cuentas: readonly CuentaElegible[],
  clase: ClaseMovimiento,
  medio?: string,
): { valor: string; texto: string; grupo: string; deshabilitada: boolean }[] {
  const lista = medio ? cuentasParaMedio(cuentas, clase, medio) : cuentasDeLaClase(cuentas, clase);
  return agruparCuentas(lista).flatMap((g) => g.cuentas.map((c) => ({ valor: c.id, texto: etiquetaCuenta(c), grupo: g.titulo, deshabilitada: !usable(c) })));
}

/** La frase bajo el combo: qué pasa con la plata según la cuenta elegida. */
export function ayudaCuenta(c: CuentaElegible | null, sentido: "sale" | "entra", clase: ClaseMovimiento = "pago"): string {
  if (!c) return sentido === "sale" ? "Di de qué cuenta sale: queda sellada en el pago." : "Di a qué cuenta entra: queda sellada.";
  if (c.tipo === "cajon") {
    return sentido === "sale"
      ? "Sale del cajón: se registra también la salida de esa caja y resta del cierre."
      : "Entra al cajón: se registra también el ingreso de esa caja y suma al cierre.";
  }
  if (c.tipo === "caja_fuerte") return sentido === "sale" ? "Sale de la caja fuerte: no toca el cierre del cajón." : "Entra a la caja fuerte: no toca el cierre del cajón.";
  if (c.tipo === "por_rendir") return sentido === "sale" ? "Sale del efectivo que tiene el líder." : "Queda en el efectivo que tiene el líder.";
  if (c.tipo === "fondo") return ayudaDelFondo(c.saldo ?? 0, 0);
  if (c.tipo === "tarjeta_credito") return "Con la tarjeta de crédito de CAYLA: sube lo que se le debe.";
  // Lo que se le devuelve a una clienta por Yape, transferencia o tarjeta nunca sale del cajón: sale de esa cuenta.
  if (clase === "cobro") return "Sale de esa cuenta: queda sellada y la conciliación lo encuentra.";
  // Con un banco, la frase del spike: recuerda qué pasa si se elige un cajón.
  return sentido === "sale" ? "Si sale de un cajón, se registra también la salida de esa caja." : "Si entra a un cajón, se registra también el ingreso de esa caja.";
}

// ---- Lo pasado: lo que movió plata sin decir su cuenta (fn_pagos_sin_cuenta) -------------------------------------------

export type OrigenSinCuenta = "pago" | "pagoprod" | "reembolso" | "gasto" | "activo" | "traslado";
export type PagoSinCuenta = {
  /** La línea del libro de saldos («pago:<id>»): es lo que se manda a `asignar_cuenta_pasada`. */
  clave: string;
  origen: OrigenSinCuenta;
  fecha: string;
  detalle: string;
  medio: string | null;
  monto: number;
  ubicacionNombre: string | null;
};

export const TEXTO_ORIGEN_SIN_CUENTA: Record<OrigenSinCuenta, string> = {
  pago: "pago a un proveedor",
  pagoprod: "pago del Taller",
  reembolso: "reembolso de un proveedor",
  gasto: "gasto",
  activo: "activo fijo",
  traslado: "cierre de caja al banco",
};

export function leerPagoSinCuenta(f: Fila): PagoSinCuenta {
  return {
    clave: String(f.clave),
    origen: String(f.origen) as OrigenSinCuenta,
    fecha: String(f.fecha),
    detalle: String(f.detalle ?? ""),
    medio: texto(f.medio),
    monto: Number(f.monto ?? 0),
    ubicacionNombre: texto(f.ubicacion_nombre),
  };
}

/** Un reembolso entra a CAYLA; lo demás sale. El depósito del cierre fue a un banco (por eso «transferencia»). */
export function claseDePagoSinCuenta(origen: OrigenSinCuenta): ClaseMovimiento {
  return origen === "reembolso" ? "reembolso" : "pago";
}
export function medioDePagoSinCuenta(p: Pick<PagoSinCuenta, "origen" | "medio">): string {
  return p.origen === "traslado" ? "transferencia" : (p.medio ?? "efectivo");
}
