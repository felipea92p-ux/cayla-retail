import { describe, expect, it } from "vitest";
import type { CompraResumen, LineaCompra } from "./compras-reglas";
import type { RecepcionDeCompra } from "./compras-indicadores";
import {
  agruparPorEnvio,
  armarPedidoEnvio,
  bloquesDelEnvio,
  comprobanteSinMontos,
  comprobantesQueTraen,
  extraCompleto,
  guiaConFormato,
  inicialesProveedor,
  kpisDeLaLista,
  lineaSinCosto,
  llegoLinea,
  movimientosDelEnvio,
  proveedoresDelEnvio,
  resolverEscaneo,
  restarUnidad,
  resumenPorComprobante,
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
  const base = { ubicacionId: "u1", bloques, reparto: {} as Reparto, extras: [] as ExtraEnvio[], traslados: [], cierres: [], numeroGuia: "", nota: "", token: "tok-1" };

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
  // Recepción cuenta y cierra; la nota de crédito se reclama y se registra en `/compras/notas-credito`
  // (2026-09-19). El parámetro sigue viajando porque la RPC lo sigue aceptando, pero SIEMPRE vacío.
  it("los cierres viajan con el formato de la RPC; las notas de crédito ya no salen de esta pantalla", () => {
    const p = armarPedidoEnvio({ ...base, cierres: [{ lineaId: "l2", faltan: 4, motivo: "no_llego" }] });
    expect(p.p_cierres).toEqual([{ compra_item_id: "l2", cantidad: 4, motivo: "no_llego" }]);
    expect(p.p_notas_credito).toEqual([]);
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

describe("kpisDeLaLista: los indicadores de quien no ve dinero salen de su propia lista", () => {
  const AHORA = new Date("2026-09-19T00:30:00Z"); // 18/09 en Lima
  const c = (extra: Partial<CompraResumen>): CompraResumen =>
    ({ facturadoCantidad: 100, recibidoCantidad: 0, cerradoCantidad: 0, recepcionAtrasada: false, fechaEmision: "2026-09-10", fechaEstimadaLlegada: null, proveedorNombre: "P", documento: "D", ...extra }) as CompraResumen;

  it("cuenta comprobantes y unidades pendientes (lo cerrado por faltante ya no cuenta)", () => {
    const k = kpisDeLaLista([c({ recibidoCantidad: 20 }), c({ facturadoCantidad: 60, cerradoCantidad: 10 }), c({ facturadoCantidad: 10, recibidoCantidad: 10 })], AHORA);
    expect(k.porRecibir).toBe(3);
    expect(k.unidadesPendientes).toBe(80 + 50 + 0);
  });
  it("la más atrasada es la de más días entre las atrasadas, con su proveedor y documento", () => {
    const k = kpisDeLaLista(
      [
        c({ recepcionAtrasada: true, fechaEstimadaLlegada: "2026-09-09", proveedorNombre: "Rímac", documento: "F001-000482" }),
        c({ recepcionAtrasada: true, fechaEstimadaLlegada: "2026-08-11", proveedorNombre: "Textiles Andina SAC", documento: "F001-000198" }),
        c({ fechaEstimadaLlegada: "2026-09-25" }),
      ],
      AHORA,
    );
    expect(k.atrasadas).toBe(2);
    expect(k.diasMasAtrasada).toBe(38);
    expect(k.proveedorMasAtrasado).toBe("Textiles Andina SAC");
    expect(k.documentoMasAtrasada).toBe("F001-000198");
  });
  it("sin atrasadas: cero y sin «la más atrasada»; sin lista, todo en cero", () => {
    expect(kpisDeLaLista([c({ fechaEstimadaLlegada: "2026-09-25" })], AHORA)).toMatchObject({ atrasadas: 0, diasMasAtrasada: null, proveedorMasAtrasado: null, documentoMasAtrasada: null });
    expect(kpisDeLaLista([], AHORA)).toEqual({ porRecibir: 0, unidadesPendientes: 0, atrasadas: 0, diasMasAtrasada: null, proveedorMasAtrasado: null, documentoMasAtrasada: null });
  });
  it("no trae ninguna cifra de dinero", () => {
    expect(Object.keys(kpisDeLaLista([c({})], AHORA)).sort()).toEqual(["atrasadas", "diasMasAtrasada", "documentoMasAtrasada", "porRecibir", "proveedorMasAtrasado", "unidadesPendientes"]);
  });
});

// «Recibidas» por envío: un envío de varios proveedores con una sola guía salía como filas sueltas. Lo que se rompe
// fácil: que un envío cortado por el límite de la página diga MENOS de lo que llegó (unidades de solo una parte), que
// se agrupe un envío de un solo proveedor (cabecera con un solo hijo) o que las recepciones anteriores a los envíos
// desaparezcan.
describe("agruparPorEnvio", () => {
  const rec = (loteId: string, compraId: string, o: Partial<RecepcionDeCompra> = {}): RecepcionDeCompra => ({
    loteId,
    fechaRecepcion: "2026-09-18T15:00:00Z",
    ubicacionNombre: "Tienda Trujillo",
    proveedorId: `prov-${loteId}`,
    proveedorNombre: `Proveedor ${loteId}`,
    numeroGuia: "T001-004417",
    recibidoPor: null,
    compraId,
    documento: `F001-${compraId}`,
    unidadesLlegaron: 10,
    unidadesFacturadas: 12,
    faltante: 2,
    diasDemora: 3,
    ...o,
  });
  const envio = (envioId: string, lotes: number, proveedores: number, numeroGuia: string | null = "T001-004417") => ({ envioId, numeroGuia, lotes, proveedores });

  it("un envío de dos proveedores es UN grupo con sus dos filas, y suma lo que llegó, lo facturado y lo que faltó", () => {
    const a = rec("l1", "c1", { unidadesLlegaron: 10, unidadesFacturadas: 12, faltante: 2 });
    const b = rec("l2", "c2", { unidadesLlegaron: 8, unidadesFacturadas: 8, faltante: 0 });
    const g = agruparPorEnvio([a, b], { l1: envio("e1", 2, 2), l2: envio("e1", 2, 2) });
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ tipo: "envio", envioId: "e1", numeroGuia: "T001-004417", proveedores: 2, unidadesLlegaron: 18, unidadesFacturadas: 20, faltante: 2, parcial: false });
    expect(g[0].tipo === "envio" && g[0].filas.map((f) => f.loteId)).toEqual(["l1", "l2"]);
  });

  it("un envío de UN solo proveedor no hace cabecera: sigue siendo una fila normal", () => {
    const g = agruparPorEnvio([rec("l1", "c1")], { l1: envio("e1", 1, 1) });
    expect(g).toEqual([{ tipo: "suelta", fila: rec("l1", "c1") }]);
  });

  it("las recepciones de antes de los envíos (sin envío) quedan sueltas, en su lugar y en su orden", () => {
    const viejaA = rec("v1", "cv1");
    const a = rec("l1", "c1");
    const b = rec("l2", "c2");
    const viejaB = rec("v2", "cv2");
    const g = agruparPorEnvio([viejaA, a, b, viejaB], { l1: envio("e1", 2, 2), l2: envio("e1", 2, 2) });
    expect(g.map((x) => (x.tipo === "suelta" ? `suelta:${x.fila.loteId}` : `envio:${x.envioId}`))).toEqual(["suelta:v1", "envio:e1", "suelta:v2"]);
  });

  it("el grupo ocupa el lugar de su PRIMERA fila aunque las de otro envío se intercalen", () => {
    const g = agruparPorEnvio(
      [rec("l1", "c1"), rec("m1", "c3"), rec("l2", "c2"), rec("m2", "c4")],
      { l1: envio("e1", 2, 2), l2: envio("e1", 2, 2), m1: envio("e2", 2, 2), m2: envio("e2", 2, 2) }
    );
    expect(g.map((x) => (x.tipo === "envio" ? x.envioId : "suelta"))).toEqual(["e1", "e2"]);
    expect(g[0].tipo === "envio" && g[0].filas.map((f) => f.loteId)).toEqual(["l1", "l2"]);
  });

  it("un lote que cubre DOS comprobantes cuenta como un lote, no como dos", () => {
    const g = agruparPorEnvio([rec("l1", "c1"), rec("l1", "c1b"), rec("l2", "c2")], { l1: envio("e1", 2, 2), l2: envio("e1", 2, 2) });
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ tipo: "envio", parcial: false, unidadesLlegaron: 30 });
  });

  it("si la página no trae todos los lotes del envío, el grupo es PARCIAL (y la pantalla no pinta totales de una parte)", () => {
    const g = agruparPorEnvio([rec("l1", "c1"), rec("l2", "c2")], { l1: envio("e1", 3, 3), l2: envio("e1", 3, 3) });
    expect(g[0]).toMatchObject({ tipo: "envio", proveedores: 3, parcial: true });
  });

  it("con la lista llena hasta su tope, el grupo de la última fila es parcial (podría faltar la otra mitad de un lote); los demás no", () => {
    const filas = [rec("l1", "c1"), rec("l2", "c2"), rec("m1", "c3"), rec("m2", "c4")];
    const envios = { l1: envio("e1", 2, 2), l2: envio("e1", 2, 2), m1: envio("e2", 2, 2), m2: envio("e2", 2, 2) };
    const llena = agruparPorEnvio(filas, envios, { llegoAlLimite: true });
    expect(llena.map((x) => x.tipo === "envio" && x.parcial)).toEqual([false, true]);
    const holgada = agruparPorEnvio(filas, envios, { llegoAlLimite: false });
    expect(holgada.map((x) => x.tipo === "envio" && x.parcial)).toEqual([false, false]);
  });

  it("no toma un faltante negativo como crédito: la suma del grupo solo cuenta lo que faltó", () => {
    const g = agruparPorEnvio([rec("l1", "c1", { faltante: 3 }), rec("l2", "c2", { faltante: -4 })], { l1: envio("e1", 2, 2), l2: envio("e1", 2, 2) });
    expect(g[0]).toMatchObject({ faltante: 3 });
  });

  it("sin recepciones no hay grupos", () => {
    expect(agruparPorEnvio([], {})).toEqual([]);
  });
});

