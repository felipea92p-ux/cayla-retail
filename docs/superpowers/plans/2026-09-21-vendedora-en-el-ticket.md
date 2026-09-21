# «Quién vendió» en el ticket del Punto de venta — Plan de implementación

> **Para quien ejecute este plan:** REQUIRED SUB-SKILL: usa `superpowers:subagent-driven-development` (recomendado) o `superpowers:executing-plans`, tarea por tarea. Los pasos usan casillas (`- [ ]`) para llevar el avance.

**Objetivo:** que la caja compartida de una tienda pueda decir **quién atendió** a cada clienta, con un toque, y que ese nombre salga en el ticket térmico, la boleta A4 y los reportes.

**Arquitectura:** columna nueva `ventas.vendedora_id` **junto a** `usuario_id` (la sesión que cobró sigue siendo la auditoría). Un interruptor `colaboradores.atiende_en_caja` (que cambia un líder) decide quiénes aparecen en una fila de chips arriba del ticket. `registrar_venta` recibe `p_vendedora_id` y valida que sea colaboradora de esa sede. Las reglas de la fila (cuándo falta elegir, a quién se atribuye) son funciones puras en `lib/vender-reglas.ts`.

**Stack:** Postgres/Supabase (`retail` schema, RPC `security definer`), Next.js App Router + React (Server Components para leer, componentes cliente para el POS), Vitest para lo puro, un script `.mjs` contra Postgres local para la RPC.

**Spec:** [`docs/superpowers/specs/2026-09-21-vendedora-en-el-ticket-design.md`](../specs/2026-09-21-vendedora-en-el-ticket-design.md) (aprobado el 2026-09-21). Léelo antes de empezar: este plan asume sus decisiones.

## Restricciones globales (valen para todas las tareas)

- **Idioma y vocabulario:** español en comentarios y textos de pantalla; «colaboradora», «clienta», «sede/tienda». Nunca «empleado», «jefe», «sucursal».
- **Nada a producción sin OK explícito.** Este plan aplica la migración **solo en la base local**. Pegarla en producción es un paso aparte (Tarea 8, §«Entrega a producción») que exige el «sí» del usuario para **esa** migración. Tampoco se hace `push` ni PR sin pedirlo.
- **Migración:** archivo `supabase/migrations/20260922143700_vendedora_en_la_venta.sql` (mayor que la última, `20260922110000`, y no redonda). **Estilo de las migraciones recientes:** encabezado `set search_path = retail, public, extensions;` y nombres con `retail.`. Re-ejecutable (`if not exists`, `create or replace`, `drop … if exists`). Sin `DELETE` de datos.
- **Permisos de las funciones nuevas y de `registrar_venta`:** exactamente `{postgres=X/postgres,authenticated=X/postgres}` (sin `anon`, sin `public`, sin `service_role`): es lo que tienen hoy en local y en producción.
- **`registrar_venta` cambia de firma → `drop function` de la de 11 parámetros y `create` de la de 12.** Debe quedar **una sola** sobrecarga (dos a la vez ya tumbaron `/productos`).
- **Modales:** con `<Modal>` (`components/ui/Modal.tsx`, ADR-0136); no reimplementes el overlay ni otra animación de entrada.
- **Loader global (ADR-0149):** las lecturas nuevas llevan prefijo `fn_` (ya está en la lista de lecturas de `lib/espera-reglas.ts`); `marcar_atiende_en_caja` escribe y por eso sí dispara el loader de «guardado». No construyas otro loader.
- **Server Components:** nunca llames desde el servidor a una función exportada por un archivo `"use client"`. Lo puro va en `lib/*.ts`.
- **El navegador no decide quién vendió:** `p_vendedora_id` es solo una propuesta; la base la valida.
- **Commits:** Conventional Commits con scope del dominio; el mensaje termina con `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`. Agrega archivos **por nombre** (nunca `git add -A`). Antes de cada commit: `git checkout -- graphify-out/cache/last_query_stamp` (graphify lo toca en cada consulta y ensucia el diff). No corras `graphify update .`.
- **Rutas y shell (Windows):** no uses `cd` (mueve el directorio de la sesión); usa `pnpm -C apps/web …` o rutas absolutas. `git merge` va por PowerShell (Bash lo bloquea). Si un `Edit` no encuentra el texto por finales de línea CRLF, mira `git ls-files --eol <archivo>` y edita por fragmentos; jamás reescribas un archivo entero.
- **No inventes datos:** una venta sin vendedora elegida guarda `vendedora_id` vacío y se muestra la sesión, como hoy.

## Mapa de archivos

| Archivo | Qué hace | Tarea |
|---|---|---|
| `scripts/pruebas/vendedora_en_venta.mjs` (nuevo) | Prueba la RPC y las funciones nuevas contra Postgres local | 1 |
| `supabase/migrations/20260922143700_vendedora_en_la_venta.sql` (nuevo) | Columnas, trigger, 3 funciones, `registrar_venta` (12 parámetros), `fn_ventas_del_dia` | 1 |
| `packages/database/src/types.ts` | Tipos: columnas y funciones nuevas | 1 |
| `apps/web/lib/vender-reglas.ts` (+ test) | `Vendedora`, `CandidataVendedora`, `vendedoraDeLaVenta`, `vendedoraPendiente`, `atendioCorto`, regla de bloqueo | 2 |
| `apps/web/lib/recibo-reglas.ts`, `venta-detalle-reglas.ts`, `error-escritura.ts`, `ventas-offline.ts` (+ tests) | `atendio` en el recibo, error traducido, `p_vendedora_id` en los parámetros | 3 |
| `apps/web/lib/vendedoras.ts` (nuevo) | Lecturas del servidor | 4 |
| `apps/web/components/VendedorasFila.tsx` (nuevo) | La fila de chips | 4 |
| `apps/web/components/PuntoDeVentaTicket.tsx`, `PuntoDeVenta.tsx`, `apps/web/app/(app)/vender/page.tsx` | Cableado: estado, params, espera, recibo | 4 |
| `apps/web/components/ElegirVendedorasModal.tsx` (nuevo) | El líder marca quiénes atienden | 5 |
| `apps/web/components/ReciboTermico.tsx` | «Atendió:» en el ticket térmico | 6 |
| `apps/web/lib/ventas-historial*.ts`, `ventas-v2.ts`, `apps/web/app/actions/caja.ts` | Los reportes cuentan a la vendedora | 7 |
| `docs/…` | ADR, BITÁCORA, BACKLOG, ARQUITECTURA, SESIONES-ACTIVAS | 8 |

---

### Tarea 0: Preparar el worktree y coordinar

**Archivos:**
- Modificar: `docs/SESIONES-ACTIVAS.md`
- Ya existen (se commitean aquí): `docs/superpowers/specs/2026-09-21-vendedora-en-el-ticket-design.md`, este plan.

**Produce:** un worktree que compila y prueba, al día con `main`, con la sesión anunciada.

- [ ] **Paso 1: Instalar dependencias** (el worktree no trae `node_modules`)

```bash
pnpm install
```
Esperado: termina sin error.

- [ ] **Paso 2: Copiar `.env.local`** (está gitignored; sin él la web no arranca)

```powershell
Copy-Item C:\Users\danyj\cayla-retail\apps\web\.env.local C:\Users\danyj\cayla-retail\.claude\worktrees\pos-ticket-seller-selection-95d5b3\apps\web\.env.local
```
Si el archivo origen no existe, pídeselo al usuario; **no** lo inventes.

- [ ] **Paso 3: Traer `origin/main`** (PowerShell, no Bash)

```powershell
git fetch origin main
git merge origin/main --no-edit
```
Si hay conflicto, resuélvelo conservando **los dos lados** y avisa al usuario antes de seguir. Después: `git log --oneline -3`.

- [ ] **Paso 4: Comprobar que el timestamp de la migración sigue libre**

```bash
for r in $(git branch -r | grep -v HEAD); do git ls-tree --name-only $r supabase/migrations/ 2>/dev/null; done | sed 's#.*/##' | sort -u | tail -5
ls supabase/migrations | sed -E 's/_.*//' | sort | uniq -d
```
Esperado: ninguna migración remota ≥ `20260922143700` y ninguna línea en el `uniq -d`. Si `20260922143700` ya existe, usa el siguiente minuto no redondo y **cambia el nombre en todo el plan** (Tareas 1 y 8).

- [ ] **Paso 5: Anunciar la sesión** — agrega esta fila al final de la tabla «Activas ahora» de `docs/SESIONES-ACTIVAS.md`:

```markdown
| Claude (worktree `pos-ticket-seller-selection-95d5b3`) | `claude/pos-ticket-seller-selection-95d5b3` | **«Quién vendió» en el ticket del Punto de venta** (spec `docs/superpowers/specs/2026-09-21-vendedora-en-el-ticket-design.md`): `ventas.vendedora_id`, `colaboradores.atiende_en_caja`, `registrar_venta` gana `p_vendedora_id` (drop + create de la firma), `fn_vendedoras_de_sede`, `fn_candidatas_vendedora_de_sede`, `marcar_atiende_en_caja`, `fn_ventas_del_dia` (mismo cuerpo, cambia solo el join del vendedor). Toca `PuntoDeVenta.tsx`, `PuntoDeVentaTicket.tsx`, `ReciboTermico.tsx`, `vender/page.tsx`, `lib/vender-reglas.ts`, `lib/recibo-reglas.ts`, `lib/venta-detalle-reglas.ts`, `lib/ventas-historial*.ts`, `lib/ventas-v2.ts`, `app/actions/caja.ts`, `packages/database/src/types.ts` y la migración `20260922143700`. **No toca `/colaboradores`.** Migración solo en local; producción con OK de Felipe. | 2026-09-21 |
```

- [ ] **Paso 6: Línea base** — todo debe estar en verde **antes** de tocar código

```bash
pnpm -C apps/web typecheck
pnpm -C apps/web exec vitest run lib/vender-reglas.test.ts lib/recibo-reglas.test.ts lib/venta-detalle-reglas.test.ts lib/error-escritura.test.ts lib/ventas-historial-reglas.test.ts
```
Esperado: `tsc` sin errores y todos los tests en verde. Si algo ya falla, **detente y dilo**: no es tuyo y no se arregla aquí.

- [ ] **Paso 7: Commit**

```bash
git checkout -- graphify-out/cache/last_query_stamp
git add docs/SESIONES-ACTIVAS.md docs/superpowers/specs/2026-09-21-vendedora-en-el-ticket-design.md docs/superpowers/plans/2026-09-21-vendedora-en-el-ticket.md
git commit -F - <<'EOF'
docs(vender): spec, plan y fila de sesión de «quién vendió» en el ticket

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
```

---

### Tarea 1: Base de datos — la prueba primero, después la migración

**Archivos:**
- Crear: `scripts/pruebas/vendedora_en_venta.mjs`
- Crear: `supabase/migrations/20260922143700_vendedora_en_la_venta.sql` (armada con un script, ver Paso 5)
- Modificar: `package.json` (raíz), `.github/workflows/ci.yml`, `packages/database/src/types.ts`

**Consume:** `retail.registrar_venta` vigente (`20260919210000_venta_pagos_recibido.sql`), `retail.fn_ventas_del_dia` vigente (`20260921103000_…`), `suspender_colaborador` y `cambiar_ubicacion_colaborador` (`20260922110000_…`).

**Produce (lo que usan las tareas 4 a 7):**
- `retail.ventas.vendedora_id uuid null`; `retail.colaboradores.atiende_en_caja boolean not null default false`.
- `retail.registrar_venta(p_ubicacion_id, p_items, p_pagos, p_cliente_id, p_token, p_tipo_comprobante, p_cliente_tipo_doc, p_cliente_num_doc, p_cliente_nombre, p_codigo_descuento, p_nota, p_vendedora_id uuid default null) returns uuid`; lanza `venta_vendedora_no_es_de_la_sede` (con `detail` = el id) si no es colaboradora de esa sede.
- `retail.fn_vendedoras_de_sede(p_ubicacion_id uuid) → (persona_id uuid, nombre text)`: las **marcadas y activas** de la sede; vacío si quien pregunta no opera esa sede.
- `retail.fn_candidatas_vendedora_de_sede(p_ubicacion_id uuid) → (persona_id uuid, nombre text, atiende_en_caja boolean)`: todas las colaboradoras activas de la sede; solo líder.
- `retail.marcar_atiende_en_caja(p_persona_id uuid, p_atiende boolean) → void`: solo líder; solo a una `colaborador` con sede.

- [ ] **Paso 1: Escribir la prueba** `scripts/pruebas/vendedora_en_venta.mjs`

```javascript
#!/usr/bin/env node
/**
 * Pruebas de «quién vendió» contra el Postgres local — CAYLA V2.
 *
 * QUÉ PRUEBA. Que `registrar_venta` guarde a la vendedora (`ventas.vendedora_id`) SIN perder a la
 * sesión que cobró (`usuario_id`), que la valide contra la sede, y que las tres funciones nuevas
 * (`fn_vendedoras_de_sede`, `fn_candidatas_vendedora_de_sede`, `marcar_atiende_en_caja`) respeten
 * quién puede leer y escribir qué. Spec: docs/superpowers/specs/2026-09-21-vendedora-en-el-ticket-design.md.
 *
 * CÓMO. Mismo patrón que `registrar_venta.mjs` (léelo primero si algo no se entiende): cada escenario
 * corre en su propia transacción con ROLLBACK, hablando con Postgres por `docker exec … psql`, y simula
 * a Felipe (líder) o Micaela (colaboradora fija a Tienda Trujillo) con `set local request.jwt.claim.sub`.
 * Nunca commitea: corre seguro contra el Postgres local que comparten varios worktrees.
 *
 * NO ES un `*.test.ts` de vitest a propósito: `pnpm test` (CI incluido) corre sin Postgres ni Docker.
 *
 * USO
 *   pnpm pruebas:vendedora-en-venta    → necesita el stack local (`npx supabase start`)
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder — opera cualquier ubicación
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora — fija a Tienda Trujillo

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }
  );
}

// No lanza: un escenario que DEBE fallar no es un error del script, es lo que se está probando.
function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

function comoPersona(authUserId, sqlDespues) {
  return `
