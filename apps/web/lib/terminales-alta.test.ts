import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { cambiarClaveTerminalCon, crearTerminalCon, type AdminTerminales, type Dependencias } from "./terminales-alta";

// Lo que se prueba aquí es la REGLA de seguridad de crear terminales desde la pantalla: la llave de servicio (`admin`)
// no se abre si la base no confirma, con la sesión de quien llama, que es líder. Y que nunca queda una cuenta de Auth
// sin su fila en `retail.terminales`.

const TRU = "11111111-1111-4111-8111-111111111111";
const ROL = "22222222-2222-4222-8222-222222222222";

function adminDoble(sobre: Partial<AdminTerminales> = {}): AdminTerminales {
  return {
    leerTienda: vi.fn(async (id: string) => ({ id, nombre: "Tienda TRU", tipo: "tienda", activo: true })),
    leerRol: vi.fn(async (id: string) => ({ id, nombre: "Terminal de ventas", clave: "terminal_ventas", fijo: false, archivado: false })),
    nombreActivoOcupado: vi.fn(async () => false),
    crearUsuario: vi.fn(async () => ({ id: "auth-nuevo" })),
    borrarUsuario: vi.fn(async () => true),
    insertarTerminal: vi.fn(async () => ({ error: null })),
    leerTerminal: vi.fn(async (id: string) => ({ id, nombre: "Terminal Caja TRU", auth_user_id: "auth-1", ubicacion_nombre: "Tienda TRU" })),
    correoDeUsuario: vi.fn(async () => "terminal-tru-caja-abcd@cayla.pe"),
    cambiarClave: vi.fn(async () => true),
    ...sobre,
  };
}

function deps(esLider: boolean | null | "lanza", admin = adminDoble()) {
  const abrirAdmin = vi.fn(() => admin);
  const registrarCambioClave = vi.fn(async (terminalId: string): Promise<string | null> => (void terminalId, null));
  const d: Dependencias = {
    puedeGestionar: async () => {
      if (esLider === "lanza") throw new Error("sin red");
      return esLider;
    },
    // El responsable del combo (fn_actor_persona_id(true)): no es necesariamente la cuenta que inició sesión.
    personaActual: async () => ({ id: "persona-responsable" }),
    registrarCambioClave,
    admin: abrirAdmin,
    azar: (n) => randomBytes(n),
  };
  return { d, abrirAdmin, admin, registrarCambioClave };
}

// Lo que la base contesta cuando nadie eligió responsable (hint de fn_actor_persona_id, 20260923010000).
const SIN_RESPONSABLE = {
  error: "Elige quién hace esta operación",
  causa: { code: "42501", hint: "responsable_requerido", message: "Elige quién hace esta operación" },
};

const ENTRADA = { ubicacionId: TRU, nombre: "Terminal Caja TRU", rolId: ROL };

describe("solo un líder crea: la llave de servicio ni se abre para nadie más", () => {
  it.each([
    ["no es líder", false],
    ["la base no respondió", null],
    ["la pregunta lanzó", "lanza"],
  ] as const)("%s → rechazado y `admin()` nunca se llama", async (_caso, esLider) => {
    const { d, abrirAdmin } = deps(esLider);
    expect(await crearTerminalCon(d, ENTRADA)).toEqual({ ok: false, error: expect.stringMatching(/Solo un líder/) });
    expect(await cambiarClaveTerminalCon(d, { terminalId: "t1" })).toEqual({ ok: false, error: expect.stringMatching(/Solo un líder/) });
    expect(abrirAdmin).not.toHaveBeenCalled();
  });

  it("el candado va ANTES que la validación: a un no-líder no se le dice ni qué campo falta", async () => {
    const { d } = deps(false);
    expect(await crearTerminalCon(d, { ubicacionId: "", nombre: "", rolId: "" })).toMatchObject({ error: expect.stringMatching(/Solo un líder/) });
  });

  it("ADR-0178: con un rol que tiene módulos que quien crea no ve, se rechaza sin abrir la llave", async () => {
    const { d, abrirAdmin } = deps(true);
    for (const respuesta of [false, null] as const) {
      const r = await crearTerminalCon({ ...d, rolDentroDeLoMio: async () => respuesta }, ENTRADA);
      expect(r).toEqual({ ok: false, error: expect.stringMatching(/solo puedes dar lo que tú ves/) });
    }
    expect(abrirAdmin).not.toHaveBeenCalled();
  });

  it("si falta la llave en el servidor, lo dice claro (y no crea nada)", async () => {
    const d: Dependencias = {
      puedeGestionar: async () => true,
      personaActual: async () => ({ id: "persona-responsable" }),
      registrarCambioClave: async () => null,
      admin: () => {
        throw new Error("Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor");
      },
      azar: (n) => randomBytes(n),
    };
    expect(await crearTerminalCon(d, ENTRADA)).toEqual({ ok: false, error: "Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor" });
  });
});

