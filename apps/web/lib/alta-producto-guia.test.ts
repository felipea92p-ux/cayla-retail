import { describe, expect, it } from "vitest";
import { problemasAlta, type EstadoAlta, type PasoAlta } from "./alta-producto";
import { campoAhora, camposDelAlta, estadosDeCampos, faltanDelPaso, faltanHastaElPaso, pasoConfirmado, resumenFaltan, siguienteDelHilo, type ExtraGuia } from "./alta-producto-guia";

// Una prenda completa: nada falta. Cada prueba parte de ella y le quita lo que quiere probar.
const completo: EstadoAlta = {
  categoriaId: "cat",
  referencia: "Blusa Camila",
  comprobandoNombre: false,
  nombreBloqueado: false,
  nombreSinConfirmar: false,
  categoriaSinTallas: false,
  tallasElegidas: 3,
  exigeTejidoPatron: true,
  hayTejidosEnCategoria: true,
  hayPatronesEnCategoria: true,
  tejidoId: "tj",
  patronId: "pt",
  celdasIncluidas: 3,
  precioBase: "89.90",
  costoBase: "32",
  stockTotal: 6,
  stockInvalidas: 0,
  sinStock: false,
  separaPiso: true,
  lugarCarga: "almacen",
};
const extraCompleto: ExtraGuia = { coloresElegidos: 2, descripcionEscrita: false, marcaElegida: true, responsableListo: true };

const guia = (e: Partial<EstadoAlta> = {}, x: Partial<ExtraGuia> = {}) => camposDelAlta({ ...completo, ...e }, { ...extraCompleto, ...x });
const idsPorHacer = (campos: ReturnType<typeof guia>, paso: PasoAlta) => faltanDelPaso(campos, paso).map((c) => c.id);