begin;
set local request.jwt.claim.sub = '${authUserId}';
${sqlDespues}
`;
}

/** Ids que casi todos los escenarios usan, y un estado limpio: este Postgres lo comparten varios
 *  worktrees y alguien pudo dejar marcas puestas a mano; dentro de la transacción no cuentan. */
const PERSONAS = `
select id as p_felipe from public.personas where auth_user_id = '${FELIPE}' \\gset
select id as p_mica from public.personas where auth_user_id = '${MICAELA}' \\gset
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lima from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
update retail.colaboradores set atiende_en_caja = false;
`;

/** Sede con piso/almacén, caja propia abierta y stock de sobra de BLU-EMMA-NEG-M (mismo fixture que
 *  `registrar_venta.mjs`). Deja `:'ubic'`, `:'v1'` y `:'v1_precio'` listos. Se corre como líder. */
function fixture({ ubicacionNombre = "Tienda Trujillo", colchon = 1000 } = {}) {
  return `
select id as ubic from retail.ubicaciones where nombre = '${ubicacionNombre}' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Almacén de tienda', 'almacen_tienda'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'almacen_tienda');
select (select count(*) from (
  select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'ubic' and estado = 'abierta'
) x) as _cerro_previa \\gset
select retail.abrir_caja(:'ubic', 100.00) as caja_id \\gset
select id as v1, precio as v1_precio from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select retail.fn_sububicacion_por_defecto(:'ubic', 'venta') as sub_piso \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v1', :'ubic', :'sub_piso', 'entrada', ${colchon}, 'colchón de prueba') returning id as mov1 \\gset
select retail.fn_aplicar_movimiento(:'mov1') as _d1 \\gset
`;
}

/** Una venta de 1 prenda en `:'ubic'`; `vendedora` es una expresión psql (`:'p_mica'`) o null. Deja `:'venta_id'`. */
function venta(vendedora) {
  return `select retail.registrar_venta(
  p_ubicacion_id => :'ubic',
  p_items => jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', 1, 'precio_unitario', :'v1_precio', 'descuento_unitario', 0)),
  p_pagos => jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', (:'v1_precio')::numeric)),
  p_token => gen_random_uuid()${vendedora ? `,\n  p_vendedora_id => ${vendedora}` : ""}
) as venta_id \\gset`;
}

const CASOS = [];
const exito = (nombre, sql, verificar) => CASOS.push({ nombre, tipo: "exito", sql, verificar });
const error = (nombre, sql, contiene) => CASOS.push({ nombre, tipo: "error", sql, contiene });

// ---------------------------------------------------------------------------
// El interruptor: quién lo cambia y a quién se le puede poner
// ---------------------------------------------------------------------------

error(
  "una colaboradora no puede elegir quiénes atienden en caja (solo un líder)",
  comoPersona(MICAELA, `${PERSONAS}select retail.marcar_atiende_en_caja(:'p_mica', true);\nrollback;\n`),
  "Solo un líder puede elegir quiénes atienden en caja"
);

error(
  "a un líder no se le puede marcar: solo a una colaboradora con sede",
  comoPersona(FELIPE, `${PERSONAS}select retail.marcar_atiende_en_caja(:'p_felipe', true);\nrollback;\n`),
  "Solo una colaboradora con acceso activo y sede asignada"
);

exito(
  "una sede sin marcadas devuelve la fila vacía; al marcar a Micaela, aparece ella",
  comoPersona(
    FELIPE,
    `${PERSONAS}select count(*) as antes from retail.fn_vendedoras_de_sede(:'tru') \\gset
select retail.marcar_atiende_en_caja(:'p_mica', true) as _m \\gset
select :'antes',
  (select count(*) from retail.fn_vendedoras_de_sede(:'tru')),
  (select persona_id::text from retail.fn_vendedoras_de_sede(:'tru') limit 1) = :'p_mica';
rollback;
`
  ),
  ([antes, despues, esElla]) => Number(antes) === 0 && Number(despues) === 1 && esElla === "t"
);

exito(
  "la fila la lee una colaboradora (la RLS de colaboradores no la deja leer la tabla, la función sí) y no ve otras sedes",
  comoPersona(
    FELIPE,
    `${PERSONAS}select retail.marcar_atiende_en_caja(:'p_mica', true) as _m \\gset
select atiende_en_caja as candidata_para_lider from retail.fn_candidatas_vendedora_de_sede(:'tru') where persona_id = :'p_mica' \\gset
set local request.jwt.claim.sub = '${MICAELA}';
select :'candidata_para_lider',
  (select count(*) from retail.fn_candidatas_vendedora_de_sede(:'tru')),
  (select count(*) from retail.fn_vendedoras_de_sede(:'tru')),
  (select count(*) from retail.fn_vendedoras_de_sede(:'lima'));
rollback;
`
  ),
  ([paraLider, candidatasParaColab, suSede, otraSede]) =>
    paraLider === "t" && Number(candidatasParaColab) === 0 && Number(suSede) === 1 && Number(otraSede) === 0
);

exito(
  "cambiarla de sede apaga la marca (no aparece sola en la otra tienda)",
  comoPersona(
    FELIPE,
    `${PERSONAS}select retail.marcar_atiende_en_caja(:'p_mica', true) as _m \\gset
select retail.cambiar_ubicacion_colaborador(:'p_mica', :'lima') as _c \\gset
select atiende_en_caja from retail.colaboradores where persona_id = :'p_mica';
rollback;
`
  ),
  ([marca]) => marca === "f"
);

// ---------------------------------------------------------------------------
// registrar_venta: guarda a la vendedora Y a la sesión, y la valida
// ---------------------------------------------------------------------------

exito(
  "la venta guarda quién atendió Y quién operó el equipo (dos cosas distintas)",
  comoPersona(
    FELIPE,
    `${PERSONAS}${fixture()}
${venta(":'p_mica'")}
select vendedora_id = :'p_mica', usuario_id = :'p_felipe' from retail.ventas where id = :'venta_id';
rollback;
`
  ),
  ([vendedora, sesion]) => vendedora === "t" && sesion === "t"
);

exito(
  "también cuando quien cobra es una colaboradora (la función valida como dueña, no con la RLS de ella)",
  comoPersona(
    FELIPE,
    `${PERSONAS}${fixture()}
set local request.jwt.claim.sub = '${MICAELA}';
${venta(":'p_mica'")}
select vendedora_id = :'p_mica', usuario_id = :'p_mica' from retail.ventas where id = :'venta_id';
rollback;
`
  ),
  ([vendedora, sesion]) => vendedora === "t" && sesion === "t"
);

exito(
  "sin vendedora la venta sigue igual: equipos sin recargar y cola offline vieja mandan null",
  comoPersona(
    FELIPE,
    `${PERSONAS}${fixture()}
${venta(null)}
select vendedora_id is null, usuario_id = :'p_felipe' from retail.ventas where id = :'venta_id';
rollback;
`
  ),
  ([sinVendedora, sesion]) => sinVendedora === "t" && sesion === "t"
);

error(
  "una vendedora de otra sede se rechaza (Micaela es de Trujillo, la venta es en Lima)",
  comoPersona(FELIPE, `${PERSONAS}${fixture({ ubicacionNombre: "Tienda Lima" })}\n${venta(":'p_mica'")}\nrollback;\n`),
  "venta_vendedora_no_es_de_la_sede"
);

error(
  "un líder no puede figurar como vendedora (no tiene sede asignada)",
  comoPersona(FELIPE, `${PERSONAS}${fixture()}\n${venta(":'p_felipe'")}\nrollback;\n`),
  "venta_vendedora_no_es_de_la_sede"
);

exito(
  "una colaboradora suspendida DESPUÉS de guardar una venta sin red todavía puede subirla",
  comoPersona(
    FELIPE,
    `${PERSONAS}${fixture()}
select retail.suspender_colaborador(:'p_mica') as _s \\gset
${venta(":'p_mica'")}
select vendedora_id = :'p_mica' from retail.ventas where id = :'venta_id';
rollback;
`
  ),
  ([guardada]) => guardada === "t"
);

// ---------------------------------------------------------------------------
// Lo que se lee después: «Ventas de hoy» y las sobrecargas
// ---------------------------------------------------------------------------

exito(
  "«Ventas de hoy» firma la venta con quien atendió, no con la sesión",
  comoPersona(
    FELIPE,
    `${PERSONAS}${fixture()}
${venta(":'p_mica'")}
select vendedor = (select nombres || ' ' || apellidos from public.personas where id = :'p_mica')
  from retail.fn_ventas_del_dia(:'ubic') where venta_id = :'venta_id';
rollback;
`
  ),
  ([esLaVendedora]) => esLaVendedora === "t"
);

exito(
  "queda UNA sola sobrecarga de registrar_venta y con los permisos de siempre",
  `begin;
select count(*), bool_and(p.proacl::text = '{postgres=X/postgres,authenticated=X/postgres}')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'retail' and p.proname = 'registrar_venta';
rollback;
`,
  ([cuantas, permisosIguales]) => Number(cuantas) === 1 && permisosIguales === "t"
);

// ---------------------------------------------------------------------------

function main() {
  try {
    execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "true"]);
  } catch {
    console.error(`No se pudo hablar con el contenedor ${CONTENEDOR_LOCAL}. Levanta el stack local con \`npx supabase start\` y vuelve a intentar.`);
    process.exit(1);
  }

  let fallos = 0;
  for (const caso of CASOS) {
    const resultado = correr(caso.sql);
    if (caso.tipo === "error") {
      if (resultado.ok) {
        fallos++;
        console.log(`✗ ${caso.nombre}\n    se esperaba un error ("${caso.contiene}") y no hubo ninguno`);
      } else if (!resultado.mensaje.includes(caso.contiene)) {
        fallos++;
        console.log(`✗ ${caso.nombre}\n    se esperaba un error con "${caso.contiene}", salió:\n    ${resultado.mensaje.trim().split("\n").join("\n    ")}`);
      } else {
        console.log(`✓ ${caso.nombre}`);
      }
    } else if (!resultado.ok) {
      fallos++;
      console.log(`✗ ${caso.nombre}\n    se esperaba éxito, falló:\n    ${resultado.mensaje.trim().split("\n").join("\n    ")}`);
    } else {
      const columnas = resultado.salida.split("|");
      if (!caso.verificar(columnas)) {
        fallos++;
        console.log(`✗ ${caso.nombre}\n    valores inesperados: ${JSON.stringify(columnas)}`);
      } else {
        console.log(`✓ ${caso.nombre}`);
      }
    }
  }

  console.log(`\n${CASOS.length - fallos}/${CASOS.length} pruebas en verde.`);
  process.exit(fallos > 0 ? 1 : 0);
}

main();
```

- [ ] **Paso 2: Registrar el script y el paso de CI**

En `package.json` (raíz), justo después de la línea `"pruebas:registrar-venta": …,`:

```json
    "pruebas:vendedora-en-venta": "node scripts/pruebas/vendedora_en_venta.mjs",
```

En `.github/workflows/ci.yml`, **justo después del paso `pruebas:registrar-venta`** (busca ese nombre; conserva la sangría y deja debajo los comentarios que pertenezcan al paso anterior):

```yaml
      - name: pruebas:vendedora-en-venta
        if: ${{ always() && steps.supabase.outcome == 'success' }}
        run: pnpm pruebas:vendedora-en-venta
```

- [ ] **Paso 3: Ver que la prueba falla**

```bash
pnpm pruebas:vendedora-en-venta
```
Esperado: **`0/13 pruebas en verde`** (o casi: los errores dicen que no existe la columna `atiende_en_caja` / la función `marcar_atiende_en_caja`). Si alguna pasa ya, la prueba no prueba nada: revísala.

- [ ] **Paso 4: Escribir el generador de la migración** — un archivo **fuera del repo** (por ejemplo `armar_migracion.py` en el directorio temporal de la sesión). Copia el cuerpo vigente de `registrar_venta` y de `fn_ventas_del_dia` **del archivo original** (así no se retipea ni un carácter) y aplica solo cuatro ediciones con `assert` de unicidad:

```python
"""Arma supabase/migrations/20260922143700_vendedora_en_la_venta.sql.
Uso (desde la raíz del repo):  python armar_migracion.py
"""
from pathlib import Path

RAIZ = Path(".")
ORIGEN_VENTA = RAIZ / "supabase/migrations/20260919210000_venta_pagos_recibido.sql"
ORIGEN_DIA = RAIZ / "supabase/migrations/20260921103000_ventas_del_dia_una_fila_por_venta_y_sin_anuladas.sql"
DESTINO = RAIZ / "supabase/migrations/20260922143700_vendedora_en_la_venta.sql"


def leer(p):
    return p.read_text(encoding="utf-8")  # modo texto: el CRLF de Windows llega como \n


def una_vez(texto, viejo, nuevo):
    assert texto.count(viejo) == 1, f"debía aparecer 1 vez y apareció {texto.count(viejo)}: {viejo[:70]!r}"
    return texto.replace(viejo, nuevo)


def bloque(texto, inicio, fin):
    i = texto.index(inicio)
    j = texto.index(fin, i) + len(fin)
    return texto[i:j]


# ---- registrar_venta: 4 ediciones sobre el cuerpo vigente ---------------------------------
venta = bloque(leer(ORIGEN_VENTA), "create or replace function retail.registrar_venta(", "\n$$;")
FIRMA_VIEJA = "uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text, text"
FIRMA_NUEVA = FIRMA_VIEJA + ", uuid"

