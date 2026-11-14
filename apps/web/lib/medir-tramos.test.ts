import { describe, expect, it } from "vitest";
import { crearMedidor, lineaDeTramos, tamanoJson, type Tramo } from "./medir-tramos";

/** Un reloj que se mueve a mano: así cada prueba dice exactamente cuántos ms pasaron. */
function relojManual(inicio = 1000) {
  let t = inicio;
  return { reloj: () => t, avanzar: (ms: number) => (t += ms) };
}

/** Una promesa que se resuelve (o falla) cuando la prueba lo dice. */
function lecturaManual<T>() {
  let responder!: (v: T) => void;
  let fallar!: (e: unknown) => void;
  const promesa = new Promise<T>((res, rej) => {
    responder = res;
    fallar = rej;
  });
  return { promesa, responder, fallar };
}

describe("crearMedidor", () => {
  it("mide cada lectura desde que empezó la pantalla y no cambia lo que responde", async () => {
    const { reloj, avanzar } = relojManual();
    const m = crearMedidor(reloj);
    avanzar(5);
    const prendas = lecturaManual<string[]>();
    const medida = m.medir("existencias", prendas.promesa);
    avanzar(120);
    prendas.responder(["a", "b"]);
    await expect(medida).resolves.toEqual(["a", "b"]);
    const { tramos } = m.foto();
    expect(tramos).toEqual([{ nombre: "existencias", desde: 5, hasta: 125, fallo: false }]);
  });

  it("una lectura que falla sigue fallando igual y queda marcada", async () => {
    const { reloj, avanzar } = relojManual();
    const m = crearMedidor(reloj);
    const plan = lecturaManual<number>();
    const medida = m.medir("plan", plan.promesa);
    avanzar(770);
    const error = new Error("la base no respondió");
    plan.fallar(error);
    await expect(medida).rejects.toBe(error);
    expect(m.foto().tramos[0]).toMatchObject({ nombre: "plan", hasta: 770, fallo: true });
  });

  it("`todas` espera también a la lectura encadenada que arranca mientras se espera, y nunca lanza", async () => {
    const { reloj, avanzar } = relojManual();
    const m = crearMedidor(reloj);
    const prendas = lecturaManual<string[]>();
    const ritmo = lecturaManual<number>();
    const fallida = lecturaManual<number>();
    // El ritmo empieza recién cuando llegan las prendas (como en la página).
    m.medir("existencias", prendas.promesa).then(() => m.medir("ritmo", ritmo.promesa));
    m.medir("catalogo", fallida.promesa).catch(() => null);
    let listo = false;
    const espera = m.todas().then(() => (listo = true));
    avanzar(100);
    prendas.responder([]);
    fallida.fallar(new Error("x"));
    await Promise.resolve();
    await Promise.resolve();
    expect(listo).toBe(false);
    avanzar(50);
    ritmo.responder(3);
    await espera;
    expect(listo).toBe(true);
    expect(m.foto().tramos.map((t) => [t.nombre, t.desde, t.hasta])).toEqual([
      ["existencias", 0, 100],
      ["catalogo", 0, 100],
      ["ritmo", 100, 150],
    ]);
  });

  it("marca un momento con nombre", () => {
    const { reloj, avanzar } = relojManual();
    const m = crearMedidor(reloj);
    avanzar(840);
    m.marcar("lista");
    expect(m.foto().marcas).toEqual({ lista: 840 });
  });
});

describe("lineaDeTramos", () => {
  const tramos: Tramo[] = [
    { nombre: "existencias", desde: 0.4, hasta: 134.6, fallo: false },
    { nombre: "ritmo", desde: 134.6, hasta: 410.2, fallo: false },
    { nombre: "plan", desde: 0.5, hasta: 770.4, fallo: false },
  ];

  it("arma la línea con ms enteros, el fin de cada tramo, la lista y el total", () => {
    const linea = lineaDeTramos("existencias_tramos", { sedeId: "sede-1", tramos, marcas: { lista: 431.7 }, ahora: 900, bytes: { panel: 812_345, plan: 40_210 } });
    expect(linea).toEqual({
      evento: "existencias_tramos",
      sede_id: "sede-1",
      lista_ms: 432,
      total_ms: 770,
      tramos: {
        existencias: { ms: 134, fin: 135 },
        ritmo: { ms: 276, fin: 410 },
        plan: { ms: 770, fin: 770 },
      },
      bytes: { panel: 812_345, plan: 40_210 },
    });
  });

  it("lleva solo nombres de tramo, ms, bytes y el id de la sede (ADR-0424): ninguna otra llave", () => {
    const linea = lineaDeTramos("existencias_tramos", { sedeId: "sede-1", tramos, marcas: { lista: 400 }, ahora: 900, bytes: { panel: 1 } });
    expect(Object.keys(linea).sort()).toEqual(["bytes", "evento", "lista_ms", "sede_id", "total_ms", "tramos"]);
    for (const t of Object.values(linea.tramos)) expect(Object.keys(t).sort()).toEqual(["fin", "ms"]);
  });

  it("dice qué lecturas fallaron, y solo si alguna falló", () => {
    const conFallo = lineaDeTramos("x", { sedeId: null, tramos: [{ nombre: "plan", desde: 0, hasta: 50, fallo: true }], marcas: {}, ahora: 60 });
    expect(conFallo.fallaron).toEqual(["plan"]);
    const sinFallo = lineaDeTramos("x", { sedeId: null, tramos: [{ nombre: "plan", desde: 0, hasta: 50, fallo: false }], marcas: {}, ahora: 60 });
    expect("fallaron" in sinFallo).toBe(false);
  });

  it("un tramo que no terminó no inventa su duración: el total es el de ahora", () => {
    const linea = lineaDeTramos("x", { sedeId: null, tramos: [{ nombre: "plan", desde: 0, hasta: null, fallo: false }], marcas: { lista: 300 }, ahora: 1200 });
    expect(linea.tramos.plan).toEqual({ ms: null, fin: null });
    expect(linea.total_ms).toBe(1200);
  });

  it("un nombre repetido no pisa al primero", () => {
    const linea = lineaDeTramos("x", {
      sedeId: null,
      tramos: [
        { nombre: "plan", desde: 0, hasta: 10, fallo: false },
        { nombre: "plan", desde: 0, hasta: 20, fallo: false },
      ],
      marcas: {},
      ahora: 20,
    });
    expect(Object.keys(linea.tramos)).toEqual(["plan", "plan_2"]);
  });
});

describe("tamanoJson", () => {
  it("cuenta bytes UTF-8 del JSON (una tilde pesa dos)", () => {
    expect(tamanoJson({ a: "n" })).toBe(9);
    expect(tamanoJson({ a: "ñ" })).toBe(10);
  });

  it("un Map cuenta como sus pares, un Set como su lista; una promesa o una función no cuentan", () => {
    expect(tamanoJson(new Map([["v", 1]]))).toBe(tamanoJson([["v", 1]]));
    expect(tamanoJson(new Set(["a"]))).toBe(tamanoJson(["a"]));
    expect(tamanoJson({ a: 1, plan: Promise.resolve(1), f: () => 1 })).toBe(tamanoJson({ a: 1 }));
  });

  it("lo que no se puede serializar da null, nunca lanza", () => {
    const circular: Record<string, unknown> = {};
    circular.yo = circular;
    expect(tamanoJson(circular)).toBeNull();
  });
});
