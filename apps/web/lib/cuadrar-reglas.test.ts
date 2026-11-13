import { describe, expect, it } from "vitest";
import type { AlertaPos, ConciliacionCuenta, LineaConciliacion, LotePendiente } from "./cuentas-dinero-reglas";
import { cabeceraDeBancos, coincidenciasConBanco, textoMarcarRevisadas, deudaDeMaquinas, tieneExtracto, avanceDeLineas, bancosParaCuadrar, camposDeAnotarSaldo, estadoDeBanco, estadoPar, filtrarLineas, inicialesDeBanco, textoUltimaVez, hastaDeLaUrl, respuestaCuadre, textoBancoContraSistema, textoDespuesDeAnotar, textoLadoBanco, textoPeriodo, textoQueSaldoAnotar } from "./cuadrar-reglas";
import { sePuedeConfirmar } from "./guia-campos";
import { leerMontoPlata } from "./monto-plata-reglas";

const linea = (p: Partial<LineaConciliacion>): LineaConciliacion => ({ clave: "k", fecha: "2026-10-13", detalle: "Depósito", monto: 100, revisado: false, montoRevisado: null, revisadoPor: null, ...p });
const plano = (t: string) => t.replace(/\s/g, " ");

describe("estadoPar y su lado del banco", () => {
  it("revisada, cambió desde que se revisó, o pendiente", () => {
    expect(estadoPar(linea({ revisado: true }))).toBe("revisada");
    expect(estadoPar(linea({ montoRevisado: 90 }))).toBe("cambio");
    expect(estadoPar(linea({}))).toBe("pendiente");
  });
  it("dice quién la revisó, cuánto era antes o la pregunta", () => {
    expect(textoLadoBanco(linea({ revisado: true, revisadoPor: "Felipe" }))).toBe("La revisó Felipe");
    expect(textoLadoBanco(linea({ revisado: true }))).toBe("Revisada");
    expect(plano(textoLadoBanco(linea({ montoRevisado: 90 })))).toBe("Cambió desde que se revisó (era S/ 90.00): mírala otra vez");
    expect(textoLadoBanco(linea({}))).toBe("¿Está en el extracto del banco?");
  });
});

describe("el botón que marca varias dice lo que hace", () => {
  it("da por revisadas, sin afirmar nada del banco", () => {
    expect(textoMarcarRevisadas(1)).toBe("Dar por revisada la que falta");
    expect(textoMarcarRevisadas(33)).toBe("Dar por revisadas las 33");
    expect(textoMarcarRevisadas(33)).not.toMatch(/extracto|banco|cuadra/i);
  });
});

describe("cuántas cuentas coinciden con el banco", () => {
  type C = Pick<ConciliacionCuenta, "tipo" | "pendientes" | "ultimaFecha" | "ultimaDiferencia">;
  const c = (p: Partial<C>): C => ({ tipo: "banco", pendientes: 0, ultimaFecha: null, ultimaDiferencia: null, ...p });
  const si = { ultimaFecha: "2026-11-07", ultimaDiferencia: 0 };
  const no = { ultimaFecha: "2026-11-07", ultimaDiferencia: -60 };

  it("coincide solo la que tiene saldo anotado y sin diferencia", () => {
    expect(coincidenciasConBanco([c(si), c(no), c({})])).toMatchObject({ coinciden: 1, total: 3, noCuadran: 1, pendientes: 0, todoCuadra: false });
  });
  it("todo cuadra solo con saldo anotado, sin diferencia y sin pendientes en todas", () => {
    expect(coincidenciasConBanco([c(si), c(si)]).todoCuadra).toBe(true);
    expect(coincidenciasConBanco([c(si), c({ ...si, pendientes: 3 })]).todoCuadra).toBe(false);
    expect(coincidenciasConBanco([c({}), c({})]).todoCuadra).toBe(false);
    expect(coincidenciasConBanco([]).todoCuadra).toBe(false);
  });
  it("cuenta la tarjeta de crédito, y no las puentes de las máquinas", () => {
    expect(coincidenciasConBanco([c(si), c({ ...si, tipo: "tarjeta_credito" }), c({ tipo: "por_abonar", pendientes: 2 })])).toMatchObject({ coinciden: 2, total: 2, pendientes: 0 });
  });
  it("la cabecera de «Tus bancos» nunca dice «Todo revisado» sin saber si coincide", () => {
    expect(cabeceraDeBancos([c({}), c({})])).toBe("0 de 2 coinciden con el banco.");
    expect(cabeceraDeBancos([c(si), c(no)])).toBe("1 de 2 coincide con el banco.");
    expect(cabeceraDeBancos([c({ ...si, pendientes: 1 }), c({ pendientes: 4 })])).toBe("5 líneas por revisar · 1 de 2 coincide con el banco.");
    expect(cabeceraDeBancos([c({ pendientes: 1 })])).toBe("1 línea por revisar · 0 de 1 coinciden con el banco.");
  });
});

