import { describe, expect, it } from "vitest";
import { conRebajaCts, cuentaDelPrecio, IGV, pierdeConElPrecio } from "./cuenta-de-precio";
import {
  eleccionDeRasgos,
  eleccionParaGuardar,
  leerEleccionGuardada,
  leerReglas,
  leerReglasYListas,
  rasgosEfectivos,
  margenObjetivo,
  MARGEN_TOPE,
  precioConMargen,
  problemaDeReglas,
  RASGOS,
  rebajaQueAguanta,
  REGLAS_DE_FABRICA,
  sugerirPrecio,
  type ReglasDePrecio,
} from "./margen-por-rasgos";

// ADR-0700. Los casos de la maqueta (https://claude.ai/artifact/H769t9La8QMYkJEv4QZQUx): blusa de S/ 30.90 en Trujillo, parecidas a S/ 52.90.

const conBase = (margenBase: number, puntos = REGLAS_DE_FABRICA.puntos): ReglasDePrecio => ({ margenBase, puntos });
/** El margen sin redondear sobre el precio sin IGV: la definición. */
const margenExacto = (costo: number, precio: number) => (precio / IGV - costo) / (precio / IGV);

describe("leerReglas: lo que manda la base, o la regla de fábrica", () => {
  it("lee la base y los puntos", () => {
    const r = leerReglas({ margen_base: 33, puntos: { nadie_la_tiene: 4, en_tendencia: 5, tela_que_se_nota: 2, marca_conocida: 0 } });
    expect(r).toEqual({ margenBase: 33, puntos: { nadie_la_tiene: 4, en_tendencia: 5, tela_que_se_nota: 2, marca_conocida: 0 } });
  });
  it("sin respuesta o con un dato roto, toma el de fábrica (37 % y +3)", () => {
    expect(leerReglas(null)).toEqual(REGLAS_DE_FABRICA);
    expect(leerReglas({ margen_base: "36", puntos: { nadie_la_tiene: 2.5 } })).toEqual(REGLAS_DE_FABRICA);
  });
});

describe("problemaDeReglas: los mismos candados que la base", () => {
  it("la de fábrica se puede guardar", () => expect(problemaDeReglas(REGLAS_DE_FABRICA)).toBeNull());
  it("base fuera de 20–60, puntos fuera de 0–10 y el tope de 75 %", () => {
    expect(problemaDeReglas(conBase(19))).toMatch(/de 20 a 60/);
    expect(problemaDeReglas(conBase(36.5))).toMatch(/de 20 a 60/);
    expect(problemaDeReglas(conBase(36, { ...REGLAS_DE_FABRICA.puntos, en_tendencia: 11 }))).toBe("«En tendencia» suma de 0 a 10 %.");
    expect(problemaDeReglas(conBase(60, { nadie_la_tiene: 4, en_tendencia: 4, tela_que_se_nota: 4, marca_conocida: 4 }))).toMatch(/75 %/);
    expect(problemaDeReglas(conBase(60, { nadie_la_tiene: 4, en_tendencia: 4, tela_que_se_nota: 4, marca_conocida: 3 }))).toBeNull();
  });
});

describe("margenObjetivo: la base más lo que la prenda tiene", () => {
  it("cada casilla suma sus puntos una sola vez", () => {
    expect(margenObjetivo(REGLAS_DE_FABRICA, [])).toBe(37);
    expect(margenObjetivo(REGLAS_DE_FABRICA, ["en_tendencia", "en_tendencia"])).toBe(40);
    expect(margenObjetivo(REGLAS_DE_FABRICA, RASGOS)).toBe(49);
  });
  it("nunca pasa del tope", () => {
    expect(margenObjetivo(conBase(70, { nadie_la_tiene: 10, en_tendencia: 10, tela_que_se_nota: 10, marca_conocida: 10 }), RASGOS)).toBe(MARGEN_TOPE);
  });
});

