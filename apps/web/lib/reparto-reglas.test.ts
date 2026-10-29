import { describe, expect, it } from "vitest";
import type { LineaCompra, TiendaEnLinea } from "@/lib/compras-reglas";
import {
  errorDeReasignacion,
  estaRepartido,
  etiquetaDeLinea,
  estadoDeMiTienda,
  filasDeLinea,
  lineaEnMiTienda,
  MOTIVOS_REASIGNACION,
  motivoDeReasignacion,
  nombresDeDestinos,
  otrasTiendasDeJson,
  pendienteDeMiTienda,
  resumenPorTienda,
  textoDeLaParte,
  textoDeReasignacion,
  textoOtrasTiendas,
  tiendasConPendiente,
  tiendasDelReparto,
  valorPorRecibirDeMiTienda,
  type FilaReparto,
} from "./reparto-reglas";

describe("lo que ve una tienda (Recibir)", () => {
  it("el faltante cerrado no cuenta como pendiente", () => {
    expect(pendienteDeMiTienda({ asignado: 12, recibido: 4, cerrado: 2 })).toBe(6);
  });

  it("nunca queda un pendiente negativo", () => {
    expect(pendienteDeMiTienda({ asignado: 5, recibido: 5, cerrado: 3 })).toBe(0);
  });

  it("el estado se lee desde la tienda, no desde el comprobante entero", () => {
    expect(estadoDeMiTienda({ asignado: 12, recibido: 0, cerrado: 0 })).toBe("sin_recibir");
    expect(estadoDeMiTienda({ asignado: 12, recibido: 4, cerrado: 0 })).toBe("parcial");
    expect(estadoDeMiTienda({ asignado: 12, recibido: 8, cerrado: 4 })).toBe("recibida");
    expect(estadoDeMiTienda({ asignado: 12, recibido: 12, cerrado: 0 })).toBe("recibida");
  });

  it("para el líder: dónde más falta, y si ya no falta en ninguna", () => {
    const otras: TiendaEnLinea[] = [
      { ubicacionId: "a", nombre: "Taller", asignado: 12, recibido: 0, cerrado: 0, pendiente: 12 },
      { ubicacionId: "b", nombre: "Tienda Lima", asignado: 4, recibido: 4, cerrado: 0, pendiente: 0 },
    ];
    expect(textoOtrasTiendas(otras)).toBe("También falta en Taller: 12");
    expect(textoOtrasTiendas(otras.map((t) => ({ ...t, pendiente: 0 })))).toBe("Las demás tiendas ya recibieron lo suyo");
    expect(textoOtrasTiendas([])).toBeNull();
    expect(textoOtrasTiendas(undefined)).toBeNull();
  });

  it("los destinos con nombre; un id sin nombre no aparece", () => {
    expect(nombresDeDestinos(["a", "b", "z"], { a: "Tienda Trujillo", b: "Taller" })).toBe("Tienda Trujillo · Taller");
  });
});

describe("la línea vista desde una tienda", () => {
  const linea: LineaCompra = {
    id: "l1", compraId: "c1", productoId: "p1", referencia: "Blusa Lino", varianteId: "v1", sku: "BL-M", talla: "M", color: "Arena",
    descripcion: null, cantidad: 24, costoUnitario: 50, subtotal: 1200, recibido: 4, cerrado: 0, pendiente: 20,
  };

  it("cantidad, recibido y pendiente pasan a ser los de la tienda; lo facturado queda aparte", () => {
    const v = lineaEnMiTienda(linea, { asignado: 12, recibido: 4, cerrado: 0 });
    expect(v).toMatchObject({ cantidad: 12, recibido: 4, cerrado: 0, pendiente: 8, cantidadFacturada: 24, asignadoAqui: 12, pendienteAqui: 8 });
    expect(v.subtotal).toBe(600);
  });

  it("sin números de tienda (base vieja) la línea queda tal cual", () => {
    expect(lineaEnMiTienda(linea, null)).toBe(linea);
  });

  it("sin costo (quien no es líder) el subtotal sigue en 0", () => {
    expect(lineaEnMiTienda({ ...linea, costoUnitario: 0, subtotal: 0 }, { asignado: 12, recibido: 0, cerrado: 0 }).subtotal).toBe(0);
  });
});

describe("otras_tiendas (json de la RPC)", () => {
  it("lo convierte y descarta lo que no es una tienda", () => {
    expect(
      otrasTiendasDeJson([
        { ubicacion_id: "a", nombre: "Taller", asignado: 12, recibido: 2, cerrado: 0, pendiente: 10 },
        { nombre: "sin id" },
        null,
      ])
    ).toEqual([{ ubicacionId: "a", nombre: "Taller", asignado: 12, recibido: 2, cerrado: 0, pendiente: 10 }]);
  });
  it("un colaborador no lo recibe (null) y eso queda como «sin dato»", () => {
    expect(otrasTiendasDeJson(null)).toBeUndefined();
    expect(otrasTiendasDeJson("x")).toBeUndefined();
  });
});

