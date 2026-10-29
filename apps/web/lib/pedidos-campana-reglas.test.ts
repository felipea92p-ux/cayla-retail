import { describe, expect, it } from "vitest";
import {
  agruparLineas,
  alCostoDelPedido,
  argsCambiarFecha,
  argsConfirmar,
  avisoDePlazo,
  leerLineasDePedido,
  leerPedidosDeCampana,
  limiteParaPedir,
  pendientesPorCampana,
  type PedidoDeCampana,
} from "./pedidos-campana-reglas";

const corta = (iso: string) => {
  const [, m, d] = iso.split("-").map(Number);
  return `${d}/${m}`;
};

const crudo = (extra: Record<string, unknown> = {}) => ({
  id: "p1",
  estado: "pendiente",
  cuando: "fecha",
  fecha_prevista: "2026-11-12",
  plan: { id: "plan1", nombre: "Navidad 2026", desde: "2026-12-01", hasta: "2026-12-31", dias_para_llegar: 14 },
  categoria: { id: "c1", nombre: "Polos" },
  proveedor: { id: "v1", nombre: "Textiles Pima Norte" },
  unidades: 124,
  modelos: 4,
  costo_unitario: 19,
  paso_2_version: 3,
  desactualizado: false,
  cambio_el_proveedor: false,
  enviado_por: "Felipe",
  enviado_en: "2026-10-26T15:00:00Z",
  orden: null,
  rectificado: null,
  ...extra,
});

const pedido = (extra: Partial<PedidoDeCampana> = {}): PedidoDeCampana => leerPedidosDeCampana({ soportado: true, pedidos: [crudo()] })![0] && { ...leerPedidosDeCampana({ soportado: true, pedidos: [crudo()] })![0], ...extra };

describe("leerPedidosDeCampana", () => {
  it("lee un pedido pendiente con su campaña, categoría, proveedor, prendas y costo", () => {
    const [p] = leerPedidosDeCampana({ soportado: true, pedidos: [crudo()] })!;
    expect(p).toMatchObject({
      id: "p1",
      estado: "pendiente",
      cuando: "fecha",
      fechaPrevista: "2026-11-12",
      unidades: 124,
      modelos: 4,
      costoUnitario: 19,
      version: 3,
      desactualizado: false,
      cambioElProveedor: false,
      enviadoPor: "Felipe",
      orden: null,
      rectificado: null,
    });
    expect(p.plan).toEqual({ id: "plan1", nombre: "Navidad 2026", desde: "2026-12-01", hasta: "2026-12-31", diasParaLlegar: 14 });
    expect(p.categoria.nombre).toBe("Polos");
    expect(p.proveedor.nombre).toBe("Textiles Pima Norte");
  });

  it("lee la orden de un pedido ya pedido y el motivo de uno rectificado", () => {
    const [a, b] = leerPedidosDeCampana({
      soportado: true,
      pedidos: [
        crudo({ id: "a", estado: "pedido", orden: { id: "o1", numero: 129, texto: "OC-000129", por: "Felipe", en: "2026-10-27T10:00:00Z" } }),
        crudo({ id: "b", estado: "rectificado", rectificado: { por: "Micaela", en: "2026-10-27T11:00:00Z", motivo: "Cambié de idea" } }),
      ],
    })!;
    expect(a.orden).toEqual({ id: "o1", numero: 129, texto: "OC-000129", por: "Felipe", en: "2026-10-27T10:00:00Z" });
    expect(b.rectificado).toEqual({ por: "Micaela", en: "2026-10-27T11:00:00Z", motivo: "Cambié de idea" });
  });

  it("sin la marca «soportado» o con basura, no hay lectura; sin pedidos, vacío", () => {
    expect(leerPedidosDeCampana(null)).toBeNull();
    expect(leerPedidosDeCampana("x")).toBeNull();
    expect(leerPedidosDeCampana({ pedidos: [] })).toBeNull();
    expect(leerPedidosDeCampana({ soportado: true, pedidos: [] })).toEqual([]);
    expect(leerPedidosDeCampana({ soportado: true })).toEqual([]);
  });

  it("descarta el pedido que no se entiende: sin campaña, sin proveedor, estado raro, sin costo o sin versión", () => {
    const r = leerPedidosDeCampana({
      soportado: true,
      pedidos: [
        crudo({ id: "ok" }),
        crudo({ id: "1", plan: null }),
        crudo({ id: "2", proveedor: { nombre: "Sin id" } }),
        crudo({ id: "3", estado: "raro" }),
        crudo({ id: "4", cuando: "mañana" }),
        crudo({ id: "5", costo_unitario: "caro" }),
        crudo({ id: "6", paso_2_version: null }),
        crudo({ id: undefined }),
      ],
    })!;
    expect(r.map((p) => p.id)).toEqual(["ok"]);
  });

  it("los días para llegar sin fijar quedan en null (se usa el supuesto de fábrica)", () => {
    const [p] = leerPedidosDeCampana({ soportado: true, pedidos: [crudo({ plan: { id: "plan1", nombre: "N", desde: "2026-12-01", hasta: "2026-12-31", dias_para_llegar: null } })] })!;
    expect(p.plan.diasParaLlegar).toBeNull();
    expect(limiteParaPedir(p)).toBe("2026-11-17");
  });
});

