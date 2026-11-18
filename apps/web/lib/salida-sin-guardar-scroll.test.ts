import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MARCA_GUARDIA, devolverModoDeScroll, empujarGuardia, hayGuardiaConCambios, pasoDeIdaYVuelta, registrarGuardia, type HistorialDeGuardia } from "./salida-sin-guardar";

// Poner y retirar la guardia de «¿Salir sin guardar?» no mueve la página (2026-11-11).
//
// El defecto, medido con un clic real en Recibir ▸ Contar: «Una más», desplazar 250 px y, a los 0,8 s (cuando se guardaba sola y
// la guardia se retiraba), la vista volvía adonde estaba al tocar. Lo mismo al deshacer un cambio a mano (Conf. Tienda) y al pulsar
// «atrás» con cambios (Nuevo producto), en escritorio y a 375 px.
//
// Contrato. PROMETE: que, con un navegador que se porta como lo medido en Chromium, ninguna vuelta por el historial que la guardia
// provoca o acompaña (retirarla, reponerla tras un «atrás», cerrar una hoja del teléfono abierta encima) mueve la página; que fuera
// de una guardia puesta toda entrada vuelve a «auto», y que el hook pone su guardia solo por `empujarGuardia`.
// ASUME: el modelo de abajo. Lo que hace un navegador de verdad se midió con Playwright el día del arreglo; si un navegador cambia
// esas reglas, esta prueba sigue en verde y solo la pantalla lo dice.
// NO PROMETE: el instante en que el hook asienta el scroll (espera a que la página esté quieta), ni lo que pasa en Safari o Firefox.

type Modo = "auto" | "manual";
type Entrada = { estado: unknown; modo: Modo; anotado: number };

/** Un historial como el del navegador, lo justo para esta regla. Cada línea es algo que se midió en Chromium el 2026-11-11. */
class NavegadorDeMentira implements HistorialDeGuardia {
  entradas: Entrada[] = [{ estado: { pantalla: "formulario" }, modo: "auto", anotado: 0 }];
  i = 0;
  /** Dónde está la página. */
  y = 0;

  get state() {
    return this.entradas[this.i].estado;
  }
  get scrollRestoration() {
    return this.entradas[this.i].modo;
  }
  set scrollRestoration(modo: Modo) {
    this.entradas[this.i].modo = modo;
  }
  /** La entrada nueva hereda el modo y el scroll anotado de la que la empuja, y borra las de adelante. */
  pushState(estado: unknown) {
    const desde = this.entradas[this.i];
    this.entradas = [...this.entradas.slice(0, this.i + 1), { estado, modo: desde.modo, anotado: desde.anotado }];
    this.i++;
  }
  /** La página se desplaza (la persona, o un scroll de programa): el navegador lo anota en la entrada en la que se está. */
  desplazar(y: number) {
    this.y = y;
    this.entradas[this.i].anotado = y;
  }
  /** Una vuelta por el historial. Si la entrada de DESTINO está en «auto», la página vuelve a su scroll anotado; en «manual» no se
   *  mueve, y esa entrada se queda con su anotación vieja hasta el próximo desplazamiento. */
  ir(delta: number) {
    this.i += delta;
    const destino = this.entradas[this.i];
    if (destino.modo === "auto") this.y = destino.anotado;
  }
  /** Lo que hace `asentarScroll` del hook después de una vuelta: devolver «auto» y, si lo hizo, un píxel de ida y vuelta. */
  asentar(guardiaPuesta: boolean) {
    if (!devolverModoDeScroll(this, guardiaPuesta)) return;
    const aqui = this.y;
    const paso = pasoDeIdaYVuelta(aqui, 5000);
    if (paso === null) return;
    this.desplazar(paso);
    this.desplazar(aqui);
  }
  modos() {
    return this.entradas.map((e) => e.modo);
  }
}

const GUARDIA = { [MARCA_GUARDIA]: true };
const HOJA = { __hojaAbierta: "hoja-1" };
const URL_FORM = "http://localhost:3010/recibir/envio/abc";

/** La persona está en 300, hace su primer cambio (se pone la guardia) y baja a 700. */
function conGuardiaYDesplazada(poner: (n: NavegadorDeMentira) => void) {
  const n = new NavegadorDeMentira();
  n.desplazar(300);
  poner(n);
  n.desplazar(700);
  return n;
}
const comoAntes = (n: NavegadorDeMentira) => n.pushState(GUARDIA);
const conLaRegla = (n: NavegadorDeMentira) => empujarGuardia(n, GUARDIA, URL_FORM);

