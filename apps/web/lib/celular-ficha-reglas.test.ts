import { describe, expect, it } from "vitest";
import {
  celularParaLaFicha,
  notaDelCelularDeLaBoleta,
  resultadoDeGuardarCelular,
  textoCelularEnFicha,
  type EntradaCelularFicha,
} from "./celular-ficha-reglas";

const BASE: EntradaCelularFicha = {
  clienta: { celular: null },
  celularBoleta: "987654321",
  tipoComprobante: "boleta",
  puedeGuardarEnFicha: true,
};

describe("celularParaLaFicha: solo se guarda un celular NUEVO en una ficha que no tenía ninguno", () => {
  it("cliente sin celular, celular válido en una boleta: se guarda (los 9 dígitos)", () => {
    expect(celularParaLaFicha(BASE)).toBe("987654321");
    expect(celularParaLaFicha({ ...BASE, tipoComprobante: "factura" })).toBe("987654321");
  });

  it("lo escrito con espacios o +51 se guarda como 9 dígitos", () => {
    expect(celularParaLaFicha({ ...BASE, celularBoleta: "987 654 321" })).toBe("987654321");
    expect(celularParaLaFicha({ ...BASE, celularBoleta: "+51 987 654 321" })).toBe("987654321");
  });

  it("una ficha que YA tiene celular no se toca, ni con uno distinto (cambiarlo le quita la publicidad a una socia)", () => {
    expect(celularParaLaFicha({ ...BASE, clienta: { celular: "987111222" } })).toBeNull();
    expect(celularParaLaFicha({ ...BASE, clienta: { celular: "987111222" }, celularBoleta: "987111222" })).toBeNull();
    expect(celularParaLaFicha({ ...BASE, clienta: { celular: "987 111 222" } })).toBeNull();
  });

  it("una ficha con celular en blanco o con espacios cuenta como sin celular", () => {
    expect(celularParaLaFicha({ ...BASE, clienta: { celular: "" } })).toBe("987654321");
    expect(celularParaLaFicha({ ...BASE, clienta: { celular: "   " } })).toBe("987654321");
  });

  it("sin cliente en la venta no hay ficha donde guardar", () => {
    expect(celularParaLaFicha({ ...BASE, clienta: null })).toBeNull();
  });

  it("una cuenta sin el módulo «Clientas» no lo intenta (la base lo rechazaría con 42501)", () => {
    expect(celularParaLaFicha({ ...BASE, puedeGuardarEnFicha: false })).toBeNull();
  });

  it("la nota de venta no tiene PDF que mandar: no guarda nada; sin comprobante elegido tampoco", () => {
    expect(celularParaLaFicha({ ...BASE, tipoComprobante: "nota_venta" })).toBeNull();
    expect(celularParaLaFicha({ ...BASE, tipoComprobante: null })).toBeNull();
  });

  it("un celular vacío, a medias o que no empieza en 9 no se guarda", () => {
    for (const celularBoleta of ["", "9876", "887654321", "98765432"]) {
      expect(celularParaLaFicha({ ...BASE, celularBoleta }), celularBoleta).toBeNull();
    }
  });
});

describe("notaDelCelularDeLaBoleta: lo que se avisa a quien cobra antes de confirmar", () => {
  it("si se va a guardar en la ficha, lo dice", () => {
    expect(notaDelCelularDeLaBoleta(BASE)).toBe("También se guarda en su ficha, para la próxima compra.");
  });

  it("si la ficha ya tiene OTRO celular, dice que lo escrito es solo de esta boleta y el de la ficha no cambia", () => {
    expect(notaDelCelularDeLaBoleta({ ...BASE, clienta: { celular: "987111222" } })).toBe("Solo para esta boleta: el celular de su ficha no cambia.");
  });

  it("si es el mismo celular de la ficha (lo normal: viene precargado), no hay nada que aclarar", () => {
    expect(notaDelCelularDeLaBoleta({ ...BASE, clienta: { celular: "987654321" } })).toBeNull();
  });

  it("sin cliente, sin celular válido o en una nota de venta, no se dice nada", () => {
    expect(notaDelCelularDeLaBoleta({ ...BASE, clienta: null })).toBeNull();
    expect(notaDelCelularDeLaBoleta({ ...BASE, celularBoleta: "" })).toBeNull();
    expect(notaDelCelularDeLaBoleta({ ...BASE, celularBoleta: "9876" })).toBeNull();
    expect(notaDelCelularDeLaBoleta({ ...BASE, tipoComprobante: "nota_venta" })).toBeNull();
  });

  it("sin el módulo no promete guardar: la nota solo aclara lo del celular distinto", () => {
    expect(notaDelCelularDeLaBoleta({ ...BASE, puedeGuardarEnFicha: false })).toBeNull();
    expect(notaDelCelularDeLaBoleta({ ...BASE, puedeGuardarEnFicha: false, clienta: { celular: "987111222" } })).toBe(
      "Solo para esta boleta: el celular de su ficha no cambia.",
    );
  });
});

describe("resultadoDeGuardarCelular: la respuesta de la base nunca frena la venta", () => {
  it("true → guardado; false (ya tenía) → no hay nada que decir", () => {
    expect(resultadoDeGuardarCelular({ data: true, error: null })).toBe("guardado");
    expect(resultadoDeGuardarCelular({ data: false, error: null })).toBeNull();
  });

  it("cualquier error (red, módulo, función aún sin pegar en producción) → «no se pudo», sin lanzar", () => {
    expect(resultadoDeGuardarCelular({ data: null, error: { message: "function agregar_celular_clienta does not exist" } })).toBe("no_se_pudo");
    expect(resultadoDeGuardarCelular({ data: null, error: new Error("Failed to fetch") })).toBe("no_se_pudo");
  });

  it("una respuesta rara (ni true ni error) tampoco se toma por guardado", () => {
    expect(resultadoDeGuardarCelular({ data: null, error: null })).toBeNull();
    expect(resultadoDeGuardarCelular({ data: "t", error: null })).toBeNull();
  });
});

describe("textoCelularEnFicha", () => {
  it("dice lo que pasó, y nada si no hay nada que decir", () => {
    expect(textoCelularEnFicha("guardado")).toMatch(/Quedó guardado en su ficha/);
    expect(textoCelularEnFicha("no_se_pudo")).toMatch(/No se pudo guardar/);
    expect(textoCelularEnFicha("no_se_pudo")).toMatch(/se puede enviar igual/);
    expect(textoCelularEnFicha(null)).toBeNull();
    expect(textoCelularEnFicha(undefined)).toBeNull();
  });
});
