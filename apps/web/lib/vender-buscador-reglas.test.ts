import { describe, expect, it } from "vitest";
import { accionDelEnter, buscarVendiblePrimero } from "./vender-buscador-reglas";
import { motivoNoCobrable } from "./vender-stock-local";
import type { PrendaBuscableV2 } from "./buscar-prenda-v2";

type V = PrendaBuscableV2 & { stockAqui: number; almacenAqui?: number | null };
const prenda = (p: Partial<V>): V => ({
  varianteId: "v",
  sku: "SKU",
  referencia: "Camisa Lara",
  talla: "STD",
  color: "Rosado",
  codigosBarras: [],
  stockAqui: 1,
  ...p,
});

const catalogo = [
  prenda({ varianteId: "ros", sku: "CMS-0011-ROS-STD", stockAqui: 1 }),
  prenda({ varianteId: "bei", sku: "CMS-0011-BEI-STD", color: "Beige", stockAqui: 0, almacenAqui: 3 }),
  prenda({ varianteId: "cel", sku: "CMS-0011-CEL-STD", color: "Celeste", stockAqui: 0 }),
];
const lista = (texto: string) => buscarVendiblePrimero(texto, catalogo, 10);

describe("el Enter del campo de escaneo de Vender (accionDelEnter)", () => {
  it("campo vacío: no hay nada que resolver ni que limpiar", () => {
    expect(accionDelEnter("", catalogo, lista(""), 0)).toBeNull();
    expect(accionDelEnter("   ", catalogo, lista("   "), 0)).toBeNull();
  });

  it("un código exacto elige esa prenda, aunque la lista resalte otra primero", () => {
    const a = accionDelEnter("CMS-0011-CEL-STD", catalogo, lista("CMS-0011"), 0);
    expect(a).toMatchObject({ tipo: "exacta" });
    expect(a?.tipo === "exacta" && a.variante.varianteId).toBe("cel");
  });

  it("el código que escribió la pistola con apóstrofos también es exacto", () => {
    const a = accionDelEnter("CMS'0011'ROS'STD", catalogo, lista("CMS'0011'ROS'STD"), 0);
    expect(a?.tipo === "exacta" && a.variante.varianteId).toBe("ros");
  });

  it("lo tecleado a medias elige la fila resaltada, con lo vendible arriba", () => {
    const a = accionDelEnter("cms-0011", catalogo, lista("cms-0011"), 0);
    expect(a?.tipo).toBe("resaltada");
    expect(a?.tipo === "resaltada" && a.variante.varianteId).toBe("ros"); // la única con piso va primero
  });

  it("un `activo` fuera de la lista no rompe: se queda con la primera o la última", () => {
    const r = lista("cms-0011");
    const id = (activo: number) => {
      const a = accionDelEnter("cms-0011", catalogo, r, activo);
      return a?.tipo === "resaltada" ? a.variante.varianteId : null;
    };
    expect(id(99)).toBe(r[r.length - 1].varianteId);
    expect(id(-4)).toBe(r[0].varianteId);
  });

  it("un código que no es de ninguna prenda: no-encontrada, con el código tal cual llegó", () => {
    expect(accionDelEnter("  CMS-9999-XXX-STD ", catalogo, lista("CMS-9999-XXX-STD"), 0)).toEqual({ tipo: "no-encontrada", texto: "CMS-9999-XXX-STD" });
  });
});

describe("escanear entra al ticket solo si hay en el piso (accionDelEnter + motivoNoCobrable)", () => {
  const alEscanear = (codigo: string) => {
    const a = accionDelEnter(codigo, catalogo, lista(codigo), 0);
    if (!a || a.tipo === "no-encontrada") return "no-encontrada";
    return motivoNoCobrable(a.variante);
  };

  it("con piso: entra", () => {
    expect(alEscanear("CMS-0011-ROS-STD")).toBe("cobrable");
  });
  it("sin piso pero en el almacén de la tienda: no entra, y el motivo dice que está en el almacén", () => {
    expect(alEscanear("CMS-0011-BEI-STD")).toBe("en_almacen");
  });
  it("sin nada: no entra", () => {
    expect(alEscanear("CMS-0011-CEL-STD")).toBe("agotada");
  });
  it("un código desconocido no entra", () => {
    expect(alEscanear("CMS-9999-XXX-STD")).toBe("no-encontrada");
  });
});
