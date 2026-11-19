import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DESENFOQUE_CLARO, ELEGIDO, LUMINOSIDAD, claveDelMapa, cuerpoDelFiltro, mapasDelCanto, medidasDelCanto, perfilDelCanto, type TemaDelVidrio } from "./vidrio-dobla";

// El vidrio que dobla (ADR-0681). Lo que se ve se revisa en el navegador; aquí se cuida lo que no se ve a simple vista: que el mapa
// corra la luz hacia donde debe, que el filtro esté bien armado y, sobre todo, que la letra se lea con cualquier cosa detrás.

/** El píxel (x, y) de un mapa RGBA. */
const pixel = (px: Uint8ClampedArray, ancho: number, x: number, y: number) => [...px.slice((y * ancho + x) * 4, (y * ancho + x) * 4 + 4)];

describe("el perfil del canto (la ley de Snell)", () => {
  const { desvio, max } = perfilDelCanto(18, 30);

  it("la luz se corre más en el borde y casi nada donde el vidrio ya es plano", () => {
    expect(max).toBeGreaterThan(1);
    expect(desvio[0]).toBeGreaterThan(desvio[60]);
    expect(desvio[60]).toBeGreaterThan(desvio[127]);
    expect(desvio[127]).toBeLessThan(0.01);
  });

  it("no da números imposibles ni pegado al borde, donde la pendiente se va a infinito", () => {
    expect([...desvio].every((d) => Number.isFinite(d) && d >= 0)).toBe(true);
  });

  it("un vidrio más grueso dobla más", () => {
    expect(perfilDelCanto(18, 60).max).toBeGreaterThan(max);
  });
});

describe("el mapa de una cápsula: dobla por todo su contorno, hacia adentro", () => {
  const m = medidasDelCanto({ ancho: 120, alto: 48, radio: 24, lados: "todos", relleno: "propio" });
  const { mapa, mascara, max } = mapasDelCanto(m);

  it("tiene el tamaño de la pieza", () => {
    expect(mapa.length).toBe(120 * 48 * 4);
    expect(mascara.length).toBe(120 * 48 * 4);
    expect(max).toBeGreaterThan(0);
  });

  it("el centro no se mueve (128) y no muestra canto", () => {
    expect(pixel(mapa, 120, 60, 24)).toEqual([128, 128, 128, 255]);
    expect(pixel(mascara, 120, 60, 24)[3]).toBe(0);
  });

  it("en el borde izquierdo trae la luz desde la derecha, y en el derecho desde la izquierda (rojo arriba y abajo de 128)", () => {
    const izq = pixel(mapa, 120, 1, 24)[0];
    const der = pixel(mapa, 120, 118, 24)[0];
    expect(izq).toBeGreaterThan(128);
    expect(der).toBeLessThan(128);
    expect(Math.abs(izq - 128 - (128 - der))).toBeLessThanOrEqual(1);
  });

  it("arriba y abajo hace lo mismo con el verde", () => {
    expect(pixel(mapa, 120, 60, 1)[1]).toBeGreaterThan(128);
    expect(pixel(mapa, 120, 60, 46)[1]).toBeLessThan(128);
  });

  it("el canto se ve entero en el borde y se apaga hacia adentro", () => {
    expect(pixel(mascara, 120, 60, 0)[3]).toBeGreaterThan(230);
    expect(pixel(mascara, 120, 60, 8)[3]).toBeLessThan(pixel(mascara, 120, 60, 2)[3]);
  });

  it("fuera de la esquina redonda no dobla nada", () => {
    expect(pixel(mapa, 120, 0, 0)).toEqual([128, 128, 128, 255]);
    expect(pixel(mascara, 120, 0, 0)[3]).toBe(0);
  });
});

