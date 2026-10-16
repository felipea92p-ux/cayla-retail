import { describe, expect, it } from "vitest";
import {
  correoPorConciliar,
  estadoCambioDeCorreo,
  estadoClaveActual,
  estadoCorreoNuevo,
  estadoRestablecer,
  leerCorreoConfirmado,
  leerEliminacion,
  leerEnvioDelRestablecer,
  leerFichaDelErp,
  leerIntentoDeClave,
  leerIntentoDelCodigo,
  leerLoQueFrena,
  leerPedidoDeCambio,
  mensajeClaveBloqueada,
  mensajeDelTope,
  nadaQueFrene,
  pasoQueSigue,
  QUE_QUEDA,
  QUE_SE_BORRA,
  queHacerConElApartado,
  queHacerConElPedido,
  respuestaDelEnvioAlErp,
  textoDeLoQueFalta,
} from "./mi-cuenta";

// «Mi cuenta» (Felipe 2026-10-15): lo que dice cada campo, la guía (qué falta y qué sigue) y cómo se leen las respuestas de la base
// (20261015132000). Lo que decide de verdad (topes, qué correo se puede pedir) lo prueba `pnpm pruebas:tienda-mi-cuenta` en la base.

const ACTUAL = "lucia.perez@ejemplo.com";
const NUEVO = "lucia.nueva@ejemplo.com";

describe("el correo nuevo", () => {
  it("falta, está mal escrito, es el mismo de ahora, es el que la base rechazó, o está listo", () => {
    expect(estadoCorreoNuevo("", ACTUAL, null)).toBe("falta");
    expect(estadoCorreoNuevo("lucia@", ACTUAL, null)).toBe("falta");
    expect(estadoCorreoNuevo("lucia@ejemplo", ACTUAL, null)).toBe("falta");
    expect(estadoCorreoNuevo("lucia@ejemplo.c", ACTUAL, null)).toBe("mal");
    expect(estadoCorreoNuevo("  LUCIA.PEREZ@Ejemplo.com ", ACTUAL, null)).toBe("repetido");
    expect(estadoCorreoNuevo(NUEVO, ACTUAL, NUEVO)).toBe("repetido");
    // El rechazo es de ESE correo: otro sí se puede pedir.
    expect(estadoCorreoNuevo("otra@ejemplo.com", ACTUAL, NUEVO)).toBe("ok");
    expect(estadoCorreoNuevo(NUEVO, ACTUAL, null)).toBe("ok");
  });

  it("la contraseña de ahora basta con escribirla (la prueban la base y el proyecto de clientes)", () => {
    expect(estadoClaveActual("")).toBe("falta");
    expect(estadoClaveActual("x")).toBe("ok");
    expect(estadoClaveActual("x".repeat(80))).toBe("mal");
  });
});

describe("la guía de «Cambiar mi correo»", () => {
  const base = { clave: "", correo: "", actual: ACTUAL, rechazado: null, pedidoPara: null, codigo: "", confirmado: false };

  it("lista lo que falta en el orden de la página: contraseña, correo, obtener el código y el código", () => {
    expect(estadoCambioDeCorreo(base).faltan.map(([p]) => p)).toEqual(["clave", "correo", "codigo"]);
    const conCorreo = estadoCambioDeCorreo({ ...base, clave: "secreta1", correo: NUEVO });
    expect(conCorreo.faltan.map(([p]) => p)).toEqual(["obtener", "codigo"]);
    expect(textoDeLoQueFalta(conCorreo.faltan)).toBe("obtener el código y escribirlo");
    expect(textoDeLoQueFalta(estadoCambioDeCorreo(base).faltan)).toBe("tu contraseña, tu correo nuevo y el código");
  });

  it("el código cuenta solo si es del correo que está escrito (si se cambió la caja, hay que obtener otro)", () => {
    const pedido = { ...base, clave: "secreta1", correo: NUEVO, pedidoPara: NUEVO, codigo: "123456" };
    expect(estadoCambioDeCorreo(pedido).faltan).toEqual([]);
    expect(estadoCambioDeCorreo(pedido).campos.codigo).toBe("ok");
    const otro = estadoCambioDeCorreo({ ...pedido, correo: "otra@ejemplo.com" });
    expect(otro.campos.codigo).toBe("falta");
    expect(otro.faltan.map(([p]) => p)).toEqual(["obtener", "codigo"]);
    expect(estadoCambioDeCorreo({ ...pedido, codigo: "12345" }).faltan.map(([p]) => p)).toEqual(["codigo"]);
  });

  it("confirmado: todo listo y nada que falte", () => {
    const listo = estadoCambioDeCorreo({ ...base, confirmado: true });
    expect(listo.faltan).toEqual([]);
    expect(Object.values(listo.campos).every((c) => c === "ok")).toBe(true);
  });

  it("la luz no se va del campo donde la persona está escribiendo; sin foco, va al primero que falta", () => {
    const e = estadoCambioDeCorreo({ ...base, clave: "secreta1" });
    expect(pasoQueSigue(e, null)).toBe("correo");
    expect(pasoQueSigue(e, "correo")).toBe("correo");
    // En la contraseña, que ya está: la luz no salta a otro campo mientras escribe.
    expect(pasoQueSigue(e, "clave")).toBeNull();
  });
});

