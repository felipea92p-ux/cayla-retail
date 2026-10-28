import { describe, expect, it } from "vitest";
import {
  ajustarCelular,
  celularValido,
  codigoClubLegible,
  estadoClub,
} from "./club-reglas";

describe("club de clientas (ADR-0288 tanda 1b): dos permisos, código y QR", () => {
  it("estado frente al club: la publicidad solo existe sobre una socia", () => {
    expect(estadoClub({ clubDesde: null, publicidadDesde: null })).toBe("no_socia");
    expect(estadoClub({ clubDesde: "2026-09-30", publicidadDesde: null })).toBe("socia");
    expect(estadoClub({ clubDesde: "2026-09-30", publicidadDesde: "2026-09-30" })).toBe("socia_con_publicidad");
  });

  it("el celular: 9 dígitos que empiezan en 9; se limpia al pegarlo con +51 y espacios", () => {
    expect(celularValido("987654321")).toBe(true);
    expect(celularValido("887654321")).toBe(false);
    expect(celularValido("98765432")).toBe(false);
    expect(celularValido(null)).toBe(false);
    expect(ajustarCelular("+51 987 654 321")).toBe("987654321");
    expect(ajustarCelular("987-654-3219")).toBe("987654321");
  });

  it("el código de socia se lee en mayúsculas", () => {
    expect(codigoClubLegible("c-0142")).toBe("C-0142");
    expect(codigoClubLegible(null)).toBeNull();
  });
});
