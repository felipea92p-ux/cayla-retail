import { describe, expect, it } from "vitest";
import { soles } from "./compras-reglas";
import { avisosDePlanilla, estadoTramo, leerTramo, queSePago, type TramoPlanilla } from "./planilla-salidas-reglas";

const P = "00000000-0000-4000-8000-0000000000a1";
const tramo = (o: Partial<TramoPlanilla>): TramoPlanilla => ({
  periodoId: P,
  fechaIni: "2026-09-28",
  fechaFin: "2026-10-28",
  grupo: "planilla",
  pagadoEl: "2026-10-30",
  banco: "bcp",
  personas: 13,
  neto: 12745.16,
  movimientoId: null,
  registrado: null,
  cuentaId: null,
  cuentaNombre: null,
  fechaRegistrada: null,
  ...o,
});

describe("leerTramo", () => {
  it("lee la fila de la base y un banco desconocido cae a «sin banco»", () => {
    const t = leerTramo({
      periodo_id: P,
      fecha_ini: "2026-09-28",
      fecha_fin: "2026-10-28",
      grupo: "rxh",
      pagado_el: "2026-10-30",
      banco: "bbva",
      personas: 2,
      neto: "1340.68",
      movimiento_id: null,
      registrado: null,
      cuenta_id: null,
      cuenta_nombre: null,
      fecha_registrada: null,
    });
    expect(t.banco).toBe("sin_banco");
    expect(t.neto).toBe(1340.68);
    expect(t.registrado).toBeNull();
  });
});

describe("estadoTramo", () => {
  it("sin movimiento falta; con el mismo monto al céntimo está; con otro, no cuadra", () => {
    expect(estadoTramo({ movimientoId: null, registrado: null, neto: 100 })).toBe("por_registrar");
    expect(estadoTramo({ movimientoId: "m", registrado: 100.0, neto: 100 })).toBe("registrado");
    expect(estadoTramo({ movimientoId: "m", registrado: 0.1 + 0.2, neto: 0.3 })).toBe("registrado");
    expect(estadoTramo({ movimientoId: "m", registrado: 99.99, neto: 100 })).toBe("otro_monto");
  });
});

describe("queSePago", () => {
  it("nombra cada grupo de Dynamic y uno nuevo tal cual", () => {
    expect(queSePago("planilla")).toBe("la planilla");
    expect(queSePago("practicante")).toBe("el pago a los practicantes");
    expect(queSePago("bonos")).toBe("el pago del grupo «bonos»");
  });
});

describe("avisosDePlanilla", () => {
  it("un aviso por grupo, con una línea por banco en orden BCP, Interbank, sin banco", () => {
    const [a, ...resto] = avisosDePlanilla([
      tramo({ banco: "sin_banco", personas: 1, neto: 300 }),
      tramo({ banco: "interbank", personas: 5, neto: 5512.96 }),
      tramo({ banco: "bcp" }),
    ]);
    expect(resto).toEqual([]);
    expect(a.titulo).toBe("Falta registrar de qué banco salió la planilla del 28/09 al 28/10");
    expect(a.detalle).toContain("Pagado en Dynamic el 30/10");
    expect(a.tramos.map((t) => t.banco)).toEqual(["bcp", "interbank", "sin_banco"]);
    expect(a.tramos[0].texto).toBe("BCP · 13 personas · S/ 12,745.16 — falta registrar".replace("12,745.16", (12745.16).toLocaleString("es-PE", { minimumFractionDigits: 2 })));
    expect(a.tramos[2].texto).toContain("1 persona ·");
    expect(a.total).toBe(18558.12);
  });

  it("separa los grupos y los períodos; dice lo registrado y lo que no cuadra", () => {
    const avisos = avisosDePlanilla([
      tramo({ movimientoId: "m1", registrado: 12745.16, cuentaNombre: "BCP Empresa", fechaRegistrada: "2026-10-30" }),
      tramo({ banco: "interbank", personas: 5, neto: 5512.96, movimientoId: "m2", registrado: 5500, cuentaNombre: "Interbank Empresas", fechaRegistrada: "2026-10-30" }),
      tramo({ grupo: "practicante", personas: 4, neto: 3176.56 }),
    ]);
    expect(avisos.map((a) => a.grupo)).toEqual(["planilla", "practicante"]);
    const [planilla, practicantes] = avisos;
    // Nada falta en la planilla, pero Interbank no cuadra: el título lo dice.
    expect(planilla.titulo).toBe("Lo que registraste de la planilla del 28/09 al 28/10 no cuadra con Dynamic");
    expect(planilla.tramos[0].texto).toContain("registrado desde BCP Empresa el 30/10");
    expect(planilla.tramos[1].estado).toBe("otro_monto");
    expect(planilla.tramos[1].texto).toContain("desde Interbank Empresas: no cuadra");
    expect(practicantes.titulo).toBe("Falta registrar de qué banco salió el pago a los practicantes del 28/09 al 28/10");
  });

  it("el título del grupo que no cuadra contrae «de el» en «del»", () => {
    const [a] = avisosDePlanilla([tramo({ grupo: "rxh", movimientoId: "m", registrado: 1, cuentaNombre: "BCP Empresa" })]);
    expect(a.titulo).toBe("Lo que registraste del pago de los recibos por honorarios del 28/09 al 28/10 no cuadra con Dynamic");
  });

  it("sin tramos, sin avisos", () => {
    expect(avisosDePlanilla([])).toEqual([]);
  });
});
