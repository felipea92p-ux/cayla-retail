// «¿No será uno que ya existe?» — la regla pura que compara un nombre nuevo contra los que ya existen. Sin React ni red.
//
// Nació para marcas (el caso «Cayla 2», 2026-09-24, ADR-0109) y se generalizó el 2026-09-25 para proveedores, donde
// pesa más: un proveedor partido en dos reparte sus facturas, su Por pagar y sus notas de crédito en dos fichas. Cada
// dominio la llama con su propio nombre (`marcasParecidas` en `marcas.ts`, `proveedoresParecidos` en
// `proveedores-reglas.ts`) y decide qué palabras no cuentan para la identidad (`quitar`): así la regla es UNA y lo
// que cambia por dominio queda a la vista, en su archivo.
//
// CONTRATO
//   PROMETE: dado un nombre y los que existen, devuelve el IGUAL (el que la base considera el mismo: los índices únicos
//            sobre `retail.fn_clave_texto`) y hasta `max` PARECIDOS, de más a menos parecido.
//   ASUME:   que la base sigue mandando con el igual; «parecido» es solo una pregunta para quien escribe.
//   NO HACE: no bloquea. «La Femme» y «La Femme 21» pueden ser dos marcas de verdad; quien decide es la persona.
//
// Qué NO usa la base: `retail.buscar_productos_parecidos` (productos) compara en Postgres porque los productos son
// miles y la pantalla no los tiene. Marcas y proveedores son menos de 100 (80 y 76 el 2026-09-25) y ya vienen en la
// pantalla: comparar aquí es instantáneo, sin viaje a la base y sin que un corte de red deje de preguntar.

/** Por qué se parece: mismo nombre salvo números o signos («Cayla 2»), una o dos letras cambiadas («Kristell»), o el
 *  nombre entero cabe en el otro, palabra por palabra («Divas» en «Divas Now»). */
export type MotivoParecido = "raiz" | "letras" | "contenida";

/** Lo que la base compara (`retail.fn_clave_texto` sobre el nombre ya limpiado por la RPC): espacios juntados,
 *  minúsculas, y sin las tildes y la ñ que la base traduce (solo esas: «ç» sigue siendo «ç», como en la base).
 *  Ojo: la base NO quita puntos, así que para ella «S.A.C.» y «SAC» son nombres distintos. */
export function claveTexto(nombre: string): string {
  const traduce: Record<string, string> = { á: "a", é: "e", í: "i", ó: "o", ú: "u", ü: "u", ñ: "n" };
  return nombre
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[áéíóúüñ]/g, (c) => traduce[c]);
}

/** Qué palabras de un nombre no cuentan para decir si es el mismo (p. ej. «SAC» en un proveedor). Recibe las palabras
 *  ya en minúsculas, sin tildes ni signos, y devuelve las que sí cuentan. */
export type QuitarPalabras = (palabras: readonly string[]) => readonly string[];

const todasCuentan: QuitarPalabras = (palabras) => palabras;

const palabrasDe = (nombre: string) =>
  claveTexto(nombre)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

function distancia(a: string, b: string): number {
  let previa = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const fila = [i];
    for (let j = 1; j <= b.length; j++) fila[j] = Math.min(previa[j] + 1, fila[j - 1] + 1, previa[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    previa = fila;
  }
  return previa[b.length];
}

function motivoParecido(pa: readonly string[], pb: readonly string[]): { por: MotivoParecido; peso: number } | null {
  // La raíz: todo junto, sin signos y sin el número del final. «Cayla 2», «CAYLA.» y «cayla» dan «cayla».
  const ra = pa.join("").replace(/\d+$/, "");
  const rb = pb.join("").replace(/\d+$/, "");
  if (!ra || !rb) return null;
  if (ra === rb) return { por: "raiz", peso: 0 };
  // Con nombres cortos una letra ya es otro nombre («Kero» / «Kera»): solo se cuenta el error de tipeo desde 5 letras,
  // y dos letras desde 8.
  const corta = Math.min(ra.length, rb.length);
  const d = distancia(ra, rb);
  if ((corta >= 5 && d <= 1) || (corta >= 8 && d <= 2)) return { por: "letras", peso: d };
  const sinNumA = pa.filter((w) => !/^\d+$/.test(w));
  const sinNumB = pb.filter((w) => !/^\d+$/.test(w));
  const [menos, mas] = sinNumA.length <= sinNumB.length ? [sinNumA, sinNumB] : [sinNumB, sinNumA];
  if (menos.join("").length >= 4 && menos.every((w) => mas.includes(w))) return { por: "contenida", peso: 3 };
  return null;
}

export function nombresParecidos<T extends { nombre: string }>(
  nombre: string,
  existentes: readonly T[],
  { max = 3, quitar = todasCuentan }: { max?: number; quitar?: QuitarPalabras } = {}
): { igual: T | null; parecidos: { item: T; por: MotivoParecido }[] } {
  const clave = claveTexto(nombre);
  if (!clave) return { igual: null, parecidos: [] };
  const igual = existentes.find((e) => claveTexto(e.nombre) === clave) ?? null;
  const propias = quitar(palabrasDe(nombre));
  const parecidos = existentes
    .filter((e) => e !== igual)
    .flatMap((e) => {
      const r = motivoParecido(propias, quitar(palabrasDe(e.nombre)));
      return r ? [{ item: e, ...r }] : [];
    })
    .sort((x, y) => x.peso - y.peso || x.item.nombre.localeCompare(y.item.nombre, "es"))
    .slice(0, max)
    .map(({ item, por }) => ({ item, por }));
  return { igual, parecidos };
}
