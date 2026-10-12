import { describe, expect, it } from "vitest";
import {
  MENSAJE,
  argumentosRegistro,
  bienvenida,
  bloquesDeTexto,
  casillaTerminos,
  completarMarcadores,
  cuerpoLegal,
  edadCumplida,
  enlaceLegal,
  errorDeLaBase,
  escalaEnPalabras,
  esUuid,
  fechaLarga,
  formatoPct,
  formatoSoles,
  ipDeLaPeticion,
  lecturaDePagina,
  leerDatosRegistro,
  letraChica,
  marcadoresDePagina,
  mensajeDeConsulta,
  nacimientoIso,
  nombreAMedias,
  nombresYApellidos,
  problemasRegistro,
  respuestaDeRegistro,
  textoLegal,
  trozosDeLinea,
  versionesDe,
  type DatosRegistro,
  type PaginaClub,
  type RegistroEscrito,
} from "./club-registro-reglas";

const TIENDA = "3f2a9c1e-7b4d-4e8a-9c21-5d6e7f8a9b0c";
const HOY = "2026-10-01";

// Lo que devolvería `fn_club_pagina` con los valores de la tanda 1g (G-13): 10 %, 6 compras o S/ 600, 60 días, S/ 20…60.
const JSON_PAGINA = {
  tienda: "Tienda TRU",
  whatsapp: "953 585 537",
  pct: 10,
  escala: [
    { anio: 3, monto: 40 },
    { anio: 1, monto: 20 },
    { anio: 2, monto: 30 },
    { anio: 4, monto: 50 },
    { anio: 5, monto: 60 },
  ],
  compras: 6,
  monto_minimo: 600,
  dias: 60,
  textos: {
    terminos: { version: 1, texto: "## 3. Términos\n\n1. **Cupón:** {pct} % de descuento.\n2. Vale: {escala}." },
    privacidad: { version: 2, texto: "### 2.1 Quién\n\nCAYLA S.A.C.", vigente_desde: "2026-10-01" },
    casilla_publicidad: { version: 1, texto: "Acepto que CAYLA S.A.C. me envíe por WhatsApp novedades." },
    saludo: { version: 1, texto: "Hola CAYLA, soy {nombre}. Me acabo de unir al Club CAYLA ({código})." },
  },
};

const pagina = (): PaginaClub => {
  const l = lecturaDePagina(JSON_PAGINA);
  if (l.estado !== "lista") throw new Error("la página de prueba debería leerse");
  return l.pagina;
};

const BIEN: RegistroEscrito = {
  documentoTipo: "dni",
  documentoNumero: "46027897",
  dniConfirmado: true,
  nombre: "",
  celular: "987654321",
  nacimiento: { dia: "12", mes: "9", anio: "1990" },
  correo: "",
  mayorDeEdad: true,
  aceptaTerminos: true,
  aceptaPublicidad: false,
};

