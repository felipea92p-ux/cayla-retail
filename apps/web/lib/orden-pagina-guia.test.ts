import { describe, expect, it } from "vitest";
import { estadosDe, faltanDe, sePuedeConfirmar, siguienteDe } from "./guia-campos";
import { camposDeAnulacion, camposDeAvance, camposDeCambiarQuien, camposDeCierre, camposDeEditarTela, camposDeSalida, camposDeVuelta } from "./orden-pagina-guia";
import { problemaDeAnulacion } from "./orden-pagina-reglas";
import { problemasFases, type FaseBorrador, type ProveedorServicio, type TarifaDeLista } from "./orden-fases-reglas";

describe("camposDeAvance — la guía coincide con lo que registrar_avance exige", () => {
  // `registrar_avance` rechaza una anotación sin ninguna cantidad (fn_produccion_lineas_cantidad) y exige a alguien que firme (fn_actor_persona_id(true)).
  const laBaseAcepta = (total: number, responsableListo: boolean) => total > 0 && responsableListo;

  it("recorre las combinaciones: «se puede confirmar» es exactamente «la base acepta»", () => {
    for (const total of [0, 1, 48]) for (const responsableListo of [true, false]) expect(sePuedeConfirmar(camposDeAvance({ total, responsableListo })), `${total}/${responsableListo}`).toBe(laBaseAcepta(total, responsableListo));
  });
  it("al abrir la hoja precargada con lo que falta, solo sigue «quién lo anota»", () => {
    const campos = camposDeAvance({ total: 48, responsableListo: false });
    expect(siguienteDe(campos)?.id).toBe("quien");
    expect(estadosDe(campos)).toEqual({ cantidades: "hecho", quien: "ahora" });
  });
  it("si se borra todo, sigue «cuántas» y dice qué hacer", () => {
    const campos = camposDeAvance({ total: 0, responsableListo: true });
    expect(siguienteDe(campos)).toMatchObject({ id: "cantidades", pendiente: "Escribe cuántas terminaste en cada talla y color." });
    expect(faltanDe(camposDeAvance({ total: 0, responsableListo: false })).map((c) => c.id)).toEqual(["cantidades", "quien"]);
  });
});

describe("camposDeCambiarQuien — la guía coincide con lo que la base rechazaría de una fase", () => {
  const HOY = "2026-10-19";
  const PROVEEDORES: ProveedorServicio[] = [
    { id: "p1", nombre: "Confecciones del Norte", rubro: "maquila", activo: true },
    { id: "p2", nombre: "Telas SAC", rubro: "tela", activo: true },
    { id: "p3", nombre: "Cerrado SAC", rubro: "maquila", activo: false },
  ];
  const LISTA: TarifaDeLista[] = [{ proveedorId: "p1", faseClave: "acabado", tarifa: 2, minimo: 100, fijo: 0, vigenteDesde: "2026-01-01" }];
  const base: FaseBorrador = { clave: "acabado", encendida: true, quien: "servicio", proveedorId: null, tarifa: "", fijo: "", minimo: "", fechaPrometida: "", posicion: null };

  it("sin el responsable, la fase es la misma que la de la hoja de Nueva orden: lo que dice problemasFases", () => {
    const casos: FaseBorrador[] = [
      { ...base, quien: "taller" },
      base,
      { ...base, proveedorId: "p1" },
      { ...base, proveedorId: "p1", tarifa: "2.5" },
      { ...base, proveedorId: "p2", tarifa: "2.5" },
      { ...base, proveedorId: "p3", tarifa: "2.5" },
      { ...base, proveedorId: "p1", tarifa: "2,5" },
      { ...base, proveedorId: "p1", tarifa: "2.5", fechaPrometida: "2026-10-01" },
      { ...base, proveedorId: "p1", tarifa: "2.5", fechaPrometida: "2026-10-30" },
    ];
    for (const fase of casos) {
      const faltas = problemasFases([fase], { hoy: HOY, proveedores: PROVEEDORES, lista: LISTA }).map((p) => p.texto);
      for (const responsableListo of [true, false]) {
        expect(sePuedeConfirmar(camposDeCambiarQuien({ faltas, responsableListo })), JSON.stringify(fase)).toBe(faltas.length === 0 && responsableListo);
      }
    }
  });
  it("dice lo primero que falta de la fase, con sus palabras", () => {
    const campos = camposDeCambiarQuien({ faltas: ["Si «Acabado» sale afuera, elige a quién."], responsableListo: true });
    expect(siguienteDe(campos)).toMatchObject({ id: "fase", pendiente: "Si «Acabado» sale afuera, elige a quién." });
    expect(estadosDe(camposDeCambiarQuien({ faltas: [], responsableListo: false }))).toEqual({ fase: "hecho", quien: "ahora" });
  });
});

