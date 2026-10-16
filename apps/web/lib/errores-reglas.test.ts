import { describe, expect, it } from "vitest";
import {
  debeAvisarDesdeElNavegador,
  ERRORES_QUE_NO_AVISAN,
  limpiarDatosPersonales,
  limpiarEvento,
  opcionesDeSentry,
  sentryActivo,
  siSigueIgual,
  sinConsulta,
} from "./errores-reglas";

// Lo que sale hacia Sentry (un servicio de afuera) y cuándo se le escribe a Felipe (ADR-0424). Estas reglas solo trabajan cuando
// algo ya salió mal, así que nadie las ve fallar: un dato personal que se escapa o un aviso que no llega se descubrirían tarde.

describe("limpiarDatosPersonales", () => {
  it.each([
    ["DNI", "Key (dni)=(12345678) already exists", "Key (dni)=([número]) already exists"],
    ["RUC", "El RUC 20123456789 no está habido", "El RUC [número] no está habido"],
    ["celular", "WhatsApp a 987654321 falló", "WhatsApp a [número] falló"],
    ["tarjeta", "tarjeta 4111111111111111", "tarjeta [número]"],
    ["correo", "duplicado: juana.perez+club@gmail.com", "duplicado: [correo]"],
    ["DNI al final de la frase", "No existe el DNI 12345678.", "No existe el DNI [número]."],
  ])("quita el %s", (_, entrada, salida) => {
    expect(limpiarDatosPersonales(entrada)).toBe(salida);
  });

  it.each([
    ["un número corto", "HTTP 404 en la fila 1234567"],
    ["el tramo final de un uuid", "variante 123e4567-e89b-12d3-a456-426614174000 no existe"],
    ["un archivo con número", "falló /_next/static/chunks/12345678.js y chunk-87654321.js"],
    ["una versión", "next 16.2.10 en 20261015120000.sql"],
  ])("deja %s", (_, texto) => {
    expect(limpiarDatosPersonales(texto)).toBe(texto);
  });
});

describe("sinConsulta", () => {
  it("quita lo que alguien buscó y el ancla, deja la pantalla", () => {
    expect(sinConsulta("https://erp.cayla.pe/clientas?q=Juana%20P%C3%A9rez&p=2#ficha")).toBe("https://erp.cayla.pe/clientas");
    expect(sinConsulta("/vender")).toBe("/vender");
  });
});

describe("limpiarEvento", () => {
  it("limpia el mensaje y la excepción; de la petición y las migas deja solo la lista blanca (nunca la cookie de sesión)", () => {
    const evento = {
      message: "cliente 12345678",
      exception: { values: [{ value: "correo ana@cayla.pe" }, {}] },
      request: {
        url: "https://erp.cayla.pe/buscar?q=ana",
        method: "GET",
        query_string: "q=ana",
        cookies: { "sb-ref-auth-token": "base64-eyJhY2Nlc3NfdG9rZW4i" },
        headers: { cookie: "sb-ref-auth-token=base64-eyJ", "user-agent": "Chrome", referer: "https://erp.cayla.pe/clientas?q=ana" },
        data: { dni: "12345678" },
      },
      breadcrumbs: [
        { message: "clic en 987654321", data: { arguments: [{ message: "DNI 12345678" }], logger: "console" } },
        { data: { url: "/rest/v1/clientas?dni=eq.12345678", from: "/clientas?q=ana", to: "/vender#x", method: "GET", status_code: 500 } },
      ],
    };
    const limpio = limpiarEvento(evento);
    expect(limpio).toBe(evento);
    expect(limpio).toEqual({
      message: "cliente [número]",
      exception: { values: [{ value: "correo [correo]" }, {}] },
      request: { url: "https://erp.cayla.pe/buscar", method: "GET", headers: { "User-Agent": "Chrome" } },
      breadcrumbs: [
        { message: "clic en [número]", data: {} },
        { data: { url: "/rest/v1/clientas", from: "/clientas", to: "/vender", method: "GET", status_code: 500 } },
      ],
    });
  });

  it("quita la búsqueda de la copia de la dirección que guarda Next (probado contra un Sentry de mentira)", () => {
    const evento = { contexts: { nextjs: { request_path: "/clientas?q=Juana+Perez", route_type: "render" } } };
    expect(limpiarEvento(evento).contexts.nextjs).toEqual({ request_path: "/clientas", route_type: "render" });
  });

  it("un evento sin nada que limpiar pasa entero", () => {
    expect(limpiarEvento({})).toEqual({});
  });
});

describe("ERRORES_QUE_NO_AVISAN", () => {
  const callado = (m: string) => ERRORES_QUE_NO_AVISAN.some((p) => (typeof p === "string" ? m.includes(p) : p.test(m)));

  it.each(["Failed to fetch", "NetworkError when attempting to fetch resource.", "Load failed", "ResizeObserver loop completed with undelivered notifications."])(
    "calla el parpadeo del navegador «%s»",
    (m) => expect(callado(m)).toBe(true),
  );

  it.each(["fetch failed", "Cannot read properties of undefined (reading 'precio')", "Failed to fetch dynamically imported module: /x.js"])(
    "avisa «%s» (el servidor sin Supabase, un error del código, una versión vieja)",
    (m) => expect(callado(m)).toBe(false),
  );
});

describe("sentryActivo", () => {
  it.each([
    [{ dsn: "https://k@o1.ingest.sentry.io/2", entorno: "production" }, true],
    [{ dsn: "https://k@o1.ingest.sentry.io/2", entorno: "preview" }, false],
    [{ dsn: "https://k@o1.ingest.sentry.io/2", entorno: "local" }, false],
    [{ dsn: "", entorno: "production" }, false],
    [{ dsn: undefined, entorno: "production" }, false],
    [{ dsn: "https://k@o1.ingest.sentry.io/2", entorno: undefined }, false],
  ])("%o → %s", (entorno, esperado) => expect(sentryActivo(entorno)).toBe(esperado));
});

describe("opcionesDeSentry", () => {
  it("sin datos de quien usó la pantalla, sin rastreo de tiempos, y apagado fuera de producción", () => {
    const o = opcionesDeSentry({ dsn: "https://k@o1.ingest.sentry.io/2", entorno: "preview" });
    expect(o.sendDefaultPii).toBe(false);
    expect(o).not.toHaveProperty("tracesSampleRate");
    expect(o.enabled).toBe(false);
    expect(o.environment).toBe("preview");
    expect(opcionesDeSentry({ dsn: undefined, entorno: undefined }).environment).toBe("local");
  });

  it("limpia antes de mandar", () => {
    const o = opcionesDeSentry({ dsn: "x", entorno: "production" });
    expect(o.beforeSend({ message: "DNI 12345678" }).message).toBe("DNI [número]");
    expect(o.beforeBreadcrumb({ data: { url: "/x?q=ana" } }).data?.url).toBe("/x");
  });
});

describe("debeAvisarDesdeElNavegador", () => {
  it("avisa lo que nació en el navegador y no lo que ya avisó el servidor (llega con digest)", () => {
    expect(debeAvisarDesdeElNavegador(new Error("boom"))).toBe(true);
    expect(debeAvisarDesdeElNavegador(Object.assign(new Error("An error occurred in the Server Components render."), { digest: "3460033225" }))).toBe(false);
  });
});

describe("siSigueIgual", () => {
  it("si el sistema avisa solo, no manda a la persona a buscar a Felipe; si no, sí", () => {
    expect(siSigueIgual(true)).toContain("le llega un aviso");
    expect(siSigueIgual(false)).toBe("Reintenta; si sigue igual, avisa a Felipe.");
  });
});
