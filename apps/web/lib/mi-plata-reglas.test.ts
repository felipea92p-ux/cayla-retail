import { describe, expect, it } from "vitest";
import {
  camposAnotar,
  camposGasto,
  decisionesCierre,
  nombreGasto,
  resumenDia,
  resumenPrendas,
  estadoParaLaCompradora,
  textoCierre,
  textoPorMandar,
  fraseGasto,
  camposConfirmar,
  cuentaSugerida,
  detalleTienes,
  fraseAnotar,
  leerMiPlata,
  leerPlataPorConfirmar,
  mediosParaAnotar,
  textoMontoAnotado,
  textoPorConfirmar,
  repartoBilletera,
  textoFaltaMandar,
  movimientosDeLaCompradora,
  siglaTienda,
  detalleEnvio,
} from "./mi-plata-reglas";
import type { CuentaOpcion } from "./fondos-reglas";

// `soles()` une «S/» y la cifra con un espacio que no se parte (ADR-0413): las frases se comparan con espacios comunes.
const plano = (s: string | null) => s?.replace(/\u00a0/g, " ") ?? null;

const PERSONA = { esPersona: true, listo: true, motivo: null };
const TERMINAL_SIN_ELEGIR = { esPersona: false, listo: false, motivo: null };

describe("leerMiPlata: lo que tiene para comprar es su fondo más lo por confirmar", () => {
  it("suma los dos y lee lo anotado, lo más nuevo primero tal como viene", () => {
    const p = leerMiPlata({
      persona: true,
      saldo: "280.00",
      por_confirmar: 50,
      puede_ya_tenia: false,
      anotada: [
        { id: "b", medio: "efectivo", monto: 50, estado: "por_confirmar", fecha: "2026-10-22", creado_en: "x", con_foto: false },
        { id: "a", medio: "yape_plin", monto: 300, monto_confirmado: 280, estado: "confirmada", fecha: "2026-10-22", creado_en: "y", con_foto: true },
      ],
    });
    expect(p).toMatchObject({ persona: true, saldo: 280, porConfirmar: 50, tiene: 330, puedeYaTenia: false });
    expect(p?.anotada.map((a) => [a.id, a.confirmada, a.montoConfirmado, a.conFoto])).toEqual([
      ["b", false, null, false],
      ["a", true, 280, true],
    ]);
  });

  it("lo comprado con un papel por completar ya bajó de su plata; lee sus compras", () => {
    const p = leerMiPlata({
      persona: true, saldo: 300, por_confirmar: 200, compras_por_completar: 450, anotada: [],
      compras: [{ id: "c", proveedor: "Textiles Rosa", tipo: "boleta", monto: 450, estado: "por_completar", fecha: "2026-10-22", prendas: 16, tiendas: ["Tienda TRU"], por_mandar: ["Tienda TRU", 3] }, { id: "x" }],
    });
    expect(p).toMatchObject({ tiene: 50, comprasPorCompletar: 450 });
    expect(p?.compras).toEqual([{ id: "c", proveedor: "Textiles Rosa", tipo: "boleta", monto: 450, porCompletar: true, fecha: "2026-10-22", creadoEn: "", prendas: 16, tiendas: ["Tienda TRU"], porMandar: ["Tienda TRU"] }]);
  });

  it("un fondo en negativo (pagó de su bolsillo) resta: tiene lo que queda de verdad", () => {
    expect(leerMiPlata({ persona: true, saldo: -40, por_confirmar: 100, anotada: [] })?.tiene).toBe(60);
  });

  it("descarta lo ilegible sin caerse; sin persona (una terminal) no hay plata; sin datos, null", () => {
    expect(leerMiPlata({ persona: true, saldo: 0, por_confirmar: 0, anotada: [{ id: "x", medio: "cheque", monto: 1 }, null, 3] })?.anotada).toEqual([]);
    expect(leerMiPlata({ persona: false })).toMatchObject({ persona: false, tiene: 0 });
    expect(leerMiPlata(null)).toBeNull();
    expect(leerMiPlata("roto")).toBeNull();
  });
});

