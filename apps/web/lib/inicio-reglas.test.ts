import { describe, it, expect } from "vitest";
import { accesosInicio, colasInicio, mostrarHoy, nombreDiaLima, resumirHoy } from "./inicio-reglas";

describe("mostrarHoy", () => {
  it("solo las tiendas venden", () => {
    expect(mostrarHoy({ ubicacionTipo: "tienda" })).toBe(true);
    expect(mostrarHoy({ ubicacionTipo: "taller" })).toBe(false);
    expect(mostrarHoy({ ubicacionTipo: "almacen" })).toBe(false);
  });
});

describe("nombreDiaLima", () => {
  it("usa la hora de Lima: las 11 p. m. del viernes en Lima siguen siendo viernes aunque en UTC ya sea sábado", () => {
    expect(nombreDiaLima(Date.UTC(2026, 8, 26, 4, 0))).toBe("viernes"); // 26-sep 04:00 UTC = 25-sep 23:00 Lima
  });
  it("y a las 5 a. m. UTC ya es el día siguiente en Lima", () => {
    expect(nombreDiaLima(Date.UTC(2026, 8, 26, 5, 0))).toBe("sábado");
  });
});

describe("resumirHoy", () => {
  it("suma, cuenta y saca el valor medio", () => {
    const r = resumirHoy([100, 200, 300], null, null, "viernes");
    expect(r.importe).toBe(600);
    expect(r.ventas).toBe(3);
    expect(r.valorMedio).toBe(200);
  });
  it("sin ventas no divide por cero", () => {
    const r = resumirHoy([], null, null, "viernes");
    expect(r.valorMedio).toBe(0);
    expect(r.meta).toBeNull();
  });
  it("compara contra el mismo día de la semana pasada, y no inventa un «infinito %» si esa semana fue cero", () => {
    expect(resumirHoy([1240], 980, null, "viernes").comparativo?.texto).toBe("▲ 27% vs. viernes pasado");
    expect(resumirHoy([1240], 0, null, "viernes").comparativo).toBeNull();
    expect(resumirHoy([1240], null, null, "viernes").comparativo).toBeNull(); // no se pudo leer
  });
  it("la meta: porcentaje, cuánto falta y barra tope 100 % (vender de más no rompe la barra)", () => {
    const m = resumirHoy([1240], null, 1500, "viernes").meta!;
    expect(m).toMatchObject({ pct: 83, barra: 83, falta: 260, meta: 1500 });
    const pasada = resumirHoy([1800], null, 1500, "viernes").meta!;
    expect(pasada).toMatchObject({ pct: 120, barra: 100, falta: 0 });
  });
  it("una meta en cero o ausente se trata como «sin meta»", () => {
    expect(resumirHoy([100], null, 0, "viernes").meta).toBeNull();
    expect(resumirHoy([100], null, null, "viernes").meta).toBeNull();
  });
});

describe("colasInicio", () => {
  it("una cola que no se pudo leer NO se dibuja como cero: lo dice", () => {
    const c = colasInicio({ traslados: null })[0]!;
    expect(c.cantidad).toBeNull();
    expect(c.detalle).toMatch(/No pude leer/);
  });
  it("cero, uno y varios", () => {
    expect(colasInicio({ traslados: 0 })[0]!.detalle).toBe("Nada pendiente.");
    expect(colasInicio({ traslados: 1 })[0]!.detalle).toBe("1 espera tu confirmación.");
    expect(colasInicio({ traslados: 2 })[0]!.detalle).toBe("2 esperan tu confirmación.");
  });
});

describe("accesosInicio", () => {
  const nombres = (a: ReturnType<typeof accesosInicio>) => a.map((x) => x.etiqueta);
  it("líder de tienda: Vender primero, Caja con su estado, Buscar", () => {
    const a = accesosInicio({ rol: "lider", ubicacionTipo: "tienda" }, true);
    expect(nombres(a)).toEqual(["Vender", "Caja", "Buscar"]);
    expect(a[0]!.principal).toBe(true);
    expect(a[1]!.detalle).toBe("Abierta");
    expect(accesosInicio({ rol: "lider", ubicacionTipo: "tienda" }, false)[1]!.detalle).toMatch(/Cerrada/);
    expect(accesosInicio({ rol: "lider", ubicacionTipo: "tienda" }, null)[1]!.detalle).toBe("Ver el estado de la caja");
  });
  it("colaboradora de tienda: Vender, Recibir, Buscar", () => {
    expect(nombres(accesosInicio({ rol: "integrante", ubicacionTipo: "tienda" }, true))).toEqual(["Vender", "Recibir", "Buscar"]);
  });
  it("Taller: Producción primero y nada de Vender, aunque quien mire sea líder", () => {
    const a = accesosInicio({ rol: "lider", ubicacionTipo: "taller" }, null);
    expect(nombres(a)).toEqual(["Producción", "Recibir", "Buscar"]);
    expect(nombres(a)).not.toContain("Vender");
    expect(a[0]!.href).toBe("/produccion");
  });
  it("almacén: Recibir primero", () => {
    expect(nombres(accesosInicio({ rol: "integrante", ubicacionTipo: "almacen" }, null))).toEqual(["Recibir", "Inventario", "Buscar"]);
  });
  it("siempre hay exactamente un acceso principal", () => {
    for (const tipo of ["tienda", "almacen", "taller"] as const)
      for (const rol of ["lider", "integrante"] as const)
        expect(accesosInicio({ rol, ubicacionTipo: tipo }, null).filter((x) => x.principal)).toHaveLength(1);
  });
});
