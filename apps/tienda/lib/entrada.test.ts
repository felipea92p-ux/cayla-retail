import { describe, expect, it } from "vitest";
import { MENSAJES } from "./cuentas-mensajes";
import {
  conAviso,
  debeAnotarEntrada,
  hrefConVolver,
  leerAnotacion,
  leerUsuariosPorBorrar,
  marcaDeEntrada,
  problemaAlEntrar,
  rutaParaVolver,
} from "./entrada";

// La entrada a la tienda cuenta como actividad del Club (Felipe 2026-10-14): se anota al iniciar sesión y, como mucho, una vez al
// día por sesión. Aquí, sin red: cuándo hace falta anotarla y cómo se lee lo que contesta la base.

const ANA = "0b6a1d7e-1111-4222-8333-444455556666";
const BEA = "0b6a1d7e-1111-4222-8333-777788889999";
// 2026-10-14 a las 22:30 de Lima (03:30 UTC del 15): el día es el de Lima, no el del servidor.
const NOCHE_LIMA = new Date("2026-10-15T03:30:00Z");
const MANANA_LIMA = new Date("2026-10-15T13:00:00Z");

describe("la entrada del día", () => {
  it("la marca es el día de Lima y de quién es la sesión", () => {
    expect(marcaDeEntrada(ANA, NOCHE_LIMA)).toBe(`2026-10-14.${ANA}`);
    expect(marcaDeEntrada(ANA, MANANA_LIMA)).toBe(`2026-10-15.${ANA}`);
  });

  it("sin marca, con la de otro día o con la de otra cuenta, se anota; con la de hoy y suya, no", () => {
    expect(debeAnotarEntrada(undefined, ANA, NOCHE_LIMA)).toBe(true);
    expect(debeAnotarEntrada(null, ANA, NOCHE_LIMA)).toBe(true);
    expect(debeAnotarEntrada(marcaDeEntrada(ANA, NOCHE_LIMA), ANA, NOCHE_LIMA)).toBe(false);
    // Al día siguiente (en Lima), otra vez: la entrada es «una vez al día por sesión».
    expect(debeAnotarEntrada(marcaDeEntrada(ANA, NOCHE_LIMA), ANA, MANANA_LIMA)).toBe(true);
    // En el mismo aparato entra otra cuenta: la suya se anota aunque el aparato ya tenga la marca de hoy.
    expect(debeAnotarEntrada(marcaDeEntrada(ANA, NOCHE_LIMA), BEA, NOCHE_LIMA)).toBe(true);
    expect(debeAnotarEntrada("cualquier cosa", ANA, NOCHE_LIMA)).toBe(true);
  });

  it("lo que contesta tienda_anotar_entrada: anotada, cerrada, sin_cuenta; lo demás, sin respuesta", () => {
    expect(leerAnotacion({ estado: "anotada" })).toBe("anotada");
    expect(leerAnotacion({ estado: "cerrada" })).toBe("cerrada");
    expect(leerAnotacion({ estado: "sin_cuenta" })).toBe("sin_cuenta");
    expect(leerAnotacion({ estado: "otra" })).toBe("sin_respuesta");
    expect(leerAnotacion(null)).toBe("sin_respuesta");
    expect(leerAnotacion("anotada")).toBe("sin_respuesta");
  });

  it("lo que contesta tienda_usuarios_por_borrar: solo ids de usuario; si no se entiende, ninguno (nunca se borra a ciegas)", () => {
    expect(leerUsuariosPorBorrar({ usuarios: [ANA, BEA] })).toEqual([ANA, BEA]);
    expect(leerUsuariosPorBorrar({ usuarios: [] })).toEqual([]);
    expect(leerUsuariosPorBorrar({ usuarios: [ANA, "no-es-un-id"] })).toEqual([]);
    expect(leerUsuariosPorBorrar(null)).toEqual([]);
  });
});

