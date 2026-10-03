import { describe, expect, it } from "vitest";
import {
  faltaDeUrl,
  temporadaDeUrl,
  disponibilidadDeUrl,
  rotuloDisponibilidad,
  alternarColor,
  estadoDeColor,
  marcadosDeColor,
  opcionesDeColor,
  separarColor,
  listaDeUrl,
  listaParaUrl,
  chipsDeFiltros,
  contarFiltrosActivos,
  estadoDeUrl,
  estadoParaBase,
  cambiosTipeados,
  consultaConCambios,
  consultaSinFiltros,
  hrefDeConsulta,
  sinCajas,
  tipeadoPendiente,
  valorDeCaja,
} from "./productos-filtros";

describe("productos-filtros — la URL es la única verdad de la barra", () => {
  it("aplicar un cambio conserva lo demás, borra lo vacío y vuelve a la página 1", () => {
    expect(consultaConCambios("cat=a&pagina=7&vista=tabla", { color: "NEG" })).toBe("cat=a&vista=tabla&color=NEG");
    expect(consultaConCambios("cat=a&color=NEG", { color: "" })).toBe("cat=a");
    expect(consultaConCambios("", {})).toBe("");
    expect(hrefDeConsulta("/productos", "")).toBe("/productos");
    expect(hrefDeConsulta("/productos", "cat=a")).toBe("/productos?cat=a");
  });

  it("«Limpiar todo» quita filtros, búsqueda, precio y orden, pero deja a la persona en la Tabla", () => {
    expect(consultaSinFiltros("q=blusa&cat=a&precioMax=80&orden=precio_asc&vista=tabla&pagina=3")).toBe("vista=tabla");
    expect(consultaSinFiltros("q=blusa&cat=a")).toBe("");
  });

});

describe("productos-filtros — cajas que se escriben", () => {
  it("una caja que no se está escribiendo muestra la URL, no lo que se escribió antes (el chip «Hasta S/100» fantasma)", () => {
    // Escenario real: se filtró hasta S/100, después «A quién pedirle» navegó a ?stock=reponer sin precio.
    expect(valorDeCaja({}, "precioMax", "stock=reponer")).toBe("");
    expect(valorDeCaja({}, "precioMax", "precioMax=100")).toBe("100");
    // Mientras se escribe, manda lo escrito (no se le borra una letra a mitad de palabra).
    expect(valorDeCaja({ q: "blu" }, "q", "q=bl")).toBe("blu");
  });

  it("lo escrito se compara contra la URL vigente: solo se manda lo que de verdad cambió", () => {
    expect(cambiosTipeados("orden=precio_asc", { q: "blusa" })).toEqual({ q: "blusa" });
    expect(cambiosTipeados("q=blusa", { q: " blusa " })).toEqual({});
    expect(cambiosTipeados("q=blusa", { q: "" })).toEqual({ q: "" });
    // Nunca reaparece una caja que no se tocó (antes el precio viejo volvía con la primera letra del buscador).
    expect(cambiosTipeados("stock=reponer", { q: "b" })).toEqual({ q: "b" });
  });

  it("el precio se manda normalizado y a medio escribir se espera, sin borrar el filtro", () => {
    expect(cambiosTipeados("", { precioMax: "39,90" })).toEqual({ precioMax: "39.9" });
    expect(cambiosTipeados("precioMax=60", { precioMax: "39," })).toEqual({}); // a medio escribir: no se toca la URL
    expect(cambiosTipeados("precioMax=60", { precioMax: "" })).toEqual({ precioMax: "" });
    expect(tipeadoPendiente("precioMax=39.9", { precioMax: "39,90" })).toEqual({});
    expect(tipeadoPendiente("precioMax=60", { precioMax: "39," })).toEqual({ precioMax: "39," });
  });

  it("la caja con el cursor no se suelta: el espacio antes de la palabra siguiente no se borra («blusaroja»)", () => {
    expect(tipeadoPendiente("q=blusa", { q: "blusa " }, "q")).toEqual({ q: "blusa " });
    expect(tipeadoPendiente("precioMax=39.9", { precioMax: "39,9" }, "precioMax")).toEqual({ precioMax: "39,9" });
    // Al salir de la caja (sin foco), lo mismo recortado ya está en la URL: se suelta.
    expect(tipeadoPendiente("q=blusa", { q: "blusa " }, null)).toEqual({});
  });

  it("la caja deja de «escribirse» cuando la URL ya dice lo mismo", () => {
    const t = { q: "blusa", precioMax: "80" };
    expect(tipeadoPendiente("q=blusa", t)).toEqual({ precioMax: "80" });
    expect(tipeadoPendiente("q=blusa&precioMax=80", t)).toEqual({});
    expect(tipeadoPendiente("", t)).toBe(t); // nada llegó todavía: el mismo objeto, sin repintar
  });

  it("quitar el chip o «Limpiar todo» también suelta lo que se estaba escribiendo", () => {
    expect(sinCajas({ q: "blu", precioMin: "20" }, ["precioMin", "precioMax"])).toEqual({ q: "blu" });
    const t = { q: "blu" };
    expect(sinCajas(t, ["precioMin"])).toBe(t);
  });
});

