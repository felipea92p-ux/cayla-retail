import { describe, expect, it } from "vitest";
import {
  avisoSinNombreDelPadron,
  nombreDeLaEdicion,
  nombreDelAlta,
  origenDelNombre,
  padronDeLaRespuesta,
  pendienteDelNombre,
  pieDelNombreDelPadron,
  problemaNombreEscrito,
  type PadronDeFicha,
} from "./nombre-del-padron-reglas";
import { TIPOS_DOCUMENTO_CLIENTA } from "./documento-clienta-reglas";

// El nombre de una ficha y el padrón (Felipe 2026-10-15). Documentos inventados: en las pruebas nunca se consulta el padrón con el de
// una persona real (aquí no hay red; la respuesta del padrón se arma a mano).

const RESPUESTA = { nombre: "PRUEBA SIMULADA LUCIA", fuente: "padron" as const, via: "proveedor" as const, anotada: true, sinNombre: null };
const CONFIRMADO: PadronDeFicha = { estado: "confirmado", nombre: "PRUEBA SIMULADA LUCIA", fuente: "RENIEC" };

describe("qué documento pide escribir el nombre", () => {
  it("con DNI (y RUC) lo trae el padrón; con carné o pasaporte se escribe: todos los tipos de ficha", () => {
    const origenes = Object.fromEntries(TIPOS_DOCUMENTO_CLIENTA.map((t) => [t.valor, origenDelNombre(t.valor)]));
    expect(origenes).toEqual({ dni: "padron", carne_extranjeria: "escrito", pasaporte: "escrito" });
    expect(origenDelNombre("ruc")).toBe("padron");
  });
});

describe("lo que contestó /api/padron?para=ficha", () => {
  it("solo un nombre del padrón que el servidor anotó sirve para la ficha", () => {
    expect(padronDeLaRespuesta(RESPUESTA)).toEqual(CONFIRMADO);
    expect(padronDeLaRespuesta({ ...RESPUESTA, via: "sunat_publico" })).toEqual({ ...CONFIRMADO, fuente: "SUNAT" });
    // Los espacios de más del padrón se van.
    expect(padronDeLaRespuesta({ ...RESPUESTA, nombre: "  PRUEBA   SIMULADA LUCIA " })).toEqual(CONFIRMADO);
  });

  it("sin la anotación, o con el nombre de un comprobante anterior, no: se lee como que el padrón no respondió", () => {
    expect(padronDeLaRespuesta({ ...RESPUESTA, anotada: false })).toEqual({ estado: "sin_respuesta" });
    expect(padronDeLaRespuesta({ ...RESPUESTA, fuente: "historial", via: null, anotada: false, sinNombre: "sin_respuesta" })).toEqual({ estado: "sin_respuesta" });
  });

  it("el número que el padrón no tiene, y el padrón que no contestó (o la ruta que falló)", () => {
    expect(padronDeLaRespuesta({ nombre: null, fuente: "ninguna", via: null, anotada: false, sinNombre: "no_encontrado" })).toEqual({ estado: "no_encontrado" });
    expect(padronDeLaRespuesta({ nombre: null, fuente: "ninguna", via: null, anotada: false, sinNombre: "sin_respuesta" })).toEqual({ estado: "sin_respuesta" });
    expect(padronDeLaRespuesta(null)).toEqual({ estado: "sin_respuesta" });
  });
});

describe("si la API no responde o no encuentra el documento, no se registra: el aviso de tres líneas", () => {
  it("dice qué pasó, que no se registra y qué hacer; en Vender, que la venta sigue sin cliente", () => {
    const venta = avisoSinNombreDelPadron("sin_respuesta", "venta");
    expect(venta.titulo).toBe("El padrón no respondió");
    expect(venta.texto).toBe("Sin el nombre del padrón no se registra. Vuelve a intentar en un momento. La venta sigue sin cliente.");
    const alta = avisoSinNombreDelPadron("no_encontrado", "alta");
    expect(alta).toEqual({ titulo: "El padrón no encontró ese DNI", texto: "Sin el nombre del padrón no se registra. Revisa el número con su DNI a la vista." });
    expect(avisoSinNombreDelPadron("sin_respuesta", "ficha").texto).toMatch(/^Sin el nombre del padrón no se guarda este DNI\./);
  });

  it("solo Vender habla de la venta, y cada lugar con cada estado dice algo distinto", () => {
    const todos = (["no_encontrado", "sin_respuesta"] as const).flatMap((e) => (["venta", "alta", "ficha"] as const).map((d) => avisoSinNombreDelPadron(e, d)));
    expect(todos.filter((a) => a.texto.includes("La venta sigue")).length).toBe(2);
    expect(new Set(todos.map((a) => `${a.titulo}|${a.texto}`)).size).toBe(todos.length);
  });
});

describe("la caja del nombre con DNI: bloqueada, con su origen", () => {
  it("bajo la caja dice de dónde salió o que no se escribe", () => {
    expect(pieDelNombreDelPadron(CONFIRMADO, false, false)).toBe("Según RENIEC, consultado ahora. No se escribe a mano.");
    expect(pieDelNombreDelPadron({ estado: "consultando" }, false, false)).toBe("Consultando el padrón…");
    expect(pieDelNombreDelPadron({ estado: "sin_consultar" }, false, false)).toMatch(/8 dígitos/);
    expect(pieDelNombreDelPadron({ estado: "sin_consultar" }, true, true)).toMatch(/actualízalo desde el padrón/);
    expect(pieDelNombreDelPadron({ estado: "sin_consultar" }, true, false)).toMatch(/tráelo desde el padrón/);
  });
});

