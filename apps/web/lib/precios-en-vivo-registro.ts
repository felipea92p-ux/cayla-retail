// Qué pantallas montadas releen precio y campañas por su cuenta (hoy, Vender con la caja abierta: `usePreciosEnVivo`,
// que además corrige el ticket armado). Mientras haya alguna, `<PreciosEnVivo />` no sondea ni refresca: sería pedir lo
// mismo dos veces y, en Vender, rehacer ~1 MB de pantalla por algo que ya se aplicó. Sin dependencias, para probarlo.
let propias = 0;

/** La pantalla se anota al empezar a sondear; lo devuelto la borra al desmontar. */
export function registrarPreciosPropios(): () => void {
  propias += 1;
  let borrada = false;
  return () => {
    if (borrada) return;
    borrada = true;
    propias -= 1;
  };
}

export function hayPreciosPropios(): boolean {
  return propias > 0;
}
