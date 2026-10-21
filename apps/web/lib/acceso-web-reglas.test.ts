import { describe, expect, it } from "vitest";
import {
  avisoDelRestablecer,
  camposDelRestablecer,
  CORREO_NUEVO_MAL_ESCRITO,
  esRechazoDelCorreoNuevo,
  leerAccesoWeb,
  leerFichaDeUnUso,
  leerPedidoDeRestablecer,
  leerResultadoDelRestablecer,
  problemaCorreoNuevo,
  respuestaDeLaTienda,
  textoDeLaTiendaOnline,
  urlDelEnvio,
  venceEnPalabras,
  type ResultadoDelRestablecer,
} from "./acceso-web-reglas";

// «Restablecer acceso a la tienda web» desde la ficha (Felipe 2026-10-15, 20261015132000). La base lo prueba en
// `scripts/pruebas/tienda_mi_cuenta.mjs`; aquí, cómo se leen sus respuestas y las de la tienda, y qué dice la hoja.

const AHORA = new Date("2026-10-15T15:00:00Z");
const PENDIENTE = { correo: "ana.nueva@gmail.com", pedido_en: "2026-10-15T14:00:00Z", vence_en: "2026-10-16T14:00:00Z", ultimo_envio_en: "2026-10-15T14:00:05Z", envios: 1 };

describe("lo que la ficha lee de la base", () => {
  it("la cuenta web y el restablecimiento pendiente; lo que no tiene la forma no se muestra", () => {
    expect(leerAccesoWeb({ cuenta_web: true, restablecer: PENDIENTE })).toEqual({
      cuentaWeb: true,
      restablecer: { correo: "ana.nueva@gmail.com", pedidoEn: PENDIENTE.pedido_en, venceEn: PENDIENTE.vence_en, ultimoEnvioEn: PENDIENTE.ultimo_envio_en, envios: 1 },
    });
    expect(leerAccesoWeb({ cuenta_web: true, restablecer: null })).toEqual({ cuentaWeb: true, restablecer: null });
    expect(leerAccesoWeb({ cuenta_web: false, restablecer: { correo: "x" } })).toEqual({ cuentaWeb: false, restablecer: null });
    expect(leerAccesoWeb({ restablecer: null })).toBeNull();
    expect(leerAccesoWeb(null)).toBeNull();
  });

  it("cuánto le queda al pedido", () => {
    expect(venceEnPalabras("2026-10-16T14:00:00Z", AHORA)).toBe("vence en 23 h");
    expect(venceEnPalabras("2026-10-15T15:40:00Z", AHORA)).toBe("vence en 40 min");
    expect(venceEnPalabras("2026-10-15T15:00:30Z", AHORA)).toBe("vence en 1 min");
    expect(venceEnPalabras("2026-10-15T14:59:00Z", AHORA)).toBe("ya venció");
    expect(venceEnPalabras("no es fecha", AHORA)).toBe("ya venció");
  });

  it("el texto: para qué sirve, o a qué correo le llegó (a medias si no es líder)", () => {
    const sinNada = leerAccesoWeb({ cuenta_web: true, restablecer: null })!;
    expect(textoDeLaTiendaOnline(sinNada, false, AHORA)).toMatch(/^Si ya no puede entrar porque perdió su correo/);
    const pendiente = leerAccesoWeb({ cuenta_web: true, restablecer: PENDIENTE })!;
    expect(textoDeLaTiendaOnline(pendiente, false, AHORA)).toBe(
      "Le mandamos un código a an•••@gmail.com: lo escribe en la tienda online, en «Restablecer mi acceso», con su contraseña nueva. El pedido vence en 23 h.",
    );
    expect(textoDeLaTiendaOnline(pendiente, true, AHORA)).toMatch(/a ana\.nueva@gmail\.com:/);
    // El código nunca salió (la tienda no contestó): lo pide el cliente.
    const sinEnvio = leerAccesoWeb({ cuenta_web: true, restablecer: { ...PENDIENTE, envios: 0, ultimo_envio_en: null } })!;
    expect(textoDeLaTiendaOnline(sinEnvio, false, AHORA)).toMatch(/el código todavía no salió: que lo pida en la tienda online, en «Restablecer mi acceso» ▸ «Obtener código»/);
  });
});

