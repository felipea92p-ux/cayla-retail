import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AVISOS_CADA_MS,
  avisoDeFalla,
  confianzaDelDato,
  conTope,
  contenidoDeAnalisis,
  crearFrenoDeAvisos,
  datosDe,
  hayCuentas,
  miTiendaSinLeer,
  fallasSinMiTienda,
  notaDeFallas,
  TEXTO_TIENDA_SIN_LEER,
  tituloTiendaSinLeer,
  textoSiVacio,
  TOPE_LECTURA_MS,
  type ContenidoAnalisis,
  type ResultadoLectura,
} from "./analisis-con-tope";
import { VISTAS_ANALISIS } from "./analisis-tipos";

const ID_TIENDA = "11111111-2222-3333-4444-555555555555";

describe("conTope", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("si la promesa responde antes del tope, da su valor y no deja ningún reloj colgado", async () => {
    const r = await conTope(Promise.resolve("datos"), 1000, "falla");
    expect(r).toBe("datos");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("si no responde, da el valor de falla cuando vence el tope y ni un milisegundo antes", async () => {
    let listo = false;
    const espera = conTope(new Promise<string>(() => {}), 1000, "falla").then((v) => {
      listo = true;
      return v;
    });
    await vi.advanceTimersByTimeAsync(999);
    expect(listo).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await espera).toBe("falla");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("una lectura lenta pero dentro del tope no se corta", async () => {
    const lenta = new Promise<string>((resolver) => setTimeout(() => resolver("a tiempo"), 3_800));
    const espera = conTope(lenta, TOPE_LECTURA_MS, "falla");
    await vi.advanceTimersByTimeAsync(3_800);
    expect(await espera).toBe("a tiempo");
  });

  it("si la promesa falla antes del tope, el error sale tal cual y el reloj se apaga", async () => {
    const error = new Error("la base dijo que no");
    await expect(conTope(Promise.reject(error), 1000, "falla")).rejects.toBe(error);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("si la promesa falla DESPUÉS del tope, no queda un rechazo sin atender", async () => {
    let rechazar!: (e: Error) => void;
    const tarde = new Promise<string>((_, r) => (rechazar = r));
    const espera = conTope(tarde, 1000, "falla");
    await vi.advanceTimersByTimeAsync(1000);
    expect(await espera).toBe("falla");
    rechazar(new Error("tarde"));
    await vi.advanceTimersByTimeAsync(0); // si quedara sin atender, vitest haría fallar la corrida
  });

  it("el tope es menor que los 8 s del statement_timeout del rol authenticated y mayor que lo más lento medido (3,8 s)", () => {
    expect(TOPE_LECTURA_MS).toBeLessThan(8_000);
    expect(TOPE_LECTURA_MS).toBeGreaterThan(3_800);
  });
});

describe("crearFrenoDeAvisos", () => {
  it("avisa la primera vez, calla durante la hora y vuelve a avisar pasada", () => {
    let t = 1_000_000;
    const puede = crearFrenoDeAvisos(AVISOS_CADA_MS, () => t);
    expect(puede("sede")).toBe(true);
    t += 30 * 60 * 1000;
    expect(puede("sede")).toBe(false);
    t += AVISOS_CADA_MS - 30 * 60 * 1000 - 1;
    expect(puede("sede")).toBe(false);
    t += 1;
    expect(puede("sede")).toBe(true);
    expect(puede("sede")).toBe(false);
  });

  it("cada pieza lleva su propia cuenta: una caída que toca 11 piezas avisa 11 veces la primera vez y ninguna después", () => {
    const puede = crearFrenoDeAvisos(AVISOS_CADA_MS, () => 5);
    const piezas = ["sede", "por_llegar", "rinde", "frescura", "conteos"];
    expect(piezas.map(puede)).toEqual([true, true, true, true, true]);
    expect(piezas.map(puede)).toEqual([false, false, false, false, false]);
  });

  it("un reloj que retrocede no deja a una pieza callada horas", () => {
    let t = 10 * AVISOS_CADA_MS;
    const puede = crearFrenoDeAvisos(AVISOS_CADA_MS, () => t);
    expect(puede("sede")).toBe(true);
    t -= 5 * AVISOS_CADA_MS;
    expect(puede("sede")).toBe(true);
  });
});

describe("avisoDeFalla: lo que viaja a Sentry lleva ids y códigos, nunca nombres", () => {
  it("agrupa por pieza (`analisis.<pieza>`) y lleva la tienda por su id", () => {
    const a = avisoDeFalla("sede", "tope_vencido", 7012.6, { ubicacion_id: ID_TIENDA });
    expect(a.donde).toBe("analisis.sede");
    expect(a.error.message).toBe("Análisis: la lectura no respondió a tiempo");
    expect(a.contexto).toEqual({ pieza: "sede", motivo: "tope_vencido", ms: 7013, tope_ms: TOPE_LECTURA_MS, ubicacion_id: ID_TIENDA });
  });

  it("la lectura lenta se agrupa aparte de las que fallan", () => {
    expect(avisoDeFalla("sede", "lenta", 3200, { ubicacion_id: ID_TIENDA }).donde).toBe("analisis.sede.lenta");
    for (const motivo of ["error", "sin_datos", "tope_vencido"] as const) expect(avisoDeFalla("sede", motivo, 10).donde).toBe("analisis.sede");
  });

  it("el mensaje es fijo por motivo: lo que dijo la base NO se copia", () => {
    const dijoLaBase = { code: "P0001", message: "El cliente Juana Pérez (DNI 45678912) no tiene permiso en Tienda Lima" };
    const a = avisoDeFalla("rinde", "error", 120, { ubicacion_id: ID_TIENDA }, dijoLaBase);
    const todo = JSON.stringify({ m: a.error.message, c: a.contexto, cod: (a.error as Error & { code?: string }).code });
    expect(todo).not.toMatch(/Juana|Pérez|45678912|Tienda Lima|permiso/);
    expect(a.error.message).toBe("Análisis: la lectura falló");
  });

  it("del error de quien falló solo sale su código (SQLSTATE) y el de su causa de red", () => {
    const base = avisoDeFalla("sede", "error", 8000, {}, { code: "57014", message: "canceling statement due to statement timeout" });
    expect((base.error as Error & { code?: string }).code).toBe("57014");
    const red = avisoDeFalla("sede", "error", 30, {}, Object.assign(new TypeError("fetch failed"), { cause: { code: "UND_ERR_CONNECT_TIMEOUT", message: "connect a 10.0.0.1" } }));
    expect(red.error.cause).toEqual({ code: "UND_ERR_CONNECT_TIMEOUT" });
    expect(JSON.stringify(red)).not.toContain("10.0.0.1");
  });

  it("un corte de red con la forma REAL de postgrest-js: el código sale de `details`, el resto (host, causa, mensaje) no", () => {
    // postgrest-js no lanza un TypeError con `cause`: devuelve `{ message, details, hint, code: "" }` y deja el código entre paréntesis.
    const caida = {
      message: "TypeError: fetch failed",
      details: "TypeError: fetch failed\n\nCaused by: Error: getaddrinfo ENOTFOUND vovjyyiafkxteijimpuy.supabase.co (ENOTFOUND)\nError: getaddrinfo ENOTFOUND vovjyyiafkxteijimpuy.supabase.co\n    at GetAddrInfoReqWrap.onlookup",
      hint: "",
      code: "",
    };
    const a = avisoDeFalla("sede", "error", 31, { ubicacion_id: ID_TIENDA }, caida);
    expect((a.error as Error & { code?: string }).code).toBe("ENOTFOUND");
    expect(JSON.stringify({ m: a.error.message, c: a.contexto, cod: (a.error as Error & { code?: string }).code })).not.toMatch(/supabase\.co|getaddrinfo|fetch failed/);
  });

  it("un `details` sin la línea «Caused by» (un 520 con el cuerpo de Cloudflare, una frase) no pone ningún código", () => {
    for (const malo of [{ message: "<html>error code: 520</html>" }, { message: "x", details: "", code: "" }, { message: "x", details: "Caused by: algo raro (con espacios)", code: "" }, { message: "x", details: 42, code: "" }]) {
      expect((avisoDeFalla("sede", "error", 5, {}, malo).error as Error & { code?: string }).code).toBeUndefined();
    }
  });

  it("un «código» que en realidad es una frase se descarta", () => {
    const a = avisoDeFalla("sede", "error", 5, {}, { code: "Juana Pérez no existe" });
    expect((a.error as Error & { code?: string }).code).toBeUndefined();
  });

  it("solo viajan ids con forma de uuid: un nombre, un DNI o una clave rara se descartan", () => {
    const a = avisoDeFalla("sede", "error", 5, {
      ubicacion_id: ID_TIENDA,
      tienda: "Tienda Lima",
      dni: "45678912",
      "Nombre Cliente": ID_TIENDA,
      otro_id: "no-es-un-uuid",
    });
    expect(a.contexto).toEqual({ pieza: "sede", motivo: "error", ms: 5, tope_ms: TOPE_LECTURA_MS, ubicacion_id: ID_TIENDA });
  });

  it("los cuatro motivos tienen su frase y ninguna lleva números ni nombres", () => {
    for (const motivo of ["error", "sin_datos", "tope_vencido", "lenta"] as const) {
      const { error } = avisoDeFalla("frescura", motivo, 1);
      expect(error.message).toMatch(/^Análisis: la lectura /);
      expect(error.message).not.toMatch(/\d/);
    }
  });
});

describe("la tienda activa no se pudo leer", () => {
  const datos = (sedesSinLeer: string[]) => ({ sede: { id: "tru" }, sedesSinLeer });

  it("solo si LA MÍA está entre las que no respondieron", () => {
    expect(miTiendaSinLeer(datos([]))).toBe(false);
    expect(miTiendaSinLeer(datos(["aqp", "lim"]))).toBe(false);
    expect(miTiendaSinLeer(datos(["lim", "tru"]))).toBe(true);
  });

  it("el texto dice «No se pudo leer <tu tienda>», nunca «sin ventas», y manda a no decidir; el botón es «Volver a intentar»", () => {
    expect(tituloTiendaSinLeer("Tienda Lima")).toBe("No se pudo leer Tienda Lima");
    expect(TEXTO_TIENDA_SIN_LEER.accion).toBe("Volver a intentar");
    const todo = `${tituloTiendaSinLeer("Tienda Lima")} ${TEXTO_TIENDA_SIN_LEER.linea} ${TEXTO_TIENDA_SIN_LEER.corto}`.toLowerCase();
    expect(todo).not.toContain("sin ventas");
    expect(todo).toContain("no decidas");
    // Una sola voz: ni «No pude» mezclado con «No se pudo» (Felipe 2026-10-16, prueba con una compradora).
    expect(todo).not.toContain("no pude");
  });

  it("una lista de mi tienda que sale vacía dice que no se pudo leer solo si la tienda no se leyó (Todavía no, Hoy)", () => {
    expect(textoSiVacio(datos(["tru"]), "Sin prendas en el sistema.")).toBe(TEXTO_TIENDA_SIN_LEER.corto);
    expect(textoSiVacio(datos(["aqp"]), "Sin prendas en el sistema.")).toBe("Sin prendas en el sistema.");
    expect(textoSiVacio(datos([]), "Sin ventas con su prenda en 30 días.")).toBe("Sin ventas con su prenda en 30 días.");
  });
});

describe("qué dice la pantalla (las decisiones de AnalisisPantalla)", () => {
  const SIN_LEER = [true, false];
  const RECOMIENDA = [true, false];

  it("recorre las 5 pestañas × tienda leída o no × se recomienda o no: «Todavía no» manda; si no, la tienda sin leer; si no, la pestaña", () => {
    const visto = new Map<string, ContenidoAnalisis>();
    for (const vista of VISTAS_ANALISIS) {
      for (const sinLeer of SIN_LEER) {
        for (const recomienda of RECOMIENDA) {
          const c = contenidoDeAnalisis({ recomienda, sinLeer, vista });
          visto.set(`${vista}|${sinLeer}|${recomienda}`, c);
          if (!recomienda) expect(c).toBe(vista === "hoy" ? "todavia-no-hoy" : "todavia-no-otra");
          else if (sinLeer) expect(c).toBe("tienda-sin-leer");
          else expect(c).toBe(vista);
        }
      }
    }
    expect(visto.size).toBe(VISTAS_ANALISIS.length * 4);
  });

  it("con la tienda sin leer y recomendando, las CINCO pestañas dicen que no se pudo leer (ninguna dibuja su lista vacía)", () => {
    expect(VISTAS_ANALISIS.map((vista) => contenidoDeAnalisis({ recomienda: true, sinLeer: true, vista }))).toEqual(Array(VISTAS_ANALISIS.length).fill("tienda-sin-leer"));
  });

  it("con la tienda leída y recomendando, cada pestaña es la suya (no se pierde ninguna)", () => {
    expect(VISTAS_ANALISIS.map((vista) => contenidoDeAnalisis({ recomienda: true, sinLeer: false, vista }))).toEqual([...VISTAS_ANALISIS]);
  });

  it("las cuentas de las pestañas («—») solo se dicen si se recomienda y la tienda se leyó", () => {
    expect(hayCuentas(true, false)).toBe(true);
    expect(hayCuentas(true, true)).toBe(false);
    expect(hayCuentas(false, false)).toBe(false);
    expect(hayCuentas(false, true)).toBe(false);
  });

  it("el chip no dice «confiable» junto a «no se pudo leer tu tienda»", () => {
    expect(confianzaDelDato(true, false)).toBe("confiable");
    expect(confianzaDelDato(false, false)).toBe("incompleto");
    expect(confianzaDelDato(true, true)).toBe("sin-leer");
    expect(confianzaDelDato(false, true)).toBe("sin-leer");
  });

  it("la nota de lo que no se pudo leer: nada si todo respondió; «Lo demás está al día» solo si la tienda activa sí se leyó", () => {
    expect(notaDeFallas([], false)).toBeNull();
    expect(notaDeFallas([], true)).toBeNull();
    expect(notaDeFallas(["No se pudo leer el último conteo"], false)).toBe("No se pudo leer el último conteo. Lo demás está al día.");
    expect(notaDeFallas(["No se pudieron leer las prendas de Tienda Trujillo", "No se pudo leer el último conteo"], false)).toBe(
      "No se pudieron leer las prendas de Tienda Trujillo. No se pudo leer el último conteo. Lo demás está al día.",
    );
    expect(notaDeFallas(["No se pudieron leer las prendas de Tienda Trujillo"], true)).toBe("No se pudieron leer las prendas de Tienda Trujillo.");
  });

  describe("la nota gris no repite lo que ya dice el aviso grande de «No se pudo leer <tu tienda>»", () => {
    const sedes = [
      { id: "lim", nombre: "Tienda Lima" },
      { id: "aqp", nombre: "Tienda AQP" },
      { id: "tru", nombre: "Tienda TRU" },
    ];
    const datos = (sedesSinLeer: string[]) => ({ sede: { id: "lim" }, sedes, sedesSinLeer });

    it("si solo falló mi tienda, su frase desaparece y la nota queda vacía (el aviso ya lo dice)", () => {
      const fallas = ["No se pudieron leer las prendas de Tienda Lima"];
      expect(fallasSinMiTienda(fallas, datos(["lim"]))).toEqual([]);
      expect(notaDeFallas(fallas, true, datos(["lim"]))).toBeNull();
    });

    it("si falló también otra tienda, queda su frase sin la mía; las demás fallas no se tocan", () => {
      const fallas = ["No se pudieron leer las prendas de Tienda Lima y Tienda AQP", "No se pudo leer el último conteo"];
      expect(fallasSinMiTienda(fallas, datos(["lim", "aqp"]))).toEqual(["No se pudieron leer las prendas de Tienda AQP", "No se pudo leer el último conteo"]);
      expect(notaDeFallas(fallas, true, datos(["lim", "aqp"]))).toBe("No se pudieron leer las prendas de Tienda AQP. No se pudo leer el último conteo.");
      // Con tres: «A, B y C» sin la mía queda «B y C».
      expect(fallasSinMiTienda(["No se pudieron leer las prendas de Tienda Lima, Tienda AQP y Tienda TRU"], datos(["lim", "aqp", "tru"]))).toEqual([
        "No se pudieron leer las prendas de Tienda AQP y Tienda TRU",
      ]);
    });

    it("sin avisar a la nota (el aviso grande no está a la vista: «Todavía no»), la falla de mi tienda se queda: es lo único que la dice", () => {
      const fallas = ["No se pudieron leer las prendas de Tienda Lima"];
      expect(notaDeFallas(fallas, true)).toBe("No se pudieron leer las prendas de Tienda Lima.");
    });

    it("si la mía SÍ se leyó (falló otra), la nota queda tal cual: solo se quita la falla de mi propia tienda", () => {
      const fallas = ["No se pudieron leer las prendas de Tienda AQP"];
      expect(fallasSinMiTienda(fallas, datos(["aqp"]))).toEqual(fallas);
    });

    it("una frase que no se reconoce (otro texto) se deja: sobra un aviso, nunca falta", () => {
      expect(fallasSinMiTienda(["Algo raro con Tienda Lima"], datos(["lim"]))).toEqual(["Algo raro con Tienda Lima"]);
      // Con otro nombre del que armó la frase (la lectura no pudo leer el nombre: «una tienda»), tampoco se adivina.
      expect(fallasSinMiTienda(["No se pudieron leer las prendas de una tienda"], datos(["lim"]))).toEqual(["No se pudieron leer las prendas de una tienda"]);
      expect(fallasSinMiTienda([], datos([]))).toEqual([]);
    });
  });
});

describe("el resultado común de una lectura", () => {
  it("datosDe da los datos solo si respondió bien (una lista vacía es un dato, no una falla)", () => {
    const ok: ResultadoLectura<string[]> = { estado: "ok", datos: [] };
    expect(datosDe(ok)).toEqual([]);
    for (const estado of ["sin_modulo", "no_se_pudo", "tope_vencido"] as const) {
      expect(datosDe<string[]>({ estado })).toBeNull();
    }
  });
});

describe("candado: las lecturas de Análisis no escriben en la consola, avisan por pieza", () => {
  // Un `console.error` suelto en una lectura es el aviso que se pierde: no llega a Sentry. Todo pasa por `leerPieza`. La lista NO está
  // escrita a mano: es todo `lib/analisis-*.ts` que abre la base (importa `@/lib/supabase/server`), así que un lector nuevo de A2, A7 o A11
  // entra solo. `analisis-lectura.ts` es la puerta misma (el aviso va por `capturarError`, y el texto de desarrollo por `console.warn`).
  const LIB = __dirname;
  const lectores = readdirSync(LIB)
    .filter((f) => /^analisis-.*\.ts$/.test(f) && !f.endsWith(".test.ts") && f !== "analisis-lectura.ts")
    .filter((f) => readFileSync(join(LIB, f), "utf8").includes("@/lib/supabase/server"));

  it("encuentra los cinco lectores de hoy (si la búsqueda se pierde, el candado no vigila nada)", () => {
    expect(lectores).toEqual(expect.arrayContaining(["analisis-datos.ts", "analisis-sede.ts", "analisis-liquidar.ts", "analisis-por-llegar.ts", "analisis-rinde.ts"]));
  });

  it("cada lector que abre la base pasa por leerPieza y no usa console.*", () => {
    for (const archivo of lectores) {
      const codigo = readFileSync(join(LIB, archivo), "utf8")
        .split("\n")
        .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
        .join("\n");
      expect(codigo, `${archivo} escribe en la consola`).not.toMatch(/console\.(error|warn|log)/);
      expect(codigo, `${archivo} no pasa por leerPieza`).toContain("leerPieza");
    }
  });
});
