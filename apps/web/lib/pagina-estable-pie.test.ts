import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { VARIABLE_RESERVA, reservaPublicada } from "./pagina-estable-reglas";

// El pie pegado de una hoja y la reserva de <PaginaEstable> (ADR-0185, act. 2026-11-18). Felipe vio el pie de la hoja de ofertas flotando a
// media hoja, encima del contenido. Medido en «Registrar proveedor» a 1024 × 768, eran dos causas:
//  1. El pegado de `.pie-hoja-fijo` se mide desde el relleno de abajo de la hoja, y la reserva ES relleno: con 89 px reservados el pie quedaba
//     89 px arriba del borde y hasta 86 px encima del contenido.
//  2. Con las animaciones apagadas (el estado de fábrica, ADR-0625) el relleno entraba con una transición de 0,01 ms: en ese mismo tick todavía
//     no existía, la vista no podía volver (se quedaba 89 px arriba) y la reserva se ponía y se quitaba cuadro por cuadro.
// Estas pruebas vigilan las dos mitades del arreglo, que viven en archivos distintos y se rompen en silencio si una se va.

const raiz = join(__dirname, "..");
const leer = (f: string) => readFileSync(join(raiz, f), "utf8");

/** Todas las hojas de estilo de `app/`, con su ruta. */
function hojasDeEstilo(carpeta = "app"): { ruta: string; css: string }[] {
  return readdirSync(join(raiz, carpeta), { withFileTypes: true }).flatMap((e) => {
    const ruta = `${carpeta}/${e.name}`;
    if (e.isDirectory()) return hojasDeEstilo(ruta);
    return e.name.endsWith(".css") ? [{ ruta, css: leer(ruta) }] : [];
  });
}

/** Las reglas `selector { declaraciones }` de una hoja, sin comentarios. No entiende de anidado: mira la llave más cercana, que es la que importa. */
function reglas(css: string): { selector: string; cuerpo: string }[] {
  const limpio = css.replace(/\/\*[\s\S]*?\*\//g, "");
  return [...limpio.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim(), cuerpo: m[2] }));
}

describe("reservaPublicada", () => {
  it("en una ventana publica la reserva vigente, en px", () => {
    expect(reservaPublicada(89, true)).toBe("89px");
    expect(reservaPublicada(88.6, true)).toBe("89px");
  });

  it("sin reserva no publica nada: la variable no existe y quien la lee toma 0", () => {
    expect(reservaPublicada(0, true)).toBeNull();
  });

  it("en la página no publica: la variable se hereda y bajaría el pie de toda hoja abierta encima", () => {
    expect(reservaPublicada(400, false)).toBeNull();
  });
});