describe("bancosParaCuadrar", () => {
  const c = (id: string, nombre: string, tipo: ConciliacionCuenta["tipo"], pendientes = 0): ConciliacionCuenta => ({ id, nombre, tipo, saldoHoy: 0, ultimaFecha: null, ultimoSaldoBanco: null, ultimaDiferencia: null, pendientes });
  it("los bancos primero y por nombre", () => {
    expect(bancosParaCuadrar([c("pos", "Por depositar Izipay", "por_abonar", 2), c("ibk", "Interbank", "banco", 4), c("bcp", "BCP", "banco", 1)]).map((x) => x.id)).toEqual(["bcp", "ibk", "pos"]);
  });
});

describe("respuestaCuadre", () => {
  const base = { cuenta: { id: "ibk", nombre: "Interbank", tipo: "banco" as const, saldoDesde: null }, hasta: "2026-10-14" };
  const k = (diferencia: number) => ({ id: "k", saldoBanco: 9650, saldoSistema: 9650 - diferencia, diferencia, nota: null, registradoPor: null, despues: null });
  it("cuadra: el saldo coincide y todo está revisado", () => {
    expect(respuestaCuadre({ ...base, conciliacion: k(0), lineas: [linea({ revisado: true })] })).toEqual({ texto: "Interbank cuadra con el banco al 14 oct.", tono: "verde" });
  });
  it("el saldo coincide pero faltan líneas: ámbar", () => {
    expect(respuestaCuadre({ ...base, conciliacion: k(0), lineas: [linea({}), linea({ montoRevisado: 5 })] }).texto).toBe("El saldo coincide al 14 oct; faltan revisar 2 líneas.");
  });
  it("no cuadra: dice la diferencia", () => {
    const r = respuestaCuadre({ ...base, conciliacion: k(-180), lineas: [] });
    expect(plano(r.texto)).toBe("No cuadra al 14 oct: hay S/ 180.00 de diferencia con el banco.");
    expect(r.tono).toBe("ambar");
  });
  it("sin saldo anotado: qué falta", () => {
    expect(respuestaCuadre({ ...base, conciliacion: null, lineas: [linea({})] }).texto).toBe("Faltan revisar 1 línea y anotar el saldo del banco.");
    expect(respuestaCuadre({ ...base, conciliacion: null, lineas: [] }).texto).toBe("Todo revisado al 14 oct: anota el saldo del banco para saber si cuadra.");
  });
});

