import { describe, expect, it } from "vitest";
import type { Colaborador, ColaboradorSuspendido, DynamicDisponible } from "./colaboradores";
import {
  accionesDeFila,
  avisoTerminal,
  confirmacionTerminal,
  ETIQUETA_TIPO_TERMINAL,
  fechaHoraLima,
  fechaLima,
  filtrarColaboradores,
  filtrarDisponibles,
  fraseEvento,
  pestanaDe,
  resumenAlta,
  resumirAccesos,
  ultimoAccesoTexto,
} from "./colaboradores-reglas";

const persona = (id: string, nombre: string, rol: "lider" | "colaborador", extra: Partial<Colaborador> = {}): Colaborador => ({
  persona_id: id,
  nombre,
  correo: `${nombre.toLowerCase().replace(/\s/g, ".")}@cayla.pe`,
  sede: "Tienda TRU",
  rol,
  ubicacion_asignada: rol === "lider" ? null : "Tienda TRU",
  agregado_en: "2026-09-16T15:00:00Z",
  ubicacion_id: rol === "lider" ? null : "u1",
  es_yo: false,
  ultimo_acceso: null,
  ...extra,
});

const activos = [
  persona("1", "Ángela Ríos", "lider", { es_yo: true }),
  persona("2", "Benjamín Cueva", "lider"),
  persona("3", "Chiara Flores", "colaborador"),
  persona("4", "Daniel Ruiz", "colaborador"),
  persona("5", "Elena Vega", "colaborador"),
];

describe("filtrarColaboradores", () => {
  it("sin texto y en «todos» deja pasar a todos", () => {
    expect(filtrarColaboradores(activos, "", "todos")).toHaveLength(5);
  });
  it("busca por nombre sin importar tildes ni mayúsculas", () => {
    expect(filtrarColaboradores(activos, "angela", "todos").map((c) => c.persona_id)).toEqual(["1"]);
    expect(filtrarColaboradores(activos, "BENJAMIN", "todos").map((c) => c.persona_id)).toEqual(["2"]);
  });
  it("busca por correo", () => {
    expect(filtrarColaboradores(activos, "elena.vega@", "todos").map((c) => c.persona_id)).toEqual(["5"]);
  });
  it("ignora espacios sobrantes en la búsqueda", () => {
    expect(filtrarColaboradores(activos, "  daniel  ", "todos")).toHaveLength(1);
  });
  it("filtra por rol y combina con el texto", () => {
    expect(filtrarColaboradores(activos, "", "lider")).toHaveLength(2);
    expect(filtrarColaboradores(activos, "", "colaborador")).toHaveLength(3);
    expect(filtrarColaboradores(activos, "ruiz", "lider")).toHaveLength(0);
  });
  it("sin coincidencias devuelve lista vacía", () => {
    expect(filtrarColaboradores(activos, "zzz", "todos")).toEqual([]);
  });
});

describe("filtrarDisponibles", () => {
  const disp: DynamicDisponible[] = [
    { persona_id: "a", nombre: "Milagritos Zárate", correo: "lucia@gmail.com", sede: null },
    { persona_id: "b", nombre: "Mateo Quispe", correo: "mquispe@cayla.pe", sede: "Taller LIM" },
  ];
  it("sin texto devuelve una copia de todas", () => {
    const r = filtrarDisponibles(disp, "");
    expect(r).toHaveLength(2);
    expect(r).not.toBe(disp);
  });
  it("busca nombre o correo sin tildes", () => {
    expect(filtrarDisponibles(disp, "zarate").map((d) => d.persona_id)).toEqual(["a"]);
    expect(filtrarDisponibles(disp, "cayla.pe").map((d) => d.persona_id)).toEqual(["b"]);
  });
});

