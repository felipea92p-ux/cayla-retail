import { describe, expect, it } from "vitest";
import type { Colaborador, ColaboradorInactivo, ColaboradorSuspendido, Terminal } from "./colaboradores";
import {
  BAJA_DYNAMIC,
  SIN_SEDE,
  agruparPorSede,
  armarEquipo,
  atajosEquipo,
  cuandoEntro,
  diferenciaDeModulos,
  fraseFicha,
  presentesDeTurno,
  type EntradaEquipo,
  type PersonaEquipo,
} from "./equipo-reglas";

const TRU = { id: "u-tru", nombre: "Tienda TRU" };
const AQP = { id: "u-aqp", nombre: "Tienda AQP" };
const UBIC = [TRU, AQP];

const activo = (id: string, nombre: string, extra: Partial<Colaborador> = {}): Colaborador => ({
  persona_id: id,
  nombre,
  correo: `${id}@cayla.pe`,
  sede: null,
  rol: "integrante",
  ubicacion_asignada: TRU.nombre,
  ubicacion_id: TRU.id,
  agregado_en: "2026-09-01T15:00:00Z",
  es_yo: false,
  ultimo_acceso: null,
  ...extra,
});

const suspendido: ColaboradorSuspendido = {
  persona_id: "s1",
  nombre: "Diego Paredes",
  correo: "s1@cayla.pe",
  sede: null,
  rol: "integrante",
  ubicacion_asignada: AQP.nombre,
  suspendido_en: "2026-10-03T17:00:00Z",
  suspendido_por_nombre: "Carmen Díaz",
  motivo: "Licencia",
};
const baja: ColaboradorInactivo = { persona_id: "b1", nombre: "Pilar Huamán", correo: "b1@cayla.pe", sede: "Lima", estado_dynamic: "cesado", rol: "integrante", suspendida: false };
const terminal: Terminal = {
  id: "t1",
  nombre: "Caja TRU",
  rol_id: "r-term",
  rol_nombre: "Terminal de ventas",
  correo: null,
  ubicacion_id: TRU.id,
  ubicacion_nombre: TRU.nombre,
  activo: true,
  creada_at: "2026-09-01T15:00:00Z",
  desactivada_at: null,
  ultimo_acceso: null,
};

const entrada = (extra: Partial<EntradaEquipo> = {}): EntradaEquipo => ({
  activos: [
    activo("yo", "Felipe", { rol: "lider", es_yo: true, ubicacion_id: null, ubicacion_asignada: null }),
    activo("p1", "Rosa Quispe"),
    activo("p2", "Andrea Salas"),
    activo("l2", "Carmen Díaz", { rol: "lider", ubicacion_id: AQP.id, ubicacion_asignada: AQP.nombre }),
  ],
  suspendidos: [suspendido],
  inactivos: [baja],
  terminales: [terminal],
  ubicaciones: UBIC,
  rolDe: (id) => (id === "p1" ? { id: "r-ventas", nombre: "Ventas" } : null),
  admins: ["yo"],
  fueraDeAlcance: [],
  soyAdmin: true,
  deTurno: new Set(["p1"]),
  ...extra,
});

const persona = (ms: ReturnType<typeof armarEquipo>, id: string) => ms.find((m) => m.id === id) as PersonaEquipo;

describe("armarEquipo", () => {
  it("junta activas, suspendidas, bajas de Dynamic y aparatos en una sola lista", () => {
    const ms = armarEquipo(entrada());
    expect(ms.map((m) => m.id).sort()).toEqual(["b1", "l2", "p1", "p2", "s1", "t1", "yo"].sort());
  });

  it("muestra el nombre del rol y, si no se leyó, el nivel", () => {
    const ms = armarEquipo(entrada());
    expect(persona(ms, "p1").rolNombre).toBe("Ventas");
    expect(persona(ms, "p2").rolNombre).toBe("Integrante");
    expect(persona(armarEquipo(entrada({ rolDe: undefined })), "p1").rolNombre).toBe("Integrante");
  });

  it("quien fue dado de baja en Dynamic queda como suspendido, sin acciones", () => {
    const b = persona(armarEquipo(entrada()), "b1");
    expect(b.estado).toBe("baja_dynamic");
    expect(b.acciones).toEqual([]);
    expect(b.puedeReactivar).toBe(false);
  });

  it("ubica a la suspendida en su sede por el nombre que trae", () => {
    expect(persona(armarEquipo(entrada()), "s1").ubicacionId).toBe(AQP.id);
  });

  it("marca de turno, Admin y las acciones según quién mira (ADR-0178)", () => {
    const ms = armarEquipo(entrada());
    expect(persona(ms, "p1").deTurno).toBe(true);
    expect(persona(ms, "yo").esAdmin).toBe(true);
    expect(persona(ms, "yo").acciones).toEqual([]);
    expect(persona(ms, "l2").acciones).toContain("cambiar_rol");
    const sinAdmin = armarEquipo(entrada({ soyAdmin: false }));
    expect(persona(sinAdmin, "l2").acciones).toEqual([]);
    expect(persona(armarEquipo(entrada({ fueraDeAlcance: ["s1"] })), "s1").puedeReactivar).toBe(false);
  });

  it("sin terminales leídas, sale sin aparatos", () => {
    expect(armarEquipo(entrada({ terminales: null })).some((m) => m.tipo === "aparato")).toBe(false);
  });
});

