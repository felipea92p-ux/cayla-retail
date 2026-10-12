import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Al cerrar la hoja «Anular orden» (Escape o Cancelar), el foco caía al principio de la página (chaos 2026-10-10, TEC-06): la hoja se monta
// sin «disparador» de Radix, y `<Modal>` solo devuelve el foco si se le dice adónde (`alCerrarEnfocar`). Con teclado había que recorrer toda la
// pantalla otra vez. Esta prueba vigila que la hoja vuelva al botón que la abrió.

const fuente = readFileSync(join(__dirname, "..", "components/ordenes-compra/AccionesOrden.tsx"), "utf8");

describe("órdenes de compra: al cerrar «Anular orden», el foco vuelve al botón", () => {
  it("el botón se recuerda al pulsarlo y la hoja se lo pasa a <Modal>", () => {
    expect(fuente).toMatch(/origenAnular\.current = e\.currentTarget/);
    expect(fuente).toMatch(/alCerrarEnfocar=\{volverA\}/);
    expect(fuente).toMatch(/<AnularOrdenModal[\s\S]*?volverA=\{origenAnular\}/);
  });
});
