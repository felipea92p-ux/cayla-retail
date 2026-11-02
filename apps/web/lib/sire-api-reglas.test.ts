import { describe, expect, it } from "vitest";
import {
  credencialesDe,
  leerEstadoTicket,
  leerTicket,
  leerToken,
  mesAnterior,
  pedidoToken,
  urlDescargarArchivo,
  urlEstadoTicket,
  urlPedirPropuesta,
} from "./sire-api-reglas";

// Valores INVENTADOS: ninguna credencial es real.
const ENV = { SIRE_CLIENT_ID: "id-de-prueba", SIRE_CLIENT_SECRET: "secreto-de-prueba", SIRE_USUARIO_SOL: "20605964550USUARIO", SIRE_CLAVE_SOL: "clave-de-prueba" };

describe("credencialesDe", () => {
  it("con las cuatro variables, las devuelve", () => {
    expect(credencialesDe(ENV)).toMatchObject({ ok: true, credenciales: { clientId: "id-de-prueba", usuario: "20605964550USUARIO" } });
  });
  it("si falta alguna, dice cuál por su nombre y nunca un valor", () => {
    const r = credencialesDe({ ...ENV, SIRE_CLAVE_SOL: " ", SIRE_CLIENT_ID: undefined });
    expect(r).toEqual({ ok: false, faltan: ["SIRE_CLIENT_ID", "SIRE_CLAVE_SOL"] });
  });
});

describe("el token", () => {
  it("se pide con grant_type password y el scope del SIRE", () => {
    const c = credencialesDe(ENV);
    if (!c.ok) throw new Error("faltan");
    const p = pedidoToken(c.credenciales);
    expect(p.url).toBe("https://api-seguridad.sunat.gob.pe/v1/clientessol/id-de-prueba/oauth2/token/");
    expect(Object.fromEntries(p.cuerpo)).toMatchObject({ grant_type: "password", scope: "https://api-sire.sunat.gob.pe", username: "20605964550USUARIO" });
  });
  it("se lee de access_token", () => {
    expect(leerToken({ access_token: "abc", expires_in: 3600 })).toBe("abc");
    expect(leerToken({ error: "invalid_grant" })).toBeNull();
  });
});

describe("la propuesta y su ticket", () => {
  it("compras y ventas piden cada una su servicio, en txt", () => {
    expect(urlPedirPropuesta("ventas", "2026-10")).toBe("https://api-sire.sunat.gob.pe/v1/contribuyente/migeigv/libros/rvie/propuesta/web/propuesta/202610/exportapropuesta?codTipoArchivo=0");
    expect(urlPedirPropuesta("compras", "2026-10")).toContain("/libros/rce/propuesta/web/propuesta/202610/exportacioncomprobantepropuesta?codTipoArchivo=0");
  });
  it("el ticket se lee como texto", () => {
    expect(leerTicket({ numTicket: "20260300000123" })).toBe("20260300000123");
    expect(leerTicket({})).toBeNull();
  });
  it("el estado busca el registro de ese ticket y acepta el nombre mal escrito de SUNAT", () => {
    const data = {
      paginacion: { page: 1, perPage: 20, totalRegistros: 2 },
      registros: [
        { numTicket: "otro", codEstadoProceso: "02" },
        { numTicket: "20260300000123", codEstadoProceso: "06", desEstadoProceso: "Terminado", codProceso: "10", archivoReporte: [{ nomArchivoReporte: "20605964550-PRO.zip", codTipoAchivoReporte: "01" }] },
      ],
    };
    expect(leerEstadoTicket(data, "20260300000123")).toEqual({ terminado: true, estado: "06", descripcion: "Terminado", codProceso: "10", archivos: [{ nombre: "20605964550-PRO.zip", tipo: "01" }] });
    expect(leerEstadoTicket({ registros: [{ numTicket: "20260300000123", codEstadoProceso: "02" }] }, "20260300000123")?.terminado).toBe(false);
    expect(leerEstadoTicket({ cod: "500" }, "x")).toBeNull();
  });
  it("las direcciones del ticket y de la descarga llevan el libro de cada registro", () => {
    expect(urlEstadoTicket("compras", "2026-10", "T1")).toContain("codLibro=080000");
    expect(urlEstadoTicket("ventas", "2026-10", "T1")).toContain("perIni=202610&perFin=202610");
    expect(urlDescargarArchivo("ventas", "2026-10", "T1", { nombre: "a.zip", tipo: "01" }, null)).toContain("nomArchivoReporte=a.zip&codTipoArchivoReporte=01&perTributario=202610&numTicket=T1&codLibro=140000");
  });
  it("el proceso trae el mes anterior al de hoy", () => {
    expect(mesAnterior("2026-11")).toBe("2026-10");
    expect(mesAnterior("2027-01")).toBe("2026-12");
  });
});
