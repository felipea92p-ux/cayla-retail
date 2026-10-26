import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { crearTokenDeOrden } from "./token-de-orden";

// El token de «Nueva orden» (ADR-0509): la segunda orden del día no puede reusar el de la primera.
//
// CONTRATO
//   PROMETE: que el token no cambia mientras no haya una orden confirmada (un reintento tras un corte lleva el mismo), que cambia al confirmarse una (la siguiente es otra orden) y que el
//            formulario lo renueva SOLO tras un guardado confirmado y manda siempre el vigente.
//   NO PROMETE: lo que hace la base con un token repetido (eso lo prueban las suites de Postgres de ADR-0409); ni que el formulario se vea igual (se compara el DOM en el navegador).

/** Un generador de mentira: «t1», «t2»… para ver cuándo se pide uno nuevo. */
function contador() {
  let n = 0;
  return () => `t${++n}`;
}

describe("crearTokenDeOrden", () => {
  it("un reintento tras un corte lleva el mismo token: mientras no se renueve, no cambia", () => {
    const t = crearTokenDeOrden(contador());
    expect(t.actual()).toBe("t1");
    expect(t.actual()).toBe("t1");
    expect(t.actual()).toBe("t1");
  });

  it("dos órdenes seguidas sin recargar son dos tokens distintos", () => {
    const t = crearTokenDeOrden(contador());
    const primera = t.actual();
    t.renovar(); // la base confirmó la primera
    const segunda = t.actual();
    expect(segunda).not.toBe(primera);
    t.renovar();
    expect(new Set([primera, segunda, t.actual()]).size).toBe(3);
  });

  it("renovar devuelve el nuevo y es el que queda vigente", () => {
    const t = crearTokenDeOrden(contador());
    expect(t.renovar()).toBe("t2");
    expect(t.actual()).toBe("t2");
  });

  it("sin generador, usa un uuid de verdad y cada token es distinto", () => {
    const t = crearTokenDeOrden();
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    expect(t.actual()).toMatch(uuid);
    const antes = t.actual();
    expect(t.renovar()).toMatch(uuid);
    expect(t.actual()).not.toBe(antes);
  });
});

describe("el formulario de Nueva orden usa el token como dice el contrato", () => {
  const codigo = readFileSync(new URL("../components/NuevaOrdenProduccionForm.tsx", import.meta.url), "utf8");

  it("crea el token una vez por montaje y ya no lo guarda en un useRef ni lo lee suelto (`token.current`)", () => {
    expect(codigo).toContain("const [token] = useState(() => crearTokenDeOrden());");
    expect(codigo).not.toContain("token.current");
    expect(codigo).not.toMatch(/crypto\.randomUUID\(\)/);
  });

  it("las dos aperturas (modelo que existe y modelo nuevo) mandan el token vigente", () => {
    expect(codigo.match(/token:\s*token\.actual\(\)/g)?.length).toBe(2);
  });

  it("lo renueva al confirmarse la orden —en `cerrarTrasGuardar`, que solo corre tras un guardado confirmado— y en ningún otro lugar", () => {
    expect(codigo.match(/token\.renovar\(\)/g)?.length).toBe(1);
    const cuerpo = codigo.slice(codigo.indexOf("function cerrarTrasGuardar()"));
    expect(cuerpo.slice(0, cuerpo.indexOf("\n  }\n"))).toContain("token.renovar()");
    // `cerrarTrasGuardar()` se llama justo después del aviso de éxito, nunca en una rama de error.
    const llamadas = [...codigo.matchAll(/(avisarCreada\([^;]*;\s*)?cerrarTrasGuardar\(\);/g)];
    expect(llamadas.length).toBe(2);
    for (const l of llamadas) expect(l[1], "cerrarTrasGuardar() sin avisarCreada(...) antes").toBeTruthy();
  });
});
