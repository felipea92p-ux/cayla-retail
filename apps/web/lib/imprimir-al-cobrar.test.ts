import { afterEach, describe, expect, it, vi } from "vitest";
import { enLaCajaDeFabrica, imprimirAlCobrar, imprimirEnLaCaja, MQ_SIN_IMPRESORA, queHacerAlRegistrar } from "./imprimir-al-cobrar";

const base = { encendido: true, hayComprobante: true, sinConexion: false, vuelto: 0 };

describe("queHacerAlRegistrar", () => {
  it("apagado, la hoja espera el botón como siempre", () => {
    expect(queHacerAlRegistrar({ ...base, encendido: false })).toBe("esperar");
    expect(queHacerAlRegistrar({ ...base, encendido: false, vuelto: 20 })).toBe("esperar");
  });

  it("encendido y sin vuelto, imprime y vuelve a una venta nueva", () => {
    expect(queHacerAlRegistrar(base)).toBe("imprimir-y-seguir");
  });

  it("encendido y con vuelto, imprime pero se queda abierta para que la cajera vea cuánto entregar", () => {
    expect(queHacerAlRegistrar({ ...base, vuelto: 0.1 })).toBe("imprimir-y-quedarse");
    expect(queHacerAlRegistrar({ ...base, vuelto: 50 })).toBe("imprimir-y-quedarse");
  });

  it("sin comprobante o guardada sin conexión no hay nada que imprimir: espera, aunque esté encendido", () => {
    expect(queHacerAlRegistrar({ ...base, hayComprobante: false })).toBe("esperar");
    expect(queHacerAlRegistrar({ ...base, sinConexion: true })).toBe("esperar");
    expect(queHacerAlRegistrar({ ...base, sinConexion: true, vuelto: 10 })).toBe("esperar");
  });
});

describe("queHacerAlRegistrar con «Imprimir en la caja»", () => {
  it("manda la boleta a la caja, aunque también esté encendido «Imprimir solo al cobrar»", () => {
    expect(queHacerAlRegistrar({ ...base, enLaCaja: true, ventaId: "v1" })).toBe("mandar-a-la-caja");
    expect(queHacerAlRegistrar({ ...base, encendido: false, enLaCaja: true, ventaId: "v1", vuelto: 20 })).toBe("mandar-a-la-caja");
  });

  it("sin venta guardada en el servidor no hay qué pedir: sigue como siempre", () => {
    expect(queHacerAlRegistrar({ ...base, enLaCaja: true, ventaId: null })).toBe("imprimir-y-seguir");
    expect(queHacerAlRegistrar({ ...base, encendido: false, enLaCaja: true })).toBe("esperar");
  });

  it("sin comprobante o sin conexión, tampoco se manda nada a la caja", () => {
    expect(queHacerAlRegistrar({ ...base, enLaCaja: true, ventaId: "v1", hayComprobante: false })).toBe("esperar");
    expect(queHacerAlRegistrar({ ...base, enLaCaja: true, ventaId: "v1", sinConexion: true })).toBe("esperar");
  });
});

/** Un navegador de mentira: qué guardó el aparato y si se maneja con el dedo y sin mouse. */
function aparato({ guardado, sinMouse, sinAlmacen = false }: { guardado?: string; sinMouse: boolean; sinAlmacen?: boolean }) {
  const preguntas: string[] = [];
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (clave: string) => {
        if (sinAlmacen) throw new Error("SecurityError");
        return clave === "cayla-imprimir-en-la-caja" ? (guardado ?? null) : null;
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
    aparato({ sinMouse: true, guardado: "no" });
    expect(imprimirEnLaCaja.leer()).toBe("no");
    aparato({ sinMouse: false, guardado: "si" });
    expect(imprimirEnLaCaja.leer()).toBe("si");
  });

  it("sin almacenamiento (ventana privada) o con algo raro guardado, vale el de fábrica del aparato", () => {
    aparato({ sinMouse: true, sinAlmacen: true });
    expect(imprimirEnLaCaja.leer()).toBe("si");
    aparato({ sinMouse: true, guardado: "quizas" });
    expect(imprimirEnLaCaja.leer()).toBe("si");
    aparato({ sinMouse: false, guardado: "quizas" });
    expect(imprimirEnLaCaja.leer()).toBe("no");
  });

  it("en el servidor, que no sabe qué aparato es, sigue apagado", () => {
    expect(imprimirEnLaCaja.leerEnServidor()).toBe("no");
  });
});

describe("imprimirAlCobrar", () => {
  it("arranca apagado: un equipo que no lo encendió no imprime solo", () => {
    expect(imprimirAlCobrar.leerEnServidor()).toBe("no");
  });
});
