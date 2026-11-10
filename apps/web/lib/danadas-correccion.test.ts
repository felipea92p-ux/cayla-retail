import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  argumentosDeCorreccion,
  argumentosSinDano,
  camposGuiaCorreccion,
  desdeDeLaEntrada,
  dondeEstanLasDanadas,
  desdeSugerido,
  nombreCorto,
  opcionesDeCorreccion,
  PARAMETROS_RPC_CORREGIR,
  PARAMETROS_RPC_SIN_DANO,
  quePasaAlCorregir,
  quePasaSinDano,
  RPC_CORREGIR_DANADA,
  RPC_SIN_DANO,
  textoCorregidaDe,
  tituloExitoCorreccion,
  tituloExitoSinDano,
  type Hermana,
} from "./danadas-correccion";
import { esRpcDeLectura } from "./espera-reglas";

// La migración es la fuente: si cambia el nombre o los parámetros de una RPC, la pantalla se entera aquí y no en producción.
const leerMigracion = (archivo: string) => readFileSync(join(__dirname, "..", "..", "..", "supabase", "migrations", archivo), "utf8").replace(/--[^\n]*/g, "");
const CORREGIR = leerMigracion("20261110172000_danadas_corregir_la_prenda.sql");
const SIN_DANO = leerMigracion("20261110173000_danadas_no_estaba_danada.sql");

function firmaDe(sql: string, nombre: string): string[] {
  const m = new RegExp(`create or replace function retail\\.${nombre}\\(([^)]*)\\)`).exec(sql);
  expect(m, nombre).not.toBeNull();
  return m![1].split(",").map((p) => p.trim().split(/\s+/)[0]);
}

describe("el contrato con la base", () => {
  it("los nombres y los parámetros de las dos RPC son los de la migración", () => {
    expect(firmaDe(CORREGIR, RPC_CORREGIR_DANADA)).toEqual([...PARAMETROS_RPC_CORREGIR]);
    expect(firmaDe(SIN_DANO, RPC_SIN_DANO)).toEqual([...PARAMETROS_RPC_SIN_DANO]);
  });
  it("los argumentos que arma la pantalla llevan exactamente esos nombres", () => {
    expect(Object.keys(argumentosDeCorreccion("d", "v", "almacen", "t")).sort()).toEqual([...PARAMETROS_RPC_CORREGIR].sort());
    expect(Object.keys(argumentosSinDano("d", "", "t")).sort()).toEqual([...PARAMETROS_RPC_SIN_DANO].sort());
  });
  it("las dos guardan: el loader las trata como guardado, no como lectura", () => {
    expect(esRpcDeLectura(RPC_CORREGIR_DANADA)).toBe(false);
    expect(esRpcDeLectura(RPC_SIN_DANO)).toBe(false);
  });
  it("los hints que la pantalla puede recibir existen en las funciones", () => {
    for (const hint of ["correccion_sin_alcance", "correccion_otro_modelo", "danada_no_se_corrige", "correccion_ya_resuelta"]) expect(CORREGIR, hint).toContain(`'${hint}'`);
    for (const hint of ["sin_dano_en_arreglo", "sin_dano_ya_resuelta", "danada_no_se_corrige"]) expect(SIN_DANO, hint).toContain(`'${hint}'`);
  });
});

describe("desdeDeLaEntrada: de dónde salió una dañada reportada en la tienda", () => {
  it("un traslado del piso o del almacén a la cuarentena dice el lugar", () => {
    expect(desdeDeLaEntrada("traslado", "piso_venta", "cuarentena")).toBe("piso");
    expect(desdeDeLaEntrada("traslado", "almacen_tienda", "cuarentena")).toBe("almacen");
  });
  it("lo que entró de otra forma (devolución, recepción) no tiene lugar al que volver", () => {
    expect(desdeDeLaEntrada("entrada", null, null)).toBeNull();
    expect(desdeDeLaEntrada("entrada", "cuarentena", null)).toBeNull();
    expect(desdeDeLaEntrada("traslado", "cuarentena", "almacen_tienda")).toBeNull();
    expect(desdeDeLaEntrada(undefined, undefined, undefined)).toBeNull();
  });
});

