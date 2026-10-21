import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  bloquesDeTexto,
  completarMarcadores,
  cuerpoLegal,
  descripcionTerminos,
  enlaceLegal,
  escalaEnPalabras,
  esUuid,
  fechaLarga,
  formatoPct,
  formatoSoles,
  lecturaDePagina,
  marcadoresDePagina,
  puntosDelClub,
  textoLegal,
  trozosDeLinea,
  type PaginaClub,
  type PuntosClub,
} from "./club-registro-reglas";

const TIENDA = "3f2a9c1e-7b4d-4e8a-9c21-5d6e7f8a9b0c";

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

// Lo que devolvería `fn_club_puntos_vigentes` con la configuración de arranque del programa de puntos (2026-10-19).
const JSON_PUNTOS = { puntos_por_sol: 1, soles_por_100: 5, canje_minimo: 200, compra_minima_x: 3, vigencia_dias: 7, regalo_cumple: 100 };
const PUNTOS: PuntosClub = puntosDelClub(JSON_PUNTOS)!;

// Un trozo de los Términos de puntos como los escribe `docs/club/club_textos-v3-para-pegar-tras-el-abogado.sql`.
const TERMINOS_PUNTOS =
  "Ganas {puntos_por_sol} por cada S/ 1. 100 puntos valen {soles_por_100}. Desde {canje_minimo} ({canje_minimo_soles}). " +
  "El cupón vale {vigencia_dias}, en compras desde {compra_minima_x} su valor. Cumpleaños: {regalo_cumple}.";

const conTerminos = (texto: string): PaginaClub => ({ ...pagina(), textos: { ...pagina().textos, terminos: { version: 3, texto, vigenteDesde: null } } });

const pagina = (): PaginaClub => {
  const l = lecturaDePagina(JSON_PAGINA);
  if (l.estado !== "lista") throw new Error("la página de prueba debería leerse");
  return l.pagina;
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

  it("sin la tienda o sin uno de los tres textos no se le pide aceptar nada: «no disponible»", () => {
    expect(lecturaDePagina({ ...JSON_PAGINA, tienda: "  " }).estado).toBe("no_disponible");
    for (const falta of ["terminos", "privacidad", "casilla_publicidad"]) {
      const textos = { ...JSON_PAGINA.textos, [falta]: { version: 1, texto: "" } };
      expect(lecturaDePagina({ ...JSON_PAGINA, textos }).estado, falta).toBe("no_disponible");
    }
  });

  it("sin el % o la escala (beneficios retirados) la página se lee igual: las cifras se exigen al mostrar el texto que las nombra", () => {
    const l = lecturaDePagina({ ...JSON_PAGINA, pct: null, escala: [], compras: 0, monto_minimo: null, dias: undefined });
    expect(l.estado).toBe("lista");
    if (l.estado === "lista") {
      expect(l.pagina.pct).toBeNull();
      expect(l.pagina.escala).toEqual([]);
      expect([l.pagina.compras, l.pagina.montoMinimo, l.pagina.dias]).toEqual([null, null, null]);
      // Los Términos de hoy nombran {pct} y {escala}: sin ellos no se muestran a medias.
      expect(textoLegal(l.pagina, "terminos", PUNTOS)).toBeNull();
      // La política no nombra ninguna cifra: se muestra.
      expect(textoLegal(l.pagina, "privacidad", null)?.texto).toContain("CAYLA S.A.C.");
    }
    expect(lecturaDePagina({ ...JSON_PAGINA, escala: [{ anio: 1, monto: 0 }] }).estado === "lista").toBe(true);
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
    expect(formatoSoles(20)).toBe("S/\u00a020");
    expect(formatoSoles(25.5)).toBe("S/\u00a025.50");
    expect(formatoPct(10)).toBe("10");
    expect(formatoPct(12.5)).toBe("12.5");
  });

  it("{escala}: «S/ 20 el primer año, S/ 30 el segundo…», en orden y con «y» al final", () => {
    expect(escalaEnPalabras(pagina().escala)).toBe("S/\u00a020 el primer año, S/\u00a030 el segundo, S/\u00a040 el tercero, S/\u00a050 el cuarto y S/\u00a060 el quinto");
    expect(escalaEnPalabras([{ anio: 1, monto: 20 }])).toBe("S/\u00a020 el primer año");
    expect(escalaEnPalabras([{ anio: 2, monto: 30 }, { anio: 1, monto: 20 }])).toBe("S/\u00a020 el primer año y S/\u00a030 el segundo");
    expect(escalaEnPalabras([])).toBe("");
  });

  it("completa los marcadores conocidos, {código} con tilde también, y deja a la vista uno que no llegó", () => {
    expect(completarMarcadores("{pct} % · {escala} · {tienda}", marcadoresDePagina(pagina()))).toBe(
      "10 % · S/\u00a020 el primer año, S/\u00a030 el segundo, S/\u00a040 el tercero, S/\u00a050 el cuarto y S/\u00a060 el quinto · Tienda TRU",
    );
    expect(completarMarcadores("({código}) ({codigo})", { codigo: "C-0142" })).toBe("(C-0142) (C-0142)");
    expect(completarMarcadores("Hola {nombre}", {})).toBe("Hola {nombre}");
  });

  it("la política y los términos salen con sus marcadores completos y su versión", () => {
    const t = textoLegal(pagina(), "terminos", null)!;
    expect(t.version).toBe(1);
    expect(t.texto).toContain("10 % de descuento");
    expect(t.texto).toContain("S/\u00a060 el quinto");
    expect(t.texto).not.toMatch(/\{(pct|escala)\}/);
  });

  it("fechas largas en hora de Lima: una fecha suelta o un instante (de noche en Lima ya es mañana en UTC)", () => {
    expect(fechaLarga("2026-09-12")).toBe("12 de setiembre de 2026");
    expect(fechaLarga("2026-10-02T03:30:00Z")).toBe("1 de octubre de 2026");
    expect(fechaLarga(null)).toBeNull();
    expect(fechaLarga("no es fecha")).toBeNull();
  });
});

