import { describe, expect, it } from "vitest";
import {
  diasHasta,
  estadoVencimiento,
  hoyLima,
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

describe("hoyLima", () => {
  it("a las 8 p. m. de Lima todavía es el mismo día (en UTC ya sería el siguiente)", () => {
    expect(hoyLima(new Date("2026-09-21T01:00:00Z"))).toBe("2026-09-20");
  });
  it("a las 5 a. m. de Lima ya es el día nuevo", () => {
    expect(hoyLima(new Date("2026-09-21T10:00:00Z"))).toBe("2026-09-21");
  });
});

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
