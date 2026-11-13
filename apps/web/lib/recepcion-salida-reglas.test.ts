import { describe, expect, it } from "vitest";
import { argsLlevarAlStock, diasAMedias, leerEnviosAMedias, textoDeEnvioAMedias, textoYaEnStock, leerResultadoDeSalida, leerSalidas, loQueSale, ultimaSalidaDe, urlBajarDeLaTanda, urlEtiquetasDeLaTanda } from "./recepcion-salida-reglas";

const sumas = { contado: 4, invalidas: 0, danadasInvalidas: 0, danadasDeMas: [] as string[] };

describe("loQueSale", () => {
  it("sale lo repartido, aunque no sea todo lo contado", () => {
    expect(loQueSale(sumas, 10, false)).toBe(4);
    expect(loQueSale(sumas, 4, false)).toBe(4);
  });
  it("nada de más, sin repartir, mal escrito ni con dañadas a medio decir", () => {
    expect(loQueSale(sumas, 3, false)).toBe(0);
    expect(loQueSale({ ...sumas, contado: 0 }, 10, false)).toBe(0);
    expect(loQueSale({ ...sumas, invalidas: 1 }, 10, false)).toBe(0);
    expect(loQueSale({ ...sumas, danadasInvalidas: 1 }, 10, false)).toBe(0);
    expect(loQueSale({ ...sumas, danadasDeMas: ["v"] }, 10, false)).toBe(0);
    expect(loQueSale(sumas, 10, true)).toBe(0);
  });
});

describe("argsLlevarAlStock", () => {
  const base = { despachoId: "d", productoId: "p", versionConteo: 3, costo: null, confirma: false, token: "t" };
  const variantes = [{ varianteId: "v", cantidad: 2, danadas: 0, solucion: "pendiente" }];
  it("una línea va por su id y lo de fuera de la guía por su posición, nunca los dos", () => {
    expect(argsLlevarAlStock({ ...base, despachoItemId: "i", extraPosicion: 2, variantes })).toMatchObject({ p_despacho_item_id: "i", p_extra_posicion: null });
    expect(argsLlevarAlStock({ ...base, despachoItemId: null, extraPosicion: 2, variantes })).toMatchObject({ p_despacho_item_id: null, p_extra_posicion: 2 });
  });
  it("la solución solo acompaña a las dañadas", () => {
    expect(argsLlevarAlStock({ ...base, despachoItemId: "i", extraPosicion: null, variantes }).p_variantes[0].danada_solucion).toBeNull();
    expect(argsLlevarAlStock({ ...base, despachoItemId: "i", extraPosicion: null, variantes: [{ ...variantes[0], danadas: 1 }] }).p_variantes[0].danada_solucion).toBe("pendiente");
  });
});

describe("leer lo que responde la base", () => {
  it("una respuesta rara no se inventa", () => {
    expect(leerResultadoDeSalida(null)).toBeNull();
    expect(leerResultadoDeSalida({ salida_id: "s" })).toBeNull();
    expect(leerSalidas("nada")).toEqual([]);
  });
  it("lee la tanda y sus líneas", () => {
    expect(leerResultadoDeSalida({ salida_id: "s", unidades: 2, repetido: true, lineas: [{ variante_id: "v", cantidad: 2 }] })).toEqual({ salidaId: "s", unidades: 2, repetido: true, lineas: [{ varianteId: "v", cantidad: 2 }] });
    expect(leerSalidas([{ id: "s", producto_id: "p", prenda: "Polo", unidades: 2, quien: "Ana", creado_en: "x", lineas: [] }])[0]).toMatchObject({ id: "s", prenda: "Polo", quien: "Ana" });
  });
});

