import { describe, expect, it } from "vitest";
import type { Guia } from "../guias/tipos";
import { LARGO_MAXIMO_ORDEN, limpiarOrden, MAXIMO_DE_PASOS, mismaPantalla, ordenDeLaLista, pasoGuarda, revisarTarea, rutaDe, seAbreDesdeOtra } from "./tarea";

const vender: Guia = {
  id: "vender",
  ruta: "/vender",
  titulo: "Punto de Venta",
  resumen: "Vender.",
  pasos: [
    { id: "hola", ancla: null, titulo: "Hola", texto: "Bienvenida." },
    { id: "buscador", ancla: "vender.buscador", titulo: "Buscar", texto: "Escribe el nombre de la prenda.", demostrar: [{ tipo: "escribir", ancla: "vender.buscador", texto: "blusa" }] },
    { id: "colores", ancla: "vender.prenda-colores", titulo: "El color", texto: "Toca el color." },
    { id: "cobrar", ancla: "vender.cobrar", titulo: "Cobrar", texto: "Abre la hoja de cobro." },
    { id: "cobro-confirmar", ancla: "vender.cobro-confirmar", titulo: "Confirmar cobro", texto: "Tú confirmas aquí." },
  ],
};
const candidatas = [{ guia: vender, href: "/vender" }];
const p = (paso_id: string, orden = "Haz esto", rellenar = "", guia_id = "vender") => ({ guia_id, paso_id, orden, rellenar });
const PREGUNTA = "quiero vender un short mom color rojo talla s";

describe("revisarTarea: solo se le cree a la IA lo que existe", () => {
  it("arma los pasos con su ancla, su orden y el porqué de la guía", () => {
    const t = revisarTarea([p("buscador", "Escribe short mom", "short mom"), p("colores", "toca el color Rojo."), p("cobrar", "«Toca Cobrar»")], candidatas, "/", PREGUNTA);
    expect(t.map((x) => [x.ancla, x.orden])).toEqual([
      ["vender.buscador", "Escribe short mom"],
      ["vender.prenda-colores", "Toca el color Rojo"],
      ["vender.cobrar", "Toca Cobrar"],
      // La venta se completa hasta confirmar aunque la IA corte antes (`completarTarea`).
      ["vender.cobro-confirmar", "Revisa y confirma tú el cobro"],
    ]);
    expect(t[0]!.rellenar).toBe("short mom");
    expect(t[1]!.porQue).toBe("Toca el color.");
    expect(t[0]!.href).toBe("/vender");
  });
  it("descarta un paso o una guía inventados, el paso sin ancla y el repetido seguido", () => {
    const t = revisarTarea([p("buscador"), p("buscador"), p("hola"), p("no-existe"), p("cobrar", "x", "", "otra-guia"), p("colores")], candidatas, "/", PREGUNTA);
    expect(t.map((x) => x.pasoId)).toEqual(["buscador", "colores", "cobrar", "cobro-confirmar"]);
  });
  it("el dato del buscador viaja solo si la persona lo dijo tal cual", () => {
    const t = revisarTarea([p("buscador", "Escribe", "pantalón cargo"), p("colores")], candidatas, "/", PREGUNTA);
    expect(t[0]!.rellenar).toBeNull();
  });
  it("con menos de dos pasos no es una tarea", () => {
    expect(revisarTarea([p("cobro-confirmar")], candidatas, "/", PREGUNTA)).toEqual([]);
    expect(revisarTarea(null, candidatas, "/", PREGUNTA)).toEqual([]);
  });
  it("diez pasos como mucho, y una orden vacía usa el título del paso", () => {
    // Una guía sin cierre fijo (la de Vender deja una sola vez cada paso del cobro).
    const otra: Guia = { ...vender, id: "otra" };
    const muchos = Array.from({ length: 30 }, (_, k) => p(k % 2 ? "colores" : "cobrar", "", "", "otra"));
    const t = revisarTarea(muchos, [{ guia: otra, href: "/otra" }], "/", PREGUNTA);
    expect(t).toHaveLength(MAXIMO_DE_PASOS);
    expect(t[0]!.orden).toBe("Cobrar");
  });
});

