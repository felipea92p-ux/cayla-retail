import { describe, expect, it } from "vitest";
import {
  DIAS_RONDA_OLVIDADA,
  avisoDeRonda,
  dieronDeRonda,
  estadoDeCompra,
  leerCompradores,
  leerCompradoresSinRonda,
  leerTodasLasCompras,
  llegadaDeCompra,
  puedeCerrarseDesdeCompras,
  quedaDeRonda,
  rondaElegida,
} from "./compradores-reglas";

const soles = (n: number) => `S/ ${n.toFixed(2)}`;
const cuenta = (dieron: number, compraste: number, gastaste = 0) => ({ dieron, compras: 1, compraste, gastos: 0, gastaste, prendas: 1 });
const compraCruda = {
  id: "p1",
  origen: "compra",
  persona_id: "per",
  persona: "Catherine",
  fecha: "2026-11-14",
  creado_en: "2026-11-14T15:00:00Z",
  proveedor_id: "prov",
  proveedor: "Comercial RY",
  tipo: "nota_venta",
  monto: "453.00",
  pagado: "453.00",
  medio_pago: "transferencia",
  revisada: false,
  prendas: 69,
  comprobante: null,
  envios: [{ id: "d", numero: "ENV-000024", estado: "abierto", destino: "Tienda TRU", salio_en: "2026-11-14T20:00:00Z" }],
};

describe("leer las lecturas nuevas", () => {
  it("una respuesta que no es lista es «no se pudo leer», no «nadie compra»", () => {
    expect(leerCompradores(null)).toBeNull();
    expect(leerTodasLasCompras({ error: true })).toBeNull();
    expect(leerTodasLasCompras([])).toEqual([]);
  });

  it("lee una compra con sus números como texto y descarta lo ilegible", () => {
    const [c] = leerTodasLasCompras([compraCruda, { id: "x" }])!;
    expect(c.monto).toBe(453);
    expect(c.envios[0].numero).toBe("ENV-000024");
    expect(leerTodasLasCompras([compraCruda, { id: "x" }])).toHaveLength(1);
  });

  it("lee una ronda con su cuenta y sus compras", () => {
    const [r] = leerCompradores([
      { id: "r", persona_id: "per", persona: "Catherine", abierta_en: "2026-11-13T10:00:00Z", cerrada_en: null, cuenta: cuenta(0, 1496.3, 0.8), compras: [compraCruda] },
      { id: "sin-cuenta", persona_id: "per", abierta_en: "2026-11-13T10:00:00Z" },
    ])!;
    expect(r.compras).toHaveLength(1);
    expect(r.cuenta.compraste).toBe(1496.3);
  });
});