describe("camposDeSalida — la guía coincide con lo que registrar_salida exige", () => {
  // `registrar_salida` rechaza una salida sin cantidades o con más de lo que puede salir, y exige a alguien que firme.
  const laBaseAcepta = (total: number, excesos: number, responsableListo: boolean) => total > 0 && excesos === 0 && responsableListo;
  it("recorre las combinaciones: «se puede confirmar» es exactamente «la base acepta»", () => {
    for (const total of [0, 8, 48]) for (const excesos of [0, 1]) for (const responsableListo of [true, false]) {
      const campos = camposDeSalida({ total, excesos: Array.from({ length: excesos }, () => "De Negro · M solo puedes mandar 8: escribiste 9."), responsableListo });
      expect(sePuedeConfirmar(campos), `${total}/${excesos}/${responsableListo}`).toBe(laBaseAcepta(total, excesos, responsableListo));
    }
  });
  it("precargada con lo que puede salir, solo sigue «quién lo anota»; si se pasa, dice de cuál talla", () => {
    expect(estadosDe(camposDeSalida({ total: 48, excesos: [], responsableListo: false }))).toEqual({ cantidades: "hecho", quien: "ahora" });
    expect(siguienteDe(camposDeSalida({ total: 50, excesos: ["De Negro · M solo puedes mandar 8: escribiste 9."], responsableListo: true }))).toMatchObject({ id: "cantidades", pendiente: "De Negro · M solo puedes mandar 8: escribiste 9." });
  });
});

describe("camposDeVuelta — la guía coincide con lo que registrar_vuelta exige", () => {
  // `registrar_vuelta` rechaza una vuelta vacía o que pasa de lo que está afuera, segundas o faltantes sin decir qué pasó, y exige a alguien que firme.
  it("recorre las combinaciones: «se puede confirmar» es exactamente «la base acepta»", () => {
    for (const total of [0, 40]) for (const excesos of [0, 1]) for (const hayExcepciones of [true, false]) for (const conMotivo of [true, false]) for (const responsableListo of [true, false]) {
      const campos = camposDeVuelta({ total, excesos: Array.from({ length: excesos }, () => "De Negro · M hay 8 afuera: anotaste 9."), hayExcepciones, conMotivo, responsableListo });
      const acepta = total > 0 && excesos === 0 && (!hayExcepciones || conMotivo) && responsableListo;
      expect(sePuedeConfirmar(campos), `${total}/${excesos}/${hayExcepciones}/${conMotivo}/${responsableListo}`).toBe(acepta);
    }
  });
  it("«qué pasó» solo es un campo cuando hay segundas o faltantes", () => {
    expect(camposDeVuelta({ total: 40, excesos: [], hayExcepciones: false, conMotivo: false, responsableListo: false }).map((c) => c.id)).toEqual(["cantidades", "quien"]);
    expect(camposDeVuelta({ total: 40, excesos: [], hayExcepciones: true, conMotivo: false, responsableListo: false }).map((c) => c.id)).toEqual(["cantidades", "motivo", "quien"]);
  });
  it("con faltantes y sin motivo, sigue «qué pasó» y dice qué hacer", () => {
    const campos = camposDeVuelta({ total: 40, excesos: [], hayExcepciones: true, conMotivo: false, responsableListo: true });
    expect(siguienteDe(campos)).toMatchObject({ id: "motivo", pendiente: "Cuéntanos qué pasó con lo que no volvió bueno." });
  });
});

describe("camposDeAnulacion — la guía coincide con lo que anular_salida y anular_vuelta exigen", () => {
  // Las dos rechazan un motivo vacío (`anular_sin_motivo`) y exigen a alguien que firme (`fn_actor_persona_id(true)`).
  const laBaseAcepta = (motivo: string, responsableListo: boolean) => motivo.trim() !== "" && responsableListo;

  it("recorre las combinaciones: «se puede confirmar» es exactamente «la base acepta»", () => {
    for (const motivo of ["", "   ", "me equivoqué de taller"]) {
      for (const responsableListo of [true, false]) {
        expect(sePuedeConfirmar(camposDeAnulacion({ problema: problemaDeAnulacion(motivo), responsableListo })), `${JSON.stringify(motivo)}/${responsableListo}`).toBe(laBaseAcepta(motivo, responsableListo));
      }
    }
  });
  it("al abrir la hoja sigue «por qué»; con el porqué escrito, «quién lo anota»", () => {
    const sinMotivo = camposDeAnulacion({ problema: problemaDeAnulacion(""), responsableListo: false });
    expect(siguienteDe(sinMotivo)?.id).toBe("motivo");
    expect(faltanDe(sinMotivo).map((f) => f.id)).toEqual(["motivo", "quien"]);
    const conMotivo = camposDeAnulacion({ problema: problemaDeAnulacion("me equivoqué"), responsableListo: false });
    expect(siguienteDe(conMotivo)?.id).toBe("quien");
    expect(estadosDe(conMotivo).motivo).toBe("hecho");
  });
  it("lo que dice la guía de lo que falta es lo mismo que dice la hoja al rechazar", () => {
    expect(camposDeAnulacion({ problema: problemaDeAnulacion(""), responsableListo: true })[0].pendiente).toBe("Cuéntanos por qué se anula.");
  });
});

