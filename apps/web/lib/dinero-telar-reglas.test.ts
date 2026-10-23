import { describe, expect, it } from "vitest";
import type { CuentaDinero } from "./cuentas-dinero-reglas";
import { avisoCajaFuerte, colorDeSede, detalleCajon, nivelFrasco, orilloDeDinero, repisaDe, repisasDeDinero, ultimoDepositoDe, verDeLaUrl } from "./dinero-telar-reglas";

const cuenta = (p: Partial<CuentaDinero> & Pick<CuentaDinero, "id" | "nombre" | "tipo">): CuentaDinero => ({
  cuentaContable: "104", ubicacionId: null, ubicacionNombre: null, numero: null, saldo: 0, archivada: false, soloDestino: false,
  cajaId: null, cajaAbierta: false, saldoDesde: null, ultimaConciliacion: null, ultimoAbono: null, orden: 0, ...p,
});
// La historia de la maqueta (jueves 15 de octubre): cada sol en su repisa.
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

describe("repisaDe", () => {
  it("el cajón y la caja fuerte van a su sede; bancos y lo del líder, a CAYLA entera; las máquinas, en camino; la tarjeta no es frasco", () => {
    expect(repisaDe({ tipo: "cajon", ubicacionId: "tru" })).toBe("tru");
    expect(repisaDe({ tipo: "caja_fuerte", ubicacionId: "aqp" })).toBe("aqp");
    expect(repisaDe({ tipo: "banco", ubicacionId: null })).toBe("empresa");
    expect(repisaDe({ tipo: "por_rendir", ubicacionId: null })).toBe("empresa");
    expect(repisaDe({ tipo: "por_abonar", ubicacionId: null })).toBe("camino");
    expect(repisaDe({ tipo: "tarjeta_credito", ubicacionId: null })).toBeNull();
  });
});

describe("nivelFrasco", () => {
  it("sube con raíz cuadrada, el más lleno llega a 0.93 y lo vacío deja un fondo mínimo", () => {
    expect(nivelFrasco(18300, 18300)).toBe(0.93);
    expect(nivelFrasco(4575, 18300)).toBe(0.5); // un cuarto de la plata se ve a la mitad
    expect(nivelFrasco(0, 18300)).toBe(0.04);
    expect(nivelFrasco(-50, 18300)).toBe(0.04);
    expect(nivelFrasco(null, 18300)).toBeNull();
    expect(nivelFrasco(10, 0)).toBe(0.04);
  });
});

describe("repisasDeDinero", () => {
  it("con todas: una repisa por sede con cuentas, en el orden de las sedes, y después CAYLA entera y En camino", () => {
    const r = repisasDeDinero(CUENTAS, SEDES, null, HOY);
    expect(r.map((x) => [x.clave, x.titulo, x.total])).toEqual([
      ["tru", "Trujillo", 6700],
      ["aqp", "Arequipa", 3900],
      ["tal", "Taller", 150],
      ["empresa", "CAYLA entera", 28130],
      ["camino", "En camino", 2140],
    ]);
    // Lima no tiene cuentas: no sale. La tarjeta y lo archivado no son frascos.
    expect(r.flatMap((x) => x.frascos.map((f) => f.id))).not.toContain("visa");
    expect(r.flatMap((x) => x.frascos.map((f) => f.id))).not.toContain("vieja");
  });
  it("el saldo que no se ve no suma, marca la repisa y deja el frasco sin nivel", () => {
    const aqp = repisasDeDinero(CUENTAS, SEDES, null, HOY).find((x) => x.clave === "aqp")!;
    expect(aqp.ocultos).toBe(true);
    expect(aqp.frascos.find((f) => f.id === "cAQP")!.nivel).toBeNull();
  });
  it("con una sede: solo su repisa, aunque esté vacía, con la nota que lo dice", () => {
    expect(repisasDeDinero(CUENTAS, SEDES, "tru", HOY).map((x) => x.clave)).toEqual(["tru"]);
    const lim = repisasDeDinero(CUENTAS, SEDES, "lim", HOY);
    expect(lim).toHaveLength(1);
    expect(lim[0].frascos).toEqual([]);
    expect(lim[0].nota).toContain("Todavía no tiene");
  });
  it("el nivel se mide contra el frasco más lleno de TODA la empresa, también con una sede elegida", () => {
    const tru = repisasDeDinero(CUENTAS, SEDES, "tru", HOY)[0];
    expect(tru.frascos.find((f) => f.id === "fTRU")!.nivel).toBe(nivelFrasco(6200, 18300));
  });
  it("cada banco trae su insignia de conciliación", () => {
    const emp = repisasDeDinero(CUENTAS, SEDES, null, HOY).find((x) => x.clave === "empresa")!;
    expect(emp.frascos.find((f) => f.id === "bcp")!.insignia?.texto).toContain("conciliada");
    expect(emp.frascos.find((f) => f.id === "ibk")!.insignia?.texto).toBe("sin conciliar");
  });
});

describe("repisasDeDinero · el detalle", () => {
  it("cada frasco lleva lo que dice quien llama, y nada si no dice", () => {
    const r = repisasDeDinero(CUENTAS, SEDES, "tru", HOY, { explicar: (c) => (c.tipo === "cajon" ? "Caja abierta hoy" : null) })[0];
    expect(r.frascos.map((f) => f.detalle)).toEqual(["Caja abierta hoy", null]);
    expect(repisasDeDinero(CUENTAS, SEDES, "tru", HOY)[0].frascos.every((f) => f.detalle === null)).toBe(true);
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

describe("verDeLaUrl", () => {
  it("`sede` (la barra común) manda sobre `ver`; «empresa» se lee como todas", () => {
    expect(verDeLaUrl({ sede: "tru", ver: "aqp" })).toBe("tru");
    expect(verDeLaUrl({ ver: "aqp" })).toBe("aqp");
    expect(verDeLaUrl({ sede: "empresa" })).toBe("todas");
    expect(verDeLaUrl({})).toBeUndefined();
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
  it("el aviso llega al frasco cuando la cuenta no trae insignia propia", () => {
    const tru = repisasDeDinero(CUENTAS, SEDES, "tru", HOY, { avisar: (c) => avisoCajaFuerte(c, MOVS, HOY) })[0];
    expect(tru.frascos.find((f) => f.id === "fTRU")!.insignia).toEqual({ texto: "depositada hace 2 días", tono: "verde" });
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

describe("colorDeSede", () => {
  it("cada sede, un token por su lugar; la empresa (o sin sede) y lo en camino, a media voz", () => {
    expect(colorDeSede("tru", SEDES)).toBe("var(--color-pizarra)");
    expect(colorDeSede("aqp", SEDES)).toBe("var(--color-verde)");
    expect(colorDeSede("tal", SEDES)).toBe("var(--color-taupe)");
    expect(colorDeSede(null, SEDES)).toContain("var(--color-tinta) 55%");
    expect(colorDeSede("empresa", SEDES)).toBe(colorDeSede(null, SEDES));
    expect(colorDeSede("camino", SEDES)).toContain("var(--color-pizarra) 55%");
    expect(colorDeSede("otra", SEDES)).toMatch(/^var\(--color-/);
  });
});
