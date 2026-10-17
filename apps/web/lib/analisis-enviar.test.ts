import { describe, expect, it } from "vitest";
import {
  COBERTURA_DESTINO_DIAS,
  coberturaDelDestino,
  destinoDeEnvio,
  leQuedaPoco,
  loQueLlevaElEnvio,
  razonTiendaSinLeer,
  textoPuedesMandar,
  tiendasSinLeer,
  VENDIDAS_PARA_ENVIAR,
} from "./analisis-enviar";

// Datos inventados (el repo es público): tiendas y cifras de mentira.
const otra = (sedeId: string, vendidas30: number, stock: number, sinLeer = false) => ({ sedeId, vendidas30, stock, ...(sinLeer ? { sinLeer: true } : {}) });
/** Una talla de mi tienda: lo que tengo y lo que cada otra tienda vendió y tiene de ESA talla. */
const talla = (varianteId: string, piso: number, almacen: number, otras: ReturnType<typeof otra>[]) => ({ varianteId, piso, almacen, otras });

describe("cuánta cobertura le queda a la tienda a la que se le manda", () => {
  it("días de stock a su propio ritmo; 0 si no tiene; sin ritmo o sin leer, no se sabe", () => {
    // Vendió 30 en 30 días = 1 por día: 10 de stock duran 10 días.
    expect(coberturaDelDestino(otra("a", 30, 10))).toBe(10);
    expect(coberturaDelDestino(otra("a", 6, 3))).toBe(15);
    expect(coberturaDelDestino(otra("a", 3, 0))).toBe(0);
    expect(coberturaDelDestino(otra("a", 0, 5))).toBeNull();
    expect(coberturaDelDestino(otra("a", 5, 2, true))).toBeNull();
  });

  it("le queda poco: justo en el límite de los 30 días", () => {
    expect(COBERTURA_DESTINO_DIAS).toBe(30);
    // 3 vendidas en 30 días = 0,1 por día. 2 de stock = 20 días (poco); 3 de stock = 30 días justos (ya no es poco); 4 = 40.
    expect(leQuedaPoco(otra("a", 3, 2))).toBe(true);
    expect(leQuedaPoco(otra("a", 3, 3))).toBe(false);
    expect(leQuedaPoco(otra("a", 3, 4))).toBe(false);
    expect(leQuedaPoco(otra("a", 9, 0, true))).toBe(false);
    expect(leQuedaPoco(otra("a", 0, 0))).toBe(false);
  });
});

