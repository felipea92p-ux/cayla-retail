import { describe, expect, it } from "vitest";
import {
  accionesDePedido,
  conPrendaElegida,
  filasEnviables,
  LINEA_ELEGIDA_VACIA,
  lineasElegidasParaPedir,
  prendasPedibles,
  prendasYaElegidasEnOtras,
  sedesParaPedir,
  ajustarCantidad,
  estadoVisiblePedido,
  etiquetaLinea,
  faltaEnOrigen,
  lineasParaRpc,
  llegadaIso,
  motivoCancelacion,
  motivoNoSePuedePedir,
  opcionesLlegada,
  pedidoEntreSedesDeFila,
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

describe("Pedir desde Traslados: elegir la tienda y las prendas (ADR-0242 D-7)", () => {
  const TRU = { id: "tru", nombre: "Tienda Trujillo", tipo: "tienda", activo: true };
  const AQP = { id: "aqp", nombre: "Tienda AQP", tipo: "tienda", activo: true };
  const LIM = { id: "lim", nombre: "Tienda Lima", tipo: "tienda", activo: true };
  const TALLER = { id: "taller", nombre: "Taller", tipo: "taller", activo: true };

  describe("sedesParaPedir", () => {
    it("ofrece las OTRAS tiendas: ni el Taller (la base lo rechaza) ni la propia", () => {
      expect(sedesParaPedir([TRU, AQP, LIM, TALLER], "lim")).toEqual([
        { id: "tru", nombre: "Tienda Trujillo" },
        { id: "aqp", nombre: "Tienda AQP" },
      ]);
    });
    it("no ofrece una tienda inactiva", () => {
      expect(sedesParaPedir([TRU, { ...AQP, activo: false }, LIM], "lim")).toEqual([{ id: "tru", nombre: "Tienda Trujillo" }]);
    });
    it("si quien pide es el Taller, no hay a quién (solo se pide entre tiendas)", () => {
      expect(sedesParaPedir([TRU, LIM, TALLER], "taller")).toEqual([]);
    });
    it("si la propia sede no existe en la lista, tampoco inventa destinos", () => {
      expect(sedesParaPedir([TRU, LIM], "fantasma")).toEqual([]);
    });
  });

  describe("filasEnviables: lo que la otra tienda puede MANDAR (su almacén, no el piso)", () => {
    const fila = (o: Partial<{ almacen_libre: number; sin_lugar: number; talla_retirada: boolean }>) => ({ variante_id: "a", ubicacion_id: "tru", almacen_libre: 0, sin_lugar: 0, talla_retirada: false, ...o });
    it("ofrece solo el almacén: lo que está en el piso no se puede mandar", () => {
      expect(filasEnviables([fila({ almacen_libre: 3 })])[0]!.cantidad).toBe(3);
    });
    it("una sede sin piso y almacén (lo que no tiene lugar asignado) cuenta completo", () => {
      expect(filasEnviables([fila({ sin_lugar: 4 })])[0]!.cantidad).toBe(4);
    });
    it("una prenda solo en el piso ofrece cero: así no se pide lo que ella respondería «No la tengo»", () => {
      const filas = filasEnviables([fila({ almacen_libre: 0 })]);
      expect(prendasPedibles(filas, "tru", new Map([["a", "Blusa"]]))).toEqual([]);
    });
    it("una talla retirada no se ofrece aunque tenga stock", () => {
      expect(filasEnviables([fila({ almacen_libre: 5, talla_retirada: true })])).toEqual([]);
    });
  });

  describe("prendasPedibles", () => {
    const etiquetas = new Map([["a", "Blusa Emma · L · Beige"], ["b", "Blusa Emma · M · Beige"], ["c", "Falda Renata · S · Negro"]]);
    it("junta piso y almacén de la misma prenda y solo mira la sede pedida", () => {
      const filas = [
        { variante_id: "a", ubicacion_id: "tru", cantidad: 3 },
        { variante_id: "a", ubicacion_id: "tru", cantidad: 2 }, // la misma prenda en otro lugar de la tienda
        { variante_id: "a", ubicacion_id: "aqp", cantidad: 9 }, // otra sede: no cuenta
      ];
      expect(prendasPedibles(filas, "tru", etiquetas)).toEqual([{ varianteId: "a", etiqueta: "Blusa Emma · L · Beige", disponible: 5 }]);
    });
    it("descarta los ceros y lo que no tiene nombre (no se pide una prenda a ciegas)", () => {
      const filas = [
        { variante_id: "a", ubicacion_id: "tru", cantidad: 0 },
        { variante_id: "b", ubicacion_id: "tru", cantidad: 4 },
        { variante_id: "sin-nombre", ubicacion_id: "tru", cantidad: 7 },
      ];
      expect(prendasPedibles(filas, "tru", etiquetas)).toEqual([{ varianteId: "b", etiqueta: "Blusa Emma · M · Beige", disponible: 4 }]);
    });
    it("sale ordenada por nombre, sin importar el orden en que llegó el stock", () => {
      const filas = [
        { variante_id: "c", ubicacion_id: "tru", cantidad: 1 },
        { variante_id: "b", ubicacion_id: "tru", cantidad: 1 },
        { variante_id: "a", ubicacion_id: "tru", cantidad: 1 },
      ];
      expect(prendasPedibles(filas, "tru", etiquetas).map((p) => p.varianteId)).toEqual(["a", "b", "c"]);
    });
    it("una sede sin stock da una lista vacía, no un error", () => {
      expect(prendasPedibles([], "tru", etiquetas)).toEqual([]);
    });
  });

  describe("las líneas que elige la persona", () => {
    const prendas = [
      { varianteId: "a", etiqueta: "Blusa Emma · L · Beige", disponible: 5 },
      { varianteId: "b", etiqueta: "Blusa Emma · M · Beige", disponible: 1 },
    ];
    it("una línea sin prenda no cuenta ni estorba: con solo esa, todavía no se puede pedir", () => {
      const lineas = lineasElegidasParaPedir([LINEA_ELEGIDA_VACIA], prendas);
      expect(lineas).toEqual([]);
      expect(motivoNoSePuedePedir(lineas)).toBe("Elige al menos una prenda");
    });
    it("la cantidad se topa a lo que la otra tienda tiene libre", () => {
      expect(lineasElegidasParaPedir([{ varianteId: "b", cantidad: 9 }], prendas)).toEqual([
        { varianteId: "b", etiqueta: "Blusa Emma · M · Beige", disponibleEnOrigen: 1, cantidad: 1 },
      ]);
    });
    it("una prenda que ya no está en la lista (la tienda la vendió y se recargó) se ignora", () => {
      expect(lineasElegidasParaPedir([{ varianteId: "vendida", cantidad: 2 }, { varianteId: "a", cantidad: 2 }], prendas)).toHaveLength(1);
    });
    it("lo que sale hacia la base solo trae prendas con cantidad (0 = no la pido)", () => {
      const lineas = lineasElegidasParaPedir([{ varianteId: "a", cantidad: 0 }, { varianteId: "b", cantidad: 1 }], prendas);
      expect(lineasParaRpc(lineas)).toEqual([{ variante_id: "b", cantidad: 1 }]);
    });
    it("al elegir una prenda queda en 1, y nunca por encima de lo que tiene libre", () => {
      expect(conPrendaElegida("a", prendas)).toEqual({ varianteId: "a", cantidad: 1 });
      expect(conPrendaElegida("desconocida", prendas)).toEqual({ varianteId: "desconocida", cantidad: 0 });
    });
    it("una prenda ya elegida en otra línea no se ofrece de nuevo (pero la propia sí se conserva)", () => {
      const elegidas = [{ varianteId: "a", cantidad: 1 }, { varianteId: "", cantidad: 1 }, { varianteId: "b", cantidad: 1 }];
      expect([...prendasYaElegidasEnOtras(elegidas, 1)].sort()).toEqual(["a", "b"]);
      expect([...prendasYaElegidasEnOtras(elegidas, 0)]).toEqual(["b"]);
    });
  });
});
