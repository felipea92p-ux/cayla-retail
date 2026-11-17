import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LARGO_NOMBRE_DEL_COMPROBANTE } from "./documento-comprobante-reglas";
import {
  TEXTO_BOLETA_PIDE_DOCUMENTO,
  TOPE_BOLETA_SIN_DOCUMENTO,
  campoDelProblema,
  clienteCambiado,
  clienteInicial,
  clienteLegible,
  clienteParaBase,
  comprobanteNuevo,
  conCambioDelCliente,
  documentosDelCambio,
  documentosParaMensaje,
  estadoDelDocumento,
  filasDelTicket,
  leerMemoriaPrevia,
  leerPrevia,
  lineasDeDocumentos,
  nombreConocido,
  originalDelCambio,
  problemaClienteDelCambio,
  recordarPrevia,
  textoCreditoDelRecibo,
  textoDelImpacto,
  type ClienteDelComprobante,
  type DocumentoOriginal,
  type DocumentosDelCambio,
  type FilaComprobanteDeVenta,
  type PreviaDocumentos,
} from "./cambios-documentos-reglas";
import { soles } from "./compras-reglas";
import type { EstadoComprobante } from "./comprobantes-reglas";

// ADR-0671: lo que la pantalla de Cambios dice que va a salir tiene que ser lo que la base emite
// (supabase/migrations/20261116213000_cambio_con_comprobantes_parte2_funciones.sql). Se recorren todos los tipos de original, todos sus
// estados y los signos de la diferencia.

const fila = (p: Partial<FilaComprobanteDeVenta> = {}): FilaComprobanteDeVenta => ({
  id: "c1",
  tipo: "boleta",
  serie: "B005",
  numero: 224,
  estado: "aceptado",
  esAnticipo: false,
  anulacionSolicitadaAt: null,
  clienteTipoDoc: "sin_documento",
  clienteNumDoc: null,
  clienteNombre: null,
  creadoEn: "2026-11-10T15:00:00Z",
  ...p,
});

const original = (p: Partial<DocumentoOriginal> = {}): DocumentoOriginal => ({
  id: "c1",
  tipo: "boleta",
  numero: "B005-000224",
  estado: "aceptado",
  bajaEnTramite: false,
  clienteTipoDoc: "sin_documento",
  clienteNumDoc: null,
  clienteNombre: null,
  ...p,
});

const ESTADOS: EstadoComprobante[] = ["pendiente", "pendiente_reintento", "enviado", "aceptado", "rechazado", "anulado", "no_emitido", "interna"];

describe("originalDelCambio — la misma regla que fn_original_del_cambio", () => {
  it("sin comprobantes no hay original", () => {
    expect(originalDelCambio([])).toBeNull();
  });

  it("toma el vivo aunque haya uno liberado más nuevo", () => {
    const o = originalDelCambio([
      fila({ id: "vivo", estado: "aceptado", creadoEn: "2026-11-10T10:00:00Z" }),
      fila({ id: "liberado", estado: "no_emitido", creadoEn: "2026-11-10T11:00:00Z" }),
      fila({ id: "anulado", estado: "anulado", creadoEn: "2026-11-10T12:00:00Z" }),
    ]);
    expect(o?.id).toBe("vivo");
  });

  it("entre vivos, el más reciente; uno muerto solo si no hay otro", () => {
    expect(originalDelCambio([fila({ id: "a", creadoEn: "2026-11-10T10:00:00Z" }), fila({ id: "b", estado: "rechazado", creadoEn: "2026-11-10T11:00:00Z" })])?.id).toBe("b");
    expect(originalDelCambio([fila({ id: "x", estado: "anulado", creadoEn: "2026-11-10T10:00:00Z" }), fila({ id: "y", estado: "no_emitido", creadoEn: "2026-11-10T11:00:00Z" })])?.id).toBe("y");
  });

  it("nunca un anticipo de apartado, ni una nota de crédito", () => {
    expect(originalDelCambio([fila({ id: "anticipo", esAnticipo: true })])).toBeNull();
    expect(originalDelCambio([fila({ id: "nc", tipo: "nota_credito" })])).toBeNull();
    expect(originalDelCambio([fila({ id: "anticipo", esAnticipo: true, creadoEn: "2026-11-11T00:00:00Z" }), fila({ id: "boleta" })])?.id).toBe("boleta");
  });

  it("trae el número largo, el estado, la baja en trámite y el cliente en sus tres partes", () => {
    expect(
      originalDelCambio([fila({ tipo: "factura", serie: "F005", numero: 7, anulacionSolicitadaAt: "2026-11-12T00:00:00Z", clienteTipoDoc: "ruc", clienteNumDoc: "20123456789", clienteNombre: " EMPRESA SAC " })]),
    ).toEqual({
      id: "c1",
      tipo: "factura",
      numero: "F005-000007",
      estado: "aceptado",
      bajaEnTramite: true,
      clienteTipoDoc: "ruc",
      clienteNumDoc: "20123456789",
      clienteNombre: "EMPRESA SAC",
    });
  });

  it("un tipo de documento desconocido se lee sin documento", () => {
    expect(originalDelCambio([fila({ clienteTipoDoc: "otro" })])?.clienteTipoDoc).toBe("sin_documento");
  });
});