describe("las prendas que se ofrecen al corregir", () => {
  const h = (varianteId: string, talla: string, color: string, piso: number, almacen: number): Hermana => ({ varianteId, talla, color, piso, almacen });
  // El caso de Trujillo: dañada la 28 Celeste (salió del almacén); la 30 Celeste está en el almacén; la 32 no hay; una Azul 28 en el piso.
  const hermanas = [h("az28", "28", "Azul", 1, 0), h("ce28", "28", "Celeste", 0, 0), h("ce30", "30", "Celeste", 0, 1), h("ce32", "32", "Celeste", 0, 0)];
  const ops = opcionesDeCorreccion({ varianteId: "ce28", color: "Celeste", cantidad: 1 }, hermanas, "almacen");

  it("no ofrece la misma prenda, y pone primero el mismo color en el orden de la curva", () => {
    expect(ops.map((o) => o.varianteId)).toEqual(["ce30", "ce32", "az28"]);
  });
  it("cada una dice de dónde sale y si alcanza; la que no hay se ve pero no se elige", () => {
    expect(ops.find((o) => o.varianteId === "ce30")).toMatchObject({ desde: "almacen", alcanza: true });
    expect(ops.find((o) => o.varianteId === "ce32")).toMatchObject({ desde: null, alcanza: false });
    expect(ops.find((o) => o.varianteId === "az28")).toMatchObject({ desde: "piso", alcanza: true });
  });
  it("una prenda repetida en la lista sale una vez", () => {
    expect(opcionesDeCorreccion({ varianteId: "x", color: null, cantidad: 1 }, [h("a", "S", "R", 1, 0), h("a", "S", "R", 1, 0)], null)).toHaveLength(1);
  });
  it("con dos unidades dañadas, la que tiene una sola no alcanza", () => {
    expect(opcionesDeCorreccion({ varianteId: "ce28", color: "Celeste", cantidad: 2 }, hermanas, "almacen").every((o) => !o.alcanza)).toBe(true);
  });
});

describe("desdeSugerido", () => {
  it("con los dos lugares, el mismo de donde salió la equivocada; sin dato, el almacén", () => {
    expect(desdeSugerido({ piso: 1, almacen: 1 }, 1, "piso")).toBe("piso");
    expect(desdeSugerido({ piso: 1, almacen: 1 }, 1, "almacen")).toBe("almacen");
    expect(desdeSugerido({ piso: 1, almacen: 1 }, 1, null)).toBe("almacen");
  });
  it("con uno solo que alcanza, ese; con ninguno, null", () => {
    expect(desdeSugerido({ piso: 2, almacen: 1 }, 2, "almacen")).toBe("piso");
    expect(desdeSugerido({ piso: 0, almacen: 0 }, 1, "almacen")).toBeNull();
  });
});

describe("lo que se dice", () => {
  it("nombra la prenda dentro del modelo", () => {
    expect(nombreCorto("28", "Celeste")).toBe("talla 28 · Celeste");
    expect(nombreCorto(null, "Celeste")).toBe("Celeste");
    expect(nombreCorto(null, null)).toBe("esta prenda");
  });
  it("antes de corregir, las dos prendas con su lugar", () => {
    expect(quePasaAlCorregir({ talla: "28", color: "Celeste" }, "almacen", { talla: "30", color: "Celeste" }, "almacen", 1)).toBe(
      "La talla 28 · Celeste vuelve al almacén, lista para vender. La talla 30 · Celeste sale del almacén y pasa a dañadas, con el mismo daño y su foto."
    );
  });
  it("«No estaba dañada» vuelve a su lugar y no cuenta como arreglo ni pérdida", () => {
    expect(quePasaSinDano("piso", 1)).toContain("al piso");
    expect(quePasaSinDano("almacen", 2)).toMatch(/^Las 2 vuelven al almacén/);
    expect(tituloExitoSinDano(1, "almacen")).toBe("Volvió al almacén: no estaba dañada");
  });
  it("el aviso de éxito y la marca de la lista", () => {
    expect(tituloExitoCorreccion({ talla: "30", color: "Celeste" })).toBe("Corregido: la dañada es la talla 30 · Celeste");
    expect(textoCorregidaDe("28", "Celeste")).toBe("Corregida: antes decía talla 28 · Celeste");
  });
  it("la nota vacía viaja como null, la escrita sin espacios de sobra", () => {
    expect(argumentosSinDano("d", "  ", "t").p_nota).toBeNull();
    expect(argumentosSinDano("d", " del probador ", "t").p_nota).toBe("del probador");
  });
});

describe("la guía de «Me equivoqué de prenda»", () => {
  it("pide cuál es la dañada y quién lo hace, en ese orden", () => {
    expect(camposGuiaCorreccion(false, false).map((c) => [c.id, c.hecho])).toEqual([["correcta", false], ["responsable", false]]);
    expect(camposGuiaCorreccion(true, true).every((c) => c.hecho)).toBe(true);
  });
});

describe("dondeEstanLasDanadas: la casilla de «Todas» dice en qué talla está la dañada", () => {
  it("un color: «talla 26»; varias tallas: «tallas 26 · 30 (2)»", () => {
    expect(dondeEstanLasDanadas([{ color: "Celeste", tallas: [{ talla: "26", danado: 1 }, { talla: "28", danado: 0 }] }])).toBe("talla 26");
    expect(dondeEstanLasDanadas([{ color: "Celeste", tallas: [{ talla: "26", danado: 1 }, { talla: "30", danado: 2 }] }])).toBe("tallas 26 · 30 (2)");
  });
  it("varios colores: nombra el color", () => {
    expect(dondeEstanLasDanadas([{ color: "Azul", tallas: [{ talla: "28", danado: 0 }] }, { color: "Celeste", tallas: [{ talla: "26", danado: 1 }] }])).toBe("Celeste 26");
  });
  it("sin dañadas, nada", () => {
    expect(dondeEstanLasDanadas([{ color: "Celeste", tallas: [{ talla: "26", danado: 0 }, { talla: "28" }] }])).toBe("");
  });
});
