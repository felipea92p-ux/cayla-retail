import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Lo que «Pregúntale a CAYLA» puede rellenar es una LISTA BLANCA (ADR-0529, actividad 6; tensión 1 del ADR).
 *
 * El piloto solo escribe el dato de la persona en una pieza marcada `data-asistente="rellenable"`. Un campo nuevo nace SIN marca, y
 * marcar uno lo decide Felipe: hoy solo el `<Buscador>` (buscar no guarda nada). Nunca un monto, una cantidad, un comprobante, el combo
 * «Responsable» (elegirlo es la firma, ADR-0162) ni una casilla. Si esta prueba falla, no agregues el archivo a la lista sin ese OK.
 */

const WEB = join(__dirname, "..");
/** Las únicas piezas que llevan la marca, con su porqué. */
const MARCADAS: Record<string, string> = {
  "components/ui/Buscador.tsx": "buscar no guarda nada: el dato solo filtra la lista",
};
/** Las que no pueden llevarla nunca, aunque alguien quiera agregarla a la lista de arriba (`campos.tsx`: los campos de los formularios que guardan, el interruptor y los botones). */
const NUNCA = ["components/ui/CampoMonto.tsx", "components/ui/PasoCantidad.tsx", "components/ComboResponsable.tsx", "components/ui/Casilla.tsx", "components/ui/campos.tsx"];

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return nombre === "node_modules" || nombre.startsWith(".") ? [] : archivos(ruta);
    return /\.(tsx|ts|jsx|js)$/.test(nombre) && !/\.test\./.test(nombre) ? [ruta] : [];
  });
}

/** La marca como atributo (JSX o `setAttribute`), no como selector entre corchetes (el piloto la BUSCA, no la pone). */
const PONE_LA_MARCA = /(?<!\[)data-asistente\s*=|setAttribute\(\s*["']data-asistente["']/;

describe("lo que el asistente puede rellenar es una lista blanca", () => {
  const marcadas = [...archivos(join(WEB, "components")), ...archivos(join(WEB, "app")), ...archivos(join(WEB, "lib"))]
    // Sin los comentarios: el piloto y los tipos NOMBRAN la marca al explicarla, sin ponerla.
    .filter((ruta) => PONE_LA_MARCA.test(readFileSync(ruta, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")))
    .map((ruta) => relative(WEB, ruta));

  it("solo las piezas de la lista llevan data-asistente", () => {
    expect(marcadas.filter((r) => !(r in MARCADAS)), "Una pieza nueva lleva data-asistente: marcar un campo como rellenable lo decide Felipe (ADR-0529)").toEqual([]);
  });

  it("cada pieza de la lista sigue marcada (si no, el relleno no tendría dónde escribir)", () => {
    expect(Object.keys(MARCADAS).filter((r) => !marcadas.includes(r))).toEqual([]);
  });

  it("un monto, una cantidad, el responsable o una casilla nunca están en la lista", () => {
    expect(NUNCA.filter((r) => r in MARCADAS || marcadas.includes(r))).toEqual([]);
  });
});