describe("lo que contesta fn_club_pagina", () => {
  it("una página completa: la tienda, su WhatsApp limpio, la escala ordenada y los cuatro textos", () => {
    const p = pagina();
    expect(p.tienda).toBe("Tienda TRU");
    expect(p.whatsapp).toBe("953585537");
    expect(p.escala.map((e) => e.anio)).toEqual([1, 2, 3, 4, 5]);
    expect(p.textos.privacidad).toEqual({ version: 2, texto: "### 2.1 Quién\n\nCAYLA S.A.C.", vigenteDesde: "2026-10-01" });
    expect(p.textos.terminos.vigenteDesde).toBeNull();
    expect(p.textos.saludo?.version).toBe(1);
  });

  it("null es «no es una tienda»; algo que no es un objeto, «no disponible»", () => {
    expect(lecturaDePagina(null)).toEqual({ estado: "no_es_tienda" });
    expect(lecturaDePagina(undefined)).toEqual({ estado: "no_es_tienda" });
    expect(lecturaDePagina("x")).toEqual({ estado: "no_disponible" });
    expect(lecturaDePagina([])).toEqual({ estado: "no_disponible" });
  });

  it("sin algo que ella tiene que leer antes de aceptar, no se le pide aceptar: «no disponible»", () => {
    const sin = (cambio: Record<string, unknown>) => lecturaDePagina({ ...JSON_PAGINA, ...cambio }).estado;
    expect(sin({ pct: null })).toBe("no_disponible");
    expect(sin({ pct: 0 })).toBe("no_disponible");
    expect(sin({ escala: [] })).toBe("no_disponible");
    expect(sin({ escala: [{ anio: 1, monto: 0 }] })).toBe("no_disponible");
    expect(sin({ compras: 0 })).toBe("no_disponible");
    expect(sin({ tienda: "  " })).toBe("no_disponible");
    for (const falta of ["terminos", "privacidad", "casilla_publicidad"]) {
      const textos = { ...JSON_PAGINA.textos, [falta]: { version: 1, texto: "" } };
      expect(lecturaDePagina({ ...JSON_PAGINA, textos }).estado, falta).toBe("no_disponible");
    }
  });

  it("sin saludo o sin WhatsApp la página sigue: solo cambia el final", () => {
    const l = lecturaDePagina({ ...JSON_PAGINA, whatsapp: "12345", textos: { ...JSON_PAGINA.textos, saludo: null } });
    expect(l.estado).toBe("lista");
    if (l.estado === "lista") {
      expect(l.pagina.whatsapp).toBeNull();
      expect(l.pagina.textos.saludo).toBeNull();
    }
  });

  it("los números llegan como texto desde un jsonb con numeric: se leen igual", () => {
    const l = lecturaDePagina({ ...JSON_PAGINA, pct: "12.5", monto_minimo: "600.00", escala: [{ anio: "1", monto: "20.00" }] });
    expect(l.estado === "lista" && l.pagina.pct).toBe(12.5);
    expect(l.estado === "lista" && l.pagina.escala).toEqual([{ anio: 1, monto: 20 }]);
  });

  it("el segmento de la dirección solo se consulta si es un uuid", () => {
    expect(esUuid(TIENDA)).toBe(true);
    expect(esUuid(TIENDA.toUpperCase())).toBe(true);
    expect(esUuid("Ab3_x-9QwErTyUiO")).toBe(false);
    expect(esUuid(`${TIENDA}' or 1=1`)).toBe(false);
  });
});

describe("cifras y marcadores", () => {
  it("soles y porcentaje como se leen en la tienda", () => {
    expect(formatoSoles(20)).toBe("S/ 20");
    expect(formatoSoles(25.5)).toBe("S/ 25.50");
    expect(formatoPct(10)).toBe("10");
    expect(formatoPct(12.5)).toBe("12.5");
  });

  it("{escala}: «S/ 20 el primer año, S/ 30 el segundo…», en orden y con «y» al final", () => {
    expect(escalaEnPalabras(pagina().escala)).toBe("S/ 20 el primer año, S/ 30 el segundo, S/ 40 el tercero, S/ 50 el cuarto y S/ 60 el quinto");
    expect(escalaEnPalabras([{ anio: 1, monto: 20 }])).toBe("S/ 20 el primer año");
    expect(escalaEnPalabras([{ anio: 2, monto: 30 }, { anio: 1, monto: 20 }])).toBe("S/ 20 el primer año y S/ 30 el segundo");
    expect(escalaEnPalabras([])).toBe("");
  });

  it("completa los marcadores conocidos, {código} con tilde también, y deja a la vista uno que no llegó", () => {
    expect(completarMarcadores("{pct} % · {escala} · {tienda}", marcadoresDePagina(pagina()))).toBe(
      "10 % · S/ 20 el primer año, S/ 30 el segundo, S/ 40 el tercero, S/ 50 el cuarto y S/ 60 el quinto · Tienda TRU",
    );
    expect(completarMarcadores("({código}) ({codigo})", { codigo: "C-0142" })).toBe("(C-0142) (C-0142)");
    expect(completarMarcadores("Hola {nombre}", {})).toBe("Hola {nombre}");
  });

  it("la política y los términos salen con sus marcadores completos y su versión", () => {
    const t = textoLegal(pagina(), "terminos");
    expect(t.version).toBe(1);
    expect(t.texto).toContain("10 % de descuento");
    expect(t.texto).toContain("S/ 60 el quinto");
    expect(t.texto).not.toMatch(/\{(pct|escala)\}/);
  });

  it("fechas largas en hora de Lima: una fecha suelta o un instante (de noche en Lima ya es mañana en UTC)", () => {
    expect(fechaLarga("2026-09-12")).toBe("12 de setiembre de 2026");
    expect(fechaLarga("2026-10-02T03:30:00Z")).toBe("1 de octubre de 2026");
    expect(fechaLarga(null)).toBeNull();
    expect(fechaLarga("no es fecha")).toBeNull();
  });
});

