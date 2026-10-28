import { describe, expect, it } from "vitest";
import { camposDeGuiaOrden, BORRADOR_VACIO } from "./modelo-nuevo-reglas";
import { fasesIniciales } from "./orden-fases-reglas";
import { esDeNivelDos, nivelDosPideAbrirse, resumenNivelDos } from "./orden-nivel-dos-reglas";

const base = { hayModelo: true, fases: fasesIniciales(), telasElegidas: 0, entrega: null, hayNota: false };

describe("resumenNivelDos — la línea que habla por lo plegado", () => {
  it("lo de siempre: siete fases en el Taller, sin tela y sin fecha", () => {
    expect(resumenNivelDos(base)).toBe("7 fases · todo en el Taller · sin tela elegida · sin fecha de entrega");
  });
  it("nombra las fases que salen a un servicio, en el orden de la ruta", () => {
    const fases = fasesIniciales().map((f) => (f.clave === "costura" || f.clave === "corte" ? { ...f, quien: "servicio" as const } : f));
    expect(resumenNivelDos({ ...base, fases })).toBe("7 fases · 2 afuera (Corte, Costura) · sin tela elegida · sin fecha de entrega");
  });
  it("una fase por definir se dice con su nombre y nunca queda escondida bajo «todo en el Taller» (ADR-0550)", () => {
    const fases = fasesIniciales().map((f) => (f.clave === "corte" ? { ...f, quien: "por_definir" as const } : f));
    expect(resumenNivelDos({ ...base, fases })).toBe("7 fases · por definir quién (Corte) · sin tela elegida · sin fecha de entrega");
    const mixtas = fasesIniciales().map((f) => (f.clave === "corte" ? { ...f, quien: "por_definir" as const } : f.clave === "costura" ? { ...f, quien: "servicio" as const } : f));
    expect(resumenNivelDos({ ...base, fases: mixtas })).toBe("7 fases · 1 afuera (Costura) · por definir quién (Corte) · sin tela elegida · sin fecha de entrega");
  });
  it("una sola fase afuera, una tela, la fecha y la nota", () => {
    const fases = fasesIniciales().map((f) => (f.clave === "costura" ? { ...f, quien: "servicio" as const } : f));
    expect(resumenNivelDos({ ...base, fases, telasElegidas: 1, entrega: "23 oct", hayNota: true })).toBe("7 fases · 1 afuera (Costura) · 1 tela · entrega 23 oct · con nota");
  });
  it("cuenta solo las fases encendidas (Ojales y botones se enciende si el modelo los lleva)", () => {
    const conOjales = fasesIniciales().map((f) => (f.clave === "ojales_botones" ? { ...f, encendida: true } : f));
    expect(resumenNivelDos({ ...base, fases: conOjales })).toContain("8 fases");
    expect(resumenNivelDos({ ...base, fases: fasesIniciales().map((f) => ({ ...f, encendida: false })) })).toContain("0 fases");
  });
  it("dos telas, en plural", () => {
    expect(resumenNivelDos({ ...base, telasElegidas: 2 })).toContain("2 telas");
  });
  it("sin modelo no inventa fases ni tela: solo habla de la entrega", () => {
    expect(resumenNivelDos({ ...base, hayModelo: false })).toBe("sin fecha de entrega");
    expect(resumenNivelDos({ ...base, hayModelo: false, entrega: "5 nov", hayNota: true })).toBe("entrega 5 nov · con nota");
  });
});

describe("nivelDosPideAbrirse — lo que está mal nunca queda escondido", () => {
  const nada = { problemasFases: 0, problemasTela: 0, entregaMala: null };
  it("sin problemas, queda plegado", () => {
    expect(nivelDosPideAbrirse(nada)).toBe(false);
  });
  it("una fase de afuera sin servicio, una tela mal escrita o una entrega pasada lo abren", () => {
    expect(nivelDosPideAbrirse({ ...nada, problemasFases: 1 })).toBe(true);
    expect(nivelDosPideAbrirse({ ...nada, problemasTela: 2 })).toBe(true);
    expect(nivelDosPideAbrirse({ ...nada, entregaMala: "La entrega no puede ser antes de hoy." })).toBe(true);
  });
});

describe("esDeNivelDos — a qué campos de la guía hay que abrirles el pliegue", () => {
  it("son exactamente los de la guía que viven dentro: fases y tela", () => {
    const campos = camposDeGuiaOrden({ esNuevo: false, hayModelo: true, borrador: BORRADOR_VACIO, celdas: [], totalExistente: 3, fases: { falta: "x" }, tela: { falta: null, elegida: false } });
    const dentro = campos.filter((c) => esDeNivelDos(c.id)).map((c) => c.id);
    expect(dentro).toEqual(["fases", "tela"]);
    // Lo que la persona decide primero (modelo, cuántas) nunca se esconde.
    for (const id of ["modelo", "cantidades", "nombre", "categoria", "tallas", "precio"]) expect(esDeNivelDos(id), id).toBe(false);
  });
});
