import { describe, expect, it } from "vitest";
import { leerLibro } from "./libro-reclamaciones-lectura";
import {
  cifrasDe,
  estadoDe,
  fechaDelDia,
  filtrar,
  montoEnSoles,
  plazoEnPalabras,
  problemaDeLaRespuesta,
  textoLimpio,
  type HojaLibro,
} from "./libro-reclamaciones-reglas";

const BASE = {
  codigo: "000001-2026",
  creada_en: "2026-11-18T14:45:00Z",
  tipo: "reclamo",
  tienda: null,
  consumidor: {
    nombre: "Lucía Prueba",
    tipo_documento: "dni",
    documento: "09959901",
    domicilio: "Calle 1",
    telefono: "999000101",
    correo: "lucia@example.com",
    menor_de_edad: false,
    apoderado: null,
  },
  bien: { tipo: "producto", monto: 89.9, descripcion: "Blusa Emma" },
  detalle: "Llegó rota",
  pedido: "Cambio",
  copia_enviada: true,
  vence_el: "2026-12-10",
  dias_restantes: 10,
};
const hoja = (id: number, cambios: Partial<Record<string, unknown>> = {}) =>
  ({ ...BASE, id: `6f1d2c1e-0000-4000-8000-${String(id).padStart(12, "0")}`, ...cambios }) as unknown;

function lista(...hojas: unknown[]): HojaLibro[] {
  return leerLibro({ hoy: "2026-11-20", hojas, hay_mas: false })!.hojas;
}

describe("Libro de Reclamaciones en el ERP", () => {
  it("lee la lista; una hoja rara se salta y una forma rara es null", () => {
    const l = leerLibro({ hoy: "2026-11-20", hojas: [hoja(1), { id: "x" }], hay_mas: false });
    expect(l?.hojas).toHaveLength(1);
    expect(l?.hojas[0]!.respuesta).toBeNull();
    expect(leerLibro({ hojas: [] })).toBeNull();
  });

  it("el estado sale de los días hábiles que quedan (los cuenta la base)", () => {
    expect(estadoDe({ respuesta: null, dias_restantes: 10 })).toBe("por_responder");
    expect(estadoDe({ respuesta: null, dias_restantes: 3 })).toBe("vence_pronto");
    expect(estadoDe({ respuesta: null, dias_restantes: 0 })).toBe("vence_pronto");
    expect(estadoDe({ respuesta: null, dias_restantes: -1 })).toBe("vencida");
    expect(estadoDe({ respuesta: "Ya la cambiamos", dias_restantes: -5 })).toBe("respondida");
  });

  it("el plazo en palabras de tienda", () => {
    expect(plazoEnPalabras({ respuesta: null, respondida_en: null, dias_restantes: 12 })).toBe("Quedan 12 días hábiles");
    expect(plazoEnPalabras({ respuesta: null, respondida_en: null, dias_restantes: 1 })).toBe("Queda 1 día hábil");
    expect(plazoEnPalabras({ respuesta: null, respondida_en: null, dias_restantes: 0 })).toBe("Vence hoy");
    expect(plazoEnPalabras({ respuesta: null, respondida_en: null, dias_restantes: -1 })).toBe("Venció hace 1 día hábil");
    expect(plazoEnPalabras({ respuesta: null, respondida_en: null, dias_restantes: -4 })).toBe("Venció hace 4 días hábiles");
    expect(plazoEnPalabras({ respuesta: "x", respondida_en: "2026-11-20T15:00:00Z", dias_restantes: 3 })).toMatch(/^Respondida el 20/);
  });

  it("cifras: por responder, vencen pronto, vencidas y las de este mes", () => {
    const hojas = lista(
      hoja(1),
      hoja(2, { dias_restantes: 2 }),
      hoja(3, { dias_restantes: -1 }),
      hoja(4, { respuesta: "Listo", respondida_en: "2026-11-19T15:00:00Z" }),
      hoja(5, { creada_en: "2026-10-30T15:00:00Z" }),
    );
    expect(cifrasDe(hojas, "2026-11-20")).toEqual({ porResponder: 4, vencenPronto: 1, vencidas: 1, delMes: 4 });
  });

  it("filtra por estado y busca sin tildes; las por responder, la que vence antes primero", () => {
    const hojas = lista(hoja(1, { dias_restantes: 9 }), hoja(2, { dias_restantes: -2 }), hoja(3, { respuesta: "Listo" }), hoja(4, { dias_restantes: 2 }));
    expect(filtrar(hojas, { estado: "por_responder", q: "" }).map((h) => h.dias_restantes)).toEqual([-2, 2, 9]);
    expect(filtrar(hojas, { estado: "vencen", q: "" })).toHaveLength(2);
    expect(filtrar(hojas, { estado: "respondidas", q: "" })).toHaveLength(1);
    expect(filtrar(hojas, { estado: "todas", q: "lucia" })).toHaveLength(4);
    expect(filtrar(hojas, { estado: "todas", q: "09959901" })).toHaveLength(4);
    expect(filtrar(hojas, { estado: "todas", q: "pantalón" })).toHaveLength(0);
  });

  it("monto y fecha", () => {
    expect(montoEnSoles(89.9)).toBe("S/ 89.90");
    expect(montoEnSoles(null)).toBeNull();
    expect(fechaDelDia("2026-12-10")).toBe("10 de diciembre de 2026");
  });

  it("la respuesta sin el carácter nulo (U+0000): la base no lo acepta y mostraba un error crudo (/chaos 2026-11-18)", () => {
    expect(textoLimpio("Hola Rosa,\u0000 te cambiamos el vestido.")).toBe("Hola Rosa, te cambiamos el vestido.");
  });

  it("«te pasaste» concuerda con el número: 1 letra, 2 letras", () => {
    expect(problemaDeLaRespuesta("x".repeat(3001))).toBe("Te pasaste por 1 letra: acórtala un poco.");
    expect(problemaDeLaRespuesta("x".repeat(3002))).toBe("Te pasaste por 2 letras: acórtala un poco.");
  });
});
