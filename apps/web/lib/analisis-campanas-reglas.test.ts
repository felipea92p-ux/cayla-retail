import { describe, expect, it } from "vitest";
import type { CampanaPlan } from "./plan-compra-reglas";
import { campanaDelRitmo, horizonteDeCompra, type LecturaCampanas } from "./analisis-campanas-reglas";

const HOY = "2026-10-17";

const plan = (nombre: string, desde: string, hasta: string, p: Partial<CampanaPlan> = {}): CampanaPlan => ({
  id: `id-${nombre}`,
  nombre,
  desde,
  hasta,
  etiquetaId: null,
  conPlan: 1,
  archivado: false,
  conTope: false,
  ...p,
});
const ok = (...planes: CampanaPlan[]): LecturaCampanas => ({ estado: "ok", campanas: { planes, etiquetas: [] } });

describe("la meta de hoy (D3): el fin de la próxima campaña del Plan", () => {
  it("con una campaña a 120 días o menos, mide hasta su FIN", () => {
    const h = horizonteDeCompra(HOY, ok(plan("Black Friday", "2026-11-20", "2026-11-30")));
    expect(h).toMatchObject({ modo: "campana", fecha: "2026-11-30", dias: 44, nombre: "Black Friday", nota: null });
  });

  it("límites: empieza en 120 días sirve; en 121, no (cae a plazo + 1 mes, no al 25-dic)", () => {
    // 17-oct + 120 días = 2027-02-14.
    expect(horizonteDeCompra(HOY, ok(plan("San Valentín", "2027-02-14", "2027-02-14"))).modo).toBe("campana");
    const lejos = horizonteDeCompra(HOY, ok(plan("San Valentín", "2027-02-15", "2027-02-15")));
    expect(lejos).toMatchObject({ modo: "plazo", dias: 60 });
    expect(lejos.nota).toContain("San Valentín");
  });

  it("si otra campaña se cruza con la próxima, mide hasta la que termina más tarde (Diciembre contiene a Navidad)", () => {
    const h = horizonteDeCompra("2026-12-05", ok(plan("Navidad", "2026-12-11", "2026-12-25"), plan("Diciembre 2026", "2026-12-01", "2026-12-31")));
    expect(h).toMatchObject({ modo: "campana", fecha: "2026-12-31", nombre: "Diciembre 2026" });
  });

  it("una campaña en curso que todavía llega a servirse cuenta: el 12-dic, Diciembre (hasta el 31) y no Navidad (el 25)", () => {
    const h = horizonteDeCompra("2026-12-12", ok(plan("Navidad", "2026-12-11", "2026-12-25"), plan("Diciembre 2026", "2026-12-01", "2026-12-31")));
    expect(h).toMatchObject({ modo: "campana", fecha: "2026-12-31", nombre: "Diciembre 2026", dias: 19 });
  });

  it("una campaña en curso que termina antes de lo más pronto que llega un pedido no sirve: lo que se pida hoy llega cuando ya terminó", () => {
    // Aniversario termina en 14 días: justo sirve; en 13, no (cae a la que viene).
    expect(horizonteDeCompra(HOY, ok(plan("Aniversario", "2026-10-01", "2026-10-31"))).modo).toBe("campana");
    expect(horizonteDeCompra(HOY, ok(plan("Aniversario", "2026-10-01", "2026-10-30"))).modo).toBe("navidad");
    const h = horizonteDeCompra(HOY, ok(plan("Aniversario", "2026-10-01", "2026-10-21"), plan("Black Friday", "2026-11-20", "2026-11-30")));
    expect(h).toMatchObject({ modo: "campana", nombre: "Black Friday" });
  });

  it("la meta nunca pasa de 120 días: un plan «Anual» no la estira, ni se elige", () => {
    const anual = plan("Anual", "2026-11-01", "2027-06-30");
    // Sola: empieza en 15 días pero termina a 256: no es una meta de compra.
    expect(horizonteDeCompra(HOY, ok(anual)).modo).toBe("plazo");
    // Cruzada con la próxima: no extiende su fin.
    expect(horizonteDeCompra(HOY, ok(plan("Black Friday", "2026-11-20", "2026-11-30"), anual))).toMatchObject({ modo: "campana", fecha: "2026-11-30" });
  });

  it("una campaña archivada o ya empezada no es la próxima", () => {
    const h = horizonteDeCompra(HOY, ok(plan("Vieja", "2026-11-01", "2026-11-05", { archivado: true }), plan("En curso", "2026-10-01", "2026-10-21")));
    expect(h.modo).toBe("navidad");
    expect(h.nota).toMatch(/No hay campañas por venir/);
  });

  it("sin módulo, o si el Plan no respondió: el respaldo, y lo dice (nunca una meta inventada en silencio)", () => {
    expect(horizonteDeCompra(HOY, { estado: "sin_modulo" }).nota).toMatch(/no ve el Plan/);
    expect(horizonteDeCompra(HOY, { estado: "fallo" }).nota).toMatch(/No se pudo leer/);
  });

  it("el calendario de Etiquetas no cuenta: solo las campañas que alguien armó en el Plan", () => {
    const lectura: LecturaCampanas = {
      estado: "ok",
      campanas: { planes: [], etiquetas: [{ id: "e1", nombre: "Día del Gato", desde: "2026-10-24", hasta: "2026-10-30", planId: null, planes: [] }] },
    };
    expect(horizonteDeCompra(HOY, lectura).modo).toBe("navidad");
  });
});

describe("la campaña en la que cae el ritmo", () => {
  it("la que cubre la mitad o más de la ventana", () => {
    const c = campanaDelRitmo(HOY, 17, ok(plan("Aniversario", "2026-10-02", "2026-10-21")));
    expect(c).toMatchObject({ nombre: "Aniversario", dias: 16, de: 17 });
  });

  it("menos de la mitad no cuenta; una ventana de 1 día tampoco; sin lectura, nada", () => {
    expect(campanaDelRitmo(HOY, 17, ok(plan("Corta", "2026-10-12", "2026-10-17")))).toBeNull();
    expect(campanaDelRitmo(HOY, 1, ok(plan("Hoy", "2026-10-17", "2026-10-17")))).toBeNull();
    expect(campanaDelRitmo(HOY, 17, { estado: "fallo" })).toBeNull();
  });

  it("con dos campañas, la que más días de la ventana cubre; una archivada no cuenta", () => {
    const c = campanaDelRitmo(HOY, 20, ok(plan("A", "2026-09-28", "2026-10-03"), plan("B", "2026-10-04", "2026-10-21"), plan("C", "2026-09-28", "2026-10-21", { archivado: true })));
    expect(c?.nombre).toBe("B");
  });
});
