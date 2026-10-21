import { describe, expect, it } from "vitest";
import {
  AVISO_DE_CORTE_ANULAR_ENVIO,
  AVISO_DE_CORTE_ENVIO,
  TOPES_ENVIO,
  argsCrearEnvio,
  camposDelEnvio,
  detalleDeEnvio,
  esEnviable,
  esEnvioConOtrosDatos,
  leerCantidad,
  leerResultadoEnvio,
  leerVersionDeEnvio,
  lineasDelEnvio,
  lineasParaBase,
  precargarCantidades,
  primerProblema,
  problemaDeCantidad,
  problemaDeGuia,
  problemaDeMotivoEnvio,
  problemaDeNota,
  problemaDeSede,
  resumenDeAvisosEnvio,
  sePuedeAnularEnvio,
  sugiereRecargar,
  tituloDeEnvio,
  unidadesDelEnvio,
  vaciarCantidades,
  type BorradorEnvio,
  type ContextoEnvio,
  type LineaParaEnviar,
} from "./envio-orden-reglas";

const TRU = "0b6f1c2e-0000-4000-8000-0000000000b1";
const LIM = "0b6f1c2e-0000-4000-8000-0000000000b2";
const ITEM_1 = "0b6f1c2e-0000-4000-8000-000000000011";
const ITEM_2 = "0b6f1c2e-0000-4000-8000-000000000022";
const ITEM_3 = "0b6f1c2e-0000-4000-8000-000000000033";
const TOKEN = "0b6f1c2e-0000-4000-8000-0000000000ff";

// Tres líneas: a la 1 le quedan 10 por enviar, a la 2 le quedan 4 y la 3 ya salió toda.
const LINEAS: LineaParaEnviar[] = [
  { id: ITEM_1, posicion: 1, porEnviar: 10 },
  { id: ITEM_2, posicion: 2, porEnviar: 4 },
  { id: ITEM_3, posicion: 3, porEnviar: 0 },
];
const SEDES = new Set([TRU, LIM]);
const DIRECTO: ContextoEnvio = { lineas: LINEAS, sedes: SEDES, sedeFija: TRU };
const REPARTIR: ContextoEnvio = { lineas: LINEAS, sedes: SEDES, sedeFija: null };
const SIN_RESPONSABLE = { pide: false, listo: true, motivo: null };

const borrador = (over: Partial<BorradorEnvio> = {}): BorradorEnvio => ({
  sedeId: "",
  cantidades: precargarCantidades({ lineas: LINEAS }),
  guia: "",
  nota: "",
  ...over,
});

describe("lo que ya viene puesto", () => {
  it("cada línea con algo por enviar arranca con TODO lo que le queda; la que ya salió toda no lleva caja", () => {
    expect(precargarCantidades({ lineas: LINEAS })).toEqual({ [ITEM_1]: "10", [ITEM_2]: "4" });
  });
  it("una línea sin id (la base no la nombra) o sin dato de lo que queda no se puede enviar", () => {
    const raras: LineaParaEnviar[] = [{ id: null, posicion: 1, porEnviar: 5 }, { id: ITEM_1, posicion: 2, porEnviar: null }];
    expect(raras.map(esEnviable)).toEqual([false, false]);
    expect(precargarCantidades({ lineas: raras })).toEqual({});
  });
  it("«Dejar todas en 0» pone cero en las que se pueden enviar", () => {
    expect(vaciarCantidades({ lineas: LINEAS })).toEqual({ [ITEM_1]: "0", [ITEM_2]: "0" });
  });
});

