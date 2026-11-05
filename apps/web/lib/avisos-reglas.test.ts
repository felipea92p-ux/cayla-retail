import { describe, expect, it } from "vitest";
import {
  DURACION,
  DURACION_CON_ACCION,
  conVisto,
  duracionDe,
  ejeDelAviso,
  opacidadDelAviso,
  posicionDelAviso,
  retirarLoVisto,
  salidaDelAviso,
  type EnLaPila,
} from "./avisos-reglas";

// Regresión del 2026-10-14 (ADR-0146, «Actualización 2026-10-14»): en Producción, «Traer de vuelta» y luego
// «Enviar a maquila» dejaban DOS «Deshacer» a la vista (el primero re-aplicaba una etapa vieja), y el «Deshacer»
// de Producción duraba 4 s contados desde que se pidió, no desde que se vio.
//
// Contrato (3 líneas). PROMETE: la duración por tono, el mínimo de 7 s con acción y que una pila al ocuparse la
// pantalla retira solo lo ya visto (nunca un proceso), devolviendo la misma referencia si nada cambia. ASUME: que
// `Avisos.tsx` marca «visto» cuando el reloj de la tarjeta empieza a correr a la vista y llama `retirarLoVisto` al
// ocuparse la pantalla. NO PROMETE: nada del DOM (el clic en un aviso que no cierra la hoja lo vigila
// `hojas-avisos.test.ts` y el navegador).

describe("duracionDe", () => {
  it("sin acción, cada tono dura lo suyo: éxito 4 s, advertencia 6 s, error 8 s", () => {
    expect(duracionDe("exito")).toBe(4000);
    expect(duracionDe("aviso")).toBe(6000);
    expect(duracionDe("error")).toBe(8000);
    expect(DURACION.exito).toBe(4000);
  });

  it("un proceso no tiene reloj, aunque le pasen acción o duración", () => {
    expect(duracionDe("proceso")).toBeNull();
    expect(duracionDe("proceso", { accion: {}, duracion: 9000 })).toBeNull();
  });

  it("con un botón («Deshacer») no baja de 7 s: hay que leer y decidir", () => {
    expect(DURACION_CON_ACCION).toBe(7000);
    expect(duracionDe("exito", { accion: { texto: "Deshacer" } })).toBe(7000);
    expect(duracionDe("aviso", { accion: { texto: "Agregar" } })).toBe(7000);
  });

  it("un error con acción conserva sus 8 s: el mínimo con acción no acorta", () => {
    expect(duracionDe("error", { accion: { texto: "Recargar" } })).toBe(8000);
  });

  it("quien pide una duración decide, más larga o más corta, con o sin acción", () => {
    expect(duracionDe("exito", { accion: {}, duracion: 15_000 })).toBe(15_000);
    expect(duracionDe("exito", { accion: {}, duracion: 3000 })).toBe(3000);
    expect(duracionDe("aviso", { duracion: 12_000 })).toBe(12_000);
  });
});

const pila = (...tonos: Array<[number, EnLaPila["tono"], boolean]>): EnLaPila[] => tonos.map(([id, tono, visto]) => ({ id, tono, visto }));

describe("conVisto", () => {
  it("marca solo ese aviso", () => {
    const antes = pila([1, "exito", false], [2, "error", false]);
    const despues = conVisto(antes, 1);
    expect(despues.map((a) => a.visto)).toEqual([true, false]);
    expect(antes[0].visto, "no muta la pila anterior").toBe(false);
  });

  it("devuelve la misma referencia si ya estaba visto o si el aviso no existe", () => {
    const visto = pila([1, "exito", true]);
    expect(conVisto(visto, 1)).toBe(visto);
    expect(conVisto(visto, 99)).toBe(visto);
  });
});

