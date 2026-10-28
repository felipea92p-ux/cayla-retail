import { describe, expect, it } from "vitest";
import {
  bordesDe,
  claseDeTarjeta,
  fotoContenida,
  enlaceParaCompartir,
  hrefTuLook,
  listaDeNombres,
  piezasDeLaImagen,
  tarjetasDelLook,
  textoAlCompartir,
  tituloDeLaHistoria,
  type ClaseDeTarjeta,
} from "./compartir-look";
import { indizar, LOOK_VACIO, type ColorDelProbador, type PrendaDelProbador, type Zona } from "./probador";

const FRANJA = { arriba: 236, abajo: 612 };

const color = (codigo: string, propia = true): ColorDelProbador => ({
  codigo,
  nombre: codigo,
  hex: null,
  precio: 50,
  precioFinal: 50,
  desde: false,
  pct: null,
  hay: true,
  nota: null,
  solo: null,
  foto: { url: `https://x/${codigo}.png`, proporcion: 0.5, optimizar: false, propia, de: null },
});
const prenda = (n: number, zona: Zona): PrendaDelProbador => ({
  id: `cccccccc-0000-4000-8000-${String(n).padStart(12, "0")}`,
  codigo: `P-${n}`,
  nombre: `Prenda ${n}`,
  categoria: null,
  zona,
  metida: false,
  largo: 60,
  colores: [color("NEG"), color("ROS")],
});

describe("el enlace que se comparte", () => {
  it("es la página pública con el look tal cual (los ~ y los . se leen)", () => {
    expect(hrefTuLook("TOP-0053.RPA~PAN-0012.CAM")).toBe("/tu-look?p=TOP-0053.RPA~PAN-0012.CAM");
    expect(textoAlCompartir("https://tienda.cayla.pe/tu-look?p=A.B")).toBe("Mira mi look en CAYLA: https://tienda.cayla.pe/tu-look?p=A.B");
  });
  it("lleva la marca de WhatsApp al final, sin tocar el look (ADR-0495)", () => {
    expect(enlaceParaCompartir("https://tienda.cayla.pe", "TOP-0053.RPA~PAN-0012.CAM")).toBe(
      "https://tienda.cayla.pe/tu-look?p=TOP-0053.RPA~PAN-0012.CAM&utm_source=whatsapp",
    );
  });
  it("las prendas en una frase, para la descripción del enlace", () => {
    expect(listaDeNombres([])).toBe("");
    expect(listaDeNombres(["Top Estela"])).toBe("Top Estela");
    expect(listaDeNombres(["Top Estela", "Wide Leg", "Cartera Crescent"])).toBe("Top Estela, Wide Leg y Cartera Crescent");
  });
});

describe("las prendas en la imagen", () => {
  it("cada zona en su tamaño de tarjeta y en el orden de sus números", () => {
    expect((["vestido", "abajo", "arriba", "encima", "bolso"] as Zona[]).map(claseDeTarjeta)).toEqual(["alta", "alta", "media", "media", "chica"]);
    const top = prenda(1, "arriba");
    const bolso = prenda(2, "bolso");
    const look = { ...LOOK_VACIO, bolso: { id: bolso.id, color: "NEG" }, arriba: { id: top.id, color: "ROS" } };
    expect(piezasDeLaImagen(look, indizar([top, bolso])).map((p) => [p.nombre, p.clase, p.foto.url])).toEqual([
      ["Prenda 1", "media", "https://x/ROS.png"],
      ["Prenda 2", "chica", "https://x/NEG.png"],
    ]);
  });
});

describe("dónde va cada tarjeta", () => {
  it("con un top, un pantalón y un bolso, como en el lienzo", () => {
    const [top, pantalon, bolso] = tarjetasDelLook(["media", "alta", "chica"], FRANJA);
    expect(top).toMatchObject({ giro: -7 });
    expect(pantalon).toMatchObject({ giro: 5 });
    expect(bolso).toMatchObject({ giro: -2 });
    // La derecha empieza más arriba; el bolso va bajo el top y solo tapa su borde de papel, no su nombre.
    expect(pantalon.y).toBeLessThan(top.y);
    expect(bolso.y).toBeGreaterThan(top.y + top.h - 14);
    expect(bolso.y).toBeLessThan(top.y + top.h);
    // Ni tapa el nombre del pantalón: no entra en la columna de la derecha.
    expect(bolso.x + bolso.w).toBeLessThanOrEqual(pantalon.x);
  });

  it("toda combinación de 2 a 4 prendas cabe en la franja y en el ancho", () => {
    const clases: ClaseDeTarjeta[] = ["alta", "media", "chica"];
    const combinaciones: ClaseDeTarjeta[][] = [];
    const armar = (actual: ClaseDeTarjeta[]) => {
      if (actual.length >= 2) combinaciones.push(actual);
      if (actual.length < 4) for (const c of clases) armar([...actual, c]);
    };
    armar([]);
    for (const combinacion of combinaciones) {
      const tarjetas = tarjetasDelLook(combinacion, FRANJA);
      expect(tarjetas).toHaveLength(combinacion.length);
      for (const t of tarjetas) {
        expect(t.y).toBeGreaterThanOrEqual(FRANJA.arriba);
        expect(t.y + t.h).toBeLessThanOrEqual(FRANJA.abajo);
        expect(t.x).toBeGreaterThanOrEqual(0);
        expect(t.x + t.w).toBeLessThanOrEqual(390);
      }
    }
  });

  it("si no cabe, todo se achica igual", () => {
    const grande = tarjetasDelLook(["alta", "alta", "alta", "alta"], FRANJA);
    expect(grande[0].w).toBeLessThan(166);
    expect(grande[0].w / grande[0].h).toBeCloseTo(166 / 262, 1);
    expect(bordesDe(grande).h).toBeLessThanOrEqual(FRANJA.abajo - FRANJA.arriba);
  });

  it("los bordes de las tarjetas juntas", () => {
    expect(bordesDe([])).toEqual({ x: 0, y: 0, w: 0, h: 0 });
    expect(bordesDe([{ x: 10, y: 20, w: 100, h: 50, giro: 0 }, { x: 60, y: 5, w: 100, h: 30, giro: 0 }])).toEqual({ x: 10, y: 5, w: 150, h: 65 });
  });
});

describe("la foto y el título", () => {
  it("la foto entra entera en su recuadro", () => {
    expect(fotoContenida({ w: 100, h: 100 }, 0.5)).toEqual({ w: 50, h: 100 });
    expect(fotoContenida({ w: 100, h: 100 }, 2)).toEqual({ w: 100, h: 50 });
    expect(fotoContenida({ w: 100, h: 100 }, 0)).toEqual({ w: 100, h: 100 });
  });
  it("el nombre del look: la última palabra aparte y un tamaño que entra", () => {
    expect(tituloDeLaHistoria("Look de domingo")).toEqual({ antes: "Look de", ultima: "domingo", tamano: 56 });
    // «Mi look para la» es el renglón largo (15 letras).
    expect(tituloDeLaHistoria("Mi look para la oficina").tamano).toBe(38);
    expect(tituloDeLaHistoria("Look de viernes").tamano).toBe(56);
    expect(tituloDeLaHistoria("Lo que me pongo para la boda de mi prima").tamano).toBe(32);
    expect(tituloDeLaHistoria("Domingo").antes).toBe("");
  });
});