describe("el defecto: retirar una guardia empujada sin más devuelve el scroll", () => {
  it("la página vuelve adonde estaba al hacer el primer cambio", () => {
    const n = conGuardiaYDesplazada(comoAntes);
    n.ir(-1); // se guardó sola: la guardia se retira con un «atrás» propio
    expect(n.y).toBe(300);
  });
  it("«atrás» con cambios da el mismo salto antes de preguntar", () => {
    const n = conGuardiaYDesplazada(comoAntes);
    n.ir(-1); // la persona pulsa «atrás»
    expect(n.y).toBe(300);
  });
});

describe("empujarGuardia — la página se queda donde la persona la dejó", () => {
  it("retirar la guardia no la mueve, y la entrada de abajo vuelve a «auto» con su scroll al día", () => {
    const n = conGuardiaYDesplazada(conLaRegla);
    expect(n.modos()).toEqual(["manual", "manual"]);
    n.ir(-1);
    expect(n.y).toBe(700);
    n.asentar(false);
    expect(n.scrollRestoration).toBe("auto");
    expect(n.entradas[0].anotado).toBe(700);
  });

  it("«atrás» con cambios: se repone la guardia y la página no se mueve, ni al preguntar ni al seguir editando", () => {
    const n = conGuardiaYDesplazada(conLaRegla);
    n.ir(-1); // la persona pulsa «atrás»
    conLaRegla(n); // la guardia se repone y se pregunta
    expect(n.y).toBe(700);
    n.asentar(true); // la vuelta termina sobre la guardia puesta: no se toca
    expect(n.modos()).toEqual(["manual", "manual"]);
  });

  it("en el teléfono la pregunta es una hoja encima de la guardia repuesta: cerrarla no mueve la página", () => {
    const n = conGuardiaYDesplazada(conLaRegla);
    n.ir(-1);
    conLaRegla(n);
    n.pushState(HOJA); // «¿Salir sin guardar?» deja su entrada (ADR-0528)
    n.ir(-1); // «Seguir editando»: la hoja retira su entrada
    expect(n.y).toBe(700);
  });

  it("por eso la guardia se queda en «manual»: si volviera a «auto», esa misma hoja movería la página", () => {
    const n = conGuardiaYDesplazada(conLaRegla);
    n.ir(-1);
    conLaRegla(n);
    n.scrollRestoration = "auto"; // lo que NO se hace: la guardia repuesta heredó la anotación vieja de la de abajo (300)
    n.pushState(HOJA);
    n.ir(-1);
    expect(n.y).toBe(300);
  });

  it("después de retirarla, abrir y cerrar una hoja del teléfono tampoco la mueve (el scroll quedó anotado de nuevo)", () => {
    const n = conGuardiaYDesplazada(conLaRegla);
    n.ir(-1);
    n.asentar(false);
    n.pushState(HOJA);
    n.ir(-1);
    expect(n.y).toBe(700);
  });

  it("otra guardia tras un guardado, sin desplazar entre medio, y otra vez se retira: no se mueve", () => {
    const n = conGuardiaYDesplazada(conLaRegla);
    n.ir(-1);
    n.asentar(false);
    conLaRegla(n); // otro cambio
    n.ir(-1); // se guardó
    expect(n.y).toBe(700);
  });
});

describe("devolverModoDeScroll — fuera de una guardia puesta, toda entrada vuelve a «auto»", () => {
  it("una guardia puesta no se toca; una que quedó atrás al navegar, sí", () => {
    const n = conGuardiaYDesplazada(conLaRegla);
    expect(devolverModoDeScroll(n, true)).toBe(false);
    expect(n.scrollRestoration).toBe("manual");
    expect(devolverModoDeScroll(n, false)).toBe(true);
    expect(n.scrollRestoration).toBe("auto");
  });

  it("guardar y navegar (soltar): la pantalla nueva no hereda «manual»", () => {
    const n = conGuardiaYDesplazada(conLaRegla);
    devolverModoDeScroll(n, false); // `soltar()`: ya no hay cambios que cuidar
    n.pushState({ pantalla: "otra" });
    expect(n.scrollRestoration).toBe("auto");
  });

  it("navegar sin soltar: la pantalla nueva hereda «manual» y lo pierde cuando el formulario se va", () => {
    const n = conGuardiaYDesplazada(conLaRegla);
    n.pushState({ pantalla: "otra" });
    expect(n.scrollRestoration).toBe("manual");
    n.asentar(false);
    expect(n.scrollRestoration).toBe("auto");
    n.pushState({ pantalla: "otra más" });
    expect(n.scrollRestoration).toBe("auto");
  });

  it("la entrada que se abandonó bajo su guardia vuelve a «auto» la primera vez que se regresa a ella", () => {
    const n = conGuardiaYDesplazada(conLaRegla);
    devolverModoDeScroll(n, false);
    n.pushState({ pantalla: "otra" });
    n.ir(-2); // dos «atrás»: la guardia que quedó y la entrada del formulario
    expect(n.scrollRestoration).toBe("manual");
    n.asentar(false);
    expect(n.scrollRestoration).toBe("auto");
  });

  it("sin nada en «manual» no hace nada", () => {
    const n = new NavegadorDeMentira();
    expect(devolverModoDeScroll(n, false)).toBe(false);
    expect(n.scrollRestoration).toBe("auto");
  });

  it("«guardia puesta» es que algún formulario montado tenga algo sin guardar", () => {
    expect(hayGuardiaConCambios()).toBe(false);
    const limpia = registrarGuardia({ debePreguntar: () => false, pedirAccion: () => {} });
    expect(hayGuardiaConCambios()).toBe(false);
    const sucia = registrarGuardia({ debePreguntar: () => true, pedirAccion: () => {} });
    expect(hayGuardiaConCambios()).toBe(true);
    sucia();
    limpia();
    expect(hayGuardiaConCambios()).toBe(false);
  });
});

