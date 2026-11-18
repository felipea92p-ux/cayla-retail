// La cifra que rueda (`CifraAnimada`, ADR-0136 act. 2026-10-31; la 08 del benchmark visual de Gastos): cada dígito es una columna que gira
// del valor viejo al nuevo, en vez de volver a contar desde cero cada vez que la cifra cambia (cambiar de sede o de mes).
//
// Lógica pura: parte el texto YA formateado («S/ 12,000.00», «−S/ 41,300», «7») en columnas. La clave de un dígito se cuenta desde la
// derecha y solo entre dígitos, y la de un separador, por cuántos dígitos tiene a su derecha: así, de «S/ 3,850.00» a «S/ 12,000.00» cada
// dígito conserva su columna (y gira) aunque la cifra gane un dígito y la coma cambie de lugar. Lo de antes del primer dígito (el «S/»,
// el signo) va junto en una sola pieza que no gira.

export type ColumnaCifra = { clave: string; digito: number | null; texto: string };

const esDigito = (c: string) => c >= "0" && c <= "9";

export function columnasDeCifra(texto: string): ColumnaCifra[] {
  const caracteres = [...texto];
  const primero = caracteres.findIndex(esDigito);
  if (primero === -1) return texto ? [{ clave: "p", digito: null, texto }] : [];
  let aLaDerecha = caracteres.filter(esDigito).length;
  const columnas: ColumnaCifra[] = primero > 0 ? [{ clave: `p${caracteres.slice(0, primero).join("")}`, digito: null, texto: caracteres.slice(0, primero).join("") }] : [];
  for (const c of caracteres.slice(primero)) {
    if (esDigito(c)) {
      aLaDerecha--;
      columnas.push({ clave: `d${aLaDerecha}`, digito: Number(c), texto: c });
    } else columnas.push({ clave: `s${aLaDerecha}${c}`, digito: null, texto: c });
  }
  return columnas;
}
