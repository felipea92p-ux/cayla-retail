import { describe, expect, it } from "vitest";
import {
  cierresPorDia,
  cobradoDelTurno,
  cuadreDe,
  modoCierresPredeterminado,
  pasaFiltroMovimiento,
  piezasDelCajon,
  resumenCuadres,
  sonLasPredeterminadas,
  tarjetasElegidas,
} from "./caja-tablero-reglas";

describe("cobradoDelTurno", () => {
  it("deja el adelanto de separaciones fuera de lo cobrado hoy y junta Yape con Plin", () => {
    const r = cobradoDelTurno({ efectivo: 185, tarjeta: 120, yape: 50, plin: 18, anticipo: 30 });
    expect(r.total).toBe(373);
    expect(r.anticipo).toBe(30);
    expect(r.metodos).toEqual([
      { clave: "efectivo", texto: "Efectivo", monto: 185 },
      { clave: "tarjeta", texto: "Tarjeta", monto: 120 },
      { clave: "yape", texto: "Yape / Plin", monto: 68 },
    ]);
  });

  it("sin ventas no inventa métodos", () => {
    expect(cobradoDelTurno({})).toEqual({ total: 0, anticipo: 0, metodos: [] });
  });

  it("un método desconocido cae en «Otro»", () => {
    expect(cobradoDelTurno({ credito: 10 }).metodos).toEqual([{ clave: "otro", texto: "Otro", monto: 10 }]);
  });
});

describe("piezasDelCajon", () => {
  const base = { ventasEfectivo: 185, ingresos: 0, egresos: 25, reembolsosEfectivo: 0, cambiosEfectivo: 0 };
  it("muestra siempre apertura, ventas, entradas y salidas", () => {
    expect(piezasDelCajon(300, base).map((p) => p.etiqueta)).toEqual(["Apertura", "Ventas en efectivo", "Entradas", "Salidas"]);
  });
  it("suma devoluciones y cambios solo si hubo, con su signo", () => {
    const p = piezasDelCajon(300, { ...base, reembolsosEfectivo: 40, cambiosEfectivo: -10 });
    expect(p.slice(4)).toEqual([
      { etiqueta: "Devoluciones", monto: 40, signo: "−" },
      { etiqueta: "Cambios", monto: 10, signo: "−" },
    ]);
  });
});

describe("pasaFiltroMovimiento", () => {
  const ventaEf = { icono: "venta" as const, titulo: "Venta · efectivo" };
  const ventaYape = { icono: "venta" as const, titulo: "Venta · yape" };
  const egreso = { icono: "egreso" as const, titulo: "Depósito bancario" };
  it("«Mueve el cajón» deja fuera una venta sin efectivo", () => {
    expect([ventaEf, ventaYape, egreso].filter((e) => pasaFiltroMovimiento(e, "cajon"))).toEqual([ventaEf, egreso]);
  });
  it("«Ventas» deja fuera los movimientos manuales", () => {
    expect([ventaEf, ventaYape, egreso].filter((e) => pasaFiltroMovimiento(e, "ventas"))).toEqual([ventaEf, ventaYape]);
  });
});

describe("cuadreDe", () => {
  it("cuadra por debajo de un céntimo", () => expect(cuadreDe(0.004).clave).toBe("ok"));
  it("hasta S/ 5 es ámbar, más es rojo, y dice si faltó o sobró", () => {
    expect(cuadreDe(-2)).toEqual({ clave: "poco", texto: "Faltó S/ 2.00", diferencia: -2 });
    expect(cuadreDe(12)).toEqual({ clave: "mal", texto: "Sobró S/ 12.00", diferencia: 12 });
  });
});

describe("resumenCuadres", () => {
  it("cuenta los que cuadraron y guarda el peor", () => {
    const r = resumenCuadres([
      { diferencia: 0, cerradaEn: "a", cerradaPorNombre: "Ana" },
      { diferencia: -2, cerradaEn: "b", cerradaPorNombre: "Ana" },
      { diferencia: -12, cerradaEn: "c", cerradaPorNombre: "Lucía" },
    ]);
    expect(r.cuadraron).toBe(1);
    expect(r.total).toBe(3);
    expect(r.peor).toEqual({ diferencia: -12, cerradaEn: "c", quien: "Lucía" });
  });
});

describe("cierresPorDia", () => {
  it("junta dos cierres del mismo día y manda el peor cuadre", () => {
    const d = cierresPorDia([
      { dia: "2026-09-22", montoCierreSistema: 300, diferencia: 0 },
      { dia: "2026-09-22", montoCierreSistema: 200, diferencia: -12 },
      { dia: "2026-09-21", montoCierreSistema: 100, diferencia: 0 },
    ]);
    expect(d.map((x) => x.dia)).toEqual(["2026-09-21", "2026-09-22"]);
    expect(d[1]!.esperado).toBe(500);
    expect(d[1]!.peor.clave).toBe("mal");
  });
});

describe("predeterminados", () => {
  it("el líder ve el semáforo y la colaboradora el último cierre", () => {
    expect(modoCierresPredeterminado(true)).toBe("semaforo");
    expect(modoCierresPredeterminado(false)).toBe("ultimo");
  });
  it("sin nada guardado trae Pendientes y Apartados, si la cuenta los tiene", () => {
    expect(tarjetasElegidas(null, ["pendientes", "apartados", "gastos"])).toEqual(["pendientes", "apartados"]);
    expect(tarjetasElegidas(undefined, ["pendientes", "gastos"])).toEqual(["pendientes"]);
  });
  it("lo guardado se limpia: nada desconocido ni fuera de lo disponible", () => {
    expect(tarjetasElegidas(["gastos", "x", "posventa"], ["pendientes", "gastos"])).toEqual(["gastos"]);
  });
  it("reconoce cuándo la elección es la predeterminada", () => {
    expect(sonLasPredeterminadas(["pendientes", "apartados"], ["pendientes", "apartados", "gastos"])).toBe(true);
    expect(sonLasPredeterminadas(["pendientes"], ["pendientes", "apartados"])).toBe(false);
  });
});