describe("leerPlataPorConfirmar", () => {
  it("lee cada fila; una foto fuera de la carpeta de vouchers no se firma", () => {
    const filas = leerPlataPorConfirmar([
      { id: "a", persona_id: "p", persona: "Marisol Quispe", medio: "yape_plin", monto: "300", fecha: "2026-10-22", creado_en: "t", foto_ruta: "plata/u-v.jpg", es_mia: false },
      { id: "b", persona_id: "p", persona: "", medio: "ya_tenia", monto: 150, foto_ruta: "otra/x.jpg", es_mia: true },
      { id: "c", persona_id: "p", medio: "cheque", monto: 1 },
    ]);
    expect(filas.map((f) => [f.id, f.persona, f.monto, f.fotoRuta, f.esMia])).toEqual([
      ["a", "Marisol Quispe", 300, "plata/u-v.jpg", false],
      ["b", "Sin nombre", 150, null, true],
    ]);
    expect(leerPlataPorConfirmar({})).toEqual([]);
  });
});

describe("«Ya tenía plata» solo la primera vez", () => {
  it("las opciones de «¿Cómo te llegó?» la ofrecen solo si todavía puede", () => {
    expect(mediosParaAnotar(true)).toEqual(["transferencia", "yape_plin", "efectivo", "ya_tenia"]);
    expect(mediosParaAnotar(false)).toEqual(["transferencia", "yape_plin", "efectivo"]);
  });

  it("si ya no puede, elegirla no cuenta como hecho (la base la rechazaría)", () => {
    expect(camposAnotar({ medio: "ya_tenia", monto: "100" }, false, PERSONA)[0].hecho).toBe(false);
    expect(camposAnotar({ medio: "ya_tenia", monto: "100" }, true, PERSONA)[0].hecho).toBe(true);
  });
});

describe("camposAnotar: lo que falta es lo que rechaza anotar_plata_compras", () => {
  const faltan = (v: Parameters<typeof camposAnotar>[0], r = PERSONA) =>
    camposAnotar(v, true, r).filter((c) => !c.hecho && c.requerido).map((c) => c.id);
  it("sin medio ni monto faltan los dos; con monto cero o ilegible, el monto", () => {
    expect(faltan({ medio: null, monto: "" })).toEqual(["medio", "monto"]);
    expect(faltan({ medio: "efectivo", monto: "0" })).toEqual(["monto"]);
    expect(faltan({ medio: "efectivo", monto: "-5" })).toEqual(["monto"]);
    expect(faltan({ medio: "efectivo", monto: "abc" })).toEqual(["monto"]);
    expect(faltan({ medio: "efectivo", monto: "S/ 1,250.50" })).toEqual([]);
  });
  it("la foto del voucher es opcional: nunca falta", () => {
    expect(camposAnotar({ medio: "efectivo", monto: "10" }, true, PERSONA).find((c) => c.id === "foto")).toMatchObject({ requerido: false, hecho: false });
    expect(camposAnotar({ medio: "efectivo", monto: "10", conFoto: true }, true, PERSONA).find((c) => c.id === "foto")?.hecho).toBe(true);
  });
  it("con la cuenta de una persona no hay combo; desde una terminal, falta quién anota", () => {
    expect(camposAnotar({ medio: "efectivo", monto: "10" }, true, PERSONA).map((c) => c.id)).toEqual(["medio", "monto", "foto"]);
    expect(faltan({ medio: "efectivo", monto: "10" }, TERMINAL_SIN_ELEGIR)).toEqual(["responsable"]);
  });
});

const CUENTAS: CuentaOpcion[] = [
  { id: "ib", nombre: "Interbank", tipo: "banco", sede: null },
  { id: "bcp", nombre: "BCP", tipo: "banco", sede: null },
  { id: "cf", nombre: "Caja fuerte · Tienda TRU", tipo: "caja_fuerte", sede: "Tienda TRU" },
];

