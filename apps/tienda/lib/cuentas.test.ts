import { describe, expect, it } from "vitest";
import { nombreAMedias } from "@cayla-retail/shared";
import { normalizarRespuestaPadron } from "@cayla-retail/shared/padron";
import {
  arregloCorreo,
  avisoAlCrear,
  campoQueSigue,
  celularNormalizado,
  codigoCompleto,
  codigoLimpio,
  correoValido,
  cuentaRegresiva,
  cumpleTexto,
  enMinutos,
  errorDeRegistro,
  escalaEnPalabras,
  esquemaCrearCuenta,
  estadoCelular,
  estadoClave,
  estadoCodigo,
  estadoCorreo,
  estadoCumple,
  estadoDocumento,
  estadoParteNombre,
  nombreEscrito,
  ayudaDelNumero,
  documentoRepetido,
  estadoRegistro,
  faltanCaracteres,
  faltanRegistro,
  faltanResumidos,
  hoyLima,
  ipDeLaPeticion,
  leerBeneficios,
  leerCasillaWhatsapp,
  leerIntentoDeCodigo,
  leerMiCuenta,
  leerReserva,
  marcaDe,
  MENSAJES,
  mensajeCodigoBloqueado,
  mensajeCodigoEsperar,
  mensajeCodigoLimite,
  mensajeCodigoMalo,
  mensajeSinNombre,
  problemaRegistro,
  REGISTRO_VACIO,
  soles,
  type ConsultaDocumento,
  type Registro,
} from "./cuentas";
import type { CodigoDelCorreo } from "./correo-confirmado";

const HOY = { anio: 2026, mes: 10, dia: 14 };
/** Lo que la persona lee en «Falta: …», en orden. */
const nombresDe = (faltan: readonly (readonly [unknown, string])[]) => faltan.map(([, nombre]) => nombre);
const ENCONTRADO: ConsultaDocumento = { estado: "encontrado", aMedias: "María P. S." };
/** El correo de LISTO, confirmado con su código (bajo el correo, Felipe 2026-10-15). */
const CONFIRMADO: CodigoDelCorreo = { estado: "confirmado", correo: "maria.perez@gmail.com" };
const SIN_PEDIR: CodigoDelCorreo = { estado: "sin_pedir" };
const enviado = (correo: string, cambios: Partial<Extract<CodigoDelCorreo, { estado: "enviado" }>> = {}): CodigoDelCorreo => ({
  estado: "enviado",
  correo,
  hasta: 0,
  mensaje: null,
  necesitaNuevo: false,
  malo: null,
  ...cambios,
});
const LISTO: Registro = {
  correo: "maria.perez@gmail.com",
  clave: "clave-segura",
  documentoTipo: "dni",
  documento: "45871236",
  nombres: "",
  apellidos: "",
  celular: "987654321",
  cumple: { d: "14", m: "10", a: "" },
  mayor: true,
  acepta: true,
  avisos: false,
};
const USUARIO = "6f1d2c3b-4a59-4e6f-8a7b-9c0d1e2f3a4b";

describe("el correo", () => {
  it("pide algo@algo.algo con al menos dos letras al final, sin importar mayúsculas ni espacios", () => {
    expect(correoValido(" Maria.Perez@Gmail.COM ")).toBe(true);
    for (const malo of ["", "maria", "maria@", "maria@gmail", "maria@gmail.c", "maria @gmail.com", "@gmail.com"]) expect(correoValido(malo)).toBe(false);
  });

  it("sugiere el dominio bien escrito (maqueta: «¿Quisiste decir gmail.com?») y nada si ya está bien", () => {
    expect(arregloCorreo("Ana@Gmial.com")).toBe("ana@gmail.com");
    expect(arregloCorreo("ana@hotmial.com")).toBe("ana@hotmail.com");
    expect(arregloCorreo("ana@outlok.com")).toBe("ana@outlook.com");
    expect(arregloCorreo("ana@gmail.com")).toBeNull();
    expect(arregloCorreo("ana@empresa.pe")).toBeNull();
    expect(arregloCorreo("ana@gmial.com@x")).toBeNull();
    expect(arregloCorreo("gmial.com")).toBeNull();
  });

  it("falta mientras no hay un punto después de la @; mal si lo hay y no cierra; repetido si la base lo dijo", () => {
    expect(estadoCorreo("", "sin_revisar")).toBe("falta");
    expect(estadoCorreo("ana@gmail", "sin_revisar")).toBe("falta");
    expect(estadoCorreo("ana@gmail.c", "sin_revisar")).toBe("mal");
    expect(estadoCorreo("ana@gmail.com", "repetido")).toBe("repetido");
    expect(estadoCorreo("ana@gmail.com", "sin_revisar")).toBe("ok");
  });

  it("el correo de contacto de OTRA ficha tampoco sirve: el campo queda en rojo y falta en «Falta: …»", () => {
    expect(estadoCorreo("ana@gmail.com", "de_otra_persona")).toBe("repetido");
    expect(marcaDe(estadoCorreo("ana@gmail.com", "de_otra_persona"), false)).toBe("error");
  });
});

