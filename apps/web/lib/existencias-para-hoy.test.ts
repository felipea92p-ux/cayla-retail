import { describe, expect, it } from "vitest";
import { nombresConResto, tareasParaHoy, textoLlegada, type EntradaParaHoy } from "./existencias-para-hoy";

const vacia: EntradaParaHoy = {
  separa: true,
  porColgar: { tallas: 0, unidades: 0, prendas: [] },
  sinStockAtras: { tallas: 0 },
  sinRegistrar: { pendientes: 0, vencidas: 0 },
  danadas: 0,
  apartados: { vencidos: 0 },
  enCamino: { traslados: 0, atrasados: 0, proximaLlegada: null },
};

describe("tareasParaHoy", () => {
  it("una sede al día no tiene tareas: nada en 0 se dibuja", () => {
    expect(tareasParaHoy(vacia)).toEqual([]);
  });

  it("ordena: colgar, ventas sin registrar, dañadas, apartados, traslados y al final lo que se pide afuera", () => {
    const tareas = tareasParaHoy({
      ...vacia,
      porColgar: { tallas: 12, unidades: 30, prendas: ["Blusa Emma"] },
      sinStockAtras: { tallas: 4 },
      sinRegistrar: { pendientes: 67, vencidas: 0 },
      danadas: 1,
      apartados: { vencidos: 2 },
      enCamino: { traslados: 1, atrasados: 0, proximaLlegada: null },
    });
    expect(tareas.map((t) => t.tipo)).toEqual(["por_colgar", "sin_registrar", "danadas", "apartados_vencidos", "en_camino", "sin_stock_atras"]);
  });

  it("en el Taller (no separa piso y almacén) no hay «por colgar» ni «sin nada atrás»", () => {
    const tareas = tareasParaHoy({ ...vacia, separa: false, porColgar: { tallas: 5, unidades: 9, prendas: [] }, sinStockAtras: { tallas: 3 }, danadas: 1 });
    expect(tareas.map((t) => t.tipo)).toEqual(["danadas"]);
  });

  it("si quien mira no ve Recibir (`null`), la cola no se dibuja: no podría resolverla", () => {
    expect(tareasParaHoy({ ...vacia, sinRegistrar: null })).toEqual([]);
  });

  it("una venta sin registrar vencida sube el tono a rojo y lo dice", () => {
    const [t] = tareasParaHoy({ ...vacia, sinRegistrar: { pendientes: 3, vencidas: 1 } });
    expect(t.tono).toBe("rojo");
    expect(t.detalle).toContain("1 lleva más de 2 días");
  });

  it("un traslado atrasado reemplaza al «en camino»: no se dicen las dos cosas del mismo envío", () => {
    const tareas = tareasParaHoy({ ...vacia, enCamino: { traslados: 2, atrasados: 1, proximaLlegada: null } });
    expect(tareas.map((t) => t.tipo)).toEqual(["traslados_atrasados"]);
  });

  it("«por colgar» nunca es rojo: es trabajo, no un error", () => {
    const [t] = tareasParaHoy({ ...vacia, porColgar: { tallas: 1, unidades: 1, prendas: ["Casaca Ximena"] } });
    expect(t.tono).toBe("ambar");
    expect(t.texto).toBe("talla por colgar");
    expect(t.detalle).toBe("1 guardada y ninguna colgada: empieza por Casaca Ximena. ¿Ya cuelgan? Regístralas al bajar.");
  });

  it("si la cola de ventas sin registrar falló, lo dice sin número (no la calla ni inventa un 0)", () => {
    const [t] = tareasParaHoy({ ...vacia, sinRegistrar: "fallo" });
    expect(t.tipo).toBe("sin_registrar");
    expect(t.cifra).toBeNull();
    expect(t.texto).toBe("No se pudo leer las ventas sin registrar");
  });

  it("como mucho 2 filas en rojo: la tercera vencida baja a ámbar", () => {
    const tareas = tareasParaHoy({
      ...vacia,
      sinRegistrar: { pendientes: 5, vencidas: 2 },
      apartados: { vencidos: 1 },
      enCamino: { traslados: 1, atrasados: 1, proximaLlegada: null },
    });
    expect(tareas.map((t) => t.tono)).toEqual(["rojo", "rojo", "ambar"]);
    expect(tareas.filter((t) => t.tono === "rojo")).toHaveLength(2);
  });
});

describe("nombresConResto", () => {
  it("dice hasta dos nombres y cuántos más, sin repetir", () => {
    expect(nombresConResto([])).toBe("");
    expect(nombresConResto(["A"])).toBe("A");
    expect(nombresConResto(["A", "B"])).toBe("A y B");
    expect(nombresConResto(["A", "A", "B", "C", "D"])).toBe("A, B y 2 más");
  });
});

describe("textoLlegada", () => {
  it("usa la hora de Lima", () => {
    // 15:30 UTC = 10:30 en Lima (UTC−5).
    expect(textoLlegada("2026-10-05T15:30:00Z")).toMatch(/10:30$/);
  });
});
