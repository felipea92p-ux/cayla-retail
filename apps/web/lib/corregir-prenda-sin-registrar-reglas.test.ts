import { describe, expect, it } from "vitest";
import { arranqueDeCorreccion, cambioEnCorreccion, errorDeCorreccion, lineaDeCorreccion } from "./corregir-prenda-sin-registrar-reglas";

const listas = {
  categorias: [
    { id: "blusas", nombre: "Camisas y Blusas", prefijo: "BLU", familia: "superior" },
    { id: "bolsos", nombre: "Bolsos", prefijo: "BOL", familia: "accesorio" },
  ],
  tallas: [
    { id: "s", valor: "S" },
    { id: "m", valor: "M" },
    { id: "u", valor: "Única" },
  ],
  tallasPorCategoria: { blusas: [{ id: "s", texto: "S" }, { id: "m", texto: "M" }] },
  colores: [
    { codigo: "BEI", nombre: "Beige", hex: "#d8c3a5", familiaColor: "neutro", sinonimos: [] },
    { codigo: "NEG", nombre: "Negro", hex: "#111111", familiaColor: "neutro", sinonimos: [] },
  ],
};

const anotado = { categoriaId: "blusas", tallaId: "m", colorCodigo: "BEI", descripcion: "Camisas y Blusas · Beige · Talla M", precio: 50 };

describe("arranqueDeCorreccion", () => {
  it("arranca con lo anotado; si la descripción era la sugerencia, la sigue (cambia sola al corregir el color)", () =>
    expect(arranqueDeCorreccion(anotado, listas)).toEqual({ categoriaId: "blusas", tallaId: "m", colorCodigo: "BEI", descripcionEscrita: null }));
  it("una descripción escrita a mano por caja se respeta", () =>
    expect(arranqueDeCorreccion({ ...anotado, descripcion: "Blusa lino beige" }, listas).descripcionEscrita).toBe("Blusa lino beige"));
  it("una categoría que ya no está en la lista arranca vacía, y con ella la talla", () => {
    const r = arranqueDeCorreccion({ ...anotado, categoriaId: "desactivada" }, listas);
    expect([r.categoriaId, r.tallaId, r.colorCodigo]).toEqual(["", "", "BEI"]);
  });
  it("una talla que no es de la categoría arranca vacía (la caja no la ofrecería)", () =>
    expect(arranqueDeCorreccion({ ...anotado, tallaId: "u" }, listas).tallaId).toBe(""));
  it("una categoría sin tallas configuradas solo ofrece «Única»", () =>
    expect(arranqueDeCorreccion({ ...anotado, categoriaId: "bolsos", tallaId: "u" }, listas).tallaId).toBe("u"));
  it("un color que ya no está arranca vacío", () => expect(arranqueDeCorreccion({ ...anotado, colorCodigo: "XXX" }, listas).colorCodigo).toBe(""));
});

describe("cambioEnCorreccion", () => {
  it("lo mismo que estaba no es un cambio", () => expect(cambioEnCorreccion(anotado, anotado)).toBe(false));
  it("espacios en los bordes de la descripción no son un cambio", () =>
    expect(cambioEnCorreccion(anotado, { ...anotado, descripcion: `  ${anotado.descripcion} ` })).toBe(false));
  it.each([
    ["categoría", { categoriaId: "bolsos" }],
    ["talla", { tallaId: "s" }],
    ["color", { colorCodigo: "NEG" }],
    ["descripción", { descripcion: "Blusa negra" }],
  ])("cambiar la %s sí es un cambio", (_, cambio) => expect(cambioEnCorreccion(anotado, { ...anotado, ...cambio })).toBe(true));
});

describe("errorDeCorreccion", () => {
  it("ya regularizada o anulada: lo dice y relee", () => expect(errorDeCorreccion("prenda_no_corregible")?.releer).toBe(true));
  it("datos inválidos: no relee (la persona corrige en la hoja)", () => expect(errorDeCorreccion("prenda_datos_invalidos")?.releer).toBe(false));
  it("otro error queda para traducirError", () => expect(errorDeCorreccion("JWT expired")).toBeNull());
});

describe("lineaDeCorreccion", () => {
  it("una vez, con lo que anotó caja", () =>
    expect(lineaDeCorreccion({ veces: 1, ultimaPor: "Micaela", original: "Blusa beige" }, "9 oct")).toBe("Corregido por Micaela el 9 oct · caja anotó «Blusa beige»"));
  it("varias veces lo dice", () => expect(lineaDeCorreccion({ veces: 3, ultimaPor: "Ana", original: "" }, "9 oct")).toBe("Corregido por Ana el 9 oct (3 veces)"));
});