describe("camposDeAnotarSaldo (guía de foco)", () => {
  const HOY = "2026-10-23";
  const base = { responsableListo: true, saldo: "9,650.00", fecha: HOY, hoy: HOY };
  // Lo que bloquea `anotar()`: sin responsable, saldo vacío o ilegible, fecha futura. La guía dice lo mismo, ni más ni menos.
  const bloqueaAnotar = (d: typeof base) => !d.responsableListo || d.saldo.trim() === "" || leerMontoPlata(d.saldo) === null || d.fecha === "" || d.fecha > d.hoy;
  const ESCENARIOS: (typeof base)[] = [
    base,
    { ...base, responsableListo: false },
    { ...base, saldo: "" },
    { ...base, saldo: "   " },
    { ...base, saldo: "abc" },
    { ...base, saldo: "1.550,00" },
    { ...base, saldo: "-180" },
    { ...base, fecha: "2026-10-24" },
    { ...base, fecha: "" },
    { ...base, fecha: "2026-10-01" },
  ];
  it.each(ESCENARIOS.map((e, i) => [i, e] as const))("escenario %i: la guía deja confirmar si y solo si anotar() lo acepta", (_, e) => {
    expect(sePuedeConfirmar(camposDeAnotarSaldo(e))).toBe(!bloqueaAnotar(e));
  });
  it("en orden: quién, el saldo y la fecha; todos requeridos", () => {
    expect(camposDeAnotarSaldo(base).map((c) => [c.id, c.requerido])).toEqual([["responsable", true], ["saldo", true], ["fecha", true]]);
  });
});

// /chaos 2026-10-23 (semilla 1023, hallazgo #1, NAV-07): `?hasta=1900-01-01` dibujaba «movimientos del 16 oct al 1 ene», un período
// al revés. Una fecha antes de que empiece la cuenta se trata como sin fecha (el corte de hoy), igual que una futura o una que no lo es.
describe("hastaDeLaUrl", () => {
  const HOY = "2026-10-23";
  const DESDE = "2026-10-16";
  it("una fecha válida dentro del período de la cuenta se respeta", () => {
    expect(hastaDeLaUrl("2026-10-20", HOY, DESDE)).toBe("2026-10-20");
    expect(hastaDeLaUrl(DESDE, HOY, DESDE)).toBe(DESDE);
    expect(hastaDeLaUrl(HOY, HOY, DESDE)).toBe(HOY);
  });
  it("antes de que empiece la cuenta: sin fecha (el período nunca queda al revés)", () => {
    expect(hastaDeLaUrl("1900-01-01", HOY, DESDE)).toBeNull();
    expect(hastaDeLaUrl("2026-10-15", HOY, DESDE)).toBeNull();
  });
  it("futura, basura o vacía: sin fecha, como antes", () => {
    expect(hastaDeLaUrl("2099-01-01", HOY, DESDE)).toBeNull();
    expect(hastaDeLaUrl("basura", HOY, DESDE)).toBeNull();
    expect(hastaDeLaUrl(undefined, HOY, DESDE)).toBeNull();
  });
  it("sin inicio de la cuenta ni de Finanzas no hay piso", () => {
    expect(hastaDeLaUrl("1900-01-01", HOY, null)).toBe("1900-01-01");
  });
  it("el inicio de Finanzas sirve de piso cuando la cuenta no tiene el suyo (lo pasa la página)", () => {
    expect(hastaDeLaUrl("2026-09-30", HOY, "2026-10-01")).toBeNull();
  });
});

describe("textoPeriodo", () => {
  const HOY = "2026-10-23";
  it("del año de hoy, sin año; de otro año, con el año (nunca «del 2 dic al 1 ene» de 1899)", () => {
    expect(textoPeriodo("2026-10-16", "2026-10-23", HOY)).toBe("del 16 oct al 23 oct");
    expect(textoPeriodo("1899-12-02", "1900-01-01", HOY)).toBe("del 2 dic 1899 al 1 ene 1900");
    expect(textoPeriodo("2025-12-15", "2026-01-14", HOY)).toBe("del 15 dic 2025 al 14 ene 2026");
  });
});