describe("«S/ por llegar» de una tienda (solo líder)", () => {
  it("lo que le falta a ELLA, a su costo y con el IGV del comprobante", () => {
    // 8 por llegar × S/ 50 × 1.18 = S/ 472
    expect(valorPorRecibirDeMiTienda([{ id: "c1", subtotal: 1200, total: 1416 }], [{ compraId: "c1", pendiente: 8, costoUnitario: 50 }])).toBe(472);
  });
  it("suma varios comprobantes y nunca resta (un pendiente negativo cuenta 0)", () => {
    const compras = [
      { id: "c1", subtotal: 100, total: 118 },
      { id: "c2", subtotal: 0, total: 0 },
    ];
    const lineas = [
      { compraId: "c1", pendiente: 1, costoUnitario: 100 },
      { compraId: "c2", pendiente: 2, costoUnitario: 10 },
      { compraId: "c2", pendiente: -5, costoUnitario: 10 },
    ];
    expect(valorPorRecibirDeMiTienda(compras, lineas)).toBe(138);
  });
});

describe("la parte de una línea repartida", () => {
  it("dice «Te toca 12 de 24 del comprobante»; al líder, además, dónde más falta", () => {
    expect(textoDeLaParte({ asignadoAqui: 12, cantidadFacturada: 24 })).toBe("Te toca 12 de 24 del comprobante");
    expect(
      textoDeLaParte({ asignadoAqui: 12, cantidadFacturada: 24, otrasTiendas: [{ ubicacionId: "a", nombre: "Taller", asignado: 12, recibido: 0, cerrado: 0, pendiente: 12 }] })
    ).toBe("Te toca 12 de 24 del comprobante · También falta en Taller: 12");
  });
  it("una línea que es toda de esta tienda no muestra nada extra (el flujo de siempre no cambia)", () => {
    expect(textoDeLaParte({ asignadoAqui: 24, cantidadFacturada: 24 })).toBeNull();
  });
  it("sin números de tienda (base vieja) tampoco", () => {
    expect(textoDeLaParte({})).toBeNull();
  });
});

describe("El detalle: cómo va cada tienda", () => {
  const f = (compraItemId: string, ubicacionId: string, asignado: number, recibido: number, cerrado = 0): FilaReparto => ({
    compraItemId,
    ubicacionId,
    asignado,
    recibido,
    cerrado,
    pendiente: asignado - recibido - cerrado,
  });
  const filas = [f("l1", "taller", 12, 8), f("l1", "trujillo", 12, 12), f("l2", "trujillo", 6, 0, 2), f("l2", "lima", 4, 0)];
  const orden = ["taller", "trujillo", "lima"];

  it("las casillas de una línea salen en el orden de tiendas de la app", () => {
    expect(filasDeLinea(filas, "l1", orden).map((x) => x.ubicacionId)).toEqual(["taller", "trujillo"]);
    expect(filasDeLinea(filas, "l2", orden).map((x) => x.ubicacionId)).toEqual(["trujillo", "lima"]);
    expect(filasDeLinea(filas, "nada", orden)).toEqual([]);
  });

  it("solo cuenta como «falta» lo que no se recibió ni se cerró", () => {
    expect(tiendasConPendiente(filasDeLinea(filas, "l1", orden)).map((x) => x.ubicacionId)).toEqual(["taller"]);
    expect(tiendasConPendiente(filasDeLinea(filas, "l2", orden)).map((x) => [x.ubicacionId, x.pendiente])).toEqual([["trujillo", 4], ["lima", 4]]);
  });

  it("las tiendas del comprobante, en el orden dado y con las desconocidas al final", () => {
    expect(tiendasDelReparto(filas, orden)).toEqual(["taller", "trujillo", "lima"]);
    expect(tiendasDelReparto(filas, ["trujillo"])).toEqual(["trujillo", "lima", "taller"]);
  });

  it("un comprobante de una sola tienda no está «repartido»", () => {
    expect(estaRepartido(filas)).toBe(true);
    expect(estaRepartido([f("l1", "taller", 24, 0)])).toBe(false);
    expect(estaRepartido([])).toBe(false);
  });

  it("resumen por tienda: lo que le toca, lo que recibió y lo que le falta en TODO el comprobante", () => {
    expect(resumenPorTienda(filas, orden)).toEqual([
      { ubicacionId: "taller", asignado: 12, recibido: 8, cerrado: 0, pendiente: 4 },
      { ubicacionId: "trujillo", asignado: 18, recibido: 12, cerrado: 2, pendiente: 4 },
      { ubicacionId: "lima", asignado: 4, recibido: 0, cerrado: 0, pendiente: 4 },
    ]);
  });
});

