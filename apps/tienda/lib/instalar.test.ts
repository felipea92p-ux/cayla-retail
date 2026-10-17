import { describe, expect, it } from "vitest";
import {
  plataformaDe,
  avisoAlEntrar,
  CIERRES_PARA_NO_VOLVER,
  comoInstalar,
  conCierre,
  conInstalada,
  DIAS_DE_SILENCIO,
  enSilencio,
  estadoDeLaFila,
  leerRegistro,
  PAGINAS_DEL_AVISO,
  ayudaDeLaGuia,
  pasosDeLaGuia,
  puedeOfrecerSola,
  REGISTRO_VACIO,
  SCRIPT_DEL_AVISO,
  textoDelBoton,
  textoDelRegistro,
  type Registro,
  type Situacion,
  VARIABLE_DEL_AVISO,
} from "./instalar";

const DIA = 24 * 60 * 60 * 1000;
const AHORA = Date.UTC(2026, 9, 16, 15, 0, 0);

const UA_IPHONE_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const UA_IPHONE_CHROME = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1";
const UA_ANDROID_CHROME = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
const UA_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const UA_WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

const ANDROID = "android";
const IOS = "ios";
const COMPU = "otra";

const situacion = (c: Partial<Situacion> = {}): Situacion => ({ plataforma: ANDROID, yaEsApp: false, hayEvento: true, registro: REGISTRO_VACIO, ahora: AHORA, ...c });

describe("en qué aparato estamos", () => {
  it("reconoce iPhone (con Safari o con otro navegador), Android y computadora", () => {
    expect(plataformaDe({ ua: UA_IPHONE_SAFARI })).toBe("ios");
    expect(plataformaDe({ ua: UA_IPHONE_CHROME })).toBe("ios");
    expect(plataformaDe({ ua: UA_ANDROID_CHROME })).toBe("android");
    expect(plataformaDe({ ua: UA_WINDOWS })).toBe("otra");
  });
  it("un iPad nuevo se presenta como Mac: se reconoce por la pantalla táctil; un Mac de verdad, no", () => {
    expect(plataformaDe({ ua: UA_MAC, plataforma: "MacIntel", toques: 5 })).toBe("ios");
    expect(plataformaDe({ ua: UA_MAC, plataforma: "MacIntel", toques: 0 })).toBe("otra");
    expect(plataformaDe({ ua: UA_MAC })).toBe("otra");
  });
  it("un texto vacío no rompe nada", () => {
    expect(plataformaDe({ ua: "" })).toBe("otra");
  });
});

describe("cómo se instala", () => {
  it("Android con el aviso del navegador, un toque; sin él, la guía; iPhone, la guía; computadora, nada", () => {
    expect(comoInstalar("android", true)).toBe("evento");
    expect(comoInstalar("android", false)).toBe("guia-android");
    expect(comoInstalar("ios", false)).toBe("guia-ios");
    expect(comoInstalar("ios", true)).toBe("guia-ios");
    expect(comoInstalar("otra", true)).toBe("ninguno");
    expect(comoInstalar("otra", false)).toBe("ninguno");
  });
  it("el botón dice «Añadir» solo donde un toque instala", () => {
    expect(textoDelBoton("evento")).toBe("Añadir a mi celular");
    expect(textoDelBoton("guia-ios")).toBe("Ver cómo añadirla");
    expect(textoDelBoton("guia-android")).toBe("Ver cómo añadirla");
  });
});

