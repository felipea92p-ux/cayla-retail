import { describe, expect, it } from "vitest";
import { claveComprobante, comprobantesDeCompras, cruzarCompras, esSerieDePapel, type ComprobanteErp } from "./sire-cruce-reglas";
import type { LineaSire } from "./sire-propuesta-reglas";
import type { FilaRegistroCompras } from "./impuestos-reglas";

// Datos inventados: ningún RUC ni proveedor es real.
const sunat = (p: Partial<LineaSire> & Pick<LineaSire, "serie" | "numero" | "docNumero" | "total">): LineaSire => ({
  car: null, fecha: "2026-10-05", tipo: "01", docTipo: "6", nombre: "PROVEEDOR SUNAT", base: p.total / 1.18, igv: p.total - p.total / 1.18,
  moneda: "PEN", tipoCambio: null, refTipo: null, refSerie: null, refNumero: null, ...p,
});
const erp = (p: Partial<ComprobanteErp> & Pick<ComprobanteErp, "serie" | "numero" | "ruc" | "total">): ComprobanteErp => ({
  origen: "compra", tipo: "01", nombre: "Proveedor ERP", fecha: "2026-10-05", base: p.total / 1.18, igv: p.total - p.total / 1.18, ...p,
});

describe("claveComprobante y esSerieDePapel", () => {
  it("la misma factura con ceros o minúsculas tiene la misma llave", () => {
    expect(claveComprobante("1", "f001", "000123", "20100000001")).toBe(claveComprobante("01", "F001", "123", "20100000001"));
  });
  it("una serie que empieza con número es de papel", () => {
    expect(esSerieDePapel("0001")).toBe(true);
    expect(esSerieDePapel("F001")).toBe(false);
    expect(esSerieDePapel("E001")).toBe(false);
  });
});

