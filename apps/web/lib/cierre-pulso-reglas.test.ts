import { describe, expect, it } from "vitest";
import type { Chequeo, PanelCierre, Unidad } from "./cierre-reglas";
import { pulsoCierre } from "./cierre-pulso-reglas";

const chequeo = (clave: string, ok: boolean, bloquea = true, datos: Record<string, unknown> = {}): Chequeo => ({ clave, ok, bloquea, datos });
const unidad = (p: Partial<Unidad> & Pick<Unidad, "clave" | "nombre" | "chequeos">): Unidad => ({
  alcance: "ubicacion", ubicacionId: p.clave, tipo: "tienda", estado: "abierto", cierre: null, ...p,
  // Siempre a partir de los chequeos dados (si `p` trae una unidad vieja, su conteo ya no vale).
  bloqueantes: p.chequeos.filter((c) => !c.ok && c.bloquea).length, avisos: p.chequeos.filter((c) => !c.ok && !c.bloquea).length,
});
const TRU = unidad({ clave: "tru", nombre: "Tienda Trujillo", chequeos: [chequeo("cajas", true), chequeo("egresos", false, true, { n: 2, monto: 180 }), chequeo("fijos", true), chequeo("cerrada_sin_prenda", false, false, { n: 3, monto: 300 }), chequeo("diario", true), chequeo("huella", false, false)] });
const AQP = unidad({ clave: "aqp", nombre: "Tienda Arequipa", chequeos: [chequeo("cajas", false, true, { abiertas: 1 }), chequeo("egresos", true), chequeo("fijos", true), chequeo("diario", true), chequeo("huella", false, false)] });
const EMP = unidad({ clave: "empresa", nombre: "De la empresa", alcance: "empresa", ubicacionId: null, tipo: "empresa", chequeos: [chequeo("fijos", true), chequeo("conciliacion", true), chequeo("diario", true), chequeo("huella", false, false)] });
const CONS = unidad({ clave: "consolidado", nombre: "CAYLA entera", alcance: "consolidado", ubicacionId: null, tipo: "consolidado", chequeos: [] });
const PANEL: PanelCierre = { mes: "2026-10", mesActual: "2026-11", unidades: [TRU, AQP, EMP], consolidado: CONS, historia: [], meses: [] };

describe("pulsoCierre", () => {
  it("cuenta lo que frena en las unidades abiertas, en orden (lo que frena primero), con su enlace", () => {
    const p = pulsoCierre(PANEL);
    expect(p.estado).toBe("faltan");
    expect(p.faltan).toBe(2);
    expect(p.frase).toBe("Te faltan 2 cosas para cerrar octubre.");
    // 4 + 4 + 3 chequeos que frenan (la huella no cuenta); pasaron 9 → 82 %.
    expect(p.total).toBe(11);
    expect(p.hechos).toBe(9);
    expect(p.pct).toBe(82);
    expect(p.listas).toEqual(["De la empresa"]);
    expect(p.explica).toContain("De la empresa ya se puede cerrar");
    expect(p.cosas.map((c) => [c.clave, c.bloquea])).toEqual([["tru:egresos", true], ["aqp:cajas", true], ["tru:cerrada_sin_prenda", false]]);
    expect(p.cosas[0]!.href).toBe("/finanzas/gastos?tab=egresos&ver=tru");
    expect(p.cosas[0]!.unidad).toBe("Tienda Trujillo");
  });

  it("sin nada que frene, se puede cerrar; lo que solo avisa queda en la lista", () => {
    const listo = { ...PANEL, unidades: [unidad({ ...TRU, chequeos: TRU.chequeos.map((c) => (c.clave === "egresos" ? { ...c, ok: true } : c)) }), unidad({ ...AQP, chequeos: AQP.chequeos.map((c) => (c.clave === "cajas" ? { ...c, ok: true } : c)) }), EMP] };
    const p = pulsoCierre(listo);
    expect(p.estado).toBe("faltan");
    expect(p.faltan).toBe(0);
    expect(p.pct).toBe(100);
    expect(p.frase).toBe("Puedes cerrar octubre.");
    expect(p.explica).toContain("Tienda Trujillo, Tienda Arequipa y De la empresa ya están listas");
    expect(p.cosas.map((c) => c.clave)).toEqual(["tru:cerrada_sin_prenda"]);
  });

  it("todas las unidades cerradas: queda CAYLA entera", () => {
    const cerradas = PANEL.unidades.map((u) => ({ ...u, estado: "cerrado" as const }));
    const p = pulsoCierre({ ...PANEL, unidades: cerradas });
    expect(p.estado).toBe("listo");
    expect(p.frase).toBe("Puedes cerrar octubre de CAYLA entera.");
    expect(p.cosas).toEqual([]);
  });

  it("el mes cerrado lo dice", () => {
    const p = pulsoCierre({ ...PANEL, unidades: PANEL.unidades.map((u) => ({ ...u, estado: "cerrado" as const })), consolidado: { ...CONS, estado: "cerrado" } });
    expect(p.estado).toBe("cerrado");
    expect(p.frase).toBe("Octubre ya está cerrado.");
    expect(p.pct).toBe(100);
  });

  it("una sola cosa, en singular", () => {
    const p = pulsoCierre({ ...PANEL, unidades: [TRU, EMP] });
    expect(p.frase).toBe("Te falta 1 cosa para cerrar octubre.");
  });
});

describe("pulsoCierre con los pendientes por sede (envíos, conteos, sobrantes, facturas)", () => {
  const con = (bloquea: boolean) =>
    unidad({
      clave: "lim", nombre: "Tienda Lima",
      chequeos: [
        chequeo("cajas", true), chequeo("egresos", true),
        chequeo("envios_con_diferencia", false, bloquea, { n: 2, unidades: 9, monto: 180 }),
        chequeo("conteos_abiertos", true, bloquea, { n: 0 }), chequeo("sobrantes_traslado", true, bloquea, { n: 0 }), chequeo("facturas_sin_recibir", true, bloquea, { n: 0 }),
        chequeo("diario", true),
      ],
    });
  it("en octubre avisan: no cuentan como lo que falta, pero salen en la lista con la sede en la frase y su enlace", () => {
    const p = pulsoCierre({ ...PANEL, unidades: [con(false)] });
    expect(p.faltan).toBe(0);
    expect(p.frase).toBe("Puedes cerrar octubre.");
    expect(p.total).toBe(3); // cajas, egresos y diario: los cuatro nuevos todavía no frenan
    expect(p.cosas.map((c) => [c.clave, c.bloquea, c.href])).toEqual([["lim:envios_con_diferencia", false, "/compras/proveedores"]]);
    expect(p.cosas[0]!.detalle).toMatch(/^2 envíos recibidos en Lima tienen faltantes sin resolver .* Puedes cerrar octubre igual/);
  });
  it("desde noviembre frenan: el que falla cuenta como pendiente y los que pasan suman a lo hecho", () => {
    const p = pulsoCierre({ ...PANEL, mes: "2026-11", unidades: [con(true)] });
    expect(p.faltan).toBe(1);
    expect(p.total).toBe(7); // los 3 de siempre + los 4 nuevos
    expect(p.hechos).toBe(6);
    expect(p.frase).toBe("Te falta 1 cosa para cerrar noviembre.");
    expect(p.cosas[0]).toMatchObject({ clave: "lim:envios_con_diferencia", bloquea: true, href: "/compras/proveedores" });
    expect(p.cosas[0]!.detalle).toMatch(/Resuélvelo en «Nos debe», en la ficha del proveedor para poder cerrar noviembre$/);
  });
});
