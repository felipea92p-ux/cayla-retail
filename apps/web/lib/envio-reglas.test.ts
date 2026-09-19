import { describe, expect, it } from "vitest";
import type { CompraResumen, LineaCompra } from "./compras-reglas";
import {
  armarPedidoEnvio,
  bloquesDelEnvio,
  comprobanteSinMontos,
  extraCompleto,
  inicialesProveedor,
  lineaSinCosto,
  llegoLinea,
  proveedoresDelEnvio,
  resolverEscaneo,
  sumarUnidad,
  totalesEnvio,
  trasladoContadoEntero,
  type ExtraEnvio,
  type Reparto,
} from "./envio-reglas";

// --- datos de ejemplo: un envío con comprobantes de DOS proveedores -------------------------------

const compra = (id: string, proveedorId: string, proveedorNombre: string, documento: string): CompraResumen =>
  ({ id, proveedorId, proveedorNombre, documento }) as CompraResumen;

const linea = (id: string, compraId: string, pendiente: number, varianteId: string | null, productoId = "p1"): LineaCompra =>
  ({ id, compraId, pendiente, varianteId, productoId, referencia: "Blusa Emma", talla: "S", color: "Beige", sku: "BLU-0042-BEI-S", cantidad: pendiente, cerrado: 0, recibido: 0 }) as LineaCompra;

const C1 = compra("c1", "prov1", "Textiles Andina SAC", "F001-000198"); // la más atrasada: va primero
const C2 = compra("c2", "prov2", "Tejidos Rímac SAC", "F001-000482");
const C3 = compra("c3", "prov1", "Textiles Andina SAC", "F001-000200"); // segundo comprobante del MISMO proveedor
const COMPRAS = [C1, C2, C3];
const LINEAS: LineaCompra[] = [
  linea("l1", "c1", 24, "v1"),
  linea("l2", "c1", 12, "v2"),
  linea("l3", "c2", 30, "v3"),
  linea("l4", "c2", 10, null, "p9"), // línea agrupada: el proveedor no dijo talla ni color
  linea("l5", "c3", 6, "v1"), // la MISMA prenda que l1, en otro comprobante
  { ...linea("l6", "c1", 0, "v4"), pendiente: 0 }, // ya recibida completa: no es parte del conteo
];

describe("inicialesProveedor", () => {
  it("ignora la razón social y los conectores", () => {
    expect(inicialesProveedor("Textiles Andina SAC")).toBe("TA");
    expect(inicialesProveedor("Confecciones del Sur EIRL")).toBe("CS");
    expect(inicialesProveedor("Cotton & Co.")).toBe("CC");
  });
  it("con una sola palabra útil, su inicial; sin nada, un punto", () => {
    expect(inicialesProveedor("Hilados SAC")).toBe("H");
    expect(inicialesProveedor("SAC")).toBe("S");
    expect(inicialesProveedor("   ")).toBe("·");
  });
});

describe("bloquesDelEnvio / proveedoresDelEnvio: un envío puede traer varios proveedores", () => {
  it("un bloque por comprobante marcado, en el orden de la lista, con solo las líneas que tienen algo pendiente", () => {
    const b = bloquesDelEnvio(COMPRAS, ["c2", "c1"], LINEAS);
    expect(b.map((x) => x.compra.id)).toEqual(["c1", "c2"]); // el orden de `compras` (urgencia), no el del clic
    expect(b[0].lineas.map((l) => l.id)).toEqual(["l1", "l2"]); // l6 no tiene pendiente
  });
  it("los proveedores distintos, sin repetir aunque un proveedor traiga dos comprobantes", () => {
    const b = bloquesDelEnvio(COMPRAS, ["c1", "c2", "c3"], LINEAS);
    expect(proveedoresDelEnvio(b)).toEqual([
      { id: "prov1", nombre: "Textiles Andina SAC" },
      { id: "prov2", nombre: "Tejidos Rímac SAC" },
    ]);
  });
  it("sin nada marcado no hay bloques", () => {
    expect(bloquesDelEnvio(COMPRAS, [], LINEAS)).toEqual([]);
  });
});