describe("la contraseña", () => {
  it("8 caracteres o más, hasta 72", () => {
    expect(estadoClave("1234567")).toBe("falta");
    expect(estadoClave("12345678")).toBe("ok");
    expect(estadoClave("x".repeat(73))).toBe("mal");
  });

  it("dice cuántos faltan, en singular y en plural", () => {
    expect(faltanCaracteres("")).toBeNull();
    expect(faltanCaracteres("1234567")).toBe("Te falta 1 carácter.");
    expect(faltanCaracteres("12345")).toBe("Te faltan 3 caracteres.");
    expect(faltanCaracteres("12345678")).toBeNull();
  });
});

describe("el celular", () => {
  it("9 dígitos que empiezan en 9; con +51 también", () => {
    expect(estadoCelular("987654321")).toBe("ok");
    expect(estadoCelular("+51 987 654 321")).toBe("ok");
    expect(celularNormalizado("+51 987 654 321")).toBe("987654321");
    expect(estadoCelular("887654321")).toBe("mal");
    expect(estadoCelular("98765")).toBe("falta");
    expect(estadoCelular("")).toBe("falta");
  });
});

describe("el cumpleaños, como lo guarda el Club", () => {
  const c = (d: string, m: string, a = "") => estadoCumple({ d, m, a }, HOY);

  it("día y mes obligatorios; el año, opcional", () => {
    expect(c("", "")).toEqual({ estado: "falta" });
    expect(c("14", "")).toEqual({ estado: "falta" });
    expect(c("14", "10")).toEqual({ estado: "ok" });
    expect(c("14", "10", "1995")).toEqual({ estado: "ok" });
  });

  it("sin año, el 29 de febrero vale; el 31 de abril y el mes 13, no", () => {
    expect(c("29", "2")).toEqual({ estado: "ok" });
    expect(c("31", "4")).toEqual({ estado: "mal", motivo: "fecha" });
    expect(c("1", "13")).toEqual({ estado: "mal", motivo: "fecha" });
    expect(c("0", "5")).toEqual({ estado: "mal", motivo: "fecha" });
  });

  it("con año: 4 cifras, desde 1900, no en el futuro, y el 29 de febrero solo en un año bisiesto", () => {
    expect(c("14", "10", "199")).toEqual({ estado: "mal", motivo: "fecha" });
    expect(c("14", "10", "1899")).toEqual({ estado: "mal", motivo: "fecha" });
    expect(c("14", "10", "2027")).toEqual({ estado: "mal", motivo: "fecha" });
    expect(c("29", "2", "2001")).toEqual({ estado: "mal", motivo: "fecha" });
    expect(c("29", "2", "2000")).toEqual({ estado: "ok" });
  });

  it("con año, 18 cumplidos en Lima: hoy sí, mañana no (como la base)", () => {
    expect(c("14", "10", "2008")).toEqual({ estado: "ok" });
    expect(c("15", "10", "2008")).toEqual({ estado: "mal", motivo: "menor" });
    expect(c("1", "1", "2010")).toEqual({ estado: "mal", motivo: "menor" });
    // Nacido un 29 de febrero: en un año que no es bisiesto, cumple el 28 (Postgres suma así los años).
    expect(estadoCumple({ d: "29", m: "2", a: "2008" }, { anio: 2026, mes: 2, dia: 28 })).toEqual({ estado: "ok" });
    expect(estadoCumple({ d: "29", m: "2", a: "2008" }, { anio: 2026, mes: 2, dia: 27 })).toEqual({ estado: "mal", motivo: "menor" });
  });

  it("se lee como «14 de octubre»", () => {
    expect(cumpleTexto(14, 10)).toBe("14 de octubre");
    expect(cumpleTexto(1, 1)).toBe("1 de enero");
  });

  it("hoy es el día de Lima, no el del servidor (a las 23:30 de Lima ya es mañana en UTC)", () => {
    expect(hoyLima(new Date("2026-10-15T04:30:00Z"))).toEqual({ anio: 2026, mes: 10, dia: 14 });
    expect(hoyLima(new Date("2026-10-15T05:30:00Z"))).toEqual({ anio: 2026, mes: 10, dia: 15 });
  });
});

