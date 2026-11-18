import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BORRADOR_VACIO,
  CAMPOS,
  claveDelBorrador,
  datosParaLaBase,
  estadoDeLaHoja,
  faltanEnLaHoja,
  fechaDeLaHoja,
  LARGOS,
  leerHoja,
  leerProveedor,
  leerRegistro,
  limpiar,
  mensajeDelEnvio,
  montoEnSoles,
  PROVEEDOR_DE_RESPALDO,
  problemaDelCampo,
  type BorradorHoja,
} from "./libro-reclamaciones";

const LISTA: BorradorHoja = {
  ...BORRADOR_VACIO,
  tipo: "reclamo",
  nombre: "Lucía Prueba Reclama",
  documento: "09959901",
  domicilio: "Calle de prueba 123, Trujillo",
  telefono: "999 000 101",
  correo: "Lucia.Prueba@Example.com",
  bienTipo: "producto",
  monto: "89.90",
  bienDescripcion: "Blusa de prueba talla M",
  detalle: "La blusa llegó con una costura abierta en la manga.",
  pedido: "Cambio por otra igual.",
};

const MIGRACION = readFileSync(
  resolve(__dirname, "../../../supabase/migrations/20261118145000_libro_reclamaciones_tienda.sql"),
  "utf8",
);

describe("la hoja del Libro de Reclamaciones", () => {
  it("una hoja completa no tiene nada pendiente", () => {
    expect(faltanEnLaHoja(estadoDeLaHoja(LISTA))).toEqual([]);
  });

  it("vacía, falta todo lo obligatorio en el orden del formulario; lo opcional nunca falta", () => {
    expect(faltanEnLaHoja(estadoDeLaHoja(BORRADOR_VACIO))).toEqual([
      "nombre",
      "documento",
      "domicilio",
      "telefono",
      "correo",
      "bien_tipo",
      "bien_descripcion",
      "tipo",
      "detalle",
      "pedido",
    ]);
    const e = estadoDeLaHoja(BORRADOR_VACIO);
    expect([e.monto, e.apoderado, e.ubicacion]).toEqual(["opcional", "opcional", "opcional"]);
  });

  // Los mismos casos que rechaza la base (scripts/pruebas/libro_reclamaciones.mjs, T3): si uno pasa aquí y la base lo rechaza, el
  // formulario prometería algo que no se puede guardar.
  it.each([
    ["nombre", { nombre: "A" }],
    ["documento", { documento: "1234567" }],
    ["documento", { tipoDocumento: "ce" as const, documento: "12-34" }],
    ["domicilio", { domicilio: "x" }],
    ["telefono", { telefono: "12" }],
    ["correo", { correo: "lucia@" }],
    ["apoderado", { menor: true, apoderado: "A" }],
    ["monto", { monto: "-5" }],
    ["monto", { monto: "1,50" }],
    ["monto", { monto: "2000000" }],
    ["detalle", { detalle: "corto" }],
  ] as const)("«%s» mal escrito: %j", (campo, cambio) => {
    const b = { ...LISTA, ...cambio };
    expect(estadoDeLaHoja(b)[campo]).toBe("mal");
    expect(faltanEnLaHoja(estadoDeLaHoja(b))).toContain(campo);
    expect(problemaDelCampo(campo, b)).toBeTruthy();
  });

  it("menor de edad sin quien lo represente: falta; con su nombre, listo", () => {
    expect(faltanEnLaHoja(estadoDeLaHoja({ ...LISTA, menor: true }))).toEqual(["apoderado"]);
    expect(faltanEnLaHoja(estadoDeLaHoja({ ...LISTA, menor: true, apoderado: "María Prueba" }))).toEqual([]);
  });

  it("el carné y el pasaporte aceptan letras; el DNI solo 8 números", () => {
    expect(estadoDeLaHoja({ ...LISTA, tipoDocumento: "pasaporte", documento: "ab 12 34 56" }).documento).toBe("ok");
    expect(estadoDeLaHoja({ ...LISTA, tipoDocumento: "dni", documento: "AB123456" }).documento).toBe("mal");
  });

  it("limpia como la base: invisibles fuera, espacios seguidos en uno, a lo más una línea en blanco", () => {
    expect(limpiar("Lucía  Prueba​ Reclama ")).toBe("Lucía Prueba Reclama");
    expect(limpiar("uno\n\n\n\ndos")).toBe("uno\n\ndos");
    expect(limpiar("calle\n123", true)).toBe("calle 123");
  });

  it("los largos son los de la base (la migración los dice igual)", () => {
    for (const [min, max] of Object.values(LARGOS)) expect(MIGRACION).toContain(`between ${min} and ${max}`);
    expect(MIGRACION).toContain("^[0-9]{8}$");
    expect(MIGRACION).toContain("^\\+?[0-9]{6,15}$");
  });

  it("lo que viaja a la base lleva sus nombres; el apoderado solo si es menor", () => {
    const d = datosParaLaBase({ ...LISTA, apoderado: "Alguien" });
    expect(Object.keys(d).sort()).toEqual(
      ["apoderado", "bien_descripcion", "bien_tipo", "correo", "detalle", "documento", "domicilio", "menor_de_edad", "monto", "nombre", "pedido", "telefono", "tipo", "tipo_documento", "ubicacion_id"].sort(),
    );
    expect(d.apoderado).toBe("");
    // Cada campo que la base puede devolver tiene su lugar en el formulario.
    for (const c of CAMPOS) expect(MIGRACION).toContain(`'campo', '${c}'`);
  });

  it("cambiar algo cambia la clave del borrador (y con ella, la marca)", () => {
    expect(claveDelBorrador(LISTA)).toBe(claveDelBorrador({ ...LISTA }));
    expect(claveDelBorrador({ ...LISTA, detalle: `${LISTA.detalle}!` })).not.toBe(claveDelBorrador(LISTA));
  });
});

