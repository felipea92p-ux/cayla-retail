import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FASES } from "./orden-fases-reglas";
import { NOMBRE_MAXIMO, OTRO_PROCESO, argumentosDeProceso, despuesDeEnLaRuta, nombreComparable, problemaDeNombreDeProceso, problemasDeProceso, sePuedeApagar } from "./procesos-reglas";

// La pantalla dice lo mismo que `guardar_proceso_produccion` (20261029210000): mismos topes y mismo «repetido»; la base valida otra vez y manda.
const SQL = readFileSync(join(__dirname, "../../../supabase/migrations/20261029210000_produccion_catalogo_de_procesos.sql"), "utf8");

describe("catálogo de procesos: lo que la base rechaza, dicho antes", () => {
  it("los topes y los motivos existen en la migración", () => {
    expect(SQL).toContain(`length(v_nombre) > ${NOMBRE_MAXIMO}`);
    for (const h of ["proceso_nombre_invalido", "proceso_repetido", "proceso_sin_lugar", "proceso_espina", "proceso_solo_lider"]) expect(SQL, h).toContain(`hint = '${h}'`);
  });
  it("repetido es el mismo nombre sin tildes, mayúsculas ni signos; renombrarse a sí mismo no choca", () => {
    expect(nombreComparable("CONTROL FINAL!")).toBe(nombreComparable("Control final"));
    expect(problemaDeNombreDeProceso("pegar  CIERRE", FASES)).toBe("Ya hay un proceso que se llama «Pegar cierre».");
    expect(problemaDeNombreDeProceso("Pegar cierre", FASES, "pegar_cierre")).toBeNull();
    expect(problemaDeNombreDeProceso("  ", FASES)).toBe("Escribe el nombre del proceso.");
    expect(problemaDeNombreDeProceso("x".repeat(41), FASES)).toMatch(/hasta 40/);
    expect(problemaDeNombreDeProceso("Teñido en frío", FASES)).toBeNull();
  });
  it("«Otro proceso…» nunca choca con una clave real, y «va después de» es Costura si la orden la tiene", () => {
    expect(/^[a-z][a-z0-9_]{1,39}$/.test(OTRO_PROCESO)).toBe(false);
    expect(despuesDeEnLaRuta([{ clave: "corte", secuencia: 10 }, { clave: "costura", secuencia: 30 }, { clave: "planchado", secuencia: 65 }])).toBe("costura");
    expect(despuesDeEnLaRuta([{ clave: "corte", secuencia: 10 }, { clave: "acabado", secuencia: 60 }])).toBe("corte");
  });
  it("lo de la espina no se apaga; al editar no viaja el lugar y al crear no viaja la clave", () => {
    expect(sePuedeApagar(FASES.find((f) => f.clave === "costura")!)).toBe(false);
    expect(sePuedeApagar(FASES.find((f) => f.clave === "pegar_cierre")!)).toBe(true);
    const nuevo = { clave: null, nombre: " Teñido  en frío ", ayuda: "", quien: "servicio" as const, despuesDe: "costura" };
    expect(problemasDeProceso(nuevo)).toEqual([]);
    expect(argumentosDeProceso(nuevo)).toEqual({ p_nombre: "Teñido en frío", p_clave: null, p_despues_de: "costura", p_ayuda: null, p_quien_sugerido: "servicio", p_activo: null });
    expect(argumentosDeProceso({ ...nuevo, clave: "pegar_cierre", nombre: "Pegar cremallera" }, false).p_despues_de).toBeNull();
    expect(problemasDeProceso({ ...nuevo, despuesDe: "no_existe" }).map((p) => p.campo)).toEqual(["despues"]);
  });
});
