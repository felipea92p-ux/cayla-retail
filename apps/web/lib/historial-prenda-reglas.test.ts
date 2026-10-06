import { describe, expect, it } from "vitest";
import {
  alcance,
  armarEventos,
  cambiosDe,
  etiquetaDia,
  filtrarEventos,
  personasDe,
  resumenHistorial,
  tituloDe,
  type FilaHistorial,
} from "./historial-prenda-reglas";

// ADR-0354: el historial de una prenda se lee como eventos (un guardado de una persona = una tarjeta), no como filas del ledger.

let n = 0;
function fila(p: Partial<FilaHistorial> & Pick<FilaHistorial, "campo" | "created_at">): FilaHistorial {
  n++;
  return {
    id: `f${String(n).padStart(3, "0")}`,
    entidad: "producto",
    valor_anterior: null,
    valor_nuevo: null,
    nombre_anterior: null,
    nombre_nuevo: null,
    hex_anterior: null,
    hex_nuevo: null,
    variante_id: null,
    variante_color: null,
    variante_hex: null,
    variante_talla: null,
    usuario_id: "lucia",
    usuario_nombre: "Lucía Paredes",
    usuario_rol: "Encargada de sede",
    usuario_sede: "Tienda Trujillo",
    sede: "Tienda Trujillo",
    campo_color: null,
    campo_hex: null,
    ...p,
  };
}
const COLORES = ["Cereza", "Crudo", "Crema", "Marrón", "Turquesa"];
const precio5 = (t: string, antes: string, despues: string, quien: Partial<FilaHistorial> = {}) =>
  COLORES.map((c, i) =>
    fila({ campo: "precio", created_at: t, entidad: "variante", variante_id: `v${i}`, variante_color: c, variante_talla: "Estándar", valor_anterior: antes, valor_nuevo: despues, ...quien }),
  );

