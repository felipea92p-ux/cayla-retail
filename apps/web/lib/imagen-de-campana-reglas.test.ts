import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  BUCKET_DE_CAMPANAS,
  IMAGEN_CAMPANA,
  MAX_BYTES_IMAGEN_CAMPANA,
  coloresDeImagenDeCampana,
  comprobarLecturaDeImagen,
  esRutaDeImagenDeCampana,
  rutaDeImagenDeCampana,
  urlDeImagenDeCampana,
} from "@cayla-retail/shared";
import { INTENTOS_DE_COMPRESION, MAX_BYTES_DE_ENTRADA, avisoDeProporcion, medidasReducidas, objecionImagenElegida } from "./imagen-de-campana-reglas";

const E = "11111111-2222-4333-8444-555555555555";
const A = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

describe("el archivo elegido", () => {
  it("acepta JPG, PNG y WebP razonables", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"]) expect(objecionImagenElegida({ type, size: 2_000_000 })).toBeNull();
  });

  it("rechaza lo que no es imagen, lo vacío y lo enorme, con una frase de tienda", () => {
    expect(objecionImagenElegida({ type: "application/pdf", size: 10 })).toMatch(/JPG, PNG o WebP/);
    expect(objecionImagenElegida({ type: "image/svg+xml", size: 10 })).toMatch(/JPG, PNG o WebP/);
    expect(objecionImagenElegida({ type: "image/webp", size: 0 })).toMatch(/vacío/);
    expect(objecionImagenElegida({ type: "image/jpeg", size: MAX_BYTES_DE_ENTRADA + 1 })).toMatch(/15 MB/);
  });
});

describe("medidasReducidas: nunca agranda ni deforma", () => {
  it("una foto grande baja a lo recomendado conservando su proporción", () => {
    expect(medidasReducidas(4000, 1600, "horizontal")).toEqual({ ancho: 1600, alto: 640 });
    expect(medidasReducidas(3000, 3750, "vertical")).toEqual({ ancho: 1080, alto: 1350 });
  });

  it("una imagen ya chica se queda como está", () => {
    expect(medidasReducidas(800, 320, "horizontal")).toEqual({ ancho: 800, alto: 320 });
  });

  it("manda el lado que más se pasa", () => {
    // muy alta para el cuadro horizontal: baja por el alto
    const m = medidasReducidas(2000, 2000, "horizontal");
    expect(m.alto).toBe(640);
    expect(m.ancho).toBe(640);
    expect(medidasReducidas(10_000, 100, "horizontal").ancho).toBe(1600);
  });

  it("nunca da una medida de cero", () => {
    expect(medidasReducidas(1, 100_000, "horizontal")).toEqual({ ancho: 1, alto: 640 });
  });
});

describe("aviso de proporción (solo avisa, nunca bloquea)", () => {
  it("la proporción recomendada, o cerca, no avisa", () => {
    expect(avisoDeProporcion(1600, 640, "horizontal")).toBeNull();
    expect(avisoDeProporcion(1500, 640, "horizontal")).toBeNull();
    expect(avisoDeProporcion(1080, 1350, "vertical")).toBeNull();
  });

  it("una imagen cuadrada como banner, o apaisada como vertical, avisa con la medida que sí va", () => {
    expect(avisoDeProporcion(1000, 1000, "horizontal")).toMatch(/1600 × 640/);
    expect(avisoDeProporcion(1600, 640, "vertical")).toMatch(/1080 × 1350/);
  });
});

describe("la compresión", () => {
  it("los intentos van de menos a más liviano", () => {
    for (let i = 1; i < INTENTOS_DE_COMPRESION.length; i++) {
      const [q0, e0] = INTENTOS_DE_COMPRESION[i - 1]!;
      const [q1, e1] = INTENTOS_DE_COMPRESION[i]!;
      expect(q1 <= q0 || e1 <= e0, `${i}`).toBe(true);
    }
  });
});