describe("cruzarCompras", () => {
  it("separa lo que coincide, lo que falta en cada lado y los montos distintos", () => {
    const r = cruzarCompras(
      [
        sunat({ serie: "F001", numero: "1", docNumero: "20100000001", total: 118 }),
        sunat({ serie: "F001", numero: "2", docNumero: "20100000001", total: 236 }),
        sunat({ serie: "E001", numero: "9", docNumero: "20100000002", total: 59 }),
      ],
      [
        erp({ serie: "F001", numero: "0001", ruc: "20100000001", total: 118.02 }),
        erp({ serie: "F001", numero: "2", ruc: "20100000001", total: 200 }),
        erp({ serie: "F003", numero: "44", ruc: "20100000003", total: 590 }),
      ],
    );
    const estados = Object.fromEntries(r.lineas.map((l) => [`${l.serie}-${l.numero}`, l.estado]));
    expect(estados).toEqual({ "F001-1": "coincide", "F001-2": "montos", "E001-9": "solo_sunat", "F003-44": "solo_erp" });
    expect(r.resumen.solo_erp).toEqual({ n: 1, igv: 90 });
    const distinta = r.lineas.find((l) => l.estado === "montos")!;
    expect(distinta.diferencia?.total).toBe(36);
    // En «montos distintos» lo que está en juego es la diferencia de IGV, no el IGV entero de la factura.
    expect(r.resumen.montos.igv).toBe(Math.abs(distinta.diferencia!.igv));
    expect(distinta.motivo).toContain("SUNAT dice S/\u00a0236.00 y el ERP S/\u00a0200.00");
  });

  it("lo que hay que mirar va primero y lo que coincide al final", () => {
    const r = cruzarCompras(
      [sunat({ serie: "F001", numero: "1", docNumero: "20100000001", total: 118 }), sunat({ serie: "F001", numero: "2", docNumero: "20100000001", total: 118 })],
      [erp({ serie: "F001", numero: "1", ruc: "20100000001", total: 118 }), erp({ serie: "F009", numero: "1", ruc: "20100000009", total: 118 })],
    );
    expect(r.lineas.map((l) => l.estado)).toEqual(["solo_erp", "solo_sunat", "coincide"]);
  });

  it("la misma serie y número de dos proveedores son dos comprobantes", () => {
    const r = cruzarCompras(
      [sunat({ serie: "F001", numero: "1", docNumero: "20100000001", total: 118 })],
      [erp({ serie: "F001", numero: "1", ruc: "20100000002", total: 118 })],
    );
    expect(r.lineas.map((l) => l.estado).sort()).toEqual(["solo_erp", "solo_sunat"]);
  });

  it("una factura en papel no es un error: va aparte", () => {
    const r = cruzarCompras([], [erp({ serie: "0001", numero: "15", ruc: "20100000001", total: 118 })]);
    expect(r.lineas[0]).toMatchObject({ estado: "papel", motivo: expect.stringContaining("en papel") });
    expect(r.resumen.solo_erp.n).toBe(0);
  });

  it("una factura registrada dos veces en el ERP lo dice", () => {
    const una = erp({ serie: "F001", numero: "1", ruc: "20100000001", total: 118 });
    const r = cruzarCompras([sunat({ serie: "F001", numero: "1", docNumero: "20100000001", total: 118 })], [una, { ...una, origen: "gasto_viaje" }]);
    expect(r.lineas.map((l) => l.estado)).toEqual(["solo_erp", "coincide"]);
    expect(r.lineas[0]!.motivo).toContain("dos veces");
  });

  it("dos veces en el ERP y ninguna en SUNAT: la segunda dice que está repetida", () => {
    const una = erp({ serie: "F001", numero: "1", ruc: "20100000001", total: 118 });
    const r = cruzarCompras([], [una, una]);
    expect(r.lineas.map((l) => l.motivo.includes("dos veces"))).toEqual([false, true]);
  });

  it("las boletas del ERP solo se comparan si SUNAT trae boletas", () => {
    const boleta = erp({ tipo: "03", serie: "B001", numero: "1", ruc: "20100000001", total: 50 });
    expect(cruzarCompras([], [boleta]).lineas).toHaveLength(0);
    const conBoletas = cruzarCompras([sunat({ tipo: "03", serie: "B001", numero: "1", docNumero: "20100000001", total: 50 })], [boleta]);
    expect(conBoletas.lineas[0]!.estado).toBe("coincide");
  });

  it("la nota de crédito en negativo del ERP cuadra con la de SUNAT", () => {
    const r = cruzarCompras(
      [sunat({ tipo: "07", serie: "FC01", numero: "3", docNumero: "20100000001", total: -59 })],
      [erp({ tipo: "07", serie: "FC01", numero: "3", ruc: "20100000001", total: -59 })],
    );
    expect(r.lineas[0]!.estado).toBe("coincide");
  });

  it("en dólares compara con el tipo de cambio y, sin él, pide revisarla a mano", () => {
    const r = cruzarCompras(
      [sunat({ serie: "F001", numero: "1", docNumero: "20100000001", total: 100, moneda: "USD", tipoCambio: 3.75 })],
      [erp({ serie: "F001", numero: "1", ruc: "20100000001", total: 375.5 })],
    );
    expect(r.lineas[0]).toMatchObject({ estado: "coincide", enDolares: true });
    const sinTc = cruzarCompras(
      [sunat({ serie: "F001", numero: "1", docNumero: "20100000001", total: 100, moneda: "USD", tipoCambio: null })],
      [erp({ serie: "F001", numero: "1", ruc: "20100000001", total: 375 })],
    );
    expect(sinTc.lineas[0]).toMatchObject({ estado: "montos", motivo: expect.stringContaining("compárala a mano") });
  });
});

describe("comprobantesDeCompras", () => {
  const fila = (p: Partial<FilaRegistroCompras>): FilaRegistroCompras => ({
    origen: "compra", naturaleza: "gasto", fecha: "2026-10-05", vencimiento: null, tipo: "factura", serie: "f001", numero: "0007",
    proveedorRuc: "20100000001", proveedor: "X", base: 100, igv: 18, noGravado: 0, total: 118, daCredito: true,
    refFecha: null, refTipo: null, refSerie: null, refNumero: null, tienda: null, ...p,
  });
  it("pasa el tipo a su código de SUNAT y deja fuera los recibos por honorarios", () => {
    const r = comprobantesDeCompras([fila({}), fila({ tipo: "recibo_por_honorarios" }), fila({ tipo: "nota_credito" })]);
    expect(r.map((c) => [c.tipo, c.serie, c.numero])).toEqual([["01", "F001", "7"], ["07", "F001", "7"]]);
  });
});

