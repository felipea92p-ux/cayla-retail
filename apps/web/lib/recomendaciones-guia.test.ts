import { describe, expect, it } from "vitest";
import { sePuedeConfirmar } from "./guia-campos";
import { camposRecomendacion } from "./recomendaciones-guia";
import { MAX_RESPUESTA, problemaParaConfirmar, type Recomendacion } from "./recomendaciones-reglas";

type Estado = Pick<Recomendacion, "leidaEn" | "respuesta" | "archivadaEn" | "cliente">;
const CLIENTE = { fichaId: "33333333-3333-4333-8333-333333333333", nombre: "Ana Pérez" };
const AYER = "2026-10-14T16:00:00Z";

// Todos los estados en que se abre una hoja, y todas las respuestas que alguien puede escribir (las que la base rechaza incluidas).
const ESTADOS: Estado[] = [
  { leidaEn: null, respuesta: null, archivadaEn: null, cliente: CLIENTE },
  { leidaEn: AYER, respuesta: null, archivadaEn: null, cliente: CLIENTE },
  { leidaEn: AYER, respuesta: "Gracias", archivadaEn: null, cliente: CLIENTE },
  { leidaEn: AYER, respuesta: null, archivadaEn: AYER, cliente: CLIENTE },
  { leidaEn: AYER, respuesta: "Gracias", archivadaEn: AYER, cliente: CLIENTE },
  { leidaEn: null, respuesta: null, archivadaEn: null, cliente: null },
  { leidaEn: AYER, respuesta: null, archivadaEn: null, cliente: null },
];
const RESPUESTAS = ["", "   ", "​", "a", "ok", "Gracias por escribirnos", "b".repeat(MAX_RESPUESTA), "b".repeat(MAX_RESPUESTA + 1)];
const RESPONSABLES = [
  { responsableListo: true, responsableMotivo: null },
  { responsableListo: false, responsableMotivo: "Marca tu entrada" },
];

describe("la hoja de una recomendación: la guía", () => {
  // La guía no inventa reglas: se puede confirmar exactamente cuando la regla de la base no pone reparos y hay quién lo haga.
  it("se puede confirmar exactamente cuando problemaParaConfirmar no pone reparos y hay responsable, en todas las combinaciones", () => {
    for (const recomendacion of ESTADOS) {
      for (const respuesta of RESPUESTAS) {
        for (const r of RESPONSABLES) {
          const campos = camposRecomendacion({ recomendacion, respuesta, ...r });
          expect(sePuedeConfirmar(campos), JSON.stringify({ recomendacion, respuesta, r })).toBe(
            problemaParaConfirmar(recomendacion, respuesta) === null && r.responsableListo,
          );
        }
      }
    }
  });

  it("la respuesta falta con su frase, leída o no: ya no es opcional (la otra salida es archivarla sin responder)", () => {
    for (const recomendacion of ESTADOS.slice(0, 2)) {
      const campos = camposRecomendacion({ recomendacion, respuesta: "", ...RESPONSABLES[0]! });
      expect(campos.map((c) => c.id)).toEqual(["respuesta", "responsable"]);
      expect(campos[0]).toMatchObject({ requerido: true, hecho: false });
      expect(campos[0]!.pendiente).toMatch(/Escribe tu respuesta, o archívala/);
    }
    const escrita = camposRecomendacion({ recomendacion: ESTADOS[0]!, respuesta: "Gracias por escribirnos", ...RESPONSABLES[0]! });
    expect(escrita[0]).toMatchObject({ requerido: true, hecho: true, pendiente: "" });
  });

  it("escrita de más, la respuesta falta (la luz se queda en ella)", () => {
    const campos = camposRecomendacion({ recomendacion: ESTADOS[0]!, respuesta: "b".repeat(MAX_RESPUESTA + 2), ...RESPONSABLES[0]! });
    expect(campos[0]).toMatchObject({ requerido: true, hecho: false, pendiente: "Te pasaste por 2 letras: acórtala un poco." });
  });

  it("respondida, archivada o sin nombre: solo quién lo hace", () => {
    for (const recomendacion of ESTADOS.slice(2)) {
      expect(camposRecomendacion({ recomendacion, respuesta: "", ...RESPONSABLES[0]! }).map((c) => c.id)).toEqual(["responsable"]);
    }
  });
});
