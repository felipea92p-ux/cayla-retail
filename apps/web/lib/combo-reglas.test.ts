import { describe, expect, it } from "vitest";
import {
  comboLlegoAlFinal,
  comboNecesitaBuscador,
  TAMANO_PAGINA_COMBO,
  UMBRAL_BUSCAR_COMBO,
  coincidenciaCombo,
  primeraElegible,
  siguienteElegible,
  tramosPorGrupo,
} from "./combo-reglas";

describe("comboNecesitaBuscador", () => {
  it("no busca con el umbral exacto", () => {
    expect(comboNecesitaBuscador(UMBRAL_BUSCAR_COMBO)).toBe(false);
  });

  it("busca apenas se pasa del umbral", () => {
    expect(comboNecesitaBuscador(UMBRAL_BUSCAR_COMBO + 1)).toBe(true);
  });

  it("no busca con una lista corta", () => {
    expect(comboNecesitaBuscador(3)).toBe(false);
  });

  it("no busca sin opciones", () => {
    expect(comboNecesitaBuscador(0)).toBe(false);
  });
});

describe("comboLlegoAlFinal", () => {
  it("no llegó si sobra scroll", () => {
    expect(comboLlegoAlFinal({ scrollTop: 0, clientHeight: 200, scrollHeight: 1000 })).toBe(false);
  });

  it("llegó cuando el resto cabe en el margen por defecto", () => {
    expect(comboLlegoAlFinal({ scrollTop: 780, clientHeight: 200, scrollHeight: 1000 })).toBe(true);
  });

  it("respeta un margen propio", () => {
    expect(comboLlegoAlFinal({ scrollTop: 700, clientHeight: 200, scrollHeight: 1000 }, 100)).toBe(true);
    expect(comboLlegoAlFinal({ scrollTop: 650, clientHeight: 200, scrollHeight: 1000 }, 100)).toBe(false);
  });

  it("una lista que no se desplaza ya está en el fondo", () => {
    expect(comboLlegoAlFinal({ scrollTop: 0, clientHeight: 200, scrollHeight: 200 })).toBe(true);
  });
});

describe("umbrales", () => {
  it("8 y 50, los números que pidió Felipe", () => {
    expect(UMBRAL_BUSCAR_COMBO).toBe(8);
    expect(TAMANO_PAGINA_COMBO).toBe(50);
  });
});

describe("coincidenciaCombo", () => {
  const clave = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  const gris = { texto: "Gris", claves: ["plomo"] };
  const vino = { texto: "Vino", detalle: "Rojo", claves: ["guinda", "borgoña"] };

  it("por el texto o el detalle: responde sin clave que mostrar", () => {
    expect(coincidenciaCombo(gris, "gri", clave)).toBe("");
    expect(coincidenciaCombo(vino, "rojo", clave)).toBe("");
  });

  it("por un sinónimo: devuelve cuál, para que la lista lo muestre", () => {
    expect(coincidenciaCombo(gris, "plom", clave)).toBe("plomo");
    expect(coincidenciaCombo(vino, "borgona", clave)).toBe("borgoña");
  });

  it("si no responde por nada, null; sin texto escrito, todas responden", () => {
    expect(coincidenciaCombo(gris, "azul", clave)).toBeNull();
    expect(coincidenciaCombo({ texto: "Azul" }, "plomo", clave)).toBeNull();
    expect(coincidenciaCombo(gris, "", clave)).toBe("");
  });
});

describe("opciones que se ven pero no se eligen", () => {
  // Como el combo de cuentas: dos bancos, un cajón con la caja cerrada y otro abierto.
  const cuentas = [{ deshabilitada: false }, { deshabilitada: false }, { deshabilitada: true }, { deshabilitada: false }];

  it("las flechas saltan la bloqueada, en las dos direcciones", () => {
    expect(siguienteElegible(cuentas, 1, 1)).toBe(3);
    expect(siguienteElegible(cuentas, 3, -1)).toBe(1);
  });

  it("en el borde, o sin otra elegible, se quedan donde están", () => {
    expect(siguienteElegible(cuentas, 3, 1)).toBe(3);
    expect(siguienteElegible(cuentas, 0, -1)).toBe(0);
    expect(siguienteElegible([{ deshabilitada: false }, { deshabilitada: true }], 0, 1)).toBe(0);
  });

  it("Inicio y Fin van a la primera y la última elegibles; sin ninguna, −1", () => {
    const bordes = [{ deshabilitada: true }, { deshabilitada: false }, { deshabilitada: false }, { deshabilitada: true }];
    expect(primeraElegible(bordes)).toBe(1);
    expect(primeraElegible(bordes, true)).toBe(2);
    expect(primeraElegible([{ deshabilitada: true }])).toBe(-1);
  });

  it("sin `deshabilitada` todas se eligen: el combo de siempre no cambia", () => {
    const simples = [{}, {}, {}];
    expect(siguienteElegible(simples, 0, 1)).toBe(1);
    expect(primeraElegible(simples, true)).toBe(2);
  });
});

describe("tramosPorGrupo", () => {
  it("agrupa las seguidas del mismo grupo y conserva el índice plano", () => {
    const opciones = [{ grupo: "Bancos" }, { grupo: "Bancos" }, { grupo: "Cajones" }];
    expect(tramosPorGrupo(opciones).map((t) => [t.grupo, t.items.map((x) => x.i)])).toEqual([
      ["Bancos", [0, 1]],
      ["Cajones", [2]],
    ]);
  });

  it("una opción suelta arriba («Aún no llegan») va sin título, antes del grupo", () => {
    const opciones = [{}, { grupo: "No van a llegar" }, { grupo: "No van a llegar" }];
    expect(tramosPorGrupo(opciones).map((t) => [t.grupo, t.items.length])).toEqual([
      [undefined, 1],
      ["No van a llegar", 2],
    ]);
  });

  it("sin grupos, un solo tramo sin título: la lista de siempre", () => {
    expect(tramosPorGrupo([{}, {}]).map((t) => [t.grupo, t.items.length])).toEqual([[undefined, 2]]);
    expect(tramosPorGrupo([])).toEqual([]);
  });
});