describe("documentosDelCambio — qué sale y cuándo, en todos los casos", () => {
  it("sin diferencia no sale nada, sea cual sea el original", () => {
    for (const tipo of ["boleta", "factura", "nota_venta"] as const)
      for (const estado of ESTADOS) expect(documentosDelCambio({ diferencia: 0, totalNuevo: 80, pagado: 80, original: original({ tipo, estado }) })).toEqual({ emite: false });
    expect(documentosDelCambio({ diferencia: 0.001, totalNuevo: 80, pagado: 80, original: null })).toEqual({ emite: false });
  });

  it("recorre tipo × estado × signo: el nuevo siempre sale ahora, del mismo tipo; la nota según el original", () => {
    for (const tipo of ["boleta", "factura", "nota_venta"] as const) {
      for (const estado of ESTADOS) {
        for (const diferencia of [20, -10]) {
          const pagado = 80;
          const d = documentosDelCambio({ diferencia, totalNuevo: pagado + diferencia, pagado, original: original({ tipo, estado }) });
          expect(d.emite).toBe(true);
          if (!d.emite) continue;
          expect(d.nuevo.tipo).toBe(tipo);
          expect(d.nuevo.total).toBe(pagado + diferencia);
          const esperado = tipo === "nota_venta" || estado === "anulado" || estado === "no_emitido" ? "no" : estado === "aceptado" ? "ahora" : "despues";
          expect(d.nota.cuando, `${tipo} ${estado}`).toBe(esperado);
          // nuevo − nota = diferencia: las mismas cifras que dieron la diferencia.
          if (d.nota.cuando !== "no") expect(Math.round((d.nuevo.total - d.nota.total) * 100) / 100).toBe(diferencia);
        }
      }
    }
  });

  it("una baja en trámite deja la nota para después aunque esté aceptada", () => {
    const d = documentosDelCambio({ diferencia: 20, totalNuevo: 100, pagado: 80, original: original({ bajaEnTramite: true }) });
    expect(d.emite && d.nota.cuando).toBe("despues");
  });

  it("sin original (o sin saberlo): boleta nueva y sin nota", () => {
    for (const o of [null, undefined]) {
      const d = documentosDelCambio({ diferencia: 15, totalNuevo: 95, pagado: 80, original: o });
      expect(d).toEqual({ emite: true, nuevo: { tipo: "boleta", total: 95 }, nota: { cuando: "no", total: 80, original: null, originalTipo: null } });
    }
  });

  it("lo devuelto pagado en 0 no lleva nota (como aprobar_devolucion)", () => {
    const d = documentosDelCambio({ diferencia: 30, totalNuevo: 30, pagado: 0, original: original() });
    expect(d.emite && d.nota.cuando).toBe("no");
  });

  it("redondea al céntimo", () => {
    const d = documentosDelCambio({ diferencia: 10.005, totalNuevo: 90.004, pagado: 79.999, original: original() });
    expect(d.emite && [d.nuevo.total, d.nota.total]).toEqual([90, 80]);
  });
});

