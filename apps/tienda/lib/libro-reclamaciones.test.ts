import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BORRADOR_VACIO,
  correoDeLaHoja,
  correoDeLaRespuesta,
  enlaceDeLaHoja,
  leerCopias,
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
  conforme: true,
};

// Las partes de la base que validan la hoja: la PARTE 1 y la PARTE 5 (lo que pidió la revisión legal).
const MIGRACION = ["20261118145000_libro_reclamaciones_tienda.sql", "20261118170000_libro_reclamaciones_ajustes_legales.sql"]
  .map((m) => readFileSync(resolve(__dirname, "../../../supabase/migrations", m), "utf8"))
  .join("\n");

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
      "conforme",
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

  it("menor de edad: faltan el nombre y los datos de quien lo representa; con todo, listo", () => {
    expect(faltanEnLaHoja(estadoDeLaHoja({ ...LISTA, menor: true }))).toEqual([
      "apoderado",
      "apoderado_documento",
      "apoderado_domicilio",
      "apoderado_telefono",
      "apoderado_correo",
    ]);
    const completo = {
      ...LISTA,
      menor: true,
      apoderado: "María Prueba",
      apoderadoDocumento: "09959911",
      apoderadoDomicilio: "Calle 456, Trujillo",
      apoderadoTelefono: "999000111",
      apoderadoCorreo: "maria@example.com",
    };
    expect(faltanEnLaHoja(estadoDeLaHoja(completo))).toEqual([]);
    expect(datosParaLaBase(completo).apoderado_documento).toBe("09959911");
  });

  it("sin la casilla de conformidad, falta", () => {
    expect(faltanEnLaHoja(estadoDeLaHoja({ ...LISTA, conforme: false }))).toEqual(["conforme"]);
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

  it("un carácter nulo pegado (U+0000) no llega a la base: la base no lo acepta y la hoja no se podría enviar nunca (/chaos 2026-11-18)", () => {
    const sucio = { ...LISTA, nombre: "Rosa\u0000 Prueba", detalle: "El cierre\u0000 se rompió al primer uso.", pedido: "Un\u0000 cambio." };
    const d = datosParaLaBase(sucio);
    expect(JSON.stringify(d)).not.toContain("\\u0000");
    expect(d.detalle).toBe("El cierre se rompió al primer uso.");
    expect(limpiar("a\u0000b")).toBe("ab");
  });

  it("lo que viaja a la base lleva sus nombres; el apoderado solo si es menor", () => {
    const d = datosParaLaBase({ ...LISTA, apoderado: "Alguien" });
    expect(Object.keys(d).sort()).toEqual(
      [
        "apoderado",
        "apoderado_correo",
        "apoderado_documento",
        "apoderado_domicilio",
        "apoderado_telefono",
        "apoderado_tipo_documento",
        "bien_descripcion",
        "bien_tipo",
        "conforme",
        "correo",
        "detalle",
        "documento",
        "domicilio",
        "menor_de_edad",
        "monto",
        "nombre",
        "pedido",
        "telefono",
        "tipo",
        "tipo_documento",
        "ubicacion_id",
      ].sort(),
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

describe("la copia al correo", () => {
  const HOJA = {
    id: "6f1d2c1e-0000-4000-8000-000000000001",
    codigo: "000007-2026",
    creada_en: "2026-11-18T14:45:00Z",
    proveedor: { razon_social: "CAYLA S.A.C.", ruc: "20605964550", domicilio: "Trujillo" },
    tienda: null,
    consumidor: {
      nombre: "Lucía <b>Prueba</b>",
      tipo_documento: "dni",
      documento: "09959901",
      domicilio: "Calle 1",
      telefono: "999000101",
      correo: "a@b.co",
      menor_de_edad: true,
      apoderado: "María Prueba",
    },
    bien: { tipo: "producto", monto: 89.9, descripcion: "Blusa" },
    tipo: "reclamo",
    detalle: "Llegó rota. <script>alert(1)</script>",
    pedido: "Cambio",
    copia_enviada: false,
  };
  const MARCA = "6f1d2c1e-0000-4000-8000-000000000002";

  it("lee las copias de la base; una rara se salta y una forma rara es null", () => {
    expect(leerCopias({ copias: [{ marca: MARCA, intentos: 1, hoja: HOJA }, { marca: "x", intentos: 1, hoja: HOJA }] })).toHaveLength(1);
    expect(leerCopias({ estado: "ok" })).toBeNull();
  });

  it("el enlace a la constancia lleva id y marca, sin doble barra", () => {
    expect(enlaceDeLaHoja("https://tienda.cayla.pe/", HOJA.id, MARCA)).toBe(`https://tienda.cayla.pe/libro-de-reclamaciones/hoja/${HOJA.id}?m=${MARCA}`);
  });

  it("el correo trae el número, los datos, el apoderado, el enlace y la nota legal; lo escrito va escapado en el HTML", () => {
    const enlace = enlaceDeLaHoja("https://t.pe", HOJA.id, MARCA);
    const c = correoDeLaHoja(leerHoja(HOJA)!, enlace);
    expect(c.asunto).toBe("CAYLA: tu hoja de reclamación N.° 000007-2026");
    expect(c.texto).toContain("Padre, madre o apoderado: María Prueba");
    expect(c.texto).toContain("Monto reclamado: S/\u00a089.90");
    expect(c.texto).toContain(enlace);
    expect(c.texto).toContain("Indecopi");
    expect(c.texto).toContain("Tipo: Reclamo (no estás conforme con el producto o el servicio)");
    expect(c.texto).not.toMatch(/\.\./);
    expect(c.html).not.toContain("<script>");
    expect(c.html).toContain("&lt;script&gt;");
    expect(c.html).toContain("Lucía &lt;b&gt;Prueba&lt;/b&gt;");
  });
});

describe("la respuesta por correo", () => {
  it("lee las respuestas de la base con su propia lista", () => {
    const hoja = {
      id: "6f1d2c1e-0000-4000-8000-000000000001", codigo: "000007-2026", creada_en: "2026-11-18T14:45:00Z",
      proveedor: { razon_social: "CAYLA S.A.C.", ruc: "20605964550", domicilio: "Trujillo" }, tienda: null,
      consumidor: { nombre: "Ana", tipo_documento: "dni", documento: "09959901", domicilio: "Calle 1", telefono: "999000101", correo: "a@b.co", menor_de_edad: false, apoderado: null },
      bien: { tipo: "producto", monto: null, descripcion: "Blusa" }, tipo: "queja", detalle: "Me atendieron mal", pedido: "Disculpas",
      respuesta: "Lo sentimos <mucho>.", respondida_en: "2026-11-19T15:00:00Z",
    };
    const marca = "6f1d2c1e-0000-4000-8000-000000000002";
    const [c] = leerCopias({ respuestas: [{ marca, intentos: 1, hoja }] }, "respuestas")!;
    expect(c!.hoja.respuesta).toBe("Lo sentimos <mucho>.");
    const correo = correoDeLaRespuesta(c!.hoja, "https://t.pe/x");
    expect(correo.asunto).toBe("CAYLA: respuesta a tu hoja de reclamación N.° 000007-2026");
    expect(correo.texto).toContain("Lo sentimos <mucho>.");
    expect(correo.texto).toContain("Indecopi");
    expect(correo.html).toContain("Lo sentimos &lt;mucho&gt;.");
  });
});