describe("de filas a eventos", () => {
  it("el mismo precio en 5 variantes es UN cambio, «en las 5 variantes», y el título dice que bajó", () => {
    const ev = armarEventos(precio5("2026-10-05T21:56:00Z", "109", "99"));
    expect(ev).toHaveLength(1);
    expect(ev[0]!.titulo).toBe("bajó el precio");
    expect(ev[0]!.familia).toBe("precio");
    const c = ev[0]!.cambios[0]!;
    expect(c.k).toBe("precio");
    if (c.k === "precio") expect(alcance(c.variantes, 5)).toBe("en las 5 variantes");
  });

  it("un «Confirmar y guardar» (ficha + etiquetas segundos después) es UN evento; otra persona o 3 minutos después, otro", () => {
    const filas = [
      ...precio5("2026-10-03T20:29:00Z", "119", "109"),
      fila({ campo: "descripcion", created_at: "2026-10-03T20:29:00Z", valor_anterior: "Vestido largo de punto", valor_nuevo: "largo, con broche en la cadera" }),
      fila({ campo: "etiqueta", entidad: "variante", created_at: "2026-10-03T20:29:02Z", valor_nuevo: "e1", nombre_nuevo: "Oferta", variante_id: "v0" }),
      fila({ campo: "referencia", created_at: "2026-10-03T20:32:30Z", valor_anterior: "A", valor_nuevo: "B" }),
      fila({ campo: "referencia", created_at: "2026-10-03T20:32:40Z", valor_anterior: "B", valor_nuevo: "C", usuario_id: "rosa", usuario_nombre: "Rosa Mamani" }),
    ];
    const ev = armarEventos(filas);
    expect(ev.map((e) => e.titulo)).toEqual(["cambió el nombre", "cambió el nombre", "editó el precio, la descripción y etiquetas"]);
    expect(ev[0]!.persona?.corto).toBe("Rosa");
    expect(ev[2]!.familia).toBe("precio");
  });

  it("lo de nadie (sin persona) se agrupa aparte y no inventa a nadie", () => {
    const ev = armarEventos(precio5("2026-10-05T21:56:00Z", "39.90", "45.90", { usuario_id: null, usuario_nombre: null }));
    expect(ev[0]!.persona).toBeNull();
    expect(ev[0]!.titulo).toBe("subió el precio");
  });

  it("el nacimiento va solo, con sus colores, tallas y precio, aunque otra fila caiga en el mismo minuto", () => {
    const alta = fila({
      campo: "alta",
      id: "p1",
      created_at: "2026-09-18T16:02:00Z",
      valor_nuevo: JSON.stringify({ nombre: "Vestido Verano", categoria: "Vestidos", colores: [{ nombre: "Cereza", hex: "#8e1f2f" }], tallas: ["Estándar"], variantes: 3, precio: 119 }),
    });
    const ev = armarEventos([alta, fila({ campo: "referencia", created_at: "2026-09-18T16:02:30Z", valor_anterior: "Vestido Verano", valor_nuevo: "Vestido Summer" })]);
    expect(ev).toHaveLength(2);
    expect(ev[1]!.familia).toBe("alta");
    expect(ev[1]!.titulo).toBe("creó la prenda");
    const c = ev[1]!.cambios[0]!;
    expect(c.k === "alta" && c.precio === 119 && c.colores[0]!.nombre === "Cereza").toBe(true);
  });

  it("nunca muestra un uuid: un valor que ya no existe se dice con palabras", () => {
    const [c] = cambiosDe([fila({ campo: "marca_id", created_at: "2026-10-01T00:00:00Z", valor_anterior: "7ec9c087-0748-4007-862f-5d7f168dcb0c", valor_nuevo: "3810ca55-e9c7-451f-b597-a9f90acdabbc", nombre_nuevo: "CAYLA" })]);
    expect(c).toMatchObject({ k: "texto", campo: "Marca", antes: "una marca que ya no está", despues: "CAYLA" });
  });

  it("etiquetas: puesta y quitada por nombre, con a cuántas variantes", () => {
    const filas = [
      fila({ campo: "etiqueta", entidad: "variante", created_at: "2026-10-04T16:15:00Z", valor_anterior: "e0", nombre_anterior: "Nuevo", variante_id: "v0" }),
      ...COLORES.map((c, i) => fila({ campo: "etiqueta", entidad: "variante", created_at: "2026-10-04T16:15:00Z", valor_nuevo: "e1", nombre_nuevo: "Oferta", variante_id: `v${i}`, variante_color: c })),
    ];
    const cambios = cambiosDe(filas);
    expect(cambios.map((c) => (c.k === "etiqueta" ? `${c.puesta ? "+" : "-"}${c.nombre}:${c.variantes.length}` : c.k))).toEqual(["-Nuevo:1", "+Oferta:5"]);
    expect(tituloDe(cambios)).toBe("cambió sus etiquetas");
    expect(tituloDe([cambios[1]!])).toBe("puso la etiqueta «Oferta»");
  });

  it("variantes nuevas, colores corregidos y fotos se dicen bien", () => {
    const nuevas = cambiosDe(
      ["Crema", "Turquesa"].map((c) =>
        fila({ campo: "variante_nueva", entidad: "variante", created_at: "2026-10-01T15:12:00Z", nombre_nuevo: c, hex_nuevo: "#2bb5c8", valor_nuevo: JSON.stringify({ color: "X", talla: "Estándar", precio: 119 }) }),
      ),
    );
    expect(tituloDe(nuevas)).toBe("agregó 2 colores");
    const color = cambiosDe([fila({ campo: "color", entidad: "variante", created_at: "2026-10-02T17:40:00Z", valor_anterior: "MAR", valor_nuevo: "CRU", nombre_anterior: "Marfil", nombre_nuevo: "Crudo" })]);
    expect(tituloDe(color)).toBe("corrigió un color");
    const fotos = cambiosDe([
      fila({ campo: "foto", created_at: "2026-10-02T23:05:00Z", valor_nuevo: "https://x/f.jpg" }),
      fila({ campo: "foto", created_at: "2026-10-02T23:05:00Z", valor_nuevo: "agregada" }),
    ]);
    expect(fotos).toEqual([{ k: "foto", agregadas: ["https://x/f.jpg", ""], quitadas: 0 }]);
    expect(tituloDe(fotos)).toBe("subió 2 fotos");
    expect(tituloDe(cambiosDe([fila({ campo: "foto", created_at: "2026-10-02T23:05:00Z", valor_anterior: "https://x/f.jpg" })]))).toBe("quitó una foto");
  });

  it("varios cambios del mismo tipo se dicen en plural: «editó códigos y tallas»", () => {
    const t = (antes: string, despues: string) =>
      fila({ campo: "talla", entidad: "variante", created_at: "x", valor_anterior: antes, valor_nuevo: despues });
    const cambios = cambiosDe([fila({ campo: "codigo", entidad: "variante", created_at: "x" }), t("28", "XL"), t("26", "S")]);
    expect(tituloDe(cambios)).toBe("editó códigos y tallas");
  });

  it("estado, temporada nueva y temporada de un color", () => {
    expect(tituloDe(cambiosDe([fila({ campo: "estado", created_at: "x", valor_anterior: "activo", valor_nuevo: "descontinuado" })]))).toBe("la descontinuó");
    expect(tituloDe(cambiosDe([fila({ campo: "temporada", created_at: "x", valor_nuevo: "verano", nombre_nuevo: "Verano" })]))).toBe("le puso una temporada");
    const porColor = cambiosDe([fila({ campo: "temporada:NEG", created_at: "x", valor_nuevo: "verano", nombre_nuevo: "Verano", campo_color: "Negro" })]);
    expect(porColor[0]).toMatchObject({ k: "texto", campo: "Temporada de Negro", antes: "Igual que su prenda", despues: "Verano" });
    expect(tituloDe(porColor)).toBe("cambió la temporada de Negro");
  });

  it("alcance: todas, una o dos por nombre, o «N de M»", () => {
    const v = (talla: string, color: string) => ({ talla, color, hex: null });
    expect(alcance([v("S", "Negro")], 1)).toBe("en su única variante");
    expect(alcance([v("S", "Negro"), v("M", "Negro")], 6)).toBe("en S · Negro y M · Negro");
    expect(alcance([v("S", "Negro"), v("M", "Negro"), v("L", "Negro")], 6)).toBe("en 3 de 6 variantes");
  });
});

