import { describe, expect, it } from "vitest";
import type { CuentaDinero } from "./cuentas-dinero-reglas";
import { solesRedondo } from "./gastos-reglas";
import { avisoCajaFuerte, chipsDondeEsta, chipsQueDebes, colorDeGrupo, detalleCajon, preguntaDeDinero, respuestaCuadrar, escalaDeCuenta, orilloDeDinero, grupoDe, gruposDeDinero, montoConSigno, nombreSinElLugar, ultimoDepositoDe } from "./dinero-telar-reglas";

const cuenta = (p: Partial<CuentaDinero> & Pick<CuentaDinero, "id" | "nombre" | "tipo">): CuentaDinero => ({
  cuentaContable: "104", ubicacionId: null, ubicacionNombre: null, numero: null, saldo: 0, archivada: false, soloDestino: false,
  cajaId: null, cajaAbierta: false, saldoDesde: null, ultimaConciliacion: null, ultimoAbono: null, orden: 0, ...p,
});
// La historia de la maqueta (jueves 15 de octubre): cada sol en su grupo.
const CUENTAS: CuentaDinero[] = [
  cuenta({ id: "bcp", nombre: "BCP", tipo: "banco", saldo: 18300, ultimaConciliacion: "2026-10-14" }),
  cuenta({ id: "ibk", nombre: "Interbank", tipo: "banco", saldo: 9830 }),
  cuenta({ id: "izi", nombre: "Por depositar Izipay", tipo: "por_abonar", saldo: 2140 }),
  cuenta({ id: "rendir", nombre: "Efectivo entregado al líder", tipo: "por_rendir", saldo: 0 }),
  cuenta({ id: "cTRU", nombre: "Cajón · TRU", tipo: "cajon", ubicacionId: "tru", saldo: 500 }),
  cuenta({ id: "fTRU", nombre: "Caja fuerte · TRU", tipo: "caja_fuerte", ubicacionId: "tru", saldo: 6200 }),
  cuenta({ id: "cAQP", nombre: "Cajón · AQP", tipo: "cajon", ubicacionId: "aqp", saldo: null }),
  cuenta({ id: "fAQP", nombre: "Caja fuerte · AQP", tipo: "caja_fuerte", ubicacionId: "aqp", saldo: 3900 }),
  cuenta({ id: "ffTAL", nombre: "Fondo fijo · Taller", tipo: "cajon", ubicacionId: "tal", saldo: 150 }),
  cuenta({ id: "visa", nombre: "Visa BCP", tipo: "tarjeta_credito", saldo: -2300 }),
  cuenta({ id: "vieja", nombre: "Banco cerrado", tipo: "banco", saldo: 0, archivada: true }),
];
const SEDES = [
  { id: "tru", nombre: "Trujillo" },
  { id: "aqp", nombre: "Arequipa" },
  { id: "lim", nombre: "Lima" },
  { id: "tal", nombre: "Taller" },
];
const HOY = "2026-10-15";
const plano = (t: string) => t.replace(/\s/g, " ");

describe("grupoDe", () => {
  it("el cajón y la caja fuerte van a su sede; bancos y lo del líder, a CAYLA entera; las máquinas, en camino; la tarjeta no va en ninguno", () => {
    expect(grupoDe({ tipo: "cajon", ubicacionId: "tru" })).toBe("tru");
    expect(grupoDe({ tipo: "caja_fuerte", ubicacionId: "aqp" })).toBe("aqp");
    expect(grupoDe({ tipo: "banco", ubicacionId: null })).toBe("empresa");
    expect(grupoDe({ tipo: "por_rendir", ubicacionId: null })).toBe("empresa");
    expect(grupoDe({ tipo: "por_abonar", ubicacionId: null })).toBe("camino");
    expect(grupoDe({ tipo: "tarjeta_credito", ubicacionId: null })).toBeNull();
  });
});

