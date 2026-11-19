import { describe, expect, it } from "vitest";
import { accionesDelPaso, cierresAlVolver, debeOfrecer, destinoDeNavegacion, fuenteAlVolver, limpiezasEntre, piezasParaRepetir, toqueQueAbre, esEntradaDelMenu, esperaPorAncla, guiaDeRuta, motivoParaNoTocar, pasoAplica, posicionTarjeta, recorteDe, rutaCoincide, toqueDelPliegue, totalEstimado } from "./reglas";
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
    // «agregar-color» vive afuera: lo de antes de él es el Escape de «agregar», que no deja nada abierto.
    expect(fuenteAlVolver(pasos, 1, 1440)).toBeNull();
    // Un paso de otro ancho no cuenta; en su ancho, sí.
    expect(fuenteAlVolver(pasos, 5, 1440)).toBe(1);
    expect(fuenteAlVolver(pasos, 5, 375)).toBe(4);
    // Sin nadie antes que prepare, nada.
    expect(fuenteAlVolver(pasos, 0, 1440)).toBeNull();
  });

  it("un paso que solo cierra o vacía no es la fuente: la cadena sigue hacia atrás hasta el que abrió", () => {
    const paso = (id: string, extra: Partial<Guia["pasos"][number]> = {}) => ({ id, ancla: id, titulo: id, texto: id, opcional: true, ...extra });
    // Productos (de «De vuelta en la ficha» hacia atrás): antes de él, un Escape («Sin guardar») y un vaciar; el que abrió es «Su historial».
    const pasos = [
      paso("tarjeta", { preparar: [{ tipo: "clic", ancla: "productos.tarjeta" }] }),
      paso("historial", { preparar: [{ tipo: "clic", ancla: "vista-rapida.historial" }] }),
      paso("buscar", { preparar: [{ tipo: "vaciar", ancla: "productos.buscador" }] }),
      paso("sin-guardar", { preparar: [{ tipo: "escape" }] }),
      paso("cierra-globo", { preparar: [{ tipo: "clic", ancla: "x.ayuda", para: "cerrar" }] }),
      paso("volver"),
    ];
    expect(fuenteAlVolver(pasos, 5, 1440)).toBe(1);
    expect(fuenteAlVolver(pasos, 1, 1440)).toBe(0);
  });

  it("lo que abrió un `demostrar` también es lo que deja un paso (y se repite al volver)", () => {
    const paso = (id: string, extra: Partial<Guia["pasos"][number]> = {}) => ({ id, ancla: id, titulo: id, texto: id, opcional: true, ...extra });
    const pasos = [
      // Vender: «Escanea o busca la prenda» escribe el ejemplo; «Lo que encontró» lo muestra.
      paso("buscador", { demostrar: [{ tipo: "escribir", ancla: "vender.buscador", texto: { palabraDe: "vender.nombre" } }] }),
      paso("resultados"),
      paso("camara", { preparar: [{ tipo: "vaciar", ancla: "vender.buscador" }] }),
      // Configuración: «Una tasa nueva» abre la hoja en su `demostrar`; «Desde cuándo y cuánto» vive adentro.
      paso("nueva-tasa", { demostrar: [{ tipo: "clic", ancla: "config.nueva-tasa" }] }),
      paso("campos"),
      paso("y-si", { demostrar: [{ tipo: "clic", ancla: "fin-plata.y-si", para: "abrir" }] }),
      paso("cierra-y-si", { preparar: [{ tipo: "clic", ancla: "fin-plata.y-si", para: "cerrar" }] }),
      paso("despues"),
    ];
    expect(fuenteAlVolver(pasos, 1, 1440)).toBe(0);
    expect(fuenteAlVolver(pasos, 4, 1440)).toBe(3);
    expect(fuenteAlVolver(pasos, 6, 1440)).toBe(5);
    // Lo que un paso de después deshizo no se repite: el ejemplo se vació, el pliegue se cerró. Queda lo de «Una tasa nueva».
    expect(fuenteAlVolver(pasos, 7, 1440)).toBe(3);
    expect(fuenteAlVolver(pasos.slice(0, 4), 3, 1440)).toBeNull();
  });

  it("con lo que se vio al avanzar, lo que un Escape ya cerró no se reabre (aunque haya dos Escape y una sola hoja)", () => {
    const paso = (id: string, extra: Partial<Guia["pasos"][number]> = {}) => ({ id, ancla: id, titulo: id, texto: id, opcional: true, ...extra });
    // Devoluciones: la pestaña «Compras», la hoja de la venta, dos pasos con Escape (el segundo no cierra nada) y «Anular».
    const pasos = [
      paso("compras", { preparar: [{ tipo: "clic", ancla: "devoluciones.pestana-compras" }] }),
      paso("ver-venta"),
      paso("detalle", { preparar: [{ tipo: "clic", ancla: "devoluciones.ver-venta" }] }),
      paso("cambiar", { preparar: [{ tipo: "escape" }] }),
      paso("devolver", { preparar: [{ tipo: "escape" }] }),
      paso("anular"),
    ];
    // Las hojas abiertas al empezar cada paso: la de la venta, solo en «¿Mejor un cambio?» (antes de su Escape).
    const hojas = [0, 0, 0, 1, 0, 0];
    // Sin memoria, la regla supone que la hoja sigue abierta y la reabriría sobre «Anular».
    expect(fuenteAlVolver(pasos, 5, 1440)).toBe(2);
    expect(fuenteAlVolver(pasos, 5, 1440, { hojas })).toBe(0);
    // Dentro de la hoja, en cambio, la fuente es la que la abrió.
    expect(fuenteAlVolver(pasos, 3, 1440, { hojas })).toBe(2);
    // Contar escapes en el texto se habría equivocado: dos Escape «cierran» la hoja y la pestaña, y no quedaría nada.
    const pestanaEnHoja = [
      paso("abre", { preparar: [{ tipo: "clic", ancla: "hoja.abrir" }] }),
      paso("pestana", { preparar: [{ tipo: "clic", ancla: "hoja.pestana-b" }] }),
      paso("cierra", { preparar: [{ tipo: "escape" }] }),
      paso("afuera"),
    ];
    // Una pestaña dentro de la hoja se fue con la hoja: ni ella ni la hoja son la fuente de lo de afuera.
    expect(fuenteAlVolver(pestanaEnHoja, 3, 1440, { hojas: [0, 1, 1, 0] })).toBeNull();
  });

  it("un paso cuyo toque no se pudo hacer al avanzar no es la fuente", () => {
    const paso = (id: string, extra: Partial<Guia["pasos"][number]> = {}) => ({ id, ancla: id, titulo: id, texto: id, opcional: true, ...extra });
    // Productos: «El costo correcto y por qué» toca el «⋯» de la última compra, que sin costos cargados no aparece.
    const pasos = [
      paso("historial", { preparar: [{ tipo: "clic", ancla: "vista-rapida.historial" }] }),
      paso("corregir", { preparar: [{ tipo: "clic", ancla: "historial-prenda.costo-corregir" }] }),
      paso("volver"),
    ];
    expect(fuenteAlVolver(pasos, 2, 1440)).toBe(1);
    expect(fuenteAlVolver(pasos, 2, 1440, { hizo: [true, true] })).toBe(1);
    expect(fuenteAlVolver(pasos, 2, 1440, { hizo: [true, false] })).toBe(0);
  });

  it("lo que tiene que estar para repetir un paso son las piezas de todo lo que deja algo, del `preparar` y del `demostrar`", () => {
    const paso = (extra: Partial<Guia["pasos"][number]>) => ({ id: "p", ancla: "p", titulo: "p", texto: "p", ...extra });
    expect(piezasParaRepetir(paso({ preparar: [{ tipo: "escape" }, { tipo: "clic", ancla: "config.tab-impuestos" }] }))).toEqual(["config.tab-impuestos"]);
    // Un toque «si está» también abre (la píldora «Costo»), y un ejemplo necesita su buscador.
    expect(piezasParaRepetir(paso({ preparar: [{ tipo: "clic", ancla: "historial-prenda.costo", siEsta: true }] }))).toEqual(["historial-prenda.costo"]);
    expect(piezasParaRepetir(paso({ preparar: [{ tipo: "vaciar", ancla: "b" }], demostrar: [{ tipo: "escribir", ancla: "vender.buscador", texto: "Blusa" }] }))).toEqual(["vender.buscador"]);
    // Inicio: el período está siempre; la pestaña «Productos», solo con una tienda de cerca. Si falta, se reabre lo de antes.
    expect(piezasParaRepetir(paso({ demostrar: [{ tipo: "clic", ancla: "inicio.obs-periodo-30" }, { tipo: "clic", ancla: "inicio.obs-tab-productos" }] }))).toEqual(["inicio.obs-periodo-30", "inicio.obs-tab-productos"]);
    expect(piezasParaRepetir(paso({ preparar: [{ tipo: "escape" }, { tipo: "clic", ancla: "x", para: "cerrar" }] }))).toEqual([]);
    expect(accionesDelPaso(paso({ preparar: [{ tipo: "escape" }], demostrar: [{ tipo: "clic", ancla: "d" }] }))).toEqual([{ tipo: "escape" }, { tipo: "clic", ancla: "d" }]);
  });

  it("al rehacer desde la fuente, también se deshace lo que quitaron los pasos de entre medio (vaciar, cerrar)", () => {
    const paso = (id: string, extra: Partial<Guia["pasos"][number]> = {}) => ({ id, ancla: id, titulo: id, texto: id, opcional: true, ...extra });
    const vaciar = { tipo: "vaciar", ancla: "colaboradores.buscador" } as const;
    const cierra = { tipo: "clic", ancla: "x.ayuda", para: "cerrar" } as const;
    // Colaboradores: «Buscar a alguien» escribe; «El equipo, por sede» vacía; «La ficha de una persona» abre una fila de la lista entera.
    const pasos = [
      paso("buscador", { preparar: [{ tipo: "clic", ancla: "colaboradores.atajo-todas" }], demostrar: [{ tipo: "escribir", ancla: "colaboradores.buscador", texto: "Ana" }] }),
      paso("lista", { preparar: [vaciar] }),
      paso("celular", { solo: "celular", preparar: [cierra] }),
      paso("escape", { preparar: [{ tipo: "escape" }, { tipo: "clic", ancla: "otra" }] }),
      paso("ficha", { preparar: [{ tipo: "clic", ancla: "colaboradores.fila-otra" }] }),
    ];
    expect(limpiezasEntre(pasos, 0, 4, 1440)).toEqual([vaciar]);
    expect(limpiezasEntre(pasos, 0, 4, 375)).toEqual([vaciar, cierra]);
    // Ni los de la fuente ni los del destino: esos los corre cada uno.
    expect(limpiezasEntre(pasos, 1, 4, 1440)).toEqual([]);
  });

  it("una pestaña con `href` navega a su URL; el piloto espera esa URL antes del toque siguiente", () => {
    const aqui = { origin: "http://localhost:3010", pathname: "/productos/atributos", search: "?tab=patrones" };
    expect(destinoDeNavegacion("/productos/atributos?tab=tejidos", aqui)).toBe("/productos/atributos?tab=tejidos");
    expect(destinoDeNavegacion("?tab=tejidos", aqui)).toBe("/productos/atributos?tab=tejidos");
    // La pestaña ya elegida, un ancla de la misma página, otro sitio o un botón sin `href`: no navega.
    expect(destinoDeNavegacion("/productos/atributos?tab=patrones", aqui)).toBeNull();
    expect(destinoDeNavegacion("#tallas", aqui)).toBeNull();
    expect(destinoDeNavegacion("https://wa.me/51999", aqui)).toBeNull();
    expect(destinoDeNavegacion(null, aqui)).toBeNull();
  });

  it("el toque que abre de un `preparar` es el primero que no cierra ni es «si está»", () => {
    const pestana = { tipo: "clic", ancla: "fin-gastos.tab-gastos" } as const;
    const fila = { tipo: "clic", ancla: "fin-gastos.fila" } as const;
    expect(toqueQueAbre([pestana, fila])).toEqual(pestana);
    expect(toqueQueAbre([{ tipo: "escape" }, { tipo: "clic", ancla: "x", para: "cerrar" }, { tipo: "clic", ancla: "y", siEsta: true }, fila])).toEqual(fila);
    expect(toqueQueAbre([{ tipo: "clic", ancla: "x", para: "abrir" }])).toEqual({ tipo: "clic", ancla: "x", para: "abrir" });
    expect(toqueQueAbre([{ tipo: "escape" }, { tipo: "vaciar", ancla: "buscador" }])).toBeNull();
  });

  it("una casilla se marca o se desmarca solo si hace falta, igual que un pliegue", () => {
    expect(toqueDelPliegue("marcar", "false")).toBe("tocar");
    expect(toqueDelPliegue("marcar", "true")).toBe("ya-esta");
    expect(toqueDelPliegue("desmarcar", "true")).toBe("tocar");
    expect(toqueDelPliegue("desmarcar", "false")).toBe("ya-esta");
    expect(toqueDelPliegue("marcar", null)).toBe("no-es-pliegue");
    // Desmarcar solo esconde, como cerrar: no es lo que abre un paso.
    expect(toqueQueAbre([{ tipo: "clic", ancla: "vitrina.casilla", para: "desmarcar" }])).toBeNull();
    expect(toqueQueAbre([{ tipo: "clic", ancla: "vitrina.casilla", para: "marcar" }])).toEqual({ tipo: "clic", ancla: "vitrina.casilla", para: "marcar" });
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
