import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Parecido } from "../components/alta-producto/AvisoParecidos";
import type { CandidataAlta, ParametrosCandidatas } from "./parecidas-alta-tipos";
import type { EntradaParecidasAlta } from "./useParecidasAlta";

// ============================================================================
// El hook que conecta «Prendas parecidas» con el formulario, sin navegador: `renderToString` corre el render (no los efectos), así que aquí
// se prueba el CABLEADO —qué se le pide a la lectura y qué sale hacia el formulario—; la lógica delicada (qué frena, qué se manda) está en
// `parecidas-alta-estado.test.ts`, que no necesita React. La base y la lectura se sustituyen por dobles: ningún dato es real.
// ============================================================================

const dobles = vi.hoisted(() => ({
  base: { items: [] as Parecido[], fallo: false, comprobando: false, hayIdentico: false, hayUnaLetra: false, confirmo: false },
  candidatas: { candidatas: [] as unknown[], cargando: false, fallo: false },
  pedidos: [] as unknown[],
  llamadasBase: [] as unknown[],
  aviso: { reintentos: 0, reinicios: 0 },
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => {
    throw new Error("Esta prueba no toca la base.");
  },
}));
vi.mock("./use-parecidos", () => ({
  useParecidos: (p: unknown) => {
    dobles.llamadasBase.push(p);
    return {
      ...dobles.base,
      confirmar: () => {},
      reintentar: () => {
        dobles.aviso.reintentos++;
      },
      reiniciar: () => {
        dobles.aviso.reinicios++;
      },
    };
  },
}));
vi.mock("./useCandidatasAlta", () => ({
  useCandidatasAlta: (p: unknown) => {
    dobles.pedidos.push(p);
    return { ...dobles.candidatas, reintentar: () => {} };
  },
}));

import { useParecidasAlta } from "./useParecidasAlta";

const ENTRADA: EntradaParecidasAlta = {
  nombre: "",
  descripcion: "",
  tejido: null,
  patron: null,
  categoriaId: "c-jeans",
  categoriaNombre: "Jeans",
  marcaId: "m-jirish",
  marcaNombre: "Jirish",
  enLinea: true,
};

function render(entrada: Partial<EntradaParecidasAlta> = {}) {
  let salida!: ReturnType<typeof useParecidasAlta>;
  function Sonda() {
    salida = useParecidasAlta({ ...ENTRADA, ...entrada });
    return createElement("div", null, "ok");
  }
  renderToString(createElement(Sonda));
  const pedido = dobles.pedidos.at(-1) as ParametrosCandidatas;
  return { salida, pedido };
}

const cand = (c: Partial<CandidataAlta> & Pick<CandidataAlta, "id" | "referencia">): CandidataAlta => ({
  categoriaId: "c-jeans",
  categoria: "Jeans",
  marcaId: "m-jirish",
  marca: "Jirish",
  estado: "activo",
  descripcion: null,
  tejido: null,
  patron: null,
  temporada: null,
  creadoEn: null,
  fotoUrl: null,
  colores: [],
  tallas: [],
  disponible: { total: 1, porSede: [] },
  cargadaEn: null,
  ...c,
});

beforeEach(() => {
  dobles.base = { items: [], fallo: false, comprobando: false, hayIdentico: false, hayUnaLetra: false, confirmo: false };
  dobles.candidatas = { candidatas: [], cargando: false, fallo: false };
  dobles.pedidos.length = 0;
  dobles.llamadasBase.length = 0;
  dobles.aviso = { reintentos: 0, reinicios: 0 };
});

describe("useParecidasAlta: lo que le pide a la base y a la lectura", () => {
  it("la base comprueba el nombre de ahora, y solo con categoría elegida", () => {
    render({ nombre: "Wide Leg", categoriaId: "c-jeans" });
    // Un nombre es único POR MARCA (ADR-0294): la base se consulta con la marca elegida, igual que el candado de la base.
    expect(dobles.llamadasBase.at(-1)).toEqual({ nombre: "Wide Leg", activo: true, marcaId: "m-jirish" });
    render({ nombre: "Wide Leg", categoriaId: "", categoriaNombre: null });
    expect(dobles.llamadasBase.at(-1)).toEqual({ nombre: "Wide Leg", activo: false, marcaId: "m-jirish" });
  });

  it("sin marca elegida, la base se consulta «sin marca» (cadena vacía), no «todas las marcas»", () => {
    render({ nombre: "Wide Leg", categoriaId: "c-jeans", marcaId: "", marcaNombre: "" });
    expect(dobles.llamadasBase.at(-1)).toEqual({ nombre: "Wide Leg", activo: true, marcaId: "" });
  });

  it("no lee lo que ya existe sin categoría ni sin red", () => {
    expect(render({ categoriaId: "", categoriaNombre: null }).pedido.activo).toBe(false);
    expect(render({ enLinea: false }).pedido.activo).toBe(false);
    const ok = render().pedido;
    expect(ok.activo).toBe(true);
    expect(ok.marcaId).toBe("m-jirish");
    expect(ok.categoriaId).toBe("c-jeans");
  });

  it("sin marca, o con «Importado», lee por categoría (D5): la marca llega nula", () => {
    expect(render({ marcaId: "", marcaNombre: "" }).pedido.marcaId).toBeNull();
    expect(render({ marcaId: "e0837025", marcaNombre: "Importado" }).pedido.marcaId).toBeNull();
    expect(render({ marcaId: "e0837025", marcaNombre: "Importado" }).pedido.categoriaId).toBe("c-jeans");
  });

  it("los ids que marcó la base viajan aparte, porque pueden ser de otra marca", () => {
    dobles.base.items = [
      { id: "a", referencia: "Wide Leg", categoria: "Jeans", nivel: "identico" },
      { id: "b", referencia: "Wide Leg Corto", categoria: "Jeans", nivel: "parecido" },
    ];
    expect([...render({ nombre: "Wide Leg" }).pedido.idsExtra]).toEqual(["a", "b"]);
  });

  it("pasa la lectura inyectada (pruebas y páginas de prueba)", () => {
    const leer = async () => [];
    expect(render({ leer }).pedido.leer).toBe(leer);
  });
});