describe("completarTarea: una venta siempre llega al cobro", () => {
  it("si la IA corta en la prenda, se suman cobrar y confirmar (los pasos del cierre que existen), sin «revisa el ticket»", () => {
    const conTicket: Guia = { ...vender, pasos: [...vender.pasos, { id: "ticket", ancla: "vender.ticket", titulo: "El ticket", texto: "Lo que llevas." }] };
    const t = revisarTarea([p("buscador"), p("colores"), p("ticket", "Revisa el ticket")], [{ guia: conTicket, href: "/vender" }], "/", PREGUNTA);
    expect(t.map((x) => x.pasoId)).toEqual(["buscador", "colores", "cobrar", "cobro-confirmar"]);
    expect(t.at(-1)!.orden).toBe("Revisa y confirma tú el cobro");
  });
  it("una tarea que ya llega a confirmar no cambia", () => {
    const t = revisarTarea([p("cobrar"), p("cobro-confirmar", "Confirma tú")], candidatas, "/", PREGUNTA);
    expect(t.map((x) => x.pasoId)).toEqual(["cobrar", "cobro-confirmar"]);
  });
});

describe("elegir en la lista del buscador (Vender)", () => {
  const conLista: Guia = { ...vender, pasos: [...vender.pasos, { id: "resultados", ancla: "vender.resultados", titulo: "Lo que encontró", texto: "Cada fila es un color y una talla." }, { id: "prenda-tallas", ancla: "vender.prenda-tallas", titulo: "Tallas", texto: "La hoja de tallas." }] };
  it("si la tarea busca, los pasos de la tarjeta se cambian por «elige en la lista» con el color y la talla", () => {
    const t = revisarTarea([p("buscador", "Busca la blusa emma"), p("prenda-tallas", "Toca la talla M en negro"), p("cobrar")], [{ guia: conLista, href: "/vender" }], "/", PREGUNTA);
    expect(t.map((x) => [x.pasoId, x.orden])).toEqual([
      ["buscador", "Busca la blusa emma"],
      ["resultados", "Toca Rojo · talla S en la lista"],
      ["cobrar", "Haz esto"],
      ["cobro-confirmar", "Revisa y confirma tú el cobro"],
    ]);
  });
});

describe("la lupa del celular", () => {
  it("antes de buscar va «toca la lupa» y después de elegir, «Ver ticket» (en escritorio el acompañante los salta)", () => {
    const conLupa: Guia = { ...vender, pasos: [{ id: "buscar-por-nombre", ancla: "vender.buscar-por-nombre", titulo: "Lupa", texto: "La lupa abre el buscador." }, ...vender.pasos, { id: "resultados", ancla: "vender.resultados", titulo: "Lista", texto: "La lista." }, { id: "barra-ticket", ancla: "vender.barra-ticket", titulo: "Ticket", texto: "Abre el ticket." }] };
    const t = revisarTarea([p("buscador", "Busca el short"), p("cobrar")], [{ guia: conLupa, href: "/vender" }], "/", PREGUNTA);
    expect(t.map((x) => x.pasoId)).toEqual(["buscar-por-nombre", "buscador", "resultados", "barra-ticket", "cobrar", "cobro-confirmar"]);
  });
});

