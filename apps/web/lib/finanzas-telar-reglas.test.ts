import { describe, expect, it } from "vitest";
import { colorDeSede, dichoDeLaSede, esMesTelar, hrefTelar, mesTelar, porSedeDe, sedeDeLaUrl, sedeElegida, sedesDelTelar, tramosDelOrillo } from "./finanzas-telar-reglas";

const UBIC = [
  { id: "t", nombre: "Taller", tipo: "taller" },
  { id: "l", nombre: "Tienda Lima", tipo: "tienda" },
  { id: "tr", nombre: "Tienda Trujillo", tipo: "tienda" },
  { id: "a", nombre: "Tienda Arequipa", tipo: "tienda" },
];
const SEDES = sedesDelTelar(UBIC, true);
const HOY = "2026-10";

describe("la sede de la URL", () => {
  it("lee ?sede=; ?ver= (el selector viejo) gana mientras dure el cambio; sin nada, todas", () => {
    expect(sedeDeLaUrl({ sede: "l" })).toBe("l");
    expect(sedeDeLaUrl({ sede: "l", ver: "empresa" })).toBe("empresa");
    expect(sedeDeLaUrl({})).toBe("todas");
    expect(sedeDeLaUrl({ sede: "  " })).toBe("todas");
  });

  it("quien no ve todo mira siempre la suya; quien ve todo, la pedida si existe", () => {
    expect(sedeElegida("l", SEDES, false, "tr")).toBe("tr");
    expect(sedeElegida("l", SEDES, true, "tr")).toBe("l");
    expect(sedeElegida("empresa", SEDES, true, "tr")).toBe("empresa");
    expect(sedeElegida("no-existe", SEDES, true, "tr")).toBe("todas");
    expect(sedeElegida("todas", SEDES, true, "tr")).toBe("todas");
  });
});

describe("los hilos", () => {
  it("van en el orden del telar, con Empresa al final y el nombre corto", () => {
    expect(SEDES.map((s) => [s.nombre, s.color])).toEqual([
      ["Trujillo", "tru"],
      ["Arequipa", "aqp"],
      ["Lima", "lim"],
      ["Taller", "tal"],
      ["Empresa", "emp"],
    ]);
  });

  it("una sede que no se reconoce no toma el color de otra", () => {
    expect(colorDeSede({ nombre: "Tienda Cusco", tipo: "tienda" })).toBe("otra");
    expect(colorDeSede({ nombre: "Almacén Lima", tipo: "almacen" })).toBe("otra");
  });

  it("dice qué se está mirando", () => {
    expect(dichoDeLaSede("todas", SEDES)).toBe("Viendo las cinco sedes juntas");
    expect(dichoDeLaSede("l", SEDES)).toBe("Viendo solo Lima");
    expect(dichoDeLaSede("todas", SEDES.slice(0, 1))).toBe("Viendo Trujillo");
  });
});

describe("las direcciones", () => {
  const op = { mismaPantalla: true, mesDeHoy: HOY };
  it("en la misma pantalla conserva lo suyo y quita ?ver=", () => {
    expect(hrefTelar("/finanzas/gastos", [["tab", "fijos"], ["ver", "l"]], { sede: "tr" }, op)).toBe("/finanzas/gastos?tab=fijos&sede=tr");
  });

  it("al cambiar de submódulo solo viajan la sede y el mes", () => {
    const actuales: [string, string][] = [["tab", "fijos"], ["sede", "l"], ["mes", "2026-09"]];
    expect(hrefTelar("/finanzas/resumen", actuales, {}, { mismaPantalla: false, mesDeHoy: HOY })).toBe("/finanzas/resumen?sede=l&mes=2026-09");
  });

  it("todas y el mes de hoy no se escriben", () => {
    expect(hrefTelar("/finanzas/gastos", [["sede", "l"], ["mes", "2026-09"]], { sede: "todas", mes: HOY }, op)).toBe("/finanzas/gastos");
  });

  it("un ?ver= viejo se vuelve ?sede= al pasar a otro submódulo", () => {
    expect(hrefTelar("/finanzas/dinero", [["ver", "empresa"]], {}, { mismaPantalla: false, mesDeHoy: HOY })).toBe("/finanzas/dinero?sede=empresa");
  });

  it("el mes va con su cero, como lo lee Gastos", () => {
    expect(mesTelar(2026, 9)).toBe("2026-09");
    expect(esMesTelar("2026-9")).toBe(false);
    expect(esMesTelar("2026-09")).toBe(true);
  });
});

describe("el orillo", () => {
  it("cada sede mide lo suyo y lo de la empresa va en Empresa", () => {
    const t = tramosDelOrillo(porSedeDe([{ ubicacionId: "l", monto: 300 }, { ubicacionId: null, monto: 100 }, { ubicacionId: "l", monto: 100 }]), SEDES);
    expect(t.map((x) => [x.nombre, x.monto, x.pct])).toEqual([
      ["Trujillo", 0, 0],
      ["Arequipa", 0, 0],
      ["Lima", 400, 80],
      ["Taller", 0, 0],
      ["Empresa", 100, 20],
    ]);
  });

  it("sin nada gastado no hay orillo, y una ubicación que no se ve no se dibuja", () => {
    expect(tramosDelOrillo({}, SEDES)).toEqual([]);
    expect(tramosDelOrillo({ otra: 50 }, SEDES)).toEqual([]);
  });
});