describe("el DNI y el nombre", () => {
  it("falta hasta las 8 cifras; después, lo que dijo el servidor", () => {
    expect(estadoDocumento("dni", "4587123", { estado: "sin_revisar" })).toBe("falta");
    expect(estadoDocumento("dni", "45871236", { estado: "sin_revisar" })).toBe("buscando");
    expect(estadoDocumento("dni", "45871236", { estado: "buscando" })).toBe("buscando");
    expect(estadoDocumento("dni", "45871236", ENCONTRADO)).toBe("ok");
    expect(estadoDocumento("dni", "45871236", { estado: "repetido" })).toBe("repetido");
    expect(estadoDocumento("dni", "45871236", { estado: "archivada" })).toBe("mal");
  });

  it("sin el nombre del padrón no hay cuenta: el DNI queda en «Revisa» y dice por qué (Felipe 2026-10-15: el nombre no se escribe)", () => {
    for (const motivo of ["no_encontrado", "sin_padron", "limite"] as const) {
      expect(estadoDocumento("dni", "45871236", { estado: "sin_nombre", motivo })).toBe("mal");
    }
    expect(mensajeSinNombre("no_encontrado")).toBe(MENSAJES.dniNoEncontrado);
    expect(mensajeSinNombre("sin_padron")).toBe(MENSAJES.dniSinPadron);
    expect(mensajeSinNombre("limite")).toBe(MENSAJES.dniLimite);
    // Ninguno invita a escribir el nombre a mano, y los dos del padrón dicen que sin él no hay cuenta.
    for (const m of [MENSAJES.dniNoEncontrado, MENSAJES.dniSinPadron, MENSAJES.dniLimite]) expect(m).not.toMatch(/escribe tu nombre|escríbelo/i);
    expect(MENSAJES.dniNoEncontrado).toMatch(/no podemos crear tu cuenta/);
    expect(MENSAJES.dniSinPadron).toMatch(/no podemos crear tu cuenta/);
  });

  it("el nombre del padrón se guarda con los nombres primero y se muestra a medias: la regla única de packages/shared", () => {
    // La consulta al padrón ya devuelve el nombre así (`normalizarRespuestaPadron`); la tienda lo guarda tal cual y muestra
    // `nombreAMedias`. Sus casos viven en apps/web/lib/nombre-de-persona.test.ts; aquí, que la tienda use la misma pieza.
    const leido = normalizarRespuestaPadron("dni", "09950001", { nombre: "PAREDES SOTO,LUCÍA ANDREA" })!;
    expect(leido.nombre).toBe("Lucía Andrea Paredes Soto");
    expect(nombreAMedias(leido)).toBe("Lucía P. S.");
  });

  it("con DNI el nombre nunca se escribe: el registro no tiene caja de «nombre» y el servidor no la lee (lo que llegue de más se descarta)", () => {
    expect(Object.keys(REGISTRO_VACIO)).not.toContain("nombre");
    // Con DNI las cajas del nombre escrito (solo de carné y pasaporte) quedan listas solas: no son un campo que falte.
    expect(estadoParteNombre("dni", "")).toBe("ok");
    const conNombre = esquemaCrearCuenta.safeParse({ registro: { ...LISTO, nombre: "Nombre Escrito A Mano" }, casilla: null });
    expect(conNombre.success && "nombre" in conNombre.data.registro).toBe(false);
  });
});

describe("carné de extranjería y pasaporte (Felipe 2026-10-15: «como en las tiendas»)", () => {
  const CARNE: Registro = { ...LISTO, documentoTipo: "carne_extranjeria", documento: "001234567", nombres: "Ana Lucía", apellidos: "Torres Ruiz" };
  const LIBRE: ConsultaDocumento = { estado: "libre" };

  it("el número sigue las MISMAS reglas que la caja: de 6 a 12 letras o números; la base dice si está libre", () => {
    expect(estadoDocumento("pasaporte", "AB123", { estado: "sin_revisar" })).toBe("falta");
    expect(estadoDocumento("pasaporte", "AB1234", { estado: "sin_revisar" })).toBe("buscando");
    expect(estadoDocumento("pasaporte", "AB1234", LIBRE)).toBe("ok");
    expect(estadoDocumento("carne_extranjeria", "001234567", { estado: "repetido" })).toBe("repetido");
    expect(estadoDocumento("carne_extranjeria", "001234567", { estado: "archivada" })).toBe("mal");
    // Y qué hacer si no la creó la persona (desde 20261016154000 quien escribe un documento sin cuenta la crea).
    expect(documentoRepetido("pasaporte")).toBe(`Ya hay una cuenta con este pasaporte. ${MENSAJES.cuentaNoEsTuya}`);
    expect(documentoRepetido("carne_extranjeria")).toBe(`Ya hay una cuenta con este carné de extranjería. ${MENSAJES.cuentaNoEsTuya}`);
    expect(documentoRepetido("dni")).toBe(`${MENSAJES.dniRepetido} ${MENSAJES.cuentaNoEsTuya}`);
  });

  it("la sugerencia del número sigue al tipo elegido (y vuelve con él)", () => {
    expect(ayudaDelNumero("dni")).toBe("8 dígitos");
    expect(ayudaDelNumero("carne_extranjeria")).toBe("6 a 12 letras o números");
    expect(ayudaDelNumero("pasaporte")).toBe("6 a 12 letras o números");
    expect(ayudaDelNumero("dni")).toBe("8 dígitos");
  });

  it("el nombre se escribe tal cual, en dos cajas, sin números; se guarda con los nombres primero", () => {
    expect(estadoParteNombre("pasaporte", "")).toBe("falta");
    expect(estadoParteNombre("pasaporte", "Ana")).toBe("ok");
    expect(estadoParteNombre("pasaporte", "Ana 2")).toBe("mal");
    expect(nombreEscrito({ nombres: "  Ana  Lucía ", apellidos: "Torres   Ruiz " })).toBe("Ana Lucía Torres Ruiz");
  });

  it("la guía pide el documento y después los nombres y los apellidos; listo, no falta nada", () => {
    const vacio = estadoRegistro({ ...CARNE, nombres: "", apellidos: "" }, { correo: "libre", documento: LIBRE, codigo: CONFIRMADO }, HOY);
    expect(faltanRegistro(vacio).map(([campo]) => campo)).toEqual(["nombres", "apellidos"]);
    expect(nombresDe(faltanRegistro(vacio))).toEqual(["tus nombres", "tus apellidos"]);
    expect(faltanRegistro(estadoRegistro(CARNE, { correo: "libre", documento: LIBRE, codigo: CONFIRMADO }, HOY))).toEqual([]);
  });

  it("el servidor vuelve a revisar el número y las dos cajas", () => {
    expect(problemaRegistro(CARNE, HOY)).toBeNull();
    expect(problemaRegistro({ ...CARNE, documento: "AB12" }, HOY)).toEqual({
      campo: "documento",
      mensaje: "El carné de extranjería tiene de 6 a 12 letras o números, sin guiones.",
    });
    expect(problemaRegistro({ ...CARNE, apellidos: "Torres 2" }, HOY)).toEqual({ campo: "apellidos", mensaje: MENSAJES.nombreConNumeros });
    expect(problemaRegistro({ ...CARNE, nombres: " " }, HOY)?.campo).toBe("nombres");
    // El tipo viaja y la base lo vuelve a revisar: uno que no existe no pasa el esquema.
    expect(esquemaCrearCuenta.safeParse({ registro: { ...CARNE, documentoTipo: "ruc" }, casilla: null }).success).toBe(false);
  });

  it("lo que rechaza la base del nombre escrito va a sus cajas; un documento repetido dice cuál", () => {
    expect(errorDeRegistro("nombre_con_numeros", "nombre", "pasaporte")).toEqual({ campo: "nombres", mensaje: MENSAJES.nombreConNumeros });
    expect(errorDeRegistro("cuenta_dni_repetido", "dni", "pasaporte")).toEqual({
      campo: "documento",
      mensaje: `Ya hay una cuenta con este pasaporte. ${MENSAJES.cuentaNoEsTuya}`,
    });
  });
});