describe("retirarLoVisto (la pantalla se ocupó)", () => {
  it("lo que ya se vio no vuelve; lo que todavía no se vio sigue esperando", () => {
    const antes = pila([1, "exito", true], [2, "exito", false], [3, "error", true], [4, "aviso", false]);
    expect(retirarLoVisto(antes).map((a) => a.id)).toEqual([2, 4]);
  });

  it("un proceso nunca se retira: sigue corriendo aunque la pantalla se ocupe", () => {
    const antes = pila([1, "proceso", false], [2, "proceso", true]);
    expect(retirarLoVisto(antes).map((a) => a.id)).toEqual([1, 2]);
  });

  it("devuelve la misma referencia si no hay nada visto (sin render de más)", () => {
    const antes = pila([1, "exito", false], [2, "proceso", false]);
    expect(retirarLoVisto(antes)).toBe(antes);
    const vacia: EnLaPila[] = [];
    expect(retirarLoVisto(vacia)).toBe(vacia);
  });

  it("regresión: «Traer de vuelta» + «Enviar a maquila» deja UN solo Deshacer, el nuevo", () => {
    // 1. «Traer de vuelta» responde: se pide el aviso A con su Deshacer. La pantalla sigue ocupada (loader).
    let p = pila([1, "exito", false]);
    expect(retirarLoVisto(p), "aún no se vio: con la pantalla ocupada, espera").toBe(p);
    // 2. La pantalla se libera, A se muestra y su reloj empieza a correr.
    p = [...conVisto(p, 1)];
    // 3. «Enviar a maquila»: la pantalla se ocupa de nuevo → A ya se vio y se retira.
    p = [...retirarLoVisto(p)];
    expect(p).toEqual([]);
    // 4. Responde: se pide el aviso B. Al liberarse, solo B está a la vista.
    p = [...p, { id: 2, tono: "exito", visto: false }];
    expect(retirarLoVisto(p).map((a) => a.id)).toEqual([2]);
  });
});

describe("apartar un aviso con el dedo (ADR-0479)", () => {
  it("no decide hasta que el dedo recorre lo mínimo, y lo que va más de lado que de alto es de lado", () => {
    expect(ejeDelAviso(3, -4)).toBeNull();
    expect(ejeDelAviso(20, 8)).toBe("x");
    expect(ejeDelAviso(-20, 8)).toBe("x");
    expect(ejeDelAviso(4, -20)).toBe("y");
    expect(ejeDelAviso(10, 10)).toBe("y");
  });

  it("de lado y hacia arriba sigue al dedo; hacia abajo resiste y nunca pasa de 24 px", () => {
    expect(posicionDelAviso("x", -80)).toBe(-80);
    expect(posicionDelAviso("y", -30)).toBe(-30);
    expect(posicionDelAviso("y", 10)).toBeLessThan(10);
    expect(posicionDelAviso("y", 400)).toBeLessThan(24);
    expect(posicionDelAviso("y", 0)).toBe(0);
  });

  it("de lado: se va pasado un tercio del ancho o con un tirón en ese sentido", () => {
    expect(salidaDelAviso("x", 130, 0, 343)).toBe("derecha");
    expect(salidaDelAviso("x", -130, 0, 343)).toBe("izquierda");
    expect(salidaDelAviso("x", 60, 0, 343)).toBeNull();
    expect(salidaDelAviso("x", 40, 0.6, 343)).toBe("derecha");
    // Un tirón al revés de donde quedó no lo saca: lo devuelve.
    expect(salidaDelAviso("x", 40, -0.6, 343)).toBeNull();
    expect(salidaDelAviso("x", 0, 0.9, 343)).toBeNull();
  });

  it("hacia arriba: se va pasada la mitad de su alto o con un tirón; hacia abajo nunca", () => {
    expect(salidaDelAviso("y", -40, 0, 64)).toBe("arriba");
    expect(salidaDelAviso("y", -20, 0, 64)).toBeNull();
    expect(salidaDelAviso("y", -12, -0.5, 64)).toBe("arriba");
    expect(salidaDelAviso("y", 30, 2, 64)).toBeNull();
  });

  it("se apaga con el recorrido sin desaparecer, y no se apaga al tirarlo hacia abajo", () => {
    expect(opacidadDelAviso("x", 0, 343)).toBe(1);
    expect(opacidadDelAviso("x", 343, 343)).toBe(0.25);
    expect(opacidadDelAviso("x", -171.5, 343)).toBeCloseTo(0.625);
    expect(opacidadDelAviso("y", 20, 64)).toBe(1);
    expect(opacidadDelAviso("y", -32, 64)).toBeCloseTo(0.625);
    expect(opacidadDelAviso("x", 50, 0)).toBe(1);
  });
});
