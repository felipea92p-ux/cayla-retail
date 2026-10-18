import { describe, expect, it } from "vitest";
import { claveDeVista, esperaEnLaMismaPagina, formaDeLaRuta, prendaDeLaRuta, seccionDeLaRuta, tituloDeEspera } from "./esqueleto";
import type { MenuCabecera } from "./inicio";

const PRENDA = "3f6c2a1e-8b4d-4c2a-9e1f-0a1b2c3d4e5f";
const q = (s: string) => new URLSearchParams(s);

describe("la forma del esqueleto según la página que viene", () => {
  it("el Inicio se anuncia con su héroe, no con una grilla", () => {
    expect(formaDeLaRuta("/inicio")).toBe("inicio");
    expect(formaDeLaRuta("/inicio/")).toBe("inicio");
  });

  it("la ficha de una prenda se anuncia con su foto y sus datos", () => {
    expect(formaDeLaRuta(`/catalogo/${PRENDA}`)).toBe("ficha");
    expect(formaDeLaRuta(`/catalogo/${PRENDA}/`)).toBe("ficha");
  });

  it("una dirección que no es de una prenda no es una ficha", () => {
    expect(formaDeLaRuta("/catalogo/no-es-un-id")).toBe("grilla");
    expect(formaDeLaRuta(`/catalogo/${PRENDA}/otra`)).toBe("grilla");
  });

  it("«Mi perfil» con su saludo y sus cuadros; sus páginas con su lista; la bolsa con sus prendas y su resumen", () => {
    expect(formaDeLaRuta("/cuenta")).toBe("perfil");
    expect(formaDeLaRuta("/cuenta/")).toBe("perfil");
    expect(formaDeLaRuta("/cuenta/pedidos")).toBe("lista");
    expect(formaDeLaRuta("/cuenta/pedidos/W-0008")).toBe("lista");
    expect(formaDeLaRuta("/bolsa")).toBe("bolsa");
    expect(formaDeLaRuta("/bolsa/separado/W-0008")).toBe("lista");
    expect(formaDeLaRuta("/recomendaciones")).toBe("recomendaciones");
  });

  it("«Arma el tuyo», con el arco del probador", () => {
    expect(formaDeLaRuta("/looks/arma")).toBe("probador");
    expect(formaDeLaRuta("/looks/arma/")).toBe("probador");
  });

  it("los looks con sus láminas; un look, con su lámina grande; un look guardado, como una ficha", () => {
    expect(formaDeLaRuta("/looks")).toBe("looks");
    expect(formaDeLaRuta(`/looks/${PRENDA}`)).toBe("look");
    expect(formaDeLaRuta("/looks/no-es-un-id")).toBe("grilla");
    expect(formaDeLaRuta(`/looks/guardado/${PRENDA}`)).toBe("ficha");
    expect(formaDeLaRuta("/looks/guardado/otra-cosa")).toBe("grilla");
  });

  it("lo demás (la lista del catálogo y lo desconocido), con la grilla de prendas", () => {
    expect(formaDeLaRuta("/catalogo")).toBe("grilla");
    expect(formaDeLaRuta("/")).toBe("grilla");
    expect(formaDeLaRuta("/bolsas")).toBe("grilla");
  });

  it("la prenda de una ficha sale de su dirección (en minúsculas, para compararla con la tarjeta tocada)", () => {
    expect(prendaDeLaRuta(`/catalogo/${PRENDA.toUpperCase()}`)).toBe(PRENDA);
    expect(prendaDeLaRuta("/catalogo")).toBeNull();
    expect(prendaDeLaRuta(`/looks/${PRENDA}`)).toBeNull();
  });
});