describe("el cierre entra en su lugar", () => {
  it("«quién atiende» va antes de Cobrar aunque la IA ya haya puesto Cobrar y confirmar", () => {
    const conResponsable: Guia = { ...vender, pasos: [...vender.pasos, { id: "responsable", ancla: "vender.responsable", titulo: "Quién atiende", texto: "Eliges quién atiende." }] };
    const t = revisarTarea([p("buscador", "Busca el short"), p("cobrar", "Toca Cobrar"), p("cobro-confirmar", "Confirma")], [{ guia: conResponsable, href: "/vender" }], "/", PREGUNTA);
    expect(t.map((x) => x.pasoId)).toEqual(["buscador", "responsable", "cobrar", "cobro-confirmar"]);
  });
  it("un paso del cierre repetido queda una sola vez, en su lugar", () => {
    const conResponsable: Guia = { ...vender, pasos: [...vender.pasos, { id: "responsable", ancla: "vender.responsable", titulo: "Quién atiende", texto: "Eliges quién atiende." }] };
    const t = revisarTarea([p("buscador", "Busca"), p("cobrar", "Toca Cobrar"), p("responsable", "Elige quién"), p("cobrar", "Toca Cobrar"), p("cobro-confirmar", "Confirma")], [{ guia: conResponsable, href: "/vender" }], "/", PREGUNTA);
    expect(t.map((x) => x.pasoId)).toEqual(["buscador", "responsable", "cobrar", "cobro-confirmar"]);
  });
});

describe("cualquier tarea termina guardando", () => {
  const editar: Guia = {
    id: "productos.id.editar",
    ruta: "/productos/[id]/editar",
    titulo: "Editar producto",
    resumen: "La ficha.",
    pasos: [
      { id: "agregar", ancla: "editar.agregar", titulo: "Agregar", texto: "Agregar color." },
      { id: "agregar-color", ancla: "agregar-color.colores", titulo: "Colores", texto: "Elige el color." },
      { id: "agregar-color-pie", ancla: "agregar-color.pie", titulo: "Sumarlos", texto: "Suma a la ficha." },
      { id: "foto", ancla: "editar.foto", titulo: "Foto", texto: "La foto." },
      { id: "guardar", ancla: "editar.guardar", titulo: "Revisar y guardar", texto: "Guarda todo." },
    ],
  };
  const conEditar = [...candidatas, { guia: editar, href: editar.ruta }];
  it("si la IA corta antes de guardar, se agrega el paso que guarda que sigue en esa guía", () => {
    const t = revisarTarea([p("agregar", "Toca Agregar color", "", "productos.id.editar"), p("agregar-color", "Elige Rojo", "", "productos.id.editar")], conEditar, "/", PREGUNTA);
    expect(t.map((x) => [x.pasoId, x.orden])).toEqual([
      ["agregar", "Toca Agregar color"],
      ["agregar-color", "Elige Rojo"],
      ["agregar-color-pie", "Revisa y guarda tú"],
    ]);
  });
  it("si guardó una hoja y la pantalla guarda aparte, se agrega el «Revisar y guardar» de la pantalla", () => {
    const t = revisarTarea([p("agregar-color", "Elige Rojo", "", "productos.id.editar"), p("agregar-color-pie", "Toca Agregar", "", "productos.id.editar")], conEditar, "/", PREGUNTA);
    expect(t.map((x) => x.pasoId)).toEqual(["agregar-color", "agregar-color-pie", "guardar"]);
  });
  it("antes de la ficha van los pasos de la pantalla madre que la abren (el puente)", () => {
    const productos: Guia = { id: "productos", ruta: "/productos", titulo: "Productos", resumen: "El catálogo.", pasos: [
      { id: "buscador", ancla: "productos.buscador", titulo: "Busca", texto: "Escribe." },
      { id: "tarjeta", ancla: "productos.tarjeta", titulo: "Cada prenda", texto: "Tócala." },
      { id: "vr-botones", ancla: "vista-rapida.botones", titulo: "Lo que haces", texto: "Editar." },
    ] };
    // La IA puso «Editar» antes de «Toca la prenda»: el puente los vuelve a poner en orden, con sus órdenes de fábrica.
    const t = revisarTarea([p("vr-botones", "Abre Editar", "", "productos"), p("buscador", "Busca la blusa", "", "productos"), p("tarjeta", "Toca", "", "productos"), p("agregar", "Toca Agregar color", "", "productos.id.editar"), p("guardar", "Guarda [guarda]", "", "productos.id.editar")], [{ guia: productos, href: "/productos" }, { guia: editar, href: editar.ruta }], "/", PREGUNTA);
    expect(t.map((x) => [x.pasoId, x.orden])).toEqual([
      ["buscador", "Busca la prenda"],
      ["tarjeta", "Toca la prenda"],
      ["vr-botones", "Toca Editar"],
      ["agregar", "Toca Agregar color"],
      ["guardar", "Guarda"],
    ]);
  });
  it("si ya termina guardando, no se agrega nada", () => {
    const t = revisarTarea([p("agregar", "Toca Agregar color", "", "productos.id.editar"), p("guardar", "Revisa y guarda tú", "", "productos.id.editar")], conEditar, "/", PREGUNTA);
    expect(t.map((x) => x.pasoId)).toEqual(["agregar", "guardar"]);
  });
  it("reconoce el paso que guarda por el nombre de su pieza", () => {
    for (const a of ["editar.guardar", "agregar-color.pie", "nuevo-traslado.enviar", "vender.cobro-confirmar", "gasto.form-pie", "historial-prenda.corregir-costo-pie"]) expect(pasoGuarda({ ancla: a }), a).toBe(true);
    for (const a of ["vender.ticket-pie", "vender.prenda-pie", "productos.buscador", "editar.agregar", "vista-rapida.botones", "x.paginas"]) expect(pasoGuarda({ ancla: a }), a).toBe(false);
  });
});