describe("escalaDeCuenta", () => {
  it("es una línea recta: la que más tiene llega a 1 y un cuarto de la plata se ve como un cuarto", () => {
    expect(escalaDeCuenta(18300, 18300)).toBe(1);
    expect(escalaDeCuenta(4575, 18300)).toBe(0.25);
    expect(escalaDeCuenta(500, 20000)).toBe(0.025); // S/ 500 junto a S/ 20,000: una astilla, y es verdad
  });
  it("lo que pesa es proporcional: el doble de plata es el doble de barra (con raíz cuadrada no lo era)", () => {
    expect(escalaDeCuenta(2000, 10000)! * 2).toBeCloseTo(escalaDeCuenta(4000, 10000)!, 10);
  });
  it("en cero o en negativo no hay barra, y con un saldo que no se ve no hay nada que medir", () => {
    expect(escalaDeCuenta(0, 18300)).toBe(0);
    expect(escalaDeCuenta(-50, 18300)).toBe(0);
    expect(escalaDeCuenta(10, 0)).toBe(0);
    expect(escalaDeCuenta(null, 18300)).toBeNull();
  });
  it("nunca pasa de 1, aunque la cuenta sea más grande que el máximo que se le dio", () => {
    expect(escalaDeCuenta(25000, 18300)).toBe(1);
  });
});

describe("montoConSigno", () => {
  it("escribe el negativo con el menos de verdad y siempre igual; el cero no lleva signo", () => {
    expect(montoConSigno(1141)).toBe(solesRedondo(1141));
    expect(montoConSigno(-24000)).toBe(`−${solesRedondo(24000)}`);
    expect(montoConSigno(-950.4)).toBe(`−${solesRedondo(950.4)}`);
    expect(montoConSigno(0)).toBe(solesRedondo(0));
    expect(montoConSigno(-0.3)).toBe(solesRedondo(0)); // un negativo que redondea a cero no se escribe «−S/ 0»
  });
});

describe("nombreSinElLugar", () => {
  it("quita el lugar que ya dice el título del grupo", () => {
    expect(nombreSinElLugar("Caja Operativa · Tienda AQP", "Tienda AQP")).toBe("Caja Operativa");
    expect(nombreSinElLugar("Fondo fijo · Taller", "Taller")).toBe("Fondo fijo");
  });
  it("deja el nombre como está si el lugar no va al final tras « · », o si no queda nada", () => {
    expect(nombreSinElLugar("Cajón · TRU", "Trujillo")).toBe("Cajón · TRU");
    expect(nombreSinElLugar("BCP Empresa", "CAYLA entera")).toBe("BCP Empresa");
    expect(nombreSinElLugar("Taller · Mi caja", "Taller")).toBe("Taller · Mi caja");
    expect(nombreSinElLugar(" · Taller", "Taller")).toBe(" · Taller");
  });
});

