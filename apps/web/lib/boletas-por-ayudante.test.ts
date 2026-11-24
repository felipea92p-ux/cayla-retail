import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * La Mac de la caja sabe que es la caja preguntándole a su ayudante si ve la ticketera (`boletasPorAyudante`, ADR-0670). El 2026-11-24 la
 * estación de TRU se apagó entre dos ventas del piso: una respuesta falló, la Mac se dio por «no soy la caja» y no volvió a preguntar
 * hasta recargar, con dos boletas esperando en la cola. Estas pruebas recorren eso sin recargar el módulo entre pasos.
 */

const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const CON_TICKETERA = { ok: true, version: 4, chrome: true, impresora: false, ticketera: true };
const SIN_TICKETERA = { ...CON_TICKETERA, ticketera: false };

type Respuesta = object | "falla";

function equipo(userAgent: string, respuestas: Respuesta[]) {
  const preguntas: string[] = [];
  const oyentesPestana = new Map<string, () => void>();
  const pestana = { visibilityState: "visible" as "visible" | "hidden" };
  vi.stubGlobal("navigator", { userAgent, platform: userAgent.includes("iPhone") ? "iPhone" : "MacIntel" });
  vi.stubGlobal("window", { setInterval, clearInterval, setTimeout, clearTimeout });
  vi.stubGlobal("document", {
    get visibilityState() {
      return pestana.visibilityState;
    },
    addEventListener: (tipo: string, f: () => void) => oyentesPestana.set(tipo, f),
    removeEventListener: (tipo: string) => oyentesPestana.delete(tipo),
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      preguntas.push(url);
      const r = respuestas.length > 1 ? respuestas.shift()! : respuestas[0];
      if (r === "falla") throw new Error("el ayudante no respondió a tiempo");
      return { json: async () => r };
    }),
  );
  return {
    preguntas,
    volverALaPestana: () => {
      pestana.visibilityState = "visible";
      oyentesPestana.get("visibilitychange")?.();
    },
    escuchaLaPestana: () => oyentesPestana.has("visibilitychange"),
  };
}

/** Deja correr las promesas pendientes (la respuesta del ayudante) sin adelantar el reloj. */
const responder = () => vi.advanceTimersByTimeAsync(0);

async function cargar() {
  vi.resetModules();
  return import("./ayudante-de-boletas");
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("boletasPorAyudante: la caja no se apaga para siempre por una respuesta fallida", () => {
  it("una respuesta falla, la estación se apaga y a los 30 s vuelve sola, sin recargar", async () => {
    const e = equipo(MAC, [CON_TICKETERA, "falla", CON_TICKETERA]);
    const { boletasPorAyudante, comprobarBoletasPorAyudante } = await cargar();
    const avisos = vi.fn();
    const soltar = boletasPorAyudante.suscribir(avisos);
    await responder();
    expect(boletasPorAyudante.leer()).toBe(true);

    // Algo vuelve a preguntar (imprimir, «Venta registrada») y esa vez el ayudante no contesta: la Mac deja de ser la caja.
    await vi.advanceTimersByTimeAsync(31_000);
    await comprobarBoletasPorAyudante();
    await responder();
    expect(boletasPorAyudante.leer()).toBe(false);

    // Antes nadie volvía a preguntar. Ahora el reloj pregunta de nuevo y la estación vuelve, avisando a quien escucha.
    await vi.advanceTimersByTimeAsync(30_000);
    expect(boletasPorAyudante.leer()).toBe(true);
    expect(avisos.mock.calls.length).toBeGreaterThanOrEqual(3);
    soltar();
  });

  it("al volver a la pestaña pregunta enseguida, sin esperar al reloj", async () => {
    const e = equipo(MAC, ["falla", CON_TICKETERA]);
    const { boletasPorAyudante } = await cargar();
    const soltar = boletasPorAyudante.suscribir(() => {});
    await responder();
    expect(boletasPorAyudante.leer()).toBe(false);
    const antes = e.preguntas.length;

    e.volverALaPestana();
    await responder();
    expect(e.preguntas.length).toBe(antes + 1);
    expect(boletasPorAyudante.leer()).toBe(true);
    soltar();
  });

  it("si una boleta no sale, pregunta de nuevo enseguida y no apaga la caja mientras espera la respuesta", async () => {
    const e = equipo(MAC, [CON_TICKETERA, CON_TICKETERA]);
    const { boletasPorAyudante, repreguntarAlAyudante } = await cargar();
    const soltar = boletasPorAyudante.suscribir(() => {});
    await responder();
    const antes = e.preguntas.length;

    repreguntarAlAyudante();
    expect(boletasPorAyudante.leer()).toBe(true);
    await responder();
    expect(e.preguntas.length).toBe(antes + 1);
    expect(boletasPorAyudante.leer()).toBe(true);
    soltar();
  });

  it("si la ticketera de verdad no está, sigue sin ser la caja (no inventa una estación)", async () => {
    equipo(MAC, [SIN_TICKETERA]);
    const { boletasPorAyudante } = await cargar();
    const soltar = boletasPorAyudante.suscribir(() => {});
    await vi.advanceTimersByTimeAsync(95_000);
    expect(boletasPorAyudante.leer()).toBe(false);
    soltar();
  });

  it("un solo reloj para todos los que escuchan, y se va con el último", async () => {
    const e = equipo(MAC, [CON_TICKETERA]);
    const { boletasPorAyudante } = await cargar();
    const soltarA = boletasPorAyudante.suscribir(() => {});
    const soltarB = boletasPorAyudante.suscribir(() => {});
    await responder();
    const antes = e.preguntas.length;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(e.preguntas.length).toBe(antes + 1);

    soltarA();
    expect(e.escuchaLaPestana()).toBe(true);
    soltarB();
    expect(e.escuchaLaPestana()).toBe(false);
    const alSoltar = e.preguntas.length;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(e.preguntas.length).toBe(alSoltar);
  });

  it("en un celular no hay ayudante: ni pregunta ni deja relojes", async () => {
    const e = equipo(IPHONE, [CON_TICKETERA]);
    const { boletasPorAyudante } = await cargar();
    const soltar = boletasPorAyudante.suscribir(() => {});
    await vi.advanceTimersByTimeAsync(120_000);
    expect(e.preguntas).toEqual([]);
    expect(e.escuchaLaPestana()).toBe(false);
    expect(boletasPorAyudante.leer()).toBe(false);
    soltar();
  });
});
