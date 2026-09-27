import { describe, expect, it } from "vitest";
import {
  accionesDePedido,
  ajustarCantidad,
  estadoVisiblePedido,
  etiquetaLinea,
  faltaEnOrigen,
  hayPedidosQueMostrar,
  lineasParaRpc,
  llegadaIso,
  motivoCancelacion,
  motivoNoSePuedePedir,
  opcionesLlegada,
  pedidoEntreSedesDeFila,
  separarPedidos,
  textoPrendas,
  totalPrendas,
  type PedidoEntreSedes,
} from "./pedidos-entre-sedes-reglas";

const fila = (extra: Record<string, unknown> = {}) => ({
  grupo_id: "g1",
  direccion: "me_piden",
  otra_sede: "Tienda Lima",
  otra_sede_id: "lim",
  estado: "pedido",
  created_at: "2026-09-26T15:00:00Z",
  creado_por_nombre: "Micaela Ríos",
  nota: "Para el sábado",
  traslado_id: null,
  traslado_numero: null,
  cancelado_motivo: null,
  lineas: [
    { pedido_id: "p1", variante_id: "v1", producto: "Blusa Carlita", color: "Blanco", talla: "M", sku: "BLU-01", cantidad: 2, estado: "pedido", disponible_en_origen: 5 },
    { pedido_id: "p2", variante_id: "v2", producto: "Falda Rosa", color: null, talla: "", sku: null, cantidad: 1, estado: "pedido", disponible_en_origen: 0 },
  ],
  ...extra,
});

const pedido = (extra: Partial<PedidoEntreSedes> = {}): PedidoEntreSedes => ({ ...pedidoEntreSedesDeFila(fila()), ...extra });

describe("pedidoEntreSedesDeFila", () => {
  it("lee el grupo y sus líneas", () => {
    const p = pedidoEntreSedesDeFila(fila());
    expect(p.grupoId).toBe("g1");
    expect(p.direccion).toBe("me_piden");
    expect(p.creadoPorNombre).toBe("Micaela Ríos");
    expect(p.lineas).toHaveLength(2);
    expect(p.lineas[0]).toMatchObject({ pedidoId: "p1", varianteId: "v1", cantidad: 2, disponibleEnOrigen: 5, estado: "pedido" });
    expect(p.lineas[1].talla).toBeNull();
  });

  it("tolera lo que falta: sin líneas, estado raro, disponible negativo", () => {
    const p = pedidoEntreSedesDeFila(fila({ lineas: null, estado: "otro", direccion: "pedi", creado_por_nombre: " " }));
    expect(p.lineas).toEqual([]);
    expect(p.estado).toBe("pedido");
    expect(p.direccion).toBe("pedi");
    expect(p.creadoPorNombre).toBeNull();
    const q = pedidoEntreSedesDeFila(fila({ lineas: [{ variante_id: "v", disponible_en_origen: -3 }] }));
    expect(q.lineas[0].disponibleEnOrigen).toBe(0);
  });

  it("lee el traslado cuando ya salió", () => {
    const p = pedidoEntreSedesDeFila(fila({ estado: "en_camino", traslado_id: "t1", traslado_numero: 42 }));
    expect(p.trasladoId).toBe("t1");
    expect(p.trasladoNumero).toBe(42);
  });
});

describe("textos", () => {
  it("etiquetaLinea junta producto, color y talla sin huecos", () => {
    expect(etiquetaLinea({ producto: "Blusa Carlita", color: "Blanco", talla: "M" })).toBe("Blusa Carlita · Blanco · M");
    expect(etiquetaLinea({ producto: "Falda Rosa", color: null, talla: "" })).toBe("Falda Rosa");
  });

  it("totalPrendas y textoPrendas", () => {
    expect(totalPrendas(pedido())).toBe(3);
    expect(textoPrendas(1)).toBe("1 prenda");
    expect(textoPrendas(3)).toBe("3 prendas");
  });

  it("faltaEnOrigen: solo mientras sigue por enviar", () => {
    expect(faltaEnOrigen({ cantidad: 1, disponibleEnOrigen: 0, estado: "pedido" })).toBe(true);
    expect(faltaEnOrigen({ cantidad: 2, disponibleEnOrigen: 5, estado: "pedido" })).toBe(false);
    expect(faltaEnOrigen({ cantidad: 1, disponibleEnOrigen: 0, estado: "en_camino" })).toBe(false);
  });

  it("estadoVisiblePedido según el lado", () => {
    expect(estadoVisiblePedido({ estado: "pedido", direccion: "pedi", otraSede: "Tienda Trujillo" })).toEqual({ texto: "Esperando a Tienda Trujillo", tono: "ambar" });
    expect(estadoVisiblePedido({ estado: "pedido", direccion: "me_piden", otraSede: "Tienda Lima" })).toEqual({ texto: "Por enviar", tono: "ambar" });
    expect(estadoVisiblePedido({ estado: "en_camino", direccion: "pedi", otraSede: "x" }).tono).toBe("pizarra");
    expect(estadoVisiblePedido({ estado: "recibido", direccion: "pedi", otraSede: "x" }).texto).toBe("Llegó");
    expect(estadoVisiblePedido({ estado: "cancelado", direccion: "pedi", otraSede: "x" }).tono).toBe("apagado");
  });

  it("motivoCancelacion según quién cancela", () => {
    expect(motivoCancelacion("me_piden")).toBe("No la tengo");
    expect(motivoCancelacion("pedi")).toBe("Ya no la necesito");
  });
});

