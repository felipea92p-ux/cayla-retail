import { describe, expect, it } from "vitest";
import {
  GRUPOS_PREFERENCIA,
  alternar,
  cuantasMarcadas,
  estaMarcada,
  leerEtiquetas,
  leerPreferencias,
  mismasPreferencias,
  opcionesDelGrupo,
  paraGuardar,
  type EtiquetaClub,
} from "./preferencias-clienta-reglas";

// Los valores de trabajo del spike del club (20-datos.js, `ETQ`), como los siembra 20260930210000.
const CATALOGO: EtiquetaClub[] = leerEtiquetas([
  { grupo: "ocasion", valor: "Trabajo", orden: 1 },
  { grupo: "ocasion", valor: "Evento", orden: 2 },
  { grupo: "ocasion", valor: "Día a día", orden: 3 },
  { grupo: "estilo", valor: "Clásico", orden: 1 },
  { grupo: "estilo", valor: "Tendencia", orden: 2 },
  { grupo: "estilo", valor: "Relajado", orden: 3 },
  { grupo: "evita", valor: "Fucsia", orden: 1 },
  { grupo: "evita", valor: "Amarillo", orden: 2 },
  { grupo: "evita", valor: "Lana", orden: 4 },
  { grupo: "evita", valor: "Negro", orden: 3 },
  { grupo: "talla", valor: "M", orden: 1 },
]);

describe("preferencias de una socia (CL-5)", () => {
  it("los tres grupos del acta, con los títulos del spike", () => {
    expect(GRUPOS_PREFERENCIA.map((g) => g.titulo)).toEqual(["Ocasión", "Estilo", "Evita (un color o una tela)"]);
  });

  it("leerPreferencias no confía en la forma: solo grupos conocidos, solo textos, sin repetidos", () => {
    expect(leerPreferencias(null)).toEqual({});
    expect(leerPreferencias([])).toEqual({});
    expect(leerPreferencias({ ocasion: ["Trabajo", "Trabajo", 3], talla: ["M"], estilo: "Clásico", evita: [] })).toEqual({ ocasion: ["Trabajo"] });
  });

  it("leerEtiquetas deja fuera un grupo que la web no conoce", () => {
    expect(CATALOGO.some((e) => (e.grupo as string) === "talla")).toBe(false);
    expect(CATALOGO).toHaveLength(10);
  });

  it("alternar marca y desmarca sin repetir; paraGuardar no manda grupos vacíos", () => {
    let p = alternar({}, "evita", "Lana");
    p = alternar(p, "evita", "Fucsia");
    p = alternar(p, "ocasion", "Evento");
    p = alternar(p, "ocasion", "Evento");
    expect(estaMarcada(p, "evita", "Lana")).toBe(true);
    expect(estaMarcada(p, "ocasion", "Evento")).toBe(false);
    expect(paraGuardar(p)).toEqual({ evita: ["Lana", "Fucsia"] });
    expect(cuantasMarcadas(p)).toBe(2);
  });

  it("mismasPreferencias no mira el orden ni los grupos vacíos", () => {
    expect(mismasPreferencias({ evita: ["Lana", "Fucsia"] }, { evita: ["Fucsia", "Lana"], ocasion: [] })).toBe(true);
    expect(mismasPreferencias({ evita: ["Lana"] }, { evita: ["Lana", "Negro"] })).toBe(false);
    expect(mismasPreferencias({}, {})).toBe(true);
  });

  it("opcionesDelGrupo: el catálogo en su orden y, al final, lo que ella tiene y ya no está en la lista", () => {
    expect(opcionesDelGrupo(CATALOGO, "evita", {})).toEqual([
      { valor: "Fucsia", enLaLista: true },
      { valor: "Amarillo", enLaLista: true },
      { valor: "Negro", enLaLista: true },
      { valor: "Lana", enLaLista: true },
    ]);
    expect(opcionesDelGrupo(CATALOGO, "estilo", { estilo: ["Bohemio", "Clásico"] }).map((o) => `${o.valor}:${o.enLaLista}`)).toEqual([
      "Clásico:true",
      "Tendencia:true",
      "Relajado:true",
      "Bohemio:false",
    ]);
  });
});
