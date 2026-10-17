import { describe, expect, it } from "vitest";
import type { LlegadaPrenda, PartePedido } from "./analisis-tipos";
import {
  franjaDePedido,
  NOTA_DE_LO_PEDIDO,
  notaDePedidoDeTipo,
  notaPedidoSinTipo,
  pedidoAparte,
  pedidoDeMiTienda,
  pedidoPorTipo,
  pedidoSinTipo,
  sinPedido,
  TIPOS_EN_LA_FRANJA,
  yaPedidoCorto,
  yaPedidoDetalle,
} from "./analisis-pedido-en-camino-reglas";

/** Hoy en las pruebas: Navidad queda a 79 días (el 25 de diciembre). */
const HOY = "2026-10-07";
const NAVIDAD = "2026-12-25";

// Datos inventados (el repo es público): tipos, marcas y números de mentira.
const parte = (de: PartePedido["de"], cantidad: number, fecha: string | null, extra: Partial<PartePedido> = {}): PartePedido => ({
  de,
  categoria: "Polos",
  prefijo: "POL",
  marca: "Marca Uno",
  cantidad,
  fecha,
  numeros: [12],
  ...extra,
});
const polos = (partes: PartePedido[], hasta?: string) => pedidoPorTipo(partes, HOY, hasta).get("Polos") ?? sinPedido();

describe("qué suma y qué solo se muestra", () => {
  it("una orden con entrega de hoy en adelante suma; la de ayer no (vencida); sin fecha no (se dice)", () => {
    expect(polos([parte("orden", 40, HOY)])).toMatchObject({ suma: 40, deOrden: 40, primeraFecha: HOY, ultimaFecha: HOY });
    expect(polos([parte("orden", 40, "2026-10-06")])).toMatchObject({ suma: 0, atrasadas: 40, diasAtraso: 1 });
    expect(polos([parte("orden", 40, null)])).toMatchObject({ suma: 0, sinFecha: 40 });
  });

  it("con una meta, lo que llega el día de la meta suma y lo que llega después no", () => {
    expect(polos([parte("orden", 40, NAVIDAD)], NAVIDAD)).toMatchObject({ suma: 40, despues: 0 });
    expect(polos([parte("orden", 40, "2026-12-26")], NAVIDAD)).toMatchObject({ suma: 0, despues: 40 });
    // Sin meta (Se está acabando) no se corta por arriba.
    expect(polos([parte("orden", 40, "2027-03-01")])).toMatchObject({ suma: 40, despues: 0 });
  });

  it("lo que va en un envío suma SIEMPRE: ya salió, tenga la orden fecha, no la tenga o la haya pasado", () => {
    for (const fecha of [null, "2026-09-01", "2027-03-01"]) {
      expect(polos([parte("envio", 25, fecha)], NAVIDAD)).toMatchObject({ suma: 25, enEnvio: 25, deOrden: 0, sinFecha: 0, atrasadas: 0, despues: 0 });
    }
  });

  it("lo que el proveedor debe se muestra y no suma", () => {
    expect(polos([parte("reposicion", 10, null)])).toMatchObject({ suma: 0, debe: 10 });
  });

  it("lo de la RED (por repartir y el Taller) nunca suma, ni con fecha", () => {
    const p = polos([parte("por_repartir", 30, "2026-10-20"), parte("taller", 40, "2026-10-25", { marca: null, numeros: [7] })]);
    expect(p).toMatchObject({ suma: 0, porRepartir: 30, enTaller: 40, deOrden: 0, enEnvio: 0 });
    expect(pedidoDeMiTienda(p)).toBe(0);
  });

  it("junta por tipo (el nombre recortado), con la primera y la última entrega, las órdenes y las marcas; el Taller no pone números de orden", () => {
    const m = pedidoPorTipo(
      [
        parte("orden", 10, "2026-11-12", { numeros: [12] }),
        parte("orden", 5, "2026-10-20", { numeros: [9], marca: "Marca Dos" }),
        parte("envio", 4, null, { numeros: [9, 12] }),
        parte("taller", 99, null, { marca: null, numeros: [3] }),
        parte("orden", 7, "2026-10-30", { categoria: "  Blusas  ", prefijo: "BLU", numeros: [21] }),
      ],
      HOY,
    );
    expect([...m.keys()].sort()).toEqual(["Blusas", "Polos"]);
    expect(m.get("Polos")).toMatchObject({ suma: 19, deOrden: 15, enEnvio: 4, primeraFecha: "2026-10-20", ultimaFecha: "2026-11-12", enTaller: 99 });
    expect(m.get("Polos")?.ordenes).toEqual([9, 12]);
    expect(m.get("Polos")?.marcas).toEqual(["Marca Dos", "Marca Uno"]);
    expect(m.get("Blusas")?.ordenes).toEqual([21]);
  });

  it("una parte sin unidades, o sin tipo, no cuenta en ninguna", () => {
    const m = pedidoPorTipo([parte("orden", 0, HOY), parte("envio", -3, HOY), parte("orden", 5, HOY, { categoria: "   " })], HOY);
    expect(m.size).toBe(0);
  });

  it("sin nada pedido, nada: ni tipos ni números", () => {
    expect(pedidoPorTipo([], HOY).size).toBe(0);
    expect(sinPedido()).toMatchObject({ suma: 0, ordenes: [], marcas: [], primeraFecha: null });
  });

  it("cada copia de «sin pedido» es suya: sumarle a una no toca la de otro tipo", () => {
    const a = sinPedido();
    a.ordenes.push(1);
    a.suma = 9;
    expect(sinPedido()).toMatchObject({ suma: 0, ordenes: [] });
  });
});