describe("los textos aprobados de la página (docs/club/texto-legal-registro-v2.md)", () => {
  it("la casilla de los términos, breve, y la letra chica con los datos de CAYLA S.A.C. (sin «Brasil»: eso va en la Política)", () => {
    const casilla = casillaTerminos()
      .map((t) => (typeof t === "string" ? t : t.texto))
      .join("");
    expect(casilla).toBe(
      "Acepto la Política de privacidad y los Términos del Club CAYLA.",
    );
    expect(letraChica({ razonSocial: "CAYLA S.A.C.", ruc: "20605964550", email: "caylaperu@gmail.com" })).toBe(
      "CAYLA S.A.C. (RUC 20605964550) es la responsable de tus datos. Puedes acceder a ellos, corregirlos, pedir que los borremos u oponerte a su uso en cualquier tienda CAYLA o en caylaperu@gmail.com.",
    );
  });

  it("los enlaces a la política y los términos llevan la tienda de donde viene, si es una", () => {
    expect(enlaceLegal("privacidad", TIENDA)).toBe(`/club/privacidad?t=${TIENDA}`);
    expect(enlaceLegal("terminos", null)).toBe("/club/terminos");
    expect(enlaceLegal("terminos", "x")).toBe("/club/terminos");
  });
});

describe("el nombre del padrón en las cajas Nombres y Apellidos (Apartados, ADR-0367)", () => {
  it("SUNAT público trae los apellidos primero", () => {
    expect(nombresYApellidos("PEREZ SALAS LUCIA MARIA", "apellidos_primero")).toEqual({ nombres: "Lucia Maria", apellidos: "Perez Salas" });
    expect(nombresYApellidos("DE LA CRUZ PEREZ ÑUSTA", "apellidos_primero")).toEqual({ nombres: "Ñusta", apellidos: "de la Cruz Perez" });
  });
  it("el proveedor de pago trae los nombres primero", () => {
    expect(nombresYApellidos("MARIA DEL CARMEN PEREZ SALAS", "nombres_primero")).toEqual({ nombres: "Maria del Carmen", apellidos: "Perez Salas" });
  });
  it("con coma manda la coma; sin nombre, null", () => {
    expect(nombresYApellidos("PÉREZ SALAS, LUCÍA", "nombres_primero")).toEqual({ nombres: "Lucía", apellidos: "Pérez Salas" });
    expect(nombresYApellidos("   ", "apellidos_primero")).toBeNull();
    expect(nombresYApellidos(null, "apellidos_primero")).toBeNull();
  });
});

describe("su nombre a medias: confirma que tipeó bien sin revelar el nombre completo de nadie", () => {
  it("con los nombres primero (el proveedor arma «nombres paterno materno»)", () => {
    expect(nombreAMedias("LUCIA PEREZ SALAS", "nombres_primero")).toBe("Lucia P. S.");
    expect(nombreAMedias("MARIA DEL CARMEN PEREZ SALAS", "nombres_primero")).toBe("Maria P. S.");
    expect(nombreAMedias("ANA TORRES", "nombres_primero")).toBe("Ana T.");
  });

  it("con los apellidos primero (SUNAT público: «apellidos y nombres»)", () => {
    expect(nombreAMedias("TORRES RUIZ ANA", "apellidos_primero")).toBe("Ana T. R.");
    expect(nombreAMedias("  torres ruiz ana maría  ", "apellidos_primero")).toBe("Ana T. R.");
    expect(nombreAMedias("DE LA CRUZ PEREZ ÑUSTA", "apellidos_primero")).toBe("Ñusta C. P.");
  });

  it("con coma se sabe qué es qué, sea cual sea la fuente", () => {
    expect(nombreAMedias("PÉREZ SALAS, LUCÍA", "nombres_primero")).toBe("Lucía P. S.");
  });

  it("nunca devuelve el nombre completo ni un apellido entero junto a su nombre", () => {
    for (const [nombre, orden] of [
      ["LUCIA PEREZ SALAS", "nombres_primero"],
      ["TORRES RUIZ ANA", "apellidos_primero"],
      ["MARIA DEL CARMEN PEREZ SALAS", "nombres_primero"],
    ] as const) {
      const corto = nombreAMedias(nombre, orden)!;
      expect(corto.split(" ").filter((p) => !p.endsWith(".")).length, nombre).toBe(1);
    }
    expect(nombreAMedias("", "nombres_primero")).toBeNull();
    expect(nombreAMedias(null, "apellidos_primero")).toBeNull();
  });
});

