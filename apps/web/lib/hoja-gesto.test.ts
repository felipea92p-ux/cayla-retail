import { describe, expect, it } from "vitest";
import {
  FONDO_ALEJADO,
  FRACCION_PARA_PASAR,
  MOVIMIENTO_MINIMO,
  TOPE_GOMA,
  decidirGesto,
  decidirLado,
  destinoAlSoltar,
  duracionHacia,
  fondoSegun,
  goma,
  pasoDeLado,
  posicionAlArrastrar,
  progresoDeCierre,
  puntoMedio,
  velocidad,
} from "./hoja-gesto";

// La hoja del celular (ADR-0479): de 61 hojas medidas a 375 px el 2026-10-22, ninguna se movía con el dedo.
//
// Contrato (3 líneas). PROMETE: que la hoja solo toma el gesto que baja con el contenido arriba, que se cierra
// pasado un tercio o con un tirón, que nunca pasa de su tope (sin rebote) y que guardando no se va. ASUME: que
// `useHojaArrastre.ts` le pasa posiciones en px hacia abajo (0 = abierta) y muestras con `performance.now()`.
// NO PROMETE: nada del DOM ni del navegador (eso lo mide el recorrido táctil de la actividad, a 375 px).

const ALTO = 600;

describe("decidirGesto", () => {
  it("con menos de 6 px todavía no decide", () => {
    expect(decidirGesto(0, MOVIMIENTO_MINIMO - 1, true)).toBeNull();
    expect(decidirGesto(MOVIMIENTO_MINIMO - 1, -3, true)).toBeNull();
  });

  it("bajando con el contenido arriba del todo, el gesto es de la hoja", () => {
    expect(decidirGesto(2, 12, true)).toBe("hoja");
  });

  it("con el contenido desplazado, bajar el dedo es desplazar el contenido", () => {
    expect(decidirGesto(0, 12, false)).toBe("contenido");
  });

  it("subiendo el dedo o de lado, nunca es de la hoja", () => {
    expect(decidirGesto(0, -12, true)).toBe("contenido");
    expect(decidirGesto(20, 10, true)).toBe("contenido");
  });

  it("a media altura, todo gesto vertical es de la hoja (primero se estira); de lado sigue siendo del contenido", () => {
    expect(decidirGesto(0, -12, false, false)).toBe("hoja");
    expect(decidirGesto(0, 12, false, false)).toBe("hoja");
    expect(decidirGesto(20, 10, true, false)).toBe("contenido");
  });
});

describe("puntoMedio", () => {
  it("una hoja alta se detiene dejando media pantalla a la vista", () => {
    expect(puntoMedio(730, 812)).toBe(730 - 406);
  });

  it("una hoja baja (menos del 62 % de la pantalla) abre entera", () => {
    expect(puntoMedio(480, 812)).toBeNull();
    expect(puntoMedio(0, 812)).toBeNull();
  });
});

describe("goma y posicionAlArrastrar", () => {
  it("la goma crece cada vez menos y nunca pasa del tope", () => {
    expect(goma(0)).toBe(0);
    expect(goma(-10)).toBe(0);
    expect(goma(40)).toBeLessThan(40);
    expect(goma(80) - goma(40)).toBeLessThan(goma(40));
    expect(goma(100_000)).toBeLessThan(TOPE_GOMA);
  });

  it("hacia abajo sigue al dedo 1 a 1; más arriba de abierta, resiste", () => {
    expect(posicionAlArrastrar(0, 150)).toBe(150);
    const arriba = posicionAlArrastrar(0, -200);
    expect(arriba).toBeLessThan(0);
    expect(arriba).toBeGreaterThan(-TOPE_GOMA);
  });

  it("mientras guarda, la hoja oye el dedo pero no se va", () => {
    const y = posicionAlArrastrar(0, 400, true);
    expect(y).toBeGreaterThan(0);
    expect(y).toBeLessThan(TOPE_GOMA);
  });
});

describe("velocidad", () => {
  it("sin muestras suficientes es cero", () => {
    expect(velocidad([])).toBe(0);
    expect(velocidad([{ t: 0, y: 0 }])).toBe(0);
  });

  it("mide solo los últimos 100 ms: un dedo que se detuvo antes de soltar no tira", () => {
    const muestras = [
      { t: 0, y: 0 },
      { t: 50, y: 200 },
      { t: 400, y: 210 },
      { t: 460, y: 212 },
    ];
    expect(velocidad(muestras)).toBeCloseTo(2 / 60, 3);
  });

  it("un tirón de 120 px en 50 ms son 2,4 px/ms hacia abajo", () => {
    expect(velocidad([{ t: 0, y: 0 }, { t: 50, y: 120 }])).toBeCloseTo(2.4, 5);
  });
});