describe("resumirAccesos", () => {
  const susp: ColaboradorSuspendido[] = [
    { persona_id: "9", nombre: "X", correo: "x@x", sede: null, rol: "colaborador", ubicacion_asignada: "Taller LIM", suspendido_en: "2026-09-20T10:00:00Z", suspendido_por_nombre: "Y", motivo: null },
  ];
  const disp: DynamicDisponible[] = [
    { persona_id: "a", nombre: "A", correo: "a@a", sede: null },
    { persona_id: "b", nombre: "B", correo: "b@b", sede: null },
  ];
  it("cuenta líderes, colaboradores, suspendidos y las cuentas activas de Dynamic", () => {
    expect(resumirAccesos(activos, susp, disp)).toEqual({ conAcceso: 5, lideres: 2, colaboradores: 3, suspendidos: 1, cuentasDynamic: 8 });
  });
  it("con todo vacío da ceros", () => {
    expect(resumirAccesos([], [], [])).toEqual({ conAcceso: 0, lideres: 0, colaboradores: 0, suspendidos: 0, cuentasDynamic: 0 });
  });
});

describe("resumenAlta", () => {
  it("pide elegir a alguien cuando no hay nadie", () => {
    expect(resumenAlta(0, "Taller LIM")).toBe("Elige al menos una persona para continuar");
  });
  it("singular y plural", () => {
    expect(resumenAlta(1, "Tienda TRU")).toBe("Se agregará 1 persona como Colaborador en Tienda TRU");
    expect(resumenAlta(2, "Taller LIM")).toBe("Se agregarán 2 personas como Colaborador en Taller LIM");
  });
  it("sin ubicación elegida todavía no inventa una", () => {
    expect(resumenAlta(2, null)).toBe("Se agregarán 2 personas como Colaborador");
  });
});

describe("accionesDeFila", () => {
  it("a uno mismo no se le ofrece nada", () => {
    expect(accionesDeFila({ rol: "lider", es_yo: true })).toEqual([]);
  });
  it("a un colaborador se le puede cambiar la ubicación, suspender y quitar", () => {
    expect(accionesDeFila({ rol: "colaborador", es_yo: false })).toEqual(["cambiar_rol", "cambiar_ubicacion", "suspender", "quitar"]);
  });
  it("un líder no tiene ubicación que cambiar", () => {
    expect(accionesDeFila({ rol: "lider", es_yo: false })).toEqual(["suspender", "quitar"]);
  });
});

describe("terminales sin persona (ADR-0162)", () => {
  it("desactivar avisa que corta la sesión al instante y conserva el historial", () => {
    const c = confirmacionTerminal({ nombre: "Terminal Ventas TRU", activo: true });
    expect(c.titulo).toBe("Desactivar Terminal Ventas TRU");
    expect(c.boton).toBe("Desactivar");
    expect(c.texto).toMatch(/al instante/);
    expect(c.texto).toMatch(/historial se conserva/);
  });
  it("reactivar vuelve con la misma clave", () => {
    expect(confirmacionTerminal({ nombre: "Terminal Ventas LIM", activo: false })).toEqual({
      titulo: "Reactivar Terminal Ventas LIM",
      texto: "El aparato vuelve a funcionar con su misma clave.",
      boton: "Reactivar",
    });
  });
  it("el aviso dice el estado NUEVO, a partir del de antes", () => {
    expect(avisoTerminal("Terminal Ventas TRU", true)).toBe("Terminal Ventas TRU desactivada");
    expect(avisoTerminal("Terminal Ventas TRU", false)).toBe("Terminal Ventas TRU reactivada");
  });
  it("el tipo se lee corto en la tabla", () => {
    expect(ETIQUETA_TIPO_TERMINAL).toEqual({ ventas: "Ventas", administrativa: "Administrativa" });
  });
});

describe("fechas en hora de Lima", () => {
  it("una alta a las 03:00 UTC cae el día anterior en Lima", () => {
    expect(fechaLima("2026-09-17T03:00:00Z")).toBe("16/09/2026");
  });
  it("fecha y hora", () => {
    expect(fechaHoraLima("2026-09-22T16:15:00Z")).toBe("22/09 11:15");
  });
  it("quien nunca ingresó lo dice", () => {
    expect(ultimoAccesoTexto(null)).toBe("Aún no ingresa");
    expect(ultimoAccesoTexto("2026-09-22T16:15:00Z")).toBe("22/09 11:15");
  });
});