describe("la ruta de una imagen en el almacén", () => {
  it("se arma con la campaña y un nombre nuevo, y es válida", () => {
    const r = rutaDeImagenDeCampana(E.toUpperCase(), A.toUpperCase());
    expect(r).toBe(`campanas/${E}/${A}.webp`);
    expect(esRutaDeImagenDeCampana(r)).toBe(true);
    expect(esRutaDeImagenDeCampana(rutaDeImagenDeCampana(E, A, "jpg"))).toBe(true);
  });

  it("solo pasan las rutas del almacén de campañas: nada de direcciones, de «..» ni de otros almacenes", () => {
    for (const mala of [`https://x.com/campanas/${E}/${A}.webp`, `campanas/../${A}.webp`, `otras/${E}/${A}.webp`, `campanas/${E}/${A}.svg`, `campanas/x/y.webp`, `campanas/${E}/${A}.webp?x=1`, "", null, undefined, 7]) {
      expect(esRutaDeImagenDeCampana(mala), String(mala)).toBe(false);
    }
  });

  it("la dirección pública usa el origen del almacén; sin origen o con una ruta mala no hay dirección", () => {
    const r = rutaDeImagenDeCampana(E, A);
    expect(urlDeImagenDeCampana("https://abc.supabase.co/", r)).toBe(`https://abc.supabase.co/storage/v1/object/public/${BUCKET_DE_CAMPANAS}/${r}`);
    expect(urlDeImagenDeCampana(null, r)).toBeNull();
    expect(urlDeImagenDeCampana("no es una dirección", r)).toBeNull();
    expect(urlDeImagenDeCampana("https://abc.supabase.co", "campanas/../x")).toBeNull();
  });
});

describe("una campaña con imagen: solo se elige el color del botón", () => {
  it("de fábrica, el rojo de la tienda con letras que se leen", () => {
    const c = coloresDeImagenDeCampana(null);
    expect(c.acento).toBe("#9e1d32");
    expect(comprobarLecturaDeImagen(c).ok).toBe(true);
  });

  it("un color propio se usa (en minúscula) y un texto que no es #rrggbb se ignora", () => {
    expect(coloresDeImagenDeCampana("#00AA55").acento).toBe("#00aa55");
    expect(coloresDeImagenDeCampana("verde").acento).toBe("#9e1d32");
  });

  it("casi cualquier color de botón se lee: la letra se elige sola (grafito o marfil)", () => {
    for (const hex of ["#ff0000", "#00ff00", "#0000ff", "#ffffff", "#000000", "#e47d8d", "#d9b878"]) {
      expect(comprobarLecturaDeImagen(coloresDeImagenDeCampana(hex)).items[0]!.ok, hex).toBe(true);
    }
  });

  it("un gris de en medio no deja leer ni la letra clara ni la oscura: el candado lo frena y dice cuál", () => {
    const r = comprobarLecturaDeImagen(coloresDeImagenDeCampana("#777777"));
    expect(r.ok).toBe(false);
    expect(r.items.filter((x) => !x.ok).map((x) => x.nombre)).toEqual(["Texto del botón sobre su color"]);
  });
});

describe("el almacén es el de la migración", () => {
  const sql = readFileSync(new URL("../../../supabase/migrations/20261021181000_campanas_web_imagenes.sql", import.meta.url), "utf8");

  it("el bucket se llama como el de la tienda y el ERP, y su tope deja pasar lo que se sube", () => {
    expect(sql).toContain(`'${BUCKET_DE_CAMPANAS}'`);
    expect(1024 * 1024).toBeGreaterThan(MAX_BYTES_IMAGEN_CAMPANA);
    expect(sql).toContain("1024 * 1024");
  });

  it("solo se sube (sin política de borrar ni de actualizar) y solo con el módulo", () => {
    expect(sql).toContain("for insert to authenticated");
    expect(sql).not.toMatch(/for (update|delete|all)/i);
    expect(sql).toContain("fn_ve_modulo('campanas_web')");
  });

  it("las dos partes están separadas, y la de la política va sola al final", () => {
    const parte2 = sql.indexOf("PARTE 2 · la política");
    expect(parte2).toBeGreaterThan(sql.indexOf("PARTE 1 · el bucket"));
    expect(sql.slice(parte2)).toContain("create policy");
    expect(sql.slice(0, parte2)).not.toContain("create policy retail_campanas_insert");
  });

  it("la ruta que arma el ERP cumple el CHECK de la base (campanas/…)", () => {
    const base = readFileSync(new URL("../../../supabase/migrations/20261021161000_campanas_web_modulo_y_lista.sql", import.meta.url), "utf8");
    expect(base).toContain("imagen_ruta like 'campanas/%'");
    expect(rutaDeImagenDeCampana(E, A).startsWith("campanas/")).toBe(true);
  });

  it("las medidas recomendadas son las de la maqueta", () => {
    expect(IMAGEN_CAMPANA.horizontal.ancho / IMAGEN_CAMPANA.horizontal.alto).toBeCloseTo(2.5, 5);
    expect(IMAGEN_CAMPANA.vertical.ancho / IMAGEN_CAMPANA.vertical.alto).toBeCloseTo(0.8, 5);
  });
});
