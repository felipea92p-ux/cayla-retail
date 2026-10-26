import { describe, expect, it } from "vitest";
import {
  PALABRA_FALTA,
  avanceDeSede,
  borradorDe,
  colorDeSede,
  borradorParametros,
  camposDeGuia,
  errorDeLargo,
  errorDeMapa,
  estadoSedeWeb,
  faltaParaMostrar,
  fraseNiveles,
  fusionarBorrador,
  idCampo,
  leerConfiguracionTiendaWeb,
  limpiarTexto,
  moverTienda,
  moverUnLugar,
  ordenarSedes,
  pendientesDe,
  validarParametrosTiendaWeb,
  type BorradorSede,
  type SedeWeb,
} from "./tienda-web-reglas";

const sede = (s: Partial<SedeWeb> = {}): SedeWeb => ({
  id: "u1",
  nombre: "Tienda TRU",
  nombreWeb: null,
  whatsapp: null,
  direccion: null,
  horario: null,
  mostrar: false,
  orden: null,
  mapaUrl: null,
  ...s,
});
const completa = { nombreWeb: "Trujillo", whatsapp: "987654321", direccion: "Jr. Pizarro 512" };

describe("leer lo que devuelve fn_configuracion_tienda_web", () => {
  it("convierte las claves de la base y deja null lo vacío", () => {
    const c = leerConfiguracionTiendaWeb({
      sedes: [{ id: "u1", nombre: "Tienda TRU", nombre_web: "Trujillo", whatsapp: "987654321", direccion: " ", horario: null, mostrar: true }],
      parametros: { horas_para_confirmar: 24, horas_aviso_sin_pagar: 48, dias_aviso_sin_recoger: 7, quedan_pocas_desde: 3 },
    });
    expect(c.sedes).toEqual([{ id: "u1", nombre: "Tienda TRU", nombreWeb: "Trujillo", whatsapp: "987654321", direccion: null, horario: null, mostrar: true, orden: null, mapaUrl: null }]);
    expect(c.parametros).toEqual({ horasParaConfirmar: 24, horasAvisoSinPagar: 48, diasAvisoSinRecoger: 7, quedanPocasDesde: 3 });
  });
  it("sin datos (o sin la migración) no se cae: sin tiendas y sin plazos", () => {
    expect(leerConfiguracionTiendaWeb(null)).toEqual({ sedes: [], parametros: null });
    expect(leerConfiguracionTiendaWeb({ sedes: "x" })).toEqual({ sedes: [], parametros: null });
  });
});

describe("qué le falta a una tienda para verse en la web (la misma regla que fn_sede_web_falta)", () => {
  // Los mismos casos que `scripts/pruebas/tienda_web_configuracion.mjs` le prueba a la base.
  it.each([
    [{ nombreWeb: "", whatsapp: "", direccion: "" }, ["nombre_web", "whatsapp", "direccion"]],
    [completa, []],
    [{ ...completa, nombreWeb: "   " }, ["nombre_web"]],
    [{ ...completa, whatsapp: "812345678" }, ["whatsapp"]],
    [{ ...completa, whatsapp: "98765432" }, ["whatsapp"]],
    [{ ...completa, direccion: "" }, ["direccion"]],
  ])("%j → %j", (b, esperado) => {
    expect(faltaParaMostrar(b)).toEqual(esperado);
  });
  it("el horario no cuenta: sin él también se puede mostrar", () => {
    expect(faltaParaMostrar({ ...completa })).toEqual([]);
  });
});

describe("la insignia de la tarjeta dice lo que el cliente ve hoy", () => {
  it("apagada: no se ve, esté completa o no", () => {
    expect(estadoSedeWeb({ mostrar: false, ...completa })).toEqual({ tono: "neutro", texto: "No se ve en la web" });
  });
  it("encendida y completa: se ve", () => {
    expect(estadoSedeWeb({ mostrar: true, ...completa })).toEqual({ tono: "verde", texto: "Se ve en la web" });
  });
  it("encendida sin WhatsApp (se lo quitaron en Tiendas y caja): avisa que no se ve y por qué", () => {
    expect(estadoSedeWeb({ mostrar: true, ...completa, whatsapp: "" })).toEqual({ tono: "ambar", texto: "No se ve: falta el WhatsApp" });
  });
});

