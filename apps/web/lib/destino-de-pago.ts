import { billeterasTexto, cuentaLocalVisible, bancoDeCci, formatoCci, formatoCelular, type DatosPagoProveedor } from "./proveedores-reglas";

// «¿A dónde va la plata de esta línea de pago?» (ADR-0134). Pura: sin I/O ni React; `DestinoDelMedio` solo la pinta.
//
// Pagar por Yape al celular equivocado NO se revierte, así que al elegir el medio se dice EL DESTINO
// (banco + últimos dígitos, o el celular enmascarado) y se avisa si ese medio no calza con lo que el proveedor
// tiene cargado. Son solo AVISOS: nunca bloquean el pago (decisión de Felipe, 2026-09-19) — si el proveedor
// acaba de pasar su cuenta por WhatsApp, se puede pagar igual y cargarla después.

/** Un dato para copiar: lo que se ve (`valor`, ya formateado) y lo que se copia (`copiar`, listo para pegar en la app del banco). */
export type FilaDestino = { etiqueta: string; valor: string; copiar: string };

/**
 * Lo que hace falta para pagar con ESTE medio, y nada más. Transferencia o depósito → la cuenta y el CCI (no el
 * Yape); Yape o Plin → ese celular (no la cuenta). Con efectivo, otro o saldo a favor no hay nada que mostrar.
 * `aviso` dice qué le falta al proveedor para ese medio (solo aviso: nunca bloquea el pago).
 */
export type DestinoDelMedio = {
  /** El banco, para los medios bancarios. */
  banco: string | null;
  filas: FilaDestino[];
  /** El nombre que muestra el banco/Yape antes de confirmar; se compara al pagar. */
  titular: string | null;
  aviso: string | null;
};

/**
 * Qué mostrar bajo una línea de pago según su medio. `null` si no hay nada que decir: efectivo, otro, saldo a favor,
 * o no se conocen los datos del proveedor. Los valores salen COMPLETOS (quien paga los necesita para pagar) y con
 * su botón de copiar; el bloque grande de «Datos para pagar» vive solo en la ficha del proveedor.
 */
export function destinoDelMedio(metodo: string, datos: DatosPagoProveedor | null | undefined): DestinoDelMedio | null {
  if (!datos) return null;
  const titular = datos.titular?.trim() || null;

  if (metodo === "transferencia" || metodo === "deposito") {
    const cuenta = cuentaLocalVisible(datos.cuentaBancaria, datos.cci);
    const banco = datos.banco?.trim() || (datos.cci ? bancoDeCci(datos.cci) : null);
    const filas: FilaDestino[] = [];
    if (cuenta) filas.push({ etiqueta: "Cuenta", valor: cuenta, copiar: cuenta });
    if (datos.cci) filas.push({ etiqueta: "CCI", valor: formatoCci(datos.cci), copiar: datos.cci });
    if (filas.length === 0) return { banco, filas, titular: null, aviso: "Este proveedor no tiene cuenta ni CCI registrados." };
    return { banco, filas, titular, aviso: null };
  }

  if (metodo === "yape" || metodo === "plin") {
    const nombre = metodo === "yape" ? "Yape" : "Plin";
    if (!datos.celularBilletera) return { banco: null, filas: [], titular: null, aviso: "Este proveedor no tiene Yape / Plin registrado." };
    // `billeteras` vacío no debería pasar (la base lo exige junto con el celular); si pasa, no se inventa un aviso.
    const acepta = (datos.billeteras ?? []).filter((b) => b === "yape" || b === "plin");
    if (acepta.length > 0 && !acepta.includes(metodo)) {
      return { banco: null, filas: [], titular: null, aviso: `Este proveedor recibe ${billeterasTexto(acepta)}, no ${nombre}.` };
    }
    return { banco: null, filas: [{ etiqueta: nombre, valor: formatoCelular(datos.celularBilletera), copiar: datos.celularBilletera }], titular, aviso: null };
  }

  return null;
}

/**
 * El chip de «falta cargar» de la fila del proveedor (formulario de comprobante): según su forma de pago
 * preferida, ¿le falta el dato con el que se le va a pagar? Con efectivo, o sin forma preferida, nunca.
 */
export function faltaDatoDePago(datos: Pick<DatosPagoProveedor, "formaPagoPreferida" | "cci" | "cuentaBancaria" | "celularBilletera">): string | null {
  const forma = datos.formaPagoPreferida;
  if (forma === "transferencia" || forma === "deposito") return !datos.cci && !datos.cuentaBancaria?.trim() ? "Sin CCI cargado" : null;
  if (forma === "yape" || forma === "plin") return !datos.celularBilletera ? "Sin Yape / Plin cargado" : null;
  return null;
}