describe("el formulario de la hoja", () => {
  it("el correo nuevo es obligatorio y bien escrito", () => {
    expect(problemaCorreoNuevo("")).toBe("Escribe el correo nuevo que te da el cliente.");
    expect(problemaCorreoNuevo("  ")).toBe("Escribe el correo nuevo que te da el cliente.");
    expect(problemaCorreoNuevo("ana@gmail")).toBe(CORREO_NUEVO_MAL_ESCRITO);
    expect(problemaCorreoNuevo("ana nueva@gmail.com")).toBe(CORREO_NUEVO_MAL_ESCRITO);
    expect(problemaCorreoNuevo(" Ana.Nueva@Gmail.com ")).toBeNull();
  });

  it("los rechazos de la base que van bajo la caja del correo", () => {
    for (const hint of ["correo_invalido", "correo_de_otra_ficha", "correo_repetido", "acceso_web_mismo_correo"]) {
      expect(esRechazoDelCorreoNuevo({ message: "x", hint })).toBe(true);
    }
    expect(esRechazoDelCorreoNuevo({ message: "x", hint: "responsable_requerido" })).toBe(false);
    expect(esRechazoDelCorreoNuevo(null)).toBe(false);
  });

  it("la guía: el correo (lo que dijo la base de ESE correo manda) y quién lo hace", () => {
    const vacio = camposDelRestablecer({ correo: "", rechazo: null, responsableListo: false });
    expect(vacio.map((c) => [c.id, c.requerido, c.hecho])).toEqual([
      ["correo", true, false],
      ["responsable", true, false],
    ]);
    expect(camposDelRestablecer({ correo: "ana@gmail.com", rechazo: null, responsableListo: true }).every((c) => c.hecho)).toBe(true);
    const rechazado = camposDelRestablecer({ correo: "ana@gmail.com", rechazo: "Ese correo ya es de la ficha de Rosa.", responsableListo: true });
    expect(rechazado[0]).toMatchObject({ hecho: false, pendiente: "Ese correo ya es de la ficha de Rosa." });
  });
});

describe("la ruta del servidor del ERP", () => {
  it("lee el cuerpo de la hoja: un id de ficha y un correo (normalizado); nada más", () => {
    const id = "6f1d2c3b-4a5e-4f60-8a71-92b3c4d5e6f7";
    expect(leerPedidoDeRestablecer({ clientaId: id, correo: " Ana@Gmail.com " })).toEqual({ clientaId: id, correo: "ana@gmail.com" });
    expect(leerPedidoDeRestablecer({ clientaId: "1", correo: "ana@gmail.com" })).toBeNull();
    expect(leerPedidoDeRestablecer({ clientaId: id })).toBeNull();
    expect(leerPedidoDeRestablecer({ clientaId: id, correo: "a".repeat(401) })).toBeNull();
    expect(leerPedidoDeRestablecer(null)).toBeNull();
  });

  it("la ficha de un solo uso: 64 cifras hexadecimales, con su correo y su vencimiento", () => {
    const token = "ab".repeat(32);
    expect(leerFichaDeUnUso({ token, correo_nuevo: "Ana@Gmail.com", vence_en: "2026-10-16T14:00:00Z" })).toEqual({
      token,
      correo: "ana@gmail.com",
      venceEn: "2026-10-16T14:00:00Z",
    });
    expect(leerFichaDeUnUso({ token: token.toUpperCase(), correo_nuevo: "a@b.co", vence_en: "x" })).toBeNull();
    expect(leerFichaDeUnUso({ token, vence_en: "x" })).toBeNull();
    expect(leerFichaDeUnUso(null)).toBeNull();
  });

  it("la dirección de la tienda sale de TIENDA_URL (http o https); sin ella, no se manda nada", () => {
    expect(urlDelEnvio("https://tienda.cayla.pe")).toBe("https://tienda.cayla.pe/api/restablecer-acceso");
    expect(urlDelEnvio("http://localhost:3171/")).toBe("http://localhost:3171/api/restablecer-acceso");
    expect(urlDelEnvio(" ")).toBeNull();
    expect(urlDelEnvio(undefined)).toBeNull();
    expect(urlDelEnvio("ftp://tienda.cayla.pe")).toBeNull();
    expect(urlDelEnvio("tienda.cayla.pe")).toBeNull();
  });

  it("lo que contesta la tienda: solo un 200 con un estado conocido cuenta; lo demás es «no disponible»", () => {
    expect(respuestaDeLaTienda(200, { estado: "enviado" })).toEqual({ estado: "enviado" });
    expect(respuestaDeLaTienda(200, { estado: "esperar", segundos: 41 })).toEqual({ estado: "esperar", segundos: 41 });
    expect(respuestaDeLaTienda(200, { estado: "limite", minutos: 12 })).toEqual({ estado: "limite", minutos: 12 });
    expect(respuestaDeLaTienda(200, { estado: "bloqueado" })).toEqual({ estado: "bloqueado", minutos: 1 });
    expect(respuestaDeLaTienda(200, { estado: "correo_tomado" })).toEqual({ estado: "correo_tomado" });
    expect(respuestaDeLaTienda(200, { estado: "invalido" })).toEqual({ estado: "invalido" });
    expect(respuestaDeLaTienda(503, { estado: "no_disponible" })).toEqual({ estado: "no_disponible" });
    expect(respuestaDeLaTienda(400, { estado: "enviado" })).toEqual({ estado: "no_disponible" });
    expect(respuestaDeLaTienda(200, "<html>")).toEqual({ estado: "no_disponible" });
  });

  it("lo que la ruta le devuelve a la hoja se vuelve a leer (y nunca trae la ficha de un solo uso)", () => {
    const r = leerResultadoDelRestablecer({ correo: "ana@gmail.com", venceEn: "2026-10-16T14:00:00Z", envio: { estado: "esperar", segundos: 30 }, token: "ab".repeat(32) });
    expect(r).toEqual({ correo: "ana@gmail.com", venceEn: "2026-10-16T14:00:00Z", envio: { estado: "esperar", segundos: 30 } });
    expect(JSON.stringify(r)).not.toContain("abab");
    expect(leerResultadoDelRestablecer({ correo: "a@b.co", venceEn: "x", envio: { estado: "raro" } })?.envio).toEqual({ estado: "no_disponible" });
    expect(leerResultadoDelRestablecer({ correo: "a@b.co" })).toBeNull();
  });
});

