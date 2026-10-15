import { describe, expect, it } from "vitest";
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
  esquemaConfirmarCodigo,
  esquemaPedirCodigo,
  estadoCelular,
  estadoClave,
  estadoCorreo,
  estadoCumple,
  estadoDni,
  estadoNombre,
  estadoRegistro,
  faltanCaracteres,
  faltanRegistro,
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
  nombreDelPadron,
  problemaRegistro,
  REGISTRO_VACIO,
  textoFaltan,
  type ConsultaDni,
  type Registro,
} from "./cuentas";

const HOY = { anio: 2026, mes: 10, dia: 14 };
const ENCONTRADO: ConsultaDni = { estado: "encontrado", aMedias: "María P. S.", delClub: false };
const LISTO: Registro = {
  correo: "maria.perez@gmail.com",
  clave: "clave-segura",
  dni: "45871236",
  nombre: "",
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
    expect(estadoDni("4587123", { estado: "sin_revisar" })).toBe("falta");
    expect(estadoDni("45871236", { estado: "sin_revisar" })).toBe("buscando");
    expect(estadoDni("45871236", { estado: "buscando" })).toBe("buscando");
    expect(estadoDni("45871236", ENCONTRADO)).toBe("ok");
    expect(estadoDni("45871236", { estado: "sin_nombre", motivo: "sin_padron", delClub: false })).toBe("ok");
    expect(estadoDni("45871236", { estado: "repetido" })).toBe("repetido");
    expect(estadoDni("45871236", { estado: "archivada" })).toBe("mal");
  });

  it("el nombre del padrón se guarda con los nombres primero y se muestra a medias (SUNAT trae primero los apellidos)", () => {
    expect(nombreDelPadron("PEREZ SALAS MARIA FERNANDA", "sunat_publico")).toEqual({ nombre: "Maria Fernanda Perez Salas", aMedias: "Maria P. S." });
    expect(nombreDelPadron("MARIA FERNANDA PEREZ SALAS", "proveedor")).toEqual({ nombre: "Maria Fernanda Perez Salas", aMedias: "Maria P. S." });
    expect(nombreDelPadron("DE LA CRUZ PEREZ ÑUSTA", "sunat_publico")).toEqual({ nombre: "Ñusta de la Cruz Perez", aMedias: "Ñusta C. P." });
    expect(nombreDelPadron("   ", "proveedor")).toBeNull();
  });

  it("el nombre solo se pide si el padrón no lo dio", () => {
    expect(estadoNombre("", ENCONTRADO)).toBe("ok");
    const sinNombre: ConsultaDni = { estado: "sin_nombre", motivo: "no_encontrado", delClub: false };
    expect(estadoNombre("", sinNombre)).toBe("falta");
    expect(estadoNombre("  Ma ", sinNombre)).toBe("falta");
    expect(estadoNombre("María Pérez", sinNombre)).toBe("ok");
    expect(estadoNombre("12345", sinNombre)).toBe("falta");
    expect(estadoNombre("x".repeat(201), sinNombre)).toBe("mal");
  });
});

