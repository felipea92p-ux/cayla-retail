import { describe, expect, it } from "vitest";
import {
  anioLima,
  avisoCumpleApagado,
  ayudaCumpleFueraDeMes,
  ayudaPieCumple,
  canjeSinConexion,
  cumpleEnCaja,
  descuentoClubLinea,
  descuentosParaRegistrar,
  diaYMesCorto,
  filaDelCumple,
  finDelMesLima,
  mesLima,
  PCT_CUMPLE_POR_DEFECTO,
  pctDelCanje,
  rechazoDelCanje,
  textoBotonCumple,
  textoCumpleCobrado,
  textoCumpleEnElRecibo,
  textoPieCumple,
  ticketConCumple,
  type ResumenCumple,
} from "./club-cumple-canje-reglas";

/**
 * [precio, descuento sin club, %, lo que da Postgres]: `round((precio − descuento) × pct / 100, 2)` con `numeric`, medido en
 * Postgres 17 el 2026-09-30. ES LA MISMA TABLA que `scripts/pruebas/club_cumpleanos.mjs` le pasa a la base (sección a): si
 * la caja y la base dan distinto, `registrar_venta` rechaza la venta con `cumple_descuento_distinto`.
 */
const MEDIDO_EN_POSTGRES: [number, number, number, number][] = [
  [79.9, 16.0, 10, 6.39], // la cascada del contrato: campaña 20 % (16.00) + 10 % → 22.39, un 28 %
  [79.9, 0, 10, 7.99],
  [89.9, 18.0, 10, 7.19],
  [149.9, 44.97, 10, 10.49],
  [79.9, 23.97, 10, 5.59],
  [99.9, 9.99, 15, 13.49],
  [59.9, 0, 12.5, 7.49],
  [199.9, 0, 33.33, 66.63],
  [39.9, 39.9, 10, 0],
  [0.04, 0, 10, 0],
  [0.05, 0, 10, 0.01], // medio céntimo: sube
  [12.35, 0, 10, 1.24],
  [1.15, 0, 10, 0.12],
  [100.05, 0, 10, 10.01],
  [1234.55, 0, 10, 123.46],
  // Medio céntimo donde la coma flotante se equivoca (`Math.round(x * 100) / 100` da un céntimo MENOS):
  [1.45, 0, 10, 0.15],
  [2.85, 0, 10, 0.29],
  [5.65, 0, 10, 0.57],
  [10.05, 0, 10, 1.01],
  [125.45, 0, 10, 12.55],
  [89.9, 4.45, 10, 8.55],
  [1.16, 0, 12.5, 0.15],
  [1.9, 0, 15, 0.29],
  [2.9, 0, 5, 0.15],
  [3.8, 0, 7.5, 0.29],
  [3.38, 3.33, 10, 0.01],
  [1.14, 0.99, 10, 0.02],
  [16.13, 15.98, 10, 0.02],
  [0.01, 0, 50, 0.01],
  [0.03, 0, 50, 0.02],
];

/** La cuenta ingenua, en coma flotante: lo que NO hay que hacer. */
const ingenua = (p: number, d: number, pct: number) => Math.round(((p - d) * pct) / 100 * 100) / 100;

