import { describe, it, expect } from "vitest";
import { comprobanteDeFilaOperativa, costoBase, costoParaTipear, esFuncionAusente, totalesCompra, type FilaOperativa, esRelacionAusente } from "./compras-reglas";

// El costo unitario que se guarda alimenta el costo de la variante y el
// margen de cada venta. Si el descuento del IGV se hace mal, la mercadería
// entra un 18 % más cara de lo real y todos los márgenes salen chicos — y
// nadie lo nota, porque el total de la factura sí cuadra con el papel.

describe("costoBase", () => {
  it("sin IGV devuelve lo tipeado, redondeado a 2 decimales como la base", () => {
    expect(costoBase(100, 18, false)).toBe(100);
    expect(costoBase(38.898, 18, false)).toBe(38.9);
  });

  it("con IGV descuenta el porcentaje", () => {
    expect(costoBase(118, 18, true)).toBe(100);
    expect(costoBase(59, 18, true)).toBe(50);
    expect(costoBase(45.9, 18, true)).toBe(38.9);
  });

  it("con IGV pero porcentaje 0 (boleta, nota de venta) no descuenta nada", () => {
    expect(costoBase(118, 0, true)).toBe(118);
  });

  it("basura numérica cae a 0, nunca a NaN", () => {
    expect(costoBase(NaN, 18, true)).toBe(0);
    expect(costoBase(-5, 18, false)).toBe(0);
  });
});

describe("costoParaTipear", () => {
  it("es el inverso de costoBase para el costo sugerido de la variante", () => {
    expect(costoParaTipear(100, 18, true)).toBe(118);
    expect(costoParaTipear(100, 18, false)).toBe(100);
    expect(costoBase(costoParaTipear(38.9, 18, true), 18, true)).toBe(38.9);
  });
});

describe("totalesCompra", () => {
  it("con IGV incluido, el total es el del papel y el IGV absorbe el redondeo", () => {
    expect(totalesCompra([{ cantidad: 1, costoTipeado: 10 }], 18, true)).toEqual({ subtotal: 8.47, igv: 1.53, total: 10 });
    expect(totalesCompra([{ cantidad: 3, costoTipeado: 10 }], 18, true)).toEqual({ subtotal: 25.41, igv: 4.59, total: 30 });
  });

  it("sin IGV incluido, el IGV se calcula sobre la base como siempre", () => {
    expect(totalesCompra([{ cantidad: 1, costoTipeado: 100 }], 18, false)).toEqual({ subtotal: 100, igv: 18, total: 118 });
  });

  it("boleta (IGV 0) con el interruptor prendido: nada que descontar", () => {
    expect(totalesCompra([{ cantidad: 2, costoTipeado: 10 }], 0, true)).toEqual({ subtotal: 20, igv: 0, total: 20 });
  });

  it("líneas vacías o basura no aportan", () => {
    expect(totalesCompra([{ cantidad: 1, costoTipeado: NaN }], 18, true)).toEqual({ subtotal: 0, igv: 0, total: 0 });
  });
});

// ADR-0126: quien no es líder lee los comprobantes de `listar_compras_operativo`, que no trae un solo monto. La
// pantalla de Recibir espera la forma de siempre (`CompraResumen`): si el mapeo inventara un monto, un integrante
// vería dinero que la base le negó; si perdiera el atraso o las cantidades, «Atrasadas» y «Sin contar» mentirían.

