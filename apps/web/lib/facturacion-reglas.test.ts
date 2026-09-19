import { describe, it, expect } from "vitest";
import {
  conteosDePestanas,
  esMesValido,
  esMismoMes,
  hrefPestana,
  mesAnterior,
  mesDeParametro,
  mesSiguiente,
  paramDeMes,
  PESTANAS,
  pestanaDeRuta,
  resumenPorEnviar,
  resumenProformas,
  tiendasOperativas,
  ubicacionActualDe,
} from "./facturacion-reglas";
import type { EstadoComprobante } from "./comprobantes-reglas";
import type { ProformaFila } from "./proformas-reglas";

const SEPTIEMBRE_2026 = { anio: 2026, mes: 9 };

describe("mes de la URL", () => {
  it("lee un mes válido, con o sin cero a la izquierda", () => {
    expect(mesDeParametro("2026-08", SEPTIEMBRE_2026)).toEqual({ anio: 2026, mes: 8 });
    expect(mesDeParametro("2026-8", SEPTIEMBRE_2026)).toEqual({ anio: 2026, mes: 8 });
    expect(mesDeParametro("2026-12", SEPTIEMBRE_2026)).toEqual({ anio: 2026, mes: 12 });
  });

  it("un valor inválido cae al mes actual en vez de enrollarse al año siguiente", () => {
    for (const malo of ["2026-13", "2026-00", "2026-0", "hola", "", "2026", "2026-9-1", undefined, null]) {
      expect(mesDeParametro(malo, SEPTIEMBRE_2026)).toEqual(SEPTIEMBRE_2026);
    }
  });

  it("esMesValido es la misma puerta", () => {
    expect(esMesValido("2026-9")).toBe(true);
    expect(esMesValido("2026-13")).toBe(false);
    expect(esMesValido(null)).toBe(false);
  });

  it("escribe el mes sin cero a la izquierda, como los enlaces que ya existían", () => {
    expect(paramDeMes({ anio: 2026, mes: 9 })).toBe("2026-9");
  });

  it("mes anterior y siguiente cruzan el cambio de año", () => {
    expect(mesAnterior({ anio: 2026, mes: 1 })).toEqual({ anio: 2025, mes: 12 });
    expect(mesAnterior({ anio: 2026, mes: 9 })).toEqual({ anio: 2026, mes: 8 });
    expect(mesSiguiente({ anio: 2026, mes: 12 })).toEqual({ anio: 2027, mes: 1 });
    expect(mesSiguiente({ anio: 2026, mes: 9 })).toEqual({ anio: 2026, mes: 10 });
  });

  it("compara meses", () => {
    expect(esMismoMes({ anio: 2026, mes: 9 }, SEPTIEMBRE_2026)).toBe(true);
    expect(esMismoMes({ anio: 2025, mes: 9 }, SEPTIEMBRE_2026)).toBe(false);
  });
});

describe("pestañas", () => {
  const por = (clave: string) => PESTANAS.find((p) => p.clave === clave)!;

  it("son cuatro, en el orden en que se dibujan", () => {
    expect(PESTANAS.map((p) => p.clave)).toEqual(["resumen", "proformas", "comprobantes", "descuentos"]);
  });

  it("cada ruta cae en su pestaña, con o sin barra final", () => {
    expect(pestanaDeRuta("/vender/facturacion")).toBe("resumen");
    expect(pestanaDeRuta("/vender/facturacion/")).toBe("resumen");
    expect(pestanaDeRuta("/vender/facturacion/proformas")).toBe("proformas");
    expect(pestanaDeRuta("/vender/facturacion/comprobantes/")).toBe("comprobantes");
    expect(pestanaDeRuta("/vender/facturacion/descuentos")).toBe("descuentos");
  });

  it("una ruta desconocida o que solo comparte el prefijo cae en Resumen", () => {
    expect(pestanaDeRuta("/vender/facturacion/otra")).toBe("resumen");
    expect(pestanaDeRuta("/vender/facturacion/proformas-viejas")).toBe("resumen");
  });

  it("solo Proformas y Comprobantes conservan el mes", () => {
    expect(hrefPestana(por("proformas"), "2026-8")).toBe("/vender/facturacion/proformas?m=2026-8");
    expect(hrefPestana(por("comprobantes"), "2026-8")).toBe("/vender/facturacion/comprobantes?m=2026-8");
    expect(hrefPestana(por("resumen"), "2026-8")).toBe("/vender/facturacion");
    expect(hrefPestana(por("descuentos"), "2026-8")).toBe("/vender/facturacion/descuentos");
  });

  it("sin mes, o con uno inválido, el enlace no lo arrastra", () => {
    expect(hrefPestana(por("proformas"), null)).toBe("/vender/facturacion/proformas");
    expect(hrefPestana(por("comprobantes"), "2026-13")).toBe("/vender/facturacion/comprobantes");
  });
});

