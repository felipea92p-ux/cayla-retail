import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  aflojaElCierre,
  avisoCargaInicial,
  cargaAbierta,
  cargaInicialDe,
  chipCargaInicial,
  consecuenciaDelCierre,
  estadoCargaInicial,
  fechaCorta,
  leerCargaInicial,
  textoCargaCerrada,
  validarCierre,
} from "./carga-inicial-reglas";

const HOY = "2026-10-04";
const TRU = { sede: "Tienda TRU", hasta: "2026-10-15", hoy: HOY };

describe("estadoCargaInicial: la misma regla que fn_carga_inicial_abierta", () => {
  it("sin fecha, abierta", () => {
    expect(estadoCargaInicial(null, HOY)).toEqual({ tipo: "sin_fecha" });
  });
  it("la fecha es el ÚLTIMO día abierto: el 15 abre, el 16 no", () => {
    expect(estadoCargaInicial("2026-10-15", "2026-10-15")).toEqual({ tipo: "abierta", hasta: "2026-10-15", dias: 0 });
    expect(estadoCargaInicial("2026-10-15", "2026-10-16")).toEqual({ tipo: "cerrada", hasta: "2026-10-15" });
  });
  it("cuenta los días de calendario (cruza meses y años sin zonas horarias)", () => {
    expect(estadoCargaInicial("2026-10-15", HOY)).toEqual({ tipo: "abierta", hasta: "2026-10-15", dias: 11 });
    expect(estadoCargaInicial("2027-01-02", "2026-12-31")).toEqual({ tipo: "abierta", hasta: "2027-01-02", dias: 2 });
  });
  it("sin dato de la base, la pantalla no se inventa un cierre", () => {
    expect(cargaAbierta(null)).toBe(true);
    expect(cargaAbierta({ ...TRU, hoy: "2026-10-16" })).toBe(false);
    expect(cargaAbierta({ ...TRU, hasta: null })).toBe(true);
  });
});

describe("las frases", () => {
  it("la fecha corta, como la base: «15-oct», «5-sep»", () => {
    expect(fechaCorta("2026-10-15")).toBe("15-oct");
    expect(fechaCorta("2026-09-05")).toBe("5-sep");
    expect(fechaCorta("2027-01-01")).toBe("1-ene");
  });
  it("cerrada: EXACTAMENTE la frase de la base (la prueba SQL exige la misma)", () => {
    expect(textoCargaCerrada("Tienda Trujillo", "2026-10-15")).toBe(
      "La carga inicial de Tienda Trujillo se cerró el 15-oct. Lo que encuentres entra por «Encontré prendas».",
    );
    const migracion = readFileSync(join(__dirname, "..", "..", "..", "supabase", "migrations", "20261004210100_carga_inicial_cierre_por_sede_parte2_candado.sql"), "utf8");
    expect(migracion).toContain("'La carga inicial de ' || u.nombre || ' se cerró el ' || f.corta || '. Lo que encuentres entra por «Encontré prendas».'");
  });
  it("antes del cierre avisa con los días que faltan; el último día lo dice; sin fecha no dice nada", () => {
    expect(avisoCargaInicial(TRU)).toBe("La carga inicial de Tienda TRU se cierra el 15-oct (faltan 11 días).");
    expect(avisoCargaInicial({ ...TRU, hoy: "2026-10-14" })).toBe("La carga inicial de Tienda TRU se cierra el 15-oct (falta 1 día).");
    expect(avisoCargaInicial({ ...TRU, hoy: "2026-10-15" })).toBe("La carga inicial de Tienda TRU se cierra hoy, 15-oct: es el último día para cargar lo que ya tienes.");
    expect(avisoCargaInicial({ ...TRU, hoy: "2026-10-16" })).toBe("La carga inicial de Tienda TRU se cerró el 15-oct. Lo que encuentres entra por «Encontré prendas».");
    expect(avisoCargaInicial({ ...TRU, hasta: null })).toBeNull();
    expect(avisoCargaInicial(null)).toBeNull();
  });
  it("la insignia de Configuración", () => {
    expect(chipCargaInicial({ tipo: "sin_fecha" }).texto).toBe("Abierta, sin fecha");
    expect(chipCargaInicial(estadoCargaInicial("2026-10-15", HOY))).toEqual({ texto: "Abierta · faltan 11 días", tono: "verde" });
    expect(chipCargaInicial(estadoCargaInicial("2026-10-15", "2026-10-10")).tono).toBe("ambar");
    expect(chipCargaInicial(estadoCargaInicial("2026-10-15", "2026-10-15")).texto).toBe("Hoy es el último día");
    expect(chipCargaInicial(estadoCargaInicial("2026-10-15", "2026-10-20"))).toEqual({ texto: "Cerrada desde el 16-oct", tono: "apagado" });
    expect(chipCargaInicial(estadoCargaInicial("2026-12-31", "2027-01-05")).texto).toBe("Cerrada desde el 1-ene");
  });
  it("la consecuencia de guardar, antes de confirmar", () => {
    expect(consecuenciaDelCierre("Tienda TRU", "2026-10-15", HOY)).toBe(
      "Tienda TRU carga hasta el 15-oct. Desde el 16-oct, lo que aparezca entra por «Encontré prendas», con su nota.",
    );
    expect(consecuenciaDelCierre("Tienda TRU", HOY, HOY)).toMatch(/^Tienda TRU carga hasta hoy\. Desde el 5-oct/);
    expect(consecuenciaDelCierre("Tienda AQP", null, HOY)).toMatch(/abierta sin fecha/);
  });
});

