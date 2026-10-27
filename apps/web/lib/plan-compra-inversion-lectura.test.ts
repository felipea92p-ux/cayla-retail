import { describe, expect, it } from "vitest";
import { leerInversion, repartoDeLaCompra } from "./inversion-mercaderia-reglas";
import {
  DIAS_HACIA_ADELANTE,
  FALLA_DEL_PLAN,
  MAX_CAMPANAS,
  campanasParaFinanzas,
  leerInversionDeLasCampanas,
  type ClienteDeLectura,
} from "./plan-compra-inversion-lectura";
import { RPC_PAGADO, RPC_PAGOS } from "./plan-compra-inversion";
import { RPC_PEDIDO } from "./plan-compra-pedido";
import { RPC_PLAN, RPC_PLANES, type CampanaPlan } from "./plan-compra-reglas";

// La política de la lectura que alimenta a Finanzas ▸ Resumen (ADR-0527), probada con una base de mentira: cuáles campañas se leen, qué se arma y, sobre todo, qué se dice cuando algo se cae.
// Hoy es el lunes 26 de octubre de 2026; Navidad va del 11 al 25 de diciembre y con 14 días para llegar el último día para pedir es el 27 de noviembre.
const HOY = "2026-10-26";

const campana = (id: string, nombre: string, desde: string, hasta: string, extra: Partial<CampanaPlan> = {}): CampanaPlan => ({ id, nombre, desde, hasta, etiquetaId: null, conPlan: 2, archivado: false, conTope: false, ...extra });

const planDe = (id: string, nombre: string, desde: string, hasta: string) => ({
  plan: { id, nombre, desde, hasta, tope_inversion: 12000, archivado: false },
  hoy: HOY,
  planes: [],
  categorias: [
    { id: "blusas", nombre: "Blusas", tallas: [] },
    { id: "faldas", nombre: "Faldas", tallas: [] },
  ],
  // Blusas: cuantil 1 (sobrar no cuesta) → compra hasta el bueno (200), con 10 en stock = 190 × S/ 20. Faldas: los tres escenarios iguales (100), sin stock, × S/ 40 = S/ 4000.
  lineas: [
    { categoria_id: "blusas", flojo: 100, normal: 150, bueno: 200, precio: 100, costo: 20, recupero_pct: 50, curva: {} },
    { categoria_id: "faldas", flojo: 100, normal: 100, bueno: 100, precio: 100, costo: 40, recupero_pct: 30, curva: {} },
  ],
  stock: [{ categoria_id: "blusas", unidades: 10 }],
  curvas: [],
  vendido: [],
});

type Respuesta = { data: unknown; error: { code?: string; message: string } | null };
const ok = (data: unknown): Respuesta => ({ data, error: null });
const err = (message: string, code?: string): Respuesta => ({ data: null, error: { message, code } });

const pagosOk = (planId: string, visibilidad = "todo") =>
  ok({
    soportado: true,
    plan: { id: planId, visibilidad_finanzas: visibilidad, por: null, en: null },
    guardado: { version: 1, pagos: [{ fecha: "2026-11-23", pct: 100 }], tandas: null, igv_incluido: [], por: "Felipe", en: "2026-10-26T15:00:00Z" },
  });