venta = una_vez(
    venta,
    "create or replace function retail.registrar_venta(",
    f"drop function if exists retail.registrar_venta({FIRMA_VIEJA});\n\ncreate function retail.registrar_venta(",
)
venta = una_vez(
    venta,
    "  p_nota text default null\n)\nreturns uuid",
    "  p_nota text default null,\n  p_vendedora_id uuid default null\n)\nreturns uuid",
)
venta = una_vez(
    venta,
    "  select id into v_persona from personas where auth_user_id = auth.uid();\n",
    """  select id into v_persona from personas where auth_user_id = auth.uid();

  -- Quién atendió (la elige la caja compartida; el navegador solo PROPONE). Tiene que ser colaboradora
  -- de ESTA sede. Se acepta también a una suspendida: una venta guardada sin red no debe perderse porque
  -- un líder la suspendió entre que se cobró y se subió. NO se exige el interruptor `atiende_en_caja`
  -- (es comodidad de la pantalla, no un candado). Un líder no tiene sede fija: no es elegible.
  if p_vendedora_id is not null and not exists (
    select 1 from colaboradores
     where persona_id = p_vendedora_id and rol = 'colaborador' and ubicacion_asignada_id = p_ubicacion_id
    union all
    select 1 from colaboradores_suspendidos
     where persona_id = p_vendedora_id and rol = 'colaborador' and ubicacion_asignada_id = p_ubicacion_id
  ) then
    raise exception 'venta_vendedora_no_es_de_la_sede' using detail = p_vendedora_id::text;
  end if;
""",
)
venta = una_vez(
    venta,
    "insert into ventas (ubicacion_id, cliente_id, caja_id, usuario_id, token_cliente, nota)\n"
    "      values (p_ubicacion_id, p_cliente_id, v_caja_id, v_persona, p_token, nullif(btrim(p_nota), ''))",
    "insert into ventas (ubicacion_id, cliente_id, caja_id, usuario_id, vendedora_id, token_cliente, nota)\n"
    "      values (p_ubicacion_id, p_cliente_id, v_caja_id, v_persona, p_vendedora_id, p_token, nullif(btrim(p_nota), ''))",
)

# ---- fn_ventas_del_dia: una sola edición (el join del vendedor) ---------------------------
dia = bloque(leer(ORIGEN_DIA), "create or replace function retail.fn_ventas_del_dia(", "$function$;")
dia = una_vez(
    dia,
    "  left join public.personas per on per.id = v.usuario_id",
    "  -- El «vendedor» es quien atendió; si la caja no eligió a nadie (ventas anteriores), la sesión que cobró.\n"
    "  left join public.personas per on per.id = coalesce(v.vendedora_id, v.usuario_id)",
)

ENCABEZADO = """-- ============================================================================
-- 20260922143700_vendedora_en_la_venta.sql — CAYLA V2
--
-- QUÉ HACE («quién vendió» en el Punto de venta; spec
-- docs/superpowers/specs/2026-09-21-vendedora-en-el-ticket-design.md)
--   1) `colaboradores.atiende_en_caja`: un líder marca qué colaboradoras atienden en el mostrador
--      de su sede. Solo esas aparecen en la fila «Atendió» del ticket.
--   2) `ventas.vendedora_id`: quién atendió a la clienta. `usuario_id` NO cambia: sigue siendo la
--      sesión que cobró (auditoría de caja y de anulaciones).
--   3) `registrar_venta` gana `p_vendedora_id` (12.º parámetro, default null) y lo valida.
--   4) `fn_vendedoras_de_sede`, `fn_candidatas_vendedora_de_sede` y `marcar_atiende_en_caja`.
--   5) `fn_ventas_del_dia`: el «vendedor» pasa a ser `vendedora_id` y, si no hay, `usuario_id`.
--
-- POR QUÉ. En Tienda TRU hay varias colaboradoras y UN solo equipo de caja: `usuario_id` (la persona
-- de la sesión) no dice quién atendió a la clienta, y ni el ticket ni la boleta lo pueden decir.
--
-- DECISIONES
--   · `registrar_venta` cambia de firma (11 → 12 parámetros): `create or replace` dejaría DOS
--     versiones vivas (lo que tumbó `/productos`), así que se hace `drop function` de la de 11 y
--     `create` de la de 12, todo en la misma transacción. Los permisos se reponen idénticos.
--   · `p_vendedora_id` es opcional: la cola offline ya guardada y los equipos que aún no recargaron
--     siguen mandando 11 parámetros y la venta sale a nombre de la sesión, como hasta hoy.
--   · La marca vive en `colaboradores`. Suspender MUEVE la fila a `colaboradores_suspendidos`
--     (20260922110000): una suspendida sale de la fila del ticket y, al reactivarla, vuelve SIN marca
--     (un líder la marca otra vez). Cambiarla de sede apaga la marca (trigger de abajo).
--
-- SE ROMPE SI
--   · Se despliega la web ANTES de pegar esto: la fila «Atendió» no aparece (la lectura da PGRST202 y
--     se vende como siempre), pero nadie puede marcar a nadie. Orden: migración primero, web después.
--   · El ADR-0150 (roles a medida) agrega roles a `colaboradores`: `rol = 'colaborador'` en estas
--     funciones tendría que revisarse.
--
-- PRODUCCIÓN. Se pega ENTERA en una sola transacción en el SQL Editor de cayla-dynamic (ya trae el
-- `set search_path` y los `retail.`). Re-ejecutable. Después: una sola sobrecarga de `registrar_venta`
-- y `proacl = {postgres=X/postgres,authenticated=X/postgres}`.
-- ============================================================================

set search_path = retail, public, extensions;

-- ---------- 1) columnas ----------
alter table retail.colaboradores add column if not exists atiende_en_caja boolean not null default false;
comment on column retail.colaboradores.atiende_en_caja is
  'Un líder la marcó como colaboradora que atiende en el mostrador de su sede: aparece en la fila «Atendió» del Punto de venta. Se apaga al cambiarla de sede y no sobrevive a suspenderla y reactivarla.';

alter table retail.ventas add column if not exists vendedora_id uuid references public.personas (id);
comment on column retail.ventas.vendedora_id is
  'Quién atendió a la clienta (la elige la caja compartida). NULL = no se eligió: vale usuario_id, la sesión que cobró. usuario_id sigue siendo la auditoría de quién operó el equipo.';

-- ---------- 2) cambiarla de sede apaga la marca ----------
create or replace function retail.fn_colaboradores_desmarca_al_cambiar_de_sede() returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
begin
  if new.ubicacion_asignada_id is distinct from old.ubicacion_asignada_id then
    new.atiende_en_caja := false;
  end if;
  return new;
end;
$$;

drop trigger if exists colaboradores_desmarca_al_cambiar_de_sede on retail.colaboradores;
create trigger colaboradores_desmarca_al_cambiar_de_sede
  before update of ubicacion_asignada_id on retail.colaboradores
  for each row execute function retail.fn_colaboradores_desmarca_al_cambiar_de_sede();

-- ---------- 3) el interruptor y sus dos lecturas ----------
create or replace function retail.marcar_atiende_en_caja(p_persona_id uuid, p_atiende boolean) returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  if not fn_es_lider() then
    raise exception 'Solo un líder puede elegir quiénes atienden en caja';
  end if;
  update colaboradores set atiende_en_caja = coalesce(p_atiende, false)
   where persona_id = p_persona_id and rol = 'colaborador';
  if not found then
    raise exception 'Solo una colaboradora con acceso activo y sede asignada puede atender en caja — actualiza la pantalla';
  end if;
end;
$$;

-- La fila del ticket: las MARCADAS y ACTIVAS de la sede. La lee cualquiera que opere esa sede
-- (una colaboradora no puede leer `colaboradores` por RLS; por eso es security definer).
create or replace function retail.fn_vendedoras_de_sede(p_ubicacion_id uuid)
returns table (persona_id uuid, nombre text)
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select p.id, p.nombres || ' ' || p.apellidos
  from retail.colaboradores c
  join public.personas p on p.id = c.persona_id
  where c.rol = 'colaborador'
    and c.atiende_en_caja
    and c.ubicacion_asignada_id = p_ubicacion_id
    and p.estado = 'activo'
    and fn_puede_operar_ubicacion(p_ubicacion_id)
  order by p.nombres, p.apellidos;
$$;

-- El modal del líder: TODAS las colaboradoras activas de la sede, con su interruptor.
create or replace function retail.fn_candidatas_vendedora_de_sede(p_ubicacion_id uuid)
returns table (persona_id uuid, nombre text, atiende_en_caja boolean)
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select p.id, p.nombres || ' ' || p.apellidos, c.atiende_en_caja
  from retail.colaboradores c
  join public.personas p on p.id = c.persona_id
  where fn_es_lider()
    and c.rol = 'colaborador'
    and c.ubicacion_asignada_id = p_ubicacion_id
    and p.estado = 'activo'
  order by p.nombres, p.apellidos;
$$;

-- ---------- 4) registrar_venta: 12 parámetros (drop de la de 11 + create) ----------
"""

PERMISOS = f"""

-- ---------- 5) permisos: EXACTAMENTE los de hoy ({{postgres=X/postgres,authenticated=X/postgres}}) ----------
revoke all on function retail.registrar_venta({FIRMA_NUEVA}) from public, anon, authenticated, service_role;
grant execute on function retail.registrar_venta({FIRMA_NUEVA}) to authenticated;

revoke all on function retail.marcar_atiende_en_caja(uuid, boolean) from public, anon, authenticated, service_role;
grant execute on function retail.marcar_atiende_en_caja(uuid, boolean) to authenticated;

revoke all on function retail.fn_vendedoras_de_sede(uuid) from public, anon, authenticated, service_role;
grant execute on function retail.fn_vendedoras_de_sede(uuid) to authenticated;

revoke all on function retail.fn_candidatas_vendedora_de_sede(uuid) from public, anon, authenticated, service_role;
grant execute on function retail.fn_candidatas_vendedora_de_sede(uuid) to authenticated;

-- ---------- 6) fn_ventas_del_dia: misma firma, cambia solo el join del vendedor ----------
"""

COMENTARIO_DIA = """

comment on function retail.fn_ventas_del_dia(uuid) is
  'Lo vendido hoy (hora de Lima): UNA fila por venta completada, con su comprobante vigente (o el más nuevo si solo hay anulados/no emitidos). El vendedor es quien atendió (ventas.vendedora_id) y, si no se eligió, la sesión que cobró. Un líder ve todas las sedes o la que pida; el resto, la suya. Sin ventas anuladas (ADR-0110).';
"""

salida = ENCABEZADO + venta + PERMISOS + dia + COMENTARIO_DIA
DESTINO.write_text(salida, encoding="utf-8", newline="\n")  # LF, aunque Windows quiera CRLF
print(f"escrito {DESTINO} ({len(salida.splitlines())} líneas)")
```

- [ ] **Paso 5: Generar y revisar la migración**

```bash
python <ruta-del>/armar_migracion.py
```
Esperado: `escrito supabase/migrations/20260922143700_vendedora_en_la_venta.sql (… líneas)` sin `AssertionError`. Si un `assert` falla, el archivo de origen cambió: **no fuerces**, lee el cuerpo vigente y ajusta la edición.

Comprueba que el cuerpo de `registrar_venta` difiere del original **solo en los 4 sitios** (debe verse únicamente: el `drop`+`create`, la firma, el bloque de validación y el `insert`):

```bash
diff <(sed -n '/^create or replace function retail.registrar_venta(/,/^\$\$;/p' supabase/migrations/20260919210000_venta_pagos_recibido.sql) \
     <(sed -n '/^create function retail.registrar_venta(/,/^\$\$;/p' supabase/migrations/20260922143700_vendedora_en_la_venta.sql)
```
Esperado: 4 bloques de diferencias y nada más.

- [ ] **Paso 6: Ensayo con `rollback`** (no deja nada en la base compartida)

```bash
( echo "begin;"; tr -d '\r' < supabase/migrations/20260922143700_vendedora_en_la_venta.sql; echo; echo "rollback;" ) \
  | docker exec -i supabase_db_cayla-retail psql -q -U postgres -d postgres -v ON_ERROR_STOP=1
```
Esperado: termina sin error.

- [ ] **Paso 7: Aplicarla de verdad, solo en local, solo este archivo** (todo o nada)

```bash
( echo "begin;"; tr -d '\r' < supabase/migrations/20260922143700_vendedora_en_la_venta.sql; echo; echo "commit;" ) \
  | docker exec -i supabase_db_cayla-retail psql -q -U postgres -d postgres -v ON_ERROR_STOP=1
```
**No uses `migration up`**: la base local es compartida y `up` aplicaría todo lo pendiente del worktree, incluidas migraciones de otras ramas. Avisa al usuario de que se modificó la base local compartida. Si el sistema bloquea esta escritura persistente, **no la esquives con otra herramienta**: pídele al usuario que la autorice o que corra él el comando.

- [ ] **Paso 8: Ver que la prueba pasa**

```bash
pnpm pruebas:vendedora-en-venta
```
Esperado: **`13/13 pruebas en verde`**. Si «una sola sobrecarga…» falla por permisos, mira `select proacl from pg_proc …` y ajusta el bloque `PERMISOS` del generador (regenera y reaplica, es re-ejecutable). Corre también, para no romper nada vecino:

```bash
pnpm pruebas:registrar-venta
pnpm pruebas:ventas-del-dia
```
Esperado: ambos en verde (si alguno ya fallaba antes de tu cambio, dilo, no lo arregles aquí).

- [ ] **Paso 9: Tipos** — edita **a mano solo lo tuyo** en `packages/database/src/types.ts` (regenerar con `gen-types` arrastraría cambios de otras ramas a la base compartida). Busca vecinas alfabéticas con `grep -n` y respeta el formato:

  1. `colaboradores` → `Row`: `atiende_en_caja: boolean` (entre `agregado_por` y `created_at`); `Insert` y `Update`: `atiende_en_caja?: boolean`.
  2. `ventas` → `Row`: `vendedora_id: string | null` (después de `usuario_id`); `Insert` y `Update`: `vendedora_id?: string | null`.
  3. `registrar_venta` → `Args`: agrega `p_vendedora_id?: string` (después de `p_ubicacion_id`).
  4. En `Functions`, en su lugar alfabético:

```ts
      fn_candidatas_vendedora_de_sede: {
        Args: { p_ubicacion_id: string }
        Returns: {
          atiende_en_caja: boolean
          nombre: string
          persona_id: string
        }[]
      }
      fn_vendedoras_de_sede: {
        Args: { p_ubicacion_id: string }
        Returns: {
          nombre: string
          persona_id: string
        }[]
      }
      marcar_atiende_en_caja: {
        Args: { p_atiende: boolean; p_persona_id: string }
        Returns: undefined
      }