describe("estadosDeCampos — cuál está hecho, cuál sigue y cuál falta", () => {
  it("sin categoría, lo que sigue es elegirla y nada más tiene «ahora»", () => {
    const campos = guia({ categoriaId: "" });
    const est = estadosDeCampos(campos, 1);
    expect(est.categoria).toBe("ahora");
    // Los demás no llevan «ahora»: solo el paso abierto tiene un lugar donde estar parado.
    expect(Object.values(est).filter((s) => s === "ahora")).toHaveLength(1);
  });

  it("paso 2 recién abierto: la guía se detiene en marca y proveedor antes del nombre; tejido y patrón faltan después", () => {
    const est = estadosDeCampos(guia({ referencia: "", tejidoId: "", patronId: "" }, { marcaElegida: false }), 2);
    expect(est.marca).toBe("ahora");
    expect(est.nombre).toBe("falta");
    expect(est.descripcion).toBe("opcional");
    expect(est.tejido).toBe("falta");
    expect(est.patron).toBe("falta");
  });

  it("al hacer el nombre, «ahora» salta lo opcional (descripción, marca) y pasa al tejido", () => {
    const est = estadosDeCampos(guia({ tejidoId: "", patronId: "" }, { marcaElegida: false }), 2);
    expect(est.nombre).toBe("hecho");
    expect(est.descripcion).toBe("opcional");
    expect(est.marca).toBe("opcional");
    expect(est.tejido).toBe("ahora");
    expect(est.patron).toBe("falta");
  });

  it("la marca y el proveedor son opcionales (ADR-0283): sin ellos no falta nada, y elegidos llevan ✓", () => {
    const sin = guia({}, { marcaElegida: false });
    expect(estadosDeCampos(sin, 2).marca).toBe("opcional");
    expect(sin.some((c) => c.id === "marca" && (c.requerido || c.sugerido))).toBe(false);
    expect(idsPorHacer(sin, 2)).toEqual([]);
    expect(estadosDeCampos(guia({}, { marcaElegida: true }), 2).marca).toBe("hecho");
  });

  it("la marca va ANTES del nombre en pantalla y la guía pasa por ahí antes de saltar al nombre (Felipe, 2026-10-02)", () => {
    const campos = guia({ referencia: "", tejidoId: "", patronId: "" }, { marcaElegida: false });
    const ids = campos.filter((c) => c.paso === 2).map((c) => c.id);
    expect(ids.indexOf("marca")).toBeLessThan(ids.indexOf("nombre"));
    // Paso 2 recién abierto, nada tocado todavía: la pausa en marca y proveedor va ANTES que «Sigue aquí» llegue al nombre.
    expect(campoAhora(campos, 2)).toBe("marca");
    expect(estadosDeCampos(campos, 2).marca).toBe("ahora");
    expect(estadosDeCampos(campos, 2).nombre).toBe("falta");
    // Apenas la persona teclea en el nombre, la pausa termina: la luz no le gana a la persona.
    expect(campoAhora(campos, 2, "nombre")).toBe("nombre");
    expect(estadosDeCampos(campos, 2, "nombre").marca).toBe("opcional");
    // Con la marca ya elegida no hay pausa: la guía va directa al nombre, como antes de esta excepción.
    expect(campoAhora(guia({ referencia: "", tejidoId: "", patronId: "" }, { marcaElegida: true }), 2)).toBe("nombre");
    // Y el orden no cambia lo que falta ni lo que bloquea: la marca nunca está por hacer ni se lista como «falta».
    expect(idsPorHacer(campos, 2)).toEqual(["nombre", "tejido", "patron"]);
  });

  it("mientras se comprueba el nombre (o es un duplicado) el nombre sigue siendo «ahora», no «hecho»", () => {
    expect(estadosDeCampos(guia({ comprobandoNombre: true }), 2).nombre).toBe("ahora");
    expect(estadosDeCampos(guia({ nombreBloqueado: true }), 2).nombre).toBe("ahora");
    expect(estadosDeCampos(guia({ nombreSinConfirmar: true }), 2).nombre).toBe("ahora");
  });

  it("en una familia que no exige tela, tejido y patrón son opcionales y nunca son «ahora»", () => {
    const est = estadosDeCampos(guia({ exigeTejidoPatron: false, tejidoId: "", patronId: "" }), 2);
    expect(est.tejido).toBe("opcional");
    expect(est.patron).toBe("opcional");
    // Con todo lo requerido hecho, en el paso 2 no queda ningún «ahora».
    expect(Object.values(est).filter((s) => s === "ahora")).toHaveLength(0);
  });

  it("una talla marcada de antemano deja las tallas «hechas» y el «ahora» del paso 3 en los colores (sugeridos)", () => {
    const est = estadosDeCampos(guia({}, { coloresElegidos: 0 }), 3);
    expect(est.tallas).toBe("hecho");
    expect(est.colores).toBe("ahora");
  });

  it("con colores elegidos, el paso 3 no tiene «ahora»", () => {
    const est = estadosDeCampos(guia({}, { coloresElegidos: 1 }), 3);
    expect(est.colores).toBe("hecho");
    expect(Object.values(est).filter((s) => s === "ahora")).toHaveLength(0);
  });

  it("paso 4: precio, unidades y responsable van en ese orden", () => {
    const est = estadosDeCampos(guia({ precioBase: "", stockTotal: 0 }, { responsableListo: false }), 4);
    expect(est.precio).toBe("ahora");
    expect(est.stock).toBe("falta");
    expect(est.responsable).toBe("falta");
    const conPrecio = estadosDeCampos(guia({ stockTotal: 0 }, { responsableListo: false }), 4);
    expect(conPrecio.precio).toBe("hecho");
    expect(conPrecio.stock).toBe("ahora");
  });

  it("«todavía no tengo unidades» también cuenta como decidido; una cantidad inválida no", () => {
    expect(estadosDeCampos(guia({ stockTotal: 0, sinStock: true }), 4).stock).toBe("hecho");
    expect(estadosDeCampos(guia({ stockTotal: 5, stockInvalidas: 1 }), 4).stock).toBe("ahora");
  });

  it("un costo negativo deja el precio sin hacer, igual que `problemasAlta`", () => {
    expect(estadosDeCampos(guia({ costoBase: "-3" }), 4).precio).toBe("ahora");
  });
});

