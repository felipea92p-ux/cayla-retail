import { describe, expect, it } from "vitest";
import { respuestasDeLaSesion } from "./mi-sesion-reglas";

const FILA = {
  nombre: "Micaela Prueba",
  es_lider: false,
  ubicacion_id: "u-tru",
  ubicacion_nombre: "Tienda Trujillo",
  ubicacion_tipo: "tienda",
};
const SESION = {
  resumen: [FILA],
  terminal: null,
  modulos: [
    { clave: "vender", completo: true },
    { clave: "caja", completo: false },
  ],
  persona_id: "p-micaela",
  es_admin: false,
  pantalla_principal: "vender",
};

describe("respuestasDeLaSesion: el sobre de fn_mi_sesion son las mismas seis respuestas de antes", () => {
  it("una persona: su fila del resumen, sus módulos, su id, si es admin y dónde aterriza; ningún error", () => {
    expect(respuestasDeLaSesion({ data: SESION, error: null, status: 200 })).toEqual({
      resumen: { data: FILA, error: null, status: 200 },
      terminal: { data: null, error: null },
      modulos: { data: SESION.modulos, error: null },
      personaId: { data: "p-micaela", error: null },
      esAdmin: { data: false },
      pantalla: { data: "vender", error: null },
    });
  });

  it("una terminal: su nombre de aparato, sin persona ni pantalla principal", () => {
    const r = respuestasDeLaSesion({
      data: { ...SESION, terminal: "Terminal Ventas TRU", persona_id: null, pantalla_principal: null },
      error: null,
      status: 200,
    });
    expect(r?.terminal).toEqual({ data: "Terminal Ventas TRU", error: null });
    expect(r?.personaId).toEqual({ data: null, error: null });
    expect(r?.pantalla).toEqual({ data: null, error: null });
  });

  it("sin fila (cuenta sin persona, terminal desactivada): resumen vacío y sin error, como .maybeSingle() → el marco dice «sin acceso»", () => {
    const r = respuestasDeLaSesion({ data: { ...SESION, resumen: [], modulos: [], persona_id: null }, error: null, status: 200 });
    expect(r?.resumen).toEqual({ data: null, error: null, status: 200 });
    expect(r?.modulos).toEqual({ data: [], error: null });
  });

  it("dos filas (persona y terminal a la vez): el error de .maybeSingle() (PGRST116, 406), que no es «la base no responde»", () => {
    const r = respuestasDeLaSesion({ data: { ...SESION, resumen: [FILA, { ...FILA, nombre: "Terminal" }] }, error: null, status: 200 });
    expect(r?.resumen.data).toBeNull();
    expect(r?.resumen.error?.code).toBe("PGRST116");
    expect(r?.resumen.status).toBe(406);
  });

  it("es_admin solo vale si es true (falla cerrado, como `soyAdmin === true`)", () => {
    expect(respuestasDeLaSesion({ data: { ...SESION, es_admin: true }, error: null, status: 200 })?.esAdmin).toEqual({ data: true });
    expect(respuestasDeLaSesion({ data: { ...SESION, es_admin: "true" }, error: null, status: 200 })?.esAdmin).toEqual({ data: false });
  });

  it("la función aún no existe en esa base (PGRST202): null → se preguntan las seis de antes", () => {
    expect(respuestasDeLaSesion({ data: null, error: { code: "PGRST202", message: "Could not find the function" }, status: 404 })).toBeNull();
  });

  it("otro error que no es caída (permiso, 42501): null → las seis de antes, nadie queda afuera por la función nueva", () => {
    expect(respuestasDeLaSesion({ data: null, error: { code: "42501", message: "permission denied" }, status: 403 })).toBeNull();
  });

  it("la base no responde: NO se pregunta seis veces más; el resumen lleva el error y el marco manda a /sin-base", () => {
    const caida = { code: "57014", message: "canceling statement due to statement timeout" };
    const r = respuestasDeLaSesion({ data: null, error: caida, status: 500 });
    expect(r?.resumen).toEqual({ data: null, error: caida, status: 500 });
    expect(r?.modulos.error).toBe(caida);
  });

  it("una forma inesperada nunca se adivina: null → las seis de antes", () => {
    for (const data of [null, "x", [], { ...SESION, resumen: null }, { ...SESION, modulos: "vender" }, { ...SESION, modulos: [{ clave: 1, completo: true }] }, { ...SESION, modulos: [{ clave: "vender" }] }, { ...SESION, resumen: ["fila"] }]) {
      expect(respuestasDeLaSesion({ data, error: null, status: 200 })).toBeNull();
    }
  });
});
