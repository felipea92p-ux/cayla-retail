import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { numeroDeMonto } from "./monto-plata-reglas";

// «Pagar juntos» en varios medios (auditoría 2026-11-15). La suma de los medios (`sumaLineasPago`) y lo que viaja a la base (`lineasPagoParaRpc`) leen cada monto
// con `numeroDeMonto`, que entiende la coma decimal. Dos líneas de la pantalla lo leían con `Number`: con «500,50» el pie decía «cubren el pago» y el botón
// quedaba apagado sin motivo, y el segundo medio no recibía el resto. PROMETE: que esas dos líneas siguen usando la misma lectura que la suma.
// NO PROMETE: que el pago se registre (eso lo cubren `pruebas:pago-por-lote-medios` y la base).

const componente = (archivo: string) => readFileSync(join(__dirname, "..", "components", archivo), "utf8").replace(/^\s*\/\/.*$/gm, "");

describe("el monto de cada medio se lee igual en la suma, en el botón y en el reparto", () => {
  it("la coma decimal es un monto: con Number era NaN", () => {
    expect(numeroDeMonto("500,50")).toBe(500.5);
    expect(Number("500,50")).toBeNaN();
  });

  it("«Pagar juntos» decide si los medios cubren el pago con numeroDeMonto", () => {
    const hoja = componente("PagoJuntosModal.tsx");
    expect(hoja).toMatch(/medios\.every\(\(m\) => numeroDeMonto\(m\.monto\) > 0\)/);
    expect(hoja).not.toMatch(/Number\(m\.monto\)/);
  });

  it("con dos medios, el resto se reparte leyendo lo escrito con numeroDeMonto", () => {
    const piezas = componente("PagoPiezas.tsx");
    expect(piezas).toMatch(/const n = numeroDeMonto\(cambio\.monto\);/);
    expect(piezas).not.toMatch(/Number\(cambio\.monto\)/);
  });
});
