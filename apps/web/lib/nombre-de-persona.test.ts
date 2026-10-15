import { describe, expect, it } from "vitest";
import { nombreAMedias, nombreCompleto, nombreDePersona } from "@cayla-retail/shared";

// La regla única del nombre de una persona (Felipe 2026-10-15: «María Pérez García» en todo el sistema y el saludo «¡Listo,
// María!»), en `packages/shared/src/nombre-del-padron.ts`. La usa la consulta al padrón (y por ella el ERP, el cartel del Club, los
// comprobantes y la tienda online). Los nombres son inventados.

const completo = (fuente: Parameters<typeof nombreDePersona>[0]) => {
  const n = nombreDePersona(fuente);
  return n ? nombreCompleto(n) : null;
};

describe("el nombre por partes (los proveedores de pago): no se adivina nada", () => {
  it("dos nombres y dos apellidos: nombres primero, con mayúsculas y minúsculas normales y sus tildes", () => {
    const n = nombreDePersona({ partes: { nombres: "MARÍA FERNANDA", apellidoPaterno: "PÉREZ", apellidoMaterno: "GARCÍA" } });
    expect(n).toEqual({ nombres: "María Fernanda", apellidos: "Pérez García" });
    expect(nombreCompleto(n!)).toBe("María Fernanda Pérez García");
    expect(nombreAMedias(n!)).toBe("María P. G.");
  });

  it("un solo apellido (sin materno)", () => {
    expect(completo({ partes: { nombres: "ROSA", apellidoPaterno: "QUISPE", apellidoMaterno: null } })).toBe("Rosa Quispe");
    expect(completo({ partes: { nombres: "ROSA", apellidoPaterno: "", apellidoMaterno: "QUISPE" } })).toBe("Rosa Quispe");
  });

  it("«DE LA CRUZ» es un apellido: suelto empieza con mayúscula; dentro del nombre, la partícula va en minúscula", () => {
    const n = nombreDePersona({ partes: { nombres: "MARÍA DEL CARMEN", apellidoPaterno: "DE LA CRUZ", apellidoMaterno: "PÉREZ" } });
    expect(n).toEqual({ nombres: "María del Carmen", apellidos: "De la Cruz Pérez" });
    expect(nombreCompleto(n!)).toBe("María del Carmen de la Cruz Pérez");
    expect(nombreAMedias(n!)).toBe("María C. P.");
  });

  it("con las partes y además junto, mandan las partes (aunque lo junto venga en otro orden)", () => {
    const partes = { nombres: "ANA", apellidoPaterno: "TORRES", apellidoMaterno: "RUIZ" };
    expect(completo({ partes, junto: "ANA TORRES RUIZ" })).toBe("Ana Torres Ruiz");
    expect(completo({ partes, junto: "TORRES RUIZ ANA" })).toBe("Ana Torres Ruiz");
  });

  it("solo los nombres, sin apellidos ni nada junto: se usan los nombres", () => {
    expect(completo({ partes: { nombres: "ROSA" } })).toBe("Rosa");
  });
});

describe("el nombre junto (SUNAT público, o un proveedor sin partes)", () => {
  it("sin coma: los dos primeros grupos son los apellidos (como lo escribe el padrón)", () => {
    expect(completo({ junto: "PÉREZ GARCÍA MARÍA" })).toBe("María Pérez García");
    expect(completo({ junto: "PÉREZ GARCÍA MARÍA FERNANDA" })).toBe("María Fernanda Pérez García");
  });

  it("con coma («APELLIDOS,NOMBRES», el DNI de SUNAT público): la coma dice qué es qué", () => {
    expect(nombreDePersona({ junto: "PAREDES SOTO,LUCÍA ANDREA   " })).toEqual({ nombres: "Lucía Andrea", apellidos: "Paredes Soto" });
    expect(completo({ junto: "QUISPE, ROSA MARÍA" })).toBe("Rosa María Quispe");
  });

  it("«DE LA CRUZ» cuenta como un solo apellido también junto", () => {
    const n = nombreDePersona({ junto: "DE LA CRUZ QUISPE ROSA MARIA" });
    expect(n).toEqual({ nombres: "Rosa Maria", apellidos: "De la Cruz Quispe" });
    expect(nombreCompleto(n!)).toBe("Rosa Maria de la Cruz Quispe");
    expect(nombreAMedias(n!)).toBe("Rosa C. Q.");
    expect(completo({ junto: "DEL ÁGUILA PAREDES MARÍA DE LOS ÁNGELES" })).toBe("María de los Ángeles del Águila Paredes");
  });

  it("dos grupos: uno y uno; una palabra: solo el nombre", () => {
    expect(completo({ junto: "QUISPE ROSA" })).toBe("Rosa Quispe");
    expect(completo({ junto: "ROSA" })).toBe("Rosa");
  });

  it("la ñ, las tildes, el guion y el apóstrofo; no inventa tildes que el padrón no trae", () => {
    expect(completo({ junto: "IBÁÑEZ MUÑOZ ÁNGELA" })).toBe("Ángela Ibáñez Muñoz");
    expect(completo({ junto: "O'BRIEN PÉREZ-SALAS ANA" })).toBe("Ana O'Brien Pérez-Salas");
    expect(completo({ junto: "PEREZ GARCIA MARIA" })).toBe("Maria Perez Garcia");
  });

  it("espacios de más y minúsculas no cambian nada; vacío no es un nombre", () => {
    expect(completo({ junto: "  perez   garcia  maria  " })).toBe("Maria Perez Garcia");
    expect(nombreDePersona({ junto: "   " })).toBeNull();
    expect(nombreDePersona({ junto: null })).toBeNull();
    expect(nombreDePersona({})).toBeNull();
  });

  it("es estable: aplicarla a un nombre ya legible no lo cambia", () => {
    const n = nombreDePersona({ partes: { nombres: "María del Carmen", apellidoPaterno: "de la Cruz", apellidoMaterno: "Pérez" } });
    expect(nombreCompleto(n!)).toBe("María del Carmen de la Cruz Pérez");
  });
});

describe("a medias («¿Eres María P. G.?»): el primer nombre y la inicial de cada apellido, nunca el nombre completo", () => {
  it("con las partes que devuelve la consulta al padrón; sin nombres (un RUC), null", () => {
    expect(nombreAMedias({ nombres: "Lucía Andrea", apellidos: "Paredes Soto" })).toBe("Lucía P. S.");
    expect(nombreAMedias({ nombres: "Rosa", apellidos: "" })).toBe("Rosa");
    expect(nombreAMedias({ nombres: null, apellidos: null })).toBeNull();
    expect(nombreAMedias({ nombres: "  ", apellidos: "Soto" })).toBeNull();
  });

  it("nunca deja ver un apellido entero", () => {
    for (const junto of ["PÉREZ GARCÍA MARÍA", "DE LA CRUZ QUISPE ROSA MARIA", "PAREDES SOTO,LUCÍA ANDREA", "QUISPE ROSA"]) {
      const n = nombreDePersona({ junto })!;
      const corto = nombreAMedias(n)!;
      for (const apellido of n.apellidos.split(" ").filter((p) => p.length > 3)) expect(corto).not.toContain(apellido);
    }
  });
});