describe("el nombre escrito (carné o pasaporte): tal cual, ni vacío ni con números", () => {
  it.each([
    ["", /tal cual está en su documento/],
    ["   ", /tal cual está en su documento/],
    ["Ana 2", /no lleva números/],
    ["Lu", /completo/],
    ["A".repeat(201), /demasiado largo/],
  ])("«%s» no pasa", (nombre, motivo) => {
    expect(problemaNombreEscrito(nombre)).toMatch(motivo);
  });

  it("nombres con tildes, eñes, apóstrofos y guiones, sí", () => {
    for (const nombre of ["Ana Torres", "José Ñaupari", "Mary O'Neil", "Ana-Lucía Pérez de la Cruz"]) expect(problemaNombreEscrito(nombre)).toBeNull();
  });
});

describe("qué le falta al nombre para registrar (la guía de foco)", () => {
  it("con DNI lo dice el padrón; lo escrito no cuenta", () => {
    expect(pendienteDelNombre("dni", CONFIRMADO, "")).toBeNull();
    expect(pendienteDelNombre("dni", { estado: "sin_respuesta" }, "ANA ESCRITA")).toMatch(/Volver a intentar/);
    expect(pendienteDelNombre("dni", { estado: "no_encontrado" }, "")).toMatch(/revisa el número/);
    expect(pendienteDelNombre("dni", { estado: "consultando" }, "")).toMatch(/Consultando/);
    expect(pendienteDelNombre("dni", { estado: "sin_consultar" }, "")).toMatch(/8 dígitos/);
  });

  it("con carné o pasaporte, lo escrito", () => {
    expect(pendienteDelNombre("pasaporte", { estado: "sin_consultar" }, "Ana Torres")).toBeNull();
    expect(pendienteDelNombre("carne_extranjeria", CONFIRMADO, "Ana 2")).toMatch(/no lleva números/);
  });

  it("lo que se guarda en un alta: con DNI el del padrón (o nada); con carné o pasaporte, lo escrito sin espacios de más", () => {
    expect(nombreDelAlta("dni", CONFIRMADO, "OTRO ESCRITO")).toBe("PRUEBA SIMULADA LUCIA");
    expect(nombreDelAlta("dni", { estado: "sin_respuesta" }, "OTRO ESCRITO")).toBe("");
    expect(nombreDelAlta("pasaporte", CONFIRMADO, "  Ana   Torres ")).toBe("Ana Torres");
  });
});

describe("«Editar» de la ficha: el nombre de un DNI no se edita a mano", () => {
  const deAntes = { tipo: "dni" as const, numero: "90000001", nombre: "Ana Escrita A Mano" };
  const base = { tipo: "dni" as const, numero: "90000001", escrito: "Ana Cambiada", padron: { estado: "sin_consultar" } as PadronDeFicha, deAntes };

  it("con el DNI de siempre se queda el nombre que tenía, aunque se haya escrito otro", () => {
    expect(nombreDeLaEdicion(base)).toEqual({ origen: "padron", nombre: "Ana Escrita A Mano", listo: true, pendiente: null });
  });

  it("«Actualizar desde el padrón» lo reemplaza por el del padrón", () => {
    expect(nombreDeLaEdicion({ ...base, padron: CONFIRMADO })).toMatchObject({ nombre: "PRUEBA SIMULADA LUCIA", listo: true });
  });

  it("si cambia el DNI (o pasa a DNI), es otra persona: sin el nombre del padrón para ese número no se guarda", () => {
    expect(nombreDeLaEdicion({ ...base, numero: "90000009" })).toMatchObject({ origen: "padron", nombre: "", listo: false });
    expect(nombreDeLaEdicion({ ...base, numero: "90000009", padron: { estado: "no_encontrado" } }).pendiente).toMatch(/no encontró/);
    const deCarne = { ...base, deAntes: { tipo: "carne_extranjeria" as const, numero: "001234567", nombre: "Ana Torres" }, numero: "90000001" };
    expect(nombreDeLaEdicion(deCarne).listo).toBe(false);
  });

  it("con carné o pasaporte se escribe: con números no se guarda", () => {
    expect(nombreDeLaEdicion({ ...base, tipo: "pasaporte", numero: "AB123456", escrito: "Ana Torres" })).toMatchObject({ origen: "escrito", listo: true });
    expect(nombreDeLaEdicion({ ...base, tipo: "pasaporte", numero: "AB123456", escrito: "Ana 3" })).toMatchObject({ listo: false, pendiente: expect.stringMatching(/números/) });
  });

  it("una ficha sin documento se escribe y puede quedar sin nombre (si se escribe, sin números)", () => {
    const sinDocumento = { ...base, numero: "", deAntes: { tipo: "dni" as const, numero: null, nombre: "Ana" } };
    expect(nombreDeLaEdicion({ ...sinDocumento, escrito: "" })).toEqual({ origen: "sin_documento", nombre: "", listo: true, pendiente: null });
    expect(nombreDeLaEdicion({ ...sinDocumento, escrito: "Ana 2" }).listo).toBe(false);
  });
});