describe("la guía del registro", () => {
  it("sin nada escrito falta todo menos los avisos (opcionales): el nombre no es un campo, sale del DNI", () => {
    const e = estadoRegistro(REGISTRO_VACIO, { correo: "sin_revisar", documento: { estado: "sin_revisar" }, codigo: SIN_PEDIR }, HOY);
    expect(faltanRegistro(e).map(([campo]) => campo)).toEqual(["correo", "codigo", "clave", "documento", "cel", "cumple", "mayor", "acepta"]);
    expect(nombresDe(faltanRegistro(e))).toEqual([
      "tu correo",
      "confirmar tu correo",
      "tu contraseña",
      "tu documento",
      "tu celular",
      "tu cumpleaños",
      "confirmar que eres mayor de 18",
      "aceptar los términos",
    ]);
    // En el pie fijo se nombran los tres primeros y el resto se cuenta: «tu correo, confirmar tu correo, tu contraseña y 5 más».
    expect(faltanResumidos(faltanRegistro(e))).toEqual({ nombrados: faltanRegistro(e).slice(0, 3), mas: 5 });
    // Las dos casillas nuevas nacen sin marcar: el «sí» es un toque de la persona.
    expect(REGISTRO_VACIO).toMatchObject({ mayor: false, avisos: false });
  });

  it("«Soy mayor de 18 años» es obligatoria aunque el año diga que sí; los avisos nunca faltan", () => {
    const sinMayor = estadoRegistro(
      { ...LISTO, mayor: false, cumple: { d: "14", m: "10", a: "1990" } },
      { correo: "libre", documento: ENCONTRADO, codigo: CONFIRMADO },
      HOY,
    );
    expect(faltanRegistro(sinMayor).map(([campo]) => campo)).toEqual(["mayor"]);
    expect(campoQueSigue(sinMayor, null)).toBe("mayor");
    for (const avisos of [true, false]) {
      expect(faltanRegistro(estadoRegistro({ ...LISTO, avisos }, { correo: "libre", documento: ENCONTRADO, codigo: CONFIRMADO }, HOY))).toEqual([]);
    }
  });

  it("todo listo: no falta nada (con el correo confirmado)", () => {
    const e = estadoRegistro(LISTO, { correo: "libre", documento: ENCONTRADO, codigo: CONFIRMADO }, HOY);
    expect(faltanRegistro(e)).toEqual([]);
    expect(faltanResumidos(faltanRegistro(e))).toEqual({ nombrados: [], mas: 0 });
  });

  it("un correo repetido, un menor de 18 o un DNI sin el nombre del padrón aparecen en «Falta»", () => {
    const e = estadoRegistro(
      { ...LISTO, cumple: { d: "1", m: "1", a: "2015" } },
      { correo: "repetido", documento: { estado: "sin_nombre", motivo: "no_encontrado" }, codigo: CONFIRMADO },
      HOY,
    );
    expect(faltanRegistro(e).map(([campo]) => campo)).toEqual(["correo", "documento", "cumple"]);
    expect(e.motivoCumple).toBe("menor");
    expect(nombresDe(faltanRegistro(e))).toEqual(["tu correo", "tu documento", "tu cumpleaños"]);
  });

  it("el pie nombra los tres primeros que faltan y cuenta el resto; nunca «y 1 más»", () => {
    const letras = ["a", "b", "c", "d", "e", "f"];
    expect(faltanResumidos(letras)).toEqual({ nombrados: ["a", "b", "c"], mas: 3 });
    expect(faltanResumidos(letras.slice(0, 5))).toEqual({ nombrados: ["a", "b", "c"], mas: 2 });
    // Con cuatro, nombrar el cuarto ocupa lo mismo que «y 1 más»: se nombra.
    expect(faltanResumidos(letras.slice(0, 4))).toEqual({ nombrados: ["a", "b", "c", "d"], mas: 0 });
    expect(faltanResumidos(["a"])).toEqual({ nombrados: ["a"], mas: 0 });
    expect(faltanResumidos([])).toEqual({ nombrados: [], mas: 0 });
    // El orden es el de la página: el primero nombrado es el que sigue.
    expect(faltanResumidos(letras, 1)).toEqual({ nombrados: ["a"], mas: 5 });
  });

  it("se enciende el primero que falta; mientras se escribe en uno, la luz se queda ahí (y no salta si ya está listo)", () => {
    const e = estadoRegistro({ ...LISTO, clave: "corta", celular: "" }, { correo: "libre", documento: ENCONTRADO, codigo: CONFIRMADO }, HOY);
    expect(campoQueSigue(e, null)).toBe("clave");
    expect(campoQueSigue(e, "cel")).toBe("cel");
    expect(campoQueSigue(e, "correo")).toBeNull();
  });
});