describe("lo que ella escribe: UNA regla para la pantalla, su guía y el servidor", () => {
  it("todo bien: nada que decir", () => {
    expect(problemasRegistro(BIEN, HOY)).toEqual({});
  });

  it("el documento: vacío, mal escrito, y con DNI, sin confirmar su nombre", () => {
    expect(problemasRegistro({ ...BIEN, documentoNumero: "" }, HOY).documento).toBe("Escribe tu DNI.");
    expect(problemasRegistro({ ...BIEN, documentoNumero: "4602" }, HOY).documento).toBe("El DNI tiene 8 dígitos.");
    expect(problemasRegistro({ ...BIEN, dniConfirmado: false }, HOY).documento).toMatch(/Confirma/);
    const pasaporte = { ...BIEN, documentoTipo: "pasaporte" as const, documentoNumero: "AB123456", dniConfirmado: false, nombre: "Ana Torres" };
    expect(problemasRegistro(pasaporte, HOY)).toEqual({});
    expect(problemasRegistro({ ...pasaporte, documentoNumero: "" }, HOY).documento).toBe("Escribe el número de tu documento.");
    expect(problemasRegistro({ ...pasaporte, nombre: " A " }, HOY).nombre).toBe("Escribe tus nombres y apellidos.");
  });

  it("el celular: obligatorio, 9 dígitos que empiezan en 9; pegado con +51 y espacios sirve", () => {
    expect(problemasRegistro({ ...BIEN, celular: "" }, HOY).celular).toBe("Escribe tu celular con WhatsApp.");
    expect(problemasRegistro({ ...BIEN, celular: "887654321" }, HOY).celular).toMatch(/9 dígitos/);
    expect(problemasRegistro({ ...BIEN, celular: "987 654 321" }, HOY).celular).toBeUndefined();
  });

  it("la fecha de nacimiento: completa, que exista, con un año creíble y con 18 años cumplidos a la fecha de Lima", () => {
    const con = (dia: string, mes: string, anio: string) => problemasRegistro({ ...BIEN, nacimiento: { dia, mes, anio } }, HOY).nacimiento;
    expect(con("12", "9", "")).toBe("Completa el día, el mes y el año.");
    expect(con("31", "4", "1990")).toMatch(/no existe/);
    expect(con("29", "2", "2001")).toMatch(/no existe/);
    expect(con("29", "2", "2000")).toBeUndefined();
    expect(con("1", "1", "1900")).toMatch(/año/);
    expect(con("1", "1", "2030")).toMatch(/año/);
    expect(con("2", "10", "2008")).toBe(MENSAJE.menor);
    expect(con("1", "10", "2008")).toBeUndefined();
    expect(edadCumplida("2008-10-01", HOY)).toBe(18);
    expect(edadCumplida("2008-10-02", HOY)).toBe(17);
  });

  it("el correo es opcional; si lo escribe, bien escrito", () => {
    expect(problemasRegistro({ ...BIEN, correo: "  " }, HOY).correo).toBeUndefined();
    expect(problemasRegistro({ ...BIEN, correo: "ana@" }, HOY).correo).toMatch(/correo/);
    expect(problemasRegistro({ ...BIEN, correo: "ana@correo.pe" }, HOY).correo).toBeUndefined();
  });

  it("las dos casillas obligatorias; la de WhatsApp nunca bloquea (G-12)", () => {
    expect(problemasRegistro({ ...BIEN, mayorDeEdad: false }, HOY).mayor).toBeDefined();
    expect(problemasRegistro({ ...BIEN, aceptaTerminos: false }, HOY).terminos).toBeDefined();
    expect(problemasRegistro({ ...BIEN, aceptaPublicidad: false }, HOY)).toEqual({});
    expect(problemasRegistro({ ...BIEN, aceptaPublicidad: true }, HOY)).toEqual({});
  });

  it("la fecha de las tres cajas viaja como aaaa-mm-dd", () => {
    expect(nacimientoIso({ dia: "5", mes: "3", anio: "1991" })).toBe("1991-03-05");
    expect(nacimientoIso({ dia: "5", mes: "", anio: "1991" })).toBeNull();
  });
});