describe("la frase de lo que hay que hacer con el nombre es la de `problemasAlta`", () => {
  it.each([
    ["vacío", { referencia: "" }],
    ["repetido", { nombreBloqueado: true }],
    ["casi igual sin confirmar", { nombreSinConfirmar: true }],
    ["comprobando", { comprobandoNombre: true }],
  ] as const)("%s", (_caso, e) => {
    const estado = { ...completo, ...e };
    const nombre = camposDelAlta(estado, extraCompleto).find((c) => c.id === "nombre");
    const problema = problemasAlta(estado).find((p) => p.bloque === "nombre");
    expect(nombre?.pendiente).toBe(problema?.texto);
  });
});

describe("la guía y `problemasAlta` dicen lo mismo de lo que bloquea crear", () => {
  // Cada caso quita una cosa. «Requerido y sin hacer» en la guía ⇔ hay un problema en `problemasAlta`.
  const casos: [string, Partial<EstadoAlta>, Partial<ExtraGuia>][] = [
    ["todo completo", {}, {}],
    ["sin nombre", { referencia: "" }, {}],
    ["nombre repetido", { nombreBloqueado: true }, {}],
    ["nombre casi igual sin confirmar", { nombreSinConfirmar: true }, {}],
    ["comprobando el nombre", { comprobandoNombre: true }, {}],
    ["sin marca ni proveedor (opcionales desde ADR-0283)", {}, { marcaElegida: false }],
    ["sin tejido", { tejidoId: "" }, {}],
    ["sin patrón", { patronId: "" }, {}],
    ["tejidos sin habilitar", { hayTejidosEnCategoria: false, tejidoId: "" }, {}],
    ["sin tallas", { tallasElegidas: 0 }, {}],
    ["categoría sin tallas", { categoriaSinTallas: true, tallasElegidas: 0 }, {}],
    ["sin precio", { precioBase: "" }, {}],
    ["precio cero", { precioBase: "0" }, {}],
    ["costo negativo", { costoBase: "-1" }, {}],
    ["sin decidir stock", { stockTotal: 0 }, {}],
    ["stock inválido", { stockInvalidas: 2 }, {}],
    ["con unidades y sin decir dónde están", { lugarCarga: null }, {}],
    ["sin decir dónde están, en una tienda sin piso y almacén", { lugarCarga: null, separaPiso: false }, {}],
    ["sin decir dónde están y sin unidades", { lugarCarga: null, stockTotal: 0, sinStock: true }, {}],
    ["familia sin tela y sin tejido", { exigeTejidoPatron: false, tejidoId: "", patronId: "" }, {}],
    ["sin categoría", { categoriaId: "" }, {}],
  ];

  it.each(casos)("%s", (_nombre, e, x) => {
    const estado = { ...completo, ...e };
    const campos = camposDelAlta(estado, { ...extraCompleto, ...x });
    const guiaBloquea = campos.some((c) => c.requerido && !c.hecho);
    // `problemasAlta` corta en «sin categoría» y no mira el responsable (lo mira `piePaso`): la guía sí, y aquí está listo.
    expect(guiaBloquea).toBe(problemasAlta(estado).length > 0);
  });

  it("sin responsable, la guía lo pide aunque `problemasAlta` no lo mire", () => {
    const campos = guia({}, { responsableListo: false });
    expect(campos.find((c) => c.id === "responsable")?.hecho).toBe(false);
    expect(problemasAlta(completo)).toEqual([]);
  });
});

