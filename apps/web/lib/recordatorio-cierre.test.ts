import { beforeEach, describe, expect, it, vi } from "vitest";

// El lector del recordatorio de cierre de caja con el cierre sacado del horario por días (ADR-0642). Lo que se vigila es lo que la revisión previa al PR
// encontró: un FALLO de lectura del horario no es «sin horario» (la píldora despediría una caja abierta), y una caja abierta otro día se recuerda con el
// cierre del día en que se abrió, incluso si hoy la tienda no abre.

vi.mock("server-only", () => ({}));

type Sede = { id: string; horaCierre: string | null; horarioCargado: boolean; horaCierreIncierta: boolean };
const estado = vi.hoisted(() => ({
  sede: null as unknown as Sede,
  caja: { tipo: "ninguna" } as { tipo: "ninguna" } | { tipo: "abierta"; abiertaEn: string } | { tipo: "cae" },
  rpc: { respuesta: { data: null, error: null } as { data: unknown; error: unknown }, llamadas: [] as unknown[] },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async (nombre: string, args: unknown) => {
      estado.rpc.llamadas.push({ nombre, args });
      return estado.rpc.respuesta;
    },
  }),
}));
vi.mock("@/lib/ubicaciones", () => ({ getUbicaciones: async () => [estado.sede] }));
// El alias `@/` no resuelve en vitest para lo que no se mockea: estos apuntan a los archivos reales.
vi.mock("@/lib/fechas-lima", async () => await import("./fechas-lima"));
vi.mock("@/lib/recordatorio-cierre-reglas", async () => await import("./recordatorio-cierre-reglas"));
vi.mock("@/lib/persona-actual", () => ({ puede: (p: { permisos: string[] }, permiso: string) => p.permisos.includes(permiso) }));
vi.mock("@/lib/caja", () => ({
  getCajaAbierta: async () => {
    if (estado.caja.tipo === "cae") throw new Error("la base no respondió");
    return estado.caja.tipo === "abierta" ? { id: "c1", abiertaEn: estado.caja.abiertaEn, abiertaPorNombre: "Ana" } : null;
  },
}));

import { horaCierreDeLaCaja, leerRecordatorioCierre } from "./recordatorio-cierre";
import { hoyLima } from "./fechas-lima";

const persona = { vista: "sede", ubicacionTipo: "tienda", permisos: ["gestionarCaja"], ubicacionId: "s1", ubicacionEtiqueta: "Tienda LIM" } as unknown as Parameters<typeof leerRecordatorioCierre>[0];
const sede = (x: Partial<Sede> = {}): Sede => ({ id: "s1", horaCierre: "19:30", horarioCargado: true, horaCierreIncierta: false, ...x });
const ayer = () => new Date(Date.now() - 24 * 3600 * 1000).toISOString();
const ahora = () => new Date().toISOString();

beforeEach(() => {
  estado.sede = sede();
  estado.caja = { tipo: "ninguna" };
  estado.rpc = { respuesta: { data: null, error: null }, llamadas: [] };
});

describe("leerRecordatorioCierre: un fallo de lectura no es «sin horario»", () => {
  it("si el cierre de hoy no se pudo leer, lanza: el sondeo conserva lo último que sabía", async () => {
    estado.sede = sede({ horaCierre: null, horarioCargado: false, horaCierreIncierta: true });
    estado.caja = { tipo: "abierta", abiertaEn: ahora() };
    await expect(leerRecordatorioCierre(persona)).rejects.toThrow(/horario de cierre/);
  });

  it("hoy la tienda no abre pero tiene horario: si la caja no se pudo leer, lanza (puede seguir abierta la de ayer)", async () => {
    estado.sede = sede({ horaCierre: null, horarioCargado: true });
    estado.caja = { tipo: "cae" };
    await expect(leerRecordatorioCierre(persona)).rejects.toThrow(/la base no respondió/);
  });

  it("sin horario cargado y la caja no se pudo leer, no hay nada que recordar (como antes)", async () => {
    estado.sede = sede({ horaCierre: null, horarioCargado: false });
    estado.caja = { tipo: "cae" };
    await expect(leerRecordatorioCierre(persona)).resolves.toMatchObject({ horaCierre: null, caja: null });
  });
});

describe("leerRecordatorioCierre: el cierre que cuenta es el del día de apertura", () => {
  it("caja de hoy: usa el cierre de hoy, sin preguntar otra cosa a la base", async () => {
    estado.caja = { tipo: "abierta", abiertaEn: ahora() };
    const r = await leerRecordatorioCierre(persona);
    expect(r).toMatchObject({ horaCierre: "19:30", caja: { id: "c1" } });
    expect(estado.rpc.llamadas).toEqual([]);
  });

  it("caja de ayer con hoy cerrada: recuerda con el cierre de ayer", async () => {
    estado.sede = sede({ horaCierre: null, horarioCargado: true });
    estado.caja = { tipo: "abierta", abiertaEn: ayer() };
    estado.rpc.respuesta = { data: "21:00:00", error: null };
    const r = await leerRecordatorioCierre(persona);
    expect(r).toMatchObject({ horaCierre: "21:00", caja: { id: "c1" } });
    expect(estado.rpc.llamadas).toHaveLength(1);
    expect((estado.rpc.llamadas[0] as { nombre: string }).nombre).toBe("fn_hora_cierre_de");
  });

  it("caja abierta un día en que la tienda no abría: sin hora, no hay recordatorio", async () => {
    estado.caja = { tipo: "abierta", abiertaEn: ayer() };
    estado.rpc.respuesta = { data: null, error: null };
    await expect(leerRecordatorioCierre(persona)).resolves.toMatchObject({ horaCierre: null, caja: null });
  });
});

describe("horaCierreDeLaCaja", () => {
  it("de hoy devuelve la hora de hoy; de otro día pregunta ese día", async () => {
    expect(await horaCierreDeLaCaja("s1", "19:30", ahora())).toBe("19:30");
    estado.rpc.respuesta = { data: "18:15:00", error: null };
    expect(await horaCierreDeLaCaja("s1", null, ayer())).toBe("18:15");
    const args = (estado.rpc.llamadas[0] as { args: { p_fecha: string; p_ubicacion_id: string } }).args;
    expect(args.p_ubicacion_id).toBe("s1");
    expect(args.p_fecha).not.toBe(hoyLima());
  });

  it("si la función no existe todavía, cae a la hora de hoy; cualquier otro error se dice", async () => {
    estado.rpc.respuesta = { data: null, error: { code: "PGRST202" } };
    expect(await horaCierreDeLaCaja("s1", "19:30", ayer())).toBe("19:30");
    estado.rpc.respuesta = { data: null, error: { code: "57014", message: "timeout" } };
    await expect(horaCierreDeLaCaja("s1", "19:30", ayer())).rejects.toThrow(/horario de cierre/);
  });
});
