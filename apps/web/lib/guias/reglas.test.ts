import { describe, expect, it } from "vitest";
import { cierresAlVolver, debeOfrecer, fuenteAlVolver, toqueQueAbre, esEntradaDelMenu, esperaPorAncla, guiaDeRuta, motivoParaNoTocar, pasoAplica, posicionTarjeta, recorteDe, rutaCoincide, toqueDelPliegue, totalEstimado } from "./reglas";
import type { Guia, PiezaATocar } from "./tipos";

const pieza = (p: Partial<PiezaATocar>): PiezaATocar => ({ etiqueta: "button", texto: "", tipo: "button", enFormulario: false, href: null, rol: null, rutaActual: "/vender", ...p });

describe("nunca guardar: el piloto no toca lo que escribe", () => {
  it.each(["Confirmar cobro", "COBRAR S/120.00", "Guardar", "Abrir caja", "Cerrar caja", "Registrar la bajada", "Quitar", "Agregar al ticket", "Dejar en espera", "Anular", "Enviar por WhatsApp", "Imprimir", "Anotar que no había", "Reintentar ahora", "Dar acceso", "Archivar"])(
    "«%s» no se toca",
    (texto) => expect(motivoParaNoTocar(pieza({ texto }))).not.toBeNull(),
  );

  it("un submit o un botón sin type dentro de un form no se toca, diga lo que diga", () => {
    expect(motivoParaNoTocar(pieza({ texto: "Siguiente", tipo: "submit" }))).not.toBeNull();
    expect(motivoParaNoTocar(pieza({ texto: "Listo", tipo: null, enFormulario: true }))).not.toBeNull();
    expect(motivoParaNoTocar(pieza({ etiqueta: "input", tipo: "file" }))).not.toBeNull();
  });

  it("un enlace a otra pantalla o fuera del ERP no se toca; uno a la misma pantalla sí", () => {
    expect(motivoParaNoTocar(pieza({ etiqueta: "a", texto: "Historial", href: "/vender/historial" }))).not.toBeNull();
    expect(motivoParaNoTocar(pieza({ etiqueta: "a", texto: "Mapa", href: "https://wa.me/51" }))).not.toBeNull();
    expect(motivoParaNoTocar(pieza({ etiqueta: "a", texto: "Pendientes", href: "/vender?vista=pendientes" }))).toBeNull();
  });

  it("abrir, mirar y elegir sí se puede", () => {
    for (const texto of ["Más", "Apartados", "Ver ticket", "Talla M", "Solo con stock", "Blusas", "Buscar por nombre"]) {
      expect(motivoParaNoTocar(pieza({ texto })), texto).toBeNull();
    }
  });

  it("ante la duda, no toca: «Prenda sin registrar» solo abre una hoja, pero lleva el verbo y la guía la explica sin tocarla", () => {
    expect(motivoParaNoTocar(pieza({ texto: "Prenda sin registrar" }))).not.toBeNull();
  });

  it("una pestaña solo cambia de vista: se toca aunque se llame «Apartar» o «Entregar»; un submit con role=tab, no", () => {
    expect(motivoParaNoTocar(pieza({ texto: "Apartar", rol: "tab" }))).toBeNull();
    expect(motivoParaNoTocar(pieza({ texto: "Entregar", rol: "tab" }))).toBeNull();
    expect(motivoParaNoTocar(pieza({ texto: "Apartar", rol: "tab", tipo: "submit" }))).not.toBeNull();
    expect(motivoParaNoTocar(pieza({ texto: "Emitidos", rol: "tab", etiqueta: "a", href: "/vender/comprobantes/emitidos" }))).not.toBeNull();
  });

  it("un botón que abre una ventana (aria-haspopup) se toca aunque lleve un verbo; un submit con aria-haspopup, no", () => {
    expect(motivoParaNoTocar(pieza({ texto: "Dar acceso", abreVentana: true }))).toBeNull();
    expect(motivoParaNoTocar(pieza({ texto: "Pedir a otra sede", abreVentana: true }))).toBeNull();
    expect(motivoParaNoTocar(pieza({ texto: "Guardar", abreVentana: true, tipo: "submit" }))).not.toBeNull();
  });

  it("un pliegue (aria-expanded) solo muestra u oculta: se toca aunque diga «Ver y cambiar»; un submit o un enlace a otra pantalla con aria-expanded, no", () => {
    expect(motivoParaNoTocar(pieza({ texto: "Ver y cambiar", esPliegue: true }))).toBeNull();
    expect(motivoParaNoTocar(pieza({ texto: "Ver y cambiar" }))).not.toBeNull();
    expect(motivoParaNoTocar(pieza({ texto: "Ver y cambiar", esPliegue: true, tipo: "submit" }))).not.toBeNull();
    expect(motivoParaNoTocar(pieza({ texto: "Listo", esPliegue: true, tipo: null, enFormulario: true }))).not.toBeNull();
    expect(motivoParaNoTocar(pieza({ etiqueta: "a", texto: "Ver y cambiar", esPliegue: true, href: "/produccion" }))).not.toBeNull();
    expect(motivoParaNoTocar(pieza({ texto: "Guardar", esPliegue: false }))).not.toBeNull();
  });

  it("no se confunde con palabras que contienen el verbo (Cobrador ≠ cobrar, Marca ≠ marcar)", () => {
    expect(motivoParaNoTocar(pieza({ texto: "Marca" }))).toBeNull();
    expect(motivoParaNoTocar(pieza({ texto: "Cobranzas" }))).toBeNull();
  });
});