describe("productos-filtros — estado, conteo y chips", () => {
  it("al entrar se ven las activas; «Todos» se escribe en la URL y a la base no le llega estado", () => {
    expect(estadoDeUrl(undefined)).toBe("activo");
    expect(estadoDeUrl("raro")).toBe("activo");
    expect(estadoParaBase(estadoDeUrl("todos"))).toBeUndefined();
    expect(estadoParaBase(estadoDeUrl("descontinuado"))).toBe("descontinuado");
    expect(estadoParaBase(estadoDeUrl(null))).toBe("activo");
  });

  it("«Filtros · N» cuenta lo que quita prendas: ni el orden, ni la búsqueda, ni la vista, ni el estado de fábrica", () => {
    expect(contarFiltrosActivos("orden=precio_asc&q=blusa&vista=tabla&pagina=2")).toBe(0);
    expect(contarFiltrosActivos("estado=activo")).toBe(0);
    expect(contarFiltrosActivos("estado=todos")).toBe(1);
    expect(contarFiltrosActivos("cat=a&color=NEG&precioMin=10&precioMax=80")).toBe(3); // el precio cuenta una vez
    expect(contarFiltrosActivos("precioMax=39,90")).toBe(1); // cliente y servidor leen la coma igual: se aplica y se cuenta
    expect(contarFiltrosActivos("precioMax=abc")).toBe(0); // nadie lo aplica: no se cuenta
  });

  it("cada chip dice «Nombre: valor»; el orden no es un chip", () => {
    const nombres = { categoria: () => "Blusas", marca: () => "Adidas", proveedor: () => "Adidas", color: () => "Negro" };
    const chips = chipsDeFiltros("q=top&cat=a&marca=m&proveedor=sin&color=NEG&estado=todos&stock=reponer&precioMax=80&orden=precio_asc", nombres);
    expect(chips.map((c) => c.texto)).toEqual([
      "«top»",
      "Categoría: Blusas",
      "Marca: Adidas",
      "Proveedor: sin proveedor",
      "Color: Negro",
      "Estado: Todos",
      "Disponibilidad: Pedir a proveedor",
      "Precio: Hasta S/ 80",
    ]);
    expect(chips.find((c) => c.texto.startsWith("Precio"))?.quitar).toEqual(["precioMin", "precioMax"]);
  });

  it("un id que ya no existe se lee «—», no rompe", () => {
    const vacio = { categoria: () => undefined, marca: () => undefined, proveedor: () => undefined, color: () => undefined };
    expect(chipsDeFiltros("cat=zzz", vacio)[0].texto).toBe("Categoría: —");
  });
});

