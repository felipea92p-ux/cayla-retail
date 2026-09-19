import { describe, expect, it } from "vitest";
import { chipEntregas, claveRubro, ordenarProveedores, rubrosConConteo, siguienteOrden, subeEnCadaCompra, urlWhatsApp, variacionCosto } from "./proveedores-reglas";

describe("rubros", () => {
  it("«Tela», «tela » y «Telas ¹» se agrupan por clave, sin tildes ni mayúsculas", () => {
    expect(claveRubro("  Prénda  Terminada ")).toBe("prenda terminada");
    const r = rubrosConConteo([{ rubro: "Tela" }, { rubro: "tela " }, { rubro: "Avíos" }, { rubro: null }, { rubro: "Tela" }]);
    expect(r).toEqual([
      { clave: "tela", etiqueta: "Tela", conteo: 3 },
      { clave: "avios", etiqueta: "Avíos", conteo: 1 },
    ]);
  });
});

describe("ordenarProveedores", () => {
  const ps = [
    { nombre: "B", saldo: 100, facturado_12m: 50, ultima_compra: "2026-09-10" },
    { nombre: "A", saldo: null, facturado_12m: null, ultima_compra: null },
    { nombre: "C", saldo: 300, facturado_12m: 10, ultima_compra: "2026-09-15" },
  ];
  it("por saldo descendente, los vacíos siempre al final", () => {
    expect(ordenarProveedores(ps, { campo: "saldo", dir: "desc" }).map((p) => p.nombre)).toEqual(["C", "B", "A"]);
    expect(ordenarProveedores(ps, { campo: "saldo", dir: "asc" }).map((p) => p.nombre)).toEqual(["B", "C", "A"]);
  });
  it("por última compra (fecha) y por nombre", () => {
    expect(ordenarProveedores(ps, { campo: "ultima", dir: "desc" }).map((p) => p.nombre)).toEqual(["C", "B", "A"]);
    expect(ordenarProveedores(ps, { campo: "nombre", dir: "asc" }).map((p) => p.nombre)).toEqual(["A", "B", "C"]);
  });
  it("no muta la lista original", () => {
    ordenarProveedores(ps, { campo: "saldo", dir: "desc" });
    expect(ps[0].nombre).toBe("B");
  });
  it("siguienteOrden invierte el mismo campo y arranca en lo mayor primero", () => {
    expect(siguienteOrden({ campo: "saldo", dir: "desc" }, "saldo")).toEqual({ campo: "saldo", dir: "asc" });
    expect(siguienteOrden({ campo: "saldo", dir: "desc" }, "facturado")).toEqual({ campo: "facturado", dir: "desc" });
    expect(siguienteOrden({ campo: "saldo", dir: "desc" }, "nombre")).toEqual({ campo: "nombre", dir: "asc" });
  });
});

describe("chipEntregas", () => {
  it("atrasadas > por recibir > al día; sin compras, nada", () => {
    expect(chipEntregas({ facturas: 3, facturas_atrasadas: 2, entregas_por_recibir: 2 })).toEqual({ tono: "ambar", texto: "2 atrasadas" });
    expect(chipEntregas({ facturas: 1, facturas_atrasadas: 1, entregas_por_recibir: 1 })).toEqual({ tono: "ambar", texto: "1 atrasada" });
    expect(chipEntregas({ facturas: 2, facturas_atrasadas: 0, entregas_por_recibir: 1 })).toEqual({ tono: "neutro", texto: "1 por recibir" });
    expect(chipEntregas({ facturas: 2, facturas_atrasadas: 0, entregas_por_recibir: 0 })).toEqual({ tono: "verde", texto: "Al día" });
    expect(chipEntregas({ facturas: 0, facturas_atrasadas: 0, entregas_por_recibir: 0 })).toBeNull();
    expect(chipEntregas({ facturas: null, facturas_atrasadas: null, entregas_por_recibir: null })).toBeNull();
  });
});

describe("urlWhatsApp", () => {
  it("móvil peruano de 9 dígitos, con o sin 51, con espacios o guiones", () => {
    expect(urlWhatsApp("987 654 321")).toBe("https://wa.me/51987654321");
    expect(urlWhatsApp("+51 987-654-321")).toBe("https://wa.me/51987654321");
  });
  it("fijos, vacíos o raros: sin enlace", () => {
    expect(urlWhatsApp("01 456 7890")).toBeNull();
    expect(urlWhatsApp("")).toBeNull();
    expect(urlWhatsApp(null)).toBeNull();
    expect(urlWhatsApp("12345")).toBeNull();
  });
});

describe("costo", () => {
  it("variación del primero al último; sin dos puntos, nada", () => {
    expect(variacionCosto([46, 48, 50])).toBe(8.7);
    expect(variacionCosto([50, 48])).toBe(-4);
    expect(variacionCosto([50])).toBeNull();
  });
  it("«sube en cada compra» solo si de verdad sube siempre", () => {
    expect(subeEnCadaCompra([46, 48, 50])).toBe(true);
    expect(subeEnCadaCompra([46, 50, 48])).toBe(false);
    expect(subeEnCadaCompra([46])).toBe(false);
  });
});