describe("lo que pide «Entrar» (el botón se toca siempre y dice qué falta)", () => {
  it("el correo primero: vacío o sin forma de correo; después la contraseña", () => {
    expect(problemaAlEntrar("", "")).toEqual({ campo: "correo", mensaje: MENSAJES.entrarSinCorreo });
    expect(problemaAlEntrar("   ", "clave-larga")).toEqual({ campo: "correo", mensaje: MENSAJES.entrarSinCorreo });
    expect(problemaAlEntrar("ana@gmail", "clave-larga")).toEqual({ campo: "correo", mensaje: MENSAJES.correoMal });
    expect(problemaAlEntrar("ana@gmail.com", "")).toEqual({ campo: "clave", mensaje: MENSAJES.entrarSinClave });
  });

  it("una contraseña de menos de 8 nunca es la de una cuenta: no se gasta un intento en ella", () => {
    expect(problemaAlEntrar("ana@gmail.com", "1234567")).toEqual({ campo: "clave", mensaje: MENSAJES.entrarClaveCorta });
    expect(problemaAlEntrar(" Ana@Gmail.com ", "12345678")).toBeNull();
  });
});

describe("a dónde vuelve quien entra (`?volver=`)", () => {
  it("vuelve a la página que estaba viendo: una prenda, su pedido, su bolsa, con lo que traía su dirección", () => {
    expect(rutaParaVolver("/catalogo/6e4cc783-b9d3-4aae-b8ea-c510cd692fd0")).toBe("/catalogo/6e4cc783-b9d3-4aae-b8ea-c510cd692fd0");
    expect(rutaParaVolver("/catalogo?sede=trujillo&lista=ofertas")).toBe("/catalogo?sede=trujillo&lista=ofertas");
    expect(rutaParaVolver("/cuenta/pedidos/W-0141")).toBe("/cuenta/pedidos/W-0141");
    expect(rutaParaVolver("/bolsa")).toBe("/bolsa");
    expect(rutaParaVolver("/inicio")).toBe("/inicio");
    // El trozo después de # no viaja.
    expect(rutaParaVolver("/looks#look-2")).toBe("/looks");
  });

  it("nunca otra web: con dominio, sin barra, con dos barras o con barra invertida", () => {
    for (const ajena of ["https://otra.web/catalogo", "//otra.web/catalogo", "/\\otra.web", "\\otra.web", "javascript:alert(1)", "catalogo"]) {
      expect(rutaParaVolver(ajena)).toBeNull();
    }
  });

  it("nunca las páginas de la cuenta misma (daría vueltas): «Entrar», «Crear cuenta», recuperar el acceso ni las rutas internas", () => {
    for (const ruta of ["/entrar", "/crear-cuenta", "/olvide-mi-contrasena", "/nueva-contrasena", "/restablecer-acceso", "/api/version", "/cuenta/../entrar"]) {
      expect(rutaParaVolver(ruta)).toBeNull();
    }
  });

  it("nada raro: vacío, demasiado largo, con espacios o caracteres de control, o que no es texto", () => {
    expect(rutaParaVolver("")).toBeNull();
    expect(rutaParaVolver(null)).toBeNull();
    expect(rutaParaVolver(42)).toBeNull();
    expect(rutaParaVolver(`/catalogo/${"x".repeat(400)}`)).toBeNull();
    expect(rutaParaVolver("/catalogo/una prenda")).toBeNull();
    expect(rutaParaVolver(`/catalogo/x${String.fromCharCode(10)}`)).toBeNull();
  });

  it("los enlaces entre «Entrar» y «Crear cuenta» llevan el destino; sin destino, la dirección de siempre", () => {
    expect(hrefConVolver("/entrar", null)).toBe("/entrar");
    expect(hrefConVolver("/crear-cuenta", "/cuenta/pedidos/W-0141")).toBe("/crear-cuenta?volver=%2Fcuenta%2Fpedidos%2FW-0141");
    // Lo que el enlace lleva es lo que la otra página lee de vuelta.
    const leido = new URL(hrefConVolver("/entrar", "/catalogo?sede=lima"), "https://x.invalid").searchParams.get("volver");
    expect(rutaParaVolver(leido)).toBe("/catalogo?sede=lima");
  });

  it("el aviso «Listo: …» se suma a la dirección sin perder lo que traía", () => {
    expect(conAviso("/catalogo/abc", "bienvenida")).toBe("/catalogo/abc?aviso=bienvenida");
    expect(conAviso("/catalogo?sede=lima", "unida")).toBe("/catalogo?sede=lima&aviso=unida");
    expect(conAviso("/entrar?volver=%2Fbolsa", "cuenta-creada")).toBe("/entrar?volver=%2Fbolsa&aviso=cuenta-creada");
  });
});
