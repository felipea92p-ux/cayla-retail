import { describe, expect, it } from "vitest";
import { digitoVerificadorRuc } from "@cayla-retail/shared";
import {
  argsGuardarAliada,
  cuentaQueNoCuenta,
  fraseDeAliada,
  rotuloDeAliada,
  camposDeComprobantes,
  chipLucode,
  fraseDePrueba,
  leerConexionLucode,
  problemaLlaveLucode,
  BORRADOR_ALIADA_VACIO,
  borradorDeAliada,
  aliadaDeLaUrl,
  campoDelError,
  conAliada,
  deAliada,
  leerAliadasConCuenta,
  QUIEN_CLAURE,
  quienDe,
  camposDeAliada,
  confirmaLaBaja,
  diaDeLaBaja,
  etiquetaCuenta,
  leerAliadas,
  problemaCuenta,
  problemasAliada,
  type BorradorAliada,
} from "./empresas-aliadas-reglas";

const ruc = (diez: string) => diez + String(digitoVerificadorRuc(diez));
const RUC = ruc("1047000001");
const RUC_CASA = ruc("2060000001");

const lleno: BorradorAliada = { ...BORRADOR_ALIADA_VACIO, nombre: "Aliada", ruc: RUC, regimen: "nuevo_rus", sedes: ["tru"] };

describe("problemasAliada", () => {
  it("un borrador vacío pide nombre, RUC, régimen y tienda; lo opcional no", () => {
    const p = problemasAliada(BORRADOR_ALIADA_VACIO, [], null);
    expect(p.nombre).not.toBeNull();
    expect(p.ruc).not.toBeNull();
    expect(p.regimen).not.toBeNull();
    expect(p.sedes).not.toBeNull();
    expect([p.correo, p.telefono, p.cuentas]).toEqual([null, null, null]);
  });
  it("lleno, no tiene problemas", () => {
    expect(Object.values(problemasAliada(lleno, [], RUC_CASA)).every((x) => x === null)).toBe(true);
  });
  it("el RUC: dígito verificador, el de CAYLA y uno repetido", () => {
    const mal = RUC.slice(0, 10) + String((Number(RUC[10]) + 1) % 10);
    expect(problemasAliada({ ...lleno, ruc: mal }, [], null).ruc).toMatch(/no es válido/);
    expect(problemasAliada({ ...lleno, ruc: RUC_CASA }, [], RUC_CASA).ruc).toMatch(/CAYLA/);
    expect(problemasAliada(lleno, [RUC], null).ruc).toMatch(/Ya hay/);
    expect(problemasAliada({ ...lleno, ruc: `${RUC.slice(0, 2)} ${RUC.slice(2)}` }, [], null).ruc).toBeNull();
  });
  it("un Nuevo RUS va a una sola tienda; otro régimen puede ir a varias", () => {
    expect(problemasAliada({ ...lleno, sedes: ["tru", "lim"] }, [], null).sedes).toMatch(/un solo local/);
    expect(problemasAliada({ ...lleno, regimen: "mype", sedes: ["tru", "lim"] }, [], null).sedes).toBeNull();
  });
  it("correo y teléfono opcionales, pero si se escriben se revisan", () => {
    expect(problemasAliada({ ...lleno, correo: "no-es-correo" }, [], null).correo).not.toBeNull();
    expect(problemasAliada({ ...lleno, telefono: "abc" }, [], null).telefono).not.toBeNull();
    expect(problemasAliada({ ...lleno, correo: "a@b.pe", telefono: "+51 900 000 000" }, [], null)).toMatchObject({ correo: null, telefono: null });
  });
});

describe("problemaCuenta", () => {
  it("Yape y Plin: 9 dígitos que empiezan con 9", () => {
    expect(problemaCuenta({ id: null, medio: "yape", banco: "", numero: "900 000 010" })).toBeNull();
    expect(problemaCuenta({ id: null, medio: "plin", banco: "", numero: "80000001" })).toMatch(/9 dígitos/);
  });
  it("una cuenta bancaria pide banco y número", () => {
    expect(problemaCuenta({ id: null, medio: "transferencia", banco: "", numero: "191-0000000-0-45" })).toMatch(/banco/);
    expect(problemaCuenta({ id: null, medio: "transferencia", banco: "BCP", numero: "x" })).toMatch(/número/);
    expect(problemaCuenta({ id: null, medio: "transferencia", banco: "BCP", numero: "191-0000000-0-45" })).toBeNull();
  });
  it("una que se quita no se revisa", () => {
    expect(problemaCuenta({ id: "c", medio: "yape", banco: "", numero: "", quitar: true })).toBeNull();
  });
});

