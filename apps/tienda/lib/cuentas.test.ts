import { describe, expect, it } from "vitest";
import { nombreAMedias } from "@cayla-retail/shared";
import { normalizarRespuestaPadron } from "@cayla-retail/shared/padron";
import {
  arregloCorreo,
  avisoAlUnirse,
  campoQueSigue,
  celularNormalizado,
  codigoCompleto,
  codigoLimpio,
  correoValido,
  cuentaRegresiva,
  cumpleTexto,
  enMinutos,
  errorDeClub,
  errorDeCuenta,
  esquemaCrearCuenta,
  esquemaUnirseAlClub,
  estadoClub,
  estadoCuenta,
  estadoCumpleOpcional,
  estadoNombre,
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
  faltanCaracteres,
  faltanClub,
  faltanCuenta,
  faltanResumidos,
  hoyLima,
  ipDeLaPeticion,
  leerBeneficios,
  leerCasillaWhatsapp,
  leerIntentoDeCodigo,
  leerMiCuenta,
  leerReserva,
  marcaDe,
  mensajeCodigoBloqueado,
  mensajeCodigoEsperar,
  mensajeCodigoLimite,
  mensajeCodigoMalo,
  mensajeSinNombre,
  problemaClub,
  problemaCuenta,
  REGISTRO_CLUB_VACIO,
  REGISTRO_CUENTA_VACIO,
  soles,
  type ConsultaDocumento,
  type RegistroClub,
  type RegistroCuenta,
} from "./cuentas";
import { MENSAJES } from "./cuentas-mensajes";
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
const LISTO: RegistroCuenta = { correo: "maria.perez@gmail.com", clave: "clave-segura", nombre: "María", acepta: true };
const LISTO_CLUB: RegistroClub = {
  documentoTipo: "dni",
  documento: "45871236",
  nombres: "",
  apellidos: "",
  celular: "987654321",
  cumple: { d: "", m: "", a: "" },
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

  it("sin el nombre del padrón no hay Club: el DNI queda en «Revisa» y dice por qué (Felipe 2026-10-15: el nombre no se escribe)", () => {
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

  it("con DNI el nombre nunca se escribe: el formulario del Club no tiene caja de «nombre» y el servidor no la lee (lo que llegue de más se descarta)", () => {
    expect(Object.keys(REGISTRO_CLUB_VACIO)).not.toContain("nombre");
    // Con DNI las cajas del nombre escrito (solo de carné y pasaporte) quedan listas solas: no son un campo que falte.
    expect(estadoParteNombre("dni", "")).toBe("ok");
    const conNombre = esquemaUnirseAlClub.safeParse({ registro: { ...LISTO_CLUB, nombre: "Nombre Escrito A Mano" }, casilla: null });
    expect(conNombre.success && "nombre" in conNombre.data.registro).toBe(false);
  });
});

describe("carné de extranjería y pasaporte (Felipe 2026-10-15: «como en las tiendas»)", () => {
  const CARNE: RegistroClub = { ...LISTO_CLUB, documentoTipo: "carne_extranjeria", documento: "001234567", nombres: "Ana Lucía", apellidos: "Torres Ruiz" };
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
    const vacio = estadoClub({ ...CARNE, nombres: "", apellidos: "" }, { documento: LIBRE }, HOY);
    expect(faltanClub(vacio).map(([campo]) => campo)).toEqual(["nombres", "apellidos"]);
    expect(nombresDe(faltanClub(vacio))).toEqual(["tus nombres", "tus apellidos"]);
    expect(faltanClub(estadoClub(CARNE, { documento: LIBRE }, HOY))).toEqual([]);
  });

  it("el servidor vuelve a revisar el número y las dos cajas", () => {
    expect(problemaClub(CARNE, HOY)).toBeNull();
    expect(problemaClub({ ...CARNE, documento: "AB12" }, HOY)).toEqual({
      campo: "documento",
      mensaje: "El carné de extranjería tiene de 6 a 12 letras o números, sin guiones.",
    });
    expect(problemaClub({ ...CARNE, apellidos: "Torres 2" }, HOY)).toEqual({ campo: "apellidos", mensaje: MENSAJES.nombreConNumeros });
    expect(problemaClub({ ...CARNE, nombres: " " }, HOY)?.campo).toBe("nombres");
    // El tipo viaja y la base lo vuelve a revisar: uno que no existe no pasa el esquema.
    expect(esquemaUnirseAlClub.safeParse({ registro: { ...CARNE, documentoTipo: "ruc" }, casilla: null }).success).toBe(false);
  });

  it("lo que rechaza la base del nombre escrito va a sus cajas; un documento repetido dice cuál", () => {
    expect(errorDeClub("nombre_con_numeros", "nombre", "pasaporte")).toEqual({ campo: "nombres", mensaje: MENSAJES.nombreConNumeros });
    expect(errorDeClub("cuenta_dni_repetido", "dni", "pasaporte")).toEqual({
      campo: "documento",
      mensaje: `Ya hay una cuenta con este pasaporte. ${MENSAJES.cuentaNoEsTuya}`,
    });
  });
});

