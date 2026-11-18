// La ida y vuelta de una guía interactiva (ADR-0389; `guias:recorrer -- --ida-y-vuelta`). La persona se mueve con ← y →, y al volver
// el motor repite lo que cada paso necesita (la hoja donde vive, la pestaña): un paso que se ve en la ida tiene que verse IGUAL al
// volver y al avanzar otra vez. El recorredor anota cada paso de tres pasadas —la ida hasta el último paso, la vuelta hasta el
// primero y la segunda ida hasta el último— y esta lógica, pura y con su prueba (`lib/guias-ida-y-vuelta.test.ts`), dice qué no
// coincide. Solo lee lo que el recorredor anotó: no abre navegador.

/**
 * Lo que el recorredor anota de cada paso.
 * @typedef {{ titulo: string, nota: string | null, hojas: number, numero: number, ultimo: boolean }} PasoVisto
 *   `nota`: lo que dice la tarjeta cuando algo falló («no está a la vista», «no pudo hacer este paso»), o `null`.
 *   `hojas`: cuántos `[role=dialog]` hay abiertos fuera del motor (las hojas de la pantalla).
 *   `numero`: el número del paso en la tarjeta («3 de 12»: cuántos pasos lleva vistos la persona).
 *   `ultimo`: el botón de la tarjeta dice «Terminar».
 */

/** Cómo se nombra cada pasada en la salida. */
const PASADAS = { vuelta: "al volver", ida2: "en la segunda ida" };

/**
 * Las claves de una pasada, en su orden. Dos pasos pueden llamarse igual («Cada prenda» al abrir y al cerrar), así que la clave
 * es el título más cuántas veces salió antes en esa pasada: «Cada prenda#0», «Cada prenda#1».
 * @param {Array<Pick<PasoVisto, "titulo">>} pasos
 */
export function clavesDePasada(pasos) {
  const vistos = new Map();
  return pasos.map((p) => {
    const n = vistos.get(p.titulo) ?? 0;
    vistos.set(p.titulo, n + 1);
    return `${p.titulo}#${n}`;
  });
}

/**
 * ¿La tarjeta sigue en el mismo paso? El motor no atiende una tecla mientras el piloto trabaja, así que tras ← o → el recorredor
 * pregunta esto antes de dar la tecla por recibida (y la repite).
 * @param {Pick<PasoVisto, "titulo" | "numero"> | null} a
 * @param {Pick<PasoVisto, "titulo" | "numero"> | null} b
 */
export function mismoLugar(a, b) {
  return !!a && !!b && a.numero === b.numero && a.titulo === b.titulo;
}

/**
 * Compara la ida con la vuelta y con la segunda ida, paso por paso.
 *   · `ida`: los pasos de la ida, del primero al último.
 *   · `vuelta`: los que se vieron tras cada ←, en ese orden (del penúltimo al primero); `null` si no se hizo.
 *   · `ida2`: los que se vieron tras cada →, en ese orden (del segundo al último); `null` si no se hizo.
 * Una pasada se cuenta en el orden de la ida (la vuelta se da vuelta) y empieza donde terminó la anterior: la vuelta arranca en el
 * último paso de la ida y la segunda ida en el primero que dejó la vuelta. Ese paso compartido no se compara dos veces.
 *
 * Devuelve las diferencias en el orden de la ida, la vuelta primero. Fallan `se-salta` (un paso de la ida no apareció), `nota` (la
 * tarjeta dice una nota que en la ida no decía) y `hojas` (cambió cuántas hojas hay abiertas); `de-mas` (apareció un paso que la ida
 * no mostró) solo avisa.
 * @param {{ ida: PasoVisto[], vuelta: PasoVisto[] | null, ida2: PasoVisto[] | null }} pasadas
 * @returns {Array<{ pasada: "vuelta" | "ida2", motivo: "se-salta" | "nota" | "hojas" | "de-mas", falla: boolean, titulo: string,
 *   paso: number | null, nota?: string | null, notaIda?: string | null, hojas?: number, hojasIda?: number }>}
 */
export function compararIdaYVuelta({ ida, vuelta, ida2 }) {
  if (ida.length < 2) return [];
  const clavesIda = clavesDePasada(ida);
  const deLaIda = new Set(clavesIda);
  const diferencias = [];
  /** `vistos` en el orden de la ida; `antes` y `despues`, el paso compartido con la pasada anterior (cuenta para las claves). */
  const comparar = (pasada, vistos, { antes = [], despues = [], compartido }) => {
    const claves = clavesDePasada([...antes, ...vistos, ...despues]).slice(antes.length, antes.length + vistos.length);
    const porClave = new Map(vistos.map((p, i) => [claves[i], p]));
    ida.forEach((p, i) => {
      if (i === compartido) return;
      const otro = porClave.get(clavesIda[i]);
      const base = { pasada, titulo: p.titulo, paso: i + 1 };
      if (!otro) return void diferencias.push({ ...base, motivo: "se-salta", falla: true });
      if (otro.nota && otro.nota !== p.nota) diferencias.push({ ...base, motivo: "nota", falla: true, nota: otro.nota, notaIda: p.nota });
      if (otro.hojas !== p.hojas) diferencias.push({ ...base, motivo: "hojas", falla: true, hojas: otro.hojas, hojasIda: p.hojas });
    });
    vistos.forEach((p, i) => {
      if (!deLaIda.has(claves[i])) diferencias.push({ pasada, titulo: p.titulo, paso: null, motivo: "de-mas", falla: false });
    });
  };
  const ultimo = ida.length - 1;
  // La vuelta, al revés, termina en el último paso de la ida, donde arrancó; la segunda ida arranca en el primero, donde terminó la
  // vuelta. Ese paso compartido ya se comparó (o es el de la ida): solo cuenta para las claves.
  if (vuelta) comparar("vuelta", [...vuelta].reverse(), { despues: [ida[ultimo]], compartido: ultimo });
  if (ida2) comparar("ida2", ida2, { antes: [vuelta?.at(-1) ?? ida[0]], compartido: 0 });
  return diferencias;
}

const corto = (texto, n = 70) => (texto.length > n ? `${texto.slice(0, n - 1)}…` : texto);
const hojasEn = (n) => (n === 1 ? "1 hoja abierta" : `${n} hojas abiertas`);

/**
 * La frase de una diferencia para la salida del recorredor: qué paso, en qué pasada y qué cambió.
 * @param {ReturnType<typeof compararIdaYVuelta>[number]} d
 */
export function fraseDeDiferencia(d) {
  const cuando = PASADAS[d.pasada];
  const paso = `el paso ${d.paso} «${d.titulo}»`;
  switch (d.motivo) {
    case "se-salta":
      return `${cuando} se salta ${paso}`;
    case "nota":
      return `${cuando}, ${paso} dice «${corto(d.nota ?? "")}» (${d.notaIda ? `en la ida decía «${corto(d.notaIda)}»` : "en la ida no"})`;
    case "hojas":
      return `${cuando}, ${paso} tiene ${hojasEn(d.hojas ?? 0)} (en la ida, ${d.hojasIda ?? 0})`;
    default:
      return `${cuando} aparece «${d.titulo}», que la ida no mostró`;
  }
}