describe("productos-filtros — varias opciones", () => {
  it("la lista de la URL, sin vacíos ni repetidos; vacía borra la clave", () => {
    expect(listaDeUrl("M,L,,M")).toEqual(["M", "L"]);
    expect(listaDeUrl(null)).toEqual([]);
    expect(listaDeUrl("NEG")).toEqual(["NEG"]); // un enlace viejo con un solo color sigue sirviendo
    expect(listaParaUrl(["M", "L", "M"])).toBe("M,L");
    expect(listaParaUrl([])).toBe("");
  });

  it("color y familia son UN filtro: cuentan una vez; la talla, otra", () => {
    expect(contarFiltrosActivos("color=NEG,ROS&familia=azul")).toBe(1);
    expect(contarFiltrosActivos("talla=a,b&familia=azul")).toBe(2);
  });

  it("los chips dicen todas las tallas y colores, con la familia por su nombre", () => {
    const nombres = { categoria: () => undefined, marca: () => undefined, proveedor: () => undefined, color: (c: string) => ({ NEG: "Negro" })[c], talla: (t: string) => ({ a: "M", b: "L" })[t], familia: () => "Azul" };
    expect(chipsDeFiltros("talla=a,b&color=NEG&familia=azul", nombres).map((c) => c.texto)).toEqual(["Talla: M, L", "Color: Familia Azul, Negro"]);
    expect(chipsDeFiltros("color=NEG&familia=azul", nombres)[0].quitar).toEqual(["color", "familia"]);
  });
});