describe("un pliegue se abre o se cierra solo si hace falta (el «?» de la cabecera)", () => {
  it("«abrir» toca un pliegue cerrado y deja quieto uno abierto; «cerrar», al revés", () => {
    expect(toqueDelPliegue("abrir", "false")).toBe("tocar");
    expect(toqueDelPliegue("abrir", "true")).toBe("ya-esta");
    expect(toqueDelPliegue("cerrar", "true")).toBe("tocar");
    expect(toqueDelPliegue("cerrar", "false")).toBe("ya-esta");
  });

  it("es idempotente: correrlo otra vez, o al volver con ←, deja el pliegue igual", () => {
    // Un toque alterna aria-expanded; el estado después de la acción es el que se pidió, empiece como empiece.
    const correr = (para: "abrir" | "cerrar", expandido: "true" | "false") =>
      toqueDelPliegue(para, expandido) === "tocar" ? (expandido === "true" ? "false" : "true") : expandido;
    for (const inicio of ["true", "false"] as const) {
      expect(correr("abrir", inicio)).toBe("true");
      expect(correr("abrir", correr("abrir", inicio))).toBe("true");
      expect(correr("cerrar", inicio)).toBe("false");
      expect(correr("cerrar", correr("cerrar", inicio))).toBe("false");
    }
  });

  it("cerrarlo no hace aparecer nada: ni se espera la pieza ni cuenta como cambio de vista", () => {
    const cierra = { tipo: "clic", ancla: "sellos.ayuda", para: "cerrar" } as const;
    const abre = { tipo: "clic", ancla: "sellos.ayuda", para: "abrir" } as const;
    const paso = (id: string, extra: Partial<Guia["pasos"][number]> = {}) => ({ id, ancla: id, titulo: id, texto: id, opcional: true, ...extra });
    expect(esperaPorAncla(paso("a", { preparar: [cierra] }), null)).toBe(120);
    expect(esperaPorAncla(paso("a"), paso("antes", { preparar: [cierra] }))).toBe(120);
    expect(esperaPorAncla(paso("a", { preparar: [abre] }), null)).toBe(1400);
    // Un opcional que no está a la vista cuenta solo si antes algo cambió de vista: cerrar el globo no lo hace.
    expect(totalEstimado([paso("cerrar", { preparar: [cierra] }), paso("oculto")], new Set(["cerrar"]), 1440)).toBe(1);
    expect(totalEstimado([paso("abrir", { preparar: [abre] }), paso("oculto")], new Set(["abrir"]), 1440)).toBe(2);
  });

  it("al volver con ←, los cierres de los pasos que se saltaron entre medio también corren", () => {
    const cierra = { tipo: "clic", ancla: "rendimiento.historial-abrir", para: "cerrar" } as const;
    const abre = { tipo: "clic", ancla: "rendimiento.historial-abrir", para: "abrir" } as const;
    const escape = { tipo: "escape" } as const;
    const paso = (id: string, extra: Partial<Guia["pasos"][number]> = {}) => ({ id, ancla: id, titulo: id, texto: id, opcional: true, ...extra });
    const pasos = [paso("prendas", { preparar: [escape] }), paso("reparto", { preparar: [cierra] }), paso("historial", { preparar: [abre] }), paso("rankings", { preparar: [cierra] })];
    // De «Cambios de meta» (2) a «Prendas por venta» (0): «¿Cuadran las metas?» (1) se saltó al avanzar, y su cierre corre igual.
    expect(cierresAlVolver(pasos, 2, 0)).toEqual([cierra]);
    // Solo los cierres: ni lo que abre ni el Escape, ni los del paso de destino o del de partida (esos los maneja cada paso).
    expect(cierresAlVolver(pasos, 3, 1)).toEqual([]);
    expect(cierresAlVolver(pasos, 1, 0)).toEqual([]);
    expect(cierresAlVolver([paso("a"), paso("b", { preparar: [cierra], prepararSoloAlAvanzar: true }), paso("c")], 2, 0)).toEqual([]);
  });

  it("al volver, lo que deja a la vista un paso sale del último paso de antes que preparaba algo (el que abrió su hoja)", () => {
    const abreHoja = { tipo: "clic", ancla: "editar.agregar-color" } as const;
    const escape = { tipo: "escape" } as const;
    const paso = (id: string, extra: Partial<Guia["pasos"][number]> = {}) => ({ id, ancla: id, titulo: id, texto: id, opcional: true, ...extra });
    const pasos = [
      paso("agregar", { preparar: [escape] }),
      paso("agregar-color", { preparar: [abreHoja] }),
      paso("unidades"),
      paso("pie"),
      paso("solo-celular", { solo: "celular", preparar: [{ tipo: "clic", ancla: "hoja-del-celular" }] }),
      paso("despues"),
    ];
    // «pie» y «unidades» viven en la hoja que abrió «agregar-color».
    expect(fuenteAlVolver(pasos, 3, 1440)).toBe(1);
    expect(fuenteAlVolver(pasos, 2, 1440)).toBe(1);
    // «agregar-color» vive afuera: lo de antes de él es el Escape de «agregar».
    expect(fuenteAlVolver(pasos, 1, 1440)).toBe(0);
    // Un paso de otro ancho no cuenta; en su ancho, sí.
    expect(fuenteAlVolver(pasos, 5, 1440)).toBe(1);
    expect(fuenteAlVolver(pasos, 5, 375)).toBe(4);
    // Sin nadie antes que prepare, nada; y lo que solo se prepara al avanzar no se repite al volver.
    expect(fuenteAlVolver(pasos, 0, 1440)).toBeNull();
    expect(fuenteAlVolver([paso("casilla", { preparar: [abreHoja], prepararSoloAlAvanzar: true }), paso("seleccion")], 1, 1440)).toBeNull();
  });

  it("el toque que abre de un `preparar` es el primero que no cierra ni es «si está»", () => {
    const pestana = { tipo: "clic", ancla: "fin-gastos.tab-gastos" } as const;
    const fila = { tipo: "clic", ancla: "fin-gastos.fila" } as const;
    expect(toqueQueAbre([pestana, fila])).toEqual(pestana);
    expect(toqueQueAbre([{ tipo: "escape" }, { tipo: "clic", ancla: "x", para: "cerrar" }, { tipo: "clic", ancla: "y", siEsta: true }, fila])).toEqual(fila);
    expect(toqueQueAbre([{ tipo: "clic", ancla: "x", para: "abrir" }])).toEqual({ tipo: "clic", ancla: "x", para: "abrir" });
    expect(toqueQueAbre([{ tipo: "escape" }, { tipo: "vaciar", ancla: "buscador" }])).toBeNull();
  });

  it("un control que no dice si está abierto no se toca a ciegas", () => {
    expect(toqueDelPliegue("abrir", null)).toBe("no-es-pliegue");
    expect(toqueDelPliegue("cerrar", null)).toBe("no-es-pliegue");
    expect(toqueDelPliegue("cerrar", "")).toBe("no-es-pliegue");
    expect(toqueDelPliegue("abrir", "mixed")).toBe("no-es-pliegue");
  });
});