describe("faltanDelPaso y resumenFaltan — lo que falta por llenar, en palabras de la persona", () => {
  it("lista lo que falta del paso, en el orden de pantalla, y no lo opcional", () => {
    const campos = guia({ tejidoId: "", patronId: "" }, { marcaElegida: false });
    expect(idsPorHacer(campos, 2)).toEqual(["tejido", "patron"]);
  });

  it("los colores sin elegir se listan (son sugeridos) pero no bloquean", () => {
    const campos = guia({}, { coloresElegidos: 0 });
    expect(idsPorHacer(campos, 3)).toEqual(["colores"]);
    expect(siguienteDelHilo(campos)).toMatchObject({ campo: { id: "colores" }, bloquea: false });
  });

  it("resumenFaltan: singular, plural, vacío, y «por revisar» cuando solo quedan sugerencias", () => {
    const campos = guia({ tejidoId: "", patronId: "" }, { marcaElegida: false });
    expect(resumenFaltan(faltanDelPaso(campos, 2))).toBe("Faltan: tejido y patrón");
    expect(resumenFaltan(faltanDelPaso(guia({ tejidoId: "" }), 2))).toBe("Falta: tejido");
    expect(resumenFaltan(faltanDelPaso(guia(), 2))).toBeNull();
    // Los colores no bloquean: no se dice «falta» de algo que no impide crear.
    expect(resumenFaltan(faltanDelPaso(guia({}, { coloresElegidos: 0 }), 3))).toBe("Por revisar: colores");
  });

  it("faltanHastaElPaso arrastra lo pendiente de pasos anteriores", () => {
    const campos = guia({ referencia: "", precioBase: "" });
    expect(faltanHastaElPaso(campos, 4).map((c) => c.id)).toEqual(["nombre", "precio"]);
    expect(faltanHastaElPaso(campos, 2).map((c) => c.id)).toEqual(["nombre"]);
    expect(faltanHastaElPaso(guia(), 4)).toEqual([]);
  });
});

describe("siguienteDelHilo — lo que sigue en todo el alta", () => {
  it("es el primer campo por hacer, sin importar el paso", () => {
    expect(siguienteDelHilo(guia({ referencia: "", precioBase: "" }))?.campo.id).toBe("nombre");
    expect(siguienteDelHilo(guia({ precioBase: "" }))?.campo.id).toBe("precio");
  });

  it("`bloquea` distingue lo que impide crear de la simple sugerencia", () => {
    // Solo faltan los colores (sugeridos): se señalan, pero crear ya se puede.
    expect(siguienteDelHilo(guia({}, { coloresElegidos: 0 }))?.bloquea).toBe(false);
    // Faltan colores Y el precio: el primero por hacer son los colores, y crear sigue bloqueado por el precio.
    expect(siguienteDelHilo(guia({ precioBase: "" }, { coloresElegidos: 0 }))).toMatchObject({ campo: { id: "colores" }, bloquea: true });
  });

  it("todo hecho: no hay siguiente", () => {
    expect(siguienteDelHilo(guia())).toBeNull();
  });
});

describe("pasoConfirmado — el ✓ es de un paso que la persona visitó", () => {
  const sinProblemas = problemasAlta(completo);
  const vistos = (...pasos: PasoAlta[]) => new Set<PasoAlta>(pasos);

  it("un paso sin problemas pero nunca abierto NO lleva ✓ (el 3 salía «Listo» sin visitarlo)", () => {
    expect(pasoConfirmado({ paso: 3, abierto: 2, vistos: vistos(1, 2), problemas: sinProblemas })).toBe(false);
  });

  it("uno visitado y sin nada pendiente sí lo lleva", () => {
    expect(pasoConfirmado({ paso: 2, abierto: 3, vistos: vistos(1, 2, 3), problemas: sinProblemas })).toBe(true);
  });

  it("uno visitado al que aún le falta algo no lo lleva", () => {
    const problemas = problemasAlta({ ...completo, tejidoId: "" });
    expect(pasoConfirmado({ paso: 2, abierto: 3, vistos: vistos(1, 2, 3), problemas })).toBe(false);
  });

  it("un paso posterior al abierto necesita que los de atrás estén contestados; uno anterior no", () => {
    // Falta el nombre (paso 2). El paso 3 (adelante del 2 abierto) no puede estar «hecho» aunque él solo no tenga problemas.
    const problemas = problemasAlta({ ...completo, referencia: "" });
    expect(pasoConfirmado({ paso: 3, abierto: 2, vistos: vistos(1, 2, 3), problemas })).toBe(false);
    // Con el 4 abierto y el nombre roto, el 3 (anterior, visitado, sin problemas propios) conserva su ✓.
    expect(pasoConfirmado({ paso: 3, abierto: 4, vistos: vistos(1, 2, 3, 4), problemas })).toBe(true);
  });
});

