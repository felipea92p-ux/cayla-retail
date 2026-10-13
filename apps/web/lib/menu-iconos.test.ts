import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ACCESOS } from "./inicio-avisos";
import { ARBOL, esGrupo, type ClaveIcono, type Nodo } from "./menu";
import { ICONO_DEL_ACCESO, iconoDeModulo, TRAZOS_MENU } from "./menu-iconos";
import { CLAVES_MODULO, type ClaveModulo } from "./modulos";

// Candado de los íconos del menú (refresco retail, Felipe 2026-10-13; alineación de Roles y del Inicio, el mismo día).
//
// PROMETE: (1) que cada clave que el árbol del menú nombra tiene su trazo; (2) que dos claves nunca comparten el MISMO dibujo
// (`menu.test.ts` ya impide que dos filas de un perfil repitan la CLAVE, pero dos claves distintas con el mismo trazo se verían
// igual en pantalla: «Ventas» y «Compras» eran dos bolsas casi idénticas hasta este refresco); (3) que ningún subtrazo unido
// con un espacio arranca con «m» minúscula; (4) que cada MÓDULO se dibuja en Roles y accesos con el ícono de su fila del menú;
// (5) que cada acceso rápido del Inicio dibuja el ícono de la pantalla a la que lleva; (6) que los lugares que antes copiaban
// un trazo del menú (la percha, el botón Actividad, el Inicio de almacén, la página de Inicio) ya no lo copian: lo leen de `TRAZOS_MENU`.
// POR QUÉ (3): un trazo de lucide con varios elementos se pega en UN solo `d`. Solo, su «m» inicial es absoluto; unido a otro,
// es RELATIVO al punto donde terminó el anterior y el dibujo se descuadra sin avisar (se vio, antes de pintarla, al unir los
// dos trazos de la brújula de Gestión). Se escribe «M», y «l» para los pares que le siguen.
// NO PROMETE: que cada dibujo se lea bien a 18 px ni que diga lo que la pantalla es: eso se mira en el menú, claro y oscuro.

const RAIZ = join(__dirname, "..");

/** Los íconos de las filas del árbol que cuelgan de un módulo, y los de las cabeceras que las contienen. */
function iconosPorModulo(nodos: readonly Nodo[], cabeceras: readonly ClaveIcono[] = [], acumulado = new Map<ClaveModulo, Set<ClaveIcono>>()) {
  for (const n of nodos) {
    if (n.estado !== "viva") continue;
    if (esGrupo(n)) {
      iconosPorModulo(n.hijos, [...cabeceras, n.icono], acumulado);
      continue;
    }
    for (const m of [n.modulo, n.moduloAlterno]) {
      if (!m) continue;
      const set = acumulado.get(m) ?? new Set<ClaveIcono>();
      set.add(n.icono);
      for (const c of cabeceras) set.add(c);
      acumulado.set(m, set);
    }
  }
  return acumulado;
}

const clavesDelArbol = (nodos: readonly Nodo[]): ClaveIcono[] =>
  nodos.flatMap((n) => (n.estado !== "viva" ? [] : esGrupo(n) ? [n.icono, ...clavesDelArbol(n.hijos)] : [n.icono]));

describe("trazos del menú (`TRAZOS_MENU`)", () => {
  it("cada ícono que nombra el árbol del menú tiene su trazo", () => {
    const sinTrazo = [...new Set(clavesDelArbol(ARBOL))].filter((c) => !(c in TRAZOS_MENU) || !TRAZOS_MENU[c]);
    expect(sinTrazo).toEqual([]);
  });

  it("dos claves distintas no comparten el mismo dibujo", () => {
    const porDibujo = new Map<string, string[]>();
    for (const [clave, d] of Object.entries(TRAZOS_MENU)) porDibujo.set(d, [...(porDibujo.get(d) ?? []), clave]);
    const repetidos = [...porDibujo.values()].filter((claves) => claves.length > 1).map((claves) => claves.join(" + "));
    expect(repetidos).toEqual([]);
  });

  it("ningún subtrazo unido con un espacio arranca con «m» minúscula (sería relativo al anterior)", () => {
    const sueltos = Object.entries(TRAZOS_MENU)
      .filter(([, d]) => /^m/.test(d) || /\sm/.test(d))
      .map(([clave]) => clave);
    expect(sueltos).toEqual([]);
  });
});

