import { describe, expect, it } from "vitest";
import { proveedoresParecidos, sinFormaSocietaria } from "./proveedores-reglas";

// «¿No será un proveedor que ya tienes?» (2026-09-25). Aparte de `proveedores-reglas.test.ts` para que esta prueba y
// la de rubros (ADR-0213) no se pisen el mismo bloque de imports.

describe("sinFormaSocietaria: «SAC» dice cómo está constituida la empresa, no quién es", () => {
  it("quita la forma del final, escrita junta o con puntos (que llega en letras sueltas)", () => {
    expect(sinFormaSocietaria(["jacard", "peru", "sac"])).toEqual(["jacard", "peru"]);
    expect(sinFormaSocietaria(["jacard", "peru", "s", "a", "c"])).toEqual(["jacard", "peru"]);
    expect(sinFormaSocietaria(["skopjer", "s", "r", "l"])).toEqual(["skopjer"]);
    expect(sinFormaSocietaria(["corporacion", "imperium", "scrl"])).toEqual(["corporacion", "imperium"]);
    expect(sinFormaSocietaria(["amuza", "peru", "e", "i", "r", "l"])).toEqual(["amuza", "peru"]);
    expect(sinFormaSocietaria(["banco", "s", "a", "a"])).toEqual(["banco"]);
  });

  it("una inicial antes de la forma se queda: solo sale la forma", () => {
    expect(sinFormaSocietaria(["textil", "m", "s", "a", "c"])).toEqual(["textil", "m"]);
  });

  it("nunca deja el nombre vacío, y no toca lo que no es una forma", () => {
    expect(sinFormaSocietaria(["sac"])).toEqual(["sac"]);
    expect(sinFormaSocietaria(["s", "a", "c"])).toEqual(["s", "a", "c"]);
    expect(sinFormaSocietaria(["i", "love", "chocolate"])).toEqual(["i", "love", "chocolate"]);
    expect(sinFormaSocietaria(["sac", "textiles"])).toEqual(["sac", "textiles"]);
  });
});

describe("proveedoresParecidos (el caso Jacard)", () => {
  // Razones sociales de producción (solo empresas; los proveedores que son personas naturales no se copian al repo).
  const existentes = [
    { id: "p1", nombre: "Jacard Peru SAC", ruc: "20600549546" },
    { id: "p2", nombre: "CAYLA SAC", ruc: null },
    { id: "p3", nombre: "Skopjer SRL", ruc: "20600033892" },
    { id: "p4", nombre: "Corporación Imperium SCRL", ruc: "20553846227" },
    { id: "p5", nombre: "Consorcio Textil Sassari SAC", ruc: "20609243369" },
    { id: "p6", nombre: "Moda Mia", ruc: null },
    { id: "p7", nombre: "Valeria Mia Peru Moda EIRL", ruc: "20609396271" },
  ];
  const preguntaPor = (nombre: string, ruc?: string) => proveedoresParecidos({ nombre, ruc }, existentes).parecidos.map((p) => `${p.proveedor.nombre}:${p.por}`);

  it("la base dejaría pasar «Jacard Perú S.A.C.» (no es igual para ella), y aquí se pregunta", () => {
    const r = proveedoresParecidos({ nombre: "Jacard Perú S.A.C." }, existentes);
    expect(r.igual).toBeNull();
    expect(r.parecidos.map((p) => `${p.proveedor.nombre}:${p.por}`)).toEqual(["Jacard Peru SAC:raiz"]);
    expect(preguntaPor("Jacard Peru")).toEqual(["Jacard Peru SAC:raiz"]);
    expect(preguntaPor("JACARD PERU S.A.C")).toEqual(["Jacard Peru SAC:raiz"]);
    expect(preguntaPor("Skopjer S.R.L.")).toEqual(["Skopjer SRL:raiz"]);
    expect(preguntaPor("Corporacion Imperium S.C.R.L.")).toEqual(["Corporación Imperium SCRL:raiz"]);
  });

  it("el nombre igual para la base es «igual», no «parecido»: ese lo rechaza la base", () => {
    expect(proveedoresParecidos({ nombre: "jacard  peru sac" }, existentes)).toEqual({ igual: existentes[0], parecidos: [] });
  });

  it("un error de tipeo o el nombre corto también se preguntan", () => {
    expect(preguntaPor("Jacquard Peru SAC")).toEqual(["Jacard Peru SAC:letras"]);
    expect(preguntaPor("Jacard")).toEqual(["Jacard Peru SAC:contenida"]);
    expect(preguntaPor("Sassari")).toEqual(["Consorcio Textil Sassari SAC:contenida"]);
    expect(preguntaPor("Cayla")).toEqual(["CAYLA SAC:raiz"]);
  });

  it("dos RUC válidos y distintos son dos contribuyentes: no se pregunta", () => {
    expect(preguntaPor("Jacard Peru EIRL", "20999999991")).toEqual([]);
    // Sin RUC nuevo, o si al existente le falta el suyo, sí: no hay cómo saber.
    expect(preguntaPor("Jacard Peru EIRL")).toEqual(["Jacard Peru SAC:raiz"]);
    expect(preguntaPor("Cayla EIRL", "20999999991")).toEqual(["CAYLA SAC:raiz"]);
    // Un RUC a medio escribir todavía no distingue nada.
    expect(preguntaPor("Jacard Peru EIRL", "20999")).toEqual(["Jacard Peru SAC:raiz"]);
  });

  it("el único par que dispara entre los 76 proveedores de producción (2026-09-25) es este, y es una pregunta, no un freno", () => {
    expect(preguntaPor("Moda Mia")).toEqual(["Valeria Mia Peru Moda EIRL:contenida"]);
  });

  it("un proveedor nuevo de verdad no dispara nada", () => {
    expect(proveedoresParecidos({ nombre: "Textiles Andina SAC" }, existentes)).toEqual({ igual: null, parecidos: [] });
    expect(proveedoresParecidos({ nombre: "  " }, existentes)).toEqual({ igual: null, parecidos: [] });
  });

  it("muestra a lo más 3, de más a menos parecido", () => {
    const muchos = ["Jacard Peru SAC", "Jacard Peru EIRL", "Jacard Perú", "Jacard Peru Moda SAC"].map((nombre, i) => ({ id: `j${i}`, nombre, ruc: null }));
    const r = proveedoresParecidos({ nombre: "Jacard Peru S.A.C." }, muchos);
    expect(r.parecidos.map((p) => p.por)).toEqual(["raiz", "raiz", "raiz"]);
  });
});
