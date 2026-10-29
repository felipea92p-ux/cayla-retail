import { describe, expect, it } from "vitest";
import {
  anotarConsumoEnLotes,
  cantidadDeFabrica,
  leerCantidad,
  problemaDeTelaUsada,
  saldoDelLoteMasAntiguo,
  telasDeLaOrden,
  textoAnotasteTela,
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

describe("saldoDelLoteMasAntiguo — el mensaje de la base cuando una orden cruza de lote", () => {
  it("lee cuánto queda en el lote más antiguo", () => {
    expect(saldoDelLoteMasAntiguo("El lote más antiguo con saldo tiene 40.000 y pediste 69 — si de verdad necesitas cruzar de lote, registra el consumo en dos llamadas")).toBe(40);
    expect(saldoDelLoteMasAntiguo("El lote más antiguo con saldo tiene 12,5 y pediste 30")).toBe(12.5);
  });
  it("otro mensaje, o un saldo en cero, no es esto", () => {
    expect(saldoDelLoteMasAntiguo("No hay stock de este insumo en esta ubicación")).toBeNull();
    expect(saldoDelLoteMasAntiguo("El lote más antiguo con saldo tiene 0 y pediste 5")).toBeNull();
  });
});

describe("anotarConsumoEnLotes — parte la cantidad entre lotes cuando el más antiguo no alcanza", () => {
  const llamadas: number[] = [];
  const base = (lotes: number[]) => {
    llamadas.length = 0;
    const saldos = [...lotes];
    return async (cantidad: number) => {
      llamadas.push(cantidad);
      const saldo = saldos[0] ?? 0;
      if (saldo <= 0) return { error: { message: "No hay stock de este insumo en esta ubicación" } };
      if (saldo < cantidad) return { error: { message: `El lote más antiguo con saldo tiene ${saldo}.000 y pediste ${cantidad} — registra el consumo en dos llamadas` } };
      saldos[0] = saldo - cantidad;
      if (saldos[0] <= 0) saldos.shift();
      return { error: null };
    };
  };
  it("si el primer lote alcanza, una sola llamada", async () => {
    expect(await anotarConsumoEnLotes(30, base([40, 100]))).toEqual({ anotado: 30, falta: 0, error: null });
    expect(llamadas).toEqual([30]);
  });
  it("si no alcanza, anota lo que queda del lote y después el resto (69 = 40 + 29)", async () => {
    expect(await anotarConsumoEnLotes(69, base([40, 100]))).toEqual({ anotado: 69, falta: 0, error: null });
    expect(llamadas).toEqual([69, 40, 29]);
  });
  it("si se acaba la tela a mitad, lo anotado queda anotado y dice cuánto falta y por qué", async () => {
    const r = await anotarConsumoEnLotes(69, base([40]));
    expect(r.anotado).toBe(40);
    expect(r.falta).toBe(29);
    expect(r.error?.message).toContain("No hay stock");
  });
  it("un error que no es de lotes se devuelve tal cual, sin reintentar", async () => {
    const r = await anotarConsumoEnLotes(5, async () => ({ error: { message: "No tienes permiso para registrar consumo de insumos en esa producción" } }));
    expect(r).toEqual({ anotado: 0, falta: 5, error: { message: "No tienes permiso para registrar consumo de insumos en esa producción" } });
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
