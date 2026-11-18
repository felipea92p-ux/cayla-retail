import { describe, expect, it } from "vitest";
import { primerPasoCobros, cobrosDeSede, curvaHilo, destinosDeSede, detalleDeDestino, gruposDeCuentas, maquinaSinTarifa, saldoDeCuenta, sedesDeCobro, tarifaDeMaquina, textoDeLoPlegado } from "./dinero-config-reglas";
import type { CuentaDinero, FilaMedio, MedioCobro, TarifaPos, TipoCuenta } from "./cuentas-dinero-reglas";

const medio = (ubicacionId: string, ubicacionNombre: string, m: MedioCobro, cuentaId: string | null) => ({ ubicacionId, ubicacionNombre, medio: m, cuentaId, cuentaNombre: null }) as FilaMedio;
const cuenta = (id: string, tipo: TipoCuenta, archivada = false) => ({ id, nombre: id, tipo, archivada, saldo: 0 }) as CuentaDinero;

const MEDIOS = [
  medio("tal", "Taller", "transferencia", "bcp"),
  ...(["yape", "plin", "tarjeta", "qr", "transferencia"] as const).map((m) => medio("tru", "Tienda TRU", m, m === "plin" ? null : m === "yape" ? "bcp" : "izi")),
];

describe("los cobros de una sede", () => {
  it("las sedes que cobran van primero y la que solo paga al final", () => {
    expect(sedesDeCobro(MEDIOS).map((s) => [s.id, s.soloPaga])).toEqual([["tru", false], ["tal", true]]);
  });

  it("una tienda tiene sus cinco medios; el que no tiene cuenta queda vacío", () => {
    const c = cobrosDeSede(MEDIOS, "tru");
    expect(c.map((x) => x.medio)).toEqual(["yape", "plin", "tarjeta", "qr", "transferencia"]);
    expect(c.find((x) => x.medio === "plin")?.cuentaId).toBe("");
  });

  it("la que solo paga tiene una sola fila", () => {
    expect(cobrosDeSede(MEDIOS, "tal")).toEqual([{ medio: "transferencia", cuentaId: "bcp" }]);
  });

  it("los destinos no se repiten aunque varios cobros lleguen a la misma cuenta, y no inventan cuentas", () => {
    const d = destinosDeSede(cobrosDeSede(MEDIOS, "tru"), [cuenta("izi", "por_abonar"), cuenta("bcp", "banco"), cuenta("otra", "banco")]);
    expect(d.map((x) => x.id)).toEqual(["izi", "bcp"]);
  });

  it("bajo cada destino, su número o qué es", () => {
    expect(detalleDeDestino({ numero: "****4412", tipo: "banco" })).toBe("****4412");
    expect(detalleDeDestino({ numero: null, tipo: "por_abonar" })).toBe("Máquina de cobro");
    expect(detalleDeDestino({ numero: null, tipo: "banco" })).toBe("Banco o billetera");
  });

  it("el hilo sale horizontal de un lado y llega horizontal al otro", () => {
    expect(curvaHilo(0, 10, 100, 50)).toBe("M0 10C50 10 50 50 100 50");
  });
});

describe("las cuentas", () => {
  const todas = [cuenta("bcp", "banco"), cuenta("visa", "tarjeta_credito"), cuenta("cajon", "cajon"), cuenta("fuerte", "caja_fuerte"), cuenta("rendir", "por_rendir"), cuenta("vieja", "banco", true), cuenta("cajon-viejo", "cajon", true)];

  it("a la vista lo que se elige; plegado lo que nace solo y lo archivado", () => {
    const g = gruposDeCuentas(todas);
    expect(g.aLaVista.map((c) => c.id)).toEqual(["bcp", "visa"]);
    expect(g.deLasSedes.map((c) => c.id)).toEqual(["cajon", "fuerte", "rendir"]);
    expect(g.archivadas.map((c) => c.id)).toEqual(["vieja", "cajon-viejo"]);
  });

  it("ninguna cuenta se pierde al agrupar", () => {
    const g = gruposDeCuentas(todas);
    expect(g.aLaVista.length + g.deLasSedes.length + g.archivadas.length).toBe(todas.length);
  });

  it("el botón dice lo que abre", () => {
    expect(textoDeLoPlegado(6, 0)).toBe("Ver los 6 cajones y cajas");
    expect(textoDeLoPlegado(6, 1)).toBe("Ver los 6 cajones y cajas y la archivada");
    expect(textoDeLoPlegado(0, 2)).toBe("Ver las 2 archivadas");
  });

  it("un saldo que no toca ver no se inventa; lo que se debe va en negativo", () => {
    expect(saldoDeCuenta(null)).toBe("—");
    expect(saldoDeCuenta(-1200)).toMatch(/^−S\/\s?1,200$/);
    expect(saldoDeCuenta(0)).toMatch(/^S\/\s?0$/);
  });
});

