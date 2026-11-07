// El ejemplo de la nota de la hoja «IGV del mes» (ADR-0620, regla ADR-0290): sigue lo que dice Impuestos del mes. Un mes con saldo a favor no se explica igual que uno con IGV por pagar.

export type ContextoNotaIgv = { aPagar: number; saldoAFavor: number };

/** Sin azar ni red: mismo mes, mismo texto. Sin nada que pagar ni saldo, un texto que no promete nada. */
export function sugerirNotaIgv({ aPagar, saldoAFavor }: ContextoNotaIgv): string {
  if (aPagar > 0) return "Ej. Lo que calculó el contador";
  if (saldoAFavor > 0) return "Ej. El saldo a favor lo cubre";
  return "Por qué este monto";
}
