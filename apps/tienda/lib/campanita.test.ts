import { describe, expect, it } from "vitest";
import {
  armarCampanita,
  cookieDeClave,
  cookieDelDia,
  diasEntre,
  etiquetaCampanita,
  leerDia,
  llegadasNuevas,
  type LlegadaViva,
  NOTIFICACIONES_EN_EL_PANEL,
  nombreCookieCampanita,
  novedadesDesde,
  textoDia,
  textoGlobo,
  textoLlegadasNuevas,
  textoNovedades,
} from "./campanita";

const HOY = { anio: 2026, mes: 10, dia: 17 };
const prenda = (dias: number | null | "no") => ({ nuevo: dias === "no" ? null : { dias } });

/** Una notificación del historial, tal como la devuelve la campanita: la clave, el tipo y la hora de recepción. */
const aviso = (n: number, recibidoEn: string, tipo: "llego" | "respuesta" = "llego") => ({
  clave: tipo === "llego" ? `llego-abcdef12-${n}` : `respuesta-abcdef12-${n}`,
  tipo,
  titulo: tipo === "llego" ? `Blusa ${n} ya llegó` : "CAYLA te respondió",
  texto: "Negro · Talla M. Hay en Trujillo: sepárala antes de que se acabe.",
  href: tipo === "llego" ? `/catalogo/modelo-${n}` : "/recomendaciones",
  recibidoEn,
});

describe("el día de la última mirada", () => {
  it("se escribe y se lee igual, y una cookie rara no cuenta como visita", () => {
    expect(textoDia({ anio: 2026, mes: 3, dia: 5 })).toBe("2026-03-05");
    expect(leerDia("2026-03-05")).toEqual({ anio: 2026, mes: 3, dia: 5 });
    for (const rara of [undefined, null, "", "ayer", "2026-3-5", "2026-02-30", "2026-13-01", "2026-10-17T10:00", "9999-99-99"]) expect(leerDia(rara)).toBeNull();
  });

  it("cuenta días de calendario, también entre meses y años, y sale negativo si el reloj anda atrasado", () => {
    expect(diasEntre({ anio: 2026, mes: 10, dia: 14 }, HOY)).toBe(3);
    expect(diasEntre({ anio: 2026, mes: 9, dia: 30 }, { anio: 2026, mes: 10, dia: 1 })).toBe(1);
    expect(diasEntre({ anio: 2025, mes: 12, dia: 31 }, { anio: 2026, mes: 1, dia: 1 })).toBe(1);
    expect(diasEntre(HOY, HOY)).toBe(0);
    expect(diasEntre(HOY, { anio: 2026, mes: 10, dia: 15 })).toBe(-2);
  });
});

describe("las novedades desde la última mirada", () => {
  it("sin mirada anterior no hay número: no se sabe qué es nuevo PARA ELLA (el primer globo no dice «298»)", () => {
    expect(novedadesDesde([prenda(0), prenda(3), prenda(20)], null, HOY)).toBeNull();
  });

  it("si miró hoy, 0 (aunque el catálogo traiga prendas de hoy: ya las vio o llegan mañana a la cuenta)", () => {
    expect(novedadesDesde([prenda(0), prenda(1)], HOY, HOY)).toBe(0);
  });

  it("cuenta solo lo que llegó DESPUÉS del día de la mirada: miró el 14, hoy es 17 → llegaron el 15, 16 y 17 (hace 2, 1 y 0 días), no el 14", () => {
    const visto = { anio: 2026, mes: 10, dia: 14 };
    const prendas = [prenda(0), prenda(1), prenda(2), prenda(3), prenda(4), prenda(30)];
    expect(novedadesDesde(prendas, visto, HOY)).toBe(3);
  });

  it("una prenda fijada en la Vitrina sin fecha, o que no es de Lo nuevo, no cuenta", () => {
    const visto = { anio: 2026, mes: 10, dia: 10 };
    expect(novedadesDesde([prenda(null), prenda("no"), prenda(1)], visto, HOY)).toBe(1);
  });

  it("con el reloj del aparato atrasado (mirada «en el futuro») no inventa novedades", () => {
    expect(novedadesDesde([prenda(0), prenda(1)], { anio: 2026, mes: 10, dia: 20 }, HOY)).toBe(0);
  });

  it("no depende del orden ni cambia el catálogo recibido", () => {
    const prendas = [prenda(5), prenda(0), prenda(2)];
    const copia = JSON.stringify(prendas);
    expect(novedadesDesde(prendas, { anio: 2026, mes: 10, dia: 14 }, HOY)).toBe(2);
    expect(JSON.stringify(prendas)).toBe(copia);
  });
});