describe("limpiar y medir como la base", () => {
  it("sin espacios de más; vacío es sin dato", () => {
    expect(limpiarTexto("  Jr.   Pizarro   512 ")).toBe("Jr. Pizarro 512");
    expect(limpiarTexto("   ")).toBeNull();
  });
  it("los topes de largo, con la frase de la base", () => {
    expect(errorDeLargo({ nombreWeb: "a".repeat(40), direccion: "a".repeat(160), horario: "a".repeat(120) })).toBeNull();
    expect(errorDeLargo({ nombreWeb: "a".repeat(41), direccion: "", horario: "" })).toBe("El nombre en la web va hasta 40 letras.");
    expect(errorDeLargo({ nombreWeb: "", direccion: "a".repeat(161), horario: "" })).toBe("La dirección va hasta 160 letras.");
    expect(errorDeLargo({ nombreWeb: "", direccion: "", horario: "a".repeat(121) })).toBe("El horario va hasta 120 letras.");
    // Los espacios de más no cuentan: la base los quita antes de medir.
    expect(errorDeLargo({ nombreWeb: `  ${"a".repeat(40)}  `, direccion: "", horario: "" })).toBeNull();
  });
});

describe("un refresco de la base no le borra a nadie lo que lleva escrito", () => {
  const base = borradorDe(sede({ nombreWeb: "Trujillo", direccion: "Jr. Pizarro 512" }));
  it("la caja que no se tocó toma el valor nuevo", () => {
    const nueva: BorradorSede = { ...base, horario: "Lunes a sábado" };
    expect(fusionarBorrador(base, base, nueva)).toEqual(nueva);
  });
  it("la caja que se está escribiendo conserva lo escrito", () => {
    const actual: BorradorSede = { ...base, direccion: "Jr. Pizarro 51" };
    const nueva: BorradorSede = { ...base, nombreWeb: "Trujillo Centro" };
    expect(fusionarBorrador(actual, base, nueva)).toEqual({ ...nueva, direccion: "Jr. Pizarro 51" });
  });
  it("lo recién guardado vuelve limpio de la base y se toma", () => {
    const actual: BorradorSede = { ...base, direccion: "  Jr.  Pizarro 600 " };
    const nueva: BorradorSede = { ...base, direccion: "Jr. Pizarro 600" };
    expect(fusionarBorrador(actual, base, nueva).direccion).toBe("Jr. Pizarro 600");
  });
});

describe("la guía de foco: qué le falta a cada tienda, y solo lo que llegó vacío", () => {
  const sedes = [
    sede({ id: "a", nombre: "Tienda TRU" }),
    sede({ id: "b", nombre: "Tienda LIM", ...completa, nombreWeb: "Lima", horario: "Todos los días", mostrar: true }),
  ];
  const pendientes = pendientesDe(sedes);
  it("solo llevan marca los datos vacíos al abrir: la tienda completa no se llena de marcas", () => {
    expect([...pendientes]).toEqual(["a:nombre_web", "a:whatsapp", "a:direccion", "a:horario"]);
  });
  it("nombre, WhatsApp y dirección son requeridos; el horario, sugerido; en el orden de la pantalla", () => {
    const campos = camposDeGuia(sedes.map((s) => ({ id: s.id, nombre: s.nombre, borrador: borradorDe(s) })), pendientes);
    expect(campos.map((c) => [c.id, c.requerido, Boolean(c.sugerido), c.hecho])).toEqual([
      ["a:nombre_web", true, false, false],
      ["a:whatsapp", true, false, false],
      ["a:direccion", true, false, false],
      ["a:horario", false, true, false],
    ]);
    expect(campos[0]!.nombre).toBe("Nombre en la web · TRU");
  });
  it("lo que se escribe se marca hecho con la misma regla que enciende la tienda (un WhatsApp de 8 dígitos no)", () => {
    const escrito = { ...borradorDe(sedes[0]!), nombreWeb: "Trujillo", whatsapp: "98765432" };
    const campos = camposDeGuia([{ id: "a", nombre: "Tienda TRU", borrador: escrito }], pendientes);
    expect(campos.find((c) => c.id === idCampo("a", "nombre_web"))!.hecho).toBe(true);
    expect(campos.find((c) => c.id === idCampo("a", "whatsapp"))!.hecho).toBe(false);
  });
});

