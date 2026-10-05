import { describe, expect, it } from "vitest";
import { entradaPorColgar, nombresConResto, porColgarDeLaSede, resumenPlegado, tareasParaHoy, textoLlegada, type EntradaParaHoy } from "./existencias-para-hoy";
import type { FilaPrenda } from "./existencias-prendas";

const vacia: EntradaParaHoy = {
  separa: true,
  porColgar: { tallas: 0, unidades: 0, prendas: [] },
  sinStockAtras: { tallas: 0 },
  sinRegistrar: { pendientes: 0, vencidas: 0 },
  danadas: 0,
  resuelveDanadas: true,
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

  it("donde no se vende (`null`), la cola no se dibuja", () => {
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
    // No manda a otra pantalla: el botón de la fila ya lleva a la lista (antes decía «en Recibir», que dejó de tenerla con ADR-0330).
    expect(t.detalle).not.toMatch(/Recibir/);
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

describe("lo que encontró la revisión (2026-10-04)", () => {
  it("«sin stock atrás» dice la misma palabra que el filtro y no promete «queda poco en el piso»", () => {
    const [t] = tareasParaHoy({ ...vacia, sinStockAtras: { tallas: 2 } });
    expect(t.texto).toBe("tallas sin stock atrás");
    expect(t.detalle).not.toMatch(/queda poco/i);
  });
  it("las dañadas solo piden «tu decisión» a quien puede decidir", () => {
    expect(tareasParaHoy({ ...vacia, danadas: 1, resuelveDanadas: true })[0].detalle).toMatch(/tu decisión/);
    expect(tareasParaHoy({ ...vacia, danadas: 1, resuelveDanadas: false })[0].detalle).toMatch(/un líder decide/);
  });
});

describe("resumenPlegado (la línea del celular)", () => {
  it("toma el tono más grave: un plazo vencido no se esconde detrás de «por colgar»", () => {
    const tareas = tareasParaHoy({ ...vacia, porColgar: { tallas: 5, unidades: 9, prendas: [] }, apartados: { vencidos: 1 } });
    const r = resumenPlegado(tareas)!;
    expect(r.primera.tipo).toBe("por_colgar");
    expect(r.tono).toBe("rojo");
    expect(r.mas).toBe(1);
    expect(r.vencidasDentro).toBe(1);
  });
  it("sin tareas no hay línea", () => {
    expect(resumenPlegado([])).toBeNull();
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

describe("porColgarDeLaSede (la única cuenta de «por colgar»)", () => {
  const REPONER = { tipo: "reponer_a_piso" as const, texto: "Reponer a piso", motivo: null, contexto: null };
  // Lo libre ya viene neto de apartados (`sumarCantidades`): aquí solo importa piso y almacén.
  const talla = (varianteId: string, productoId: string, color: string, t: string, piso: number | null, almacen: number | null): FilaPrenda =>
    ({
      varianteId, productoId, referencia: `Modelo ${productoId}`, sku: varianteId, talla: t, color, colorHex: null, fotoUrl: null,
      codigosBarras: [], pisoDisponible: piso, almacenDisponible: almacen, disponible: (piso ?? 0) + (almacen ?? 0),
      apartado: 0, danado: 0, enTransito: 0, accionHoy: piso === 0 ? REPONER : null, marca: null,
    }) as FilaPrenda;

  it("cuenta solo las tallas sin ninguna colgada y con guardadas, y suma lo que se puede colgar", () => {
    const r = porColgarDeLaSede([
      talla("a", "blusa", "Azul", "S", 0, 4), // por colgar: 4
      talla("b", "blusa", "Azul", "M", 0, 2), // por colgar: 2
      talla("c", "blusa", "Azul", "L", 1, 9), // colgada: no
      talla("d", "blusa", "Negro", "M", 0, 0), // agotada (sin stock atrás): no se puede colgar
      talla("e", "polo", "Blanco", "M", 0, 1), // por colgar: 1
    ]);
    expect(r.tallas).toBe(3);
    expect(r.unidades).toBe(7);
    expect(r.filas.map((f) => f.varianteId)).toEqual(["a", "b", "e"]);
    // Por prenda (modelo + color): la que más tallas tiene por colgar primero, y solo con sus tallas por colgar.
    expect(r.prendas.map((p) => [p.productoId, p.color, p.tallas.map((f) => f.talla)])).toEqual([
      ["blusa", "Azul", ["S", "M"]],
      ["polo", "Blanco", ["M"]],
    ]);
    expect(entradaPorColgar(r)).toEqual({ tallas: 3, unidades: 7, prendas: ["Modelo blusa", "Modelo polo"] });
  });

  it("sin nada por colgar, o en el Taller (no separa piso y almacén), da cero y no NaN", () => {
    expect(porColgarDeLaSede([])).toMatchObject({ tallas: 0, unidades: 0, prendas: [] });
    expect(porColgarDeLaSede([talla("t", "blusa", "Azul", "M", null, null)])).toMatchObject({ tallas: 0, unidades: 0, prendas: [] });
  });
});