describe("Roles y accesos dibuja cada módulo como el menú (`iconoDeModulo`)", () => {
  // Los únicos sin trazo en el lateral: se abren desde los botones de la cabecera (ADR-0306). `IconoModulo` les pone uno de lucide.
  const SIN_ICONO_DE_MENU: readonly ClaveModulo[] = ["roles", "configuracion"];
  // No son una fila propia del menú: el módulo reúne varias filas, o es una pestaña de otra (ver `APARTE` en lib/menu-iconos.ts).
  const A_MANO: readonly ClaveModulo[] = ["produccion", "atributos", "reportes_financieros", "etiquetas", "colaboradores", "actividad"];
  const delArbol = iconosPorModulo(ARBOL);

  it.each(CLAVES_MODULO)("%s", (modulo) => {
    const icono = iconoDeModulo(modulo);
    if (SIN_ICONO_DE_MENU.includes(modulo)) {
      expect(icono).toBeNull();
      return;
    }
    // Todo módulo, salvo esos tres, se dibuja con un ícono del menú que existe.
    expect(icono, `el módulo «${modulo}» no tiene ícono del menú: ¿su fila declara \`modulo\`?`).not.toBeNull();
    expect(TRAZOS_MENU[icono as ClaveIcono]).toBeTruthy();
    // Y ese ícono es el de una de sus filas o el de la cabecera que las junta (salvo los que se declaran a mano, que lo dicen).
    const permitidos = delArbol.get(modulo);
    if (permitidos && !A_MANO.includes(modulo)) expect([...permitidos], `«${modulo}» se dibuja distinto en Roles y en el menú`).toContain(icono);
  });

  it("dos módulos no comparten ícono, salvo los pares dichos a propósito", () => {
    const porIcono = new Map<ClaveIcono, ClaveModulo[]>();
    for (const m of CLAVES_MODULO) {
      const i = iconoDeModulo(m);
      if (i) porIcono.set(i, [...(porIcono.get(i) ?? []), m]);
    }
    // Hoy hay un solo par, a propósito: «Actividad» es el botón de la cabecera, que dibuja el reloj con flecha del Historial.
    const PARES_A_PROPOSITO = ["historial: historial + actividad"];
    const repetidos = [...porIcono].filter(([, ms]) => ms.length > 1).map(([i, ms]) => `${i}: ${ms.join(" + ")}`);
    expect(repetidos).toEqual(PARES_A_PROPOSITO);
  });
});

describe("los accesos rápidos del Inicio dibujan el ícono de su pantalla (`ICONO_DEL_ACCESO`)", () => {
  it("«Vender» es el Punto de Venta", () => {
    expect(ICONO_DEL_ACCESO.vender).toBe(iconoDeModulo("vender"));
  });

  it.each(Object.keys(ICONO_DEL_ACCESO).filter((k) => k !== "vender"))("%s", (clave) => {
    const acceso = ACCESOS[clave as keyof typeof ACCESOS];
    expect(acceso.modulo, `«${clave}» tiene que llevar a un módulo del menú`).not.toBeNull();
    expect(ICONO_DEL_ACCESO[clave as keyof typeof ICONO_DEL_ACCESO]).toBe(iconoDeModulo(acceso.modulo as ClaveModulo));
  });
});

describe("nadie más copia un trazo del menú", () => {
  // Estos archivos dibujaban a mano una copia de un trazo del lateral; ahora lo leen de `TRAZOS_MENU`. Si alguien pega un trazo
  // del menú en uno de ellos, el menú cambia y esa copia se queda vieja (así pasó con Roles y con el Inicio hasta el 2026-10-13).
  const ESPEJOS = [
    "components/AppShell.tsx",
    "components/ui/IconoPercha.tsx",
    "components/actividad/BotonActividad.tsx",
    "components/inicio-almacen/iconos.tsx",
    "app/(app)/page.tsx",
  ];
  it.each(ESPEJOS)("%s", (archivo) => {
    const fuente = readFileSync(join(RAIZ, archivo), "utf8");
    const copiados = Object.entries(TRAZOS_MENU).filter(([, d]) => fuente.includes(d)).map(([clave]) => clave);
    expect(copiados, `${archivo} copia el trazo de: ${copiados.join(", ")}`).toEqual([]);
    expect(fuente).toContain("TRAZOS_MENU");
  });
});