describe("los plazos: los mismos rangos que la base", () => {
  const de = (h: string, p: string, d: string, q: string) => ({ horasParaConfirmar: h, horasAvisoSinPagar: p, diasAvisoSinRecoger: d, quedanPocasDesde: q });
  it("de fábrica pasan", () => {
    expect(validarParametrosTiendaWeb(borradorParametros({ horasParaConfirmar: 24, horasAvisoSinPagar: 48, diasAvisoSinRecoger: 7, quedanPocasDesde: 3 }))).toEqual({
      ok: true,
      valor: { horasParaConfirmar: 24, horasAvisoSinPagar: 48, diasAvisoSinRecoger: 7, quedanPocasDesde: 3 },
    });
  });
  it.each([
    [de("0", "48", "7", "3"), "Las horas para confirmar"],
    [de("-24", "48", "7", "3"), "Las horas para confirmar"],
    [de("169", "48", "7", "3"), "Las horas para confirmar"],
    [de("", "48", "7", "3"), "Las horas para confirmar"],
    [de("1.5", "48", "7", "3"), "Las horas para confirmar"],
    [de("24", "0", "7", "3"), "El aviso si no paga"],
    [de("24", "721", "7", "3"), "El aviso si no paga"],
    [de("24", "48", "0", "3"), "El aviso si no recoge"],
    [de("24", "48", "61", "3"), "El aviso si no recoge"],
    [de("24", "48", "7", "0"), "El número se muestra"],
    [de("24", "48", "7", "4"), "El número se muestra"],
  ])("%j se rechaza (%s…)", (b, frase) => {
    const r = validarParametrosTiendaWeb(b);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.startsWith(frase)).toBe(true);
  });
});

describe("la ayuda del umbral dice lo que el cliente vería (ADR-0408, DECIDÍ 6)", () => {
  it("con 3: el número de 3 para abajo, «Última» con 1, «Hay» con 4 o más", () => {
    expect(fraseNiveles(3)).toBe("Con 4 o más ve «Hay»; con 3, «3»; con 2, «2»; con 1, «Última».");
  });
  it("con 1: solo «Última»", () => {
    expect(fraseNiveles(1)).toBe("Con 2 o más ve «Hay»; con 1, «Última».");
  });
  it("fuera de rango, mientras se escribe, no promete nada", () => {
    expect(fraseNiveles(0)).toBe(fraseNiveles(9));
    expect(fraseNiveles(Number.NaN)).toContain("«Hay»");
  });
});

describe("la puerta de una tienda (maqueta de Conf. Tienda)", () => {
  it("el anillo cuenta los tres datos obligatorios", () => {
    expect(avanceDeSede({ nombreWeb: "", whatsapp: "", direccion: "" })).toEqual({ listos: 0, total: 3, pct: 0 });
    expect(avanceDeSede({ ...completa, whatsapp: "" })).toEqual({ listos: 2, total: 3, pct: 67 });
    expect(avanceDeSede(completa)).toEqual({ listos: 3, total: 3, pct: 100 });
  });
  it("lo que falta se dice con una palabra por dato, la misma regla que la base", () => {
    const falta = faltaParaMostrar({ nombreWeb: "", whatsapp: "12", direccion: "" });
    expect(falta.map((d) => PALABRA_FALTA[d])).toEqual(["Nombre", "WhatsApp", "Dónde"]);
  });
  it.each([
    ["Tienda TRU", "tru"],
    ["Tienda AQP", "aqp"],
    ["Tienda LIM", "lim"],
    ["Taller Lima", "lim"],
    ["Taller", "tal"],
    ["Tienda Cusco", "emp"],
  ])("%s lleva el toldo %s", (nombre, color) => {
    expect(colorDeSede(nombre)).toBe(color);
  });
});

