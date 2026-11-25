import { afterEach, describe, expect, it, vi } from "vitest";
import {
  caraDelAviso,
  destinoDelEquipo,
  fraseDelDestino,
  enLaCajaDeFabrica,
  imprimirAlCobrar,
  imprimirAlCobrarDeFabrica,
  imprimirEnLaCaja,
  MQ_SIN_IMPRESORA,
  queHacerAlRegistrar,
} from "./imprimir-al-cobrar";

const base = { encendido: true, hayComprobante: true, sinConexion: false };

describe("queHacerAlRegistrar", () => {
  it("apagado, la hoja espera el botón como siempre", () => {
    expect(queHacerAlRegistrar({ ...base, encendido: false })).toBe("esperar");
    expect(queHacerAlRegistrar({ ...base, encendido: false, conWhatsapp: true })).toBe("esperar");
  });

  it("encendido, imprime y vuelve a una venta nueva sin hoja, haya vuelto o no (el vuelto lo dice el aviso)", () => {
    expect(queHacerAlRegistrar(base)).toBe("imprimir-sin-hoja");
    expect(queHacerAlRegistrar({ ...base, conWhatsapp: false })).toBe("imprimir-sin-hoja");
  });

  it("encendido y con un WhatsApp que ofrecer, imprime y deja la hoja abierta para enviarlo", () => {
    expect(queHacerAlRegistrar({ ...base, conWhatsapp: true })).toBe("imprimir-y-quedarse");
  });

  it("sin comprobante o guardada sin conexión no hay nada que imprimir: la hoja espera, aunque esté encendido", () => {
    expect(queHacerAlRegistrar({ ...base, hayComprobante: false })).toBe("esperar");
    expect(queHacerAlRegistrar({ ...base, sinConexion: true })).toBe("esperar");
    expect(queHacerAlRegistrar({ ...base, sinConexion: true, conWhatsapp: true })).toBe("esperar");
  });
});

describe("queHacerAlRegistrar con «Imprimir en la caja»", () => {
  it("manda la boleta a la caja sin hoja, aunque también esté encendido «Imprimir solo al cobrar» (2026-11-25: el aviso dice cómo va)", () => {
    expect(queHacerAlRegistrar({ ...base, enLaCaja: true, ventaId: "v1" })).toBe("mandar-sin-hoja");
    expect(queHacerAlRegistrar({ ...base, encendido: false, enLaCaja: true, ventaId: "v1" })).toBe("mandar-sin-hoja");
  });

  it("con un WhatsApp que ofrecer, la manda a la caja y la hoja se queda abierta para enviarlo", () => {
    expect(queHacerAlRegistrar({ ...base, enLaCaja: true, ventaId: "v1", conWhatsapp: true })).toBe("mandar-a-la-caja");
  });

  it("sin venta guardada en el servidor no hay qué pedir: sigue como si no estuviera", () => {
    expect(queHacerAlRegistrar({ ...base, enLaCaja: true, ventaId: null })).toBe("imprimir-sin-hoja");
    expect(queHacerAlRegistrar({ ...base, encendido: false, enLaCaja: true })).toBe("esperar");
  });

  it("sin comprobante o sin conexión, tampoco se manda nada a la caja", () => {
    expect(queHacerAlRegistrar({ ...base, enLaCaja: true, ventaId: "v1", hayComprobante: false })).toBe("esperar");
    expect(queHacerAlRegistrar({ ...base, enLaCaja: true, ventaId: "v1", sinConexion: true })).toBe("esperar");
  });
});

/** Un navegador de mentira: qué guardó el aparato (por clave) y si se maneja con el dedo y sin mouse. */
function aparato({ guardado = {}, sinMouse, sinAlmacen = false }: { guardado?: Record<string, string>; sinMouse: boolean; sinAlmacen?: boolean }) {
  const preguntas: string[] = [];
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (clave: string) => {
        if (sinAlmacen) throw new Error("SecurityError");
        return guardado[clave] ?? null;
      },
    },
    matchMedia: (mq: string) => {
      preguntas.push(mq);
      return { matches: sinMouse };
    },
  });
  return preguntas;
}