describe("gruposDeDinero", () => {
  it("con todas: un grupo por sede con cuentas, en el orden de las sedes, y después CAYLA entera y En camino", () => {
    const r = gruposDeDinero(CUENTAS, SEDES, null, HOY);
    expect(r.map((x) => [x.clave, x.titulo, x.total])).toEqual([
      ["tru", "Trujillo", 6700],
      ["aqp", "Arequipa", 3900],
      ["tal", "Taller", 150],
      ["empresa", "CAYLA entera", 28130],
      ["camino", "En camino", 2140],
    ]);
    // Lima no tiene cuentas: no sale. La tarjeta y lo archivado no salen.
    expect(r.flatMap((x) => x.filas.map((f) => f.id))).not.toContain("visa");
    expect(r.flatMap((x) => x.filas.map((f) => f.id))).not.toContain("vieja");
  });
  it("el saldo que no se ve no suma, marca el grupo y deja la fila sin escala", () => {
    const aqp = gruposDeDinero(CUENTAS, SEDES, null, HOY).find((x) => x.clave === "aqp")!;
    expect(aqp.ocultos).toBe(true);
    expect(aqp.filas.find((f) => f.id === "cAQP")!.escala).toBeNull();
  });
  it("con una sede: solo su grupo, aunque esté vacía, con la nota que lo dice", () => {
    expect(gruposDeDinero(CUENTAS, SEDES, "tru", HOY).map((x) => x.clave)).toEqual(["tru"]);
    const lim = gruposDeDinero(CUENTAS, SEDES, "lim", HOY);
    expect(lim).toHaveLength(1);
    expect(lim[0].filas).toEqual([]);
    expect(lim[0].nota).toContain("Todavía no tiene");
  });
  it("la escala se mide contra la cuenta con más plata de TODA la empresa, también con una sede elegida", () => {
    const tru = gruposDeDinero(CUENTAS, SEDES, "tru", HOY)[0];
    expect(tru.filas.find((f) => f.id === "fTRU")!.escala).toBe(escalaDeCuenta(6200, 18300));
  });
  it("cada grupo lleva su lugar en la lista de sedes, el mismo con todas las sedes que con una sola; CAYLA entera y En camino no tienen", () => {
    const todas = gruposDeDinero(CUENTAS, SEDES, null, HOY);
    expect(todas.map((x) => [x.clave, x.posicion])).toEqual([["tru", 0], ["aqp", 1], ["tal", 3], ["empresa", -1], ["camino", -1]]);
    expect(gruposDeDinero(CUENTAS, SEDES, "aqp", HOY)[0]!.posicion).toBe(1);
  });
  it("cada banco trae su insignia de conciliación", () => {
    const emp = gruposDeDinero(CUENTAS, SEDES, null, HOY).find((x) => x.clave === "empresa")!;
    expect(emp.filas.find((f) => f.id === "bcp")!.insignia?.texto).toContain("conciliada");
    expect(emp.filas.find((f) => f.id === "ibk")!.insignia?.texto).toBe("sin conciliar");
  });
});

describe("gruposDeDinero · el nombre de cada fila", () => {
  it("dentro de la tarjeta de su sede, la fila no repite el lugar; fuera de ella, lo conserva", () => {
    const cs = [
      cuenta({ id: "c1", nombre: "Caja Operativa · Trujillo", tipo: "cajon", ubicacionId: "tru", saldo: 100 }),
      cuenta({ id: "b1", nombre: "BCP Empresa", tipo: "banco", saldo: 900 }),
    ];
    const g = gruposDeDinero(cs, SEDES, null, HOY);
    expect(g.find((x) => x.clave === "tru")!.filas.map((f) => f.nombre)).toEqual(["Caja Operativa"]);
    expect(g.find((x) => x.clave === "empresa")!.filas.map((f) => f.nombre)).toEqual(["BCP Empresa"]);
  });
});

describe("gruposDeDinero · el detalle", () => {
  it("cada fila lleva lo que dice quien llama, y nada si no dice", () => {
    const r = gruposDeDinero(CUENTAS, SEDES, "tru", HOY, { explicar: (c) => (c.tipo === "cajon" ? "Caja abierta hoy" : null) })[0];
    expect(r.filas.map((f) => f.detalle)).toEqual(["Caja abierta hoy", null]);
    expect(gruposDeDinero(CUENTAS, SEDES, "tru", HOY)[0].filas.every((f) => f.detalle === null)).toBe(true);
  });
});

describe("orilloDeDinero", () => {
  it("suma por sede; lo en camino y los bancos van a empresa; la tarjeta no cuenta", () => {
    expect(orilloDeDinero(CUENTAS)).toEqual({ tru: 6700, aqp: 3900, tal: 150, empresa: 30270 });
  });
  it("la suma del orillo es todo lo que tiene CAYLA, sin la tarjeta", () => {
    const total = Object.values(orilloDeDinero(CUENTAS)).reduce((a, b) => a + b, 0);
    expect(total).toBe(18300 + 9830 + 2140 + 500 + 6200 + 3900 + 150);
  });
});

const dep = (origenId: string, fecha: string, estado: "vigente" | "anulado" = "vigente") => ({ tipo: "deposito" as const, origenId, fecha, estado });

