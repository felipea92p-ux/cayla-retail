import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ControlConteo, type ErrorGuardado, type FalloDeGuardado, type PeticionGuardado } from "./control-conteo";
import type { LineaConteo } from "../../lib/conteo-reglas";

// Fecha fija: la hora solo la lee `verificadoEn`, que no se compara.
const AHORA = "2026-09-29T15:00:00.000Z";

/** Una línea como la deja la base al abrir el conteo: pendiente, con lo congelado en `foto`. */
function pendiente(varianteId: string, debeHaber: number): LineaConteo {
  return { varianteId, debeHaber, foto: debeHaber, contada: null, anterior: null, verificadoEn: null, confirmadaEn: null, actual: debeHaber, ajusteMovimientoId: null, ajustadoTotal: 0, ajustadoAntes: 0, hallazgos: 0, aplicadaSinContar: false, diferencia: null, estado: "pendiente" };
}

/** La línea tal como la devuelve `conteo_contar` (jsonb). */
function respuesta(varianteId: string, o: { debeHaber: number; foto?: number; contada: number | null; actual?: number }) {
  return {
    variante_id: varianteId,
    debe_haber: o.debeHaber,
    foto: o.foto ?? o.debeHaber,
    contada: o.contada,
    anterior: null,
    verificado_en: o.contada === null ? null : AHORA,
    confirmada_en: null,
    actual: o.actual ?? o.debeHaber,
    diferencia: o.contada === null ? null : o.contada - o.debeHaber,
    ajuste_movimiento_id: null,
    estado: "x",
  };
}

type Envio = { p: PeticionGuardado; resolver: (r: { data: unknown; error: ErrorGuardado | null }) => void };

/** Un `guardar` que no responde solo: cada prueba decide cuándo y con qué contesta la base. */
function baseControlada() {
  const envios: Envio[] = [];
  const guardar = (p: PeticionGuardado) => new Promise<{ data: unknown; error: ErrorGuardado | null }>((resolver) => envios.push({ p, resolver }));
  return { envios, guardar };
}

function armar(lineas: LineaConteo[], extra: { categoriaDelConteo?: string | null; categoriaDe?: (id: string) => string | null; alFallar?: (f: FalloDeGuardado) => void } = {}) {
  const base = baseControlada();
  const control = new ControlConteo({ lineas, categoriaDelConteo: extra.categoriaDelConteo ?? null, ahora: () => AHORA, esperaMs: 600 });
  control.conectar({ categoriaDe: extra.categoriaDe ?? (() => null), guardar: base.guardar, alFallar: extra.alFallar });
  return { control, ...base };
}

/** Deja correr las promesas ya resueltas (la cola encadena `then`s). */
const microtareas = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("ControlConteo · pintar YA y guardar agrupado", () => {
  it("la línea se ve al instante y una ráfaga de 12 lecturas es UN solo guardado con el total", async () => {
    const { control, envios } = armar([pendiente("v1", 13)]);
    for (let i = 1; i <= 12; i++) control.contar("v1", i);
    expect(control.linea("v1")).toMatchObject({ contada: 12, debeHaber: 13, estado: "con_diferencia", diferencia: -1 });
    expect(envios).toHaveLength(0); // aún no pasaron los 600 ms
    await vi.advanceTimersByTimeAsync(599);
    expect(envios).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(envios).toEqual([expect.objectContaining({ p: { varianteId: "v1", cantidad: 12, confirmoFuera: false } })]);
  });

  it("dos variantes distintas se guardan cada una con su valor, y EN FILA (la segunda espera a la primera)", async () => {
    const { control, envios } = armar([pendiente("a", 5), pendiente("b", 4)]);
    control.contar("a", 5);
    control.contar("b", 3);
    await vi.advanceTimersByTimeAsync(600);
    expect(envios.map((e) => e.p.varianteId)).toEqual(["a"]); // la de b espera turno
    envios[0].resolver({ data: respuesta("a", { debeHaber: 5, contada: 5 }), error: null });
    await microtareas();
    expect(envios.map((e) => e.p.varianteId)).toEqual(["a", "b"]);
  });

  it("la cantidad escrita igual a la que ya está no manda nada", async () => {
    const { control, envios } = armar([{ ...pendiente("v1", 5), contada: 5, estado: "correcta", diferencia: 0 }]);
    expect(control.contar("v1", 5)).toBe("sin_cambio");
    await vi.advanceTimersByTimeAsync(700);
    expect(envios).toHaveLength(0);
  });
});