describe("lo que llega a la acción pública no se cree", () => {
  const datos: DatosRegistro = { ...BIEN, ubicacionId: TIENDA, versiones: { terminos: 1, privacidad: 2, casillaPublicidad: 1 } };

  it("con la forma esperada, pasa tal cual", () => {
    expect(leerDatosRegistro(JSON.parse(JSON.stringify(datos)))).toEqual(datos);
  });

  it("cualquier campo con otra forma, desmedido o una tienda que no es un uuid: nada", () => {
    for (const cambio of [
      { ubicacionId: "x" },
      { documentoTipo: "ruc" },
      { celular: 987654321 },
      { mayorDeEdad: "true" },
      { nombre: "x".repeat(201) },
      { nacimiento: { dia: "1", mes: "1" } },
      { versiones: { terminos: 1, privacidad: 0, casillaPublicidad: 1 } },
      { versiones: { terminos: 1.5, privacidad: 1, casillaPublicidad: 1 } },
    ]) {
      expect(leerDatosRegistro({ ...datos, ...cambio }), JSON.stringify(cambio)).toBeNull();
    }
    expect(leerDatosRegistro(null)).toBeNull();
    expect(leerDatosRegistro("hola")).toBeNull();
  });

  it("los argumentos de registrarse_en_el_club: con DNI, el nombre que el SERVIDOR leyó del padrón", () => {
    const a = argumentosRegistro({ ...datos, nombre: "Lo que diga el navegador", celular: "987 654 321", correo: " ana@correo.pe " }, "PEREZ SALAS LUCIA");
    expect(a).toEqual({
      p_ubicacion_id: TIENDA,
      p_documento_tipo: "dni",
      p_documento_numero: "46027897",
      p_nombre: "PEREZ SALAS LUCIA",
      p_telefono: "987654321",
      p_nacimiento: "1990-09-12",
      p_correo: "ana@correo.pe",
      p_mayor_de_edad: true,
      p_acepta_terminos: true,
      p_acepta_publicidad: false,
      p_versiones: { terminos: 1, privacidad: 2, casilla_publicidad: 1 },
      p_nombre_del_padron: true,
    });
  });

  it("con carné o pasaporte, el nombre que ella escribió; un correo vacío viaja como null (no borra el que tenía)", () => {
    const a = argumentosRegistro({ ...datos, documentoTipo: "carne_extranjeria", documentoNumero: "ab 1234 56", nombre: "  Ana   Torres ", correo: "" }, null);
    expect(a).toMatchObject({ p_documento_numero: "AB123456", p_nombre: "Ana Torres", p_correo: null, p_nombre_del_padron: false });
  });

  it("las versiones que viajan son las que ella vio en pantalla", () => {
    expect(versionesDe(pagina())).toEqual({ terminos: 1, privacidad: 2, casillaPublicidad: 1 });
  });

  it("la ip de quien llama es la primera de x-forwarded-for", () => {
    expect(ipDeLaPeticion("190.1.2.3, 10.0.0.1", "10.0.0.9")).toBe("190.1.2.3");
    expect(ipDeLaPeticion(null, " 190.1.2.3 ")).toBe("190.1.2.3");
    expect(ipDeLaPeticion("", null)).toBe("desconocida");
  });
});

