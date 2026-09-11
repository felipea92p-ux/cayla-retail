import { describe, it, expect } from "vitest";
import { describirAntiguedad, avisoDeRed } from "./sin-red";

// Lo que se fija acá es lo ÚNICO de todo el trabajo del service worker que la Encargada
// llega a ver: la frase. El resto —caché, scope, network-first— es invisible cuando funciona.
// Si un día alguien cambia el texto y le saca la fecha del catálogo, esta prueba lo frena:
// mostrar datos viejos sin decir de cuándo son es peor que no mostrarlos.

const T0 = Date.parse("2026-09-10T12:00:00.000Z");
const en = (ms: number) => T0 + ms;

describe("describirAntiguedad", () => {
  it("calla cuando la foto es de recién — nadie necesita leer «hace 40 segundos» mientras cuenta", () => {
    expect(describirAntiguedad(new Date(T0), en(40_000))).toBeNull();
  });

  it("minutos, horas y días, en singular y plural", () => {
    expect(describirAntiguedad(new Date(T0), en(5 * 60_000))).toBe("hace 5 minutos");
    expect(describirAntiguedad(new Date(T0), en(60 * 60_000))).toBe("hace 1 hora");
    expect(describirAntiguedad(new Date(T0), en(3 * 60 * 60_000))).toBe("hace 3 horas");
    expect(describirAntiguedad(new Date(T0), en(26 * 60 * 60_000))).toBe("hace 1 día");
    expect(describirAntiguedad(new Date(T0), en(50 * 60 * 60_000))).toBe("hace 2 días");
  });

  it("redondea hacia abajo: 119 minutos son «1 hora», no «2 horas»", () => {
    // Entre subestimar y exagerar, la que no genera una falsa alarma.
    expect(describirAntiguedad(new Date(T0), en(119 * 60_000))).toBe("hace 1 hora");
  });

  it("un reloj del equipo adelantado no produce «hace -3 minutos»", () => {
    expect(describirAntiguedad(new Date(T0), en(-3 * 60_000))).toBeNull();
  });

  it("una fecha que no se puede leer no rompe la pantalla", () => {
    expect(describirAntiguedad("no es una fecha", T0)).toBeNull();
  });
});

describe("avisoDeRed", () => {
  it("con internet y sin cola, la pantalla no habla de la red", () => {
    expect(avisoDeRed({ desdeCache: false, enLinea: true, pendientes: 0, generadoEn: new Date(T0), ahora: en(0) })).toBeNull();
  });

  it("sin internet dice la fecha del catálogo, que es lo que no se puede omitir", () => {
    const aviso = avisoDeRed({ desdeCache: false, enLinea: false, pendientes: 0, generadoEn: new Date(T0), ahora: en(2 * 60 * 60_000) });
    expect(aviso?.tono).toBe("sin-red");
    expect(aviso?.detalle).toContain("hace 2 horas");
    expect(aviso?.detalle).toContain("No cierres esta pestaña");
  });

  it("sin internet y con cola, dice cuántas están a salvo — no cuántas fallaron", () => {
    const aviso = avisoDeRed({ desdeCache: false, enLinea: false, pendientes: 7, generadoEn: new Date(T0), ahora: en(0) });
    expect(aviso?.detalle).toContain("7 prendas");
    expect(aviso?.detalle).toContain("suben solas");
  });

  it("EL CASO QUE ROMPE `navigator.onLine`: wifi vivo, servidor caído", () => {
    // Es el escenario más común en tienda —el router conectado pero sin salida— y también
    // el que se reprodujo apagando el servidor con la máquina en red: `onLine` decía `true`
    // y la pantalla mostraba el catálogo cacheado sin avisar. La marca del service worker es
    // lo único que lo delata.
    const aviso = avisoDeRed({
      enLinea: true,
      desdeCache: true,
      pendientes: 0,
      generadoEn: new Date(T0),
      ahora: en(3 * 60 * 60_000),
    });
    expect(aviso?.tono).toBe("sin-red");
    // No dice "sin internet": el internet del equipo está bien y mandarla a revisar el
    // router sería mandarla a arreglar lo que no está roto.
    expect(aviso?.titulo).not.toContain("Sin internet");
    expect(aviso?.titulo).toContain("Sin conexión con el sistema");
    expect(aviso?.detalle).toContain("hace 3 horas");
  });

  it("con internet y cola pendiente, avisa que se están subiendo (no pide un botón)", () => {
    const aviso = avisoDeRed({ desdeCache: false, enLinea: true, pendientes: 1, generadoEn: new Date(T0), ahora: en(0) });
    expect(aviso?.tono).toBe("pendiente");
    expect(aviso?.titulo).toBe("1 prenda contada sin guardar");
    expect(aviso?.detalle).toContain("No se perdió nada");
  });
});