```

```bash
pnpm -C apps/web typecheck
```
Esperado: sin errores (aún nada usa lo nuevo).

- [ ] **Paso 10: Comprobar finales de línea y commitear**

```bash
git add supabase/migrations/20260922143700_vendedora_en_la_venta.sql scripts/pruebas/vendedora_en_venta.mjs package.json .github/workflows/ci.yml packages/database/src/types.ts
git ls-files --eol supabase/migrations/20260922143700_vendedora_en_la_venta.sql scripts/pruebas/vendedora_en_venta.mjs
```
Esperado: `i/lf` (el índice queda en LF). Luego:

```bash
git checkout -- graphify-out/cache/last_query_stamp
git commit -F - <<'EOF'
feat(vender): guarda quién atendió la venta (vendedora_id) y la valida contra la sede

registrar_venta gana p_vendedora_id (drop + create de la firma de 11 parámetros);
ventas.vendedora_id convive con usuario_id (la sesión que cobró). colaboradores
gana atiende_en_caja, con tres funciones nuevas y prueba contra Postgres local.
Solo aplicada en la base local; producción espera el OK del usuario.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
```

---

### Tarea 2: Las reglas puras de la fila «Atendió»

**Archivos:**
- Modificar: `apps/web/lib/vender-reglas.ts`
- Modificar (pruebas): `apps/web/lib/vender-reglas.test.ts`

**Produce (lo usan las tareas 4 y 5):**
```ts
export type Vendedora = { personaId: string; nombre: string };
export type CandidataVendedora = { personaId: string; nombre: string; atiende: boolean };
export function vendedoraDeLaVenta(vendedoras: readonly Vendedora[], elegidaId: string | null): string | null;
export function vendedoraPendiente(vendedoras: readonly Vendedora[], elegidaId: string | null): boolean;
export function atendioCorto(vendedoras: readonly Vendedora[], id: string | null): string | null;
// motivoBloqueoCobro({ …, vendedoraFalta?: boolean }) → "Elige quién atendió a la clienta."
```

- [ ] **Paso 1: Escribir las pruebas que fallan**

En `apps/web/lib/vender-reglas.test.ts`, agrega los nombres nuevos a los imports (junto a los que ya están):

```ts
// (1) después de  `  aplicarDescuentoMonto,`  y antes de  `  conCampanas,`
  atendioCorto,
// (2) después de  `  vueltoDe,`  y antes de  `  type CampanaLinea,`
  vendedoraDeLaVenta,
  vendedoraPendiente,
// (3) después de  `  type PagoAplicado,`  y antes de  `} from "./vender-reglas";`
  type Vendedora,
```

Y al **final del archivo** agrega:

```ts
// «¿Quién atendió a la clienta?» — la fila de chips del ticket. Con UN solo equipo de caja en la tienda, la
// sesión no dice quién vendió; la fila lo pregunta, y estas reglas deciden a quién se atribuye la venta y
// cuándo frenan el cobro. Con ninguna marcada en la sede NO se frena nada: si no, el día del despliegue
// nadie podría cobrar hasta que un líder marque a las colaboradoras.

const MARIA: Vendedora = { personaId: "p-maria", nombre: "María Pérez Soto" };
const ROSA: Vendedora = { personaId: "p-rosa", nombre: "Rosa Díaz Luna" };
const MARIA_L: Vendedora = { personaId: "p-maria-l", nombre: "María López Vera" };

describe("quién atendió — a quién se le atribuye la venta", () => {
  it("con ninguna marcada en la sede nadie se atribuye: sale a nombre de la sesión, como siempre", () => {
    expect(vendedoraDeLaVenta([], null)).toBeNull();
    expect(vendedoraPendiente([], null)).toBe(false);
  });

  it("con una sola marcada es ella, sin tocar nada", () => {
    expect(vendedoraDeLaVenta([MARIA], null)).toBe("p-maria");
    expect(vendedoraPendiente([MARIA], null)).toBe(false);
  });

  it("con varias y ninguna elegida falta elegir: el silencio no atribuye la venta a nadie", () => {
    expect(vendedoraDeLaVenta([MARIA, ROSA], null)).toBeNull();
    expect(vendedoraPendiente([MARIA, ROSA], null)).toBe(true);
  });

  it("con varias, la elegida es la que cuenta", () => {
    expect(vendedoraDeLaVenta([MARIA, ROSA], "p-rosa")).toBe("p-rosa");
    expect(vendedoraPendiente([MARIA, ROSA], "p-rosa")).toBe(false);
  });

  it("si la elegida ya no está en la fila (la desmarcaron con el ticket armado) vuelve a faltar elegir", () => {
    expect(vendedoraDeLaVenta([MARIA, ROSA], "p-otra")).toBeNull();
    expect(vendedoraPendiente([MARIA, ROSA], "p-otra")).toBe(true);
  });
});

describe("atendioCorto — el nombre que sale en el papel", () => {
  it("el primer nombre basta cuando no hay otra igual en la fila", () => {
    expect(atendioCorto([MARIA, ROSA], "p-maria")).toBe("María");
  });

  it("dos «María» en la fila se distinguen con la inicial del apellido", () => {
    expect(atendioCorto([MARIA, MARIA_L], "p-maria")).toBe("María P.");
    expect(atendioCorto([MARIA, MARIA_L], "p-maria-l")).toBe("María L.");
  });

  it("sin elegida o con una que no está en la fila no se inventa nadie", () => {
    expect(atendioCorto([MARIA, ROSA], null)).toBeNull();
    expect(atendioCorto([MARIA, ROSA], "p-otra")).toBeNull();
  });
});

describe("motivoBloqueoCobro — quién atendió", () => {
  it("con varias marcadas y ninguna elegida frena ya al armar, con el mensaje exacto", () => {
    expect(motivoBloqueoCobro({ ...listo, momento: "armar", pagos: [], vendedoraFalta: true })).toBe("Elige quién atendió a la clienta.");
  });

  it("se pide antes que el pago: primero quién atendió, después la plata", () => {
    expect(motivoBloqueoCobro({ ...listo, pagos: [], vendedoraFalta: true })).toBe("Elige quién atendió a la clienta.");
  });

  it("la caja cerrada y el ticket vacío mandan sobre ella", () => {
    expect(motivoBloqueoCobro({ ...listo, cajaAbierta: false, vendedoraFalta: true })).toBe("Abre la caja para vender.");
    expect(motivoBloqueoCobro({ ...listo, prendas: 0, vendedoraFalta: true })).toBe("Agrega una prenda para cobrar.");
  });

  it("con la vendedora elegida (o sin la regla) no bloquea", () => {
    expect(motivoBloqueoCobro({ ...listo, vendedoraFalta: false })).toBeNull();
    expect(motivoBloqueoCobro(listo)).toBeNull();
  });
});
```

- [ ] **Paso 2: Ver que fallan**

```bash
pnpm -C apps/web exec vitest run lib/vender-reglas.test.ts
```
Esperado: FAIL (`vendedoraDeLaVenta is not a function` o error de import).

- [ ] **Paso 3: Implementar**

En `apps/web/lib/vender-reglas.ts`, junto a la línea de imports existente (`import { METODOS_PAGO, type MetodoPago } from "@cayla-retail/shared";`):

```ts
import { nombresCortos } from "./nombre-integrante";
```

Al **final del archivo**, agrega:

```ts
// ---- «¿Quién atendió a la clienta?» (spec 2026-09-21-vendedora-en-el-ticket) -----------------
// En una tienda con UN equipo de caja y varias colaboradoras, la sesión no dice quién vendió. Un líder
// marca quiénes atienden en el mostrador (`colaboradores.atiende_en_caja`) y la caja lo pregunta con una
// fila de chips. Estas reglas viven acá, sin React, para probarlas sin navegador.

/** Una colaboradora que atiende en caja en la sede (una fila de `fn_vendedoras_de_sede`). */
export type Vendedora = { personaId: string; nombre: string };

/** Una colaboradora de la sede con su interruptor «atiende en caja» (fila de `fn_candidatas_vendedora_de_sede`). */
export type CandidataVendedora = { personaId: string; nombre: string; atiende: boolean };

/**
 * A quién se le atribuye la venta. Con una sola marcada es ella, sin tocar nada; con varias, la que se
 * eligió (si sigue en la fila: un líder pudo desmarcarla con el ticket armado); con ninguna marcada, nadie —
 * la venta sale a nombre de la sesión, como antes de existir la fila. Nunca hay preselección con varias:
 * el silencio no debe atribuir la venta a nadie.
 */
export function vendedoraDeLaVenta(vendedoras: readonly Vendedora[], elegidaId: string | null): string | null {
  if (vendedoras.length === 0) return null;
  if (vendedoras.length === 1) return vendedoras[0].personaId;
  return vendedoras.some((v) => v.personaId === elegidaId) ? elegidaId : null;
}

/** Falta elegir: solo cuando hay dos o más marcadas y todavía no se tocó ninguna. */
export function vendedoraPendiente(vendedoras: readonly Vendedora[], elegidaId: string | null): boolean {
  return vendedoras.length >= 2 && vendedoraDeLaVenta(vendedoras, elegidaId) === null;
}

/** El nombre que sale en el papel: el primer nombre, y la inicial del apellido solo si otra de la fila comparte
 *  primer nombre (`nombresCortos`, la misma regla de «Ventas de hoy»). `null` si no hay a quién nombrar. */
export function atendioCorto(vendedoras: readonly Vendedora[], id: string | null): string | null {
  const v = vendedoras.find((x) => x.personaId === id);
  return v ? (nombresCortos(vendedoras.map((x) => x.nombre)).get(v.nombre) ?? null) : null;
}
```

Y en `motivoBloqueoCobro` (mismo archivo), agrega el campo al tipo del argumento y la regla, **después** del chequeo de prendas y **antes** del de `momento`:

```ts
// tipo del argumento — agrega, después de `facturaSinRuc: boolean;`:
  /** Hay 2 o más marcadas en la sede y todavía no se eligió quién atendió (`vendedoraPendiente`). Ausente = no aplica. */
  vendedoraFalta?: boolean;
```
```ts
// cuerpo — la secuencia queda así:
  if (!v.cajaAbierta) return "Abre la caja para vender.";
  if (v.prendas === 0) return "Agrega una prenda para cobrar.";
  if (v.vendedoraFalta) return "Elige quién atendió a la clienta.";
  if (v.momento !== "cobrar") return null;
