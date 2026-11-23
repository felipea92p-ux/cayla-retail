import { describe, expect, it } from "vitest";
import { DOMINIO_A_LA_VISTA } from "./compartir-look";
import { canonicalDe, claveCanonica, conBase, ORIGEN_PUBLICO } from "./seo";

const TRUJILLO = { nombre: "Trujillo" };
const LIMA = { nombre: "Lima" };
const AREQUIPA = { nombre: "Arequipa" };

describe("lo que la tienda le dice a Google (ADR-0696)", () => {
  it("el origen es cayla.pe, el mismo dominio de la imagen de un look compartido", () => {
    expect(ORIGEN_PUBLICO).toBe("https://cayla.pe");
    expect(ORIGEN_PUBLICO).toBe(`https://${DOMINIO_A_LA_VISTA}`);
  });

  it("la tienda canónica es Trujillo; si no se ve en la web, la primera en orden; sin tiendas leídas, Trujillo", () => {
    expect(claveCanonica([AREQUIPA, LIMA, TRUJILLO])).toBe("trujillo");
    expect(claveCanonica([AREQUIPA, LIMA])).toBe("arequipa");
    expect(claveCanonica([])).toBe("trujillo");
  });

  it("la ficha y el Inicio: la ruta con su tienda, sin color, talla ni marcas", () => {
    expect(canonicalDe("/catalogo/abc", { sede: "lima", color: "rojo", talla: "m", utm_source: "wa" }, "trujillo")).toBe("/catalogo/abc?sede=trujillo");
    expect(canonicalDe("/inicio", { sede: "arequipa", utm_source: "qr", volver: "/cuenta" }, "trujillo")).toBe("/inicio?sede=trujillo");
  });

  it("una lista conserva lo que cambia qué se ve, en un orden fijo, y suelta el orden y los filtros", () => {
    expect(canonicalDe("/catalogo", { orden: "precio-asc", categoria: "blusas", sede: "lima", lista: "todo" }, "trujillo")).toBe(
      "/catalogo?sede=trujillo&categoria=blusas",
    );
    expect(canonicalDe("/catalogo", { pagina: "2", lista: "ofertas", campana: "verano" }, "trujillo")).toBe(
      "/catalogo?sede=trujillo&lista=ofertas&campana=verano&pagina=2",
    );
    expect(canonicalDe("/catalogo", { grupo: ["ropa", "x"], menu: " " }, "trujillo")).toBe("/catalogo?sede=trujillo&grupo=ropa");
  });

  it("la página 1, una página rara y la lista de siempre no se escriben", () => {
    for (const pagina of ["1", "0", "-3", "abc", ""]) {
      expect(canonicalDe("/catalogo", { pagina }, "trujillo"), pagina).toBe("/catalogo?sede=trujillo");
    }
    expect(canonicalDe("/catalogo", { pagina: "3x" }, "trujillo")).toBe("/catalogo?sede=trujillo&pagina=3");
  });

  it("una página fija es solo su ruta", () => {
    expect(canonicalDe("/tiendas")).toBe("/tiendas");
    expect(canonicalDe("/tiendas", { utm_source: "ig" })).toBe("/tiendas");
  });

  it("la vista previa de una página repite el nombre del sitio y el idioma, y deja que la página mande en lo suyo", () => {
    expect(conBase({ title: "Falda" })).toEqual({ siteName: "CAYLA", locale: "es_PE", type: "website", title: "Falda" });
  });
});
