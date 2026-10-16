import { describe, expect, it } from "vitest";
import {
  MINIMO_PARA_PERCENTILES,
  fraseDeReferencia,
  fraseFueraDeRango,
  precioNecesitaConfirmacion,
  rangoDePreciosDeCategoria,
  veredictoDePrecio,
} from "./prenda-sin-registrar-precio";

const v = (precio: number, categoriaId = "blusas", activo = true) => ({ categoriaId, precio, activo });

describe("rangoDePreciosDeCategoria — cuánto cuestan las prendas de esa categoría en el catálogo", () => {
  it("con pocas prendas, de la más barata a la más cara", () => {
    expect(rangoDePreciosDeCategoria([v(79.9), v(59), v(129)], "blusas")).toEqual({ desde: 59, hasta: 129, n: 3 });
  });

  it("solo cuenta la categoría pedida, lo activo y lo que tiene precio", () => {
    expect(rangoDePreciosDeCategoria([v(79.9), v(500, "vestidos"), v(1, "blusas", false), v(0)], "blusas")).toEqual({ desde: 79.9, hasta: 79.9, n: 1 });
  });

  it("sin categoría, o sin prendas con precio, no hay referencia", () => {
    expect(rangoDePreciosDeCategoria([v(79.9)], null)).toBeNull();
    expect(rangoDePreciosDeCategoria([v(79.9)], "faldas")).toBeNull();
    expect(rangoDePreciosDeCategoria([v(0)], "blusas")).toBeNull();
  });

  it(`desde ${MINIMO_PARA_PERCENTILES} precios deja fuera los extremos (percentil 10 a 90)`, () => {
    const precios = [5, 59, 69, 79, 89, 99, 109, 119, 129, 139, 990];
    expect(rangoDePreciosDeCategoria(precios.map((p) => v(p)), "blusas")).toEqual({ desde: 59, hasta: 139, n: 11 });
  });

  it("un catálogo sin ids (guardado antes del cambio) no da referencia", () => {
    expect(rangoDePreciosDeCategoria([{ precio: 79.9 }], "blusas")).toBeNull();
  });
});

describe("veredictoDePrecio y la confirmación", () => {
  const rango = { desde: 59, hasta: 129, n: 3 };

  it("dentro, bajo, alto; el borde está dentro", () => {
    expect(veredictoDePrecio(89, rango)).toBe("dentro");
    expect(veredictoDePrecio(59, rango)).toBe("dentro");
    expect(veredictoDePrecio(129, rango)).toBe("dentro");
    expect(veredictoDePrecio(15, rango)).toBe("bajo");
    expect(veredictoDePrecio(300, rango)).toBe("alto");
  });

  it("sin precio o sin referencia no hay veredicto que confirmar", () => {
    expect(veredictoDePrecio(0, rango)).toBe("sin_precio");
    expect(veredictoDePrecio(NaN, rango)).toBe("sin_precio");
    expect(veredictoDePrecio(15, null)).toBe("sin_referencia");
    expect(precioNecesitaConfirmacion("sin_referencia", 15, null)).toBe(false);
    expect(precioNecesitaConfirmacion("dentro", 89, null)).toBe(false);
  });

  it("fuera de rango pide confirmar; la confirmación vale para ESE precio y se pierde si cambia", () => {
    expect(precioNecesitaConfirmacion("bajo", 15, null)).toBe(true);
    expect(precioNecesitaConfirmacion("bajo", 15, 15)).toBe(false);
    expect(precioNecesitaConfirmacion("bajo", 20, 15)).toBe(true);
    expect(precioNecesitaConfirmacion("alto", 300, 300)).toBe(false);
  });

  it("los textos: la referencia y el aviso", () => {
    expect(fraseDeReferencia("Camisas y Blusas", rango)).toBe("Camisas y Blusas en tu catálogo: de S/ 59.00 a S/ 129.00.");
    expect(fraseDeReferencia("Correas", { desde: 39.9, hasta: 39.9, n: 1 })).toBe("Correas en tu catálogo: S/ 39.90 (una prenda).");
    const bajo = fraseFueraDeRango(15, "Camisas y Blusas", rango, "bajo");
    expect(bajo.titulo).toBe("S/ 15.00 está por debajo de lo usual en Camisas y Blusas");
    expect(bajo.detalle).toContain("de S/ 59.00 a S/ 129.00");
    expect(bajo.detalle).toContain("confírmalo");
    expect(fraseFueraDeRango(300, "Camisas y Blusas", rango, "alto").titulo).toBe("S/ 300.00 está por encima de lo usual en Camisas y Blusas");
  });
});
