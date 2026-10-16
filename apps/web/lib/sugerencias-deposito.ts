// Los ejemplos de la hoja «Depositó» (ADR-0290): la referencia sigue al medio con que el proveedor devolvió la plata. Una transferencia o un
// depósito tienen número de operación; Yape y Plin, un código; el efectivo, a lo sumo un recibo. Sin medio (o «Otro»), un texto que no
// promete nada.

export function ejemploReferencia(metodo: string): string {
  if (metodo === "transferencia" || metodo === "deposito") return "N.° de operación";
  if (metodo === "yape" || metodo === "plin") return "Código de la operación";
  if (metodo === "efectivo") return "N.° del recibo, si te dio uno";
  return "Opcional";
}