describe("cómo se dice", () => {
  it("corto: «Ya pedido 40 · llegan el 12 nov.», «· llega …» en singular, «· van en camino» si todo va en un envío", () => {
    expect(yaPedidoCorto(polos([parte("orden", 40, "2026-11-12")]))).toBe("Ya pedido 40 · llegan el 12 nov.");
    expect(yaPedidoCorto(polos([parte("orden", 1, "2026-11-12")]))).toBe("Ya pedido 1 · llega el 12 nov.");
    expect(yaPedidoCorto(polos([parte("envio", 30, null)]))).toBe("Ya pedido 30 · van en camino");
    expect(yaPedidoCorto(polos([parte("envio", 1, null)]))).toBe("Ya pedido 1 · va en camino");
    expect(yaPedidoCorto(polos([parte("orden", 5, "2026-10-20"), parte("orden", 5, "2026-11-12")]))).toBe("Ya pedido 10 · llegan del 20 oct. al 12 nov.");
  });

  it("corto: si hay envío y orden, dice cuándo llega lo de la orden", () => {
    // Con las dos cosas, la fecha es solo de lo que sigue en la orden: no se le pone a lo que ya salió.
    expect(yaPedidoCorto(polos([parte("envio", 30, null), parte("orden", 10, "2026-11-12")]))).toBe("Ya pedido 40 · 30 en camino y 10 el 12 nov.");
    expect(yaPedidoCorto(polos([parte("envio", 30, null), parte("orden", 5, "2026-10-20"), parte("orden", 5, "2026-11-12")]))).toBe("Ya pedido 40 · 30 en camino y 10 del 20 oct. al 12 nov.");
  });

  it("sin nada que sume, no dice nada (y lo que no suma no se disfraza de «ya pedido»)", () => {
    for (const p of [sinPedido(), polos([parte("orden", 40, null)]), polos([parte("reposicion", 4, null)]), polos([parte("taller", 9, null)])]) {
      expect(yaPedidoCorto(p)).toBe("");
      expect(yaPedidoDetalle(p)).toBe("");
    }
  });

  it("completo: de dónde sale cada parte, y la fecha cierra la frase con un solo punto", () => {
    expect(yaPedidoDetalle(polos([parte("envio", 30, null), parte("orden", 10, "2026-11-12")]))).toBe("Ya pedido 40: 30 van en un envío y 10 llegan el 12 nov.");
    expect(yaPedidoDetalle(polos([parte("envio", 30, null)]))).toBe("Ya pedido 30: 30 van en un envío.");
    expect(yaPedidoDetalle(polos([parte("orden", 1, "2026-11-12")]))).toBe("Ya pedido 1: 1 llega el 12 nov.");
  });

  it("lo que no suma, en frases cortas, en el orden de la fila", () => {
    const p = polos([
      parte("orden", 15, null),
      parte("orden", 6, "2026-09-20"),
      parte("orden", 8, "2027-01-05"),
      parte("reposicion", 10, null),
      parte("por_repartir", 30, null),
      parte("taller", 40, null, { marca: null }),
    ], NAVIDAD);
    expect(pedidoAparte(p)).toEqual([
      "15 pedidas sin fecha: no las cuento",
      "6 pedidas con la entrega vencida: no las cuento",
      "8 pedidas con entrega después de Navidad",
      "el proveedor debe 10",
      "30 por repartir desde Lima",
      "el Taller tiene 40 en proceso",
    ]);
    expect(pedidoAparte(sinPedido())).toEqual([]);
    expect(pedidoAparte(polos([parte("orden", 1, null), parte("orden", 1, "2026-09-20")]))).toEqual(["1 pedida sin fecha: no la cuento", "1 pedida con la entrega vencida: no la cuento"]);
  });
});

