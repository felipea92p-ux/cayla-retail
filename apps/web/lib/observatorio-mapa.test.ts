import { describe, expect, it } from "vitest";
import {
  ajustar,
  arcoEntre,
  CAJA_PAIS,
  cajaDe,
  cajaIntermedia,
  esEntreTiendas,
  formaDe,
  interpolarForma,
  posicionDeTienda,
  proyectar,
  remuestrear,
  type Caja,
  type Punto,
} from "./observatorio-mapa";
import { DEPARTAMENTO_DE_TIENDA, PERU } from "./observatorio-mapa-datos";

// ¿Está el punto dentro del polígono? (rayo horizontal)
function adentro([x, y]: Punto, pol: readonly Punto[]): boolean {
  let dentro = false;
  for (let i = 0, j = pol.length - 1; i < pol.length; j = i++) {
    const [xi, yi] = pol[i];
    const [xj, yj] = pol[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

describe("contornos y tiendas", () => {
  it("cada tienda cae dentro de su departamento y del Perú", () => {
    for (const s of ["TRU", "AQP", "LIM"] as const) {
      expect(adentro(posicionDeTienda(s), formaDe(s))).toBe(true);
      expect(adentro(posicionDeTienda(s), formaDe("TODAS"))).toBe(true);
    }
  });

  it("todos los contornos tienen los mismos puntos y empiezan por el norte (para transformarse uno en otro)", () => {
    const formas = (["TODAS", "TRU", "AQP", "LIM"] as const).map((f) => formaDe(f));
    for (const f of formas) {
      expect(f).toHaveLength(160);
      expect(f[0][1]).toBe(Math.min(...f.map((p) => p[1])));
    }
  });

  it("remuestrear no depende del sentido en que venga el contorno", () => {
    const ida = remuestrear(DEPARTAMENTO_DE_TIENDA.TRU.contorno, 40);
    const vuelta = remuestrear([...DEPARTAMENTO_DE_TIENDA.TRU.contorno].reverse(), 40);
    expect(ida[0]).toEqual(vuelta[0]);
  });

  it("el Perú entra en la caja del país", () => {
    const pts = PERU.map(([lon, lat]) => proyectar(lon, lat));
    const [x, y, w, h] = CAJA_PAIS;
    for (const p of pts) {
      expect(p[0]).toBeGreaterThanOrEqual(x);
      expect(p[0]).toBeLessThanOrEqual(x + w);
      expect(p[1]).toBeGreaterThanOrEqual(y);
      expect(p[1]).toBeLessThanOrEqual(y + h);
    }
  });
});

describe("encuadre", () => {
  it("ajustar nunca recorta la caja y llega a la proporción pedida", () => {
    const c: Caja = [10, 20, 100, 200];
    for (const prop of [0.5, 1, 2, 3]) {
      const [x, y, w, h] = ajustar(c, prop);
      expect(h / w).toBeCloseTo(prop, 6);
      expect(x).toBeLessThanOrEqual(10);
      expect(y).toBeLessThanOrEqual(20);
      expect(x + w).toBeGreaterThanOrEqual(110);
      expect(y + h).toBeGreaterThanOrEqual(220);
    }
  });

  it("la caja de una tienda contiene su departamento y es mucho más chica que la del país", () => {
    for (const s of ["TRU", "AQP", "LIM"] as const) {
      const [x, y, w, h] = cajaDe(s);
      for (const p of formaDe(s)) {
        expect(p[0]).toBeGreaterThan(x);
        expect(p[0]).toBeLessThan(x + w);
        expect(p[1]).toBeGreaterThan(y);
        expect(p[1]).toBeLessThan(y + h);
      }
      expect(w).toBeLessThan(CAJA_PAIS[2] / 2);
    }
  });
});

describe("zoom", () => {
  it("empieza y termina en las cajas de los extremos", () => {
    const a = cajaDe("TODAS");
    const b = cajaDe("LIM");
    expect(cajaIntermedia(a, b, 0, false).map((v) => +v.toFixed(3))).toEqual(a.map((v) => +v.toFixed(3)));
    expect(cajaIntermedia(a, b, 1, false).map((v) => +v.toFixed(3))).toEqual(b.map((v) => +v.toFixed(3)));
  });

  it("entre dos tiendas se aleja a mitad de camino; del país a una tienda, no", () => {
    const tru = cajaDe("TRU");
    const aqp = cajaDe("AQP");
    expect(esEntreTiendas(tru, aqp)).toBe(true);
    expect(esEntreTiendas(cajaDe("TODAS"), aqp)).toBe(false);
    const medio = cajaIntermedia(tru, aqp, 0.5, true);
    expect(medio[2]).toBeGreaterThan(Math.max(tru[2], aqp[2]));
    expect(medio[2]).toBeLessThanOrEqual(CAJA_PAIS[2]);
  });

  it("la forma intermedia queda entre las dos", () => {
    const a: Punto[] = [[0, 0], [10, 0]];
    const b: Punto[] = [[10, 10], [20, 10]];
    expect(interpolarForma(a, b, 0.5)).toEqual([[5, 5], [15, 5]]);
  });

  it("el arco de un traslado va de una tienda a la otra", () => {
    const d = arcoEntre(posicionDeTienda("TRU"), posicionDeTienda("LIM"));
    expect(d.startsWith("M")).toBe(true);
    expect(d).toContain(" Q ");
  });
});