```

- [ ] **Paso 4: Ver que pasan**

```bash
pnpm -C apps/web exec vitest run lib/vender-reglas.test.ts
pnpm -C apps/web typecheck
```
Esperado: todo verde (las pruebas viejas de `motivoBloqueoCobro` siguen pasando: el campo es opcional).

- [ ] **Paso 5: Commit**

```bash
git checkout -- graphify-out/cache/last_query_stamp
git add apps/web/lib/vender-reglas.ts apps/web/lib/vender-reglas.test.ts
git commit -F - <<'EOF'
feat(vender): reglas de quién atendió (a quién se atribuye y cuándo frena el cobro)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
```

---

### Tarea 3: El recibo, el detalle, el error traducido y los parámetros

**Archivos:**
- Modificar: `apps/web/lib/recibo-reglas.ts`, `apps/web/lib/venta-detalle-reglas.ts`, `apps/web/lib/error-escritura.ts`, `apps/web/lib/ventas-offline.ts`
- Modificar (pruebas): `apps/web/lib/recibo-reglas.test.ts`, `apps/web/lib/venta-detalle-reglas.test.ts`, `apps/web/lib/error-escritura.test.ts`

**Consume:** `nombresCortos` (`lib/nombre-integrante.ts`).
**Produce:** `ReciboVenta.atendio?: string | null`; `armarRecibo({ …, atendio?: string | null })`; `ParamsRegistrarVenta.p_vendedora_id?: string`; el error `venta_vendedora_no_es_de_la_sede` traducido.

- [ ] **Paso 1: Escribir las pruebas que fallan**

**a) `recibo-reglas.test.ts`** — agrega al final:

```ts
describe("armarRecibo — quién atendió", () => {
  const entrada = {
    comprobante: { tipo: "boleta" as const, serie: "B001", numero: 2, created_at: "2026-09-19T17:05:00Z" },
    sede: "Tienda Trujillo",
    cliente: { tipoDoc: "sin_documento" as const, numDoc: null, nombre: null },
    lineas: [{ cantidad: 1, referencia: "Polo Zoe", codigo: "POL-1", precioUnitario: 50, descuentoUnitario: 0 }],
    pagos: [{ metodo: "efectivo" as const, monto: 50 }],
    tasaIgv: 0.18,
  };

  it("lleva el nombre corto de quien atendió, para el papel", () => {
    expect(armarRecibo({ ...entrada, atendio: "María" }).atendio).toBe("María");
  });

  it("sin dato queda en null: no se inventa a nadie", () => {
    expect(armarRecibo(entrada).atendio).toBeNull();
  });
});
```

**b) `venta-detalle-reglas.test.ts`** — inserta este `it` **justo antes** de `it("sin comprobante no hay recibo, pero el detalle se arma igual", () => {`:

```ts
  it("el recibo dice quién atendió (primer nombre) y sin vendedor no se inventa", () => {
    expect(d.recibo?.atendio).toBe("Rosa");
    expect(armarDetalleVenta(filas, { ...ctx, vendedor: "Rosa Díaz Luna" }).recibo?.atendio).toBe("Rosa");
    expect(armarDetalleVenta(filas, { ...ctx, vendedor: null }).recibo?.atendio).toBeNull();
    expect(armarDetalleVenta(filas, { ...ctx, vendedor: "—" }).recibo?.atendio).toBeNull();
  });

```

**c) `error-escritura.test.ts`** — inserta este `it` **justo antes** de `it("variante restringida a otra sede en un traslado: misma frase, del lado de trasladar", () => {`:

```ts
  it("vendedora que ya no es de la sede: dice qué hacer, no el código crudo", () => {
    const salida = traducirError({ message: "venta_vendedora_no_es_de_la_sede", details: "00000000-0000-4000-8000-000000000001", code: "P0001" }, "registrar la venta");
    expect(salida).toBe("La colaboradora elegida ya no es de esta sede: elige otra y cobra de nuevo.");
  });

```

- [ ] **Paso 2: Ver que fallan**

```bash
pnpm -C apps/web exec vitest run lib/recibo-reglas.test.ts lib/venta-detalle-reglas.test.ts lib/error-escritura.test.ts
```
Esperado: FAIL en los tres archivos (las pruebas nuevas).

- [ ] **Paso 3: Implementar**

**a) `recibo-reglas.ts`** — en `ReciboVenta`, agrega **después de `vueltoTotal: number;`**:

```ts
  /** Quién atendió a la clienta (nombre corto), si la caja lo sabe. Ausente/`null` en las ventas anteriores o sin elección. */
  atendio?: string | null;
```
En `armarRecibo`, agrega al tipo de `entrada` (después de `tasaIgv: number;`) y al objeto devuelto:

```ts
  tasaIgv: number;
  /** Nombre corto de quien atendió; ver `atendioCorto` en `vender-reglas.ts`. */
  atendio?: string | null;
}): ReciboVenta {
```
```ts
    vueltoTotal: redondear2(pagos.reduce((acc, p) => acc + p.vuelto, 0)),
    atendio: entrada.atendio ?? null,
  };
```

**b) `venta-detalle-reglas.ts`** — agrega el import arriba, junto a los demás:

```ts
import { nombresCortos } from "./nombre-integrante";
```
En `armarDetalleVenta`, antes de `const c = filas.comprobante;`:

```ts
  // El papel dice el primer nombre de quien atendió (`ctx.vendedor` llega completo, o `null`/«—» si no se sabe).
  const atendio = ctx.vendedor ? (nombresCortos([ctx.vendedor]).get(ctx.vendedor) ?? null) : null;
```
y en la llamada a `armarRecibo`, después de `tasaIgv: 0.18,`:

```ts
        tasaIgv: 0.18,
        atendio,
```

**c) `error-escritura.ts`** — inserta esta entrada **después** de la de `venta_variante_restringida_a_otra_sede` (la que termina en `— no se puede vender desde acá.\`,\n  },`):

```ts
  {
    // 20260922143700_vendedora_en_la_venta.sql — `registrar_venta` exige que quien atendió (`p_vendedora_id`)
    // sea colaboradora de ESA sede. La fila del ticket solo ofrece las de la sede, así que esto aparece si un
    // líder la quitó o la cambió de sede entre que se guardó una venta sin red y se subió.
    marca: "venta_vendedora_no_es_de_la_sede",
    frase: () => "La colaboradora elegida ya no es de esta sede: elige otra y cobra de nuevo.",
  },
```

**d) `ventas-offline.ts`** — en `ParamsRegistrarVenta`, cambia el comentario `(11 parámetros, hoy)` por `(12 parámetros, hoy)` y agrega el campo al final del tipo:

```ts
  p_nota?: string;
  /** Quién atendió (`fn_vendedoras_de_sede`). Solo viaja si hay a quién atribuirla; la base valida que sea de la sede. */
  p_vendedora_id?: string;
};
```

- [ ] **Paso 4: Ver que pasan**

```bash
pnpm -C apps/web exec vitest run lib/recibo-reglas.test.ts lib/venta-detalle-reglas.test.ts lib/error-escritura.test.ts lib/ventas-offline.test.ts lib/boleta-a4-reglas.test.ts
pnpm -C apps/web typecheck
```
Esperado: todo verde. Si `error-escritura.ts` tiene el `frase` tipado como `(detalle: string) => string`, `() => …` es asignable.

- [ ] **Paso 5: Commit**

```bash
git checkout -- graphify-out/cache/last_query_stamp
git add apps/web/lib/recibo-reglas.ts apps/web/lib/recibo-reglas.test.ts apps/web/lib/venta-detalle-reglas.ts apps/web/lib/venta-detalle-reglas.test.ts apps/web/lib/error-escritura.ts apps/web/lib/error-escritura.test.ts apps/web/lib/ventas-offline.ts
git commit -F - <<'EOF'
feat(vender): el recibo lleva quién atendió y la RPC acepta p_vendedora_id en la cola offline

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
```

---

### Tarea 4: La fila de chips en el ticket (cableado del Punto de venta)

**Archivos:**
- Crear: `apps/web/lib/vendedoras.ts`, `apps/web/components/VendedorasFila.tsx`
- Modificar: `apps/web/app/(app)/vender/page.tsx`, `apps/web/components/PuntoDeVenta.tsx`, `apps/web/components/PuntoDeVentaTicket.tsx`

**Consume:** `Vendedora`, `vendedoraDeLaVenta`, `vendedoraPendiente`, `atendioCorto`, `motivoBloqueoCobro({ vendedoraFalta })` (Tarea 2); `ParamsRegistrarVenta.p_vendedora_id`, `armarRecibo({ atendio })` (Tarea 3); `fn_vendedoras_de_sede` y los tipos (Tarea 1).
**Produce (lo usa la Tarea 5):** `getCandidatasVendedora(ubicacionId)`; `VendedorasFila` con la prop opcional `onElegirQuienes`.

- [ ] **Paso 1: Las lecturas del servidor** — crea `apps/web/lib/vendedoras.ts`:

```ts
import { createClient } from "@/lib/supabase/server";
import type { CandidataVendedora, Vendedora } from "@/lib/vender-reglas";

/**
 * Las colaboradoras que atienden en caja en una sede: la fila «Atendió» del ticket del Punto de venta.
 * Es un dato secundario: si la lectura falla, la caja sigue vendiendo (a nombre de la sesión) y la pantalla
 * lo dice. Si la función todavía no existe en esta base (PGRST202: la web se desplegó antes que la
 * migración), no hay a quién elegir y se vende como siempre, sin aviso — el mismo criterio que
 * `campanas_vigentes`.
 */
export async function getVendedorasDeSede(ubicacionId: string): Promise<{ vendedoras: Vendedora[]; noCargaron: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_vendedoras_de_sede", { p_ubicacion_id: ubicacionId });
  if (error) return { vendedoras: [], noCargaron: error.code !== "PGRST202" };
  return { vendedoras: (data ?? []).map((v) => ({ personaId: v.persona_id, nombre: v.nombre })), noCargaron: false };
}

/** Todas las colaboradoras activas de la sede con su interruptor, para el modal del líder. Vacío si no se pudo leer. */
export async function getCandidatasVendedora(ubicacionId: string): Promise<CandidataVendedora[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_candidatas_vendedora_de_sede", { p_ubicacion_id: ubicacionId });
  if (error) return [];
  return (data ?? []).map((c) => ({ personaId: c.persona_id, nombre: c.nombre, atiende: c.atiende_en_caja }));
}
```

- [ ] **Paso 2: El componente de la fila** — crea `apps/web/components/VendedorasFila.tsx`:

```tsx
import { nombresCortos } from "@/lib/nombre-integrante";
import type { Vendedora } from "@/lib/vender-reglas";

type Props = {
  vendedoras: readonly Vendedora[];
  /** La que se tocó (o la única marcada); `null` = falta elegir. */
  elegidaId: string | null;
  onElegir: (personaId: string) => void;
  /** La lectura falló: la venta saldrá a nombre de la sesión y hay que decirlo. */
  noCargaron: boolean;
  deshabilitada: boolean;
  /** Solo un líder la recibe: abre el modal para elegir quiénes atienden. */
  onElegirQuienes?: () => void;
};

/**
 * «¿Quién atendió a la clienta?» — la fila de chips arriba del ticket. Un toque, sin desplegable: en una
 * tienda con varias colaboradoras y UN equipo de caja, la sesión no dice quién vendió. Sin estado ni hooks:
 * la elección vive en `PuntoDeVenta`, que la manda a `registrar_venta`.
 *
 *  · 2 o más marcadas: los chips, SIN ninguna preseleccionada (el silencio no atribuye la venta a nadie).
 *  · Ninguna o una: sin chips. Solo el líder ve el enlace para elegir quiénes atienden.
 *  · La lectura falló: se dice, porque esa venta saldrá a nombre de la sesión.
 */
export function VendedorasFila({ vendedoras, elegidaId, onElegir, noCargaron, deshabilitada, onElegirQuienes }: Props) {
  if (noCargaron) {
    return (
      <p role="status" className="border-b border-sand bg-ambar/10 px-5 py-2 text-[11px] text-ambar-profundo">
        No se pudo leer quién atiende en caja: esta venta saldrá a nombre de la sesión.
      </p>
    );
  }
  const conChips = vendedoras.length >= 2;
  if (!conChips && !onElegirQuienes) return null;

  const cortos = nombresCortos(vendedoras.map((v) => v.nombre));
  return (
    <div className="border-b border-sand px-5 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="label-cayla text-[11px] text-tinta/60">
          {conChips ? "Atendió" : vendedoras.length === 1 ? `Atiende ${cortos.get(vendedoras[0].nombre) ?? ""}` : "Nadie marcada para atender en caja"}
        </p>
        {onElegirQuienes && (
          <button
            type="button"
            onClick={onElegirQuienes}
            disabled={deshabilitada}
            className="label-cayla text-[11px] text-tinta/70 underline-offset-2 transition-colors hover:text-rojo hover:underline"
          >
            {vendedoras.length === 0 ? "Elegir quiénes atienden" : "Cambiar quiénes atienden"}
          </button>
        )}
      </div>
      {conChips && (
        <div role="group" aria-label="¿Quién atendió a la clienta?" className="mt-2 flex flex-wrap gap-1.5">
          {vendedoras.map((v) => {
            const activa = v.personaId === elegidaId;
            return (
              <button
                key={v.personaId}
                type="button"
                title={v.nombre}
                aria-pressed={activa}
                disabled={deshabilitada}
                onClick={() => onElegir(v.personaId)}
                className={`h-10 rounded-full border px-4 text-sm transition-colors ${
                  activa ? "border-tinta bg-tinta text-papel" : "border-tinta/25 bg-crema text-tinta hover:border-rojo hover:text-rojo"
                }`}
              >
                {cortos.get(v.nombre) ?? v.nombre}
              </button>
            );
          })}
        </div>
      )}
      {vendedoras.length === 0 && <p className="mt-1 text-[11px] text-tinta/60">Mientras tanto, las ventas salen a nombre de esta sesión.</p>}
    </div>
  );
}
```

- [ ] **Paso 3: La página lee y pasa** — `apps/web/app/(app)/vender/page.tsx`:

Import (junto a los demás):
```ts
import { getVendedorasDeSede } from "@/lib/vendedoras";
```
En el `Promise.all` de `Caja()`, agrega un séptimo elemento y desestructúralo:

```ts
  const [variantes, caja, resStock, ubicaciones, stockAqui, resCampanas, { vendedoras, noCargaron: vendedorasNoCargaron }] = await Promise.all([
    getCatalogo(),
    getCajaAbierta(persona.ubicacionId),
    supabase.rpc("fn_stock_por_sede"),
    getUbicaciones(),
    getStockPorUbicacion(persona.ubicacionId),
    // (el comentario de campañas que ya está aquí queda igual)
    supabase.rpc("campanas_vigentes"),
    // Quiénes atienden en caja en esta sede. Dato secundario: si falla, se vende igual y se avisa.
    getVendedorasDeSede(persona.ubicacionId),
  ]);
```
Y en el `<PuntoDeVenta … />` agrega:
```tsx
      vendedoras={vendedoras}
      vendedorasNoCargaron={vendedorasNoCargaron}
```

