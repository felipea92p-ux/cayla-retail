import { describe, expect, it } from "vitest";
import { faltaEnPrendaSinRegistrar } from "./prenda-sin-registrar-reglas";

const completa = { descripcion: "Blusa lino beige", categoriaId: "c", tallaId: "t", colorCodigo: "BEI", precio: 50 };

describe("faltaEnPrendaSinRegistrar", () => {
  it("completa → nada falta", () => expect(faltaEnPrendaSinRegistrar(completa)).toBeNull());
  it("descripción en blanco", () => expect(faltaEnPrendaSinRegistrar({ ...completa, descripcion: "  " })).toBe("Escribe una descripción corta"));
  it("sin categoría", () => expect(faltaEnPrendaSinRegistrar({ ...completa, categoriaId: "" })).toBe("Elige la categoría"));
  it("sin talla", () => expect(faltaEnPrendaSinRegistrar({ ...completa, tallaId: "" })).toBe("Elige la talla"));
  it("sin color", () => expect(faltaEnPrendaSinRegistrar({ ...completa, colorCodigo: "" })).toBe("Elige el color"));
  it("precio 0", () => expect(faltaEnPrendaSinRegistrar({ ...completa, precio: 0 })).toBe("Escribe el precio que cobraste"));
  it("precio que no es número", () => expect(faltaEnPrendaSinRegistrar({ ...completa, precio: Number.NaN })).toBe("Escribe el precio que cobraste"));
});
