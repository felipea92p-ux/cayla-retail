import { describe, expect, it } from "vitest";
import { estadosDe, sePuedeConfirmar } from "./guia-campos";
import { camposDeRegistroMarca, type PreguntasPendientes } from "./marca-registro-guia";
import { registroListo, type MarcaDelFormulario, type ProveedorDelFormulario } from "./marca-proveedor-reglas";

const sinPreguntas: PreguntasPendientes = { marca: 0, proveedor: 0, proveedorIgual: false };
const existente: MarcaDelFormulario = { nombre: "CAYLA", existe: true, proveedores: ["Jacard"] };
const nueva: MarcaDelFormulario = { nombre: "Nube", existe: false };

describe("guía de «Registrar marca o proveedor»", () => {
  it("vacío: lo que sigue es la marca, y luego quién te la trae", () => {
    expect(estadosDe(camposDeRegistroMarca(null, null, sinPreguntas))).toEqual({ marca: "ahora", proveedor: "falta" });
  });

  it("con la marca elegida, lo que sigue es el proveedor", () => {
    expect(estadosDe(camposDeRegistroMarca(nueva, null, sinPreguntas))).toEqual({ marca: "hecho", proveedor: "ahora" });
  });

  it("una pregunta de «¿no será una marca que ya existe?» sin responder deja la marca por hacer", () => {
    const campos = camposDeRegistroMarca(nueva, { tipo: "existente", nombre: "Taller Lima" }, { ...sinPreguntas, marca: 1 });
    expect(estadosDe(campos).marca).toBe("ahora");
    expect(campos[0].pendiente).toMatch(/ya existe/);
  });

  it("la pareja repetida deja el proveedor por hacer, con su frase", () => {
    const campos = camposDeRegistroMarca(existente, { tipo: "existente", nombre: "Jacard" }, sinPreguntas);
    expect(estadosDe(campos).proveedor).toBe("ahora");
    expect(campos[1].pendiente).toMatch(/ya la trae/);
  });

  it("«sin proveedor» o «-» no son nombres: la guía dice que se deje el campo vacío (2026-10-09)", () => {
    const campos = camposDeRegistroMarca({ nombre: "SIN PROVEEDOR", existe: false }, { tipo: "nuevo", razonSocial: "-" }, sinPreguntas);
    expect(campos[0].hecho).toBe(false);
    expect(campos[0].pendiente).toMatch(/no es una marca/);
    expect(campos[1].hecho).toBe(false);
    expect(campos[1].pendiente).toMatch(/no es un proveedor/);
  });

  // La coherencia que importa: «se puede registrar» según la guía ⇔ `registroListo`.
  it("coincide con registroListo en cada combinación", () => {
    const marcas: (MarcaDelFormulario | null)[] = [null, nueva, existente, { nombre: "  ", existe: false }, { nombre: "SIN PROVEEDOR", existe: false }];
    const proveedores: ProveedorDelFormulario[] = [
      null,
      { tipo: "existente", nombre: "Jacard" },
      { tipo: "existente", nombre: "Taller Lima" },
      { tipo: "nuevo", razonSocial: "" },
      { tipo: "nuevo", razonSocial: "Textil Andina SAC" },
      { tipo: "nuevo", razonSocial: "-" },
    ];
    for (const m of marcas)
      for (const p of proveedores)
        for (const pm of [0, 1])
          for (const pp of [0, 2])
            for (const igual of [false, true]) {
              const q = { marca: pm, proveedor: pp, proveedorIgual: igual };
              expect(sePuedeConfirmar(camposDeRegistroMarca(m, p, q)), JSON.stringify({ m, p, q })).toBe(registroListo(m, p, pm + pp + (igual ? 1 : 0)));
            }
  });
});
