import { describe, expect, it } from "vitest";
import { decidirPorRespuesta, fichaCumplida, leerPorAvisar, paqueteDelPedido } from "./push-pedidos-web";

const FOTO = "https://vovjyyiafkxteijimpuy.supabase.co/storage/v1/object/public/retail-productos-fotos/fotos/773bebab.jpg";
const PEDIDO = { pedidoId: "8a1f2c3d-0000-4000-8000-000000000018", codigo: "W-0018", sede: "Tienda TRU", prendas: 1, total: 109, foto: FOTO };
const APARATO = { endpoint: `https://fcm.googleapis.com/fcm/send/${"x".repeat(40)}`, p256dh: "B".repeat(87), auth: "a".repeat(22) };

describe("paqueteDelPedido", () => {
  it("dice el texto «A · Directo» que eligió Felipe, abre el pedido y lleva su foto", () => {
    expect(paqueteDelPedido(PEDIDO)).toEqual({
      tipo: "pedido_web",
      titulo: "Pedido web nuevo · W-0018",
      texto: "Tienda TRU · 1 prenda · S/\u00a0109.00",
      enlace: "/tienda-web/pedidos?pedido=8a1f2c3d-0000-4000-8000-000000000018",
      imagen: FOTO,
      etiqueta: "pedido-web-W-0018",
    });
  });

  it("cuenta las prendas en plural y siempre con dos decimales", () => {
    expect(paqueteDelPedido({ ...PEDIDO, prendas: 3, total: 148.3 }).texto).toBe("Tienda TRU · 3 prendas · S/\u00a0148.30");
  });

  it("sin foto, o con una que no es de nuestro almacenamiento, no lleva imagen", () => {
    expect(paqueteDelPedido({ ...PEDIDO, foto: null }).imagen).toBeNull();
    expect(paqueteDelPedido({ ...PEDIDO, foto: "https://otro-sitio.com/foto.jpg" }).imagen).toBeNull();
    expect(paqueteDelPedido({ ...PEDIDO, foto: "http://x.supabase.co/storage/v1/object/public/a.jpg" }).imagen).toBeNull();
  });

  it("nunca lleva el nombre del cliente ni de la prenda: solo número, sede, cuántas y total", () => {
    const p = paqueteDelPedido(PEDIDO);
    expect(Object.keys(p).sort()).toEqual(["enlace", "etiqueta", "imagen", "texto", "tipo", "titulo"]);
  });
});

describe("leerPorAvisar", () => {
  const ficha = {
    id: "e1", pedido_id: PEDIDO.pedidoId, codigo: "W-0018", sede: "Tienda TRU", total: "109.00", prendas: 1, foto: FOTO, intentos: 1,
    aparatos: [APARATO, { endpoint: "no-es-una-url", p256dh: "x", auth: "y" }],
  };

  it("lee la ficha y descarta el teléfono con una dirección que no sirve", () => {
    expect(leerPorAvisar({ estado: "ok", avisos: [ficha] })).toEqual([
      { id: "e1", pedidoId: PEDIDO.pedidoId, codigo: "W-0018", sede: "Tienda TRU", prendas: 1, total: 109, foto: FOTO, aparatos: [APARATO] },
    ]);
  });

  it("salta una ficha rara y sigue con las demás; sin lista, null (la vuelta se salta)", () => {
    expect(leerPorAvisar({ avisos: [{ id: "e2" }, ficha] })).toHaveLength(1);
    expect(leerPorAvisar({ avisos: [{ ...ficha, prendas: 0 }] })).toEqual([]);
    expect(leerPorAvisar(null)).toBeNull();
    expect(leerPorAvisar({ estado: "ok" })).toBeNull();
  });
});

describe("decidirPorRespuesta y fichaCumplida", () => {
  it("2xx entregado; 404 y 410 se quita el teléfono; lo demás se reintenta", () => {
    expect(decidirPorRespuesta(201)).toBe("entregado");
    expect(decidirPorRespuesta(404)).toBe("quitar_aparato");
    expect(decidirPorRespuesta(410)).toBe("quitar_aparato");
    expect(decidirPorRespuesta(429)).toBe("reintentar");
    expect(decidirPorRespuesta(500)).toBe("reintentar");
    expect(decidirPorRespuesta(null)).toBe("reintentar");
  });

  it("cumple si un teléfono lo recibió, si no hay teléfonos o si todos estaban muertos; si todo falló, se reintenta", () => {
    expect(fichaCumplida([])).toBe(true);
    expect(fichaCumplida(["reintentar", "entregado"])).toBe(true);
    expect(fichaCumplida(["quitar_aparato"])).toBe(true);
    expect(fichaCumplida(["reintentar", "quitar_aparato"])).toBe(false);
  });
});
