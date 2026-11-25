import { afterEach, describe, expect, it, vi } from "vitest";
import {
  detalleDelAvisoAlCobrar,
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
  it("manda la boleta a la caja, aunque también esté encendido «Imprimir solo al cobrar»", () => {
    expect(queHacerAlRegistrar({ ...base, enLaCaja: true, ventaId: "v1" })).toBe("mandar-a-la-caja");
    expect(queHacerAlRegistrar({ ...base, encendido: false, enLaCaja: true, ventaId: "v1" })).toBe("mandar-a-la-caja");
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

describe("detalleDelAvisoAlCobrar", () => {
  it("el comprobante y, si hubo, el vuelto", () => {
    expect(detalleDelAvisoAlCobrar({ comprobante: "Boleta B001-000123", vuelto: 30.2 })).toBe("Boleta B001-000123 · Vuelto S/30.20");
    expect(detalleDelAvisoAlCobrar({ comprobante: "Factura F001-000007", vuelto: 0 })).toBe("Factura F001-000007");
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
    // Y la hoja «Venta registrada» la manda a la cola, sin ningún toque.
    expect(queHacerAlRegistrar({ ...base, encendido: false, enLaCaja: imprimirEnLaCaja.leer() === "si", ventaId: "v1" })).toBe("mandar-a-la-caja");
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
      "mandar-a-la-caja",
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
