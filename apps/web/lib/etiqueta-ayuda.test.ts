import { describe, expect, it } from "vitest";
import { ayudaDeEtiqueta, type EtiquetaParaAyuda } from "./etiqueta-ayuda";

const base = (extra: Partial<EtiquetaParaAyuda>): EtiquetaParaAyuda => ({
  nombre: "Algo raro",
  estilo: "neutral",
  descuentoPct: null,
  categoriaIds: [],
  vigenteDesde: null,
  vigenteHasta: null,
  ...extra,
});
const HOY = "2026-09-26";

describe("ayudaDeEtiqueta · qué es", () => {
  it("reconoce por el nombre las etiquetas conocidas y las dice en palabras de la tienda", () => {
    expect(ayudaDeEtiqueta(base({ nombre: "Últimas unidades", estilo: "urgencia" }), { cubierta: false, hoy: HOY }).queEs).toContain("pocas unidades");
    expect(ayudaDeEtiqueta(base({ nombre: "Hecho a mano", estilo: "positivo" }), { cubierta: false, hoy: HOY }).queEs).toContain("Taller de Lima");
    expect(ayudaDeEtiqueta(base({ nombre: "Día de la Madre", estilo: "campana" }), { cubierta: false, hoy: HOY }).queEs).toContain("segundo domingo de mayo");
  });
  it("una variante del mismo concepto («Para liquidar — Tienda AQP») usa la misma frase", () => {
    expect(ayudaDeEtiqueta(base({ nombre: "Para liquidar — Tienda AQP", estilo: "urgencia" }), { cubierta: false, hoy: HOY }).queEs).toBe("Prendas que se están liquidando.");
  });
  it("una etiqueta que solo se PARECE al concepto (otro grupo) no recibe su frase: «Nueva colección» no es «Nuevo»", () => {
    expect(ayudaDeEtiqueta(base({ nombre: "Nueva colección", estilo: "neutral" }), { cubierta: false, hoy: HOY }).queEs).toBe("Una etiqueta para agrupar y buscar prendas.");
    expect(ayudaDeEtiqueta(base({ nombre: "Nuevo", estilo: "urgencia" }), { cubierta: false, hoy: HOY }).queEs).toBe("Prendas recién llegadas.");
    expect(ayudaDeEtiqueta(base({ nombre: "Última llamada", estilo: "campana" }), { cubierta: false, hoy: HOY }).queEs).toBe("Una campaña o festividad.");
  });
  it("no promete lo que el sistema todavía no hace: ninguna frase dice que el sistema mide o marca solo", () => {
    for (const nombre of ["Top ventas", "Últimas unidades", "Hecho a mano"]) {
      const est = nombre === "Hecho a mano" ? "positivo" : "urgencia";
      expect(ayudaDeEtiqueta(base({ nombre, estilo: est }), { cubierta: false, hoy: HOY }).queEs).not.toMatch(/mide el sistema|el sistema (la )?marca|antes de aprobarla/);
    }
  });
  it("un nombre que no se reconoce cae en una frase por su grupo, no vacía ni falsa", () => {
    expect(ayudaDeEtiqueta(base({ nombre: "Día del Niño", estilo: "campana" }), { cubierta: false, hoy: HOY }).queEs).toBe("Una campaña o festividad.");
    expect(ayudaDeEtiqueta(base({ nombre: "Verano", estilo: "urgencia" }), { cubierta: false, hoy: HOY }).queEs).toBe("Dice cómo está rotando la prenda.");
  });
  it("un estilo que la base no conoce se trata como General", () => {
    expect(ayudaDeEtiqueta(base({ estilo: "inventado" }), { cubierta: false, hoy: HOY }).queEs).toBe("Una etiqueta para agrupar y buscar prendas.");
  });
  it("no repite las notas técnicas: ninguna frase habla de código ni de patrones de otras marcas", () => {
    for (const nombre of ["Nuevo", "Últimas unidades", "Top ventas", "Hecho a mano", "Pieza única", "Reedición", "CyberWow", "Black Friday"]) {
      expect(ayudaDeEtiqueta(base({ nombre }), { cubierta: false, hoy: HOY }).queEs).not.toMatch(/fn_|lib\/|Bershka|Zara|Hermès|Ralph/);
    }
  });
});

describe("ayudaDeEtiqueta · datos de campaña", () => {
  it("dice cuánto descuenta, sin redondear un 12.5 a 13", () => {
    expect(ayudaDeEtiqueta(base({ descuentoPct: 20 }), { cubierta: false, hoy: HOY }).datos).toContain("Descuenta 20 % en las prendas que la llevan.");
    expect(ayudaDeEtiqueta(base({ descuentoPct: 12.5 }), { cubierta: false, hoy: HOY }).datos[0]).toContain("12.5 %");
  });
  it("una etiqueta informativa (sin descuento ni fechas) no trae datos", () => {
    expect(ayudaDeEtiqueta(base({}), { cubierta: false, hoy: HOY }).datos).toEqual([]);
  });
  it("si la campaña ya rige sola sobre la categoría, lo dice", () => {
    expect(ayudaDeEtiqueta(base({ descuentoPct: 20 }), { cubierta: true, hoy: HOY }).datos).toContain("Ya rige sola sobre esta categoría: no hace falta elegirla.");
  });
  it("una campaña cubierta que aún no empieza dice «se aplicará», no «ya rige» (sin contradecirse)", () => {
    const d = ayudaDeEtiqueta(base({ descuentoPct: 10, vigenteDesde: "2026-11-09", vigenteHasta: "2026-11-30" }), { cubierta: true, hoy: HOY }).datos;
    expect(d.some((x) => x.startsWith("Se aplicará sola"))).toBe(true);
    expect(d.some((x) => x.startsWith("Ya rige"))).toBe(false);
  });
  it("un estilo con nombre de propiedad del prototipo («constructor») cae en General", () => {
    expect(ayudaDeEtiqueta(base({ estilo: "constructor" }), { cubierta: false, hoy: HOY }).queEs).toBe("Una etiqueta para agrupar y buscar prendas.");
  });
  it("dice si la temporada está vigente y hasta cuándo, o cuánto falta para que empiece", () => {
    const vigente = ayudaDeEtiqueta(base({ vigenteDesde: "2026-09-20", vigenteHasta: "2026-10-01" }), { cubierta: false, hoy: HOY }).datos;
    expect(vigente.some((d) => d.startsWith("Vigente hasta el"))).toBe(true);
    // sin doble punto al final («1 oct..»)
    for (const d of [...vigente, ...ayudaDeEtiqueta(base({ vigenteDesde: "2026-10-01", vigenteHasta: "2026-10-14" }), { cubierta: false, hoy: HOY }).datos]) expect(d).not.toMatch(/\.\.$/);
    expect(ayudaDeEtiqueta(base({ vigenteDesde: "2026-10-01", vigenteHasta: "2026-10-14" }), { cubierta: false, hoy: HOY }).datos.some((d) => d.startsWith("Empieza en 5 días"))).toBe(true);
    expect(ayudaDeEtiqueta(base({ vigenteDesde: "2026-09-27", vigenteHasta: "2026-10-14" }), { cubierta: false, hoy: HOY }).datos).toContain("Empieza mañana.");
  });
  it("sin fecha de fin, una etiqueta ya empezada dice solo «Vigente»", () => {
    expect(ayudaDeEtiqueta(base({ vigenteDesde: "2026-09-01" }), { cubierta: false, hoy: HOY }).datos).toContain("Vigente.");
  });
});