describe("llegoLinea (D1): sin valor = sin contar; 0 = contada", () => {
  it("línea con variante: cuenta solo si esa variante está anotada", () => {
    expect(llegoLinea(LINEAS[0], {})).toBeNull();
    expect(llegoLinea(LINEAS[0], { l1: { v1: 0 } })).toBe(0);
    expect(llegoLinea(LINEAS[0], { l1: { v2: 5 } })).toBeNull();
  });
  it("línea agrupada: suma lo repartido; `{}` es «nada llegó»", () => {
    expect(llegoLinea(LINEAS[3], { l4: { a: 3, b: 4 } })).toBe(7);
    expect(llegoLinea(LINEAS[3], { l4: {} })).toBe(0);
  });
});

describe("totalesEnvio: Esperadas = Contadas + Sin contar + Faltantes", () => {
  const bloques = bloquesDelEnvio(COMPRAS, ["c1", "c2"], LINEAS);
  it("cuadra: lo esperado se reparte en contado, sin contar y faltante", () => {
    const reparto: Reparto = { l1: { v1: 24 }, l2: { v2: 8 } }; // l1 completa, l2 corta (faltan 4); l3 y l4 sin contar
    const t = totalesEnvio(bloques, reparto, []);
    expect(t.esperadas).toBe(76); // 24 + 12 + 30 + 10
    expect(t.contadas).toBe(32);
    expect(t.faltantes).toBe(4);
    expect(t.sinContar).toBe(40);
    expect(t.contadas + t.faltantes + t.sinContar).toBe(t.esperadas);
    expect(t.lineasTotal).toBe(4);
    expect(t.lineasContadas).toBe(2);
    expect(t.excedidas).toBe(0);
  });
  it("una línea contada por encima de lo pendiente cuenta como excedida", () => {
    expect(totalesEnvio(bloques, { l1: { v1: 25 } }, []).excedidas).toBe(1);
  });
  it("suma lo fuera de comprobante (solo las filas completas) y lo de otra sede", () => {
    const extras: ExtraEnvio[] = [
      { productoId: "p1", varianteId: "v1", cantidad: 3, costoUnitario: "", proveedorId: "prov2", esRegalo: true },
      { productoId: "p1", varianteId: "", cantidad: 5, costoUnitario: "", proveedorId: "prov2", esRegalo: false }, // sin prenda elegida: todavía no cuenta
    ];
    const t = totalesEnvio(bloques, {}, extras, [{ lineas: [{ varianteId: "v1", cantidadEnviada: 5 }], conteo: { v1: 4 } }]);
    expect(t.fueraDeComprobante).toBe(3);
    expect(t.deOtraSede).toBe(4);
  });
});

describe("extraCompleto: sin prenda o sin proveedor todavía no cuenta", () => {
  const base: ExtraEnvio = { productoId: "p1", varianteId: "v1", cantidad: 2, costoUnitario: "", proveedorId: "prov1", esRegalo: false };
  it("necesita prenda, proveedor y cantidad", () => {
    expect(extraCompleto(base)).toBe(true);
    expect(extraCompleto({ ...base, varianteId: "" })).toBe(false);
    expect(extraCompleto({ ...base, proveedorId: "" })).toBe(false);
    expect(extraCompleto({ ...base, cantidad: 0 })).toBe(false);
  });
});

