import { describe, expect, it } from "vitest";
import { COOKIE_GOOGLE_CORREO, correoOcultoDeLaCookie, correoOcultoValido, siguienteTrasVincular, usuarioDeGoogle, type UsuarioDelProyecto } from "./google";
import { googleYaTienesCuentaCon } from "./cuentas-mensajes";

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

  it("la ficha ya tiene cuenta con otro correo y el nombre coincide: se le dice con cuál entrar, sin unir ni crear nada", () => {
    expect(siguienteTrasVincular("otro_correo")).toBe("otro_correo");
  });

  it("el correo no es de ninguna ficha, o la base no contestó (aún sin la función): sigue el registro de siempre", () => {
    expect(siguienteTrasVincular("no_aplica")).toBe("registrar");
    expect(siguienteTrasVincular("sin_respuesta")).toBe("registrar");
  });
});

describe("el correo de la cuenta, a medias, que «Entrar» le dice a quien ya tiene cuenta con otro correo (20261021182000)", () => {
  it("solo se muestra un correo tal como lo arma la base: dos letras, cuatro puntos y el dominio", () => {
    expect(correoOcultoValido("su••••@gmail.com")).toBe("su••••@gmail.com");
    expect(correoOcultoValido("a••••@correo.pe")).toBe("a••••@correo.pe");
  });

  it("lo que no tiene esa forma (un correo entero, un texto cualquiera, algo con espacios o con marcas) no se muestra", () => {
    for (const malo of ["sub@gmail.com", "su••••@", "su•••@gmail.com", "su •••• @gmail.com", "<b>su••••</b>@x.com", "", null, undefined, 42]) {
      expect(correoOcultoValido(malo)).toBeNull();
    }
  });

  it("se lee de la cookie corta, venga con otras o codificada, y si no está o está mal no devuelve nada", () => {
    const valor = encodeURIComponent("su••••@gmail.com");
    expect(correoOcultoDeLaCookie(`a=1; ${COOKIE_GOOGLE_CORREO}=${valor}; b=2`)).toBe("su••••@gmail.com");
    expect(correoOcultoDeLaCookie("a=1; b=2")).toBeNull();
    expect(correoOcultoDeLaCookie(`${COOKIE_GOOGLE_CORREO}=sub%40gmail.com`)).toBeNull();
    expect(correoOcultoDeLaCookie(`${COOKIE_GOOGLE_CORREO}=%E0%A4%A`)).toBeNull();
  });

  it("el mensaje dice con qué correo entrar y qué hacer para usar Google después", () => {
    const texto = googleYaTienesCuentaCon("su••••@gmail.com");
    expect(texto).toContain("su••••@gmail.com");
    expect(texto).toContain("Mi cuenta");
  });
});
