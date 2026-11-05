/**
 * Lo que `CampoFecha` y `SelectorMes` deciden sin dibujar nada (ADR-0611, mejora 8). Todo en texto `aaaa-mm-dd` o año, mes y día sueltos, nunca con
 * `new Date(iso)`: ese parseo es UTC y en Lima corre la fecha un día para atrás.
 */

/** Hasta dónde se puede elegir, y por qué. Sin motivo se dice lo obvio. */
export type LimitesFecha = { min?: string; max?: string; motivoMin?: string; motivoMax?: string };

const textoCorto = (iso: string) => iso.split("-").reverse().join("/");

/** Por qué este día no se puede elegir, o null si se puede. Una fecha incompleta no cuenta: de eso se ocupa quien la lee. */
export function motivoFueraDeLimites(iso: string, { min, max, motivoMin, motivoMax }: LimitesFecha): string | null {
  if (!iso) return null;
  if (min && iso < min) return motivoMin ?? `No puede ser antes del ${textoCorto(min)}.`;
  if (max && iso > max) return motivoMax ?? `No puede ser después del ${textoCorto(max)}.`;
  return null;
}

/** ¿Se puede ir a este mes (`aaaa-mm`) en el calendario? Un mes vale si algún día suyo se puede elegir. */
export function mesAlAlcance(anio: number, mes0: number, { min, max }: LimitesFecha): boolean {
  const clave = `${anio}-${String(mes0 + 1).padStart(2, "0")}`;
  if (min && clave < min.slice(0, 7)) return false;
  if (max && clave > max.slice(0, 7)) return false;
  return true;
}

/**
 * Mientras se escribe: solo cifras, y las barras se ponen solas («14092026» es «14/09/2026»). Si la persona escribe sus propias barras se respetan: «5/11» es
 * el 5 de noviembre, no «51/1». Lo que no cabe en su parte pasa a la siguiente, así que se puede seguir escribiendo de corrido.
 */
export function conBarras(crudo: string): string {
  if (!crudo.includes("/")) {
    const n = crudo.replace(/\D/g, "").slice(0, 8);
    if (n.length <= 2) return n;
    if (n.length <= 4) return `${n.slice(0, 2)}/${n.slice(2)}`;
    return `${n.slice(0, 2)}/${n.slice(2, 4)}/${n.slice(4)}`;
  }
  const trozos = crudo.replace(/[^\d/]/g, "").split("/");
  let [d = "", m = "", a = ""] = trozos;
  if (d.length > 2) [d, m] = [d.slice(0, 2), d.slice(2) + m];
  if (m.length > 2) [m, a] = [m.slice(0, 2), m.slice(2) + a];
  const partes = [d];
  if (trozos.length > 1 || m) partes.push(m);
  if (trozos.length > 2 || a) partes.push(a.slice(0, 4));
  return partes.join("/");
}

/**
 * La fecha que quiso decir, al salir del campo: `dd/mm/aaaa`, y también lo que se dice de corrido: «5/11» es este año y «5/11/26» es 2026. Devuelve `aaaa-mm-dd`, o
 * null si no es un día real («31/02») o está a medias.
 */
export function leerFechaEscrita(texto: string, anioActual: number): string | null {
  const p = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/.exec(texto.trim());
  if (!p) return null;
  const d = Number(p[1]);
  const m = Number(p[2]);
  const a = p[3] === undefined ? anioActual : p[3].length === 2 ? 2000 + Number(p[3]) : Number(p[3]);
  if (m < 1 || m > 12 || d < 1 || d > new Date(a, m, 0).getDate()) return null;
  return `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** A qué mes va una tecla en la grilla de meses, de 3 columnas: flechas, Inicio y Fin; RePág y AvPág cambian de año. Devuelve null si la tecla no es de la grilla. */
export function mesPorTecla(anio: number, mes0: number, tecla: string): { anio: number; mes: number } | null {
  const salto: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3, PageUp: -12, PageDown: 12 };
  if (tecla === "Home") return { anio, mes: 0 };
  if (tecla === "End") return { anio, mes: 11 };
  if (salto[tecla] === undefined) return null;
  const total = anio * 12 + mes0 + salto[tecla];
  return { anio: Math.floor(total / 12), mes: ((total % 12) + 12) % 12 };
}
