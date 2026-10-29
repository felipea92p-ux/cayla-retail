import { describe, expect, it } from "vitest";
import { soles } from "./compras-reglas";
import {
  avisosDePlanilla,
  camposDeSalidas,
  cuentaPropuesta,
  estadoTramo,
  filasDeSalidas,
  leerCuentaPlanilla,
  leerSalidaSuelta,
  leerTramo,
  notaAntesDelSaldo,
  planillaParaElInicio,
  queSePago,
  textoRegistrar,
  textoSuelta,
  validarSalidas,
  type CuentaPlanilla,
  type FilaSalida,
  type TramoPlanilla,
} from "./planilla-salidas-reglas";

const P = "00000000-0000-4000-8000-0000000000a1";
const HOY = "2026-10-30";
const tramo = (o: Partial<TramoPlanilla>): TramoPlanilla => ({
  periodoId: P,
  fechaIni: "2026-09-28",
  fechaFin: "2026-10-28",
  grupo: "planilla",
  pagadoEl: "2026-10-29",
  banco: "bcp",
  personas: 13,
  neto: 12745.16,
  movimientoId: null,
  registrado: null,
  netoAlRegistrar: null,
  cuentaId: null,
  cuentaNombre: null,
  fechaRegistrada: null,
  ...o,
});
const CUENTAS: CuentaPlanilla[] = [
  { banco: "bcp", cuentaId: "c1", cuentaNombre: "BCP Empresa" },
  { banco: "interbank", cuentaId: null, cuentaNombre: null },
];

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
      neto_al_registrar: null,
      cuenta_id: null,
      cuenta_nombre: null,
      fecha_registrada: null,
    });
    expect(t.banco).toBe("sin_banco");
    expect(t.neto).toBe(1340.68);
    expect(t.netoAlRegistrar).toBeNull();
  });
});

describe("estadoTramo", () => {
  it("sin salida falta; con salida está, aunque sea de otro monto; si Dynamic cambió después, lo dice", () => {
    expect(estadoTramo({ movimientoId: null, netoAlRegistrar: null, neto: 100 })).toBe("por_registrar");
    expect(estadoTramo({ movimientoId: "m", netoAlRegistrar: 100, neto: 100 })).toBe("registrado");
    expect(estadoTramo({ movimientoId: "m", netoAlRegistrar: 0.1 + 0.2, neto: 0.3 })).toBe("registrado");
    expect(estadoTramo({ movimientoId: "m", netoAlRegistrar: 100, neto: 110 })).toBe("cambio_en_dynamic");
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
    expect(a.detalle).toContain("Pagado en Dynamic el 29/10");
    expect(a.tramos.map((t) => t.banco)).toEqual(["bcp", "interbank", "sin_banco"]);
    expect(a.porRegistrar).toHaveLength(3);
    expect(a.tramos[0].texto).toBe(`BCP · 13 personas · ${soles(12745.16)} — falta registrar · elige su cuenta en Configuración`);
    expect(a.tramos[2].texto).toContain("1 persona ·");
    expect(a.total).toBe(18558.12);
  });

  it("con la cuenta de cada banco guardada, dice de dónde sale; quien no tiene banco la elige al registrar", () => {
    const [a] = avisosDePlanilla([tramo({}), tramo({ banco: "interbank", personas: 5, neto: 5512.96 }), tramo({ banco: "sin_banco", personas: 1, neto: 300 })], CUENTAS);
    expect(a.tramos[0].texto).toMatch(/— falta registrar · sale de BCP Empresa$/);
    expect(a.tramos[0].propuesta?.cuentaId).toBe("c1");
    expect(a.tramos[1].texto).toMatch(/— falta registrar · elige su cuenta en Configuración$/);
    expect(a.tramos[1].propuesta).toBeNull();
    expect(a.tramos[2].texto).toMatch(/— falta registrar · eliges la cuenta al registrarla$/);
  });

  it("separa grupos; una salida de otro monto se nombra sin alarma; si Dynamic cambió, el título y el detalle lo dicen", () => {
    const avisos = avisosDePlanilla([
      tramo({ movimientoId: "m1", registrado: 12700, netoAlRegistrar: 12745.16, cuentaNombre: "BCP Empresa", fechaRegistrada: "2026-10-30" }),
      tramo({ banco: "interbank", personas: 5, neto: 5600, movimientoId: "m2", registrado: 5512.96, netoAlRegistrar: 5512.96, cuentaNombre: "Interbank Empresas", fechaRegistrada: "2026-10-30" }),
      tramo({ grupo: "practicante", personas: 4, neto: 3176.56 }),
    ]);
    expect(avisos.map((a) => a.grupo)).toEqual(["planilla", "practicante"]);
    const [planilla, practicantes] = avisos;
    expect(planilla.titulo).toBe("Dynamic cambió la planilla del 28/09 al 28/10 después de registrar su salida");
    expect(planilla.porRegistrar).toEqual([]);
    expect(planilla.tramos[0].estado).toBe("registrado");
    expect(planilla.tramos[0].texto).toBe(`BCP · 13 personas · ${soles(12745.16)} — registrado desde BCP Empresa el 30/10 por ${soles(12700)}`);
    expect(planilla.tramos[1].estado).toBe("cambio_en_dynamic");
    expect(planilla.tramos[1].texto).toContain(`Dynamic decía ${soles(5512.96)}`);
    expect(planilla.detalle).toContain("anula esa salida");
    expect(practicantes.titulo).toBe("Falta registrar de qué banco salió el pago a los practicantes del 28/09 al 28/10");
    expect(practicantes.detalle).not.toContain("anula");
  });

  it("sin tramos, sin avisos", () => {
    expect(avisosDePlanilla([])).toEqual([]);
  });
});