describe("destinoAlSoltar (abrir o cerrar)", () => {
  const puntos = [0, ALTO];

  it("soltada antes de un tercio, vuelve; pasado un tercio, se cierra", () => {
    expect(destinoAlSoltar(ALTO * FRACCION_PARA_PASAR - 5, 0, puntos, 0)).toBe(0);
    expect(destinoAlSoltar(ALTO * FRACCION_PARA_PASAR + 5, 0, puntos, 0)).toBe(ALTO);
  });

  it("un tirón hacia abajo la cierra aunque haya recorrido poco", () => {
    expect(destinoAlSoltar(40, 0, puntos, 1.2)).toBe(ALTO);
  });

  it("un tirón hacia arriba la devuelve aunque haya bajado mucho", () => {
    expect(destinoAlSoltar(500, 0, puntos, -1.2)).toBe(0);
  });

  it("más allá de los extremos, se queda en el extremo", () => {
    expect(destinoAlSoltar(-30, 0, puntos, 0)).toBe(0);
    expect(destinoAlSoltar(ALTO + 30, 0, puntos, 0)).toBe(ALTO);
  });
});

describe("destinoAlSoltar (con una altura media)", () => {
  const media = 300;
  const puntos = [0, media, ALTO];

  it("desde la media, subir un tercio del tramo la abre del todo; menos, vuelve a la media", () => {
    expect(destinoAlSoltar(media - media * FRACCION_PARA_PASAR - 5, media, puntos, 0)).toBe(0);
    expect(destinoAlSoltar(media - media * FRACCION_PARA_PASAR + 5, media, puntos, 0)).toBe(media);
  });

  it("desde la media, bajar un tercio del tramo la cierra", () => {
    expect(destinoAlSoltar(media + (ALTO - media) * FRACCION_PARA_PASAR + 5, media, puntos, 0)).toBe(ALTO);
  });

  it("un tirón va al siguiente punto en su sentido, sin saltarse la media", () => {
    expect(destinoAlSoltar(100, 0, puntos, 1.5)).toBe(media);
    expect(destinoAlSoltar(250, media, puntos, -1.5)).toBe(0);
  });

  it("los puntos pueden venir en cualquier orden", () => {
    expect(destinoAlSoltar(100, 0, [ALTO, 0, media], 1.5)).toBe(media);
  });
});

describe("fondoSegun (lo de atrás se aleja y vuelve con el dedo)", () => {
  it("con la hoja abierta, lo de atrás está alejado del todo", () => {
    expect(fondoSegun(0)).toEqual({ escala: FONDO_ALEJADO.escala, bajada: FONDO_ALEJADO.bajada, radio: FONDO_ALEJADO.radio });
  });

  it("con la hoja cerrada, lo de atrás vuelve a su lugar exacto", () => {
    expect(fondoSegun(1)).toEqual({ escala: 1, bajada: 0, radio: 0 });
  });

  it("a mitad de camino, a mitad de camino; y nunca se pasa de los extremos", () => {
    const medio = fondoSegun(0.5);
    expect(medio.escala).toBeCloseTo((FONDO_ALEJADO.escala + 1) / 2, 5);
    expect(medio.bajada).toBeCloseTo(FONDO_ALEJADO.bajada / 2, 5);
    expect(fondoSegun(-0.4)).toEqual(fondoSegun(0));
    expect(fondoSegun(1.7)).toEqual(fondoSegun(1));
  });
});

describe("decidirLado y pasoDeLado (pasar de registro en el cajón)", () => {
  const ambos = { anterior: true, siguiente: true };

  it("decide solo cuando el dedo se movió, y solo si va claramente de lado", () => {
    expect(decidirLado(4, 2)).toBeNull();
    expect(decidirLado(-40, 10)).toBe("lado");
    expect(decidirLado(20, 30)).toBe("otro");
  });

  it("dedo a la izquierda pasa al siguiente; a la derecha, al anterior", () => {
    expect(pasoDeLado(-120, 0, 375, ambos)).toBe(1);
    expect(pasoDeLado(120, 0, 375, ambos)).toBe(-1);
  });

  it("poco recorrido y sin tirón, vuelve; con un tirón en su sentido, pasa", () => {
    expect(pasoDeLado(-40, 0, 375, ambos)).toBe(0);
    expect(pasoDeLado(-40, -0.8, 375, ambos)).toBe(1);
    expect(pasoDeLado(-40, 0.8, 375, ambos)).toBe(0);
  });

  it("en la punta de la lista no pasa a ninguna parte", () => {
    expect(pasoDeLado(-200, -1, 375, { anterior: true, siguiente: false })).toBe(0);
    expect(pasoDeLado(200, 1, 375, { anterior: false, siguiente: true })).toBe(0);
  });
});

describe("duracionHacia y progresoDeCierre", () => {
  it("un tirón rápido termina rápido y uno lento no se arrastra: entre 180 y 420 ms", () => {
    expect(duracionHacia(400, 4)).toBe(180);
    expect(duracionHacia(400, 0)).toBe(400);
    expect(duracionHacia(900, 0)).toBe(420);
    expect(duracionHacia(-300, -1.5)).toBe(200);
  });

  it("el velo se aclara en la misma proporción en que se fue la hoja", () => {
    expect(progresoDeCierre(0, ALTO)).toBe(0);
    expect(progresoDeCierre(ALTO / 2, ALTO)).toBe(0.5);
    expect(progresoDeCierre(-20, ALTO)).toBe(0);
    expect(progresoDeCierre(ALTO * 2, ALTO)).toBe(1);
    expect(progresoDeCierre(10, 0)).toBe(0);
  });
});
