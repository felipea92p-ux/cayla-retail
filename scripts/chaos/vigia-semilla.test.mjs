// Pruebas de `scripts/chaos/vigia-semilla.mjs` (ADR-0632): que la siembra del vigía de producción salga del detector de `/chaos` y no
// pueda separarse de él. Que cada consulta corra de verdad contra Postgres lo prueba `scripts/pruebas/vigia_invariantes.sql`.
// `node --test scripts/chaos/vigia-semilla.test.mjs`
import assert from "node:assert/strict";
import { test } from "node:test";
import { INVARIANTES } from "./invariantes.mjs";
import { filasDelVigia, MARCA_FIN, MARCA_INICIO, semillaSql } from "./vigia-semilla.mjs";

test("toda invariante dice qué columnas identifican la violación, y esas columnas salen de su consulta", () => {
  for (const i of INVARIANTES) {
    assert.ok(Array.isArray(i.clave) && i.clave.length > 0, `${i.id}: sin \`clave\` el vigía contaría la misma venta rota como nueva cada mañana`);
    assert.equal(new Set(i.clave).size, i.clave.length, `${i.id}: columna repetida en la clave`);
    for (const c of i.clave) {
      assert.match(c, /^[a-z_]+$/, `${i.id}: «${c}» no es un nombre de columna`);
      assert.match(i.sql, new RegExp(`\\b${c}\\b`), `${i.id}: la clave nombra «${c}», que su consulta no devuelve`);
    }
  }
});

test("la clave dice QUÉ está roto, nunca cuánto: un monto que cambia no puede volver «nueva» una violación vieja", () => {
  const cifras = /^(cantidad|monto|total|diferencia|precio|lineas|pagos|stock|esperado|pagado|segundos|vendido|salido|entro|salio)/;
  for (const i of INVARIANTES) {
    for (const c of i.clave.filter((x) => !x.endsWith("_id"))) assert.doesNotMatch(c, cifras, `${i.id}: «${c}» es una cifra, no una identidad`);
  }
});

test("una sospecha nace apagada y una cruzada encendida; la que /chaos corre como líder queda marcada como que necesita sesión", () => {
  for (const f of filasDelVigia()) {
    const inv = INVARIANTES.find((i) => i.id === f.id);
    assert.equal(f.activa, inv.nivel === "cruzada", `${f.id}: ${inv.nivel} y activa=${f.activa}`);
    assert.equal(f.requiereSesion, Boolean(inv.comoLider), f.id);
  }
});

test("la siembra trae cada invariante una vez, entre sus marcadores, y sale igual cada vez que se genera", () => {
  const sql = semillaSql();
  assert.ok(sql.startsWith(MARCA_INICIO) && sql.endsWith(MARCA_FIN));
  for (const i of INVARIANTES) assert.equal(sql.split(`('${i.id}',`).length - 1, 1, `${i.id} aparece una sola vez`);
  assert.equal(semillaSql(), sql, "dos corridas dan lo mismo: no depende de la hora ni del azar");
});

test("una siembra nueva no vuelve a encender lo que alguien apagó en producción", () => {
  const actualiza = semillaSql().split("on conflict (id) do update set")[1];
  assert.doesNotMatch(actualiza, /\bactiva\s*=/);
});

test("si un texto trae la comilla de la siembra, el generador se niega en vez de escribir un SQL roto", () => {
  const rota = [{ ...filasDelVigia()[0], sql: "select 1 as x from $inv$ y" }];
  assert.throws(() => semillaSql(rota), /comilla/);
});