describe("la cuenta de cada banco", () => {
  it("lee la fila y solo propone una cuenta guardada", () => {
    const c = leerCuentaPlanilla({ banco: "interbank", cuenta_id: "c2", cuenta_nombre: "Interbank Empresas" });
    expect(c).toEqual({ banco: "interbank", cuentaId: "c2", cuentaNombre: "Interbank Empresas" });
    expect(cuentaPropuesta("interbank", [c])?.cuentaNombre).toBe("Interbank Empresas");
    expect(cuentaPropuesta("bcp", [c])).toBeNull();
    expect(cuentaPropuesta("sin_banco", [c])).toBeNull();
    expect(cuentaPropuesta("interbank", [{ ...c, cuentaId: null }])).toBeNull();
  });
});

describe("la hoja «Registrar la salida»", () => {
  const [aviso] = avisosDePlanilla(
    [tramo({}), tramo({ banco: "interbank", personas: 5, neto: 5512.96 }), tramo({ banco: "sin_banco", personas: 1, neto: 300, movimientoId: "m", netoAlRegistrar: 300 })],
    CUENTAS,
  );

  it("arranca solo con lo que falta, con la cuenta propuesta, el neto de Dynamic y el día que lo pagó", () => {
    const filas = filasDeSalidas(aviso);
    expect(filas.map((f) => f.banco)).toEqual(["bcp", "interbank"]);
    expect(filas[0]).toMatchObject({ modo: "nueva", cuentaId: "c1", monto: "12745.16", fecha: "2026-10-29" });
    expect(filas[1].cuentaId).toBe("");
    expect(textoRegistrar(filas.length)).toBe("Registrar las 2 salidas");
    expect(textoRegistrar(1)).toBe("Registrar la salida");
  });

  it("valida con la misma regla que enciende la guía", () => {
    const filas = filasDeSalidas(aviso);
    const v = validarSalidas(aviso, filas, HOY);
    expect(v).toEqual({ ok: false, error: "Elige de qué cuenta salió lo de Interbank." });
    const campos = camposDeSalidas(filas, HOY);
    expect(campos.filter((c) => !c.hecho).map((c) => c.id)).toEqual(["sal-interbank-cuenta"]);

    const listas: FilaSalida[] = [filas[0], { ...filas[1], cuentaId: "c2", monto: "5,512.96" }];
    const ok = validarSalidas(aviso, listas, HOY);
    expect(ok.ok && ok.valor).toEqual({
      p_periodo_id: P,
      p_grupo: "planilla",
      p_salidas: [
        { banco: "bcp", cuenta_id: "c1", monto: 12745.16, fecha: "2026-10-29" },
        { banco: "interbank", cuenta_id: "c2", monto: 5512.96, fecha: "2026-10-29" },
      ],
    });
    expect(camposDeSalidas(listas, HOY).every((c) => c.hecho)).toBe(true);
  });

  it("rechaza monto ilegible o cero, fecha futura y la misma salida suelta para dos bancos", () => {
    const [f] = filasDeSalidas(aviso);
    expect(validarSalidas(aviso, [{ ...f, monto: "doce" }], HOY)).toMatchObject({ ok: false });
    expect(validarSalidas(aviso, [{ ...f, monto: "0" }], HOY)).toEqual({ ok: false, error: "El monto de BCP tiene que ser mayor que cero." });
    expect(validarSalidas(aviso, [{ ...f, fecha: "2026-10-31" }], HOY)).toEqual({ ok: false, error: "La fecha de BCP no puede ser después de hoy." });
    const ya = (banco: FilaSalida["banco"]): FilaSalida => ({ ...f, banco, modo: "ya", movimientoId: "s1" });
    expect(validarSalidas(aviso, [ya("bcp"), ya("interbank")], HOY)).toEqual({ ok: false, error: "La misma salida no puede ser de dos bancos." });
    const enlazar = validarSalidas(aviso, [ya("bcp")], HOY);
    expect(enlazar.ok && enlazar.valor.p_salidas).toEqual([{ banco: "bcp", movimiento_id: "s1" }]);
    expect(validarSalidas(aviso, [], HOY)).toMatchObject({ ok: false });
  });

  it("una salida suelta se lee y se nombra; la fecha antes del saldo inicial se explica", () => {
    const s = leerSalidaSuelta({ movimiento_id: "s1", fecha: "2026-10-30", monto: "12745.16", cuenta_id: "c1", cuenta_nombre: "BCP Empresa", referencia: "Planilla a mano" });
    expect(textoSuelta(s)).toBe(`30/10 · ${soles(12745.16)} · BCP Empresa · Planilla a mano`);
    expect(notaAntesDelSaldo("2026-10-27", { nombre: "BCP Empresa", saldoDesde: "2026-10-28" })).toContain("desde el 28/10");
    expect(notaAntesDelSaldo("2026-10-28", { nombre: "BCP Empresa", saldoDesde: "2026-10-28" })).toBeNull();
    expect(notaAntesDelSaldo("2026-10-27", { nombre: "BCP Empresa", saldoDesde: null })).toBeNull();
  });
});

describe("el aviso del Inicio", () => {
  it("cuenta las salidas que faltan y lo que suman, y los cambios de Dynamic; sin nada, nulo", () => {
    expect(
      planillaParaElInicio([
        tramo({}),
        tramo({ banco: "interbank", neto: 5512.96 }),
        tramo({ banco: "sin_banco", movimientoId: "m", netoAlRegistrar: 300, neto: 300 }),
      ]),
    ).toEqual({ salidas: 2, total: 18258.12, cambios: 0 });
    expect(planillaParaElInicio([tramo({ movimientoId: "m", netoAlRegistrar: 100, neto: 110 })])).toEqual({ salidas: 0, total: 0, cambios: 1 });
    expect(planillaParaElInicio([tramo({ movimientoId: "m", netoAlRegistrar: 12745.16 })])).toBeNull();
    expect(planillaParaElInicio([])).toBeNull();
  });
});
