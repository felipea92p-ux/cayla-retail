import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// /chaos de Producción (2026-10-15, hallazgo #4): ninguna caja de texto de lo que guarda tenía tope y la base tampoco: 20 000 letras se guardaron en una nota, un código de lote, un
// documento y un nombre de insumo. Un tope en la pantalla (la base no se toca aquí) evita el abuso sin querer. Toda caja de texto LIBRE de las hojas del Taller lleva `maxLength`: un campo
// nuevo sin él cae aquí. Los números y las fechas no son texto libre (su tope es su rango) y no se miran.
const CARPETA = join(__dirname, "../components");
const HOJAS = [
  "InsumoModales.tsx",
  ...readdirSync(join(CARPETA, "insumos-taller")).filter((f) => f.endsWith("Modal.tsx")).map((f) => `insumos-taller/${f}`),
  ...readdirSync(join(CARPETA, "proveedores-produccion")).filter((f) => f.endsWith("Modal.tsx")).map((f) => `proveedores-produccion/${f}`),
  ...readdirSync(join(CARPETA, "orden-pagina")).filter((f) => f.endsWith("Modal.tsx")).map((f) => `orden-pagina/${f}`),
];

/** Cajas de texto que no son texto libre: su límite es su rango, no su largo. */
const NO_ES_TEXTO_LIBRE = [/inputMode="decimal"/, /inputMode="numeric"/, /type="date"/, /type="number"/, /<CampoMonto\b/, /<CampoFecha\b/];

describe("Producción: toda caja de texto libre de una hoja tiene su tope de letras", () => {
  it("hay hojas que revisar", () => {
    expect(HOJAS.length).toBeGreaterThan(10);
  });

  it.each(HOJAS)("%s", (archivo) => {
    const codigo = readFileSync(join(CARPETA, archivo), "utf8");
    const sinTope: string[] = [];
    for (const m of codigo.matchAll(/<(CampoTexto|textarea|input)\b([\s\S]*?)\/>/g)) {
      const bloque = m[0];
      if (NO_ES_TEXTO_LIBRE.some((r) => r.test(bloque))) continue;
      if (/maxLength=/.test(bloque)) continue;
      const linea = codigo.slice(0, m.index).split("\n").length;
      sinTope.push(`línea ${linea}: ${bloque.replace(/\s+/g, " ").slice(0, 90)}…`);
    }
    expect(sinTope, `${archivo}: cajas de texto sin maxLength\n${sinTope.join("\n")}`).toEqual([]);
  });
});