describe("el aviso de cada ronda (Felipe 2026-11-26)", () => {
  // `tiene: null`: una base que todavía no manda lo que la persona tiene en la mano; la cuenta sale de lo anotado en la ronda, como antes.
  const base = { cerradaEn: null, abiertaEn: "2026-11-20T10:00:00Z", ultimaCompraEn: "2026-11-25T10:00:00Z", compras: [{}] as never[], tiene: null as number | null };

  it("si pagó más de lo que le diste, solo avisa cuánto", () => {
    expect(avisoDeRonda({ ...base, cuenta: cuenta(1580, 4521) }, "2026-11-26", soles)).toEqual({ tono: "ambar", texto: "Pagó S/ 2941.00 más de lo que le diste." });
  });

  it("sin plata registrada lo dice distinto", () => {
    expect(avisoDeRonda({ ...base, cuenta: cuenta(0, 1496.3, 0.8) }, "2026-11-26", soles)?.texto).toBe("Pagó S/ 1497.10 sin plata registrada.");
  });

  it(`a los ${DIAS_RONDA_OLVIDADA} días sin compras ofrece cerrar la ronda; a los 13, no`, () => {
    const vacia = { ...base, abiertaEn: "2026-10-23T10:00:00Z", ultimaCompraEn: null, compras: [], cuenta: cuenta(0, 0) };
    expect(avisoDeRonda(vacia, "2026-11-26", soles)).toEqual({ tono: "ambar", texto: "Sin compras hace 34 días.", cerrarRonda: true });
    expect(avisoDeRonda({ ...vacia, abiertaEn: "2026-11-13T10:00:00Z" }, "2026-11-26", soles)).toEqual({ tono: "neutro", texto: "Todavía no anota compras." });
  });

  it("con algo adentro, a los 14 días no ofrece cerrarla: la cierra su dueña", () => {
    const quieta = { ...base, abiertaEn: "2026-10-01T10:00:00Z", ultimaCompraEn: "2026-11-01T10:00:00Z", cuenta: cuenta(500, 500) };
    const aviso = avisoDeRonda(quieta, "2026-11-26", soles);
    expect(aviso?.cerrarRonda).toBeUndefined();
    expect(aviso?.texto).toContain("Mis compras");
    expect(puedeCerrarseDesdeCompras({ cerradaEn: null, compras: [], tiene: null, cuenta: { ...cuenta(0, 0), compras: 0 } })).toBe(true);
    expect(puedeCerrarseDesdeCompras({ cerradaEn: null, compras: [], tiene: 0, cuenta: { ...cuenta(0, 0), compras: 0 } })).toBe(true);
    expect(puedeCerrarseDesdeCompras({ cerradaEn: null, compras: [], tiene: null, cuenta: { ...cuenta(100, 0), compras: 0 } })).toBe(false);
    // Vacía por dentro pero con plata en la mano: la base la rechaza, así que la pantalla no lo ofrece.
    expect(puedeCerrarseDesdeCompras({ cerradaEn: null, compras: [], tiene: 13800, cuenta: { ...cuenta(0, 0), compras: 0 } })).toBe(false);
  });

  it("la ronda del detalle: la de la URL si es suya, si no la abierta, si no la más reciente", () => {
    const rs = [
      { id: "vieja", cerradaEn: "2026-10-29", abiertaEn: "2026-10-28" },
      { id: "abierta", cerradaEn: null, abiertaEn: "2026-11-09" },
      { id: "media", cerradaEn: "2026-11-05", abiertaEn: "2026-11-01" },
    ];
    expect(rondaElegida(rs, "vieja")?.id).toBe("vieja");
    expect(rondaElegida(rs, "de-otra")?.id).toBe("abierta");
    expect(rondaElegida(rs.filter((r) => r.id !== "abierta"), null)?.id).toBe("media");
    expect(rondaElegida([], null)).toBeNull();
  });

  it("una ronda cerrada que cuadra no avisa nada", () => {
    expect(avisoDeRonda({ ...base, cerradaEn: "2026-11-17T10:00:00Z", abiertaEn: "2026-10-01T10:00:00Z", cuenta: cuenta(4514, 4514) }, "2026-11-26", soles)).toBeNull();
  });

  it("lo que le queda nunca arrastra céntimos de punto flotante", () => {
    expect(quedaDeRonda({ tiene: null, cuenta: cuenta(0.3, 0.1, 0.2) })).toBe(0);
  });
});