describe("el pie pegado baja lo que la hoja reservó", () => {
  it("`.pie-hoja-fijo` lee la variable de la reserva y se desplaza con ella", () => {
    const base = reglas(leer("app/globals.css")).find((r) => r.selector === ".pie-hoja-fijo");
    expect(base, "no se encontró la regla `.pie-hoja-fijo` en globals.css").toBeTruthy();
    expect(base!.cuerpo).toMatch(/position:\s*sticky/);
    expect(base!.cuerpo.replace(/\s+/g, " ")).toContain(`translate: 0 var(${VARIABLE_RESERVA}, 0px)`);
  });

  it("baja de una vez: con las animaciones apagadas, la transición de 0,01 ms lo dejaba un cuadro a media hoja", () => {
    const base = reglas(leer("app/globals.css")).find((r) => r.selector === ".pie-hoja-fijo");
    expect(base!.cuerpo).toMatch(/transition-property:\s*none/);
  });

  it("ninguna otra regla del pie le pisa el desplazamiento sin sumar la reserva", () => {
    const pisan = hojasDeEstilo().flatMap(({ ruta, css }) =>
      reglas(css)
        .filter((r) => r.selector.includes("pie-hoja-fijo") && /(^|[;\s])translate\s*:/.test(r.cuerpo) && !r.cuerpo.includes(`var(${VARIABLE_RESERVA}`))
        .map((r) => `${ruta}: ${r.selector}`),
    );
    expect(pisan, "una regla de `.pie-hoja-fijo` que escribe `translate` tiene que sumar var(--reserva-abajo, 0px)").toEqual([]);
  });

  it("la variable solo la escribe <PaginaEstable>: ninguna hoja de estilo la define", () => {
    const definen = hojasDeEstilo()
      .filter(({ css }) => new RegExp(`(^|[;{\\s])${VARIABLE_RESERVA}\\s*:`).test(css.replace(/\/\*[\s\S]*?\*\//g, "")))
      .map(({ ruta }) => ruta);
    expect(definen).toEqual([]);
  });
});

describe("<PaginaEstable> escribe la reserva de una vez", () => {
  const fuente = leer("components/ui/PaginaEstable.tsx");
  const pintar = fuente.match(/function pintarReserva\([\s\S]*?\n\}/)?.[0] ?? "";

  it("el relleno se escribe sin transición, y se pide una medida antes de devolverla", () => {
    expect(pintar, "falta `pintarReserva`").not.toBe("");
    const orden = ['destino.style.transition = "none"', "destino.style.paddingBottom = relleno", "void destino.offsetHeight", "destino.style.transition = transicion"].map((t) => pintar.indexOf(t));
    expect(orden.every((i) => i >= 0), "falta un paso de la escritura sin transición").toBe(true);
    expect([...orden].sort((a, b) => a - b)).toEqual(orden);
  });

  it("publica y quita la variable en el mismo lugar donde escribe el relleno", () => {
    expect(pintar).toContain("reservaPublicada(reservaPx, enVentana)");
    expect(pintar).toContain("destino.style.setProperty(VARIABLE_RESERVA, publicada)");
    expect(pintar).toContain("destino.style.removeProperty(VARIABLE_RESERVA)");
  });

  it("nadie más escribe el relleno: poner y soltar la reserva pasan por `pintarReserva`", () => {
    expect(fuente.match(/style\.paddingBottom\s*=/g)).toHaveLength(1);
    expect(fuente.match(/pintarReserva\(/g)).toHaveLength(3); // la función y sus dos llamadas: reservar y soltar
    expect(fuente).toMatch(/pintarReserva\(reserva\.destino, reserva\.paddingInline, 0, false\)/);
  });
});

// Los pies pegados que estaban hechos a mano (un `sticky` propio con las cuentas de un relleno de 24 px) no heredaban nada de lo de arriba: con la
// reserva puesta quedaban a media hoja (medido el 2026-11-18: 82 px arriba del borde en «Apartado registrado» a 1024 × 768 y 212 px en «Prendas
// parecidas» a 1280 × 720) y, en la hoja de vidrio, 4 px cortos. Ahora son el pie del sistema; esto vigila que no vuelvan a dibujarse aparte.
// La barra de «Nueva orden» (FichaOrden) NO entra: vive en la página, su pegado se mide desde la pantalla y la reserva no la mueve (medido: 514..768
// de 768 con 339 px reservados en el `body`).
describe("los pies que eran a mano son el pie del sistema", () => {
  it("Apartados: «Apartado registrado» y «Apartado entregado»", () => {
    const botones = leer("components/apartados/ModalesApartado.tsx").match(/function Botones\([\s\S]*?\n\}/)?.[0] ?? "";
    expect(botones, "falta `Botones` en ModalesApartado").not.toBe("");
    expect(botones).toContain('className="pie-hoja-fijo ');
    expect(botones, "el pie de Apartados volvió a traer su propio pegado").not.toMatch(/\bsticky\b|-bottom-6|-mb-6/);
  });

  it("Prendas parecidas: lleva la clase del sistema y la suya ya no pega, no pinta fondo ni se desplaza", () => {
    expect(leer("components/alta-producto/HojaParecidas.tsx")).toContain('className="pie-hoja-fijo parecidas-hoja-pie"');
    const propias = reglas(leer("app/estilos/alta-parecidas.css")).filter((r) => r.selector.split(",").some((s) => s.trim().endsWith(".parecidas-hoja-pie")));
    expect(propias.length).toBeGreaterThan(0);
    for (const r of propias) expect(r.cuerpo, r.selector).not.toMatch(/(^|[;\s])(position|bottom|background(-color)?|translate)\s*:/);
  });
});