describe("la lista de bancos (B · Lista y detalle)", () => {
  const b = (c: Partial<Pick<ConciliacionCuenta, "pendientes" | "ultimaFecha" | "ultimaDiferencia">>) => ({ pendientes: 0, ultimaFecha: null, ultimaDiferencia: null, ...c });
  it("lo que falta revisar manda sobre cómo cerró la última vez", () => {
    expect(estadoDeBanco(b({ pendientes: 3, ultimaFecha: "2026-10-23", ultimaDiferencia: 0 }))).toEqual({ texto: "3 por revisar", tono: "ambar" });
  });
  it("«No cuadra» manda sobre lo que falta revisar, solo si hay un saldo anotado que no coincide", () => {
    expect(estadoDeBanco(b({ pendientes: 3, ultimaFecha: "2026-10-23", ultimaDiferencia: -60 }))).toEqual({ texto: "No cuadra", tono: "ambar" });
    expect(estadoDeBanco(b({ pendientes: 3 }))).toEqual({ texto: "3 por revisar", tono: "ambar" });
  });
  it("sin saldo anotado nunca: falta el saldo; con él: cuadra o no cuadra", () => {
    expect(estadoDeBanco(b({}))).toEqual({ texto: "Falta el saldo", tono: "pizarra" });
    expect(estadoDeBanco(b({ ultimaFecha: "2026-10-23", ultimaDiferencia: 0 }))).toEqual({ texto: "Cuadra", tono: "verde" });
    expect(estadoDeBanco(b({ ultimaFecha: "2026-10-23", ultimaDiferencia: -60 }))).toEqual({ texto: "No cuadra", tono: "ambar" });
  });
  it("la última vez se dice con el día de Lima, o «Nunca se cuadró»", () => {
    expect(textoUltimaVez(null)).toBe("Nunca se cuadró");
    expect(textoUltimaVez("2026-10-23")).toMatch(/^Última vez: 23 oct/);
  });
  it("las iniciales: dos palabras toman la primera de cada una; una sola, sus dos primeras letras", () => {
    expect(inicialesDeBanco("BCP Soles")).toBe("BS");
    expect(inicialesDeBanco("BBVA")).toBe("BB");
    expect(inicialesDeBanco("  ")).toBe("");
  });
  it("el avance y el filtro: «por revisar» incluye las que cambiaron desde que se revisaron", () => {
    const ls = [linea({ clave: "a", revisado: true }), linea({ clave: "b" }), linea({ clave: "c", montoRevisado: 90 })];
    expect(avanceDeLineas(ls)).toEqual({ total: 3, revisadas: 1, faltan: 2, pct: 33 });
    expect(filtrarLineas(ls, "pendientes").map((l) => l.clave)).toEqual(["b", "c"]);
    expect(filtrarLineas(ls, "revisadas").map((l) => l.clave)).toEqual(["a"]);
    expect(filtrarLineas(ls, "todas")).toHaveLength(3);
    expect(avanceDeLineas([]).pct).toBe(0);
  });
});

// ---- ADR-0629, Fase B: la puente no se cuadra contra un extracto -----------------------------------------------------------------

describe("tieneExtracto", () => {
  it("la puente de una máquina no tiene extracto; un banco y una tarjeta sí", () => {
    expect(tieneExtracto("por_abonar")).toBe(false);
    expect(tieneExtracto("banco")).toBe(true);
    expect(tieneExtracto("tarjeta_credito")).toBe(true);
  });
});

const alerta = (p: Partial<AlertaPos>): AlertaPos => ({ maquinaId: "m", nombre: "Izipay", cuentaId: "c-izi", pendientes: 0, montoPendiente: 0, esperado: null, atrasados: 0, montoAtrasado: 0, diasHabilesMasViejo: 0, diasAbono: 0, sinTarifa: false, ...p });
const lote = (p: Partial<LotePendiente>): LotePendiente => ({ clave: "k", fecha: "2026-11-06", ubicacionId: "u", ubicacionNombre: "Tienda TRU", medio: "qr", bruto: 100, dias: 1, nPagos: 1, esperado: 0, diasHabiles: 1, atrasado: true, yaDepositado: 0, ...p });

