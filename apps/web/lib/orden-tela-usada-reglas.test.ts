import { describe, expect, it } from "vitest";
import {
  cantidadDeFabrica,
  comoSeAnota,
  leerCantidad,
  leerQuedo,
  lineasDeTelaQueSale,
  lineasDeUso,
  pendientesDeAnotar,
  problemaDeLoUsado,
  problemaDeTelaEncontrada,
  problemaDeTelaQueSale,
  problemaDeTelaUsada,
  telasDeLaOrden,
  textoAnotasteTela,
  textoDeLoUsado,
  usoDeLaFila,
  valorDeFabrica,
  type TelaDeLaOrden,
} from "./orden-tela-usada-reglas";
import type { InsumoPagina } from "./orden-pagina-reglas";

const insumo = (parche: Partial<InsumoPagina> = {}): InsumoPagina => ({
  id: "pi-1", insumoId: "i-1", nombre: "Lino lavado", tipo: "tela", unidad: "metro", colorCodigo: "NEG", colorNombre: "Negro", consumoPorPrenda: 1.5, esComplemento: false, cantidadPlan: 36, usado: 10, saldo: 40, comprometidoOtras: 0, enCamino: 0, atrasado: 0, pedidos: [], ...parche,
});
const tela = (parche: Partial<TelaDeLaOrden> = {}): TelaDeLaOrden => ({ insumoId: "i-1", nombre: "Lino lavado", tipo: "tela", complemento: false, unidad: "metro", plan: 72, usado: 10, falta: 62, saldo: 40, ...parche });

describe("telasDeLaOrden — una fila por insumo", () => {
  it("una tela en dos colores es UNA fila: se suman los planes y lo usado no se suma (el libro no sabe de colores)", () => {
    const filas = telasDeLaOrden([insumo(), insumo({ id: "pi-2", colorCodigo: "CAQ", colorNombre: "Caqui", cantidadPlan: 36, usado: 10 })]);
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ insumoId: "i-1", plan: 72, usado: 10, falta: 62, saldo: 40, unidad: "metro" });
  });
  it("lo que falta usar nunca es negativo, y los avíos cuentan igual", () => {
    const [t, a] = telasDeLaOrden([insumo({ usado: 80 }), insumo({ id: "pi-3", insumoId: "i-2", nombre: "Botón", tipo: "avio", unidad: "unidad", cantidadPlan: 96, usado: 0, saldo: 500 })]);
    expect(t.falta).toBe(0);
    expect(a).toMatchObject({ nombre: "Botón", tipo: "avio", falta: 96 });
  });
  it("sin insumos no hay filas", () => {
    expect(telasDeLaOrden([])).toEqual([]);
  });
});

describe("leerCantidad", () => {
  it("un número mayor que cero, con punto o coma y hasta tres decimales", () => {
    expect(leerCantidad("12")).toBe(12);
    expect(leerCantidad("12,5")).toBe(12.5);
    expect(leerCantidad(" 0.125 ")).toBe(0.125);
  });
  it("lo demás no se entiende", () => {
    for (const t of ["", "0", "0,0", "-3", "abc", "1,2,3", "1.2345", "1e3", "12 m"]) expect(leerCantidad(t), t).toBeNull();
  });
});

