import { describe, expect, it } from "vitest";
import { botonDeTarjeta, opcionesDeMas } from "./existencias-acciones";

describe("botonDeTarjeta", () => {
  const base = { puedeReponer: true, tallasPorColgar: 0, tallasSinColgar: 0, hayQueBajar: true, agotadas: [] as string[] };

  it("si falta colgar: «Colgar en el piso», con cuántas tallas si son varias", () => {
    expect(botonDeTarjeta({ ...base, tallasPorColgar: 1 })).toEqual({ tipo: "colgar", etiqueta: "Colgar en el piso", sugerido: true });
    expect(botonDeTarjeta({ ...base, tallasPorColgar: 3 }).etiqueta).toBe("Colgar en el piso · 3 tallas");
  });
  it("cuenta solo las tallas del color que se ve; si ese no tiene, «Colgar en otros colores»", () => {
    expect(botonDeTarjeta({ ...base, tallasPorColgar: 3, tallasDelColor: 1 }).etiqueta).toBe("Colgar en el piso");
    expect(botonDeTarjeta({ ...base, tallasSinColgar: 2, tallasDelColor: 0 }).etiqueta).toBe("Colgar en otros colores");
  });
  it("colgar gana al aviso de agotada", () => {
    expect(botonDeTarjeta({ ...base, tallasPorColgar: 2, agotadas: ["L"] }).tipo).toBe("colgar");
  });
  it("sin permiso de colgar o sin nada en almacén no hay botón de colgar", () => {
    expect(botonDeTarjeta({ ...base, tallasPorColgar: 2, puedeReponer: false })).toEqual({ tipo: "sinColgar", etiqueta: "2 tallas sin colgar" });
    expect(botonDeTarjeta({ ...base, tallasPorColgar: 2, hayQueBajar: false }).tipo).toBe("sinColgar");
  });
  it("una talla agotada: «Se acabó: L» (ya no hay «Pedir talla»)", () => {
    expect(botonDeTarjeta({ ...base, agotadas: ["S", "L"] })).toEqual({ tipo: "agotada", etiqueta: "Se acabó: S, L" });
  });
  it("con un filtro que no es colgar: «Ver talla»", () => {
    expect(botonDeTarjeta({ ...base, tallasPorColgar: 2, verTalla: "M" })).toEqual({ tipo: "ver", etiqueta: "Ver talla M" });
  });
  it("con el piso en pausa (el motor no marca nada) y 0 colgadas: Colgar igual, sin el ámbar; nunca «Todo en el piso»", () => {
    expect(botonDeTarjeta({ ...base, tallasSinColgar: 3 })).toEqual({ tipo: "colgar", etiqueta: "Colgar en el piso · 3 tallas", sugerido: false });
  });
  it("nada que hacer: «Todo en el piso»", () => {
    expect(botonDeTarjeta(base).tipo).toBe("ok");
  });
});

describe("opcionesDeMas", () => {
  const todo = { puedeReponer: true, puedeEnviar: true, puedePedir: true, puedeAjustar: true, hayEnElPiso: true, hayEnAlmacen: true, pedible: "L" };

  it("lleva Subir, Enviar, Pedir, Ajustar y Ver ficha, en ese orden", () => {
    expect(opcionesDeMas(todo).map((o) => o.etiqueta)).toEqual(["Subir a almacén", "Enviar a otra sede", "Pedir talla L a otra sede", "Ajustar stock", "Ver ficha"]);
  });
  it("lo que hoy no se puede se ve apagado y dice por qué", () => {
    const o = opcionesDeMas({ ...todo, hayEnElPiso: false, hayEnAlmacen: false, pedible: null });
    expect(o.find((x) => x.clave === "subir")?.motivo).toBe("No hay nada colgado");
    expect(o.find((x) => x.clave === "enviar")?.motivo).toBe("No hay nada en almacén");
    expect(o.find((x) => x.clave === "pedir")?.motivo).toBe("Ninguna talla agotada que otra sede tenga");
  });
  it("lo que el rol no tiene no se dibuja; Ver ficha siempre", () => {
    expect(opcionesDeMas({ ...todo, puedeReponer: false, puedeEnviar: false, puedePedir: false, puedeAjustar: false }).map((o) => o.clave)).toEqual(["ficha"]);
  });
});