describe("productos-filtros — color agrupado por familia", () => {
  // Llegan MEZCLADOS y por nombre (como los pide `productos/page.tsx`): la lista tiene que reordenarlos sola. Fixture autocontenido: prueba
  // el orden por claridad dentro de una familia, no el catálogo (en producción Beige y Arena son tierra desde el ADR-0317).
  const colores = [
    { id: "ARN", nombre: "Arena", hex: "#CCA67F", familia: "neutro" },
    { id: "BEI", nombre: "Beige", hex: "#D5BA98", familia: "neutro" },
    { id: "BLA", nombre: "Blanco", hex: "#F4F9FF", familia: "neutro" },
    { id: "CRU", nombre: "Crudo", hex: "#F3ECE0", familia: "neutro" },
    { id: "NEG", nombre: "Negro", hex: "#2D2C2F", familia: "neutro" },
    { id: "AZM", nombre: "Azul marino", hex: "#2A304E", familia: "azul" },
    { id: "CEL", nombre: "Celeste", hex: "#A9CADA", familia: "azul" },
    { id: "RARO", nombre: "Raro", hex: "#123456", familia: null },
  ];
  const familias = [
    { valor: "neutro", texto: "Neutro" },
    { valor: "azul", texto: "Azul" },
    { valor: "verde", texto: "Verde" },
  ];

  it("cada familia con colores abre su grupo con «Toda la familia …»; sin colores, no aparece", () => {
    expect(opcionesDeColor(colores, familias).map((o) => o.texto)).toEqual([
      "Toda la familia Neutro",
      "Blanco",
      "Crudo",
      "Beige",
      "Arena",
      "Negro",
      "Toda la familia Azul",
      "Celeste",
      "Azul marino",
      "Raro",
    ]);
  });

  it("los colores de cada familia van en la escala de la carta (de claro a oscuro), NO en orden alfabético", () => {
    const neutros = opcionesDeColor(colores, familias).filter((o) => !o.familia && o.de === "familia:neutro").map((o) => o.texto);
    expect(neutros).toEqual(["Blanco", "Crudo", "Beige", "Arena", "Negro"]);
    expect(neutros).not.toEqual([...neutros].sort((a, b) => a.localeCompare(b, "es")));
    // llegue la lista como llegue
    const alReves = opcionesDeColor([...colores].reverse(), familias).map((o) => o.texto);
    expect(alReves).toEqual(opcionesDeColor(colores, familias).map((o) => o.texto));
  });

  it("cada tono sabe de qué familia es y cada familia sabe qué tonos abarca", () => {
    const ops = opcionesDeColor(colores, familias);
    const neutro = ops.find((o) => o.valor === "familia:neutro")!;
    expect(neutro.familia && neutro.hijos).toEqual(["BLA", "CRU", "BEI", "ARN", "NEG"]);
    expect(ops.find((o) => o.valor === "CEL")).toMatchObject({ familia: false, de: "familia:azul" });
    expect(ops.find((o) => o.valor === "RARO")).toMatchObject({ familia: false, de: null });
  });

  it("una familia que la web aún no conoce sale con su propio nombre, no escondida ni como «sin familia»", () => {
    const ops = opcionesDeColor([...colores, { id: "TUR", nombre: "Turquesa", hex: "#33BECC", familia: "turquesa" }], familias);
    const i = ops.findIndex((o) => o.texto === "Toda la familia Turquesa");
    expect(i).toBeGreaterThan(-1);
    expect(ops[i + 1]).toMatchObject({ valor: "TUR", de: "familia:turquesa" });
    // y los colores sin familia siguen al final
    expect(ops[ops.length - 1].texto).toBe("Raro");
  });

  it("INVARIANTE: todo color de la entrada sale exactamente una vez", () => {
    const ids = opcionesDeColor(colores, familias).flatMap((o) => (o.familia ? [] : [o.valor]));
    expect(ids.sort()).toEqual(colores.map((c) => c.id).sort());
  });

  it("lo marcado va a la URL separado y vuelve igual (ida y vuelta)", () => {
    const marcado = ["familia:azul", "NEG"];
    const url = separarColor(marcado);
    expect(url).toEqual({ color: "NEG", familia: "azul" });
    expect(marcadosDeColor(`color=${url.color}&familia=${url.familia}`)).toEqual(marcado);
    expect(separarColor([])).toEqual({ color: "", familia: "" });
  });

  describe("las casillas dicen lo mismo que la base (marcar la familia incluye todos sus tonos)", () => {
    const ops = opcionesDeColor(colores, familias);
    const NEUTRO = "familia:neutro";
    const TONOS_NEUTRO = ["BLA", "CRU", "BEI", "ARN", "NEG"];

    it("sin nada marcado, todo está libre", () => {
      for (const e of estadoDeColor([], ops).values()) expect(e).toBe("libre");
    });

    it("marcada la familia, sus tonos se ven cubiertos y los de otra familia no", () => {
      const e = estadoDeColor([NEUTRO], ops);
      expect(e.get(NEUTRO)).toBe("marcada");
      for (const t of TONOS_NEUTRO) expect(e.get(t), t).toBe("cubierta");
      expect(e.get("CEL")).toBe("libre");
      expect(e.get("familia:azul")).toBe("libre");
    });

    it("con algunos tonos marcados, la familia queda parcial; con uno solo de otra, la suya no", () => {
      const e = estadoDeColor(["BEI", "CEL"], ops);
      expect(e.get(NEUTRO)).toBe("parcial");
      expect(e.get("BEI")).toBe("marcada");
      expect(e.get("familia:azul")).toBe("parcial");
      expect(e.get("ARN")).toBe("libre");
    });

    it("tocar la familia la marca entera y suelta los tonos sueltos (ya no hacen falta)", () => {
      expect(alternarColor(["BEI", "CEL"], NEUTRO, ops)).toEqual(["CEL", NEUTRO]);
      expect(alternarColor([], NEUTRO, ops)).toEqual([NEUTRO]);
    });

    it("tocar una familia ya marcada la desmarca", () => {
      expect(alternarColor([NEUTRO, "CEL"], NEUTRO, ops)).toEqual(["CEL"]);
    });

    it("tocar un tono de una familia marcada abre la familia en sus otros tonos (saca solo ese)", () => {
      const r = alternarColor([NEUTRO], "BEI", ops);
      expect(r).not.toContain(NEUTRO);
      expect(r.sort()).toEqual(["ARN", "BLA", "CRU", "NEG"]);
    });

    it("tocar un tono suelto lo marca y lo desmarca", () => {
      expect(alternarColor([], "BEI", ops)).toEqual(["BEI"]);
      expect(alternarColor(["BEI", "CEL"], "BEI", ops)).toEqual(["CEL"]);
    });

    it("al marcar el ÚLTIMO tono que faltaba, los tonos pasan a ser «toda la familia»", () => {
      const casiTodos = ["BLA", "CRU", "BEI", "ARN"];
      const r = alternarColor(casiTodos, "NEG", ops);
      expect(r).toEqual([NEUTRO]);
      expect(estadoDeColor(r, ops).get("NEG")).toBe("cubierta");
    });

    it("un color sin familia se alterna sin más, y un valor desconocido también", () => {
      expect(alternarColor([], "RARO", ops)).toEqual(["RARO"]);
      expect(alternarColor(["RARO"], "RARO", ops)).toEqual([]);
      expect(alternarColor([], "XXX", ops)).toEqual(["XXX"]);
    });

    it("INVARIANTE: tocar dos veces un tono (suelto o dentro de una familia marcada) vuelve a lo mismo que se pide a la base", () => {
      // «Lo mismo» = los mismos tonos elegidos de verdad (familia expandida o no): se compara lo que trae el filtro.
      const trae = (m: string[]) => new Set(m.flatMap((v) => (v === NEUTRO ? TONOS_NEUTRO : [v])));
      for (const inicio of [[], ["CEL"], [NEUTRO], ["BEI"], ["BLA", "CRU"]]) {
        for (const t of ["BEI", "NEG", "CEL"]) {
          const dosVeces = alternarColor(alternarColor(inicio, t, ops), t, ops);
          expect([...trae(dosVeces)].sort(), `${inicio} · ${t}`).toEqual([...trae(inicio)].sort());
        }
      }
    });
  });
});