- [ ] **Paso 4: El estado y el cobro en `PuntoDeVenta.tsx`** — todas son ediciones puntuales:

  1. **Imports** de `@/lib/vender-reglas` (mismo bloque `import { … } from "@/lib/vender-reglas";`), tres ediciones:
     - después de `  aplicarDescuentoMonto,` agrega `  atendioCorto,`
     - después de `  vueltoDe,` agrega `  vendedoraDeLaVenta,` y `  vendedoraPendiente,`
     - después de `  type PagoAplicado,` agrega `  type Vendedora,`
  2. **Tipo de la espera** — reemplaza
     `export type TicketEnEspera = { id: string; creadoEn: string; carrito: ItemCarrito[]; nota: string; codigoDescuento: string };`
     por
     ```ts
     export type TicketEnEspera = {
       id: string;
       creadoEn: string;
       carrito: ItemCarrito[];
       nota: string;
       codigoDescuento: string;
       /** Quién atendía a la clienta. Un ticket guardado antes de la fila «Atendió» no lo trae. */
       vendedoraId?: string | null;
     };
     ```
  3. **Props** — después de `campanasNoCargaron?: boolean;` agrega:
     ```ts
       /** Las colaboradoras que atienden en caja en esta sede (`fn_vendedoras_de_sede`). Ninguna = la sede aún no eligió
        *  quiénes: se vende como antes, a nombre de la sesión. Una sola = es ella, sin tocar nada. */
       vendedoras: Vendedora[];
       /** La lectura de arriba falló (no es «la función aún no existe»): se vende igual, pero a nombre de la sesión. */
       vendedorasNoCargaron?: boolean;
     ```
     y en la firma del componente agrega `vendedoras, vendedorasNoCargaron = false,` a la desestructuración (después de `campanasNoCargaron = false,`).
  4. **Estado** — después de `const [nota, setNota] = useState("");` agrega:
     ```ts
       // Quién atendió a la clienta (la fila de chips del ticket). `null` = todavía no se tocó ninguna.
       const [vendedoraElegida, setVendedoraElegida] = useState<string | null>(null);
     ```
  5. **`limpiarTicket`** — reemplaza
     ```ts
         setNota("");
         setCodigoDescuento("");
         setPagos([]);
         setDescuento(DESCUENTO_VACIO);
     ```
     por el mismo bloque con `    setVendedoraElegida(null);` agregado después de `setDescuento(DESCUENTO_VACIO);`.
  6. **`dejarEnEspera`** — en `persistirEspera([...enEspera, { id: crypto.randomUUID(), creadoEn: new Date().toISOString(), carrito, nota, codigoDescuento }]);` agrega `, vendedoraId: vendedoraElegida` después de `codigoDescuento`.
  7. **`retomar`** — en la línea `carrito.length > 0 ? { id: crypto.randomUUID(), creadoEn: new Date().toISOString(), carrito, nota, codigoDescuento } : null;` agrega igual `, vendedoraId: vendedoraElegida`; y después de `setCodigoDescuento(ticket.codigoDescuento);` agrega `    setVendedoraElegida(ticket.vendedoraId ?? null);`.
  8. **Derivados y bloqueo** — reemplaza
     `const motivoBloqueo = motivoBloqueoCobro({ cajaAbierta: !bloqueado, prendas, momento, total, pagos, facturaSinRuc });`
     por
     ```ts
       // Quién atendió: con una sola marcada es ella; con varias, la que se tocó (si sigue en la fila); con ninguna,
       // nadie (la venta sale a nombre de la sesión, como antes). `vendedoraFalta` frena el cobro solo con 2 o más.
       const vendedoraId = vendedoraDeLaVenta(vendedoras, vendedoraElegida);
       const vendedoraFalta = vendedoraPendiente(vendedoras, vendedoraElegida);
       const motivoBloqueo = motivoBloqueoCobro({ cajaAbierta: !bloqueado, prendas, momento, total, pagos, facturaSinRuc, vendedoraFalta });
     ```
  9. **`cobrar()` → parámetros** — reemplaza `      p_nota: nota.trim() || undefined,\n    };` por
     ```ts
           p_nota: nota.trim() || undefined,
           // Solo viaja si hay a quién atribuirla: sin ella la clave ni aparece y la base la deja vacía.
           p_vendedora_id: vendedoraId ?? undefined,
         };
     ```
  10. **`cobrar()` → recibo** — reemplaza `          pagos,\n          tasaIgv: 0.18,\n        });` por
      ```ts
                pagos,
                tasaIgv: 0.18,
                atendio: atendioCorto(vendedoras, vendedoraId),
              });
      ```
  11. **`cerrarVentaRegistrada`** — reemplaza `    setCodigoDescuento("");\n    setNota("");\n    setMomento("armar");\n  }` por el mismo texto con `    setVendedoraElegida(null);` agregado antes de `setMomento("armar");`.
  12. **El `<PuntoDeVentaTicket … />`** — después de la línea `          motivoBloqueo={motivoBloqueo}` agrega:
      ```tsx
                vendedoras={vendedoras}
                vendedoraId={vendedoraId}
                onVendedora={setVendedoraElegida}
                vendedorasNoCargaron={vendedorasNoCargaron}
      ```

- [ ] **Paso 5: La fila dentro del ticket** — `PuntoDeVentaTicket.tsx`:

  1. Import nuevo, junto a los otros componentes: `import { VendedorasFila } from "@/components/VendedorasFila";` y agrega `type Vendedora,` al bloque `import { … } from "@/lib/vender-reglas";` (el que ya trae `desgloseIgv`).
  2. En `type Props`, reemplaza
     ```
       motivoBloqueo: string | null;
       // Pago mixto
     ```
     por
     ```ts
       motivoBloqueo: string | null;
       // Quién atendió a la clienta — la fila de chips arriba (`VendedorasFila`); las reglas viven en `vender-reglas`
       vendedoras: Vendedora[];
       vendedoraId: string | null;
       onVendedora: (personaId: string) => void;
       vendedorasNoCargaron: boolean;
       // Pago mixto
     ```
     (conserva el resto del comentario de «Pago mixto» tal cual).
  3. En la desestructuración de la función, reemplaza `  motivoBloqueo,\n  pagos,\n  restante,` por
     ```
       motivoBloqueo,
       vendedoras,
       vendedoraId,
       onVendedora,
       vendedorasNoCargaron,
       pagos,
       restante,
     ```
  4. Inserta la fila entre la cabecera y el `<form>`: reemplaza
     ```
           <form
             id={id}
             onSubmit={onCobrar}
     ```
     por
     ```tsx
           {/* Quién atendió: visible al armar y al cobrar (la elección la puede hacer en cualquiera de los dos),
               nunca dentro del formulario — son botones sueltos y no deben enviarlo. */}
           {(momentoMostrado === "armar" || cobrando) && (
             <VendedorasFila
               vendedoras={vendedoras}
               elegidaId={vendedoraId}
               onElegir={onVendedora}
               noCargaron={vendedorasNoCargaron}
               deshabilitada={bloqueado}
             />
           )}

           <form
             id={id}
             onSubmit={onCobrar}
     ```

- [ ] **Paso 6: Verificar**

```bash
pnpm -C apps/web typecheck
pnpm -C apps/web exec eslint components/VendedorasFila.tsx components/PuntoDeVenta.tsx components/PuntoDeVentaTicket.tsx lib/vendedoras.ts "app/(app)/vender/page.tsx"
pnpm -C apps/web exec vitest run
```
Esperado: `tsc` y `eslint` sin errores; toda la suite en verde. (Aún no se ve nada en pantalla: sin marcadas la fila no aparece salvo para un líder — y el líder aún no recibe el enlace, eso es la Tarea 5.)

- [ ] **Paso 7: Commit**

```bash
git checkout -- graphify-out/cache/last_query_stamp
git add apps/web/lib/vendedoras.ts apps/web/components/VendedorasFila.tsx "apps/web/app/(app)/vender/page.tsx" apps/web/components/PuntoDeVenta.tsx apps/web/components/PuntoDeVentaTicket.tsx
git commit -F - <<'EOF'
feat(vender): fila «Atendió» en el ticket con chips, sin preselección y con la venta a nombre de la elegida

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
```

---

### Tarea 5: El líder elige quiénes atienden en caja

**Archivos:**
- Crear: `apps/web/components/ElegirVendedorasModal.tsx`
- Modificar: `apps/web/app/(app)/vender/page.tsx`, `apps/web/components/PuntoDeVenta.tsx`, `apps/web/components/PuntoDeVentaTicket.tsx`

**Consume:** `getCandidatasVendedora` (Tarea 4), `CandidataVendedora` (Tarea 2), `marcar_atiende_en_caja` (Tarea 1), `VendedorasFila.onElegirQuienes` (Tarea 4).

- [ ] **Paso 1: El modal** — crea `apps/web/components/ElegirVendedorasModal.tsx`. Usa `botonPrimario` como lo hace `PuntoDeVenta.tsx` (`grep -n "botonPrimario" apps/web/components/PuntoDeVenta.tsx`) — es un `className`:

```tsx
"use client";

import { useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Modal, botonPrimario } from "@/components/ui/Modal";
import type { CandidataVendedora } from "@/lib/vender-reglas";

/**
 * «¿Quiénes atienden en caja?» — solo lo abre un líder (la RPC lo exige). Marca qué colaboradoras de la sede
 * aparecen como chips en el ticket del Punto de venta. No toca ventas ya hechas. Las filas llegan del
 * servidor (`getCandidatasVendedora`); cada casilla guarda sola y, al cerrar, si algo cambió se vuelve a
 * pedir la página para que la fila del ticket se actualice.
 */
export function ElegirVendedorasModal({
  candidatas,
  ubicacionEtiqueta,
  onClose,
  alCerrarEnfocar,
}: {
  candidatas: CandidataVendedora[];
  ubicacionEtiqueta: string;
  onClose: () => void;
  alCerrarEnfocar?: RefObject<HTMLElement | null>;
}) {
  const router = useRouter();
  const [filas, setFilas] = useState(candidatas);
  const [guardando, setGuardando] = useState(false);
  const [huboCambio, setHuboCambio] = useState(false);

  async function alternar(c: CandidataVendedora) {
    setGuardando(true);
    const { error } = await createClient().rpc("marcar_atiende_en_caja", { p_persona_id: c.personaId, p_atiende: !c.atiende });
    setGuardando(false);
    if (error) {
      avisar.error(traducirError(error, "guardar quién atiende en caja"));
      return;
    }
    setFilas((actual) => actual.map((x) => (x.personaId === c.personaId ? { ...x, atiende: !c.atiende } : x)));
    setHuboCambio(true);
  }

  function alCerrar() {
    if (huboCambio) router.refresh();
    onClose();
  }

  return (
    <Modal titulo="¿Quiénes atienden en caja?" subtitulo={ubicacionEtiqueta} onClose={alCerrar} alCerrarEnfocar={alCerrarEnfocar}>
      {(cerrar) => (
        <div className="space-y-4">
          <p className="text-sm text-tinta/70">
            Solo ellas aparecen en la fila «Atendió» del ticket. Puedes cambiarlo cuando quieras; no toca las ventas ya hechas.
          </p>
          {filas.length === 0 ? (
            <p className="card-cayla px-4 py-4 text-center text-sm text-tinta/60">
              No hay colaboradoras asignadas a esta sede, o no se pudieron leer.
            </p>
          ) : (
            <ul className="divide-y divide-sand rounded-xl border border-sand">
              {filas.map((c) => (
                <li key={c.personaId}>
                  <label className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 text-sm text-tinta">
                    <span>{c.nombre}</span>
                    <input
                      type="checkbox"
                      checked={c.atiende}
                      disabled={guardando}
                      onChange={() => alternar(c)}
                      className="h-5 w-5 accent-[var(--color-rojo)]"
                    />
                  </label>
                </li>
              ))}
            </ul>
          )}
          <button type="button" onClick={cerrar} className={botonPrimario}>
            Listo
          </button>
        </div>
      )}
    </Modal>
  );
}
```

- [ ] **Paso 2: La página pasa las candidatas (solo a un líder)** — `apps/web/app/(app)/vender/page.tsx`:

Cambia el import a `import { getCandidatasVendedora, getVendedorasDeSede } from "@/lib/vendedoras";`. Agrega un **octavo** elemento al `Promise.all` y a la desestructuración:

```ts
  const [variantes, caja, resStock, ubicaciones, stockAqui, resCampanas, { vendedoras, noCargaron: vendedorasNoCargaron }, candidatas] = await Promise.all([
    // … los siete de antes, sin cambios …
    getVendedorasDeSede(persona.ubicacionId),
    // Solo un líder elige quiénes atienden: a una colaboradora ni se le lee.
    persona.rol === "lider" ? getCandidatasVendedora(persona.ubicacionId) : Promise.resolve([]),
  ]);
```
y en `<PuntoDeVenta … />` agrega `candidatas={candidatas}`.

- [ ] **Paso 3: `PuntoDeVenta.tsx`**

  1. Import: `import { ElegirVendedorasModal } from "@/components/ElegirVendedorasModal";` (junto a los demás modales) y agrega `type CandidataVendedora,` al bloque de `@/lib/vender-reglas`.
  2. Props: después de `vendedorasNoCargaron?: boolean;` agrega
     ```ts
       /** Todas las colaboradoras de la sede con su interruptor; solo llega llena si quien mira es líder. */
       candidatas: CandidataVendedora[];
     ```
     y agrega `candidatas,` a la desestructuración.
  3. Estado, junto a `vendedoraElegida`: `const [eligiendoQuienes, setEligiendoQuienes] = useState(false);`
  4. `hayModal` (línea `const hayModal = manualAbierto || modalAbrirVisible || modalCerrarVisible || ok !== null;`): agrega `|| eligiendoQuienes` para que el escáner y los atajos F1–F5 se pausen con el modal abierto.
  5. En el `<PuntoDeVentaTicket … />`, después de `vendedorasNoCargaron={vendedorasNoCargaron}`:
     ```tsx
               onElegirQuienes={esLider ? () => setEligiendoQuienes(true) : undefined}
     ```
  6. Después de la línea `{ok && <VentaRegistradaModal … />}` (al final del `return`):
     ```tsx
           {eligiendoQuienes && (
             <ElegirVendedorasModal
               candidatas={candidatas}
               ubicacionEtiqueta={ubicacionEtiqueta}
               onClose={() => setEligiendoQuienes(false)}
               alCerrarEnfocar={buscador}
             />
           )}
     ```

- [ ] **Paso 4: `PuntoDeVentaTicket.tsx`** — en `type Props`, después de `vendedorasNoCargaron: boolean;` agrega `  /** Solo un líder la recibe: abre el modal «¿Quiénes atienden en caja?». */\n  onElegirQuienes?: () => void;`; añádela a la desestructuración (después de `vendedorasNoCargaron,`) y pásala a la fila: en `<VendedorasFila … />` agrega `onElegirQuienes={onElegirQuienes}`.