describe("el orden de las tiendas (maqueta de Conf. Tienda)", () => {
  const ids = ["a", "b", "c"];
  it("arrastrar una tienda sobre otra la pone en su lugar", () => {
    expect(moverTienda(ids, "c", "a")).toEqual(["c", "a", "b"]);
    expect(moverTienda(ids, "a", "c")).toEqual(["b", "c", "a"]);
  });
  it("soltarla sobre sí misma o sobre algo que no existe no mueve nada (y no toca la lista de entrada)", () => {
    expect(moverTienda(ids, "b", "b")).toEqual(ids);
    expect(moverTienda(ids, "b", "zz")).toEqual(ids);
    expect(moverTienda(ids, "zz", "a")).toEqual(ids);
    expect(ids).toEqual(["a", "b", "c"]);
  });
  it("con el teclado se mueve de a un lugar y no se sale de la fila", () => {
    expect(moverUnLugar(ids, "b", -1)).toEqual(["b", "a", "c"]);
    expect(moverUnLugar(ids, "b", 1)).toEqual(["a", "c", "b"]);
    expect(moverUnLugar(ids, "a", -1)).toEqual(ids);
    expect(moverUnLugar(ids, "c", 1)).toEqual(ids);
  });
  it("las tiendas se acomodan al orden; la que no está en la lista va al final", () => {
    const s = [sede({ id: "a" }), sede({ id: "b" }), sede({ id: "c" }), sede({ id: "d" })];
    expect(ordenarSedes(s, ["c", "a"]).map((x) => x.id)).toEqual(["c", "a", "b", "d"]);
    expect(ordenarSedes(s, []).map((x) => x.id)).toEqual(["a", "b", "c", "d"]);
  });
  it("lo que lee de la base trae su lugar, o nada si no se ordenó", () => {
    const r = leerConfiguracionTiendaWeb({ sedes: [{ id: "a", nombre: "Tienda TRU", orden: 2 }, { id: "b", nombre: "Tienda AQP" }] });
    expect(r.sedes.map((x) => x.orden)).toEqual([2, null]);
  });
});

describe("el mapa de una tienda (maqueta de Conf. Tienda)", () => {
  it("sin mapa está bien; con mapa tiene que ser de Google Maps, con la misma frase que la base", () => {
    expect(errorDeMapa("")).toBeNull();
    expect(errorDeMapa("   ")).toBeNull();
    expect(errorDeMapa("https://maps.app.goo.gl/AbC123")).toBeNull();
    expect(errorDeMapa(" https://maps.app.goo.gl/AbC123 ")).toBeNull();
    expect(errorDeMapa("https://www.facebook.com/tienda")).toBe("El mapa tiene que ser un enlace de Google Maps (el de «Compartir» sirve).");
    expect(errorDeMapa("jr. pizarro 512")).toContain("enlace de Google Maps");
  });
  it("el borrador lleva el mapa guardado, o vacío, y un refresco no pisa lo que se está escribiendo", () => {
    expect(borradorDe(sede({ mapaUrl: "https://maps.app.goo.gl/AbC123" })).mapa).toBe("https://maps.app.goo.gl/AbC123");
    expect(borradorDe(sede()).mapa).toBe("");
    const base = borradorDe(sede());
    const escrito = { ...base, mapa: "https://maps.app.goo.gl/nuevo" };
    const nueva = borradorDe(sede({ mapaUrl: "https://maps.app.goo.gl/de-otro" }));
    expect(fusionarBorrador(escrito, base, nueva).mapa).toBe("https://maps.app.goo.gl/nuevo");
    expect(fusionarBorrador(base, base, nueva).mapa).toBe("https://maps.app.goo.gl/de-otro");
  });
});