describe("la guía de «Restablecer mi acceso»", () => {
  it("el correo, el código y la contraseña nueva (8 o más); el código no necesita «Obtener código» (ya lo mandó la tienda)", () => {
    expect(estadoRestablecer({ correo: "", codigo: "", clave: "" }).faltan.map(([p]) => p)).toEqual(["correo", "codigo", "clave_nueva"]);
    expect(estadoRestablecer({ correo: NUEVO, codigo: "123456", clave: "1234567" }).faltan.map(([p]) => p)).toEqual(["clave_nueva"]);
    expect(estadoRestablecer({ correo: NUEVO, codigo: "123456", clave: "12345678" }).faltan).toEqual([]);
    expect(estadoRestablecer({ correo: "lucia@ejemplo.c", codigo: "", clave: "" }).campos.correo).toBe("mal");
    expect(estadoRestablecer({ correo: NUEVO, codigo: "", clave: "x".repeat(80) }).campos.clave_nueva).toBe("mal");
  });
});

describe("lo que contesta la base", () => {
  it("pedir el cambio: enviar con los dos correos, los topes y cada rechazo; lo que no se entiende es «sin respuesta»", () => {
    expect(leerPedidoDeCambio({ estado: "enviar", correo_actual: ACTUAL, correo_nuevo: NUEVO })).toEqual({
      estado: "enviar",
      correoActual: ACTUAL,
      correoNuevo: NUEVO,
    });
    expect(leerPedidoDeCambio({ estado: "enviar", correo_actual: ACTUAL })).toEqual({ estado: "sin_respuesta" });
    expect(leerPedidoDeCambio({ estado: "esperar", segundos: 42 })).toEqual({ estado: "esperar", segundos: 42 });
    expect(leerPedidoDeCambio({ estado: "limite", minutos: 17 })).toEqual({ estado: "limite", minutos: 17 });
    expect(leerPedidoDeCambio({ estado: "bloqueado", minutos: -3 })).toEqual({ estado: "bloqueado", minutos: 1 });
    for (const e of ["sin_cuenta", "invalido", "sin_pedido", "mismo_correo", "correo_de_otra_persona"]) {
      expect(leerPedidoDeCambio({ estado: e })).toEqual({ estado: e });
    }
    expect(leerPedidoDeCambio({ estado: "otro" })).toEqual({ estado: "sin_respuesta" });
    expect(leerPedidoDeCambio(null)).toEqual({ estado: "sin_respuesta" });
  });

  it("el intento del código: cuántos quedan (y de qué usuario, en el restablecer), bloqueo de 15 minutos por defecto", () => {
    const uuid = "6f1d2c3b-4a5e-4f60-8a71-92b3c4d5e6f7";
    expect(leerIntentoDelCodigo({ estado: "puede", quedan: 4, usuario_web_id: uuid })).toEqual({ estado: "puede", quedan: 4, usuarioWebId: uuid });
    expect(leerIntentoDelCodigo({ estado: "puede", quedan: 0 })).toEqual({ estado: "puede", quedan: 0, usuarioWebId: null });
    expect(leerIntentoDelCodigo({ estado: "puede", quedan: -1 })).toEqual({ estado: "sin_respuesta" });
    expect(leerIntentoDelCodigo({ estado: "puede", quedan: 2, usuario_web_id: "no-es-uuid" })).toEqual({ estado: "puede", quedan: 2, usuarioWebId: null });
    expect(leerIntentoDelCodigo({ estado: "bloqueado" })).toEqual({ estado: "bloqueado", minutos: 15 });
    for (const e of ["vencido", "sin_pedido", "sin_cuenta", "invalido", "muchos_intentos"]) {
      expect(leerIntentoDelCodigo({ estado: e })).toEqual({ estado: e });
    }
    expect(leerIntentoDelCodigo("puede")).toEqual({ estado: "sin_respuesta" });
  });

  it("el correo confirmado: aplicado (de quién vino el pedido), igual, o rechazado con el correo de antes", () => {
    expect(leerCorreoConfirmado({ estado: "aplicado", origen: "tienda" })).toEqual({ estado: "aplicado", origen: "tienda" });
    expect(leerCorreoConfirmado({ estado: "aplicado", origen: "raro" })).toEqual({ estado: "aplicado", origen: "cuenta" });
    expect(leerCorreoConfirmado({ estado: "igual" })).toEqual({ estado: "igual" });
    expect(leerCorreoConfirmado({ estado: "de_otra_persona", correo_actual: ACTUAL })).toEqual({ estado: "de_otra_persona", correoActual: ACTUAL });
    expect(leerCorreoConfirmado({ estado: "sin_pedido", correo_actual: "no es correo" })).toEqual({ estado: "sin_pedido", correoActual: null });
    expect(leerCorreoConfirmado({ estado: "sin_cuenta" })).toEqual({ estado: "sin_cuenta" });
    expect(leerCorreoConfirmado(undefined)).toEqual({ estado: "sin_respuesta" });
  });

  it("el envío del restablecer: enviar exige el correo nuevo; el usuario y el correo de antes pueden faltar", () => {
    expect(leerEnvioDelRestablecer({ estado: "enviar", correo_nuevo: NUEVO })).toEqual({
      estado: "enviar",
      usuarioWebId: null,
      correoActual: null,
      correoNuevo: NUEVO,
    });
    expect(leerEnvioDelRestablecer({ estado: "enviar" })).toEqual({ estado: "sin_respuesta" });
    expect(leerEnvioDelRestablecer({ estado: "esperar", segundos: 9 })).toEqual({ estado: "esperar", segundos: 9 });
    for (const e of ["invalido", "sin_pedido", "muchos_intentos"]) expect(leerEnvioDelRestablecer({ estado: e })).toEqual({ estado: e });
  });

  it("el intento de la contraseña", () => {
    expect(leerIntentoDeClave({ estado: "puede", quedan: 3 })).toEqual({ estado: "puede", quedan: 3 });
    expect(leerIntentoDeClave({ estado: "puede" })).toEqual({ estado: "sin_respuesta" });
    expect(leerIntentoDeClave({ estado: "bloqueado", minutos: 12 })).toEqual({ estado: "bloqueado", minutos: 12 });
    expect(leerIntentoDeClave({ estado: "sin_cuenta" })).toEqual({ estado: "sin_cuenta" });
  });
});

