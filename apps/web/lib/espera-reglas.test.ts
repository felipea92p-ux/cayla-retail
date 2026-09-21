import { describe, expect, it } from "vitest";
import { clasificarPeticion, esRpcDeLectura, mensajeDeCarga, seccionDeRuta, type PeticionEspera } from "./espera-reglas";

const ORIGEN = "https://retail.cayla.pe";
const SUPA = "abc.supabase.co";

function pet(url: string, metodo = "GET", cabeceras: Record<string, string> = {}): PeticionEspera {
  const mapa = new Map(Object.entries(cabeceras).map(([k, v]) => [k.toLowerCase(), v]));
  return { url: new URL(url), metodo, cabecera: (n) => mapa.get(n.toLowerCase()) ?? null, origen: ORIGEN, hostSupabase: SUPA };
}

describe("clasificarPeticion — carga", () => {
  it("una navegación de Next es carga y dice a qué sección va", () => {
    expect(clasificarPeticion(pet(`${ORIGEN}/inventario?_rsc=x`, "GET", { RSC: "1" }))).toEqual({ tipo: "carga", seccion: "Inventario" });
  });
  it("el prefetch no muestra nada", () => {
    expect(clasificarPeticion(pet(`${ORIGEN}/compras`, "GET", { RSC: "1", "Next-Router-Prefetch": "1" }))).toBeNull();
    expect(clasificarPeticion(pet(`${ORIGEN}/compras`, "GET", { RSC: "1", "Next-Router-Segment-Prefetch": "/x" }))).toBeNull();
  });
  it("un GET normal (buscador, padrón) no es una espera", () => {
    expect(clasificarPeticion(pet(`${ORIGEN}/api/padron?tipo=ruc&numero=1`))).toBeNull();
  });
  it("una ruta sin nombre conocido queda sin sección", () => {
    expect(clasificarPeticion(pet(`${ORIGEN}/algo-nuevo`, "GET", { RSC: "1" }))).toEqual({ tipo: "carga", seccion: null });
  });
});

describe("clasificarPeticion — guardado", () => {
  it("una server action es guardado", () => {
    expect(clasificarPeticion(pet(`${ORIGEN}/caja`, "POST", { "Next-Action": "abc" }))?.tipo).toBe("guardado");
  });
  it("una escritura a /api/* es guardado; una lectura no", () => {
    expect(clasificarPeticion(pet(`${ORIGEN}/api/productos/etiquetas`, "POST"))?.tipo).toBe("guardado");
    expect(clasificarPeticion(pet(`${ORIGEN}/api/productos/etiquetas`, "GET"))).toBeNull();
  });
  it("una RPC de escritura a Supabase es guardado", () => {
    expect(clasificarPeticion(pet(`https://${SUPA}/rest/v1/rpc/registrar_venta`, "POST"))?.tipo).toBe("guardado");
  });
  it("una RPC de lectura no bloquea la pantalla", () => {
    expect(clasificarPeticion(pet(`https://${SUPA}/rest/v1/rpc/fn_stock_por_sede`, "POST"))).toBeNull();
    expect(clasificarPeticion(pet(`https://${SUPA}/rest/v1/rpc/previsualizar_cierre_conteo`, "POST"))).toBeNull();
    expect(clasificarPeticion(pet(`https://${SUPA}/rest/v1/rpc/campanas_vigentes`, "POST"))).toBeNull();
  });
  it("insertar, actualizar y subir archivos son guardado; leer una tabla no", () => {
    expect(clasificarPeticion(pet(`https://${SUPA}/rest/v1/productos`, "POST"))?.tipo).toBe("guardado");
    expect(clasificarPeticion(pet(`https://${SUPA}/rest/v1/productos?id=eq.1`, "PATCH"))?.tipo).toBe("guardado");
    expect(clasificarPeticion(pet(`https://${SUPA}/storage/v1/object/fotos/a.png`, "POST"))?.tipo).toBe("guardado");
    expect(clasificarPeticion(pet(`https://${SUPA}/rest/v1/productos?select=*`, "GET"))).toBeNull();
  });
  it("el refresco de token de sesión no cuenta", () => {
    expect(clasificarPeticion(pet(`https://${SUPA}/auth/v1/token?grant_type=refresh_token`, "POST"))).toBeNull();
  });
});

describe("clasificarPeticion — lo ajeno y la salida de emergencia", () => {
  it("otro dominio (analítica, errores) se ignora", () => {
    expect(clasificarPeticion(pet("https://o123.ingest.sentry.io/api/1/envelope/", "POST"))).toBeNull();
  });
  it("x-espera: no apaga el loader para esa petición", () => {
    expect(clasificarPeticion(pet(`${ORIGEN}/caja`, "POST", { "Next-Action": "a", "x-espera": "no" }))).toBeNull();
  });
});

describe("piezas", () => {
  it("nombres de sección", () => {
    expect(seccionDeRuta("/")).toBe("Inicio");
    expect(seccionDeRuta("/produccion/ordenes/3")).toBe("Producción");
    expect(seccionDeRuta("/zzz")).toBeNull();
    expect(mensajeDeCarga(null).titulo).toBe("Un momento");
  });
  it("lectura por prefijo", () => {
    expect(esRpcDeLectura("fn_mi_perfil")).toBe(true);
    expect(esRpcDeLectura("registrar_compra")).toBe(false);
  });
});