describe("separarPedidos y hayPedidosQueMostrar", () => {
  it("«Te piden» solo lo que me pidieron y no salió; «Pediste» todo lo mío", () => {
    const lista = [
      pedido({ grupoId: "a" }),
      pedido({ grupoId: "b", estado: "en_camino" }),
      pedido({ grupoId: "c", direccion: "pedi" }),
      pedido({ grupoId: "d", direccion: "pedi", estado: "cancelado" }),
    ];
    const { tePiden, pediste } = separarPedidos(lista);
    expect(tePiden.map((p) => p.grupoId)).toEqual(["a"]);
    expect(pediste.map((p) => p.grupoId)).toEqual(["c", "d"]);
  });

  it("sin nada que mostrar, no hay tarjeta", () => {
    expect(hayPedidosQueMostrar([])).toBe(false);
    expect(hayPedidosQueMostrar([pedido({ estado: "recibido" })])).toBe(false);
    expect(hayPedidosQueMostrar([pedido()])).toBe(true);
  });
});

describe("accionesDePedido", () => {
  it("me piden y sigue por enviar: Enviar y No la tengo", () => {
    expect(accionesDePedido({ estado: "pedido", direccion: "me_piden", trasladoId: null })).toEqual({ enviar: true, noLaTengo: true, yaNoLaNecesito: false, verTraslado: false });
  });
  it("pedí y sigue por enviar: solo Ya no la necesito", () => {
    expect(accionesDePedido({ estado: "pedido", direccion: "pedi", trasladoId: null })).toEqual({ enviar: false, noLaTengo: false, yaNoLaNecesito: true, verTraslado: false });
  });
  it("ya salió: solo el enlace al traslado", () => {
    expect(accionesDePedido({ estado: "en_camino", direccion: "pedi", trasladoId: "t" })).toEqual({ enviar: false, noLaTengo: false, yaNoLaNecesito: false, verTraslado: true });
    expect(accionesDePedido({ estado: "recibido", direccion: "me_piden", trasladoId: "t" }).verTraslado).toBe(true);
  });
  it("cancelado sin traslado: nada", () => {
    expect(accionesDePedido({ estado: "cancelado", direccion: "pedi", trasladoId: null })).toEqual({ enviar: false, noLaTengo: false, yaNoLaNecesito: false, verTraslado: false });
  });
});

describe("llegada", () => {
  it("Hoy, Mañana y Pasado mañana, cruzando el mes", () => {
    expect(opcionesLlegada("2026-09-29").map((o) => `${o.etiqueta}:${o.fecha}`)).toEqual(["Hoy:2026-09-29", "Mañana:2026-09-30", "Pasado mañana:2026-10-01"]);
  });
  it("se guarda al cierre del día en Lima", () => {
    expect(llegadaIso("2026-09-30")).toBe("2026-09-30T19:00:00-05:00");
    expect(new Date(llegadaIso("2026-09-30")).toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });
});

describe("modal Pedir a otra sede", () => {
  it("ajustarCantidad entre 0 y lo disponible", () => {
    expect(ajustarCantidad(1, 1, 3)).toBe(2);
    expect(ajustarCantidad(3, 1, 3)).toBe(3);
    expect(ajustarCantidad(0, -1, 3)).toBe(0);
    expect(ajustarCantidad(2, 1, 0)).toBe(0);
  });

  it("lineasParaRpc deja fuera las de 0 y topa a lo disponible", () => {
    expect(
      lineasParaRpc([
        { varianteId: "a", etiqueta: "A", disponibleEnOrigen: 5, cantidad: 2 },
        { varianteId: "b", etiqueta: "B", disponibleEnOrigen: 5, cantidad: 0 },
        { varianteId: "c", etiqueta: "C", disponibleEnOrigen: 1, cantidad: 4 },
      ]),
    ).toEqual([
      { variante_id: "a", cantidad: 2 },
      { variante_id: "c", cantidad: 1 },
    ]);
  });

  it("motivoNoSePuedePedir", () => {
    expect(motivoNoSePuedePedir([{ varianteId: "a", etiqueta: "A", disponibleEnOrigen: 5, cantidad: 0 }])).toBe("Elige al menos una prenda");
    expect(motivoNoSePuedePedir([{ varianteId: "a", etiqueta: "A", disponibleEnOrigen: 5, cantidad: 1 }])).toBeNull();
    const muchas = Array.from({ length: 101 }, (_, i) => ({ varianteId: `v${i}`, etiqueta: "x", disponibleEnOrigen: 1, cantidad: 1 }));
    expect(motivoNoSePuedePedir(muchas)).toMatch(/hasta 100/);
  });
});