describe("lo que la persona decidió", () => {
  it("lo guardado se lee de vuelta", () => {
    const r: Registro = { cierres: 1, ultimo: AHORA, instalada: true };
    expect(leerRegistro(textoDelRegistro(r))).toEqual(r);
  });
  it("un texto roto, vacío, de otro tipo o tocado a mano vale como «nada decidido»", () => {
    for (const malo of [null, undefined, "", "no es json", "[]", "null", "5", '"hola"']) expect(leerRegistro(malo)).toEqual(REGISTRO_VACIO);
    expect(leerRegistro('{"cierres":"mucho","ultimo":"ayer","instalada":"si"}')).toEqual(REGISTRO_VACIO);
    expect(leerRegistro('{"cierres":-3}').cierres).toBe(0);
    expect(leerRegistro('{"cierres":1e9}').cierres).toBe(99);
    expect(leerRegistro('{"cierres":1.9}').cierres).toBe(1);
  });
  it("cada «Ahora no» suma uno y anota cuándo; «instalada» no toca los cierres", () => {
    const uno = conCierre(REGISTRO_VACIO, AHORA);
    expect(uno).toEqual({ cierres: 1, ultimo: AHORA, instalada: false });
    expect(conCierre(uno, AHORA + DIA).cierres).toBe(2);
    expect(conInstalada(uno)).toEqual({ cierres: 1, ultimo: AHORA, instalada: true });
  });
  it("con un «Ahora no» calla 30 días justos; con dos, para siempre", () => {
    const uno = conCierre(REGISTRO_VACIO, AHORA);
    expect(enSilencio(REGISTRO_VACIO, AHORA)).toBe(false);
    expect(enSilencio(uno, AHORA + 1)).toBe(true);
    expect(enSilencio(uno, AHORA + DIAS_DE_SILENCIO * DIA - 1)).toBe(true);
    expect(enSilencio(uno, AHORA + DIAS_DE_SILENCIO * DIA)).toBe(false);
    const dos = conCierre(uno, AHORA + 40 * DIA);
    expect(dos.cierres).toBe(CIERRES_PARA_NO_VOLVER);
    expect(enSilencio(dos, AHORA + 4000 * DIA)).toBe(true);
  });
  it("un reloj atrasado o un cierre sin fecha también calla", () => {
    expect(enSilencio({ cierres: 1, ultimo: AHORA + 5 * DIA, instalada: false }, AHORA)).toBe(true);
    expect(enSilencio({ cierres: 1, ultimo: null, instalada: false }, AHORA)).toBe(true);
  });
});

describe("cuándo se ofrece sola", () => {
  it("Android con el aviso del navegador y iPhone, sí; Android sin él y computadora, no", () => {
    expect(puedeOfrecerSola(situacion())).toBe(true);
    expect(puedeOfrecerSola(situacion({ plataforma: IOS, hayEvento: false }))).toBe(true);
    expect(puedeOfrecerSola(situacion({ hayEvento: false }))).toBe(false);
    expect(puedeOfrecerSola(situacion({ plataforma: COMPU }))).toBe(false);
  });
  it("nunca si ya abrió CAYLA desde la pantalla de inicio ni si ya la instaló", () => {
    expect(puedeOfrecerSola(situacion({ yaEsApp: true }))).toBe(false);
    expect(puedeOfrecerSola(situacion({ registro: conInstalada(REGISTRO_VACIO) }))).toBe(false);
  });
  it("respeta el «Ahora no»", () => {
    const uno = conCierre(REGISTRO_VACIO, AHORA - DIA);
    expect(puedeOfrecerSola(situacion({ registro: uno }))).toBe(false);
    expect(puedeOfrecerSola(situacion({ registro: uno, ahora: AHORA + 40 * DIA }))).toBe(true);
    expect(puedeOfrecerSola(situacion({ registro: conCierre(uno, AHORA), ahora: AHORA + 400 * DIA }))).toBe(false);
  });
});

describe("qué aviso sale al entrar", () => {
  it("la hoja si el Inicio no trae el aviso del Club; la franja si lo trae (no se apilan dos tarjetas)", () => {
    expect(avisoAlEntrar(situacion(), "/inicio", false)).toBe("hoja");
    expect(avisoAlEntrar(situacion(), "/inicio", true)).toBe("franja");
    expect(avisoAlEntrar(situacion({ plataforma: IOS, hayEvento: false }), "/catalogo", false)).toBe("hoja");
  });
  it("solo en el Inicio y el catálogo: ni la ficha, ni la bolsa, ni «Mi perfil», ni la entrada", () => {
    expect([...PAGINAS_DEL_AVISO]).toEqual(["/inicio", "/catalogo"]);
    for (const p of ["/catalogo/abc", "/bolsa", "/cuenta", "/entrar", "/crear-cuenta", "/", "/looks", "/bolsa/separado/W-1"]) {
      expect(avisoAlEntrar(situacion(), p, false)).toBeNull();
    }
  });
  it("ninguno donde no se puede ofrecer", () => {
    expect(avisoAlEntrar(situacion({ plataforma: COMPU }), "/inicio", false)).toBeNull();
    expect(avisoAlEntrar(situacion({ yaEsApp: true }), "/inicio", true)).toBeNull();
    expect(avisoAlEntrar(situacion({ registro: conCierre(REGISTRO_VACIO, AHORA) }), "/inicio", false)).toBeNull();
  });
});