describe("el código bajo el correo (Felipe 2026-10-15: «Obtener código» al lado y la caja debajo)", () => {
  const estadoCon = (codigo: CodigoDelCorreo, r: Registro = LISTO) => estadoRegistro(r, { correo: "libre", documento: ENCONTRADO, codigo }, HOY);

  it("el orden de la guía es correo, código y lo demás: con el correo listo, lo que sigue es pedir el código", () => {
    const e = estadoCon(SIN_PEDIR, { ...REGISTRO_VACIO, correo: LISTO.correo });
    expect(faltanRegistro(e).map(([campo]) => campo).slice(0, 2)).toEqual(["codigo", "clave"]);
    expect(campoQueSigue(e, null)).toBe("codigo");
    // Mientras está en el botón «Obtener código» (o en la caja), la luz no se va de ahí.
    expect(campoQueSigue(e, "codigo")).toBe("codigo");
  });

  it("«Crear mi cuenta» se prende recién con el correo confirmado: pedido o escrito no basta", () => {
    expect(faltanRegistro(estadoCon(SIN_PEDIR)).map(([campo]) => campo)).toEqual(["codigo"]);
    expect(faltanRegistro(estadoCon(enviado(LISTO.correo))).map(([campo]) => campo)).toEqual(["codigo"]);
    expect(nombresDe(faltanRegistro(estadoCon(SIN_PEDIR)))).toEqual(["confirmar tu correo"]);
    expect(faltanRegistro(estadoCon(CONFIRMADO))).toEqual([]);
  });

  it("cambiar el correo después de pedir (o confirmar) el código lo deja sin valor: el de antes no cuenta para el nuevo", () => {
    const otro: Registro = { ...LISTO, correo: "otra.persona@gmail.com" };
    expect(estadoCodigo(otro.correo, CONFIRMADO)).toBe("falta");
    expect(estadoCodigo(otro.correo, enviado(LISTO.correo, { necesitaNuevo: true }))).toBe("falta");
    expect(faltanRegistro(estadoCon(CONFIRMADO, otro)).map(([campo]) => campo)).toEqual(["codigo"]);
    // Volver al correo confirmado (sin pedir otro código) lo recupera: la confirmación era de ESE correo.
    expect(estadoCodigo(` ${LISTO.correo.toUpperCase()} `, CONFIRMADO)).toBe("ok");
  });

  it("un código vencido o sin intentos queda en «Revisa» hasta pedir otro; uno pedido y sin escribir, falta", () => {
    expect(estadoCodigo(LISTO.correo, enviado(LISTO.correo))).toBe("falta");
    expect(estadoCodigo(LISTO.correo, enviado(LISTO.correo, { malo: "123456" }))).toBe("falta");
    expect(estadoCodigo(LISTO.correo, enviado(LISTO.correo, { necesitaNuevo: true }))).toBe("mal");
    expect(marcaDe(estadoCodigo(LISTO.correo, enviado(LISTO.correo, { necesitaNuevo: true })), true)).toBe("error");
  });

  it("los textos del botón y del ✓, y el porqué si se intenta crear sin confirmar", () => {
    expect(MENSAJES.codigoObtener).toBe("Obtener código");
    expect(MENSAJES.correoConfirmado).toBe("Correo confirmado");
    expect(MENSAJES.codigoSinConfirmar).toMatch(/Obtener código/);
    expect(MENSAJES.codigoAntes).toMatch(/Obtener código/);
  });

  it("la marca de cada campo: ✓ listo, revisa, sigue aquí o nada", () => {
    expect(marcaDe("ok", true)).toBe("hecho");
    expect(marcaDe("mal", true)).toBe("error");
    expect(marcaDe("repetido", false)).toBe("error");
    expect(marcaDe("falta", true)).toBe("sigue");
    expect(marcaDe("buscando", false)).toBe("falta");
  });
});