describe("imprimirEnLaCaja (Felipe, 2026-11-24: marcado por defecto en el celular)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("la regla de fábrica: encendido sin mouse (celular, tablet), apagado con mouse (la caja, la oficina)", () => {
    expect(enLaCajaDeFabrica(true)).toBe("si");
    expect(enLaCajaDeFabrica(false)).toBe("no");
  });

  it("en un celular donde nadie lo tocó, viene encendido: la boleta va sola a la caja", () => {
    const preguntas = aparato({ sinMouse: true });
    expect(imprimirEnLaCaja.leer()).toBe("si");
    expect(preguntas).toContain(MQ_SIN_IMPRESORA);
    // Y la venta la manda a la cola, sin ningún toque y sin la hoja «Venta registrada».
    expect(queHacerAlRegistrar({ ...base, encendido: false, enLaCaja: imprimirEnLaCaja.leer() === "si", ventaId: "v1" })).toBe("mandar-sin-hoja");
  });

  it("en la computadora de la caja, viene apagado: imprime donde cobra, como siempre", () => {
    aparato({ sinMouse: false });
    expect(imprimirEnLaCaja.leer()).toBe("no");
  });

  it("lo que alguien eligió a mano gana sobre el aparato (el piso ya tiene su impresora, o una tablet que sí imprime)", () => {
    aparato({ sinMouse: true, guardado: { "cayla-imprimir-en-la-caja": "no" } });
    expect(imprimirEnLaCaja.leer()).toBe("no");
    aparato({ sinMouse: false, guardado: { "cayla-imprimir-en-la-caja": "si" } });
    expect(imprimirEnLaCaja.leer()).toBe("si");
  });

  it("sin almacenamiento (ventana privada) o con algo raro guardado, vale el de fábrica del aparato", () => {
    aparato({ sinMouse: true, sinAlmacen: true });
    expect(imprimirEnLaCaja.leer()).toBe("si");
    aparato({ sinMouse: true, guardado: { "cayla-imprimir-en-la-caja": "quizas" } });
    expect(imprimirEnLaCaja.leer()).toBe("si");
    aparato({ sinMouse: false, guardado: { "cayla-imprimir-en-la-caja": "quizas" } });
    expect(imprimirEnLaCaja.leer()).toBe("no");
  });

  it("en el servidor, que no sabe qué aparato es, sigue apagado", () => {
    expect(imprimirEnLaCaja.leerEnServidor()).toBe("no");
  });
});

describe("imprimirAlCobrar (2026-11-25: encendido de fábrica en la computadora)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("la regla de fábrica: encendido con mouse, apagado sin mouse (el piso no tiene impresora)", () => {
    expect(imprimirAlCobrarDeFabrica(false)).toBe("si");
    expect(imprimirAlCobrarDeFabrica(true)).toBe("no");
  });

  it("en la computadora donde nadie lo tocó, viene encendido: imprime y sigue sin la hoja", () => {
    const preguntas = aparato({ sinMouse: false });
    expect(imprimirAlCobrar.leer()).toBe("si");
    expect(preguntas).toContain(MQ_SIN_IMPRESORA);
    expect(queHacerAlRegistrar({ ...base, encendido: imprimirAlCobrar.leer() === "si", enLaCaja: imprimirEnLaCaja.leer() === "si", ventaId: "v1" })).toBe(
      "imprimir-sin-hoja",
    );
  });

  it("en el celular viene apagado, y la boleta va a la caja como desde el 2026-11-24", () => {
    aparato({ sinMouse: true });
    expect(imprimirAlCobrar.leer()).toBe("no");
    expect(queHacerAlRegistrar({ ...base, encendido: imprimirAlCobrar.leer() === "si", enLaCaja: imprimirEnLaCaja.leer() === "si", ventaId: "v1" })).toBe(
      "mandar-sin-hoja",
    );
  });

  it("lo que alguien apagó a mano en una computadora se respeta: vuelve la hoja de siempre", () => {
    aparato({ sinMouse: false, guardado: { "cayla-imprimir-al-cobrar": "no" } });
    expect(imprimirAlCobrar.leer()).toBe("no");
  });

  it("en el servidor no se sabe qué equipo es: arranca apagado y el navegador lo corrige al hidratar", () => {
    expect(imprimirAlCobrar.leerEnServidor()).toBe("no");
  });
});

/**
 * La foto de los equipos de Trujillo (2026-11-25): el celular del piso, donde nadie tocó nada, manda la boleta a la caja (10 boletas el
 * 2026-11-24 en `retail.impresiones`), y la Mac de la caja las imprime. Mover los interruptores a la tuerca de Vender no puede cambiar eso:
 * si esta prueba falla, algún equipo de la tienda cambió de comportamiento solo.
 */