describe("ControlConteo · vacío no es cero", () => {
  it("borrar el número des-cuenta: la línea vuelve a Pendiente (nunca a 0) y se manda null", async () => {
    const { control, envios } = armar([{ ...pendiente("v1", 13), contada: 9, estado: "con_diferencia", diferencia: -4 }]);
    expect(control.contar("v1", null)).toBe("aplicada");
    expect(control.linea("v1")).toMatchObject({ contada: null, estado: "pendiente", diferencia: null });
    await vi.advanceTimersByTimeAsync(600);
    expect(envios[0].p.cantidad).toBeNull();
  });

  it("el 0 escrito de verdad es una verificación: 6 esperadas y 0 contadas = Faltan 6", () => {
    const { control } = armar([pendiente("v1", 6)]);
    control.contar("v1", 0);
    expect(control.linea("v1")).toMatchObject({ contada: 0, estado: "con_diferencia", diferencia: -6 });
    expect(control.resumen()).toMatchObject({ verificadas: 1, pendientes: 0, conDiferencia: 1, unidadesFaltantes: 6 });
  });

  it("des-contar una variante que nadie contó no hace nada", () => {
    const { control } = armar([]);
    expect(control.contar("nueva", null)).toBe("sin_cambio");
  });
});

describe("ControlConteo · la respuesta de la base manda", () => {
  it("si entre abrir y contar salió una venta, el «Debe haber» de la respuesta corrige la fila (y no es un falso faltante)", async () => {
    const { control, envios } = armar([pendiente("v1", 11)]);
    control.contar("v1", 10);
    // Al pintar, la pantalla creía 11 → «Falta 1». La base leyó 10 (una venta): correcto.
    expect(control.linea("v1")).toMatchObject({ estado: "con_diferencia", diferencia: -1 });
    await vi.advanceTimersByTimeAsync(600);
    envios[0].resolver({ data: respuesta("v1", { debeHaber: 10, foto: 11, contada: 10 }), error: null });
    await microtareas();
    expect(control.linea("v1")).toMatchObject({ debeHaber: 10, foto: 11, contada: 10, estado: "correcta", diferencia: 0 });
  });

  it("si ya hay una edición más nueva, la respuesta vieja no pisa la cantidad pero sí trae el «Debe haber»", async () => {
    const { control, envios } = armar([pendiente("v1", 11)]);
    control.contar("v1", 3);
    await vi.advanceTimersByTimeAsync(600); // sale el «3»
    control.contar("v1", 4); // …y antes de que responda, la persona sigue contando
    envios[0].resolver({ data: respuesta("v1", { debeHaber: 10, foto: 11, contada: 3 }), error: null });
    await microtareas();
    expect(control.linea("v1")).toMatchObject({ contada: 4, debeHaber: 10, foto: 11, diferencia: -6 });
    await vi.advanceTimersByTimeAsync(600); // sale el «4»
    expect(envios).toHaveLength(2);
    envios[1].resolver({ data: respuesta("v1", { debeHaber: 10, foto: 11, contada: 4 }), error: null });
    await microtareas();
    expect(control.linea("v1")).toMatchObject({ contada: 4, debeHaber: 10 });
  });

  it("una variante que no estaba en la foto y a la que se le borra la cantidad desaparece del conteo (regla D3)", async () => {
    const { control, envios } = armar([]);
    control.contar("rara", 2); // inesperada: nadie la esperaba aquí
    expect(control.linea("rara")).toMatchObject({ debeHaber: 0, foto: 0, contada: 2, estado: "con_diferencia", diferencia: 2 });
    await vi.advanceTimersByTimeAsync(600);
    envios[0].resolver({ data: respuesta("rara", { debeHaber: 0, foto: 0, contada: 2 }), error: null });
    await microtareas();
    control.contar("rara", null);
    expect(control.linea("rara")).toBeUndefined();
    await vi.advanceTimersByTimeAsync(600);
    envios[1].resolver({ data: null, error: null }); // la base también la deja fuera y contesta NULL
    await microtareas();
    expect(control.linea("rara")).toBeUndefined();
    expect(control.resumen().variantes).toBe(0);
  });
});

