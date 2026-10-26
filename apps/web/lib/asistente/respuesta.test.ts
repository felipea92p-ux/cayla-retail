import { describe, expect, it } from "vitest";
import { GUIAS } from "../guias/registro";
import type { Guia } from "../guias/tipos";
import type { Sugerencia } from "./preseleccion";
import { moduloDeLaGuia, textoSinAcceso } from "./sin-acceso";
import { costoEnDolares, INSTRUCCIONES, mensajeDePregunta, revisarRespuesta, type RespuestaDeLaIA } from "./respuesta";

const guia: Guia = {
  id: "vender.comprobantes",
  ruta: "/vender/comprobantes",
  titulo: "Comprobantes",
  resumen: "Las boletas y facturas emitidas.",
  pasos: [
    { id: "hola", ancla: null, titulo: "Bienvenida", texto: "Esta es la pantalla." },
    { id: "lista", ancla: "comprobantes.lista", titulo: "Cada comprobante", texto: "Toca uno para ver su detalle y anularlo." },
  ],
};
const factura: Guia = { id: "compras.id", ruta: "/compras/[id]", titulo: "Una compra", resumen: "Su detalle.", pasos: [{ id: "anular", ancla: "compra.anular", titulo: "Anular", texto: "." }] };
const sugerencias: Sugerencia[] = [
  { guia, href: "/vender/comprobantes", paso: guia.pasos[1] ?? null, puntos: 6 },
  { guia: factura, href: null, paso: null, puntos: 3 },
];
const AQUI = "/compras/9f3a";
const tramo = (guia_id: string, paso_id = "") => ({ guia_id, paso_id });
const ia = (r: Partial<RespuestaDeLaIA>): RespuestaDeLaIA => ({ tipo: "guia", texto: "Te llevo a Comprobantes.", tramos: [tramo(guia.id, "lista")], ...r });
const revisar = (r: RespuestaDeLaIA | null, s: readonly Sugerencia[] = sugerencias) => revisarRespuesta(r, s, AQUI);

describe("revisarRespuesta: solo se le cree a la IA lo que estaba en la lista", () => {
  it("una guía y un paso de la lista pasan tal cual", () => {
    expect(revisar(ia({}))).toEqual({ tipo: "guia", texto: "Te llevo a Comprobantes.", tramos: [{ guiaId: guia.id, pasoId: "lista", href: "/vender/comprobantes" }] });
  });

  it("una guía que no estaba en la lista manda a la búsqueda sin IA", () => {
    expect(revisar(ia({ tramos: [tramo("finanzas.inventada")] }))).toEqual({ tipo: "basico", motivo: "respuesta_invalida" });
    expect(revisar(ia({ tramos: [] }))).toEqual({ tipo: "basico", motivo: "respuesta_invalida" });
  });

  it("un paso inventado (o la bienvenida, que no se puede señalar) se descarta, y la guía sirve igual", () => {
    for (const paso of ["boton-anular", "hola", ""]) {
      expect(revisar(ia({ tramos: [tramo(guia.id, paso)] }))).toMatchObject({ tipo: "guia", tramos: [{ pasoId: null }] });
    }
  });

  it("«no existe» y «fuera de tema» pasan con su texto, sin guía", () => {
    expect(revisar(ia({ tipo: "no_existe", texto: "Eso todavía no se puede hacer.", tramos: [] }), [])).toEqual({ tipo: "no_existe", texto: "Eso todavía no se puede hacer." });
    expect(revisar(ia({ tipo: "fuera_de_tema", texto: "Solo te ayudo con el sistema." }))).toEqual({ tipo: "fuera_de_tema", texto: "Solo te ayudo con el sistema." });
  });

  it("varios tramos en orden; uno inventado se cae con los que vienen después; como mucho tres", () => {
    const dos = revisar(ia({ tramos: [tramo(guia.id, "lista"), tramo(factura.id, "anular")] }));
    expect(dos).toMatchObject({ tramos: [{ guiaId: guia.id }, { guiaId: factura.id, pasoId: "anular" }] });
    const cortado = revisar(ia({ tramos: [tramo(guia.id), tramo("inventada"), tramo(factura.id)] }));
    expect(cortado.tipo === "guia" && cortado.tramos.map((t) => t.guiaId)).toEqual([guia.id]);
    const muchos = revisar(ia({ tramos: [tramo(guia.id), tramo(guia.id), tramo(guia.id), tramo(guia.id)] }));
    expect(muchos.tipo === "guia" && muchos.tramos.length).toBe(3);
  });

  it("la pantalla donde está la persona (sin entrada del menú) se llega por donde está", () => {
    expect(revisar(ia({ tramos: [tramo(factura.id, "anular")] }))).toMatchObject({ tramos: [{ href: AQUI }] });
  });

  it("sin respuesta o con un texto vacío, búsqueda sin IA", () => {
    expect(revisar(null)).toEqual({ tipo: "basico", motivo: "respuesta_invalida" });
    expect(revisar(ia({ texto: "   " }))).toEqual({ tipo: "basico", motivo: "respuesta_invalida" });
  });

  it("un texto largo se corta en una frase, nunca a media palabra", () => {
    const largo = `${"Primero ve a Comprobantes y busca la boleta del cliente. ".repeat(8)}Fin`;
    const r = revisar(ia({ texto: largo }), sugerencias);
    expect(r.tipo === "guia" && r.texto.length <= 320 && r.texto.endsWith(".")).toBe(true);
  });
});