describe("el aviso al terminar", () => {
  const con = (envio: ResultadoDelRestablecer["envio"]): ResultadoDelRestablecer => ({ correo: "ana.nueva@gmail.com", venceEn: "2026-10-16T14:00:00Z", envio });

  it("salió: éxito, con el correo a medias para quien no es líder", () => {
    const a = avisoDelRestablecer(con({ estado: "enviado" }), false);
    expect(a.tipo).toBe("exito");
    expect(a.titulo).toBe("Código enviado");
    expect(a.detalle).toMatch(/^Le llegó a an•••@gmail\.com/);
    expect(avisoDelRestablecer(con({ estado: "enviado" }), true).detalle).toMatch(/ana\.nueva@gmail\.com/);
  });

  it("no salió ahora: el pedido quedó y el cliente pide su código en la tienda online", () => {
    expect(avisoDelRestablecer(con({ estado: "esperar", segundos: 40 }), false)).toMatchObject({ tipo: "aviso", detalle: expect.stringMatching(/En 40 segundos, que pida otro en la tienda online/) });
    expect(avisoDelRestablecer(con({ estado: "limite", minutos: 1 }), false).detalle).toMatch(/^En 1 minuto,/);
    expect(avisoDelRestablecer(con({ estado: "bloqueado", minutos: 15 }), false).detalle).toMatch(/^En 15 minutos,/);
    for (const estado of ["no_disponible", "sin_tienda", "invalido"] as const) {
      const a = avisoDelRestablecer(con({ estado }), false);
      expect(a.tipo).toBe("aviso");
      expect(a.detalle).toMatch(/El pedido quedó por un día: que el cliente pida su código en la tienda online/);
    }
  });

  it("el correo ya lo usa otra cuenta del proyecto de clientes: hay que pedirle otro", () => {
    expect(avisoDelRestablecer(con({ estado: "correo_tomado" }), false)).toMatchObject({ tipo: "error", titulo: "Ese correo ya lo usa otra cuenta de la tienda online" });
  });

  it("sin género y sin jerga", () => {
    const textos = (["enviado", "correo_tomado", "no_disponible"] as const).map((estado) => {
      const a = avisoDelRestablecer(con({ estado }), false);
      return `${a.titulo} ${a.detalle}`.toLocaleLowerCase("es");
    });
    for (const t of textos) {
      const palabras = t.split(/[^\p{L}]+/u);
      for (const p of ["clienta", "socia", "token", "ficha", "proyecto"]) expect(palabras, p).not.toContain(p);
    }
  });
});
