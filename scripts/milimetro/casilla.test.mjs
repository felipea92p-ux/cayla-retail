import { test } from "node:test";
import assert from "node:assert/strict";
import { esVisual, revisar } from "./casilla.mjs";

test("cuenta como visual lo que se ve en el ERP y nada más", () => {
  assert.equal(esVisual("apps/web/components/ui/Boton.tsx"), true);
  assert.equal(esVisual("apps/web/app/(app)/compras/page.tsx"), true);
  assert.equal(esVisual("apps/web/app/estilos/vidrio/recetas.css"), true);
  assert.equal(esVisual("apps/web/app/globals.css"), true);
  assert.equal(esVisual("apps/web/components/ui/Boton.test.tsx"), false);
  assert.equal(esVisual("apps/web/lib/compras-reglas.ts"), false);
  assert.equal(esVisual("apps/web/app/api/salud/route.ts"), false);
  assert.equal(esVisual("apps/tienda/components/Vitrina.tsx"), false);
  assert.equal(esVisual("docs/milimetro/propuestas.md"), false);
});

test("un PR sin nada visual pasa sin casilla", () => {
  const r = revisar([[{ filename: "apps/web/lib/x.ts", status: "modified" }]], "");
  assert.deepEqual(r.motivos, []);
  assert.equal(r.visuales.length, 0);
});

test("un PR visual sin casilla sale en rojo y nombra los archivos", () => {
  const r = revisar([{ filename: "apps/web/components/Tabla.tsx", status: "modified" }], "- [ ] pasó por `/milimetro`");
  assert.equal(r.motivos.length, 1);
  assert.match(r.motivos[0], /apps\/web\/components\/Tabla\.tsx/);
});

test("la casilla marcada lo deja pasar", () => {
  const archivos = [{ filename: "apps/web/app/(app)/vender/page.tsx", status: "added" }];
  assert.equal(revisar(archivos, "- [x] Si cambia la cara del ERP: **pasó por `/milimetro`**").casilla, "paso");
  assert.equal(revisar(archivos, "* [X] **Al milímetro no aplica:** solo renombra una prop").casilla, "no-aplica");
  assert.equal(revisar(archivos, "- [x] **Al milimetro no aplica:** sin tilde").casilla, "no-aplica");
  assert.deepEqual(revisar(archivos, "- [x] pasó por /milimetro").motivos, []);
});

test("lo que solo se borra no pide casilla", () => {
  const r = revisar([{ filename: "apps/web/components/Viejo.tsx", status: "removed" }], "");
  assert.deepEqual(r.motivos, []);
});
