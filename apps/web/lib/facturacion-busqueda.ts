// El buscador de la cabecera de Facturación (ADR-0124, spec §7): una caja que filtra las filas de la
// vista que se mira. Puras y sin servidor: cada lista arma la lista de campos de su fila y pregunta
// si coincide; la caja y el estado viven en el shell.

/** Minúsculas, sin tildes y con los espacios juntos: «María» y «maria» son lo mismo, y «Nota de
 *  crédito» se encuentra escribiendo «credito». */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** ¿Coincide la fila con lo que se escribió? Cada palabra de la consulta tiene que aparecer en alguno
 *  de los campos de la fila, en cualquier orden: «b001 maria» encuentra la boleta B001-000029 de María.
 *  Una consulta vacía deja pasar todo. Los campos que faltan (`null`) no cuentan. */
export function coincide(campos: (string | number | null | undefined)[], consulta: string): boolean {
  const palabras = normalizar(consulta).split(" ").filter(Boolean);
  if (palabras.length === 0) return true;
  const pajar = normalizar(campos.filter((c) => c !== null && c !== undefined && c !== "").join(" "));
  return palabras.every((palabra) => pajar.includes(palabra));
}