describe("lo que el servidor vuelve a revisar", () => {
  it("un registro listo pasa; cada campo malo dice cuál es", () => {
    expect(problemaRegistro(LISTO, HOY)).toBeNull();
    expect(problemaRegistro({ ...LISTO, correo: "maria@gmail" }, HOY)?.campo).toBe("correo");
    expect(problemaRegistro({ ...LISTO, clave: "corta" }, HOY)?.campo).toBe("clave");
    expect(problemaRegistro({ ...LISTO, documento: "4587123" }, HOY)?.campo).toBe("documento");
    expect(problemaRegistro({ ...LISTO, celular: "887654321" }, HOY)?.campo).toBe("cel");
    expect(problemaRegistro({ ...LISTO, cumple: { d: "31", m: "4", a: "" } }, HOY)).toEqual({ campo: "cumple", mensaje: MENSAJES.cumpleMal });
    expect(problemaRegistro({ ...LISTO, cumple: { d: "1", m: "1", a: "2015" } }, HOY)).toEqual({ campo: "cumple", mensaje: MENSAJES.cumpleMenor });
    expect(problemaRegistro({ ...LISTO, mayor: false }, HOY)).toEqual({ campo: "mayor", mensaje: MENSAJES.mayorFalta });
    expect(problemaRegistro({ ...LISTO, acepta: false }, HOY)?.campo).toBe("acepta");
    // Los avisos son opcionales: con o sin ellos, el registro pasa.
    expect(problemaRegistro({ ...LISTO, avisos: true }, HOY)).toBeNull();
  });

  it("lo que rechaza la base, en palabras y con su campo", () => {
    expect(errorDeRegistro("cuenta_correo_repetido", "correo")).toEqual({ campo: "correo", mensaje: MENSAJES.correoRepetido });
    expect(errorDeRegistro("cuenta_dni_repetido", "dni")).toEqual({ campo: "documento", mensaje: documentoRepetido("dni") });
    expect(errorDeRegistro("cuenta_archivada", "dni")).toEqual({ campo: "documento", mensaje: MENSAJES.dniArchivada });
    // La regla D7 (el correo de la ficha) ya no existe desde 20261016154000: su rechazo, si llegara, es «no pudimos ahora».
    expect(errorDeRegistro("cuenta_ficha_sin_tu_correo", "correo")).toEqual({ campo: null, mensaje: MENSAJES.noDisponible });
    expect(errorDeRegistro("cuenta_menor", "cumple")).toEqual({ campo: "cumple", mensaje: MENSAJES.cumpleMenor });
    expect(errorDeRegistro("cuenta_datos_invalidos", "celular").campo).toBe("cel");
    expect(errorDeRegistro("cuenta_datos_invalidos", "mayor")).toEqual({ campo: "mayor", mensaje: MENSAJES.mayorFalta });
    expect(errorDeRegistro("cuenta_sin_codigo", "codigo")).toEqual({ campo: "codigo", mensaje: MENSAJES.codigoSinPedir });
    expect(errorDeRegistro("cuenta_texto_cambio", "avisos")).toEqual({ campo: "avisos", mensaje: MENSAJES.avisosCambio });
    expect(errorDeRegistro("cuenta_sin_texto", "avisos").campo).toBe("avisos");
    expect(errorDeRegistro("cuenta_datos_invalidos", "usuario")).toEqual({ campo: null, mensaje: MENSAJES.noDisponible });
    expect(errorDeRegistro("cuenta_ya_existe", null)).toEqual({ campo: null, mensaje: MENSAJES.noDisponible });
    expect(errorDeRegistro(undefined, undefined)).toEqual({ campo: null, mensaje: MENSAJES.noDisponible });
  });

  it("el nombre que la base no acepta (20261015133000) se dice en el DNI, con «Volver a intentar»: no hay caja de nombre", () => {
    expect(errorDeRegistro("nombre_sin_padron", "nombre")).toEqual({ campo: "documento", mensaje: MENSAJES.dniSinPadron });
    expect(errorDeRegistro("cuenta_datos_invalidos", "nombre")).toEqual({ campo: "documento", mensaje: MENSAJES.dniSinPadron });
  });

  it("el correo de otra persona (20261015054000): va a la caja del correo y no dice de quién es", () => {
    expect(errorDeRegistro("correo_repetido", "correo")).toEqual({ campo: "correo", mensaje: MENSAJES.correoDeOtraPersona });
    // Ni un nombre, ni un DNI, ni «la ficha de…»: la tienda nunca revela de quién es un correo.
    expect(MENSAJES.correoDeOtraPersona).not.toMatch(/ficha de|DNI \d|nombre de/i);
    expect(MENSAJES.correoDeOtraPersona).not.toBe(MENSAJES.correoRepetido);
    // La cuenta cerrada lo dice sin culpar a nadie y con el camino de vuelta.
    expect(MENSAJES.cuentaCerrada).toMatch(/3 años/);
    expect(MENSAJES.cuentaCerrada).toMatch(/cuenta nueva/);
  });

  it("lo que manda «Crear mi cuenta»: el registro con sus casillas y la versión de la casilla que leyó; el código no viaja", () => {
    expect(esquemaCrearCuenta.safeParse({ registro: LISTO, casilla: 2 }).success).toBe(true);
    expect(esquemaCrearCuenta.safeParse({ registro: LISTO, casilla: null }).success).toBe(true);
    expect(esquemaCrearCuenta.safeParse({ registro: { ...LISTO, mayor: undefined }, casilla: 2 }).success).toBe(false);
    expect(esquemaCrearCuenta.safeParse({ registro: LISTO, casilla: 0 }).success).toBe(false);
    // Un «código» o un «confirmado» que mande el navegador se descarta: lo que cuenta es la prueba firmada de este aparato.
    const conCodigo = esquemaCrearCuenta.safeParse({ registro: LISTO, casilla: null, codigo: "123456", confirmado: true });
    expect(conCodigo.success && Object.keys(conCodigo.data)).toEqual(["registro", "casilla"]);
  });
});