describe("leerPrevia — la respuesta de previsualizar_documentos_cambio", () => {
  const respuesta = {
    emite: true,
    diferencia: 20,
    nuevo: { tipo: "boleta", total: 100, cliente_tipo_doc: "dni", cliente_num_doc: "45879632", cliente_nombre: "ANA PEREZ", editable: true },
    nota: { cuando: "despues", total: 80, original: "B005-224", original_tipo: "boleta" },
    problema: null,
  };

  it("lee la forma que arma la base, con el número largo", () => {
    expect(leerPrevia(respuesta)).toEqual({
      documentos: { emite: true, nuevo: { tipo: "boleta", total: 100 }, nota: { cuando: "despues", total: 80, original: "B005-000224", originalTipo: "boleta" } },
      cliente: { tipoDoc: "dni", numDoc: "45879632", nombre: "ANA PEREZ", editable: true },
      problema: null,
    });
  });

  it("los números pueden llegar como texto (numeric de Postgres)", () => {
    const p = leerPrevia({ ...respuesta, nuevo: { ...respuesta.nuevo, total: "100.00" }, nota: { ...respuesta.nota, total: "80.00" } });
    expect(p?.documentos.emite && [p.documentos.nuevo.total, p.documentos.nota.total]).toEqual([100, 80]);
  });

  it("una factura nunca es editable, aunque la respuesta dijera otra cosa", () => {
    expect(leerPrevia({ ...respuesta, nuevo: { ...respuesta.nuevo, tipo: "factura", cliente_tipo_doc: "ruc", editable: true } })?.cliente?.editable).toBe(false);
  });

  it("sin documentos, y el problema tal cual", () => {
    expect(leerPrevia({ emite: false, diferencia: 0 })).toEqual({ documentos: { emite: false }, cliente: null, problema: null });
    expect(leerPrevia({ ...respuesta, problema: "Esta tienda no tiene serie de boleta activa: regístrala en Facturación." })?.problema).toMatch(/^Esta tienda/);
  });

  it("lo que no tiene la forma esperada no se usa", () => {
    for (const malo of [null, "x", [], {}, { emite: "si" }, { emite: true }, { ...respuesta, nuevo: { ...respuesta.nuevo, tipo: "nota_credito" } }, { ...respuesta, nota: { ...respuesta.nota, cuando: "mañana" } }])
      expect(leerPrevia(malo)).toBeNull();
  });
});

describe("cómo se dice: impacto y líneas del bloque (poco texto: el detalle no repite el título)", () => {
  const sale = (cuando: "ahora" | "despues" | "no", tipo: "boleta" | "factura" | "nota_venta" = "boleta") =>
    ({ emite: true, nuevo: { tipo, total: 100 }, nota: { cuando, total: 80, original: cuando === "no" ? null : "B005-000224", originalTipo: cuando === "no" ? null : tipo } }) as const;

  it("con nota ahora: el título nombra los dos y el detalle, sus montos en el mismo orden", () => {
    expect(textoDelImpacto(sale("ahora"))).toEqual({ titulo: "Nota de crédito y boleta nueva", detalle: `${soles(80)} y ${soles(100)}` });
    expect(textoDelImpacto(sale("ahora", "factura")).titulo).toBe("Nota de crédito y factura nueva");
  });

  it("con nota después: el detalle dice solo cuándo sale la nota", () => {
    expect(textoDelImpacto(sale("despues")).detalle).toBe("Nota: cuando SUNAT acepte B005-000224");
  });

  it("sin nota: solo el nuevo y su monto", () => {
    expect(textoDelImpacto(sale("no", "nota_venta"))).toEqual({ titulo: "Nota de venta nueva", detalle: `Por ${soles(100)}` });
  });

  it("ningún detalle pasa de 8 palabras ni repite el nombre de un documento del título", () => {
    for (const cuando of ["ahora", "despues", "no"] as const)
      for (const tipo of ["boleta", "factura", "nota_venta"] as const) {
        const t = textoDelImpacto(sale(cuando, tipo));
        expect(t.detalle.split(/\s+/).length, `${cuando} ${tipo}`).toBeLessThanOrEqual(8);
        expect(t.detalle).not.toMatch(/nota de crédito|boleta|factura|nota de venta/i);
      }
  });

  it("las líneas: la nota primero (si hay) y el nuevo, que siempre sale ahora", () => {
    expect(lineasDeDocumentos(sale("despues")).map((l) => [l.clave, l.titulo, l.monto, l.cuando])).toEqual([
      ["nota", "Nota de crédito", 80, "despues"],
      ["nuevo", "Boleta nueva", 100, "ahora"],
    ]);
    expect(lineasDeDocumentos(sale("ahora"))[0]!.detalle).toBe("Sobre la B005-000224");
    expect(lineasDeDocumentos(sale("no", "nota_venta")).map((l) => l.titulo)).toEqual(["Nota de venta nueva"]);
  });
});

