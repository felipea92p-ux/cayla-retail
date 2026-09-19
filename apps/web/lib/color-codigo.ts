// Sugerir el código de 3 letras de un color a partir de su nombre.
//
// PROMETE: devuelve 3 letras A-Z que NO están en `usados`, o "" si el nombre
//   no tiene letras suficientes o no queda ninguna combinación libre.
// ASUME: `usados` trae TODOS los códigos existentes, también los de colores
//   desactivados — el código es la clave primaria y sigue ocupada aunque el
//   color ya no se elija (`variantes.color_codigo` y cada SKU apuntan a él).
// NO HACE: no decide por la persona. Es una sugerencia que ella puede cambiar;
//   el candado real es la clave primaria de `colores`.
//
// La regla sale de los 35 códigos que ya existen, no de una convención nueva:
// una palabra usa sus primeras 3 letras (NEG, BLA, CRU) y dos o más usan 2 de
// la primera + 1 de la segunda (AZM = Azul marino, AZC = Azul claro,
// VEA = Verde agua, GRA = Gris antracita).

const soloLetras = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");

/** Deja el código como lo guarda la base: 3 letras A-Z, sin tildes ni símbolos. */
export function normalizarCodigo(texto: string): string {
  return soloLetras(texto).slice(0, 3);
}

export function sugerirCodigoColor(nombre: string, usados: ReadonlySet<string>): string {
  // Palabra = tramo de letras; un guion o un paréntesis también separan
  // («Azul-marino» son dos palabras, no una de 10 letras).
  const palabras = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .split(/[^A-Z]+/)
    .filter(Boolean);
  if (palabras.length === 0) return "";

  const [primera, segunda] = palabras;
  const candidatos: string[] = [];

  if (segunda) {
    // 2+1 primero (la regla de los códigos existentes), después 1+2, y por
    // último 2 de la primera + cada letra que quede de la segunda.
    candidatos.push(primera.slice(0, 2) + segunda[0]);
    if (segunda.length > 1) candidatos.push(primera[0] + segunda.slice(0, 2));
    for (let i = 1; i < segunda.length; i++) candidatos.push(primera.slice(0, 2) + segunda[i]);
  }
  // Una palabra sola (o si lo anterior chocó): primeras 3 letras y, si chocan,
  // la 1ª + 2ª + cada letra siguiente.
  for (let i = 2; i < primera.length; i++) candidatos.push(primera.slice(0, 2) + primera[i]);
  for (let i = 2; i < primera.length; i++) candidatos.push(primera[0] + primera[i] + (primera[i + 1] ?? ""));

  return candidatos.find((c) => c.length === 3 && !usados.has(c)) ?? "";
}
