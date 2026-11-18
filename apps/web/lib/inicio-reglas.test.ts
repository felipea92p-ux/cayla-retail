import { describe, it, expect } from "vitest";
import { fuenteVentasDeHoy, leerClaureDeHoy, mostrarHoy, nombreDiaLima, notaClaureDeHoy, resumirHoy, semanaSinClaure, sinClaure } from "./inicio-reglas";

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

describe("fuenteVentasDeHoy", () => {
  it("la líder lee el día de toda la sede", () => {
    expect(fuenteVentasDeHoy(true)).toBe("fn_ventas_del_dia");
  });

  it("una integrante lee solo lo que ella atendió: nunca el día de su tienda", () => {
    // fn_ventas_del_dia le devolvía a una integrante TODAS las ventas de su tienda y el Inicio las mostraba como «Tus ventas».
    expect(fuenteVentasDeHoy(false)).toBe("fn_mis_ventas_del_dia");
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

// Lo mismo que comprueba `scripts/pruebas/claure_inicio_y_observatorio.mjs` contra Postgres: la base dice qué parte de cada venta de hoy es de CLAURE y aquí se resta.
describe("lo de CLAURE no suma en «Hoy» (ADR-0560, actividad 6a)", () => {
  const respuesta = {
    hay_claure: true,
    hoy: [
      { venta_id: "a1", de_claure: "118.00", lineas_de_casa: 1 },
      { venta_id: "a2", de_claure: "177.00", lineas_de_casa: 0 },
    ],
    semana_pasada: "50.00",
  };
  const ventas = [
    { id: "a1", total: 236 }, // mixta: 118 de CLAURE + 118 de CAYLA
    { id: "a2", total: 177 }, // solo de CLAURE
    { id: "a3", total: 100 }, // solo de CAYLA
  ];

  it("lee la respuesta de la base; sin CLAURE en la sede (o sin respuesta) no hay nada que restar", () => {
    expect(leerClaureDeHoy(respuesta)).toEqual({
      hoy: [
        { ventaId: "a1", deClaure: 118, lineasDeCasa: 1 },
        { ventaId: "a2", deClaure: 177, lineasDeCasa: 0 },
      ],
      semanaPasada: 50,
    });
    expect(leerClaureDeHoy({ hay_claure: false, hoy: [], semana_pasada: 0 })).toBeNull();
    expect(leerClaureDeHoy(null)).toBeNull();
    expect(leerClaureDeHoy("x")).toBeNull();
  });

  it("una venta solo de CLAURE no cuenta como venta; la mixta cuenta por sus líneas de CAYLA; la de CAYLA queda igual", () => {
    const r = sinClaure(ventas, leerClaureDeHoy(respuesta));
    expect(r.totales).toEqual([118, 100]);
    expect(r.excluido).toBe(295);
    // Así «Hoy» dice 2 ventas y S/ 218 (valor medio 109), no 3 ventas y S/ 513.
    expect(r.totales.reduce((a, t) => a + t, 0)).toBe(218);
  });

  it("sin nada de CLAURE hoy, las ventas quedan como llegan de Caja", () => {
    expect(sinClaure(ventas, null)).toEqual({ totales: [236, 177, 100], excluido: 0 });
    expect(sinClaure(ventas, { hoy: [], semanaPasada: 0 })).toEqual({ totales: [236, 177, 100], excluido: 0 });
  });

  it("la semana pasada también se compara sin lo de CLAURE (nunca bajo cero; sin base sigue sin ella)", () => {
    const c = leerClaureDeHoy(respuesta);
    expect(semanaSinClaure(300, c)).toBe(250);
    expect(semanaSinClaure(30, c)).toBe(0);
    expect(semanaSinClaure(null, c)).toBeNull();
    expect(semanaSinClaure(300, null)).toBe(300);
  });

  it("la línea bajo «Hoy» dice cuánto se dejó fuera y que Caja sí lo cuenta; sin nada fuera, no se dibuja", () => {
    expect(notaClaureDeHoy(295)).toBe("No incluye S/\u00a0295.00 de lo que se vendió de CLAURE: Caja sí lo cuenta.");
    expect(notaClaureDeHoy(0)).toBeNull();
  });
});
