import { describe, expect, it } from "vitest";
import type { Proforma } from "./proformas-reglas";
import { soles } from "./compras-reglas";
import { conversionDelMes, montosDeProforma, textoWhatsAppDeLaProforma, camposDeBusquedaDeLaProforma, chipDeLaProforma, confirmacionDeConversion, detalleDeLaProforma, estadoVisible, franjaDeProformas, ordenarProformas } from "./facturacion-proformas-reglas";

const AHORA = new Date("2026-09-19T20:00:00Z");
const enHoras = (h: number) => new Date(AHORA.getTime() + h * 3600 * 1000).toISOString();

function proforma(extra: Partial<Proforma> = {}): Proforma {
  return {
    id: "p",
    ubicacion_id: "u",
    cliente_nombre: null,
    cliente_num_doc: null,
    total: 100,
    estado: "vigente",
    comprobante_id: null,
    created_at: enHoras(-24),
    vence_at: enHoras(100),
    porVencer: false,
    vencida: false,
    ...extra,
  };
}

describe("estadoVisible", () => {
  it("una vigente que sigue valiendo es vigente; si vence pronto, por vencer", () => {
    expect(estadoVisible(proforma())).toBe("vigente");
    expect(estadoVisible(proforma({ porVencer: true }))).toBe("porVencer");
  });

  it("una vigente en la base cuyo plazo ya pasó se ve como vencida (nadie escribe `vencida`)", () => {
    expect(estadoVisible(proforma({ vencida: true, vence_at: enHoras(-2) }))).toBe("vencida");
  });

  it("convertida, anulada y la vencida de la base se ven como lo que son", () => {
    expect(estadoVisible(proforma({ estado: "convertida" }))).toBe("convertida");
    expect(estadoVisible(proforma({ estado: "anulada" }))).toBe("anulada");
    expect(estadoVisible(proforma({ estado: "vencida" }))).toBe("vencida");
  });
});

describe("ordenarProformas (excepciones primero)", () => {
  it("las que valen (las que caducan antes primero), luego vencidas, convertidas y anuladas", () => {
    const orden = ordenarProformas([
      proforma({ id: "anulada", estado: "anulada" }),
      proforma({ id: "convertida", estado: "convertida" }),
      proforma({ id: "vencida-vieja", vencida: true, vence_at: enHoras(-120) }),
      proforma({ id: "vigente-lejos", vence_at: enHoras(200) }),
      proforma({ id: "vencida-reciente", vencida: true, vence_at: enHoras(-1) }),
      proforma({ id: "por-vencer", porVencer: true, vence_at: enHoras(5) }),
      proforma({ id: "vigente", vence_at: enHoras(100) }),
    ]).map((p) => p.id);
    expect(orden).toEqual(["por-vencer", "vigente", "vigente-lejos", "vencida-reciente", "vencida-vieja", "convertida", "anulada"]);
  });

  it("una vigente sin fecha de vencimiento va al final de las que valen, no al principio", () => {
    const orden = ordenarProformas([proforma({ id: "sin-fecha", vence_at: null }), proforma({ id: "con-fecha", vence_at: enHoras(300) })]).map((p) => p.id);
    expect(orden).toEqual(["con-fecha", "sin-fecha"]);
  });

  it("entre convertidas (o con el mismo vencimiento) va primero la más nueva", () => {
    const orden = ordenarProformas([
      proforma({ id: "vieja", estado: "convertida", created_at: enHoras(-72) }),
      proforma({ id: "nueva", estado: "convertida", created_at: enHoras(-2) }),
      proforma({ id: "misma-vieja", vence_at: enHoras(50), created_at: enHoras(-30) }),
      proforma({ id: "misma-nueva", vence_at: enHoras(50), created_at: enHoras(-3) }),
    ]).map((p) => p.id);
    expect(orden).toEqual(["misma-nueva", "misma-vieja", "nueva", "vieja"]);
  });

  it("no modifica el arreglo que recibe", () => {
    const original = [proforma({ id: "b", estado: "anulada" }), proforma({ id: "a" })];
    ordenarProformas(original);
    expect(original.map((p) => p.id)).toEqual(["b", "a"]);
  });
});