describe("crear (líder)", () => {
  it("crea la cuenta y la fila, con creada_por = el responsable del combo, y devuelve correo y clave UNA vez", async () => {
    const { d, admin } = deps(true);
    const r = await crearTerminalCon(d, { ...ENTRADA, nombre: "  Terminal  Caja TRU " });
    expect(r).toMatchObject({ ok: true, nombre: "Terminal Caja TRU", tienda: "Tienda TRU" });
    if (!r.ok) throw new Error("debía crear");
    expect(r.correo).toMatch(/^terminal-tru-caja-[a-z0-9]{4}@cayla\.pe$/);
    expect(r.clave).toMatch(/^[^-]{5}-[^-]{5}-[^-]{5}-[^-]{5}$/);
    expect(admin.crearUsuario).toHaveBeenCalledWith(r.correo, r.clave);
    expect(admin.insertarTerminal).toHaveBeenCalledWith({
      ubicacion_id: TRU,
      nombre: "Terminal Caja TRU",
      rol_id: ROL,
      auth_user_id: "auth-nuevo",
      creada_por: "persona-responsable",
    });
    expect(admin.borrarUsuario).not.toHaveBeenCalled();
  });

  it("si la fila no entra, BORRA la cuenta recién creada y explica por qué", async () => {
    const admin = adminDoble({ insertarTerminal: vi.fn(async () => ({ error: { code: "23505", message: "duplicate key" } })) });
    const { d } = deps(true, admin);
    const r = await crearTerminalCon(d, ENTRADA);
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/ya tiene una terminal activa con ese nombre/) });
    expect(admin.borrarUsuario).toHaveBeenCalledWith("auth-nuevo");
  });

  it("si ni siquiera se pudo borrar, avisa cuál cuenta quedó suelta", async () => {
    const admin = adminDoble({
      insertarTerminal: vi.fn(async () => ({ error: { code: "23514", message: "x" } })),
      borrarUsuario: vi.fn(async () => false),
    });
    const r = await crearTerminalCon(deps(true, admin).d, ENTRADA);
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/quedó creada sin terminal/) });
  });

  it("no toca Auth si la tienda no es una tienda activa, el rol es Líder o está archivado, o el nombre ya lo usa otra activa", async () => {
    const casos: Partial<AdminTerminales>[] = [
      { leerTienda: vi.fn(async () => ({ id: TRU, nombre: "Almacén", tipo: "almacen", activo: true })) },
      { leerTienda: vi.fn(async () => ({ id: TRU, nombre: "Tienda LIM", tipo: "tienda", activo: false })) },
      { leerRol: vi.fn(async () => ({ id: ROL, nombre: "Líder de equipo", clave: "lider", fijo: true, archivado: false })) },
      { leerRol: vi.fn(async () => ({ id: ROL, nombre: "Viejo", clave: null, fijo: false, archivado: true })) },
      { nombreActivoOcupado: vi.fn(async () => true) },
    ];
    for (const sobre of casos) {
      const admin = adminDoble(sobre);
      const r = await crearTerminalCon(deps(true, admin).d, ENTRADA);
      expect(r.ok).toBe(false);
      expect(admin.crearUsuario).not.toHaveBeenCalled();
    }
  });

  it("si el correo al azar ya existía, reintenta con otro sufijo", async () => {
    let n = 0;
    const admin = adminDoble({
      crearUsuario: vi.fn(async () => (n++ === 0 ? { error: "email_exists", yaExiste: true } : { id: "auth-2" })),
    });
    const r = await crearTerminalCon(deps(true, admin).d, ENTRADA);
    expect(r.ok).toBe(true);
    expect(admin.crearUsuario).toHaveBeenCalledTimes(2);
  });
});