describe("la guía de crear la cuenta (ADR-0438: solo lo necesario)", () => {
  const consultas = (codigo: CodigoDelCorreo, correo: "libre" | "sin_revisar" | "repetido" = "libre") => ({ correo, codigo });

  it("sin nada escrito falta todo: correo, su código, el nombre, la contraseña y los términos; y nada más (ni documento ni celular)", () => {
    const e = estadoCuenta(REGISTRO_CUENTA_VACIO, consultas(SIN_PEDIR, "sin_revisar"));
    expect(faltanCuenta(e).map(([campo]) => campo)).toEqual(["correo", "codigo", "nombre", "clave", "acepta"]);
    expect(nombresDe(faltanCuenta(e))).toEqual(["tu correo", "confirmar tu correo", "tu nombre", "tu contraseña", "aceptar los términos"]);
    // En el pie fijo se nombran los tres primeros y el resto se cuenta.
    expect(faltanResumidos(faltanCuenta(e))).toEqual({ nombrados: faltanCuenta(e).slice(0, 3), mas: 2 });
    // La casilla nace sin marcar: el «sí» es un toque de la persona.
    expect(REGISTRO_CUENTA_VACIO.acepta).toBe(false);
    expect(Object.keys(REGISTRO_CUENTA_VACIO).sort()).toEqual(["acepta", "clave", "correo", "nombre"]);
  });

  it("el nombre: con dos letras alcanza, sin tope raro (hasta 120)", () => {
    expect(estadoNombre("")).toBe("falta");
    expect(estadoNombre(" A ")).toBe("falta");
    expect(estadoNombre("Ana")).toBe("ok");
    expect(estadoNombre("x".repeat(120))).toBe("ok");
    expect(estadoNombre("x".repeat(121))).toBe("mal");
  });

  it("todo listo: no falta nada (con el correo confirmado)", () => {
    const e = estadoCuenta(LISTO, consultas(CONFIRMADO));
    expect(faltanCuenta(e)).toEqual([]);
    expect(faltanResumidos(faltanCuenta(e))).toEqual({ nombrados: [], mas: 0 });
  });

  it("un correo repetido aparece en «Falta»", () => {
    const e = estadoCuenta(LISTO, consultas(CONFIRMADO, "repetido"));
    expect(faltanCuenta(e).map(([campo]) => campo)).toEqual(["correo"]);
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
    const e = estadoCuenta({ ...LISTO, clave: "corta", nombre: "" }, consultas(CONFIRMADO));
    const faltan = faltanCuenta(e);
    expect(campoQueSigue(faltan, e, null)).toBe("nombre");
    expect(campoQueSigue(faltan, e, "clave")).toBe("clave");
    expect(campoQueSigue(faltan, e, "correo")).toBeNull();
  });
});