// Felipe 2026-11-26: «¿por qué sale que Bhekam no tiene nada? Claudia tiene fondos y no aparece». Los cuatro casos son los de producción de ese día.
describe("la cuenta sale del fondo de la persona, no solo de lo que anotó en la ronda", () => {
  const abierta = { cerradaEn: null, abiertaEn: "2026-11-21T17:37:00Z", ultimaCompraEn: null as string | null, compras: [] as never[] };

  it("plata entregada por la oficina, sin compras: le diste y le queda dicen lo que tiene", () => {
    const bhekam = { ...abierta, tiene: 13800, cuenta: { ...cuenta(0, 0), compras: 0 } };
    expect(dieronDeRonda(bhekam)).toBe(13800);
    expect(quedaDeRonda(bhekam)).toBe(13800);
    expect(avisoDeRonda(bhekam, "2026-11-26", soles)).toEqual({ tono: "neutro", texto: "Todavía no anota compras." });
  });

  it("con plata en la mano y 14 días quieta, no ofrece cerrarla desde Compras", () => {
    const aviso = avisoDeRonda({ ...abierta, tiene: 13800, cuenta: { ...cuenta(0, 0), compras: 0 } }, "2026-12-10", soles);
    expect(aviso?.cerrarRonda).toBeUndefined();
    expect(aviso?.texto).toContain("Mis compras");
  });

  it("ya no avisa «sin plata registrada» a quien recibió su plata por una entrega", () => {
    const catherine = { ...abierta, compras: [{}] as never[], ultimaCompraEn: "2026-11-25T10:00:00Z", tiene: 9588.9, cuenta: cuenta(0, 1496.3, 0.8) };
    expect(dieronDeRonda(catherine)).toBe(11086);
    expect(quedaDeRonda(catherine)).toBe(9588.9);
    expect(avisoDeRonda(catherine, "2026-11-26", soles)).toBeNull();
  });

  it("ni «pagó más» a quien anotó parte de su plata antes de abrir la ronda", () => {
    const lizzelott = { ...abierta, compras: [{}] as never[], ultimaCompraEn: "2026-11-25T10:00:00Z", tiene: 0, cuenta: cuenta(1580, 4521) };
    expect(dieronDeRonda(lizzelott)).toBe(4521);
    expect(avisoDeRonda(lizzelott, "2026-11-26", soles)).toBeNull();
  });

  it("si de verdad pagó más de lo que tenía, lo sigue diciendo", () => {
    expect(avisoDeRonda({ ...abierta, compras: [{}] as never[], ultimaCompraEn: "2026-11-25T10:00:00Z", tiene: -200, cuenta: cuenta(0, 700) }, "2026-11-26", soles)?.texto).toBe(
      "Pagó S/ 200.00 más de lo que le diste.",
    );
    expect(avisoDeRonda({ ...abierta, compras: [{}] as never[], ultimaCompraEn: "2026-11-25T10:00:00Z", tiene: -700, cuenta: cuenta(0, 700) }, "2026-11-26", soles)?.texto).toBe(
      "Pagó S/ 700.00 sin plata registrada.",
    );
  });

  it("una ronda cerrada no lleva lo que tiene hoy: conserva su cuaderno", () => {
    const [cerrada, viva] = leerCompradores([
      { id: "c", persona_id: "per", abierta_en: "2026-11-01T10:00:00Z", cerrada_en: "2026-11-05T10:00:00Z", cuenta: cuenta(500, 400), tiene: "999.00", compras: [] },
      { id: "v", persona_id: "per", abierta_en: "2026-11-21T10:00:00Z", cerrada_en: null, cuenta: cuenta(0, 0), tiene: "13800.00", compras: [] },
    ])!;
    expect(cerrada.tiene).toBeNull();
    expect(dieronDeRonda(cerrada)).toBe(500);
    expect(quedaDeRonda(cerrada)).toBe(100);
    expect(viva.tiene).toBe(13800);
  });

  it("quién tiene plata sin ronda: lee, descarta lo ilegible y lo que no es saldo a favor", () => {
    expect(leerCompradoresSinRonda(null)).toBeNull();
    expect(
      leerCompradoresSinRonda([
        { persona_id: "cla", persona: "Claudia Pereyra", tiene: "4967.00", ultima_entrega: "2026-11-25" },
        { persona_id: "cero", persona: "Sin Plata", tiene: 0 },
        { persona: "Sin Id", tiene: 50 },
      ]),
    ).toEqual([{ personaId: "cla", persona: "Claudia Pereyra", tiene: 4967, ultimaEntrega: "2026-11-25" }]);
  });
});

describe("el estado y la llegada de una compra", () => {
  const [c] = leerTodasLasCompras([compraCruda])!;
  it("lo que falta pagar manda sobre «por revisar»", () => {
    expect(estadoDeCompra({ ...c, pagado: 260, monto: 575 }, soles)).toEqual({ tono: "ambar", texto: "Falta pagar S/ 315.00" });
    expect(estadoDeCompra(c, soles).texto).toBe("Por revisar");
    expect(estadoDeCompra({ ...c, revisada: true, comprobante: { id: "c", documento: "B001-1", saldo: 0, estadoPago: "pagada" } }, soles).texto).toBe("Revisada");
  });
  it("la llegada la dice el último envío", () => {
    expect(llegadaDeCompra(c)).toBe("Contándose en Tienda TRU");
    expect(llegadaDeCompra({ envios: [] })).toBeNull();
  });
});
