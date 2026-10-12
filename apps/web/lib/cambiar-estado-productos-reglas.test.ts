import { describe, expect, it } from "vitest";
import { destinoDelBoton, textosCambioEstado, type EstadoProducto, type VocabularioEstado } from "./cambiar-estado-productos-reglas";

describe("textosCambioEstado — el vocabulario de siempre no cambia", () => {
  it("descontinuar (barra de marcadas de la Tabla): las mismas palabras de antes", () => {
    const t = textosCambioEstado("descontinuado", 3);
    expect(t.verbo).toBe("Descontinuar");
    expect(t.titulo).toBe("¿Descontinuar 3 prendas?");
    expect(t.boton).toBe("Descontinuar 3");
    expect(t.exito).toBe("3 prendas descontinuadas");
    expect(t.accionError).toBe("descontinuar las prendas");
    expect(t.yaEsta).toBe("Ya está descontinuada: queda igual");
    expect(t.subtitulo).toBe("Dejan de contar para «Para pedir» y se ven marcadas en la Grilla y en la Tabla. Se pueden reactivar cuando quieras.");
    expect(t.nota).toBe("Para volver atrás, márcalas y usa «Reactivar». El historial de cada prenda guarda quién hizo el cambio.");
  });

  it("reactivar: las mismas palabras de antes, con el singular y el plural", () => {
    const una = textosCambioEstado("activo", 1);
    expect(una.verbo).toBe("Reactivar");
    expect(una.titulo).toBe("¿Reactivar 1 prenda?");
    expect(una.boton).toBe("Reactivar 1");
    expect(una.exito).toBe("1 prenda reactivada");
    expect(una.accionError).toBe("reactivar las prendas");
    expect(una.yaEsta).toBe("Ya está activa: queda igual");
    expect(textosCambioEstado("activo", 2).exito).toBe("2 prendas reactivadas");
  });
});

describe("textosCambioEstado — «Desactivar» (vista rápida)", () => {
  it("usa el verbo del botón en el título, el aviso y el error", () => {
    const t = textosCambioEstado("descontinuado", 1, "desactivar");
    expect(t.verbo).toBe("Desactivar");
    expect(t.titulo).toBe("¿Desactivar 1 prenda?");
    expect(t.boton).toBe("Desactivar");
    expect(t.exito).toBe("1 prenda desactivada");
    expect(t.accionError).toBe("desactivar las prendas");
    expect(t.yaEsta).toBe("Ya está desactivada: queda igual");
  });

  it("el botón lleva el número solo cuando son varias; reactivar una también va sin número", () => {
    expect(textosCambioEstado("descontinuado", 2, "desactivar").boton).toBe("Desactivar 2");
    expect(textosCambioEstado("activo", 1, "desactivar").boton).toBe("Reactivar");
    expect(textosCambioEstado("activo", 4, "desactivar").boton).toBe("Reactivar 4");
    // La Tabla (descontinuar) conserva «Descontinuar 1» como siempre.
    expect(textosCambioEstado("descontinuado", 1).boton).toBe("Descontinuar 1");
  });

  it("dice dónde queda y cómo volver: no se borra nada y se reencuentra en «Descontinuados»", () => {
    const t = textosCambioEstado("descontinuado", 1, "desactivar");
    expect(t.subtitulo).toContain("No se borra nada");
    expect(t.subtitulo).toContain("«Descontinuados»");
    expect(t.nota).toContain("«Reactivar»");
  });

  it("reactivar dice lo mismo en los dos vocabularios (la única diferencia es el número del botón con una sola prenda)", () => {
    for (const v of ["descontinuar", "desactivar"] as VocabularioEstado[]) {
      expect(textosCambioEstado("activo", 2, v)).toEqual(textosCambioEstado("activo", 2));
    }
  });
});

describe("textosCambioEstado — recorre todas las combinaciones", () => {
  it("ningún texto queda vacío ni con «undefined»/«NaN» y el número entra en el título y el aviso", () => {
    const destinos: EstadoProducto[] = ["activo", "descontinuado"];
    const vocabularios: VocabularioEstado[] = ["descontinuar", "desactivar"];
    for (const d of destinos) {
      for (const v of vocabularios) {
        for (const n of [1, 2, 12]) {
          const t = textosCambioEstado(d, n, v);
          for (const texto of Object.values(t)) {
            expect(texto.trim()).not.toBe("");
            expect(texto).not.toMatch(/undefined|NaN/);
          }
          expect(t.titulo).toContain(String(n));
          expect(t.exito).toContain(String(n));
          expect(t.titulo.startsWith("¿") && t.titulo.endsWith("?")).toBe(true);
        }
      }
    }
  });
});

describe("destinoDelBoton", () => {
  it("activa → se desactiva; descontinuada (o sin saber el estado) → se reactiva, igual que el chip de la vista rápida", () => {
    expect(destinoDelBoton("activo")).toBe("descontinuado");
    expect(destinoDelBoton("descontinuado")).toBe("activo");
    expect(destinoDelBoton(null)).toBe("activo");
    expect(destinoDelBoton(undefined)).toBe("activo");
  });
});