describe("camposConfirmar", () => {
  it("una plata que le llegó pide de dónde salió; «ya tenía» no (es el saldo de apertura de su fondo)", () => {
    expect(camposConfirmar({ monto: "300", cuentaId: "" }, "yape_plin", CUENTAS, PERSONA).filter((c) => !c.hecho).map((c) => c.id)).toEqual(["cuenta"]);
    expect(camposConfirmar({ monto: "300", cuentaId: "bcp" }, "yape_plin", CUENTAS, PERSONA).every((c) => c.hecho)).toBe(true);
    expect(camposConfirmar({ monto: "150", cuentaId: "" }, "ya_tenia", CUENTAS, PERSONA).map((c) => c.id)).toEqual(["monto"]);
  });
  it("una cuenta que ya no está en la lista no cuenta como elegida", () => {
    expect(camposConfirmar({ monto: "300", cuentaId: "vieja" }, "efectivo", CUENTAS, PERSONA).find((c) => c.id === "cuenta")?.hecho).toBe(false);
  });
});

describe("cuentaSugerida: el BCP (Felipe 2026-10-22)", () => {
  it("el banco que se llama BCP, aunque no sea el primero ni se escriba igual", () => {
    expect(cuentaSugerida(CUENTAS)).toBe("bcp");
    expect(cuentaSugerida([{ id: "x", nombre: "Cuenta corriente bcp soles", tipo: "banco", sede: null }, ...CUENTAS])).toBe("x");
  });
  it("sin BCP, el primer banco; sin bancos, ninguna (no se sugiere una caja fuerte)", () => {
    expect(cuentaSugerida(CUENTAS.filter((c) => c.id !== "bcp"))).toBe("ib");
    expect(cuentaSugerida(CUENTAS.filter((c) => c.tipo !== "banco"))).toBeNull();
    expect(cuentaSugerida([])).toBeNull();
  });
  it("un nombre que solo contiene las letras no es el BCP", () => {
    expect(cuentaSugerida([{ id: "x", nombre: "ABCPeru", tipo: "banco", sede: null }, { id: "y", nombre: "BCP", tipo: "banco", sede: null }])).toBe("y");
  });
});

describe("textos", () => {
  it("bajo lo que tiene: en negativo, que anote la plata que le dieron", () => {
    expect(detalleTienes(50)).toBe("Tu plata de compras, lista para usar.");
    expect(plano(detalleTienes(-726))).toBe("Gastaste S/ 726.00 más de lo que anotaste: anota en «Me dieron plata» la plata que te dieron.");
  });
  it("el botón dice cuánto se anota", () => {
    expect(plano(fraseAnotar(300))).toBe("Anotar S/ 300.00");
    expect(plano(fraseAnotar(null))).toBe("Anotar la plata");
    expect(plano(fraseAnotar(0))).toBe("Anotar la plata");
  });
  it("lo por confirmar se dice como plata que ya puede usar; sin nada, no se dice", () => {
    expect(plano(textoPorConfirmar(500))).toBe("S/ 500.00 que anotaste · Compras lo revisa, ya lo puedes usar");
    expect(plano(textoPorConfirmar(0))).toBeNull();
  });
  it("si Compras confirmó otro monto, se ven los dos", () => {
    expect(plano(textoMontoAnotado({ monto: 300, montoConfirmado: 280, confirmada: true }))).toBe("S/ 280.00 (anotaste S/ 300.00)");
    expect(plano(textoMontoAnotado({ monto: 300, montoConfirmado: 300, confirmada: true }))).toBe("S/ 300.00");
    expect(plano(textoMontoAnotado({ monto: 300, montoConfirmado: null, confirmada: false }))).toBe("S/ 300.00");
  });
});