describe("lo ya pedido de un tipo (la franja de «Se está acabando» y la ficha)", () => {
  it("lo que suma: «Ya pedido: 40 polos» (el tipo en minúscula, dentro de una frase) + cuándo llegan, y en el tooltip de qué marca y qué orden, y que no dice a qué modelo", () => {
    const n = notaDePedidoDeTipo("Polos", polos([parte("orden", 40, "2026-11-12")]))!;
    expect(n.titulo).toBe("Ya pedido: 40 polos");
    expect(n.detalle).toBe("llegan el 12 nov.");
    expect(n.ayuda).toContain("Hay una orden abierta de polos (de Marca Uno · OC-000012).");
    expect(n.ayuda).toContain("no dice a qué modelo irá");
    expect(n.ayuda).toContain("Ya pedido 40: 40 llegan el 12 nov.");
  });

  it("lo que ya va en camino: «van en camino»; con una parte en la orden, la fecha es solo de ella", () => {
    expect(notaDePedidoDeTipo("Polos", polos([parte("envio", 30, null)]))).toMatchObject({ titulo: "Ya pedido: 30 polos", detalle: "van en camino" });
    expect(notaDePedidoDeTipo("Polos", polos([parte("envio", 30, null), parte("orden", 10, "2026-11-12")]))).toMatchObject({
      titulo: "Ya pedido: 40 polos",
      detalle: "30 en camino y 10 el 12 nov.",
    });
  });

  it("de a uno, el tipo va con «de» (el tipo va en plural: «1 polos» no se lee)", () => {
    expect(notaDePedidoDeTipo("Polos", polos([parte("orden", 1, "2026-11-12")]))).toMatchObject({ titulo: "Ya pedido: 1 de polos" });
    expect(notaDePedidoDeTipo("Polos", polos([parte("orden", 1, null)]))).toMatchObject({ titulo: "Ya pedido: 1 de polos" });
    expect(notaDePedidoDeTipo("Polos", polos([parte("orden", 1, "2026-10-01")]))).toMatchObject({ titulo: "Pedido atrasado: 1 de polos" });
    expect(notaDePedidoDeTipo("Polos", polos([parte("reposicion", 1, null)]))).toMatchObject({ titulo: "El proveedor debe 1 de polos" });
  });

  it("sin fecha, vencido, después de la meta o debido: lo dice y nunca como si llegara", () => {
    expect(notaDePedidoDeTipo("Polos", polos([parte("orden", 20, null)]))).toMatchObject({ titulo: "Ya pedido: 20 polos", detalle: "sin fecha de entrega" });
    expect(notaDePedidoDeTipo("Polos", polos([parte("orden", 20, "2026-10-01")]))).toMatchObject({ titulo: "Pedido atrasado: 20 polos", detalle: "6 días sin llegar" });
    expect(notaDePedidoDeTipo("Polos", polos([parte("orden", 20, "2026-10-06")]))).toMatchObject({ detalle: "1 día sin llegar" });
    expect(notaDePedidoDeTipo("Polos", polos([parte("orden", 20, "2027-01-05")], NAVIDAD))).toMatchObject({ titulo: "Ya pedido: 20 polos", detalle: "llega después de Navidad" });
    expect(notaDePedidoDeTipo("Polos", polos([parte("reposicion", 10, null)]))).toMatchObject({ titulo: "El proveedor debe 10 polos", detalle: "falta reponer" });
  });

  it("lo que suma manda sobre lo que no: con una orden con fecha y otra sin fecha, el título es la que cuenta y la otra va en el tooltip", () => {
    const n = notaDePedidoDeTipo("Polos", polos([parte("orden", 40, "2026-11-12"), parte("orden", 15, null)]))!;
    expect(n.titulo).toBe("Ya pedido: 40 polos");
    expect(n.ayuda).toContain("15 pedidas sin fecha: no las cuento.");
  });

  it("a un tipo no le toca lo de la red: ni lo que el Taller tiene en proceso ni lo por repartir son «una orden a tu tienda»", () => {
    expect(notaDePedidoDeTipo("Polos", polos([parte("taller", 40, null, { marca: null }), parte("por_repartir", 30, "2026-11-01")]))).toBeNull();
    expect(notaDePedidoDeTipo("Polos", sinPedido())).toBeNull();
    // Y si además hay una orden a la tienda, lo de la red no se cuela en el tooltip de la fila.
    const n = notaDePedidoDeTipo("Polos", polos([parte("orden", 5, "2026-11-12"), parte("taller", 40, null, { marca: null }), parte("por_repartir", 30, null)]))!;
    expect(n.ayuda).not.toMatch(/Taller|por repartir/);
  });

  it("sin dinero ni nombres de personas: solo tipo, marca, unidades, fechas y números de orden", () => {
    const n = notaDePedidoDeTipo("Polos", polos([parte("orden", 40, "2026-11-12")]))!;
    expect(JSON.stringify(n)).not.toMatch(/S\/|precio|costo|subtotal|descuento/i);
  });
});

