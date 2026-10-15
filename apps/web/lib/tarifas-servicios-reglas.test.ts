import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FASES } from "./orden-fases-reglas";
import {
  TARIFA_MAXIMA,
  argumentosDeTarifa,
  entradaDesde,
  leerTarifasDeServicios,
  problemasDeTarifa,
  serviciosParaTarifar,
  tarifasPorServicio,
  textoFijo,
  textoMinimo,
  textoTarifa,
  textoTarifaGuardada,
  tarifaVigenteDe,
  textoDeLoQueSeReemplaza,
  textoVigencia,
  type EntradaDeTarifa,
  type TarifaDeServicio,
} from "./tarifas-servicios-reglas";

// La lista de precios de los servicios (ADR-0400, actividad 8c): lo que la pantalla lee y lo que escribe coinciden con `fn_tarifas_de_servicios` y `guardar_tarifa_servicio`. La paridad se comprueba
// LEYENDO la migración, no copiando sus números.

const MIGRACION = readFileSync(join(__dirname, "../../../supabase/migrations/20261015172000_produccion_tarifas_de_servicios.sql"), "utf8");

const cruda = (o: Record<string, unknown> = {}) => ({
  proveedor_id: "p1",
  proveedor_nombre: "Confecciones del Norte",
  rubro: "maquila",
  activo: true,
  fase_clave: "costura",
  tarifa_prenda: 4.5,
  cantidad_minima: 50,
  fijo_orden: 0,
  vigente_desde: "2026-10-01",
  nota: null,
  versiones: 1,
  ...o,
});

const entrada = (o: Partial<EntradaDeTarifa> = {}): EntradaDeTarifa => ({ proveedorId: "p1", fase: "costura", tarifa: "4.50", minimo: "", fijo: "", nota: "", ...o });