describe("guiaConFormato: una ayuda al teclear, no una exigencia", () => {
  it("acepta una guía como T001-000123, en mayúsculas o minúsculas y con espacios alrededor", () => {
    expect(guiaConFormato("T001-000123")).toBe(true);
    expect(guiaConFormato(" t001-4417 ")).toBe(true);
  });
  it("rechaza lo que no tiene serie, guion o número", () => {
    expect(guiaConFormato("")).toBe(false);
    expect(guiaConFormato("T001")).toBe(false);
    expect(guiaConFormato("001-000123")).toBe(false);
    expect(guiaConFormato("T001-12")).toBe(false);
  });
});

describe("restarUnidad: el «Deshacer» de la última lectura", () => {
  const l1 = LINEAS[0];
  it("resta 1 y deja la cuenta en lo que quedaba", () => {
    const r = restarUnidad({ l1: { v1: 3 } }, l1, "v1");
    expect(r.l1.v1).toBe(2);
  });
  it("al deshacer la única lectura, la línea vuelve a «sin contar» (no queda un 0 que diga «no llegó nada»)", () => {
    const r = restarUnidad({ l1: { v1: 1 } }, l1, "v1");
    expect(r.l1).toBeUndefined();
    expect(llegoLinea(l1, r)).toBeNull();
  });
  it("es lo opuesto de sumarUnidad", () => {
    const r = restarUnidad(sumarUnidad({}, l1, "v1"), l1, "v1");
    expect(r).toEqual({});
  });
});