describe("descuentoClubLinea: el mismo céntimo que Postgres", () => {
  it.each(MEDIDO_EN_POSTGRES)("S/ %s − %s al %s %% → %s", (precio, sinClub, pct, postgres) => {
    expect(descuentoClubLinea(precio, sinClub, pct)).toBe(postgres);
  });

  it("la coma flotante se equivoca en al menos 10 casos de la tabla (por eso la regla cuenta en enteros)", () => {
    const errados = MEDIDO_EN_POSTGRES.filter(([p, d, pct, postgres]) => ingenua(p, d, pct) !== postgres);
    expect(errados.length).toBeGreaterThanOrEqual(10);
  });

  it("de S/ 0.00 a S/ 300.00, céntimo por céntimo, con 6 % distintos: medio céntimo hacia arriba, siempre", () => {
    // Referencia independiente, en céntimos: round(c × pct / 100) con el % en centésimas de punto.
    // (con BigInt, sin la división de la regla: si la regla se equivocara al dividir, esta no se equivoca igual)
    const referencia = (centimos: number, pct: number) => {
      const num = BigInt(centimos) * BigInt(Math.round(pct * 100));
      return Number((BigInt(2) * num + BigInt(10_000)) / BigInt(20_000)) / 100;
    };
    const malos: string[] = [];
    for (const pct of [10, 12.5, 15, 5, 7.5, 33.33]) {
      for (let c = 0; c <= 30_000; c++) {
        const dio = descuentoClubLinea(c / 100, 0, pct);
        if (dio !== referencia(c, pct)) malos.push(`${c / 100} al ${pct} %: ${dio}`);
      }
    }
    expect(malos.slice(0, 5)).toEqual([]);
  });

  it("con descuento previo cuenta sobre lo que queda (cascada), no sobre el precio de lista", () => {
    expect(descuentoClubLinea(79.9, 16, 10)).toBe(6.39);
    expect(descuentoClubLinea(79.9, 0, 10)).toBe(7.99);
  });
});

describe("descuentosParaRegistrar: lo que viaja en p_items", () => {
  it("descuento_unitario es el TOTAL (sin club + club) y descuento_club_unitario, la parte del cumpleaños", () => {
    expect(descuentosParaRegistrar(16, 6.39)).toEqual({ descuento_unitario: 22.39, descuento_club_unitario: 6.39 });
  });
  it("suma al céntimo exacto, sin el ruido de la coma flotante (0.1 + 0.2 = 0.30000000000000004)", () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(descuentosParaRegistrar(0.1, 0.2).descuento_unitario).toBe(0.3);
  });
  it("sin canje, el ítem queda como siempre: club 0", () => {
    expect(descuentosParaRegistrar(16, 0)).toEqual({ descuento_unitario: 16, descuento_club_unitario: 0 });
  });
});

describe("ticketConCumple: las líneas y el total con el canje", () => {
  const ticket = [
    { clave: "campana", precioUnitario: 79.9, descuentoUnitario: 16, cantidad: 1 }, // campaña 20 % → 63.90
    { clave: "lista", precioUnitario: 79.9, descuentoUnitario: 0, cantidad: 2 },
    { clave: "sin-registrar", precioUnitario: 45, descuentoUnitario: 0, cantidad: 1 }, // la prenda sin registrar también
  ];

  it("cascada a toda la compra: la de campaña pasa de 20 % a 28 %, y el total baja lo que regala el club", () => {
    const t = ticketConCumple(ticket, 10);
    expect(t.lineas.map((l) => [l.clave, l.descuentoClubUnitario, l.precioFinalUnitario])).toEqual([
      ["campana", 6.39, 57.51],
      ["lista", 7.99, 71.91],
      ["sin-registrar", 4.5, 40.5],
    ]);
    const campana = t.lineas[0];
    expect(Math.round(((campana.descuentoUnitario + campana.descuentoClubUnitario) / campana.precioUnitario) * 100)).toBe(28);
    expect(t.totalSinCumple).toBe(268.7);
    expect(t.totalCumple).toBe(26.87); // 6.39 + 2 × 7.99 + 4.50: el `monto` del canje
    expect(t.total).toBe(241.83);
  });

  it("sin canje (pct null) todo queda igual y la parte del club es 0", () => {
    const t = ticketConCumple(ticket, null);
    expect(t.lineas.every((l) => l.descuentoClubUnitario === 0)).toBe(true);
    expect(t.totalCumple).toBe(0);
    expect(t.total).toBe(268.7);
  });

  it("conserva los campos propios de cada línea", () => {
    expect(ticketConCumple(ticket, 10).lineas.map((l) => l.clave)).toEqual(["campana", "lista", "sin-registrar"]);
  });
});

describe("el mes de Lima", () => {
  it("a las 23:30 de Lima del 30 de setiembre sigue siendo setiembre (en UTC ya es octubre)", () => {
    expect(mesLima(new Date("2026-10-01T04:30:00Z"))).toBe(9);
  });
  it("a las 00:00 de Lima ya es octubre", () => {
    expect(mesLima(new Date("2026-10-01T05:00:00Z"))).toBe(10);
  });
  it("el año del canje es el de Lima: el 31 de diciembre a las 20:00 todavía es el año que termina", () => {
    expect(anioLima(new Date("2027-01-01T01:00:00Z"))).toBe(2026);
  });
});

