import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PARAMETROS_RPC_BAJADA_DESDE_VENDER,
  RPC_BAJADA_DESDE_VENDER,
  argumentosDeBajadaDesdeVender,
  leerRespuestaBajadaDesdeVender,
  pisoNecesarioParaUnaMas,
  textoErrorBajadaDesdeCaja,
} from "./bajada-desde-vender";

// La migración es la fuente: si cambia el nombre o los parámetros de la RPC, la caja se entera aquí y no en producción.
const MIGRACION = readFileSync(
  join(__dirname, "..", "..", "..", "supabase", "migrations", "20261003233000_bajar_al_piso_desde_vender.sql"),
  "utf8",
).replace(/--[^\n]*/g, "");

describe("el contrato con la base (ADR-0321)", () => {
  it("el nombre y los parámetros de la RPC son los de la migración", () => {
    const m = /create or replace function retail\.(\w+)\(([^)]*)\)/.exec(MIGRACION);
    expect(m?.[1]).toBe(RPC_BAJADA_DESDE_VENDER);
    const nombres = m![2].split(",").map((p) => p.trim().split(/\s+/)[0]);
    expect(nombres).toEqual([...PARAMETROS_RPC_BAJADA_DESDE_VENDER]);
  });

  it("los hints que la caja lee existen en la función, y la respuesta trae lo que la caja usa", () => {
    for (const hint of ["bajada_vender_sin_almacen", "bajada_vender_sin_modulo", "responsable_requerido"]) {
      expect(MIGRACION, hint).toContain(`'${hint}'`);
    }
    for (const campo of ["'ya_registrada'", "'bajadas'", "'piso'", "'almacen'"]) expect(MIGRACION, campo).toContain(campo);
  });

  it("los argumentos: nombres de la migración, y lo que el piso necesita (no «cuántas bajar»)", () => {
    const a = argumentosDeBajadaDesdeVender("tru", "v1", { enTicket: 1, comprometidoEnCola: 1 }, "marca");
    expect(a).toEqual({ p_ubicacion_id: "tru", p_variante_id: "v1", p_piso_necesario: 3, p_token: "marca" });
    expect(Object.keys(a).sort()).toEqual([...PARAMETROS_RPC_BAJADA_DESDE_VENDER].sort());
  });

  it("cuántas tiene que haber en el piso: las del ticket + la que entra + lo vendido sin conexión que aún no subió", () => {
    // Piso en 0 y nada en el ticket: hace falta 1.
    expect(pisoNecesarioParaUnaMas({ enTicket: 0 })).toBe(1);
    // La del piso ya está en el ticket y escanean otra: hacen falta 2 (la base baja solo la que falta).
    expect(pisoNecesarioParaUnaMas({ enTicket: 1 })).toBe(2);
    // Una venta sin conexión de esta prenda todavía no subió: la base aún la cuenta en el piso, la pantalla no.
    expect(pisoNecesarioParaUnaMas({ enTicket: 0, comprometidoEnCola: 1 })).toBe(2);
    // Nunca menos de 1 aunque llegue algo raro.
    expect(pisoNecesarioParaUnaMas({ enTicket: -2, comprometidoEnCola: -1 })).toBe(1);
  });

  it("la respuesta se lee solo si calza con el contrato; si no, null (la caja no inventa cifras)", () => {
    expect(leerRespuestaBajadaDesdeVender({ ya_registrada: false, bajadas: 1, piso: 1, almacen: 2, movimiento_id: "m" })).toEqual({
      yaRegistrada: false,
      bajadas: 1,
      piso: 1,
      almacen: 2,
    });
    expect(leerRespuestaBajadaDesdeVender({ ya_registrada: true, bajadas: 0, piso: 1, almacen: 2, movimiento_id: null })?.bajadas).toBe(0);
    expect(leerRespuestaBajadaDesdeVender(null)).toBeNull();
    expect(leerRespuestaBajadaDesdeVender({ ya_registrada: false, bajadas: 1, piso: "1", almacen: 2 })).toBeNull();
    expect(leerRespuestaBajadaDesdeVender({ ya_registrada: false, bajadas: -1, piso: 1, almacen: 2 })).toBeNull();
    expect(leerRespuestaBajadaDesdeVender({ bajadas: 1, piso: 1, almacen: 2 })).toBeNull();
  });
});

describe("lo que dice el aviso si la bajada no se registró", () => {
  it("el rechazo de la base, tal cual (ya viene en castellano)", () => {
    const sinAlmacen = {
      code: "P0001",
      hint: "bajada_vender_sin_almacen",
      message: "Blusa Paracas · M · Beige: en el almacén de Tienda TRU no queda libre para bajar (no hay ninguna). Puede que otra persona ya la haya bajado, vendido o apartado: revisa Existencias.",
    };
    expect(textoErrorBajadaDesdeCaja(sinAlmacen, "Blusa Paracas · M")).toBe(sinAlmacen.message);
  });

  it("sin la función en la base (web publicada antes que la migración): el camino de Existencias, sin códigos", () => {
    expect(textoErrorBajadaDesdeCaja({ code: "PGRST202", message: "Could not find the function retail.bajar_al_piso_desde_vender" }, "Blusa Paracas · M")).toBe(
      "Registrar que se colgó desde Vender todavía no está activo. Regístralo en Inventario ▸ Existencias ▸ Colgar en el piso y vuelve a escanear Blusa Paracas · M.",
    );
  });

  it("corte de red o respuesta perdida: no se sabe si se guardó, y volver a escanear es seguro — nunca «no se guardó nada»", () => {
    const texto = textoErrorBajadaDesdeCaja({ message: "TypeError: Failed to fetch" }, "Blusa Paracas · M");
    expect(texto).toBe("Se cortó la conexión y no sabemos si Blusa Paracas · M se registró como colgada. Vuelve a escanearla: si ya estaba registrada, no se repite.");
    expect(texto).not.toContain("No se guardó");
    // Cortada a los 20 s (AbortError, sin código): igual de incierta.
    expect(textoErrorBajadaDesdeCaja({ message: "AbortError: signal is aborted without reason", code: "" }, "Blusa Paracas · M")).toContain("no sabemos si");
  });

  it("el responsable: la frase de siempre del combo (vuelve a elegir)", () => {
    const texto = textoErrorBajadaDesdeCaja({ code: "42501", hint: "responsable_no_presente", message: "Esa persona no está de turno en esta tienda" }, "Blusa Paracas · M");
    expect(texto).toContain("ya no figura de turno");
  });
});