- [ ] **Paso 5: Verificar**

```bash
pnpm -C apps/web typecheck
pnpm -C apps/web exec eslint components/ElegirVendedorasModal.tsx components/PuntoDeVenta.tsx components/PuntoDeVentaTicket.tsx "app/(app)/vender/page.tsx"
pnpm -C apps/web exec vitest run
```
Esperado: todo verde. El comportamiento visible se comprueba en la Tarea 8 (necesita sesión de líder en el navegador).

- [ ] **Paso 6: Commit**

```bash
git checkout -- graphify-out/cache/last_query_stamp
git add apps/web/components/ElegirVendedorasModal.tsx "apps/web/app/(app)/vender/page.tsx" apps/web/components/PuntoDeVenta.tsx apps/web/components/PuntoDeVentaTicket.tsx
git commit -F - <<'EOF'
feat(vender): el líder elige desde el mismo Punto de venta quiénes atienden en caja

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
```

---

### Tarea 6: «Atendió:» en el ticket térmico

**Archivos:**
- Modificar: `apps/web/components/ReciboTermico.tsx`

**Consume:** `ReciboVenta.atendio` (Tarea 3). La boleta A4 (`BoletaA4.tsx:144`) **ya** imprime `Atendió: {vendedor}`; no se toca.

- [ ] **Paso 1: Pintar la fila** — en `ReciboTermico.tsx`, reemplaza

```tsx
        {tieneDoc && (
          <>
            <dt>{cli.tipoDoc === "ruc" ? "RUC" : "DNI"}</dt>
            <dd>{cli.numDoc}</dd>
          </>
        )}
      </dl>
```
por
```tsx
        {tieneDoc && (
          <>
            <dt>{cli.tipoDoc === "ruc" ? "RUC" : "DNI"}</dt>
            <dd>{cli.numDoc}</dd>
          </>
        )}
        {recibo.atendio && (
          <>
            <dt>Atendió</dt>
            <dd>{recibo.atendio}</dd>
          </>
        )}
      </dl>
```

- [ ] **Paso 2: Verificar y commitear**

```bash
pnpm -C apps/web typecheck
pnpm -C apps/web exec eslint components/ReciboTermico.tsx
git checkout -- graphify-out/cache/last_query_stamp
git add apps/web/components/ReciboTermico.tsx
git commit -F - <<'EOF'
feat(vender): el ticket térmico imprime «Atendió: nombre»

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
```
La comprobación en el papel/DOM va en la Tarea 8.

---

### Tarea 7: Los reportes cuentan a la vendedora

Cuatro sitios del front resuelven hoy «el vendedor» con `usuario_id`. Si uno se queda atrás, la vendedora sale en unas pantallas y la sesión en otras. (`fn_ventas_del_dia` ya se cubrió en la migración.)

**Archivos:**
- Modificar: `apps/web/lib/ventas-historial-reglas.ts` (+ test `ventas-historial-reglas.test.ts`), `apps/web/lib/ventas-historial.ts`, `apps/web/lib/ventas-v2.ts`, `apps/web/app/actions/caja.ts`

- [ ] **Paso 1: La prueba que falla** — en `ventas-historial-reglas.test.ts`, dentro del `describe` de `aFila` (junto a «arma la fila con vendedor, clienta…»), agrega:

```ts
  it("el vendedor es quien atendió; si no se eligió a nadie, la sesión que cobró (ventas anteriores)", () => {
    const ATENDIO = "44444444-4444-4444-4444-444444444444";
    const nombres = new Map([
      [VENDEDORA, "Micaela Ríos"],
      [ATENDIO, "Rosa Díaz"],
    ]);
    expect(aFila(venta({ vendedora_id: ATENDIO }), nombres).vendedor).toBe("Rosa Díaz");
    expect(aFila(venta({ vendedora_id: null }), nombres).vendedor).toBe("Micaela Ríos");
    expect(aFila(venta(), nombres).vendedor).toBe("Micaela Ríos");
  });
```

```bash
pnpm -C apps/web exec vitest run lib/ventas-historial-reglas.test.ts
```
Esperado: FAIL (la fila devuelve siempre «Micaela Ríos»).

- [ ] **Paso 2: `ventas-historial-reglas.ts`** — en `VentaCruda`, después de `usuario_id: string | null;`:

```ts
  /** Quién atendió (`ventas.vendedora_id`); ausente/null en las ventas anteriores a la fila «Atendió». */
  vendedora_id?: string | null;
```
y en `aFila`, reemplaza `    vendedor: v.usuario_id ? (nombres.get(v.usuario_id) ?? null) : null,` por:

```ts
    vendedor: nombreDeQuienVendio(v, nombres),
```
agregando, justo encima de `export function aFila(`:

```ts
/** Quién vendió: quien atendió (`vendedora_id`) y, si no se eligió a nadie, la sesión que cobró (`usuario_id`). */
export const quienVendio = (v: { vendedora_id?: string | null; usuario_id: string | null }): string | null => v.vendedora_id ?? v.usuario_id;

function nombreDeQuienVendio(v: VentaCruda, nombres: ReadonlyMap<string, string>): string | null {
  const id = quienVendio(v);
  return id ? (nombres.get(id) ?? null) : null;
}
```

- [ ] **Paso 3: `ventas-historial.ts`** —
  1. `SELECT_LISTA`: `const SELECT_LISTA = \`id, created_at, estado, nota, usuario_id,` → `\`id, created_at, estado, nota, usuario_id, vendedora_id,`.
  2. El filtro (`if (f.vendedorId) q = q.eq("usuario_id", f.vendedorId);`) pasa a:
     ```ts
       // «Vendedor X» = las que atendió X y, de las anteriores a la fila «Atendió» (sin vendedora), las que cobró su sesión.
       // `vendedorId` ya pasó por `esUuid` en `filtrosDesdeParams`, así que no trae nada que rompa el filtro.
       if (f.vendedorId) q = q.or(`vendedora_id.eq.${f.vendedorId},and(vendedora_id.is.null,usuario_id.eq.${f.vendedorId})`);
     ```
  3. En `listarVentasHistorial`, `const nombres = await nombresDe(supabase, pagina.map((v) => v.usuario_id));` → `pagina.map(quienVendio)` (importa `quienVendio` de `./ventas-historial-reglas`, donde ya se importan `aFila` y los tipos).
  4. **Verifica la consulta contra la base local** (dos `.or()` en la misma consulta —el del vendedor y el del cursor— se combinan con AND; se comprueba, no se supone). Sigue la receta «verificar consultas PostgREST con un JWT local» del proyecto o corre en el navegador `/vender/historial?vendedor=<uuid>` con más de una página y compara el conteo con SQL:
     ```sql
     select count(*) from retail.ventas where coalesce(vendedora_id, usuario_id) = '<uuid>';
     ```

- [ ] **Paso 4: `ventas-v2.ts`** (`getVentasRecientes`, el buscador de Cambios y Devoluciones) —
  1. En el `select` de `venta_items`, `venta:ventas!inner ( ubicacion_id, created_at, usuario_id, estado, …` → agrega `vendedora_id` después de `usuario_id`.
  2. Justo antes de `const ids = filas.map((f) => f.id);` agrega `const quienVendio = (v: { vendedora_id: string | null; usuario_id: string | null } | null) => v?.vendedora_id ?? v?.usuario_id ?? null;`.
  3. `const idsVendedores = Array.from(new Set(filas.map((f) => f.venta?.usuario_id).filter((v): v is string => !!v)));` → `filas.map((f) => quienVendio(f.venta))`.
  4. `vendedorNombre: f.venta?.usuario_id ? (nombreVendedor.get(f.venta.usuario_id) ?? null) : null,` → `vendedorNombre: nombreVendedor.get(quienVendio(f.venta) ?? "") ?? null,`.

- [ ] **Paso 5: `app/actions/caja.ts`** (`getDetalleCierre`, el detalle de caja; su `colaboradorNombre` alimenta la reimpresión con «Atendió:») —
  1. `.select("id, created_at, estado, usuario_id")` → `.select("id, created_at, estado, usuario_id, vendedora_id")`.
  2. `...filasVentas.map((v) => v.usuario_id)` → `...filasVentas.map((v) => v.vendedora_id ?? v.usuario_id)`.
  3. `colaboradorNombre: v.usuario_id ? (nombreColaborador.get(v.usuario_id) ?? null) : null,` (la de la venta, no la del movimiento) → `colaboradorNombre: nombreColaborador.get(v.vendedora_id ?? v.usuario_id ?? "") ?? null,`.
  Los `movimientos` de caja (ingresos/egresos) **no cambian**: ahí `usuario_id` sí es quien operó.

- [ ] **Paso 6: Verificar**

```bash
pnpm -C apps/web exec vitest run lib/ventas-historial-reglas.test.ts
pnpm -C apps/web typecheck
pnpm -C apps/web exec eslint lib/ventas-historial.ts lib/ventas-historial-reglas.ts lib/ventas-v2.ts app/actions/caja.ts
pnpm -C apps/web exec vitest run
```
Esperado: todo verde.

- [ ] **Paso 7: Commit**

```bash
git checkout -- graphify-out/cache/last_query_stamp
git add apps/web/lib/ventas-historial-reglas.ts apps/web/lib/ventas-historial-reglas.test.ts apps/web/lib/ventas-historial.ts apps/web/lib/ventas-v2.ts apps/web/app/actions/caja.ts
git commit -F - <<'EOF'
feat(vender): historial, cambios y detalle de caja cuentan a quien atendió, no a la sesión

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
```

---

### Tarea 8: Verificar en navegador, documentar y dejar lista la entrega

**Archivos:**
- Crear: `docs/adr/<siguiente-libre>-vendedora-en-el-ticket.md`
- Modificar: `docs/BITACORA.md`, `docs/BACKLOG.md`, `docs/ARQUITECTURA.md`, `docs/SESIONES-ACTIVAS.md`

- [ ] **Paso 1: Levantar la web desde ESTE worktree** (el `preview_start` sirve la carpeta raíz, que es otra rama)

```bash
pnpm -C apps/web exec next dev -p 3100
```
Ejecútalo en segundo plano. **La sesión del navegador la inicia el usuario, con la cuenta de líder local, en el panel del navegador**: tú **no** escribes contraseñas. Si el panel está oculto quedará en «CARGANDO…» eterno: pide que lo deje visible.

- [ ] **Paso 2: Sembrar dos colaboradoras de prueba en TRU** (la base local solo tiene una, y con menos de dos no hay chips). **Pídele OK al usuario antes**: es una escritura persistente en la base local compartida.

```sql
-- personas clonadas de Micaela (sirven de molde para el enum de rol y la sede base)
insert into public.personas (nombres, apellidos, sede_base_id, rol, estado)
select n, 'ZZ-Prueba', p.sede_base_id, p.rol, 'activo'
from public.personas p, (values ('Rosa'), ('Lucía')) v(n)
where p.auth_user_id = '22222222-2222-4222-8222-000000000003';

insert into retail.colaboradores (persona_id, rol, ubicacion_asignada_id)
select p.id, 'colaborador', (select id from retail.ubicaciones where nombre = 'Tienda Trujillo')
from public.personas p where p.apellidos = 'ZZ-Prueba';
```

- [ ] **Paso 3: Recorrido** (anota cada resultado; si algo no coincide, es un defecto: arréglalo en la tarea que corresponda antes de seguir)

  1. **Líder, TRU, sin marcadas:** en `/vender` aparece «Nadie marcada para atender en caja» + «Elegir quiénes atienden». Se puede vender **sin** elegir a nadie (la venta sale a nombre de la sesión).
  2. **Modal:** «Elegir quiénes atienden» abre «¿Quiénes atienden en caja?» con Micaela, Rosa y Lucía. Marca a las tres; al cerrar, la fila muestra **tres chips** (sin ninguno activo) y se ve el loader global al guardar cada casilla.
  3. **Bloqueo:** con prendas en el ticket y ningún chip activo, el botón de cobrar está apagado y dice «Elige quién atendió a la clienta.». Al tocar un chip se enciende. **F1–F5 desde «armar»** saltan al cobro y ahí el botón sigue apagado con el mismo mensaje.
  4. **Cobrar:** elige a Rosa y cobra. En «Venta registrada» abre el DOM del ticket: `document.getElementById("comprobante-print").innerText` debe contener `Atendió` y `Rosa`. Tras cerrar el modal, la fila queda **sin ningún chip activo**.
  5. **Ticket en espera:** arma un ticket, elige a Lucía, «dejar en espera», arma otro sin elegir, retoma el primero: Lucía vuelve marcada.
  6. **Una sola marcada:** desmarca a dos: la fila de chips desaparece y dice «Atiende Micaela»; se cobra sin tocar nada y sale «Atendió: Micaela».
  7. **Sesión de colaboradora** (pide al usuario entrar como Micaela): ve los chips pero **no** el enlace «Elegir quiénes atienden».
  8. **Reportes:** en `/vender/historial` la venta de Rosa muestra a Rosa; el filtro por vendedor con el uuid de Rosa la incluye y cuenta lo mismo que la SQL de la Tarea 7, Paso 3, punto 4. «Ventas de hoy» en Vender la firma «Rosa». En Caja, el detalle de esa venta y su reimpresión A4 dicen «Atendió: Rosa …».
  9. **Sin marcas, ventas viejas:** una venta de antes de la migración sigue mostrando a la sesión, sin romperse.
  10. **Consola y red:** `read_console_messages` sin errores nuevos; en la red, `registrar_venta` lleva `p_vendedora_id` **solo** cuando hay elegida.
  11. **Impresión (si dudas de un recorte):** la fila «Atendió» está en la cuadrícula `.rt-datos` como Cliente y DNI; si quieres verla en papel, imprime a PDF con Playwright (`page.pdf()`) una página temporal fuera del panel con sesión. **No commitees** páginas temporales.

