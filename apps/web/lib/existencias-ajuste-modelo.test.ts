import { describe, expect, it } from "vitest";
import type { VarianteAjuste } from "./ajuste-reglas";
import {
  ANCHOS_DEL_MODAL,
  anchoDeLaPlanilla,
  anchoDelModalAlAjustar,
  armarModelo,
  claveCelda,
  lugarInicial,
  maximoDeLaCelda,
  minimoDeLaCelda,
  motivoCerrado,
  MOTIVOS_PLANILLA,
  notaLista,
  paraLaBase,
  porQueNoBaja,
  porQueNoSube,
  problemaDelLote,
  resumenDelLote,
} from "./existencias-ajuste-modelo";

const variante = (o: Partial<VarianteAjuste> & { varianteId: string }): VarianteAjuste => ({
  sku: o.varianteId,
  talla: "M",
  color: "Negro",
  stockPiso: 0,
  stockAlmacen: 0,
  stockSinDividir: 0,
  apartadoPiso: 0,
  apartadoAlmacen: 0,
  apartadoSinDividir: 0,
  sinHistoria: false,
  ...o,
});

describe("los motivos de la planilla", () => {
  it("viajan a la base como sus cuatro motivos, con la nota que piden o la que les toca", () => {
    expect(paraLaBase("conte", "algo")).toEqual({ motivo: "conteo_fisico", nota: "" });
    expect(paraLaBase("encontre", "  en la repisa ")).toEqual({ motivo: "reposicion", nota: "en la repisa" });
    expect(paraLaBase("no_aparece", "x")).toEqual({ motivo: "merma", nota: "" });
    expect(paraLaBase("error_cobro", "")).toEqual({ motivo: "otro", nota: "Error al cobrar" });
    expect(paraLaBase("uso_interno", "")).toEqual({ motivo: "otro", nota: "Uso interno" });
    expect(paraLaBase("otro", " etiqueta cambiada ")).toEqual({ motivo: "otro", nota: "etiqueta cambiada" });
  });

  it("piden nota solo «Encontré» y «Otro», con 3 letras como mínimo (lo de la base)", () => {
    expect(MOTIVOS_PLANILLA.filter((m) => m.nota).map((m) => m.clave)).toEqual(["encontre", "otro"]);
    expect(notaLista("encontre", "ab")).toBe(false);
    expect(notaLista("encontre", " abc ")).toBe(true);
    expect(notaLista("conte", "")).toBe(true);
  });

  it("«Encontré» no se ofrece en el piso de una tienda que separa piso y almacén", () => {
    expect(motivoCerrado("encontre", "piso", true)).not.toBeNull();
    expect(motivoCerrado("encontre", "almacen", true)).toBeNull();
    expect(motivoCerrado("encontre", "almacen", false)).toBeNull();
    expect(motivoCerrado("conte", "piso", true)).toBeNull();
  });
});

describe("en qué lugar entra", () => {
  it("donde esa talla tiene más unidades; con empate, en el almacén", () => {
    expect(lugarInicial({ piso: 3, almacen: 0 }, true)).toBe("piso");
    expect(lugarInicial({ piso: 2, almacen: 4 }, true)).toBe("almacen");
    expect(lugarInicial({ piso: 2, almacen: 2 }, true)).toBe("almacen");
    expect(lugarInicial({ piso: 0, almacen: 0 }, true)).toBe("almacen");
  });
  it("una sede que no separa piso y almacén (el Taller) no elige", () => {
    expect(lugarInicial({ piso: null, almacen: null }, false)).toBe("almacen");
  });
});

describe("el modelo de la planilla", () => {
  const vs = [
    variante({ varianteId: "nm", color: "Negro", talla: "M" }),
    variante({ varianteId: "ns", color: "Negro", talla: "S" }),
    variante({ varianteId: "cs", color: "Crudo", talla: "S" }),
    variante({ varianteId: "au", color: "Azul", talla: "XL", sinHistoria: true }),
    variante({ varianteId: "rq", color: "Rojo", talla: "S" }),
    variante({ varianteId: "rq2", color: "Rojo", talla: "M", stockAlmacen: 2, stockSinDividir: 2 }),
  ];
  const extras = new Map([
    ["nm", { hex: "#111111", activa: true }],
    ["ns", { hex: "#111111", activa: true }],
    ["cs", { hex: "#eeeeee", activa: true }],
    ["au", { hex: "#223344", activa: true }],
    ["rq", { hex: "#aa0000", activa: false }],
    ["rq2", { hex: "#aa0000", activa: false }],
  ]);
  const m = armarModelo(vs, extras, ["Crudo", "Negro"]);

  it("los colores salen en el orden de Existencias y después los que la tienda nunca tuvo", () => {
    expect(m.colores.map((c) => c.color)).toEqual(["Crudo", "Negro", "Azul", "Rojo"]);
    expect(m.colores.find((c) => c.color === "Azul")?.hex).toBe("#223344");
  });
  it("las tallas, como se cuenta una curva", () => {
    expect(m.tallas).toEqual(["S", "M", "XL"]);
  });
  it("lo que ya no se vende entra solo si todavía tiene algo en la sede", () => {
    expect(m.celdas.has(claveCelda("Rojo", "S"))).toBe(false);
    expect(m.celdas.get(claveCelda("Rojo", "M"))?.varianteId).toBe("rq2");
  });
  it("una combinación que no existe no tiene celda", () => {
    expect(m.celdas.has(claveCelda("Crudo", "M"))).toBe(false);
  });
});

