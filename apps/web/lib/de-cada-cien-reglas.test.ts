import { describe, expect, it } from "vitest";
import { deCadaCien, repartirCuadros } from "./de-cada-cien-reglas";
import type { HiloRecorrido, Recorrido } from "./recorrido-plata-reglas";

// «De cada S/ 100 que vendes» (Resumen, spike 3): el recorrido de la plata sobre 100, con cuadros que suman exactamente 100.

const texto = (s: string) => s.replace(/ /g, " ");
const hilo = (clave: string, monto: number, tipo: HiloRecorrido["tipo"], extra: Partial<HiloRecorrido> = {}): HiloRecorrido => ({ clave, nombre: clave, monto, tipo, ...extra });
const suma = (hs: HiloRecorrido[]) => hs.reduce((a, h) => a + h.monto, 0);

/** Un recorrido «vende» como el de la maqueta: vendiste 46,900; ropa 22,500; gastos de las tiendas 17,250; Taller 620; Empresa 2,680; te deja 3,850. */
function recorrido(o: { entradas?: HiloRecorrido[]; salidas?: HiloRecorrido[]; resultado?: number; modo?: Recorrido["modo"] } = {}): Recorrido {
  const entradas = o.entradas ?? [hilo("tienda:tru", 30_900, "tienda"), hilo("tienda:aqp", 16_000, "tienda")];
  const salidas = o.salidas ?? [hilo("prendas", 22_500, "prendas"), hilo("gastos", 17_250, "gastos"), hilo("taller", 620, "taller", { sedeId: "tal" }), hilo("empresa", 2_680, "empresa", { sedeId: "empresa" }), hilo("deja", 3_850, "deja")];
  return { modo: o.modo ?? "vende", entradas, nudo: { nombre: "Vendiste", monto: 46_900, total: suma(entradas) }, salidas, resultado: o.resultado ?? 3_850, nota: "" };
}

describe("repartirCuadros", () => {
  it("siempre suma exactamente 100, aunque redondear parte por parte dé 99 o 101", () => {
    // Tres partes iguales: 33,33 cada una. Redondeadas suman 99; con el mayor resto, 100.
    const c = repartirCuadros([1, 1, 1]);
    expect(c.reduce((a, b) => a + b, 0)).toBe(100);
    expect([...c].sort()).toEqual([33, 33, 34]);
  });

  it("reparte según el monto y los empates los gana la primera", () => {
    expect(repartirCuadros([48, 36.8, 1.3, 5.7, 8.2])).toEqual([48, 37, 1, 6, 8]);
    expect(repartirCuadros([1, 1, 1])).toEqual([34, 33, 33]);
  });

  it("sin montos no hay cuadros", () => {
    expect(repartirCuadros([0, 0])).toEqual([0, 0]);
    expect(repartirCuadros([])).toEqual([]);
  });
});

describe("deCadaCien · te quedan", () => {
  it("pone el recorrido sobre 100: de cada S/ 100 vendidos, lo que queda es lo que deja el mes", () => {
    const c = deCadaCien(recorrido());
    expect(c?.tipo).toBe("queda");
    if (c?.tipo !== "queda") return;
    expect(c.queda).toBe(8);
    expect(texto(c.titular)).toBe("De cada S/ 100 que vendes, te quedan S/ 8.");
    expect(texto(c.chip)).toBe("De cada S/ 100 vendidos, te quedan S/ 8");
    expect(c.partes.map((p) => [p.clave, p.cuadros])).toEqual([["prendas", 48], ["gastos", 37], ["taller", 1], ["empresa", 6], ["deja", 8]]);
  });

  it("los cuadros suman 100 con cualquier reparto", () => {
    const c = deCadaCien(recorrido({ salidas: [hilo("prendas", 333, "prendas"), hilo("gastos", 333, "gastos"), hilo("deja", 334, "deja")], entradas: [hilo("tienda:a", 1_000, "tienda")] }));
    expect(c?.tipo === "queda" && c.partes.reduce((a, p) => a + p.cuadros, 0)).toBe(100);
  });

  it("un hilo de más (el sobrante de caja entra, Otros ajustes sale) cuenta dentro de los 100: lo que entra es igual a lo que sale", () => {
    const c = deCadaCien(
      recorrido({
        entradas: [hilo("tienda:a", 1_000, "tienda"), hilo("sobrante", 100, "sobrante")],
        salidas: [hilo("prendas", 550, "prendas"), hilo("gastos", 300, "gastos"), hilo("ajustes", 50, "ajustes"), hilo("deja", 200, "deja")],
        resultado: 200,
      }),
    );
    expect(c?.tipo === "queda" && c.partes.reduce((a, p) => a + p.cuadros, 0)).toBe(100);
  });

  it("si no queda nada, lo dice en vez de pintar un cuadro verde de cero", () => {
    const c = deCadaCien(recorrido({ salidas: [hilo("prendas", 30_000, "prendas"), hilo("gastos", 16_900, "gastos")], resultado: 0, entradas: [hilo("tienda:a", 46_900, "tienda")] }));
    expect(c?.tipo === "queda" && c.queda).toBe(0);
    expect(c?.tipo === "queda" && texto(c.titular)).toBe("De cada S/ 100 que vendes, no te queda nada.");
  });
});

describe("deCadaCien · el mes pierde", () => {
  it("no hay cuadro verde: dice cuánto se gasta por cada S/ 100 que se vende", () => {
    // Vendió 100,000 y gastó 105,000: el hilo «Te faltan» (5,000) entra para que cuadre.
    const c = deCadaCien(
      recorrido({
        entradas: [hilo("tienda:a", 100_000, "tienda"), hilo("falta", 5_000, "falta")],
        salidas: [hilo("prendas", 50_000, "prendas"), hilo("gastos", 55_000, "gastos")],
        resultado: -5_000,
      }),
    );
    expect(c?.tipo).toBe("pierde");
    expect(c?.tipo === "pierde" && c.gastas).toBe(105);
    expect(texto(c?.titular ?? "")).toBe("Por cada S/ 100 que vendes, gastas S/ 105.");
  });
});

describe("deCadaCien · cuando no aplica", () => {
  it("sin recorrido, o mirando el Taller o la Empresa (no venden), no hay «cada S/ 100 que vendes»", () => {
    expect(deCadaCien(null)).toBeNull();
    expect(deCadaCien(recorrido({ modo: "sostiene" }))).toBeNull();
  });

  it("un mes sin ventas (solo un sobrante de caja) no dice «te quedan S/ 100 de cada S/ 100»", () => {
    const r = recorrido({ entradas: [hilo("sobrante", 224, "sobrante")], salidas: [hilo("deja", 224, "deja")], resultado: 224 });
    r.nudo.monto = 0;
    expect(deCadaCien(r)).toBeNull();
  });

  it("un recorrido vacío no divide entre cero", () => {
    expect(deCadaCien(recorrido({ entradas: [], salidas: [] }))).toBeNull();
  });
});
