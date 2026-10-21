// El nombre de una persona según el padrón (RENIEC, por el DNI), leído como lo dice una persona. UNA sola regla para todo el
// sistema (Felipe 2026-10-15: «María Pérez García», con el saludo «¡Listo, María!»), sin red: la usa la consulta al padrón
// (`./padron.ts`, que ya devuelve el nombre así) y, a través de ella, el ERP (Vender, Clientes, el cartel del Club, Apartados, los
// comprobantes) y la tienda online.
//
// EL PROBLEMA. Cada fuente trae el nombre a su manera: el servicio público de SUNAT, junto y con los apellidos primero
// («ESPINOZA SANTIAGO,MARIA FERNANDA»); los proveedores de pago, por partes (nombres, apellido paterno, apellido materno) y además
// junto, también con los apellidos primero. Guardado tal cual, la ficha decía «PÉREZ GARCÍA MARÍA» y el saludo, que toma la primera
// palabra, salía «¡Listo, Pérez!».
//
// LA REGLA (`nombreDePersona`)
//   1. Por partes, si la fuente las trae: no hay que adivinar nada.
//   2. Junto y con una coma («APELLIDOS, NOMBRES»): la coma dice qué es qué.
//   3. Junto y sin coma: RENIEC y SUNAT ponen primero los apellidos, y casi todo peruano tiene dos, así que los dos primeros grupos
//      son los apellidos («DE LA CRUZ» es UN apellido: la partícula va con la palabra que sigue). Con dos grupos, uno y uno.
// Y se muestra con los nombres primero, con mayúsculas y minúsculas normales y sus tildes (`nombreCompleto`): «María del Carmen de
// la Cruz Pérez». La regla no inventa tildes: un padrón que escribe «MARIA» da «Maria».

/** El nombre de una persona, partido y con mayúsculas y minúsculas normales: «María del Carmen» y «de la Cruz Pérez». */
export type NombreDePersona = { nombres: string; apellidos: string };

/** Las partes del nombre como las traen los proveedores de pago (cualquiera puede faltar). */
type PartesDelNombre = { nombres?: string | null; apellidoPaterno?: string | null; apellidoMaterno?: string | null };

const PARTICULAS = new Set(["DE", "DEL", "LA", "LAS", "LOS", "Y", "DA", "DI", "VAN", "VON"]);
const esParticula = (p: string) => PARTICULAS.has(p.toLocaleUpperCase("es"));
const limpio = (t: string | null | undefined) => (t ?? "").replace(/\s+/g, " ").trim();
const palabras = (t: string) => limpio(t).split(" ").filter(Boolean);

/** «DE LA CRUZ» es UN apellido: la partícula va con la palabra que sigue. */
function grupos(lista: readonly string[]): string[][] {
  const out: string[][] = [];
  let pendiente: string[] = [];
  for (const p of lista) {
    pendiente.push(p);
    if (!esParticula(p)) {
      out.push(pendiente);
      pendiente = [];
    }
  }
  if (pendiente.length > 0) out.push(pendiente);
  return out;
}

/** «PÉREZ» → «Pérez», «O'BRIEN» → «O'Brien», «PÉREZ-SALAS» → «Pérez-Salas». Con la ñ y las tildes que traiga. */
const capital = (p: string) =>
  p
    .toLocaleLowerCase("es")
    .replace(/(^|[-'’])(\p{L})/gu, (_, antes: string, letra: string) => antes + letra.toLocaleUpperCase("es"));

/** Una parte del nombre con mayúsculas y minúsculas normales: las partículas en minúscula («de la Cruz»), salvo al empezar. */
function legible(texto: string): string {
  return palabras(texto)
    .map((p, i) => (i > 0 && esParticula(p) ? p.toLocaleLowerCase("es") : capital(p)))
    .join(" ");
}

const partido = (nombres: string, apellidos: string): NombreDePersona | null => {
  const n = legible(nombres);
  return n ? { nombres: n, apellidos: legible(apellidos) } : null;
};

/** El nombre junto: con coma, la coma dice qué es qué; sin coma, los apellidos primero (dos grupos, o uno si solo hay dos). */
function partirJunto(junto: string): NombreDePersona | null {
  const texto = limpio(junto);
  if (!texto) return null;
  if (texto.includes(",")) {
    const [apellidos, ...resto] = texto.split(",");
    const nombres = limpio(resto.join(" "));
    return nombres ? partido(nombres, apellidos ?? "") : partido(apellidos ?? "", "");
  }
  const g = grupos(palabras(texto));
  const nApellidos = g.length >= 3 ? 2 : g.length - 1;
  const unir = (x: string[][]) => x.map((grupo) => grupo.join(" ")).join(" ");
  return partido(unir(g.slice(nApellidos)), unir(g.slice(0, nApellidos)));
}

/**
 * El nombre de una persona con la regla de arriba: por partes si la fuente las trae (los nombres y al menos un apellido); si no, el
 * nombre junto. null si no hay nombre.
 */
export function nombreDePersona(fuente: { partes?: PartesDelNombre; junto?: string | null }): NombreDePersona | null {
  const p = fuente.partes;
  const apellidos = limpio([p?.apellidoPaterno, p?.apellidoMaterno].map(limpio).filter(Boolean).join(" "));
  if (limpio(p?.nombres) && apellidos) return partido(limpio(p?.nombres), apellidos);
  return partirJunto(fuente.junto ?? "") ?? (limpio(p?.nombres) ? partido(limpio(p?.nombres), "") : null);
}

/**
 * «María Pérez García»: los nombres primero. Es el nombre que se guarda en la ficha, se muestra y sale en la boleta. Los apellidos
 * sueltos empiezan con mayúscula («De la Cruz»); dentro del nombre completo, la partícula va en minúscula («María de la Cruz»).
 */
export function nombreCompleto(n: NombreDePersona): string {
  return legible(`${n.nombres} ${n.apellidos}`);
}

/**
 * «¿Eres María P. G.?»: el primer nombre entero y la inicial de cada apellido. Para que ella confirme que tipeó bien su documento sin
 * que la página revele el nombre completo de nadie (ADR-0288 G-3). Recibe las partes como las devuelve la consulta al padrón
 * (`DatosPadron`, null en un RUC). null sin nombres.
 */
export function nombreAMedias(n: { nombres: string | null; apellidos: string | null }): string | null {
  const primero = grupos(palabras(legible(n.nombres ?? "")))[0]?.join(" ");
  if (!primero) return null;
  const iniciales = grupos(palabras(n.apellidos ?? "")).map((g) => `${(g.find((x) => !esParticula(x)) ?? g[0] ?? "").charAt(0).toLocaleUpperCase("es")}.`);
  return [primero, ...iniciales].join(" ");
}