describe("el resto del día de compras (actividad 5)", () => {
  const BASE = { persona: true, saldo: 300, por_confirmar: 0, compras_por_completar: 120, anotada: [], compras: [] };

  it("lo gastado en otras cosas también bajó: tiene = fondo + por confirmar − compras − gastos (como fn_mi_plata_tiene)", () => {
    const p = leerMiPlata({
      ...BASE,
      gastos_por_completar: 30,
      gastos: [
        { id: "g", concepto: "taxi", monto: 18, estado: "por_completar", fecha: "2026-10-23", con_foto: false },
        { id: "o", concepto: "otro", nota: "Candado", monto: 12, estado: "completado", fecha: "2026-10-23", con_foto: true },
        { id: "z", concepto: "pasaje", monto: 5 },
      ],
    });
    expect(p).toMatchObject({ tiene: 150, gastosPorCompletar: 30 });
    expect(p?.gastos.map((g) => [g.id, nombreGasto(g), g.porCompletar, g.conFoto])).toEqual([
      ["g", "Taxi", true, false],
      ["o", "Candado", false, true],
    ]);
  });

  it("lo que falta mandar: una tarjeta por tienda con sus prendas; descarta lo ilegible y una tienda sin prendas", () => {
    const p = leerMiPlata({
      ...BASE,
      por_mandar: [
        { tienda_id: "t1", tienda: "Tienda Lima", compras: [{ papel_id: "a", proveedor: "Rosa", nombre: "Polo Tito", cantidad: 4 }, { papel_id: "b", cantidad: 0 }] },
        { tienda_id: "t2", tienda: "Tienda Trujillo", compras: [{ papel_id: "a", proveedor: "Rosa", nombre: "Blusa Emma", cantidad: 6 }, { papel_id: "c", proveedor: "Lupe", nombre: "Jean", cantidad: 2 }] },
        { tienda_id: "t3", tienda: "Vacía", compras: [] },
        { tienda: "sin id", compras: [{ papel_id: "a", cantidad: 1 }] },
      ],
    });
    expect(p?.porMandar.map((t) => [t.tienda, t.unidades, t.prendas.length])).toEqual([
      ["Tienda Lima", 4, 1],
      ["Tienda Trujillo", 8, 2],
    ]);
    // Dos compras distintas (a y c) en dos tiendas.
    expect(textoPorMandar(p!.porMandar)).toBe("2 compras todavía no salen para Tienda Lima y Tienda Trujillo");
    expect(textoPorMandar(p!.porMandar.slice(0, 1))).toBe("1 compra todavía no sale para Tienda Lima");
    expect(textoPorMandar([])).toBeNull();
    expect(resumenPrendas(p!.porMandar[1].prendas)).toBe("Blusa Emma ×6 · Jean ×2");
    expect(resumenPrendas(p!.porMandar[1].prendas, 1)).toBe("Blusa Emma ×6 y 1 más");
  });

  it("el cuaderno del día siempre cierra: lo de antes se despeja de lo que tiene ahora", () => {
    const p = leerMiPlata({ ...BASE, hoy: { dieron: 200, compraste: 120, compras: 1, gastaste: 0, cierre: null } })!;
    const d = resumenDia(p);
    expect(d).toEqual({ antes: 100, dieron: 200, compraste: 120, gastaste: 0, queda: 180 });
    expect(d.antes + d.dieron - d.compraste - d.gastaste).toBe(d.queda);
    expect(p.hoy.cierre).toBeNull();
  });

  it("lee el cierre de hoy y descarta una decisión que no conoce", () => {
    expect(leerMiPlata({ ...BASE, hoy: { cierre: { decision: "devuelve", monto: "80.00", resuelto: false } } })?.hoy.cierre).toEqual({
      decision: "devuelve",
      monto: 80,
      resuelto: false,
    });
    expect(leerMiPlata({ ...BASE, hoy: { cierre: { decision: "regala", monto: 1 } } })?.hoy.cierre).toBeNull();
    expect(leerMiPlata(null)).toBeNull();
    expect(leerMiPlata({ persona: false })?.hoy).toEqual({ fecha: "", dieron: 0, compraste: 0, compras: 0, gastaste: 0, cierre: null });
  });

  it("qué se puede elegir al terminar: lo mismo que acepta terminar_dia_compras", () => {
    expect(decisionesCierre(80)).toEqual(["se_queda", "devuelve"]);
    expect(decisionesCierre(0)).toEqual(["se_queda"]);
    expect(decisionesCierre(-20)).toEqual(["le_deben"]);
    expect(plano(textoCierre({ decision: "devuelve", monto: 80 }))).toBe("Entrega S/ 80.00 en caja: Compras lo recibe.");
    expect(plano(textoCierre({ decision: "le_deben", monto: 20 }))).toBe("Pusiste S/ 20.00 de tu bolsillo: CAYLA te lo devuelve.");
    expect(plano(textoCierre({ decision: "se_queda", monto: 80 }))).toBe("Te quedas S/ 80.00 para tu próxima compra.");
    expect(textoCierre({ decision: "se_queda", monto: 0 })).toBe("No te quedó plata.");
    // Recibido por Compras (actividad 7), en pasado.
    expect(plano(textoCierre({ decision: "devuelve", monto: 80, resuelto: true }))).toBe("Entregaste S/ 80.00: Compras ya lo recibió.");
    expect(plano(textoCierre({ decision: "le_deben", monto: 20, resuelto: true }))).toBe("CAYLA ya te devolvió los S/ 20.00 que pusiste.");
  });

  it("«Gasté en otra cosa» pide lo mismo que registrar_gasto_rapido: en qué, «Otro» escrito, el monto; la foto es opcional", () => {
    const faltan = (v: Parameters<typeof camposGasto>[0]) => camposGasto(v).filter((c) => c.requerido && !c.hecho).map((c) => c.id);
    expect(faltan({ concepto: null, nota: "", monto: "" })).toEqual(["concepto", "monto"]);
    expect(faltan({ concepto: "taxi", nota: "", monto: "15" })).toEqual([]);
    expect(faltan({ concepto: "otro", nota: "  ", monto: "15" })).toEqual(["nota"]);
    expect(faltan({ concepto: "otro", nota: "x".repeat(121), monto: "15" })).toEqual(["nota"]);
    expect(faltan({ concepto: "otro", nota: "Candado", monto: "0" })).toEqual(["monto"]);
    expect(camposGasto({ concepto: "taxi", nota: "", monto: "15" }).find((c) => c.id === "foto")?.requerido).toBe(false);
    expect(plano(fraseGasto(15))).toBe("Anotar S/ 15.00");
    expect(fraseGasto(null)).toBe("Anotar el gasto");
  });
});

