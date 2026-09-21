import { describe, expect, it } from "vitest";
import { coincide, normalizar } from "./facturacion-busqueda";

describe("normalizar", () => {
  it("quita tildes y mayúsculas y junta los espacios", () => {
    expect(normalizar("  María   FERNÁNDA ")).toBe("maria fernanda");
    expect(normalizar("Nota de Crédito")).toBe("nota de credito");
  });

  it("la ñ pierde su tilde como cualquier otra: «Ñandú» es «nandu»", () => {
    expect(normalizar("Ñandú")).toBe("nandu");
  });
});

describe("coincide", () => {
  const boleta = ["Boleta", "B001-000029", "María Fernanda Quispe Huamán", "Aceptado"];

  it("una consulta vacía o solo de espacios deja pasar todo", () => {
    expect(coincide(boleta, "")).toBe(true);
    expect(coincide(boleta, "   ")).toBe(true);
    expect(coincide([], "")).toBe(true);
  });

  it("encuentra por un pedazo del número, del cliente o del estado, sin importar tildes ni mayúsculas", () => {
    expect(coincide(boleta, "000029")).toBe(true);
    expect(coincide(boleta, "b001-000029")).toBe(true);
    expect(coincide(boleta, "maria")).toBe(true);
    expect(coincide(boleta, "HUAMAN")).toBe(true);
    expect(coincide(boleta, "aceptado")).toBe(true);
  });

  it("cada palabra tiene que aparecer, en cualquier orden y en campos distintos", () => {
    expect(coincide(boleta, "b001 maria")).toBe(true);
    expect(coincide(boleta, "huaman boleta")).toBe(true);
    expect(coincide(boleta, "b001 rosa")).toBe(false);
  });

  it("no encuentra lo que no está", () => {
    expect(coincide(boleta, "factura")).toBe(false);
    expect(coincide(boleta, "000030")).toBe(false);
  });

  it("los campos que faltan no cuentan y los números se buscan como texto", () => {
    expect(coincide([null, undefined, "", 79.9, "Cliente varios"], "79.90")).toBe(false);
    expect(coincide([null, undefined, "", 79.9, "Cliente varios"], "79.9")).toBe(true);
    expect(coincide([null, "Cliente varios"], "varios")).toBe(true);
  });
});
