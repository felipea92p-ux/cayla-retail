import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  SIN_UNIDADES_LIBRES,
  cargaParaLaFrase,
  cifrasPorRegularizar,
  coincideConBusqueda,
  estaVencida,
  notaSinUnidades,
  ordenarVentas,
  prendaSinCargar,
  resueltasDesde,
  siguienteOrden,
  tipoDiferencia,
} from "./por-regularizar-reglas";

const ahora = new Date("2026-09-23T15:00:00-05:00");

describe("resueltasDesde", () => {
  it("el 1.º del mes anterior a las 00:00 de Lima", () => expect(resueltasDesde(new Date("2026-10-03T15:00:00-05:00"))).toBe("2026-09-01T00:00:00-05:00"));
  it("en enero retrocede a diciembre del año anterior", () => expect(resueltasDesde(new Date("2027-01-15T10:00:00-05:00"))).toBe("2026-12-01T00:00:00-05:00"));
  it("cuenta el mes de Lima: el 31 de octubre a las 22:00 ya es noviembre en UTC, pero en Lima sigue siendo octubre", () =>
    expect(resueltasDesde(new Date("2026-11-01T03:00:00Z"))).toBe("2026-09-01T00:00:00-05:00"));
  it("siempre cubre el mes completo en curso (las cifras «este mes» dependen de eso)", () => {
    const primeroDelMes = Date.parse("2026-10-01T00:00:00-05:00");
    expect(Date.parse(resueltasDesde(new Date("2026-10-01T00:30:00-05:00")))).toBeLessThanOrEqual(primeroDelMes);
  });
});

describe("estaVencida", () => {
  it("un día después, todavía no", () => expect(estaVencida("2026-09-22T15:00:00-05:00", ahora)).toBe(false));
  it("justo a los 2 días, sí", () => expect(estaVencida("2026-09-21T15:00:00-05:00", ahora)).toBe(true));
});

describe("tipoDiferencia", () => {
  it("cobrar menos es descuento no planificado", () => expect(tipoDiferencia(-20)).toBe("descuento"));
  it("cobrar más es sobreprecio", () => expect(tipoDiferencia(10)).toBe("sobreprecio"));
  it("igual al precio oficial", () => expect(tipoDiferencia(0)).toBe("exacto"));
});

describe("cifrasPorRegularizar", () => {
  it("cuenta pendientes y vencidas, y separa descuento y sobreprecio del mes (Lima)", () => {
    const f = (estado: string, vendidoEn: string, diferencia: number | null) => ({ estado, vendidoEn, diferencia });
    expect(
      cifrasPorRegularizar(
        [
          f("pendiente", "2026-09-23T10:00:00-05:00", null),
          f("pendiente", "2026-09-20T10:00:00-05:00", null),
          f("regularizada", "2026-09-10T10:00:00-05:00", -20),
          f("regularizada", "2026-09-11T10:00:00-05:00", 10),
          f("regularizada", "2026-08-31T20:00:00-05:00", -99), // agosto en Lima, aunque en UTC ya es septiembre
          f("anulada", "2026-09-12T10:00:00-05:00", null),
        ],
        ahora,
      ),
    ).toEqual({ pendientes: 2, vencidas: 1, descuentoMes: 20, sobreprecioMes: 10 });
  });
});

const venta = (id: string, extra: Partial<Parameters<typeof ordenarVentas>[0][number]> = {}) => ({
  id,
  descripcion: "Polos · Vino",
  vendidoEn: "2026-10-05T10:00:00-05:00",
  precioCobrado: 35,
  estado: "pendiente",
  ...extra,
});
const ids = (filas: { id: string }[]) => filas.map((f) => f.id);