describe("los puntos del Club en los textos legales", () => {
  it("lee fn_club_puntos_vigentes, también con cifras como texto (numeric de Postgres)", () => {
    expect(PUNTOS).toEqual({ puntosPorSol: 1, solesPor100: 5, canjeMinimo: 200, compraMinimaX: 3, vigenciaDias: 7, regaloCumple: 100 });
    expect(puntosDelClub({ ...JSON_PUNTOS, soles_por_100: "5.00", compra_minima_x: "2.5" })).toMatchObject({ solesPor100: 5, compraMinimaX: 2.5 });
  });

  it("sin la configuración completa, o con una cifra sin sentido, no hay puntos (nunca una cifra inventada)", () => {
    expect(puntosDelClub(null)).toBeNull();
    expect(puntosDelClub([])).toBeNull();
    for (const [campo, valor] of [
      ["puntos_por_sol", 0],
      ["soles_por_100", null],
      ["canje_minimo", 150.5],
      ["compra_minima_x", -1],
      ["vigencia_dias", 0],
      ["regalo_cumple", -100],
      ["regalo_cumple", undefined],
    ] as const) {
      expect(puntosDelClub({ ...JSON_PUNTOS, [campo]: valor }), `${campo}=${String(valor)}`).toBeNull();
    }
    // Sin regalo de cumpleaños (0) la configuración vale: el texto dirá «0 puntos» solo si lo nombra.
    expect(puntosDelClub({ ...JSON_PUNTOS, regalo_cumple: 0 })?.regaloCumple).toBe(0);
  });

  it("los Términos de puntos salen con las cifras vigentes y su unidad concordada", () => {
    const t = textoLegal(conTerminos(TERMINOS_PUNTOS), "terminos", PUNTOS)!;
    expect(t.texto).toBe(
      "Ganas 1 punto por cada S/ 1. 100 puntos valen S/\u00a05. Desde 200 puntos (S/\u00a010). " +
        "El cupón vale 7 días, en compras desde 3 veces su valor. Cumpleaños: 100 puntos.",
    );
    expect(t.version).toBe(3);
  });

  it("si el líder cambia la configuración, el texto cambia con ella (ninguna cifra escrita a mano)", () => {
    const otra = puntosDelClub({ puntos_por_sol: 2, soles_por_100: 2.5, canje_minimo: 1000, compra_minima_x: 1, vigencia_dias: 1, regalo_cumple: 1 })!;
    const t = textoLegal(conTerminos(TERMINOS_PUNTOS), "terminos", otra)!;
    expect(t.texto).toMatch(/^Ganas 2 puntos por cada S\/ 1\. 100 puntos valen S\/\u00a02\.50\. Desde 1\D?000 puntos \(S\/\u00a025\)\. /);
    expect(t.texto).toContain("El cupón vale 1 día, en compras desde 1 vez su valor. Cumpleaños: 1 punto.");
  });

  it("si los puntos no responden, un texto que los nombra no se muestra; uno que no los nombra (los de hoy), sí", () => {
    expect(textoLegal(conTerminos(TERMINOS_PUNTOS), "terminos", null)).toBeNull();
    expect(textoLegal(pagina(), "terminos", null)?.texto).toContain("10 % de descuento");
    // Un marcador que no es de los textos legales no bloquea: queda a la vista, como siempre.
    expect(textoLegal(conTerminos("Hola {nombre}"), "terminos", null)?.texto).toBe("Hola {nombre}");
  });

  it("los marcadores viejos y los de puntos conviven en un mismo texto mientras existan los dos", () => {
    expect(textoLegal(conTerminos("{pct} % y {regalo_cumple} en {tienda}"), "terminos", PUNTOS)?.texto).toBe("10 % y 100 puntos en Tienda TRU");
  });

  it("la descripción de los términos habla de puntos con las cifras de la base, y sin ellas no inventa ninguna", () => {
    expect(descripcionTerminos(PUNTOS)).toBe(
      "Las condiciones del Club CAYLA: 1 punto por cada S/\u00a01 que pagas, 100 puntos valen S/\u00a05 de descuento, 100 puntos de regalo en tu cumpleaños y cómo se canjean.",
    );
    expect(descripcionTerminos({ ...PUNTOS, regaloCumple: 0 })).not.toMatch(/cumpleaños/);
    const sin = descripcionTerminos(null);
    expect(sin).not.toMatch(/\d/);
    for (const d of [sin, descripcionTerminos(PUNTOS)]) expect(d).not.toMatch(/vale de aniversario|cupón de cumpleaños|%/);
  });
});

