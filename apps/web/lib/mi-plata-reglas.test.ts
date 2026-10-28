import { describe, expect, it } from "vitest";
import {
  camposAnotar,
  camposGasto,
  decisionesCierre,
  nombreGasto,
  resumenRonda,
  tituloDeLaLista,
  resumenPrendas,
  estadoParaLaCompradora,
  textoCierre,
  puedeCerrarLaRonda,
  fraseGasto,
  camposConfirmar,
  cuentaSugerida,
  detalleTienes,
  fraseAnotar,
  leerMiPlata,
  leerPlataPorConfirmar,
  leerBancosDePlata,
  bancoSugerido,
  cuentaAlConfirmar,
  textoBancoIndicado,
  mediosParaAnotar,
  textoMontoAnotado,
  textoPorConfirmar,
  cuentaDeLaBilletera,
  usoDeLaPlata,
  desdeRonda,
  horaDeMovimiento,
  queHaraCompras,
  pasoDeLaRonda,
  PASOS_DE_LA_RONDA,
  textoFaltaMandar,
  movimientosDeLaCompradora,
  historialDeLaCompradora,
  ultimaRondaDelHistorial,
  siglaTienda,
  detalleEnvio,
} from "./mi-plata-reglas";
import type { CuentaOpcion } from "./fondos-reglas";
import { soles } from "./compras-reglas";

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
    expect(p?.compras).toEqual([{ id: "c", proveedor: "Textiles Rosa", tipo: "boleta", monto: 450, pagado: 450, medioPago: null, porCompletar: true, fecha: "2026-10-22", creadoEn: "", rondaId: null, ronda: null, prendas: 16, tiendas: ["Tienda TRU"], porMandar: ["Tienda TRU"] }]);
  });

  it("un fondo en negativo (pagó de su bolsillo) resta: tiene lo que queda de verdad", () => {
    expect(leerMiPlata({ persona: true, saldo: -40, por_confirmar: 100, anotada: [] })?.tiene).toBe(60);
  });

  it("si faltan las cifras que componen «tienes» la lectura es null, no un cero que engaña (principio 9)", () => {
    // Sin saldo o sin lo por confirmar (presentes desde la primera versión de la función): respuesta dañada.
    expect(leerMiPlata({ persona: true, por_confirmar: 0, anotada: [] })).toBeNull();
    expect(leerMiPlata({ persona: true, saldo: 300, anotada: [] })).toBeNull();
    expect(leerMiPlata({ persona: true, saldo: "roto", por_confirmar: 0 })).toBeNull();
    // Una base con rondas ya manda lo comprado y lo gastado por completar: sin ellas, «tienes» saldría de más.
    expect(leerMiPlata({ persona: true, saldo: 300, por_confirmar: 0, ronda: {} })).toBeNull();
    expect(leerMiPlata({ persona: true, saldo: 300, por_confirmar: 0, compras_por_completar: 120, ronda: {} })).toBeNull();
    expect(leerMiPlata({ persona: true, saldo: 300, por_confirmar: 0, gastos_por_completar: 30, ronda: {} })).toBeNull();
    expect(leerMiPlata({ persona: true, saldo: 300, por_confirmar: 0, compras_por_completar: 0, gastos_por_completar: 0, ronda: {} })?.tiene).toBe(300);
    // Una versión anterior a las rondas todavía se lee: lo que no existía en ella es cero de verdad.
    expect(leerMiPlata({ persona: true, saldo: 300, por_confirmar: 50 })?.tiene).toBe(350);
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
    // La plata que te dan llega hasta S/ 1 000 000 (la base); más, se dice en el campo.
    expect(camposAnotar({ medio: "efectivo", monto: "1000000" }, false, PERSONA).find((c) => c.id === "monto")?.hecho).toBe(true);
    expect(camposAnotar({ medio: "efectivo", monto: "1000001" }, false, PERSONA).find((c) => c.id === "monto")?.hecho).toBe(false);
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

describe("«¿De qué banco salió?» (20261026170000)", () => {
  const BANCOS = leerBancosDePlata([{ id: "i", nombre: "Interbank" }, { id: "b", nombre: "BCP" }, { id: "x" }, null, { nombre: "Sin id" }]);

  it("los bancos se leen como cuentas de tipo banco y lo ilegible se descarta; sin lista, ninguno", () => {
    expect(BANCOS).toEqual([
      { id: "i", nombre: "Interbank", tipo: "banco", sede: null },
      { id: "b", nombre: "BCP", tipo: "banco", sede: null },
    ]);
    expect(leerBancosDePlata(null)).toEqual([]);
    expect(leerBancosDePlata("raro")).toEqual([]);
  });

  it("llega elegido el BCP aunque no sea el primero; sin uno con ese nombre, el primero; sin bancos, ninguno", () => {
    expect(bancoSugerido(BANCOS)).toBe("b");
    expect(bancoSugerido([{ id: "i", nombre: "Interbank" }, { id: "s", nombre: "Scotiabank" }])).toBe("i");
    expect(bancoSugerido([])).toBeNull();
    // «bcp» dentro de otra palabra no es el BCP.
    expect(bancoSugerido([{ id: "x", nombre: "Bcpmundo" }, { id: "y", nombre: "Banco BCP Perú" }])).toBe("y");
  });

  it("la guía pide el banco solo con una transferencia y con bancos que elegir; lo opcional no bloquea", () => {
    const campos = (v: Parameters<typeof camposAnotar>[0]) => camposAnotar(v, false, PERSONA).map((c) => [c.id, c.hecho]);
    expect(campos({ medio: "transferencia", monto: "100", hayBancos: true, banco: null })).toContainEqual(["banco", false]);
    expect(campos({ medio: "transferencia", monto: "100", hayBancos: true, banco: "b" })).toContainEqual(["banco", true]);
    for (const medio of ["yape_plin", "efectivo", null] as const) {
      expect(campos({ medio, monto: "100", hayBancos: true }).map(([id]) => id)).not.toContain("banco");
    }
    // Sin bancos configurados no hay nada que elegir: el campo no aparece (la compradora puede anotar igual).
    expect(campos({ medio: "transferencia", monto: "100", hayBancos: false }).map(([id]) => id)).not.toContain("banco");
    // El banco va después del medio y antes del monto: el orden de la hoja.
    expect(campos({ medio: "transferencia", monto: "", hayBancos: true, banco: "b" }).map(([id]) => id).slice(0, 3)).toEqual(["medio", "banco", "monto"]);
  });

  it("Compras confirma con el banco que dijo la compradora si sigue disponible; si no, con el de siempre", () => {
    expect(cuentaAlConfirmar({ cuentaIndicadaId: "i" }, BANCOS)).toBe("i");
    expect(cuentaAlConfirmar({ cuentaIndicadaId: null }, BANCOS)).toBe("b");
    // Un banco archivado después ya no está entre las cuentas: vuelve al de siempre.
    expect(cuentaAlConfirmar({ cuentaIndicadaId: "viejo" }, BANCOS)).toBe("b");
    expect(cuentaAlConfirmar({ cuentaIndicadaId: "i" }, [])).toBe("");
  });

  it("«Marisol dijo que salió de BCP.» solo si indicó uno; la fila de «por confirmar» trae el banco o nada", () => {
    expect(textoBancoIndicado("Marisol", "BCP")).toBe("Marisol dijo que salió de BCP.");
    expect(textoBancoIndicado("Marisol", null)).toBeNull();
    const [a, b] = leerPlataPorConfirmar([
      { id: "a", persona_id: "p", medio: "transferencia", monto: 10, cuenta_indicada_id: "b", cuenta_indicada: "BCP" },
      { id: "b", persona_id: "p", medio: "yape_plin", monto: 10 },
    ]);
    expect([a.cuentaIndicadaId, a.cuentaIndicada, b.cuentaIndicadaId, b.cuentaIndicada]).toEqual(["b", "BCP", null, null]);
  });
});

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
    expect(detalleTienes(50)).toBeNull();
    expect(plano(detalleTienes(-726))).toBe("Pusiste S/ 726.00 de tu bolsillo. Si te dieron más plata, anótala; si no, Compras te lo devuelve al cerrar.");
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
  const BASE = { persona: true, saldo: 300, por_confirmar: 0, compras_por_completar: 120, gastos_por_completar: 0, anotada: [], compras: [] };

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
    // Con prendas por mandar no se cierra la ronda; sin nada, o con una tienda en 0, sí.
    expect(puedeCerrarLaRonda(p!.porMandar)).toBe(false);
    expect(puedeCerrarLaRonda([])).toBe(true);
    expect(puedeCerrarLaRonda([{ ...p!.porMandar[0], unidades: 0 }])).toBe(true);
    expect(resumenPrendas(p!.porMandar[1].prendas)).toBe("Blusa Emma ×6 · Jean ×2");
    expect(resumenPrendas(p!.porMandar[1].prendas, 1)).toBe("Blusa Emma ×6 y 1 más");
  });

  it("el cuaderno de la ronda siempre cierra: lo de antes se despeja de lo que tiene ahora; sin ronda abierta, todo es de antes", () => {
    const ronda = { id: "r", texto: "RC-000003", abierta_en: "2026-10-21T10:00:00Z", compras: 1, prendas: 6, dieron: 200, compraste: 120, gastaste: 0 };
    const p = leerMiPlata({ ...BASE, ronda: { abierta: ronda } })!;
    const d = resumenRonda(p);
    expect(d).toEqual({ antes: 100, dieron: 200, compraste: 120, gastaste: 0, compras: 1, queda: 180 });
    expect(d.antes + d.dieron - d.compraste - d.gastaste).toBe(d.queda);
    expect(resumenRonda({ tiene: 180, ronda: { abierta: null, ultimaCerrada: null } })).toMatchObject({ antes: 180, compraste: 0, queda: 180 });
  });

  it("la ronda: su serie y número, lo que lleva y cómo cerró la última; lo ilegible no se inventa", () => {
    const p = leerMiPlata({
      ...BASE,
      ronda: {
        abierta: { id: "r", texto: "RC-000003", abierta_en: "2026-10-21T10:00:00Z", compras: "2", prendas: 16, dieron: 0, compraste: "300.50", gastaste: 12 },
        ultima_cerrada: { texto: "RC-000002", cerrada_en: "2026-10-20T20:00:00Z", decision: "devuelve", monto: "80", resuelto: false },
      },
    })!;
    expect(p.ronda.abierta).toMatchObject({ texto: "RC-000003", compras: 2, prendas: 16, compraste: 300.5 });
    expect(p.ronda.ultimaCerrada).toEqual({ texto: "RC-000002", cerradaEn: "2026-10-20T20:00:00Z", decision: "devuelve", monto: 80, resuelto: false });
    expect(leerMiPlata({ ...BASE, ronda: { abierta: { texto: "RC-1" }, ultima_cerrada: { decision: "regala" } } })?.ronda).toEqual({ abierta: null, ultimaCerrada: null, cerradas: [] });
    expect(leerMiPlata({ persona: false })?.ronda).toEqual({ abierta: null, ultimaCerrada: null, cerradas: [] });
  });

  it("de «hoy» solo se lee el día (lo demás vive en la ronda abierta)", () => {
    expect(leerMiPlata({ ...BASE, hoy: { fecha: "2026-10-23T05:00:00Z", dieron: 500 } })?.hoy).toEqual({ fecha: "2026-10-23" });
    expect(leerMiPlata({ ...BASE })?.hoy).toEqual({ fecha: "" });
    expect(leerMiPlata(null)).toBeNull();
    expect(leerMiPlata({ persona: false })?.hoy).toEqual({ fecha: "" });
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
    // El tope de un gasto es el de la base (S/ 100 000): se dice en el campo, no al guardar.
    expect(camposGasto({ concepto: "taxi", nota: "", monto: "100000" }).find((c) => c.id === "monto")?.hecho).toBe(true);
    expect(camposGasto({ concepto: "taxi", nota: "", monto: "100000.01" }).find((c) => c.id === "monto")).toMatchObject({ hecho: false });
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
      { id: "a1", medio: "yape_plin", monto: 500, estado: "por_confirmar", fecha: "2026-10-23", creado_en: "2026-10-23T13:10:00Z", con_foto: true, ronda_id: "r", ronda: "RC-000003" },
      { id: "a0", medio: "efectivo", monto: 300, estado: "confirmada", fecha: "2026-10-21", creado_en: "2026-10-21T09:00:00Z", con_foto: false, ronda_id: "r0", ronda: "RC-000002" },
    ],
    compras: [
      { id: "c1", proveedor: "Textiles Rosa", tipo: "factura", monto: 525, estado: "por_completar", fecha: "2026-10-23", creado_en: "2026-10-23T11:20:00Z", prendas: 35, tiendas: ["AQP"], por_mandar: [], ronda_id: "r" },
      { id: "c2", proveedor: "Andina", tipo: "boleta", monto: 99, estado: "completado", fecha: "2026-10-23", creado_en: "2026-10-23T15:05:00Z", prendas: 1, tiendas: ["LIM"], por_mandar: ["LIM"], ronda_id: "r" },
    ],
    gastos: [{ id: "g1", concepto: "taxi", monto: 12, estado: "por_completar", fecha: "2026-10-23", creado_en: "2026-10-23T09:40:00Z", con_foto: false, ronda_id: "r" }],
    hoy: { fecha: "2026-10-23" },
    ronda: {
      abierta: { id: "r", texto: "RC-000003", abierta_en: "2026-10-23T08:00:00Z", compras: 2, prendas: 36, dieron: 500, compraste: 624, gastaste: 12 },
      ultima_cerrada: { texto: "RC-000002", cerrada_en: "2026-10-21T20:00:00Z", decision: "se_queda", monto: 0 },
    },
  })!;

  it("una sola lista: lo de la ronda abierta primero, lo más nuevo arriba, y lo de rondas anteriores aparte", () => {
    const { actuales, antes } = movimientosDeLaCompradora(p);
    expect(actuales.map((m) => m.clave)).toEqual(["compra-c2", "plata-a1", "compra-c1", "gasto-g1"]);
    expect(antes.map((m) => [m.clave, m.ronda])).toEqual([["plata-a0", "RC-000002"]]);
  });

  it("cada fila dice qué fue, con su signo y su estado dicho por quién lo hace", () => {
    const { actuales } = movimientosDeLaCompradora(p);
    const [andina, yape, rosa, taxi] = actuales;
    expect([andina.titulo, andina.detalle, andina.entra]).toEqual(["Compra a Andina", "1 prenda · Boleta · falta mandar a LIM", false]);
    expect([rosa.detalle, rosa.estado.texto, rosa.estado.pendiente]).toEqual(["35 prendas · Factura · AQP", "Compras la revisa", true]);
    expect([yape.titulo, yape.detalle, yape.entra, yape.estado.texto]).toEqual(["Te yapearon", "Yape o Plin · con foto", true, "Compras la confirma"]);
    expect([taxi.titulo, taxi.icono, taxi.detalle, taxi.estado.texto]).toEqual(["Taxi", "taxi", "Sin papel", "Compras lo revisa"]);
  });

  it("una compra ya enviada dice su código (Mis envíos); si falta mandar algo, sigue diciendo a qué tienda", () => {
    const codigos = new Map([["c1", ["ENV-000118", "ENV-000119"]], ["c2", ["ENV-000120"]]]);
    const { actuales } = movimientosDeLaCompradora(p, codigos);
    const [andina, , rosa] = actuales;
    expect(rosa.detalle).toBe("35 prendas · Factura · enviada · ENV-000118, ENV-000119");
    expect(andina.detalle).toBe("1 prenda · Boleta · falta mandar a LIM");
  });

  it("sin ronda: lo anotado después del último cierre va arriba; sin ningún cierre, lo de hoy; sin el día de la base, todo", () => {
    const sinRonda = { ...p, compras: p.compras.map((c) => ({ ...c, rondaId: null })), gastos: p.gastos.map((g) => ({ ...g, rondaId: null })), anotada: p.anotada.map((a) => ({ ...a, rondaId: null })) };
    const r = (abierta: typeof p.ronda.abierta, cerradaEn: string | null) => ({ abierta, ultimaCerrada: cerradaEn ? { ...p.ronda.ultimaCerrada!, cerradaEn } : null });
    // La plata que le dieron antes de abrir la ronda, pero después de cerrar la anterior, es de esta vuelta.
    expect(movimientosDeLaCompradora({ ...sinRonda, ronda: r(p.ronda.abierta, "2026-10-23T12:00:00Z") }).actuales.map((m) => m.clave)).toEqual(["compra-c2", "plata-a1"]);
    expect(movimientosDeLaCompradora({ ...sinRonda, ronda: r(null, null) }).actuales).toHaveLength(4);
    // Recién abierta la primera ronda, lo de antes de las rondas baja.
    expect(movimientosDeLaCompradora({ ...sinRonda, ronda: r(p.ronda.abierta, null) }).actuales).toHaveLength(0);
    const { actuales, antes } = movimientosDeLaCompradora({ ...sinRonda, ronda: r(null, null), hoy: { ...p.hoy, fecha: "" } });
    expect([actuales.length, antes.length]).toEqual([5, 0]);
  });

  it("el título de la lista sigue a la ronda", () => {
    expect(tituloDeLaLista(p.ronda)).toBe("En esta ronda");
    expect(tituloDeLaLista({ ...p.ronda, abierta: null })).toBe("Antes de abrir tu ronda");
    expect(tituloDeLaLista({ abierta: null, ultimaCerrada: null })).toBe("Hoy");
  });

  it("la billetera cuenta lo que te dieron, compraste y gastaste en la ronda, y lo que ya tenías al abrirla; sin ronda, nada que dibujar", () => {
    // 1000 de fondo + 500 por confirmar − 624 − 12 = 864; la ronda recibió 500, así que ya tenía 1000 al abrirla.
    expect(cuentaDeLaBilletera(p)).toEqual({ dieron: 500, compraste: 624, gastaste: 12, antes: p.tiene - 500 + 624 + 12 });
    expect(cuentaDeLaBilletera({ tiene: -40, ronda: { abierta: null, ultimaCerrada: null } })).toBeNull();
  });

  it("la barra de uso: lo usado contra lo que te dieron (y lo que ya tenías), redondeado hacia abajo, y sin base no se dibuja", () => {
    // Los datos de la maqueta: te dieron 5,700, compraste 198, no gastaste: 3,47 % → «3 %».
    expect(usoDeLaPlata({ dieron: 5700, compraste: 198, gastaste: 0, antes: 0 })).toEqual({ pct: 3, usado: 198, base: 5700, texto: "Usaste el 3 % de lo que te dieron" });
    // Lo que ya tenías al abrir la ronda suma a la base y el texto lo dice.
    expect(usoDeLaPlata({ dieron: 500, compraste: 624, gastaste: 12, antes: 1000 })).toEqual({ pct: 42, usado: 636, base: 1500, texto: "Usaste el 42 % de lo que tenías" });
    // Si al abrir te debían (antes negativo), eso no suma a la base: no inventa plata.
    expect(usoDeLaPlata({ dieron: 1000, compraste: 250, gastaste: 0, antes: -300 })?.base).toBe(1000);
    // Hacia abajo: 99,9 % no es «100 %».
    expect(usoDeLaPlata({ dieron: 1000, compraste: 999, gastaste: 0, antes: 0 })?.pct).toBe(99);
    // Nada usado, casi nada, todo y de más.
    expect(usoDeLaPlata({ dieron: 800, compraste: 0, gastaste: 0, antes: 0 })).toMatchObject({ pct: 0, texto: "Todavía no usas nada de lo que te dieron" });
    expect(usoDeLaPlata({ dieron: 5000, compraste: 10, gastaste: 0, antes: 0 })).toMatchObject({ pct: 0, texto: "Usaste menos del 1 % de lo que te dieron" });
    expect(usoDeLaPlata({ dieron: 100, compraste: 100, gastaste: 0, antes: 0 })).toMatchObject({ pct: 100, texto: "Ya usaste todo lo que te dieron" });
    expect(usoDeLaPlata({ dieron: 100, compraste: 130, gastaste: 20, antes: 0 })).toMatchObject({ pct: 100, texto: "Ya usaste todo lo que te dieron" });
    // Sin ronda (la cuenta es null) o sin nada dado ni de antes: no hay qué medir.
    expect(usoDeLaPlata(null)).toBeNull();
    expect(usoDeLaPlata({ dieron: 0, compraste: 50, gastaste: 0, antes: 0 })).toBeNull();
    expect(usoDeLaPlata({ dieron: 0, compraste: 0, gastaste: 0, antes: -40 })).toBeNull();
  });

  it("el camino de la ronda: sin ronda 1.º; por mandar, 3.º; con compras y nada por mandar, 4.º; si no, 2.º", () => {
    const sinRonda = { ronda: { abierta: null, ultimaCerrada: null }, porMandar: [] };
    const vacia = { ...p.ronda.abierta!, compras: 0, prendas: 0 };
    const porMandar = [{ tiendaId: "t", tienda: "Tienda LIM", unidades: 3, prendas: [] }];
    expect(PASOS_DE_LA_RONDA).toHaveLength(4);
    expect(pasoDeLaRonda(sinRonda)).toBe(0);
    // Un sin-ronda con prendas por mandar (de la anterior) sigue pidiendo abrir la ronda: sin ronda no hay nada que seguir.
    expect(pasoDeLaRonda({ ...sinRonda, porMandar })).toBe(0);
    expect(pasoDeLaRonda({ ronda: { abierta: vacia, ultimaCerrada: null }, porMandar: [] })).toBe(1);
    expect(pasoDeLaRonda({ ronda: { abierta: vacia, ultimaCerrada: null }, porMandar })).toBe(2);
    expect(pasoDeLaRonda({ ronda: { abierta: p.ronda.abierta, ultimaCerrada: null }, porMandar })).toBe(2);
    expect(pasoDeLaRonda({ ronda: { abierta: p.ronda.abierta, ultimaCerrada: null }, porMandar: [] })).toBe(3);
    // Una tienda con 0 por mandar no cuenta.
    expect(pasoDeLaRonda({ ronda: { abierta: p.ronda.abierta, ultimaCerrada: null }, porMandar: [{ ...porMandar[0], unidades: 0 }] })).toBe(3);
  });

  it("la fila dice a qué hora se anotó y la hoja, qué hará Compras (maqueta mis-compras-rediseno-2026-10)", () => {
    const { actuales } = movimientosDeLaCompradora(p);
    const [andina, yape, rosa, taxi] = actuales;
    // 15:05 UTC = 10:05 en Lima (cinco horas detrás todo el año).
    expect(horaDeMovimiento(andina)).toBe("10:05");
    expect(horaDeMovimiento({ creadoEn: "" })).toBeNull();
    expect(queHaraCompras(rosa)).toMatch(/copia el número del papel/);
    expect(queHaraCompras(yape)).toMatch(/confirma con su banco o su caja/);
    expect(queHaraCompras(taxi)).toMatch(/pasa a los gastos del viaje/);
    // Lo que ya está hecho dice lo que ya pasó, no lo que va a pasar.
    expect(queHaraCompras({ tipo: "compra", estado: { texto: "En los libros", detalle: "Compras ya la pasó a los libros", pendiente: false } })).toBe("Compras ya la pasó a los libros");
  });

  it("«desde hoy 08:30» junto al título de la lista, con el día de Lima", () => {
    expect(desdeRonda("2026-10-23T13:30:00Z", "2026-10-23")).toBe("desde hoy 08:30");
    expect(desdeRonda("2026-10-21T13:30:00Z", "2026-10-23")).toBe("desde el 21/10 08:30");
    // A las 8 pm de Lima ya es «mañana» en UTC: sigue siendo el día de Lima.
    expect(desdeRonda("2026-10-24T01:10:00Z", "2026-10-23")).toBe("desde hoy 20:10");
    expect(desdeRonda("", "2026-10-23")).toBeNull();
  });

  it("la franja dice cuántas prendas faltan mandar y a dónde", () => {
    const una = [{ tiendaId: "t", tienda: "Tienda LIM", unidades: 7, prendas: [] }];
    expect(textoFaltaMandar(una)).toEqual({ titulo: "Falta mandar 7 prendas", detalle: "LIM 7" });
    expect(textoFaltaMandar([...una, { tiendaId: "u", tienda: "Tienda AQP", unidades: 30, prendas: [] }])).toEqual({ titulo: "Falta mandar 37 prendas", detalle: "LIM 7 · AQP 30" });
    expect(textoFaltaMandar([{ ...una[0], unidades: 1 }])?.titulo).toBe("Falta mandar 1 prenda");
    expect(textoFaltaMandar([...una, { tiendaId: "u", tienda: "Tienda AQP", unidades: 0, prendas: [] }])?.detalle).toBe("LIM 7");
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

describe("compra pagada en parte o después (20261023181000)", () => {
  it("baja solo lo que pagó y dice lo que paga Compras", () => {
    const p = leerMiPlata({
      persona: true,
      saldo: 100,
      por_confirmar: 0,
      compras_por_completar: 0,
      anotada: [],
      compras: [
        { id: "a", proveedor: "Rosa", tipo: "boleta", monto: 300, pagado: 100, medio_pago: "yape", estado: "por_completar", fecha: "2026-10-23", prendas: 2, tiendas: [], por_mandar: [] },
        { id: "b", proveedor: "Lupe", tipo: "boleta", monto: 80, pagado: 0, estado: "por_completar", fecha: "2026-10-23", prendas: 1, tiendas: [], por_mandar: [] },
      ],
    });
    const { actuales } = movimientosDeLaCompradora(p!);
    expect(actuales.map((m) => [plano(m.monto), plano(m.detalle)])).toEqual([
      ["S/ 100.00", "2 prendas · Compras paga S/ 200.00 · Boleta"],
      ["S/ 0.00", "1 prenda · Compras paga S/ 80.00 · Boleta"],
    ]);
  });
});

describe("el historial por ronda (Felipe 2026-10-23)", () => {
  // Dos rondas cerradas: RC-000001 (se quedó con la plata) y RC-000002 (devolvió S/ 80, Compras todavía no lo recibe).
  const p = leerMiPlata({
    persona: true,
    saldo: 0,
    por_confirmar: 0,
    compras_por_completar: 0,
    gastos_por_completar: 0,
    anotada: [
      { id: "a1", medio: "yape_plin", monto: 500, estado: "confirmada", fecha: "2026-10-20", creado_en: "2026-10-20T09:00:00Z", ronda_id: "r1", ronda: "RC-000001" },
      { id: "a2", medio: "efectivo", monto: 200, estado: "por_confirmar", fecha: "2026-10-22", creado_en: "2026-10-22T09:00:00Z", ronda_id: "r2", ronda: "RC-000002" },
    ],
    compras: [
      { id: "c1", proveedor: "Rosa", tipo: "boleta", monto: 300, estado: "completado", fecha: "2026-10-20", creado_en: "2026-10-20T11:00:00Z", prendas: 10, tiendas: ["LIM"], por_mandar: [], ronda_id: "r1", ronda: "RC-000001" },
      { id: "c2", proveedor: "Andina", tipo: "factura", monto: 250, pagado: 100, estado: "por_completar", fecha: "2026-10-22", creado_en: "2026-10-22T11:00:00Z", prendas: 5, tiendas: ["AQP"], por_mandar: [], ronda_id: "r2", ronda: "RC-000002" },
    ],
    gastos: [
      { id: "g1", concepto: "taxi", monto: 20, estado: "completado", fecha: "2026-10-22", creado_en: "2026-10-22T12:00:00Z", ronda_id: "r2", ronda: "RC-000002" },
      { id: "g0", concepto: "comida", monto: 15, estado: "completado", fecha: "2026-10-01", creado_en: "2026-10-01T12:00:00Z", ronda_id: null },
    ],
    hoy: { fecha: "2026-10-23" },
    ronda: {
      abierta: null,
      ultima_cerrada: { texto: "RC-000002", cerrada_en: "2026-10-22T20:00:00Z", decision: "devuelve", monto: 80 },
      cerradas: [
        { id: "r2", texto: "RC-000002", abierta_en: "2026-10-21T15:00:00Z", cerrada_en: "2026-10-22T20:00:00Z", decision: "devuelve", monto: 80, resuelto: false },
        { id: "r1", texto: "RC-000001", abierta_en: "2026-10-20T08:00:00Z", cerrada_en: "2026-10-20T20:00:00Z", decision: "se_queda", monto: 200, resuelto: false },
        { id: "r9", texto: "RC-000009", decision: "regala" },
      ],
    },
  })!;
  const h = historialDeLaCompradora(movimientosDeLaCompradora(p).antes, p.ronda.cerradas ?? []);

  it("lee las rondas cerradas y descarta las ilegibles", () => {
    expect(p.ronda.cerradas?.map((r) => [r.id, r.decision])).toEqual([["r2", "devuelve"], ["r1", "se_queda"]]);
  });

  it("arriba solo la plata, lo que devolvió y las rondas, del más nuevo al más viejo", () => {
    expect(h.map((e) => e.clave)).toEqual(["cierre-r2", "ronda-r2", "plata-a2", "ronda-r1", "plata-a1", "ronda-sin-ronda"]);
  });

  it("dentro de cada ronda, sus compras y gastos; la plata que le dieron NO entra", () => {
    const r2 = h.find((e) => e.clave === "ronda-r2");
    expect(r2?.tipo === "ronda" && r2.movimientos.map((m) => m.clave)).toEqual(["gasto-g1", "compra-c2"]);
    // Lo que salió de su plata: lo pagado (100 de 250) y el taxi (20).
    expect(r2?.tipo === "ronda" && [r2.titulo, r2.detalle, r2.monto, r2.pendiente, r2.cierre]).toEqual([
      "Ronda RC-000002",
      "21/10 al 22/10 · 1 compra · 1 gasto",
      soles(120),
      true,
      null,
    ]);
    const r1 = h.find((e) => e.clave === "ronda-r1");
    expect(r1?.tipo === "ronda" && [r1.detalle, r1.pendiente, r1.cierre]).toEqual(["20/10 · 1 compra", false, `Te quedaste ${soles(200)} para tu próxima ronda.`]);
  });

  it("lo que devolvió dice cuánto, dónde y si Compras ya lo recibió", () => {
    const c = h[0];
    expect(c.tipo === "cierre" && [c.titulo, c.detalle, c.entra, c.monto, c.estado.texto, c.estado.pendiente]).toEqual([
      "Devolviste en caja",
      "RC-000002 · 22/10",
      false,
      soles(80),
      "Entrégalo en caja",
      true,
    ]);
  });

  it("lo de antes de las rondas va en su propio grupo; una ronda sin compras ni gastos igual aparece", () => {
    const sin = h.at(-1);
    expect(sin?.tipo === "ronda" && [sin.titulo, sin.movimientos.length]).toEqual(["Antes de las rondas", 1]);
    const vacia = historialDeLaCompradora([], [{ id: "r5", texto: "RC-000005", abiertaEn: "2026-10-22T08:00:00Z", cerradaEn: "2026-10-22T09:00:00Z", decision: "le_deben", monto: 30, resuelto: true }]);
    expect(vacia.map((e) => [e.clave, e.tipo === "ronda" ? e.detalle : e.tipo === "cierre" ? e.estado.texto : ""])).toEqual([
      ["cierre-r5", "Te lo devolvieron"],
      ["ronda-r5", "22/10 · Sin compras ni gastos"],
    ]);
  });

  it("la última ronda se destaca con su cierre pegado y el resto queda sin ella (Felipe 2026-10-27)", () => {
    const u = ultimaRondaDelHistorial(h)!;
    expect(u.ronda.clave).toBe("ronda-r2");
    // Devolvió S/ 80 y Compras todavía no lo recibe: manda la plata, no el estado de los libros.
    expect([u.cierre?.clave, u.estado.texto, u.estado.pendiente, u.comoCerro]).toEqual(["cierre-r2", "Entrégalo en caja", true, `Devolviste en caja ${soles(80)}`]);
    expect(u.resto.map((e) => e.clave)).toEqual(["plata-a2", "ronda-r1", "plata-a1", "ronda-sin-ronda"]);
  });

  it("sin plata que devolver, la última ronda dice cómo cerró o que Compras todavía revisa; sin rondas cerradas, nada", () => {
    // RC-000001 se quedó con la plata y todo está en los libros.
    const r1 = ultimaRondaDelHistorial(h.filter((e) => !["cierre-r2", "ronda-r2"].includes(e.clave)))!;
    expect([r1.ronda.clave, r1.cierre, r1.estado, r1.comoCerro]).toEqual([
      "ronda-r1",
      null,
      { texto: "Todo al día", detalle: "Compras ya pasó todo de esta ronda a los libros", pendiente: false },
      `Te quedaste ${soles(200)} para tu próxima ronda.`,
    ]);
    // Algo sin pasar a los libros y ningún cierre aparte.
    const sinCierre = ultimaRondaDelHistorial(h.filter((e) => e.clave !== "cierre-r2"))!;
    expect([sinCierre.estado.texto, sinCierre.estado.pendiente]).toEqual(["Compras la revisa", true]);
    // «Antes de las rondas» no es una ronda: no se destaca.
    expect(ultimaRondaDelHistorial(h.filter((e) => e.clave === "ronda-sin-ronda"))).toBeNull();
    expect(ultimaRondaDelHistorial([])).toBeNull();
  });

  it("sin la migración (sin `cerradas`), igual agrupa por ronda con el número de sus compras", () => {
    const sinLista = historialDeLaCompradora(movimientosDeLaCompradora(p).antes, []);
    expect(sinLista.filter((e) => e.tipo === "ronda").map((e) => e.tipo === "ronda" && e.titulo)).toEqual(["Ronda RC-000002", "Ronda RC-000001", "Antes de las rondas"]);
    expect(sinLista.some((e) => e.tipo === "cierre")).toBe(false);
  });
});
