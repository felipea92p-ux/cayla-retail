import { describe, expect, it } from "vitest";
import {
  aceptaVariasSedes,
  alternarSede,
  claveDeSedes,
  colorDeSede,
  dichoDeLaSede,
  esMesTelar,
  hrefConSedeYMes,
  hrefTelar,
  mesTelar,
  porSedeDe,
  RUTAS_CON_VARIAS_SEDES,
  sedeDeLaUrl,
  sedeElegida,
  sedesDeLaUrl,
  sedesDelTelar,
  sedesElegidas,
  tramosDelOrillo,
} from "./finanzas-telar-reglas";

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

describe("varias sedes a la vez (Felipe 2026-10-24)", () => {
  const T = SEDES.map((s) => s.clave); // tr, a, l, t, empresa

  it("la URL trae una lista con comas, sin repetidas; «todas» o nada es la lista vacía", () => {
    expect(sedesDeLaUrl({ sede: "l,tr" })).toEqual(["l", "tr"]);
    expect(sedesDeLaUrl({ sede: "l, l ,tr," })).toEqual(["l", "tr"]);
    expect(sedesDeLaUrl({ sede: "todas" })).toEqual([]);
    expect(sedesDeLaUrl({})).toEqual([]);
  });

  it("una pantalla que mira de a una recibe la única elegida, o «todas» si hay varias (nunca la primera de la lista)", () => {
    expect(sedeDeLaUrl({ sede: "l" })).toBe("l");
    expect(sedeDeLaUrl({ sede: "l,tr" })).toBe("todas");
  });

  it("tocar suma y quita; quitar la última vuelve a todas", () => {
    let e = alternarSede([], "l", SEDES);
    expect(e).toEqual(["l"]);
    e = alternarSede(e, "tr", SEDES);
    expect(e).toEqual(["tr", "l"]);
    e = alternarSede(e, "l", SEDES);
    expect(e).toEqual(["tr"]);
    expect(alternarSede(e, "tr", SEDES)).toEqual([]);
  });

  it("marcar todas una por una se vuelve «Todas» sola", () => {
    let e: string[] = [];
    for (const c of T) e = alternarSede(e, c, SEDES);
    expect(e).toEqual([]);
  });

  it("«Todas» limpia lo elegido", () => {
    expect(alternarSede(["l", "tr"], "todas", SEDES)).toEqual([]);
  });

  it("en una pantalla que mira de a una, tocar deja solo esa (y tocarla de nuevo vuelve a todas)", () => {
    expect(alternarSede(["l", "tr"], "a", SEDES, true)).toEqual(["a"]);
    expect(alternarSede(["a"], "a", SEDES, true)).toEqual([]);
  });

  it("lo marcado ignora sedes que la cuenta no ve; quien no ve todo, siempre la suya", () => {
    expect(sedesElegidas(["l", "no-existe"], SEDES, true, "tr")).toEqual(["l"]);
    expect(sedesElegidas(T, SEDES, true, "tr")).toEqual([]);
    expect(sedesElegidas(["l"], SEDES, false, "tr")).toEqual(["tr"]);
  });

  it("en la URL van en el orden de la barra", () => {
    expect(claveDeSedes(["l", "tr"], SEDES)).toBe("tr,l");
    expect(claveDeSedes([], SEDES)).toBe("todas");
  });

  it("dice cuáles se miran", () => {
    expect(dichoDeLaSede(["tr", "l"], SEDES)).toBe("Viendo Trujillo y Lima");
    expect(dichoDeLaSede(["tr", "l", "t"], SEDES)).toBe("Viendo Trujillo, Lima y Taller");
    expect(dichoDeLaSede(["l"], SEDES)).toBe("Viendo solo Lima");
    expect(dichoDeLaSede([], SEDES)).toBe("Viendo las cinco sedes juntas");
  });

  it("el menú lateral lleva la sede y el mes de una pantalla de Finanzas a otra, y a nada más", () => {
    const aqui = [["sede", "tr,l"], ["mes", "2026-09"], ["tab", "fijos"]] as [string, string][];
    expect(hrefConSedeYMes("/finanzas/dinero", "/finanzas/gastos", aqui)).toBe("/finanzas/dinero?sede=tr%2Cl&mes=2026-09");
    expect(hrefConSedeYMes("/ventas", "/finanzas/gastos", aqui)).toBe("/ventas");
    expect(hrefConSedeYMes("/finanzas/dinero", "/ventas", aqui)).toBe("/finanzas/dinero");
    expect(hrefConSedeYMes("/finanzas/dinero", "/finanzas/gastos", [["sede", "todas"]])).toBe("/finanzas/dinero");
  });

  it("solo juntan varias sedes las pantallas que lo declaran (Gastos, desde el 2026-10-24)", () => {
    expect(RUTAS_CON_VARIAS_SEDES).toContain("/finanzas/gastos");
    expect(aceptaVariasSedes("/finanzas/gastos")).toBe(true);
    expect(aceptaVariasSedes("/finanzas/gastos-viejos")).toBe(false);
    expect(aceptaVariasSedes("/finanzas/dinero")).toBe(RUTAS_CON_VARIAS_SEDES.includes("/finanzas/dinero"));
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