describe("comprobanteDeFilaOperativa", () => {
  const fila: FilaOperativa = {
    id: "c-1",
    proveedor_id: "p-1",
    proveedor_nombre: "Textiles Andina SAC",
    proveedor_ruc: "20123456789",
    tipo: "factura",
    documento: "F001-000123",
    fecha_emision: "2026-09-10",
    ubicaciones_destino: ["u-trujillo"],
    estado: "vigente",
    nota: "Llega con la caja azul",
    created_at: "2026-09-10T15:00:00Z",
    facturado_cantidad: 24,
    recibido_cantidad: 10,
    estado_recepcion: "parcial",
    fecha_estimada_llegada: "2026-09-15",
    recepcion_atrasada: true,
    cerrado_cantidad: 4,
  };

  it("lleva lo que hace falta para recibir, tal cual: quién, qué documento, cuánto, cuánto llegó y si viene atrasado", () => {
    const c = comprobanteDeFilaOperativa(fila);
    expect(c).toMatchObject({
      id: "c-1",
      proveedorId: "p-1",
      proveedorNombre: "Textiles Andina SAC",
      documento: "F001-000123",
      tipo: "factura",
      ubicacionesDestino: ["u-trujillo"],
      estado: "vigente",
      facturadoCantidad: 24,
      recibidoCantidad: 10,
      cerradoCantidad: 4,
      estadoRecepcion: "parcial",
      recepcionAtrasada: true,
      fechaEstimadaLlegada: "2026-09-15",
      nota: "Llega con la caja azul",
      creadoEn: "2026-09-10T15:00:00Z",
    });
  });

  it("no trae un solo monto: subtotal, IGV, total, pagado, saldo y notas de crédito van en 0", () => {
    const c = comprobanteDeFilaOperativa(fila);
    expect([c.subtotal, c.igv, c.total, c.pagado, c.saldo, c.notasCredito]).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it("los datos de pago van neutros (la función no los devuelve) y no marcan el comprobante como vencido", () => {
    const c = comprobanteDeFilaOperativa(fila);
    expect(c.vencida).toBe(false);
    expect(c.fechaVencimiento).toBeNull();
  });

  it("respeta lo que la fila NO tiene: sin fecha estimada, sin RUC y sin nota", () => {
    const c = comprobanteDeFilaOperativa({ ...fila, fecha_estimada_llegada: null, proveedor_ruc: null, nota: null, recepcion_atrasada: false });
    expect(c.fechaEstimadaLlegada).toBeNull();
    expect(c.proveedorRuc).toBeNull();
    expect(c.nota).toBeNull();
    expect(c.recepcionAtrasada).toBe(false);
  });
});

// Si la app se despliega ANTES de pegar la migración que crea las dos funciones operativas, Recibir tiene que seguir
// con el camino de antes. Pero solo ante «la función no existe»: un error de permiso o de red NO se disfraza de eso —
// caer al camino viejo por cualquier error escondería justo los fallos que hay que ver.
describe("esFuncionAusente", () => {
  it("reconoce que PostgREST no encuentra la función en su schema cache (PGRST202)", () => {
    expect(esFuncionAusente({ code: "PGRST202" })).toBe(true);
  });

  it("reconoce el undefined_function de Postgres (42883)", () => {
    expect(esFuncionAusente({ code: "42883" })).toBe(true);
  });

  it("no confunde otros errores con «la función no existe»", () => {
    expect(esFuncionAusente({ code: "42501" })).toBe(false); // permiso: «Solo un líder puede ver …»
    expect(esFuncionAusente({ code: "PGRST301" })).toBe(false);
    expect(esFuncionAusente({ code: "" })).toBe(false);
    expect(esFuncionAusente({})).toBe(false);
  });

  it("sin error no hay nada que reconocer", () => {
    expect(esFuncionAusente(null)).toBe(false);
    expect(esFuncionAusente(undefined)).toBe(false);
  });
});

// ADR-0138: con una tienda de por medio, las cifras del comprobante pasan a ser las de ESA tienda — y el estado de
// recepción se lee desde ella (el del comprobante entero mezcla a todas las tiendas).
describe("comprobanteDeFilaOperativa · desde una tienda", () => {
  const fila: FilaOperativa = {
    id: "c-1", proveedor_id: "p-1", proveedor_nombre: "Textiles Andina SAC", proveedor_ruc: null, tipo: "factura", documento: "F001-000123",
    fecha_emision: "2026-09-10", ubicaciones_destino: ["u-trujillo", "u-taller"], estado: "vigente", nota: null, created_at: "2026-09-10T15:00:00Z",
    facturado_cantidad: 24, recibido_cantidad: 12, estado_recepcion: "parcial", fecha_estimada_llegada: null, recepcion_atrasada: false, cerrado_cantidad: 0,
    asignado_aqui: 12, recibido_aqui: 12, cerrado_aqui: 0, pendiente_aqui: 0,
  };

  it("las cifras son las de la tienda: 12 de 12 aunque el comprobante entero vaya 12 de 24", () => {
    const c = comprobanteDeFilaOperativa(fila);
    expect(c).toMatchObject({ facturadoCantidad: 12, recibidoCantidad: 12, cerradoCantidad: 0, asignadoAqui: 12, recibidoAqui: 12, pendienteAqui: 0 });
  });

  it("el estado se lee desde la tienda: para Trujillo ya está recibida aunque al comprobante le falte lo del Taller", () => {
    expect(comprobanteDeFilaOperativa(fila).estadoRecepcion).toBe("recibida");
    expect(comprobanteDeFilaOperativa({ ...fila, recibido_aqui: 4, pendiente_aqui: 8 }).estadoRecepcion).toBe("parcial");
    expect(comprobanteDeFilaOperativa({ ...fila, recibido_aqui: 0, pendiente_aqui: 12 }).estadoRecepcion).toBe("sin_recibir");
  });

  it("sin tienda de por medio (asignado_aqui null) sigue mostrando el comprobante entero", () => {
    const c = comprobanteDeFilaOperativa({ ...fila, asignado_aqui: null, recibido_aqui: null, cerrado_aqui: null, pendiente_aqui: null });
    expect(c).toMatchObject({ facturadoCantidad: 24, recibidoCantidad: 12, estadoRecepcion: "parcial" });
    expect(c.asignadoAqui).toBeUndefined();
  });

  it("las tiendas del reparto llegan tal cual (y una lista vacía si la base no las trae)", () => {
    expect(comprobanteDeFilaOperativa(fila).ubicacionesDestino).toEqual(["u-trujillo", "u-taller"]);
    expect(comprobanteDeFilaOperativa({ ...fila, ubicaciones_destino: null }).ubicacionesDestino).toEqual([]);
  });
});

describe("lo que la base todavía no tiene (el despliegue llega antes que la migración)", () => {
  it("una función o parámetro que la base no conoce: PGRST202 / 42883", () => {
    expect(esFuncionAusente({ code: "PGRST202" })).toBe(true);
    expect(esFuncionAusente({ code: "42883" })).toBe(true);
    expect(esFuncionAusente({ code: "42501" })).toBe(false);
    expect(esFuncionAusente(null)).toBe(false);
    expect(esFuncionAusente(undefined)).toBe(false);
  });

  it("una tabla o vista que la base todavía no tiene: PGRST205 / 42P01 (y no cualquier otro error)", () => {
    expect(esRelacionAusente({ code: "PGRST205" })).toBe(true);
    expect(esRelacionAusente({ code: "42P01" })).toBe(true);
    // un permiso negado o una red caída NO son «no hay reparto»: esos sí se avisan
    expect(esRelacionAusente({ code: "42501" })).toBe(false);
    expect(esRelacionAusente({ code: "PGRST202" })).toBe(false);
    expect(esRelacionAusente(null)).toBe(false);
  });
});