describe("leerCantidad: un entero de 0 a lo que le queda por enviar", () => {
  it("vacío es cero: la línea no va en esta guía", () => {
    expect(leerCantidad("", 10)).toEqual({ cantidad: 0, problema: null });
    expect(leerCantidad("   ", 10)).toEqual({ cantidad: 0, problema: null });
    expect(leerCantidad("0", 10)).toEqual({ cantidad: 0, problema: null });
  });
  it("acepta de 1 hasta todo lo que queda, con o sin espacios", () => {
    expect(leerCantidad("4", 10)).toEqual({ cantidad: 4, problema: null });
    expect(leerCantidad(" 10 ", 10)).toEqual({ cantidad: 10, problema: null });
    expect(leerCantidad("12.0", 12)).toEqual({ cantidad: 12, problema: null });
  });
  it("más de lo que queda se dice con el tope; nada de lo mal escrito cuenta", () => {
    expect(leerCantidad("11", 10)).toEqual({ cantidad: 0, problema: "Solo quedan 10 por enviar." });
    expect(leerCantidad("2", 1)).toEqual({ cantidad: 0, problema: "Solo queda 1 por enviar." });
  });
  it("decimales, negativos y letras piden un entero", () => {
    for (const mal of ["2,5", "3.5", "-1", "tres", "1e3"]) {
      const r = leerCantidad(mal, 10);
      expect(r.cantidad, mal).toBe(0);
      expect(r.problema, mal).toBe("Escribe cuántas van, de 0 a 10, sin decimales.");
    }
  });
  it("«1.000» no se adivina: puede ser mil (misma costumbre que la orden); «1.500» se pide sin punto", () => {
    expect(leerCantidad("1.000", 2000)).toEqual({ cantidad: 0, problema: "¿«1.000» son 1000? Escribe la cantidad sin punto: 1000." });
    expect(leerCantidad("1.500", 2000)).toEqual({ cantidad: 0, problema: "Escribe cuántas van, de 0 a 2000, sin decimales." });
    expect(leerCantidad("1500", 2000)).toEqual({ cantidad: 1500, problema: null });
  });
  it("problemaDeCantidad es lo mismo dicho sin la cantidad", () => {
    expect(problemaDeCantidad("11", 10)).toBe("Solo quedan 10 por enviar.");
    expect(problemaDeCantidad("5", 10)).toBeNull();
  });
});

describe("cuánto lleva la guía", () => {
  it("suma las cantidades bien escritas de las líneas con algo por enviar (la que ya salió no cuenta, aunque traiga texto)", () => {
    expect(unidadesDelEnvio(LINEAS, { [ITEM_1]: "10", [ITEM_2]: "4", [ITEM_3]: "9" })).toBe(14);
    expect(unidadesDelEnvio(LINEAS, { [ITEM_1]: "3", [ITEM_2]: "" })).toBe(3);
  });
  it("lo mal escrito o lo que pasa de lo que queda cuenta cero", () => {
    expect(unidadesDelEnvio(LINEAS, { [ITEM_1]: "99", [ITEM_2]: "dos" })).toBe(0);
  });
  it("lineasDelEnvio cuenta las líneas con cantidad mayor a cero", () => {
    expect(lineasDelEnvio(LINEAS, { [ITEM_1]: "3", [ITEM_2]: "0" })).toBe(1);
    expect(lineasDelEnvio(LINEAS, { [ITEM_1]: "3", [ITEM_2]: "1" })).toBe(2);
    expect(lineasDelEnvio(LINEAS, {})).toBe(0);
  });
});

describe("sede, número de guía y nota", () => {
  it("una orden «directo» va a su tienda: no se elige y no se juzga", () => {
    expect(problemaDeSede("", DIRECTO)).toBeNull();
    expect(problemaDeSede("cualquiera", DIRECTO)).toBeNull();
  });
  it("una «Por repartir» elige entre las activas", () => {
    expect(problemaDeSede("", REPARTIR)).toBe("Elige a qué sede la mandas.");
    expect(problemaDeSede("otra-sede", REPARTIR)).toBe("Esa sede no está disponible. Elige otra.");
    expect(problemaDeSede(LIM, REPARTIR)).toBeNull();
  });
  it("la guía va hasta 40 letras y la nota hasta 500 (los topes de la función); espacios de más no cuentan", () => {
    expect(problemaDeGuia("a".repeat(40))).toBeNull();
    expect(problemaDeGuia(`  ${"a".repeat(40)}  `)).toBeNull();
    expect(problemaDeGuia("a".repeat(41))).toBe("El número de guía va hasta 40 letras.");
    expect(problemaDeNota("a".repeat(500))).toBeNull();
    expect(problemaDeNota("a".repeat(501))).toBe("La nota va hasta 500 letras.");
    expect(TOPES_ENVIO).toEqual({ guia: 40, nota: 500, motivo: 300 });
  });
});