describe("precioConMargen: el .90 más bajo que deja ese margen", () => {
  it("los casos de la maqueta", () => {
    expect(precioConMargen(30.9, 33)).toBe(54.9);
    expect(precioConMargen(30.9, 36)).toBe(57.9);
    expect(precioConMargen(30.9, 42)).toBe(62.9);
    expect(precioConMargen(21.6, 33)).toBe(38.9);
    expect(precioConMargen(39.2, 33)).toBe(69.9);
    expect(precioConMargen(57.9, 39)).toBe(112.9);
  });
  it("de S/ 1 a S/ 500 y en cada margen: termina en .90, deja el margen y el .90 de abajo no", () => {
    for (let c = 100; c <= 50_000; c += 137) {
      const costo = c / 100;
      for (const m of [0, 20, 30, 33, 36, 45, 60, 75]) {
        const p = precioConMargen(costo, m);
        if (p === null) continue;
        expect(Math.round(p * 100) % 100).toBe(90);
        expect(margenExacto(costo, p)).toBeGreaterThanOrEqual(m / 100 - 1e-12);
        if (p > 1) expect(margenExacto(costo, p - 1)).toBeLessThan(m / 100);
      }
    }
  });
  it("sin costo, con margen imposible o sobre el tope de la base, no hay precio", () => {
    expect(precioConMargen(0, 36)).toBeNull();
    expect(precioConMargen(30.9, 100)).toBeNull();
    expect(precioConMargen(30.9, 36.5)).toBeNull();
    expect(precioConMargen(4000, 36)).toBeNull();
  });
});

describe("sugerirPrecio: la regla, las parecidas, el techo de afuera y nunca perder", () => {
  const blusa = { costo: 30.9, reglas: conBase(33) };
  it("sin casillas: la base", () => {
    expect(sugerirPrecio({ ...blusa, rasgos: [] })).toMatchObject({ precio: 54.9, regla: 54.9, margen: 33, motivo: "regla", techo: null });
  });
  it("con las tres casillas de quien compra y la marca: 45 %", () => {
    expect(sugerirPrecio({ ...blusa, rasgos: RASGOS })).toMatchObject({ precio: 66.9, margen: 45, motivo: "regla" });
  });
  it("si las parecidas se venden a más, se sugiere ese precio", () => {
    expect(sugerirPrecio({ ...blusa, rasgos: [], parecidas: 59.9 })).toMatchObject({ precio: 59.9, regla: 54.9, motivo: "parecidas" });
    expect(sugerirPrecio({ ...blusa, rasgos: [], parecidas: 52.9 })).toMatchObject({ precio: 54.9, motivo: "regla" });
  });
  it("el precio visto afuera es un techo: queda en el .90 justo debajo", () => {
    expect(sugerirPrecio({ ...blusa, rasgos: RASGOS, afuera: 60 })).toMatchObject({ precio: 59.9, regla: 66.9, techo: 59.9, motivo: "afuera" });
    expect(sugerirPrecio({ ...blusa, rasgos: RASGOS, afuera: 59.9 })).toMatchObject({ precio: 58.9, techo: 58.9 });
    expect(sugerirPrecio({ ...blusa, rasgos: [], afuera: 90 })).toMatchObject({ precio: 54.9, techo: 89.9, motivo: "regla" });
  });
  it("pero nunca un precio que pierde", () => {
    const r = sugerirPrecio({ ...blusa, rasgos: [], afuera: 30 });
    expect(r).toMatchObject({ precio: 36.9, desde: 36.9, motivo: "pierdes" });
    expect(pierdeConElPrecio(36.9, 30.9)).toBe(false);
    expect(pierdeConElPrecio(35.9, 30.9)).toBe(true);
  });
  it("«desde» es siempre el primer .90 que no pierde, con la cuenta de «Te quedan»", () => {
    for (let c = 100; c <= 50_000; c += 211) {
      const costo = c / 100;
      const r = sugerirPrecio({ costo, reglas: REGLAS_DE_FABRICA, rasgos: [] });
      if (!r) continue;
      expect(pierdeConElPrecio(r.desde, costo)).toBe(false);
      if (r.desde > 1) expect(pierdeConElPrecio(Math.round((r.desde - 1) * 100) / 100, costo)).toBe(true);
    }
  });
  it("sin costo no sugiere", () => expect(sugerirPrecio({ costo: 0, reglas: REGLAS_DE_FABRICA, rasgos: [] })).toBeNull());
});

