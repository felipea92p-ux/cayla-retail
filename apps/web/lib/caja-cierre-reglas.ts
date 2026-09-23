// Reglas puras del cierre con traslado y de la apertura verificada (ADR-0186). Sin React ni Supabase: las usan
// `CerrarCajaModalV2`, `AbrirCajaFormV2`, el historial de cierres y sus pruebas. Los mismos candados viven en la base
// (`cerrar_caja`, `abrir_caja`, `caja_traslados`); aquí solo se adelantan para que la pantalla explique antes de enviar.

export type DestinoTraslado = "caja_fuerte" | "banco" | "lider";

export const DESTINOS_TRASLADO: {
  valor: DestinoTraslado;
  etiqueta: string;
  /** Qué se pide para poder rastrear el efectivo después; `null` si no hace falta. */
  referencia: string | null;
  /** La referencia se ofrece pero no bloquea el cierre (banco: el voucher a veces llega después). */
  referenciaOpcional?: boolean;
}[] = [
  { valor: "caja_fuerte", etiqueta: "Caja fuerte de la sede", referencia: null },
  { valor: "banco", etiqueta: "Depósito bancario", referencia: "N.º de operación del voucher", referenciaOpcional: true },
  { valor: "lider", etiqueta: "Entregado al líder de equipo", referencia: "¿A quién se lo entregaste?" },
];

export function etiquetaDestino(destino: string): string {
  return DESTINOS_TRASLADO.find((d) => d.valor === destino)?.etiqueta ?? destino;
}

/** Un monto escrito por la persona («1,950.50», «1950», «»). Vacío o ilegible → null. */
export function leerMonto(texto: string): number | null {
  const limpio = texto.replace(/\s/g, "").replace(/,/g, "");
  if (limpio === "") return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

export const cuadra = (a: number, b: number) => Math.abs(a - b) < 0.01;

/** Lo que queda en el cajón para el próximo turno: se calcula, nunca se escribe. */
export function fondoTrasCierre(contado: number, trasladado: number): number {
  return Math.round((contado - trasladado) * 100) / 100;
}

/**
 * Por qué no se puede cerrar todavía el paso de traslado, o `null` si se puede. Mismo orden y mismas palabras que
 * los `raise` de `cerrar_caja`, para que la pantalla y la base digan lo mismo.
 */
export function motivoTrasladoInvalido(p: {
  contado: number;
  trasladado: number;
  destino: DestinoTraslado | null;
  referencia: string;
}): string | null {
  if (p.trasladado < 0) return "El monto a trasladar no puede ser negativo.";
  if (p.trasladado > p.contado + 0.001) return `No puedes trasladar más de lo que contaste (S/ ${p.contado.toFixed(2)}).`;
  if (p.trasladado === 0) return null;
  if (!p.destino) return "Elige a dónde va el efectivo que trasladas.";
  const elegido = DESTINOS_TRASLADO.find((d) => d.valor === p.destino);
  const pide = elegido?.referenciaOpcional ? null : elegido?.referencia;
  if (pide && p.referencia.trim().length < 2) return `Completa «${pide}»: es lo que permite rastrear el dinero después.`;
  return null;
}

/** Diferencia entre lo que hay al abrir y lo que quedó en el último cierre. `null` si no hay con qué comparar. */
export function diferenciaApertura(monto: number, esperado: number | null): number | null {
  if (esperado === null) return null;
  const d = Math.round((monto - esperado) * 100) / 100;
  return cuadra(d, 0) ? 0 : d;
}

/** El motivo que exige `abrir_caja` cuando la apertura no coincide (mínimo 3 letras, igual que el candado). */
export function motivoAperturaValido(motivo: string): boolean {
  return motivo.trim().length >= 3;
}
