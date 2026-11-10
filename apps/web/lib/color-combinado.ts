// Colores combinados (ADR-0643): «Hueso con azul» es un color de la carta armado con otros —la base primero y de 1 a 3
// acompañantes—. La base hace cumplir la forma (`colores_valida_componentes`) y arma nombre, código, familia y hex
// (`retail.color_combinado`); esto solo filtra lo que la pantalla manda, con las mismas reglas, para responder en
// español antes de ir a la base.

export const ERROR_COMPONENTES = "Una mezcla es un color base y de 1 a 3 que lo acompañan, cada uno con su código de 3 letras, sin repetir.";

/** Los códigos en mayúsculas, la base primero. `null` si no es una mezcla válida (2 a 4 colores, 3 letras, sin repetir). */
export function normalizarComponentes(crudo: unknown): string[] | null {
  if (!Array.isArray(crudo)) return null;
  const codigos = crudo.map((c) => (typeof c === "string" ? c.trim().toUpperCase() : ""));
  if (codigos.length < 2 || codigos.length > 4) return null;
  if (codigos.some((c) => !/^[A-Z]{3}$/.test(c))) return null;
  if (new Set(codigos).size !== codigos.length) return null;
  return codigos;
}
