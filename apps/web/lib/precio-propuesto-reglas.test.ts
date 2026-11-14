import { describe, expect, it } from "vitest";
import {
  elegirCosto,
  MARGEN_MINIMO,
  pideRevisarAlRecibir,
  precioUnicoAlCerrar,
  textoRevisarAlRecibir,
  pisoDePrecio,
  redondearA90,
  revisarPrecioDeLaIA,
  seLlegoAlTopePrecios,
  textoSinPropuesta,
  TOPE_PRECIOS_MES_USD,
  type MotivoSinPropuesta,
} from "./precio-propuesto-reglas";

describe("redondearA90: como se ponen los precios en CAYLA", () => {
  it("sube al primer .90 sin bajar nunca", () => {
    expect(redondearA90(85.2)).toBe(85.9);
    expect(redondearA90(85)).toBe(85.9);
    expect(redondearA90(85.9)).toBe(85.9);
    expect(redondearA90(85.95)).toBe(86.9);
    expect(redondearA90(85.91)).toBe(86.9);
  });
  it("aguanta los decimales que el punto flotante tuerce", () => {
    expect(redondearA90(0.1 + 0.2 + 59.6)).toBe(59.9);
    expect(redondearA90(79.9000000001)).toBe(79.9);
  });
});

describe("pisoDePrecio: costo + 30 % de margen sobre el precio", () => {
  it("con S/ 35 de costo, el piso es S/ 50.90", () => {
    expect(pisoDePrecio(35)).toBe(50.9);
  });
  it("cuando el costo cae justo en un .90, no sube de más", () => {
    expect(pisoDePrecio(34.93)).toBe(49.9);
  });
  it("todo piso deja al menos 30 % de margen (lo mismo que exige la base: precio × 0,70 ≥ costo)", () => {
    for (let c = 1; c <= 3000; c += 1) {
      const costo = c / 7; // costos con decimales feos a propósito
      const piso = pisoDePrecio(costo);
      expect(Math.round(piso * 100) % 100).toBe(90);
      expect(piso * (1 - MARGEN_MINIMO)).toBeGreaterThanOrEqual(costo - 0.005);
      // y es el más bajo: el .90 anterior ya no alcanza
      expect((piso - 1) * (1 - MARGEN_MINIMO)).toBeLessThan(costo + 0.005);
    }
  });
});

describe("elegirCosto: el de la prenda, o el de su categoría marcado como estimado", () => {
  it("prefiere el costo de la prenda", () => {
    expect(elegirCosto(32.5, 40)).toEqual({ costo: 32.5, estimado: false });
  });
  it("sin costo de la prenda, usa el de la categoría y lo marca", () => {
    expect(elegirCosto(null, 40.123)).toEqual({ costo: 40.12, estimado: true });
    expect(elegirCosto(0, 40)).toEqual({ costo: 40, estimado: true });
  });
  it("sin ninguno, no hay costo (y sin costo no se propone)", () => {
    expect(elegirCosto(null, null)).toBeNull();
    expect(elegirCosto(undefined, 0)).toBeNull();
    expect(elegirCosto(Number.NaN, -3)).toBeNull();
  });
  it("un costo fuera del tope no cuenta", () => {
    expect(elegirCosto(9000, 40)).toEqual({ costo: 40, estimado: true });
  });
});

describe("revisarPrecioDeLaIA: la IA propone, la regla manda", () => {
  it("lleva la propuesta a .90", () => {
    expect(revisarPrecioDeLaIA(64, 30)).toEqual({ precio: 64.9, piso: 42.9, subidoAlPiso: false, margen: expect.closeTo(53.78, 1) });
  });
  it("si la IA propone bajo el piso, sube al piso y lo dice", () => {
    const r = revisarPrecioDeLaIA(39.9, 35);
    expect(r?.precio).toBe(50.9);
    expect(r?.subidoAlPiso).toBe(true);
    expect(r?.margen).toBeGreaterThanOrEqual(30);
  });
  it("lo que no es un precio no se le cree", () => {
    for (const malo of [null, undefined, "59.90", Number.NaN, Number.POSITIVE_INFINITY, 0, -10, 5001]) {
      expect(revisarPrecioDeLaIA(malo, 30)).toBeNull();
    }
  });
  it("sin costo válido no hay precio", () => {
    expect(revisarPrecioDeLaIA(59.9, 0)).toBeNull();
  });
  it("si el piso pasa del tope de S/ 5 000, no hay propuesta", () => {
    expect(revisarPrecioDeLaIA(4999, 4000)).toBeNull();
  });
});