describe("la tuerca no cambia cómo imprime ningún equipo (foto de Trujillo)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("el celular del piso sin nada guardado: va a la caja, sin hoja", () => {
    aparato({ sinMouse: true });
    const enLaCaja = imprimirEnLaCaja.leer() === "si";
    expect(enLaCaja).toBe(true);
    expect(imprimirAlCobrar.leer()).toBe("no");
    expect(destinoDelEquipo({ esCaja: false, enLaCaja })).toBe("a-la-caja");
    expect(queHacerAlRegistrar({ ...base, encendido: imprimirAlCobrar.leer() === "si", enLaCaja, ventaId: "v1" })).toBe("mandar-sin-hoja");
  });

  it("la Mac de la caja (la ticketera en su ayudante): imprime aquí y sigue siendo la caja", () => {
    aparato({ sinMouse: false });
    // En la caja `enLaCaja` nunca vale (`queHacerEnEsteEquipo` lo apaga en la ventana «CAYLA Caja» o con el ayudante).
    expect(destinoDelEquipo({ esCaja: true, enLaCaja: imprimirEnLaCaja.leer() === "si" })).toBe("caja");
    expect(queHacerAlRegistrar({ ...base, encendido: imprimirAlCobrar.leer() === "si", enLaCaja: false, ventaId: "v1" })).toBe("imprimir-sin-hoja");
  });

  it("un celular donde alguien apagó «Imprimir en la caja» a mano: sigue apagado y la tuerca lo dice", () => {
    aparato({ sinMouse: true, guardado: { "cayla-imprimir-en-la-caja": "no" } });
    expect(destinoDelEquipo({ esCaja: false, enLaCaja: imprimirEnLaCaja.leer() === "si" })).toBe("aqui");
  });
});

describe("destinoDelEquipo y fraseDelDestino (lo que dice la tuerca)", () => {
  it("la caja gana sobre «Imprimir en la caja»: la caja no se manda a sí misma", () => {
    expect(destinoDelEquipo({ esCaja: true, enLaCaja: true })).toBe("caja");
    expect(destinoDelEquipo({ esCaja: false, enLaCaja: true })).toBe("a-la-caja");
    expect(destinoDelEquipo({ esCaja: false, enLaCaja: false })).toBe("aqui");
  });

  it("la frase nombra el equipo que se tiene en la mano", () => {
    expect(fraseDelDestino("a-la-caja", true)).toBe("Las boletas de este celular salen en la caja de la tienda.");
    expect(fraseDelDestino("aqui", false)).toBe("Las boletas de esta computadora salen aquí.");
    expect(fraseDelDestino("caja", false)).toMatch(/del piso/);
  });
});

describe("caraDelAviso (el aviso que reemplaza a «Venta registrada»)", () => {
  it("aquí: imprimiendo, impresa (con Reimprimir) o no salió (Reintentar manda)", () => {
    expect(caraDelAviso({ donde: "aqui", fase: "imprimiendo" })).toMatchObject({ titulo: "Imprimiendo boleta", principal: "nueva-venta", reimprimir: false });
    expect(caraDelAviso({ donde: "aqui", fase: "impresa" })).toMatchObject({ titulo: "Boleta impresa", tono: "ok", reimprimir: true });
    expect(caraDelAviso({ donde: "aqui", fase: "fallo" })).toMatchObject({ tono: "mal", principal: "reintentar" });
  });

  it("en la caja: enviando, y si tarda, «Sigue en la cola» sin frenar la venta siguiente ni ofrecer imprimir aquí", () => {
    expect(caraDelAviso({ donde: "caja", fase: "en-cola", esperaLarga: false }).titulo).toBe("Enviando a la caja");
    const cola = caraDelAviso({ donde: "caja", fase: "en-cola", esperaLarga: true });
    expect(cola).toMatchObject({ titulo: "Sigue en la cola de la caja", tono: "cola", principal: "nueva-venta", reimprimir: false });
    expect(caraDelAviso({ donde: "caja", fase: "impresa", esperaLarga: true }).titulo).toBe("Boleta impresa en la caja");
    expect(caraDelAviso({ donde: "caja", fase: "error", esperaLarga: false })).toMatchObject({ tono: "mal", principal: "reintentar" });
  });
});