describe("la guía del registro", () => {
  it("sin nada escrito falta todo menos el nombre (que el padrón todavía puede dar) y los avisos (opcionales)", () => {
    const e = estadoRegistro(REGISTRO_VACIO, { correo: "sin_revisar", dni: { estado: "sin_revisar" } }, HOY);
    expect(faltanRegistro(e).map(([campo]) => campo)).toEqual(["correo", "clave", "dni", "cel", "cumple", "mayor", "acepta"]);
    expect(textoFaltan(faltanRegistro(e))).toBe(
      "tu correo, tu contraseña, tu DNI, tu celular, tu cumpleaños, confirmar que eres mayor de 18 y aceptar los términos",
    );
    // Las dos casillas nuevas nacen sin marcar: el «sí» es un toque de la persona.
    expect(REGISTRO_VACIO).toMatchObject({ mayor: false, avisos: false });
  });

  it("«Soy mayor de 18 años» es obligatoria aunque el año diga que sí; los avisos nunca faltan", () => {
    const sinMayor = estadoRegistro({ ...LISTO, mayor: false, cumple: { d: "14", m: "10", a: "1990" } }, { correo: "libre", dni: ENCONTRADO }, HOY);
    expect(faltanRegistro(sinMayor).map(([campo]) => campo)).toEqual(["mayor"]);
    expect(campoQueSigue(sinMayor, null)).toBe("mayor");
    for (const avisos of [true, false]) expect(faltanRegistro(estadoRegistro({ ...LISTO, avisos }, { correo: "libre", dni: ENCONTRADO }, HOY))).toEqual([]);
  });

  it("todo listo: no falta nada", () => {
    const e = estadoRegistro(LISTO, { correo: "libre", dni: ENCONTRADO }, HOY);
    expect(faltanRegistro(e)).toEqual([]);
    expect(textoFaltan([])).toBe("");
  });

  it("un correo repetido, un menor de 18 o un DNI sin nombre aparecen en «Falta»", () => {
    const e = estadoRegistro(
      { ...LISTO, cumple: { d: "1", m: "1", a: "2015" } },
      { correo: "repetido", dni: { estado: "sin_nombre", motivo: "no_encontrado", delClub: false } },
      HOY,
    );
    expect(faltanRegistro(e).map(([campo]) => campo)).toEqual(["correo", "nombre", "cumple"]);
    expect(e.motivoCumple).toBe("menor");
    expect(textoFaltan(faltanRegistro(e))).toBe("tu correo, tu nombre y tu cumpleaños");
  });

  it("se enciende el primero que falta; mientras se escribe en uno, la luz se queda ahí (y no salta si ya está listo)", () => {
    const e = estadoRegistro({ ...LISTO, clave: "corta", celular: "" }, { correo: "libre", dni: ENCONTRADO }, HOY);
    expect(campoQueSigue(e, null)).toBe("clave");
    expect(campoQueSigue(e, "cel")).toBe("cel");
    expect(campoQueSigue(e, "correo")).toBeNull();
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
    expect(problemaRegistro({ ...LISTO, dni: "4587123" }, HOY)?.campo).toBe("dni");
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
    expect(errorDeRegistro("cuenta_dni_repetido", "dni")).toEqual({ campo: "dni", mensaje: MENSAJES.dniRepetido });
    expect(errorDeRegistro("cuenta_archivada", "dni")).toEqual({ campo: "dni", mensaje: MENSAJES.dniArchivada });
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

  it("el correo de otra persona (20261015054000): va a la caja del correo y no dice de quién es", () => {
    expect(errorDeRegistro("correo_repetido", "correo")).toEqual({ campo: "correo", mensaje: MENSAJES.correoDeOtraPersona });
    // Ni un nombre, ni un DNI, ni «la ficha de…»: la tienda nunca revela de quién es un correo.
    expect(MENSAJES.correoDeOtraPersona).not.toMatch(/ficha de|DNI \d|nombre de/i);
    expect(MENSAJES.correoDeOtraPersona).not.toBe(MENSAJES.correoRepetido);
    // La cuenta cerrada lo dice sin culpar a nadie y con el camino de vuelta.
    expect(MENSAJES.cuentaCerrada).toMatch(/3 años/);
    expect(MENSAJES.cuentaCerrada).toMatch(/cuenta nueva/);
  });

  it("lo que manda el formulario: el registro con sus casillas, la versión de la casilla que leyó y, al crear, el código", () => {
    expect(esquemaPedirCodigo.safeParse({ registro: LISTO, casilla: 2 }).success).toBe(true);
    expect(esquemaPedirCodigo.safeParse({ registro: LISTO, casilla: null }).success).toBe(true);
    expect(esquemaPedirCodigo.safeParse({ registro: { ...LISTO, mayor: undefined }, casilla: 2 }).success).toBe(false);
    expect(esquemaPedirCodigo.safeParse({ registro: LISTO, casilla: 0 }).success).toBe(false);
    expect(esquemaConfirmarCodigo.safeParse({ registro: LISTO, casilla: null, codigo: "123456" }).success).toBe(true);
    expect(esquemaConfirmarCodigo.safeParse({ registro: LISTO, casilla: null }).success).toBe(false);
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

  it("después de crear la cuenta: bienvenida o unida, y si los avisos quedaron sin activar por otro celular, lo dice «Mi cuenta»", () => {
    expect(avisoAlCrear(false, "no")).toBe("bienvenida");
    expect(avisoAlCrear(false, "activados")).toBe("bienvenida");
    expect(avisoAlCrear(true, "ya_estaban")).toBe("unida");
    expect(avisoAlCrear(true, "celular_distinto")).toBe("avisos-sin-activar");
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
    expect(escalaEnPalabras(b!.escala)).toBe("S/ 20 el primer año y S/ 30 el segundo");
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