describe("el mapa de una barra a ras: dobla solo por su lado libre", () => {
  it("la cabecera (abajo): arriba no se mueve, abajo trae la luz desde arriba", () => {
    const m = medidasDelCanto({ ancho: 200, alto: 64, radio: 0, lados: "abajo", relleno: "claro" });
    const { mapa } = mapasDelCanto(m);
    expect(pixel(mapa, 200, 100, 0)).toEqual([128, 128, 128, 255]);
    expect(pixel(mapa, 200, 0, 30)).toEqual([128, 128, 128, 255]);
    expect(pixel(mapa, 200, 100, 63)[1]).toBeLessThan(128);
    expect(pixel(mapa, 200, 100, 63)[0]).toBe(128);
  });

  it("un riel (derecha): solo corre en horizontal", () => {
    const m = medidasDelCanto({ ancho: 80, alto: 300, radio: 0, lados: "derecha", relleno: "claro" });
    const { mapa } = mapasDelCanto(m);
    expect(pixel(mapa, 80, 79, 150)[0]).toBeLessThan(128);
    expect(pixel(mapa, 80, 79, 150)[1]).toBe(128);
    expect(pixel(mapa, 80, 10, 150)).toEqual([128, 128, 128, 255]);
  });
});

describe("las medidas del canto", () => {
  it("el relleno claro engrosa el vidrio; el propio no", () => {
    const base = { ancho: 300, alto: 64, radio: 0, lados: "abajo" as const };
    expect(medidasDelCanto({ ...base, relleno: "claro" }).grosor).toBeCloseTo(medidasDelCanto({ ...base, relleno: "propio" }).grosor * ELEGIDO.engrosaClaro, 1);
  });

  it("el canto de una cápsula no pasa de su radio, y el radio no pasa de media pieza", () => {
    const m = medidasDelCanto({ ancho: 100, alto: 20, radio: 99, lados: "todos", relleno: "propio" });
    expect(m.radio).toBe(10);
    expect(m.bisel).toBeLessThanOrEqual(10);
  });

  it("dos piezas con las mismas medidas comparten mapa, y una de otro tamaño no", () => {
    const a = medidasDelCanto({ ancho: 300, alto: 64, radio: 0, lados: "abajo", relleno: "claro" });
    const b = medidasDelCanto({ ancho: 300, alto: 64, radio: 0, lados: "abajo", relleno: "claro" });
    const c = medidasDelCanto({ ancho: 301, alto: 64, radio: 0, lados: "abajo", relleno: "claro" });
    expect(claveDelMapa(a)).toBe(claveDelMapa(b));
    expect(claveDelMapa(a)).not.toBe(claveDelMapa(c));
  });
});