describe("quién mueve la fecha: la misma regla que fijar_cierre_carga_inicial", () => {
  const base = { hoy: HOY, esLider: true, esAdmin: false };
  it("apretar (poner fecha donde no había, adelantarla) lo hace el líder", () => {
    expect(validarCierre({ ...base, actual: null, nueva: "2026-10-15" })).toEqual({ ok: true, cambia: true });
    expect(validarCierre({ ...base, actual: "2026-10-15", nueva: "2026-10-10" })).toEqual({ ok: true, cambia: true });
    expect(validarCierre({ ...base, actual: "2026-10-15", nueva: HOY })).toEqual({ ok: true, cambia: true });
  });
  it("aflojar (correr más adelante, quitar, reabrir) es del Admin", () => {
    for (const [actual, nueva] of [
      ["2026-10-15", "2026-10-20"],
      ["2026-10-15", null],
      ["2026-10-01", "2026-10-08"],
      ["2026-10-01", null],
    ] as const) {
      expect(aflojaElCierre(actual, nueva, HOY)).toBe(true);
      expect(validarCierre({ ...base, actual, nueva }).ok).toBe(false);
      expect(validarCierre({ ...base, esAdmin: true, actual, nueva })).toEqual({ ok: true, cambia: true });
    }
  });
  it("nunca una fecha pasada, ni para el Admin; la misma fecha no cambia nada", () => {
    expect(validarCierre({ ...base, esAdmin: true, actual: null, nueva: "2026-10-03" })).toMatchObject({ ok: false });
    expect(validarCierre({ ...base, actual: "2026-10-15", nueva: "2026-10-15" })).toEqual({ ok: true, cambia: false });
    expect(aflojaElCierre("2026-10-15", "2026-10-15", HOY)).toBe(false);
  });
  it("quien no es líder no fija nada", () => {
    expect(validarCierre({ ...base, esLider: false, actual: null, nueva: "2026-10-15" })).toMatchObject({ ok: false });
  });
});

describe("leer lo que devuelve la base", () => {
  const crudo = {
    hoy: HOY,
    sedes: [
      { ubicacion_id: "u-tru", nombre: "Tienda TRU", tipo: "tienda", hasta: "2026-10-15", abierta: true },
      { ubicacion_id: "u-aqp", nombre: "Tienda AQP", tipo: "tienda", hasta: null, abierta: true },
      { nombre: "sin id" },
    ],
  };
  it("lee las sedes y descarta lo mal formado", () => {
    const l = leerCargaInicial(crudo);
    expect(l?.sedes.map((s) => s.ubicacionId)).toEqual(["u-tru", "u-aqp"]);
    expect(cargaInicialDe(l, "u-tru")).toEqual({ sede: "Tienda TRU", hasta: "2026-10-15", hoy: HOY });
    expect(cargaInicialDe(l, "otra")).toBeNull();
    expect(cargaInicialDe(l, null)).toBeNull();
  });
  it("si la base no tiene la función (o responde otra cosa), no hay lectura: la pantalla sigue sin avisos", () => {
    expect(leerCargaInicial(null)).toBeNull();
    expect(leerCargaInicial({ hoy: "ayer", sedes: [] })).toBeNull();
    expect(leerCargaInicial([])).toBeNull();
    expect(cargaInicialDe(null, "u-tru")).toBeNull();
  });
});
