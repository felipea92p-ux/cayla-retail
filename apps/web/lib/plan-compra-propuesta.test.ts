import { describe, expect, it } from "vitest";
import { explicarPropuesta, leerPropuesta, proponer, simular, type LecturaPropuesta, type TiendaPropuesta } from "./plan-compra-propuesta";
import { calcular } from "./plan-compra-reglas";

const tienda = (id: string, extra: Partial<TiendaPropuesta> = {}): TiendaPropuesta => ({ id, nombre: id === "tru" ? "Tienda TRU" : "Tienda AQP", dias90: 90, ventanas: 6, previaDisponible: false, multiplicador: null, ...extra });
const lectura = (tiendas: TiendaPropuesta[], hechos: { tienda: string; u90: number; ventanas?: number[]; previa?: number; agotada?: boolean }[], diasCampana = 30): LecturaPropuesta => ({
  planId: "p",
  diasCampana,
  previa: { desde: "2025-12-01", hasta: "2025-12-31" },
  recupero: { pct: null, heredado: false },
  tiendas,
  categorias: new Map([["polos", hechos.map((h) => ({ ventanas: [], previa: 0, agotada: false, ...h }))]]),
  tiendasActivas: tiendas.map((x) => ({ id: x.id, nombre: x.nombre })),
  minimos: new Map(),
});

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
});
