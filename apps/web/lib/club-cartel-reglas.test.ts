import { describe, expect, it } from "vitest";
import { CARTEL_INVITACION, letraChicaDelCartel, textosDelCartel } from "./club-cartel-reglas";

// La forma de `fn_club_textos_legales` (ADR-0288 G-11): las cifras del club y los textos legales, sin tienda.
const escala = (montos: number[]) => montos.map((monto, i) => ({ anio: i + 1, monto }));
const base = (cambios: Record<string, unknown> = {}) => ({
  pct: 10,
  escala: escala([20, 30, 40, 50, 60]),
  compras: 6,
  monto_minimo: 600,
  dias: 30,
  textos: { terminos: { version: 1, texto: "…", vigente_desde: "2026-10-01" }, privacidad: { version: 1, texto: "…", vigente_desde: "2026-10-01" } },
  ...cambios,
});

describe("el cartel «Invitación»: lo que dice sale de la base", () => {
  it("con los beneficios de hoy dice lo mismo que el diseño aprobado", () => {
    const t = textosDelCartel(base())!;
    expect(t.lineas).toEqual([
      { beneficio: "Tu cumpleaños", valor: "10 %" },
      { beneficio: "Cada aniversario*", valor: "vale de S/ 20 a 60" },
      { beneficio: "Lo nuevo, primero", valor: "por WhatsApp" },
    ]);
    expect(letraChicaDelCartel("Tienda TRU", t)).toBe(
      "Tienda TRU · *Un año cuenta si hiciste 6 compras o sumaste S/ 600. Novedades por WhatsApp solo si las pides. Solo mayores de 18. Condiciones al escanear.",
    );
  });

  it("si el líder cambia los beneficios, el cartel cambia con ellos (ninguna cifra escrita a mano)", () => {
    const t = textosDelCartel(base({ pct: 15, escala: escala([25, 35, 45, 55, 80]), compras: 4, monto_minimo: 450 }))!;
    expect(t.lineas[0].valor).toBe("15 %");
    expect(t.lineas[1].valor).toBe("vale de S/ 25 a 80");
    expect(t.condiciones).toContain("si hiciste 4 compras o sumaste S/ 450.");
  });

  it("el vale va del menor al mayor de la escala, aunque la escala no venga ordenada ni crezca de a poco", () => {
    expect(textosDelCartel(base({ escala: [{ anio: 3, monto: 40 }, { anio: 1, monto: 20 }, { anio: 5, monto: 60 }, { anio: 2, monto: 30 }, { anio: 4, monto: 50 }] }))!.lineas[1].valor).toBe(
      "vale de S/ 20 a 60",
    );
    expect(textosDelCartel(base({ escala: escala([40, 40, 40, 40, 40]) }))!.lineas[1].valor).toBe("vale de S/ 40");
  });

  it("con céntimos se escribe como un precio de la tienda; el % con decimales también", () => {
    const t = textosDelCartel(base({ pct: 12.5, escala: escala([25.5, 30, 40, 50, 60.25]), monto_minimo: 599.9 }))!;
    expect(t.lineas[0].valor).toBe("12.5 %");
    expect(t.lineas[1].valor).toBe("vale de S/ 25.50 a 60.25");
    expect(t.condiciones).toContain("sumaste S/ 599.90.");
  });

  it("una sola compra se dice en singular", () => {
    expect(textosDelCartel(base({ compras: 1 }))!.condiciones).toContain("si hiciste 1 compra o sumaste");
  });

  it("las cifras que llegan como texto (numeric de Postgres) se leen igual", () => {
    expect(textosDelCartel(base({ pct: "10.00", monto_minimo: "600.00" }))!.lineas[0].valor).toBe("10 %");
  });

  it("si la base no responde o no da los beneficios completos, no hay cartel: nunca se dibuja a ciegas", () => {
    expect(textosDelCartel(null)).toBeNull();
    expect(textosDelCartel(undefined)).toBeNull();
    expect(textosDelCartel("no es un objeto")).toBeNull();
    expect(textosDelCartel(base({ pct: null }))).toBeNull();
    expect(textosDelCartel(base({ escala: [] }))).toBeNull();
    expect(textosDelCartel(base({ escala: escala([20, 30, 40]) }))).toBeNull(); // faltan años
    expect(textosDelCartel(base({ monto_minimo: undefined }))).toBeNull();
  });

  it("una cifra sin sentido (0, negativa, compras con decimales) tampoco se imprime", () => {
    expect(textosDelCartel(base({ pct: 0 }))).toBeNull();
    expect(textosDelCartel(base({ compras: 0 }))).toBeNull();
    expect(textosDelCartel(base({ compras: 2.5 }))).toBeNull();
    expect(textosDelCartel(base({ monto_minimo: -1 }))).toBeNull();
    expect(textosDelCartel(base({ escala: escala([20, 0, 40, 50, 60]) }))).toBeNull();
  });

  it("la letra chica lleva el nombre de SU tienda, limpio", () => {
    const t = textosDelCartel(base())!;
    expect(letraChicaDelCartel("  Tienda AQP ", t)).toMatch(/^Tienda AQP · \*Un año cuenta/);
  });

  it("lo fijo del cartel es el texto del diseño C", () => {
    expect(CARTEL_INVITACION).toEqual({
      sello: "CLUB CAYLA",
      titulo: "Te invitamos",
      bajada: "a ser parte del club. Es gratis.",
      escanea: "Escanea y únete en un minuto",
    });
  });
});
