import { describe, expect, it } from "vitest";
import { conHistorial, explicarPropuesta, leerPropuesta, proponer, simular, type LecturaPropuesta, type TiendaPropuesta } from "./plan-compra-propuesta";
import { medir, sumarDias, type LecturaHistorial } from "./plan-compra-historial";
import { calcular } from "./plan-compra-reglas";

const tienda = (id: string, extra: Partial<TiendaPropuesta> = {}): TiendaPropuesta => ({ id, nombre: id === "tru" ? "Tienda TRU" : "Tienda AQP", dias90: 90, ventanas: 6, previaDisponible: false, multiplicador: null, multiplicadorHistorial: null, ...extra });
const lectura = (tiendas: TiendaPropuesta[], hechos: { tienda: string; u90: number; ventanas?: number[]; previa?: number; agotada?: boolean }[], diasCampana = 30): LecturaPropuesta => ({
  planId: "p",
  diasCampana,
  previa: { desde: "2025-12-01", hasta: "2025-12-31" },
  recupero: { pct: null, heredado: false },
  tiendas,
  categorias: new Map([["polos", hechos.map((h) => ({ ventanas: [], previa: 0, agotada: false, ...h }))]]),
  tiendasActivas: tiendas.map((x) => ({ id: x.id, nombre: x.nombre })),
  minimos: new Map(),
  historialLeido: false,
});

/** Un historial de Sinatra: `base` soles por día en los 60 días antes de diciembre de 2025 (con `diasConVenta` de ellos) y `campana` en diciembre. */
const historial = (porTienda: Record<string, { base: number; campana: number; diasConVenta?: number }>): LecturaHistorial => {
  const dias = new Map<string, Map<string, number>>();
  for (const [id, v] of Object.entries(porTienda)) {
    const d = new Map<string, number>();
    for (let i = 0; i < 60; i++) if (i < (v.diasConVenta ?? 60)) d.set(sumarDias("2025-10-02", i), v.base);
    for (let i = 0; i < 31; i++) d.set(sumarDias("2025-12-01", i), v.campana);
    dias.set(id, d);
  }
  return {
    hoy: "2026-10-13",
    tiendas: Object.keys(porTienda).map((id) => ({ id, nombre: id, erpDesde: "2026-09-30", historiaDesde: "2017-09-01" })),
    meses: new Map(),
    dias,
  };
};

describe("proponer: el ejemplo de Felipe", () => {
  it("sin campaña anterior en el ERP: normal = un mes estándar (163) y bueno = × 3 (489)", () => {
    const p = proponer(lectura([tienda("tru")], [{ tienda: "tru", u90: 489, ventanas: [163, 150, 170, 140, 160, 158] }]), "polos")!;
    expect([p.flojo, p.normal, p.bueno]).toEqual([140, 163, 489]);
    expect(p.tiendas[0].como).toBe("x3");
  });
  it("con la campaña del año pasado: el punto medio entre normal × multiplicador (450) y lo vendido (400) = 425", () => {
    const p = proponer(lectura([tienda("tru", { previaDisponible: true, multiplicador: 3 })], [{ tienda: "tru", u90: 450, ventanas: [150], previa: 400 }]), "polos")!;
    expect(p.bueno).toBe(425);
    expect(p.tiendas[0].como).toBe("punto-medio");
  });
  it("si el año pasado se agotó, no promedia: solo normal × multiplicador (450)", () => {
    const p = proponer(lectura([tienda("tru", { previaDisponible: true, multiplicador: 3 })], [{ tienda: "tru", u90: 450, ventanas: [150], previa: 400, agotada: true }]), "polos")!;
    expect(p.bueno).toBe(450);
    expect(p.tiendas[0].como).toBe("agotada");
  });
});