describe("camposDelEnvio: la guía de foco sale de lo que la función rechazaría", () => {
  const pendientes = (cs: ReturnType<typeof camposDelEnvio>) => cs.filter((c) => c.requerido && !c.hecho).map((c) => c.id);

  it("una orden «directo» con todo puesto viene lista: nada pendiente, sin campo de sede", () => {
    const cs = camposDelEnvio(borrador(), DIRECTO, SIN_RESPONSABLE);
    expect(pendientes(cs)).toEqual([]);
    expect(cs.map((c) => c.id)).toEqual(["guia", "nota", `linea-${ITEM_1}`, `linea-${ITEM_2}`, "lineas"]);
  });
  it("una «Por repartir» empieza por la sede, que va primero en la pantalla", () => {
    const cs = camposDelEnvio(borrador(), REPARTIR, SIN_RESPONSABLE);
    expect(cs[0]).toMatchObject({ id: "sede", requerido: true, hecho: false, pendiente: "Elige a qué sede la mandas." });
    expect(pendientes(cs)).toEqual(["sede"]);
    expect(pendientes(camposDelEnvio(borrador({ sedeId: TRU }), REPARTIR, SIN_RESPONSABLE))).toEqual([]);
  });
  it("la guía y la nota son opcionales: solo bloquean si se pasan del tope", () => {
    const cs = camposDelEnvio(borrador({ guia: "001-123", nota: "Va en caja" }), DIRECTO, SIN_RESPONSABLE);
    expect(cs.find((c) => c.id === "guia")).toMatchObject({ requerido: false, hecho: true });
    expect(cs.find((c) => c.id === "nota")).toMatchObject({ requerido: false, hecho: true });
    const largas = camposDelEnvio(borrador({ guia: "a".repeat(41), nota: "a".repeat(501) }), DIRECTO, SIN_RESPONSABLE);
    expect(largas.find((c) => c.id === "guia")).toMatchObject({ requerido: true, hecho: false });
    expect(largas.find((c) => c.id === "nota")).toMatchObject({ requerido: true, hecho: false });
  });
  it("una cantidad que pasa de lo que queda bloquea esa línea y dice cuánto queda", () => {
    const cs = camposDelEnvio(borrador({ cantidades: { [ITEM_1]: "11", [ITEM_2]: "4" } }), DIRECTO, SIN_RESPONSABLE);
    expect(cs.find((c) => c.id === `linea-${ITEM_1}`)).toMatchObject({ nombre: "Línea 1", requerido: true, hecho: false, pendiente: "Solo quedan 10 por enviar." });
    expect(cs.find((c) => c.id === `linea-${ITEM_2}`)?.hecho).toBe(true);
  });
  it("todas en cero: una guía no sale vacía", () => {
    const cs = camposDelEnvio(borrador({ cantidades: vaciarCantidades({ lineas: LINEAS }) }), DIRECTO, SIN_RESPONSABLE);
    expect(pendientes(cs)).toEqual(["lineas"]);
    expect(cs.find((c) => c.id === "lineas")?.pendiente).toBe("Pon cantidad en al menos una prenda: una guía no sale vacía.");
  });
  it("desde una terminal también falta saber quién envía", () => {
    const cs = camposDelEnvio(borrador(), DIRECTO, { pide: true, listo: false, motivo: null });
    expect(cs[cs.length - 1]).toMatchObject({ id: "responsable", requerido: true, hecho: false, pendiente: "Elige quién envía." });
    expect(camposDelEnvio(borrador(), DIRECTO, { pide: true, listo: true, motivo: null }).at(-1)?.hecho).toBe(true);
  });
});

describe("primerProblema: la red de seguridad de «Enviar» dice lo mismo que la función rechazaría", () => {
  const casos: [string, BorradorEnvio, ContextoEnvio, string | null][] = [
    ["directo y completo", borrador(), DIRECTO, null],
    ["una parte de una línea", borrador({ cantidades: { [ITEM_1]: "3", [ITEM_2]: "0" } }), DIRECTO, null],
    ["por repartir sin sede", borrador(), REPARTIR, "Elige a qué sede la mandas."],
    ["por repartir con sede", borrador({ sedeId: LIM }), REPARTIR, null],
    ["una sede que no es de la lista", borrador({ sedeId: "x" }), REPARTIR, "Esa sede no está disponible. Elige otra."],
    ["más de lo que queda", borrador({ cantidades: { [ITEM_1]: "11", [ITEM_2]: "4" } }), DIRECTO, "Solo quedan 10 por enviar."],
    ["nada que enviar", borrador({ cantidades: {} }), DIRECTO, "Pon cantidad en al menos una prenda: una guía no sale vacía."],
    ["guía muy larga", borrador({ guia: "a".repeat(41) }), DIRECTO, "El número de guía va hasta 40 letras."],
    ["nota muy larga", borrador({ nota: "a".repeat(501) }), DIRECTO, "La nota va hasta 500 letras."],
  ];
  it.each(casos)("%s", (_nombre, b, ctx, esperado) => {
    expect(primerProblema(b, ctx)).toBe(esperado);
  });
});