describe("la guía de cada ruta", () => {
  const g = (ruta: string): Guia => ({ id: ruta, ruta, titulo: ruta, resumen: "", pasos: [] });
  const guias = [g("/vender"), g("/vender/apartados"), g("/compras/proveedores/[id]"), g("/compras/proveedores/nuevo"), g("/inventario/traslados/(billetera)/pase")];

  it("exacta, con [id] y con grupos de Next", () => {
    expect(guiaDeRuta("/vender", guias)?.ruta).toBe("/vender");
    expect(guiaDeRuta("/vender/", guias)?.ruta).toBe("/vender");
    expect(guiaDeRuta("/vender/apartados", guias)?.ruta).toBe("/vender/apartados");
    expect(guiaDeRuta("/compras/proveedores/9f2c", guias)?.ruta).toBe("/compras/proveedores/[id]");
    expect(guiaDeRuta("/compras/proveedores/nuevo", guias)?.ruta).toBe("/compras/proveedores/nuevo");
    expect(guiaDeRuta("/inventario/traslados/pase", guias)?.ruta).toBe("/inventario/traslados/(billetera)/pase");
    expect(guiaDeRuta("/vender/historial", guias)).toBeNull();
  });

  it("una ruta hija no hereda la guía de su padre", () => {
    expect(rutaCoincide("/vender", "/vender/apartados")).toBe(false);
  });
});