describe("resolver una diferencia", async () => {
  const { aplicarResoluciones, decisionesPara } = await import("./sire-cruce-reglas");
  const base = cruzarCompras(
    [sunat({ serie: "E001", numero: "9", docNumero: "20100000002", total: 59 }), sunat({ serie: "F001", numero: "1", docNumero: "20100000001", total: 118 })],
    [erp({ serie: "F001", numero: "1", ruc: "20100000001", total: 118 }), erp({ serie: "F003", numero: "44", ruc: "20100000003", total: 590 })],
  );
  const res = (clave: string) => ({ id: "r1", clave, decision: "es_de_claure" as const, nota: null, resueltaAt: "2026-11-02T10:00:00Z", resueltaPor: "Ana" });

  it("lo resuelto sale de las cifras, baja en la lista y conserva su decisión", () => {
    const clave = claveComprobante("01", "E001", "9", "20100000002");
    const r = aplicarResoluciones(base, [res(clave)]);
    expect(r.resumen.solo_sunat.n).toBe(0);
    expect(r.resumen.solo_erp.n).toBe(1);
    expect(r.resueltas).toBe(1);
    expect(r.lineas.map((l) => [l.estado, l.resolucion?.decision ?? null])).toEqual([["solo_erp", null], ["solo_sunat", "es_de_claure"], ["coincide", null]]);
  });

  it("una resolución de un comprobante que ya no aparece, o de uno que cuadra, no cuenta", () => {
    const r = aplicarResoluciones(base, [res("01|X001|1|20100000009"), res(claveComprobante("01", "F001", "1", "20100000001"))]);
    expect(r.resueltas).toBe(0);
    expect(r.resumen.solo_sunat.n + r.resumen.solo_erp.n).toBe(2);
  });

  it("solo hay algo que decidir donde no cuadra", () => {
    expect(decisionesPara("coincide")).toEqual([]);
    expect(decisionesPara("papel")).toEqual([]);
    expect(decisionesPara("solo_sunat").map((d) => d.decision)).toEqual(["es_de_claure", "otro_mes", "no_es_nuestra"]);
  });

  it("la llave tiene la forma que exige la base (sire_resoluciones.clave)", () => {
    // La misma expresión que el CHECK de 20261102203000_sire_resoluciones.sql: si una cambia, las resoluciones dejan de encontrar su línea.
    const forma = /^[0-9A-Z]{2}\|[^|]{1,20}\|[0-9]{1,20}\|[0-9A-Z]{0,20}$/;
    for (const l of base.lineas) expect(l.clave).toMatch(forma);
    expect(claveComprobante("1", "f001", "000", null)).toMatch(forma);
  });
});

