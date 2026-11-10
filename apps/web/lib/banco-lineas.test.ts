import { describe, expect, it } from "vitest";
import { grupoDeLinea, leerExtracto, type LineaExtracto } from "./extracto-interbank";
import {
  decimalDeCentimos,
  estadoDelCuadre,
  fraseDeCarga,
  fraseDeHuecos,
  fraseDeLineas,
  fraseDePorConfirmar,
  fraseDeUltimaCarga,
  fraseDelAncla,
  fuenteDe,
  gruposDelBanco,
  cuentaDelArchivo,
  fraseDeCadenaCompleta,
  huellaDeArchivo,
  ladoDeLaDiferencia,
  leerCuadreBanco,
  leerResultadoCarga,
  paraCargar,
  type CuadreBanco,
} from "./banco-lineas";

// Todos los montos, glosas y nombres de aquí son inventados: el repo es público.

const BANCO = "Banco de Prueba";

const linea = (o: Partial<LineaExtracto>): LineaExtracto => ({
  orden: 0,
  fecha: "2026-10-05",
  descripcion: ". Abono QR IBK",
  centimos: 1000,
  saldoCentimos: 11000,
  tipo: "qr_izipay",
  codigoComercio: null,
  fechaProceso: "2026-10-05",
  correlativo: "00262780001",
  codigo: "1402",
  operacion: null,
  firme: true,
  ...o,
});

describe("decimalDeCentimos: el monto viaja como texto, sin pasar por la coma flotante", () => {
  it("escribe siempre dos decimales, con el signo adelante", () => {
    expect(decimalDeCentimos(180360)).toBe("1803.60");
    expect(decimalDeCentimos(-30)).toBe("-0.30");
    expect(decimalDeCentimos(5)).toBe("0.05");
    expect(decimalDeCentimos(100)).toBe("1.00");
    expect(decimalDeCentimos(-100000000)).toBe("-1000000.00");
  });

  it("los céntimos que la coma flotante corre salen exactos", () => {
    // 0.1 + 0.2 no es 0.3 en coma flotante; en céntimos enteros, 10 + 20 sí es 30.
    expect(decimalDeCentimos(10 + 20)).toBe("0.30");
    expect(decimalDeCentimos(1999999)).toBe("19999.99");
  });

  it("no adivina un monto que no es un entero de céntimos", () => {
    expect(() => decimalDeCentimos(10.5)).toThrow();
    expect(() => decimalDeCentimos(Number.NaN)).toThrow();
  });
});

describe("paraCargar: lo que se le manda a cargar_lineas_banco", () => {
  it("arma una línea con las claves y los formatos que espera la base", () => {
    const [l] = paraCargar({ lineas: [linea({ orden: 7, centimos: -25000, saldoCentimos: 80000, operacion: "7654321", codigo: "6362", descripcion: "CARGO  TRANSFERENCIA  PRUEBA " })] });
    expect(l).toEqual({
      orden: 7,
      fecha: "2026-10-05",
      fecha_proceso: "2026-10-05",
      correlativo: "00262780001",
      codigo: "6362",
      operacion: "7654321",
      descripcion: "CARGO TRANSFERENCIA PRUEBA",
      monto: "-250.00",
      saldo: "800.00",
      firme: true,
    });
  });

  it("lo que el banco no trae viaja nulo, no vacío ni en cero", () => {
    const [l] = paraCargar({ lineas: [linea({ fechaProceso: null, correlativo: null, codigo: null, operacion: null, saldoCentimos: null, firme: false })] });
    expect(l).toMatchObject({ fecha_proceso: null, correlativo: null, codigo: null, operacion: null, saldo: null, firme: false });
  });

  it("no quita, no junta y no reordena: dos líneas idénticas siguen siendo dos", () => {
    const lineas = [linea({ orden: 0 }), linea({ orden: 1, correlativo: "00262780002" }), linea({ orden: 2, correlativo: "00262780003", centimos: 4590 })];
    const r = paraCargar({ lineas });
    expect(r.map((l) => l.orden)).toEqual([0, 1, 2]);
    expect(r.map((l) => l.monto)).toEqual(["10.00", "10.00", "45.90"]);
  });

  it("corta la glosa a las 120 letras que guarda la base", () => {
    const [l] = paraCargar({ lineas: [linea({ descripcion: "A".repeat(200) })] });
    expect(l.descripcion).toHaveLength(120);
  });

  it("una línea que el banco trae sin descripción no se pierde ni tumba el guardado: viaja con una marca", () => {
    const r = paraCargar({ lineas: [linea({ descripcion: "   " }), linea({ orden: 1, descripcion: "" })] });
    expect(r.map((l) => l.descripcion)).toEqual(["(sin descripción)", "(sin descripción)"]);
    expect(r.map((l) => l.monto)).toEqual(["10.00", "10.00"]);
  });

  it("sale del lector tal cual: una tabla pegada de la web llega sin número del banco y sin firmes", () => {
    const pegado = ["06/10/2026   07/10/2026   -   .   Abono QR IBK   S/ 45.90   S/ 145.90", "05/10/2026   05/10/2026   -   .   Abono QR IBK   S/ 100.00   S/ 100.00"].join("\n");
    const extracto = leerExtracto(pegado);
    const r = paraCargar(extracto);
    expect(r).toHaveLength(2);
    expect(r.every((l) => !l.firme && l.correlativo === null && l.fecha_proceso === null)).toBe(true);
    expect(r.map((l) => [l.fecha, l.monto, l.saldo])).toEqual([
      ["2026-10-05", "100.00", "100.00"],
      ["2026-10-06", "45.90", "145.90"],
    ]);
    expect(fuenteDe(extracto)).toBe("tabla_web");
  });
});

