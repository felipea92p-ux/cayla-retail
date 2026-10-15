import { describe, expect, it } from "vitest";
import {
  avisoAlArchivar,
  estadoDelPedido,
  frenaAnonimizar,
  leerTiendaOnline,
  lineaDelPedido,
  notaDelCorreoDeEntrada,
  pieDeAnonimizar,
  type TiendaOnlineDeLaClienta,
} from "./clienta-tienda-online-reglas";

// La ficha y la tienda online (Felipe 2026-10-15, 20261015123000): la hoja de archivar AVISA si hay un pedido web en curso (no frena),
// y «Editar» dice que el correo con que entra a la tienda online no cambia desde aquí. La forma de la respuesta es la de
// `fn_clienta_tienda_online` (scripts/pruebas/clientas_correo_en_la_ficha.mjs, sección C).

const SIN_NADA: TiendaOnlineDeLaClienta = { cuentaWeb: false, pedidosEnCurso: [] };
const UNO: TiendaOnlineDeLaClienta = { cuentaWeb: true, pedidosEnCurso: [{ codigo: "W-0012", estado: "pagado", tienda: "Tienda Trujillo" }] };
const DOS: TiendaOnlineDeLaClienta = {
  cuentaWeb: true,
  pedidosEnCurso: [
    { codigo: "W-0012", estado: "pagado", tienda: "Tienda Trujillo" },
    { codigo: "W-0020", estado: "por_confirmar", tienda: "Tienda Lima" },
  ],
};

describe("lo que contesta la base", () => {
  it("se lee la forma de fn_clienta_tienda_online", () => {
    expect(
      leerTiendaOnline({
        cuenta_web: true,
        pedidos_en_curso: [{ codigo: "W-0012", estado: "pagado", tienda: "Tienda Trujillo", creado_en: "2026-10-10T15:00:00Z" }],
      }),
    ).toEqual(UNO);
    expect(leerTiendaOnline({ cuenta_web: false, pedidos_en_curso: [] })).toEqual(SIN_NADA);
  });

  it("lo que no tiene la forma (una base sin la migración, una respuesta rara) es null: la hoja no avisa y la ficha sigue", () => {
    expect(leerTiendaOnline(null)).toBeNull();
    expect(leerTiendaOnline("hola")).toBeNull();
    expect(leerTiendaOnline({ pedidos_en_curso: [] })).toBeNull();
    expect(leerTiendaOnline({ cuenta_web: true })).toBeNull();
  });

  it("un pedido con un estado que no es «en curso» (o sin código) no se cuenta", () => {
    expect(
      leerTiendaOnline({
        cuenta_web: false,
        pedidos_en_curso: [{ codigo: "W-1", estado: "entregado", tienda: "X" }, { estado: "pagado" }, "W-2", { codigo: "W-3", estado: "confirmado" }],
      }),
    ).toEqual({ cuentaWeb: false, pedidosEnCurso: [{ codigo: "W-3", estado: "confirmado", tienda: "" }] });
  });
});

describe("cómo se lee un pedido", () => {
  it("en palabras de la tienda", () => {
    expect(estadoDelPedido("por_confirmar")).toBe("por confirmar");
    expect(estadoDelPedido("confirmado")).toBe("confirmado, falta pagar");
    expect(estadoDelPedido("pagado")).toBe("pagado, falta entregar");
    expect(lineaDelPedido(UNO.pedidosEnCurso[0]!)).toBe("W-0012 · pagado, falta entregar · Tienda Trujillo");
    expect(lineaDelPedido({ codigo: "W-3", estado: "confirmado", tienda: "" })).toBe("W-3 · confirmado, falta pagar");
  });
});