describe("eliminar la cuenta", () => {
  const frena = {
    pedidos: [
      { codigo: "W-0007", numero: 7, estado: "pagado", tienda: "Trujillo", whatsapp: "987654321" },
      { codigo: "W-0009", numero: 9, estado: "por_confirmar", tienda: "CAYLA Arequipa", whatsapp: "12345" },
    ],
    apartados: [{ codigo: "SEP-0003", tienda: "Lima", whatsapp: null }],
  };

  it("lee lo que frena (un WhatsApp que no es un celular peruano se descarta) y lo que no se entiende no deja eliminar", () => {
    const f = leerLoQueFrena(frena);
    expect(f?.pedidos.map((p) => [p.codigo, p.estado, p.whatsapp])).toEqual([
      ["W-0007", "pagado", "987654321"],
      ["W-0009", "por_confirmar", null],
    ]);
    expect(f && nadaQueFrene(f)).toBe(false);
    expect(nadaQueFrene({ pedidos: [], apartados: [] })).toBe(true);
    expect(leerLoQueFrena({ pedidos: [{ codigo: "W-1", estado: "entregado", tienda: "Lima", whatsapp: null }], apartados: [] })).toBeNull();
    expect(leerLoQueFrena({ pedidos: [] })).toBeNull();
  });

  it("la respuesta de eliminar: eliminada, en curso (con lo que frena), en tienda (ficha de una tienda) o sin cuenta", () => {
    expect(leerEliminacion({ estado: "eliminada" })).toEqual({ estado: "eliminada" });
    expect(leerEliminacion({ estado: "sin_cuenta" })).toEqual({ estado: "sin_cuenta" });
    expect(leerEliminacion({ estado: "en_tienda" })).toEqual({ estado: "en_tienda" });
    const enCurso = leerEliminacion({ estado: "en_curso", ...frena });
    expect(enCurso.estado).toBe("en_curso");
    expect(leerEliminacion({ estado: "en_curso" })).toEqual({ estado: "sin_respuesta" });
    expect(leerEliminacion({ estado: "borrada" })).toEqual({ estado: "sin_respuesta" });
  });

  it("dice qué hacer con cada uno: el pagado se recoge; el confirmado se paga y se recoge; el que falta confirmar se anula o se cierra solo", () => {
    const f = leerLoQueFrena(frena)!;
    const pagado = queHacerConElPedido(f.pedidos[0]);
    expect(pagado.titulo).toBe("Pedido W-0007 · pagado");
    expect(pagado.texto).toContain("Recógelo en CAYLA Trujillo");
    expect(pagado.enlace).toEqual({ texto: "Ver mi pedido", href: "/cuenta/pedidos/W-0007", externo: false });
    const porConfirmar = queHacerConElPedido({ ...f.pedidos[1], whatsapp: "987654321" });
    expect(porConfirmar.titulo).toBe("Pedido W-0009 · por confirmar");
    // Todavía no se recoge: la tienda no lo confirmó. «CAYLA Arequipa» no se vuelve «CAYLA CAYLA Arequipa».
    expect(porConfirmar.texto).toBe(
      "CAYLA Arequipa todavía no lo confirma. Si ya no lo quieres, escríbele para que lo anule; si nadie lo confirma, se cierra solo.",
    );
    expect(queHacerConElPedido({ ...f.pedidos[1], estado: "confirmado" }).texto).toBe(
      "Págalo y recógelo en CAYLA Arequipa o, si ya no lo quieres, escríbele a la tienda para que lo anule.",
    );
    expect(porConfirmar.enlace?.externo).toBe(true);
    expect(porConfirmar.enlace?.href).toMatch(/^https:\/\/wa\.me\/51987654321\?text=/);
    expect(decodeURIComponent(porConfirmar.enlace!.href.split("?text=")[1])).toBe("Hola CAYLA Arequipa, quiero anular mi pedido W-0009.");
    // Sin WhatsApp: a su pedido.
    expect(queHacerConElPedido(f.pedidos[1]).enlace?.href).toBe("/cuenta/pedidos/W-0009");
    const apartado = queHacerConElApartado(f.apartados[0]);
    expect(apartado.titulo).toBe("Apartado SEP-0003");
    expect(apartado.texto).toBe("Lo tienes separado en CAYLA Lima. Recógelo, o pide en la tienda que lo cierren.");
    expect(apartado.enlace).toBeNull();
    // Una tienda sin nombre web llega con el nombre del ERP: no se vuelve «CAYLA Tienda Lima».
    expect(queHacerConElApartado({ codigo: "SEP-1", tienda: "Tienda Lima", whatsapp: null }).texto).toMatch(/^Lo tienes separado en Tienda Lima\./);
  });

  it("dice qué se borra (también el Club) y qué queda (los comprobantes, sin sus datos)", () => {
    expect(QUE_SE_BORRA.join(" ")).toMatch(/cuenta de la tienda online/);
    expect(QUE_SE_BORRA.join(" ")).toMatch(/Club CAYLA/);
    expect(QUE_SE_BORRA.join(" ")).toMatch(/DNI/);
    expect(QUE_QUEDA).toMatch(/comprobantes/);
    expect(QUE_QUEDA).toMatch(/No se puede deshacer/);
  });
});