describe("quién (ADR-0161 act. d): sin responsable válido no se toca nada", () => {
  it("crear sin responsable → el mensaje de la base, y ni la llave ni la cuenta de Auth", async () => {
    const { d, abrirAdmin, admin } = deps(true);
    const r = await crearTerminalCon({ ...d, personaActual: async () => SIN_RESPONSABLE }, ENTRADA);
    expect(r).toEqual({ ok: false, error: "Elige quién hace esta operación", causa: SIN_RESPONSABLE.causa });
    expect(abrirAdmin).not.toHaveBeenCalled();
    expect(admin.crearUsuario).not.toHaveBeenCalled();
  });

  it("si preguntar por el responsable lanza, también se corta (falla cerrado)", async () => {
    const { d, abrirAdmin } = deps(true);
    const r = await crearTerminalCon({ ...d, personaActual: async () => { throw new Error("sin red"); } }, ENTRADA);
    expect(r).toEqual({ ok: false, error: "sin red" });
    expect(abrirAdmin).not.toHaveBeenCalled();
  });

  it("cambiar la clave sin responsable → no cambia la clave ni anota nada", async () => {
    const { d, abrirAdmin, admin, registrarCambioClave } = deps(true);
    const r = await cambiarClaveTerminalCon({ ...d, personaActual: async () => SIN_RESPONSABLE }, { terminalId: "t1" });
    expect(r).toMatchObject({ ok: false, error: "Elige quién hace esta operación" });
    expect(abrirAdmin).not.toHaveBeenCalled();
    expect(admin.cambiarClave).not.toHaveBeenCalled();
    expect(registrarCambioClave).not.toHaveBeenCalled();
  });
});

describe("cambiar la clave (líder)", () => {
  it("pone una clave nueva y la devuelve con el correo de la cuenta", async () => {
    const { d, admin } = deps(true);
    const r = await cambiarClaveTerminalCon(d, { terminalId: "t1" });
    expect(r).toMatchObject({ ok: true, nombre: "Terminal Caja TRU", correo: "terminal-tru-caja-abcd@cayla.pe" });
    if (!r.ok) throw new Error("debía cambiar");
    expect(admin.cambiarClave).toHaveBeenCalledWith("auth-1", r.clave);
  });

  it("después de cambiarla anota quién, con la terminal (registrar_cambio_clave_terminal)", async () => {
    const { d, admin, registrarCambioClave } = deps(true);
    const r = await cambiarClaveTerminalCon(d, { terminalId: "t1" });
    expect(r.ok).toBe(true);
    expect(r).not.toHaveProperty("aviso");
    expect(registrarCambioClave).toHaveBeenCalledWith("t1");
    // El orden importa: primero la clave (con la llave), luego quién (con la sesión firmada).
    expect((admin.cambiarClave as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]).toBeLessThan(registrarCambioClave.mock.invocationCallOrder[0]);
  });

  it("si anotar quién falla, la clave igual vuelve (ya cambió) pero con un aviso", async () => {
    const { d } = deps(true);
    const r = await cambiarClaveTerminalCon({ ...d, registrarCambioClave: async () => "Esa terminal ya no existe." }, { terminalId: "t1" });
    expect(r).toMatchObject({ ok: true, clave: expect.any(String), aviso: expect.stringMatching(/no quedó anotado quién.*ya no existe/) });
  });

  it("si la clave no cambió, no se anota nada", async () => {
    const admin = adminDoble({ cambiarClave: vi.fn(async () => false) });
    const { d, registrarCambioClave } = deps(true, admin);
    expect(await cambiarClaveTerminalCon(d, { terminalId: "t1" })).toMatchObject({ ok: false });
    expect(registrarCambioClave).not.toHaveBeenCalled();
  });

  it("una terminal sin cuenta no se puede: hay que crear otra", async () => {
    const admin = adminDoble({ leerTerminal: vi.fn(async () => ({ id: "t1", nombre: "Vieja", auth_user_id: null, ubicacion_nombre: "Tienda TRU" })) });
    expect(await cambiarClaveTerminalCon(deps(true, admin).d, { terminalId: "t1" })).toMatchObject({ ok: false, error: expect.stringMatching(/ya no tiene cuenta/) });
    expect(admin.cambiarClave).not.toHaveBeenCalled();
  });
});