describe("ordenarVentas", () => {
  const hoy = new Date("2026-10-06T15:00:00-05:00");
  const abajo = { campo: "vendio", dir: "desc" } as const;
  it("por fecha, de la más reciente a la más antigua, mezclando pendientes y resueltas", () => {
    const filas = [venta("a", { vendidoEn: "2026-10-01T10:00:00-05:00" }), venta("b", { vendidoEn: "2026-10-05T09:00:00-05:00", estado: "regularizada" }), venta("c", { vendidoEn: "2026-09-20T18:00:00-05:00" })];
    expect(ids(ordenarVentas(filas, abajo, hoy))).toEqual(["b", "a", "c"]);
    expect(ids(ordenarVentas(filas, { campo: "vendio", dir: "asc" }, hoy))).toEqual(["c", "a", "b"]);
  });
  it("no toca la lista original", () => {
    const filas = [venta("a", { vendidoEn: "2026-10-01T10:00:00-05:00" }), venta("b")];
    ordenarVentas(filas, abajo, hoy);
    expect(ids(filas)).toEqual(["a", "b"]);
  });
  it("dos ventas del mismo instante quedan siempre en el mismo orden (por id)", () => {
    expect(ids(ordenarVentas([venta("z"), venta("a")], abajo, hoy))).toEqual(["a", "z"]);
  });
  it("por cobrado, de mayor a menor, y al invertir de menor a mayor", () => {
    const filas = [venta("a", { precioCobrado: 35 }), venta("b", { precioCobrado: 79.9 }), venta("c", { precioCobrado: 9.9 })];
    expect(ids(ordenarVentas(filas, { campo: "cobrado", dir: "desc" }, hoy))).toEqual(["b", "a", "c"]);
    expect(ids(ordenarVentas(filas, { campo: "cobrado", dir: "asc" }, hoy))).toEqual(["c", "a", "b"]);
  });
  it("por prenda, de la A a la Z sin importar tildes ni mayúsculas", () => {
    const filas = [venta("a", { descripcion: "polos · vino" }), venta("b", { descripcion: "Álbum" }), venta("c", { descripcion: "Bodys" })];
    expect(ids(ordenarVentas(filas, { campo: "prenda", dir: "asc" }, hoy))).toEqual(["b", "c", "a"]);
  });
  it("por estado, lo más urgente primero: vencida, pendiente, regularizada, cerrada, anulada", () => {
    const filas = [
      venta("anulada", { estado: "anulada" }),
      venta("cerrada", { estado: "cerrada_sin_prenda" }),
      venta("pendiente", { vendidoEn: "2026-10-06T09:00:00-05:00" }),
      venta("vencida", { vendidoEn: "2026-10-01T09:00:00-05:00" }),
      venta("regularizada", { estado: "regularizada" }),
    ];
    expect(ids(ordenarVentas(filas, { campo: "estado", dir: "desc" }, hoy))).toEqual(["vencida", "pendiente", "regularizada", "cerrada", "anulada"]);
  });
  it("con un empate en la columna elegida, la venta más reciente va primero", () => {
    const filas = [venta("vieja", { vendidoEn: "2026-10-01T10:00:00-05:00" }), venta("nueva", { vendidoEn: "2026-10-05T10:00:00-05:00" })];
    expect(ids(ordenarVentas(filas, { campo: "cobrado", dir: "asc" }, hoy))).toEqual(["nueva", "vieja"]);
  });
});

describe("siguienteOrden", () => {
  it("el mismo campo invierte", () => {
    expect(siguienteOrden({ campo: "cobrado", dir: "desc" }, "cobrado")).toEqual({ campo: "cobrado", dir: "asc" });
    expect(siguienteOrden({ campo: "cobrado", dir: "asc" }, "cobrado")).toEqual({ campo: "cobrado", dir: "desc" });
  });
  it("un campo nuevo arranca de mayor a menor, salvo la prenda (A–Z)", () => {
    expect(siguienteOrden({ campo: "vendio", dir: "desc" }, "cobrado")).toEqual({ campo: "cobrado", dir: "desc" });
    expect(siguienteOrden({ campo: "vendio", dir: "desc" }, "prenda")).toEqual({ campo: "prenda", dir: "asc" });
  });
});

describe("coincideConBusqueda", () => {
  const f = { descripcion: "Polos · Vino · Talla Estándar", categoria: "Polos", talla: "Estándar", color: "Vino", vendidoPor: "Pamela Burgos", sede: "Tienda TRU", prendaReal: null, precioCobrado: 35 };
  it("sin nada escrito, todo coincide", () => expect(coincideConBusqueda(f, "  ")).toBe(true));
  it("sin mayúsculas ni tildes, en cualquier orden", () => {
    expect(coincideConBusqueda(f, "ESTANDAR polo")).toBe(true);
    expect(coincideConBusqueda(f, "pamela vino")).toBe(true);
  });
  it("busca también el precio cobrado y la sede", () => {
    expect(coincideConBusqueda(f, "35.00")).toBe(true);
    expect(coincideConBusqueda(f, "tru")).toBe(true);
  });
  it("todas las palabras tienen que cumplirse", () => expect(coincideConBusqueda(f, "polo nicole")).toBe(false));
  it("por inicio de palabra: «ron» no encuentra «Burgos»", () => {
    expect(coincideConBusqueda(f, "burg")).toBe(true);
    expect(coincideConBusqueda(f, "urgos")).toBe(false);
  });
  it("encuentra la prenda real de una ya regularizada", () => expect(coincideConBusqueda({ ...f, prendaReal: "Blusa Aurora · BLU-AUR-ROS-M" }, "aurora")).toBe(true));
});

// ---- Lo que la base va a rechazar, dicho antes del botón (20261004204000; rescatado de #788 en la revisión adversarial de #975) ----
// La migración promete que «la web dice las MISMAS frases antes del botón (`prendaSinCargar`, lib/por-regularizar-reglas.ts) y las
// pruebas comparan las dos al carácter». Aquí se arman las frases DESDE el texto de la migración (sus `raise exception` con `%`) y se
// comparan con las de la web; la prueba SQL (`scripts/pruebas/ventas_sin_registrar.mjs`, R6b, R6f y R6h) compara la base con las mismas.
const MIGRACION = readFileSync(new URL("../../../supabase/migrations/20261004204000_nadie_regulariza_su_propia_venta.sql", import.meta.url), "utf8");
const PRUEBA_SQL = readFileSync(new URL("../../../scripts/pruebas/ventas_sin_registrar.mjs", import.meta.url), "utf8");