/** Una base de mentira: responde por nombre de función; lo que no se pisa responde como una base sana con Navidad. */
function base(pisar: Record<string, (args: Record<string, unknown>) => Respuesta | Promise<Respuesta>> = {}): ClienteDeLectura & { llamadas: string[] } {
  const llamadas: string[] = [];
  const sana: Record<string, (args: Record<string, unknown>) => Respuesta> = {
    [RPC_PLANES]: () => ok({ planes: [{ id: "navidad", nombre: "Navidad 2026", desde: "2026-12-11", hasta: "2026-12-25", con_plan: 2, archivado: false, con_tope: false }], etiquetas: [] }),
    [RPC_PAGOS]: (a) => pagosOk(String(a.p_plan_id)),
    [RPC_PLAN]: (a) => ok(planDe(String(a.p_plan_id), "Navidad 2026", "2026-12-11", "2026-12-25")),
    [RPC_PEDIDO]: () => ok({ ordenes: [], categorias: [] }),
    fn_plan_compra_plazo: () => ok({ soportado: true, dias_para_llegar: 14, por: null, en: null }),
    fn_plan_compra_versiones: () => ok({ soportado: true, precio_de_la_plata: 0, huella_actual: "x", tope: 12000, versiones: [] }),
    fn_plan_compra_descuento: () => ok({ con_descuento: true, lineas: [], sugeridos: [], campana: null }),
    [RPC_PAGADO]: () => ok({ soportado: true, comprobantes: 0, facturado_sin_igv: 0, pagado_sin_igv: 0, pagado_total: 0 }),
  };
  return {
    llamadas,
    rpc: async (nombre, args = {}) => {
      llamadas.push(nombre);
      const f = pisar[nombre] ?? sana[nombre];
      if (!f) throw new Error(`la prueba no esperaba ${nombre}`);
      return f(args);
    },
  };
}

describe("cuáles campañas se leen", () => {
  const todas = [
    campana("a", "Aniversario", "2026-10-01", "2026-10-14"), // terminó
    campana("b", "Halloween", "2026-10-17", "2026-10-31"), // en curso
    campana("c", "Black Friday", "2026-11-09", "2026-11-30"),
    campana("d", "Navidad", "2026-12-11", "2026-12-25"),
    campana("e", "Demo", "2026-12-11", "2026-12-25", { archivado: true }), // archivada
    campana("f", "Día de la Tierra", "2027-04-08", "2027-04-22"), // más de 120 días
    campana("g", "Sin plan", "2026-11-15", "2026-11-20", { conPlan: 0 }), // nada planeado
  ];
  it("sin archivar, con algo planeado, sin terminar y que empieza en los próximos 120 días (o ya empezó), de la más cercana en adelante", () => {
    expect(campanasParaFinanzas(todas, HOY).map((c) => c.id)).toEqual(["b", "c", "d"]);
  });
  it("las 4 más cercanas como máximo", () => {
    const muchas = Array.from({ length: 6 }, (_, i) => campana(`x${i}`, `Campaña ${i}`, `2026-11-${String(10 + i).padStart(2, "0")}`, "2026-12-30"));
    expect(campanasParaFinanzas(muchas, HOY)).toHaveLength(MAX_CAMPANAS);
    expect(campanasParaFinanzas(muchas, HOY).map((c) => c.id)).toEqual(["x0", "x1", "x2", "x3"]);
  });
  it("el límite de 120 días es inclusivo y el día siguiente ya no entra", () => {
    // 2026-10-26 + 120 días = 2027-02-23.
    expect(DIAS_HACIA_ADELANTE).toBe(120);
    expect(campanasParaFinanzas([campana("l", "Justo", "2027-02-23", "2027-03-05")], HOY)).toHaveLength(1);
    expect(campanasParaFinanzas([campana("l", "Pasado", "2027-02-24", "2027-03-05")], HOY)).toHaveLength(0);
  });
  it("una campaña que termina hoy todavía se mira; una que terminó ayer, no", () => {
    expect(campanasParaFinanzas([campana("h", "Hoy", "2026-10-20", HOY)], HOY)).toHaveLength(1);
    expect(campanasParaFinanzas([campana("h", "Ayer", "2026-10-10", "2026-10-25")], HOY)).toHaveLength(0);
  });
});