describe("el cliente del comprobante nuevo", () => {
  const dni = original({ clienteTipoDoc: "dni", clienteNumDoc: "45879632", clienteNombre: "ANA PEREZ" });

  it("arranca con el de la compra", () => {
    expect(clienteInicial(dni)).toEqual({ identidad: "dni", numero: "45879632", nombre: "ANA PEREZ" });
    expect(clienteInicial(original())).toEqual({ identidad: "dni", numero: "", nombre: "" });
    expect(clienteInicial(original({ clienteTipoDoc: "pasaporte", clienteNumDoc: "AB123456" }))).toEqual({ identidad: "pasaporte", numero: "AB123456", nombre: "" });
    expect(clienteInicial(null)).toEqual({ identidad: "dni", numero: "", nombre: "" });
  });

  it("viaja como lo recibe la base: sin número, sin documento", () => {
    expect(clienteParaBase("boleta", { identidad: "dni", numero: " 45879632 ", nombre: " Ana " })).toEqual({ tipo_doc: "dni", num_doc: "45879632", nombre: "Ana" });
    expect(clienteParaBase("boleta", { identidad: "carne_extranjeria", numero: "", nombre: "" })).toEqual({ tipo_doc: "sin_documento", num_doc: null, nombre: null });
    expect(clienteParaBase("nota_venta", { identidad: "pasaporte", numero: "AB123456", nombre: "Lu" }).tipo_doc).toBe("pasaporte");
  });

  it("solo viaja si la persona lo cambió, y nunca en una factura", () => {
    expect(clienteCambiado("boleta", undefined, dni)).toBe(false);
    expect(clienteCambiado("boleta", clienteInicial(dni), dni)).toBe(false);
    expect(clienteCambiado("boleta", { ...clienteInicial(dni), nombre: "LUIS" }, dni)).toBe(true);
    expect(clienteCambiado("boleta", { identidad: "dni", numero: "", nombre: "" }, dni)).toBe(true);
    expect(clienteCambiado("factura", { identidad: "dni", numero: "11111111", nombre: "X" }, dni)).toBe(false);
  });

  it("lo que impide emitirlo: la boleta de más de S/ 700 sin documento y el número mal escrito", () => {
    const sinDoc = { identidad: "dni" as const, numero: "", nombre: "" };
    expect(problemaClienteDelCambio("boleta", sinDoc, TOPE_BOLETA_SIN_DOCUMENTO)).toBeNull();
    expect(problemaClienteDelCambio("boleta", sinDoc, 700.01)).toBe(TEXTO_BOLETA_PIDE_DOCUMENTO);
    // El mismo texto que el pie del número vacío: `CampoGuiado` esconde el pie cuando sale el error, y la regla no se dice dos veces.
    expect(TEXTO_BOLETA_PIDE_DOCUMENTO).toBe("Más de S/\u00a0700: lleva documento.");
    expect(problemaClienteDelCambio("boleta", { ...sinDoc, numero: "4587963" }, 900)).toMatch(/DNI/);
    expect(problemaClienteDelCambio("boleta", { ...sinDoc, numero: "45879632" }, 900)).toBeNull();
    expect(problemaClienteDelCambio("boleta", { identidad: "carne_extranjeria", numero: "001234567", nombre: "" }, 900)).toBeNull();
    expect(problemaClienteDelCambio("boleta", { identidad: "pasaporte", numero: "AB-1", nombre: "" }, 50)).not.toBeNull();
    // La nota de venta no va a SUNAT, y la factura no se edita.
    expect(problemaClienteDelCambio("nota_venta", sinDoc, 5000)).toBeNull();
    expect(problemaClienteDelCambio("factura", sinDoc, 5000)).toBeNull();
  });

  it("de /chaos: más de S/ 700 no se esquiva con un número de relleno, y el nombre del comprobante nuevo tiene tope", () => {
    const base = { identidad: "dni" as const, numero: "", nombre: "" };
    expect(problemaClienteDelCambio("boleta", { ...base, numero: "00000000" }, 900)).toMatch(/documento real/);
    expect(problemaClienteDelCambio("boleta", { ...base, numero: "11111111" }, 900)).toMatch(/documento real/);
    expect(problemaClienteDelCambio("boleta", { identidad: "pasaporte", numero: "AAAAAA", nombre: "" }, 900)).toMatch(/documento real/);
    // Hasta S/ 700 no se pide documento: un número de relleno ahí no cambia nada (lo mismo que en Vender).
    expect(problemaClienteDelCambio("boleta", { ...base, numero: "00000000" }, 700)).toBeNull();
    expect(problemaClienteDelCambio("boleta", { ...base, numero: "45879632" }, 900)).toBeNull();
    // El nombre: hasta el tope sí, uno más no; también en la nota de venta, que no va a SUNAT pero se imprime.
    expect(problemaClienteDelCambio("boleta", { ...base, nombre: "A".repeat(LARGO_NOMBRE_DEL_COMPROBANTE) }, 50)).toBeNull();
    expect(problemaClienteDelCambio("boleta", { ...base, nombre: "A".repeat(LARGO_NOMBRE_DEL_COMPROBANTE + 1) }, 50)).toMatch(/letras/);
    expect(problemaClienteDelCambio("nota_venta", { ...base, nombre: "A".repeat(LARGO_NOMBRE_DEL_COMPROBANTE + 1) }, 50)).toMatch(/letras/);
  });

  it("el nombre ya conocido evita el padrón solo con el mismo DNI del original", () => {
    expect(nombreConocido(clienteInicial(dni), dni)).toBe("ANA PEREZ");
    expect(nombreConocido({ ...clienteInicial(dni), numero: "11111111" }, dni)).toBeNull();
    expect(nombreConocido({ ...clienteInicial(dni), identidad: "pasaporte" }, dni)).toBeNull();
    expect(nombreConocido(clienteInicial(original()), original())).toBeNull();
    expect(nombreConocido(clienteInicial(dni), null)).toBeNull();
  });

  it("un cambio de tipo y de número en el mismo evento conserva los dos (el combo del documento)", () => {
    // DocumentoDelComprobante llama a onIdentidad y a onNumero seguidos: cada parche se une sobre el resultado del anterior.
    const tipo = conCambioDelCliente("boleta", clienteInicial(dni), { identidad: "carne_extranjeria" }, dni);
    const conNumero = conCambioDelCliente("boleta", tipo, { numero: "45879632" }, dni);
    expect(conNumero.identidad).toBe("carne_extranjeria");
    expect(conNumero.numero).toBe("45879632");
    const pasaporte = conCambioDelCliente("boleta", conCambioDelCliente("boleta", clienteInicial(dni), { identidad: "pasaporte" }, dni), { numero: "AB123456" }, dni);
    expect(pasaporte).toMatchObject({ identidad: "pasaporte", numero: "AB123456" });
  });

  it("el nombre de la compra se va con su documento y vuelve con él", () => {
    const inicial = clienteInicial(dni);
    // Borra el DNI para «Cliente varios»: el nombre de la compra no se queda.
    const sinDni = conCambioDelCliente("boleta", inicial, { numero: "" }, dni);
    expect(sinDni.nombre).toBe("");
    expect(clienteParaBase("boleta", sinDni)).toEqual({ tipo_doc: "sin_documento", num_doc: null, nombre: null });
    // Escribe el DNI de otra persona: tampoco (si el padrón no responde, la boleta no sale con el DNI nuevo y el nombre de Ana).
    expect(conCambioDelCliente("boleta", inicial, { numero: "11111111" }, dni).nombre).toBe("");
    // Vuelve al DNI de la compra con el nombre vacío: recupera el suyo.
    expect(conCambioDelCliente("boleta", sinDni, { numero: "45879632" }, dni)).toEqual(inicial);
    // Un nombre escrito por la persona no se toca, ni al cambiar el documento.
    const escrito: ClienteDelComprobante = { ...inicial, nombre: "LUIS" };
    expect(conCambioDelCliente("boleta", escrito, { numero: "" }, dni).nombre).toBe("LUIS");
    expect(conCambioDelCliente("boleta", { ...sinDni, nombre: "LUIS" }, { numero: "45879632" }, dni).nombre).toBe("LUIS");
    // El nombre mismo es un parche: llega tal cual (el padrón, o la persona).
    expect(conCambioDelCliente("boleta", sinDni, { nombre: "ROSA" }, dni).nombre).toBe("ROSA");
  });

  it("cambiar solo el tipo con el número vacío no es otro documento: el nombre se queda", () => {
    const compraSinDoc = original({ clienteNombre: "ANA PEREZ" });
    const inicial = clienteInicial(compraSinDoc);
    expect(conCambioDelCliente("boleta", inicial, { identidad: "pasaporte" }, compraSinDoc)).toEqual({ ...inicial, identidad: "pasaporte" });
    // Una compra sin documento no tiene a quién devolverle el nombre: al volver a «sin documento», queda lo que haya.
    const conDni = conCambioDelCliente("boleta", inicial, { numero: "11111111" }, compraSinDoc);
    expect(conDni.nombre).toBe("");
    expect(conCambioDelCliente("boleta", conDni, { numero: "" }, compraSinDoc).nombre).toBe("");
  });

  it("se lee en una línea", () => {
    expect(clienteLegible("ruc", "20123456789", "EMPRESA SAC")).toBe("EMPRESA SAC · RUC 20123456789");
    expect(clienteLegible("sin_documento", null, null)).toBe("Cliente varios");
  });

  it("los textos de la tienda que dice la base van al bloque; los del cliente, al cliente (leídos de la migración, no copiados)", () => {
    // La última migración que define cada función: si la base reescribe un texto, esta prueba lo ve.
    const dir = new URL("../../../supabase/migrations/", import.meta.url);
    const archivos = readdirSync(dir).filter((a) => /^\d{14}_.+\.sql$/.test(a)).sort();
    const cuerpo = (funcion: string) => {
      const def = new RegExp(`create or replace function retail\\.${funcion}\\(`);
      const archivo = archivos.filter((a) => def.test(readFileSync(new URL(a, dir), "utf8"))).at(-1);
      expect(archivo, funcion).toBeDefined();
      const sql = readFileSync(new URL(archivo!, dir), "utf8");
      const desde = sql.search(def);
      return sql.slice(desde, sql.indexOf("$function$;", desde));
    };
    // Cada problema que suma `previsualizar_documentos_cambio` (la tienda): el texto fijo con que empieza.
    const deLaTienda = [...cuerpo("previsualizar_documentos_cambio").matchAll(/v_problema := '([^']+)'/g)].map((m) => m[1]!);
    expect(deLaTienda.length).toBeGreaterThanOrEqual(3);
    for (const t of deLaTienda) expect(campoDelProblema(`${t}…`, true), t).toBe("comprobantes");
    // Los del cliente (`fn_problema_cliente_del_cambio`): se corrigen bajo el cliente.
    const delCliente = [...cuerpo("fn_problema_cliente_del_cambio").matchAll(/then\s+'([^']+)'/g)].map((m) => m[1]!);
    expect(delCliente.length).toBeGreaterThanOrEqual(3);
    for (const t of delCliente) expect(campoDelProblema(t, true), t).toBe("cliente");
  });

  it("un problema de la base va al cliente si se corrige ahí; el de la tienda, al bloque", () => {
    expect(campoDelProblema("Una boleta de más de S/ 700 lleva el documento del cliente (DNI, carné de extranjería o pasaporte).", true)).toBe("cliente");
    expect(campoDelProblema("Esta tienda no tiene serie de boleta activa: regístrala en Facturación.", true)).toBe("comprobantes");
    expect(campoDelProblema("La tienda de la compra no tiene serie de nota de crédito activa: regístrala en Facturación.", true)).toBe("comprobantes");
    expect(campoDelProblema("Las notas de crédito de B005-224 ya cubren lo que cobró.", true)).toBe("comprobantes");
    expect(campoDelProblema("Una factura va a un RUC.", false)).toBe("comprobantes");
  });
});