describe("cumpleEnCaja: qué muestra la caja de la clienta", () => {
  const SETIEMBRE = new Date("2026-09-15T15:00:00Z");
  const socia: ResumenCumple = { esSocia: true, cumpleMes: 9, cumpleDisponible: true, cumplePct: 10, cumpleCanjeadoEsteAnio: false };

  it("socia en su mes, sin canje este año y con conexión: «Canjear 10 %»", () => {
    expect(cumpleEnCaja(socia, true, SETIEMBRE)).toEqual({ tipo: "disponible", pct: 10 });
  });
  it("sin conexión no se ofrece (D-5)", () => {
    expect(cumpleEnCaja(socia, false, SETIEMBRE)).toEqual({ tipo: "sin_conexion", pct: 10 });
  });
  it("ya lo usó este año: «Cumpleaños ya canjeado» (aunque no haya conexión)", () => {
    expect(cumpleEnCaja({ ...socia, cumpleDisponible: false, cumpleCanjeadoEsteAnio: true }, false, SETIEMBRE)).toEqual({ tipo: "canjeado" });
  });
  it("no es socia, o la base no lo da por disponible: nada", () => {
    expect(cumpleEnCaja({ ...socia, esSocia: false }, true, SETIEMBRE)).toEqual({ tipo: "nada" });
    expect(cumpleEnCaja({ ...socia, cumpleDisponible: false }, true, SETIEMBRE)).toEqual({ tipo: "nada" });
    expect(cumpleEnCaja(null, true, SETIEMBRE)).toEqual({ tipo: "nada" });
  });
  it("la lectura de setiembre no ofrece el canje si la pantalla quedó abierta hasta octubre (la base diría cumple_fuera_de_mes)", () => {
    expect(cumpleEnCaja(socia, true, new Date("2026-10-01T05:00:00Z"))).toEqual({ tipo: "nada" });
  });
  it("sin % en la lectura, el de por defecto", () => {
    expect(cumpleEnCaja({ ...socia, cumplePct: null }, true, SETIEMBRE)).toEqual({ tipo: "disponible", pct: PCT_CUMPLE_POR_DEFECTO });
  });
});

describe("pctDelCanje: se apaga solo", () => {
  it("aplicado y disponible → el %; apagado, sin conexión, canjeado o nada → null", () => {
    expect(pctDelCanje(true, { tipo: "disponible", pct: 10 })).toBe(10);
    expect(pctDelCanje(false, { tipo: "disponible", pct: 10 })).toBeNull();
    expect(pctDelCanje(true, { tipo: "sin_conexion", pct: 10 })).toBeNull();
    expect(pctDelCanje(true, { tipo: "canjeado" })).toBeNull();
    expect(pctDelCanje(true, { tipo: "nada" })).toBeNull();
  });
});

describe("los textos", () => {
  it("«Canjear 10 %» en el botón, con el % de la base y sin ceros de más", () => {
    expect(textoBotonCumple(10)).toBe("Canjear 10 %");
    expect(textoBotonCumple(15.0)).toBe("Canjear 15 %");
    expect(textoBotonCumple(12.5)).toBe("Canjear 12.5 %");
  });
  it("el pie del ticket es UNA línea de toda la compra (spike, punto 9), con su ayuda", () => {
    expect(textoPieCumple(10)).toBe("Cumpleaños del club · 10 % de la compra");
    expect(ayudaPieCumple(10, 461.2)).toBe("10 % de toda la compra (S/461.20), sobre lo ya rebajado");
    expect(textoPieCumple(12.5)).toBe("Cumpleaños del club · 12.5 % de la compra");
  });
  it("después de cobrar y en el papel", () => {
    expect(textoCumpleCobrado(46.12)).toBe(
      "Cumpleaños canjeado (−S/46.12). No puede usarlo otra vez hasta el año que viene; devolver la compra tampoco lo devuelve."
    );
    expect(textoCumpleEnElRecibo(10, 46.12)).toBe("Incluye 10 % de cumpleaños del club: -46.12");
  });
  it("fuera de su mes, la ayuda dice el % de la base (o el de por defecto)", () => {
    expect(ayudaCumpleFueraDeMes(10)).toBe("El 10 % se abre solo en su mes.");
    expect(ayudaCumpleFueraDeMes(12.5)).toBe("El 12.5 % se abre solo en su mes.");
    expect(ayudaCumpleFueraDeMes(null)).toBe(`El ${PCT_CUMPLE_POR_DEFECTO} % se abre solo en su mes.`);
  });
});