describe("la cookie de la campanita", () => {
  it("es de cada persona (sus 8 primeras letras) para que dos personas en un aparato no se pisen", () => {
    expect(nombreCookieCampanita("ABCDEF12-3456-4789-8abc-def012345678")).toBe("tienda-campanita-abcdef12");
  });

  it("anota el día de hoy, vale en toda la tienda, dura 400 días y solo es «Secure» en https", () => {
    const http = cookieDelDia("tienda-campanita-abcdef12", HOY, false);
    expect(http).toBe("tienda-campanita-abcdef12=2026-10-17; Path=/; Max-Age=34560000; SameSite=Lax");
    expect(cookieDelDia("tienda-campanita-abcdef12", HOY, true)).toBe(`${http}; Secure`);
  });

  it("lo que escribe es lo que `leerDia` entiende", () => {
    const valor = /=([^;]+);/.exec(cookieDelDia("x", HOY, false))![1];
    expect(leerDia(valor)).toEqual(HOY);
  });

  it("las cookies de leído y de «visto en el panel» van por aviso, con el mismo formato", () => {
    expect(cookieDeClave("tienda-aviso-", "llego-abcdef12-1", false)).toBe(
      "tienda-aviso-llego-abcdef12-1=1; path=/; max-age=15552000; samesite=lax",
    );
    expect(cookieDeClave("tienda-panel-visto-", "llego-abcdef12-1", true)).toMatch(/; secure$/);
  });
});

describe("el panel de la campanita: las notificaciones más recientes", () => {
  it("muestra las notificaciones tal como llegan del historial: la más reciente primero, hasta cinco", () => {
    const recientes = [aviso(3, "2026-10-19T12:00:00Z"), aviso(2, "2026-10-19T11:00:00Z"), aviso(1, "2026-10-18T09:00:00Z", "respuesta")];
    const d = armarCampanita(recientes, recientes.map((a) => a.clave), 3, new Set(), null);
    expect(d.recientes.map((f) => f.clave)).toEqual(recientes.map((a) => a.clave));
    expect(d.hayMas).toBe(false);
  });

  it("nunca muestra más de cinco; si hay más, lo dice para ofrecer «Ver todas»", () => {
    const seis = [1, 2, 3, 4, 5, 6].map((n) => aviso(n, `2026-10-1${n}T10:00:00Z`));
    const d = armarCampanita(seis, seis.map((a) => a.clave), 6, new Set(), null);
    expect(d.recientes).toHaveLength(NOTIFICACIONES_EN_EL_PANEL);
    expect(d.hayMas).toBe(true);
    expect(d.globo).toBe(6);
  });

  it("la leída (clic) quita su punto; la vista al abrir el panel NO lo quita", () => {
    const recientes = [aviso(1, "2026-10-19T12:00:00Z"), aviso(2, "2026-10-19T11:00:00Z")];
    const claves = recientes.map((a) => a.clave);
    const d = armarCampanita(recientes, claves, 2, new Set([claves[0]]), null, new Set(claves));
    expect(d.recientes.map((f) => f.sinVer)).toEqual([false, true]);
    expect(d.globo).toBe(1);
  });

  it("el globo suma las notificaciones sin leer y las novedades; las que no están en el panel no cuentan", () => {
    const claves = ["llego-abcdef12-1", "llego-abcdef12-2", "respuesta-abcdef12-3"];
    const d = armarCampanita([], claves, 0, new Set(["llego-abcdef12-2"]), 4);
    expect(d.globo).toBe(2 + 4);
  });

  it("«Entendido» (abrir el panel) deja el globo oculto hasta que llegue una nueva; el punto y el número no cambian", () => {
    const recientes = [aviso(1, "2026-10-19T12:00:00Z"), aviso(2, "2026-10-19T11:00:00Z")];
    const claves = recientes.map((a) => a.clave);
    expect(armarCampanita(recientes, claves, 2, new Set(), null).pendientePanel).toBe(true);
    const visto = new Set(claves);
    const d = armarCampanita(recientes, claves, 2, new Set(), null, visto);
    expect(d.pendientePanel).toBe(false);
    expect(d.globo).toBe(2);
    expect(d.recientes.every((f) => f.sinVer)).toBe(true);
    const conNueva = [aviso(3, "2026-10-19T13:00:00Z"), ...recientes];
    expect(armarCampanita(conNueva, [...claves, "llego-abcdef12-3"], 3, new Set(), null, visto).pendientePanel).toBe(true);
  });

  it("sin nada: sin globo, sin notificaciones y sin número de novedades si nunca miró", () => {
    const d = armarCampanita([], [], 0, new Set(), null);
    expect(d).toEqual({ recientes: [], hayMas: false, novedades: null, globo: 0, claves: [], pendientePanel: false });
    expect(armarCampanita([], [], 0, new Set(), 0).globo).toBe(0);
  });

  it("si la base no contestó (sin notificaciones), las novedades se ven igual", () => {
    expect(armarCampanita([], [], 0, new Set(), 3)).toEqual({
      recientes: [],
      hayMas: false,
      novedades: 3,
      globo: 3,
      claves: [],
      pendientePanel: false,
    });
  });

  it("guarda TODAS las claves no borradas, también las que no caben en el panel", () => {
    const seis = [1, 2, 3, 4, 5, 6].map((n) => aviso(n, `2026-10-1${n}T10:00:00Z`));
    expect(armarCampanita(seis, seis.map((a) => a.clave), 6, new Set(), null).claves).toEqual(seis.map((a) => a.clave));
  });

  it("una notificación sin modelo lleva a «Mi perfil», nunca a un enlace roto (la base lo manda siempre; esto es el respaldo)", () => {
    const d = armarCampanita([{ ...aviso(1, "2026-10-19T12:00:00Z"), href: "/cuenta" }], ["llego-abcdef12-1"], 1, new Set(), null);
    expect(d.recientes[0].href).toBe("/cuenta");
  });
});

