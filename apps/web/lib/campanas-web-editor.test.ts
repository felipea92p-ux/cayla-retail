import { describe, expect, it } from "vitest";
import { AMBIENTES_CAMPANA } from "@cayla-retail/shared";
import {
  BORRADOR_VACIO,
  DONDE_TODO,
  PIEZAS_DONDE,
  borradorDe,
  coloresDelBorrador,
  conAcento,
  conAmbiente,
  conDonde,
  conMovimiento,
  conPaleta,
  hayDonde,
  errorDeCampanas,
  faltanDelDiseno,
  leerFichaCampana,
  parcheDeCambios,
  type BorradorDiseno,
  type DisenoGuardado,
} from "./campanas-web-editor";

const campana = { id: "c1", nombre: "Aniversario CAYLA", pct: 20, desde: "2026-10-12", hasta: "2026-10-25", estado: "vivo", prendas: 112, diseno: null };
const diseno = (p: Partial<DisenoGuardado> = {}): DisenoGuardado => ({
  modo: "ambiente", plantilla: "aniversario", paleta: 0, acento: null, franja: "rota", entrada: "telon", efecto: "destellos",
  intensidad: "poca", duracion: "una", cuenta: "siempre", titular: null, bajada: null, boton: null, donde: { ...DONDE_TODO }, estado: "borrador", version: 1, ...p,
});

describe("leerFichaCampana: lo que manda la base", () => {
  it("lee una campaña con su diseño completo", () => {
    const f = leerFichaCampana({
      hoy: "2026-10-21", campana,
      diseno: { modo: "ambiente", plantilla: "cyber", paleta: 2, acento: "#00aa55", franja: "marquesina", entrada: "telon", efecto: "copos", intensidad: "media", duracion: "continuo", cuenta: "ultimo", titular: "Hola", bajada: null, boton: null, estado: "programado", version: 4 },
    });
    expect(f?.campana.nombre).toBe("Aniversario CAYLA");
    expect(f?.diseno).toMatchObject({ plantilla: "cyber", paleta: 2, acento: "#00aa55", efecto: "copos", estado: "programado", version: 4, titular: "Hola", bajada: null });
  });

  it("una campaña sin diseño trae diseno null", () => {
    expect(leerFichaCampana({ hoy: "2026-10-21", campana, diseno: null })?.diseno).toBeNull();
  });

  it("una lectura rara es null (el editor lo dice, no abre uno vacío)", () => {
    expect(leerFichaCampana(null)).toBeNull();
    expect(leerFichaCampana({ hoy: "2026-10-21" })).toBeNull();
    expect(leerFichaCampana({ campana })).toBeNull();
    expect(leerFichaCampana({ hoy: "2026-10-21", campana: { nombre: "x" } })).toBeNull();
  });

  it("un diseño a medias es «sin diseño»; los datos sueltos raros toman su valor de fábrica", () => {
    expect(leerFichaCampana({ hoy: "2026-10-21", campana, diseno: { modo: "otro", estado: "borrador" } })?.diseno).toBeNull();
    const d = leerFichaCampana({ hoy: "2026-10-21", campana, diseno: { modo: "ambiente", plantilla: "cyber", estado: "borrador", paleta: "x", version: 0 } })?.diseno;
    expect(d).toMatchObject({ paleta: 0, franja: "rota", entrada: "telon", version: 1 });
  });
});

/** Un borrador completo con lo que importe a la prueba. */
const bor = (p: Partial<BorradorDiseno> = {}): BorradorDiseno => ({ ...BORRADOR_VACIO, donde: { ...DONDE_TODO }, ...p });

