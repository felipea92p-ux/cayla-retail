import { describe, expect, it } from "vitest";
import { claveDeSede, sedeDeLaUrl, sedesEnOrden } from "./sede-elegida";

const TRUJILLO = { id: "t", nombre: "Trujillo" };
const LIMA = { id: "l", nombre: "Lima" };
const AREQUIPA = { id: "a", nombre: "Arequipa" };
const SAN_ISIDRO = { id: "s", nombre: "San Isidro" };

describe("la tienda elegida", () => {
  it("la clave de una tienda en la dirección: minúsculas, sin tildes ni espacios", () => {
    expect(claveDeSede("Trujillo")).toBe("trujillo");
    expect(claveDeSede("San Isidro")).toBe("san-isidro");
    expect(claveDeSede("  Ñaña — Centro  ")).toBe("nana-centro");
    expect(claveDeSede("Óvalo Gutiérrez")).toBe("ovalo-gutierrez");
  });

  it("las píldoras van en orden alfabético, sin tocar la lista de la base", () => {
    const deLaBase = [TRUJILLO, LIMA, AREQUIPA];
    expect(sedesEnOrden(deLaBase).map((s) => s.nombre)).toEqual(["Arequipa", "Lima", "Trujillo"]);
    expect(deLaBase.map((s) => s.nombre)).toEqual(["Trujillo", "Lima", "Arequipa"]);
  });

  it("lee la tienda de la dirección, con o sin mayúsculas y tildes", () => {
    const sedes = [TRUJILLO, LIMA, SAN_ISIDRO];
    expect(sedeDeLaUrl("trujillo", sedes)).toBe(TRUJILLO);
    expect(sedeDeLaUrl("Trujillo", sedes)).toBe(TRUJILLO);
    expect(sedeDeLaUrl(["lima", "trujillo"], sedes)).toBe(LIMA);
    expect(sedeDeLaUrl("san-isidro", sedes)).toBe(SAN_ISIDRO);
    expect(sedeDeLaUrl("San Isidro", sedes)).toBe(SAN_ISIDRO);
  });

  it("sin tienda, o una que no se ve en la web, es «Todas»", () => {
    const sedes = [TRUJILLO, LIMA];
    for (const raro of [undefined, "", "  ", "arequipa", "---", "todas"]) expect(sedeDeLaUrl(raro, sedes), String(raro)).toBeNull();
    expect(sedeDeLaUrl("trujillo", [])).toBeNull();
  });
});