describe("ControlConteo · cuando la base rechaza", () => {
  it("la línea vuelve a lo último que la base confirmó y se avisa con el fallo", async () => {
    const fallos: FalloDeGuardado[] = [];
    const { control, envios } = armar([pendiente("v1", 5)], { alFallar: (f) => fallos.push(f) });
    control.contar("v1", 4);
    await vi.advanceTimersByTimeAsync(600);
    envios[0].resolver({ data: null, error: { message: "sin red", code: "P0001", hint: "cantidad_invalida" } });
    await microtareas();
    expect(control.linea("v1")).toMatchObject({ contada: null, estado: "pendiente" });
    expect(fallos).toEqual([expect.objectContaining({ varianteId: "v1", cantidad: 4, revertida: true, error: expect.objectContaining({ hint: "cantidad_invalida" }) })]);
    expect(control.estadoGuardado()).toBe("error");
  });

  it("una variante nueva que la base rechaza desaparece: nada queda «contado» en pantalla y perdido en la base", async () => {
    const { control, envios } = armar([]);
    control.contar("rara", 1);
    await vi.advanceTimersByTimeAsync(600);
    envios[0].resolver({ data: null, error: { message: "x", hint: "fuera_de_alcance" } });
    await microtareas();
    expect(control.linea("rara")).toBeUndefined();
    expect(control.resumen().variantes).toBe(0);
  });

  it("si ya había una edición más nueva, el fallo viejo no revierte (la nueva decide) y lo dice", async () => {
    const fallos: FalloDeGuardado[] = [];
    const { control, envios } = armar([pendiente("v1", 5)], { alFallar: (f) => fallos.push(f) });
    control.contar("v1", 2);
    await vi.advanceTimersByTimeAsync(600);
    control.contar("v1", 3);
    envios[0].resolver({ data: null, error: { message: "sin red" } });
    await microtareas();
    expect(control.linea("v1")).toMatchObject({ contada: 3 });
    expect(fallos[0].revertida).toBe(false);
  });

  it("una respuesta mal formada cuenta como fallo y no deja basura en pantalla", async () => {
    const fallos: FalloDeGuardado[] = [];
    const { control, envios } = armar([pendiente("v1", 5)], { alFallar: (f) => fallos.push(f) });
    control.contar("v1", 5);
    await vi.advanceTimersByTimeAsync(600);
    envios[0].resolver({ data: "no soy una línea", error: null });
    await microtareas();
    expect(control.linea("v1")).toMatchObject({ contada: null });
    expect(fallos).toHaveLength(1);
  });
});

describe("ControlConteo · fuera de alcance", () => {
  const categoriaDe = (id: string) => (id === "blusa" ? "cat-blusas" : id === "pantalon" ? "cat-pantalones" : null);

  it("una variante de otra categoría, que no estaba en el conteo, pide confirmación y no se anota", () => {
    const { control } = armar([], { categoriaDelConteo: "cat-blusas", categoriaDe });
    expect(control.contar("pantalon", 1)).toBe("fuera_de_alcance");
    expect(control.linea("pantalon")).toBeUndefined();
    expect(control.hayPendientes()).toBe(false);
  });

  it("«Agregar igual» la anota y TODOS sus guardados llevan la confirmación (el segundo escaneo no la vuelve a pedir)", async () => {
    const { control, envios } = armar([], { categoriaDelConteo: "cat-blusas", categoriaDe });
    expect(control.contar("pantalon", 1, { confirmoFuera: true })).toBe("aplicada");
    expect(control.contar("pantalon", 2)).toBe("aplicada"); // ya existe en pantalla: sin nueva pregunta
    await vi.advanceTimersByTimeAsync(600);
    expect(envios[0].p).toEqual({ varianteId: "pantalon", cantidad: 2, confirmoFuera: true });
  });

  it("una variante de la categoría del conteo, o una cuya categoría no se sabe, se anota sin preguntar (la base decide)", () => {
    const { control } = armar([], { categoriaDelConteo: "cat-blusas", categoriaDe });
    expect(control.contar("blusa", 1)).toBe("aplicada");
    expect(control.contar("desconocida", 1)).toBe("aplicada");
  });

  it("en un conteo de todo nunca hay fuera de alcance", () => {
    const { control } = armar([], { categoriaDelConteo: null, categoriaDe });
    expect(control.contar("pantalon", 1)).toBe("aplicada");
  });
});

