import { describe, expect, it } from "vitest";
import {
  DIBUJOS_DE_INSIGNIA,
  DIBUJOS_ELEGIBLES,
  NOMBRE_DEL_DIBUJO,
  dibujoDeInsignia,
  dibujoElegido,
  iconoDeInsignia,
  type PiezaDeInsignia,
} from "@cayla-retail/shared/insignias-visual";
import {
  BUCKET_DE_INSIGNIAS,
  dibujoResuelto,
  esRutaDeImagenDeInsignia,
  imagenEsDeLaInsignia,
  rutaDeImagenDeInsignia,
  urlDeImagenDeInsignia,
} from "@cayla-retail/shared/insignia-imagen";

// Los dibujos de las insignias (ADR-0489) son DATOS compartidos con el ERP (`packages/shared/src/insignias-visual.ts`); la tienda los
// pinta con los colores de la tienda. Aquí se cuida lo que haría que se vieran mal en un chip: un color suelto (no cambiaría con el
// tema) o una pieza que el pintor no sabe dibujar.
const COLORES = new Set(["$acento", "$hueco", "$tinta"]);
const ETIQUETAS = new Set(["path", "rect", "circle", "ellipse", "g"]);

function recorrer(piezas: readonly PiezaDeInsignia[], f: (p: PiezaDeInsignia) => void) {
  for (const p of piezas) {
    f(p);
    if (p.hijos) recorrer(p.hijos, f);
  }
}

