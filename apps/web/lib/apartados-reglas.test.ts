import { describe, expect, it } from "vitest";
import {
  MAX_DIAS_APARTADO,
  diasHasta,
  estadoVencimiento,
  hoyLima,
  resumirApartados,
  sumarDias,
  textoVencimiento,
  validarApartar,
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

describe("sumarDias / diasHasta", () => {
  it("cruza fin de mes, de año y febrero bisiesto sin depender de la zona del equipo", () => {
    expect(sumarDias("2026-09-30", 1)).toBe("2026-10-01");
    expect(sumarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(sumarDias("2028-02-28", 1)).toBe("2028-02-29");
    expect(sumarDias("2026-09-20", 3)).toBe("2026-09-23");
    expect(sumarDias("2026-09-20", -1)).toBe("2026-09-19");
  });
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
});

describe("validarApartar", () => {
  const ok = { cantidad: "2", clienta: "Ana Torres", contacto: "999111222", fecha: "2026-09-23" };

  it("un formulario completo y dentro de lo disponible no tiene errores", () => {
    expect(validarApartar(ok, 5, HOY)).toEqual({});
  });
  it("la cantidad debe ser un entero de al menos 1", () => {
    expect(validarApartar({ ...ok, cantidad: "" }, 5, HOY).cantidad).toMatch(/al menos 1/);
    expect(validarApartar({ ...ok, cantidad: "0" }, 5, HOY).cantidad).toMatch(/al menos 1/);
    expect(validarApartar({ ...ok, cantidad: "1.5" }, 5, HOY).cantidad).toMatch(/al menos 1/);
  });
  it("no deja apartar más de lo disponible, con el número real", () => {
    expect(validarApartar({ ...ok, cantidad: "6" }, 5, HOY).cantidad).toBe("Solo hay 5 disponibles para apartar.");
    expect(validarApartar({ ...ok, cantidad: "2" }, 1, HOY).cantidad).toBe("Solo hay 1 disponible para apartar.");
    expect(validarApartar({ ...ok, cantidad: "1" }, 0, HOY).cantidad).toMatch(/No hay prendas disponibles/);
  });
  it("exige nombre y contacto, ignorando espacios", () => {
    const e = validarApartar({ ...ok, clienta: "   ", contacto: "" }, 5, HOY);
    expect(e.clienta).toMatch(/nombre de la clienta/);
    expect(e.contacto).toMatch(/teléfono o WhatsApp/);
  });
  it("la fecha límite: obligatoria, no pasada, y con tope", () => {
    expect(validarApartar({ ...ok, fecha: "" }, 5, HOY).fecha).toMatch(/hasta cuándo/);
    expect(validarApartar({ ...ok, fecha: "2026-09-19" }, 5, HOY).fecha).toMatch(/anterior a hoy/);
    expect(validarApartar({ ...ok, fecha: HOY }, 5, HOY).fecha).toBeUndefined();
    expect(validarApartar({ ...ok, fecha: sumarDias(HOY, MAX_DIAS_APARTADO) }, 5, HOY).fecha).toBeUndefined();
    expect(validarApartar({ ...ok, fecha: sumarDias(HOY, MAX_DIAS_APARTADO + 1) }, 5, HOY).fecha).toMatch(/máximo/);
  });
});