describe("cuando todo responde", () => {
  it("arma la campaña con lo que dice el Plan: lo que falta pedir, el IGV, el tope, la fecha límite, los pagos y que se ve", async () => {
    const r = await leerInversionDeLasCampanas(base(), HOY);
    expect(r.falla).toBeNull();
    expect(r.datos).toHaveLength(1);
    expect(r.datos![0]).toMatchObject({
      id: "navidad",
      nombre: "Navidad 2026",
      desde: "2026-12-11",
      hasta: "2026-12-25",
      plan_sin_igv: 7800, // 190 × 20 + 100 × 40
      pedido: 0,
      pagado: 0,
      tope: 12000,
      fecha_limite: "2026-11-27",
      visibilidad_finanzas: "todo",
      pagos: [{ fecha: "2026-11-23", pct: 100 }],
    });
    expect(r.datos![0]!.igv).toBeCloseTo(1404, 2);
  });
  it("pasa por la lectura de Finanzas con cada sol en una sola etapa", async () => {
    const r = await leerInversionDeLasCampanas(
      base({
        [RPC_PEDIDO]: () => ok({ ordenes: [{ id: "o1", numero: 7, emision: "2026-10-20", entrega: null, unidades: 50, por_llegar: 50, total: 1000 }], categorias: [{ c: "blusas", unidades: 50, por_llegar: 50, soles: 1000, ordenes: [7] }] }),
        [RPC_PAGADO]: () => ok({ soportado: true, comprobantes: 1, facturado_sin_igv: 1000, pagado_sin_igv: 400, pagado_total: 472 }),
      }),
      HOY,
    );
    const [c] = leerInversion(r.datos!);
    // Lo ya pedido (50 prendas de blusas por S/ 1000) baja lo que falta pedir de blusas (140 × 20 = 2800) y el plan sigue valiendo lo mismo: 1000 + 2800 + 4000.
    expect(c!.planSinIgv).toBe(7800);
    expect(c!.pedido).toBe(1000);
    expect(repartoDeLaCompra(c!)).toMatchObject({ pagado: 400, pedidoSinPagar: 600, faltaPedir: 6800, pasaDelPlan: 0 });
  });
  it("«solo en Escenarios» y «no mostrarla» no se leen: ni siquiera se pide el plan de esa campaña", async () => {
    for (const v of ["escenarios", "nada"]) {
      const b = base({ [RPC_PAGOS]: (a) => pagosOk(String(a.p_plan_id), v) });
      const r = await leerInversionDeLasCampanas(b, HOY);
      expect(r).toEqual({ datos: [], falla: null });
      expect(b.llamadas).not.toContain(RPC_PLAN);
    }
  });
  it("sin campañas que valgan la pena, lista vacía (se pudo leer y no hay qué mostrar), no null", async () => {
    const b = base({ [RPC_PLANES]: () => ok({ planes: [], etiquetas: [] }) });
    expect(await leerInversionDeLasCampanas(b, HOY)).toEqual({ datos: [], falla: null });
  });
  it("una base sin la función del descuento (la web se publicó antes) no es una falla: el plan se calcula a precio de lista", async () => {
    const r = await leerInversionDeLasCampanas(base({ fn_plan_compra_descuento: () => err("Could not find the function retail.fn_plan_compra_descuento", "PGRST202") }), HOY);
    expect(r.falla).toBeNull();
    expect(r.datos).toHaveLength(1);
  });
});