describe("ultimoDepositoDe y avisoCajaFuerte", () => {
  const MOVS = [dep("fTRU", "2026-10-13"), dep("fTRU", "2026-10-09"), dep("fAQP", "2026-10-09"), dep("fAQP", "2026-10-14", "anulado"), { ...dep("fAQP", "2026-10-15"), tipo: "entre_cuentas" as const }];
  it("toma el depósito vigente más reciente que salió de esa cuenta; ni el anulado ni otro tipo cuentan", () => {
    expect(ultimoDepositoDe("fTRU", MOVS)).toBe("2026-10-13");
    expect(ultimoDepositoDe("fAQP", MOVS)).toBe("2026-10-09");
    expect(ultimoDepositoDe("nada", MOVS)).toBeNull();
  });
  it("avisa en ámbar pasados 3 días; antes, en verde; sin depósitos, lo dice", () => {
    expect(avisoCajaFuerte({ id: "fAQP", tipo: "caja_fuerte", saldo: 3900 }, MOVS, HOY)).toEqual({ texto: "6 días sin depositar", tono: "ambar" });
    expect(avisoCajaFuerte({ id: "fTRU", tipo: "caja_fuerte", saldo: 6200 }, MOVS, HOY)).toEqual({ texto: "depositada hace 2 días", tono: "verde" });
    expect(avisoCajaFuerte({ id: "fTRU", tipo: "caja_fuerte", saldo: 6200 }, MOVS, "2026-10-13")).toEqual({ texto: "depositada hoy", tono: "verde" });
    expect(avisoCajaFuerte({ id: "fLIM", tipo: "caja_fuerte", saldo: 50 }, MOVS, HOY)).toEqual({ texto: "sin depósitos registrados", tono: "pizarra" });
  });
  it("una caja fuerte vacía u oculta, o un cajón, no avisa", () => {
    expect(avisoCajaFuerte({ id: "fAQP", tipo: "caja_fuerte", saldo: 0 }, MOVS, HOY)).toBeNull();
    expect(avisoCajaFuerte({ id: "fAQP", tipo: "caja_fuerte", saldo: null }, MOVS, HOY)).toBeNull();
    expect(avisoCajaFuerte({ id: "cTRU", tipo: "cajon", saldo: 500 }, MOVS, HOY)).toBeNull();
  });
  it("el aviso llega a la fila cuando la cuenta no trae insignia propia", () => {
    const tru = gruposDeDinero(CUENTAS, SEDES, "tru", HOY, { avisar: (c) => avisoCajaFuerte(c, MOVS, HOY) })[0];
    expect(tru.filas.find((f) => f.id === "fTRU")!.insignia).toEqual({ texto: "depositada hace 2 días", tono: "verde" });
  });
});

describe("detalleCajon", () => {
  // Los montos llevan un espacio duro tras «S/» (no se parten en dos líneas): se comparan con espacios comunes.
  const plano = (t: string | null) => t?.replace(/\s/g, " ") ?? null;
  const ABIERTA = { abierta: true, abiertaEn: "2026-10-15T14:58:00Z", ventasEfectivo: 1180, egresos: 40, depositos: 0, cerradaEn: null };
  it("abierta: desde qué hora (en Lima), cuánto vendió en efectivo y cuánto salió", () => {
    expect(plano(detalleCajon(ABIERTA, false))).toBe("Abierta desde las 09:58 · vendió S/ 1,180 en efectivo · salieron S/ 40");
    expect(plano(detalleCajon({ ...ABIERTA, egresos: 0 }, false))).toBe("Abierta desde las 09:58 · vendió S/ 1,180 en efectivo");
  });
  it("cerrada: desde cuándo; el Taller: fondo fijo; sin fila: nada", () => {
    expect(detalleCajon({ ...ABIERTA, abierta: false, cerradaEn: "2026-10-14T23:30:00Z" }, false)).toBe("Caja cerrada desde el miércoles 14");
    expect(detalleCajon(undefined, true)).toBe("Fondo fijo para gastos chicos");
    expect(detalleCajon(undefined, false)).toBeNull();
  });
});