describe("comprobantesQueTraen: si el envío no trae la prenda pero otro comprobante sí, se ofrece agregarlo", () => {
  it("devuelve los comprobantes NO marcados que la traen, por variante", () => {
    expect(comprobantesQueTraen("v1", "p1", COMPRAS, LINEAS, ["c2"]).map((c) => c.id)).toEqual(["c1", "c3"]);
  });
  it("no ofrece uno ya marcado", () => {
    expect(comprobantesQueTraen("v1", "p1", COMPRAS, LINEAS, ["c1"]).map((c) => c.id)).toEqual(["c3"]);
  });
  it("una línea agrupada la trae por producto", () => {
    expect(comprobantesQueTraen("cualquiera", "p9", COMPRAS, LINEAS, []).map((c) => c.id)).toEqual(["c2"]);
  });
  it("ignora lo que ya no tiene nada pendiente", () => {
    expect(comprobantesQueTraen("v4", "p1", COMPRAS, LINEAS, [])).toEqual([]);
  });
});

describe("resumenPorComprobante: lo que muestra el resumen previo a recibir", () => {
  const bloques = bloquesDelEnvio(COMPRAS, ["c1", "c2"], LINEAS);
  it("solo cuenta las líneas contadas: lo que llegó y lo que faltó de ellas", () => {
    const f = resumenPorComprobante(bloques, { l1: { v1: 24 }, l2: { v2: 8 } });
    expect(f).toEqual([{ compraId: "c1", proveedorNombre: "Textiles Andina SAC", documento: "F001-000198", llegan: 32, faltan: 4, lineasCortas: ["l2"] }]);
  });
  it("un comprobante sin nada contado no sale", () => {
    expect(resumenPorComprobante(bloques, {})).toEqual([]);
  });
  it("una línea contada en 0 sí cuenta como faltante", () => {
    const f = resumenPorComprobante(bloques, { l3: { v3: 0 } });
    expect(f).toEqual([{ compraId: "c2", proveedorNombre: "Tejidos Rímac SAC", documento: "F001-000482", llegan: 0, faltan: 30, lineasCortas: ["l3"] }]);
  });
});