describe("lo que contesta el servidor, sin revelar datos de nadie", () => {
  it("los mensajes de la consulta del padrón son los del borrador aprobado", () => {
    expect(mensajeDeConsulta({ estado: "no_encontrado" })).toBe(
      "No encontramos ese DNI. Revisa el número; si es correcto, acércate a caja y te ayudamos.",
    );
    expect(mensajeDeConsulta({ estado: "limite" })).toBe("Hiciste varios intentos seguidos. Vuelve a intentarlo en una hora o acércate a caja.");
    expect(mensajeDeConsulta({ estado: "sin_padron" })).toBe(MENSAJE.sinPadron);
    expect(mensajeDeConsulta({ estado: "invalido" })).toMatch(/8 dígitos/);
  });

  it("los hints de la base: menor, documento archivado, datos inválidos, texto que cambió; lo demás, «no pudimos»", () => {
    expect(errorDeLaBase("club_texto_cambio")).toBe("texto_cambio");
    expect(errorDeLaBase("club_menor")).toEqual({ mensaje: "El Club CAYLA es para mayores de 18 años.", campo: "nacimiento" });
    expect(errorDeLaBase("club_documento_archivado")).toEqual({ mensaje: MENSAJE.archivado, campo: "documento" });
    expect(errorDeLaBase("club_datos_invalidos")).toEqual({ mensaje: MENSAJE.datos, campo: null });
    expect(errorDeLaBase("celular_invalido")).toMatchObject({ campo: "celular" });
    expect(errorDeLaBase(undefined)).toEqual({ mensaje: MENSAJE.noDisponible, campo: null });
    expect(errorDeLaBase("23505")).toEqual({ mensaje: MENSAJE.noDisponible, campo: null });
  });

  it("la fila de la base: sin su código no se dice «listo»; el código, en mayúsculas", () => {
    expect(respuestaDeRegistro({ codigo_club: "c-0142", club_desde: "2026-09-12T15:00:00Z", era_socia: true, nombre_corto: "Lucía" }, true)).toEqual({
      estado: "listo",
      nombre: "Lucía",
      codigo: "C-0142",
      clubDesde: "2026-09-12T15:00:00Z",
      eraSocia: true,
      conPublicidad: true,
    });
    expect(respuestaDeRegistro({ codigo_club: null }, false)).toBeNull();
    expect(respuestaDeRegistro(null, false)).toBeNull();
  });
});

describe("después de «Unirme»", () => {
  const listo = { estado: "listo" as const, nombre: "Lucía", codigo: "C-0142", clubDesde: "2026-09-12T15:00:00Z", eraSocia: false, conPublicidad: true };

  it("nuevo: bienvenida (sin género) con su nombre y su código; con WhatsApp, el saludo a la tienda con su nombre y su código", () => {
    const b = bienvenida(listo, pagina());
    expect(b.titulo).toBe("¡Te damos la bienvenida, Lucía!");
    expect(b.bajada).toBe("Ya eres miembro del Club CAYLA.");
    expect(b.saludo?.titulo).toBe("Último paso: salúdanos por WhatsApp");
    // A la tienda del cartel: la que le contesta y le escribe después.
    expect(b.saludo?.boton).toBe("Saludar a Tienda TRU");
    expect(b.saludo?.enlace.startsWith("https://wa.me/51953585537?text=")).toBe(true);
    expect(decodeURIComponent(b.saludo!.enlace.split("text=")[1]!)).toBe("Hola CAYLA, soy Lucía. Me acabo de unir al Club CAYLA (C-0142).");
  });

  it("sin la casilla de WhatsApp, la página termina en su código (G-12)", () => {
    expect(bienvenida({ ...listo, conPublicidad: false }, pagina()).saludo).toBeNull();
  });

  it("sin número de la tienda no hay a quién saludar; sin texto de saludo, el chat se abre sin mensaje", () => {
    expect(bienvenida(listo, { ...pagina(), whatsapp: null }).saludo).toBeNull();
    const sinSaludo = bienvenida(listo, { ...pagina(), textos: { ...pagina().textos, saludo: null } });
    expect(sinSaludo.saludo?.enlace).toBe("https://wa.me/51953585537?text=");
  });

  it("ya era miembro: «Actualizamos tus datos» y desde cuándo lo es", () => {
    const b = bienvenida({ ...listo, eraSocia: true }, pagina());
    expect(b.titulo).toBe("Actualizamos tus datos");
    expect(b.bajada).toBe("Eres miembro del Club CAYLA desde el 12 de setiembre de 2026.");
    expect(bienvenida({ ...listo, eraSocia: true, clubDesde: null }, pagina()).bajada).toBe("Ya eras miembro del Club CAYLA.");
  });

  it("sin su nombre corto, la bienvenida no dice «null» y el saludo no deja marcadores ni espacios dobles", () => {
    const b = bienvenida({ ...listo, nombre: null }, pagina());
    expect(b.titulo).toBe("¡Te damos la bienvenida!");
    const saludo = decodeURIComponent(b.saludo!.enlace.split("text=")[1]!);
    expect(saludo).not.toMatch(/\{|\}|null| {2}| \./);
    expect(saludo).toContain("(C-0142)");
  });
});