describe("camposDeCierre — la guía coincide con lo que cerrar_produccion exige", () => {
  // `cerrar_produccion` rechaza más buenas que lo terminado, prendas todavía afuera y ninguna buena; y exige a alguien que firme (`fn_actor_persona_id(true)`).
  const laBaseAcepta = (total: number, problemas: readonly string[], responsableListo: boolean) => total > 0 && problemas.length === 0 && responsableListo;

  it("recorre las combinaciones: «se puede confirmar» es exactamente «la base acepta»", () => {
    for (const total of [0, 1, 48]) {
      for (const problemas of [[], ["No puedes pasar al stock 9 de Negro · 30: en Acabado se terminaron 8."]]) {
        for (const responsableListo of [true, false]) {
          expect(sePuedeConfirmar(camposDeCierre({ total, problemas, responsableListo })), `${total}/${problemas.length}/${responsableListo}`).toBe(laBaseAcepta(total, problemas, responsableListo));
        }
      }
    }
  });
  it("al abrir la hoja precargada con lo terminado, solo sigue «quién lo anota»", () => {
    const campos = camposDeCierre({ total: 48, problemas: [], responsableListo: false });
    expect(siguienteDe(campos)?.id).toBe("quien");
    expect(estadosDe(campos).cantidades).toBe("hecho");
  });
  it("lo que dice la guía de lo que falta es lo que dice la base: el primer problema, o cómo completar", () => {
    expect(camposDeCierre({ total: 9, problemas: ["No puedes pasar al stock 9 de X: en Acabado se terminaron 8."], responsableListo: true })[0].pendiente).toBe("No puedes pasar al stock 9 de X: en Acabado se terminaron 8.");
    expect(camposDeCierre({ total: 0, problemas: [], responsableListo: true })[0].pendiente).toBe("Escribe cuántas salieron buenas en cada talla y color.");
  });
});

describe("camposDeEditarTela — la guía coincide con lo que guardar_insumos_orden acepta", () => {
  // La base acepta una lista válida (`problemasTela` + no quitar lo usado) con alguien que firma. «Sin cambios» no es una falta de la base, pero guardar lo mismo no hace nada: la guía no lo da por hecho.
  const laBaseAcepta = (faltas: readonly string[], hayCambios: boolean, responsableListo: boolean) => faltas.length === 0 && hayCambios && responsableListo;

  it("recorre las combinaciones: «se puede confirmar» es exactamente «hay algo que guardar y la base lo acepta»", () => {
    for (const faltas of [[], ["Escribe cuánto lleva cada prenda de «Lino», por ejemplo 1.200."]]) {
      for (const hayCambios of [true, false]) {
        for (const responsableListo of [true, false]) {
          expect(sePuedeConfirmar(camposDeEditarTela({ faltas, hayCambios, responsableListo })), `${faltas.length}/${hayCambios}/${responsableListo}`).toBe(laBaseAcepta(faltas, hayCambios, responsableListo));
        }
      }
    }
  });
  it("al abrir la hoja sin tocar nada, lo primero que sigue es la lista de tela y avíos", () => {
    const campos = camposDeEditarTela({ faltas: [], hayCambios: false, responsableListo: false });
    expect(siguienteDe(campos)?.id).toBe("tela");
    expect(campos[0].pendiente).toBe("Cambia algo de la tela o de los avíos para guardar.");
  });
  it("con una falta, la guía dice la falta (la misma frase que lee la persona bajo el campo)", () => {
    expect(camposDeEditarTela({ faltas: ["No se quita «Lino»: ya se anotó que se usó en esta orden."], hayCambios: true, responsableListo: true })[0].pendiente).toBe("No se quita «Lino»: ya se anotó que se usó en esta orden.");
  });
  it("con la lista lista y los cambios hechos, solo falta quién lo anota", () => {
    const campos = camposDeEditarTela({ faltas: [], hayCambios: true, responsableListo: false });
    expect(estadosDe(campos).tela).toBe("hecho");
    expect(siguienteDe(campos)?.id).toBe("quien");
  });
});
