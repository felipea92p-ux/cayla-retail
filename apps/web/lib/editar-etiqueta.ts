// Editar una insignia o campaña que ya existe (ADR-0490, 2026-10-27): lógica pura de la hoja «Editar», sin React ni red.
//
// PROMETE: (1) `cambioDeNombre` dice si el nombre escrito es otro del que ya lleva, ignorando espacios de los bordes y repetidos
//   (un espacio de más no es una corrección); una letra, una tilde o una mayúscula SÍ lo son, porque corregir la ortografía es justo
//   para lo que sirve el campo.
// ASUME: que quien guarda manda el nombre ya recortado (`trim`); la base y el endpoint vuelven a exigir que no esté vacío.

const sinEspaciosDeMas = (t: string) => t.trim().replace(/\s+/g, " ");

/** ¿El nombre escrito corrige el que ya lleva? Un nombre vacío no cuenta como cambio (no se puede guardar). */
export function cambioDeNombre(actual: string, nuevo: string): boolean {
  const limpio = sinEspaciosDeMas(nuevo);
  return limpio !== "" && limpio !== sinEspaciosDeMas(actual);
}