describe("problemaDeTelaUsada", () => {
  it("usar: vacío, de más del estante, o sin estante, dicen lo que pasa; lo justo y lo menor pasan", () => {
    expect(problemaDeTelaUsada(tela(), "", "usar")).toContain("Escribe cuánto usaste");
    expect(problemaDeTelaUsada(tela(), "40,5", "usar")).toBe("En el estante solo hay 40 m: no puedes anotar 40.5 m.");
    expect(problemaDeTelaUsada(tela({ saldo: 0 }), "1", "usar")).toBe("No hay lino lavado en el estante del Taller: recíbelo antes de anotar lo que usaste.");
    expect(problemaDeTelaUsada(tela(), "40", "usar")).toBeNull();
    expect(problemaDeTelaUsada(tela(), "3,5", "usar")).toBeNull();
  });
  it("devolver: no más de lo descontado, y nada si no hay nada descontado", () => {
    expect(problemaDeTelaUsada(tela(), "11", "devolver")).toBe("Esta orden solo tiene descontados 10 m: no puedes devolver 11 m.");
    expect(problemaDeTelaUsada(tela({ usado: 0 }), "1", "devolver")).toBe("Esta orden no tiene nada descontado de esto: no hay nada que devolver.");
    expect(problemaDeTelaUsada(tela(), "", "devolver")).toContain("Escribe cuánto devuelves");
    expect(problemaDeTelaUsada(tela(), "2,5", "devolver")).toBeNull();
  });
  it("el valor de fábrica de «usé» es lo que falta según el plan, sin pasar de lo que hay en el estante, con punto", () => {
    expect(cantidadDeFabrica(tela({ falta: 62.5, saldo: 100 }))).toBe("62.5");
    expect(cantidadDeFabrica(tela({ falta: 62.5, saldo: 44 }))).toBe("44");
    expect(cantidadDeFabrica(tela({ falta: 0 }))).toBe("");
    expect(cantidadDeFabrica(tela({ falta: 10, saldo: 0 }))).toBe("");
  });
});

describe("textoAnotasteTela", () => {
  it("dice qué se anotó o se devolvió, con su unidad", () => {
    expect(textoAnotasteTela({ nombre: "Lino lavado", unidad: "metro" }, 12.5, "usar")).toBe("Anotaste 12.5 m de Lino lavado");
    expect(textoAnotasteTela({ nombre: "Lino lavado", unidad: "metro" }, 2, "devolver")).toBe("Devolviste 2 m de Lino lavado");
  });
});

describe("telasDeLaOrden — los complementos (ADR-0563)", () => {
  it("una tela es complemento solo si lo es en TODOS sus colores; un avío nunca", () => {
    const solo = telasDeLaOrden([insumo({ esComplemento: true })]);
    expect(solo[0].complemento).toBe(true);
    const mezcla = telasDeLaOrden([insumo({ id: "pi-a", colorCodigo: "NEG", esComplemento: true }), insumo({ id: "pi-b", colorCodigo: "CRU" })]);
    expect(mezcla).toHaveLength(1);
    expect(mezcla[0].complemento).toBe(false);
    expect(telasDeLaOrden([insumo({ tipo: "avio", insumoId: "i-9", nombre: "Botón" })])[0].complemento).toBe(false);
  });
});

