import { describe, expect, it } from "vitest";
import { campanaValida } from "./etiqueta-campana-guia";
import { camposDeDatos, datosValidos, leerCampanaDetalle, limpiarNombre, NOMBRE_MAX } from "./campana-detalle";

const DETALLE = {
  id: "c1",
  nombre: "Día Internacional del Gato",
  activo: true,
  estado: "aprobado",
  desde: "2026-10-01",
  hasta: "2026-10-30",
  pct: "10.00",
  categoria_ids: [],
  variante_ids: ["v1", "v2"],
  prendas: [{ producto_id: "p1", nombre: "Adelle Wide Leg", codigo: "JEA-001", categoria: "Jeans", prefijo: "JEA", familia: "ROPA", foto: null, variantes: 2, colores: [{ nombre: "Azul marino", hex: "#2A304E" }] }],
};

describe("leer la campaña por dentro", () => {
  it("una campaña bien formada, con su % convertido a número", () => {
    const c = leerCampanaDetalle(DETALLE);
    expect(c?.pct).toBe(10);
    expect(c?.prendas[0]).toMatchObject({ productoId: "p1", variantes: 2, colores: [{ nombre: "Azul marino", hex: "#2A304E" }] });
  });
  it("una forma inesperada devuelve null", () => {
    expect(leerCampanaDetalle({ ...DETALLE, variante_ids: [1] })).toBeNull();
    expect(leerCampanaDetalle({ ...DETALLE, prendas: [{ nombre: "x" }] })).toBeNull();
    expect(leerCampanaDetalle({ ...DETALLE, desde: "1 de octubre" })).toBeNull();
    expect(leerCampanaDetalle(null)).toBeNull();
  });
});

describe("el formulario de Datos: la guía sale de la misma regla que apaga «Guardar»", () => {
  const NOMBRES = ["", "   ", "Día del Gato", "a".repeat(NOMBRE_MAX), "a".repeat(NOMBRE_MAX + 1), "  Black   Friday "];
  const DESCUENTOS = ["", "10", "12.5", "0", "150", "diez"];
  const FECHAS: [string, string][] = [["", ""], ["2026-10-01", "2026-10-30"], ["2026-10-30", "2026-10-01"], ["2026-10-01", ""]];
  it("en todas las combinaciones, se puede guardar ⇔ ningún campo obligatorio queda pendiente", () => {
    for (const nombre of NOMBRES)
      for (const descuento of DESCUENTOS)
        for (const [desde, hasta] of FECHAS) {
          const e = { nombre, descuento, desde, hasta, categorias: 0, puedeDarDescuento: true };
          const pendientes = camposDeDatos(e).filter((c) => c.requerido && !c.hecho);
          expect(pendientes.length === 0, JSON.stringify(e)).toBe(datosValidos(e));
        }
  });
  it("no agrega reglas a las de la campaña: con un nombre bueno, vale lo mismo que en Atributos", () => {
    for (const descuento of DESCUENTOS)
      for (const [desde, hasta] of FECHAS) expect(datosValidos({ nombre: "Navidad", descuento, desde, hasta })).toBe(campanaValida({ descuento, desde, hasta }));
  });
  it("el nombre se guarda sin espacios de más", () => {
    expect(limpiarNombre("  Black   Friday ")).toBe("Black Friday");
    // /chaos ENT-04 (2026-10-17): un carácter invisible no hace «distinta» a una campaña que ya existe («Navi\u200bdad» pasaba como nueva).
    expect(limpiarNombre("Navi\u200bdad")).toBe("Navidad");
    expect(limpiarNombre("\u200b  Navidad\ufeff ")).toBe("Navidad");
    expect(limpiarNombre("Navi\u2060dad\u200c\u200d")).toBe("Navidad");
    // Los que dan vuelta la lectura de un texto (un nombre que se lee al revés en la lista).
    expect(limpiarNombre("Navi\u202edad")).toBe("Navidad");
    expect(limpiarNombre("\u2066Navidad\u2069")).toBe("Navidad");
    // Lo visible no se toca: tildes, ñ, emojis.
    expect(limpiarNombre("Día del Año 🐱")).toBe("Día del Año 🐱");
    // Un nombre hecho solo de invisibles queda vacío (el botón queda apagado).
    expect(limpiarNombre("\u200b\u200b \u200b")).toBe("");
  });
});
