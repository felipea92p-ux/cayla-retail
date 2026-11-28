import { describe, expect, it } from "vitest";
import { camposDeGuiaOrden, BORRADOR_VACIO } from "./modelo-nuevo-reglas";
import { fasesIniciales } from "./orden-fases-reglas";
import { MAX_NOTA_EN_RESUMEN, esDeNivelDos, nivelDosPideAbrirse, paresNivelDos } from "./orden-nivel-dos-reglas";

const base = { hayModelo: true, fases: fasesIniciales(), fasesDeSiempre: true, telas: [] as string[], avios: 0, entrega: null, nota: "" };
const leer = (pares: { rotulo: string; valor: string }[]) => pares.map((p) => `${p.rotulo}: ${p.valor}`);

describe("paresNivelDos — lo que habla por lo plegado, dato por dato", () => {
  it("lo de siempre: las fases como nacen, sin tela y sin fecha", () => {
    expect(leer(paresNivelDos(base))).toEqual(["Fases: Las de siempre", "Tela: Sin elegir", "Entrega: Sin fecha"]);
  });
  it("nombra las fases que salen a un servicio, en el orden de la ruta, también cuando nacen así", () => {
    const fases = fasesIniciales().map((f) => (f.clave === "costura" || f.clave === "corte" ? { ...f, quien: "servicio" as const } : f));
    expect(leer(paresNivelDos({ ...base, fases }))).toEqual(["Fases: Las de siempre", "Salen afuera: Corte y Costura", "Tela: Sin elegir", "Entrega: Sin fecha"]);
  });
  it("una sola fase afuera, una tela con su nombre, la fecha y la nota", () => {
    const fases = fasesIniciales().map((f) => (f.clave === "costura" ? { ...f, quien: "servicio" as const } : f));
    expect(leer(paresNivelDos({ ...base, fases, fasesDeSiempre: false, telas: ["Lino crudo"], entrega: "23 oct", nota: "Para la campaña" }))).toEqual([
      "Fases: 5 en total",
      "Sale afuera: Costura",
      "Tela: Lino crudo",
      "Entrega: 23 oct",
      "Nota: Para la campaña",
    ]);
  });
  it("cuenta solo las fases encendidas (Ojales y botones se enciende si el modelo los lleva)", () => {
    const conOjales = fasesIniciales().map((f) => (f.clave === "ojales_botones" ? { ...f, encendida: true } : f));
    expect(leer(paresNivelDos({ ...base, fases: conOjales, fasesDeSiempre: false }))).toContain("Fases: 6 en total");
    expect(leer(paresNivelDos({ ...base, fases: fasesIniciales().map((f) => ({ ...f, encendida: false })), fasesDeSiempre: false }))).toContain("Fases: 0 en total");
  });
  it("varias telas distintas se cuentan (la misma tela en dos colores es una); los avíos van aparte", () => {
    expect(leer(paresNivelDos({ ...base, telas: ["Lino crudo", "Lino negro"] }))).toContain("Tela: 2 telas");
    expect(leer(paresNivelDos({ ...base, telas: ["Lino crudo", "Lino crudo"] }))).toContain("Tela: Lino crudo");
    expect(leer(paresNivelDos({ ...base, avios: 1 }))).toContain("Avíos: 1 elegido");
    expect(leer(paresNivelDos({ ...base, avios: 3 }))).toContain("Avíos: 3 elegidos");
  });
  it("una nota larga se corta: el resto se lee al abrir", () => {
    const nota = paresNivelDos({ ...base, nota: "Entregar primero las tallas chicas porque la campaña empieza el lunes" }).find((p) => p.clave === "nota");
    expect(nota?.valor.length).toBe(MAX_NOTA_EN_RESUMEN);
    expect(nota?.valor.endsWith("…")).toBe(true);
    expect(paresNivelDos({ ...base, nota: "   " }).some((p) => p.clave === "nota")).toBe(false);
  });
  it("sin modelo no inventa fases ni tela: solo habla de la entrega", () => {
    expect(leer(paresNivelDos({ ...base, hayModelo: false }))).toEqual(["Entrega: Sin fecha"]);
    expect(leer(paresNivelDos({ ...base, hayModelo: false, entrega: "5 nov", nota: "Urge" }))).toEqual(["Entrega: 5 nov", "Nota: Urge"]);
  });
  it("ningún valor ni rótulo lleva un punto medio", () => {
    const fases = fasesIniciales().map((f) => ({ ...f, quien: "servicio" as const }));
    for (const p of paresNivelDos({ ...base, fases, telas: ["A", "B"], avios: 2, entrega: "1 dic", nota: "x" })) expect(`${p.rotulo}${p.valor}`).not.toContain("·");
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
