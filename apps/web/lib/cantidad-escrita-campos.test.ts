import { readFileSync, readdirSync } from "node:fs";
import { join, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { detalleDeTalla, lineasDeAjuste, limpiarTextoAjuste, textoEscritoInvalido, textoProblemaTalla, textoTrasPaso, type VarianteAjuste } from "./ajuste-reglas";
import { limpiarCantidad, textoCantidadRechazada } from "./alta-producto";
import { REGLA_BILLETES } from "./caja-cierre-reglas";
import { alEntrar, alEscribir, alQuererSeguir, alRechazar, alSalir, enteroEscrito, leerEscrito, problemaEscrito, reglaDeEntero, SIN_ESCRIBIR, textoEnLaCaja, type ReglaCantidad } from "./cantidad-escrita-reglas";
import { cajaDelProblemaCumple, cumpleCompleto, problemaCumple } from "./club-cumple-reglas";
import { cantDelRelleno, REGLA_RELLENO } from "./colgar-varias-tabla";
import { problemaDeDiasAbono, validarTarifa } from "./cuentas-dinero-reglas";
import { cuentaDelDescuento } from "./descuento-cuenta-reglas";
import { leerEscritoDeCelda, REGLA_CELDA_PLANILLA } from "./existencias-ajuste-modelo";
import { errorDeSiguienteNumero } from "./facturacion-comprobantes-reglas";
import { numeroDeMonto, porcentajeMalEscrito } from "./monto-plata-reglas";
import { diaDeFijoValido, diasAntesDeFijoValidos, leerCifraDeFijo, textoPagarDesde, TEXTO_DIA_FIJO, TEXTO_DIAS_ANTES_FIJO, validarFijo, type BorradorFijo } from "./gastos-reglas";
import { leerCantidadDeposito, leerCantidadReposicion, leerCantidadSaldoAFavor, limpiarCantidadReposicion } from "./nos-debe-reglas";
import { lineasDeFallas, problemasDeFallas, totalFallas, type FallaBorrador } from "./orden-pagina-reglas";
import { escribioAlgoQueNoEsCifra, escribirEnCasilla } from "./pedidos-web-reglas";
import { leerDiasParaLlegar, problemaDeLosDias } from "./plan-compra-plazo";
import { problemaDelRecupero } from "./plan-compra-propuesta";
import { escritoNoEsEntero, leerCantidadDelPlan, lineaDeBorrador, problemasDelBorrador, sumaDeLaCurva, type Borrador } from "./plan-compra-reglas";
import { problemasDeLosMinimos } from "./plan-compra-reparto";
import { diasDeLaProforma } from "./proformas-reglas";
import { problemaDePlazoCredito } from "./proveedores-reglas";
import { errorDeReasignacion } from "./reparto-reglas";
import { leerCantidadTecleada, REGLA_CAJITA } from "./reponer-prenda-reglas";
import { moverParametro, parametroFueraDeRango, textoRangoParametro, validarParametrosTiendaWeb, type BorradorParametros } from "./tienda-web-reglas";
import { cantidadAlSalirDeLaLinea, problemaDeCantidadDeLinea } from "./traslado-lineas-reglas";

// Los campos que siguieron a Nuevo producto, Editar producto y Producción (2026-11-03): cada tecla pasaba por `.replace(/\D/g, "")` en un campo controlado, así que la coma se borraba al
// teclearla y el 5 caía junto al 2. «2,5» dejaba 25, «1.5» dejaba 15 y «-5» dejaba 5, sin avisar: en los billetes del cierre de caja, en lo que se cuelga y en un ajuste de stock.
//
// Por eso se teclea DE A UNA LETRA, como la persona: pegar «2,5» de una vez no mostraba el error. Lo que estas pantallas leen como 0 o como otro número no debe llegarles (`parseInt("2,5")` es 2 y
// `parseInt("-5")` es -5 en los billetes; vacío pone todas las tallas en 0 en «Llenar todas con»), y cada campo conserva las cantidades que valían: aquí no cambia ningún tope.

const LOS_MALOS = ["2,5", "1.5", "-5"];

/** Lo que queda en una caja que limpia lo escrito: cada tecla parte de lo que dejó la anterior. */
function enLaCaja(escrito: string, limpiar: (crudo: string) => string): string {
  let caja = "";
  for (const letra of escrito) caja = limpiar(caja + letra);
  return caja;
}

/** Teclea en una caja que usa `useCantidadEscrita`: la caja dibuja lo escrito y la pantalla recibe lo que le llega. */
function teclear(escrito: string, hay: string, regla: ReglaCantidad) {
  let estado = alEntrar(SIN_ESCRIBIR, "c", hay);
  let pantalla = hay;
  // Entrar a la caja selecciona lo que hay: la primera tecla lo reemplaza.
  let caja = "";
  const llego: string[] = [];
  for (const letra of escrito) {
    const r = alEscribir(estado, "c", caja + letra, pantalla, regla);
    estado = r.estado;
    pantalla = r.paraLaPantalla;
    caja = r.estado.escribiendo?.texto ?? "";
    llego.push(pantalla);
  }
  return { estado, pantalla, caja, llego, mientras: problemaEscrito(estado, regla), alSalir: problemaEscrito(alSalir(estado, "c", regla), regla) };
}

describe("Nos debe: «¿Cuántas llegaron?», «¿Cuántas pasan a saldo a favor?» y «¿Cuántas pagó con el depósito?»", () => {
  const lectores = [
    ["Reposición", (t: string) => leerCantidadReposicion(t, 3000)],
    ["Saldo a favor", (t: string) => leerCantidadSaldoAFavor(t, 3000)],
    ["Depósito", (t: string) => leerCantidadDeposito(t, 3000)],
  ] as const;

  for (const [hoja, leer] of lectores) {
    it(`${hoja}: lo que no es una cantidad se queda a la vista, nadie lo cuenta y la hoja dice por qué`, () => {
      for (const malo of [...LOS_MALOS, "2a", "12345"]) {
        const caja = enLaCaja(malo, limpiarCantidadReposicion);
        expect(caja, malo).toBe(malo);
        expect(leer(caja).n, malo).toBeNull();
        expect(leer(caja).problema, malo).toMatch(/solo el número/);
      }
    });
    it(`${hoja}: los miles se siguen juntando y las cantidades de siempre siguen valiendo`, () => {
      expect(leer(limpiarCantidadReposicion("1,200"))).toEqual({ n: 1200, problema: null });
      expect(leer(enLaCaja("1,200", limpiarCantidadReposicion))).toEqual({ n: 1200, problema: null });
      expect(leer(enLaCaja("25", limpiarCantidadReposicion))).toEqual({ n: 25, problema: null });
    });
  }
});

describe("Cerrar caja: la cantidad de cada billete o moneda", () => {
  for (const malo of LOS_MALOS) {
    it(`«${malo}» no le llega a la suma: la caja lo muestra y el billete sigue en lo que tenía`, () => {
      const { pantalla, caja, llego, mientras, alSalir: fuera } = teclear(malo, "3", REGLA_BILLETES);
      expect(caja).toBe(malo);
      expect(pantalla).toBe("3");
      // La suma hace `parseInt(billetes[d]) || 0`: «2,5» daría 2 y «-5» daría -5.
      expect(parseInt(pantalla, 10)).toBe(3);
      expect(llego.at(-1)).toBe("3");
      expect(mientras).toContain(`«${malo}» no es una cantidad`);
      expect(fuera).toContain(`«${malo}» no se guardó`);
    });
  }
  it("en un billete vacío, lo que no vale lo deja vacío", () => {
    for (const malo of LOS_MALOS) expect(teclear(malo, "", REGLA_BILLETES).pantalla, malo).toBe("");
  });
  it("nunca tuvo tope, y sigue sin tenerlo: «12345» y «1,200» valen, y el aviso no inventa un rango", () => {
    expect(teclear("12345", "", REGLA_BILLETES).pantalla).toBe("12345");
    expect(teclear("1,200", "", REGLA_BILLETES).pantalla).toBe("1200");
    expect(REGLA_BILLETES.decir("2,5", true)).not.toMatch(/9999|de 0 a/);
  });
});

describe("Existencias: la cajita de cantidad (colgar, subir, y cada celda de colgar o subir varias)", () => {
  it("lo que no es una cantidad no es ningún número: ni 25, ni 15, ni 5", () => {
    for (const malo of LOS_MALOS) expect(leerCantidadTecleada(malo, 30), malo).toBeNull();
  });
  it("tecleado, la cajita lo muestra y la tabla sigue con lo que tenía", () => {
    for (const malo of LOS_MALOS) {
      const { pantalla, caja, alSalir: fuera } = teclear(malo, "3", REGLA_CAJITA);
      expect(caja, malo).toBe(malo);
      expect(leerCantidadTecleada(pantalla, 30), malo).toBe(3);
      expect(fuera, malo).toContain("no se guardó");
    }
  });
  it("lo que sí es una cantidad sigue recortándose a lo que hay, sea cual sea su largo", () => {
    expect(leerCantidadTecleada("", 4)).toBe(0);
    expect(leerCantidadTecleada("3", 4)).toBe(3);
    expect(leerCantidadTecleada("99", 4)).toBe(4);
    expect(leerCantidadTecleada("12345", 4)).toBe(4);
    expect(leerCantidadTecleada("12345", Number.POSITIVE_INFINITY)).toBe(12345);
    expect(leerCantidadTecleada("1,200", 5000)).toBe(1200);
    expect(teclear("1,200", "", REGLA_CAJITA).pantalla).toBe("1200");
  });
  it("el aviso no inventa un rango: lo que pasa del tope se recorta, no se rechaza", () => {
    expect(REGLA_CAJITA.decir("2,5", false)).not.toMatch(/9999|de 0 a/);
  });
});

describe("Existencias: «Llenar todas con»", () => {
  const tallas = [
    { varianteId: "a", almacenDisponible: 30, pisoDisponible: 0 },
    { varianteId: "b", almacenDisponible: 1, pisoDisponible: 0 },
    { varianteId: "c", almacenDisponible: 0, pisoDisponible: 0 },
  ];
  const antes = { a: 3, b: 1 };
  const llenar = (escrito: string) => {
    let caja = "";
    let cant: Record<string, number> = antes;
    const pasos: Record<string, number>[] = [];
    for (const letra of escrito) {
      caja = limpiarCantidad(caja + letra);
      cant = cantDelRelleno(tallas, caja, antes, "bajar");
      pasos.push(cant);
    }
    return { caja, cant, pasos };
  };

  it("«2,5» no llena con 25: con el 2 llena, con la coma la tabla vuelve a como estaba, y se queda así", () => {
    const { caja, cant, pasos } = llenar("2,5");
    expect(caja).toBe("2,5");
    expect(pasos).toEqual([{ a: 2, b: 1 }, antes, antes]);
    expect(cant).toEqual(antes);
  });
  it("«1.5» y «-5» tampoco: lo que no vale no pone las tallas en 0 ni en otro número", () => {
    for (const malo of ["1.5", "-5"]) expect(llenar(malo).cant, malo).toEqual(antes);
  });
  it("las cantidades de siempre: de 0 a 99, recortadas a lo que hay, y vaciar la caja deja todas en 0", () => {
    expect(llenar("7").cant).toEqual({ a: 7, b: 1 });
    expect(llenar("99").cant).toEqual({ a: 30, b: 1 });
    expect(cantDelRelleno(tallas, "", antes, "bajar")).toEqual({ a: 0, b: 0 });
    expect(REGLA_RELLENO.leer("99")).toBe(99);
    expect(REGLA_RELLENO.leer("100")).toBeNull();
  });
  it("«1,200» se junta y pasa del tope de la caja: no llena nada y dice hasta cuánto (antes el navegador lo cortaba en 1, sin avisar)", () => {
    expect(llenar("1,200").cant).toEqual(antes);
    expect(llenar("1,200").caja).toBe("1200");
    expect(REGLA_RELLENO.decir("1200", true)).toContain("de 0 a 99");
  });
});

describe("Existencias: una cantidad de la planilla de «Ajustar stock»", () => {
  const escrito = (texto: string) => enLaCaja(texto, limpiarCantidad);

  it("lo que no es una cantidad no se fija: al salir, se dice que no se guardó", () => {
    for (const malo of [...LOS_MALOS, "1e3", "0x10"]) {
      expect(leerEscritoDeCelda(escrito(malo), 3), malo).toEqual({ tipo: "rechazo", texto: malo });
      expect(REGLA_CELDA_PLANILLA.decir(malo, true), malo).toContain(`«${malo}» no se guardó`);
    }
  });
  it("lo que sí vale se fija, de 0 a 999, como siempre; vacío o el mismo número no cambian nada", () => {
    expect(leerEscritoDeCelda(escrito("25"), 3)).toEqual({ tipo: "fijar", n: 25 });
    expect(leerEscritoDeCelda(escrito("0"), 3)).toEqual({ tipo: "fijar", n: 0 });
    expect(leerEscritoDeCelda(escrito("999"), 3)).toEqual({ tipo: "fijar", n: 999 });
    expect(leerEscritoDeCelda(escrito("3"), 3)).toEqual({ tipo: "nada" });
    expect(leerEscritoDeCelda("", 3)).toEqual({ tipo: "nada" });
    expect(leerEscritoDeCelda("  ", 3)).toEqual({ tipo: "nada" });
  });
  it("«1,200» se junta y pasa del tope de la celda: se rechaza y dice hasta cuánto (antes se cortaba en 120, sin avisar)", () => {
    expect(leerEscritoDeCelda(limpiarCantidad("1,200"), 3)).toEqual({ tipo: "rechazo", texto: "1200" });
    expect(REGLA_CELDA_PLANILLA.decir("1200", true)).toContain("de 0 a 999");
    expect(leerEscritoDeCelda(escrito("1000"), 3).tipo).toBe("rechazo");
  });
});

describe("Gastos fijos: el día del mes y los días antes", () => {
  const fijo = (c: Partial<BorradorFijo>): BorradorFijo => ({ ubicacion: "empresa", categoria: "luz", descripcion: "Luz", proveedorId: "", comprobante: "factura", monto: "100", variable: false, dia: "10", momento: "dia", diasAntes: "3", ...c });

  it("lo que no es un entero se queda a la vista, no se guarda y dice hasta cuánto llega", () => {
    // `validarFijo` leía con `Number`: la caja borraba lo demás, pero dejándolo pasar, «1e1» sería el día 10 y «0x10» el 16.
    for (const malo of [...LOS_MALOS, "1e1", "0x10", "5.0"]) {
      const caja = enLaCaja(malo, limpiarCantidad);
      expect(caja, malo).toBe(malo);
      expect(validarFijo(fijo({ dia: caja })), malo).toEqual({ ok: false, error: TEXTO_DIA_FIJO });
      expect(validarFijo(fijo({ diasAntes: caja })), malo).toEqual({ ok: false, error: TEXTO_DIAS_ANTES_FIJO });
      expect(diaDeFijoValido(caja), malo).toBe(false);
      expect(diasAntesDeFijoValidos(caja), malo).toBe(false);
    }
  });
  it("«Se paga desde el día…» no se arma con lo que no es un entero", () => {
    expect(textoPagarDesde("dia", leerCifraDeFijo("1e1"), leerCifraDeFijo("2"))).toBeNull();
    expect(textoPagarDesde("dia", leerCifraDeFijo("10"), leerCifraDeFijo("2,5"))).toBeNull();
    expect(textoPagarDesde("dia", leerCifraDeFijo("10"), leerCifraDeFijo("2"))).toBe("desde el día 8");
  });
  it("las cantidades de siempre: el día de 1 a 28, y antes de 0 a 30 (vacío es 0)", () => {
    for (const [dia, vale] of [["1", true], ["28", true], ["0", false], ["29", false], ["", false], ["123", false]] as const) expect(validarFijo(fijo({ dia })).ok, dia).toBe(vale);
    for (const [diasAntes, vale] of [["", true], ["0", true], ["30", true], ["31", false], ["123", false]] as const) expect(validarFijo(fijo({ diasAntes })).ok, diasAntes).toBe(vale);
    expect(validarFijo(fijo({ dia: "7", diasAntes: "" }))).toMatchObject({ ok: true, valor: { p_dia_del_mes: 7, p_dias_antes: 0 } });
    expect(validarFijo(fijo({ dia: "1,200" })).ok).toBe(false);
  });
});

describe("La tarifa de una máquina: en cuántos días deposita", () => {
  const tarifa = (diasAbono: string) => ({ medio: "tarjeta" as const, tasa: "3.5", igvSobreTasa: true, cargoFijo: "", diasAbono });

  it("lo que no es un entero se queda a la vista, no se guarda y dice hasta cuánto llega", () => {
    for (const malo of [...LOS_MALOS, "1e1", "123"]) {
      const caja = enLaCaja(malo, limpiarCantidad);
      expect(caja, malo).toBe(malo);
      expect(problemaDeDiasAbono(caja), malo).toContain("de 0 a 15");
      expect(validarTarifa(tarifa(caja), "m").ok, malo).toBe(false);
    }
  });
  it("las cantidades de siempre, de 0 a 15", () => {
    for (const [dias, vale] of [["0", true], ["2", true], ["15", true], ["16", false], ["", false]] as const) {
      expect(problemaDeDiasAbono(dias) === null, dias).toBe(vale);
      expect(validarTarifa(tarifa(dias), "m").ok, dias).toBe(vale);
    }
  });
});

describe("Prendas con falla: cuántas", () => {
  const faltan = { v: 10 };
  const nombreDe = () => "Negro S";
  const filas = (cantidad: string): FallaBorrador[] => [{ varianteId: "v", cantidad, destino: "arreglo" }];

  it("lo que no es un entero se queda a la vista, no se anota y la hoja dice por qué", () => {
    // Las reglas leen como 0 lo que no entienden: lo que evita que esa falla se vaya sin avisar es que este problema frena «Anotar».
    for (const malo of LOS_MALOS) {
      const caja = enLaCaja(malo, limpiarCantidad);
      expect(caja, malo).toBe(malo);
      expect(problemasDeFallas(faltan, {}, filas(caja), "Mancha", nombreDe), malo).toEqual([`«${malo}» no es una cantidad: escribe un número entero.`]);
      expect(lineasDeFallas(filas(caja), "Mancha"), malo).toEqual([]);
      expect(totalFallas(filas(caja)), malo).toBe(0);
    }
  });
  it("lo de siempre no cambia: vacía pide el número, y lo que pasa de lo que falta lo dice", () => {
    expect(problemasDeFallas(faltan, {}, filas(""), "Mancha", nombreDe)).toEqual(["Escribe cuántas con falla hay en Negro S."]);
    expect(problemasDeFallas(faltan, {}, filas("2"), "Mancha", nombreDe)).toEqual([]);
    expect(problemasDeFallas(faltan, {}, filas(limpiarCantidad("1,200")), "Mancha", nombreDe)[0]).toContain("anotaste 1200");
  });
});

describe("Plan de compra: una cantidad que se escribe", () => {
  it("lo que no es un entero no se fija: «1.5» no se redondea a 2 ni «-5» baja a 0", () => {
    for (const malo of [...LOS_MALOS, "1e3", "0x10"]) {
      const r = leerCantidadDelPlan(enLaCaja(malo, limpiarCantidad), 3, 100000);
      expect(r.tipo, malo).toBe("rechazo");
      expect(r.tipo === "rechazo" && r.aviso, malo).toContain(`«${malo}» no se guardó`);
      expect(r.tipo === "rechazo" && r.aviso, malo).not.toMatch(/de 0 a/);
    }
  });
  it("lo que sí vale se fija, y lo que pasa del tope se recorta como con el «+»; vacío o el mismo número no cambian nada", () => {
    expect(leerCantidadDelPlan("25", 3, 100000)).toEqual({ tipo: "fijar", n: 25 });
    expect(leerCantidadDelPlan("0", 3, 100000)).toEqual({ tipo: "fijar", n: 0 });
    expect(leerCantidadDelPlan("150", 3, 100)).toEqual({ tipo: "fijar", n: 100 });
    expect(leerCantidadDelPlan("1234567", 3, 100000)).toEqual({ tipo: "fijar", n: 100000 });
    expect(leerCantidadDelPlan(limpiarCantidad("1,200"), 3, 100000)).toEqual({ tipo: "fijar", n: 1200 });
    expect(leerCantidadDelPlan("3", 3, 100000)).toEqual({ tipo: "nada" });
    expect(leerCantidadDelPlan("150", 100, 100)).toEqual({ tipo: "nada" });
    expect(leerCantidadDelPlan("", 3, 100000)).toEqual({ tipo: "nada" });
  });
});

describe("Plan de compra: «Lo que sobra» y el mínimo de cada tienda", () => {
  it("lo que no es un entero se queda a la vista y dice por qué", () => {
    for (const malo of LOS_MALOS) {
      const caja = enLaCaja(malo, limpiarCantidad);
      expect(caja, malo).toBe(malo);
      expect(problemaDelRecupero(caja), malo).toContain("de 0 a 100");
      expect(problemasDeLosMinimos({ t: caja }).porTienda.t, malo).toContain("De 1 a 90");
    }
  });
  it("las cantidades de siempre", () => {
    for (const [t, vale] of [["0", true], ["100", true], ["101", false], ["1200", false]] as const) expect(problemaDelRecupero(t) === null, t).toBe(vale);
    for (const [t, vale] of [["", true], ["1", true], ["90", true], ["0", false], ["91", false], ["1200", false]] as const) expect(problemasDeLosMinimos({ t }).porTienda.t === undefined, t).toBe(vale);
  });
});

describe("Plan de compra: los días para llegar a las tiendas", () => {
  it("lo que no es un entero se queda a la vista, no se lee como otro número y dice por qué", () => {
    for (const malo of [...LOS_MALOS, "1e1", "1000"]) {
      const caja = enLaCaja(malo, limpiarCantidad);
      expect(caja, malo).toBe(malo);
      expect(leerDiasParaLlegar(caja), malo).toBeNull();
      expect(problemaDeLosDias(caja), malo).toBe(`«${malo}» no es una cantidad: escribe un número entero, de 1 a 365.`);
    }
    // Pegado: antes «14 días» pasaba como 14 porque se borraban las letras. Lo que no es solo un número se dice.
    expect(leerDiasParaLlegar(limpiarCantidad("14 días"))).toBeNull();
  });
  it("las cantidades de siempre: de 1 a 365, y vacío pide el número", () => {
    for (const [t, n] of [["1", 1], ["14", 14], ["365", 365], ["0", null], ["366", null], ["", null]] as const) expect(leerDiasParaLlegar(t), t).toBe(n);
    expect(problemaDeLosDias("14")).toBeNull();
    expect(problemaDeLosDias("")).toContain("Escribe cuántos días");
    expect(leerDiasParaLlegar(limpiarCantidad("1,200"))).toBeNull();
  });
});

describe("Tienda web: los plazos del reloj del pedido", () => {
  const base: BorradorParametros = { horasParaConfirmar: "24", horasAvisoSinPagar: "48", diasAvisoSinRecoger: "7", quedanPocasDesde: "2" };
  const claves = ["horasParaConfirmar", "horasAvisoSinPagar", "diasAvisoSinRecoger"] as const;

  it("lo que no es un entero se queda a la vista, se marca y no se guarda", () => {
    for (const malo of [...LOS_MALOS, "1e1"]) {
      const caja = enLaCaja(malo, limpiarCantidad);
      expect(caja, malo).toBe(malo);
      for (const clave of claves) {
        expect(parametroFueraDeRango(clave, caja), malo).toBe(true);
        expect(validarParametrosTiendaWeb({ ...base, [clave]: caja }).ok, malo).toBe(false);
      }
    }
  });
  it("el paso dice hasta dónde llega su plazo", () => {
    expect(textoRangoParametro("horasParaConfirmar")).toBe("Un número entero, de 1 a 168");
    expect(textoRangoParametro("horasAvisoSinPagar")).toBe("Un número entero, de 1 a 720");
    expect(textoRangoParametro("diasAvisoSinRecoger")).toBe("Un número entero, de 1 a 60");
  });
  it("«−» y «+» parten de lo más bajo si lo escrito no es un número: «2,5» no es 25", () => {
    expect(moverParametro("horasParaConfirmar", "2,5", 1)).toBe("2");
    expect(moverParametro("horasParaConfirmar", "1e1", -1)).toBe("1");
  });
  it("las cantidades de siempre", () => {
    expect(validarParametrosTiendaWeb(base).ok).toBe(true);
    for (const [clave, tope] of [["horasParaConfirmar", 168], ["horasAvisoSinPagar", 720], ["diasAvisoSinRecoger", 60]] as const) {
      expect(parametroFueraDeRango(clave, "1"), clave).toBe(false);
      expect(parametroFueraDeRango(clave, String(tope)), clave).toBe(false);
      expect(parametroFueraDeRango(clave, String(tope + 1)), clave).toBe(true);
      expect(parametroFueraDeRango(clave, "0"), clave).toBe(true);
    }
    expect(parametroFueraDeRango("horasParaConfirmar", limpiarCantidad("1,200"))).toBe(true);
  });
});

describe("Plan de compra: los escenarios, lo que sobre y la curva de una categoría", () => {
  const b = (c: Partial<Borrador> = {}): Borrador => ({ flojo: "10", normal: "20", bueno: "30", precio: "50", costo: "20", recupero: "30", curva: {}, ...c });
  const tallas = [
    { id: "s", valor: "S" },
    { id: "m", valor: "M" },
  ];

  it("«2,5» en un escenario no son 25 prendas: se queda a la vista, dice por qué y no se calcula nada", () => {
    for (const malo of [...LOS_MALOS, "1e3"]) {
      const caja = enLaCaja(malo, limpiarCantidad);
      expect(caja, malo).toBe(malo);
      expect(escritoNoEsEntero(caja), malo).toBe(true);
      for (const k of ["flojo", "normal", "bueno"] as const) {
        expect(problemasDelBorrador(b({ [k]: caja }), [])[k], malo).toBe(`«${malo}» no es una cantidad: escribe un número entero.`);
        expect(lineaDeBorrador(b({ [k]: caja }), []), malo).toBeNull();
      }
      expect(problemasDelBorrador(b({ recupero: caja }), []).recupero, malo).toBe(`«${malo}» no es una cantidad: escribe un número entero, de 0 a 100.`);
      expect(lineaDeBorrador(b({ recupero: caja }), []), malo).toBeNull();
    }
  });
  it("la curva: lo que no es un entero no suma, ni como 25 ni como 10 («1e1»), y la hoja dice por qué", () => {
    for (const malo of [...LOS_MALOS, "1e1"]) {
      const curva = { s: enLaCaja(malo, limpiarCantidad), m: "50" };
      expect(curva.s, malo).toBe(malo);
      expect(problemasDelBorrador(b({ curva }), tallas).curva, malo).toBe("Cada talla lleva un porcentaje entero de 0 a 100.");
      expect(sumaDeLaCurva(curva, tallas), malo).toBe(50);
    }
  });
  it("lo de siempre: vacía pide el número, los topes y el orden no cambian, y los miles se siguen juntando", () => {
    expect(escritoNoEsEntero("")).toBe(false);
    expect(escritoNoEsEntero("12")).toBe(false);
    expect(problemasDelBorrador(b({ flojo: "" }), []).flojo).toBe("Escribe cuántas venderías si la campaña va floja (puede ser 0).");
    expect(problemasDelBorrador(b({ normal: "" }), []).normal).toBe("Escribe cuántas venderías si la campaña va normal.");
    expect(problemasDelBorrador(b({ bueno: "" }), []).bueno).toBe("Escribe cuántas venderías si la campaña va buena.");
    expect(problemasDelBorrador(b({ flojo: "0" }), []).flojo).toBeUndefined();
    expect(problemasDelBorrador(b({ flojo: "100001", normal: "100001", bueno: "100001" }), []).flojo).toContain("Revisa el número");
    expect(problemasDelBorrador(b({ normal: "5" }), []).normal).toBe("El normal no puede ser menos que el flojo.");
    expect(problemasDelBorrador(b({ recupero: "" }), []).recupero).toBe("Escribe a qué % del precio vendes lo que sobre (de 0 a 100).");
    expect(problemasDelBorrador(b({ recupero: "101" }), []).recupero).toBe("Escribe a qué % del precio vendes lo que sobre (de 0 a 100).");
    expect(problemasDelBorrador(b({ recupero: "100" }), []).recupero).toBeUndefined();
    expect(problemasDelBorrador(b({ curva: { s: "50", m: "50" } }), tallas).curva).toBeUndefined();
    expect(sumaDeLaCurva({ s: "50", m: "30" }, tallas)).toBe(80);
    expect(sumaDeLaCurva({}, tallas)).toBe(0);
    expect(problemasDelBorrador(b({ flojo: limpiarCantidad("1,200"), normal: "2000", bueno: "3000" }), []).flojo).toBeUndefined();
  });
});

describe("El cumpleaños del club: el día y el año", () => {
  it("lo que no es un día se queda a la vista y lo dice, esté o no el mes: «2,5» no es el 25, ni «1e1» el 10", () => {
    for (const malo of [...LOS_MALOS, "1e1", "0x10", "123"]) {
      const caja = enLaCaja(malo, limpiarCantidad);
      expect(caja, malo).toBe(malo);
      for (const mes of ["3", ""]) expect(problemaCumple({ dia: caja, mes, anio: "" }, 2026), malo).toBe("El día es un número entero, del 1 al 31.");
      expect(cumpleCompleto({ dia: caja, mes: "3", anio: "" }, 2026), malo).toBe(false);
      expect(cajaDelProblemaCumple({ dia: caja, mes: "3", anio: "" }, 2026), malo).toBe("dia");
    }
  });
  it("el año va con sus 4 cifras: «19905» no se corta en 1990", () => {
    for (const malo of [...LOS_MALOS, "1e3", "19905"]) {
      expect(problemaCumple({ dia: "14", mes: "3", anio: enLaCaja(malo, limpiarCantidad) }, 2026), malo).toBe("El año va con sus 4 cifras (o déjalo vacío).");
    }
  });
  it("lo de siempre: el día que el mes no tiene, y lo que sí vale", () => {
    expect(problemaCumple({ dia: "14", mes: "3", anio: "" }, 2026)).toBeNull();
    expect(problemaCumple({ dia: "08", mes: "3", anio: "1990" }, 2026)).toBeNull();
    expect(problemaCumple({ dia: "31", mes: "4", anio: "" }, 2026)).toBe("Abril no tiene día 31.");
    expect(problemaCumple({ dia: "0", mes: "3", anio: "" }, 2026)).toBe("Marzo no tiene día 0.");
    expect(problemaCumple({ dia: "14", mes: "", anio: "" }, 2026)).toBe("Falta el mes de su cumpleaños.");
  });
});

describe("Ajustar inventario: lo que se escribe en cada talla (mueve stock)", () => {
  const talla = { varianteId: "v", sku: "X", talla: "M", color: null, stockPiso: 0, stockAlmacen: 5, stockSinDividir: 5, apartadoPiso: 0, apartadoAlmacen: 0, apartadoSinDividir: 0, sinHistoria: false } as VarianteAjuste;
  const lineas = (texto: string, modo: "diferencia" | "contado") => lineasDeAjuste([talla], { v: texto }, "almacen", modo);

  it("«2,5» no ajusta 25 ni «1.5» ajusta 15: se quedan a la vista, nadie los cuenta y la fila dice por qué", () => {
    for (const malo of ["2,5", "1.5", "1e1", "0x10", "a4", "1-2"]) {
      const caja = enLaCaja(malo, limpiarTextoAjuste);
      expect(caja, malo).toBe(malo);
      for (const modo of ["diferencia", "contado"] as const) expect(lineas(caja, modo), malo).toEqual([]);
      expect(textoEscritoInvalido(caja), malo).toBe(`«${malo}» no es una cantidad: escribe un número entero.`);
    }
  });
  it("«-5» al sumar o restar es restar 5; al contar no se vuelve 5: dice que lo contado no puede ser negativo", () => {
    expect(enLaCaja("-5", limpiarTextoAjuste)).toBe("-5");
    expect(textoEscritoInvalido("-5")).toBeNull();
    expect(lineas("-5", "diferencia")).toMatchObject([{ delta: -5, resultado: 0 }]);
    const [contado] = lineas("-5", "contado");
    expect(contado).toMatchObject({ resultado: -5 });
    expect(textoProblemaTalla(contado!, "contado")).toBe("Lo contado no puede ser negativo.");
  });
  it("lo de siempre: el menos de un teclado en español, el «+» adelante, los miles y el «-» con que empieza una resta", () => {
    expect(limpiarTextoAjuste("−3")).toBe("-3");
    expect(limpiarTextoAjuste("–3")).toBe("-3");
    expect(limpiarTextoAjuste("+2")).toBe("2");
    expect(limpiarTextoAjuste("1,200")).toBe("1200");
    expect(limpiarTextoAjuste("-1,200")).toBe("-1200");
    expect(enLaCaja("-12", limpiarTextoAjuste)).toBe("-12");
    expect(limpiarTextoAjuste("-")).toBe("-");
    for (const bien of ["", "-", "0", "12", "-12"]) expect(textoEscritoInvalido(bien), bien).toBeNull();
    expect(lineas("3", "diferencia")).toMatchObject([{ delta: 3, resultado: 8 }]);
    expect(lineas("3", "contado")).toMatchObject([{ delta: -2, resultado: 3 }]);
  });
  it("«+» y «−» no parten de lo que no es un entero: «1e1» no es 10", () => {
    expect(textoTrasPaso("1e1", 1, "diferencia", 5, -5)).toBe("1");
    expect(textoTrasPaso("2,5", 1, "contado", 5, 0)).toBe("6");
    expect(textoTrasPaso("3", 1, "diferencia", 5, -5)).toBe("4");
  });
  it("«Coincide con el sistema» tampoco se lee mal: «5e0» no es lo contado", () => {
    const detalle = (texto: string) => detalleDeTalla({ variante: talla, linea: lineas(texto, "contado")[0], texto, modo: "contado", lugar: "almacen", ubicado: "almacen", separaPisoAlmacen: true, puedeBajarAlPiso: true });
    expect(detalle("5")).toContain("Coincide con el sistema");
    expect(detalle("5e0")).not.toContain("Coincide");
  });
});

// Las cajas `type="number"` (medido tecleando, 2026-11-03): el navegador no deja entrar la coma, así que «2,5» quedaba 25; lo que tampoco entiende le llega vacío a la pantalla, así que «-5» quedaba 1 o 0.
describe("Una caja que guarda un número: a la pantalla solo le llega una cantidad de verdad", () => {
  const regla = reglaDeEntero();
  /** Lo que hacen Devoluciones y Cambios con lo que les llega: de 1 a lo que queda. */
  const enDevoluciones = (t: string, quedan: number) => Math.max(1, Math.min(quedan, enteroEscrito(t) || 1));

  it("«2,5», «1.5» y «-5» no le llegan: la caja los muestra, la pantalla sigue con lo que tenía y se dice por qué", () => {
    for (const malo of LOS_MALOS) {
      const { pantalla, caja, mientras, alSalir: fuera } = teclear(malo, "3", regla);
      expect(caja, malo).toBe(malo);
      expect(pantalla, malo).toBe("3");
      expect(enDevoluciones(pantalla, 40), malo).toBe(3);
      expect(mientras, malo).toContain(`«${malo}» no es una cantidad`);
      expect(fuera, malo).toContain(`«${malo}» no se guardó`);
    }
  });
  it("lo de siempre: lo que pasa del tope se recorta, y vaciar la caja no deja de llegar", () => {
    expect(enDevoluciones(teclear("25", "3", regla).pantalla, 40)).toBe(25);
    expect(enDevoluciones(teclear("99", "3", regla).pantalla, 40)).toBe(40);
    expect(enDevoluciones(teclear("1,200", "3", regla).pantalla, 2000)).toBe(1200);
    expect(alEscribir(alEntrar(SIN_ESCRIBIR, "c", "3"), "c", "", "3", regla).paraLaPantalla).toBe("");
    expect(enDevoluciones("", 40)).toBe(1);
  });
  it("lo que pasa del tope se ve recortado en la caja, como lo deja la pantalla; lo que no es un número, tal cual", () => {
    expect(textoEnLaCaja("99", 40)).toBe("40");
    expect(textoEnLaCaja("40", 40)).toBe("40");
    expect(textoEnLaCaja("7", 40)).toBe("7");
    expect(textoEnLaCaja("", 40)).toBe("");
    expect(textoEnLaCaja("2,5", 1)).toBe("2,5");
    expect(textoEnLaCaja("99")).toBe("99");
  });
  it("el lector de las cajas que guardan texto: solo un entero, vacía tampoco; ni `Number` («1e1» es 10) ni `Math.floor` («1.5» es 1)", () => {
    for (const malo of [...LOS_MALOS, "1e1", "0x10", "", " ", "a4"]) expect(enteroEscrito(malo), malo).toBeNull();
    expect(enteroEscrito("7")).toBe(7);
    expect(enteroEscrito(" 007 ")).toBe(7);
    expect(enteroEscrito("0")).toBe(0);
  });
});

describe("Los porcentajes de descuento de Vender y Apartados aceptan decimales: «2,5» es 2.5, no 25", () => {
  const form = (pct: string) => ({ modo: "porcentaje" as const, pct, monto: "", elegidas: null, razon: "", razonOtro: "", argumento: "" });

  it("la coma y el punto dicen lo mismo: el número que se escribió", () => {
    expect(numeroDeMonto("2,5")).toBe(2.5);
    expect(numeroDeMonto("1.5")).toBe(1.5);
    expect(cuentaDelDescuento(form("2,5"), [], null)).toMatchObject({ pct: 2.5, valorValido: true });
    expect(cuentaDelDescuento(form("1.5"), [], null)).toMatchObject({ pct: 1.5, valorValido: true });
    expect(cuentaDelDescuento(form("15"), [], null)).toMatchObject({ pct: 15, valorValido: true });
    expect(porcentajeMalEscrito("2,5")).toBe(false);
  });
  it("lo que no es un porcentaje se marca, no se aplica y se dice por qué", () => {
    for (const malo of ["-5", "0", "101", "1e1", "a4", "1,200"]) {
      expect(porcentajeMalEscrito(malo), malo).toBe(true);
      expect(cuentaDelDescuento(form(malo), [], null).valorValido, malo).toBe(false);
      expect(cuentaDelDescuento(form(malo), [], null).motivoDescuento, malo).toBe("Elige un porcentaje entre 1 y 100.");
    }
  });
  it("vacío todavía no está mal: lo pide la guía", () => {
    expect(porcentajeMalEscrito("")).toBe(false);
    expect(cuentaDelDescuento(form(""), [], null).valorValido).toBe(false);
  });
});

describe("Las cajas que guardan texto y leían suelto", () => {
  it("Reasignar reparto y Cerrar faltante: «1.5» no es 1, ni «1e1» es 10", () => {
    const base = { desdeId: "a", haciaId: "b", pendienteDesde: 30, nombreDesde: "Lima", motivo: "otro" as const, nota: "x" };
    for (const malo of [...LOS_MALOS, "1e1", ""]) {
      const n = enteroEscrito(malo) ?? Number.NaN;
      expect(errorDeReasignacion({ ...base, cantidad: n }), malo).toContain("entero entre 1 y 30");
    }
    expect(errorDeReasignacion({ ...base, cantidad: enteroEscrito("12") ?? Number.NaN })).toBeNull();
    expect(errorDeReasignacion({ ...base, cantidad: enteroEscrito(limpiarCantidad("1,200")) ?? Number.NaN })).toContain("entero entre 1 y 30");
  });
  it("Mover mercadería: al salir, lo que no es un entero se queda a la vista y se dice; no se vuelve 1", () => {
    for (const malo of [...LOS_MALOS, "1e1", "a4"]) {
      expect(cantidadAlSalirDeLaLinea(enLaCaja(malo, limpiarCantidad), 10), malo).toBe(malo);
      expect(problemaDeCantidadDeLinea(malo), malo).toBe(`«${malo}» no es una cantidad: escribe un número entero.`);
    }
  });
  it("Mover mercadería, lo de siempre: entre 1 y el tope, y vacía vuelve a 1", () => {
    expect(cantidadAlSalirDeLaLinea("5", 10)).toBe("5");
    expect(cantidadAlSalirDeLaLinea("99", 10)).toBe("10");
    expect(cantidadAlSalirDeLaLinea("0", 10)).toBe("1");
    expect(cantidadAlSalirDeLaLinea("", 10)).toBe("1");
    expect(cantidadAlSalirDeLaLinea("5", 0)).toBe("1");
    expect(cantidadAlSalirDeLaLinea(limpiarCantidad("1,200"), 2000)).toBe("1200");
    for (const bien of ["", "5"]) expect(problemaDeCantidadDeLinea(bien), bien).toBeNull();
  });
  it("Los días de una proforma: lo que no es un entero no se vuelve 7 ni 25", () => {
    for (const malo of [...LOS_MALOS, "1e1"]) expect(diasDeLaProforma(enLaCaja(malo, limpiarCantidad)), malo).toBeNull();
  });
  it("Los días de una proforma, lo de siempre: vacío o 0 son 7, y hasta 60", () => {
    for (const [t, n] of [["", 7], ["0", 7], ["1", 1], ["30", 30], ["60", 60], ["61", 60], ["1200", 60]] as const) expect(diasDeLaProforma(t), t).toBe(n);
  });
  it("El próximo número de una serie: un entero, 1 o mayor; vacío lo lleva el sistema", () => {
    for (const malo of [...LOS_MALOS, "1e1", "0"]) expect(errorDeSiguienteNumero(enLaCaja(malo, limpiarCantidad)), malo).toContain("entero");
    for (const bien of ["", "1", "1200"]) expect(errorDeSiguienteNumero(bien), bien).toBeNull();
    expect(errorDeSiguienteNumero(limpiarCantidad("1,200"))).toBeNull();
  });
  it("El plazo de crédito de un proveedor: días enteros, 1 o mayor (lo mismo que exige la base); vacío es sin definir", () => {
    for (const malo of [...LOS_MALOS, "1e1", "0"]) expect(problemaDePlazoCredito(enLaCaja(malo, limpiarCantidad)), malo).toContain("entero");
    for (const bien of ["", "1", "20", "120"]) expect(problemaDePlazoCredito(bien), bien).toBeNull();
  });
});

describe("La regla de cada campo: `useCantidadEscrita` no decide qué cantidades valen", () => {
  it("sin regla es la de una celda de stock, de 0 a 9999, con su aviso de siempre", () => {
    expect(alEscribir(alEntrar(SIN_ESCRIBIR, "c", "3"), "c", "12345", "3").paraLaPantalla).toBe("3");
    expect(alEscribir(alEntrar(SIN_ESCRIBIR, "c", "3"), "c", "9999", "3").paraLaPantalla).toBe("9999");
    expect(reglaDeEntero(4).decir("2,5", true)).toBe(textoCantidadRechazada("2,5", true));
    expect(reglaDeEntero(4).decir("2,5", false)).toBe(textoCantidadRechazada("2,5", false));
  });
  it("con tope: hasta sus cifras, y el aviso lo dice", () => {
    expect(reglaDeEntero(2).leer("99")).toBe(99);
    expect(reglaDeEntero(2).leer("100")).toBeNull();
    expect(reglaDeEntero(3).decir("2,5", false)).toContain("de 0 a 999");
  });
  it("sin tope: cualquier entero; vacío es 0, como en una celda; y nada de signos, decimales ni notación", () => {
    const libre = reglaDeEntero();
    expect(libre.leer("")).toBe(0);
    expect(libre.leer(" 7 ")).toBe(7);
    expect(libre.leer("007")).toBe(7);
    expect(libre.leer("1234567")).toBe(1234567);
    for (const malo of ["2,5", "1.5", "-5", "+5", "1e3", "0x10", "abc", "١٢", "½", "12 34"]) expect(libre.leer(malo), malo).toBeNull();
  });
  it("«Llenar todas con» dice lo suyo aunque la caja de al lado tenga otra regla", () => {
    expect(problemaEscrito(alRechazar("1200", REGLA_RELLENO), REGLA_CAJITA)).toContain("de 0 a 99");
  });
  it("una caja que fija su número al salir: vacía o con el mismo número no cambia nada, y lo que no vale se rechaza", () => {
    const libre = reglaDeEntero();
    expect(leerEscrito("7", 3, libre)).toEqual({ tipo: "fijar", n: 7 });
    expect(leerEscrito("3", 3, libre)).toEqual({ tipo: "nada" });
    expect(leerEscrito(" ", 3, libre)).toEqual({ tipo: "nada" });
    expect(leerEscrito(" 2,5 ", 3, libre)).toEqual({ tipo: "rechazo", texto: "2,5" });
  });
});

describe("El botón que sigue no se lleva lo que se acaba de rechazar (cerrar la caja, colgar: mueven plata y prendas)", () => {
  const regla: ReglaCantidad = { leer: (t) => (/^\d*$/.test(t) ? Number(t) : null), decir: (escrito) => `«${escrito}» no se guardó` };

  it("con el cursor en la caja y algo que no vale (Enter), no sigue, las veces que sea", () => {
    const { estado } = teclear("2,5", "3", regla);
    const uno = alQuererSeguir(estado, regla);
    expect(uno.frena).toBe(true);
    expect(alQuererSeguir(uno.estado, regla).frena).toBe(true);
  });
  it("con el clic: ese mismo clic se llevó el cursor y el aviso sale recién ahí. Frena una vez, para que se lea, y el segundo clic sigue", () => {
    const fuera = alSalir(teclear("2,5", "3", regla).estado, "c", regla);
    const uno = alQuererSeguir(fuera, regla);
    expect(uno.frena).toBe(true);
    expect(problemaEscrito(uno.estado, regla)).toContain("no se guardó");
    expect(alQuererSeguir(uno.estado, regla).frena).toBe(false);
  });
  it("lo de «Llenar todas con» frena igual", () => {
    expect(alQuererSeguir(alRechazar("2,5", REGLA_RELLENO), regla).frena).toBe(true);
  });
  it("sin nada rechazado, nunca frena", () => {
    expect(alQuererSeguir(SIN_ESCRIBIR, regla).frena).toBe(false);
    expect(alQuererSeguir(teclear("25", "3", regla).estado, regla).frena).toBe(false);
    expect(alQuererSeguir(alSalir(teclear("25", "3", regla).estado, "c", regla), regla).frena).toBe(false);
  });
  it("corregir lo escrito calla el freno", () => {
    const fuera = alSalir(teclear("2,5", "3", regla).estado, "c", regla);
    const corregido = alEscribir(alEntrar(fuera, "c", "3"), "c", "4", "3", regla).estado;
    expect(alQuererSeguir(corregido, regla).frena).toBe(false);
  });
});

describe("El código de recojo no es una cantidad: se lee igual, y se dice «solo cifras»", () => {
  /** Teclea de casilla en casilla, como `CodigoEnCasillas`: cada tecla entra en la casilla donde quedó el cursor. */
  const enCasillas = (escrito: string) => {
    let valor = "";
    let cursor = 0;
    let avisa = false;
    for (const letra of escrito) {
      const r = escribirEnCasilla(valor, cursor, letra);
      avisa = escribioAlgoQueNoEsCifra(letra, r.valor);
      valor = r.valor;
      cursor = r.cursor;
    }
    return { valor, avisa };
  };

  it("la coma no entra, y se dice cuando se teclea", () => {
    expect(enCasillas("2,")).toEqual({ valor: "2", avisa: true });
    expect(enCasillas("-")).toEqual({ valor: "", avisa: true });
    expect(enCasillas("1.")).toEqual({ valor: "1", avisa: true });
  });
  it("la siguiente cifra calla el aviso, y lo tecleado se lee como siempre", () => {
    expect(enCasillas("2,5")).toEqual({ valor: "25", avisa: false });
    expect(enCasillas("2094")).toEqual({ valor: "2094", avisa: false });
  });
  it("un guion o un espacio dictado no molesta si el código queda completo: «20 94» pegado entero no necesita explicación", () => {
    expect(escribioAlgoQueNoEsCifra("20 94", "2094")).toBe(false);
    expect(escribioAlgoQueNoEsCifra("2-0-9-4", "2094")).toBe(false);
    expect(escribioAlgoQueNoEsCifra("20 9", "209")).toBe(true);
    expect(escribioAlgoQueNoEsCifra("abc", "")).toBe(true);
  });
  it("borrar no es escribir algo que no es cifra", () => {
    expect(escribioAlgoQueNoEsCifra("", "20")).toBe(false);
    expect(escribioAlgoQueNoEsCifra("5", "205")).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------
// El candado: que no aparezca el siguiente
// ---------------------------------------------------------------------------------------------------------------------------------
// Mismo molde que «ningún lector de cifras vuelve a borrar los blancos» (`pegado-de-celdas.test.ts`): lo de arriba protege los campos que HAY; esto, a los que vengan.

/**
 * Un filtro que borra todo lo que no es una cifra, también la coma y el punto: la coma se va y el 5 cae junto al 2. Da igual si está en el `onChange` o en una función de `lib/` que el
 * `onChange` llama (`soloCifrasEscritas`, `ajustarDia` y `limpiarTextoAjuste` lo escondían ahí). Una cantidad se limpia con `limpiarCantidad` y se lee con su regla (`useCantidadEscrita`).
 * Un filtro de monto (`[^\d.,\s]`) deja pasar la coma y el punto, y no cae aquí.
 */
const BORRA_LA_COMA = /\.replace\(\/(?:\\D|\[\^(?:\\d|0-9)(?:\\s|-)*\])/;

/** Un RUC, un celular o un teléfono son una tira de dígitos, no una cantidad: «20-123» no es otro número. */
const TIRA_DE_DIGITOS = /\bruc\b|Ruc\b|celular|telefono/;

/** Los que borran con razón y su línea no lo dice. Una caja de cantidad nunca entra aquí: se limpia con `limpiarCantidad`. */
const TIRAS_CONOCIDAS: Record<string, string> = {
  "components/recepcion-envio/FormularioRecepcion.tsx": "el contador de una clave interna",
  "lib/campo-fecha-reglas.ts": "los dígitos de una fecha",
  "lib/club-reglas.ts": "un celular",
  "lib/existencias-flujos.ts": "un celular",
  "lib/gastos-viaje-reglas.ts": "el número de una orden, para ordenarlas",
  "lib/nombres-parecidos.ts": "comparar las cifras de dos nombres",
  "lib/pedidos-con-cliente-reglas.ts": "un celular",
  "lib/pedidos-web-cobro-reglas.ts": "el n.º de operación",
  "lib/pedidos-web-reglas.ts": "el código de recojo",
  "lib/proveedores-reglas.ts": "un CCI o una cuenta",
  "lib/separaciones-reglas.ts": "un documento, un celular o una cuenta",
};

describe("ninguna caja de cantidad vuelve a borrar lo que no es una cifra mientras se teclea", () => {
  const RAIZ = process.cwd();
  const archivos = (dir: string): string[] =>
    readdirSync(join(RAIZ, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? archivos(join(dir, e.name)) : [join(dir, e.name)]));
  const fuentes = [...archivos("components"), ...archivos("app"), ...archivos("lib")].filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f));

  const culpas = new Map<string, string[]>();
  const conFiltro = new Set<string>();
  for (const f of fuentes) {
    const clave = f.split(sep).join("/");
    readFileSync(join(RAIZ, f), "utf8")
      .split("\n")
      .forEach((linea, i) => {
        if (/^\s*(\*|\/\/)/.test(linea) || !BORRA_LA_COMA.test(linea)) return;
        conFiltro.add(clave);
        if (TIRA_DE_DIGITOS.test(linea) || clave in TIRAS_CONOCIDAS) return;
        culpas.set(clave, [...(culpas.get(clave) ?? []), `${clave}:${i + 1}  ${linea.trim()}`]);
      });
  }

  it("el escáner mira de verdad el código (si no, no vigila nada)", () => {
    expect(fuentes.length).toBeGreaterThan(400);
    expect(BORRA_LA_COMA.test('onChange={(e) => poner(e.target.value.replace(/\\D/g, ""))}')).toBe(true);
    expect(BORRA_LA_COMA.test('onChange={(e) => poner(e.currentTarget.value.replace(/\\D/g, "").slice(0, 3))}')).toBe(true);
    expect(BORRA_LA_COMA.test('export const ajustar = (texto: string) => texto.replace(/\\D/g, "").slice(0, 2);')).toBe(true);
    expect(BORRA_LA_COMA.test('return texto.replace(/[^\\d\\s]/g, "");')).toBe(true);
    expect(BORRA_LA_COMA.test('return texto.replace(/[^\\d\\s-]/g, "");')).toBe(true);
    expect(BORRA_LA_COMA.test('return texto.replace(/[^0-9]/g, "");')).toBe(true);
    expect(BORRA_LA_COMA.test('const soloMonto = (s: string) => s.replace(/[^\\d.,\\s]/g, "");')).toBe(false);
    expect(BORRA_LA_COMA.test('return texto.replace(/[^0-9a-z]/gi, "").slice(0, 40);')).toBe(false);
    expect(TIRA_DE_DIGITOS.test('const d = telefono.replace(/\\D/g, "");')).toBe(true);
  });

  it("ninguna", () => {
    expect([...culpas.values()].flat()).toEqual([]);
  });

  it("la lista de tiras conocidas no guarda archivos que ya no borran nada", () => {
    expect(Object.keys(TIRAS_CONOCIDAS).filter((f) => !conFiltro.has(f))).toEqual([]);
  });

  it("cada caja limpia lo tecleado con su función, y no con un filtro propio", () => {
    const veces = (archivo: string, patron: RegExp) => (readFileSync(join(RAIZ, archivo), "utf8").match(patron) ?? []).length;
    for (const [archivo, cuantas] of [
      ["components/plan-compra/PlazoModal.tsx", 1],
      ["components/tienda-web-conf/RelojDelPedido.tsx", 1],
      ["components/plan-compra/FormularioCategoria.tsx", 5],
      ["components/clientas/club-piezas.tsx", 2],
    ] as const) {
      expect(veces(archivo, /limpiarCantidad\(e\.target\.value\)/g), archivo).toBe(cuantas);
    }
    expect(veces("components/SelectorDeAjuste.tsx", /limpiarTextoAjuste\(e\.target\.value\)/g)).toBe(1);
    // Las que guardan texto y su lector ya rechaza.
    for (const [archivo, cuantas] of [
      ["components/ProductoForm.tsx", 1],
      ["components/SeriesPanel.tsx", 1],
      ["components/ProveedorModal.tsx", 1],
      ["components/ReasignarReparto.tsx", 1],
      ["components/CerrarFaltanteModal.tsx", 1],
      ["components/MoverMercaderiaFormV2.tsx", 1],
      ["components/NuevaProformaModal.tsx", 1],
    ] as const) {
      expect(veces(archivo, /limpiarCantidad\(e\.target\.value\)/g), archivo).toBe(cuantas);
    }
    // Las que guardan un número, o leen como 0 lo que no entienden: lo escrito vive en el borrador de `useCantidadEscrita`.
    for (const [archivo, cuantas] of [
      ["components/punto-de-venta/LineaDelTicket.tsx", 1],
      ["components/CambioReemplazo.tsx", 1],
      ["components/DevolucionesFlujo.tsx", 1],
      ["components/LlegoMercaderia.tsx", 1],
      ["components/RecepcionEnvio.tsx", 3],
      ["components/MatrizOrden.tsx", 1],
      ["components/NuevaProformaModal.tsx", 1],
      ["components/ImprimirEtiquetasPrecio.tsx", 1],
      ["components/rotulos/TiraBrother.tsx", 1],
      ["components/caja/ContarCajonHoja.tsx", 1],
    ] as const) {
      expect(veces(archivo, /\.campo\(/g), archivo).toBe(cuantas);
    }
    // Los porcentajes de descuento aceptan decimales: leen como el monto de al lado.
    for (const archivo of ["components/punto-de-venta/PanelDescuento.tsx", "components/apartados/DescuentoApartado.tsx"]) {
      expect(veces(archivo, /atributosPorcentajeTexto\(/g), archivo).toBe(1);
    }
  });

  // El navegador no deja entrar la coma en una caja `type="number"`: «2,5» queda 25, y lo que no entiende le llega vacío a la pantalla (medido tecleando, 2026-11-03). ADR-0419 ya lo dijo de los montos.
  it("ninguna caja vuelve a ser `type=\"number\"`: una cantidad es texto con `inputMode=\"numeric\"`", () => {
    const CAJA_DE_NUMERO = /\btype(?::|=)\s*\{?["']number["']/;
    expect(CAJA_DE_NUMERO.test('<input type="number" min={1} />')).toBe(true);
    expect(CAJA_DE_NUMERO.test('campo={{ type: "number", min: 0 }}')).toBe(true);
    expect(CAJA_DE_NUMERO.test('<input type="range" min={1} />')).toBe(false);
    const conNumero = [...archivos("components"), ...archivos("app")]
      .filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f))
      .flatMap((f) =>
        readFileSync(join(RAIZ, f), "utf8")
          .split("\n")
          .flatMap((linea, i) => (!/^\s*(\/?\*|\/\/)/.test(linea) && CAJA_DE_NUMERO.test(linea) ? [`${f.split(sep).join("/")}:${i + 1}`] : [])),
      );
    expect(conNumero).toEqual([]);
  });

  // Apartar sale del ticket por dos botones, el de escritorio y la barra del celular: los dos dejan atrás la caja donde se lee el aviso (2026-11-03: «Cliente» avanzaba con «-5» escrito).
  it("los dos botones que salen del ticket de Apartar frenan con lo mal escrito", () => {
    const texto = readFileSync(join(RAIZ, "components/apartados/ApartarVista.tsx"), "utf8");
    expect(texto).toMatch(/function seguirDelTicket\(\) \{\s*(\/\/[^\n]*\n\s*)?if \(escrita\.frenar\(\)\) return;/);
    expect(texto.match(/onClick=\{seguirDelTicket\}/g)?.length).toBe(2);
    expect(texto).not.toMatch(/onClick=\{\(\) => irAPaso\("clienta"\)\}/);
  });

  // El aviso de una celda sale recién cuando el clic en el botón se lleva el cursor (`alQuererSeguir`). Las celdas viven dentro de la tabla y el botón en la pantalla: si una pantalla no conecta los dos, se guarda lo
  // que había sin que nadie alcance a leer por qué.
  it("toda pantalla con una tabla de cantidades le conecta el freno a su botón", () => {
    const conTabla = fuentes.filter((f) => /<(MatrizCantidades|MatrizStockFicha|UnidadesDeLasNuevas)\b/.test(readFileSync(join(RAIZ, f), "utf8")));
    expect(conTabla.length).toBeGreaterThanOrEqual(10);
    const sinFreno = conTabla.filter((f) => {
      const texto = readFileSync(join(RAIZ, f), "utf8");
      return !/\bfreno=\{/.test(texto) || !/freno\w*\.current\?\.\(\)/.test(texto);
    });
    expect(sinFreno).toEqual([]);
  });
});