describe("la ruta que llama el ERP", () => {
  it("la ficha son 64 cifras hexadecimales en minúscula; cualquier otra cosa no se lee", () => {
    const ficha = "a".repeat(32) + "0123456789abcdef".repeat(2);
    expect(leerFichaDelErp({ ficha })).toBe(ficha);
    expect(leerFichaDelErp({ ficha: ficha.toUpperCase() })).toBeNull();
    expect(leerFichaDelErp({ ficha: ficha.slice(1) })).toBeNull();
    expect(leerFichaDelErp({ otra: ficha })).toBeNull();
    expect(leerFichaDelErp(ficha)).toBeNull();
    expect(leerFichaDelErp(null)).toBeNull();
  });

  it("le contesta sin datos de nadie: 200 con lo que pasó, y 503 solo si algo no contestó", () => {
    const enviar = { estado: "enviar" as const, usuarioWebId: null, correoActual: ACTUAL, correoNuevo: NUEVO };
    expect(respuestaDelEnvioAlErp(enviar, "enviado")).toEqual({ status: 200, cuerpo: { estado: "enviado" } });
    expect(respuestaDelEnvioAlErp(enviar, "correo_tomado")).toEqual({ status: 200, cuerpo: { estado: "correo_tomado" } });
    expect(respuestaDelEnvioAlErp(enviar, "no_disponible")).toEqual({ status: 503, cuerpo: { estado: "no_disponible" } });
    expect(respuestaDelEnvioAlErp(enviar, null)).toEqual({ status: 503, cuerpo: { estado: "no_disponible" } });
    expect(respuestaDelEnvioAlErp({ estado: "esperar", segundos: 30 }, null)).toEqual({ status: 200, cuerpo: { estado: "esperar", segundos: 30 } });
    expect(respuestaDelEnvioAlErp({ estado: "limite", minutos: 40 }, null)).toEqual({ status: 200, cuerpo: { estado: "limite", minutos: 40 } });
    expect(respuestaDelEnvioAlErp({ estado: "sin_respuesta" }, null)).toEqual({ status: 503, cuerpo: { estado: "no_disponible" } });
    expect(respuestaDelEnvioAlErp({ estado: "invalido" }, null)).toEqual({ status: 200, cuerpo: { estado: "invalido" } });
    // Nunca un correo en lo que vuelve al ERP.
    const todo = JSON.stringify([respuestaDelEnvioAlErp(enviar, "enviado"), respuestaDelEnvioAlErp(enviar, "correo_tomado")]);
    expect(todo).not.toContain("@");
  });
});