describe("lo que contesta la base", () => {
  it("registrada, inválida (con su campo), límite; una forma rara es «sin respuesta»", () => {
    const id = "6f1d2c1e-0000-4000-8000-000000000001";
    expect(leerRegistro({ estado: "registrada", id, codigo: "000001-2026", repetida: false })).toEqual({
      estado: "registrada",
      id,
      codigo: "000001-2026",
    });
    expect(leerRegistro({ estado: "invalido", campo: "correo" })).toEqual({ estado: "invalido", campo: "correo" });
    expect(leerRegistro({ estado: "invalido", campo: "otra_cosa" })).toEqual({ estado: "invalido", campo: null });
    expect(leerRegistro({ estado: "limite" })).toEqual({ estado: "limite" });
    for (const raro of [null, {}, { estado: "registrada", id: "x" }, "hola"]) expect(leerRegistro(raro)).toEqual({ estado: "sin_respuesta" });
  });

  it("cada respuesta que no guarda tiene una frase que dice qué hacer", () => {
    expect(mensajeDelEnvio({ estado: "invalido", campo: "correo" })).toContain("Correo");
    expect(mensajeDelEnvio({ estado: "limite" })).toMatch(/Espera/);
    expect(mensajeDelEnvio({ estado: "sin_respuesta" })).toMatch(/sigue aquí/);
  });

  it("la constancia: se lee entera o no se muestra", () => {
    const hoja = {
      id: "6f1d2c1e-0000-4000-8000-000000000001",
      codigo: "000001-2026",
      creada_en: "2026-11-18T14:45:00Z",
      proveedor: { razon_social: "CAYLA S.A.C.", ruc: "20605964550", domicilio: "Trujillo" },
      tienda: null,
      consumidor: {
        nombre: "Lucía",
        tipo_documento: "dni",
        documento: "09959901",
        domicilio: "Calle 1",
        telefono: "999000101",
        correo: "a@b.co",
        menor_de_edad: false,
        apoderado: null,
      },
      bien: { tipo: "producto", monto: 89.9, descripcion: "Blusa" },
      tipo: "reclamo",
      detalle: "Detalle",
      pedido: "Pedido",
    };
    expect(leerHoja(hoja)?.codigo).toBe("000001-2026");
    expect(leerHoja({ ...hoja, tipo: "otra" })).toBeNull();
    expect(leerHoja(null)).toBeNull();
  });

  it("monto en soles y fecha en hora de Lima", () => {
    expect(montoEnSoles(89.9)).toBe("S/ 89.90");
    expect(montoEnSoles("1250")).toBe("S/ 1,250.00");
    expect(montoEnSoles(null)).toBeNull();
    expect(fechaDeLaHoja("2026-11-18T14:45:00Z")).toMatch(/18 de noviembre de 2026/);
  });

  it("sin los datos de CAYLA de la base, los de respaldo (los mismos de la base)", () => {
    expect(leerProveedor(null)).toEqual(PROVEEDOR_DE_RESPALDO);
    expect(MIGRACION).toContain(PROVEEDOR_DE_RESPALDO.domicilio);
    expect(MIGRACION).toContain(`'${PROVEEDOR_DE_RESPALDO.ruc}'`);
  });
});
