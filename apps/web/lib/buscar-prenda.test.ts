import { describe, it, expect } from "vitest";
import { filtrarPrendas, resolverCodigo } from "./buscar-prenda";

// La caja tiene que reconocer lo que la etiqueta dice. Tres etiquetas conviven en la
// tienda: la impresa después del censo (código corto, `BLU-0042-AZM-M`), la vieja con el
// SKU largo, y la que la prenda trae de fábrica (un EAN). Las tres viven en
// `codigos_barras` (0047) — pero si esa tabla no llegó, el código corto y el SKU tienen
// que seguir resolviendo solos.

const blusaM = {
  varianteId: "v-blusa-m",
  codigo: "BLU-0042-AZM-M",
  sku: "BLUSA-MANGA-LARGA-AZUL-MARINO-M",
  referencia: "Blusa manga larga",
  talla: "M",
  color: "Azul marino",
};
const blusaL = { ...blusaM, varianteId: "v-blusa-l", codigo: "BLU-0042-AZM-L", sku: "BLUSA-MANGA-LARGA-AZUL-MARINO-L", talla: "L" };
const pantalon = {
  varianteId: "v-pant",
  codigo: null, // sin color normalizado todavía: ADR-0025, el código no se inventa
  sku: "PANT-NEGRO-28",
  referencia: "Pantalón palazzo",
  talla: "28",
  color: "Marrón",
};
const variantes = [blusaM, blusaL, pantalon];

const porCodigoBarras: Record<string, string> = {
  "BLU-0042-AZM-M": "v-blusa-m",
  "BLU-0042-AZM-L": "v-blusa-l",
  "7750243001234": "v-blusa-m", // el EAN de fábrica, adoptado en el censo
  "PANT-NEGRO-28": "v-pant", // el sku viejo, registrado por el backfill de 0047
};

describe("resolverCodigo — lo que la pistola teclea", () => {
  it("la etiqueta impresa después del censo entra por su código corto", () => {
    expect(resolverCodigo("BLU-0042-AZM-M", variantes, porCodigoBarras)).toBe(blusaM);
  });

  it("el código de fábrica adoptado en el censo también entra", () => {
    expect(resolverCodigo("7750243001234", variantes, porCodigoBarras)).toBe(blusaM);
  });

  it("la etiqueta vieja con el SKU largo sigue funcionando", () => {
    expect(resolverCodigo("PANT-NEGRO-28", variantes, porCodigoBarras)).toBe(pantalon);
  });

  it("no importa si la Encargada lo tecleó en minúsculas o con espacios alrededor", () => {
    expect(resolverCodigo("  blu-0042-azm-l ", variantes, porCodigoBarras)).toBe(blusaL);
  });

  it("si `codigos_barras` no llegó, el código corto y el SKU resuelven igual", () => {
    expect(resolverCodigo("BLU-0042-AZM-M", variantes, {})).toBe(blusaM);
    expect(resolverCodigo("pant-negro-28", variantes, {})).toBe(pantalon);
  });

  it("un código a medias o desconocido no resuelve: eso es búsqueda, no escaneo", () => {
    expect(resolverCodigo("BLU-0042", variantes, porCodigoBarras)).toBeNull();
    expect(resolverCodigo("9999999999999", variantes, porCodigoBarras)).toBeNull();
    expect(resolverCodigo("   ", variantes, porCodigoBarras)).toBeNull();
  });

  it("un código de barras que apunta a una prenda que no está en el catálogo cargado no revienta", () => {
    expect(resolverCodigo("BLU-0042-AZM-M", [pantalon], porCodigoBarras)).toBeNull();
  });
});

describe("filtrarPrendas — lo que la Encargada escribe a medias", () => {
  it("encuentra por el código corto a medias, que es lo que se ve en la etiqueta", () => {
    expect(filtrarPrendas("0042", variantes, 6)).toEqual([blusaM, blusaL]);
  });

  it("encuentra por referencia, talla o color, sin importar acentos ni mayúsculas", () => {
    expect(filtrarPrendas("marron", variantes, 6)).toEqual([pantalon]);
    expect(filtrarPrendas("Palazzo", variantes, 6)).toEqual([pantalon]);
    expect(filtrarPrendas("azul marino", variantes, 6)).toEqual([blusaM, blusaL]);
  });

  it("respeta el tope de resultados y devuelve nada con texto vacío", () => {
    expect(filtrarPrendas("blu", variantes, 1)).toEqual([blusaM]);
    expect(filtrarPrendas("   ", variantes, 6)).toEqual([]);
  });
});
