import { describe, expect, it } from "vitest";
import {
  COBERTURA_DESTINO_DIAS,
  coberturaDelDestino,
  destinoParaEnviar,
  esDestinoPosible,
  loQueLlevaElEnvio,
  razonTiendaSinLeer,
  textoPuedesMandar,
  tiendasSinLeer,
  VENDIDAS_PARA_ENVIAR,
} from "./analisis-enviar";

// Datos inventados (el repo es público): tiendas y cifras de mentira.
const otra = (sedeId: string, vendidas30: number, stock: number, sinLeer = false) => ({ sedeId, vendidas30, stock, ...(sinLeer ? { sinLeer: true } : {}) });

describe("cuánta cobertura le queda a la tienda a la que se le manda", () => {
  it("días de stock a su propio ritmo; 0 si no tiene; sin ritmo o sin leer, no se sabe", () => {
    // Vendió 30 en 30 días = 1 por día: 10 de stock duran 10 días.
    expect(coberturaDelDestino(otra("a", 30, 10))).toBe(10);
    expect(coberturaDelDestino(otra("a", 6, 3))).toBe(15);
    expect(coberturaDelDestino(otra("a", 3, 0))).toBe(0);
    expect(coberturaDelDestino(otra("a", 0, 5))).toBeNull();
    expect(coberturaDelDestino(otra("a", 5, 2, true))).toBeNull();
  });
});

describe("a qué tienda sirve mandarle (D10)", () => {
  it("vendió 2 o más y le queda poca cobertura: justo en los límites", () => {
    expect(VENDIDAS_PARA_ENVIAR).toBe(2);
    expect(COBERTURA_DESTINO_DIAS).toBe(30);
    expect(esDestinoPosible(otra("a", 1, 0))).toBe(false);
    expect(esDestinoPosible(otra("a", 2, 0))).toBe(true);
    // 3 vendidas en 30 días = 0,1 por día. 2 de stock = 20 días (poca); 3 de stock = 30 días justos (ya no es poca); 4 = 40.
    expect(esDestinoPosible(otra("a", 3, 2))).toBe(true);
    expect(esDestinoPosible(otra("a", 3, 3))).toBe(false);
    expect(esDestinoPosible(otra("a", 3, 4))).toBe(false);
  });

  it("una tienda que ya tiene de sobra no recibe más aunque venda", () => {
    expect(destinoParaEnviar([otra("aqp", 5, 20)])).toBeNull();
  });

  it("una tienda que no se pudo leer nunca es destino, aunque diga que vendió", () => {
    expect(esDestinoPosible(otra("aqp", 9, 0, true))).toBe(false);
    expect(destinoParaEnviar([otra("aqp", 9, 0, true)])).toBeNull();
  });

  it("entre dos destinos que sirven, la que más vendió", () => {
    expect(destinoParaEnviar([otra("aqp", 3, 0), otra("lim", 5, 0)])?.sedeId).toBe("lim");
  });

  it("a igual venta, la que tiene MENOS stock (antes, la que más tenía)", () => {
    expect(destinoParaEnviar([otra("aqp", 6, 4), otra("lim", 6, 1)])?.sedeId).toBe("lim");
    expect(destinoParaEnviar([otra("lim", 6, 1), otra("aqp", 6, 4)])?.sedeId).toBe("lim");
  });

  it("a igual venta y stock, siempre la misma (por el id): no cambia de un día a otro", () => {
    expect(destinoParaEnviar([otra("lim", 6, 1), otra("aqp", 6, 1)])?.sedeId).toBe("aqp");
  });

  it("si la que más vendió ya está cubierta y otra no, va a la otra", () => {
    expect(destinoParaEnviar([otra("aqp", 9, 40), otra("lim", 3, 0)])?.sedeId).toBe("lim");
  });

  it("ninguna sirve → null; sin tiendas → null", () => {
    expect(destinoParaEnviar([otra("aqp", 1, 0), otra("lim", 0, 0)])).toBeNull();
    expect(destinoParaEnviar([])).toBeNull();
  });
});

