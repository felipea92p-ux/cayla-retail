import { describe, expect, it } from "vitest";
import {
  bloquesDeTexto,
  completarMarcadores,
  cuerpoLegal,
  enlaceLegal,
  escalaEnPalabras,
  esUuid,
  fechaLarga,
  formatoPct,
  formatoSoles,
  lecturaDePagina,
  marcadoresDePagina,
  textoLegal,
  trozosDeLinea,
  type PaginaClub,
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
    const t = textoLegal(pagina(), "terminos");
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