describe("la guía de unirse al Club (al separar: documento, celular, casillas; el cumpleaños y los avisos, opcionales)", () => {
  it("sin nada escrito faltan el documento, el celular, ser mayor de 18 y los términos; con DNI el nombre sale del padrón y no cuenta", () => {
    const e = estadoClub(REGISTRO_CLUB_VACIO, { documento: { estado: "sin_revisar" } }, HOY);
    expect(faltanClub(e).map(([campo]) => campo)).toEqual(["documento", "cel", "mayor", "acepta"]);
    expect(nombresDe(faltanClub(e))).toEqual(["tu documento", "tu celular", "confirmar que eres mayor de 18", "aceptar los términos"]);
    // Las casillas nacen sin marcar: el «sí» es un toque de la persona.
    expect(REGISTRO_CLUB_VACIO).toMatchObject({ mayor: false, acepta: false, avisos: false });
  });

  it("«Soy mayor de 18 años» es obligatoria aunque el año diga que sí; los avisos nunca faltan", () => {
    const sinMayor = estadoClub({ ...LISTO_CLUB, mayor: false, cumple: { d: "14", m: "10", a: "1990" } }, { documento: ENCONTRADO }, HOY);
    expect(faltanClub(sinMayor).map(([campo]) => campo)).toEqual(["mayor"]);
    expect(campoQueSigue(faltanClub(sinMayor), sinMayor, null)).toBe("mayor");
    for (const avisos of [true, false]) {
      expect(faltanClub(estadoClub({ ...LISTO_CLUB, avisos }, { documento: ENCONTRADO }, HOY))).toEqual([]);
    }
  });

  it("el cumpleaños es opcional: vacío no falta; escrito a medias o imposible sí aparece, y uno de menor de 18 también", () => {
    expect(estadoCumpleOpcional({ d: "", m: "", a: "" }, HOY)).toEqual({ estado: "ok", vacio: true });
    expect(estadoCumpleOpcional({ d: "14", m: "10", a: "" }, HOY)).toMatchObject({ estado: "ok", vacio: false });
    expect(estadoCumpleOpcional({ d: "14", m: "", a: "" }, HOY).estado).toBe("mal");
    expect(estadoCumpleOpcional({ d: "", m: "", a: "1990" }, HOY).estado).toBe("mal");
    expect(estadoCumpleOpcional({ d: "31", m: "4", a: "" }, HOY)).toMatchObject({ estado: "mal", motivo: "fecha" });
    expect(estadoCumpleOpcional({ d: "1", m: "1", a: "2015" }, HOY)).toMatchObject({ estado: "mal", motivo: "menor" });
    expect(faltanClub(estadoClub(LISTO_CLUB, { documento: ENCONTRADO }, HOY))).toEqual([]);
    const mal = estadoClub({ ...LISTO_CLUB, cumple: { d: "1", m: "1", a: "2015" } }, { documento: ENCONTRADO }, HOY);
    expect(faltanClub(mal).map(([campo]) => campo)).toEqual(["cumple"]);
    expect(mal.motivoCumple).toBe("menor");
  });

  it("un DNI sin el nombre del padrón o de otra cuenta aparece en «Falta»", () => {
    const e = estadoClub(LISTO_CLUB, { documento: { estado: "sin_nombre", motivo: "no_encontrado" } }, HOY);
    expect(faltanClub(e).map(([campo]) => campo)).toEqual(["documento"]);
    expect(faltanClub(estadoClub(LISTO_CLUB, { documento: { estado: "repetido" } }, HOY)).map(([campo]) => campo)).toEqual(["documento"]);
  });
});