describe("productos-filtros — disponibilidad en la sede y en la red", () => {
  it("«sin_stock» de los enlaces viejos es la de la red; lo desconocido no filtra", () => {
    expect(disponibilidadDeUrl("sin_stock", true)).toBe("sin_red");
    expect(disponibilidadDeUrl("en_sede", true)).toBe("en_sede");
    expect(disponibilidadDeUrl("raro", true)).toBeUndefined();
  });

  it("sin sede (CAYLA Global) no se aplican las de la sede", () => {
    expect(disponibilidadDeUrl("en_sede", false)).toBeUndefined();
    expect(disponibilidadDeUrl("reponer", false)).toBe("reponer");
  });

  it("cada opción dice de qué sede habla, nunca «aquí»", () => {
    expect(rotuloDisponibilidad("en_sede", "Tienda Lima")).toBe("Hay en Tienda Lima");
    expect(rotuloDisponibilidad("sin_sede", "Tienda Lima")).toBe("Sin stock en Tienda Lima");
    expect(rotuloDisponibilidad("sin_red", "Tienda Lima")).toBe("Sin stock en ninguna sede");
  });

  it("el chip lo dice entero", () => {
    const nombres = { categoria: () => undefined, marca: () => undefined, proveedor: () => undefined, color: () => undefined, sede: "Tienda Lima" };
    expect(chipsDeFiltros("stock=en_sede", nombres)[0].texto).toBe("Disponibilidad: Hay en Tienda Lima");
  });
});

describe("productos-filtros — temporada y «por completar»", () => {
  it("lee solo valores con forma; lo raro no filtra", () => {
    expect(temporadaDeUrl("primavera_verano")).toBe("primavera_verano"); // las claves reales de `fn_temporadas` llevan «_»
    expect(temporadaDeUrl("sin")).toBe("sin");
    expect(temporadaDeUrl("'; drop")).toBeUndefined();
    expect(faltaDeUrl("foto")).toBe("foto");
    expect(faltaDeUrl("precio")).toBeUndefined();
  });

  it("los chips dicen el nombre de la temporada y qué falta, y cuentan como filtros", () => {
    const nombres = { categoria: () => undefined, marca: () => undefined, proveedor: () => undefined, color: () => undefined, temporada: () => "Otoño-invierno" };
    expect(chipsDeFiltros("temporada=otono-invierno&falta=foto", nombres).map((c) => c.texto)).toEqual(["Temporada: Otoño-invierno", "Por completar: Sin foto"]);
    expect(chipsDeFiltros("temporada=sin", nombres)[0].texto).toBe("Sin temporada");
    expect(contarFiltrosActivos("temporada=sin&falta=foto")).toBe(2);
  });
});
