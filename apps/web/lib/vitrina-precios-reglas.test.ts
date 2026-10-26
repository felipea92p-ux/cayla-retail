import { describe, expect, it } from "vitest";
import { lineaSinElegirTienda, preciosDelModeloDeJson, textoDePrecio, type PreciosDelModelo } from "./vitrina-precios-reglas";

const nbsp = " ";
const TRU = { id: "t", nombre: "Tienda Trujillo", se_ofrece: true, precio: 99.9, precio_final: 99.9, desde: false, campana: null };
const LIM = { id: "l", nombre: "Tienda Lima", se_ofrece: true, precio: "79.90", precio_final: "79.90", desde: false, campana: null };
const TODAS = { se_ofrece: true, precio: 99.9, precio_final: 99.9, desde: false, campana: null };

describe("leer lo que devuelve fn_vitrina_precios_modelo", () => {
  it("lee cada tienda y «Todas», con los números que llegan como texto", () => {
    const p = preciosDelModeloDeJson({ sedes: [LIM, TRU], todas: TODAS })!;
    expect(p.sedes.map((s) => [s.nombre, s.seOfrece, s.precio, s.precioFinal])).toEqual([
      ["Tienda Lima", true, 79.9, 79.9],
      ["Tienda Trujillo", true, 99.9, 99.9],
    ]);
    expect(p.todas).toMatchObject({ seOfrece: true, precio: 99.9 });
  });

  it("una tienda que no ofrece el modelo no trae precio, aunque venga uno suelto", () => {
    const p = preciosDelModeloDeJson({ sedes: [{ ...TRU, se_ofrece: false, precio: 50, precio_final: 50 }], todas: { ...TODAS, se_ofrece: false, precio: null, precio_final: null } })!;
    expect(p.sedes[0]).toMatchObject({ seOfrece: false, precio: null, precioFinal: null });
    expect(p.todas.seOfrece).toBe(false);
  });

  it("dice se_ofrece pero sin precio: no se inventa uno", () => {
    expect(preciosDelModeloDeJson({ sedes: [{ ...TRU, precio: null, precio_final: null }], todas: TODAS })!.sedes[0]!.seOfrece).toBe(false);
  });

  it("sin la forma esperada (o una respuesta de otra versión) devuelve null y no se cae", () => {
    for (const malo of [null, undefined, 3, "x", [], {}, { sedes: "no" }]) expect(preciosDelModeloDeJson(malo)).toBeNull();
  });

  it("sin «todas» queda como «no se ofrece»; una tienda rara se descarta sin romper la lista", () => {
    const p = preciosDelModeloDeJson({ sedes: [TRU, 7, null, LIM] })!;
    expect(p.sedes).toHaveLength(2);
    expect(p.todas.seOfrece).toBe(false);
  });
});

describe("cómo se dice el precio de una tienda", () => {
  const leer = (s: object) => preciosDelModeloDeJson({ sedes: [s], todas: TODAS })!.sedes[0]!;

  it("sin campaña: el precio, solo", () => {
    expect(textoDePrecio(leer(TRU))).toEqual({ principal: `S/${nbsp}99.90`, tachado: null, campana: null });
  });

  it("con campaña: lo que paga, el de lista tachado y la campaña con su % y su último día", () => {
    const t = textoDePrecio(leer({ ...TRU, precio: 79.9, precio_final: 63.9, campana: { nombre: "Cyber", pct: 20, hasta: "2026-10-31" } }));
    expect(t.principal).toBe(`S/${nbsp}63.90`);
    expect(t.tachado).toBe(`S/${nbsp}79.90`);
    expect(t.campana).toMatch(/^Cyber · −20 % · hasta el 31/);
  });

  it("«Desde»: la campaña no toca a todas las tallas por igual", () => {
    expect(textoDePrecio(leer({ ...TRU, precio: 79.9, precio_final: 63.9, desde: true, campana: { nombre: "Cyber", pct: 20, hasta: null } })).principal).toBe(`Desde S/${nbsp}63.90`);
  });

  it("una campaña que no baja nada no se nombra ni tacha nada", () => {
    const t = textoDePrecio(leer({ ...TRU, campana: { nombre: "Cyber", pct: 20, hasta: null } }));
    expect(t).toEqual({ principal: `S/${nbsp}99.90`, tachado: null, campana: null });
  });

  it("una tienda sin precio dice que no lo ofrece", () => {
    expect(textoDePrecio(leer({ ...TRU, se_ofrece: false })).principal).toBe("No se ofrece: sin precio en esta tienda");
  });
});

describe("la línea de quien no elige tienda", () => {
  const de = (sedes: object[], todas: object = TODAS): PreciosDelModelo => preciosDelModeloDeJson({ sedes, todas })!;

  it("con precios distintos entre tiendas, dice cuál ve: el mayor", () => {
    expect(lineaSinElegirTienda(de([TRU, LIM]))).toBe(`Sin elegir tienda, el cliente ve el mayor: S/${nbsp}99.90.`);
  });

  it("con el mismo precio en todas, o con una sola tienda, no hay nada que decir", () => {
    expect(lineaSinElegirTienda(de([TRU, { ...LIM, precio: 99.9, precio_final: 99.9 }]))).toBeNull();
    expect(lineaSinElegirTienda(de([TRU]))).toBeNull();
  });

  it("si solo una tienda lo ofrece, «todas» es ese mismo precio: tampoco se dice", () => {
    expect(lineaSinElegirTienda(de([TRU, { ...LIM, se_ofrece: false }]))).toBeNull();
  });

  it("si nadie lo ofrece, no hay línea", () => {
    expect(lineaSinElegirTienda(de([{ ...TRU, se_ofrece: false }, { ...LIM, se_ofrece: false }], { ...TODAS, se_ofrece: false, precio: null }))).toBeNull();
  });
});
