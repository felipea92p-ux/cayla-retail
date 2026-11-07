import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// ADR-0620: el IGV de gestión es una capa de lectura para mirar el mes. La renta, el Balance, Patrimonio, el archivo del contador y el cuadro por sede siguen con el libro: si uno de
// estos archivos la leyera, una cifra legal o contable dependería de un monto que dice una persona y no pasa por el diario.
const DEL_LIBRO = [
  "lib/renta-anual.ts",
  "lib/renta-anual-reglas.ts",
  "lib/contador.ts",
  "lib/contador-reglas.ts",
  "lib/estados-balance.ts",
  "components/finanzas/EstadoResultadosPanel.tsx",
  "app/(app)/finanzas/reportes/balance/page.tsx",
  "app/(app)/finanzas/reportes/patrimonio/page.tsx",
];
const CAPA = /igv-gestion|filasDeGestion|getResultadosDeGestion|getIgvDeGestion|igvGestion|resultadoLibro/;

describe("el IGV de gestión no entra a lo que es del libro", () => {
  it.each(DEL_LIBRO)("%s no lee esta capa", (ruta) => {
    expect(readFileSync(join(process.cwd(), ruta), "utf8")).not.toMatch(CAPA);
  });
  it("el vigilante reconoce la capa", () => {
    expect(readFileSync(join(process.cwd(), "lib/igv-gestion-reglas.ts"), "utf8")).toMatch(CAPA);
  });
});

describe("la cabecera y la línea de Ganancias caen juntas", () => {
  const leer = (ruta: string) => readFileSync(join(process.cwd(), ruta), "utf8");
  it("la cabecera espera la lectura de la línea y la línea sigue a la cabecera", () => {
    const pantalla = leer("app/(app)/finanzas/reportes/page.tsx");
    expect(pantalla).toContain("await getIgvDelHilo(mesesDelHilo(hoy, inicio))");
    expect(pantalla).toContain("enLibro={!!gestion.falla}");
  });
  it("el calendario no dibuja barritas del libro sin decirlo", () => {
    expect(leer("app/(app)/finanzas/reportes/periodo/route.ts")).toContain("mesesDelCalendario(serie.meses, serie.falla)");
  });
});