describe("el tope del mes", () => {
  it("corta al llegar a US$ 20, y no corta si no se sabe cuánto va", () => {
    expect(TOPE_PRECIOS_MES_USD).toBe(20);
    expect(seLlegoAlTopePrecios(19.99)).toBe(false);
    expect(seLlegoAlTopePrecios(20)).toBe(true);
    expect(seLlegoAlTopePrecios(null)).toBe(false);
  });
});

describe("textoSinPropuesta", () => {
  it("cada motivo dice qué pasó y qué hacer, en una frase corta", () => {
    const motivos: MotivoSinPropuesta[] = ["sin_clave", "sin_costo", "tope", "sin_respuesta", "rechazo", "respuesta_invalida"];
    for (const m of motivos) {
      const t = textoSinPropuesta(m);
      expect(t.length).toBeGreaterThan(20);
      expect(t.length).toBeLessThanOrEqual(50);
    }
  });
});

describe("al recibir una prenda que ya existe: ¿conviene mirar su precio?", () => {
  it("margen bajo 30 % con el costo de esta compra", () => {
    expect(pideRevisarAlRecibir({ precio: 59.9, costo: 45, costoAntes: 45 })).toEqual({ margen: expect.closeTo(24.87, 1), motivo: "margen_bajo" });
  });
  it("el costo cambió aunque el margen siga bien", () => {
    expect(pideRevisarAlRecibir({ precio: 79.9, costo: 30, costoAntes: 25 })?.motivo).toBe("costo_cambio");
  });
  it("mismo costo y buen margen: nada que decir (no se gasta)", () => {
    expect(pideRevisarAlRecibir({ precio: 79.9, costo: 30, costoAntes: 30 })).toBeNull();
  });
  it("sin precio o sin costo, nada", () => {
    expect(pideRevisarAlRecibir({ precio: null, costo: 30, costoAntes: null })).toBeNull();
    expect(pideRevisarAlRecibir({ precio: 59.9, costo: null, costoAntes: null })).toBeNull();
    expect(pideRevisarAlRecibir({ precio: 59.9, costo: 0, costoAntes: null })).toBeNull();
  });
  it("la línea dice el motivo, sin repetir el margen (lo dice la línea viva)", () => {
    expect(textoRevisarAlRecibir({ margen: 24.9, motivo: "margen_bajo" })).toBe("Menos de 30 %: revisa el precio.");
    expect(textoRevisarAlRecibir({ margen: 40, motivo: "costo_cambio" })).toBe("Cambió el costo: revisa el precio.");
  });
});

describe("precioUnicoAlCerrar", () => {
  it("uno solo en todas las tallas (lo escrito manda sobre el de hoy)", () => {
    expect(precioUnicoAlCerrar([{ varianteId: "a", precioSede: 59.9 }, { varianteId: "b", precioSede: 59.9 }], {})).toBe(59.9);
    expect(precioUnicoAlCerrar([{ varianteId: "a", precioSede: 59.9 }, { varianteId: "b", precioSede: 49.9 }], { b: { valor: 59.9 } })).toBe(59.9);
  });
  it("distintos por talla, o sin leer todavía: no hay uno solo", () => {
    expect(precioUnicoAlCerrar([{ varianteId: "a", precioSede: 59.9 }, { varianteId: "b", precioSede: 69.9 }], {})).toBeNull();
    expect(precioUnicoAlCerrar([{ varianteId: "a", precioSede: null }], {})).toBeNull();
    expect(precioUnicoAlCerrar([], {})).toBeNull();
  });
});