describe("lo pedido de un tipo que la lista no dibuja", () => {
  const dibujados = new Set(["Polos"]);
  it("nombra el tipo que tiene pedido para mi tienda y no sale en la lista, del que más tiene al que menos", () => {
    const m = pedidoPorTipo(
      [
        parte("orden", 40, "2026-11-12", { categoria: "Chalecos" }),
        parte("envio", 10, null, { categoria: "Sacos" }),
        parte("orden", 5, null, { categoria: "Gorros" }),
        parte("orden", 9, "2026-11-12"),
      ],
      HOY,
    );
    expect(pedidoSinTipo(m, dibujados)).toEqual([
      { categoria: "Chalecos", unidades: 40 },
      { categoria: "Sacos", unidades: 10 },
      { categoria: "Gorros", unidades: 5 },
    ]);
  });

  it("lo de la red no se nombra (el Taller produce de todo y no es una orden a esta tienda); lo vencido o sin fecha sí (también es una orden abierta)", () => {
    const m = pedidoPorTipo([parte("taller", 99, null, { categoria: "Sacos", marca: null }), parte("por_repartir", 30, null, { categoria: "Gorros" }), parte("orden", 6, "2026-09-20", { categoria: "Chalecos" })], HOY);
    expect(pedidoSinTipo(m, dibujados)).toEqual([{ categoria: "Chalecos", unidades: 6 }]);
  });

  it("la nota: uno, varios y cuando son muchos", () => {
    expect(notaPedidoSinTipo([{ categoria: "Chalecos", unidades: 40 }])).toBe("También hay pedido para tu tienda de 40 Chalecos: hoy no tiene ventas ni stock aquí, así que no sale en la lista.");
    expect(
      notaPedidoSinTipo([
        { categoria: "Chalecos", unidades: 40 },
        { categoria: "Sacos", unidades: 10 },
      ]),
    ).toBe("También hay pedido para tu tienda de 40 Chalecos y 10 Sacos: hoy no tienen ventas ni stock aquí, así que no salen en la lista.");
    expect(
      notaPedidoSinTipo([
        { categoria: "A", unidades: 4 },
        { categoria: "B", unidades: 3 },
        { categoria: "C", unidades: 2 },
        { categoria: "D", unidades: 1 },
      ]),
    ).toBe("También hay pedido para tu tienda de 4 A, 3 B, 2 C y 1 tipo más: hoy no tienen ventas ni stock aquí, así que no salen en la lista.");
  });
});

describe("el tipo dentro de una frase", () => {
  it("«Camisas y Blusas» → «camisas y blusas»; una sigla no se toca", () => {
    const porTipo = (tipo: string) => pedidoPorTipo([parte("orden", 40, "2026-11-12", { categoria: tipo })], HOY).get(tipo)!;
    expect(notaDePedidoDeTipo("Camisas y Blusas", porTipo("Camisas y Blusas"))?.titulo).toBe("Ya pedido: 40 camisas y blusas");
    expect(notaDePedidoDeTipo("TOP", porTipo("TOP"))?.titulo).toBe("Ya pedido: 40 TOP");
  });
});

