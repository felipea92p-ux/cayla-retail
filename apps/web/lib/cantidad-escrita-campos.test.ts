import { readFileSync, readdirSync } from "node:fs";
import { join, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { limpiarCantidad, textoCantidadRechazada } from "./alta-producto";
import { REGLA_BILLETES } from "./caja-cierre-reglas";
import { alEntrar, alEscribir, alQuererSeguir, alRechazar, alSalir, problemaEscrito, reglaDeEntero, SIN_ESCRIBIR, type ReglaCantidad } from "./cantidad-escrita-reglas";
import { cantDelRelleno, REGLA_RELLENO } from "./colgar-varias-tabla";
import { leerEscritoDeCelda, REGLA_CELDA_PLANILLA } from "./existencias-ajuste-modelo";
import { leerCantidadDeposito, leerCantidadReposicion, leerCantidadSaldoAFavor, limpiarCantidadReposicion } from "./nos-debe-reglas";
import { escribioAlgoQueNoEsCifra, escribirEnCasilla } from "./pedidos-web-reglas";
import { leerCantidadTecleada, REGLA_CAJITA } from "./reponer-prenda-reglas";

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

/** Lo que se teclea en una caja, limpiado en el mismo momento: la coma se borra y el 5 cae junto al 2. Una cantidad se limpia con `limpiarCantidad` y se lee con su regla (`useCantidadEscrita`). */
const BORRA_AL_TECLEAR = /\.(?:currentTarget|target)\.value\.replace\(\/\\D\/g/;

/** Un RUC o un celular son una tira de dígitos, no una cantidad: «20-123» no es otro número. */
const TIRA_DE_DIGITOS = /\bruc\b|Ruc\b|celular/;

/**
 * El mismo error, sin arreglar todavía (días del mes, plazos, porcentajes, cantidades del plan de compra y de las prendas con falla). Esta lista solo BAJA: al arreglar uno se borra de aquí, y un
 * archivo nuevo no entra.
 */
const DEUDA: Record<string, number> = {
  "components/GastosFijosYActivos.tsx": 2,
  "components/finanzas/TarifaMaquinaModal.tsx": 1,
  "components/orden-pagina/FilasDeFalla.tsx": 1,
  "components/plan-compra/CantidadEditable.tsx": 1,
  "components/plan-compra/RecuperoModal.tsx": 1,
  "components/plan-compra/RepartoModal.tsx": 1,
};

describe("ninguna caja de cantidad vuelve a borrar lo que no es una cifra mientras se teclea", () => {
  const RAIZ = process.cwd();
  const archivos = (dir: string): string[] =>
    readdirSync(join(RAIZ, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? archivos(join(dir, e.name)) : [join(dir, e.name)]));
  const fuentes = [...archivos("components"), ...archivos("app")].filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f));

  const culpas = new Map<string, string[]>();
  for (const f of fuentes) {
    readFileSync(join(RAIZ, f), "utf8")
      .split("\n")
      .forEach((linea, i) => {
        if (/^\s*(\*|\/\/)/.test(linea) || !BORRA_AL_TECLEAR.test(linea) || TIRA_DE_DIGITOS.test(linea)) return;
        const clave = f.split(sep).join("/");
        culpas.set(clave, [...(culpas.get(clave) ?? []), `${clave}:${i + 1}  ${linea.trim()}`]);
      });
  }

  it("el escáner mira de verdad el código (si no, no vigila nada)", () => {
    expect(fuentes.length).toBeGreaterThan(400);
    expect(BORRA_AL_TECLEAR.test('onChange={(e) => poner(e.target.value.replace(/\\D/g, ""))}')).toBe(true);
    expect(BORRA_AL_TECLEAR.test('onChange={(e) => poner(e.currentTarget.value.replace(/\\D/g, "").slice(0, 3))}')).toBe(true);
    expect(BORRA_AL_TECLEAR.test('const d = telefono.replace(/\\D/g, "");')).toBe(false);
  });

  it("ninguna fuera de la deuda", () => {
    const nuevas = [...culpas].filter(([f]) => !(f in DEUDA)).flatMap(([, lineas]) => lineas);
    expect(nuevas).toEqual([]);
  });

  it("la deuda es exacta: arreglar uno lo saca de la lista", () => {
    const hoy = Object.fromEntries([...culpas].filter(([f]) => f in DEUDA).map(([f, lineas]) => [f, lineas.length]));
    expect(hoy).toEqual(DEUDA);
  });
});
