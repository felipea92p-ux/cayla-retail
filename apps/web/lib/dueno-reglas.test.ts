import { describe, expect, it } from "vitest";
import { conDueno, conDuenoPorLineas, faltaElegirDueno, hayQueElegirDueno, ENCABEZADO_DUENO, ENCABEZADO_DUENO_LINEAS } from "./dueno-reglas";

const DOS = [
  { id: "c", clave: "cayla", nombre: "CAYLA" },
  { id: "x", clave: "claure", nombre: "CLAURE" },
];

class Consulta {
  encabezados: Record<string, string> = {};
  setHeader(n: string, v: string) {
    this.encabezados[n] = v;
    return this;
  }
}

describe("hayQueElegirDueno / faltaElegirDueno (ADR-0542)", () => {
  it("solo se pregunta donde operan dos empresas", () => {
    expect(hayQueElegirDueno(DOS)).toBe(true);
    expect(hayQueElegirDueno([DOS[0]])).toBe(false);
    expect(hayQueElegirDueno(null)).toBe(false);
    expect(hayQueElegirDueno(undefined)).toBe(false);
  });
  it("falta mientras no se elija una empresa que opere aquí; sin pregunta, nunca falta", () => {
    expect(faltaElegirDueno(DOS, "")).toBe(true);
    expect(faltaElegirDueno(DOS, "otra")).toBe(true);
    expect(faltaElegirDueno(DOS, "x")).toBe(false);
    expect(faltaElegirDueno([DOS[0]], "")).toBe(false);
    expect(faltaElegirDueno(null, "")).toBe(false);
  });
});

describe("los encabezados", () => {
  it("conDueno manda x-dueno, y sin dueño no toca la consulta", () => {
    expect(conDueno(new Consulta(), "x").encabezados).toEqual({ [ENCABEZADO_DUENO]: "x" });
    expect(conDueno(new Consulta(), "").encabezados).toEqual({});
    expect(conDueno(new Consulta(), null).encabezados).toEqual({});
  });
  it("conDuenoPorLineas manda el mapa como JSON, y vacío no manda nada", () => {
    const c = conDuenoPorLineas(new Consulta(), { v1: "c", v2: "x" });
    expect(JSON.parse(c.encabezados[ENCABEZADO_DUENO_LINEAS])).toEqual({ v1: "c", v2: "x" });
    expect(conDuenoPorLineas(new Consulta(), {}).encabezados).toEqual({});
  });
});

import { duenoDeLasLineas, duenosParaElegir, variantesSinDueno, type UnidadesDeDueno } from "./dueno-reglas";

const u = (clave: "cayla" | "claure", cantidad: number, cantidadApartada = 0): UnidadesDeDueno => ({ empresaId: clave === "cayla" ? "c" : "x", clave, nombre: clave.toUpperCase(), cantidad, cantidadApartada });

describe("el ticket de Vender (ADR-0542)", () => {
  it("solo hay que elegir cuando dos dueños tienen unidades DISPONIBLES (lo apartado no cuenta)", () => {
    expect(duenosParaElegir([u("cayla", 3), u("claure", 2)])?.map((d) => d.clave)).toEqual(["cayla", "claure"]);
    expect(duenosParaElegir([u("cayla", 3), u("claure", 2, 2)])).toBeNull();
    expect(duenosParaElegir([u("claure", 4)])).toBeNull();
    expect(duenosParaElegir(undefined)).toBeNull();
  });
  it("lista las prendas del ticket a las que falta elegir, sin repetir una prenda en dos líneas", () => {
    const reparto = { v1: [u("cayla", 3), u("claure", 2)], v2: [u("claure", 4)] };
    expect(variantesSinDueno(["v1", "v1", "v2", "v3"], reparto, {})).toEqual(["v1"]);
    expect(variantesSinDueno(["v1"], reparto, { v1: "x" })).toEqual([]);
    expect(variantesSinDueno(["v1"], reparto, { v1: "otra" })).toEqual(["v1"]);
    expect(variantesSinDueno(["v1"], null, {})).toEqual([]);
  });
  it("arma el mapa por prenda desde las líneas de la venta (también la encolada)", () => {
    expect(duenoDeLasLineas([{ variante_id: "v1", empresa_id: "x" }, { variante_id: "v2" }, { empresa_id: "c" }])).toEqual({ v1: "x" });
    expect(duenoDeLasLineas(undefined)).toEqual({});
  });
});