describe("la política y los términos se dibujan sin interpretar HTML", () => {
  it("negritas solo con **…**; uno sin pareja queda como texto", () => {
    expect(trozosDeLinea("Escribe **BAJA** al WhatsApp")).toEqual(["Escribe ", { fuerte: "BAJA" }, " al WhatsApp"]);
    expect(trozosDeLinea("a **b")).toEqual(["a ", "**b"]);
    expect(trozosDeLinea("<script>alert(1)</script>")).toEqual(["<script>alert(1)</script>"]);
  });

  it("títulos, párrafos de varias líneas, viñetas, numeradas con sub-lista y líneas que siguen a un punto", () => {
    const texto = [
      "## 2. Política de privacidad",
      "",
      "### 2.1 Quién",
      "",
      "CAYLA S.A.C., RUC 20605964550, con domicilio en",
      "Trujillo.",
      "",
      "- Lo que nos das.",
      "- Lo que se genera",
      "  cuando compras.",
      "",
      "1. **Quién puede ser socia:** mayores de 18.",
      "2. **Cupón:**",
      "   - 10 % de descuento.",
      "   - Una vez por año",
      "     calendario.",
      "",
      "---",
      "> Hola CAYLA",
    ].join("\n");
    expect(bloquesDeTexto(texto)).toEqual([
      { tipo: "titulo", nivel: 2, trozos: ["2. Política de privacidad"] },
      { tipo: "titulo", nivel: 3, trozos: ["2.1 Quién"] },
      { tipo: "parrafo", trozos: ["CAYLA S.A.C., RUC 20605964550, con domicilio en", " ", "Trujillo."] },
      {
        tipo: "lista",
        ordenada: false,
        items: [
          { trozos: ["Lo que nos das."], sub: [] },
          { trozos: ["Lo que se genera", " ", "cuando compras."], sub: [] },
        ],
      },
      {
        tipo: "lista",
        ordenada: true,
        items: [
          { trozos: [{ fuerte: "Quién puede ser socia:" }, " mayores de 18."], sub: [] },
          { trozos: [{ fuerte: "Cupón:" }], sub: [["10 % de descuento."], ["Una vez por año", " ", "calendario."]] },
        ],
      },
      { tipo: "parrafo", trozos: ["Hola CAYLA"] },
    ]);
  });

  it("el cuerpo de la página salta el título y la línea de versión que ya pone la página", () => {
    const cuerpo = cuerpoLegal("## 2. Política de privacidad\n\n**Versión 1 · vigente desde [PENDIENTE]**\n\n### 2.1 Quién\n\nCAYLA.");
    expect(cuerpo).toEqual([
      { tipo: "titulo", nivel: 3, trozos: ["2.1 Quién"] },
      { tipo: "parrafo", trozos: ["CAYLA."] },
    ]);
    // Sin ellos, no se salta nada.
    expect(cuerpoLegal("### 2.1 Quién\n\nCAYLA.")).toHaveLength(2);
  });
});