describe("cuando algo no se ofrece o se cae", () => {
  it("sin el módulo «Plan de campaña» (42501) no se ofrece nada y no se dice nada: no es una falla", async () => {
    const r = await leerInversionDeLasCampanas(base({ [RPC_PLANES]: () => err("Ver el plan de campaña necesita el módulo", "42501") }), HOY);
    expect(r).toEqual({ datos: null, falla: null });
  });
  it("una base que todavía no tiene la lista de pagos (la web se publicó antes que la migración) no ofrece nada y no se queja", async () => {
    const r = await leerInversionDeLasCampanas(base({ [RPC_PAGOS]: () => err("Could not find the function retail.fn_plan_compra_pagos", "PGRST202") }), HOY);
    expect(r).toEqual({ datos: null, falla: null });
  });
  it("si la base no responde por las campañas, lo dice y no inventa un cero", async () => {
    const r = await leerInversionDeLasCampanas(base({ [RPC_PLANES]: () => err("canceling statement due to statement timeout", "57014") }), HOY);
    expect(r).toEqual({ datos: null, falla: FALLA_DEL_PLAN });
  });
  it("una lectura que se cae del todo (se corta la red) no tumba el Resumen: es una falla", async () => {
    const lanza = base({
      [RPC_PLANES]: () => {
        throw new Error("fetch failed");
      },
    });
    expect(await leerInversionDeLasCampanas(lanza, HOY)).toEqual({ datos: null, falla: FALLA_DEL_PLAN });
    const lanzaEnLaCampana = base({
      [RPC_PLAN]: () => {
        throw new Error("fetch failed");
      },
    });
    expect(await leerInversionDeLasCampanas(lanzaEnLaCampana, HOY)).toEqual({ datos: null, falla: FALLA_DEL_PLAN });
  });
  it("si falla el plan de UNA campaña, esa no se dibuja a medias, las demás sí, y se avisa", async () => {
    const dos = {
      [RPC_PLANES]: () =>
        ok({
          planes: [
            { id: "bf", nombre: "Black Friday", desde: "2026-11-09", hasta: "2026-11-30", con_plan: 2, archivado: false, con_tope: false },
            { id: "navidad", nombre: "Navidad 2026", desde: "2026-12-11", hasta: "2026-12-25", con_plan: 2, archivado: false, con_tope: false },
          ],
          etiquetas: [],
        }),
      [RPC_PLAN]: (a: Record<string, unknown>) => (a.p_plan_id === "bf" ? err("boom", "XX000") : ok(planDe("navidad", "Navidad 2026", "2026-12-11", "2026-12-25"))),
    };
    const r = await leerInversionDeLasCampanas(base(dos), HOY);
    expect(r.falla).toBe(FALLA_DEL_PLAN);
    expect(r.datos).toHaveLength(1);
    expect(r.datos![0]!.id).toBe("navidad");
  });
  it("si lo pagado no se pudo leer, la campaña no se dibuja con un 0 pagado: falla", async () => {
    for (const mala of [() => err("boom", "XX000"), () => ok(null), () => ok({ comprobantes: 2 })]) {
      const r = await leerInversionDeLasCampanas(base({ [RPC_PAGADO]: mala }), HOY);
      expect(r.datos).toBeNull();
      expect(r.falla).toBe(FALLA_DEL_PLAN);
    }
  });
  it("si lo pedido en órdenes no se pudo leer, tampoco: sin él «falta pedir» se contaría de más", async () => {
    const r = await leerInversionDeLasCampanas(base({ [RPC_PEDIDO]: () => err("boom", "XX000") }), HOY);
    expect(r).toEqual({ datos: null, falla: FALLA_DEL_PLAN });
  });
  it("un fallo real del plazo, del tope o del descuento cambia los números y no se disimula; que la base no los tenga, sí es lo de siempre", async () => {
    for (const nombre of ["fn_plan_compra_plazo", "fn_plan_compra_versiones", "fn_plan_compra_descuento"]) {
      const fallo = await leerInversionDeLasCampanas(base({ [nombre]: () => err("boom", "XX000") }), HOY);
      expect(fallo).toEqual({ datos: null, falla: FALLA_DEL_PLAN });
      const sinFuncion = await leerInversionDeLasCampanas(base({ [nombre]: () => err("Could not find the function", "PGRST202") }), HOY);
      expect(sinFuncion.falla).toBeNull();
      expect(sinFuncion.datos).toHaveLength(1);
    }
  });
  it("una respuesta del plan que no se entiende es una falla, no un plan vacío", async () => {
    const r = await leerInversionDeLasCampanas(base({ [RPC_PLAN]: () => ok({ algo: "raro" }) }), HOY);
    expect(r).toEqual({ datos: null, falla: FALLA_DEL_PLAN });
  });
});
