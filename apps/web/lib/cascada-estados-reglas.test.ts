import { describe, expect, it } from "vitest";
import { filasDeTramos, geometriaCascada, type FilaCascada } from "./cascada-estados-reglas";
import type { TramoCascada } from "./pulso-reglas";

// La escena de la maqueta: vendiste 48,600, costó 24,300, margen 24,300, sueldos 9,800 (plan 9,500), alquileres 8,200, otros 1,850,
// desgaste 600, ganaste 3,850.
const TRAMOS: TramoCascada[] = [
  { clave: "ventas", nombre: "Vendiste", monto: 48600, tipo: "entra" },
  { clave: "costo", nombre: "Lo que costaron esas prendas", monto: 24300, tipo: "sale" },
  { clave: "planilla", nombre: "Sueldos", monto: 9800, tipo: "sale", plan: 9500, desvio: 0.03 },
  { clave: "local", nombre: "Alquileres y servicios", monto: 8200, tipo: "sale" },
  { clave: "otros", nombre: "Otros gastos", monto: 1850, tipo: "sale", plan: 1600, desvio: 0.15 },
  { clave: "depreciacion", nombre: "Desgaste de equipos", monto: 600, tipo: "sale" },
  { clave: "queda", nombre: "Ganaste", monto: 3850, tipo: "queda" },
];

describe("filasDeTramos", () => {
  it("el primero es el total, los del medio pasos con signo y el último el final; el margen entra tras el costo", () => {
    const f = filasDeTramos(TRAMOS, { tras: "costo", clave: "margen", nombre: "Te quedó de margen", detalle: (v) => `${Math.round((v / 48600) * 100)} % de lo vendido` });
    expect(f.map((x) => [x.clave, x.tipo, x.valor])).toEqual([
      ["ventas", "total", 48600],
      ["costo", "paso", -24300],
      ["margen", "subtotal", 24300],
      ["planilla", "paso", -9800],
      ["local", "paso", -8200],
      ["otros", "paso", -1850],
      ["depreciacion", "paso", -600],
      ["queda", "final", 3850],
    ]);
    expect(f[2]!.detalle).toBe("50 % de lo vendido");
    expect(f[3]!.plan).toBe(9500);
  });
  it("un final negativo (perdiste) sale con su signo", () => {
    const f = filasDeTramos([TRAMOS[0]!, { clave: "costo", nombre: "Costo", monto: 50000, tipo: "sale" }, { clave: "queda", nombre: "Perdiste", monto: 1400, tipo: "queda", negativo: true }]);
    expect(f.at(-1)).toMatchObject({ tipo: "final", valor: -1400 });
  });
});

describe("geometriaCascada", () => {
  const filas = filasDeTramos(TRAMOS, { tras: "costo", clave: "margen", nombre: "Te quedó de margen" });
  const g = geometriaCascada(filas);
  it("cada paso empieza donde terminó el anterior", () => {
    const [ventas, costo, margen, sueldos] = g.filas;
    expect(ventas).toMatchObject({ izq: 0, ancho: 100, clase: "total" });
    // El costo va de 48,600 a 24,300: de 100 % a 50 %.
    expect(costo!.izq).toBeCloseTo(50);
    expect(costo!.ancho).toBeCloseTo(50);
    expect(costo!.clase).toBe("resta");
    expect(margen).toMatchObject({ izq: 0, clase: "subtotal" });
    expect(margen!.ancho).toBeCloseTo(50);
    // Los sueldos nacen donde quedó el margen y van hacia la izquierda.
    expect(sueldos!.izq + sueldos!.ancho).toBeCloseTo(50);
  });
  it("la raya de lo planeado va donde terminaría el paso gastando justo lo planeado", () => {
    const sueldos = g.filas[3]!;
    // 24,300 − 9,500 = 14,800 → 14,800 / 48,600.
    expect(sueldos.plan).toBeCloseTo((14800 / 48600) * 100);
    expect(g.filas[1]!.plan).toBeNull();
  });
  it("el final ganado es un total; sin negativos no hay eje", () => {
    expect(g.filas.at(-1)!.clase).toBe("total");
    expect(g.eje).toBeNull();
  });
  it("con una pérdida, el final es rojo y el cero se marca", () => {
    const perd: FilaCascada[] = [
      { clave: "v", nombre: "Vendiste", valor: 100, tipo: "total" },
      { clave: "c", nombre: "Costó", valor: -150, tipo: "paso" },
      { clave: "f", nombre: "Perdiste", valor: -50, tipo: "final" },
    ];
    const r = geometriaCascada(perd);
    expect(r.filas[2]!.clase).toBe("pierde");
    // De −50 a 100: el cero está a un tercio.
    expect(r.eje).toBeCloseTo(100 / 3);
    expect(r.filas[2]!.izq).toBeCloseTo(0);
  });
  it("una sede lleva su color y un monto chico se ve igual", () => {
    const r = geometriaCascada([
      { clave: "a", nombre: "Trujillo", valor: 10000, tipo: "total", color: "var(--color-sede-tru)" },
      { clave: "b", nombre: "Lima", valor: 1, tipo: "total", color: "var(--color-sede-lim)" },
    ]);
    expect(r.filas.map((x) => x.clase)).toEqual(["sede", "sede"]);
    expect(r.filas[1]!.ancho).toBeGreaterThan(0.5);
  });
});