describe("«¿cuánto quedó?» (ADR-0570, actividad 4): una tela se anota con lo que quedó en el estante; un avío, con cuántos se usaron", () => {
  const boton = tela({ insumoId: "i-2", nombre: "Botón", tipo: "avio", unidad: "unidad", plan: 96, usado: 0, falta: 96, saldo: 500 });
  it("cómo se anota cada uno", () => {
    expect(comoSeAnota(tela())).toBe("quedo");
    expect(comoSeAnota(boton)).toBe("usado");
  });
  it("lo que queda por anotar: lo que tiene plan por usar y la tela sin nada anotado", () => {
    const insumos = [insumo({ usado: 36 }), insumo({ id: "pi-2", insumoId: "i-2", nombre: "Algodón", usado: 0, cantidadPlan: 10 }), insumo({ id: "pi-3", insumoId: "i-3", nombre: "Botón", tipo: "avio", unidad: "unidad", usado: 0 })];
    expect(pendientesDeAnotar(insumos).map((t) => t.nombre)).toEqual(["Algodón", "Botón"]);
  });
  it("el valor de fábrica de una tela es lo que quedaría si se usó lo que pide el plan (nunca negativo); el de un avío, lo que falta; sin estante, vacío", () => {
    expect(valorDeFabrica(tela({ falta: 32.45, saldo: 45 }))).toBe("12.55");
    expect(valorDeFabrica(tela({ falta: 62, saldo: 40 }))).toBe("0");
    expect(valorDeFabrica(boton)).toBe("96");
    expect(valorDeFabrica(tela({ saldo: 0 }))).toBe("");
  });
  it("lo que quedó puede ser cero (se acabó el rollo), con punto o coma; lo demás no se entiende", () => {
    expect(leerQuedo("0")).toBe(0);
    expect(leerQuedo("12,5")).toBe(12.5);
    expect(leerQuedo("-1")).toBeNull();
    expect(leerQuedo("doce")).toBeNull();
  });
  it("lo usado de una tela es lo que había menos lo que quedó; no pudo quedar más de lo que había", () => {
    expect(usoDeLaFila(tela({ saldo: 45 }), "12")).toEqual({ usado: 33, problema: null });
    expect(usoDeLaFila(tela({ saldo: 45 }), "0")).toEqual({ usado: 45, problema: null });
    expect(usoDeLaFila(tela({ saldo: 45 }), "50").problema).toMatch(/no pudo quedar 50 m.*Encontré tela/);
    expect(usoDeLaFila(tela({ saldo: 45 }), "")).toEqual({ usado: null, problema: null });
    expect(usoDeLaFila(boton, "12")).toEqual({ usado: 12, problema: null });
    expect(usoDeLaFila(boton, "600").problema).toMatch(/solo hay 500/);
  });
  it("viaja una línea por fila escrita: «quedo» de la tela, «usado» del avío", () => {
    const filas = [tela({ saldo: 45 }), boton, tela({ insumoId: "i-3", saldo: 10 })];
    expect(lineasDeUso(filas, { "i-1": "12", "i-2": "40", "i-3": "" })).toEqual([
      { insumo_id: "i-1", quedo: 12 },
      { insumo_id: "i-2", usado: 40 },
    ]);
  });
  it("lo que impide anotar: el problema de una fila, o que con eso no se use nada (la base repite: uso_nada)", () => {
    expect(problemaDeLoUsado([tela({ saldo: 45 })], { "i-1": "12" })).toBeNull();
    expect(problemaDeLoUsado([tela({ saldo: 45 })], { "i-1": "45" })).toMatch(/no se usó nada/);
    expect(problemaDeLoUsado([tela({ saldo: 45 })], { "i-1": "" })).toMatch(/no se usó nada/);
    expect(problemaDeLoUsado([tela({ saldo: 45 })], { "i-1": "60" })).toMatch(/no pudo quedar/);
  });
  it("lo que se va a anotar, en palabras", () => {
    expect(textoDeLoUsado([tela({ saldo: 45 }), boton], { "i-1": "12", "i-2": "40" })).toBe("Usaste 33 m de Lino lavado y 40 und de Botón");
    expect(textoDeLoUsado([tela({ saldo: 45 })], { "i-1": "45" })).toBeNull();
  });
  it("la tela que se manda a cortar afuera sale como «usado»; una fila vacía no sale y lo de más se dice", () => {
    const telas = [tela({ saldo: 40 }), tela({ insumoId: "i-3", saldo: 10 })];
    expect(lineasDeTelaQueSale(telas, { "i-1": "30", "i-3": "" })).toEqual([{ insumo_id: "i-1", usado: 30 }]);
    expect(problemaDeTelaQueSale(telas, { "i-1": "30", "i-3": "" })).toBeNull();
    expect(problemaDeTelaQueSale(telas, { "i-1": "50" })).toMatch(/solo hay 40/);
  });
  it("«Encontré tela»: cuánta, mayor que cero; el precio, vacío (el último) o un número", () => {
    expect(problemaDeTelaEncontrada("2,5", "")).toBeNull();
    expect(problemaDeTelaEncontrada("2,5", "18,50")).toBeNull();
    expect(problemaDeTelaEncontrada("0", "")).toMatch(/cuánta tela encontraste/);
    expect(problemaDeTelaEncontrada("2", "barato")).toMatch(/precio/);
  });
});