// La franja de «Se está acabando» (segundo pase visual, 2026-10-17): lo ya pedido sale UNA vez por tipo, sobre las filas, y no pegado a un modelo.
describe("la franja de lo ya pedido", () => {
  const llega = (cantidad: number, fecha: string | null = "2026-10-20"): LlegadaPrenda => ({ de: "compra", cantidad, fecha });
  const modelo = (categoria: string | null, llegan: LlegadaPrenda[] = []) => ({ categoria, llega: llegan });
  const camisas = pedidoPorTipo([parte("orden", 40, "2026-10-29", { categoria: "Camisas" })], HOY);

  it("una línea por tipo, no una por modelo: dos camisas que se acaban dicen «40 camisas» una sola vez", () => {
    const f = franjaDePedido([modelo("Camisas"), modelo("Camisas")], camisas, HOY)!;
    expect(f.lineas).toHaveLength(1);
    expect(f.lineas[0]).toMatchObject({ tipo: "Camisas", texto: "Ya pedido: 40 camisas · llegan el 29 oct." });
    expect(f.lineas[0]!.ayuda).toContain("Hay una orden abierta de camisas");
    expect(f.mas).toBe(0);
  });

  it("varios tipos, en el orden de la lista (el del modelo más urgente primero)", () => {
    const m = pedidoPorTipo([parte("orden", 40, "2026-10-29", { categoria: "Camisas" }), parte("envio", 30, null, { categoria: "Polos" }), parte("orden", 10, "2026-11-12", { categoria: "Polos" })], HOY);
    const f = franjaDePedido([modelo("Polos"), modelo("Camisas")], m, HOY)!;
    expect(f.lineas.map((l) => l.texto)).toEqual(["Ya pedido: 40 polos · 30 en camino y 10 el 12 nov.", "Ya pedido: 40 camisas · llegan el 29 oct."]);
  });

  it("el modelo que ya viene en camino a tiempo no cuenta (esa prenda no se pide otra vez); el de una llegada atrasada sí", () => {
    expect(franjaDePedido([modelo("Camisas", [llega(6)])], camisas, HOY)).toBeNull();
    expect(franjaDePedido([modelo("Camisas", [llega(6, "2026-10-01")])], camisas, HOY)?.lineas).toHaveLength(1);
    // Con uno que viene y otro que no, el tipo se dice por el que no.
    expect(franjaDePedido([modelo("Camisas", [llega(6)]), modelo("Camisas")], camisas, HOY)?.lineas).toHaveLength(1);
  });

  it("no dice nada si no hay nada pedido de ese tipo, si el modelo no tiene tipo, o si es solo de la red (el Taller o por repartir)", () => {
    expect(franjaDePedido([modelo("Blusas")], camisas, HOY)).toBeNull();
    expect(franjaDePedido([modelo(null), modelo("  ")], camisas, HOY)).toBeNull();
    expect(franjaDePedido([modelo("Camisas")], new Map(), HOY)).toBeNull();
    const red = pedidoPorTipo([parte("taller", 40, null, { categoria: "Camisas", marca: null }), parte("por_repartir", 30, null, { categoria: "Camisas" })], HOY);
    expect(franjaDePedido([modelo("Camisas")], red, HOY)).toBeNull();
  });

  it("no sube a más de 3 tipos: el resto se cuenta («y 2 tipos más»)", () => {
    const tipos = ["A", "B", "C", "D", "E"];
    const m = pedidoPorTipo(tipos.map((t) => parte("orden", 5, "2026-10-29", { categoria: t })), HOY);
    const f = franjaDePedido(tipos.map((t) => modelo(t)), m, HOY)!;
    expect(f.lineas).toHaveLength(TIPOS_EN_LA_FRANJA);
    expect(f.mas).toBe(2);
  });

  it("lo que no cuenta también se dice sin prometer que llega, y cada línea nombra su tipo; la nota de cierre dice que la orden no dice a qué modelo irá", () => {
    const m = pedidoPorTipo([parte("orden", 20, "2026-10-01", { categoria: "Camisas" })], HOY);
    expect(franjaDePedido([modelo("Camisas")], m, HOY)!.lineas[0]!.texto).toBe("Pedido atrasado: 20 camisas · 6 días sin llegar");
    expect(NOTA_DE_LO_PEDIDO).toContain("la orden no dice a qué modelo irá");
    expect(NOTA_DE_LO_PEDIDO).not.toMatch(/S\/|precio|costo/i);
  });
});
