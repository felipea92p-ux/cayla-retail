// «¿Qué fue esta salida?»: lo que se guarda al decir de qué fue una salida de caja. Una sola regla para la hoja de la pestaña de egresos
// (`ClasificarEgresoModal`) y para la pila de la bandeja (`GastosPulso`, la 03 del benchmark visual, 2026-10-31): las dos guardan lo
// mismo, con la misma validación. Lógica pura: dice qué función de la base llamar y con qué; quien llama le pone la marca (`p_token`) y la
// firma. Un gasto va con `useIntento("registrar_gasto")`: la marca sigue a lo que se manda, y reintentar tras un corte no lo duplica.
//
// · Un gasto chico (el mototaxi) se registra sin comprobante, en efectivo, con la fecha y el monto del egreso.
// · Un depósito al banco, si hay a qué cuenta (Cuentas y dinero, ADR-0195 F3), queda como movimiento de dinero: el cajón ya bajó y sube el banco.
// · Lo demás (retiro, ajuste, otro; o un depósito sin cuentas) se marca «no es gasto».
// · Un activo, o un gasto que llegó con boleta o factura, no se resuelve aquí: sigue al registro completo.

import { diaLima } from "./fechas-lima";
import { TEXTO_NO_GASTO, validarGasto, type EgresoPorClasificar, type TipoNoGasto } from "./gastos-reglas";

export type QueFue = "gasto" | "activo" | TipoNoGasto;

export type DecisionEgreso = {
  que: QueFue;
  categoria: string;
  descripcion: string;
  /** La nota de un «no es gasto» (obligatoria en «otro») o el voucher de un depósito. */
  motivo: string;
  /** La cuenta a la que llegó un depósito; vacía si no hay Cuentas y dinero. */
  destino: string;
};

export type GuardadoEgreso =
  | { ok: false; error: string }
  /** `args` va sin `p_token`; `conMarca`: la función la pide (un gasto, un depósito al banco). */
  | { ok: true; rpc: "registrar_gasto" | "registrar_movimiento_dinero" | "marcar_egreso_no_gasto"; args: Record<string, unknown>; conMarca: boolean };

/** Un depósito va al banco solo si hay a qué cuenta; sin Cuentas y dinero se marca «no es gasto», como antes. */
export const vaAlBanco = (d: Pick<DecisionEgreso, "que">, destinos: readonly { id: string }[]) => d.que === "deposito" && destinos.length > 0;

/** Lo que queda decidido de entrada: lo que sugiere el motivo del egreso y, para un gasto, su nota como «qué se pagó». */
export function decisionInicial(e: EgresoPorClasificar, destinos: readonly { id: string }[], sugerido: QueFue): DecisionEgreso {
  return { que: sugerido, categoria: "", descripcion: e.nota ?? "", motivo: "", destino: destinos[0]?.id ?? "" };
}

/** Qué guardar, o por qué todavía no se puede. */
export function guardadoDeEgreso(e: EgresoPorClasificar, d: DecisionEgreso, destinos: readonly { id: string }[], hoy: string): GuardadoEgreso {
  if (d.que === "activo") return { ok: false, error: "Un activo se registra completo." };
  if (d.que === "otro" && !d.motivo.trim()) return { ok: false, error: "Escribe qué fue." };
  if (d.que === "gasto") {
    const v = validarGasto(
      {
        ubicacion: e.ubicacionId,
        categoria: d.categoria,
        descripcion: d.descripcion,
        fecha: diaLima(e.creadoEn) ?? "",
        monto: String(e.monto),
        comprobante: "sin_comprobante",
        proveedorId: "",
        serie: "",
        numero: "",
        condicion: "contado",
        vence: "",
        medio: "efectivo",
        cajaId: "",
        egresoId: e.id,
        referencia: "",
      },
      hoy,
    );
    if (!v.ok) return { ok: false, error: v.error };
    return { ok: true, rpc: "registrar_gasto", args: { ...v.valor }, conMarca: true };
  }
  if (vaAlBanco(d, destinos)) {
    if (!d.destino) return { ok: false, error: "Elige a qué cuenta llegó." };
    // El origen es el cajón de esa tienda: la base lo toma del egreso.
    return {
      ok: true,
      rpc: "registrar_movimiento_dinero",
      args: { p_tipo: "deposito", p_monto: e.monto, p_cuenta_destino_id: d.destino, p_referencia: d.motivo.trim() || e.nota || null, p_caja_movimiento_id: e.id },
      conMarca: true,
    };
  }
  return { ok: true, rpc: "marcar_egreso_no_gasto", args: { p_caja_movimiento_id: e.id, p_tipo: d.que, p_motivo: d.motivo.trim() || null }, conMarca: false };
}

/** El aviso de después: qué quedó y, si no es gasto, dónde se deshace. */
export function avisoDeEgreso(d: DecisionEgreso, destinos: readonly { id: string; nombre: string }[]): { texto: string; detalle?: string } {
  if (d.que === "gasto" || d.que === "activo") return { texto: "Registrado como gasto" };
  if (vaAlBanco(d, destinos)) {
    return {
      texto: "Registrado como depósito al banco",
      detalle: `${destinos.find((x) => x.id === d.destino)?.nombre ?? "El banco"} sube en Cuentas y dinero. No cuenta como gasto; si fue un error, se anula allí.`,
    };
  }
  return {
    texto: `Registrado como ${TEXTO_NO_GASTO[d.que].titulo.replace(/^Un[a]? /, "").toLowerCase()}`,
    detalle: "No cuenta como gasto. Si fue un error, se revierte en la pestaña «Egresos de caja por clasificar».",
  };
}
