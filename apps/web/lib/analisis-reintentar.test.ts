import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { clasificarPeticion, claveNavegacion, type PeticionEspera } from "./espera-reglas";

// «Volver a intentar» de la tienda sin leer (F1, ADR-0357 act. 2026-10-16): es una LECTURA (`router.refresh()`), no un guardado: no debe abrir el
// loader a pantalla completa (ADR-0149), que taparía el aviso justo cuando la persona espera ver si ya se leyó. La señal es el propio botón
// («Leyendo…» con su hilo). La regla que lo permite vive en `lib/espera-reglas.ts` (`clasificarPeticion` + el anuncio de `navegacionSinEspera`).

const ORIGEN = "https://erp.test";
const HREF = `${ORIGEN}/gestion/analisis?vista=acaba`;

/** La petición que hace `router.refresh()`: un GET de Next con `RSC: 1`, a la misma dirección (más el sello `_rsc`). */
function refresco(sinEspera?: Set<string>): PeticionEspera {
  const cabeceras: Record<string, string> = { rsc: "1" };
  return {
    url: new URL(`${HREF}&_rsc=1a2b`),
    metodo: "GET",
    cabecera: (n) => cabeceras[n.toLowerCase()] ?? null,
    origen: ORIGEN,
    hostSupabase: null,
    // Cada anuncio sirve UNA vez (como `anunciosVigentes` de `Espera.tsx`).
    sinEspera: sinEspera ? { has: (k) => sinEspera.delete(k) } : undefined,
  };
}

describe("«Volver a intentar» no abre el loader a pantalla completa", () => {
  it("un refresco sin anunciar SÍ es una «carga» (lo que haría un router.refresh() cualquiera)", () => {
    expect(clasificarPeticion(refresco())).toEqual({ tipo: "carga" });
  });

  it("anunciado con `navegacionSinEspera`, el refresco no bloquea; y el anuncio sirve una sola vez", () => {
    const anuncios = new Set([claveNavegacion(new URL(HREF))]);
    expect(clasificarPeticion(refresco(anuncios))).toBeNull();
    // Gastado: la próxima vez a esa dirección (un clic en el menú) sí es una carga.
    expect(clasificarPeticion(refresco(anuncios))).toEqual({ tipo: "carga" });
  });

  it("el botón del aviso anuncia la navegación justo antes de refrescar, sin otro camino que abra el loader", () => {
    const fuente = readFileSync(new URL("../components/analisis/AnalisisPantalla.tsx", import.meta.url), "utf8");
    const boton = fuente.slice(fuente.indexOf("function VolverAIntentar()"), fuente.indexOf("// Las cinco preguntas son pestañas de vista"));
    expect(boton).toMatch(/navegacionSinEspera\(window\.location\.href\);\s*router\.refresh\(\);/);
    // Mientras relee, el botón dice «Leyendo…» y se apaga: la señal de que algo pasa, sin tapar el aviso.
    expect(boton).toContain("cargando={leyendo}");
    expect(boton).toContain('textoCargando="Leyendo…"');
    // La lectura va en una transición: `leyendo` es verdadero hasta que Next termina de pedir la pantalla.
    expect(boton).toContain("useTransition()");
    // No hay un `window.location.reload()` (recargaría la página entera, con su loader).
    expect(boton).not.toContain("reload");
  });
});