describe("lo que viaja a la base", () => {
  it("p_lineas lleva solo las líneas con cantidad mayor a cero, en el orden de la orden", () => {
    expect(lineasParaBase(LINEAS, { [ITEM_2]: "4", [ITEM_1]: "3", [ITEM_3]: "7" })).toEqual([
      { orden_compra_item_id: ITEM_1, cantidad: 3 },
      { orden_compra_item_id: ITEM_2, cantidad: 4 },
    ]);
    expect(lineasParaBase(LINEAS, { [ITEM_1]: "0", [ITEM_2]: "" })).toEqual([]);
  });
  it("una orden «directo» manda su tienda; una «Por repartir», la que se eligió", () => {
    expect(argsCrearEnvio(borrador({ sedeId: LIM }), DIRECTO, TOKEN).p_ubicacion_destino_id).toBe(TRU);
    expect(argsCrearEnvio(borrador({ sedeId: LIM }), REPARTIR, TOKEN).p_ubicacion_destino_id).toBe(LIM);
  });
  it("la guía y la nota viajan solo si se escribieron, sin espacios ni caracteres de control; el token es el del envío", () => {
    expect(argsCrearEnvio(borrador(), DIRECTO, TOKEN)).toEqual({
      p_ubicacion_destino_id: TRU,
      p_lineas: [
        { orden_compra_item_id: ITEM_1, cantidad: 10 },
        { orden_compra_item_id: ITEM_2, cantidad: 4 },
      ],
      p_token: TOKEN,
    });
    const con = argsCrearEnvio(borrador({ guia: "  001-123  ", nota: "Va\u0000 en caja " }), DIRECTO, TOKEN);
    expect(con.p_numero_guia).toBe("001-123");
    expect(con.p_nota).toBe("Va en caja");
  });
});

describe("leerResultadoEnvio: lo que contesta crear_envio", () => {
  const RESPUESTA = { despacho_id: "d1", numero: "ENV-000012", sede: "Tienda Trujillo", unidades: 14, avisos: [] };
  it("lee el envío con su número, su sede y sus unidades", () => {
    expect(leerResultadoEnvio(RESPUESTA)).toEqual({ despachoId: "d1", numero: "ENV-000012", sede: "Tienda Trujillo", unidades: 14, avisos: [] });
    expect(leerResultadoEnvio([RESPUESTA])?.numero).toBe("ENV-000012");
  });
  it("si llega solo la cifra del número, lo escribe como «ENV-»; la sede puede venir como objeto", () => {
    expect(leerResultadoEnvio({ ...RESPUESTA, numero: 12, sede: { id: LIM, nombre: "Tienda Lima" } })).toMatchObject({ numero: "ENV-000012", sede: "Tienda Lima" });
    expect(leerResultadoEnvio({ ...RESPUESTA, numero: "12", unidades: "14" })).toMatchObject({ numero: "ENV-000012", unidades: 14 });
  });
  it("sin envío (sin id o sin número) no hay resultado", () => {
    expect(leerResultadoEnvio(null)).toBeNull();
    expect(leerResultadoEnvio("ok")).toBeNull();
    expect(leerResultadoEnvio({ ...RESPUESTA, despacho_id: "" })).toBeNull();
    expect(leerResultadoEnvio({ ...RESPUESTA, numero: null })).toBeNull();
    expect(leerResultadoEnvio({ ...RESPUESTA, sede: null, unidades: null })).toMatchObject({ sede: null, unidades: null });
  });
  it("los avisos «de más» como los manda la base; uno raro se descarta y no tumba la confirmación", () => {
    const aviso = { tipo: "de_mas", orden_compra_item_id: ITEM_1, orden: "OC-000129", posicion: 1, descripcion: "Polos · Kero", pedido: 10, enviado: "12" };
    const r = leerResultadoEnvio({ ...RESPUESTA, avisos: [aviso, { tipo: "otro" }, { ...aviso, pedido: null }, "texto", 7, null] });
    expect(r?.avisos).toEqual([{ tipo: "de_mas", orden: "OC-000129", posicion: 1, descripcion: "Polos · Kero", pedido: 10, enviado: 12 }]);
    expect(leerResultadoEnvio({ ...RESPUESTA, avisos: [{ ...aviso, descripcion: null, orden: null }] })?.avisos[0]).toMatchObject({ descripcion: "Una prenda", orden: null });
  });
  it("resumenDeAvisosEnvio dice cuánto pasa de lo pedido y que quedó registrado igual; nada sin avisos", () => {
    expect(resumenDeAvisosEnvio([])).toBeNull();
    const a = { tipo: "de_mas" as const, orden: "OC-000129", posicion: 1, descripcion: "Polos · Kero", pedido: 10, enviado: 12 };
    expect(resumenDeAvisosEnvio([a])).toEqual({
      titulo: "Este envío lleva más de lo que pediste",
      detalle: "Polos · Kero (OC-000129): pediste 10 y con este envío salen 12 (2 de más). Quedó registrado igual.",
    });
    const cuatro = resumenDeAvisosEnvio([a, a, a, a]);
    expect(cuatro?.detalle).toContain("y 1 más");
  });
  it("el aviso de éxito dice a dónde va; si la base no dice la sede, la que se eligió", () => {
    expect(tituloDeEnvio({ numero: "ENV-000012", sede: "Tienda Trujillo" }, "otra")).toBe("ENV-000012 en camino a Tienda Trujillo");
    expect(tituloDeEnvio({ numero: "ENV-000012", sede: null }, "Tienda Lima")).toBe("ENV-000012 en camino a Tienda Lima");
  });
  it("el detalle aclara que todavía no suma al stock", () => {
    expect(detalleDeEnvio("OC-000129", 14)).toBe("OC-000129 · 14 unidades. No suma al stock hasta que la sede lo reciba.");
    expect(detalleDeEnvio("OC-000129", 1)).toContain("1 unidad.");
  });
});

