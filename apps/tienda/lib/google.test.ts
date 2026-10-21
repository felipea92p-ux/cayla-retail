import { describe, expect, it } from "vitest";
import { siguienteTrasVincular, usuarioDeGoogle, type UsuarioDelProyecto } from "./google";

const base: UsuarioDelProyecto = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "Ana.Perez@Gmail.com",
  email_confirmed_at: "2026-10-17T10:00:00Z",
  app_metadata: { provider: "google", providers: ["google"] },
  user_metadata: { full_name: "Ana Pérez" },
  identities: [{ provider: "google", identity_data: { email: "ana.perez@gmail.com", email_verified: true, full_name: "Ana María Pérez Salas" } }],
};

describe("el usuario que entró con Google", () => {
  it("con Google y el correo confirmado: su correo en minúsculas y el nombre que dice Google", () => {
    expect(usuarioDeGoogle(base)).toEqual({ id: base.id, correo: "ana.perez@gmail.com", nombre: "Ana María Pérez Salas" });
  });

  it("sin el nombre de Google, el de sus datos, y si tampoco, lo que va antes de la @", () => {
    const sinIdentidadNombre = { ...base, identities: [{ provider: "google", identity_data: { email_verified: true } }] };
    expect(usuarioDeGoogle(sinIdentidadNombre)?.nombre).toBe("Ana Pérez");
    expect(usuarioDeGoogle({ ...sinIdentidadNombre, user_metadata: {} })?.nombre).toBe("ana.perez");
  });

  it("un usuario que no entró con Google (correo y contraseña) no sirve para crear la cuenta sin código", () => {
    expect(usuarioDeGoogle({ ...base, app_metadata: { provider: "email", providers: ["email"] }, identities: [{ provider: "email" }] })).toBeNull();
    expect(usuarioDeGoogle({ ...base, app_metadata: null, identities: null })).toBeNull();
  });

  it("con Google pero el correo sin confirmar, tampoco: sin esa prueba no se crea nada", () => {
    expect(
      usuarioDeGoogle({
        ...base,
        email_confirmed_at: null,
        user_metadata: {},
        identities: [{ provider: "google", identity_data: { email: "ana@gmail.com", email_verified: false } }],
      }),
    ).toBeNull();
  });

  it("sin correo no hay cuenta", () => {
    expect(usuarioDeGoogle({ ...base, email: null, identities: [{ provider: "google", identity_data: { email_verified: true } }] })).toBeNull();
  });

  it("el nombre se limpia (espacios de más) y se recorta al tope de la ficha", () => {
    const largo = { ...base, identities: [{ provider: "google", identity_data: { email: "a@b.co", email_verified: true, full_name: `  Ana   ${"x".repeat(300)} ` } }] };
    const u = usuarioDeGoogle(largo);
    expect(u?.nombre.length).toBe(120);
    expect(u?.nombre.startsWith("Ana x")).toBe(true);
  });
});

describe("qué sigue cuando la base dijo si el correo de Google era de una ficha (ADR-0469)", () => {
  it("unida a su ficha, o con la cuenta que ya tenía: se termina de entrar", () => {
    expect(siguienteTrasVincular("vinculada")).toBe("listo");
    expect(siguienteTrasVincular("ya_tiene_cuenta")).toBe("listo");
  });

  it("hay una ficha con ese correo pero no se puede unir sola: se rechaza, sin crear otra cuenta encima", () => {
    expect(siguienteTrasVincular("no_coincide")).toBe("rechazar");
  });

  it("el correo no es de ninguna ficha, o la base no contestó (aún sin la función): sigue el registro de siempre", () => {
    expect(siguienteTrasVincular("no_aplica")).toBe("registrar");
    expect(siguienteTrasVincular("sin_respuesta")).toBe("registrar");
  });
});
