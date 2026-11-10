import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Candado de la firma de respaldo (ADR-0454). Una terminal con `terminales.firma_respaldo_id` (hoy Caja Lima y Almacén Lima)
// está LISTA para guardar sin responsable, y `useResponsable().firma()` le devuelve `null` a propósito: la base firma sola a
// nombre del respaldo y la pantalla no manda encabezados. Por eso «¿puedo guardar?» se pregunta con `listo`, nunca con
// «¿hay firma?». El 2026-11-06 Editar producto (y «Cómo lo llama el proveedor») lo preguntaban con la firma: en las
// terminales de Lima «Confirmar y guardar» decía «Elige quién hace estos cambios» aunque la hoja dijera «Esta terminal no
// pide responsable», y no dejaba guardar fotos ni nada de la ficha.
//
// Contrato (3 líneas). PROMETE: que ningún archivo de la web corta un guardado con `if (!x)` justo después de
// `const x = ….firma()`. ASUME: el patrón se escribe así (la firma en una constante y el `if` en las 2 líneas siguientes).
// NO PROMETE: que cada pantalla pregunte `listo` antes de guardar; abrirla con una terminal de Lima sigue siendo la prueba final.

const RAICES = ["components", "app", "lib"];

const ARCHIVOS = RAICES.flatMap((raiz) => {
  const dir = new URL(`../${raiz}/`, import.meta.url);
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .map((f) => f.replaceAll("\\", "/"))
    .filter((f) => /\.tsx?$/.test(f) && !f.endsWith(".test.ts"))
    .map((f) => ({ ruta: `${raiz}/${f}`, fuente: readFileSync(new URL(f, dir), "utf8") }));
});

/** `const x = algo.firma();` seguido (en las 2 líneas siguientes) de `if (!x)` sin preguntar `listo` en la misma condición. */
function candadosPorFirma(fuente: string): number[] {
  const lineas = fuente.split("\n");
  const hallados: number[] = [];
  lineas.forEach((linea, i) => {
    const m = linea.match(/const (\w+) = [\w.]*firma\(\);/);
    if (!m) return;
    const siguientes = lineas.slice(i + 1, i + 3).join("\n");
    const corte = new RegExp(`if \\(!${m[1]}\\b(?![^)]*listo)`);
    if (corte.test(siguientes)) hallados.push(i + 1);
  });
  return hallados;
}

describe("la firma de respaldo no se confunde con «falta el responsable»", () => {
  it("el detector ve el patrón roto y deja pasar el correcto", () => {
    expect(candadosPorFirma("const firma = resp.firma();\nif (!firma) {\n  return;\n}")).toEqual([1]);
    expect(candadosPorFirma("const firma = resp.firma();\nif (!firma && !resp.listo) return;")).toEqual([]);
    expect(candadosPorFirma("if (!resp.listo) return;\nconst firma = resp.firma();\nawait firmar(q, firma);")).toEqual([]);
  });

  it("ningún guardado se corta por no tener firma (se pregunta `listo`)", () => {
    expect(ARCHIVOS.length).toBeGreaterThan(100);
    const rotos = ARCHIVOS.flatMap(({ ruta, fuente }) => candadosPorFirma(fuente).map((l) => `${ruta}:${l}`));
    expect(rotos, "Pregunta `responsable.listo` antes de guardar: con firma de respaldo (ADR-0454) `firma()` es null y aun así se puede guardar.").toEqual([]);
  });
});