describe("la sección que la cabecera marca mientras llega la página", () => {
  it("es la que marcará la página al llegar", () => {
    expect(seccionDeLaRuta("/inicio", q(""))).toBe("inicio");
    expect(seccionDeLaRuta("/catalogo", q("lista=nuevo"))).toBe("nuevo");
    expect(seccionDeLaRuta("/catalogo", q("lista=vendidos&categoria=CMS"))).toBe("vendidos");
    expect(seccionDeLaRuta("/catalogo", q("lista=ofertas"))).toBe("ofertas");
    expect(seccionDeLaRuta("/catalogo", q("lista=favoritos"))).toBe("favoritos");
    expect(seccionDeLaRuta("/catalogo", q(""))).toBeNull();
    expect(seccionDeLaRuta("/catalogo", q("lista=cualquiera"))).toBeNull();
    expect(seccionDeLaRuta("/looks", q(""))).toBe("looks");
    expect(seccionDeLaRuta(`/looks/${PRENDA}`, q(""))).toBe("looks");
    expect(seccionDeLaRuta("/looks/arma", q(""))).toBe("probador");
    expect(seccionDeLaRuta(`/looks/guardado/${PRENDA}`, q(""))).toBe("favoritos");
    expect(seccionDeLaRuta("/cuenta/pedidos", q(""))).toBe("cuenta");
    expect(seccionDeLaRuta(`/catalogo/${PRENDA}`, q(""))).toBeNull();
    expect(seccionDeLaRuta("/bolsa", q(""))).toBeNull();
  });
});

const MENUS: MenuCabecera[] = [
  {
    clave: "ropa",
    nombre: "Ropa",
    href: "/catalogo?menu=ropa",
    todo: "Toda la ropa",
    recien: [],
    grupos: [
      {
        clave: "arriba",
        nombre: "Arriba",
        href: "/catalogo?grupo=arriba",
        categorias: [
          {
            clave: "CMS",
            nombre: "Camisas y Blusas",
            cuantas: 27,
            href: "/catalogo?categoria=CMS",
            foto: { foto: null, optimizar: false, forma: "blusa", color: null, nombre: "" },
          },
        ],
      },
    ],
  },
];

describe("el título que la lista ya puede escribir mientras llega", () => {
  it("las listas se saben por la dirección (lo mismo que dirá la página)", () => {
    expect(tituloDeEspera(q("lista=nuevo"), null)).toEqual({
      ceja: "Recién llegado",
      titulo: ["Lo", "nuevo"],
      frase: "Lo que llegó a nuestras tiendas en los últimos 30 días.",
    });
    expect(tituloDeEspera(q(""), null)).toEqual({ ceja: "Catálogo", titulo: ["Toda la", "tienda"], frase: null });
    // En una lista, la categoría elegida no cambia el título (el de Lo nuevo sigue).
    expect(tituloDeEspera(q("lista=vendidos&categoria=CMS"), null)?.titulo).toEqual(["Más", "vendidos"]);
  });

  it("una categoría, un grupo o un menú, con los nombres de la cabecera que ya se vio", () => {
    expect(tituloDeEspera(q("categoria=CMS"), MENUS)).toEqual({ ceja: "Arriba", titulo: ["Camisas y", "Blusas"], frase: null });
    expect(tituloDeEspera(q("grupo=arriba"), MENUS)).toEqual({ ceja: "Ropa", titulo: ["", "Arriba"], frase: null });
    expect(tituloDeEspera(q("menu=ropa"), MENUS)).toEqual({ ceja: "Catálogo", titulo: ["Toda la", "ropa"], frase: null });
  });

  it("sin cabecera vista, o con algo que no trae, no inventa un nombre: el título brilla", () => {
    expect(tituloDeEspera(q("categoria=CMS"), null)).toBeNull();
    expect(tituloDeEspera(q("categoria=NADA"), MENUS)).toBeNull();
    expect(tituloDeEspera(q("grupo=nada"), MENUS)).toBeNull();
    expect(tituloDeEspera(q("menu=accesorios"), MENUS)).toBeNull();
  });
});