describe("proponer: tiendas, días y bordes", () => {
  it("suma las tiendas: una con historia (punto medio) y otra sin ella (× 3)", () => {
    const p = proponer(
      lectura(
        [tienda("tru", { previaDisponible: true, multiplicador: 2 }), tienda("aqp")],
        [
          { tienda: "tru", u90: 300, ventanas: [100], previa: 180 },
          { tienda: "aqp", u90: 60, ventanas: [20] },
        ],
      ),
      "polos",
    )!;
    // TRU: normal 100, bueno (200 + 180) / 2 = 190. AQP: normal 20, bueno 60.
    expect([p.flojo, p.normal, p.bueno]).toEqual([120, 120, 250]);
  });
  it("una campaña de 15 días propone la mitad que un mes", () => {
    const p = proponer(lectura([tienda("tru")], [{ tienda: "tru", u90: 300, ventanas: [100] }], 15), "polos")!;
    expect([p.flojo, p.normal, p.bueno]).toEqual([50, 50, 150]);
  });
  it("con poca historia mide el ritmo en los días que hubo ERP, no en 90", () => {
    const p = proponer(lectura([tienda("tru", { dias90: 15, ventanas: 0 })], [{ tienda: "tru", u90: 30 }]), "polos")!;
    expect(p.normal).toBe(60);
  });
  it("sin un mes completo en alguna tienda que vende, el flojo no se propone y dice por qué", () => {
    const p = proponer(lectura([tienda("tru", { ventanas: 0, dias90: 13 })], [{ tienda: "tru", u90: 13, ventanas: [13] }]), "polos")!;
    expect(p.flojo).toBeNull();
    expect(p.motivoSinFlojo).toBe("Tienda TRU todavía no tiene un mes completo de ventas en el ERP: escribe el flojo tú.");
  });
  it("solo cuenta las ventanas completas para el mes más bajo", () => {
    const p = proponer(lectura([tienda("tru", { ventanas: 2 })], [{ tienda: "tru", u90: 300, ventanas: [100, 90, 0, 0, 0, 0] }]), "polos")!;
    expect(p.flojo).toBe(90);
  });
  it("siempre ordenado (flojo ≤ normal ≤ bueno), aunque un mes bajo quede sobre el ritmo de 90 días", () => {
    const p = proponer(lectura([tienda("tru", { ventanas: 1, previaDisponible: true, multiplicador: 0.5 })], [{ tienda: "tru", u90: 90, ventanas: [80], previa: 5 }]), "polos")!;
    expect(p.flojo! <= p.normal && p.normal <= p.bueno).toBe(true);
  });
  it("redondea por tienda antes de multiplicar: «normal 3 × 3» es 9, nunca 8", () => {
    const p = proponer(lectura([tienda("tru", { dias90: 16, ventanas: 0 })], [{ tienda: "tru", u90: 3 }], 14), "polos")!;
    expect([p.normal, p.bueno]).toEqual([3, 9]);
  });
  it("sin ventas en 90 días no hay de dónde proponer", () => {
    expect(proponer(lectura([tienda("tru")], [{ tienda: "tru", u90: 0 }]), "polos")).toBeNull();
    expect(proponer(lectura([tienda("tru")], []), "otra")).toBeNull();
  });
});

describe("sin la campaña en el ERP, el multiplicador del historial (Felipe 2026-10-13)", () => {
  it("usa el de la tienda en vez del × 3: con ×1.84, el bueno de 163 es 300 y no 489", () => {
    const p = proponer(lectura([tienda("tru", { multiplicadorHistorial: 1.84 })], [{ tienda: "tru", u90: 489, ventanas: [163, 150, 170, 140, 160, 158] }]), "polos")!;
    expect([p.flojo, p.normal, p.bueno]).toEqual([140, 163, 300]);
    expect(p.tiendas[0]).toMatchObject({ como: "historial", multiplicador: 1.84 });
  });
  it("cada tienda con el suyo: Trujillo ×1.84 y Arequipa ×1.11 suman 206, donde el × 3 daba 360", () => {
    const tiendas = [tienda("tru", { multiplicadorHistorial: 1.84 }), tienda("aqp", { multiplicadorHistorial: 1.11 })];
    const hechos = [{ tienda: "tru", u90: 300, ventanas: [100] }, { tienda: "aqp", u90: 60, ventanas: [20] }];
    expect(proponer(lectura(tiendas, hechos), "polos")!.bueno).toBe(206);
    expect(proponer(lectura([tienda("tru"), tienda("aqp")], hechos), "polos")!.bueno).toBe(360);
  });
  it("si la campaña ya está en el ERP, manda el ERP (con su punto medio) y el historial no se usa", () => {
    const p = proponer(lectura([tienda("tru", { previaDisponible: true, multiplicador: 3, multiplicadorHistorial: 1.1 })], [{ tienda: "tru", u90: 450, ventanas: [150], previa: 400 }]), "polos")!;
    expect(p.bueno).toBe(425);
    expect(p.tiendas[0].como).toBe("punto-medio");
  });
  it("una tienda sin historial cae al × 3, aunque otra sí lo tenga", () => {
    const p = proponer(lectura([tienda("tru", { multiplicadorHistorial: 2 }), tienda("aqp")], [{ tienda: "tru", u90: 300, ventanas: [100] }, { tienda: "aqp", u90: 60, ventanas: [20] }]), "polos")!;
    expect(p.tiendas.map((t) => [t.tienda, t.como, t.bueno])).toEqual([
      ["Tienda TRU", "historial", 200],
      ["Tienda AQP", "x3", 60],
    ]);
  });
});