/** La plantilla de un `raise exception '…'` de la migración que empieza con `inicio`. */
function plantilla(inicio: string): string {
  const m = MIGRACION.match(new RegExp(`raise exception '(${inicio.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^']*)'`));
  if (!m) throw new Error(`la migración ya no tiene «${inicio}…»`);
  return m[1]!;
}
/** Lo que hace `raise exception` con sus `%`: cada uno, el siguiente argumento. */
const formatear = (p: string, ...args: string[]) => {
  let i = 0;
  return p.replace(/%/g, () => args[i++] ?? "");
};
const ABIERTA = plantilla("Esta prenda todavía no está cargada en ");
const CERRADA = plantilla("La carga de % se cerró");

describe("prendaSinCargar — la MISMA frase con que la base rechaza una prenda que nunca entró a la tienda", () => {
  it("carga abierta sin fecha (AQP y LIM hoy): «primero cárgala», al carácter", () => {
    expect(prendaSinCargar("Tienda Trujillo", { abierta: true, hastaCorta: null })).toBe(formatear(ABIERTA, "Tienda Trujillo", "Tienda Trujillo", ""));
    // Y es la misma que la prueba SQL espera de la base (R6b).
    expect(PRUEBA_SQL).toContain(`"${prendaSinCargar("Tienda Trujillo", { abierta: true, hastaCorta: null })}"`);
  });
  it("carga abierta con fecha: dice hasta cuándo", () =>
    expect(prendaSinCargar("Tienda Trujillo", { abierta: true, hastaCorta: "15-oct" })).toBe(formatear(ABIERTA, "Tienda Trujillo", "Tienda Trujillo", " hasta el 15-oct")));
  it("carga cerrada: «Encontré prendas», con y sin fecha", () => {
    expect(prendaSinCargar("Tienda Trujillo", { abierta: false, hastaCorta: "15-oct" })).toBe(formatear(CERRADA, "Tienda Trujillo", " el 15-oct"));
    expect(prendaSinCargar("Tienda Trujillo", { abierta: false, hastaCorta: null })).toBe(formatear(CERRADA, "Tienda Trujillo", ""));
  });
  it("sin saber la carga, la frase que no afirma nada de ella; sin nombre de sede, «esta tienda» (como la base)", () => {
    expect(prendaSinCargar("Tienda Arequipa")).toBe(
      "Esta prenda todavía no está cargada en Tienda Arequipa: primero cárgala con su stock inicial (lo que hay hoy en la tienda, sin la vendida) y vuelve a regularizarla.",
    );
    expect(prendaSinCargar("", { abierta: true, hastaCorta: null })).toBe(formatear(ABIERTA, "esta tienda", "esta tienda", ""));
  });
});

describe("cargaParaLaFrase — la carga leída con fn_carga_inicial_sedes, como la dice la base", () => {
  it("abierta hasta una fecha, cerrada después de ella, sin fecha abierta, y sin lectura nada", () => {
    expect(cargaParaLaFrase({ sede: "TRU", hasta: "2026-10-15", hoy: "2026-10-15" })).toEqual({ abierta: true, hastaCorta: "15-oct" });
    expect(cargaParaLaFrase({ sede: "TRU", hasta: "2026-10-15", hoy: "2026-10-16" })).toEqual({ abierta: false, hastaCorta: "15-oct" });
    expect(cargaParaLaFrase({ sede: "AQP", hasta: null, hoy: "2026-10-12" })).toEqual({ abierta: true, hastaCorta: null });
    expect(cargaParaLaFrase(null)).toBeNull();
  });
});

describe("notaSinUnidades — la nota en ámbar del puente", () => {
  const base = { sede: "Tienda Trujillo", carga: { abierta: true, hastaCorta: null } };
  it("una prenda que nunca entró a la tienda: la frase de la base, NO «elige Llegó nueva» (la base también rechaza esa)", () => {
    const nota = notaSinUnidades({ ...base, disponible: 0, cargada: false });
    expect(nota).toBe(prendaSinCargar("Tienda Trujillo", base.carga));
    expect(nota).not.toContain("Llegó nueva");
    // Aunque no se hayan podido leer las unidades libres.
    expect(notaSinUnidades({ ...base, disponible: null, cargada: false })).toBe(nota);
  });
  it("sin unidades libres pero cargada (o sin poder saberlo): lo de antes", () => {
    expect(notaSinUnidades({ ...base, disponible: 0, cargada: true })).toBe(SIN_UNIDADES_LIBRES);
    expect(notaSinUnidades({ ...base, disponible: 0, cargada: null })).toBe(SIN_UNIDADES_LIBRES);
  });
  it("mientras la lectura no vuelve, nada (no dice una cosa para corregirla al instante); con unidades libres, nada", () => {
    expect(notaSinUnidades({ ...base, disponible: 0, cargada: undefined })).toBeNull();
    expect(notaSinUnidades({ ...base, disponible: 3, cargada: null })).toBeNull();
    expect(notaSinUnidades({ ...base, disponible: null, cargada: true })).toBeNull();
  });
});
