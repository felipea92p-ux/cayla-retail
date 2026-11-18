import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// ADR-0624: el IGV de las ventas que lee Ganancias y pérdidas es solo PRESENTACIÓN («Vendiste con IGV» sobre «Lo que vendiste»). La renta, el Balance, Patrimonio, el archivo del contador
// y el cuadro por sede no lo leen: si uno lo hiciera, podría sumar a una cifra del libro un IGV que es de SUNAT, que es justo el doble conteo que esta regla cerró.
const DEL_LIBRO = [
  "lib/renta-anual.ts",
  "lib/renta-anual-reglas.ts",
  "lib/contador.ts",
  "lib/contador-reglas.ts",
  "lib/estados-balance.ts",
  "lib/estados-patrimonio.ts",
  "components/finanzas/EstadoResultadosPanel.tsx",
  "app/(app)/finanzas/reportes/balance/page.tsx",
  "app/(app)/finanzas/reportes/patrimonio/page.tsx",
  "app/(app)/finanzas/reportes/flujo/page.tsx",
];
const CAPA = /igv-ventas|igvCobrado|conIgvDeLasVentas|fn_igv_de_las_ventas/;

describe("el IGV de las ventas no entra a lo que es del libro", () => {
  it.each(DEL_LIBRO)("%s no lo lee", (ruta) => {
    expect(readFileSync(join(process.cwd(), ruta), "utf8")).not.toMatch(CAPA);
  });
  it("el vigilante reconoce la capa", () => {
    expect(readFileSync(join(process.cwd(), "lib/igv-ventas-reglas.ts"), "utf8")).toMatch(CAPA);
  });
});
