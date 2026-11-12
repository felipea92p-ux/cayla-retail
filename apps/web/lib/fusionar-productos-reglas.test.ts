import { describe, expect, it } from "vitest";
import {
  ELECCIONES_VACIAS,
  camposAElegir,
  camposDeLaGuia,
  eleccionesParaLaBase,
  fechaDeAlta,
  fotosEnOrden,
  frasesDelResumen,
  leerPlan,
  motivoSugerido,
  opcionesDeCampo,
  quedaSugerido,
  textoVentas,
  valorDeCampo,
} from "./fusionar-productos-reglas";

// La forma que devuelve `previsualizar_fusion_productos` (20261112205000), recortada a lo que usa la hoja.
const PLAN = {
  ok: true,
  productos: [
    {
      id: "A", queda: true, referencia: "Blusa Emma", codigo: "BLU-0042", version: 3, estado: "activo", creado_en: "2026-10-01T15:00:00Z",
      descripcion: null, temporada: "verano", categoria: { id: "c1", nombre: "Camisas y Blusas", prefijo: "BLU", familia: "superior" },
      marca: { id: "m1", nombre: "CAYLA" }, proveedor: { id: "p1", nombre: "Taller" }, tejido: { id: null, nombre: null }, patron: { id: null, nombre: null },
      unidades_vendidas: 4, ventas: 3, stock: 20, variantes: 6, precio: 79.9, precios: [79.9], costo: 32, costo_de_compras: true,
      fotos: [{ id: "f2", url: "https://x/2.jpg", color_codigo: null, es_principal: false }, { id: "f1", url: "https://x/1.jpg", color_codigo: "NEG", es_principal: true }],
    },
    {
      id: "B", queda: false, referencia: "Capa Emma", codigo: "CAP-0007", version: 1, estado: "activo", creado_en: "2026-11-05T15:00:00Z",
      descripcion: "Dos piezas", temporada: "verano", categoria: { id: "c2", nombre: "Casacas", prefijo: "CAS", familia: "superior" },
      marca: { id: "m1", nombre: "CAYLA" }, proveedor: { id: "p1", nombre: "Taller" }, tejido: { id: null, nombre: null }, patron: { id: null, nombre: null },
      unidades_vendidas: 1, ventas: 1, stock: 5, variantes: 2, precio: 89, precios: [89, 99], costo: null, costo_de_compras: false,
      fotos: [{ id: "f3", url: "https://x/3.jpg", color_codigo: null, es_principal: true }],
    },
  ],
  variantes: [
    { variante_id: "v1", producto_id: "B", talla: "M", color: "Negro", color_hex: "#000", stock: 3, trato: "junta", con_variante_id: "w1" },
    { variante_id: "v2", producto_id: "B", talla: "XL", color: "Negro", color_hex: "#000", stock: 2, trato: "muda", con_variante_id: null },
  ],
  resumen: { mudan: 1, juntan: 1, unidades_juntadas: 3, unidades_que_llegan: 5, fotos_duplicados: 1 },
  diferencias: ["referencia", "descripcion", "categoria", "precio"],
  bloqueos: [],
  avisos: [{ codigo: "se_suman", mensaje: "Se suman." }],
};

describe("leerPlan", () => {
  it("traduce el plan de la base a nombres de la web", () => {
    const p = leerPlan(PLAN);
    expect(p.ok).toBe(true);
    expect(p.productos.map((x) => [x.id, x.queda, x.unidadesVendidas, x.stock])).toEqual([["A", true, 4, 20], ["B", false, 1, 5]]);
    expect(p.variantes.map((v) => v.trato)).toEqual(["junta", "muda"]);
    expect(p.resumen).toEqual({ mudan: 1, juntan: 1, unidadesJuntadas: 3, unidadesQueLlegan: 5, fotosDuplicados: 1 });
    expect(p.productos[1].costo).toBeNull();
  });

  it("un plan con bloqueo de entrada (sin duplicados) no rompe: lo demás sale vacío", () => {
    const p = leerPlan({ ok: false, bloqueos: [{ codigo: "sin_duplicados", mensaje: "Elige…" }] });
    expect(p.productos).toEqual([]);
    expect(p.bloqueos[0].codigo).toBe("sin_duplicados");
    expect(leerPlan(null).ok).toBe(false);
  });
});