describe("pasoDeIdaYVuelta — el píxel con el que el navegador vuelve a anotar el scroll", () => {
  it("va hacia donde hay página y nunca se sale de ella", () => {
    expect(pasoDeIdaYVuelta(700, 1200)).toBe(699);
    expect(pasoDeIdaYVuelta(1200, 1200)).toBe(1199); // al fondo: hacia arriba
    expect(pasoDeIdaYVuelta(0, 1200)).toBe(1); // arriba del todo: hacia abajo
    expect(pasoDeIdaYVuelta(0.5, 1200)).toBe(1.5);
  });
  it("una página que no se desplaza no tiene nada que anotar", () => {
    expect(pasoDeIdaYVuelta(0, 0)).toBeNull();
    expect(pasoDeIdaYVuelta(0, 0.4)).toBeNull();
  });
});

// Candados sobre el código: la regla vive en `lib/salida-sin-guardar.ts` y el hook no la esquiva.
const leer = (ruta: string) => readFileSync(new URL(`../${ruta}`, import.meta.url), "utf8");
/** El código sin comentarios de bloque ni de línea (los que explican la regla nombran lo mismo que se vigila). */
const sinComentarios = (fuente: string) => fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");

describe("el hook pone la guardia por la regla, y nadie más toca el modo de scroll", () => {
  const hook = sinComentarios(leer("components/ui/useSalidaSinGuardar.tsx"));

  it("useSalidaSinGuardar no empuja entradas por su cuenta: solo `empujarGuardia`", () => {
    expect(hook).toContain("empujarGuardia(window.history");
    expect(hook, "Una guardia empujada con `history.pushState` devuelve el scroll al retirarla: usa `empujarGuardia` (lib/salida-sin-guardar.ts).").not.toMatch(
      /history\s*\.\s*pushState\s*\(/
    );
  });

  it("y asienta el scroll al terminar cada vuelta, al soltar la guardia y cuando el formulario se va", () => {
    expect(hook.match(/\basentarScroll\(\)/g)?.length ?? 0, "`asentarScroll()` se llama al cargar el módulo, en cada `popstate` y al desmontarse el formulario").toBeGreaterThanOrEqual(3);
    expect(hook.match(/\bdevolverModo\(\)/g)?.length ?? 0, "`devolverModo()` se llama en `asentarScroll`, en `soltar` y antes de salir por «Salir sin guardar»").toBeGreaterThanOrEqual(3);
  });

  it("`history.scrollRestoration` solo se escribe en lib/salida-sin-guardar.ts", () => {
    const ESCRIBE = /\bscrollRestoration\s*=(?!=)/;
    const quienes = ["app", "components", "lib"].flatMap((raiz) => {
      const dir = new URL(`../${raiz}/`, import.meta.url);
      return readdirSync(dir, { recursive: true, encoding: "utf8" })
        .map((f) => f.replaceAll("\\", "/"))
        .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
        .filter((f) => ESCRIBE.test(sinComentarios(readFileSync(new URL(f, dir), "utf8"))))
        .map((f) => `${raiz}/${f}`);
    });
    expect(
      quienes,
      "La guardia de «¿Salir sin guardar?» gobierna `history.scrollRestoration`: fuera de una guardia puesta devuelve toda entrada a «auto», " +
        "así que otra pieza que lo deje en «manual» lo pierde sin aviso. Si una pantalla con guardia lo ponía para que la página no saltara, " +
        "ya no hace falta: quítalo. Si es otra necesidad, va por lib/salida-sin-guardar.ts."
    ).toEqual(["lib/salida-sin-guardar.ts"]);
  });
});