describe("camposDeAliada (guía de foco)", () => {
  it("coincide con la validación: se puede confirmar si y solo si no hay problemas", () => {
    const casos: BorradorAliada[] = [
      BORRADOR_ALIADA_VACIO,
      lleno,
      { ...lleno, correo: "mal" },
      { ...lleno, cuentas: [{ id: null, medio: "yape", banco: "", numero: "1" }] },
      { ...lleno, sedes: ["a", "b"] },
      { ...lleno, regimen: null },
    ];
    for (const b of casos) {
      const campos = camposDeAliada(b, [], null);
      const confirma = campos.every((c) => !c.requerido || c.hecho);
      const sinProblemas = Object.values(problemasAliada(b, [], null)).every((x) => x === null);
      expect(confirma).toBe(sinProblemas);
    }
  });
  it("correo, teléfono y cuentas no se piden si están vacíos", () => {
    const opcionales = camposDeAliada(lleno, [], null).filter((c) => ["correo", "telefono", "cuentas"].includes(c.id));
    expect(opcionales.every((c) => !c.requerido)).toBe(true);
  });
});

describe("argsGuardarAliada", () => {
  it("limpia el RUC y los números; una cuenta nueva vacía no viaja; una que existía y se vació se quita", () => {
    const a = argsGuardarAliada({
      ...lleno,
      ruc: `${RUC.slice(0, 2)} ${RUC.slice(2)}`,
      cuentas: [
        { id: null, medio: "yape", banco: "", numero: "900 000 010" },
        { id: null, medio: "plin", banco: "", numero: "" },
        { id: "vieja", medio: "yape", banco: "", numero: "" },
        { id: null, medio: "transferencia", banco: " BCP ", numero: " 191-0000000-0-45 " },
      ],
    });
    expect(a.p_ruc).toBe(RUC);
    expect(a.p_cuentas).toEqual([
      { id: null, medio: "yape", banco: null, numero: "900000010", quitar: false },
      { id: "vieja", medio: "yape", banco: null, numero: "", quitar: true },
      { id: null, medio: "transferencia", banco: "BCP", numero: "191-0000000-0-45", quitar: false },
    ]);
    expect(a.p_correo).toBeNull();
  });
});

describe("leerAliadas y etiquetaCuenta", () => {
  it("lee lo que devuelve la base y descarta lo que no entiende", () => {
    const l = leerAliadas({
      puede_editar: true,
      aliadas: [
        {
          id: "e1",
          clave: "claure",
          nombre: "Claurè",
          ruc: RUC,
          regimen: "nuevo_rus",
          sedes: [{ id: "lim", nombre: "Tienda Lima" }],
          cuentas: [{ id: "c1", medio: "transferencia", nombre: "BCP de Claurè", numero: "191-0000000-0-45", banco: "BCP" }],
        },
        { nombre: "sin id" },
      ],
    });
    expect(l.puedeEditar).toBe(true);
    expect(l.aliadas).toHaveLength(1);
    expect(etiquetaCuenta(l.aliadas[0].cuentas[0])).toBe("BCP ··· 045");
    expect(borradorDeAliada(l.aliadas[0]).sedes).toEqual(["lim"]);
    expect(leerAliadas(null)).toEqual({ puedeEditar: false, aliadas: [] });
  });
  it("un medio desconocido se lee como Yape (el de Claudia nació sin medio)", () => {
    const l = leerAliadas({ aliadas: [{ id: "e", cuentas: [{ id: "c", medio: null, numero: "900000010" }] }] });
    expect(etiquetaCuenta(l.aliadas[0].cuentas[0])).toBe("Yape ··· 010");
  });
  it("el hint de la base dice en qué campo va el error", () => {
    expect(campoDelError("ruc")).toBe("ruc");
    expect(campoDelError("cuenta_ajena")).toBeNull();
  });
});