describe("el borrador", () => {
  it("una campaña sin diseño abre vacía; con diseño de ambiente, con lo guardado", () => {
    expect(borradorDe({ diseno: null })).toEqual(BORRADOR_VACIO);
    expect(borradorDe({ diseno: diseno({ plantilla: "gato", paleta: 2, acento: "#aabbcc", efecto: "patitas" }) })).toEqual(bor({ plantilla: "gato", paleta: 2, acento: "#aabbcc", efecto: "patitas" }));
  });

  it("un diseño de imagen propia o de un ambiente que el catálogo no conoce no se abre como ambiente", () => {
    expect(borradorDe({ diseno: diseno({ modo: "imagen", plantilla: null }) })).toEqual(BORRADOR_VACIO);
    expect(borradorDe({ diseno: diseno({ plantilla: "halloween" }) })).toEqual(BORRADOR_VACIO);
  });

  it("elegir un ambiente trae su primera paleta, su efecto y su franja, y suelta el color propio", () => {
    const b = conAmbiente(bor({ plantilla: "cyber", paleta: 2, acento: "#00aa55", efecto: "copos", franja: "quieta", intensidad: "media", cuenta: "no" }), "gato");
    // el movimiento nace de fábrica con el ambiente (menos «dónde se ve», que no depende de él)
    expect(b).toEqual(bor({ plantilla: "gato", efecto: "patitas" }));
  });

  it("volver a elegir el mismo ambiente no cambia nada (no pierde la paleta que ya eligió)", () => {
    const b = bor({ plantilla: "gato", paleta: 2, acento: "#aabbcc", efecto: "patitas" });
    expect(conAmbiente(b, "gato")).toBe(b);
  });

  it("cambiar de paleta suelta el color propio; poner uno propio lo guarda en minúscula", () => {
    const b = bor({ plantilla: "cyber", paleta: 0, acento: "#00aa55", efecto: "destellos", franja: "marquesina" });
    expect(conPaleta(b, 1)).toMatchObject({ paleta: 1, acento: null });
    expect(conAcento(b, "#FF00AA").acento).toBe("#ff00aa");
    expect(conAcento(b, null).acento).toBeNull();
  });

  it("los colores del borrador son los de la paleta, o el acento propio", () => {
    expect(coloresDelBorrador(BORRADOR_VACIO)).toBeNull();
    expect(coloresDelBorrador({ ...BORRADOR_VACIO, plantilla: "cyber", paleta: 1 })).toEqual({ fondo: "#141413", texto: "#f2f1ed", acento: "#cbc7be" });
    expect(coloresDelBorrador({ ...BORRADOR_VACIO, plantilla: "cyber", acento: "#00aa55" })?.acento).toBe("#00aa55");
  });
});

describe("parcheDeCambios: solo lo que cambió", () => {
  const guardado = borradorDe({ diseno: diseno() });

  it("sin ambiente no hay nada que guardar", () => {
    expect(parcheDeCambios(null, BORRADOR_VACIO)).toBeNull();
    expect(parcheDeCambios(guardado, BORRADOR_VACIO)).toBeNull();
  });

  it("la primera vez manda lo mínimo para crear el diseño", () => {
    const ahora = conAmbiente(BORRADOR_VACIO, "navidad");
    expect(parcheDeCambios(null, ahora)).toEqual({
      modo: "ambiente", plantilla: "navidad", paleta: 0, acento: null, franja: "rota", entrada: "telon", efecto: "copos", intensidad: "poca", duracion: "una", cuenta: "siempre",
    });
    expect(parcheDeCambios(BORRADOR_VACIO, ahora)).toEqual(parcheDeCambios(null, ahora));
  });

  it("sin cambios es null (el botón de guardar se apaga)", () => {
    expect(parcheDeCambios(guardado, { ...guardado })).toBeNull();
  });

  it("solo manda las llaves que cambiaron", () => {
    expect(parcheDeCambios(guardado, conPaleta(guardado, 2))).toEqual({ paleta: 2 });
    expect(parcheDeCambios(guardado, conAcento(guardado, "#112233"))).toEqual({ acento: "#112233" });
    expect(parcheDeCambios({ ...guardado, acento: "#112233" }, { ...guardado, acento: null })).toEqual({ acento: null });
  });

  it("lo que se aparta de fábrica en «dónde se ve» viaja con el primer guardado", () => {
    expect(parcheDeCambios(null, conDonde(conAmbiente(BORRADOR_VACIO, "gato"), "sello", false))).toMatchObject({ donde_sello: false });
    expect(parcheDeCambios(null, conAmbiente(BORRADOR_VACIO, "gato"))).not.toHaveProperty("donde_sello");
  });

  it("cada pieza del movimiento y de «dónde se ve» viaja sola", () => {
    expect(parcheDeCambios(guardado, conMovimiento(guardado, "duracion", "continuo"))).toEqual({ duracion: "continuo" });
    expect(parcheDeCambios(guardado, conMovimiento(guardado, "efecto", "copos"))).toEqual({ efecto: "copos" });
    expect(parcheDeCambios(guardado, conMovimiento(guardado, "cuenta", "ultimo"))).toEqual({ cuenta: "ultimo" });
    expect(parcheDeCambios(guardado, conDonde(guardado, "bolsa", false))).toEqual({ donde_bolsa: false });
    expect(parcheDeCambios(conDonde(guardado, "bolsa", false), guardado)).toEqual({ donde_bolsa: true });
  });

  it("cambiar de ambiente manda lo que cambia: el ambiente, la paleta, el color propio y la franja (Black Week comparte el efecto)", () => {
    expect(parcheDeCambios({ ...guardado, paleta: 2, acento: "#112233" }, conAmbiente(guardado, "cyber"))).toEqual({
      plantilla: "cyber", paleta: 0, acento: null, franja: "marquesina",
    });
    expect(parcheDeCambios(guardado, conAmbiente(guardado, "gato"))).toEqual({ plantilla: "gato", efecto: "patitas" });
  });
});