describe("las fechas de la fila", () => {
  it("«12 sep» del día del canje; null si no llega una fecha", () => {
    expect(diaYMesCorto("2026-09-12")).toBe("12 sep");
    expect(diaYMesCorto("2026-01-05")).toBe("5 ene");
    expect(diaYMesCorto(null)).toBeNull();
    expect(diaYMesCorto("")).toBeNull();
    expect(diaYMesCorto("2026-13-01")).toBeNull();
  });
  it("hasta el último día del mes de LIMA (a las 23:30 del 30 de setiembre en Lima, en UTC ya es octubre)", () => {
    expect(finDelMesLima(new Date("2026-09-15T15:00:00Z"))).toBe("30 sep");
    expect(finDelMesLima(new Date("2026-10-01T04:30:00Z"))).toBe("30 sep");
    expect(finDelMesLima(new Date("2026-10-01T05:00:00Z"))).toBe("31 oct");
    expect(finDelMesLima(new Date("2028-02-10T15:00:00Z"))).toBe("29 feb"); // bisiesto
    expect(finDelMesLima(new Date("2027-02-10T15:00:00Z"))).toBe("28 feb");
    expect(finDelMesLima(new Date("2026-12-31T20:00:00Z"))).toBe("31 dic");
  });
});

describe("filaDelCumple: lo que dibuja la caja de la clienta (spike, `partesClub`)", () => {
  const SETIEMBRE = new Date("2026-09-15T15:00:00Z");

  it("disponible: «Cumple este mes · 10 % disponible», hasta el fin de su mes, con «Canjear 10 %» (primario)", () => {
    const f = filaDelCumple({ tipo: "disponible", pct: 10 }, false, null, SETIEMBRE);
    expect(f).toMatchObject({
      tipo: "canje",
      destacado: "Cumple este mes",
      resto: "10 % disponible",
      bajada: "10 % de toda la compra, sobre lo ya rebajado · hasta el 30 sep",
      boton: { texto: "Canjear 10 %", primario: true, accion: "canjear" },
      pildora: { texto: "Canjear 10 %", accion: "canjear" },
    });
  });
  it("aplicado: «Quitar» en la fila (secundario) y «Quitar 10 %» en la píldora", () => {
    const f = filaDelCumple({ tipo: "disponible", pct: 10 }, true, null, SETIEMBRE);
    expect(f).toMatchObject({ boton: { texto: "Quitar", primario: false, accion: "quitar" }, pildora: { texto: "Quitar 10 %", accion: "quitar" } });
  });
  it("sin conexión: el botón se apaga (sin acción) y la bajada lo dice", () => {
    const f = filaDelCumple({ tipo: "sin_conexion", pct: 10 }, false, null, SETIEMBRE);
    expect(f).toMatchObject({
      tipo: "canje",
      bajada: "Sin conexión el botón se apaga",
      boton: { texto: "Sin conexión", accion: null },
      pildora: { texto: "Sin conexión", accion: null },
    });
  });
  it("el % sale de la base: 12.5 dice 12.5 en todo", () => {
    const f = filaDelCumple({ tipo: "disponible", pct: 12.5 }, false, null, SETIEMBRE);
    expect(f).toMatchObject({ resto: "12.5 % disponible", boton: { texto: "Canjear 12.5 %" } });
    expect(f?.tipo === "canje" && f.bajada.startsWith("12.5 % de toda la compra")).toBe(true);
  });
  it("ya canjeado: el candado con el día, o «este año» si la base no lo trae", () => {
    expect(filaDelCumple({ tipo: "canjeado" }, false, "2026-09-12", SETIEMBRE)).toMatchObject({
      tipo: "canjeado",
      destacado: "Cumpleaños canjeado",
      resto: "el 12 sep",
      bajada: "Una vez al año",
    });
    expect(filaDelCumple({ tipo: "canjeado" }, false, null, SETIEMBRE)).toMatchObject({ resto: "este año" });
  });
  it("con el vale de aniversario puesto, el canje se apaga y dice por qué (una ventaja por compra, tanda 1g)", () => {
    const f = filaDelCumple({ tipo: "disponible", pct: 10 }, false, null, SETIEMBRE, true);
    expect(f).toMatchObject({
      tipo: "canje",
      bajada: "Ya usa su vale de aniversario: una sola ventaja del club por compra",
      boton: { texto: "Canjear 10 %", primario: false, accion: null },
      pildora: { accion: null },
    });
    // Si el cumpleaños ya estaba puesto, se puede quitar igual.
    expect(filaDelCumple({ tipo: "disponible", pct: 10 }, true, null, SETIEMBRE, true)).toMatchObject({ boton: { accion: "quitar" } });
  });
  it("nada: la caja sigue con lo de la tanda 1b (su fecha o «Sin cumpleaños»)", () => {
    expect(filaDelCumple({ tipo: "nada" }, false, null, SETIEMBRE)).toBeNull();
    expect(filaDelCumple({ tipo: "nada" }, true, null, SETIEMBRE)).toBeNull();
  });
});