describe("la baja", () => {
  it("se confirma con el nombre tal cual, sin importar mayúsculas ni espacios de los bordes", () => {
    expect(confirmaLaBaja("Claurè", " claurè ")).toBe(true);
    expect(confirmaLaBaja("Claurè", "Claure")).toBe(false);
    expect(confirmaLaBaja("Claurè", "")).toBe(false);
  });
  it("se aplica 7 días después, también al cruzar de mes", () => {
    expect(diaDeLaBaja("2026-11-21")).toBe("2026-11-28");
    expect(diaDeLaBaja("2026-11-28")).toBe("2026-12-05");
  });
});

describe("la cuenta con cada dueña", () => {
  it("deAliada no toca los textos de CLAURE y nombra a otra aliada por su nombre", () => {
    expect(deAliada("Le debes a CLAURE: lo tiene Claudia", QUIEN_CLAURE)).toBe("Le debes a CLAURE: lo tiene Claudia");
    expect(deAliada("Le debes a CLAURE: lo tiene Claudia", quienDe({ clave: "kids", nombre: "CAYLA KIDS" }))).toBe("Le debes a CAYLA KIDS: lo tiene CAYLA KIDS");
    expect(quienDe({ clave: "claure", nombre: "Claurè" })).toEqual({ nombre: "Claurè", duena: "Claudia" });
  });
  it("conAliada pone el encabezado solo si hay aliada", () => {
    const vistos: [string, string][] = [];
    const c = { setHeader(n: string, v: string) { vistos.push([n, v]); return c; } };
    conAliada(c, null);
    conAliada(c, "e1");
    expect(vistos).toEqual([["x-aliada", "e1"]]);
  });
  it("aliadaDeLaUrl elige la pedida o la primera", () => {
    const l = leerAliadasConCuenta([{ id: "a", clave: "claure", nombre: "CLAURE" }, { id: "b", clave: "kids", nombre: "KIDS" }, { nombre: "x" }]);
    expect(l).toHaveLength(2);
    expect(aliadaDeLaUrl(l, "kids")?.id).toBe("b");
    expect(aliadaDeLaUrl(l, "otra")?.id).toBe("a");
    expect(aliadaDeLaUrl([], null)).toBeNull();
  });
});

describe("conexión con Lucode de una aliada (20261122213000)", () => {
  it("lee lo que trae la base: sin `comprobantes` no se ofrece; sin llave, «sin_llave»", () => {
    expect(leerConexionLucode(null)).toBeNull();
    expect(leerConexionLucode({ estado: null, termina: null, probada_en: null })).toEqual({ estado: "sin_llave", termina: null, probadaEn: null });
    expect(leerConexionLucode({ estado: "conectada", termina: "4F2A", probada_en: "2026-11-22T10:00:00Z" })?.termina).toBe("4F2A");
    expect(leerConexionLucode({ estado: "otra_cosa", termina: "4F2A" })).toEqual({ estado: "sin_llave", termina: null, probadaEn: null });
  });

  it("el chip dice cómo está, con los 4 últimos caracteres y nunca la llave", () => {
    expect(chipLucode({ estado: "conectada", termina: "4F2A", probadaEn: null })).toEqual({ texto: "Lucode conectado · …4F2A", tono: "verde" });
    expect(chipLucode({ estado: "sin_llave", termina: null, probadaEn: null }).tono).toBe("pizarra");
    expect(chipLucode({ estado: "rechazada", termina: "4F2A", probadaEn: null }).tono).toBe("rojo");
  });

  it("una llave mal copiada se dice antes de guardar, con la misma regla de la base (20–500, sin espacios)", () => {
    expect(problemaLlaveLucode("")).toBeNull();
    expect(problemaLlaveLucode("a".repeat(20))).toBeNull();
    expect(problemaLlaveLucode("a".repeat(19))).not.toBeNull();
    expect(problemaLlaveLucode("a".repeat(501))).not.toBeNull();
    expect(problemaLlaveLucode("abc def ghi jkl mno pqr")).not.toBeNull();
  });

  it("la guía: la llave es sugerida solo si todavía no hay una, y mal copiada impide guardar", () => {
    const sinLlave = camposDeComprobantes("", "", false);
    expect(sinLlave.find((c) => c.id === "llave")).toMatchObject({ sugerido: true, requerido: false, hecho: false });
    expect(camposDeComprobantes("", "", true).find((c) => c.id === "llave")?.sugerido).toBe(false);
    expect(camposDeComprobantes("", "corta", true).find((c) => c.id === "llave")?.requerido).toBe(true);
    expect(camposDeComprobantes("Av. Lima 1", "", true).find((c) => c.id === "domicilio")?.hecho).toBe(true);
  });

  it("tras probar: cada respuesta en una frase, y «no respondió» no cambia nada", () => {
    expect(fraseDePrueba("conectada", "produccion")).toBe("Lucode aceptó la llave.");
    expect(fraseDePrueba("conectada", "sandbox")).toContain("de pruebas");
    expect(fraseDePrueba("sin_respuesta", "produccion")).toContain("quedó como estaba");
  });
});