describe("el estado de lo anotado, dicho por quién lo hace", () => {
  it("pendiente lo hace Compras; hecho, está en los libros (o confirmada, la plata)", () => {
    expect(estadoParaLaCompradora("compra", true).texto).toBe("Compras la revisa");
    expect(estadoParaLaCompradora("compra", false).texto).toBe("En los libros");
    expect(estadoParaLaCompradora("gasto", true).texto).toBe("Compras lo revisa");
    expect(estadoParaLaCompradora("gasto", false).detalle).toBe("Compras ya lo pasó a los libros");
    expect(estadoParaLaCompradora("plata", true).texto).toBe("Compras la confirma");
    expect(estadoParaLaCompradora("plata", false).texto).toBe("Confirmada");
  });
});

describe("Mi plata rediseñada (maqueta compras-formidable-2026-10)", () => {
  const p = leerMiPlata({
    persona: true,
    saldo: 1000,
    por_confirmar: 500,
    compras_por_completar: 0,
    gastos_por_completar: 0,
    anotada: [
      { id: "a1", medio: "yape_plin", monto: 500, estado: "por_confirmar", fecha: "2026-10-23", creado_en: "2026-10-23T13:10:00Z", con_foto: true },
      { id: "a0", medio: "efectivo", monto: 300, estado: "confirmada", fecha: "2026-10-21", creado_en: "2026-10-21T09:00:00Z", con_foto: false },
    ],
    compras: [
      { id: "c1", proveedor: "Textiles Rosa", tipo: "factura", monto: 525, estado: "por_completar", fecha: "2026-10-23", creado_en: "2026-10-23T11:20:00Z", prendas: 35, tiendas: ["AQP"], por_mandar: [] },
      { id: "c2", proveedor: "Andina", tipo: "boleta", monto: 99, estado: "completado", fecha: "2026-10-23", creado_en: "2026-10-23T15:05:00Z", prendas: 1, tiendas: ["LIM"], por_mandar: ["LIM"] },
    ],
    gastos: [{ id: "g1", concepto: "taxi", monto: 12, estado: "por_completar", fecha: "2026-10-23", creado_en: "2026-10-23T09:40:00Z", con_foto: false }],
    hoy: { fecha: "2026-10-23", dieron: 500, compraste: 624, compras: 2, gastaste: 12, cierre: null },
  })!;

  it("una sola lista: lo de hoy primero lo más nuevo, y lo de antes aparte", () => {
    const { hoy, antes } = movimientosDeLaCompradora(p);
    expect(hoy.map((m) => m.clave)).toEqual(["compra-c2", "plata-a1", "compra-c1", "gasto-g1"]);
    expect(antes.map((m) => m.clave)).toEqual(["plata-a0"]);
  });

  it("cada fila dice qué fue, con su signo y su estado dicho por quién lo hace", () => {
    const { hoy } = movimientosDeLaCompradora(p);
    const [andina, yape, rosa, taxi] = hoy;
    expect([andina.titulo, andina.detalle, andina.entra]).toEqual(["Compra a Andina", "1 prenda · Boleta · falta mandar a LIM", false]);
    expect([rosa.detalle, rosa.estado.texto, rosa.estado.pendiente]).toEqual(["35 prendas · Factura · AQP", "Compras la revisa", true]);
    expect([yape.titulo, yape.detalle, yape.entra, yape.estado.texto]).toEqual(["Te yapearon", "Yape o Plin · con foto", true, "Compras la confirma"]);
    expect([taxi.titulo, taxi.icono, taxi.detalle, taxi.estado.texto]).toEqual(["Taxi", "taxi", "Sin papel", "Compras lo revisa"]);
  });

  it("sin el día de la base, todo es de hoy (no se esconde nada)", () => {
    const { hoy, antes } = movimientosDeLaCompradora({ ...p, hoy: { ...p.hoy, fecha: "" } });
    expect([hoy.length, antes.length]).toEqual([5, 0]);
  });

  it("la billetera reparte lo que queda, lo comprado y lo gastado hoy; en negativo no queda nada", () => {
    expect(repartoBilletera(p)).toEqual({ queda: p.tiene, compraste: 624, gastos: 12 });
    expect(repartoBilletera({ tiene: -40, hoy: { ...p.hoy, compraste: 0, gastaste: 0 } })).toEqual({ queda: 0, compraste: 0, gastos: 0 });
  });

  it("la franja dice cuántas prendas faltan mandar y a dónde", () => {
    const una = [{ tiendaId: "t", tienda: "Tienda LIM", unidades: 7, prendas: [] }];
    expect(textoFaltaMandar(una)?.titulo).toBe("Te falta mandar 7 prendas a Tienda LIM");
    expect(textoFaltaMandar([...una, { tiendaId: "u", tienda: "Tienda AQP", unidades: 30, prendas: [] }])?.titulo).toBe("Te falta mandar 37 prendas a 2 tiendas");
    expect(textoFaltaMandar([{ ...una[0], unidades: 1 }])?.titulo).toBe("Te falta mandar 1 prenda a Tienda LIM");
    expect(textoFaltaMandar([])).toBeNull();
  });
});

describe("la tarjeta de cada tienda en «Mandar a la tienda»", () => {
  it("la sigla es la última palabra en tres letras", () => {
    expect(siglaTienda("Tienda Lima")).toBe("LIM");
    expect(siglaTienda("Tienda AQP")).toBe("AQP");
    expect(siglaTienda("Trujillo")).toBe("TRU");
    expect(siglaTienda("")).toBe("?");
  });
  it("cuántas prendas y de cuántas compras", () => {
    const p = (papelId: string) => ({ papelId, proveedor: "x", nombre: "y", cantidad: 1 });
    expect(detalleEnvio({ unidades: 30, prendas: [p("a"), p("b"), p("a")] })).toBe("30 prendas de 2 compras");
    expect(detalleEnvio({ unidades: 1, prendas: [p("a")] })).toBe("1 prenda de 1 compra");
  });
});
