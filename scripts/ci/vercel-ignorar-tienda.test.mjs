// Pruebas de `vercel-ignorar-tienda.mjs`: el «Ignored Build Step» de la tienda online (0 = no construir, 1 = construir).
import { test } from "node:test";
import assert from "node:assert/strict";
import { decidir } from "./vercel-ignorar-tienda.mjs";

test("una vista previa nunca se construye (sus variables están solo en Producción)", () => {
  assert.equal(decidir({ entorno: "preview", cambiadas: ["apps/tienda/app/page.tsx"] }).construir, false);
  assert.equal(decidir({ entorno: "development", cambiadas: null }).construir, false);
  assert.equal(decidir({ entorno: undefined, cambiadas: null }).construir, false);
});

test("en producción se construye si cambió algo que la tienda compila", () => {
  for (const archivo of [
    "apps/tienda/app/(catalogo)/inicio/page.tsx",
    "apps/tienda/vercel.json",
    "packages/shared/src/padron.ts",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "package.json",
    ".nvmrc",
  ]) {
    assert.equal(decidir({ entorno: "production", cambiadas: ["apps/web/lib/x.ts", archivo] }).construir, true, archivo);
  }
});

test("en producción NO se construye si lo que cambió es del ERP o de la base", () => {
  const d = decidir({
    entorno: "production",
    cambiadas: ["apps/web/components/Caja.tsx", "supabase/migrations/20261015215000_x.sql", "docs/bitacora/x.md", "apps/web/package.json"],
  });
  assert.equal(d.construir, false);
  assert.match(d.motivo, /ninguno de los 4/);
});

test("un nombre que solo se parece no cuenta («apps/tiendas», «packages/shared-x»)", () => {
  assert.equal(decidir({ entorno: "production", cambiadas: ["apps/tiendas/a.ts", "packages/shared-x/b.ts"] }).construir, false);
});

test("ante la duda construye: sin versión anterior que comparar, o repitiendo la misma", () => {
  assert.equal(decidir({ entorno: "production", cambiadas: null }).construir, true);
  assert.equal(decidir({ entorno: "production", cambiadas: [] }).construir, true);
});