describe("resolverEscaneo: cada lectura suma 1 al comprobante que trae esa prenda", () => {
  const variantes = [
    { varianteId: "v1", productoId: "p1", sku: "BLU-0042-BEI-S", referencia: "Blusa Emma", talla: "S", color: "Beige", codigosBarras: ["7750001"] },
    { varianteId: "v3", productoId: "p3", sku: "PAN-0017-ARE-38", referencia: "Pantalón Lino", talla: "38", color: "Arena", codigosBarras: [] },
    { varianteId: "v9", productoId: "p9", sku: "CHO-0001-NEG-M", referencia: "Chompa", talla: "M", color: "Negro", codigosBarras: [] }, // producto de la línea agrupada l4
    { varianteId: "v77", productoId: "p77", sku: "ZZZ", referencia: "Otra", talla: null, color: null, codigosBarras: [] },
  ];
  const bloques = bloquesDelEnvio(COMPRAS, ["c1", "c2", "c3"], LINEAS);

  it("por SKU o por código de barras, sin importar mayúsculas", () => {
    const porSku = resolverEscaneo("blu-0042-bei-s", variantes, bloques, {});
    const porCodigo = resolverEscaneo("7750001", variantes, bloques, {});
    expect(porSku.tipo).toBe("sumado");
    expect(porCodigo.tipo).toBe("sumado");
  });
  it("va a la PRIMERA línea con cupo (la más urgente), y cuando esa se llena, a la siguiente", () => {
    // v1 está en l1 (c1, cupo 24) y en l5 (c3, cupo 6)
    let reparto: Reparto = {};
    let r = resolverEscaneo("BLU-0042-BEI-S", variantes, bloques, reparto);
    expect(r).toMatchObject({ tipo: "sumado", lineaId: "l1", documento: "F001-000198", proveedorNombre: "Textiles Andina SAC" });

    reparto = { l1: { v1: 24 } }; // l1 completa
    r = resolverEscaneo("BLU-0042-BEI-S", variantes, bloques, reparto);
    expect(r).toMatchObject({ tipo: "sumado", lineaId: "l5", documento: "F001-000200" });

    reparto = { l1: { v1: 24 }, l5: { v1: 6 } }; // las dos completas
    expect(resolverEscaneo("BLU-0042-BEI-S", variantes, bloques, reparto).tipo).toBe("completo");
  });
  it("una prenda del producto de una línea agrupada (sin variante) se suma a esa línea", () => {
    expect(resolverEscaneo("CHO-0001-NEG-M", variantes, bloques, {})).toMatchObject({ tipo: "sumado", lineaId: "l4", varianteId: "v9" });
  });
  it("una prenda que ningún comprobante del envío trae es «fuera»; un código que no existe, «desconocido»", () => {
    expect(resolverEscaneo("ZZZ", variantes, bloques, {})).toMatchObject({ tipo: "fuera", varianteId: "v77" });
    expect(resolverEscaneo("no-existe", variantes, bloques, {}).tipo).toBe("desconocido");
    expect(resolverEscaneo("   ", variantes, bloques, {}).tipo).toBe("desconocido");
  });
});

describe("sumarUnidad", () => {
  it("suma 1 sin mutar el reparto anterior; una línea agrupada reparte entre variantes", () => {
    const antes: Reparto = { l1: { v1: 3 } };
    const despues = sumarUnidad(antes, LINEAS[0], "v1");
    expect(despues.l1.v1).toBe(4);
    expect(antes.l1.v1).toBe(3);
    const agrupada = sumarUnidad(sumarUnidad({}, LINEAS[3], "a"), LINEAS[3], "b");
    expect(agrupada.l4).toEqual({ a: 1, b: 1 });
  });
});