describe("cruzarVentas (actividad 3)", async () => {
  const { cruzarVentas, comprobantesDeVentas, decisionesPara } = await import("./sire-cruce-reglas");
  type FV = import("./impuestos-reglas").FilaRegistroVentas;
  const venta = (p: Partial<FV>): FV => ({
    fecha: "2026-10-05", tipo: "boleta", serie: "B001", numero: 1, clienteTipoDoc: "1", clienteNumDoc: "40000001", clienteNombre: "Cliente Inventado",
    base: 100, igv: 18, total: 118, estado: "aceptado", anulado: false, refFecha: null, refTipo: null, refSerie: null, refNumero: null, tienda: "Lima", observacion: null, ...p,
  });

  it("empareja por serie y número aunque SUNAT traiga otro documento del cliente", () => {
    const r = cruzarVentas([sunat({ tipo: "03", serie: "B001", numero: "00000001", docNumero: "-", total: 118 })], comprobantesDeVentas([venta({})]));
    expect(r.lineas.map((l) => l.estado)).toEqual(["coincide"]);
  });

  it("lo que SUNAT tiene y el ERP no se emitió por fuera", () => {
    const r = cruzarVentas([sunat({ tipo: "01", serie: "F009", numero: "5", docNumero: "20100000001", total: 590 })], []);
    expect(r.lineas[0]).toMatchObject({ estado: "solo_sunat", motivo: expect.stringContaining("fuera del ERP") });
  });

  it("lo que SUNAT no tiene dice en qué estado lo dejó Lucode", () => {
    const r = cruzarVentas([], comprobantesDeVentas([venta({ estado: "pendiente_reintento" }), venta({ numero: 2 })]));
    expect(r.lineas.map((l) => l.motivo)).toEqual([
      expect.stringContaining("«pendiente reintento»"),
      expect.stringContaining("El ERP dice que SUNAT lo aceptó"),
    ]);
  });

  it("anulado en el ERP: si SUNAT no lo trae cuadra; si lo trae vigente, la baja no llegó", () => {
    const anulada = venta({ anulado: true, base: 0, igv: 0, total: 0 });
    expect(cruzarVentas([], comprobantesDeVentas([anulada])).lineas[0]!.estado).toBe("coincide");
    const r = cruzarVentas([sunat({ tipo: "03", serie: "B001", numero: "1", docNumero: null, total: 118 })], comprobantesDeVentas([anulada]));
    expect(r.lineas[0]).toMatchObject({ estado: "montos", motivo: expect.stringContaining("la baja no llegó") });
  });

  it("las copias conocidas B005-8 a 109 tienen su motivo propio, sin cambiar estado ni cifras", async () => {
    const { esCopiaConocida } = await import("./sire-cruce-reglas");
    const r = cruzarVentas(
      [
        sunat({ tipo: "03", serie: "B005", numero: "00000020", docNumero: null, total: 100 }),
        sunat({ tipo: "03", serie: "B005", numero: "21", docNumero: null, total: 0 }),
        sunat({ tipo: "03", serie: "B001", numero: "113", docNumero: null, total: 100 }),
      ],
      [],
    );
    const por = Object.fromEntries(r.lineas.map((l) => [`${l.serie}-${Number(l.numero)}`, l]));
    // Con monto: la baja no llegó, y sigue por mirar (estado y resumen igual que antes).
    expect(por["B005-20"]).toMatchObject({ estado: "solo_sunat", motivo: expect.stringContaining("la baja no llegó") });
    expect(por["B005-20"]!.motivo).toContain("B005-20");
    expect(por["B005-21"]).toMatchObject({ estado: "solo_sunat", motivo: expect.stringContaining("confirma con el contador que su baja se aceptó") });
    for (const k of ["B005-20", "B005-21"]) expect(por[k]!.motivo).not.toContain("fuera del ERP");
    // Control: otra serie conserva el motivo de siempre.
    expect(por["B001-113"]!.motivo).toContain("fuera del ERP");
    expect(r.resumen.solo_sunat.n).toBe(3);
    // Los bordes de la lista fija.
    expect([7, 8, 109, 110].map((n) => esCopiaConocida("03", "b005", String(n)))).toEqual([false, true, true, false]);
    expect(esCopiaConocida("01", "B005", "20")).toBe(false);
    // En compras no aplica: una B005 de un proveedor es otra cosa.
    const c = cruzarCompras([sunat({ tipo: "03", serie: "B005", numero: "20", docNumero: "20100000001", total: 100 })], []);
    expect(c.lineas[0]!.motivo).toContain("El proveedor la emitió");
  });

  it("las notas de venta internas no se comparan; las decisiones son las de vender", () => {
    expect(comprobantesDeVentas([venta({ tipo: "nota_venta" })])).toEqual([]);
    expect(decisionesPara("solo_erp", "ventas").map((d) => d.decision)).toEqual(["otro_mes", "revisada"]);
    expect(decisionesPara("solo_sunat", "ventas").map((d) => d.decision)).not.toContain("pedida_al_proveedor");
  });
});