describe("enFoco — «Sigue aquí» espera a que la persona termine de escribir", () => {
  // La prueba de Felipe (2026-09-30): con UNA letra en el nombre, apenas terminaba la comprobación la luz saltaba al tejido.
  const sinTela = { tejidoId: "", patronId: "" };

  it("sin foco, con el nombre ya comprobado la luz salta al tejido (lo de antes)", () => {
    const est = estadosDeCampos(guia(sinTela, { marcaElegida: false }), 2);
    expect(est.nombre).toBe("hecho");
    expect(est.tejido).toBe("ahora");
  });

  it("escribiendo en el nombre, este conserva la luz aunque ya cuente como hecho: sin ✓ y nada más se enciende", () => {
    const est = estadosDeCampos(guia(sinTela, { marcaElegida: false }), 2, "nombre");
    expect(est.nombre).toBe("ahora");
    expect(est.tejido).toBe("falta");
    expect(est.patron).toBe("falta");
    expect(Object.values(est).filter((e) => e === "ahora")).toHaveLength(1);
  });

  it("al salir del nombre (sin foco) la luz pasa al tejido y el nombre lleva ✓", () => {
    const est = estadosDeCampos(guia(sinTela), 2, null);
    expect(est.nombre).toBe("hecho");
    expect(est.tejido).toBe("ahora");
  });

  it("lo mismo en el paso 4: con un dígito el precio ya es «hecho», pero mientras se escribe sigue siendo «ahora»", () => {
    const campos = guia({ precioBase: "8", stockTotal: 0 });
    expect(estadosDeCampos(campos, 4).precio).toBe("hecho");
    expect(estadosDeCampos(campos, 4).stock).toBe("ahora");
    const escribiendo = estadosDeCampos(campos, 4, "precio");
    expect(escribiendo.precio).toBe("ahora");
    expect(escribiendo.stock).toBe("falta");
  });

  it("un campo opcional con foco (la descripción) no le quita la luz a lo que sigue de verdad", () => {
    expect(campoAhora(guia(sinTela), 2, "descripcion")).toBe("tejido");
    expect(estadosDeCampos(guia(sinTela), 2, "descripcion").descripcion).toBe("opcional");
  });

  it("el foco en un campo de OTRO paso no cambia nada: solo el paso abierto tiene un lugar donde estar parado", () => {
    expect(campoAhora(guia(sinTela), 2, "precio")).toBe("tejido");
    expect(estadosDeCampos(guia(sinTela), 2, "precio").precio).toBe("hecho");
  });

  it("el foco no cambia lo que falta, lo que bloquea ni lo que sigue en todo el hilo", () => {
    const campos = guia(sinTela);
    expect(idsPorHacer(campos, 2)).toEqual(["tejido", "patron"]);
    expect(siguienteDelHilo(campos)?.campo.id).toBe("tejido");
  });

  it("escribiendo en un campo por hacer que no es el primero, la luz lo acompaña", () => {
    const campos = guia({ precioBase: "", stockTotal: 0 });
    expect(campoAhora(campos, 4, "stock")).toBe("stock");
    expect(estadosDeCampos(campos, 4, "stock").precio).toBe("falta");
  });
});