describe("deudaDeMaquinas", () => {
  it("separa lo atrasado de lo que todavía no le toca, del día más viejo al más nuevo", () => {
    const [m] = deudaDeMaquinas(
      [alerta({})],
      new Map([["c-izi", [lote({ clave: "b", fecha: "2026-11-06", bruto: 185.7, yaDepositado: 641.2 }), lote({ clave: "a", fecha: "2026-11-04", ubicacionNombre: "Tienda AQP", bruto: 401.2 }), lote({ clave: "h", fecha: "2026-11-07", bruto: 950.2, atrasado: false })]]]),
    );
    expect(m.total).toBe(1537.1);
    expect(m.atrasados.map((d) => d.clave)).toEqual(["a", "b"]);
    expect(m.atrasados[0].titulo).toContain("Tienda AQP · QR");
    expect(m.atrasados[1].nota).toContain("Ya llegaron");
    expect(m.atrasados[0].nota).toBeNull();
    expect(m.estado.tono).toBe("ambar");
    expect(m.enCamino).toContain("950.20");
  });

  it("sin nada atrasado está al día, y sin nada pendiente no debe nada", () => {
    const [a, b] = deudaDeMaquinas(
      [alerta({ nombre: "Vendemás", cuentaId: "c-ven" }), alerta({ nombre: "Izipay", cuentaId: "c-izi" })],
      new Map([["c-izi", [lote({ atrasado: false })]]]),
    );
    expect(a.nombre).toBe("Izipay");
    expect(a.estado).toEqual({ texto: "Al día", tono: "verde" });
    expect(a.atrasados).toEqual([]);
    expect(b.estado.texto).toBe("No debe nada");
    expect(b.enCamino).toBeNull();
  });

  it("un residuo negativo o en cero no es deuda", () => {
    const [m] = deudaDeMaquinas([alerta({})], new Map([["c-izi", [lote({ bruto: 0 }), lote({ clave: "z", bruto: -20 })]]]));
    expect(m.total).toBe(0);
    expect(m.atrasados).toEqual([]);
  });
});

describe("el saldo de hoy se corta al anotarlo (ADR-0652)", () => {
  it("lo registrado después de anotar se dice, con su sentido; nada si no hubo o si se anotó un día pasado", () => {
    expect(plano(textoDespuesDeAnotar(-280.39) ?? "")).toBe("Después de anotarlo salieron S/ 280.39 con fecha de ese día: no cuentan aquí, entran al próximo cuadre.");
    expect(plano(textoDespuesDeAnotar(55) ?? "")).toBe("Después de anotarlo entraron S/ 55.00 con fecha de ese día: no cuentan aquí, entran al próximo cuadre.");
    expect(textoDespuesDeAnotar(0)).toBeNull();
    expect(textoDespuesDeAnotar(0.004)).toBeNull();
    expect(textoDespuesDeAnotar(null)).toBeNull();
  });
  it("si algo cambió después de anotar, dice que coincidía (o la diferencia) cuando se anotó, no ahora", () => {
    expect(textoBancoContraSistema(0, null)).toBe("Coincide con el sistema.");
    expect(textoBancoContraSistema(0, 0)).toBe("Coincide con el sistema.");
    expect(textoBancoContraSistema(0, -280.39)).toBe("Coincidía con el sistema cuando se anotó.");
    expect(plano(textoBancoContraSistema(-50, null))).toBe("Diferencia de S/ 50.00 con el sistema.");
    expect(plano(textoBancoContraSistema(-50, 20))).toBe("Diferencia de S/ 50.00 con lo que el sistema decía cuando se anotó.");
  });
  it("hoy se anota lo que dice el banco ahora; un día pasado, lo del cierre", () => {
    expect(textoQueSaldoAnotar("2026-11-13", "2026-11-13")).toContain("ahora");
    expect(textoQueSaldoAnotar("2026-11-12", "2026-11-13")).toContain("al cierre de ese día");
  });
});