describe("fuenteDe: de dónde vino el extracto", () => {
  it("es el .txt de la banca si alguna línea es firme", () => {
    expect(fuenteDe({ lineas: [linea({ firme: false, correlativo: null, fechaProceso: null }), linea({})] })).toBe("ibk_txt");
  });
  it("es el .txt si todas son provisionales pero traen el número del banco", () => {
    expect(fuenteDe({ lineas: [linea({ firme: false, correlativo: "00000090004" })] })).toBe("ibk_txt");
  });
  it("es la tabla copiada si ninguna trae número del banco", () => {
    expect(fuenteDe({ lineas: [linea({ firme: false, correlativo: null, fechaProceso: null })] })).toBe("tabla_web");
  });
});

describe("cuentaDelArchivo: de qué cuenta es lo leído, antes de guardar", () => {
  const TXT = { lineas: [linea({})] };
  it("el .txt de una sola cuenta: se guarda, viaja la cuenta entera y a la persona se le dice en qué termina", () => {
    expect(cuentaDelArchivo({ ...TXT, cuentas: ["00100200300400500600789"] }, BANCO)).toEqual({
      ok: true,
      cuenta: "00100200300400500600789",
      frase: "Este archivo es de la cuenta terminada en 0789: fíjate que sea Banco de Prueba.",
    });
  });
  it("un archivo con renglones de dos cuentas no se guarda, y dice cuáles", () => {
    const r = cuentaDelArchivo({ ...TXT, cuentas: ["00100200300400500600789", "00100200300400500601234"] }, BANCO);
    expect(r.ok).toBe(false);
    expect(r).toMatchObject({ motivo: expect.stringContaining("2 cuentas (terminadas en 0789, 1234)") });
  });
  it("un .txt que no dice su cuenta no se guarda", () => {
    const r = cuentaDelArchivo({ ...TXT, cuentas: [] }, BANCO);
    expect(r).toMatchObject({ ok: false, motivo: expect.stringContaining("No pude leer de qué cuenta es") });
  });
  it("la tabla pegada no lo dice: se guarda sin cuenta y se avisa", () => {
    const pegada = { lineas: [linea({ firme: false, correlativo: null, fechaProceso: null })], cuentas: [] };
    expect(cuentaDelArchivo(pegada, BANCO)).toEqual({ ok: true, cuenta: null, frase: "Lo que pegaste no dice de qué cuenta es: fíjate que lo hayas copiado de Banco de Prueba." });
  });
  it("recorre las cuatro salidas: solo guarda con una cuenta o con la tabla pegada, y nunca muestra la cuenta entera", () => {
    const larga = "00100200300400500600789";
    const casos = [
      cuentaDelArchivo({ ...TXT, cuentas: [larga] }, BANCO),
      cuentaDelArchivo({ ...TXT, cuentas: [larga, "00100200300400500601234"] }, BANCO),
      cuentaDelArchivo({ ...TXT, cuentas: [] }, BANCO),
      cuentaDelArchivo({ lineas: [linea({ firme: false, correlativo: null, fechaProceso: null })], cuentas: [] }, BANCO),
    ];
    expect(casos.map((c) => c.ok)).toEqual([true, false, false, true]);
    for (const c of casos) expect(c.ok ? c.frase : c.motivo).not.toContain(larga);
  });
  it("sale del lector: el .txt armado con las columnas del banco dice su cuenta y lo pegado no", () => {
    const renglon = `${" ".repeat(12)}${"00100200300400500600789"}${". Abono QR IBK".padEnd(28)}1402${"-".padStart(8)}${" ".repeat(13)}${"".padStart(17)}${"45.90".padStart(17)}${"145.90".padStart(17)}${" ".repeat(17)}202610062026100600262790001`;
    const leido = leerExtracto(renglon);
    expect(leido.lineas).toHaveLength(1);
    expect(cuentaDelArchivo(leido, BANCO)).toMatchObject({ ok: true, cuenta: "00100200300400500600789" });
    expect(cuentaDelArchivo(leerExtracto("06/10/2026   07/10/2026   -   .   Abono QR IBK   S/ 45.90   S/ 145.90"), BANCO)).toMatchObject({ ok: true, cuenta: null });
  });
});

