import { describe, expect, it } from "vitest";
import { estadosDe } from "./guia-campos";
import { BORRADOR_VACIO, camposDeGuiaOrden } from "./modelo-nuevo-reglas";
import { AYUDA_DEL_RESTO, PASOS_DE_LA_ORDEN, VOZ_DEL_PASO, ayudaDeCantidades, camposDelPaso, estadoDelPaso, type ClaveDePaso } from "./orden-pasos-reglas";

// Contrato en `orden-pasos-reglas.ts`: los pasos solo agrupan y nombran lo que la guía de foco ya sabe.

const PASOS: ClaveDePaso[] = ["modelo", "cantidades", "resto"];
const guiaDe = (o: { esNuevo: boolean; hayModelo: boolean; total: number; faltaFase?: string | null }) =>
  camposDeGuiaOrden({ esNuevo: o.esNuevo, hayModelo: o.hayModelo, borrador: BORRADOR_VACIO, celdas: [], totalExistente: o.total, fases: { falta: o.faltaFase ?? null }, tela: { falta: null, elegida: false } });
const estadosDelPaso = (paso: ClaveDePaso, esNuevo: boolean, campos: ReturnType<typeof guiaDe>) => {
  const estados = estadosDe(campos);
  return camposDelPaso(paso, esNuevo).map((id) => estados[id] ?? "opcional");
};

describe("los tres pasos de Nueva orden", () => {
  it("van numerados del 1 al 3, con las palabras de la maqueta", () => {
    expect(PASOS.map((p) => PASOS_DE_LA_ORDEN[p].numero)).toEqual([1, 2, 3]);
    expect(PASOS.map((p) => PASOS_DE_LA_ORDEN[p].titulo)).toEqual(["Qué se fabrica", "Cuántas, por talla y color", "Fases, tela y entrega"]);
  });

  it("todo campo de la guía de la orden vive en un paso, y solo en uno (con un modelo que existe y con uno nuevo)", () => {
    for (const esNuevo of [false, true]) {
      const deLaGuia = guiaDe({ esNuevo, hayModelo: false, total: 0 }).map((c) => c.id);
      const deLosPasos = PASOS.flatMap((p) => camposDelPaso(p, esNuevo));
      expect([...deLosPasos].sort(), String(esNuevo)).toEqual([...deLaGuia].sort());
      expect(new Set(deLosPasos).size).toBe(deLosPasos.length);
    }
  });
});

describe("estadoDelPaso — sale de lo que la guía ya sabe", () => {
  it("el paso que tiene el campo que la guía señala es el que «sigue», aunque tenga otros hechos", () => {
    expect(estadoDelPaso(["hecho", "ahora", "falta"])).toBe("sigue");
  });
  it("con algo que falta y sin ser el que sigue, queda pendiente", () => {
    expect(estadoDelPaso(["hecho", "falta"])).toBe("pendiente");
  });
  it("sin nada que falte y con algo hecho, está hecho; lo opcional no estorba", () => {
    expect(estadoDelPaso(["hecho", "opcional"])).toBe("hecho");
    expect(estadoDelPaso(["hecho"])).toBe("hecho");
  });
  it("un paso sin nada hecho (todo opcional, o sin campos) no se da por hecho", () => {
    expect(estadoDelPaso(["opcional"])).toBe("pendiente");
    expect(estadoDelPaso([])).toBe("pendiente");
  });
  it("un paso que viene armado y nadie abrió conserva su número; si algo adentro pide atención, sigue igual", () => {
    expect(estadoDelPaso(["hecho", "opcional"], false)).toBe("pendiente");
    expect(estadoDelPaso(["hecho", "opcional"], true)).toBe("hecho");
    expect(estadoDelPaso(["ahora", "opcional"], false)).toBe("sigue");
  });

  it("el recorrido de un modelo que ya existe: 1 sigue → 2 sigue → todo hecho, y nunca hay dos pasos que «siguen»", () => {
    const sinModelo = guiaDe({ esNuevo: false, hayModelo: false, total: 0 });
    expect(PASOS.map((p) => estadoDelPaso(estadosDelPaso(p, false, sinModelo), p !== "resto"))).toEqual(["sigue", "pendiente", "pendiente"]);
    const conModelo = guiaDe({ esNuevo: false, hayModelo: true, total: 0 });
    expect(PASOS.map((p) => estadoDelPaso(estadosDelPaso(p, false, conModelo), p !== "resto"))).toEqual(["hecho", "sigue", "pendiente"]);
    const conCantidades = guiaDe({ esNuevo: false, hayModelo: true, total: 24 });
    expect(PASOS.map((p) => estadoDelPaso(estadosDelPaso(p, false, conCantidades), true))).toEqual(["hecho", "hecho", "hecho"]);
    for (const campos of [sinModelo, conModelo, conCantidades]) {
      expect(PASOS.filter((p) => estadoDelPaso(estadosDelPaso(p, false, campos)) === "sigue").length).toBeLessThanOrEqual(1);
    }
  });

  it("una fase de afuera sin servicio hace que el paso 3 sea el que sigue cuando lo demás está listo", () => {
    const campos = guiaDe({ esNuevo: false, hayModelo: true, total: 24, faltaFase: "Elige quién hace la costura." });
    expect(PASOS.map((p) => estadoDelPaso(estadosDelPaso(p, false, campos), true))).toEqual(["hecho", "hecho", "sigue"]);
  });

  it("un modelo nuevo empieza por el paso 1 (su tipo) y el paso 2 espera", () => {
    const campos = guiaDe({ esNuevo: true, hayModelo: false, total: 0 });
    expect(estadoDelPaso(estadosDelPaso("modelo", true, campos))).toBe("sigue");
    expect(estadoDelPaso(estadosDelPaso("cantidades", true, campos))).toBe("pendiente");
  });

  it("cada estado tiene su palabra para el lector de pantalla", () => {
    expect(VOZ_DEL_PASO).toEqual({ hecho: "Hecho", sigue: "Sigue", pendiente: "Pendiente" });
  });
});

describe("lo que explica el «?» de cada paso", () => {
  it("el del paso 2 solo habla de la raya si la tabla tiene alguna, y del número gris si las ventas sugieren", () => {
    expect(ayudaDeCantidades({ hayRayas: false, conSugerencia: false })).toBe("Escribe cuántas prendas van de cada talla y de cada color.");
    expect(ayudaDeCantidades({ hayRayas: true, conSugerencia: false })).toMatch(/Una raya \(—\)/);
    expect(ayudaDeCantidades({ hayRayas: false, conSugerencia: true })).toMatch(/número gris/);
    expect(ayudaDeCantidades({ hayRayas: false, conSugerencia: true })).not.toMatch(/raya/);
  });
  it("ninguna ayuda separa datos con un punto medio ni dice «Lote de producción»", () => {
    for (const texto of [AYUDA_DEL_RESTO, ayudaDeCantidades({ hayRayas: true, conSugerencia: true })]) {
      expect(texto).not.toContain("·");
      expect(texto).not.toMatch(/Lote de producción/);
    }
  });
});
