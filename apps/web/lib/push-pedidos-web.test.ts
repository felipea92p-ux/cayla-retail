import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  claveAUint8,
  decidirPorRespuesta,
  fichaCumplida,
  leerPorAvisar,
  paqueteDePrueba,
  paqueteDelPedido,
  puedeAvisar,
  suscripcionValida,
  telefonoDe,
} from "./push-pedidos-web";

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

describe("en el teléfono", () => {
  it("acepta la suscripción del navegador y rechaza una sin claves o con una dirección que no es https", () => {
    const ok = { endpoint: APARATO.endpoint, keys: { p256dh: APARATO.p256dh, auth: APARATO.auth } };
    expect(suscripcionValida(ok)).toEqual(APARATO);
    expect(suscripcionValida({ ...ok, keys: {} })).toBeNull();
    expect(suscripcionValida({ ...ok, endpoint: "http://fcm.googleapis.com/fcm/send/xxxxxxxxxxxxxxxxxxxxx" })).toBeNull();
    expect(suscripcionValida(null)).toBeNull();
  });

  it("convierte la clave pública a bytes", () => {
    expect(Array.from(claveAUint8("AQID"))).toEqual([1, 2, 3]);
    expect(claveAUint8("BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM")).toHaveLength(65);
  });

  it("reconoce el Android, el iPhone y lo demás", () => {
    expect(telefonoDe("Mozilla/5.0 (Linux; Android 14; SM-A546E) Chrome/130")).toBe("android");
    expect(telefonoDe("Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) Safari/604.1")).toBe("iphone");
    expect(telefonoDe("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/130")).toBe("otro");
  });

  it("al iPhone sin instalar le explica cómo agregarlo; sin push, no se puede; lo demás, sí", () => {
    expect(puedeAvisar({ telefono: "iphone", instalada: false, tienePush: false })).toBe("iphone_sin_instalar");
    expect(puedeAvisar({ telefono: "iphone", instalada: true, tienePush: true })).toBe("si");
    expect(puedeAvisar({ telefono: "android", instalada: false, tienePush: true })).toBe("si");
    expect(puedeAvisar({ telefono: "otro", instalada: false, tienePush: false })).toBe("sin_soporte");
  });

  it("el aviso de prueba se ve igual que uno de verdad y se nota que es de prueba (sin número ni total que buscar)", () => {
    const p = paqueteDePrueba("Tienda TRU");
    expect(p.titulo).toBe("Pedido web nuevo · prueba");
    expect(p.texto).toBe("Tienda TRU · así suena cada pedido nuevo");
    expect(p.enlace).toBe("/tienda-web/pedidos");
    expect(p.etiqueta).toBe("pedido-web-prueba");
  });

  it("el service worker muestra los avisos de pedido web con los archivos que existen", () => {
    const sw = readFileSync(join(__dirname, "../public/sw.js"), "utf8");
    expect(sw).toContain('addEventListener("push"');
    expect(sw).toContain('addEventListener("notificationclick"');
    expect(sw).toContain("probar-aviso-pedido-web");
    for (const archivo of sw.match(/"\/erp-[a-z0-9-]+\.png"/g) ?? []) {
      expect(existsSync(join(__dirname, "../public", JSON.parse(archivo))), archivo).toBe(true);
    }
    expect(existsSync(join(__dirname, "../public/sonidos/campanita-cayla.wav"))).toBe(true);
  });
});