describe("huellaDeArchivo: sha-256 del texto subido", () => {
  it("da las 64 letras hexadecimales del sha-256 (valor conocido)", async () => {
    expect(await huellaDeArchivo("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
  it("el mismo texto da la misma huella, y una letra distinta, otra", async () => {
    const a = await huellaDeArchivo("línea uno\nlínea dos");
    expect(await huellaDeArchivo("línea uno\nlínea dos")).toBe(a);
    expect(await huellaDeArchivo("línea uno\nlínea tres")).not.toBe(a);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("fraseDeCarga: el aviso al guardar", () => {
  const r = (o: Partial<ReturnType<typeof leerResultadoCarga> & object>) => ({ lineas: 0, nuevas: 0, repetidas: 0, confirmadas: 0, retiradasSinSucesora: 0, ...o });

  it("todo nuevo: solo dice cuántas guardó", () => {
    expect(fraseDeCarga(r({ lineas: 10, nuevas: 10 }))).toEqual({ titulo: "Guardé 10 líneas nuevas", detalle: null });
    expect(fraseDeCarga(r({ lineas: 1, nuevas: 1 }))).toEqual({ titulo: "Guardé 1 línea nueva", detalle: null });
  });

  it("el mismo archivo otra vez: nada nuevo y cuántas ya estaban", () => {
    expect(fraseDeCarga(r({ lineas: 10, repetidas: 10 }))).toEqual({ titulo: "No había líneas nuevas", detalle: "10 ya estaban." });
    expect(fraseDeCarga(r({ lineas: 1, repetidas: 1 }))).toEqual({ titulo: "No había líneas nuevas", detalle: "1 ya estaba." });
  });

  it("mezcla: nuevas, repetidas, confirmadas y las que ya no vienen, en ese orden", () => {
    expect(fraseDeCarga(r({ lineas: 1136, nuevas: 401, repetidas: 732, confirmadas: 3, retiradasSinSucesora: 2 }))).toEqual({
      titulo: "Guardé 401 líneas nuevas",
      detalle: "732 ya estaban · 3 se confirmaron · 2 que estaban por confirmar ya no vienen en el banco.",
    });
    expect(fraseDeCarga(r({ lineas: 2, nuevas: 1, confirmadas: 1, retiradasSinSucesora: 1 })).detalle).toBe("1 se confirmó · 1 que estaba por confirmar ya no viene en el banco.");
  });

  it("los miles llevan su coma", () => {
    expect(fraseDeCarga(r({ lineas: 2500, nuevas: 1500, repetidas: 1000 }))).toEqual({ titulo: "Guardé 1,500 líneas nuevas", detalle: "1,000 ya estaban." });
  });

  it("lee lo que devuelve la base y no revienta con algo que no es un objeto", () => {
    expect(leerResultadoCarga({ carga_id: "x", lineas: 2, nuevas: 2, repetidas: 0, confirmadas: 0, retiradas_sin_sucesora: 1, desde: "2026-10-05", hasta: "2026-10-06" })).toEqual({
      lineas: 2,
      nuevas: 2,
      repetidas: 0,
      confirmadas: 0,
      retiradasSinSucesora: 1,
    });
    expect(leerResultadoCarga(null)).toBeNull();
    expect(leerResultadoCarga("ok")).toBeNull();
    expect(leerResultadoCarga([])).toBeNull();
  });
});

// La forma real que devuelve `fn_banco_cuadre` (tomada de la pila local, con montos inventados).
const JSON_CON_EXTRACTO = {
  hay_extracto: true,
  cuenta_id: "00000000-0000-0000-0000-000000000001",
  piso: "2026-10-05",
  corte: null,
  banco: { saldo: 135.5, al: "2026-10-06" },
  erp: { saldo: 100.0 },
  diferencia: 35.5,
  ancla: { banco: 100.0, erp: 100.0, diferencia: 0.0 },
  lineas_desde_piso: 2,
  lineas_historia: 0,
  por_confirmar: 1,
  huecos: 0,
  entra: 35.5,
  sale: 0,
  por_codigo: [
    { codigo: "6462", glosa: "ABONO TRANSFERENCIA", n: 1, entra: 25.5, sale: 0 },
    { codigo: "1402", glosa: ". Abono QR IBK", n: 1, entra: 10.0, sale: 0 },
  ],
  ultima_carga: { id: "x", cuando: "2026-11-09T23:40:00+00:00", por: "Ana Prueba", fuente: "ibk_txt", desde: "2026-10-05", hasta: "2026-10-06", lineas: 2, nuevas: 2, repetidas: 0, confirmadas: 0 },
};
const JSON_SIN_EXTRACTO = {
  hay_extracto: false,
  cuenta_id: "00000000-0000-0000-0000-000000000001",
  piso: "2026-10-05",
  corte: null,
  banco: null,
  erp: null,
  diferencia: null,
  ancla: null,
  lineas_desde_piso: null,
  lineas_historia: null,
  por_confirmar: null,
  huecos: null,
  entra: null,
  sale: null,
  por_codigo: null,
  ultima_carga: null,
};

const cuadre = (o: Partial<CuadreBanco> = {}): CuadreBanco => ({ ...leerCuadreBanco(JSON_CON_EXTRACTO)!, ...o });

describe("leerCuadreBanco: el JSON de fn_banco_cuadre", () => {
  it("lee los dos saldos, la diferencia y los contadores, con los montos en céntimos enteros", () => {
    expect(leerCuadreBanco(JSON_CON_EXTRACTO)).toEqual({
      hayExtracto: true,
      piso: "2026-10-05",
      banco: { saldoCentimos: 13550, al: "2026-10-06" },
      erpCentimos: 10000,
      diferenciaCentimos: 3550,
      ancla: { bancoCentimos: 10000, erpCentimos: 10000, diferenciaCentimos: 0 },
      lineasDesdePiso: 2,
      lineasHistoria: 0,
      porConfirmar: 1,
      huecos: 0,
      entraCentimos: 3550,
      saleCentimos: 0,
      porCodigo: [
        { codigo: "6462", glosa: "ABONO TRANSFERENCIA", n: 1, entraCentimos: 2550, saleCentimos: 0 },
        { codigo: "1402", glosa: ". Abono QR IBK", n: 1, entraCentimos: 1000, saleCentimos: 0 },
      ],
      ultimaCarga: { cuando: "2026-11-09T23:40:00+00:00", por: "Ana Prueba", fuente: "ibk_txt", desde: "2026-10-05", hasta: "2026-10-06", lineas: 2, nuevas: 2 },
    });
  });

  it("sin líneas guardadas: no hay extracto, y nada se convierte en un cero que parezca dato", () => {
    const c = leerCuadreBanco(JSON_SIN_EXTRACTO)!;
    expect(c.hayExtracto).toBe(false);
    expect(c.banco).toBeNull();
    expect(c.erpCentimos).toBeNull();
    expect(c.diferenciaCentimos).toBeNull();
    expect(c.ancla).toBeNull();
    expect(c.porCodigo).toEqual([]);
    expect(c.ultimaCarga).toBeNull();
    expect(c.piso).toBe("2026-10-05");
  });

  it("un monto que llega como 700.00, como 0 o como texto se lee igual; los céntimos no se corren", () => {
    const c = leerCuadreBanco({ ...JSON_CON_EXTRACTO, banco: { saldo: "1234.56", al: "2026-10-06" }, erp: { saldo: 0 }, diferencia: 1234.56, sale: 700.0, entra: 0.29 })!;
    expect(c.banco?.saldoCentimos).toBe(123456);
    expect(c.erpCentimos).toBe(0);
    expect(c.diferenciaCentimos).toBe(123456);
    expect(c.saleCentimos).toBe(70000);
    expect(c.entraCentimos).toBe(29);
  });

  it("lo que no es un monto no se vuelve cero ni un sol: queda vacío", () => {
    for (const raro of ["", "  ", [], false, true, {}, "1e3", "12,50", "NaN", Number.NaN, Number.POSITIVE_INFINITY]) {
      const c = leerCuadreBanco({ ...JSON_CON_EXTRACTO, banco: { saldo: raro, al: "2026-10-06" }, erp: { saldo: raro }, diferencia: raro, ancla: { banco: raro, erp: 100, diferencia: 0 } })!;
      expect(c.banco?.saldoCentimos).toBeNull();
      expect(c.erpCentimos).toBeNull();
      expect(c.diferenciaCentimos).toBeNull();
      expect(c.ancla).toBeNull();
    }
    // Y sin saldos, la pantalla no dice que cuadra.
    expect(estadoDelCuadre(leerCuadreBanco({ ...JSON_CON_EXTRACTO, banco: { saldo: "", al: "2026-10-06" }, diferencia: "" })!, BANCO).clave).toBe("sin_saldo");
  });

  it("un monto negativo o escrito como texto se lee al céntimo", () => {
    const c = leerCuadreBanco({ ...JSON_CON_EXTRACTO, banco: { saldo: " -0.05 ", al: "2026-10-06" }, erp: { saldo: "19999.99" }, diferencia: -20000.04 })!;
    expect(c.banco?.saldoCentimos).toBe(-5);
    expect(c.erpCentimos).toBe(1999999);
    expect(c.diferenciaCentimos).toBe(-2000004);
  });

  it("el saldo del banco o el del ERP pueden faltar sin que falte el extracto", () => {
    const sinSaldo = leerCuadreBanco({ ...JSON_CON_EXTRACTO, banco: { saldo: null, al: "2026-10-06" }, diferencia: null, ancla: null })!;
    expect(sinSaldo.hayExtracto).toBe(true);
    expect(sinSaldo.banco).toEqual({ saldoCentimos: null, al: "2026-10-06" });
    const sinErp = leerCuadreBanco({ ...JSON_CON_EXTRACTO, erp: { saldo: null }, diferencia: null })!;
    expect(sinErp.erpCentimos).toBeNull();
  });

  it("lo que no es la respuesta esperada da nulo: la pantalla lo dice en vez de dibujar ceros", () => {
    expect(leerCuadreBanco(null)).toBeNull();
    expect(leerCuadreBanco([])).toBeNull();
    expect(leerCuadreBanco({})).toBeNull();
    expect(leerCuadreBanco("x")).toBeNull();
  });
});

describe("estadoDelCuadre: ¿coincide el banco con el ERP?", () => {
  it("diferencia cero: cuadra, y dice a qué día", () => {
    const e = estadoDelCuadre(cuadre({ erpCentimos: 13550, diferenciaCentimos: 0 }), BANCO);
    expect(e).toMatchObject({ clave: "cuadra", tono: "verde", chip: "Cuadra al 6 oct" });
  });

  it("con diferencia: dice por cuánto, sin signo, y no promete más que el paso siguiente", () => {
    expect(estadoDelCuadre(cuadre(), BANCO)).toEqual({
      clave: "no_cuadra",
      tono: "ambar",
      chip: "No cuadra",
      frase: "No cuadra por S/ 35.50: lo vas a ver línea por línea en el próximo paso.",
    });
    expect(estadoDelCuadre(cuadre({ diferenciaCentimos: -432110 }), BANCO).frase).toBe("No cuadra por S/ 4,321.10: lo vas a ver línea por línea en el próximo paso.");
  });

  it("un céntimo de diferencia ya no cuadra: no hay tolerancia", () => {
    expect(estadoDelCuadre(cuadre({ diferenciaCentimos: 1 }), BANCO).clave).toBe("no_cuadra");
    expect(estadoDelCuadre(cuadre({ diferenciaCentimos: -1 }), BANCO).clave).toBe("no_cuadra");
  });

  it("sin extracto guardado: el saldo es lo anotado, no está probado", () => {
    const e = estadoDelCuadre(leerCuadreBanco(JSON_SIN_EXTRACTO)!, BANCO);
    expect(e).toEqual({ clave: "sin_extracto", tono: "pizarra", chip: "Sin extracto guardado", frase: "El saldo de Banco de Prueba es lo que anotaste, no está probado." });
  });

  it("lo guardado no trae saldos: no compara ni dice que cuadra", () => {
    expect(estadoDelCuadre(cuadre({ banco: { saldoCentimos: null, al: "2026-10-06" }, diferenciaCentimos: null }), BANCO)).toMatchObject({ clave: "sin_saldo", tono: "pizarra" });
  });

  it("todo lo guardado es de antes de que la cuenta empezara en el ERP: tampoco compara", () => {
    expect(estadoDelCuadre(cuadre({ erpCentimos: null, diferenciaCentimos: null }), BANCO)).toMatchObject({ clave: "sin_erp", tono: "pizarra" });
  });

  it("recorre todos los estados: cada uno trae su insignia y su frase, y solo «cuadra» va en verde", () => {
    const casos = [
      estadoDelCuadre(leerCuadreBanco(JSON_SIN_EXTRACTO)!, BANCO),
      estadoDelCuadre(cuadre({ banco: { saldoCentimos: null, al: "2026-10-06" }, diferenciaCentimos: null }), BANCO),
      estadoDelCuadre(cuadre({ erpCentimos: null, diferenciaCentimos: null }), BANCO),
      estadoDelCuadre(cuadre({ diferenciaCentimos: 0 }), BANCO),
      estadoDelCuadre(cuadre(), BANCO),
    ];
    expect(casos.map((c) => c.clave)).toEqual(["sin_extracto", "sin_saldo", "sin_erp", "cuadra", "no_cuadra"]);
    for (const c of casos) {
      expect(c.chip.length).toBeGreaterThan(0);
      expect(c.frase.length).toBeGreaterThan(0);
      expect(c.tono === "verde").toBe(c.clave === "cuadra");
      // Lenguaje de tienda: la palabra del contador no llega a la pantalla.
      expect(`${c.chip} ${c.frase}`.toLowerCase()).not.toContain("concilia");
    }
  });
});

describe("ladoDeLaDiferencia: quién tiene más", () => {
  it("positivo = el banco tiene más; negativo = el ERP tiene más", () => {
    expect(ladoDeLaDiferencia(3550)).toBe("El banco tiene más que tu ERP.");
    expect(ladoDeLaDiferencia(-3550)).toBe("Tu ERP tiene más que el banco.");
    expect(ladoDeLaDiferencia(0)).toBe("Ni un céntimo de diferencia.");
    expect(ladoDeLaDiferencia(null)).toBeNull();
  });
});

describe("fraseDelAncla: el punto de partida", () => {
  it("partieron del mismo saldo", () => {
    expect(fraseDelAncla(cuadre())).toBe("Partieron del mismo saldo: el 5 oct los dos abrían con S/ 100.00.");
  });

  it("ya diferían al abrir, y lo guardado trae lo de antes: se afirma", () => {
    expect(fraseDelAncla(cuadre({ lineasHistoria: 12, ancla: { bancoCentimos: 122866, erpCentimos: 100000, diferenciaCentimos: 22866 } }))).toBe(
      "El punto de partida ya difería: el 5 oct el banco abría con S/ 1,228.66 y tu ERP con S/ 1,000.00.",
    );
  });

  it("no coincide y lo guardado no trae nada de antes: no asegura que el saldo del banco sea el de ese día", () => {
    const f = fraseDelAncla(cuadre({ lineasHistoria: 0, ancla: { bancoCentimos: 122866, erpCentimos: 100000, diferenciaCentimos: 22866 } }));
    expect(f).toContain("antes de la primera línea guardada el banco tenía S/ 1,228.66");
    expect(f).toContain("sube uno que lo cubra");
  });

  it("sin ancla o sin piso no dice nada", () => {
    expect(fraseDelAncla(cuadre({ ancla: null }))).toBeNull();
    expect(fraseDelAncla(cuadre({ piso: null }))).toBeNull();
  });

  it("con la cadena de saldos cortada no afirma un punto de partida: esa resta da un número que el banco nunca tuvo", () => {
    const difiere = { bancoCentimos: 122866, erpCentimos: 100000, diferenciaCentimos: 22866 };
    expect(fraseDelAncla(cuadre({ huecos: 17, lineasHistoria: 12, ancla: difiere }))).toBeNull();
    expect(fraseDelAncla(cuadre({ huecos: 1 }))).toBeNull();
    expect(fraseDelAncla(cuadre({ huecos: 0, lineasHistoria: 12, ancla: difiere }))).not.toBeNull();
  });
});

describe("fraseDeLineas, fraseDePorConfirmar y fraseDeHuecos", () => {
  it("cuenta las líneas desde el piso y, aparte, las de antes", () => {
    expect(fraseDeLineas(cuadre())).toBe("2 líneas desde el 5 oct");
    expect(fraseDeLineas(cuadre({ lineasDesdePiso: 401, lineasHistoria: 735 }))).toBe("401 líneas desde el 5 oct · 735 de antes, guardadas como historia");
    expect(fraseDeLineas(cuadre({ lineasDesdePiso: 1, lineasHistoria: 1 }))).toBe("1 línea desde el 5 oct · 1 de antes, guardada como historia");
    expect(fraseDeLineas(cuadre({ piso: null, lineasDesdePiso: 1200 }))).toBe("1,200 líneas guardadas");
  });

  it("las que siguen sin confirmar: nada si no hay; singular y plural", () => {
    expect(fraseDePorConfirmar(0)).toBeNull();
    expect(fraseDePorConfirmar(1)).toContain("1 línea sigue sin el número definitivo del banco");
    expect(fraseDePorConfirmar(76)).toContain("76 líneas siguen sin el número definitivo del banco");
    expect(fraseDePorConfirmar(1500)).toContain("1,500 líneas");
  });

  it("las que siguen sin confirmar: la frase vale también para lo pegado de la web, que el banco sí procesó", () => {
    for (const n of [1, 2]) {
      const f = fraseDePorConfirmar(n)!;
      // No afirma que el banco no las procesó ni que se confirman solas: lo pegado solo se confirma con el .txt.
      expect(f).not.toContain("El banco todavía no procesa");
      expect(f).not.toMatch(/se confirman? solas?/);
      expect(f).toContain("de la web");
      expect(f).toContain(".txt");
    }
  });

  it("la cadena cortada: nada si está completa; dice cuántas veces y qué hacer", () => {
    expect(fraseDeHuecos(cuadre())).toBeNull();
    expect(fraseDeHuecos(cuadre({ huecos: 1 }))).toContain("El saldo salta una vez desde el 5 oct");
    expect(fraseDeHuecos(cuadre({ huecos: 3, piso: null }))).toContain("El saldo salta 3 veces:");
  });

  it("la cadena cortada: lo primero que pide es el extracto que sigue (un mes que termina en fin de semana no está incompleto)", () => {
    const f = fraseDeHuecos(cuadre({ huecos: 17 }))!;
    expect(f).toContain("termina en fin de semana");
    expect(f).toContain("sube el extracto que cubra también esos días");
    expect(f).toContain("no se repite");
  });

  it("la cadena completa solo se afirma donde se midió: desde el piso, con líneas y con saldos", () => {
    expect(fraseDeCadenaCompleta(cuadre())).toBe("Desde el 5 oct no le falta ninguna línea: cada saldo sale del anterior.");
    expect(fraseDeCadenaCompleta(cuadre({ piso: null }))).toBe("No le falta ninguna línea: cada saldo sale del anterior.");
    // Todo lo guardado es historia: no se midió nada.
    expect(fraseDeCadenaCompleta(cuadre({ lineasDesdePiso: 0, lineasHistoria: 2 }))).toBeNull();
    // Con un salto, o sin saldos, tampoco.
    expect(fraseDeCadenaCompleta(cuadre({ huecos: 1 }))).toBeNull();
    expect(fraseDeCadenaCompleta(cuadre({ banco: { saldoCentimos: null, al: "2026-10-06" } }))).toBeNull();
    expect(fraseDeCadenaCompleta(cuadre({ banco: null }))).toBeNull();
  });
});

describe("fraseDeUltimaCarga: de qué subida salió", () => {
  const u = cuadre().ultimaCarga!;
  it("dice el día y la hora de Lima, quién, de dónde, el rango y cuántas eran nuevas", () => {
    // 23:40 UTC del 9 de noviembre son las 18:40 del 9 en Lima.
    expect(fraseDeUltimaCarga(u)).toBe("Última subida: 9 nov a las 18:40, por Ana Prueba · el .txt de la banca, del 5 oct al 6 oct · 2 líneas nuevas de 2.");
  });
  it("de madrugada en UTC sigue siendo el día anterior en Lima", () => {
    expect(fraseDeUltimaCarga({ ...u, cuando: "2026-11-10T02:05:00+00:00" })).toContain("Última subida: 9 nov a las 21:05");
  });
  it("sin nombre, de un solo día, pegada de la web y sin nada nuevo", () => {
    expect(fraseDeUltimaCarga({ ...u, por: null, fuente: "tabla_web", hasta: "2026-10-05", nuevas: 0 })).toBe("Última subida: 9 nov a las 18:40 · la tabla copiada de la web, del 5 oct · sin líneas nuevas.");
  });
});

describe("gruposDelBanco y grupoDeLinea: «qué trajo», con nombre de tienda", () => {
  it("cada código conocido tiene su nombre, y los dos del ITF son un solo grupo", () => {
    const g = gruposDelBanco([
      { codigo: "1402", glosa: ". Abono QR IBK", n: 90, entraCentimos: 450000, saleCentimos: 0 },
      { codigo: "6362", glosa: "CARGO TRANSFERENCIA PRUEBA", n: 5, entraCentimos: 0, saleCentimos: 300000 },
      { codigo: "0310", glosa: "ITF OPERACION: 1234567", n: 4, entraCentimos: 0, saleCentimos: 60 },
      { codigo: "4225", glosa: "PAGO ESTABLECIMENTOS VISA", n: 3, entraCentimos: 81240, saleCentimos: 0 },
      { codigo: "4434", glosa: "PAGO IZIPAY 005800001", n: 2, entraCentimos: 5230, saleCentimos: 0 },
      { codigo: "0311", glosa: "ITF OPERACION: 7654321", n: 2, entraCentimos: 0, saleCentimos: 15 },
      { codigo: "6462", glosa: "ABONO TRANSFERENCIA", n: 1, entraCentimos: 31500, saleCentimos: 0 },
    ]);
    expect(g.map((x) => [x.nombre, x.n])).toEqual([
      ["QR de Izipay", 90],
      ["ITF, el impuesto del banco por mover plata", 6],
      ["Transferencias que salieron", 5],
      ["Vendemás", 3],
      ["Tarjeta de Izipay", 2],
      ["Transferencias que entraron", 1],
    ]);
    expect(g.find((x) => x.clave === "itf")).toMatchObject({ entraCentimos: 0, saleCentimos: 75 });
  });

  it("no pierde ni inventa plata al juntar: las sumas son las de la base", () => {
    const porCodigo = [
      { codigo: "0310", glosa: "ITF", n: 4, entraCentimos: 0, saleCentimos: 60 },
      { codigo: "0311", glosa: "ITF", n: 2, entraCentimos: 5, saleCentimos: 15 },
      { codigo: "9999", glosa: "COMISION MANTENIMIENTO", n: 1, entraCentimos: 0, saleCentimos: 1000 },
    ];
    const g = gruposDelBanco(porCodigo);
    const suma = (k: "n" | "entraCentimos" | "saleCentimos", xs: readonly { n: number; entraCentimos: number; saleCentimos: number }[]) => xs.reduce((s, x) => s + x[k], 0);
    for (const k of ["n", "entraCentimos", "saleCentimos"] as const) expect(suma(k, g)).toBe(suma(k, porCodigo));
  });

  it("un código que no está en la tabla se nombra por la glosa si es de una máquina; si no, con lo que escribió el banco", () => {
    expect(grupoDeLinea("7777", "PAGO ESTABLECIMIENTOS VISA WEB").nombre).toBe("Vendemás");
    expect(grupoDeLinea("9999", "COMISION   MANTENIMIENTO ")).toEqual({ clave: "codigo:9999", nombre: "COMISION MANTENIMIENTO" });
    expect(grupoDeLinea("9999", "  ").nombre).toBe("Movimiento 9999 del banco");
  });

  it("el código manda sobre la glosa: el banco puede recortarla o cambiarla", () => {
    expect(grupoDeLinea("1402", "ABONO").nombre).toBe("QR de Izipay");
    expect(grupoDeLinea(" 6362 ", "CARGO TRANSF").clave).toBe("transferencia_sale");
  });

  it("sin código (la tabla copiada de la web) es un solo grupo que no se nombra por una glosa de muestra", () => {
    expect(grupoDeLinea(null, ". Abono QR IBK")).toEqual({ clave: "sin_codigo", nombre: "Copiado de la web del banco (sin tipo)" });
    expect(grupoDeLinea("", "PAGO IZIPAY 005800001").clave).toBe("sin_codigo");
  });

  it("es estable: la misma entrada da siempre lo mismo, y no cambia lo que recibe", () => {
    const porCodigo = [
      { codigo: "1402", glosa: ". Abono QR IBK", n: 1, entraCentimos: 1000, saleCentimos: 0 },
      { codigo: "6462", glosa: "ABONO TRANSFERENCIA", n: 1, entraCentimos: 2550, saleCentimos: 0 },
    ];
    const copia = structuredClone(porCodigo);
    expect(gruposDelBanco(porCodigo)).toEqual(gruposDelBanco(porCodigo));
    expect(porCodigo).toEqual(copia);
    // Empate en cantidad: se conserva el orden en que los mandó la base.
    expect(gruposDelBanco(porCodigo).map((x) => x.clave)).toEqual(["qr_izipay", "transferencia_entra"]);
  });
});