describe("el filtro", () => {
  const base = { ancho: 300, alto: 64, mapa: "data:mapa", mascara: "data:mascara", max: 10 };

  it("dobla tres veces, una por color, cada una un poco distinta (el arcoíris del canto)", () => {
    const filtro = cuerpoDelFiltro({ ...base, desenfoque: 24, luminosidad: null });
    const escalas = [...filtro.matchAll(/<feDisplacementMap[^>]* scale="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(escalas).toEqual(ELEGIDO.separacionDeColor.map((s) => Math.round(10 * 2 * ELEGIDO.curva * s * 100) / 100));
    expect(new Set(escalas).size).toBe(3);
  });

  it("el centro conserva el desenfoque que se le pide y el canto va casi nítido", () => {
    const filtro = cuerpoDelFiltro({ ...base, desenfoque: 24, luminosidad: null });
    expect(filtro).toContain('stdDeviation="24" result="centro"');
    expect(filtro).toContain('stdDeviation="1.1" result="fino"');
    expect(filtro).toContain('<feComposite in="doblado" in2="mascara" operator="in" result="canto"/>');
  });

  it("con relleno propio no toca la luminosidad; con relleno claro la recoge", () => {
    expect(cuerpoDelFiltro({ ...base, desenfoque: 24, luminosidad: null })).not.toContain("feComponentTransfer");
    const claro = cuerpoDelFiltro({ ...base, desenfoque: DESENFOQUE_CLARO.barra, luminosidad: LUMINOSIDAD.claro });
    expect(claro).toContain(`<feFuncR type="linear" slope="${LUMINOSIDAD.claro.pendiente}" intercept="${LUMINOSIDAD.claro.corte}"/>`);
    expect(claro).toContain('<feComponentTransfer in="vivo">');
  });

  it("las dos imágenes van del tamaño de la pieza", () => {
    const filtro = cuerpoDelFiltro({ ...base, desenfoque: 24, luminosidad: null });
    expect(filtro.match(/<feImage /g)).toHaveLength(2);
    expect(filtro).toContain('<feImage href="data:mapa" x="0" y="0" width="300" height="64" result="mapa"/>');
  });
});

// La letra sobre el vidrio de relleno claro. Se compone como lo hace el navegador: lo de atrás pasa por el filtro (pendiente y corte) y
// encima va el relleno de la receta. Se prueba con lo MÁS oscuro y lo MÁS claro que puede haber detrás (una foto negra, una foto blanca),
// en el punto más flaco del relleno. La tinta tiene que leerse (4.5:1, WCAG 1.4.3) en los cuatro casos de cada tema.
describe("el relleno claro: la letra en tinta se lee con cualquier cosa detrás", () => {
  const leer = (ruta: string) => readFileSync(join(__dirname, "..", ruta), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const recetas = leer("app/estilos/vidrio/recetas.css");
  const hexDe = (css: string, cabecera: string, token: string): string => {
    const desde = css.indexOf(cabecera);
    const m = css.slice(desde).match(new RegExp(`--color-${token}:\\s*(#[0-9a-fA-F]{6})`));
    if (desde < 0 || !m) throw new Error(`no encontré --color-${token} en «${cabecera}»`);
    return m[1];
  };
  const globals = leer("app/globals.css");
  const temaCss = leer("app/estilos/tema.css");
  const paleta: Record<TemaDelVidrio, { tinta: string; relleno: string }> = {
    claro: { tinta: hexDe(globals, "@theme static", "tinta"), relleno: hexDe(globals, "@theme static", "vidrio") },
    oscuro: { tinta: hexDe(temaCss, ':root[data-tema="oscuro"]', "tinta"), relleno: hexDe(temaCss, ':root[data-tema="oscuro"]', "tinta") },
  };
  /** Los dos porcentajes del relleno de la receta, en el tema pedido. */
  const alfas = (tema: TemaDelVidrio): number[] => {
    const desde = tema === "claro" ? recetas.indexOf("--vidrio-dobla-fondo:") : recetas.indexOf("--vidrio-dobla-fondo:", recetas.indexOf("--vidrio-dobla-fondo:") + 1);
    const linea = recetas.slice(desde, recetas.indexOf(";", desde));
    return [...linea.matchAll(/(\d+)%, transparent/g)].map((m) => Number(m[1]) / 100);
  };
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lineal = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminancia = (c: number[]) => 0.2126 * lineal(c[0]) + 0.7152 * lineal(c[1]) + 0.0722 * lineal(c[2]);
  const contraste = (a: number[], b: number[]) => {
    const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };

  for (const tema of ["claro", "oscuro"] as const) {
    it(`${tema}: la receta trae sus dos porcentajes`, () => {
      expect(alfas(tema)).toHaveLength(2);
    });

    for (const detras of [0, 1]) {
      it(`${tema}: con ${detras ? "blanco" : "negro"} detrás, la tinta pasa 4.5:1 en todo el relleno`, () => {
        const { pendiente, corte } = LUMINOSIDAD[tema];
        const filtrado = detras * pendiente + corte;
        for (const alfa of alfas(tema)) {
          const fondo = rgb(paleta[tema].relleno).map((c) => filtrado + (c - filtrado) * alfa);
          expect(contraste(rgb(paleta[tema].tinta), fondo), `relleno al ${alfa * 100} %`).toBeGreaterThanOrEqual(4.5);
        }
      });
    }

    it(`${tema}: el filtro no pide más luz de la que hay (pendiente + corte ≤ 1)`, () => {
      expect(LUMINOSIDAD[tema].pendiente + LUMINOSIDAD[tema].corte).toBeLessThanOrEqual(1);
    });
  }

  it("en la cabecera, el texto secundario pasa a tinta plena: el piso solo alcanza para la tinta entera", () => {
    const dobla = leer("app/estilos/vidrio/dobla.css");
    expect(dobla).toMatch(/\.marco-cabecera-fila\[data-dobla-activa="claro"\] :where\(\.marco-buscador-texto, \.label-cayla\) \{\s*color: var\(--color-tinta\);/);
  });

  it("aun con el piso, deja pasar más de lo de atrás que el vidrio de siempre (26 % en claro, 12 % en oscuro)", () => {
    expect(LUMINOSIDAD.claro.pendiente).toBeGreaterThan(0.26);
    expect(LUMINOSIDAD.oscuro.pendiente).toBeGreaterThan(0.12);
  });
});