describe("fraseEvento", () => {
  const base = { persona_nombre: "Angie", por_nombre: "Felipe", rol: "colaborador" as const, ubicacion_anterior: null, ubicacion_nueva: null, motivo: null };
  const texto = (f: ReturnType<typeof fraseEvento>) => f.partes.map((p) => p.texto).join("");

  it("alta con autor: quién dio acceso, a quién, con qué rol y dónde", () => {
    const f = fraseEvento({ ...base, accion: "alta", ubicacion_nueva: "Tienda TRU" });
    expect(f.etiqueta).toBe("Alta");
    expect(f.tono).toBe("verde");
    expect(texto(f)).toBe("Felipe dio acceso a Angie como Colaborador.");
    expect(f.detalle).toBe("Ubicación fija: Tienda TRU");
    expect(f.partes.filter((p) => p.fuerte).map((p) => p.texto)).toEqual(["Felipe", "Angie"]);
  });
  it("alta sembrada (sin autor) no inventa a nadie", () => {
    const f = fraseEvento({ ...base, accion: "alta", por_nombre: null, rol: "lider" });
    expect(texto(f)).toBe("Angie ya tenía acceso como Líder cuando se empezó a llevar este historial.");
    expect(f.detalle).toBeNull();
  });
  it("suspensión con motivo", () => {
    const f = fraseEvento({ ...base, accion: "suspension", motivo: "Cese de temporada" });
    expect(f.tono).toBe("ambar");
    expect(texto(f)).toBe("Felipe suspendió el acceso a Angie.");
    expect(f.detalle).toBe("Motivo: Cese de temporada");
  });
  it("suspensión sin motivo no muestra detalle", () => {
    expect(fraseEvento({ ...base, accion: "suspension" }).detalle).toBeNull();
  });
  it("reactivación y baja", () => {
    expect(texto(fraseEvento({ ...base, accion: "reactivacion", ubicacion_nueva: "Taller LIM" }))).toBe("Felipe reactivó el acceso a Angie.");
    const baja = fraseEvento({ ...base, accion: "baja", ubicacion_anterior: "Tienda TRU" });
    expect(texto(baja)).toBe("Felipe quitó el acceso a Angie.");
    expect(baja.detalle).toBe("Estaba en: Tienda TRU");
  });
  it("aprobación (D-70): quién aprobó, a quién, con qué rol y dónde", () => {
    const f = fraseEvento({ ...base, accion: "aprobacion", ubicacion_nueva: "Tienda TRU" });
    expect(f.etiqueta).toBe("Aprobación");
    expect(f.tono).toBe("verde");
    expect(texto(f)).toBe("Felipe aprobó el alta de Angie como Colaborador.");
    expect(f.detalle).toBe("Ubicación: Tienda TRU");
  });
  it("cambio de ubicación dice de dónde a dónde", () => {
    const f = fraseEvento({ ...base, accion: "ubicacion", ubicacion_anterior: "Tienda TRU", ubicacion_nueva: "Taller LIM" });
    expect(texto(f)).toBe("Felipe cambió la ubicación de Angie de Tienda TRU a Taller LIM.");
  });
  it("una persona que ya no se puede nombrar no rompe la frase", () => {
    expect(texto(fraseEvento({ ...base, accion: "baja", persona_nombre: null }))).toBe("Felipe quitó el acceso a una persona.");
  });
});

describe("pestanaDe (Roles y accesos es una pestaña de Colaboradores, ADR-0161 B)", () => {
  it("abre la pestaña pedida por ?pestana= y cae en Activos con cualquier otra cosa", () => {
    expect(pestanaDe("roles")).toBe("roles");
    expect(pestanaDe("terminales")).toBe("terminales");
    expect(pestanaDe("otra")).toBe("activos");
    expect(pestanaDe(undefined)).toBe("activos");
  });
});