describe("el aviso en vivo", () => {
  it("avisa solo lo que la pantalla todavía no conoce, aunque sea de hace rato", () => {
    const conocidas = new Set(["llego-abcdef12-1", "llego-abcdef12-2"]);
    const recibidas: LlegadaViva[] = [
      { clave: "llego-abcdef12-1", titulo: "Blusa Emma", href: "/a", tipo: "llego" },
      { clave: "llego-abcdef12-7", titulo: "Falda Renata", href: "/b", tipo: "llego" },
    ];
    expect(llegadasNuevas(conocidas, recibidas)).toEqual([{ clave: "llego-abcdef12-7", titulo: "Falda Renata", href: "/b", tipo: "llego" }]);
    expect(llegadasNuevas(new Set(), [])).toEqual([]);
  });

  it("el aviso breve dice qué llegó: una talla, una respuesta o varias cosas", () => {
    const talla: LlegadaViva = { clave: "llego-a", titulo: "Blusa Emma ya llegó", href: "/a", tipo: "llego" };
    const respuesta: LlegadaViva = { clave: "respuesta-a", titulo: "CAYLA te respondió", href: "/recomendaciones", tipo: "respuesta" };
    expect(textoLlegadasNuevas([talla])).toBe("Blusa Emma ya llegó: la talla que esperabas.");
    expect(textoLlegadasNuevas([respuesta])).toBe("CAYLA te respondió una recomendación.");
    expect(textoLlegadasNuevas([respuesta, { ...respuesta, clave: "respuesta-b" }])).toBe("CAYLA te respondió 2 recomendaciones.");
    expect(textoLlegadasNuevas([talla, { ...talla, clave: "llego-b" }])).toBe("Llegaron 2 tallas que esperabas.");
    expect(textoLlegadasNuevas([talla, respuesta])).toBe("Tienes 2 avisos nuevos.");
  });
});

describe("las palabras", () => {
  it("el botón dice cuántos hay sin ver", () => {
    expect(etiquetaCampanita(0)).toBe("Avisos");
    expect(etiquetaCampanita(1)).toBe("Avisos: 1 nuevo");
    expect(etiquetaCampanita(5)).toBe("Avisos: 5 nuevos");
  });

  it("el globo no pasa de «9+» (mide 18 px)", () => {
    expect(textoGlobo(3)).toBe("3");
    expect(textoGlobo(9)).toBe("9");
    expect(textoGlobo(10)).toBe("9+");
    expect(textoGlobo(298)).toBe("9+");
  });

  it("Lo nuevo, en una línea: singular, plural, y sin nada o sin dato, «Nada nuevo» (sin inventar un número)", () => {
    expect(textoNovedades(1)).toBe("1 prenda nueva");
    expect(textoNovedades(3)).toBe("3 prendas nuevas");
    expect(textoNovedades(0)).toBe("Nada nuevo");
    expect(textoNovedades(null)).toBe("Nada nuevo");
  });
});
