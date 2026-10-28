import { describe, expect, it } from "vitest";
import { claveDeLaOpcion, claveDeSede, resolverSede, sedeDeLaUrl, sedesEnOrden, soloTiendas } from "./sede-elegida";

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

describe("siempre una tienda (2026-10-19)", () => {
  const sedes = sedesEnOrden([TRUJILLO, LIMA, AREQUIPA]);

  it("la de la dirección manda y no redirige", () => {
    expect(resolverSede("trujillo", "lima", sedes)).toEqual({ sede: TRUJILLO, redirigir: false });
  });

  it("sin tienda en la dirección: la que eligió la última vez, o la primera en orden", () => {
    expect(resolverSede(undefined, "lima", sedes)).toEqual({ sede: LIMA, redirigir: true });
    expect(resolverSede("", undefined, sedes)).toEqual({ sede: AREQUIPA, redirigir: true });
  });

  it("una tienda que no existe (en la dirección o recordada) cae a la primera, nunca a «Todas»", () => {
    expect(resolverSede("cusco", "tumbes", sedes)).toEqual({ sede: AREQUIPA, redirigir: true });
    expect(resolverSede("cusco", "lima", sedes)).toEqual({ sede: LIMA, redirigir: true });
  });

  it("con una sola tienda en la web (o ninguna) no hay nada que elegir", () => {
    expect(resolverSede(undefined, "lima", [LIMA])).toEqual({ sede: null, redirigir: false });
    expect(resolverSede("lima", undefined, [LIMA])).toEqual({ sede: LIMA, redirigir: false });
    expect(resolverSede(undefined, undefined, [])).toEqual({ sede: null, redirigir: false });
  });

  it("de las opciones de elegir tienda quedan solo las tiendas, y menos de dos no se ofrecen", () => {
    const todas = [
      { nombre: "Todas", href: "/inicio" },
      { nombre: "Lima", href: "/inicio?sede=lima" },
      { nombre: "Trujillo", href: "/catalogo?lista=nuevo&sede=trujillo#x" },
    ];
    expect(soloTiendas(todas)?.map((o) => o.nombre)).toEqual(["Lima", "Trujillo"]);
    expect(soloTiendas(todas.slice(0, 2))).toBeNull();
    expect(soloTiendas(null)).toBeNull();
    expect(claveDeLaOpcion("/catalogo?lista=nuevo&sede=trujillo#x")).toBe("trujillo");
    expect(claveDeLaOpcion("/inicio")).toBeNull();
  });
});
