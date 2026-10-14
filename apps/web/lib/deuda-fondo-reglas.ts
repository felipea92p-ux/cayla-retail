import { leerMonto } from "./caja-cierre-reglas";
import { soles } from "./compras-reglas";
import type { CampoDeGuia } from "./guia-campos";
import { campoResponsable, problemaDeCuenta, problemaDeNota, type CuentaOpcion } from "./fondos-reglas";

// La deuda de un faltante (ADR-0362, fase 6 · actividad 7; decisiones 54 y 71): un faltante que quedó como deuda de la persona se salda
// SOLO cuando ella devuelve la plata (nada de descontarla del sueldo por ahora). Lo registra quien la recibe, con Fondos por rendir. Las
// reglas viven en la base (`pagar_deuda_fondo`, 20261014145000); aquí está lo que la hoja muestra y lo que le falta, que es lo MISMO que
// rechazaría la base.

// Cada llamada nombra su constante (`.rpc(RPC_X as never, …)`): así la lee la prueba de cobertura de roles.
export const RPC_DEUDAS_FONDO = "fn_deudas_fondo";
export const RPC_PAGAR_DEUDA_FONDO = "pagar_deuda_fondo";
export const RPC_ANULAR_PAGO_DEUDA_FONDO = "anular_pago_deuda_fondo";

/** Una rendición con deuda, como la manda `fn_deudas_fondo`. */
export type DeudaFondo = {
  rendicionId: string;
  cuentaId: string;
  personaId: string;
  persona: string;
  /** El día en que se aprobó la rendición (cuando nació la deuda). */
  desde: string;
  faltante: number;
  pagado: number;
  debe: number;
  esMio: boolean;
};

/** Lo que debe una persona, sumando sus rendiciones. `deudas`: las que todavía deben algo, la más vieja primero (así se pagan). */
export type DeudaDePersona = { personaId: string; persona: string; debe: number; faltante: number; pagado: number; deudas: DeudaFondo[]; esMio: boolean };

const redondo = (n: number) => Math.round(n * 100) / 100;
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const numero = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** Las filas de `fn_deudas_fondo`. Una fila sin rendición, sin persona o sin cifras no se puede mostrar: se descarta. */
export function leerDeudasFondo(data: unknown): DeudaFondo[] {
  return (Array.isArray(data) ? (data as Record<string, unknown>[]) : []).flatMap((f) => {
    const rendicionId = texto(f?.rendicion_id);
    const personaId = texto(f?.persona_id);
    const faltante = numero(f?.faltante);
    const pagado = numero(f?.pagado);
    const debe = numero(f?.debe);
    if (!rendicionId || !personaId || faltante == null || pagado == null || debe == null) return [];
    return [
      {
        rendicionId,
        cuentaId: texto(f.cuenta_id) ?? "",
        personaId,
        persona: texto(f.persona_nombre) ?? "Sin nombre",
        desde: texto(f.desde) ?? "",
        faltante,
        pagado,
        debe,
        esMio: f.es_mio === true,
      },
    ];
  });
}

/** Lo que debe cada persona (por su id), en el orden en que llegan las filas (la base las manda por persona y de la más vieja). */
export function deudasPorPersona(deudas: readonly DeudaFondo[]): Map<string, DeudaDePersona> {
  const mapa = new Map<string, DeudaDePersona>();
  for (const d of deudas) {
    const p = mapa.get(d.personaId) ?? { personaId: d.personaId, persona: d.persona, debe: 0, faltante: 0, pagado: 0, deudas: [], esMio: d.esMio };
    p.debe = redondo(p.debe + d.debe);
    p.faltante = redondo(p.faltante + d.faltante);
    p.pagado = redondo(p.pagado + d.pagado);
    if (d.debe > 0.005) p.deudas.push(d);
    mapa.set(d.personaId, p);
  }
  return mapa;
}

/** Lo que paga de cada deuda, de la más vieja a la más nueva: lo mismo que hace la base, para mostrarlo antes de guardar. */
export function repartoDelPago(monto: number, deudas: readonly DeudaFondo[]): { rendicionId: string; desde: string; paga: number }[] {
  let resto = redondo(monto);
  const reparto: { rendicionId: string; desde: string; paga: number }[] = [];
  for (const d of deudas) {
    if (resto <= 0) break;
    const paga = redondo(Math.min(d.debe, resto));
    if (paga <= 0) continue;
    reparto.push({ rendicionId: d.rendicionId, desde: d.desde, paga });
    resto = redondo(resto - paga);
  }
  return reparto;
}

/** El monto escrito contra lo que debe (`leerMonto` ya lo deja en céntimos, como lo recibe la base). */
export function problemaDeMontoDeuda(textoMonto: string, debe: number): string | null {
  const m = leerMonto(textoMonto);
  if (m == null) return "Escribe cuánto pagó.";
  if (m <= 0) return "El monto tiene que ser mayor que cero.";
  if (m > debe + 0.005) return `Debe ${soles(debe)}: no puede pagar más.`;
  return null;
}

/** Los campos de «Registrar su pago», en el orden de la hoja. La nota es opcional: no cuenta como «falta». */
export function camposPagarDeuda(
  v: { cuentaId: string; monto: string; nota: string },
  debe: number,
  cuentas: readonly CuentaOpcion[],
  r: { esPersona: boolean; listo: boolean; motivo: string | null },
): CampoDeGuia[] {
  const monto = problemaDeMontoDeuda(v.monto, debe);
  const cuenta = problemaDeCuenta(v.cuentaId, cuentas, "vuelve");
  const nota = problemaDeNota(v.nota);
  return [
    { id: "monto", nombre: "Cuánto pagó", requerido: true, hecho: monto === null, pendiente: monto ?? "" },
    { id: "cuenta", nombre: "A dónde entró", requerido: true, hecho: cuenta === null, pendiente: cuenta === null ? "" : "Elige a dónde entró la plata." },
    { id: "nota", nombre: "Nota", requerido: false, hecho: v.nota.trim() !== "" && nota === null, pendiente: nota ?? "" },
    ...campoResponsable({ ...r, quien: "Quién recibe" }),
  ];
}

/** El botón dice cuánto se registra. */
export function frasePagarDeuda(monto: number | null): string {
  return monto != null && monto > 0 ? `Registrar pago de ${soles(monto)}` : "Registrar el pago";
}