describe("al archivar: avisa, no frena", () => {
  it("sin pedidos en curso (o sin la lectura), no hay aviso", () => {
    expect(avisoAlArchivar(SIN_NADA, false)).toBeNull();
    expect(avisoAlArchivar({ cuentaWeb: true, pedidosEnCurso: [] }, true)).toBeNull();
    expect(avisoAlArchivar(null, false)).toBeNull();
  });

  it("archivar: el pedido sigue igual en la tienda (sea cual sea su estado) y no podrá separar otro", () => {
    const a = avisoAlArchivar(UNO, false)!;
    expect(a.titulo).toBe("Tiene un pedido de la tienda online en curso");
    expect(a.pedidos).toEqual(["W-0012 · pagado, falta entregar · Tienda Trujillo"]);
    expect(a.texto).toBe("Si archivas la ficha, el pedido sigue igual en la tienda y lo sigue viendo en su cuenta. Lo que ya no podrá es separar otro.");
  });

  it("anonimizar: su cuenta de la tienda se cierra y ya no ve el código para recoger; mejor esperar", () => {
    const a = avisoAlArchivar(UNO, true)!;
    expect(a.texto).toMatch(/^Si anonimizas la ficha, se cierra su cuenta de la tienda online/);
    expect(a.texto).toMatch(/código para recoger/);
    expect(a.texto).toMatch(/Mejor espera a que se entregue\.$/);
  });

  it("con dos, en plural", () => {
    const a = avisoAlArchivar(DOS, false)!;
    expect(a.titulo).toBe("Tiene 2 pedidos de la tienda online en curso");
    expect(a.pedidos).toHaveLength(2);
    expect(a.texto).toMatch(/los pedidos siguen igual en la tienda y los sigue viendo/);
    expect(avisoAlArchivar(DOS, true)!.texto).toMatch(/sus pedidos.*se entreguen\.$/);
  });

  it("sin género: le habla igual a un cliente que a una clienta (vocabulario de CAYLA)", () => {
    for (const a of [avisoAlArchivar(UNO, false), avisoAlArchivar(UNO, true), avisoAlArchivar(DOS, false), avisoAlArchivar(DOS, true)]) {
      const texto = `${a!.titulo} ${a!.texto}`.toLocaleLowerCase("es");
      const palabras = texto.split(/[^\p{L}]+/u);
      for (const p of ["él", "ella", "clienta", "socia"]) expect(palabras, p).not.toContain(p);
      expect(texto).not.toMatch(/(lo|la) (archivas|anonimizas)/);
    }
  });
});

describe("el correo de entrada y lo que borra anonimizar", () => {
  it("con cuenta en la tienda online, la caja del correo dice que el de entrada no cambia aquí; sin cuenta, nada", () => {
    expect(notaDelCorreoDeEntrada(UNO)).toBe(
      "Tiene cuenta en la tienda online: entra con su propio correo, que no cambia desde aquí. Si lo perdió, usa «Restablecer acceso» en su ficha.",
    );
    expect(notaDelCorreoDeEntrada(SIN_NADA)).toBeNull();
    expect(notaDelCorreoDeEntrada(null)).toBeNull();
  });

  it("anonimizar borra también el correo; con cuenta, dice que se cierra", () => {
    expect(pieDeAnonimizar(SIN_NADA)).toBe(
      "Borra documento, celular, correo, cumpleaños, tallas y su lugar en el club (sale del club y de las novedades). Sus compras y apartados NO se tocan — solo desaparece quién es. No se puede deshacer.",
    );
    expect(pieDeAnonimizar(UNO)).toMatch(/novedades\)\. Su cuenta de la tienda online se cierra\. Sus compras/);
    expect(pieDeAnonimizar(null)).toBe(pieDeAnonimizar(SIN_NADA));
  });
});

describe("anonimizar espera un pedido web pagado sin entregar (20261015131000)", () => {
  it("con uno pagado, la hoja dice que todavía no y cuál es, con las palabras de la base; archivar sí se puede", () => {
    const f = frenaAnonimizar(UNO)!;
    expect(f).toBe(
      "Todavía no se puede anonimizar: tiene un pedido de la tienda online pagado y sin entregar (W-0012 · Tienda Trujillo). Sus datos se pueden borrar cuando lo recoja o cuando se anule el pedido. Archivar sí se puede.",
    );
  });

  it("solo frena lo PAGADO: por confirmar o confirmado sin pagar solo avisan", () => {
    expect(frenaAnonimizar({ cuentaWeb: true, pedidosEnCurso: [{ codigo: "W-0020", estado: "por_confirmar", tienda: "Tienda Lima" }] })).toBeNull();
    expect(frenaAnonimizar({ cuentaWeb: true, pedidosEnCurso: [{ codigo: "W-0021", estado: "confirmado", tienda: "" }] })).toBeNull();
    expect(frenaAnonimizar(SIN_NADA)).toBeNull();
    expect(frenaAnonimizar(null)).toBeNull();
    // Con uno pagado y otro por confirmar, frena por el pagado (y solo lo nombra a él).
    expect(frenaAnonimizar(DOS)).toMatch(/\(W-0012 · Tienda Trujillo\)/);
    expect(frenaAnonimizar(DOS)).not.toMatch(/W-0020/);
  });

  it("con dos pagados, en plural", () => {
    const f = frenaAnonimizar({
      cuentaWeb: true,
      pedidosEnCurso: [
        { codigo: "W-0012", estado: "pagado", tienda: "Tienda Trujillo" },
        { codigo: "W-0015", estado: "pagado", tienda: "" },
      ],
    })!;
    expect(f).toMatch(/tiene 2 pedidos de la tienda online pagados y sin entregar \(W-0012 · Tienda Trujillo; W-0015\)/);
    expect(f).toMatch(/cuando los recoja o cuando se anulen/);
  });
});