describe("movimientosDelEnvio: lo que queda escrito en el stock", () => {
  const bloques = bloquesDelEnvio(COMPRAS, ["c1", "c2"], LINEAS);
  const dePrenda = (id: string) => ({ referencia: id === "v9" ? "Polo Alba" : "Blusa Emma", detalle: id === "v9" ? "M / Negro" : "S / Beige" });
  it("primero los comprobantes, luego fuera de comprobante y por último otra sede; los ceros no son movimientos", () => {
    const m = movimientosDelEnvio({
      bloques,
      reparto: { l1: { v1: 24 }, l2: { v2: 0 }, l4: { v9: 4 } },
      extras: [{ productoId: "p1", varianteId: "v9", cantidad: 2, costoUnitario: "", proveedorId: "prov1", esRegalo: true }],
      traslados: [{ numero: 15, lineas: [{ varianteId: "v1", referencia: "Blusa Emma", talla: "M", color: "Negro" }], conteo: { v1: 10 } }],
      dePrenda,
    });
    expect(m.map((x) => [x.cantidad, x.origen])).toEqual([
      [24, "F001-000198"],
      [4, "F001-000482"],
      [2, "fuera de comprobante"],
      [10, "traslado 15"],
    ]);
    expect(m[1].referencia).toBe("Polo Alba"); // la línea agrupada usa la variante que se anotó
    expect(m[2].detalle).toBe("M / Negro · regalo");
  });
  it("una prenda fuera de comprobante incompleta no se cuenta", () => {
    const m = movimientosDelEnvio({ bloques, reparto: {}, extras: [{ productoId: "p1", varianteId: "v9", cantidad: 2, costoUnitario: "", proveedorId: "", esRegalo: false }], traslados: [], dePrenda });
    expect(m).toEqual([]);
  });
});