describe("agruparPorSede", () => {
  const ms = armarEquipo(entrada());

  it("ordena: líderes de todas las sedes, cada sede en su orden y las bajas al final", () => {
    expect(agruparPorSede(ms, UBIC, "todas", "").map((g) => g.clave)).toEqual([SIN_SEDE, TRU.id, AQP.id, BAJA_DYNAMIC]);
  });

  it("dentro de la sede: líderes, integrantes por nombre, suspendidos y al final los aparatos", () => {
    const tru = agruparPorSede(ms, UBIC, "todas", "").find((g) => g.clave === TRU.id)!;
    expect(tru.miembros.map((m) => m.id)).toEqual(["p2", "p1", "t1"]);
    const aqp = agruparPorSede(ms, UBIC, "todas", "").find((g) => g.clave === AQP.id)!;
    expect(aqp.miembros.map((m) => m.id)).toEqual(["l2", "s1"]);
    expect(tru).toMatchObject({ personas: 2, aparatos: 1, deTurno: 1 });
  });

  it("filtra por sede, suspendidos (incluye bajas) y aparatos", () => {
    expect(agruparPorSede(ms, UBIC, { sede: AQP.id }, "").flatMap((g) => g.miembros.map((m) => m.id))).toEqual(["l2", "s1"]);
    expect(agruparPorSede(ms, UBIC, "suspendidas", "").flatMap((g) => g.miembros.map((m) => m.id))).toEqual(["s1", "b1"]);
    expect(agruparPorSede(ms, UBIC, "aparatos", "").flatMap((g) => g.miembros.map((m) => m.id))).toEqual(["t1"]);
  });

  it("busca sin tildes por nombre, correo o rol", () => {
    expect(agruparPorSede(ms, UBIC, "todas", "diaz").flatMap((g) => g.miembros.map((m) => m.id))).toEqual(["l2"]);
    expect(agruparPorSede(ms, UBIC, "todas", "ventas").flatMap((g) => g.miembros.map((m) => m.id))).toEqual(["p1", "t1"]);
    expect(agruparPorSede(ms, UBIC, "todas", "nadie")).toEqual([]);
  });
});

describe("atajosEquipo", () => {
  it("todas, cada sede con gente, suspendidos y aparatos solo si hay", () => {
    const a = atajosEquipo(armarEquipo(entrada()), UBIC);
    expect(a.map((x) => [x.etiqueta, x.n])).toEqual([
      ["Todas", 6],
      ["Tienda TRU", 2],
      ["Tienda AQP", 2],
      ["Suspendidos", 2],
      ["Aparatos", 1],
    ]);
    const sinNada = atajosEquipo(armarEquipo(entrada({ suspendidos: [], inactivos: [], terminales: [] })), UBIC);
    expect(sinNada.map((x) => x.etiqueta)).toEqual(["Todas", "Tienda TRU", "Tienda AQP"]);
  });
});

describe("cuandoEntro", () => {
  const ahora = "2026-10-05T20:00:00Z"; // lunes 5, 15:00 en Lima
  it("habla en días de Lima", () => {
    expect(cuandoEntro("2026-10-05T14:12:00Z", ahora)).toBe("hoy 09:12");
    expect(cuandoEntro("2026-10-04T23:05:00Z", ahora)).toBe("ayer 18:05");
    // 03:00 UTC del 5 es todavía el 4 en Lima: ayer.
    expect(cuandoEntro("2026-10-05T03:00:00Z", ahora)).toBe("ayer 22:00");
    expect(cuandoEntro("2026-10-01T21:20:00Z", ahora)).toBe("jue 16:20");
    expect(cuandoEntro("2026-09-12T15:00:00Z", ahora)).toBe("12/09/2026");
    expect(cuandoEntro(null, ahora)).toBe("Aún no entra");
  });
});

describe("fraseFicha", () => {
  const ahora = "2026-10-05T20:00:00Z";
  const texto = (p: PersonaEquipo) => fraseFicha(p, ahora).map((x) => x.texto).join("");
  const ms = armarEquipo(entrada());
  it("dice lo importante según el estado", () => {
    expect(texto(persona(ms, "p1"))).toBe("Está de turno hoy en Tienda TRU.");
    expect(texto(persona(ms, "p2"))).toBe("Todavía no ha entrado al sistema.");
    expect(texto({ ...persona(ms, "p2"), ultimoAcceso: "2026-10-04T23:05:00Z" })).toBe("Entró por última vez ayer 18:05.");
    expect(texto(persona(ms, "s1"))).toBe("Acceso suspendido el 03/10/2026 por Carmen Díaz. Motivo: Licencia. Conserva su sede, su rol y su historial.");
    expect(texto(persona(ms, "b1"))).toMatch(/^Está de baja en Dynamic: no puede entrar/);
  });
});

describe("diferenciaDeModulos y presentesDeTurno", () => {
  it("resta en los dos sentidos", () => {
    expect(diferenciaDeModulos(["inicio", "vender", "existencias"], ["inicio", "vender", "caja"])).toEqual({ suma: ["caja"], quita: ["existencias"] });
  });
  it("solo cuenta presentes o en pausa de su propia sede", () => {
    expect(
      presentesDeTurno([
        { persona_id: "a", estado_ahora: "presente", es_de_esta_sede: true },
        { persona_id: "b", estado_ahora: "en_pausa", es_de_esta_sede: true },
        { persona_id: "c", estado_ahora: "presente", es_de_esta_sede: false },
        { persona_id: "d", estado_ahora: "programada", es_de_esta_sede: true },
      ]),
    ).toEqual(["a", "b"]);
  });
});
