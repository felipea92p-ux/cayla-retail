import { describe, expect, it } from "vitest";
import { camposDeFichaConsumo } from "./ficha-consumo-guia";
import { estadosDe, sePuedeConfirmar, siguienteDe } from "./guia-campos";

describe("camposDeFichaConsumo — la guía coincide con lo que guardar_ficha_consumo acepta", () => {
  // La base acepta una ficha válida (`problemasDeFicha`) con alguien que firma. «Sin cambios» no es una falta de la base, pero guardar lo mismo no hace nada: la guía no lo da por hecho.
  const laBaseAcepta = (faltas: readonly string[], hayCambios: boolean, responsableListo: boolean) => faltas.length === 0 && hayCambios && responsableListo;

  it("recorre las combinaciones: «se puede confirmar» es exactamente «hay algo que guardar y la base lo acepta»", () => {
    for (const faltas of [[], ["Escribe cuánto lleva cada prenda de la talla M, por ejemplo 1.200."]]) {
      for (const hayCambios of [true, false]) {
        for (const responsableListo of [true, false]) {
          expect(sePuedeConfirmar(camposDeFichaConsumo({ faltas, hayCambios, responsableListo })), `${faltas.length}/${hayCambios}/${responsableListo}`).toBe(laBaseAcepta(faltas, hayCambios, responsableListo));
        }
      }
    }
  });
  it("al abrir la hoja sin tocar nada, lo primero que sigue es la tela y los avíos", () => {
    const campos = camposDeFichaConsumo({ faltas: [], hayCambios: false, responsableListo: false });
    expect(siguienteDe(campos)?.id).toBe("ficha");
    expect(campos[0].pendiente).toBe("Cambia algo de la ficha para guardar.");
  });
  it("con una falta, la guía dice la falta (la misma frase que lee la persona bajo el campo)", () => {
    expect(camposDeFichaConsumo({ faltas: ["«Botón» está archivado en Insumos: quítalo o desarchívalo."], hayCambios: true, responsableListo: true })[0].pendiente).toBe("«Botón» está archivado en Insumos: quítalo o desarchívalo.");
  });
  it("con la ficha lista y los cambios hechos, solo falta quién la guarda", () => {
    const campos = camposDeFichaConsumo({ faltas: [], hayCambios: true, responsableListo: false });
    expect(estadosDe(campos).ficha).toBe("hecho");
    expect(siguienteDe(campos)?.id).toBe("quien");
  });
});
