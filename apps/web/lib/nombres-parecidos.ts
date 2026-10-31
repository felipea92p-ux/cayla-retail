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

/** Los caracteres que no se ven y que viajan en cualquier copiar y pegar: el espacio de ancho cero (web, WhatsApp), sus
 *  parientes, el unidor de palabras, el BOM y el guion suave que mete un PDF al cortar una palabra. No son parte del
 *  nombre, y tomarlos por tal creaba dos veces la misma cosa: «Botón ZW» y «Botón\u200B ZW» entraban como dos fichas con
 *  el stock partido, y el índice único no decía nada porque para él eran dos claves (/chaos, 30 y 31-oct). */
const INVISIBLES = /[\u00AD\u200B-\u200F\u2060\uFEFF]/g;

/** Lo que la base compara (`retail.fn_clave_texto` sobre el nombre ya limpiado por la RPC): sin los invisibles, espacios
 *  juntados, minúsculas, y sin las tildes y la ñ que la base traduce (solo esas: «ç» sigue siendo «ç», como en la base).
 *  Ojo: la base NO quita puntos, así que para ella «S.A.C.» y «SAC» son nombres distintos.
 *  Los invisibles se quitan ANTES de juntar los espacios: uno metido entre dos dejaría un espacio doble si fuera después. */
export function claveTexto(nombre: string): string {
  const traduce: Record<string, string> = { á: "a", é: "e", í: "i", ó: "o", ú: "u", ü: "u", ñ: "n" };
  return nombre
    .replace(INVISIBLES, "")
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

type OpcionesDeMotivo = { numerosCuentan: boolean; contenida: boolean; tipeoDesde: number };

function motivoParecido(pa: readonly string[], pb: readonly string[], { numerosCuentan, contenida, tipeoDesde }: OpcionesDeMotivo): { por: MotivoParecido; peso: number } | null {
  // Si los números cuentan («Talla 38» y «Talla 40», «Jersey 30/1» y «Jersey 24/1»), dos nombres con otros dígitos son otros nombres.
  if (numerosCuentan && pa.join("").replace(/\D/g, "") !== pb.join("").replace(/\D/g, "")) return null;
  // La raíz: todo junto, sin signos y sin el número del final. «Cayla 2», «CAYLA.» y «cayla» dan «cayla».
  const ra = pa.join("").replace(/\d+$/, "");
  const rb = pb.join("").replace(/\d+$/, "");
  if (!ra || !rb) return null;
  if (ra === rb) return { por: "raiz", peso: 0 };
  // Con nombres cortos una letra ya es otro nombre («Kero» / «Kera»): solo se cuenta el error de tipeo desde 5 letras
  // (`tipeoDesde`), y dos letras desde 3 más.
  const corta = Math.min(ra.length, rb.length);
  const d = distancia(ra, rb);
  if ((corta >= tipeoDesde && d <= 1) || (corta >= tipeoDesde + 3 && d <= 2)) return { por: "letras", peso: d };
  if (!contenida) return null;
  const sinNumA = pa.filter((w) => !/^\d+$/.test(w));
  const sinNumB = pb.filter((w) => !/^\d+$/.test(w));
  const [menos, mas] = sinNumA.length <= sinNumB.length ? [sinNumA, sinNumB] : [sinNumB, sinNumA];
  if (menos.join("").length >= 4 && menos.every((w) => mas.includes(w))) return { por: "contenida", peso: 3 };
  return null;
}

/**
 * `numerosCuentan`, `contenida` y `tipeoDesde` son para vocabularios (colores, tallas, tejidos, patrones: `atributo-parecido.ts`),
 * no para marcas: en un vocabulario los dígitos distinguen («Talla 38» no es «Talla 40»), que un nombre esté dentro de otro casi
 * nunca es el mismo («Azul» está en «Azul rey» y son dos colores) y con nombres cortos una letra es otro color («Morado» y
 * «Dorado»). Sin pasarlas, la regla es la de siempre.
 */
export function nombresParecidos<T extends { nombre: string }>(
  nombre: string,
  existentes: readonly T[],
  {
    max = 3,
    quitar = todasCuentan,
    numerosCuentan = false,
    contenida = true,
    tipeoDesde = 5,
  }: { max?: number; quitar?: QuitarPalabras; numerosCuentan?: boolean; contenida?: boolean; tipeoDesde?: number } = {}
): { igual: T | null; parecidos: { item: T; por: MotivoParecido }[] } {
  const clave = claveTexto(nombre);
  if (!clave) return { igual: null, parecidos: [] };
  const igual = existentes.find((e) => claveTexto(e.nombre) === clave) ?? null;
  const propias = quitar(palabrasDe(nombre));
  const parecidos = existentes
    .filter((e) => e !== igual)
    .flatMap((e) => {
      const r = motivoParecido(propias, quitar(palabrasDe(e.nombre)), { numerosCuentan, contenida, tipeoDesde });
      return r ? [{ item: e, ...r }] : [];
    })
    .sort((x, y) => x.peso - y.peso || x.item.nombre.localeCompare(y.item.nombre, "es"))
    .slice(0, max)
    .map(({ item, por }) => ({ item, por }));
  return { igual, parecidos };
}