describe("a qué tienda sirve mandarle (D10)", () => {
  const una = (...otras: ReturnType<typeof otra>[]) => talla("v1", 0, 2, otras);

  it("vendió 2 o más y le queda poco: justo en los límites", () => {
    expect(VENDIDAS_PARA_ENVIAR).toBe(2);
    expect(destinoDeEnvio(una(otra("a", 1, 0)))).toBeNull();
    expect(destinoDeEnvio(una(otra("a", 2, 0)))?.sedeId).toBe("a");
  });

  it("una tienda que ya tiene de sobra no recibe más aunque venda", () => {
    expect(destinoDeEnvio(una(otra("aqp", 5, 20)))).toBeNull();
  });

  it("una tienda que no se pudo leer nunca es destino, aunque diga que vendió", () => {
    expect(destinoDeEnvio(una(otra("aqp", 9, 0, true)))).toBeNull();
  });

  it("entre dos destinos que sirven, la que más vendió; a igual venta, la que tiene MENOS stock; a igual todo, el id", () => {
    expect(destinoDeEnvio(una(otra("aqp", 3, 0), otra("lim", 5, 0)))?.sedeId).toBe("lim");
    expect(destinoDeEnvio(una(otra("aqp", 6, 4), otra("lim", 6, 1)))?.sedeId).toBe("lim");
    expect(destinoDeEnvio(una(otra("lim", 6, 1), otra("aqp", 6, 4)))?.sedeId).toBe("lim");
    expect(destinoDeEnvio(una(otra("lim", 6, 1), otra("aqp", 6, 1)))?.sedeId).toBe("aqp");
  });

  it("si la que más vendió ya está cubierta y otra no, va a la otra; si ninguna sirve, null", () => {
    expect(destinoDeEnvio(una(otra("aqp", 9, 40), otra("lim", 3, 0)))?.sedeId).toBe("lim");
    expect(destinoDeEnvio(una(otra("aqp", 1, 0), otra("lim", 0, 0)))).toBeNull();
    expect(destinoDeEnvio(una())).toBeNull();
  });

  it("un destino que vendió talla que aquí no hay (o ya no tengo) no cuenta: no hay nada que mandarle (revisión de B2)", () => {
    const modelo = { varianteId: "m", piso: 0, almacen: 3, otras: [otra("aqp", 4, 0)], variantes: [talla("m", 0, 3, [otra("aqp", 0, 0)]), talla("l", 0, 0, [otra("aqp", 4, 0)])] };
    // El modelo suma «AQP vendió 4», pero lo que AQP vendió es la L y yo no tengo ninguna L.
    expect(destinoDeEnvio(modelo)).toBeNull();
  });

  it("la cobertura se mide talla por talla: una M agotada allá no se tapa con una L que sobra", () => {
    const modelo = {
      varianteId: "m",
      piso: 0,
      almacen: 5,
      otras: [otra("aqp", 6, 200)],
      variantes: [talla("m", 0, 2, [otra("aqp", 6, 0)]), talla("l", 0, 3, [otra("aqp", 0, 200)])],
    };
    expect(destinoDeEnvio(modelo)?.sedeId).toBe("aqp");
    const r = loQueLlevaElEnvio([modelo], "aqp");
    expect(r.tallas.map((t) => t.varianteId)).toEqual(["m"]);
    expect(r.movibles).toBe(2);
  });

  it("al revés: una talla que allá ya está cubierta no viaja aunque el modelo se pida", () => {
    const modelo = {
      varianteId: "m",
      piso: 0,
      almacen: 4,
      otras: [otra("aqp", 3, 11)],
      variantes: [talla("m", 0, 2, [otra("aqp", 2, 1)]), talla("l", 0, 2, [otra("aqp", 1, 10)])],
    };
    expect(loQueLlevaElEnvio([modelo], "aqp").tallas.map((t) => t.varianteId)).toEqual(["m"]);
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
  const mia = (varianteId: string, piso: number, almacen: number, aqp: number, stockAqp = 0) => talla(varianteId, piso, almacen, [otra("aqp", aqp, stockAqp), otra("lim", 0, 0)]);

  it("una talla que el destino no vendió no viaja (antes «una de cada talla»)", () => {
    const m = [mia("s", 0, 2, 3), mia("m", 0, 2, 0), mia("l", 0, 1, 1)];
    const r = loQueLlevaElEnvio(m, "aqp");
    expect(r.tallas.map((t) => t.varianteId)).toEqual(["s", "l"]);
    expect(r.movibles).toBe(3);
    expect(r.deLoVendido).toBe(3);
  });

  it("lo que está en el piso no se manda (el traslado solo saca del almacén): se cuenta para decir «puedes mandar 3 de 12»", () => {
    const m = [mia("s", 5, 0, 3), mia("m", 4, 3, 2)];
    const r = loQueLlevaElEnvio(m, "aqp");
    expect(r.tallas.map((t) => t.varianteId)).toEqual(["m"]);
    expect(r.movibles).toBe(3);
    expect(r.deLoVendido).toBe(12);
    expect(textoPuedesMandar(r.movibles, r.deLoVendido)).toBe("Puedes mandar 3 de 12: las otras están en el piso, sácalas primero.");
  });

  it("todo en el piso: ninguna se puede mandar hoy, y no se abre un traslado vacío", () => {
    const r = loQueLlevaElEnvio([mia("s", 5, 0, 3)], "aqp");
    expect(r.tallas).toEqual([]);
    expect(r.movibles).toBe(0);
    expect(textoPuedesMandar(0, 5)).toBe("No puedes mandar ninguna hoy: están en el piso, sácalas primero.");
    expect(textoPuedesMandar(0, 1)).toBe("No puedes mandar esa prenda hoy: está en el piso, sácala primero.");
  });

  it("un modelo trae sus tallas adentro (`variantes`) y se cuentan todas", () => {
    const modelo = { varianteId: "m1", piso: 0, almacen: 3, otras: [], variantes: [mia("s", 0, 2, 3), mia("m", 1, 1, 0)] };
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
    expect(loQueLlevaElEnvio([mia("s", 0, 0, 5)], "aqp")).toEqual({ tallas: [], movibles: 0, deLoVendido: 0 });
  });
});