describe("pasos que dependen del estado", () => {
  const presentes = new Set(["vender.buscador"]);
  it("requiere / excluye / solo", () => {
    expect(pasoAplica({ id: "a", ancla: null, titulo: "", texto: "", requiere: ["vender.buscador"] }, presentes, 1280)).toBe(true);
    expect(pasoAplica({ id: "a", ancla: null, titulo: "", texto: "", requiere: ["vender.ticket"] }, presentes, 1280)).toBe(false);
    expect(pasoAplica({ id: "a", ancla: null, titulo: "", texto: "", excluye: ["vender.buscador"] }, presentes, 1280)).toBe(false);
    expect(pasoAplica({ id: "a", ancla: null, titulo: "", texto: "", solo: "celular" }, presentes, 1280)).toBe(false);
    expect(pasoAplica({ id: "a", ancla: null, titulo: "", texto: "", solo: "celular" }, presentes, 375)).toBe(true);
  });
});

describe("solo se ofrece sola en una entrada del menú", () => {
  const menu = ["/", "/vender", "/compras", "/inventario/traslados"];
  it("la entrada exacta sí; una pantalla interna o una ruta de otro, no", () => {
    expect(esEntradaDelMenu("/compras", menu)).toBe(true);
    expect(esEntradaDelMenu("/compras/", menu)).toBe(true);
    expect(esEntradaDelMenu("/", menu)).toBe(true);
    expect(esEntradaDelMenu("/compras/nueva", menu)).toBe(false);
    expect(esEntradaDelMenu("/compras/factura/9f2c", menu)).toBe(false);
    expect(esEntradaDelMenu("/finanzas/gastos", menu)).toBe(false);
  });
  it("una pantalla interna no se ofrece aunque nunca se haya visto", () => {
    expect(debeOfrecer({ guiaId: "compras.nueva", vistas: new Set(), leidas: true, entradaDelMenu: false })).toBe(false);
  });
});

describe("se ofrece una vez por persona y pantalla", () => {
  it("solo si ya se sabe qué vio y no está entre lo visto", () => {
    expect(debeOfrecer({ guiaId: "vender", vistas: new Set(), leidas: false })).toBe(false);
    expect(debeOfrecer({ guiaId: "vender", vistas: new Set(), leidas: true })).toBe(true);
    expect(debeOfrecer({ guiaId: "vender", vistas: new Set(["vender"]), leidas: true })).toBe(false);
  });
});

describe("geometría del recorte y la tarjeta", () => {
  const ventana = { ancho: 1280, alto: 800 };
  it("el recorte no se sale de la ventana", () => {
    const r = recorteDe({ top: 0, left: 0, width: 2000, height: 100 }, ventana);
    expect(r.left).toBeGreaterThanOrEqual(4);
    expect(r.left + r.width).toBeLessThanOrEqual(1276);
  });
  it("la tarjeta va abajo si cabe, arriba si no, y nunca fuera de la pantalla", () => {
    const t = { ancho: 360, alto: 200 };
    expect(posicionTarjeta({ top: 100, left: 100, width: 200, height: 40 }, ventana, t).lado).toBe("abajo");
    expect(posicionTarjeta({ top: 700, left: 100, width: 200, height: 60 }, ventana, t).lado).toBe("arriba");
    const lleno = posicionTarjeta({ top: 10, left: 10, width: 1260, height: 780 }, ventana, t);
    expect(lleno.top + t.alto).toBeLessThanOrEqual(800);
    const celular = posicionTarjeta({ top: 100, left: 300, width: 60, height: 40 }, { ancho: 375, alto: 812 }, t);
    expect(celular.left).toBeGreaterThanOrEqual(16);
    expect(celular.left + Math.min(t.ancho, 375 - 32)).toBeLessThanOrEqual(375 - 16);
  });
  it("sin pieza, al centro", () => {
    expect(posicionTarjeta(null, ventana, { ancho: 360, alto: 200 }).lado).toBe("centro");
  });
});

describe("el total de pasos", () => {
  const paso = (id: string, extra: Partial<import("./tipos").PasoGuia> = {}) => ({ id, ancla: `x.${id}`, titulo: "", texto: "", ...extra });
  it("cuenta lo que está a la vista y lo que una pestaña o un modal va a abrir; no lo que nunca aparece", () => {
    const pasos = [
      paso("a"),
      paso("camara", { opcional: true }), // no está y nada la abre: no cuenta
      paso("b", { opcional: true, preparar: [{ tipo: "clic", ancla: "x.tab" }] }),
      paso("c", { opcional: true }), // no está ahora, pero la pestaña de «b» cambió la vista
      { id: "fin", ancla: null, titulo: "", texto: "" },
    ];
    expect(totalEstimado(pasos, new Set(["x.a"]), 1280)).toBe(4);
  });
});