describe("el SQL de los textos v3 (para pegar tras el abogado) se lee bien en la página", () => {
  // `docs/club/club_textos-v3-para-pegar-tras-el-abogado.sql` no es una migración: lo pega Felipe cuando el abogado apruebe. Esta prueba
  // cuida que, el día que se pegue, la página lo muestre entero: cada marcador es uno que la web completa y ninguno queda a la vista.
  const SQL = readFileSync(new URL("../../../docs/club/club_textos-v3-para-pegar-tras-el-abogado.sql", import.meta.url), "utf8");
  const textos = [...SQL.matchAll(/v_(terminos|privacidad) text := \$texto\$([\s\S]*?)\$texto\$;/g)].map((m) => ({ cual: m[1] as "terminos" | "privacidad", texto: m[2]! }));

  it("trae los dos textos, y los Términos ya no nombran el 10 % ni el vale", () => {
    expect(textos.map((t) => t.cual)).toEqual(["terminos", "privacidad"]);
    const terminos = textos[0]!.texto;
    expect(terminos).not.toMatch(/\{(pct|escala)\}|aniversario|al menos\s+\d+\s+compras/);
    for (const m of ["puntos_por_sol", "soles_por_100", "canje_minimo", "canje_minimo_soles", "vigencia_dias", "compra_minima_x", "regalo_cumple"]) {
      expect(terminos, m).toContain(`{${m}}`);
    }
  });

  it("con la configuración vigente, cada texto sale completo, sin un marcador a la vista, y en bloques que la página dibuja", () => {
    for (const { cual, texto } of textos) {
      const p: PaginaClub = { ...pagina(), pct: null, escala: [], textos: { ...pagina().textos, [cual]: { version: 3, texto, vigenteDesde: null } } };
      const t = textoLegal(p, cual, PUNTOS);
      expect(t, cual).not.toBeNull();
      expect(t!.texto, cual).not.toMatch(/\{[a-z_]+\}/);
      expect(cuerpoLegal(t!.texto).length, cual).toBeGreaterThan(cual === "terminos" ? 0 : 10);
    }
    const terminos = cuerpoLegal(textoLegal(conTerminos(textos[0]!.texto), "terminos", PUNTOS)!.texto);
    expect(terminos).toHaveLength(1);
    expect(terminos[0]!.tipo === "lista" && terminos[0]!.items.length).toBe(9);
  });
});

describe("los enlaces a la política y los términos", () => {
  it("los enlaces a la política y los términos llevan la tienda de donde viene, si es una", () => {
    expect(enlaceLegal("privacidad", TIENDA)).toBe(`/club/privacidad?t=${TIENDA}`);
    expect(enlaceLegal("terminos", null)).toBe("/club/terminos");
    expect(enlaceLegal("terminos", "x")).toBe("/club/terminos");
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
