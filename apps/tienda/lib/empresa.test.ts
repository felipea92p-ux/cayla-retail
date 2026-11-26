import { describe, expect, it } from "vitest";
import {
  AREAS,
  BENEFICIOS,
  enlaceParaPostular,
  mensajeParaPostular,
  PASOS_DEL_PROCESO,
  REMUNERACION_DE_ENTRADA,
  remuneracionVigente,
  soles,
} from "./empresa";

describe("la remuneración del rango de entrada", () => {
  it("en 2026 rige S/ 1,230 y ya se anuncia la de 2027", () => {
    const r = remuneracionVigente({ anio: 2026, mes: 11, dia: 23 });
    expect(r.actual.monto).toBe(1230);
    expect(r.proxima?.monto).toBe(1300);
    expect(r.proxima?.desde.anio).toBe(2027);
  });

  it("desde el día en que rige la nueva, es la actual y no queda otra por anunciar", () => {
    expect(remuneracionVigente({ anio: 2026, mes: 12, dia: 31 }).actual.monto).toBe(1230);
    const r = remuneracionVigente({ anio: 2027, mes: 1, dia: 1 });
    expect(r.actual.monto).toBe(1300);
    expect(r.proxima).toBeNull();
  });

  it("antes de la primera fecha nunca dice «sin sueldo»: rige la primera", () => {
    expect(remuneracionVigente({ anio: 2025, mes: 6, dia: 1 }).actual.monto).toBe(1230);
  });

  it("la tabla va en orden de fecha y ningún monto baja", () => {
    for (let i = 1; i < REMUNERACION_DE_ENTRADA.length; i++) {
      const [a, b] = [REMUNERACION_DE_ENTRADA[i - 1], REMUNERACION_DE_ENTRADA[i]];
      expect(b.desde.anio * 10000 + b.desde.mes * 100 + b.desde.dia).toBeGreaterThan(a.desde.anio * 10000 + a.desde.mes * 100 + a.desde.dia);
      expect(b.monto).toBeGreaterThanOrEqual(a.monto);
    }
  });

  it("se lee como en el Perú", () => {
    expect(soles(1230)).toBe("S/\u00a01,230");
    expect(soles(1300)).toBe("S/\u00a01,300");
  });
});

describe("lo que no puede decir un aviso de empleo (Ley 26772)", () => {
  // Un título en femenino o un requisito de edad, sexo, foto o apariencia en un aviso es discriminatorio (RLGIT 31.3, muy grave).
  const textos = [
    ...AREAS.flatMap((a) => [a.nombre, a.puestos]),
    ...BENEFICIOS.flatMap((b) => [b.titulo, b.texto]),
    ...PASOS_DEL_PROCESO.flatMap((p) => [p.titulo, p.texto]),
    ...AREAS.map((a) => mensajeParaPostular(a, "Trujillo")),
  ].join(" \n ");

  it("los puestos van con título neutro: nunca «asesora», «costurera», «encargada» ni «vendedora» solos", () => {
    expect(textos).not.toMatch(/\b(asesora|costurera|encargada|vendedora|vendedoras|asesoras|costureras)\b/i);
    expect(textos).toMatch(/Asesor\(a\)/);
  });

  it("no pide edad, sexo, estado civil, foto ni apariencia (los hijos solo aparecen en el apoyo a estudios)", () => {
    expect(textos).not.toMatch(/\b(edad|sexo|género|estado civil|soltera|casada|foto|buena presencia|talla|contextura)\b/i);
  });
});

describe("postular por WhatsApp", () => {
  it("el mensaje dice el área y la ciudad, y deja escribir el nombre", () => {
    const tiendas = AREAS.find((a) => a.clave === "tiendas")!;
    expect(mensajeParaPostular(tiendas, "Arequipa")).toBe("Hola, quiero trabajar en CAYLA, en la tienda de Arequipa. Mi nombre es ");
    expect(mensajeParaPostular(AREAS.find((a) => a.clave === "taller")!, null)).toBe("Hola, quiero trabajar en CAYLA, en el Taller. Mi nombre es ");
  });

  it("el enlace abre el chat de ese número con el mensaje", () => {
    expect(enlaceParaPostular("953585537", "Hola, ¿qué tal?")).toBe("https://wa.me/51953585537?text=Hola%2C%20%C2%BFqu%C3%A9%20tal%3F");
  });
});