describe("después de salir", () => {
  const l = [{ varianteId: "v", cantidad: 2 }];
  it("las etiquetas y la bajada son de esa tanda", () => {
    expect(urlEtiquetasDeLaTanda(l, "e1")).toContain("unidades=");
    expect(urlEtiquetasDeLaTanda(l, "e1")).toContain("v");
    expect(urlBajarDeLaTanda(l, "e1")).toContain("lineas=");
  });
  // Felipe 2026-11-12: imprimía las etiquetas, volvía con la flecha y caía en Existencias, fuera del envío que estaba contando.
  it("las dos llevan el envío, para que su flecha vuelva a él", () => {
    expect(urlEtiquetasDeLaTanda(l, "e1")).toMatch(/[?&]envio=e1(&|$)/);
    expect(urlBajarDeLaTanda(l, "e1")).toMatch(/[?&]envio=e1(&|$)/);
    expect(urlBajarDeLaTanda([], "e1")).toBe("/inventario/bajar?envio=e1");
  });
  it("corrige lo último de esa prenda, sin importar mayúsculas", () => {
    const s = (id: string, prenda: string) => ({ id, productoId: "p", prenda, unidades: 1, quien: null, creadoEn: "", lineas: [] });
    expect(ultimaSalidaDe([s("1", "Polo"), s("2", "polo"), s("3", "Blusa")], "POLO")?.id).toBe("2");
    expect(ultimaSalidaDe([s("3", "Blusa")], "Polo")).toBeNull();
  });
});

describe("lo que quedó a medias", () => {
  const ahora = Date.parse("2026-11-04T12:00:00Z");
  const e = { id: "e", numero: "ENV-000012", sede: "Lima", enStock: 12, contadas: 70, desde: "2026-11-01T12:00:00Z" };
  it("cuenta los días y lo dice como lo lee Compras", () => {
    expect(diasAMedias(e.desde, ahora)).toBe(3);
    expect(textoDeEnvioAMedias(e, ahora)).toBe("ENV-000012: 12 de 70 ya en stock · se sigue recibiendo, desde hace 3 días");
    expect(textoDeEnvioAMedias({ ...e, desde: "2026-11-04T10:00:00Z" }, ahora)).toBe("ENV-000012: 12 de 70 ya en stock · se sigue recibiendo");
  });
  it("si el envío es de otra sede (el líder los ve a los 3 días), lo dice", () => {
    expect(textoDeEnvioAMedias(e, ahora, "Lima")).toBe("ENV-000012: 12 de 70 ya en stock · se sigue recibiendo, desde hace 3 días");
    expect(textoDeEnvioAMedias(e, ahora, "lima ")).not.toContain("va a");
    expect(textoDeEnvioAMedias(e, ahora, "Trujillo")).toBe("ENV-000012 · va a Lima: 12 de 70 ya en stock · se sigue recibiendo, desde hace 3 días");
    expect(textoDeEnvioAMedias({ ...e, sede: "" }, ahora, "Trujillo")).not.toContain("va a");
  });
  it("una respuesta rara no dibuja nada", () => {
    expect(leerEnviosAMedias(null)).toEqual([]);
    expect(leerEnviosAMedias([{ id: "e" }])).toEqual([]);
  });
});

describe("textoYaEnStock", () => {
  it("dice cuánto ya entró del envío que se sigue recibiendo", () => {
    expect(textoYaEnStock(32, 43)).toBe("32 en stock");
    expect(textoYaEnStock(1200, 1500)).toBe("1,200 en stock");
  });
  it("con todo adentro, «todas» (también si se contaron de más)", () => {
    expect(textoYaEnStock(43, 43)).toBe("todas en stock");
    expect(textoYaEnStock(45, 43)).toBe("todas en stock");
  });
  it("sin nada adentro, no dice nada", () => {
    expect(textoYaEnStock(0, 43)).toBeNull();
    expect(textoYaEnStock(Number.NaN, 43)).toBeNull();
  });
  it("sin total conocido, solo la cifra", () => {
    expect(textoYaEnStock(5, 0)).toBe("5 en stock");
  });
});
