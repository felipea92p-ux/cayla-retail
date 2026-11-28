import { describe, expect, it } from "vitest";
import {
  diasHasta,
  estadoVencimiento,
  fallidosDelBarrido,
  puedeLiberarApartado,
  resumirApartados,
  textoVencimiento,
  type Apartado,
} from "./apartados-reglas";

const HOY = "2026-09-20";

function apartado(parcial: Partial<Apartado> = {}): Apartado {
  return {
    id: "a1",
    varianteId: "v1",
    sku: "BLU-EMMA-NEG-M",
    referencia: "Blusa Emma",
    talla: "M",
    color: "Negro",
    sububicacionId: null,
    cantidad: 1,
    clienta: "Ana Torres",
    contacto: "999111222",
    nota: null,
    venceEl: HOY,
    creadoEn: "2026-09-20T15:00:00Z",
    apartoNombre: "Micaela",
    puedeLiberar: true,
    ...parcial,
  };
}

describe("diasHasta", () => {
  it("cuenta días de calendario, con signo", () => {
    expect(diasHasta("2026-09-23", HOY)).toBe(3);
    expect(diasHasta(HOY, HOY)).toBe(0);
    expect(diasHasta("2026-09-18", HOY)).toBe(-2);
    expect(diasHasta("2027-01-01", "2026-12-31")).toBe(1);
  });
});

describe("estadoVencimiento / textoVencimiento", () => {
  it("vence AL FINAL del día límite: el día límite todavía es «hoy», no «vencido»", () => {
    expect(estadoVencimiento(HOY, HOY)).toBe("hoy");
    expect(estadoVencimiento("2026-09-19", HOY)).toBe("vencido");
    expect(estadoVencimiento("2026-09-21", HOY)).toBe("vigente");
  });
  it("habla en lenguaje de tienda y en singular/plural", () => {
    expect(textoVencimiento("2026-09-19", HOY)).toBe("Venció hace 1 día");
    expect(textoVencimiento("2026-09-17", HOY)).toBe("Venció hace 3 días");
    expect(textoVencimiento(HOY, HOY)).toBe("Vence hoy");
    expect(textoVencimiento("2026-09-21", HOY)).toBe("Vence mañana");
    expect(textoVencimiento("2026-09-25", HOY)).toBe("Vence en 5 días");
  });
});

describe("resumirApartados", () => {
  it("cuenta apartados, unidades y vencidos", () => {
    const lista = [
      apartado({ id: "1", cantidad: 2, venceEl: "2026-09-18" }),
      apartado({ id: "2", cantidad: 1, venceEl: HOY }),
      apartado({ id: "3", cantidad: 3, venceEl: "2026-09-25" }),
    ];
    expect(resumirApartados(lista, HOY)).toEqual({ abiertos: 3, unidades: 6, vencidos: 1 });
  });
  it("sin apartados: todo en cero", () => {
    expect(resumirApartados([], HOY)).toEqual({ abiertos: 0, unidades: 0, vencidos: 0 });
  });
  it("la reserva de un pedido de otra sede (sin fecha) cuenta como apartada pero nunca como vencida", () => {
    const lista = [apartado({ id: "1", cantidad: 1, venceEl: null }), apartado({ id: "2", cantidad: 1, venceEl: "2026-09-18" })];
    expect(resumirApartados(lista, HOY)).toEqual({ abiertos: 2, unidades: 2, vencidos: 1 });
  });
});

describe("puedeLiberarApartado", () => {
  const base = { puedeLiberarBase: true, esTerminal: false, esPedidoWeb: false, esDeSeparacion: false };
  it("un apartado simple: lo decide la base, y la terminal libera siempre", () => {
    expect(puedeLiberarApartado(base)).toBe(true);
    expect(puedeLiberarApartado({ ...base, puedeLiberarBase: false })).toBe(false);
    expect(puedeLiberarApartado({ ...base, puedeLiberarBase: false, esTerminal: true })).toBe(true);
  });
  it("la prenda de un apartado con adelanto nunca se libera aquí, ni la líder ni la terminal (auditoría 2026-11-28, N.º 2)", () => {
    expect(puedeLiberarApartado({ ...base, esDeSeparacion: true })).toBe(false);
    expect(puedeLiberarApartado({ ...base, esDeSeparacion: true, esTerminal: true })).toBe(false);
  });
  it("la reserva de un pedido web tampoco (se libera desde Tienda web)", () => {
    expect(puedeLiberarApartado({ ...base, esPedidoWeb: true })).toBe(false);
    expect(puedeLiberarApartado({ ...base, esPedidoWeb: true, esTerminal: true })).toBe(false);
  });
});

describe("fallidosDelBarrido", () => {
  it("lee los apartados que el barrido no pudo vencer", () => {
    expect(
      fallidosDelBarrido({ apartados_con_adelanto: 3, apartados_simples: 1, fallidas: 2, fallidas_ids: ["s1"], simples_fallidos_ids: ["a9"] }),
    ).toEqual({ total: 2, apartadosConAdelanto: ["s1"], simples: ["a9"] });
  });
  it("una base sin la migración (o una respuesta vacía) es «nada falló»", () => {
    expect(fallidosDelBarrido({ apartados_con_adelanto: 3, apartados_simples: 1 })).toEqual({ total: 0, apartadosConAdelanto: [], simples: [] });
    expect(fallidosDelBarrido(null)).toEqual({ total: 0, apartadosConAdelanto: [], simples: [] });
  });
});