describe("resumen, personas y filtros", () => {
  const eventos = armarEventos([
    fila({ campo: "alta", id: "p1", created_at: "2026-09-18T16:02:00Z", usuario_id: "felipe", usuario_nombre: "Felipe Alvarez", valor_nuevo: "{}" }),
    ...precio5("2026-10-05T21:56:00Z", "109", "99", { usuario_id: null, usuario_nombre: null }),
    fila({ campo: "referencia", created_at: "2026-10-06T14:20:00Z", valor_anterior: "Vestido Verano", valor_nuevo: "Vestido Summer" }),
  ]);

  it("la frase de arriba cuenta cambios, personas y lo que quedó sin firma", () => {
    expect(resumenHistorial(eventos, "2026-10-06")).toBe("2 cambios en 18 días · 1 persona · 1 sin firma · el último hoy, 09:20, Lucía");
  });

  it("una prenda que nadie tocó lo dice", () => {
    expect(resumenHistorial(eventos.filter((e) => e.familia === "alta"), "2026-10-06")).toBe("Nació el 18 de septiembre y nadie la cambió desde entonces.");
  });

  it("personas, de más a menos (a igual cuenta, la más reciente primero), con «sin firma» como una más", () => {
    expect(personasDe(eventos).map((p) => `${p.clave}:${p.n}`)).toEqual(["lucia:1", "nadie:1", "felipe:1"]);
  });

  it("el filtro por tipo deja el nacimiento como ancla; el de persona, solo lo suyo", () => {
    expect(filtrarEventos(eventos, "precio", null).map((e) => e.familia)).toEqual(["precio", "alta"]);
    expect(filtrarEventos(eventos, "todo", "lucia").map((e) => e.titulo)).toEqual(["cambió el nombre"]);
    expect(filtrarEventos(eventos, "todo", "nadie").map((e) => e.titulo)).toEqual(["bajó el precio"]);
  });

  it("los días se dicen en Lima: hoy, ayer, y la fecha corta (con año si no es este)", () => {
    expect(etiquetaDia("2026-10-06T14:20:00Z", "2026-10-06")).toBe("Hoy");
    expect(etiquetaDia("2026-10-06T03:00:00Z", "2026-10-06")).toBe("Ayer"); // 22:00 del 5 en Lima
    expect(etiquetaDia("2026-10-04T16:00:00Z", "2026-10-06")).toBe("dom 4 oct");
    expect(etiquetaDia("2025-12-31T16:00:00Z", "2026-10-06")).toBe("mié 31 dic 2025");
  });
});