describe("rebajaQueAguanta: la rebaja más grande sin perder", () => {
  it("con 33 % de margen aguanta 33 %, no la rebaja de 35 % de caja", () => {
    expect(rebajaQueAguanta(30.9, 54.9)).toBe(33);
    expect(cuentaDelPrecio(30.9, conRebajaCts(5490, 35) / 100)!.teQuedan).toBeLessThan(0);
  });
  it("con todas las casillas (45 %) aguanta la de 35 %", () => {
    expect(rebajaQueAguanta(30.9, 66.9)).toBeGreaterThanOrEqual(35);
  });
  it("esa rebaja no pierde y la siguiente sí, en todo costo y precio", () => {
    for (let c = 500; c <= 30_000; c += 523) {
      const costo = c / 100;
      for (const m of [20, 36, 48, 60]) {
        const precio = precioConMargen(costo, m);
        if (precio === null) continue;
        const d = rebajaQueAguanta(costo, precio)!;
        expect(pierdeConElPrecio(conRebajaCts(Math.round(precio * 100), d) / 100, costo)).toBe(false);
        expect(pierdeConElPrecio(conRebajaCts(Math.round(precio * 100), d + 1) / 100, costo)).toBe(true);
      }
    }
  });
});

describe("lo que la prenda tiene: lo marcado, la tela por su tejido y la marca por la lista", () => {
  const auto = (tejidoSeNota: boolean, marcaConocida: boolean) => ({ tejidoSeNota, marcaConocida });
  it("en el orden de la hoja, sin importar el orden en que se marcó", () => {
    expect(rasgosEfectivos({ en_tendencia: true, nadie_la_tiene: true }, auto(false, true))).toEqual(["nadie_la_tiene", "en_tendencia", "marca_conocida"]);
  });
  it("la tela llega por el tejido, y la persona puede quitarla o ponerla", () => {
    expect(rasgosEfectivos({}, auto(true, false))).toEqual(["tela_que_se_nota"]);
    expect(rasgosEfectivos({ tela_que_se_nota: false }, auto(true, false))).toEqual([]);
    expect(rasgosEfectivos({ tela_que_se_nota: true }, auto(false, false))).toEqual(["tela_que_se_nota"]);
  });
  it("la marca no se marca a mano: solo la lista la pone", () => {
    expect(rasgosEfectivos({}, auto(false, false))).toEqual([]);
    expect(rasgosEfectivos({}, auto(false, true))).toEqual(["marca_conocida"]);
  });
  it("de vuelta a lo marcado: corregir una línea no pierde nada", () => {
    const guardado = rasgosEfectivos({ nadie_la_tiene: true, tela_que_se_nota: true }, auto(false, false));
    expect(rasgosEfectivos(eleccionDeRasgos(guardado), auto(false, false))).toEqual(guardado);
  });
  it("la regla y las listas como las manda la base; lo roto, vacío", () => {
    expect(leerReglasYListas({ margen_base: 37, marcas_conocidas: ["m1", 3], tejidos_que_se_notan: null })).toMatchObject({
      reglas: { margenBase: 37 },
      marcasConocidas: ["m1"],
      tejidosQueSeNotan: [],
    });
  });
});

describe("lo que se guarda de una prenda en Catálogo (20261124183000)", () => {
  it("sin tocar nada no hay nada que guardar; la tela sin tocar viaja nula (sigue a su tejido)", () => {
    expect(eleccionParaGuardar({})).toBeNull();
    expect(eleccionParaGuardar({ nadie_la_tiene: true })).toEqual({ p_nadie_la_tiene: true, p_en_tendencia: false, p_tela_que_se_nota: null });
    expect(eleccionParaGuardar({ tela_que_se_nota: false })).toEqual({ p_nadie_la_tiene: false, p_en_tendencia: false, p_tela_que_se_nota: false });
    // Marcar y desmarcar sí se guarda (todo en no): la persona la tocó.
    expect(eleccionParaGuardar({ en_tendencia: false })).toEqual({ p_nadie_la_tiene: false, p_en_tendencia: false, p_tela_que_se_nota: null });
  });

  it("lo guardado vuelve como lo marcado, y la vuelta completa no cambia nada", () => {
    expect(leerEleccionGuardada({ nadie_la_tiene: true, en_tendencia: false, tela_que_se_nota: null })).toEqual({ nadie_la_tiene: true, en_tendencia: false });
    expect(leerEleccionGuardada({ nadie_la_tiene: false, en_tendencia: true, tela_que_se_nota: false })).toEqual({ nadie_la_tiene: false, en_tendencia: true, tela_que_se_nota: false });
    expect(leerEleccionGuardada(null)).toEqual({});
    expect(leerEleccionGuardada([1])).toEqual({});
    const guardado = { p_nadie_la_tiene: true, p_en_tendencia: false, p_tela_que_se_nota: true };
    expect(eleccionParaGuardar(leerEleccionGuardada({ nadie_la_tiene: true, en_tendencia: false, tela_que_se_nota: true }))).toEqual(guardado);
  });
});