describe("chipDeLaProforma", () => {
  it("cada estado con su palabra y su tono; ninguno en rojo", () => {
    expect(chipDeLaProforma(proforma())).toEqual({ tono: "neutro", texto: "Vigente" });
    expect(chipDeLaProforma(proforma({ porVencer: true }))).toEqual({ tono: "ambar", texto: "Por vencer" });
    expect(chipDeLaProforma(proforma({ vencida: true }))).toEqual({ tono: "apagado", texto: "Vencida" });
    expect(chipDeLaProforma(proforma({ estado: "convertida" }))).toEqual({ tono: "verde", texto: "Convertida" });
    expect(chipDeLaProforma(proforma({ estado: "anulada" }))).toEqual({ tono: "apagado", texto: "Anulada" });
  });
});

describe("detalleDeLaProforma", () => {
  it("una por vencer dice cuánto falta y pide ir en ámbar", () => {
    expect(detalleDeLaProforma(proforma({ porVencer: true, vence_at: enHoras(5) }), AHORA)).toEqual({ texto: "Vence en 5 h", urgente: true });
  });

  it("una vigente dice cuánto falta, sin urgencia", () => {
    expect(detalleDeLaProforma(proforma({ vence_at: enHoras(100) }), AHORA)).toEqual({ texto: "Vence en 4 d", urgente: false });
  });

  it("una vencida dice hace cuánto venció", () => {
    expect(detalleDeLaProforma(proforma({ vencida: true, vence_at: enHoras(-50) }), AHORA)).toEqual({ texto: "Venció hace 2 d", urgente: false });
  });

  it("una que vence en menos de un minuto dice «instantes»", () => {
    expect(detalleDeLaProforma(proforma({ porVencer: true, vence_at: new Date(AHORA.getTime() + 20 * 1000).toISOString() }), AHORA)).toEqual({ texto: "Vence en instantes", urgente: true });
  });

  it("sin fecha de vencimiento, convertida o anulada: no dice nada", () => {
    expect(detalleDeLaProforma(proforma({ vence_at: null }), AHORA)).toBeNull();
    expect(detalleDeLaProforma(proforma({ estado: "convertida" }), AHORA)).toBeNull();
    expect(detalleDeLaProforma(proforma({ estado: "anulada" }), AHORA)).toBeNull();
  });
});

describe("camposDeBusquedaDeLaProforma", () => {
  it("se encuentra por clienta, documento, estado y total", () => {
    const texto = camposDeBusquedaDeLaProforma(proforma({ cliente_nombre: "Lucía Paredes", cliente_num_doc: "45678912", porVencer: true, total: 320 })).join(" ");
    for (const esperado of ["Lucía Paredes", "45678912", "Por vencer", "320.00"]) expect(texto).toContain(esperado);
  });

  it("una vigente cuyo plazo pasó se encuentra escribiendo «vencida», no «vigente»", () => {
    const texto = camposDeBusquedaDeLaProforma(proforma({ vencida: true })).join(" ");
    expect(texto).toContain("Vencida");
    expect(texto).not.toContain("Vigente");
  });
});

describe("franjaDeProformas", () => {
  it("dice cuántas siguen valiendo, por cuánto y cuántas vencen pronto", () => {
    expect(franjaDeProformas({ vigentes: 1, monto: 88.5, porVencer: 0, vencidas: 0 })).toEqual({
      hay: true,
      vigentes: "1 vigente",
      monto: "S/ 88.50",
      porVencer: "0 por vencer",
      urgente: false,
    });
  });

  it("en plural, con el monto en soles, y las por vencer piden atención", () => {
    expect(franjaDeProformas({ vigentes: 3, monto: 1234.5, porVencer: 2, vencidas: 0 })).toEqual({
      hay: true,
      vigentes: "3 vigentes",
      monto: soles(1234.5),
      porVencer: "2 por vencer",
      urgente: true,
    });
  });

  it("sin ninguna vigente es una sola línea, no tres ceros; las vencidas no la vuelven vigente", () => {
    expect(franjaDeProformas({ vigentes: 0, monto: 0, porVencer: 0, vencidas: 4 })).toEqual({ hay: false, texto: "Sin proformas vigentes" });
  });
});