describe("armarPedidoEnvio: exactamente lo que espera recibir_envio", () => {
  const bloques = bloquesDelEnvio(COMPRAS, ["c1", "c2"], LINEAS);
  const base = { ubicacionId: "u1", bloques, reparto: {} as Reparto, extras: [] as ExtraEnvio[], traslados: [], cierres: [], notas: [], numeroGuia: "", nota: "", token: "tok-1" };

  it("solo viaja lo contado en positivo; el 0 y lo sin contar no suman al stock", () => {
    const p = armarPedidoEnvio({ ...base, reparto: { l1: { v1: 24 }, l2: { v2: 0 }, l3: { v3: 7 } } });
    expect(p.p_items).toEqual([
      { compra_item_id: "l1", variante_id: "v1", cantidad: 24 },
      { compra_item_id: "l3", variante_id: "v3", cantidad: 7 },
    ]);
    expect(p.p_token).toBe("tok-1");
  });
  it("guía y nota solo si se escribieron (sin espacios); el token siempre", () => {
    expect(armarPedidoEnvio(base)).not.toHaveProperty("p_numero_guia");
    expect(armarPedidoEnvio(base)).not.toHaveProperty("p_nota");
    const p = armarPedidoEnvio({ ...base, numeroGuia: "  T001-004417 ", nota: " caja abierta " });
    expect(p.p_numero_guia).toBe("T001-004417");
    expect(p.p_nota).toBe("caja abierta");
  });
  it("un regalo nunca lleva costo; una prenda comprada fuera de comprobante lo lleva si se escribió", () => {
    const p = armarPedidoEnvio({
      ...base,
      extras: [
        { productoId: "p1", varianteId: "v1", cantidad: 3, costoUnitario: "9", proveedorId: "prov2", esRegalo: true },
        { productoId: "p1", varianteId: "v2", cantidad: 2, costoUnitario: "40", proveedorId: "prov1", esRegalo: false },
        { productoId: "p1", varianteId: "v3", cantidad: 1, costoUnitario: "", proveedorId: "prov1", esRegalo: false },
        { productoId: "p1", varianteId: "", cantidad: 1, costoUnitario: "", proveedorId: "prov1", esRegalo: false }, // incompleta: no viaja
      ],
    });
    expect(p.p_extras).toEqual([
      { proveedor_id: "prov2", variante_id: "v1", cantidad: 3, es_regalo: true },
      { proveedor_id: "prov1", variante_id: "v2", cantidad: 2, es_regalo: false, costo_unitario: 40 },
      { proveedor_id: "prov1", variante_id: "v3", cantidad: 1, es_regalo: false },
    ]);
  });
  it("de un traslado viajan TODAS sus líneas enviadas: la no contada va en 0, no se omite", () => {
    const p = armarPedidoEnvio({
      ...base,
      traslados: [{ transferenciaId: "t1", lineas: [{ varianteId: "v1", cantidadEnviada: 5 }, { varianteId: "v2", cantidadEnviada: 3 }], conteo: { v1: 5 } }],
    });
    expect(p.p_traslados).toEqual([{ transferencia_id: "t1", lineas: [{ variante_id: "v1", cantidad: 5 }, { variante_id: "v2", cantidad: 0 }] }]);
  });
  it("los cierres y notas viajan con el formato de la RPC (serie en mayúsculas y sin espacios)", () => {
    const p = armarPedidoEnvio({ ...base, cierres: [{ lineaId: "l2", faltan: 4, motivo: "no_llego" }], notas: [{ compraId: "c1", serie: " fc01-93 ", fecha: "2026-09-18", monto: 236 }] });
    expect(p.p_cierres).toEqual([{ compra_item_id: "l2", cantidad: 4, motivo: "no_llego" }]);
    expect(p.p_notas_credito).toEqual([{ compra_id: "c1", serie_numero: "FC01-93", fecha: "2026-09-18", monto: 236 }]);
  });
});

describe("trasladoContadoEntero: la base exige contar cada línea enviada (aunque sea 0)", () => {
  const lineas = [{ varianteId: "v1", cantidadEnviada: 5 }, { varianteId: "v2", cantidadEnviada: 3 }];
  it("solo cuando cada línea tiene su conteo; un 0 escrito cuenta", () => {
    expect(trasladoContadoEntero(lineas, { v1: 5 })).toBe(false);
    expect(trasladoContadoEntero(lineas, { v1: 5, v2: 0 })).toBe(true);
    expect(trasladoContadoEntero([], {})).toBe(false);
  });
});

describe("comprobanteSinMontos / lineaSinCosto: quien cuenta no ve dinero", () => {
  it("deja en cero todo monto y conserva lo demás (cantidades, proveedor, documento)", () => {
    const c = { ...C1, subtotal: 100, igv: 18, total: 118, pagado: 50, saldo: 68, notasCredito: 5, facturadoCantidad: 110, recibidoCantidad: 20 } as CompraResumen;
    const sin = comprobanteSinMontos(c);
    expect([sin.subtotal, sin.igv, sin.total, sin.pagado, sin.saldo, sin.notasCredito]).toEqual([0, 0, 0, 0, 0, 0]);
    expect(sin).toMatchObject({ id: "c1", proveedorNombre: "Textiles Andina SAC", documento: "F001-000198", facturadoCantidad: 110, recibidoCantidad: 20 });
    expect(c.total).toBe(118); // no muta el original
  });
  it("la línea pierde su costo pero no su cantidad pendiente", () => {
    const l = { ...LINEAS[0], costoUnitario: 50, subtotal: 1200 } as LineaCompra;
    expect(lineaSinCosto(l)).toMatchObject({ id: "l1", pendiente: 24, costoUnitario: 0, subtotal: 0 });
  });
});