describe("por qué un «+» o un «−» no se puede", () => {
  const v = variante({ varianteId: "a", stockPiso: 3, apartadoPiso: 1, stockAlmacen: 2 });
  const base = { variante: v, pendiente: 0, cargaAbierta: false, enPisoCerrado: false, nombre: "Negro M" };

  it("lo que solo resta no suma, y lo que solo suma no resta", () => {
    expect(porQueNoSube({ ...base, motivo: "no_aparece" })).toContain("solo resta");
    expect(porQueNoSube({ ...base, motivo: "no_aparece", pendiente: -2 })).toBeNull();
    expect(porQueNoBaja({ ...base, lugar: "piso", motivo: "encontre" })).toContain("solo suma");
    expect(porQueNoBaja({ ...base, lugar: "piso", motivo: "encontre", pendiente: 2 })).toBeNull();
  });

  it("una talla que nunca estuvo en la tienda, con la carga cerrada, entra solo con «Encontré unidades»", () => {
    const nueva = { ...base, variante: { sinHistoria: true } };
    expect(porQueNoSube({ ...nueva, motivo: "conte" })).toContain("Encontré unidades");
    expect(porQueNoSube({ ...nueva, motivo: "encontre" })).toBeNull();
    expect(porQueNoSube({ ...nueva, motivo: "conte", cargaAbierta: true })).toBeNull();
  });

  it("lo apartado no se quita, y en 0 el «−» calla", () => {
    expect(porQueNoBaja({ ...base, lugar: "piso", motivo: "conte", pendiente: -2 })).toContain("apartada");
    expect(porQueNoBaja({ ...base, lugar: "piso", motivo: "conte" })).toBeNull();
    expect(porQueNoBaja({ ...base, lugar: "almacen", motivo: "conte", pendiente: -2 })).toBe("");
  });

  it("el piso y el techo de la celda siguen al motivo", () => {
    expect(minimoDeLaCelda(v, "piso", "conte")).toBe(1);
    expect(minimoDeLaCelda(v, "piso", "encontre")).toBe(3);
    expect(maximoDeLaCelda(v, "piso", "no_aparece")).toBe(3);
    expect(maximoDeLaCelda(v, "piso", "conte")).toBeNull();
  });
});

describe("lo que frena guardar", () => {
  const sinProblema = { motivo: "conte" as const, nota: "", cargaAbierta: false, enPisoCerrado: false, responsableListo: true };
  const linea = (delta: number, sinHistoria = false) => ({ delta, nombre: "Negro M", variante: { sinHistoria } });

  it("sin tallas tocadas, falta tocar una", () => {
    expect(problemaDelLote({ ...sinProblema, lineas: [] })?.campo).toBe("cambios");
  });
  it("el motivo que choca con lo tocado", () => {
    expect(problemaDelLote({ ...sinProblema, motivo: "no_aparece", lineas: [linea(2)] })).toEqual({ texto: "«No aparece» solo resta, y Negro M sube", campo: "motivo" });
    expect(problemaDelLote({ ...sinProblema, motivo: "encontre", nota: "repisa", lineas: [linea(-1)] })?.campo).toBe("motivo");
    expect(problemaDelLote({ ...sinProblema, lineas: [linea(2, true)] })?.campo).toBe("motivo");
  });
  it("después la nota y quién lo hace", () => {
    expect(problemaDelLote({ ...sinProblema, motivo: "otro", lineas: [linea(1)] })).toEqual({ texto: "qué pasó", campo: "nota" });
    expect(problemaDelLote({ ...sinProblema, responsableListo: false, lineas: [linea(1)] })?.campo).toBe("responsable");
    expect(problemaDelLote({ ...sinProblema, lineas: [linea(1), linea(-1)] })).toBeNull();
  });
  it("el resumen cuenta lo que entra y lo que sale", () => {
    expect(resumenDelLote([{ delta: 2 }, { delta: 2 }, { delta: -1 }])).toEqual({ tallas: 3, entran: 4, salen: 1 });
  });
});

describe("el ancho justo del modal", () => {
  it("con 1 a 4 tallas se queda en sus 62 rem", () => {
    for (const n of [1, 2, 3, 4]) expect(anchoDelModalAlAjustar(n).rem).toBe(62);
  });
  it("con más, crece lo justo para que la planilla entre entera", () => {
    for (const n of [5, 6, 7, 8]) {
      const a = anchoDelModalAlAjustar(n);
      expect(a.rem * 16).toBeGreaterThanOrEqual(anchoDeLaPlanilla(n) + 296);
      const anterior = ANCHOS_DEL_MODAL[ANCHOS_DEL_MODAL.indexOf(a) - 1];
      expect(anterior.rem * 16).toBeLessThan(anchoDeLaPlanilla(n) + 296);
    }
  });
  it("con una sola talla no hay columna de total", () => {
    expect(anchoDeLaPlanilla(1)).toBe(168 + 112);
    expect(anchoDeLaPlanilla(2)).toBe(168 + 224 + 72);
  });
  it("tiene un tope: con muchas tallas, la planilla se desliza", () => {
    expect(anchoDelModalAlAjustar(20)).toBe(ANCHOS_DEL_MODAL[ANCHOS_DEL_MODAL.length - 1]);
  });
});