describe("cuando se corta la señal o la orden cambió", () => {
  it("nunca dice que no se guardó nada: dice que no se sabe, qué botón pulsar y que se reintente sin cambiar nada", () => {
    expect(AVISO_DE_CORTE_ENVIO).toContain("no sabemos si");
    expect(AVISO_DE_CORTE_ENVIO).toContain("«Enviar»");
    expect(AVISO_DE_CORTE_ENVIO).toContain("sin cambiar nada");
    expect(AVISO_DE_CORTE_ENVIO).not.toMatch(/no se guardó nada/i);
    expect(AVISO_DE_CORTE_ANULAR_ENVIO).toContain("no sabemos si");
    expect(AVISO_DE_CORTE_ANULAR_ENVIO).toContain("«Anular envío»");
    expect(AVISO_DE_CORTE_ANULAR_ENVIO).toContain("con el mismo motivo");
  });
  it("el mismo envío con otros datos, o lo que quedaba por enviar que cambió, ofrece recargar", () => {
    expect(esEnvioConOtrosDatos("Ese envío ya se guardó con otros datos")).toBe(true);
    expect(esEnvioConOtrosDatos("Ese envío ya se registró con otros datos")).toBe(true);
    expect(esEnvioConOtrosDatos("Elige quién hace esta operación")).toBe(false);
    expect(sugiereRecargar("Solo quedan 3 por enviar de esa línea")).toBe(true);
    expect(sugiereRecargar("Otra persona cambió este envío")).toBe(true);
    expect(sugiereRecargar("Elige quién hace esta operación")).toBe(false);
    expect(sugiereRecargar(null)).toBe(false);
  });
});

describe("anular un envío", () => {
  it("el motivo es obligatorio y va hasta 300 letras", () => {
    expect(problemaDeMotivoEnvio("")).toBe("Escribe por qué se anula el envío.");
    expect(problemaDeMotivoEnvio("   ")).toBe("Escribe por qué se anula el envío.");
    expect(problemaDeMotivoEnvio("Se mandó a la tienda equivocada")).toBeNull();
    expect(problemaDeMotivoEnvio("a".repeat(300))).toBeNull();
    expect(problemaDeMotivoEnvio("a".repeat(301))).toBe("El motivo va hasta 300 letras.");
  });
  it("solo se ofrece mientras el envío va en camino", () => {
    expect(sePuedeAnularEnvio({ estado: "en_camino" })).toBe(true);
    for (const estado of ["abierto", "cerrado", "anulado"] as const) expect(sePuedeAnularEnvio({ estado }), estado).toBe(false);
  });
  it("la versión del envío se lee suelta o dentro de su cabecera", () => {
    expect(leerVersionDeEnvio({ version: 3 })).toBe(3);
    expect(leerVersionDeEnvio({ cabecera: { version: "2" } })).toBe(2);
    expect(leerVersionDeEnvio([{ despacho: { version: 5 } }])).toBe(5);
    expect(leerVersionDeEnvio({ cabecera: {} })).toBeNull();
    expect(leerVersionDeEnvio(null)).toBeNull();
  });
});