describe("paridad con la base", () => {
  it("el tope de monto y de fijo es el de la base", () => {
    expect(MIGRACION).toContain(`p_tarifa_prenda > ${TARIFA_MAXIMA}`);
    expect(MIGRACION).toContain(`coalesce(p_fijo_orden, 0) > ${TARIFA_MAXIMA}`);
  });

  it("las seis fases son las que la base acepta, y todas las de la web están en la lista de la base", () => {
    const enLaBase = /p_fase_clave not in \(([^)]*)\)/.exec(MIGRACION)?.[1].split(",").map((s) => s.trim().replace(/'/g, "")) ?? [];
    expect([...enLaBase].sort()).toEqual(FASES.map((f) => f.clave as string).sort());
  });

  it("la lista sale en el orden de la ruta, el mismo de la base", () => {
    const enLaBase = /array\[('corte'[^\]]*)\]/.exec(MIGRACION)?.[1].split(",").map((s) => s.trim().replace(/'/g, "")) ?? [];
    const lista = leerTarifasDeServicios(
      [...enLaBase].reverse().map((fase) => cruda({ fase_clave: fase })),
    );
    const salida = tarifasPorServicio(lista ?? [], serviciosParaTarifar([{ id: "p1", nombre: "X", rubro: "maquila", activo: true }]))[0].tarifas.map((t) => t.fase);
    expect(salida).toEqual(enLaBase);
  });

  it("cada motivo que la web da (`hint`) existe en la base, y al revés", () => {
    const enLaWeb = new Set<string>(
      [entrada({ proveedorId: "", fase: "", tarifa: "", minimo: "x", fijo: "x" }), entrada({ minimo: "0" })].flatMap((e) => problemasDeTarifa(e).map((p) => p.hint)),
    );
    const enLaBase = new Set([...MIGRACION.matchAll(/hint = '(tarifa_[a-z_]+)'/g)].map((m) => m[1]));
    for (const h of enLaWeb) expect(enLaBase.has(h), h).toBe(true);
    // Los dos que la web no repite: el proveedor que no es de servicio y el que no es líder se explican con la pantalla (no se ofrece).
    expect([...enLaBase].filter((h) => !enLaWeb.has(h)).sort()).toEqual(["tarifa_no_es_servicio", "tarifa_solo_lider"]);
  });

  it("los servicios son los de rubro distinto de tela y avíos, como en la base", () => {
    expect(MIGRACION).toContain("pr.rubro not in ('tela', 'avios')");
    const lista = serviciosParaTarifar([
      { id: "a", nombre: "Tela", rubro: "tela", activo: true },
      { id: "b", nombre: "Avíos", rubro: "avios", activo: true },
      { id: "c", nombre: "Costura", rubro: "maquila", activo: true },
      { id: "d", nombre: "Otro", rubro: "otro", activo: true },
      { id: "e", nombre: "Archivado", rubro: "maquila", activo: false },
    ]);
    expect(lista.map((s) => s.id)).toEqual(["c", "d"]);
  });
});

describe("leerTarifasDeServicios", () => {
  it("una respuesta que no es lista (la base responde NULL a quien no es líder) no es «no hay tarifas»", () => {
    expect(leerTarifasDeServicios(null)).toBeNull();
    expect(leerTarifasDeServicios({})).toBeNull();
    expect(leerTarifasDeServicios([])).toEqual([]);
  });

  it("lee una tarifa completa y trae los números como número aunque lleguen como texto", () => {
    const [t] = leerTarifasDeServicios([cruda({ tarifa_prenda: "4.50", cantidad_minima: "50", fijo_orden: "12.5", versiones: "3", nota: "Con hilo propio" })]) ?? [];
    expect(t).toMatchObject({ proveedorId: "p1", fase: "costura", tarifaPrenda: 4.5, cantidadMinima: 50, fijoOrden: 12.5, versiones: 3, nota: "Con hilo propio" });
  });

  it("descarta lo que no entiende en vez de dibujarlo a medias", () => {
    const sale = leerTarifasDeServicios([
      cruda(),
      cruda({ fase_clave: "tejido" }),
      cruda({ tarifa_prenda: 0 }),
      cruda({ tarifa_prenda: "x" }),
      cruda({ proveedor_id: null }),
      cruda({ vigente_desde: null }),
      "texto",
      null,
    ]);
    expect(sale).toHaveLength(1);
  });

  it("sin mínimo es `null` (no cero) y un fijo negativo no existe", () => {
    const [t] = leerTarifasDeServicios([cruda({ cantidad_minima: null, fijo_orden: -3 })]) ?? [];
    expect(t.cantidadMinima).toBeNull();
    expect(t.fijoOrden).toBe(0);
  });
});

describe("los textos", () => {
  const t = (o: Partial<TarifaDeServicio> = {}): TarifaDeServicio => ({
    proveedorId: "p1", proveedorNombre: "N", activo: true, fase: "costura", tarifaPrenda: 4.5, cantidadMinima: null, fijoOrden: 0, vigenteDesde: "2026-10-01", nota: null, versiones: 1, ...o,
  });

  it("tarifa, mínimo y fijo", () => {
    expect(textoTarifa(t())).toBe("S/ 4.50 por prenda");
    expect(textoMinimo(t())).toBe("Sin mínimo");
    expect(textoMinimo(t({ cantidadMinima: 1 }))).toBe("Desde 1 prenda");
    expect(textoMinimo(t({ cantidadMinima: 50 }))).toBe("Desde 50 prendas");
    expect(textoFijo(t())).toBeNull();
    expect(textoFijo(t({ fijoOrden: 12.5 }))).toBe("+ S/ 12.50 por orden");
  });

  it("la vigencia dice hoy, ayer o el día", () => {
    expect(textoVigencia(t({ vigenteDesde: "2026-10-15" }), "2026-10-15")).toBe("Desde hoy");
    expect(textoVigencia(t({ vigenteDesde: "2026-10-14" }), "2026-10-15")).toBe("Desde ayer");
    expect(textoVigencia(t({ vigenteDesde: "2026-10-01" }), "2026-10-15")).toMatch(/^Desde el .*1/);
  });

  it("el aviso de éxito nombra al servicio, la fase y la tarifa", () => {
    expect(textoTarifaGuardada("Confecciones del Norte", "costura", 4.5)).toBe("Tarifa de Confecciones del Norte para Costura: S/ 4.50 por prenda");
  });
});

describe("textoDeLoQueSeReemplaza", () => {
  const vigente = (o: Record<string, unknown> = {}) => (leerTarifasDeServicios([cruda(o)]) ?? [])[0];

  it("una tarifa de antes queda como historia y la nueva rige desde hoy", () => {
    expect(textoDeLoQueSeReemplaza(vigente({ vigente_desde: "2026-10-01" }), "2026-10-15", true)).toBe(
      "Ahora cobra S/ 4.50 por prenda, desde 50 prendas. Rige desde el " + textoVigencia({ vigenteDesde: "2026-10-01" }, "2026-10-15").slice("Desde el ".length) + ". La nueva rige desde hoy y esta queda guardada como historia.",
    );
  });

  it("una tarifa cargada hoy se corrige, no se archiva", () => {
    expect(textoDeLoQueSeReemplaza(vigente({ vigente_desde: "2026-10-15", cantidad_minima: null, fijo_orden: 12.5 }), "2026-10-15", true)).toBe(
      "Ahora cobra S/ 4.50 por prenda, + S/ 12.50 por orden. Como se cargó hoy, lo que guardes la corrige.",
    );
  });

  it("al agregar sobre una fase que ya tiene precio, avisa cuál reemplaza", () => {
    expect(textoDeLoQueSeReemplaza(vigente({ vigente_desde: "2026-10-14" }), "2026-10-15", false)).toMatch(/^Ya tiene una tarifa en Costura: S\/ 4\.50 por prenda, desde 50 prendas\. Rige desde ayer\./);
  });
});

describe("tarifasPorServicio", () => {
  it("un servicio sin ninguna tarifa también sale (es el que falta cargar) y el orden es por nombre", () => {
    const tarifas = leerTarifasDeServicios([cruda({ proveedor_id: "b", proveedor_nombre: "Bordados Lima", fase_clave: "bordado" }), cruda({ proveedor_id: "b", proveedor_nombre: "Bordados Lima", fase_clave: "costura" })]) ?? [];
    const filas = tarifasPorServicio(tarifas, serviciosParaTarifar([{ id: "a", nombre: "Acabados Sur", rubro: "maquila", activo: true }, { id: "b", nombre: "Bordados Lima", rubro: "maquila", activo: true }]));
    expect(filas.map((f) => [f.nombre, f.tarifas.length])).toEqual([["Acabados Sur", 0], ["Bordados Lima", 2]]);
    expect(filas[1].tarifas.map((x) => x.fase)).toEqual(["bordado", "costura"]);
  });
});

describe("tarifaVigenteDe", () => {
  it("encuentra la tarifa de ese servicio en esa fase, o ninguna", () => {
    const tarifas = leerTarifasDeServicios([cruda(), cruda({ fase_clave: "corte" }), cruda({ proveedor_id: "p2" })]) ?? [];
    expect(tarifaVigenteDe(tarifas, "p1", "corte")?.fase).toBe("corte");
    expect(tarifaVigenteDe(tarifas, "p1", "bordado")).toBeNull();
    expect(tarifaVigenteDe(tarifas, "p3", "costura")).toBeNull();
  });
});

describe("lo que la persona escribe", () => {
  it("una tarifa completa y bien escrita no tiene problemas, y se manda con los números como número", () => {
    const e = entrada({ tarifa: "4,50", minimo: "50", fijo: "12.5", nota: "  con hilo  " });
    expect(problemasDeTarifa(e)).toEqual([]);
    expect(argumentosDeTarifa(e)).toEqual({ p_proveedor_id: "p1", p_fase_clave: "costura", p_tarifa_prenda: 4.5, p_cantidad_minima: 50, p_fijo_orden: 12.5, p_nota: "con hilo" });
  });

  it("sin mínimo, sin fijo y sin nota se mandan como la base los espera (null, 0, null)", () => {
    expect(argumentosDeTarifa(entrada())).toMatchObject({ p_cantidad_minima: null, p_fijo_orden: 0, p_nota: null });
  });

  it("en el orden de la base: servicio, fase, monto, mínimo, fijo", () => {
    expect(problemasDeTarifa(entrada({ proveedorId: "", fase: "", tarifa: "", minimo: "0", fijo: "-1" })).map((p) => p.campo)).toEqual(["servicio", "fase", "tarifa", "minimo", "fijo"]);
  });

  it("el monto: mayor que cero, hasta el tope y con a lo más dos decimales", () => {
    for (const t of ["", "0", "-2", "abc", "4.505", "100000"]) expect(problemasDeTarifa(entrada({ tarifa: t })).map((p) => p.hint), t).toEqual(["tarifa_monto_invalido"]);
    for (const t of ["0.01", "4", "4.5", "4,50", "99999"]) expect(problemasDeTarifa(entrada({ tarifa: t })), t).toEqual([]);
  });

  it("el mínimo: entero de una prenda en adelante, o vacío", () => {
    for (const m of ["0", "1.5", "-3", "x"]) expect(problemasDeTarifa(entrada({ minimo: m })).map((p) => p.hint), m).toEqual(["tarifa_minimo_invalido"]);
    for (const m of ["", "1", "200"]) expect(problemasDeTarifa(entrada({ minimo: m })), m).toEqual([]);
  });

  it("el fijo: de cero al tope, o vacío", () => {
    for (const f of ["-1", "x", "100000"]) expect(problemasDeTarifa(entrada({ fijo: f })).map((p) => p.hint), f).toEqual(["tarifa_fijo_invalido"]);
    for (const f of ["", "0", "12.5", "99999"]) expect(problemasDeTarifa(entrada({ fijo: f })), f).toEqual([]);
  });

  it("la hoja nace con la tarifa vigente, o vacía si se carga una nueva", () => {
    const [t] = leerTarifasDeServicios([cruda({ cantidad_minima: 50, fijo_orden: 12.5, nota: "hilo" })]) ?? [];
    expect(entradaDesde(t)).toEqual({ proveedorId: "p1", fase: "costura", tarifa: "4.5", minimo: "50", fijo: "12.5", nota: "hilo" });
    expect(entradaDesde(null, "p9", "corte")).toEqual({ proveedorId: "p9", fase: "corte", tarifa: "", minimo: "", fijo: "", nota: "" });
  });
});