describe("colorDeGrupo", () => {
  const TELAR = [
    { clave: "tru", color: "tru" as const },
    { clave: "tal", color: "tal" as const },
    { clave: "alm", color: "otra" as const },
  ];
  it("el hilo de la sede en la barra; la empresa (o sin sede), el de la empresa; lo en camino y lo desconocido, a media voz", () => {
    expect(colorDeGrupo("tru", TELAR)).toBe("var(--color-sede-tru)");
    expect(colorDeGrupo("tal", TELAR)).toBe("var(--color-sede-tal)");
    expect(colorDeGrupo(null, TELAR)).toBe("var(--color-sede-emp)");
    expect(colorDeGrupo("empresa", TELAR)).toBe("var(--color-sede-emp)");
    expect(colorDeGrupo("camino", TELAR)).toContain("var(--color-pizarra) 55%");
    expect(colorDeGrupo("alm", TELAR)).toBe("var(--color-taupe)");
    expect(colorDeGrupo("nadie", TELAR)).toBe("var(--color-taupe)");
  });
});

describe("la respuesta de cada cara", () => {
  it("la pregunta nombra la sede, y Cuadrar es siempre de CAYLA entera", () => {
    expect(preguntaDeDinero("donde", null)).toBe("¿Cuánta plata tienes hoy?");
    expect(preguntaDeDinero("donde", "Trujillo")).toBe("¿Cuánta plata tiene Trujillo hoy?");
    expect(preguntaDeDinero("debes", null)).toBe("¿Cuánto debes?");
    expect(preguntaDeDinero("debes", "Taller")).toBe("¿Cuánto debe Taller?");
    expect(preguntaDeDinero("cuadrar", "Trujillo")).toBe("¿Cuánto dicen tus bancos?");
  });
  it("Dónde está: dónde está la plata, la tarjeta aparte y si algo no se ve", () => {
    const chips = chipsDondeEsta({ partes: [{ clave: "bancos", titulo: "En los bancos", monto: 28130 }, { clave: "camino", titulo: "En camino (tarjeta por abonar)", monto: 2140 }], tarjeta: 2300, ocultas: true });
    expect(chips.map((c) => [plano(c.texto), c.tono])).toEqual([
      ["En los bancos S/ 28,130", "pizarra"],
      ["En camino S/ 2,140", "pizarra"],
      ["Debes S/ 2,300 en la tarjeta", "ambar"],
      ["El cajón abierto lo ve quien cierra la caja", "apagado"],
    ]);
  });
  it("Qué debes: cuántas, lo vencido en rojo, lo de esta semana en ámbar; nada, en verde", () => {
    const chips = chipsQueDebes([{ vence: "2026-10-10", saldo: 5133.6 }, { vence: "2026-10-19", saldo: 6800 }, { vence: "2026-11-30", saldo: 3200 }], HOY);
    expect(chips.map((c) => [plano(c.texto), c.tono])).toEqual([
      ["3 facturas", "pizarra"],
      ["S/ 5,134 ya vencido", "rojo"],
      ["S/ 6,800 vence esta semana", "ambar"],
    ]);
    expect(chipsQueDebes([], HOY)).toEqual([{ texto: "Nada por pagar", tono: "verde" }]);
  });
  it("Cuadrar: lo que suman los bancos y lo que falta revisar; sin bancos, no hay cifra", () => {
    const c = (tipo: "banco" | "por_abonar", saldoHoy: number, pendientes: number) => ({ tipo, saldoHoy, pendientes });
    expect(respuestaCuadrar([c("banco", 18300, 1), c("banco", 9830, 4), c("por_abonar", 2140, 2)])).toEqual({ valor: 28130, chips: [{ texto: "7 líneas por revisar", tono: "ambar" }] });
    expect(respuestaCuadrar([c("banco", 100, 0)]).chips).toEqual([{ texto: "Todo revisado", tono: "verde" }]);
    expect(respuestaCuadrar([c("por_abonar", 50, 0)])).toEqual({ valor: null, chips: [] });
  });
});
