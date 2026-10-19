// El ejemplo del nombre de una campaña nueva (CLAUDE.md «Sugerencias coherentes», ADR-0290): la próxima fecha comercial del año que
// todavía NO es una campaña. Un ejemplo que ya existe llevaría a un «ya existe» (regla 3); uno de una fecha que ya pasó no le sirve a
// nadie. Lógica pura y estable (sin azar ni red), probada en `sugerencias-campanas.test.ts`.

/** Las fechas que CAYLA celebra o podría celebrar, con su día aproximado (mes-día). Curadas: no salen de una campaña real. */
export const FECHAS_COMERCIALES: readonly { nombre: string; dia: string }[] = [
  { nombre: "San Valentín", dia: "02-14" },
  { nombre: "Vuelta al cole", dia: "03-02" },
  { nombre: "Día de la Mujer", dia: "03-08" },
  { nombre: "Día de la Madre", dia: "05-10" },
  { nombre: "Día del Padre", dia: "06-21" },
  { nombre: "Fiestas Patrias", dia: "07-28" },
  { nombre: "Día de la Juventud", dia: "09-23" },
  { nombre: "Halloween", dia: "10-31" },
  { nombre: "Cyber Days", dia: "11-10" },
  { nombre: "Black Friday", dia: "11-27" },
  { nombre: "Navidad", dia: "12-25" },
  { nombre: "Fin de año", dia: "12-31" },
];

/** Para comparar nombres sin tildes, mayúsculas ni espacios de más (como `fn_clave_texto` en la base). */
const clave = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * «Ej. Día del Padre»: la primera fecha que viene desde `hoy` (`AAAA-MM-DD`, Lima) cuyo nombre no es ya una campaña o etiqueta. Da
 * la vuelta al año. Si todas existen, un ejemplo que no promete ninguna fecha.
 */
export function sugerirNombreCampana(existentes: readonly string[], hoy: string): string {
  const usados = new Set(existentes.map(clave));
  const mesDia = hoy.slice(5);
  const enOrden = [...FECHAS_COMERCIALES.filter((f) => f.dia >= mesDia), ...FECHAS_COMERCIALES.filter((f) => f.dia < mesDia)];
  const libre = enOrden.find((f) => !usados.has(clave(f.nombre)));
  return libre ? `Ej. ${libre.nombre}` : "El nombre que verá el cliente";
}

/* ---------------- La frase propia de la portada (Diseño en la web ▸ El texto) ---------------- */

/** @internal El tope del placeholder que la prueba exige: lo que el campo de la frase muestra sin cortarse en el celular (la caja útil del panel mide ~290 px a 375). */
export const MAX_FRASE_EJEMPLO = 40;

/**
 * El ejemplo de la frase propia: sigue lo que la campaña YA tiene. Con descuento y fecha de fin, la urgencia; con descuento sin fin, el
 * descuento; sin descuento, que son prendas elegidas (nunca un descuento ni un plazo que no tiene). No mira el nombre (lo escribe quien la
 * crea, sin deploy: un ejemplo por palabras del nombre se equivocaría con el primero que no esté en la lista). La fecha, el porcentaje y
 * «Crea tu cuenta…» ya los pone la web en el héroe: el ejemplo muestra el tono, no los repite.
 */
export function sugerirFrase(c: { pct: number | null; hasta: string | null }): string {
  if (c.pct && c.hasta) return "Ej. Solo por unos días, no te lo pierdas";
  if (c.pct) return "Ej. Un descuento para estrenar algo";
  return "Ej. Lo que elegimos para esta temporada";
}