describe("el ticket: los documentos reales", () => {
  const nuevo = { id: "n", tipo: "boleta", serie: "B005", numero: 301, total: 100, estado: "pendiente" };
  const nota = { id: "c", tipo: "nota_credito", serie: "BC05", numero: 12, total: 80, estado: "aceptado" };
  const esperado: DocumentosDelCambio = { emite: true, nuevo: { tipo: "boleta", total: 100 }, nota: { cuando: "despues", total: 80, original: "B005-000224", originalTipo: "boleta" } };

  it("cada estado tiene su texto y su tono", () => {
    for (const e of ESTADOS) expect(estadoDelDocumento(e).texto.length).toBeGreaterThan(0);
    expect(estadoDelDocumento("aceptado")).toEqual({ texto: "Aceptada", tono: "verde" });
    expect(estadoDelDocumento("rechazado").tono).toBe("rojo");
    expect(estadoDelDocumento("raro")).toEqual({ texto: "raro", tono: "pizarra" });
  });

  it("la nota primero, con su número y estado reales", () => {
    expect(filasDelTicket([nuevo, nota], esperado).map((f) => [f.titulo, f.numero, f.monto, f.chip.texto])).toEqual([
      ["Nota de crédito", "BC05-000012", 80, "Aceptada"],
      ["Boleta", "B005-000301", 100, "Por enviar"],
    ]);
  });

  it("la nota que espera a SUNAT se dice «Por emitir»; sin nada emitido no se promete nada", () => {
    expect(filasDelTicket([nuevo], esperado)[0]).toEqual({ clave: "nota-por-emitir", titulo: "Nota de crédito", numero: null, monto: 80, chip: { texto: "Por emitir", tono: "ambar" } });
    expect(filasDelTicket([], esperado)).toEqual([]);
    expect(filasDelTicket([nuevo], { ...esperado, nota: { ...esperado.nota, cuando: "no" } })).toHaveLength(1);
  });

  it("el comprobante nuevo es la boleta, factura o nota de venta (nunca la nota de crédito)", () => {
    expect(comprobanteNuevo([nota, nuevo])?.id).toBe("n");
    expect(comprobanteNuevo([nota])).toBeNull();
  });

  it("el mensaje nombra el nuevo primero", () => {
    expect(documentosParaMensaje([nota, nuevo])).toEqual(["Boleta B005-000301", "Nota de crédito BC05-000012"]);
  });

  it("qué respalda lo devuelto en el papel del nuevo", () => {
    expect(textoCreditoDelRecibo([nuevo, nota], esperado)).toBe("Nota de crédito BC05-000012");
    expect(textoCreditoDelRecibo([nuevo], esperado)).toBe("Nota de crédito de B005-000224");
    expect(textoCreditoDelRecibo([nuevo], { ...esperado, nota: { ...esperado.nota, cuando: "no", original: "NV01-000012" } })).toBe("Prenda devuelta (NV01-000012)");
    expect(textoCreditoDelRecibo([nuevo], null)).toBe("Prenda devuelta");
  });
});