describe("el código que confirma el correo", () => {
  it("se escribe o se pega: solo cuentan sus 6 cifras", () => {
    expect(codigoLimpio("Tu código: 123 456")).toBe("123456");
    expect(codigoLimpio("1234567")).toBe("123456");
    expect(codigoCompleto("123456")).toBe(true);
    for (const corto of ["", "12345", "12345a"]) expect(codigoCompleto(corto)).toBe(false);
  });

  it("dice cuánto falta para pedir otro, y los minutos en singular y en plural", () => {
    expect(cuentaRegresiva(45)).toBe("0:45");
    expect(cuentaRegresiva(60)).toBe("1:00");
    expect(cuentaRegresiva(0.2)).toBe("0:01");
    expect(cuentaRegresiva(-3)).toBe("0:00");
    expect(enMinutos(1)).toBe("1 minuto");
    expect(enMinutos(15)).toBe("15 minutos");
  });

  it("un código equivocado dice cuántos intentos quedan; sin intentos, cuánto esperar", () => {
    expect(mensajeCodigoMalo(4)).toBe("Ese código no es. Te quedan 4 intentos.");
    expect(mensajeCodigoMalo(1)).toBe("Ese código no es. Te queda 1 intento.");
    expect(mensajeCodigoMalo(0)).toBe("Ese código no es. Ya no quedan intentos: espera 15 minutos y pide otro.");
    expect(mensajeCodigoBloqueado(12)).toBe("Hiciste muchos intentos. Espera 12 minutos y pide un código nuevo.");
    expect(mensajeCodigoLimite(1)).toBe("Ya te mandamos 5 códigos. Puedes pedir otro en 1 minuto.");
    expect(mensajeCodigoEsperar(45)).toBe("Te mandamos uno hace poco. Puedes pedir otro en 0:45.");
  });

  it("lee lo que contesta la base al reservar un envío (y los invitados viejos que hay que limpiar)", () => {
    expect(leerReserva({ estado: "enviar", usuario_web_id: USUARIO, limpiar: [USUARIO, "no-es-un-id", 7] })).toEqual({
      estado: "enviar",
      usuarioWebId: USUARIO,
      limpiar: [USUARIO],
    });
    expect(leerReserva({ estado: "enviar", usuario_web_id: null, limpiar: [] })).toEqual({ estado: "enviar", usuarioWebId: null, limpiar: [] });
    expect(leerReserva({ estado: "esperar", segundos: 42, limpiar: [] })).toEqual({ estado: "esperar", segundos: 42, limpiar: [] });
    expect(leerReserva({ estado: "limite", minutos: 25 })).toEqual({ estado: "limite", minutos: 25, limpiar: [] });
    expect(leerReserva({ estado: "bloqueado", minutos: 9 })).toMatchObject({ estado: "bloqueado", minutos: 9 });
    for (const estado of ["correo_repetido", "invalido", "sin_codigo"]) expect(leerReserva({ estado })).toEqual({ estado, limpiar: [] });
    for (const raro of [null, "enviar", {}, { estado: "otro" }]) expect(leerReserva(raro).estado).toBe("sin_respuesta");
  });

  it("lee lo que contesta la base antes de probar un código", () => {
    expect(leerIntentoDeCodigo({ estado: "puede", quedan: 3 })).toEqual({ estado: "puede", quedan: 3 });
    expect(leerIntentoDeCodigo({ estado: "puede", quedan: 0 })).toEqual({ estado: "puede", quedan: 0 });
    expect(leerIntentoDeCodigo({ estado: "bloqueado", minutos: 14 })).toEqual({ estado: "bloqueado", minutos: 14 });
    expect(leerIntentoDeCodigo({ estado: "bloqueado" })).toEqual({ estado: "bloqueado", minutos: 15 });
    expect(leerIntentoDeCodigo({ estado: "vencido" })).toEqual({ estado: "vencido" });
    expect(leerIntentoDeCodigo({ estado: "sin_codigo" })).toEqual({ estado: "sin_codigo" });
    // Sin «quedan», no se prueba nada: mejor no dejar probar que dejar probar sin cuenta.
    for (const raro of [null, { estado: "puede" }, { estado: "puede", quedan: -1 }, { estado: "x" }]) expect(leerIntentoDeCodigo(raro).estado).toBe("sin_respuesta");
  });
});