describe("los mensajes y la conciliación", () => {
  it("los topes dicen cuánto falta, con las palabras de crear la cuenta", () => {
    expect(mensajeDelTope({ estado: "esperar", segundos: 12 })).toBe("Te mandamos uno hace poco. Puedes pedir otro en 12 segundos.");
    expect(mensajeDelTope({ estado: "limite", minutos: 1 })).toBe("Ya te mandamos 5 códigos. Puedes pedir otro en 1 minuto.");
    expect(mensajeDelTope({ estado: "bloqueado", minutos: 15 })).toBe("Hiciste muchos intentos. Espera 15 minutos y pide un código nuevo.");
    expect(mensajeClaveBloqueada(3)).toBe("Probaste muchas contraseñas seguidas. Espera 3 minutos y vuelve a intentarlo.");
  });

  it("concilia solo si el proyecto de clientes dice otro correo válido para la sesión", () => {
    expect(correoPorConciliar(NUEVO, ACTUAL)).toBe(NUEVO);
    expect(correoPorConciliar(" LUCIA.PEREZ@ejemplo.com", ACTUAL)).toBeNull();
    expect(correoPorConciliar(null, ACTUAL)).toBeNull();
    expect(correoPorConciliar("no es correo", ACTUAL)).toBeNull();
  });
});