describe("cuál queda (decisión 1)", () => {
  const ps = leerPlan(PLAN).productos;
  it("propone el que más vendió", () => expect(quedaSugerido(ps)).toBe("A"));
  it("con las mismas ventas, el más antiguo", () => {
    expect(quedaSugerido([{ id: "N", unidadesVendidas: 0, creadoEn: "2026-11-01" }, { id: "V", unidadesVendidas: 0, creadoEn: "2026-09-01" }])).toBe("V");
  });
  it("dice por qué, o nada si no hay qué destacar", () => {
    expect(motivoSugerido(ps, "A")).toBe("El que más vendió");
    expect(motivoSugerido(ps, "B")).toBeNull();
    expect(motivoSugerido([{ id: "N", unidadesVendidas: 0, creadoEn: "2026-11-01" }, { id: "V", unidadesVendidas: 0, creadoEn: "2026-09-01" }], "V")).toBe("El más antiguo");
    expect(quedaSugerido([])).toBeNull();
  });
  it("muestra las ventas y la fecha de alta en palabras de tienda", () => {
    expect(textoVentas({ unidadesVendidas: 0 })).toBe("Sin ventas");
    expect(textoVentas({ unidadesVendidas: 1 })).toBe("Vendió 1 prenda");
    expect(textoVentas({ unidadesVendidas: 12 })).toBe("Vendió 12 prendas");
    expect(fechaDeAlta("2026-10-01T15:00:00Z")).toMatch(/^Creado el 1 .*2026$/);
    expect(fechaDeAlta("no-es-fecha")).toBe("");
  });
});

describe("lo que es distinto (decisión 8)", () => {
  const plan = leerPlan(PLAN);
  it("solo los campos que difieren, en el orden en que se leen", () => {
    expect(camposAElegir(plan.diferencias)).toEqual(["referencia", "categoria", "precio", "descripcion"]);
  });
  it("cada opción muestra el valor de ese producto; el que queda va primero", () => {
    expect(opcionesDeCampo(plan.productos, "categoria")).toEqual([
      { productoId: "A", valor: "Camisas y Blusas" },
      { productoId: "B", valor: "Casacas" },
    ]);
    expect(valorDeCampo(plan.productos[1], "precio")).toBe("S/\u00a089.00 (varía por talla)");
    expect(valorDeCampo(plan.productos[0], "descripcion")).toBe("Sin descripción");
  });
  it("dos productos con el mismo valor dan una sola opción", () => {
    expect(opcionesDeCampo(plan.productos, "marca_proveedor")).toHaveLength(1);
  });
});

describe("lo que se manda a la base", () => {
  const plan = leerPlan(PLAN);
  it("sin tocar nada: el precio del que queda (difieren), sin costo (no difiere), sin fotos", () => {
    expect(eleccionesParaLaBase(ELECCIONES_VACIAS, plan.productos, plan.diferencias, "A")).toEqual({ campos: {}, precio: 79.9 });
  });
  it("lo elegido: nombre y categoría del duplicado, su precio, y las fotos en orden", () => {
    const e = { campos: { referencia: "B", categoria: "B" }, precioDe: "B", costoDe: null, fotos: ["f3", "f1", "zz"] };
    expect(eleccionesParaLaBase(e, plan.productos, plan.diferencias, "A")).toEqual({
      campos: { referencia: "B", categoria: "B" },
      precio: 89,
      fotos: ["f3", "f1"],
    });
  });
  it("un campo de un producto que ya salió de la fusión se suelta", () => {
    const e = { ...ELECCIONES_VACIAS, campos: { referencia: "Z" } };
    expect(eleccionesParaLaBase(e, plan.productos, [], "A")).toEqual({ campos: {} });
  });
});

describe("fotos y resumen", () => {
  const plan = leerPlan(PLAN);
  it("las fotos: primero las del que queda, su principal adelante", () => {
    expect(fotosEnOrden(plan.productos).map((f) => f.id)).toEqual(["f1", "f2", "f3"]);
  });
  it("el resumen habla de tallas, prendas y fotos, nunca de variantes", () => {
    const frases = frasesDelResumen(plan, 2);
    expect(frases).toEqual([
      "1 talla y color pasa tal cual, con su stock y sus ventas.",
      "1 talla y color ya existe en el que queda: se juntan y 3 prendas se suman a su stock.",
      "En total llegan 5 prendas en stock; no se pierde ninguna.",
      "La prenda vendida de la ficha repetida cuenta en el que queda.",
      "Quedan 2 fotos en el producto; las demás se guardan en la ficha repetida.",
      "Las etiquetas ya impresas siguen sirviendo al escanearlas.",
    ]);
    expect(frases.join(" ")).not.toMatch(/variante|mud/i);
  });
});

describe("guía de foco (ADR-0284)", () => {
  it("falta la ficha repetida y quién la hace; lo distinto es sugerido, nunca un candado", () => {
    const c = camposDeLaGuia({ duplicados: 0, queda: "A", hayDiferencias: true, responsableListo: false });
    expect(c.filter((x) => x.requerido && !x.hecho).map((x) => x.id)).toEqual(["duplicados", "responsable"]);
    expect(c.find((x) => x.id === "diferencias")).toMatchObject({ requerido: false, sugerido: true });
  });
  it("sin diferencias no hay paso de diferencias", () => {
    expect(camposDeLaGuia({ duplicados: 1, queda: "A", hayDiferencias: false, responsableListo: true }).map((x) => x.id)).toEqual([
      "duplicados", "queda", "responsable",
    ]);
  });
});