describe("las tiendas que no se pudieron leer", () => {
  it("se listan; y se dicen en palabras de tienda, sin inventar", () => {
    expect(tiendasSinLeer([otra("aqp", 0, 0, true), otra("lim", 3, 1)])).toEqual(["aqp"]);
    expect(tiendasSinLeer([otra("aqp", 0, 0), otra("lim", 3, 1)])).toEqual([]);
    const nombre = (id: string) => ({ aqp: "Arequipa", lim: "Lima" })[id] ?? id;
    expect(razonTiendaSinLeer(["aqp"], nombre)).toBe("No se pudo leer Arequipa: no se sabe si allá se vende.");
    expect(razonTiendaSinLeer(["aqp", "lim"], nombre)).toBe("No se pudo leer Arequipa y Lima: no se sabe si en esas tiendas se vende.");
  });
});

describe("lo que lleva el envío: solo lo que el destino vendió y está en el almacén", () => {
  const talla = (varianteId: string, piso: number, almacen: number, aqp: number, lim = 0) => ({ varianteId, piso, almacen, otras: [otra("aqp", aqp, 0), otra("lim", lim, 0)] });

  it("una talla que el destino no vendió no viaja (antes «una de cada»)", () => {
    const m = [talla("s", 0, 2, 3), talla("m", 0, 2, 0), talla("l", 0, 1, 1)];
    const r = loQueLlevaElEnvio(m, "aqp");
    expect(r.tallas.map((t) => t.varianteId)).toEqual(["s", "l"]);
    expect(r.movibles).toBe(3);
    expect(r.deLoVendido).toBe(3);
  });

  it("lo que está en el piso no se manda (el traslado solo saca del almacén): se cuenta para decir «puedes mandar 3 de 12»", () => {
    const m = [talla("s", 5, 0, 3), talla("m", 4, 3, 2)];
    const r = loQueLlevaElEnvio(m, "aqp");
    expect(r.tallas.map((t) => t.varianteId)).toEqual(["m"]);
    expect(r.movibles).toBe(3);
    expect(r.deLoVendido).toBe(12);
    expect(textoPuedesMandar(r.movibles, r.deLoVendido)).toBe("Puedes mandar 3 de 12: las otras están en el piso, sácalas primero.");
  });

  it("todo en el piso: ninguna se puede mandar hoy, y no se abre un traslado vacío", () => {
    const r = loQueLlevaElEnvio([talla("s", 5, 0, 3)], "aqp");
    expect(r.tallas).toEqual([]);
    expect(r.movibles).toBe(0);
    expect(textoPuedesMandar(0, 5)).toBe("No puedes mandar las 5 hoy: están en el piso, sácalas primero.");
    expect(textoPuedesMandar(0, 1)).toBe("No puedes mandar la 1 hoy: está en el piso, sácala primero.");
  });

  it("un modelo trae sus tallas adentro (`variantes`) y se cuentan todas", () => {
    const modelo = { varianteId: "m1", piso: 0, almacen: 3, otras: [], variantes: [talla("s", 0, 2, 3), talla("m", 1, 1, 0)] };
    const r = loQueLlevaElEnvio([modelo], "aqp");
    expect(r.tallas.map((t) => t.varianteId)).toEqual(["s"]);
    expect(r.deLoVendido).toBe(2);
  });

  it("se puede mandar todo → no hay nada que decir; sin nada que el destino vendiera → tampoco", () => {
    expect(textoPuedesMandar(3, 3)).toBe("");
    expect(textoPuedesMandar(0, 0)).toBe("");
    expect(textoPuedesMandar(1, 2)).toBe("Puedes mandar 1 de 2: la otra está en el piso, sácala primero.");
  });

  it("una talla que ya no tiene nada aquí no cuenta", () => {
    expect(loQueLlevaElEnvio([talla("s", 0, 0, 5)], "aqp")).toEqual({ tallas: [], movibles: 0, deLoVendido: 0 });
  });
});
