import { describe, it, expect } from "vitest";
import { mostrarHoy, nombreDiaLima, resumirHoy } from "./inicio-reglas";

describe("mostrarHoy", () => {
  it("solo las tiendas venden", () => {
    expect(mostrarHoy({ ubicacionTipo: "tienda" })).toBe(true);
    expect(mostrarHoy({ ubicacionTipo: "taller" })).toBe(false);
    expect(mostrarHoy({ ubicacionTipo: "almacen" })).toBe(false);
  });
});

describe("Inicio de una terminal que no vende (sin tipo: lo que ve sale de su ROL)", () => {
  const admin = {
    rol: "integrante",
    ubicacionTipo: "tienda",
    terminal: true,
    modulos: ["existencias", "conteos", "traslados", "movimientos", "recibir", "productos", "atributos", "proveedores"],
  } as const;

  it("no muestra «Hoy»: si viera el Punto de venta habría aterrizado en /vender", () => {
    expect(mostrarHoy(admin)).toBe(false);
    expect(mostrarHoy({ ubicacionTipo: "tienda", terminal: false })).toBe(true);
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
    expect(r.valorMedio).toBeNull();
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
