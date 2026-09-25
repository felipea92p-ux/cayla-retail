import { METODOS_PAGO, redondear2, type MetodoPago } from "./comprobantes-produccion-reglas";
import { cuentaEfectiva, type CuentaElegible } from "./cuenta-sellada-reglas";

// Pagar con uno o varios medios (ADR-0133, F4b/F4c). Puro. Un mismo pago se reparte entre medios cuando el dinero sale de más de un
// sitio: 2000 por transferencia + 478 en efectivo. La base los guarda juntos (mismo `grupo_id`) y exige que sumen justo lo que se
// paga; acá se muestra cuánto FALTA o SOBRA mientras se escribe, con la misma cuenta.

/** `cuentaId` (ADR-0195 F3b): la cuenta elegida en «Sale de». Vacía = la propuesta (`cuentaEfectiva`). */
export type MedioForm = { metodo: MetodoPago; monto: string; referencia: string; cuentaId?: string };

const num = (s: string) => Number(s.replace(",", "."));

export function medioNuevo(metodo: MetodoPago = "transferencia", monto = ""): MedioForm {
  return { metodo, monto, referencia: "" };
}

export type RepartoMedios = {
  /** Suma de los medios escritos (los vacíos no cuentan). */
  suma: number;
  /** Lo que todavía falta para llegar a lo esperado (0 si ya se llegó o se pasó). */
  falta: number;
  /** Lo que se pasa de lo esperado (0 si no se pasa). */
  sobra: number;
  cuadra: boolean;
  /** Primer problema de un medio (monto inválido, con más de 2 decimales, medio repetido sin monto), o `null`. */
  error: string | null;
};

/** Cuánto suman los medios frente a lo que se debe pagar (`esperado`). `exacto` = al contado (tiene que cuadrar); si no, basta con no pasarse. */
export function repartoDeMedios(medios: MedioForm[], esperado: number, exacto: boolean): RepartoMedios {
  let suma = 0;
  let error: string | null = null;
  for (const [i, m] of medios.entries()) {
    if (m.monto.trim() === "") continue;
    const v = num(m.monto);
    if (!(v > 0)) {
      error ??= `Medio ${i + 1}: el monto tiene que ser mayor a cero.`;
      continue;
    }
    if (Math.abs(v * 100 - Math.round(v * 100)) > 1e-6) error ??= `Medio ${i + 1}: el monto admite como máximo 2 decimales.`;
    suma += v;
  }
  suma = redondear2(suma);
  const esp = redondear2(esperado);
  const falta = redondear2(Math.max(0, esp - suma));
  const sobra = redondear2(Math.max(0, suma - esp));
  const cuadra = exacto ? falta === 0 && sobra === 0 && suma > 0 : suma > 0 && sobra === 0;
  return { suma, falta, sobra, cuadra, error };
}

/** Los medios como los recibe la base (`p_pago` / `p_pagos`): sin los vacíos, montos numéricos, referencia solo si se escribió.
 *  Con `cuentas` (F3b), cada medio lleva la cuenta de la que sale: la elegida o la propuesta. */
export function mediosParaRpc(medios: MedioForm[], fecha?: string, cuentas?: readonly CuentaElegible[]) {
  return medios
    .filter((m) => m.monto.trim() !== "")
    .map((m) => {
      const cuenta = cuentas ? cuentaEfectiva(cuentas, "pago", m.metodo, m.cuentaId) : null;
      return { metodo: m.metodo, monto: redondear2(num(m.monto)), fecha, referencia: m.referencia.trim() || undefined, ...(cuenta ? { cuenta_id: cuenta } : {}) };
    });
}

export function etiquetaMedio(m: MetodoPago): string {
  return METODOS_PAGO.find((x) => x.valor === m)?.etiqueta ?? m;
}

/** Al agregar un medio, propone lo que falta como monto (es lo que casi siempre se quiere). */
export function montoSugerido(medios: MedioForm[], esperado: number): string {
  const { falta } = repartoDeMedios(medios, esperado, true);
  return falta > 0 ? falta.toFixed(2) : "";
}