describe("/formidable 2026-11-22: cuentas que no cuentan y la tarjeta que dice qué falta", () => {
  const base = { ...BORRADOR_ALIADA_VACIO, nombre: "Aliada", ruc: "", regimen: null, sedes: [] as string[] };

  it("una cuenta nueva que se abrió y quedó vacía no impide guardar ni viaja", () => {
    const b = { ...base, cuentas: [{ id: null, medio: "yape" as const, banco: "", numero: "" }] };
    expect(cuentaQueNoCuenta(b.cuentas[0])).toBe(true);
    expect(problemasAliada(b, [], null).cuentas).toBeNull();
    expect(argsGuardarAliada(b).p_cuentas).toEqual([]);
  });

  it("la cuenta que ya venía sin número (la de CLAURE) no se pide, no se renombra ni se archiva: no viaja", () => {
    const b = borradorDeAliada({
      id: "a", clave: "claure", nombre: "CLAURE", ruc: null, razonSocial: null, regimen: null, correo: null, telefono: null, sedes: [],
      cuentas: [{ id: "c1", medio: "yape", nombre: "Yape de Claudia · LIM", numero: null, banco: null }],
      bajaEl: null, bajaDetenida: null, entraACampanas: true, domicilioFiscal: null, comprobantes: null,
    });
    expect(b.cuentas[0].sinNumeroDeOrigen).toBe(true);
    expect(problemasAliada(b, [], null).cuentas).toBeNull();
    expect(argsGuardarAliada(b).p_cuentas).toEqual([]);
    // Si le escriben el número, ya cuenta y se guarda como cualquiera.
    const conNumero = { ...b, cuentas: [{ ...b.cuentas[0], numero: "987654321" }] };
    expect(argsGuardarAliada(conNumero).p_cuentas).toHaveLength(1);
    // Quitarla sigue siendo quitarla (archivar).
    const quitada = { ...b, cuentas: [{ ...b.cuentas[0], quitar: true }] };
    expect(argsGuardarAliada(quitada).p_cuentas).toEqual([expect.objectContaining({ id: "c1", quitar: true })]);
  });

  it("una cuenta que tenía número y se vació sí se archiva, como antes", () => {
    const b = { ...base, cuentas: [{ id: "c2", medio: "yape" as const, banco: "", numero: "" }] };
    expect(argsGuardarAliada(b).p_cuentas).toEqual([expect.objectContaining({ id: "c2", quitar: true })]);
  });

  it("la tarjeta dice qué falta, como las de sede", () => {
    expect(fraseDeAliada({ ruc: null, regimen: null, sedes: [{ id: "x", nombre: "Lima" }] })).toBe("Falta RUC y régimen");
    expect(fraseDeAliada({ ruc: null, regimen: null, sedes: [] })).toBe("Falta RUC, régimen y tiendas");
    expect(fraseDeAliada({ ruc: "10000000001", regimen: "nuevo_rus", sedes: [{ id: "x", nombre: "Lima" }] })).toBeNull();
  });

  it("la razón social solo se muestra si dice algo distinto del nombre", () => {
    expect(rotuloDeAliada({ nombre: "Claurè", razonSocial: "CLAURE", ruc: null })).toBeNull();
    expect(rotuloDeAliada({ nombre: "Claurè", razonSocial: "Claudia Ríos Pérez", ruc: "10456789012" })).toBe("Claudia Ríos Pérez · RUC 10456789012");
    expect(rotuloDeAliada({ nombre: "CLAURE", razonSocial: null, ruc: "10456789012" })).toBe("RUC 10456789012");
  });
});
