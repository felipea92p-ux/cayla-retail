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

// Lo mismo con la hoja «Anular comprobante» (fase 2): se abre desde el botón «Anular» de la fila del comprobante y, al cerrarla, el foco
// vuelve a ese botón.
const comprobantes = readFileSync(join(__dirname, "..", "components/ordenes-compra/ComprobantesDeOrden.tsx"), "utf8");

describe("órdenes de compra: al cerrar «Anular comprobante», el foco vuelve al botón", () => {
  it("el botón se recuerda al pulsarlo y la hoja se lo pasa a <Modal>", () => {
    expect(comprobantes).toMatch(/origen\.current = e\.currentTarget/);
    expect(comprobantes).toMatch(/alCerrarEnfocar=\{volverA\}/);
    expect(comprobantes).toMatch(/<AnularComprobanteModal[\s\S]*?volverA=\{origen\}/);
  });
});

// Lo mismo con la hoja «Anular envío» (fase 3): se abre desde el botón «Anular envío» de la fila del envío y, al cerrarla, el foco vuelve a
// ese botón.
const envios = readFileSync(join(__dirname, "..", "components/ordenes-compra/EnviosDeOrden.tsx"), "utf8");

describe("órdenes de compra: al cerrar «Anular envío», el foco vuelve al botón", () => {
  it("el botón se recuerda al pulsarlo y la hoja se lo pasa a <Modal>", () => {
    expect(envios).toMatch(/origen\.current = ev\.currentTarget/);
    expect(envios).toMatch(/alCerrarEnfocar=\{volverA\}/);
    expect(envios).toMatch(/<AnularEnvioModal[\s\S]*?volverA=\{origen\}/);
  });
});
