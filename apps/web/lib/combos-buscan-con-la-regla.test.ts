import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Candado de la búsqueda de los combos (2026-09-29, ADR-0209). Felipe: alguien escribió «La   Femme21» en el buscador de
// marca y proveedor de Nuevo producto y no salió nada, aunque «La Femme 21» existe. La causa no era ese combo: cada uno de
// los cinco filtraba con su propio `clave(texto).includes(lo escrito)`, que no junta espacios repetidos ni separa
// «Femme21» de «Femme 21». Ahora todos filtran con `filtrarCombo` (lib/combo-reglas.ts). Esta prueba evita el sexto
// `includes` suelto: cualquier archivo de `components/` que use la regla de combos (`comboNecesitaBuscador` o
// `ComboBuscable`) tiene que buscar con `filtrarCombo`, sin comparar la cadena a mano.
//
// Contrato (3 líneas). PROMETE: que ningún combo del ERP busca por su cuenta. ASUME: un combo se reconoce porque usa
// `comboNecesitaBuscador(` o define el componente `ComboBuscable`. NO PROMETE: que la regla busque bien (eso lo prueban
// `combo-reglas.test.ts`); solo que todos pasan por ella.

const RAIZ = new URL("../components/", import.meta.url);

const archivos = (readdirSync(RAIZ, { recursive: true }) as string[])
  .filter((r) => /\.tsx$/.test(r) && !/\.test\./.test(r))
  .map((r) => ({ ruta: `components/${r}`, fuente: readFileSync(new URL(r, RAIZ), "utf8") }));

// Un combo con buscador: llama a la regla de cuántas opciones piden campo, o es el combo de tipeo inmediato.
const combos = archivos.filter((a) => /\bcomboNecesitaBuscador\(/.test(a.fuente) || /export function ComboBuscable\b/.test(a.fuente));

describe("todo combo busca con la regla global (filtrarCombo)", () => {
  it("encuentra los combos que hay hoy (si no, la prueba no está mirando nada)", () => {
    expect(combos.map((c) => c.ruta).sort()).toEqual(
      [
        "components/ComboResponsable.tsx",
        "components/FiltrosRecibidas.tsx",
        "components/ui/ComboBuscable.tsx",
        "components/ui/FiltrosPildora.tsx",
        "components/ui/campos.tsx",
      ].sort()
    );
  });

  it.each(combos.map((c) => [c.ruta, c.fuente] as const))("%s filtra con filtrarCombo", (ruta, fuente) => {
    expect(fuente, `${ruta}: el filtro del combo es filtrarCombo (lib/combo-reglas.ts)`).toMatch(/\bfiltrarCombo\(/);
  });

  it.each(combos.map((c) => [c.ruta, c.fuente] as const))("%s no compara la cadena a mano", (ruta, fuente) => {
    // `clave(x).includes(k)` es justo lo que falló: no junta espacios y no separa letras de números.
    expect(fuente, `${ruta}: nada de clave(...).includes(...) en un combo`).not.toMatch(/clave\([^)]*\)\.includes\(/);
  });
});
