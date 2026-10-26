import { describe, expect, it } from "vitest";
import { debeOfrecer, esEntradaDelMenu, guiaDeRuta, motivoParaNoTocar, pasoAplica, posicionTarjeta, recorteDe, rutaCoincide, totalEstimado } from "./reglas";
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
