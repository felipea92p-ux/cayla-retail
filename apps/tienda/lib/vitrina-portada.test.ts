import { describe, expect, it } from "vitest";
import { tiendasEnFrase } from "./vitrina-portada";

describe("las tiendas en una frase", () => {
  it("una, dos o varias; sin tiendas, nada", () => {
    expect(tiendasEnFrase([])).toBeNull();
    expect(tiendasEnFrase(["Lima"])).toBe("Lima");
    expect(tiendasEnFrase(["Lima", "Trujillo"])).toBe("Lima y Trujillo");
    expect(tiendasEnFrase(["Arequipa", "Lima", "Trujillo"])).toBe("Arequipa, Lima y Trujillo");
  });
});