describe("las máquinas", () => {
  const tarifa = (tasaPct: number): TarifaPos => ({ tasaPct, igvSobreTasa: true, cargoFijo: 0, diasAbono: 1, desde: null });
  const sede = (m: MedioCobro, t: TarifaPos | null) => ({ ubicacionId: "tru", ubicacionNombre: "Tienda TRU", medio: m, porDefecto: true, tarifa: t });

  it("sin tarifa en algún medio, le falta", () => {
    expect(maquinaSinTarifa({ sedes: [sede("tarjeta", tarifa(3)), sede("qr", null)] })).toBe(true);
    expect(maquinaSinTarifa({ sedes: [sede("tarjeta", tarifa(3))] })).toBe(false);
    expect(maquinaSinTarifa({ sedes: [] })).toBe(false);
  });

  it("si cobra igual en todo, lo dice una vez; si no, por medio", () => {
    expect(tarifaDeMaquina({ sedes: [sede("tarjeta", tarifa(3)), sede("qr", tarifa(3))] })).toBe("3 % + IGV · deposita al día hábil siguiente");
    expect(tarifaDeMaquina({ sedes: [sede("tarjeta", tarifa(3)), sede("qr", tarifa(2))] })).toBe("Tarjeta: 3 % + IGV · deposita al día hábil siguiente · QR: 2 % + IGV · deposita al día hábil siguiente");
    expect(tarifaDeMaquina({ sedes: [] })).toBe("");
  });
});

describe("por dónde empezar en los cobros", () => {
  it("nombra lo que no tiene cuenta en esta sede y avisa de las otras", () => {
    const m = [...MEDIOS, medio("lim", "Tienda LIM", "yape", null)];
    expect(primerPasoCobros(m, "tru")).toBe("Falta elegir la cuenta de Plin. También falta en LIM.");
  });

  it("varios se unen con «y»; sin nada aquí, solo dice dónde falta", () => {
    const todos = (["yape", "plin", "tarjeta", "qr", "transferencia"] as const).map((x) => medio("a", "Tienda LIM", x, x === "yape" || x === "plin" ? null : "bcp"));
    const otra = (["yape", "plin", "tarjeta", "qr", "transferencia"] as const).map((x) => medio("b", "Tienda TRU", x, "bcp"));
    expect(primerPasoCobros([...todos, ...otra], "a")).toBe("Falta elegir la cuenta de Yape y Plin.");
    expect(primerPasoCobros([...todos, ...otra], "b")).toBe("Falta en LIM.");
  });

  it("la sede que solo paga pide de qué cuenta paga", () => {
    const m = [medio("tal", "Taller", "transferencia", null), ...(["yape", "plin", "tarjeta", "qr", "transferencia"] as const).map((x) => medio("a", "Tienda LIM", x, "bcp"))];
    expect(primerPasoCobros(m, "tal")).toBe("Falta elegir de qué cuenta paga.");
  });

  it("con todo elegido o una sede que no existe, no dice nada", () => {
    const m = (["yape", "plin", "tarjeta", "qr", "transferencia"] as const).map((x) => medio("a", "Tienda LIM", x, "bcp"));
    expect(primerPasoCobros(m, "a")).toBeNull();
    expect(primerPasoCobros(m, "zzz")).toBeNull();
  });
});