describe("Reasignar", () => {
  const base = { desdeId: "taller", haciaId: "trujillo", cantidad: 3, pendienteDesde: 4, nombreDesde: "Taller", motivo: "llego_de_mas" as const, nota: "" };

  it("un pedido correcto no tiene error", () => {
    expect(errorDeReasignacion(base)).toBeNull();
    expect(errorDeReasignacion({ ...base, cantidad: 4 })).toBeNull();
  });

  it("dice qué falta elegir, sin jerga", () => {
    expect(errorDeReasignacion({ ...base, desdeId: "" })).toBe("Elige de qué tienda sale la mercadería y a cuál va.");
    expect(errorDeReasignacion({ ...base, haciaId: "taller" })).toBe("Tienen que ser dos tiendas distintas.");
    expect(errorDeReasignacion({ ...base, motivo: "" })).toBe("Elige por qué se mueve.");
  });

  it("solo se mueve lo que aún falta recibir, y el mensaje dice cuánto es", () => {
    const msg = "La cantidad tiene que ser un entero entre 1 y 4: es lo que aún le falta recibir a Taller.";
    expect(errorDeReasignacion({ ...base, cantidad: 5 })).toBe(msg);
    expect(errorDeReasignacion({ ...base, cantidad: 0 })).toBe(msg);
    expect(errorDeReasignacion({ ...base, cantidad: 1.5 })).toBe(msg);
    expect(errorDeReasignacion({ ...base, cantidad: Number.NaN })).toBe(msg);
  });

  it("«otro motivo» pide contarlo en la nota", () => {
    expect(errorDeReasignacion({ ...base, motivo: "otro" })).toBe("Cuenta el motivo en la nota: así queda claro para quien lo revise después.");
    expect(errorDeReasignacion({ ...base, motivo: "otro", nota: "  el chofer se equivocó de sede " })).toBeNull();
  });

  it("los tres motivos de la base, y cualquier otra cosa cae en «otro»", () => {
    expect(MOTIVOS_REASIGNACION).toEqual(["llego_de_mas", "error_de_tienda", "otro"]);
    expect(motivoDeReasignacion("error_de_tienda")).toBe("error_de_tienda");
    expect(motivoDeReasignacion("x")).toBe("otro");
    expect(motivoDeReasignacion(null)).toBe("otro");
  });

  it("el historial dice quién movió cuánto y de dónde a dónde (singular y plural)", () => {
    const nombre = (id: string) => ({ taller: "Taller", trujillo: "Tienda Trujillo" })[id] ?? "?";
    expect(textoDeReasignacion({ cantidad: 2, desdeId: "taller", haciaId: "trujillo", personaNombre: "Felipe" }, nombre)).toBe("Felipe movió 2 unidades de Taller a Tienda Trujillo");
    expect(textoDeReasignacion({ cantidad: 1, desdeId: "taller", haciaId: "trujillo", personaNombre: null }, nombre)).toBe("Alguien movió 1 unidad de Taller a Tienda Trujillo");
  });
});

describe("nombre de una línea", () => {
  it("con talla y color los lleva; sin desglose, solo la prenda", () => {
    expect(etiquetaDeLinea({ referencia: "Blusa Emma", varianteId: "v1", talla: "M", color: "Arena" })).toBe("Blusa Emma · Arena / M".replace("Arena / M", "M / Arena"));
    expect(etiquetaDeLinea({ referencia: "Blusa Emma", varianteId: "v1", talla: null, color: "Arena" })).toBe("Blusa Emma · Arena");
    expect(etiquetaDeLinea({ referencia: "Blusa Emma", varianteId: null, talla: null, color: null })).toBe("Blusa Emma");
    // una línea «sin desglose» no muestra la variante aunque llegue con datos sueltos
    expect(etiquetaDeLinea({ referencia: "Blusa Emma", varianteId: null, talla: "M", color: "Arena" })).toBe("Blusa Emma");
  });

  it("una línea sin prenda (la de un comprobante de orden) se nombra «categoría · marca · descripción»", () => {
    const sinPrenda = { referencia: "", varianteId: null, talla: null, color: null };
    expect(etiquetaDeLinea({ ...sinPrenda, categoria: "Blusas", marca: "Cayla", descripcion: "lino crudo" })).toBe("Blusas · Cayla · lino crudo");
    expect(etiquetaDeLinea({ ...sinPrenda, categoria: "Blusas", marca: "Cayla", descripcion: null })).toBe("Blusas · Cayla");
    // con prenda manda la prenda, aunque llegue con categoría y marca sueltas
    expect(etiquetaDeLinea({ referencia: "Blusa Emma", varianteId: null, talla: null, color: null, categoria: "Blusas", marca: "Cayla" })).toBe("Blusa Emma");
  });
});