describe("pantallas con id", () => {
  it("una dirección de guía con [id] vale para cualquier id, y no tiene a dónde llevar", () => {
    expect(mismaPantalla("/productos/[id]/editar", "/productos/8f2c/editar")).toBe(true);
    expect(mismaPantalla("/productos/[id]/editar", "/productos/editar")).toBe(false);
    expect(mismaPantalla("/vender?x=1", "/vender")).toBe(true);
    expect(seAbreDesdeOtra("/productos/[id]/editar")).toBe(true);
    expect(seAbreDesdeOtra("/productos")).toBe(false);
  });
});

describe("ordenDeLaLista", () => {
  it("toma el color y la talla de la pregunta, con faltas incluidas", () => {
    expect(ordenDeLaLista("kiero bender una blusa emma color negro talla m")).toBe("Toca Negro · talla M en la lista");
    expect(ordenDeLaLista("quiero vender un short mom en rojo talla s")).toBe("Toca Rojo · talla S en la lista");
    expect(ordenDeLaLista("vender una casaca talla 28")).toBe("Toca talla 28 en la lista");
    expect(ordenDeLaLista("quiero vender una blusa emma negro talla m con efectivo")).toBe("Toca Negro · talla M en la lista");
    expect(ordenDeLaLista("me paga en efectivo")).toBeNull();
    expect(ordenDeLaLista("una blusa negra talla m, paga en efectivo")).toBe("Toca Negra · talla M en la lista");
    expect(ordenDeLaLista("cómo vendo")).toBeNull();
  });
});

describe("limpiarOrden y rutaDe", () => {
  it("una línea, sin comillas ni punto final, con mayúscula y a su medida", () => {
    expect(limpiarOrden('  "elige   la talla S."  ')).toBe("Elige la talla S");
    expect(limpiarOrden("ok")).toBeNull();
    expect(limpiarOrden("a".repeat(200))!.length).toBeLessThanOrEqual(LARGO_MAXIMO_ORDEN);
  });
  it("la dirección sin consulta ni grupos", () => {
    expect(rutaDe("/inventario/traslados/(billetera)?x=1")).toBe("/inventario/traslados");
    expect(rutaDe("/")).toBe("/");
  });
});
