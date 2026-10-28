// El monto sin su «S/», para las cifras grandes que ponen el símbolo aparte, más chico (la billetera, «Tu compra»). Con la misma cuenta de
// decimales y miles que `soles()` (`lib/compras-reglas.ts`), pero sin depender de cuántos caracteres mide su prefijo.
export function soloNumero(n: number): string {
  return n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