describe("qué cuenta como otra vista para el fundido", () => {
  it("otra página, otra lista u otro menú de la cabecera funden la pantalla", () => {
    expect(claveDeVista("/inicio", q(""))).not.toBe(claveDeVista("/catalogo", q("")));
    expect(claveDeVista("/catalogo", q("lista=nuevo"))).not.toBe(claveDeVista("/catalogo", q("lista=vendidos")));
    expect(claveDeVista("/catalogo", q("menu=ropa"))).not.toBe(claveDeVista("/catalogo", q("menu=accesorios")));
    expect(claveDeVista(`/catalogo/${PRENDA}`, q(""))).not.toBe(claveDeVista("/catalogo/6f6c2a1e-8b4d-4c2a-9e1f-0a1b2c3d4e5f", q("")));
  });

  it("los filtros de una lista, la tienda elegida y «ver más» no: apagan la lista sin fundir todo", () => {
    const base = claveDeVista("/catalogo", q("lista=nuevo"));
    expect(claveDeVista("/catalogo", q("lista=nuevo&categoria=CMS"))).toBe(base);
    expect(claveDeVista("/catalogo", q("lista=nuevo&orden=precio-asc&sede=lima&mostrar=60"))).toBe(base);
    expect(claveDeVista("/inicio", q("sede=lima"))).toBe(claveDeVista("/inicio", q("")));
    expect(claveDeVista(`/catalogo/${PRENDA}`, q("color=NEG"))).toBe(claveDeVista(`/catalogo/${PRENDA}`, q("")));
  });
});

describe("el esqueleto propio, donde Next no muestra ninguno (otra lista de la misma página)", () => {
  const ir = (de: string, a: string) => {
    const partir = (r: string) => {
      const [ruta, buscar = ""] = r.split("?");
      return { ruta, buscar: new URLSearchParams(buscar) };
    };
    return esperaEnLaMismaPagina(partir(de), partir(a));
  };
  const OTRA = "6f6c2a1e-8b4d-4c2a-9e1f-0a1b2c3d4e5f";

  it("de una lista a otra desde la cabecera, la grilla (con su título)", () => {
    expect(ir("/catalogo?lista=nuevo", "/catalogo?lista=vendidos")).toBe("grilla");
    expect(ir("/catalogo?menu=ropa", "/catalogo?menu=accesorios")).toBe("grilla");
    expect(ir("/catalogo", "/catalogo?lista=ofertas&sede=lima")).toBe("grilla");
  });

  it("de una ficha a otra o de un look a otro, nada: ahí Next ya muestra el esqueleto de su carpeta", () => {
    expect(ir(`/catalogo/${PRENDA}`, `/catalogo/${OTRA}?sede=lima`)).toBeNull();
    expect(ir(`/looks/${PRENDA}`, `/looks/${OTRA}`)).toBeNull();
  });

  it("la misma vista (un filtro, la tienda, «ver más», otro color) no: se apaga la lista o no cambia nada", () => {
    expect(ir("/catalogo?lista=nuevo", "/catalogo?lista=nuevo&categoria=CMS")).toBeNull();
    expect(ir("/catalogo?lista=nuevo", "/catalogo?lista=nuevo&sede=lima&mostrar=60")).toBeNull();
    expect(ir(`/catalogo/${PRENDA}`, `/catalogo/${PRENDA}?color=NEG`)).toBeNull();
    expect(ir(`/looks/${PRENDA}`, `/looks/${PRENDA}?sede=lima`)).toBeNull();
  });

  it("a otra página, nada: ahí sale solo el esqueleto de la que viene", () => {
    expect(ir("/catalogo?lista=nuevo", `/catalogo/${PRENDA}`)).toBeNull();
    expect(ir(`/catalogo/${PRENDA}`, "/catalogo?lista=nuevo")).toBeNull();
    expect(ir("/inicio", "/catalogo")).toBeNull();
    expect(ir(`/catalogo/${PRENDA}`, `/looks/${OTRA}`)).toBeNull();
    expect(ir("/looks", `/looks/${PRENDA}`)).toBeNull();
    expect(ir("/looks/arma", `/looks/${PRENDA}`)).toBeNull();
  });
});