describe("qué falta para poder programar", () => {
  it("sin ambiente falta elegir uno", () => {
    expect(faltanDelDiseno(BORRADOR_VACIO)).toEqual([{ paso: "ambiente", texto: "elegir un ambiente" }]);
  });

  it("con cualquier ambiente y paleta del catálogo no falta nada (todas se leen)", () => {
    for (const a of AMBIENTES_CAMPANA) for (let p = 0; p < 3; p++) expect(faltanDelDiseno({ ...conAmbiente(BORRADOR_VACIO, a.clave), paleta: p })).toEqual([]);
  });

  it("un color propio que no se lee hace faltar «un color que se lea bien»", () => {
    const b = conAcento(conAmbiente(BORRADOR_VACIO, "cyber"), "#1a1a19");
    expect(faltanDelDiseno(b)).toEqual([{ paso: "colores", texto: "un color que se lea bien" }]);
    expect(faltanDelDiseno(conAcento(b, null))).toEqual([]);
  });

  it("un color propio que no es #rrggbb también falta", () => {
    const b = { ...conAmbiente(BORRADOR_VACIO, "cyber"), acento: "rojo" };
    expect(faltanDelDiseno(b)).toEqual([{ paso: "colores", texto: "un color que sea #rrggbb" }]);
  });

  it("sin ninguna pieza encendida en «dónde se ve» falta elegir dónde se ve; con una basta", () => {
    const apagado = PIEZAS_DONDE.reduce((b, k) => conDonde(b, k, false), conAmbiente(BORRADOR_VACIO, "cyber"));
    expect(hayDonde(apagado)).toBe(false);
    expect(faltanDelDiseno(apagado)).toEqual([{ paso: "donde", texto: "elegir dónde se ve" }]);
    expect(faltanDelDiseno(conDonde(apagado, "franja", true))).toEqual([]);
  });

  it("si faltan los colores y el dónde se ve, lista los dos en el orden de las pantallas", () => {
    const b = PIEZAS_DONDE.reduce((x, k) => conDonde(x, k, false), conAcento(conAmbiente(BORRADOR_VACIO, "cyber"), "#1a1a19"));
    expect(faltanDelDiseno(b).map((f) => f.paso)).toEqual(["colores", "donde"]);
  });
});

describe("errores de la base en palabras de tienda", () => {
  it("conoce los cuatro de las campañas y no se traga los demás", () => {
    expect(errorDeCampanas("campana_cambio_otro")?.titulo).toBe("Alguien cambió esta campaña");
    expect(errorDeCampanas("ERROR: campana_terminada")?.titulo).toBe("Esa campaña ya terminó");
    expect(errorDeCampanas("campana_no_existe")?.titulo).toBe("Esa campaña ya no existe");
    expect(errorDeCampanas("campana_diseno_datos_invalidos Ese diseño no es válido (campana_disenos_paleta)")?.titulo).toBe("El diseño no es válido");
    expect(errorDeCampanas("otra cosa")).toBeNull();
  });
});