describe("los avisos del Club por WhatsApp", () => {
  it("la casilla muestra el texto aprobado tal cual, con su versión", () => {
    const texto = "Quiero recibir por WhatsApp novedades y promociones de CAYLA.";
    expect(leerCasillaWhatsapp({ version: 2, texto })).toEqual({ version: 2, texto });
    expect(leerCasillaWhatsapp({ version: 2, texto: `  ${texto}\n` })).toEqual({ version: 2, texto });
  });

  it("sin texto, con una forma rara o con un marcador que la tienda no sabe completar, no se ofrecen (nunca un texto a medias)", () => {
    for (const raro of [null, {}, { version: 0, texto: "x" }, { version: 2, texto: "   " }, { version: "2", texto: "x" }]) expect(leerCasillaWhatsapp(raro)).toBeNull();
    expect(leerCasillaWhatsapp({ version: 3, texto: "Acepto los avisos de la tienda {tienda}." })).toBeNull();
  });

  it("después de crear la cuenta: «ya eras del Club» solo para quien ya era miembro; la ficha de una boleta, la bienvenida de una persona nueva; y si los avisos quedaron sin activar por otro celular, lo dice «Mi cuenta»", () => {
    expect(avisoAlCrear(false, false, "no")).toBe("bienvenida");
    expect(avisoAlCrear(false, false, "activados")).toBe("bienvenida");
    expect(avisoAlCrear(true, false, "no")).toBe("bienvenida");
    expect(avisoAlCrear(true, true, "ya_estaban")).toBe("unida");
    expect(avisoAlCrear(true, true, "celular_distinto")).toBe("avisos-sin-activar");
    expect(avisoAlCrear(true, false, "celular_distinto")).toBe("avisos-sin-activar");
  });
});

describe("lo que contesta la base", () => {
  const CUENTA = {
    nombre: "María Pérez Salas",
    nombre_corto: "María",
    correo: "maria.perez@gmail.com",
    codigo_club: "C-0042",
    club_desde: "2026-10-14",
    cumple_dia: 14,
    cumple_mes: 10,
    activa: true,
  };

  it("lee «Mi cuenta» de tienda_mi_cuenta", () => {
    expect(leerMiCuenta(CUENTA)).toEqual({
      nombre: "María Pérez Salas",
      nombreCorto: "María",
      correo: "maria.perez@gmail.com",
      codigoClub: "C-0042",
      clubDesde: 2026,
      cumple: "14 de octubre",
      activa: true,
    });
    expect(leerMiCuenta({ ...CUENTA, cumple_dia: null, nombre_corto: null })).toMatchObject({ cumple: null, nombreCorto: "María" });
  });

  it("sin cuenta (null) o con una forma rara, no hay cuenta que mostrar", () => {
    for (const raro of [null, undefined, "x", {}, { ...CUENTA, nombre: "" }, { ...CUENTA, club_desde: "14/10/2026" }]) expect(leerMiCuenta(raro)).toBeNull();
  });

  it("lee los beneficios del club y los dice como los términos", () => {
    const b = leerBeneficios({ pct: "10.00", escala: [{ anio: 2, monto: 30 }, { anio: 1, monto: "20.00" }], compras: 6, monto_minimo: 600, dias: 60 });
    expect(b).toEqual({ pct: 10, escala: [{ anio: 1, monto: 20 }, { anio: 2, monto: 30 }], compras: 6, montoMinimo: 600, dias: 60 });
    expect(escalaEnPalabras(b!.escala)).toBe("S/\u00a020 el primer año y S/\u00a030 el segundo");
    // «S/» y la cifra no se separan al final de un renglón (ADR-0413): el espacio es el que no se parte.
    expect(soles(20)).toBe("S/\u00a020");
    expect(soles(25.5)).toBe("S/\u00a025.50");
    expect(leerBeneficios({ pct: 10 })).toBeNull();
  });
});

describe("la ip de quien llama", () => {
  it("la primera de x-forwarded-for; si no, x-real-ip; si no, «desconocida»", () => {
    expect(ipDeLaPeticion("190.1.2.3, 10.0.0.1", "10.0.0.2")).toBe("190.1.2.3");
    expect(ipDeLaPeticion(null, " 190.4.5.6 ")).toBe("190.4.5.6");
    expect(ipDeLaPeticion("", "")).toBe("desconocida");
  });
});
