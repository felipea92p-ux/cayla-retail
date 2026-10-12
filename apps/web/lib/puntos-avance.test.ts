import { describe, expect, it } from "vitest";
import { puntosDeAvance, type EstadoPaso, type PasoDeAvance } from "./puntos-avance";

const pasos = (estados: EstadoPaso[], abribles: boolean[] = estados.map((e) => e !== "pendiente")): PasoDeAvance[] =>
  estados.map((estado, i) => ({ numero: i + 1, estado, abrible: abribles[i] }));

describe("puntosDeAvance — los 4 puntos de Nuevo producto", () => {
  it("al entrar: el primero es «Estás aquí», el segundo «Sigue» y la línea no tiene nada lleno", () => {
    const { puntos, lleno } = puntosDeAvance(pasos(["abierto", "pendiente", "pendiente", "pendiente"]));
    expect(puntos.map((p) => p.tipo)).toEqual(["aqui", "sigue", "falta", "falta"]);
    expect(puntos.map((p) => p.rotulo)).toEqual(["Estás aquí", "Sigue", "", ""]);
    expect(lleno).toBe(0);
  });

  it("en el paso 3: los dos anteriores son «Listo» y la línea llega hasta el tercer punto (2/3)", () => {
    const { puntos, lleno } = puntosDeAvance(pasos(["hecho", "hecho", "abierto", "pendiente"]));
    expect(puntos.map((p) => p.tipo)).toEqual(["hecho", "hecho", "aqui", "sigue"]);
    expect(lleno).toBeCloseTo(2 / 3);
  });

  it("el paso abierto nunca es tocable; los hechos sí (para volver a cambiarlos)", () => {
    const { puntos } = puntosDeAvance(pasos(["hecho", "abierto", "pendiente", "pendiente"]));
    expect(puntos.map((p) => p.tocable)).toEqual([true, false, false, false]);
  });

  it("volver a un paso anterior: los de después siguen «Listo» y la línea se acorta hasta el abierto", () => {
    const { puntos, lleno } = puntosDeAvance(pasos(["abierto", "hecho", "hecho", "pendiente"], [true, true, true, true]));
    expect(puntos.map((p) => p.tipo)).toEqual(["aqui", "hecho", "hecho", "sigue"]);
    expect(lleno).toBe(0);
  });

  it("un paso que viene armado y no se abrió todavía dice «Por revisar» y se puede tocar", () => {
    const { puntos } = puntosDeAvance(pasos(["hecho", "abierto", "pendiente", "pendiente"], [true, true, true, true]));
    expect(puntos[2]).toMatchObject({ tipo: "sigue", rotulo: "Sigue", tocable: true });
    expect(puntos[3]).toMatchObject({ tipo: "falta", rotulo: "Por revisar", tocable: true });
  });

  it("los puntos van de borde a borde: 0, 1/3, 2/3 y 1", () => {
    const { puntos } = puntosDeAvance(pasos(["abierto", "pendiente", "pendiente", "pendiente"]));
    expect(puntos.map((p) => p.posicion)).toEqual([0, 1 / 3, 2 / 3, 1]);
  });

  it("todo hecho y ninguno abierto: la línea queda llena", () => {
    expect(puntosDeAvance(pasos(["hecho", "hecho", "hecho", "hecho"])).lleno).toBe(1);
  });

  it("hay exactamente un «Estás aquí» cuando un paso está abierto", () => {
    for (let abierto = 0; abierto < 4; abierto++) {
      const estados = [0, 1, 2, 3].map((i): EstadoPaso => (i === abierto ? "abierto" : i < abierto ? "hecho" : "pendiente"));
      expect(puntosDeAvance(pasos(estados)).puntos.filter((p) => p.tipo === "aqui")).toHaveLength(1);
    }
  });
});