describe("ControlConteo · resumen, suscripciones y terminar", () => {
  it("solo se entera la fila que cambió; la estructura solo avisa cuando una línea aparece o desaparece", async () => {
    const { control } = armar([pendiente("a", 5), pendiente("b", 5)]);
    const a = vi.fn();
    const b = vi.fn();
    const resumen = vi.fn();
    const estructura = vi.fn();
    control.suscribirLinea("a", a);
    control.suscribirLinea("b", b);
    control.suscribirResumen(resumen);
    control.suscribirEstructura(estructura);

    control.contar("a", 5);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
    expect(resumen).toHaveBeenCalledTimes(1);
    expect(estructura).not.toHaveBeenCalled();

    control.contar("nueva", 1);
    expect(estructura).toHaveBeenCalledTimes(1);
    expect(control.versionEstructura()).toBe(1);
    void microtareas();
  });

  it("el resumen cambia con cada línea y es la misma referencia mientras nada cambie", () => {
    const { control } = armar([pendiente("a", 13), pendiente("b", 11), pendiente("c", 5)]);
    expect(control.resumen()).toMatchObject({ variantes: 3, verificadas: 0, pendientes: 3 });
    control.contar("a", 13); // correcta
    control.contar("b", 9); // faltan 2
    control.contar("c", 6); // hay 1 de más
    const r = control.resumen();
    expect(r).toMatchObject({ variantes: 3, verificadas: 3, pendientes: 0, correctas: 1, conDiferencia: 2, unidadesFaltantes: 2, unidadesSobrantes: 1 });
    expect(control.resumen()).toBe(r);
  });

  it("terminar() suelta lo que espera, espera la respuesta y dice que todo se guardó", async () => {
    const { control, envios } = armar([pendiente("a", 5)]);
    control.contar("a", 5);
    const terminado = control.terminar();
    await microtareas();
    expect(envios).toHaveLength(1); // salió sin esperar los 600 ms
    envios[0].resolver({ data: respuesta("a", { debeHaber: 5, contada: 5 }), error: null });
    expect(await terminado).toBe(true);
    expect(control.hayPendientes()).toBe(false);
    expect(control.estadoGuardado()).toBe("guardado");
  });

  it("terminar() dice que NO si un guardado falló: quien navega debe quedarse para reintentar", async () => {
    const { control, envios } = armar([pendiente("a", 5)]);
    control.contar("a", 5);
    const terminado = control.terminar();
    await microtareas();
    envios[0].resolver({ data: null, error: { message: "sin red" } });
    expect(await terminado).toBe(false);
  });

  it("soltar() manda lo pendiente sin esperar (al salir de la pantalla no se pierde la última lectura)", async () => {
    const { control, envios } = armar([pendiente("a", 5)]);
    control.contar("a", 4);
    expect(control.hayPendientes()).toBe(true);
    control.soltar();
    await microtareas();
    expect(envios).toHaveLength(1);
  });
});