describe("los dibujos de las insignias", () => {
  it("hay uno por cada familia, más el genérico, y ninguno está vacío", () => {
    expect(Object.keys(DIBUJOS_DE_INSIGNIA)).toHaveLength(21);
    expect(Object.keys(DIBUJOS_DE_INSIGNIA)).toContain("halloween");
    expect(Object.keys(DIBUJOS_DE_INSIGNIA)).toContain("generico");
    for (const piezas of Object.values(DIBUJOS_DE_INSIGNIA)) expect(piezas.length).toBeGreaterThan(0);
  });

  it("solo usan colores con nombre: ningún hex, rgb ni nombre de color suelto (cada lugar pone el suyo, claro u oscuro)", () => {
    for (const piezas of Object.values(DIBUJOS_DE_INSIGNIA)) {
      recorrer(piezas, (p) => {
        expect(ETIQUETAS.has(p.tag)).toBe(true);
        for (const [k, v] of Object.entries(p.props)) {
          if (typeof v !== "string") continue;
          if (k === "fill" || k === "stroke") expect(v === "none" || COLORES.has(v)).toBe(true);
          expect(v).not.toMatch(/#|rgb|hsl|var\(/i);
        }
      });
    }
  });

  it("la lista para elegir tiene cada dibujo exactamente una vez, y todos tienen nombre para quien elige", () => {
    expect([...DIBUJOS_ELEGIBLES].sort()).toEqual(Object.keys(DIBUJOS_DE_INSIGNIA).sort());
    expect(new Set(DIBUJOS_ELEGIBLES).size).toBe(DIBUJOS_ELEGIBLES.length);
    for (const clave of DIBUJOS_ELEGIBLES) expect(NOMBRE_DEL_DIBUJO[clave].length).toBeGreaterThan(2);
    // Los nombres no se repiten: dos dibujos con el mismo nombre no se pueden elegir con la mirada.
    expect(new Set(Object.values(NOMBRE_DEL_DIBUJO)).size).toBe(DIBUJOS_ELEGIBLES.length);
  });
});

describe("el dibujo de una insignia: lo elegido manda, si no el nombre (ADR-0490)", () => {
  it("una clave válida se reconoce; una desconocida, vacía o de otro tipo no", () => {
    expect(dibujoElegido("halloween")).toBe("halloween");
    expect(dibujoElegido("generico")).toBe("generico");
    for (const raro of ["Halloween", "ya-no-existe", "", " ", null, undefined, 7, {}, "toString", "constructor", "__proto__"]) expect(dibujoElegido(raro)).toBeNull();
  });

  it("lo elegido manda sobre el nombre; sin elegir, el del nombre; si el nombre no se reconoce, la etiqueta", () => {
    expect(dibujoDeInsignia({ nombre: "Día del Padre", icono: "aniversario" })).toBe("aniversario");
    expect(dibujoDeInsignia({ nombre: "Halloween", icono: "gato" })).toBe("gato");
    expect(dibujoDeInsignia({ nombre: "Halloween", icono: null })).toBe("halloween");
    expect(dibujoDeInsignia({ nombre: "Halloween" })).toBe("halloween");
    expect(dibujoDeInsignia({ nombre: "Halloween", icono: "ya-no-existe" })).toBe("halloween");
    expect(dibujoDeInsignia({ nombre: "Estreno" })).toBe("generico");
    expect(dibujoDeInsignia({ nombre: "Reedición bonita", icono: "generico" })).toBe("generico");
    // El reconocimiento por nombre sigue siendo el de siempre.
    expect(iconoDeInsignia("Galentine's Day")).toBe("galentine");
    expect(iconoDeInsignia("San Valentín")).toBe("valentin");
  });
});

describe("la imagen propia de una insignia (ADR-0490)", () => {
  const INS = "0e962052-ade9-4dd2-8ef9-6fe6ff5681fb";
  const OTRA = "128219af-1c43-4527-8c73-8654c0227457";
  const ARCHIVO = "5a5a5a5a-1111-4222-8333-444444444444";
  const RUTA = `insignias/${INS}/${ARCHIVO}.webp`;

  it("la ruta que sube el ERP es la única que se reconoce: nada de direcciones, de «..», de otro tipo ni de otra carpeta", () => {
    expect(rutaDeImagenDeInsignia(INS.toUpperCase(), ARCHIVO.toUpperCase())).toBe(RUTA);
    expect(esRutaDeImagenDeInsignia(RUTA)).toBe(true);
    for (const raro of [
      null,
      undefined,
      7,
      "",
      `https://x.test/${RUTA}`,
      `insignias/${INS}/../${ARCHIVO}.webp`,
      `insignias/${INS}/${ARCHIVO}.png`,
      `insignias/${INS}/foto.webp`,
      `campanas/${INS}/${ARCHIVO}.webp`,
      `/insignias/${INS}/${ARCHIVO}.webp`,
      `${RUTA}?x=1`,
    ]) {
      expect(esRutaDeImagenDeInsignia(raro)).toBe(false);
    }
  });

  it("una insignia solo es dueña de lo que está en su carpeta", () => {
    expect(imagenEsDeLaInsignia(RUTA, INS)).toBe(true);
    expect(imagenEsDeLaInsignia(RUTA, INS.toUpperCase())).toBe(true);
    expect(imagenEsDeLaInsignia(RUTA, OTRA)).toBe(false);
    expect(imagenEsDeLaInsignia("insignias/x/y.webp", INS)).toBe(false);
  });

  it("la dirección pública sale del origen del almacén; sin origen o con una ruta rara, nada", () => {
    expect(urlDeImagenDeInsignia("https://abc.supabase.co", RUTA)).toBe(`https://abc.supabase.co/storage/v1/object/public/${BUCKET_DE_INSIGNIAS}/${RUTA}`);
    expect(urlDeImagenDeInsignia("https://abc.supabase.co/rest/v1?x=1", RUTA)).toBe(`https://abc.supabase.co/storage/v1/object/public/${BUCKET_DE_INSIGNIAS}/${RUTA}`);
    expect(urlDeImagenDeInsignia(undefined, RUTA)).toBeNull();
    expect(urlDeImagenDeInsignia("no es una dirección", RUTA)).toBeNull();
    expect(urlDeImagenDeInsignia("https://abc.supabase.co", "insignias/../x.webp")).toBeNull();
  });

  it("qué manda: la imagen propia, después el dibujo elegido, después el del nombre, después la etiqueta", () => {
    expect(dibujoResuelto({ nombre: "Halloween", icono: "gato", imagen: RUTA })).toEqual({ tipo: "imagen", ruta: RUTA, silueta: false });
    expect(dibujoResuelto({ nombre: "Halloween", icono: "gato", imagen: RUTA, silueta: true })).toEqual({ tipo: "imagen", ruta: RUTA, silueta: true });
    expect(dibujoResuelto({ nombre: "Halloween", icono: "gato", imagen: null })).toEqual({ tipo: "dibujo", clave: "gato" });
    expect(dibujoResuelto({ nombre: "Halloween" })).toEqual({ tipo: "dibujo", clave: "halloween" });
    expect(dibujoResuelto({ nombre: "Estreno" })).toEqual({ tipo: "dibujo", clave: "generico" });
    // Una ruta rara no se dibuja: cae al dibujo.
    expect(dibujoResuelto({ nombre: "Halloween", imagen: "https://x.test/a.webp" })).toEqual({ tipo: "dibujo", clave: "halloween" });
  });
});