describe("la memoria de la previa: nada salta mientras se escribe el cliente", () => {
  const previa = (p: Partial<PreviaDocumentos> = {}): PreviaDocumentos => ({
    documentos: { emite: true, nuevo: { tipo: "boleta", total: 100 }, nota: { cuando: "ahora", total: 80, original: "B005-000224", originalTipo: "boleta" } },
    cliente: { tipoDoc: "dni", numDoc: "45879632", nombre: "ANA PEREZ", editable: true },
    problema: null,
    ...p,
  });
  const SERIE = "Esta tienda no tiene serie de boleta activa: regístrala en Facturación.";
  const DNI_MAL = "El DNI tiene 8 dígitos.";

  it("mientras llega la respuesta al cliente nuevo, quedan los documentos y el problema de la tienda de la anterior", () => {
    const m = recordarPrevia(null, { linea: "L", consulta: "L+ana", previa: previa({ problema: SERIE }) });
    const leida = leerMemoriaPrevia(m, "L", "L+luis");
    expect(leida.previa?.documentos).toEqual(previa().documentos);
    expect(leida.problemaBloque).toBe(SERIE);
    // El problema del cliente es del cliente de entonces: no se dice del de ahora.
    expect(leerMemoriaPrevia(recordarPrevia(null, { linea: "L", consulta: "L+x", previa: previa({ problema: DNI_MAL }) }), "L", "L+y").problemaCliente).toBeNull();
  });

  it("el problema del cliente se dice solo para el cliente escrito ahora", () => {
    const m = recordarPrevia(null, { linea: "L", consulta: "L+x", previa: previa({ problema: DNI_MAL }) });
    expect(leerMemoriaPrevia(m, "L", "L+x")).toMatchObject({ problemaCliente: DNI_MAL, problemaBloque: null });
  });

  it("un problema del cliente no borra el de la tienda (la base no revisa la tienda mientras el cliente está mal)", () => {
    let m = recordarPrevia(null, { linea: "L", consulta: "L+a", previa: previa({ problema: SERIE }) });
    m = recordarPrevia(m, { linea: "L", consulta: "L+b", previa: previa({ problema: DNI_MAL }) });
    expect(leerMemoriaPrevia(m, "L", "L+b")).toMatchObject({ problemaBloque: SERIE, problemaCliente: DNI_MAL });
    // Una respuesta sin problemas sí lo borra: la base revisó todo.
    m = recordarPrevia(m, { linea: "L", consulta: "L+c", previa: previa() });
    expect(leerMemoriaPrevia(m, "L", "L+c")).toMatchObject({ problemaBloque: null, problemaCliente: null });
  });

  it("sin respuesta queda la última de la misma línea; otra línea empieza de cero", () => {
    const m = recordarPrevia(null, { linea: "L", consulta: "L+a", previa: previa({ problema: SERIE }) });
    expect(recordarPrevia(m, { linea: "L", consulta: "L+b", previa: null })).toBe(m);
    expect(recordarPrevia(m, { linea: "OTRA", consulta: "OTRA+a", previa: null })).toBeNull();
    expect(leerMemoriaPrevia(m, "OTRA", "OTRA+a")).toEqual({ previa: null, problemaBloque: null, problemaCliente: null });
    expect(leerMemoriaPrevia(m, null, null).previa).toBeNull();
  });

  it("en una factura (no se edita el cliente) todo problema va al bloque", () => {
    const factura = previa({
      documentos: { emite: true, nuevo: { tipo: "factura", total: 100 }, nota: { cuando: "ahora", total: 80, original: "F005-000007", originalTipo: "factura" } },
      cliente: { tipoDoc: "ruc", numDoc: "20123456789", nombre: "EMPRESA SAC", editable: false },
      problema: "Una factura va a un RUC.",
    });
    const m = recordarPrevia(null, { linea: "L", consulta: "L", previa: factura });
    expect(leerMemoriaPrevia(m, "L", "L")).toMatchObject({ problemaBloque: "Una factura va a un RUC.", problemaCliente: null });
  });
});