describe("ControlConteo · «Aplicar todos completos» (ADR-0328): nada se pinta antes de que la base responda", () => {
  /** La línea aplicada como la devuelve `conteo_aplicar_completos`: lo que hay ahora, con la marca. */
  const aplicada = (varianteId: string, n: number) => ({ ...respuesta(varianteId, { debeHaber: n, contada: n }), aplicada_sin_contar: true });

  it("espera a la base: mientras no responde, las líneas siguen pendientes; con la respuesta quedan «sin contar» y devuelve cuántas", async () => {
    const { control } = armar([pendiente("a", 5), pendiente("b", 3)]);
    let responder!: (r: { data: unknown; error: ErrorGuardado | null }) => void;
    const pedidas: string[][] = [];
    const resultado = control.aplicarCompletos(["a", "b"], (ids) => {
      pedidas.push(ids);
      return new Promise((r) => (responder = r));
    });
    await microtareas();
    expect(pedidas).toEqual([["a", "b"]]);
    expect(control.linea("a")).toMatchObject({ contada: null, estado: "pendiente" });
    expect(control.estadoGuardado()).toBe("guardando");
    // Entre abrir y aplicar se vendió una «b»: la base anota lo que hay AHORA (2), sin falsa diferencia.
    responder({ data: { aplicadas: 2, lineas: [aplicada("a", 5), aplicada("b", 2)] }, error: null });
    expect(await resultado).toEqual({ aplicadas: 2, sinContar: 2 });
    expect(control.linea("a")).toMatchObject({ contada: 5, estado: "correcta", aplicadaSinContar: true });
    expect(control.linea("b")).toMatchObject({ contada: 2, debeHaber: 2, estado: "correcta", aplicadaSinContar: true });
    expect(control.resumen()).toMatchObject({ verificadas: 2, sinContar: 2 });
    expect(control.estadoGuardado()).toBe("guardado");
  });

  it("va en la MISMA fila que los guardados por variante: primero sale lo que esperaba su turno", async () => {
    const { control, envios } = armar([pendiente("a", 5), pendiente("b", 3)]);
    control.contar("a", 4); // esperaba sus 600 ms
    const orden: string[] = [];
    const resultado = control.aplicarCompletos(["b"], async () => {
      orden.push("aplicar");
      return { data: { aplicadas: 1, lineas: [aplicada("b", 3)] }, error: null };
    });
    await microtareas();
    expect(envios.map((e) => e.p.varianteId)).toEqual(["a"]); // salió ya, sin esperar los 600 ms
    expect(orden).toEqual([]); // y aplicar espera a que la base conteste ese guardado
    envios[0].resolver({ data: respuesta("a", { debeHaber: 5, contada: 4 }), error: null });
    expect(await resultado).toEqual({ aplicadas: 1, sinContar: 1 });
    expect(orden).toEqual(["aplicar"]);
    expect(control.linea("a")).toMatchObject({ contada: 4, aplicadaSinContar: false });
  });

  it("si la base rechaza (o responde algo ilegible, o se corta), nada cambia en pantalla y se devuelve el error", async () => {
    const { control } = armar([pendiente("a", 5)]);
    const r1 = await control.aplicarCompletos(["a"], async () => ({ data: null, error: { message: "Ese conteo ya está cerrado" } }));
    expect(r1).toEqual({ error: { message: "Ese conteo ya está cerrado" } });
    expect(control.linea("a")).toMatchObject({ contada: null, estado: "pendiente", aplicadaSinContar: false });
    expect(control.estadoGuardado()).toBe("error");
    const r2 = await control.aplicarCompletos(["a"], async () => ({ data: { aplicadas: "1" }, error: null }));
    expect(r2).toEqual({ error: { message: "La respuesta del conteo llegó mal formada." } });
    const r3 = await control.aplicarCompletos(["a"], async () => {
      throw new Error("sin red");
    });
    expect(r3).toEqual({ error: { message: "sin red" } });
    expect(control.linea("a")).toMatchObject({ contada: null });
  });

  it("un reintento (la primera vez se guardó y la respuesta se perdió): la base anota 0 pero devuelve las líneas marcadas, y se cuentan", async () => {
    const { control } = armar([pendiente("a", 5), pendiente("b", 3)]);
    const r = await control.aplicarCompletos(["a", "b"], async () => ({ data: { aplicadas: 0, lineas: [aplicada("a", 5), aplicada("b", 3)] }, error: null }));
    expect(r).toEqual({ aplicadas: 0, sinContar: 2 });
    expect(control.linea("b")).toMatchObject({ contada: 3, aplicadaSinContar: true });
  });

  it("contar a mano una línea aplicada la vuelve contada de verdad (se pinta sin la marca)", async () => {
    const { control } = armar([pendiente("a", 5)]);
    await control.aplicarCompletos(["a"], async () => ({ data: { aplicadas: 1, lineas: [aplicada("a", 5)] }, error: null }));
    expect(control.linea("a")?.aplicadaSinContar).toBe(true);
    control.contar("a", 4);
    expect(control.linea("a")).toMatchObject({ contada: 4, aplicadaSinContar: false, estado: "con_diferencia" });
  });
});