describe("resumenPorEnviar — la cola de SUNAT", () => {
  const fila = (estado: EstadoComprobante, created_at: string) => ({ estado, created_at });

  it("cuenta pendiente y rechazado; enviado, aceptado, anulado y no_emitido no", () => {
    const r = resumenPorEnviar([
      fila("pendiente", "2026-09-19T10:00:00Z"),
      fila("pendiente", "2026-09-18T08:00:00Z"),
      fila("rechazado", "2026-09-17T09:30:00Z"),
      fila("enviado", "2026-09-01T00:00:00Z"),
      fila("aceptado", "2026-08-01T00:00:00Z"),
      fila("anulado", "2026-08-02T00:00:00Z"),
      fila("no_emitido", "2026-08-03T00:00:00Z"),
    ]);
    expect(r).toEqual({ porEnviar: 3, rechazados: 1, masAntiguoAt: "2026-09-17T09:30:00Z" });
  });

  it("el más antiguo sale de la cola, no de un comprobante ya cerrado más viejo", () => {
    const r = resumenPorEnviar([fila("aceptado", "2020-01-01T00:00:00Z"), fila("pendiente", "2026-09-19T10:00:00Z")]);
    expect(r.masAntiguoAt).toBe("2026-09-19T10:00:00Z");
  });

  it("compara instantes reales aunque las fechas vengan con distinto huso", () => {
    // 10:00-05:00 son las 15:00Z; 14:00Z es más antiguo. Comparado como texto ganaría el primero.
    const r = resumenPorEnviar([fila("pendiente", "2026-09-19T10:00:00-05:00"), fila("pendiente", "2026-09-19T14:00:00Z")]);
    expect(r.masAntiguoAt).toBe("2026-09-19T14:00:00Z");
  });

  it("sin nada en la cola: ceros y sin fecha", () => {
    expect(resumenPorEnviar([])).toEqual({ porEnviar: 0, rechazados: 0, masAntiguoAt: null });
  });
});

describe("resumenProformas — lo que sigue valiendo", () => {
  const AHORA = Date.parse("2026-09-19T15:00:00Z");
  const en = (horas: number) => new Date(AHORA + horas * 3600 * 1000).toISOString();
  const p = (sobre: Partial<ProformaFila>): ProformaFila => ({
    id: "x",
    ubicacion_id: "u",
    cliente_nombre: null,
    cliente_num_doc: null,
    total: 100,
    estado: "vigente",
    comprobante_id: null,
    created_at: "2026-09-10T15:00:00Z",
    vence_at: null,
    ...sobre,
  });

  it("separa las que valen, las que están por vencer y las que ya vencieron", () => {
    const r = resumenProformas(
      [
        p({ total: 100, vence_at: en(24) }), // vale y está por vencer
        p({ total: 200, vence_at: en(24 * 10) }), // vale
        p({ total: 30, vence_at: null }), // vale, sin fecha
        p({ total: 50, vence_at: en(-24) }), // vigente en la base, pero ya vencida
        p({ total: 999, estado: "convertida", vence_at: en(-1) }), // ya no cuenta
        p({ total: 999, estado: "anulada", vence_at: en(24) }), // ya no cuenta
      ],
      AHORA
    );
    expect(r).toEqual({ vigentes: 3, monto: 330, porVencer: 1, vencidas: 1 });
  });

  it("el monto no arrastra el error de coma flotante", () => {
    expect(resumenProformas([p({ total: 0.1 }), p({ total: 0.2 })], AHORA).monto).toBe(0.3);
  });

  it("sin proformas: todo en cero", () => {
    expect(resumenProformas([], AHORA)).toEqual({ vigentes: 0, monto: 0, porVencer: 0, vencidas: 0 });
  });
});

describe("conteosDePestanas", () => {
  const cola = (porEnviar: number, rechazados: number) => ({ porEnviar, rechazados, masAntiguoAt: null });
  const proformas = (vigentes: number) => ({ vigentes, monto: 0, porVencer: 0, vencidas: 0 });

  it("sin datos (la consulta falló) o en cero no dibuja ningún contador", () => {
    expect(conteosDePestanas(null, null)).toEqual({});
    expect(conteosDePestanas(cola(0, 0), proformas(0))).toEqual({});
  });

  it("Comprobantes en ámbar cuando hay algo por enviar", () => {
    expect(conteosDePestanas(cola(3, 0), null).comprobantes).toEqual({ valor: 3, tono: "ambar", texto: "por enviar a SUNAT" });
  });

  it("Comprobantes en rojo si SUNAT rechazó alguno", () => {
    expect(conteosDePestanas(cola(3, 1), null).comprobantes).toMatchObject({ valor: 3, tono: "rojo" });
  });

  it("Proformas en neutro, contando solo las vigentes que aún valen", () => {
    expect(conteosDePestanas(null, proformas(2)).proformas).toEqual({ valor: 2, tono: "neutro", texto: "vigentes" });
  });

  it("cada contador falla por separado", () => {
    expect(conteosDePestanas(null, proformas(2))).not.toHaveProperty("comprobantes");
    expect(conteosDePestanas(cola(1, 0), null)).not.toHaveProperty("proformas");
  });
});

describe("tiendas", () => {
  const ubicaciones = [
    { id: "t1", tipo: "tienda" },
    { id: "a1", tipo: "almacen" },
    { id: "k1", tipo: "taller" },
    { id: "t2", tipo: "tienda" },
  ];

  it("solo las tiendas emiten: ni un almacén ni el Taller tienen serie", () => {
    expect(tiendasOperativas(ubicaciones).map((u) => u.id)).toEqual(["t1", "t2"]);
  });

  it("preselecciona la tienda de la persona; si no es una tienda operativa, la primera; sin tiendas, vacío", () => {
    const tiendas = tiendasOperativas(ubicaciones);
    expect(ubicacionActualDe(tiendas, "t2")).toBe("t2");
    expect(ubicacionActualDe(tiendas, "a1")).toBe("t1");
    expect(ubicacionActualDe([], "t2")).toBe("");
  });
});
