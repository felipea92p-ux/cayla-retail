import { describe, expect, it } from "vitest";
import { CARTEL_INVITACION, letraChicaDelCartel, textosDelCartel } from "./club-cartel-reglas";

// La forma de `fn_club_puntos_vigentes` (programa de puntos): la configuración vigente, como la que cobra la caja.
const base = (cambios: Record<string, unknown> = {}) => ({
  puntos_por_sol: 1,
  soles_por_100: 5,
  canje_minimo: 200,
  compra_minima_x: 3,
  vigencia_dias: 7,
  regalo_cumple: 100,
  ...cambios,
});

describe("el cartel «Invitación»: lo que dice sale de la configuración de los puntos", () => {
  it("con la configuración de arranque dice puntos, lo que valen y el regalo de cumpleaños", () => {
    const t = textosDelCartel(base())!;
    expect(t.lineas).toEqual([
      { beneficio: "Cada compra", valor: "1 punto por S/\u00a01" },
      { beneficio: "100 puntos*", valor: "S/\u00a05 de descuento" },
      { beneficio: "Tu cumpleaños", valor: "+100 puntos" },
    ]);
    expect(t.condiciones).toBe("*Canjeas desde 200 puntos por un cupón de 7 días. Novedades por WhatsApp solo si las pides. Solo mayores de 18. Condiciones al escanear.");
  });

  it("si el líder cambia los beneficios, el cartel cambia con ellos (ninguna cifra escrita a mano)", () => {
    const t = textosDelCartel(base({ puntos_por_sol: 2, soles_por_100: 2.5, canje_minimo: 1000, vigencia_dias: 10, regalo_cumple: 250 }))!;
    expect(t.lineas.map((l) => l.valor)).toEqual(["2 puntos por S/\u00a01", "S/\u00a02.50 de descuento", "+250 puntos"]);
    expect(t.condiciones).toMatch(/^\*Canjeas desde 1\D?000 puntos por un cupón de 10 días\./);
  });

  it("sin regalo de cumpleaños, el cartel no lo promete", () => {
    expect(textosDelCartel(base({ regalo_cumple: 0 }))!.lineas[2]).toEqual({ beneficio: "Lo nuevo, primero", valor: "por WhatsApp" });
  });

  it("las cifras que llegan como texto (numeric de Postgres) se leen igual", () => {
    expect(textosDelCartel(base({ puntos_por_sol: "1.00", soles_por_100: "5.00" }))!.lineas[1].valor).toBe("S/\u00a05 de descuento");
  });

  it("si la base no responde o no da la configuración completa, no hay cartel: nunca se dibuja a ciegas", () => {
    expect(textosDelCartel(null)).toBeNull();
    expect(textosDelCartel(undefined)).toBeNull();
    expect(textosDelCartel("no es un objeto")).toBeNull();
    expect(textosDelCartel(base({ soles_por_100: null }))).toBeNull();
    expect(textosDelCartel(base({ canje_minimo: undefined }))).toBeNull();
  });

  it("una cifra sin sentido (0, negativa, días con decimales) tampoco se imprime", () => {
    expect(textosDelCartel(base({ puntos_por_sol: 0 }))).toBeNull();
    expect(textosDelCartel(base({ soles_por_100: -1 }))).toBeNull();
    expect(textosDelCartel(base({ vigencia_dias: 2.5 }))).toBeNull();
    expect(textosDelCartel(base({ regalo_cumple: -5 }))).toBeNull();
  });

  it("la letra chica lleva el nombre de SU tienda, limpio", () => {
    const t = textosDelCartel(base())!;
    expect(letraChicaDelCartel("  Tienda AQP ", t)).toMatch(/^Tienda AQP · \*Canjeas desde/);
  });

  it("lo fijo del cartel es el texto del diseño C", () => {
    expect(CARTEL_INVITACION).toEqual({
      sello: "CLUB",
      titulo: "Te invitamos",
      bajada: "a ser parte del club. Es gratis.",
      escanea: "Escanea y únete en un minuto",
    });
  });
});