describe("confirmacionDeConversion", () => {
  it("una proforma que sigue valiendo, o que vence pronto, no pide confirmación", () => {
    expect(confirmacionDeConversion(proforma(), AHORA)).toBeNull();
    expect(confirmacionDeConversion(proforma({ porVencer: true, vence_at: enHoras(10) }), AHORA)).toBeNull();
  });

  it("una vencida avisa hace cuánto venció y con qué precio saldría el comprobante", () => {
    expect(confirmacionDeConversion(proforma({ vencida: true, vence_at: enHoras(-72), total: 88.5 }), AHORA)).toEqual({
      titulo: "Esta proforma venció hace 3 d.",
      detalle: "El comprobante saldrá con el precio de la cotización (S/ 88.50), no con el de hoy. Si ya cambió, cotiza de nuevo.",
      casilla: "Sí, emitirlo al precio de entonces",
    });
  });

  it("dice «hace 12 min» si venció hace poco, y sin plazo no hay nada que confirmar", () => {
    expect(confirmacionDeConversion(proforma({ vencida: true, vence_at: enHoras(-0.2) }), AHORA)?.titulo).toBe("Esta proforma venció hace 12 min.");
    expect(confirmacionDeConversion(proforma({ vencida: true, vence_at: null }), AHORA)).toBeNull();
  });
});

describe("montosDeProforma", () => {
  it("separa el IGV del total y los dos suman el total", () => {
    expect(montosDeProforma(118)).toEqual({ subtotal: 100, igv: 18, total: 118 });
    const r = montosDeProforma(99.9);
    expect(Math.round((r.subtotal + r.igv) * 100) / 100).toBe(99.9);
  });
});

describe("conversionDelMes", () => {
  const desde = "2026-09-01T05:00:00Z";
  const hasta = "2026-10-01T05:00:00Z";
  it("cuenta solo las creadas en el mes, sin anuladas", () => {
    const lista = [
      { estado: "convertida" as const, created_at: "2026-09-10T00:00:00Z" },
      { estado: "vigente" as const, created_at: "2026-09-11T00:00:00+00:00" },
      { estado: "anulada" as const, created_at: "2026-09-12T00:00:00Z" },
      { estado: "convertida" as const, created_at: "2026-08-30T00:00:00Z" }, // otro mes
    ];
    expect(conversionDelMes(lista, desde, hasta)).toEqual({ convertidas: 1, creadas: 2, porcentaje: 50 });
  });
  it("sin proformas no inventa un porcentaje", () => {
    expect(conversionDelMes([], desde, hasta).porcentaje).toBeNull();
  });
});

describe("textoWhatsAppDeLaProforma", () => {
  it("saluda por nombre, dice el total y hasta cuándo vale (día de Lima)", () => {
    const texto = textoWhatsAppDeLaProforma({ cliente_nombre: "Ana", total: 150, vence_at: "2026-09-26T03:00:00Z" });
    expect(texto).toContain("Hola Ana");
    expect(texto).toContain(soles(150));
    expect(texto).toContain("25 de setiembre"); // es-PE escribe «setiembre», como en Perú
  });
  it("sin nombre ni vencimiento, igual se entiende", () => {
    expect(textoWhatsAppDeLaProforma({ cliente_nombre: null, total: 10, vence_at: null })).toBe(`Hola, esta es tu proforma de CAYLA por ${soles(10)}.`);
  });
});