describe("la fila de «Mi perfil»", () => {
  it("no la ven en computadora ni quien ya abre CAYLA desde la pantalla de inicio", () => {
    expect(estadoDeLaFila(situacion({ plataforma: COMPU }))).toBe("oculta");
    expect(estadoDeLaFila(situacion({ yaEsApp: true }))).toBe("oculta");
  });
  it("«Añadir» donde un toque instala, «Ver cómo» donde hay pasos, «Ya la tienes» tras instalarla", () => {
    expect(estadoDeLaFila(situacion())).toBe("anadir");
    expect(estadoDeLaFila(situacion({ hayEvento: false }))).toBe("como");
    expect(estadoDeLaFila(situacion({ plataforma: IOS }))).toBe("como");
    expect(estadoDeLaFila(situacion({ registro: conInstalada(REGISTRO_VACIO) }))).toBe("ya-la-tienes");
  });
  it("no insiste, pero tampoco se esconde: ignora los «Ahora no»", () => {
    const dos = conCierre(conCierre(REGISTRO_VACIO, AHORA), AHORA);
    expect(estadoDeLaFila(situacion({ registro: dos }))).toBe("anadir");
    expect(estadoDeLaFila(situacion({ plataforma: IOS, registro: dos }))).toBe("como");
  });
});

describe("la guía", () => {
  it("son tres toques en cada camino y el de iPhone nombra Compartir y «Añadir a pantalla de inicio»", () => {
    for (const tipo of ["ios", "android"] as const) expect(pasosDeLaGuia(tipo)).toHaveLength(3);
    const ios = pasosDeLaGuia("ios").map((p) => p.partes.map((x) => (typeof x === "string" ? x : x.b)).join(""));
    expect(ios[0]).toContain("Compartir");
    expect(ios[1]).toContain("Añadir a pantalla de inicio");
    expect(ios[2]).toContain("Añadir");
  });
  it("el iPhone trae una pista por si Compartir está dentro del menú «⋯»; Android no necesita ninguna", () => {
    expect(ayudaDeLaGuia("ios")).toContain("⋯");
    expect(ayudaDeLaGuia("android")).toBeNull();
  });
  it("el paso de Compartir lleva el ícono del botón, para reconocerlo", () => {
    expect(pasosDeLaGuia("ios")[0].icono).toBe("compartir");
    expect(pasosDeLaGuia("android")[0].icono).toBe("puntos");
  });
});

describe("el aviso de Chrome que llega antes de que la página se arme", () => {
  it("el script del <head> escucha beforeinstallprompt, le quita el aviso propio y lo deja en la variable que lee el proveedor", () => {
    expect(SCRIPT_DEL_AVISO).toContain('"beforeinstallprompt"');
    expect(SCRIPT_DEL_AVISO).toContain("preventDefault()");
    expect(SCRIPT_DEL_AVISO).toContain(`window.${VARIABLE_DEL_AVISO}=e`);
  });
  it("es JavaScript válido que guarda el evento y no rompe sin él", () => {
    let oyente: ((e: { preventDefault: () => void }) => void) | undefined;
    const ventana = { addEventListener: (_: string, f: typeof oyente) => (oyente = f) };
    new Function("window", SCRIPT_DEL_AVISO)(ventana);
    let evitado = false;
    const evento = { preventDefault: () => (evitado = true) };
    oyente?.(evento);
    expect(evitado).toBe(true);
    expect((ventana as unknown as Record<string, unknown>)[VARIABLE_DEL_AVISO]).toBe(evento);
  });
});