describe("cuando algo lo apaga", () => {
  it("el aviso cuando se apaga solo dice por qué", () => {
    expect(avisoCumpleApagado("sin_conexion", 10).titulo).toBe("Se quitó el 10 % de cumpleaños");
    expect(avisoCumpleApagado("sin_conexion", 10).detalle).toMatch(/^Sin conexión no se canjea/);
    expect(avisoCumpleApagado("no_disponible", 10).detalle).toMatch(/^Ya no está disponible/);
  });

  const LOS_SIETE = [
    "cumple_sin_clienta",
    "cumple_no_socia",
    "cumple_fuera_de_mes",
    "cumple_ya_canjeado",
    "cumple_descuento_distinto",
    "cumple_sin_canje",
    "cumple_sin_monto",
  ];
  it.each(LOS_SIETE)("%s apaga el canje y dice que la venta no se guardó (nunca se vuelve a mandar sola sin el descuento)", (hint) => {
    const r = rechazoDelCanje(hint, 10);
    expect(r).not.toBeNull();
    expect(r?.detalle).toMatch(/^La venta no se guardó\. /);
    expect(r?.detalle).toContain("Quité el 10 %");
  });
  it("vuelve a leer su resumen cuando la base sabe algo que la caja no (ya canjeado, fuera de mes, no socia, % distinto)", () => {
    const releen = LOS_SIETE.filter((h) => rechazoDelCanje(h, 10)?.releer);
    expect(releen.sort()).toEqual(["cumple_descuento_distinto", "cumple_fuera_de_mes", "cumple_no_socia", "cumple_ya_canjeado"]);
  });
  it("una sola ventaja del club por compra (tanda 1g): también apaga el cumpleaños y relee", () => {
    expect(rechazoDelCanje("club_un_cupon_por_compra", 10)).toMatchObject({ releer: true });
    expect(rechazoDelCanje("club_un_cupon_por_compra", 10)?.detalle).toContain("Quité el 10 %");
  });
  it("un rechazo que no es del canje no lo toca (clienta_anonimizada lo traduce error-escritura y se quita a la clienta)", () => {
    expect(rechazoDelCanje("clienta_anonimizada", 10)).toBeNull();
    expect(rechazoDelCanje("stock_insuficiente", 10)).toBeNull();
    expect(rechazoDelCanje(null, 10)).toBeNull();
    expect(rechazoDelCanje(undefined, 10)).toBeNull();
  });
  it("sin conexión con el canje: no va a la cola, y lo dice", () => {
    expect(canjeSinConexion(10).titulo).toBe("Se cortó la conexión: el 10 % de cumpleaños no se guarda sin internet");
    expect(canjeSinConexion(10).detalle).toContain("no la duplica");
  });
});
