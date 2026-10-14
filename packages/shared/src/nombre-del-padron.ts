// El nombre del padrón (RENIEC/SUNAT) leído como una persona: a medias para confirmar sin revelarlo («Lucía P. S.») y partido
// en nombres y apellidos. Lógica pura, sin red: la usan el ERP (la página del Club, Apartados) y la tienda online (crear la
// cuenta), por eso vive en `packages/shared` desde el 2026-10-14 (ADR-0408). La consulta al padrón está en `./padron.ts`.

/**
 * En qué orden trae el padrón el nombre. SUNAT público (`apenomdenunciado`: «apellidos y nombres») trae primero los
 * apellidos; el proveedor de pago, si lo arma de sus partes, primero los nombres (`./padron.ts`, `normalizarRespuestaPadron`).
 */
export type OrdenDelNombre = "apellidos_primero" | "nombres_primero";

const PARTICULAS = new Set(["DE", "DEL", "LA", "LAS", "LOS", "Y", "DA", "DI", "VAN", "VON"]);
const esParticula = (p: string) => PARTICULAS.has(p.toLocaleUpperCase("es"));

/** «DE LA CRUZ» es UN apellido: la partícula va con la palabra que sigue. */
function grupos(palabras: readonly string[]): string[][] {
  const out: string[][] = [];
  let pendiente: string[] = [];
  for (const p of palabras) {
    pendiente.push(p);
    if (!esParticula(p)) {
      out.push(pendiente);
      pendiente = [];
    }
  }
  if (pendiente.length > 0) out.push(pendiente);
  return out;
}

const capital = (p: string) => p.charAt(0).toLocaleUpperCase("es") + p.slice(1).toLocaleLowerCase("es");
const inicial = (g: readonly string[]) => `${(g.find((p) => !esParticula(p)) ?? g[0] ?? "").charAt(0).toLocaleUpperCase("es")}.`;
const palabras = (t: string) => t.trim().split(" ").filter(Boolean);

/** El nombre del padrón partido en nombres y apellidos (cada uno en grupos de palabras: «DE LA CRUZ» es uno). Con una coma
 *  («PÉREZ SALAS, LUCÍA») se sabe qué es qué; si no, manda el orden de la fuente. null sin nombre. */
function partesDelNombre(nombre: string | null | undefined, orden: OrdenDelNombre): { nombres: string[][]; apellidos: string[][] } | null {
  const limpio = (nombre ?? "").replace(/\s+/g, " ").trim();
  if (!limpio) return null;
  let nombres: string[][];
  let apellidos: string[][];
  if (limpio.includes(",")) {
    const [ap, ...resto] = limpio.split(",");
    apellidos = grupos(palabras(ap ?? ""));
    nombres = grupos(palabras(resto.join(" ")));
    if (nombres.length === 0) [nombres, apellidos] = [apellidos.slice(0, 1), apellidos.slice(1)];
  } else {
    const g = grupos(palabras(limpio));
    const nApellidos = g.length >= 3 ? 2 : g.length - 1;
    if (orden === "apellidos_primero") {
      apellidos = g.slice(0, nApellidos);
      nombres = g.slice(nApellidos);
    } else {
      nombres = g.slice(0, g.length - nApellidos);
      apellidos = g.slice(g.length - nApellidos);
    }
  }
  return nombres.length > 0 ? { nombres, apellidos } : null;
}

/**
 * «¿Eres Lucía P. S.?»: el primer nombre entero y la inicial de cada apellido. Para que ella confirme que tipeó bien su DNI sin
 * que la página revele el nombre completo de nadie (ADR-0288 G-3). Si el orden real fuera otro, se vería el primer apellido entero
 * y lo demás en iniciales: sigue a medias. null sin nombre.
 */
export function nombreAMedias(nombre: string | null | undefined, orden: OrdenDelNombre): string | null {
  const partes = partesDelNombre(nombre, orden);
  const primero = partes?.nombres[0];
  if (!partes || !primero) return null;
  return [primero.map(capital).join(" "), ...partes.apellidos.map(inicial)].join(" ");
}

/**
 * El nombre del padrón en las dos cajas de un formulario («Nombres» y «Apellidos»), con mayúscula inicial: «PEREZ SALAS LUCIA
 * MARIA» (SUNAT, apellidos primero) → { nombres: «Lucia Maria», apellidos: «Perez Salas» }. Lo usa Apartados al no encontrar
 * la ficha por DNI (ADR-0367). Se puede corregir a mano: es una propuesta, no un dato sellado. null sin nombre.
 */
export function nombresYApellidos(nombre: string | null | undefined, orden: OrdenDelNombre): { nombres: string; apellidos: string } | null {
  const partes = partesDelNombre(nombre, orden);
  if (!partes) return null;
  const texto = (g: string[][]) => g.map((p) => p.map((x) => (esParticula(x) ? x.toLocaleLowerCase("es") : capital(x))).join(" ")).join(" ");
  return { nombres: texto(partes.nombres), apellidos: texto(partes.apellidos) };
}