describe("las líneas de un pedido", () => {
  it("lee las líneas y descarta las que no se entienden", () => {
    const l = leerLineasDePedido({
      soportado: true,
      lineas: [
        { modelo: "Uno", marca: "M", color: "NEG", color_nombre: "Negro", talla: "S", n: 5 },
        { modelo: "Uno", color: "NEG", talla: "M", n: 0 },
        { color: "NEG", talla: "M", n: 2 },
        { modelo: "Dos", color: "ROS", talla: null, n: 4 },
      ],
    })!;
    expect(l).toEqual([
      { modelo: "Uno", marca: "M", color: "NEG", colorNombre: "Negro", talla: "S", n: 5 },
      { modelo: "Dos", marca: null, color: "ROS", colorNombre: "ROS", talla: null, n: 4 },
    ]);
    expect(leerLineasDePedido(null)).toBeNull();
    expect(leerLineasDePedido({ soportado: false, lineas: [] })).toBeNull();
    expect(leerLineasDePedido({ soportado: true })).toEqual([]);
  });

  it("las agrupa por modelo y color con sus tallas y totales, en el orden que llegan", () => {
    const g = agruparLineas([
      { modelo: "Dos", marca: null, color: "ROS", colorNombre: "Rosado", talla: "L", n: 4 },
      { modelo: "Uno", marca: "M", color: "BLA", colorNombre: "Blanco", talla: "M", n: 2 },
      { modelo: "Uno", marca: "M", color: "NEG", colorNombre: "Negro", talla: "S", n: 5 },
      { modelo: "Uno", marca: "M", color: "NEG", colorNombre: "Negro", talla: "M", n: 3 },
    ]);
    expect(g.map((m) => [m.modelo, m.total])).toEqual([
      ["Dos", 4],
      ["Uno", 10],
    ]);
    expect(g[1].colores.map((c) => [c.colorNombre, c.total, c.tallas.map((t) => `${t.talla}${t.n}`).join(" ")])).toEqual([
      ["Blanco", 2, "M2"],
      ["Negro", 8, "S5 M3"],
    ]);
    expect(agruparLineas([])).toEqual([]);
  });
});

describe("el plazo de un pedido", () => {
  it("el límite es el inicio menos los días que tarda un pedido", () => {
    expect(limiteParaPedir(pedido())).toBe("2026-11-17");
    expect(limiteParaPedir(pedido({ plan: { id: "p", nombre: "N", desde: "2026-12-01", hasta: "2026-12-31", diasParaLlegar: 30 } }))).toBe("2026-11-01");
  });

  it("una fecha de pedido después del límite avisa «llega tarde»; en el límite o antes, no", () => {
    expect(avisoDePlazo(pedido({ fechaPrevista: "2026-11-18" }), "2026-10-26", corta)).toEqual({ tipo: "fecha-tarde", texto: "Llega tarde: después del 17/11" });
    expect(avisoDePlazo(pedido({ fechaPrevista: "2026-11-17" }), "2026-10-26", corta)).toBeNull();
    expect(avisoDePlazo(pedido({ fechaPrevista: "2026-11-01" }), "2026-10-26", corta)).toBeNull();
    expect(avisoDePlazo(pedido({ cuando: "ya", fechaPrevista: null }), "2026-10-26", corta)).toBeNull();
  });

  it("si el límite ya pasó y la campaña no empezó, avisa que lo que se pida hoy llega después del inicio", () => {
    expect(avisoDePlazo(pedido({ cuando: "ya", fechaPrevista: null }), "2026-11-20", corta)?.tipo).toBe("plazo-vencido");
    // Ya empezó: no hay un «antes de» que se pase.
    expect(avisoDePlazo(pedido({ cuando: "ya", fechaPrevista: null }), "2026-12-05", corta)).toBeNull();
    // Terminó.
    expect(avisoDePlazo(pedido({ cuando: "ya", fechaPrevista: null }), "2027-01-05", corta)).toBeNull();
  });

  it("un pedido que ya es orden o está rectificado no avisa", () => {
    expect(avisoDePlazo(pedido({ estado: "pedido", fechaPrevista: "2026-11-30" }), "2026-10-26", corta)).toBeNull();
    expect(avisoDePlazo(pedido({ estado: "rectificado", fechaPrevista: "2026-11-30" }), "2026-10-26", corta)).toBeNull();
  });
});

describe("la bandeja", () => {
  it("cuenta los pendientes por campaña, la más próxima primero, con su último día para pedir; los pedidos y rectificados no cuentan", () => {
    const otra = { id: "plan2", nombre: "Black Friday 2026", desde: "2026-11-27", hasta: "2026-11-30", diasParaLlegar: null };
    const r = pendientesPorCampana([pedido(), pedido({ id: "p2" }), pedido({ id: "p3", plan: otra }), pedido({ id: "p4", estado: "pedido" }), pedido({ id: "p5", estado: "rectificado" })]);
    expect(r.total).toBe(3);
    expect(r.porCampana.map((c) => [c.nombre, c.n, c.limite])).toEqual([
      ["Black Friday 2026", 1, "2026-11-13"],
      ["Navidad 2026", 2, "2026-11-17"],
    ]);
    expect(pendientesPorCampana([])).toEqual({ total: 0, porCampana: [] });
  });

  it("lo que cuesta un pedido al costo del plan, con dos decimales", () => {
    expect(alCostoDelPedido({ unidades: 124, costoUnitario: 19 })).toBe(2356);
    expect(alCostoDelPedido({ unidades: 3, costoUnitario: 24.46 })).toBe(73.38);
  });

  it("los argumentos de confirmar y de cambiar la fecha (nunca una fecha con «ya»)", () => {
    expect(argsConfirmar("p1")).toEqual({ p_pedido_id: "p1" });
    expect(argsCambiarFecha("p1", { cuando: "fecha", fecha: "2026-11-12" })).toEqual({ p_pedido_id: "p1", p_cuando: "fecha", p_fecha: "2026-11-12" });
    expect(argsCambiarFecha("p1", { cuando: "ya", fecha: "2026-11-30" })).toEqual({ p_pedido_id: "p1", p_cuando: "ya", p_fecha: null });
  });
});