describe("conHistorial: el mismo número que la pantalla Historial", () => {
  it("mide diciembre contra sus 60 días de antes: 200 por día sobre 100 es ×2", () => {
    const l = conHistorial(lectura([tienda("tru")], []), historial({ tru: { base: 100, campana: 200 } }));
    expect(l.historialLeido).toBe(true);
    expect(l.tiendas[0].multiplicadorHistorial).toBe(2);
  });
  it("da exactamente lo que `medir` le da a Historial, redondeado a tres decimales", () => {
    const h = historial({ tru: { base: 4198, campana: 7717 } });
    const esperado = medir(h, h.tiendas[0], "2025-12-01", "2025-12-31");
    expect(esperado.estado).toBe("medida");
    const m = (esperado as { multiplicador: number }).multiplicador;
    expect(conHistorial(lectura([tienda("tru")], []), h).tiendas[0].multiplicadorHistorial).toBe(Math.round(m * 1000) / 1000);
  });
  it("con menos de 20 días de venta en la base no hay multiplicador (la misma vara de Historial)", () => {
    const l = conHistorial(lectura([tienda("tru")], []), historial({ tru: { base: 100, campana: 200, diasConVenta: 19 } }));
    expect(l.tiendas[0].multiplicadorHistorial).toBeNull();
  });
  it("una tienda que no está en el historial queda sin multiplicador; las demás lo tienen", () => {
    const l = conHistorial(lectura([tienda("tru"), tienda("aqp")], []), historial({ tru: { base: 100, campana: 150 } }));
    expect(l.tiendas.map((t) => t.multiplicadorHistorial)).toEqual([1.5, null]);
  });
  it("sin historial (no se pudo leer), la lectura vuelve igual y el bueno es el × 3 de antes", () => {
    const l = lectura([tienda("tru")], [{ tienda: "tru", u90: 300, ventanas: [100] }]);
    expect(conHistorial(l, null)).toBe(l);
    expect(proponer(conHistorial(l, null), "polos")!.bueno).toBe(300);
  });
});

describe("el simulador", () => {
  const linea = { normal: 100, flojo: 60, bueno: 300, precio: 60, costo: 20, recuperoPct: 40, stock: 50 };
  it("con la cuenta del Plan, un bueno más alto compra más y uno más bajo, menos; sin guardar nada", () => {
    const tres = simular([linea], 3, null, calcular);
    const dos = simular([linea], 2, null, calcular);
    expect(tres.prendas).toBeGreaterThan(dos.prendas);
    expect(tres.inversion).toBe(tres.prendas * 20);
  });
  it("lo que sobra más barato compra menos (pasarse cuesta más)", () => {
    expect(simular([linea], 3, 10, calcular).prendas).toBeLessThan(simular([linea], 3, 90, calcular).prendas);
  });
  it("el bueno nunca queda igual o bajo el normal", () => {
    expect(simular([linea], 0.5, null, calcular).prendas).toBeGreaterThanOrEqual(0);
  });
});

describe("leerPropuesta y explicar", () => {
  it("lee la forma de la base y descarta lo que no calza", () => {
    const l = leerPropuesta({
      plan_id: "p",
      dias_campana: 31,
      previa: { desde: "2025-12-01", hasta: "2025-12-31" },
      recupero_defecto: { pct: 40, heredado: true },
      tiendas: [{ id: "tru", nombre: "Tienda TRU", dias_90: 90, ventanas: 6, previa_disponible: true, multiplicador: "1.8" }, { id: "" }],
      categorias: [{ c: "polos", u: "tru", u90: 489, ventanas: [163, 150], previa: 400, agotada: false }, { c: "x" }],
    })!;
    expect(l.tiendas).toHaveLength(1);
    expect(l.tiendas[0].multiplicador).toBe(1.8);
    expect(l.recupero).toEqual({ pct: 40, heredado: true });
    expect(l.categorias.get("polos")?.[0].previa).toBe(400);
    expect(leerPropuesta(null)).toBeNull();
  });
  it("explica cada cifra en palabras de tienda", () => {
    const p = proponer(
      lectura([tienda("tru", { previaDisponible: true, multiplicador: 3 }), tienda("aqp")], [{ tienda: "tru", u90: 450, ventanas: [150], previa: 400 }, { tienda: "aqp", u90: 90, ventanas: [30] }]),
      "polos",
    )!;
    const e = explicarPropuesta(p);
    expect(e.normal).toBe("Normal 180: lo que vende a su ritmo de los últimos 90 días, en los 30 días de la campaña.");
    expect(e.flojo).toBe("Flojo 180: su mes más bajo de los últimos seis.");
    expect(e.bueno).toBe("Bueno 515: Tienda AQP: normal × 3 (todavía no hay la campaña del año pasado en el ERP); Tienda TRU: el punto medio entre normal × 3.0 (lo que esa tienda vendió de más el año pasado) y las 400 que vendió en esa campaña.");
  });
  it("explica el bueno que sale del historial, y el × 3 cuando la campaña no estaba ni en el ERP ni en el historial", () => {
    const l = { ...lectura([tienda("tru", { multiplicadorHistorial: 1.84 }), tienda("aqp")], [{ tienda: "tru", u90: 489, ventanas: [163] }, { tienda: "aqp", u90: 90, ventanas: [30] }]), historialLeido: true };
    expect(explicarPropuesta(proponer(l, "polos")!).bueno).toBe(
      "Bueno 390: Tienda AQP: normal × 3 (esa campaña del año pasado no está ni en el ERP ni en su historial); Tienda TRU: normal × 1.8 (lo que esa tienda vendió de más en esa campaña el año pasado, según su historial).",
    );
  });
});
