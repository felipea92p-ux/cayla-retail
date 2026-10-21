import { describe, expect, it } from "vitest";
import { claveMasCercana, debePedirUbicacion, distanciaKm, esPuntoValido, puntoDeLaTienda } from "./sede-cercana";

const TRUJILLO_CENTRO = { lat: -8.1099, lng: -79.0215 };
const MIRAFLORES = { lat: -12.1197, lng: -77.0282 };
const CALLAO = { lat: -12.05, lng: -77.12 };
const AREQUIPA_CENTRO = { lat: -16.3988, lng: -71.5369 };
const CUSCO = { lat: -13.5319, lng: -71.9675 };
const TIENDAS = ["arequipa", "lima", "trujillo"];

describe("la distancia entre dos puntos", () => {
  it("un punto consigo mismo está a cero", () => {
    expect(distanciaKm(MIRAFLORES, MIRAFLORES)).toBe(0);
  });

  it("es la misma de ida que de vuelta", () => {
    expect(distanciaKm(TRUJILLO_CENTRO, MIRAFLORES)).toBeCloseTo(distanciaKm(MIRAFLORES, TRUJILLO_CENTRO), 6);
  });

  it("Trujillo a Lima: unos 480 km en línea recta", () => {
    const km = distanciaKm(puntoDeLaTienda("trujillo")!, puntoDeLaTienda("lima")!);
    expect(km).toBeGreaterThan(450);
    expect(km).toBeLessThan(510);
  });
});

describe("la tienda más cercana", () => {
  it("desde cada ciudad, su propia tienda", () => {
    expect(claveMasCercana(TRUJILLO_CENTRO, TIENDAS)).toBe("trujillo");
    expect(claveMasCercana(MIRAFLORES, TIENDAS)).toBe("lima");
    expect(claveMasCercana(CALLAO, TIENDAS)).toBe("lima");
    expect(claveMasCercana(AREQUIPA_CENTRO, TIENDAS)).toBe("arequipa");
  });

  it("desde una ciudad sin tienda, la que queda más cerca", () => {
    expect(claveMasCercana(CUSCO, TIENDAS)).toBe("arequipa");
  });

  it("solo cuenta las tiendas que se ven en la web", () => {
    expect(claveMasCercana(MIRAFLORES, ["arequipa", "trujillo"])).toBe("trujillo");
  });

  it("una tienda sin punto conocido se deja fuera, nunca se adivina", () => {
    expect(claveMasCercana(MIRAFLORES, ["tumbes", "arequipa"])).toBe("arequipa");
    expect(claveMasCercana(MIRAFLORES, ["tumbes"])).toBeNull();
    expect(claveMasCercana(MIRAFLORES, [])).toBeNull();
  });

  it("sin ubicación o con una ubicación rara no elige tienda", () => {
    for (const raro of [null, undefined, { lat: NaN, lng: -77 }, { lat: -12, lng: Infinity }, { lat: 91, lng: 0 }, { lat: 0, lng: 181 }, { lat: 0, lng: 0 }]) {
      expect(claveMasCercana(raro, TIENDAS), JSON.stringify(raro)).toBeNull();
    }
  });

  it("el resultado no depende del orden de la lista", () => {
    expect(claveMasCercana(TRUJILLO_CENTRO, [...TIENDAS].reverse())).toBe("trujillo");
  });

});

describe("un punto válido", () => {
  it("acepta uno del mapa y rechaza lo que no lo es", () => {
    expect(esPuntoValido(MIRAFLORES)).toBe(true);
    expect(esPuntoValido(null)).toBe(false);
    expect(esPuntoValido({ lat: 0, lng: 0 })).toBe(false);
  });
});

describe("cuándo se pide la ubicación", () => {
  const base = { ruta: "/inicio", tiendaRecordada: false, yaPreguntada: false, prendasEnBolsa: 0, tiendas: 3 };

  it("al entrar al Inicio por primera vez", () => {
    expect(debePedirUbicacion(base)).toBe(true);
  });

  it("no en una prenda ni en el catálogo: la persona llegó a ver ESO", () => {
    expect(debePedirUbicacion({ ...base, ruta: "/catalogo" })).toBe(false);
    expect(debePedirUbicacion({ ...base, ruta: "/catalogo/abc" })).toBe(false);
    expect(debePedirUbicacion({ ...base, ruta: "/looks" })).toBe(false);
  });

  it("no si ya eligió una tienda", () => {
    expect(debePedirUbicacion({ ...base, tiendaRecordada: true })).toBe(false);
  });

  it("no si ya se le preguntó en este aparato (dijo que no o falló): no se insiste", () => {
    expect(debePedirUbicacion({ ...base, yaPreguntada: true })).toBe(false);
  });

  it("no si la bolsa lleva prendas: cambiar de tienda la vacía y no se hace por su cuenta", () => {
    expect(debePedirUbicacion({ ...base, prendasEnBolsa: 2 })).toBe(false);
  });

  it("no con una sola tienda en la web: no hay nada que elegir", () => {
    expect(debePedirUbicacion({ ...base, tiendas: 1 })).toBe(false);
    expect(debePedirUbicacion({ ...base, tiendas: 0 })).toBe(false);
  });
});