describe("useParecidasAlta: lo que le entrega al formulario", () => {
  it("es un superconjunto de `useParecidos`: los mismos nombres, más lo nuevo", () => {
    const { salida } = render();
    for (const k of ["items", "fallo", "comprobando", "hayIdentico", "hayUnaLetra", "confirmo", "confirmar", "reintentar", "reiniciar"]) {
      expect(salida).toHaveProperty(k);
    }
    for (const k of ["ficha", "bajoNombre", "pieRevisa", "resumenAvance", "motivoBloqueo", "abrirHoja"]) expect(salida).toHaveProperty(k);
    expect(typeof salida.confirmar).toBe("function");
    expect(typeof salida.reintentar).toBe("function");
    expect(typeof salida.reiniciar).toBe("function");
  });

  it("sin categoría todo está inerte y no frena", () => {
    const { salida } = render({ categoriaId: "", categoriaNombre: null });
    expect(salida.ficha.alerta).toBeNull();
    expect(salida.ficha.hoja).toBeNull();
    expect(salida.hayIdentico).toBe(false);
    expect(salida.hayUnaLetra).toBe(false);
    expect(salida.pieRevisa).toBeNull();
    expect(salida.motivoBloqueo).toBeNull();
  });

  it("sin red no hay alerta ni hoja, pero el candado sigue siendo el de la base", () => {
    dobles.base.items = [{ id: "a", referencia: "Wide Leg", categoria: "Jeans", nivel: "identico" }];
    dobles.base.hayIdentico = true;
    const { salida } = render({ nombre: "Wide Leg", enLinea: false });
    expect(salida.ficha.alerta).toBeNull();
    expect(salida.ficha.hoja).toBeNull();
    expect(salida.hayIdentico).toBe(true);
    expect(salida.bajoNombre.respaldo.map((p) => p.id)).toEqual(["a"]);
  });

  it("con la lectura al día, un idéntico dibuja la alerta roja y el aviso bajo el nombre; el candado sale de la base", () => {
    dobles.base.items = [{ id: "lara", referencia: "Camisa Lara", categoria: "Camisas y Blusas", nivel: "identico" }];
    dobles.base.hayIdentico = true;
    dobles.candidatas.candidatas = [cand({ id: "lara", referencia: "Camisa Lara", categoriaId: "c-camisas", categoria: "Camisas y Blusas" })];
    const { salida } = render({ nombre: "Camisa Lara", categoriaId: "c-camisas", categoriaNombre: "Camisas y Blusas" });
    expect(salida.hayIdentico).toBe(true);
    expect(salida.ficha.alerta?.tipo).toBe("identico");
    expect(salida.ficha.avisoEnLinea).toBe(true);
    expect(salida.bajoNombre.aviso).not.toBeNull();
    expect(salida.bajoNombre.respaldo).toEqual([]);
    expect(salida.motivoBloqueo).toContain("Camisa Lara");
  });

  it("una letra sin responder espera; con la lectura caída vuelve la casilla y `confirmo` es la casilla", () => {
    dobles.base.items = [{ id: "polo44", referencia: "Polo G44", categoria: "Polos", nivel: "una_letra" }];
    dobles.base.hayUnaLetra = true;
    dobles.candidatas.fallo = true;
    const a = render({ nombre: "Polo G45", categoriaId: "c-polos", categoriaNombre: "Polos", marcaId: "m-kriss", marcaNombre: "Krisstell" }).salida;
    expect(a.hayUnaLetra).toBe(true);
    expect(a.confirmo).toBe(false);
    expect(a.bajoNombre.respaldo.map((p) => p.id)).toEqual(["polo44"]);
    dobles.base.confirmo = true;
    const b = render({ nombre: "Polo G45", categoriaId: "c-polos", categoriaNombre: "Polos", marcaId: "m-kriss", marcaNombre: "Krisstell" }).salida;
    expect(b.confirmo).toBe(true);
  });

  it("la hoja nace cerrada y sin respuestas", () => {
    dobles.candidatas.candidatas = [cand({ id: "wide", referencia: "Wide Leg" })];
    const { salida } = render({ nombre: "Wide Leg Corto" });
    expect(salida.ficha.hoja).toBeNull();
    expect(salida.ficha.alerta).not.toBeNull();
  });

  it("`reintentar` y `reiniciar` llegan a la base (el formulario los llama al fallar un alta y al «Crear otro parecido»)", () => {
    const { salida } = render({ nombre: "Wide Leg" });
    // `renderToString` no corre los manejadores de estado, pero sí se puede llamar a lo que solo toca la base y la lectura.
    expect(() => salida.reintentar()).not.toThrow();
    expect(dobles.aviso.reintentos).toBe(1);
  });

  it("ninguna salida lleva precio ni costo", () => {
    dobles.candidatas.candidatas = [cand({ id: "wide", referencia: "Wide Leg" }), cand({ id: "corto", referencia: "Wide Leg Corto Comfo" })];
    const { salida } = render({ nombre: "Wide Leg Corto" });
    const texto = JSON.stringify({ ficha: { ...salida.ficha, hoja: null }, bajoNombre: salida.bajoNombre, pie: salida.pieRevisa, avance: salida.resumenAvance });
    expect(texto).not.toMatch(/"(precio|costo|price|cost)/i);
  });
});