describe("sin acceso: una pantalla que el rol no ve solo se nombra", () => {
  const caja = GUIAS.find((g) => g.ruta === "/caja")!;
  const ajenas: Sugerencia[] = [{ guia: caja, href: "/caja", paso: null, puntos: 4 }];

  it("con una pantalla de fuera del menú, el texto lo pone el sistema (nunca el de la IA) y dice el módulo", () => {
    const r = revisarRespuesta(ia({ tipo: "sin_acceso", texto: "Ve a Caja y aprieta Cerrar caja.", tramos: [tramo(caja.id)] }), sugerencias, AQUI, ajenas);
    expect(r).toMatchObject({ tipo: "sin_acceso", guiaId: caja.id, texto: textoSinAcceso(caja), modulo: moduloDeLaGuia(caja) });
    expect(r.tipo === "sin_acceso" && r.texto).not.toContain("aprieta");
  });

  it("si la IA elige una pantalla ajena como si fuera de la persona, igual es «sin acceso»: nunca se la lleva", () => {
    expect(revisarRespuesta(ia({ tramos: [tramo(caja.id, "barra-cierre")] }), sugerencias, AQUI, ajenas)).toMatchObject({ tipo: "sin_acceso" });
  });

  it("«sin acceso» con una pantalla que no estaba en ninguna lista: búsqueda sin IA", () => {
    expect(revisarRespuesta(ia({ tipo: "sin_acceso", tramos: [tramo("inventada")] }), sugerencias, AQUI, ajenas)).toEqual({ tipo: "basico", motivo: "respuesta_invalida" });
  });

  it("al mensaje van solo los títulos de sus pasos, no lo que explican", () => {
    const m = mensajeDePregunta("cerrar la caja", sugerencias, ajenas);
    const fuera = m.slice(m.indexOf("<fuera_de_tu_menu>"));
    expect(fuera).toContain(`id="${caja.id}"`);
    const conTexto = caja.pasos.find((p) => p.ancla !== null && p.texto.length > 40)!;
    expect(fuera).not.toContain(conTexto.texto);
  });
});

describe("lo que se le manda a la IA", () => {
  it("las instrucciones no cambian entre preguntas (la caché las reusa): sin fechas ni nombres", () => {
    expect(INSTRUCCIONES).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(INSTRUCCIONES).not.toContain("<pregunta>\n");
  });

  it("el mensaje lleva las guías con sus pasos señalables y la pregunta marcada como dato, al final", () => {
    const m = mensajeDePregunta("¿Cómo anulo una boleta?", sugerencias);
    expect(m).toContain('<guia id="vender.comprobantes"');
    expect(m).toContain("paso lista: Cada comprobante");
    expect(m).not.toContain("paso hola");
    expect(m.trimEnd().endsWith("¿Cómo anulo una boleta?\n</pregunta>")).toBe(true);
  });
});

describe("costoEnDolares", () => {
  it("Haiku 5.5: US$0,10 la entrada y US$0,50 la salida por millón", () => {
    expect(costoEnDolares("claude-haiku-5-5", { input_tokens: 1_000_000, output_tokens: 0 })).toBeCloseTo(0.1);
    expect(costoEnDolares("claude-haiku-5-5", { input_tokens: 0, output_tokens: 1_000_000 })).toBeCloseTo(0.5);
  });

  it("lo leído de la caché cuesta la décima parte, lo escrito 1,25 veces", () => {
    expect(costoEnDolares("claude-haiku-5-5", { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 1_000_000 })).toBeCloseTo(0.01);
    expect(costoEnDolares("claude-haiku-5-5", { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 1_000_000 })).toBeCloseTo(0.125);
  });

  it("un modelo sin precio conocido cuenta como el más caro: el tope se pasa antes, nunca después", () => {
    expect(costoEnDolares("otro", { input_tokens: 1_000_000, output_tokens: 0 })).toBeCloseTo(2);
  });
});