describe("el código bajo el correo (Felipe 2026-10-15: «Obtener código» al lado y la caja debajo)", () => {
  const estadoCon = (codigo: CodigoDelCorreo, r: RegistroCuenta = LISTO) => estadoCuenta(r, { correo: "libre", codigo });
  const campos = (e: ReturnType<typeof estadoCuenta>) => faltanCuenta(e).map(([campo]) => campo);

  it("el orden de la guía es correo, código y lo demás: con el correo listo, lo que sigue es pedir el código", () => {
    const e = estadoCon(SIN_PEDIR, { ...REGISTRO_CUENTA_VACIO, correo: LISTO.correo });
    expect(campos(e).slice(0, 2)).toEqual(["codigo", "nombre"]);
    expect(campoQueSigue(faltanCuenta(e), e, null)).toBe("codigo");
    // Mientras está en el botón «Obtener código» (o en la caja), la luz no se va de ahí.
    expect(campoQueSigue(faltanCuenta(e), e, "codigo")).toBe("codigo");
  });

  it("«Crear mi cuenta» se prende recién con el correo confirmado: pedido o escrito no basta", () => {
    expect(campos(estadoCon(SIN_PEDIR))).toEqual(["codigo"]);
    expect(campos(estadoCon(enviado(LISTO.correo)))).toEqual(["codigo"]);
    expect(nombresDe(faltanCuenta(estadoCon(SIN_PEDIR)))).toEqual(["confirmar tu correo"]);
    expect(faltanCuenta(estadoCon(CONFIRMADO))).toEqual([]);
  });

  it("cambiar el correo después de pedir (o confirmar) el código lo deja sin valor: el de antes no cuenta para el nuevo", () => {
    const otro: RegistroCuenta = { ...LISTO, correo: "otra.persona@gmail.com" };
    expect(estadoCodigo(otro.correo, CONFIRMADO)).toBe("falta");
    expect(estadoCodigo(otro.correo, enviado(LISTO.correo, { necesitaNuevo: true }))).toBe("falta");
    expect(campos(estadoCon(CONFIRMADO, otro))).toEqual(["codigo"]);
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
  it("una cuenta lista pasa; cada campo malo dice cuál es", () => {
    expect(problemaCuenta(LISTO)).toBeNull();
    expect(problemaCuenta({ ...LISTO, correo: "maria@gmail" })?.campo).toBe("correo");
    expect(problemaCuenta({ ...LISTO, nombre: " " })).toEqual({ campo: "nombre", mensaje: MENSAJES.nombreFalta });
    expect(problemaCuenta({ ...LISTO, clave: "corta" })?.campo).toBe("clave");
    expect(problemaCuenta({ ...LISTO, acepta: false })).toEqual({ campo: "acepta", mensaje: MENSAJES.aceptaFalta });
  });

  it("los datos del Club listos pasan; cada campo malo dice cuál es", () => {
    expect(problemaClub(LISTO_CLUB, HOY)).toBeNull();
    expect(problemaClub({ ...LISTO_CLUB, documento: "4587123" }, HOY)?.campo).toBe("documento");
    expect(problemaClub({ ...LISTO_CLUB, celular: "887654321" }, HOY)?.campo).toBe("cel");
    expect(problemaClub({ ...LISTO_CLUB, cumple: { d: "31", m: "4", a: "" } }, HOY)).toEqual({ campo: "cumple", mensaje: MENSAJES.cumpleMal });
    expect(problemaClub({ ...LISTO_CLUB, cumple: { d: "1", m: "1", a: "2015" } }, HOY)).toEqual({ campo: "cumple", mensaje: MENSAJES.cumpleMenor });
    expect(problemaClub({ ...LISTO_CLUB, mayor: false }, HOY)).toEqual({ campo: "mayor", mensaje: MENSAJES.mayorFalta });
    expect(problemaClub({ ...LISTO_CLUB, acepta: false }, HOY)).toEqual({ campo: "acepta", mensaje: MENSAJES.clubAceptaFalta });
    // El cumpleaños y los avisos son opcionales: con o sin ellos, pasa.
    expect(problemaClub({ ...LISTO_CLUB, avisos: true, cumple: { d: "14", m: "10", a: "" } }, HOY)).toBeNull();
  });

  it("lo que rechaza la base al crear la cuenta, en palabras y con su campo", () => {
    expect(errorDeCuenta("cuenta_correo_repetido", "correo")).toEqual({ campo: "correo", mensaje: MENSAJES.correoRepetido });
    expect(errorDeCuenta("cuenta_correo_de_otra_persona", "correo")).toEqual({ campo: "correo", mensaje: MENSAJES.correoDeOtraPersona });
    expect(errorDeCuenta("cuenta_sin_codigo", "codigo")).toEqual({ campo: "codigo", mensaje: MENSAJES.codigoSinPedir });
    expect(errorDeCuenta("cuenta_datos_invalidos", "nombre")).toEqual({ campo: "nombre", mensaje: MENSAJES.nombreFalta });
    expect(errorDeCuenta("cuenta_datos_invalidos", "acepta")).toEqual({ campo: "acepta", mensaje: MENSAJES.aceptaFalta });
    expect(errorDeCuenta("cuenta_datos_invalidos", "correo").campo).toBe("correo");
    expect(errorDeCuenta("cuenta_datos_invalidos", "usuario")).toEqual({ campo: null, mensaje: MENSAJES.noDisponible });
    expect(errorDeCuenta("cuenta_ya_existe", null)).toEqual({ campo: null, mensaje: MENSAJES.noDisponible });
    expect(errorDeCuenta(undefined, undefined)).toEqual({ campo: null, mensaje: MENSAJES.noDisponible });
  });

  it("lo que rechaza la base al unirse al Club, en palabras y con su campo", () => {
    expect(errorDeClub("cuenta_dni_repetido", "dni")).toEqual({ campo: "documento", mensaje: documentoRepetido("dni") });
    expect(errorDeClub("cuenta_archivada", "dni")).toEqual({ campo: "documento", mensaje: MENSAJES.dniArchivada });
    expect(errorDeClub("cuenta_menor", "cumple")).toEqual({ campo: "cumple", mensaje: MENSAJES.cumpleMenor });
    expect(errorDeClub("cuenta_datos_invalidos", "celular").campo).toBe("cel");
    expect(errorDeClub("cuenta_datos_invalidos", "mayor")).toEqual({ campo: "mayor", mensaje: MENSAJES.mayorFalta });
    expect(errorDeClub("cuenta_datos_invalidos", "acepta")).toEqual({ campo: "acepta", mensaje: MENSAJES.clubAceptaFalta });
    expect(errorDeClub("cuenta_texto_cambio", "avisos")).toEqual({ campo: "avisos", mensaje: MENSAJES.avisosCambio });
    expect(errorDeClub("cuenta_sin_texto", "avisos").campo).toBe("avisos");
    expect(errorDeClub("cuenta_sin_cuenta", null)).toEqual({ campo: null, mensaje: MENSAJES.clubNoDisponible });
    expect(errorDeClub(undefined, undefined)).toEqual({ campo: null, mensaje: MENSAJES.clubNoDisponible });
  });

  it("el nombre que la base no acepta (20261015133000) se dice en el DNI, con «Volver a intentar»: no hay caja de nombre", () => {
    expect(errorDeClub("nombre_sin_padron", "nombre")).toEqual({ campo: "documento", mensaje: MENSAJES.dniSinPadron });
    expect(errorDeClub("cuenta_datos_invalidos", "nombre")).toEqual({ campo: "documento", mensaje: MENSAJES.dniSinPadron });
  });

  it("el correo de otra persona (20261015054000): no dice de quién es", () => {
    expect(errorDeCuenta("correo_repetido", "correo")).toEqual({ campo: "correo", mensaje: MENSAJES.correoDeOtraPersona });
    // Ni un nombre, ni un DNI, ni «la ficha de…»: la tienda nunca revela de quién es un correo.
    expect(MENSAJES.correoDeOtraPersona).not.toMatch(/ficha de|DNI \d|nombre de/i);
    expect(MENSAJES.correoDeOtraPersona).not.toBe(MENSAJES.correoRepetido);
    // La cuenta cerrada lo dice sin culpar a nadie y con el camino de vuelta.
    expect(MENSAJES.cuentaCerrada).toMatch(/3 años/);
    expect(MENSAJES.cuentaCerrada).toMatch(/cuenta nueva/);
  });

  it("lo que manda «Crear mi cuenta»: el registro y a dónde volver; el código no viaja", () => {
    expect(esquemaCrearCuenta.safeParse({ registro: LISTO }).success).toBe(true);
    expect(esquemaCrearCuenta.safeParse({ registro: LISTO, volver: "/bolsa" }).success).toBe(true);
    expect(esquemaCrearCuenta.safeParse({ registro: { ...LISTO, acepta: undefined } }).success).toBe(false);
    // Un «código» o un «confirmado» que mande el navegador se descarta: lo que cuenta es la prueba firmada de este aparato.
    const conCodigo = esquemaCrearCuenta.safeParse({ registro: LISTO, codigo: "123456", confirmado: true });
    expect(conCodigo.success && Object.keys(conCodigo.data)).toEqual(["registro"]);
  });

  it("lo que manda «Unirme al Club»: los datos con sus casillas y la versión de la casilla que leyó", () => {
    expect(esquemaUnirseAlClub.safeParse({ registro: LISTO_CLUB, casilla: 2 }).success).toBe(true);
    expect(esquemaUnirseAlClub.safeParse({ registro: LISTO_CLUB, casilla: null }).success).toBe(true);
    expect(esquemaUnirseAlClub.safeParse({ registro: { ...LISTO_CLUB, mayor: undefined }, casilla: 2 }).success).toBe(false);
    expect(esquemaUnirseAlClub.safeParse({ registro: LISTO_CLUB, casilla: 0 }).success).toBe(false);
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

  it("después de unirse al Club: «ya eras del Club» solo para quien ya era miembro; la ficha de una boleta, la bienvenida de una persona nueva; y si los avisos quedaron sin activar por otro celular, lo dice «Mi perfil»", () => {
    expect(avisoAlUnirse(false, false, "no")).toBe("bienvenida");
    expect(avisoAlUnirse(false, false, "activados")).toBe("bienvenida");
    expect(avisoAlUnirse(true, false, "no")).toBe("bienvenida");
    expect(avisoAlUnirse(true, true, "ya_estaban")).toBe("unida");
    expect(avisoAlUnirse(true, true, "celular_distinto")).toBe("avisos-sin-activar");
    expect(avisoAlUnirse(true, false, "celular_distinto")).toBe("avisos-sin-activar");
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
      esDelClub: true,
      clubDesde: 2026,
      cumple: "14 de octubre",
      activa: true,
    });
    expect(leerMiCuenta({ ...CUENTA, cumple_dia: null, nombre_corto: null })).toMatchObject({ cumple: null, nombreCorto: "María" });
    // Una cuenta simple (ADR-0438) todavía no es del Club: sin código ni fecha de miembro.
    expect(leerMiCuenta({ ...CUENTA, codigo_club: null, club_desde: null })).toMatchObject({ esDelClub: false, codigoClub: null, clubDesde: null });
  });

  it("sin cuenta (null) o con una forma rara, no hay cuenta que mostrar", () => {
    for (const raro of [null, undefined, "x", {}, { ...CUENTA, nombre: "" }, { ...CUENTA, club_desde: "14/10/2026" }]) expect(leerMiCuenta(raro)).toBeNull();
  });

  it("lee los beneficios del club", () => {
    const b = leerBeneficios({ pct: "10.00", escala: [{ anio: 2, monto: 30 }, { anio: 1, monto: "20.00" }], compras: 6, monto_minimo: 600, dias: 60 });
    expect(b).toEqual({ pct: 10, escala: [{ anio: 1, monto: 20 }, { anio: 2, monto: 30 }], compras: 6, montoMinimo: 600, dias: 60 });
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