- [ ] **Paso 4: Limpiar lo sembrado** — sin borrar historial: se archivan las personas y se quitan sus accesos

```sql
delete from retail.colaboradores where persona_id in (select id from public.personas where apellidos = 'ZZ-Prueba');
update public.personas set estado = 'inactivo' where apellidos = 'ZZ-Prueba';
```
(Si `estado = 'inactivo'` no es un valor permitido, usa el que acepte el check de `personas.estado`.) Las ventas de prueba quedan en la base local, como cualquier prueba manual. Para el servidor de `next dev`: páralo. Repite `pnpm pruebas:vendedora-en-venta` (debe seguir en 13/13) y `pnpm pruebas:registrar-venta`.

- [ ] **Paso 5: ADR** — toma el **siguiente número libre mirando las ramas remotas** (hoy el más alto es `0151`; si sigue libre, es `0152`):

```bash
for r in $(git branch -r | grep -v HEAD); do git ls-tree --name-only $r docs/adr/ 2>/dev/null; done | sed 's#.*/##' | sort -u | tail -3
ls docs/adr | tail -3
```
Crea `docs/adr/0152-vendedora-en-el-ticket.md` (ajusta el número si cambió, y **todas** las referencias a él):

```markdown
# ADR-0152 — «Quién vendió»: la vendedora se elige en el ticket y vive junto a la sesión que cobró

**Fecha:** 2026-09-21 · **Estado:** aceptado (diseño aprobado por el usuario el 2026-09-21). Migración `20260922143700_vendedora_en_la_venta.sql` aplicada **solo en local**; producción espera el OK explícito · **Spec:** `docs/superpowers/specs/2026-09-21-vendedora-en-el-ticket-design.md`

## Contexto

En Tienda TRU hay varias colaboradoras y un solo equipo de caja. `ventas.usuario_id` es la persona de la **sesión** que cobró (la RPC lo saca de `auth.uid()`), así que todas las ventas del equipo salían a nombre de quien tuviera la sesión abierta, y ni el ticket ni la boleta podían decir quién atendió.

## Decisión

1. **Columna nueva `ventas.vendedora_id`, además de `usuario_id`.** La sesión sigue siendo la auditoría de quién operó el equipo (caja, anulaciones); `vendedora_id` dice quién atendió. Sobrescribir `usuario_id` habría perdido esa auditoría. Vacío = «no se eligió»: vale `usuario_id`.
2. **Una fila de chips en el ticket, sin preselección, elegida en cada venta.** Un toque; cobrar queda bloqueado hasta tocar uno (con 2 o más marcadas). Recordar «la última» costaba 0 toques pero atribuía mal, en silencio, cuando la siguiente olvidaba cambiarla.
3. **Aparecen solo las colaboradoras marcadas `colaboradores.atiende_en_caja`**, que cambia un líder desde el propio Punto de venta (no desde `/colaboradores`, que otra sesión estaba reescribiendo). Con 0 marcadas en la sede la fila no aparece y se vende como antes: si no, el día del despliegue nadie podría cobrar. Con 1, es ella sola.
4. **`registrar_venta` gana `p_vendedora_id` (12.º parámetro).** Firma nueva por `drop` + `create` (no `create or replace`: dejaría dos versiones vivas). La base valida que sea colaboradora **de esa sede** (activa o suspendida: una venta guardada sin red no debe perderse porque un líder suspendió a alguien entre tanto) y **no** exige el interruptor. El navegador solo propone.
5. **Solo cambia el papel impreso.** El nombre no entra en lo que se envía a SUNAT/Nubefact.

## Consecuencias

- Los reportes cuentan a `vendedora_id` y, si falta, a `usuario_id` (`fn_ventas_del_dia`, historial, buscador de Cambios/Devoluciones, detalle de caja).
- La marca vive en `colaboradores`: al **suspender** una colaboradora su fila se mueve a `colaboradores_suspendidos` (ADR-0148), sale de la fila del ticket y, al reactivarla, vuelve **sin marca**. Cambiarla de sede apaga la marca (trigger).
- Los líderes no son elegibles (no tienen sede asignada): sus ventas siguen a nombre de la sesión.

## Se rompe si

- Se despliega la web antes de pegar la migración: la lectura da PGRST202, la fila no aparece y se vende como siempre, pero nadie puede marcar a nadie. **Orden: migración primero, web después.**
- El ADR-0150 (roles a medida) agrega roles a `colaboradores`: el `rol = 'colaborador'` de estas funciones tendría que revisarse.

## Fuera de alcance

Comisiones o metas por vendedora, PIN por colaboradora, líderes como vendedoras, reescribir ventas anteriores y mover el interruptor a `/colaboradores`.
```

- [ ] **Paso 6: BITÁCORA** — agrega **al inicio** (debajo del encabezado, encima de la entrada más reciente; las entradas van de más nueva a más vieja) esta entrada, con la fecha real de cierre:

```markdown
## 2026-09-21 («Quién vendió» en el ticket del Punto de venta)
Felipe pidió que, con un solo equipo de caja y varias colaboradoras por tienda (TRU: 11 activas, 6 venden), cada venta dijera quién atendió a la clienta y saliera en el ticket y la boleta. Se guarda en `ventas.vendedora_id` **junto a** `usuario_id` (la sesión que cobró), se elige con una fila de chips arriba del ticket —sin preselección, un toque por venta— y un líder marca quiénes atienden desde el mismo Punto de venta. Se verificó contra Postgres local (13 pruebas), en el navegador y en el reimpreso; la migración `20260922143700` está aplicada **solo en local**.
Felipe se lleva: (1) **una columna nueva junto a la vieja, no encima**: `usuario_id` sigue siendo la auditoría de quién operó el equipo, y por eso `vendedora_id` es aparte; (2) **una regla que puede dejar sin cobrar a una tienda se diseña con salida**: con 0 marcadas la fila no aparece y se vende como antes; (3) **cambiar la firma de una RPC de dinero es `drop` + `create`, no `create or replace`**, y se deja una sola sobrecarga con los mismos permisos.
Sin resolver: pegar la migración en producción (necesita el OK de Felipe, antes de desplegar la web) y que un líder marque a las 6 de TRU; mover el interruptor a `/colaboradores` cuando esa pantalla se asiente; los líderes que atienden en mostrador no son elegibles todavía. Detalle en el ADR-0152.
```

- [ ] **Paso 7: BACKLOG** — busca la sección de Vender y agrega, respetando «máx. 3 ítems por cubo»:

```bash
grep -n -i -E "^## .*(vender|punto de venta|caja)" docs/BACKLOG.md | head
```
Agrega estos ítems en el cubo que corresponda (o abre uno «Quién vendió» al inicio):

```markdown
- **Pegar «quién vendió» en producción** (`20260922143700_vendedora_en_la_venta.sql`): **migración primero, web después**; con OK explícito. Antes: huella de `registrar_venta` y `fn_ventas_del_dia` vigentes en producción = las del repo. Después: una sola sobrecarga y `proacl = {postgres=X/postgres,authenticated=X/postgres}`. Luego un líder marca a las 6 de TRU en «Elegir quiénes atienden».
- **Interruptor «atiende en caja» en `/colaboradores`** (hoy vive en el Punto de venta): moverlo cuando la pantalla de colaboradores se asiente.
- **Líderes que atienden en mostrador** no son elegibles (no tienen sede asignada). Decidir si hace falta.
```

- [ ] **Paso 8: ARQUITECTURA** — en `docs/ARQUITECTURA.md`, en las secciones que listan RPC y el modelo de datos, agrega: `ventas.vendedora_id`, `colaboradores.atiende_en_caja`, las RPC `fn_vendedoras_de_sede`, `fn_candidatas_vendedora_de_sede`, `marcar_atiende_en_caja`, el 12.º parámetro de `registrar_venta`, y la ruta `vender` ↔ `lib/vendedoras.ts` ↔ esas RPC. Sigue el formato de las filas vecinas.

- [ ] **Paso 9: Diccionario y coherencia** — **no corras `pnpm datos:generar` a secas** (lee el Postgres local y pisa los diccionarios). La regla del repo es: una migración entra al diccionario cuando se aplica en **producción** y se refresca el volcado (`docs/datos/generado/COMO-REFRESCAR.md`). Déjalo anotado en el BACKLOG (Paso 7). Puedes correr `pnpm datos:comparar` para ver que las pantallas nuevas aparecen como «llaman a algo que producción aún no tiene» (esperado hasta pegar la migración) y **restaurar** el archivo que reescribe: `git checkout -- docs/datos/generado/`.

- [ ] **Paso 10: SESIONES-ACTIVAS** — mueve la fila de esta sesión a «Cerradas hoy» (con la fecha y «migración solo en local; producción con OK») y agrega la mención del ADR.

- [ ] **Paso 11: Verificación final antes de dar nada por hecho**

```bash
pnpm -C apps/web typecheck
pnpm -C apps/web exec vitest run
pnpm -C apps/web lint
pnpm pruebas:vendedora-en-venta
pnpm pruebas:registrar-venta
pnpm pruebas:ventas-del-dia
git status --short
```
Esperado: todo verde; `git status` solo con los archivos de docs de este paso (más nada suelto: ni `.playwright-mcp/`, ni PNG, ni páginas temporales). Corre además `pnpm -C apps/web build` **con el servidor de desarrollo parado** (memoria: el build con el dev server vivo da falsos errores).

- [ ] **Paso 12: Commit**

```bash
git checkout -- graphify-out/cache/last_query_stamp
git add docs/adr/0152-vendedora-en-el-ticket.md docs/BITACORA.md docs/BACKLOG.md docs/ARQUITECTURA.md docs/SESIONES-ACTIVAS.md
git commit -F - <<'EOF'
docs(vender): ADR-0152, bitácora, backlog y arquitectura de «quién vendió»

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
```

#### Entrega a producción (NO se ejecuta con este plan)

Cambia el esquema **y la RPC que mueve dinero** en producción: exige el «sí» explícito del usuario **para esta migración** y se hace después, en una sesión con su ok. Orden y comprobaciones:

1. **`git fetch` y fusionar `main`** (producción y `main` se mueven). Confirmar que `main` no trae otra migración que toque `registrar_venta` o `fn_ventas_del_dia`.
2. **Línea base en producción** (proyecto `vovjyyiafkxteijimpuy`, solo lectura): que exista **una** sobrecarga de `registrar_venta` con 11 parámetros; que `retail.colaboradores_suspendidos` exista (ya existe); y que la huella md5 del cuerpo de `registrar_venta` y de `fn_ventas_del_dia` (sin espacios) sea la del repo antes de esta migración.
3. **Pegar la migración entera, en una sola transacción**, en el SQL Editor (ya trae `set search_path` y `retail.`).
4. **Verificar:** una sola sobrecarga de `registrar_venta` (12 parámetros); `proacl` de las cuatro funciones = `{postgres=X/postgres,authenticated=X/postgres}`; humo de solo lectura como líder (`fn_vendedoras_de_sede` devuelve vacío, `fn_candidatas_vendedora_de_sede` lista a las de TRU); una venta de humo con un UUID inexistente **debe fallar** con `venta_vendedora_no_es_de_la_sede` (sin escribir nada).
5. **Recién entonces** fusionar la web (Vercel despliega cada push a `main`). Antes de fusionar, cruzar los `.rpc(` del front con `pg_proc` de producción (`pnpm datos:comparar`).
6. Un líder entra a `/vender` de TRU, «Elegir quiénes atienden» y marca a las 6. Después, refrescar el volcado y el diccionario (`docs/datos/generado/COMO-REFRESCAR.md`).

---

## Autorrevisión del plan contra el spec

| Sección del spec | Dónde se cubre |
|---|---|
| §2 chips sin preselección, elegir en cada venta | Tarea 2 (`vendedoraPendiente`, regla de bloqueo), Tarea 4 (fila) |
| §2 solo las marcadas «atiende en caja» | Tarea 1 (`atiende_en_caja`, `fn_vendedoras_de_sede`) |
| §2 el interruptor vive en el POS, solo líder | Tarea 5 (modal), Tarea 1 (`marcar_atiende_en_caja` exige `fn_es_lider()`) |
| §2 sede sin marcadas: se vende como hoy; con 1, elegida sola | Tarea 2 (`vendedoraDeLaVenta`, `vendedoraPendiente`); Tarea 4 |
| §2 `vendedora_id` además de `usuario_id` | Tarea 1 |
| §2 no toca SUNAT/Nubefact | Tarea 6 (solo el diseño impreso) y ADR |
| §3.1 base: columnas, `registrar_venta`, 3 funciones, `fn_ventas_del_dia` | Tarea 1 |
| §3.2 POS: estado, regla, `ParamsRegistrarVenta`, espera, limpiar estado, modal | Tareas 2, 3, 4, 5 |
| §3.3 impresos: `ReciboVenta.atendio`, térmico, A4, reimpresión | Tareas 3, 6, 7 |
| §3.4 reportes | Tarea 7 (+ `fn_ventas_del_dia` en la Tarea 1) |
| §4 casos borde (0/1 marcada, suspendida, líder, offline viejo, otra sede, anulación) | Pruebas de la Tarea 1 y Tarea 2; anulación no cambia |
| §6 verificación | Tareas 1, 2, 3, 7 (pruebas) y 8 (navegador, papel) |
| §7 coordinación | Tareas 0 y 8 |

**Añadidos que el spec no traía (descubiertos al leer el código, todos cubiertos arriba y por decidir en la entrega):** (a) suspender/reactivar/cambiar de sede afectan a la marca (trigger + consecuencia documentada); (b) `registrar_venta` acepta también a una colaboradora **suspendida**, para no perder una venta offline; (c) la lectura de la fila degrada con gracia si la función aún no existe en producción (PGRST202) o falla (aviso); (d) `fn_candidatas_vendedora_de_sede` como tercera función para el modal del líder.
