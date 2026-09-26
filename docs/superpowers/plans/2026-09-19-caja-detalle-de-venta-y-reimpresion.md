# Caja: «Ver todo», detalle de venta y reimpresión — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que desde «Movimientos recientes» de Caja se pueda abrir todo el listado («Ver todo»), abrir el detalle de una venta y reimprimir su ticket térmico (con vuelto) y su boleta A4.

**Architecture:** El vuelto se persiste en `venta_pagos.recibido` (migración + `registrar_venta` con la misma firma). La lectura de una venta vieja arma un `ReciboVenta` con una función pura (`armarDetalleVenta`) y reutiliza `ReciboTermico`; la boleta A4 es un componente nuevo (`BoletaA4`) alimentado por el mismo `ReciboVenta`. La impresión monta UNA sola raíz a la vez pegada a `<body>` (portal) y el CSS de impresión oculta el resto.

**Tech Stack:** Next.js (App Router) + React 19, TypeScript, Tailwind v4, Supabase (Postgres + RLS + RPC), Vitest, `qrcode.react`, `@radix-ui/react-dialog` (vía `components/ui/Modal`).

**Spec:** `docs/superpowers/specs/2026-09-19-caja-detalle-de-venta-y-reimpresion-design.md`

## Global Constraints

- Español en todo texto visible y en comentarios de lógica de negocio. Vocabulario: «clienta», «colaborador/integrante», «líder de equipo», «tienda/sede». Nunca «empleado/jefe/sucursal».
- Migraciones en `supabase/migrations/<timestamp>_nombre.sql` **con prefijo `retail.`** en cada tabla/función (como las recientes) y `set search_path = retail, public, extensions;` arriba, para que el mismo archivo se pueda pegar en el SQL Editor de producción sin tocarlo. **Nunca se aplica a producción desde aquí**: la pega Felipe.
- `registrar_venta` conserva **una sola firma** (`create or replace` con los mismos 11 parámetros). Una sobrecarga duplicada tumba la pantalla en producción.
- Nunca `DELETE` en `movimientos` ni catálogos con historial. Nada de este plan borra datos.
- Los modales van **fuera** del contenedor `@container` de `CajaAbiertaPanel` (la contención de layout ataría su `fixed` al tablero).
- Solo negro sobre blanco en el ticket térmico; el A4 puede llevar un tinte suave con `[print-color-adjust:exact]` pero debe leerse en blanco y negro.
- Commits: Conventional Commits con scope de dominio real (`feat(caja)`, `feat(ventas)`, `test(...)`), terminados con la línea `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`. El hook de pre-commit corre tipos, tests y lint: si falla, se arregla la causa, no se salta.
- En Windows: escribir el mensaje a un archivo y usar `git commit -F archivo` (PowerShell 5.1 parte los mensajes con comillas). Mirar `git diff --cached` antes de commitear. **No** commitear `graphify-out/cache/last_query_stamp` (`git checkout -- graphify-out/cache/last_query_stamp` antes de commitear) y **no** correr `graphify update .`.
- `$SCRATCH` = una carpeta temporal fuera del repo (p. ej. `export SCRATCH="C:/Users/danyj/AppData/Local/Temp"`), donde van los scripts y los mensajes de commit de este plan.
- Tests con Vitest desde `apps/web`: `npx vitest run <archivo>`. Tipos desde la raíz: `pnpm typecheck`.
- Regla del repo `react-hooks/set-state-in-effect`: en un `useEffect` no se llama `setState` de forma síncrona; solo dentro de callbacks (promesas, timers, eventos).

## Estructura de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `supabase/migrations/20260919210000_venta_pagos_recibido.sql` | crear | Columna `venta_pagos.recibido` + candado + `registrar_venta` que la guarda. Pegable en producción tal cual. |
| `packages/database/src/types.ts` | regenerar | Tipos con `recibido`. |
| `apps/web/lib/vender-reglas.ts` (+ `.test.ts`) | modificar | `pagosParaRpc`: qué pagos viajan a la RPC y con qué `recibido`. |
| `apps/web/lib/ventas-offline.ts` | modificar | Tipo del payload guardado en la cola. |
| `apps/web/components/PuntoDeVenta.tsx` | modificar | Usa `pagosParaRpc`. |
| `apps/web/lib/recibo-reglas.ts` (+ `.test.ts`) | modificar | `armarRecibo` acepta un `detalle` opcional por línea (talla · color). |
| `apps/web/lib/venta-detalle-reglas.ts` (+ `.test.ts`) | crear | Puro: filas de la base → `VentaDetalle` (con `ReciboVenta`), y qué estados dejan imprimir. |
| `apps/web/lib/venta-detalle.ts` | crear | Lectura de una venta con el cliente de Supabase del navegador. |
| `apps/web/components/FilaMovimientoCaja.tsx` | crear | Una fila del listado (extraída de `CajaAbiertaPanel`); las ventas son botón. |
| `apps/web/components/MovimientosCajaModal.tsx` | crear | «Ver todo». |
| `apps/web/components/DetalleVentaModal.tsx` | crear | Detalle de una venta + botones de reimpresión. |
| `apps/web/components/CajaAbiertaPanel.tsx` | modificar | «Ver todo», filas clicables, modales. |
| `apps/web/lib/boleta-a4-reglas.ts` (+ `.test.ts`) | crear | Puro: líneas y totales del A4 (valor sin IGV, ajuste de centavo). |
| `apps/web/components/BoletaA4.tsx` | crear | La boleta/factura A4. |
| `apps/web/app/globals.css` | modificar | Raíz de impresión A4 (`@page a4`). |
| `docs/BITACORA.md`, `docs/BACKLOG.md`, `docs/ARQUITECTURA.md`, `docs/adr/` | modificar/crear | Cierre y decisión. |

Las **vistas previas temporales** (`apps/web/app/login/vista-previa-*`) se crean para verificar sin sesión y se **borran antes de cada commit** (`rm -rf` desde la raíz del repo, no desde dentro de la carpeta: Windows la bloquea).

---

## Fase 1 — Vuelto guardado

### Task 1: Migración `venta_pagos.recibido` y `registrar_venta`

**Files:**
- Create: `supabase/migrations/20260919210000_venta_pagos_recibido.sql`
- Modify: `packages/database/src/types.ts` (regenerado)

**Interfaces:**
- Produces: columna `retail.venta_pagos.recibido numeric(12,2) null` (solo efectivo, `>= monto`); `registrar_venta` lee `recibido` de cada elemento de `p_pagos`. Tipo TS `venta_pagos.Row.recibido: number | null`.

- [ ] **Step 1: Generar la migración a partir de la última definición de `registrar_venta`**

La última definición está en `supabase/migrations/20260918170000_venta_aplica_descuento_de_campana.sql`, líneas 137–394 (de `create or replace function retail.registrar_venta(` hasta el `$$;` final). Se copia entera y se cambia **una** sentencia. Guardar este script como `$SCRATCH/generar_migracion.py` y correrlo desde la raíz del repo:

```python
import pathlib

RAIZ = pathlib.Path(".")
origen = RAIZ / "supabase/migrations/20260918170000_venta_aplica_descuento_de_campana.sql"
destino = RAIZ / "supabase/migrations/20260919210000_venta_pagos_recibido.sql"

lineas = origen.read_text(encoding="utf-8").replace("\r\n", "\n").split("\n")
cuerpo = "\n".join(lineas[136:394])  # líneas 137..394 (1-based)
assert cuerpo.startswith("create or replace function retail.registrar_venta("), cuerpo[:80]
assert cuerpo.rstrip().endswith("$$;"), cuerpo[-40:]

viejo = """    insert into venta_pagos (venta_id, metodo, monto)
      values (v_venta_id, v_pago ->> 'metodo', (v_pago ->> 'monto')::numeric);
"""
nuevo = """    -- `recibido`: lo que la clienta entregó en efectivo (para reimprimir el ticket con su
    -- vuelto). Solo cuenta en efectivo; cualquier otro medio lo deja en NULL.
    insert into venta_pagos (venta_id, metodo, monto, recibido)
      values (
        v_venta_id, v_pago ->> 'metodo', (v_pago ->> 'monto')::numeric,
        case when v_pago ->> 'metodo' = 'efectivo' then nullif(v_pago ->> 'recibido', '')::numeric end
      );
"""
assert cuerpo.count(viejo) == 1, "no encontré el insert de venta_pagos"
cuerpo = cuerpo.replace(viejo, nuevo)

cabecera = """-- ============================================================================
-- 20260919210000 — El vuelto se guarda: venta_pagos.recibido
--
-- QUÉ HACE
--   Agrega `venta_pagos.recibido` (lo que la clienta entregó en efectivo) y hace que
--   `registrar_venta` lo guarde. El vuelto NO se guarda: se calcula (`recibido - monto`),
--   así no hay dos cifras que se puedan desincronizar.
--
-- POR QUÉ
--   Al cobrar, la pantalla de Vender sabe cuánto entregó la clienta, pero solo mandaba
--   `{ metodo, monto }`. Al reimprimir el ticket de una venta ya cerrada no había de
--   dónde sacar el vuelto. Las ventas anteriores a esta migración quedan con `recibido`
--   NULL: su reimpresión sale sin línea de vuelto (es un dato que nunca se guardó).
--
-- CANDADO
--   `recibido` solo existe en efectivo y nunca es menor que lo que cubre (`monto`).
--   El arqueo y el cierre de caja NO cambian: siguen sumando `monto`.
--
-- FIRMA
--   `registrar_venta` conserva sus 11 parámetros: `create or replace` sobre la misma
--   firma. `p_pagos` sigue siendo jsonb; solo se lee una clave más (`recibido`).
--
-- CÓMO SE APLICA EN PRODUCCIÓN
--   Este archivo ya trae el prefijo `retail.` y su `search_path`: se pega entero en el
--   SQL Editor del proyecto cayla-dynamic. APLICARLO ANTES de desplegar el código que
--   lee `venta_pagos.recibido` (el detalle de venta de Caja).
-- ============================================================================

set search_path = retail, public, extensions;

alter table retail.venta_pagos add column if not exists recibido numeric(12,2);

comment on column retail.venta_pagos.recibido is
  'Efectivo que la clienta entregó para este pago (solo efectivo). El vuelto es recibido - monto. NULL en las ventas anteriores a 2026-09-19.';

alter table retail.venta_pagos drop constraint if exists venta_pagos_recibido_coherente;
alter table retail.venta_pagos add constraint venta_pagos_recibido_coherente
  check (recibido is null or (metodo = 'efectivo' and recibido >= monto));

"""
destino.write_text(cabecera + cuerpo + "\n", encoding="utf-8", newline="\n")
print("escrito", destino, len((cabecera + cuerpo).split("\n")), "líneas")
```

Run: `python "$SCRATCH/generar_migracion.py"` (desde la raíz del repo).
Expected: `escrito supabase\migrations\20260919210000_venta_pagos_recibido.sql ... líneas` sin `AssertionError`.

- [ ] **Step 2: Comprobar que la migración quedó pegable en producción**

Run: `grep -nE "^(alter table|create table|insert into|update|delete from)" supabase/migrations/20260919210000_venta_pagos_recibido.sql`
Expected: las dos sentencias `alter table retail.venta_pagos ...` con prefijo. Dentro de la función, `venta_pagos`/`ventas` sin prefijo son correctos (la función lleva `set search_path = retail, ...`).

- [ ] **Step 3: Aplicarla en la base local**

Run (raíz del repo): `npx supabase migration up --local`
Expected: `Applying migration 20260919210000_venta_pagos_recibido.sql...` y `Local database is up to date.`
(Si dice que falta el stub `0000`, copiarlo desde `C:\Users\danyj\cayla-retail\supabase\migrations\0000_local_stub_dynamic.sql`.)

- [ ] **Step 4: Probar el candado con una prueba dentro de una transacción con `ROLLBACK`**

Guardar como `$SCRATCH/prueba_recibido.sql`:

```sql
begin;
do $$
declare v uuid := (select id from retail.ventas limit 1);
begin
  if v is null then
    raise exception 'La base local no tiene ninguna venta para colgar la prueba: registra una desde la app y repite.';
  end if;

  insert into retail.venta_pagos (venta_id, metodo, monto, recibido) values (v, 'efectivo', 10, null);
  insert into retail.venta_pagos (venta_id, metodo, monto, recibido) values (v, 'efectivo', 10, 50);
  raise notice 'ok: NULL y 50 >= 10 entran';

  begin
    insert into retail.venta_pagos (venta_id, metodo, monto, recibido) values (v, 'efectivo', 10, 5);
    raise exception 'DEBIO FALLAR: recibido menor que el monto';
  exception when check_violation then
    raise notice 'ok: recibido < monto rechazado';
  end;

  begin
    insert into retail.venta_pagos (venta_id, metodo, monto, recibido) values (v, 'yape', 10, 20);
    raise exception 'DEBIO FALLAR: recibido en un medio que no es efectivo';
  exception when check_violation then
    raise notice 'ok: yape con recibido rechazado';
  end;
end $$;
rollback;
```

Run: `docker exec -i supabase_db_cayla-retail psql -U postgres -v ON_ERROR_STOP=1 < "$SCRATCH/prueba_recibido.sql"`
Expected: cuatro `NOTICE: ok: ...` y `ROLLBACK`. Si `DEBIO FALLAR` aparece, el candado está mal escrito: corregir la migración (borrar la constraint local con `alter table ... drop constraint` y reaplicar) y repetir.

- [ ] **Step 5: Comprobar que `registrar_venta` sigue con una sola firma y guarda `recibido`**

Run:
```bash
docker exec supabase_db_cayla-retail psql -U postgres -tAc "select count(*) from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='retail' and p.proname='registrar_venta'"
docker exec supabase_db_cayla-retail psql -U postgres -tAc "select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='retail' and p.proname='registrar_venta'" | grep -n "recibido"
```
Expected: `1`, y al menos dos líneas con `recibido` (el `insert` y el `case`).

- [ ] **Step 6: Regenerar los tipos**

Run (raíz): `pnpm --filter @cayla-retail/database gen-types`
Luego: `git diff --stat packages/database/src/types.ts` (debe cambiar) y `grep -n "recibido" packages/database/src/types.ts` (debe aparecer en `venta_pagos` Row/Insert/Update).
Run: `pnpm typecheck` — Expected: `3 successful`.

- [ ] **Step 7: Commit**

```bash
git checkout -- graphify-out/cache/last_query_stamp 2>/dev/null
git add supabase/migrations/20260919210000_venta_pagos_recibido.sql packages/database/src/types.ts
# mensaje: feat(ventas): guarda el vuelto — venta_pagos.recibido y registrar_venta que lo lee
git commit -F "$SCRATCH/msg.txt"
```

---

### Task 2: Vender envía el `recibido`

**Files:**
- Modify: `apps/web/lib/vender-reglas.ts` (añadir `pagosParaRpc` tras `vueltoDe`, ~línea 92)
- Modify: `apps/web/lib/vender-reglas.test.ts`
- Modify: `apps/web/lib/ventas-offline.ts:61`
- Modify: `apps/web/components/PuntoDeVenta.tsx:733-736` (comentario) y `:769-771`

**Interfaces:**
- Consumes: `PagoAplicado = { metodo: MetodoPago; monto: number; recibido?: number }` (ya existe).
- Produces: `pagosParaRpc(pagos: readonly PagoAplicado[]): { metodo: MetodoPago; monto: number; recibido?: number }[]`.

- [ ] **Step 1: Escribir las pruebas que fallan**

En `apps/web/lib/vender-reglas.test.ts`, agregar `pagosParaRpc` al `import { ... } from "./vender-reglas"` existente y añadir al final:

```ts
describe("pagosParaRpc — lo que viaja a registrar_venta", () => {
  it("el efectivo con recibido suficiente lo manda (para reimprimir el vuelto)", () => {
    expect(pagosParaRpc([{ metodo: "efectivo", monto: 100, recibido: 150 }])).toEqual([
      { metodo: "efectivo", monto: 100, recibido: 150 },
    ]);
  });

  it("sin recibido no inventa la clave", () => {
    const [p] = pagosParaRpc([{ metodo: "efectivo", monto: 100 }]);
    expect(p).toEqual({ metodo: "efectivo", monto: 100 });
    expect(p).not.toHaveProperty("recibido");
  });

  it("un recibido menor que lo que cubre no viaja: el candado de la base rechazaría toda la venta", () => {
    const [p] = pagosParaRpc([{ metodo: "efectivo", monto: 100, recibido: 80 }]);
    expect(p).not.toHaveProperty("recibido");
  });

  it("un recibido exacto viaja (vuelto cero)", () => {
    expect(pagosParaRpc([{ metodo: "efectivo", monto: 100, recibido: 100 }])[0]).toHaveProperty("recibido", 100);
  });

  it("solo el efectivo lleva recibido", () => {
    const [p] = pagosParaRpc([{ metodo: "yape", monto: 50, recibido: 60 }]);
    expect(p).not.toHaveProperty("recibido");
  });

  it("descarta los pagos en 0 (venta_pagos exige monto > 0)", () => {
    expect(pagosParaRpc([{ metodo: "efectivo", monto: 0, recibido: 10 }, { metodo: "yape", monto: 30 }])).toEqual([
      { metodo: "yape", monto: 30 },
    ]);
  });
});
```

- [ ] **Step 2: Verlas fallar**

Run (desde `apps/web`): `npx vitest run lib/vender-reglas.test.ts`
Expected: FAIL — `pagosParaRpc is not a function` / not exported.

- [ ] **Step 3: Implementar**

En `apps/web/lib/vender-reglas.ts`, justo después de `vueltoDe`:

```ts
/** Los pagos como viajan a `registrar_venta`. Solo montos > 0 (`venta_pagos` lo exige). El
 *  `recibido` va únicamente en efectivo y solo si cubre lo que corresponde: la base lo
 *  guarda para reimprimir el vuelto y su candado (`venta_pagos_recibido_coherente`) rechaza
 *  TODA la venta si `recibido < monto`, así que una cifra a medio escribir no puede viajar. */
export function pagosParaRpc(pagos: readonly PagoAplicado[]): { metodo: MetodoPago; monto: number; recibido?: number }[] {
  return pagos
    .filter((p) => p.monto > 0)
    .map(({ metodo, monto, recibido }) =>
      metodo === "efectivo" && recibido !== undefined && recibido >= monto ? { metodo, monto, recibido } : { metodo, monto }
    );
}
```

- [ ] **Step 4: Verlas pasar**

Run: `npx vitest run lib/vender-reglas.test.ts`
Expected: PASS (todas, incluidas las anteriores).

- [ ] **Step 5: Cablear Vender y la cola offline**

`apps/web/lib/ventas-offline.ts` línea 61:

```ts
  p_pagos: { metodo: MetodoPago; monto: number; recibido?: number }[];
```

`apps/web/components/PuntoDeVenta.tsx`: agregar `pagosParaRpc` al import de `@/lib/vender-reglas` y reemplazar (líneas ~769-771):

```ts
      // Solo montos > 0 (`venta_pagos` lo exige). El `recibido` del efectivo viaja aparte de
      // `monto` (lo que cubre) y solo si lo cubre: la base lo guarda para reimprimir el vuelto.
      p_pagos: pagosParaRpc(pagos),
```

y actualizar el comentario de `cambiarRecibido` (líneas ~733-735) para que diga la verdad:

```ts
  // Lo que la clienta entregó en efectivo. Viaja a la RPC en su propia clave (`recibido`,
  // aparte de `monto`, que es lo que cubre) solo si alcanza — ver `pagosParaRpc`.
```

- [ ] **Step 6: Tipos, lint y suite completa**

Run: `pnpm typecheck` y, desde `apps/web`, `npx eslint components/PuntoDeVenta.tsx lib/vender-reglas.ts lib/ventas-offline.ts` y `npx vitest run`.
Expected: todo en verde.

- [ ] **Step 7: Commit**

Mensaje: `feat(ventas): Vender manda el efectivo recibido para reimprimir el vuelto`.

> **CHECKPOINT A — producción.** Antes de que el código de las Fases 2–3 llegue a `main`, Felipe pega `20260919210000_venta_pagos_recibido.sql` en el SQL Editor de cayla-dynamic y confirma. Hasta entonces la rama puede seguir creciendo, pero **no se mergea**.

---

## Fase 2 — «Ver todo», detalle y ticket

### Task 3: Reglas puras del detalle de venta

**Files:**
- Modify: `apps/web/lib/recibo-reglas.ts` (`LineaRecibo` y `armarRecibo`)
- Modify: `apps/web/lib/recibo-reglas.test.ts`
- Create: `apps/web/lib/venta-detalle-reglas.ts`
- Create: `apps/web/lib/venta-detalle-reglas.test.ts`

**Interfaces:**
- Consumes: `armarRecibo`, `ReciboVenta`, `PagoRecibo`, `TipoReciboFiscal`, `TipoDocCliente` (de `./recibo-reglas`); `EstadoComprobante` (de `./comprobantes-reglas`); `codigoPrenda` (de `./prenda-reglas`); `MetodoPago` (de `@cayla-retail/shared`).
- Produces (los usan las Tasks 4, 6 y 8):
  - `type FilasVenta`, `type VentaDetalle`, `type LineaDetalle`
  - `armarDetalleVenta(filas: FilasVenta, ctx: { sede: string; vendedor: string | null }): VentaDetalle`
  - `puedeImprimir(estado: EstadoComprobante): { ok: true; leyenda: string | null } | { ok: false; motivo: string }`

- [ ] **Step 1: Prueba de `armarRecibo` con `detalle` (falla)**

Al final de `apps/web/lib/recibo-reglas.test.ts`:

```ts
describe("armarRecibo — detalle opcional por línea (talla · color)", () => {
  const base = { comprobante, sede: "Tienda Lima", cliente: { tipoDoc: "sin_documento" as const, numDoc: null, nombre: null }, pagos: [{ metodo: "efectivo" as const, monto: 50 }], tasaIgv: 0.18 };

  it("lo lleva a la línea cuando viene", () => {
    const r = armarRecibo({ ...base, lineas: [{ cantidad: 1, referencia: "Polo Zoe", codigo: "POL-1", precioUnitario: 50, descuentoUnitario: 0, detalle: "M · Negro" }] });
    expect(r.lineas[0]?.detalle).toBe("M · Negro");
  });

  it("no agrega la clave cuando no viene (el ticket y sus pruebas no cambian)", () => {
    const r = armarRecibo({ ...base, lineas: [{ cantidad: 1, referencia: "Polo Zoe", codigo: "POL-1", precioUnitario: 50, descuentoUnitario: 0 }] });
    expect(r.lineas[0]).not.toHaveProperty("detalle");
  });
});
```

Run (`apps/web`): `npx vitest run lib/recibo-reglas.test.ts` — Expected: FAIL (la propiedad `detalle` no existe / es `undefined`).

- [ ] **Step 2: Implementar el `detalle` en `recibo-reglas.ts`**

En `LineaRecibo` agregar, tras `codigo`:

```ts
  /** «M · Negro»: talla y color, solo para el A4 (el ticket no lo imprime). Ausente si no se sabe. */
  detalle?: string;
```

En la firma de `armarRecibo`, el tipo de `lineas` pasa a:

```ts
  lineas: { cantidad: number; referencia: string; codigo: string | null; precioUnitario: number; descuentoUnitario: number; detalle?: string }[];
```

y el `map` de líneas:

```ts
  const lineas: LineaRecibo[] = entrada.lineas.map((l) => ({
    cantidad: l.cantidad,
    descripcion: l.referencia,
    codigo: l.codigo,
    ...(l.detalle ? { detalle: l.detalle } : {}),
    precioUnitario: l.precioUnitario,
    descuentoUnitario: l.descuentoUnitario,
    importe: redondear2(l.cantidad * (l.precioUnitario - l.descuentoUnitario)),
  }));
```

Run: `npx vitest run lib/recibo-reglas.test.ts` — Expected: PASS.

- [ ] **Step 3: Pruebas de `venta-detalle-reglas` (fallan)**

Crear `apps/web/lib/venta-detalle-reglas.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { armarDetalleVenta, puedeImprimir, type FilasVenta } from "./venta-detalle-reglas";

// Reimprimir una venta vieja tiene que dar el MISMO papel que salió al cobrarla: mismos
// importes, IGV y vuelto. Lo único que puede faltar es lo que nunca se guardó (el vuelto
// de las ventas anteriores a `venta_pagos.recibido`).

const vestido = { sku: null, codigo: "VES-0001-NEG-M", talla: { valor: "M" }, color: { nombre: "Negro" }, producto: { referencia: "Vestido Sofía" } };
const pantalon = { sku: "SKU-9", codigo: null, talla: { valor: "30" }, color: { nombre: "Azul" }, producto: { referencia: "Pantalón Carla" } };

const filas: FilasVenta = {
  id: "v1",
  created_at: "2026-09-19T17:05:00Z",
  items: [
    { cantidad: 1, precio_unitario: 149.9, descuento_unitario: 0, variante: vestido },
    { cantidad: 2, precio_unitario: 50, descuento_unitario: 5, variante: pantalon },
  ],
  pagos: [
    { metodo: "efectivo", monto: 139.9, recibido: 150 },
    { metodo: "yape", monto: 100, recibido: null },
  ],
  comprobante: {
    tipo: "boleta", serie: "B002", numero: 9380, estado: "aceptado", created_at: "2026-09-19T17:05:01Z",
    cliente_tipo_doc: "dni", cliente_num_doc: "12345678", cliente_nombre: "Ana Pérez",
    motivo_rechazo: null, respuesta_sunat: { hash: "abc123=", pdfUrl: "https://x/y.pdf" },
  },
};
const ctx = { sede: "Tienda TRU", vendedor: "Rosa" };

describe("armarDetalleVenta", () => {
  const d = armarDetalleVenta(filas, ctx);

  it("el total es la suma de las líneas con su descuento", () => {
    expect(d.total).toBe(239.9); // 149.90 + 2 × (50 − 5)
    expect(d.prendas).toBe(3);
  });

  it("cada línea trae nombre, talla · color y el código de la prenda", () => {
    expect(d.lineas[0]).toMatchObject({ nombre: "Vestido Sofía", detalle: "M · Negro", codigo: "VES-0001-NEG-M", importe: 149.9 });
    expect(d.lineas[1]).toMatchObject({ nombre: "Pantalón Carla", codigo: "SKU-9", importe: 90 }); // sin código cae al SKU
  });

  it("con recibido guardado reconstruye el vuelto del efectivo", () => {
    expect(d.pagos[0]).toMatchObject({ metodo: "efectivo", monto: 139.9, recibido: 150, vuelto: 10.1 });
    expect(d.vueltoTotal).toBe(10.1);
  });

  it("los medios que no son efectivo no llevan recibido ni vuelto", () => {
    expect(d.pagos[1]).toMatchObject({ metodo: "yape", monto: 100, recibido: null, vuelto: 0 });
  });

  it("arma el recibo con el comprobante que la base asignó", () => {
    expect(d.recibo).not.toBeNull();
    expect(d.recibo).toMatchObject({ tipo: "boleta", serie: "B002", numero: 9380, sede: "Tienda TRU", total: 239.9 });
    expect(d.recibo?.cliente).toEqual({ tipoDoc: "dni", numDoc: "12345678", nombre: "Ana Pérez" });
    expect(d.recibo?.lineas[0]?.detalle).toBe("M · Negro");
  });

  it("expone el hash y el estado del comprobante", () => {
    expect(d.comprobante).toMatchObject({ estado: "aceptado", hash: "abc123=", motivoRechazo: null });
  });
});

describe("armarDetalleVenta — ventas viejas y casos raros", () => {
  it("sin recibido guardado (venta anterior a la columna) no inventa vuelto", () => {
    const d = armarDetalleVenta({ ...filas, pagos: [{ metodo: "efectivo", monto: 239.9, recibido: null }] }, ctx);
    expect(d.pagos[0]).toMatchObject({ recibido: null, vuelto: 0 });
    expect(d.vueltoTotal).toBe(0);
  });

  it("sin comprobante no hay recibo, pero el detalle se arma igual", () => {
    const d = armarDetalleVenta({ ...filas, comprobante: null }, ctx);
    expect(d.recibo).toBeNull();
    expect(d.comprobante).toBeNull();
    expect(d.total).toBe(239.9);
  });

  it("una nota de crédito no se reimprime como boleta: sin recibo", () => {
    const d = armarDetalleVenta({ ...filas, comprobante: { ...filas.comprobante!, tipo: "nota_credito" } }, ctx);
    expect(d.recibo).toBeNull();
  });

  it("una variante que ya no existe no rompe: código «sin código»", () => {
    const d = armarDetalleVenta({ ...filas, items: [{ cantidad: 1, precio_unitario: 10, descuento_unitario: 0, variante: null }], pagos: [{ metodo: "efectivo", monto: 10, recibido: null }] }, ctx);
    expect(d.lineas[0]).toMatchObject({ nombre: "Prenda sin nombre", detalle: "", codigo: "sin código" });
  });

  it("un respuesta_sunat sin hash no lo inventa", () => {
    const d = armarDetalleVenta({ ...filas, comprobante: { ...filas.comprobante!, respuesta_sunat: null } }, ctx);
    expect(d.comprobante?.hash).toBeNull();
  });
});

describe("puedeImprimir — un papel que parece válido y no lo es, es peor que no imprimirlo", () => {
  it("aceptado imprime sin leyenda", () => {
    expect(puedeImprimir("aceptado")).toEqual({ ok: true, leyenda: null });
  });
  it("pendiente y enviado imprimen con la leyenda de validación", () => {
    for (const e of ["pendiente", "enviado"] as const) {
      expect(puedeImprimir(e)).toEqual({ ok: true, leyenda: "Comprobante pendiente de validación en SUNAT." });
    }
  });
  it("rechazado, anulado y no emitido no imprimen y dicen por qué", () => {
    for (const e of ["rechazado", "anulado", "no_emitido"] as const) {
      const r = puedeImprimir(e);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.motivo.length).toBeGreaterThan(10);
    }
  });
});
```

Run: `npx vitest run lib/venta-detalle-reglas.test.ts` — Expected: FAIL (módulo inexistente).

- [ ] **Step 4: Implementar `venta-detalle-reglas.ts`**

```ts
// Reglas puras del detalle de una venta ya cerrada y de su reimpresión. Sin DOM, sin React,
// sin `createClient`: `venta-detalle.ts` trae las filas de la base y esta función las
// convierte en lo que la pantalla y la impresora dibujan. Así se prueba sin navegador.
//
// El recibo NO se recalcula aparte: se arma con `armarRecibo`, la misma cuenta del ticket que
// salió al cobrar (`subtotal + IGV = total` al centavo).

import type { MetodoPago } from "@cayla-retail/shared";
import type { EstadoComprobante } from "./comprobantes-reglas";
import { codigoPrenda } from "./prenda-reglas";
import { armarRecibo, type PagoRecibo, type ReciboVenta, type TipoDocCliente, type TipoReciboFiscal } from "./recibo-reglas";

const redondear2 = (n: number) => Math.round(n * 100) / 100;

export type FilaVentaItem = {
  cantidad: number;
  precio_unitario: number;
  descuento_unitario: number;
  variante: {
    sku: string | null;
    codigo: string | null;
    talla: { valor: string } | null;
    color: { nombre: string } | null;
    producto: { referencia: string } | null;
  } | null;
};
export type FilaVentaPago = { metodo: MetodoPago; monto: number; recibido: number | null };
export type FilaComprobante = {
  tipo: string;
  serie: string;
  numero: number;
  estado: EstadoComprobante;
  created_at: string;
  cliente_tipo_doc: TipoDocCliente;
  cliente_num_doc: string | null;
  cliente_nombre: string | null;
  motivo_rechazo: string | null;
  respuesta_sunat: unknown;
};
export type FilasVenta = { id: string; created_at: string; items: FilaVentaItem[]; pagos: FilaVentaPago[]; comprobante: FilaComprobante | null };

export type LineaDetalle = {
  cantidad: number;
  nombre: string;
  /** «M · Negro»; vacío si no se sabe. */
  detalle: string;
  codigo: string;
  precioUnitario: number;
  descuentoUnitario: number;
  importe: number;
};

export type VentaDetalle = {
  ventaId: string;
  creadaEn: string;
  total: number;
  prendas: number;
  lineas: LineaDetalle[];
  pagos: PagoRecibo[];
  vueltoTotal: number;
  comprobante: { tipo: string; serie: string; numero: number; estado: EstadoComprobante; hash: string | null; motivoRechazo: string | null } | null;
  /** Solo si el comprobante es boleta o factura: lo que alimenta el ticket y el A4. */
  recibo: ReciboVenta | null;
};

function hashDe(respuesta: unknown): string | null {
  if (typeof respuesta !== "object" || respuesta === null) return null;
  const h = (respuesta as { hash?: unknown }).hash;
  return typeof h === "string" && h !== "" ? h : null;
}

export function armarDetalleVenta(filas: FilasVenta, ctx: { sede: string; vendedor: string | null }): VentaDetalle {
  const lineas: LineaDetalle[] = filas.items.map((it) => {
    const v = it.variante;
    return {
      cantidad: it.cantidad,
      nombre: v?.producto?.referencia ?? "Prenda sin nombre",
      detalle: [v?.talla?.valor, v?.color?.nombre].filter(Boolean).join(" · "),
      codigo: v ? codigoPrenda(v) : "sin código",
      precioUnitario: it.precio_unitario,
      descuentoUnitario: it.descuento_unitario,
      importe: redondear2(it.cantidad * (it.precio_unitario - it.descuento_unitario)),
    };
  });
  const total = redondear2(lineas.reduce((a, l) => a + l.importe, 0));

  const c = filas.comprobante;
  const esFiscal = c !== null && (c.tipo === "boleta" || c.tipo === "factura");
  const recibo = esFiscal
    ? armarRecibo({
        comprobante: { tipo: c.tipo as TipoReciboFiscal, serie: c.serie, numero: c.numero, created_at: c.created_at },
        sede: ctx.sede,
        cliente: { tipoDoc: c.cliente_tipo_doc, numDoc: c.cliente_num_doc, nombre: c.cliente_nombre },
        lineas: lineas.map((l) => ({
          cantidad: l.cantidad,
          referencia: l.nombre,
          codigo: l.codigo,
          precioUnitario: l.precioUnitario,
          descuentoUnitario: l.descuentoUnitario,
          detalle: l.detalle || undefined,
        })),
        pagos: filas.pagos.map((p) => ({ metodo: p.metodo, monto: p.monto, recibido: p.recibido ?? undefined })),
        tasaIgv: 0.18,
      })
    : null;

  // Los pagos salen del recibo cuando lo hay (misma cuenta del vuelto); si no, se arman igual.
  const pagos: PagoRecibo[] =
    recibo?.pagos ??
    filas.pagos.map((p) => ({ metodo: p.metodo, monto: p.monto, recibido: p.recibido, vuelto: p.recibido !== null && p.metodo === "efectivo" ? Math.max(0, redondear2(p.recibido - p.monto)) : 0 }));

  return {
    ventaId: filas.id,
    creadaEn: filas.created_at,
    total,
    prendas: lineas.reduce((a, l) => a + l.cantidad, 0),
    lineas,
    pagos,
    vueltoTotal: redondear2(pagos.reduce((a, p) => a + p.vuelto, 0)),
    comprobante: c ? { tipo: c.tipo, serie: c.serie, numero: c.numero, estado: c.estado, hash: hashDe(c.respuesta_sunat), motivoRechazo: c.motivo_rechazo } : null,
    recibo,
  };
}

/** Qué comprobantes se pueden reimprimir. `pendiente` y `enviado` imprimen con una leyenda:
 *  el documento existe pero SUNAT todavía no lo validó. Lo rechazado, anulado o que nunca se
 *  emitió no se imprime: un papel que parece válido y no lo es, es peor que no imprimirlo. */
export function puedeImprimir(estado: EstadoComprobante): { ok: true; leyenda: string | null } | { ok: false; motivo: string } {
  switch (estado) {
    case "aceptado":
      return { ok: true, leyenda: null };
    case "pendiente":
    case "enviado":
      return { ok: true, leyenda: "Comprobante pendiente de validación en SUNAT." };
    case "rechazado":
      return { ok: false, motivo: "SUNAT rechazó este comprobante: no se puede imprimir." };
    case "anulado":
      return { ok: false, motivo: "Este comprobante está anulado: no se puede imprimir." };
    case "no_emitido":
      return { ok: false, motivo: "Este comprobante no se emitió: no hay nada que imprimir." };
  }
}
```

- [ ] **Step 5: Verlas pasar**

Run: `npx vitest run lib/venta-detalle-reglas.test.ts lib/recibo-reglas.test.ts` — Expected: PASS.
Si `pagos[0].vuelto` sale `10.1` como número, bien; `toMatchObject` compara con `10.1`.

- [ ] **Step 6: Tipos y commit**

Run: `pnpm typecheck` (el `switch` debe ser exhaustivo; si `EstadoComprobante` cambia, el compilador avisa).
Commit: `feat(ventas): reglas puras del detalle de venta y de qué comprobantes se reimprimen`.

---

### Task 4: Lectura de una venta

**Files:**
- Create: `apps/web/lib/venta-detalle.ts`

**Interfaces:**
- Consumes: `createClient` (`@/lib/supabase/client`), `armarDetalleVenta`, `FilasVenta`, `VentaDetalle` (Task 3).
- Produces: `leerVentaDetalle(supabase: ReturnType<typeof createClient>, ventaId: string, ctx: { sede: string; vendedor: string | null }): Promise<VentaDetalle>` — lanza `Error` si falla o si la venta no existe.

- [ ] **Step 1: Escribir la lectura**

```ts
import type { createClient } from "@/lib/supabase/client";
import { armarDetalleVenta, type FilasVenta, type VentaDetalle } from "@/lib/venta-detalle-reglas";

type Cliente = ReturnType<typeof createClient>;

/** Lee una venta con sus prendas, sus pagos y su comprobante. La RLS (`fn_puede_operar_ubicacion`)
 *  decide quién la ve: una integrante solo las de su tienda. Va con el cliente del navegador
 *  —igual que `PuntoDeVenta` lee su comprobante— porque el detalle se abre al hacer clic. */
export async function leerVentaDetalle(supabase: Cliente, ventaId: string, ctx: { sede: string; vendedor: string | null }): Promise<VentaDetalle> {
  const [venta, comprobante] = await Promise.all([
    supabase
      .from("ventas")
      .select(
        `id, created_at,
         venta_items ( cantidad, precio_unitario, descuento_unitario,
           variante:variantes ( sku, codigo, talla:tallas ( valor ), color:colores ( nombre ), producto:productos ( referencia ) ) ),
         venta_pagos ( metodo, monto, recibido )`
      )
      .eq("id", ventaId)
      .maybeSingle(),
    supabase
      .from("comprobantes")
      .select("tipo, serie, numero, estado, created_at, cliente_tipo_doc, cliente_num_doc, cliente_nombre, motivo_rechazo, respuesta_sunat")
      .eq("venta_id", ventaId)
      .maybeSingle(),
  ]);
  if (venta.error) throw new Error(venta.error.message);
  if (comprobante.error) throw new Error(comprobante.error.message);
  if (!venta.data) throw new Error("La venta no existe o no tienes permiso para verla.");

  // El tipado de las relaciones embebidas de PostgREST es ancho (objeto o arreglo); la forma
  // real está fijada por el `select` de arriba, así que se afirma aquí, en un solo lugar.
  const filas: FilasVenta = {
    id: venta.data.id,
    created_at: venta.data.created_at,
    items: venta.data.venta_items as unknown as FilasVenta["items"],
    pagos: venta.data.venta_pagos as unknown as FilasVenta["pagos"],
    comprobante: (comprobante.data as unknown as FilasVenta["comprobante"]) ?? null,
  };
  return armarDetalleVenta(filas, ctx);
}
```

- [ ] **Step 2: Tipos**

Run: `pnpm typecheck`. Expected: verde. Si un nombre de columna o relación no existe en los tipos (`variantes.codigo`, `tallas.valor`, `colores.nombre`, `productos.referencia`), corregirlo mirando `apps/web/lib/ventas-v2.ts:283-292`, que ya lee esas mismas relaciones.

- [ ] **Step 3: Commit**

Commit: `feat(ventas): leerVentaDetalle — la venta, sus prendas, pagos y comprobante`. (La verificación real contra la base es la del Task 6.)

---

### Task 5: «Ver todo» en Movimientos recientes

**Files:**
- Create: `apps/web/components/FilaMovimientoCaja.tsx`
- Create: `apps/web/components/MovimientosCajaModal.tsx`
- Modify: `apps/web/components/CajaAbiertaPanel.tsx`
- Create (temporal): `apps/web/app/login/vista-previa-caja/page.tsx`

**Interfaces:**
- Produces:
  - `type EventoCaja = { id: string; minutos: number; horaTexto: string; icono: "venta" | "ingreso" | "egreso"; titulo: string; meta: string; monto: number; color: string }`
  - `FilaMovimientoCaja({ e, nuevo, onAbrirVenta }: { e: EventoCaja; nuevo: boolean; onAbrirVenta: (ventaId: string) => void })`
  - `MovimientosCajaModal({ eventos, idsNuevos, ubicacionNombre, onAbrirVenta, onClose })`
  - En el panel: `LIMITE_TARJETA = 8`; estado `ventaAbiertaId: string | null`.

- [ ] **Step 1: Extraer la fila a `FilaMovimientoCaja.tsx`**

La fila hoy vive dentro de `CajaAbiertaPanel` (el `<div key={e.id} className="anim-revelar relative isolate ...">`). Se mueve tal cual, con el tipo y una raíz que es `<button>` para las ventas:

```tsx
"use client";

import { CircleMinus, CirclePlus, ShoppingBag } from "lucide-react";

export type EventoCaja = {
  id: string;
  minutos: number;
  horaTexto: string;
  icono: "venta" | "ingreso" | "egreso";
  titulo: string;
  meta: string;
  monto: number;
  color: string;
};

const money = (n: number) => "S/" + n.toFixed(2);

/** Una fila de «Movimientos recientes» y de «Ver todo». Las ventas son un botón que abre su
 *  detalle; los ingresos y egresos no (no hay más que ver de ellos). */
export function FilaMovimientoCaja({ e, nuevo, onAbrirVenta }: { e: EventoCaja; nuevo: boolean; onAbrirVenta: (ventaId: string) => void }) {
  const esVenta = e.icono === "venta";
  const clases = `anim-revelar relative isolate flex w-full items-center gap-3 py-2.5 text-left @[640px]:break-inside-avoid ${
    esVenta ? "cursor-pointer rounded-lg transition-colors hover:bg-sand/30 focus-visible:bg-sand/30 focus-visible:outline-none" : ""
  }`;
  const contenido = (
    <>
      {/* `isolate` + el velo en `-z-10`: el resaltado de una fila nueva queda DETRÁS de su texto. */}
      {nuevo && <span aria-hidden className="anim-vivo-fila pointer-events-none absolute -inset-x-2 inset-y-0.5 -z-10 rounded-lg bg-verde/15" />}
      <div
        aria-hidden
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: `color-mix(in srgb, ${e.color} 14%, transparent)`, color: e.color }}
      >
        {e.icono === "venta" ? <ShoppingBag size={14} /> : e.icono === "ingreso" ? <CirclePlus size={14} /> : <CircleMinus size={14} />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-semibold text-tinta">{e.titulo}</p>
        <p className="text-[11.5px] text-tinta/50">
          {e.horaTexto} · {e.meta}
        </p>
      </div>
      <p key={e.monto} className={`anim-asentar shrink-0 text-sm font-bold tabular-nums ${e.monto < 0 ? "text-rojo" : "text-verde-profundo"}`}>
        {e.monto < 0 ? "−" : "+"}
        {money(Math.abs(e.monto))}
      </p>
    </>
  );
  // Dos ramas y no una etiqueta variable: `type`/`onClick` no existen en un `div` y TypeScript lo rechaza.
  return esVenta ? (
    <button type="button" onClick={() => onAbrirVenta(e.id)} aria-label={`Ver el detalle de la venta de ${money(e.monto)}, ${e.horaTexto}`} className={clases}>
      {contenido}
    </button>
  ) : (
    <div className={clases}>{contenido}</div>
  );
}
```

- [ ] **Step 2: Crear `MovimientosCajaModal.tsx`**

```tsx
"use client";

import { Modal } from "@/components/ui/Modal";
import { FilaMovimientoCaja, type EventoCaja } from "@/components/FilaMovimientoCaja";

/** «Ver todo»: todos los movimientos de la caja en una lista con scroll propio, para que la
 *  tarjeta del tablero no se alargue cuando hay muchos. Al abrir una venta, su detalle se
 *  apila encima y al cerrarlo se vuelve a esta lista. */
export function MovimientosCajaModal({
  eventos,
  idsNuevos,
  ubicacionNombre,
  onAbrirVenta,
  onClose,
}: {
  eventos: EventoCaja[];
  idsNuevos: ReadonlySet<string>;
  ubicacionNombre: string;
  onAbrirVenta: (ventaId: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal titulo="Movimientos de la caja" subtitulo={`${ubicacionNombre} · ${eventos.length} en total`} onClose={onClose} ancho="max-w-2xl">
      {/* El scroll es de la lista, no del modal: el título se queda a la vista. */}
      <div className="scroll-cayla mt-3 max-h-[62vh] divide-y divide-sand overflow-y-auto pr-1">
        {eventos.map((e) => (
          <FilaMovimientoCaja key={e.id} e={e} nuevo={idsNuevos.has(e.id)} onAbrirVenta={onAbrirVenta} />
        ))}
      </div>
    </Modal>
  );
}
```

- [ ] **Step 3: Cambiar `CajaAbiertaPanel.tsx`**

Cuatro ediciones (anclas por texto, no por número de línea):

1. **Imports** — agregar:
```tsx
import { FilaMovimientoCaja, type EventoCaja } from "@/components/FilaMovimientoCaja";
import { MovimientosCajaModal } from "@/components/MovimientosCajaModal";
import { DetalleVentaModal } from "@/components/DetalleVentaModal";
```
y quitar de los imports de `lucide-react` los íconos que dejen de usarse en el panel (`ShoppingBag`; `CirclePlus`/`CircleMinus` **siguen** usándose en los KPI: conservarlos). Deja que `pnpm typecheck`/eslint señale los sobrantes.

2. **Estado** — donde está `const [modal, setModal] = useState<"movimiento" | "cerrar" | null>(null);` reemplazar por:
```tsx
  const [modal, setModal] = useState<"movimiento" | "cerrar" | "todos" | null>(null);
  // La venta cuyo detalle está abierto. Aparte de `modal`: se apila sobre «Ver todo».
  const [ventaAbiertaId, setVentaAbiertaId] = useState<string | null>(null);
```

3. **Eventos** — reemplazar el bloque que va desde `type EventoTimeline = {` hasta el `.slice(0, 8);` que cierra `const eventos ...` por (las dos fuentes y el orden son los de siempre; solo cambia que ya no se corta al armar):
```tsx
  const todosLosEventos: EventoCaja[] = [
    ...ventasHoy.map((v) => ({
      id: v.ventaId,
      minutos: minutosDeHora(v.hora),
      horaTexto: v.hora,
      icono: "venta" as const,
      titulo: `Venta${v.metodosPago ? ` · ${v.metodosPago}` : ""}`,
      meta: v.vendedor ?? "—",
      monto: v.total,
      color: colorDeMetodo(v.metodosPago),
    })),
    ...movimientos.map((m) => {
      const d = new Date(m.creadoEn);
      return {
        id: m.id,
        minutos: d.getHours() * 60 + d.getMinutes(),
        horaTexto: d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }),
        icono: m.tipo,
        titulo: m.motivo,
        meta: m.registradoPorNombre ?? "—",
        monto: m.tipo === "egreso" ? -m.monto : m.monto,
        color: m.tipo === "egreso" ? "var(--color-rojo)" : "var(--color-verde)",
      };
    }),
  ].sort((a, b) => b.minutos - a.minutos);
  // La tarjeta muestra las más recientes; «Ver todo» abre el resto sin alargar el tablero.
  const eventos = todosLosEventos.slice(0, LIMITE_TARJETA);
```
y, junto a las demás constantes de módulo (p. ej. tras `idMovimiento`): `const LIMITE_TARJETA = 8;`

4. **La tarjeta** — reemplazar, dentro de la tarjeta «Movimientos recientes», el encabezado (`<p ...>Movimientos recientes</p>` y su `<p ...>Últimos registros de esta caja</p>`) y el `eventos.map(...)` por:
```tsx
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-tinta">Movimientos recientes</p>
                <p className="mb-1.5 text-xs text-tinta/50">Últimos registros de esta caja</p>
              </div>
              {todosLosEventos.length > 0 && (
                <button
                  type="button"
                  onClick={() => setModal("todos")}
                  className="label-cayla shrink-0 rounded-md px-2 py-1 text-[11px] text-taupe-profundo transition-colors hover:bg-sand/40 hover:text-tinta"
                >
                  Ver todo{todosLosEventos.length > LIMITE_TARJETA ? ` (${todosLosEventos.length})` : ""}
                </button>
              )}
            </div>
```
```tsx
                {eventos.map((e) => (
                  <FilaMovimientoCaja key={e.id} e={e} nuevo={idsNuevos.has(e.id)} onAbrirVenta={setVentaAbiertaId} />
                ))}
```
(dentro del mismo `<div className="divide-y divide-sand @[640px]:columns-2 @[640px]:gap-x-10">`).

5. **Los modales** — junto a los otros dos, **fuera** del `@container`, al final del componente:
```tsx
      {modal === "todos" && (
        <MovimientosCajaModal
          eventos={todosLosEventos}
          idsNuevos={idsNuevos}
          ubicacionNombre={ubicacionNombre}
          onAbrirVenta={setVentaAbiertaId}
          onClose={() => setModal(null)}
        />
      )}
      {ventaAbiertaId && (
        <DetalleVentaModal
          ventaId={ventaAbiertaId}
          vendedor={ventasHoy.find((v) => v.ventaId === ventaAbiertaId)?.vendedor ?? null}
          ubicacionNombre={ubicacionNombre}
          onClose={() => setVentaAbiertaId(null)}
        />
      )}
```

> `DetalleVentaModal` se crea en el Task 6; hasta entonces este archivo no compila. **Hacer el Task 5 y el 6 seguidos y commitear al final del 6** (o crear primero el archivo del Task 6 con solo `export function DetalleVentaModal(): null { return null; }` y reemplazarlo allá).

- [ ] **Step 4: Vista previa temporal para verlo sin sesión**

Crear `apps/web/app/login/vista-previa-caja/page.tsx` (se borra antes de commitear):

```tsx
"use client";
// TEMPORAL — solo para mirar Caja sin sesión. Se borra antes de commitear.
import { CajaAbiertaPanel } from "@/components/CajaAbiertaPanel";

const hace = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const horas = ["09:40", "10:05", "10:31", "11:02", "11:18", "11:44", "12:03", "12:20", "12:41", "13:05", "13:22", "13:50"];

export default function Vista() {
  return (
    <div className="min-h-screen bg-crema p-8">
      <CajaAbiertaPanel
        ubicacionNombre="Tienda TRU" personaNombre="Ana" personaRol="integrante"
        caja={{ id: "c1", ubicacionId: "u1", montoApertura: 200, abiertaEn: hace(300), abiertaPorNombre: "Ana" }}
        resumen={{ ventasEfectivo: 420, ventasOtros: 690, ingresos: 50, egresos: 30, reembolsosEfectivo: 0, cambiosEfectivo: 0, porMetodo: [{ metodo: "efectivo", monto: 420 }] }}
        movimientos={[{ id: "m1", tipo: "ingreso", monto: 50, motivo: "Sencillo", nota: null, esAjuste: false, creadoEn: hace(60), usuarioId: null, registradoPorNombre: "Ana" }]}
        series={{ porMetodo: { efectivo: 420 }, porHora: [] }}
        ventasHoy={horas.map((h, i) => ({ ventaId: `v${i}`, hora: h, vendedor: "Ana", metodosPago: i % 2 ? "Yape" : "Efectivo", total: 80 + i * 10 }))}
        metaVentaDiaria={2000} cierresRecientes={[]}
      />
    </div>
  );
}
```

- [ ] **Step 5: Verificar en el navegador**

`preview_start` con `cayla-retail-dev`, abrir `http://localhost:3000/login/vista-previa-caja` (la primera navegación a una ruta nueva a veces cae en `/login`: repetirla). Comprobar:
  - La tarjeta muestra 8 filas y arriba a la derecha dice «Ver todo (13)».
  - «Ver todo» abre el modal con las 13, con scroll propio y el título fijo; Esc lo cierra.
  - Las filas de venta reaccionan al hover y son botones (`read_page` las lista como `button`); la del ingreso «Sencillo» **no** lo es.
  - (El clic en una venta se prueba en el Task 6.)

- [ ] **Step 6: Tipos/lint y commit (junto con el Task 6)**

Run: `pnpm typecheck` y `npx eslint components/CajaAbiertaPanel.tsx components/FilaMovimientoCaja.tsx components/MovimientosCajaModal.tsx`.
`rm -rf apps/web/app/login/vista-previa-caja` (desde la raíz) antes de commitear.

---

### Task 6: Detalle de venta con impresión del ticket

**Files:**
- Create: `apps/web/components/DetalleVentaModal.tsx`
- Create (temporal): `apps/web/app/login/vista-previa-detalle/page.tsx`

**Interfaces:**
- Consumes: `leerVentaDetalle` (Task 4), `puedeImprimir`, `VentaDetalle`, `armarDetalleVenta` (Task 3), `ReciboTermico`, `Modal`, `botonPrimario`, `botonCancelar`.
- Produces: `DetalleVentaModal({ ventaId, vendedor, ubicacionNombre, cargar?, onClose })`. `cargar` es una costura para probar con datos de mentira y **debe ser una referencia estable** (no una función creada en el render). Impresión: estado `imprimiendo: "ticket" | "a4" | null`; el Task 8 agrega `"a4"`.

- [ ] **Step 1: Escribir el modal**

```tsx
"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Printer } from "lucide-react";
import { Modal, botonCancelar, botonPrimario } from "@/components/ui/Modal";
import { ReciboTermico } from "@/components/ReciboTermico";
import { createClient } from "@/lib/supabase/client";
import { leerVentaDetalle } from "@/lib/venta-detalle";
import { puedeImprimir, type VentaDetalle } from "@/lib/venta-detalle-reglas";
import { ESTADO_ETIQUETA, ETIQUETA_TIPO } from "@/lib/comprobantes-reglas";
import { fechaHoraLima, NOMBRE_METODO, textoNumeroRecibo } from "@/lib/recibo-reglas";

const money = (n: number) => "S/" + n.toFixed(2);

type Carga = { fase: "cargando" } | { fase: "error" } | { fase: "lista"; detalle: VentaDetalle };
type Impresion = "ticket" | "a4" | null;

/**
 * El detalle de una venta ya cerrada: qué se llevó la clienta, cómo pagó (con el vuelto que se
 * le dio) y su comprobante, con los botones para volver a imprimirlo. Se lee de la base al abrir.
 *
 * Al imprimir se monta UNA sola raíz de impresión pegada a `<body>` (portal) y el CSS de
 * `globals.css` oculta todo lo demás. Nunca dos a la vez: las dos raíces se pisarían.
 */
export function DetalleVentaModal({
  ventaId,
  vendedor,
  ubicacionNombre,
  cargar,
  onClose,
}: {
  ventaId: string;
  vendedor: string | null;
  ubicacionNombre: string;
  /** Solo para probar con datos de mentira. Debe ser estable (módulo o `useCallback`). */
  cargar?: (ventaId: string) => Promise<VentaDetalle>;
  onClose: () => void;
}) {
  const [carga, setCarga] = useState<Carga>({ fase: "cargando" });
  const [intento, setIntento] = useState(0);
  const [imprimiendo, setImprimiendo] = useState<Impresion>(null);

  useEffect(() => {
    let vigente = true;
    const leer = cargar ?? ((id: string) => leerVentaDetalle(createClient(), id, { sede: ubicacionNombre, vendedor }));
    leer(ventaId).then(
      (detalle) => vigente && setCarga({ fase: "lista", detalle }),
      () => vigente && setCarga({ fase: "error" })
    );
    return () => {
      vigente = false;
    };
  }, [ventaId, ubicacionNombre, vendedor, cargar, intento]);

  function reintentar() {
    setCarga({ fase: "cargando" });
    setIntento((n) => n + 1);
  }

  // Imprime cuando la raíz ya está montada y sus imágenes decodificadas; termina con
  // `afterprint` (con el respaldo de 4 s por si el navegador no lo emite: sin él la raíz de
  // impresión quedaría montada). `print()` bloquea hasta cerrar el diálogo, así que el
  // temporizador arranca recién al llamarlo.
  useEffect(() => {
    if (!imprimiendo) return;
    let respaldo: number | undefined;
    const terminar = () => {
      window.removeEventListener("afterprint", terminar);
      window.clearTimeout(respaldo);
      setImprimiendo(null);
    };
    const cuadro = requestAnimationFrame(async () => {
      const imagenes = [...document.querySelectorAll<HTMLImageElement>("#comprobante-print img, #boleta-a4-print img")];
      await Promise.all(imagenes.map((i) => i.decode().catch(() => undefined)));
      window.addEventListener("afterprint", terminar);
      respaldo = window.setTimeout(terminar, 4000);
      window.print();
    });
    return () => {
      cancelAnimationFrame(cuadro);
      window.removeEventListener("afterprint", terminar);
      window.clearTimeout(respaldo);
    };
  }, [imprimiendo]);

  return (
    <Modal titulo="Detalle de la venta" subtitulo={ubicacionNombre} onClose={onClose} ancho="max-w-lg">
      {(cerrar) => {
        if (carga.fase === "cargando") return <p className="py-10 text-center text-sm text-tinta/60">Cargando la venta…</p>;
        if (carga.fase === "error")
          return (
            <div className="space-y-4 py-6 text-center">
              <p className="text-sm text-tinta/80">No pudimos cargar esta venta.</p>
              <div className="flex justify-center gap-2.5">
                <button type="button" className={botonCancelar} onClick={cerrar}>
                  Cerrar
                </button>
                <button type="button" className={botonPrimario} onClick={reintentar}>
                  Reintentar
                </button>
              </div>
            </div>
          );

        const d = carga.detalle;
        const { fecha, hora } = fechaHoraLima(d.creadaEn);
        const permiso = d.comprobante ? puedeImprimir(d.comprobante.estado) : ({ ok: false, motivo: "Esta venta no tiene comprobante." } as const);
        const imprimible = permiso.ok && d.recibo !== null;
        return (
          <div className="space-y-4">
            <div className="card-cayla p-5 text-center">
              <p className="font-display text-3xl text-tinta">{money(d.total)}</p>
              <p className="mt-1 text-sm text-tinta/70">
                {d.prendas} {d.prendas === 1 ? "prenda" : "prendas"} · {fecha} {hora}
                {vendedor && ` · ${vendedor}`}
              </p>
            </div>

            {d.comprobante ? (
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-tinta">
                  {ETIQUETA_TIPO[d.comprobante.tipo as keyof typeof ETIQUETA_TIPO] ?? d.comprobante.tipo}{" "}
                  <span className="font-mono">{textoNumeroRecibo(d.comprobante)}</span>
                </span>
                <span className="text-[11px] text-tinta/60">{ESTADO_ETIQUETA[d.comprobante.estado]}</span>
              </div>
            ) : (
              <p className="text-sm text-tinta/70">Sin comprobante.</p>
            )}

            <ul className="card-cayla scroll-cayla max-h-56 divide-y divide-sand overflow-y-auto px-4 text-sm">
              {d.lineas.map((l, i) => (
                <li key={i} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-tinta">
                      {l.cantidad} × {l.nombre}
                    </p>
                    <p className="text-[11.5px] text-tinta/55">
                      {[l.detalle, l.codigo].filter(Boolean).join(" · ")}
                      {l.descuentoUnitario > 0 && ` · dscto. −${money(l.descuentoUnitario)} c/u`}
                    </p>
                  </div>
                  <span className="shrink-0 tabular-nums text-tinta">{money(l.importe)}</span>
                </li>
              ))}
            </ul>

            <div className="card-cayla space-y-1.5 p-4 text-sm">
              {d.pagos.map((p) => (
                <div key={p.metodo}>
                  <p className="flex justify-between tabular-nums text-tinta/85">
                    <span>{NOMBRE_METODO[p.metodo]}</span>
                    <span>{money(p.monto)}</span>
                  </p>
                  {p.metodo === "efectivo" && p.recibido !== null && (
                    <p className="flex justify-between text-xs tabular-nums text-tinta/60">
                      <span>Recibió {money(p.recibido)}</span>
                      <span>Vuelto {money(p.vuelto)}</span>
                    </p>
                  )}
                </div>
              ))}
              {d.recibo && (
                <div className="space-y-0.5 border-t border-sand pt-2 text-xs tabular-nums text-tinta/65">
                  <p className="flex justify-between"><span>Subtotal</span><span>{money(d.recibo.subtotal)}</span></p>
                  <p className="flex justify-between"><span>IGV (18%)</span><span>{money(d.recibo.igv)}</span></p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap gap-2.5">
                <button type="button" className={`${botonPrimario} inline-flex items-center justify-center gap-2`} disabled={!imprimible || imprimiendo !== null} onClick={() => setImprimiendo("ticket")}>
                  <Printer size={14} aria-hidden /> Imprimir ticket
                </button>
              </div>
              {!permiso.ok && <p className="text-xs text-tinta/65">{permiso.motivo}</p>}
              {permiso.ok && permiso.leyenda && <p className="text-xs text-ambar-profundo">{permiso.leyenda}</p>}
            </div>

            {/* Raíz de impresión: solo una a la vez, pegada a <body> (el CSS oculta el resto). */}
            {imprimiendo === "ticket" && d.recibo && createPortal(<ReciboTermico recibo={d.recibo} />, document.body)}
          </div>
        );
      }}
    </Modal>
  );
}
```

> Ajustes esperables al compilar: `ESTADO_ETIQUETA`/`ETIQUETA_TIPO` deben cubrir todos los estados/tipos (`ESTADO_ETIQUETA` es `Record<EstadoComprobante, string>`; si falta `no_emitido`, agregarlo allí, no aquí). `botonPrimario`/`botonCancelar` son strings de clase exportados por `components/ui/Modal` (los usa `VentaRegistradaModal`).

- [ ] **Step 2: Vista previa temporal del detalle (con datos de mentira)**

`apps/web/app/login/vista-previa-detalle/page.tsx`:

```tsx
"use client";
// TEMPORAL — se borra antes de commitear.
import { DetalleVentaModal } from "@/components/DetalleVentaModal";
import { armarDetalleVenta } from "@/lib/venta-detalle-reglas";

const v = (referencia: string, codigo: string) => ({ sku: null, codigo, talla: { valor: "M" }, color: { nombre: "Negro" }, producto: { referencia } });
const estados = ["aceptado", "pendiente", "rechazado"] as const;

function cargar(id: string) {
  if (id === "falla") return Promise.reject(new Error("prueba"));
  const estado = estados[Number(id.replace("v", "")) % 3] ?? "aceptado";
  return Promise.resolve(
    armarDetalleVenta(
      {
        id, created_at: new Date().toISOString(),
        items: [
          { cantidad: 1, precio_unitario: 149.9, descuento_unitario: 0, variante: v("Vestido Sofía", "VES-0001-NEG-M") },
          { cantidad: 2, precio_unitario: 50, descuento_unitario: 5, variante: v("Pantalón Carla", "PAN-0001-NEG-30") },
        ],
        pagos: [{ metodo: "efectivo", monto: 139.9, recibido: 150 }, { metodo: "yape", monto: 100, recibido: null }],
        comprobante: { tipo: "boleta", serie: "B002", numero: 9380, estado, created_at: new Date().toISOString(), cliente_tipo_doc: "dni", cliente_num_doc: "12345678", cliente_nombre: "Ana Pérez", motivo_rechazo: null, respuesta_sunat: { hash: "abc123=" } },
      },
      { sede: "Tienda TRU", vendedor: "Rosa" }
    )
  );
}

export default function Vista() {
  const id = typeof window === "undefined" ? "v0" : (new URLSearchParams(window.location.search).get("id") ?? "v0");
  return <div className="min-h-screen bg-crema p-8"><DetalleVentaModal ventaId={id} vendedor="Rosa" ubicacionNombre="Tienda TRU" cargar={cargar} onClose={() => undefined} /></div>;
}
```

Abrir `/login/vista-previa-detalle?id=v0` (aceptado), `?id=v1` (pendiente), `?id=v2` (rechazado), `?id=falla`. Comprobar:
  - `v0`: total S/239.90, 3 prendas, líneas con talla · color · código y «dscto. −S/5.00 c/u», pagos con «Recibió S/150.00 / Vuelto S/10.10», subtotal + IGV; botón «Imprimir ticket» habilitado.
  - `v1`: botón habilitado y leyenda ámbar «pendiente de validación en SUNAT».
  - `v2`: botón apagado con «SUNAT rechazó…».
  - `falla`: «No pudimos cargar esta venta» con «Reintentar» que vuelve a mostrar el error.
  - En `v0`, «Imprimir ticket» abre la vista previa de impresión del navegador con el recibo (solo el ticket, sin el resto de la pantalla). En el Browser pane el diálogo puede no verse: alternativa con `browser_emulate_media` a `print` o comprobar por DOM que `#comprobante-print` existe en `<body>` tras el clic y se quita después.

- [ ] **Step 3: Verificación de punta a punta con la base local (lo hace Felipe, con su sesión)**

Con el servidor de `localhost:3000`: abrir caja, vender algo en efectivo entregando más del total (p. ej. total S/40, recibido S/50), volver a Caja y abrir esa venta en «Movimientos recientes». Debe mostrar «Recibió S/50.00 · Vuelto S/10.00» y el ticket impreso debe traer la línea de vuelto. Comprobar en la base:
```bash
docker exec supabase_db_cayla-retail psql -U postgres -tAc "select metodo, monto, recibido from retail.venta_pagos order by id desc limit 3"
```
Una venta anterior a la migración debe abrir sin línea de vuelto y sin error.

- [ ] **Step 4: Tipos, lint, suite; borrar temporales; commit**

Run: `pnpm typecheck`, `npx eslint components/DetalleVentaModal.tsx`, `npx vitest run` (desde `apps/web`). Borrar `apps/web/app/login/vista-previa-*` (desde la raíz).
Commit (incluye el Task 5): `feat(caja): «Ver todo» y detalle de venta con reimpresión del ticket`.

---

## Fase 3 — Boleta A4

### Task 7: Reglas y componente del A4 (maqueta)

**Files:**
- Create: `apps/web/lib/boleta-a4-reglas.ts`, `apps/web/lib/boleta-a4-reglas.test.ts`
- Create: `apps/web/components/BoletaA4.tsx`
- Create (temporal): `apps/web/app/login/vista-previa-a4/page.tsx`

**Interfaces:**
- Consumes: `ReciboVenta`, `fechaHoraLima`, `montoEnLetras`, `textoNumeroRecibo`, `textoQrSunat`, `TITULO_DOCUMENTO`, `NOMBRE_METODO` (`@/lib/recibo-reglas`); `EMISOR`, `Emisor` (`@/lib/emisor`); `DIAS_PLAZO_CAMBIO` (`@/lib/cambios-reglas`).
- Produces:
  - `lineasA4(recibo: ReciboVenta, tasaIgv?: number): LineaA4[]` con `LineaA4 = { cantidad: number; unidad: string; descripcion: string; detalle: string | null; codigo: string | null; valorUnitario: number; descuento: number; total: number }`
  - `BoletaA4({ recibo, emisor?, vendedor?, hash?, leyenda? })`

- [ ] **Step 1: Pruebas de las reglas del A4 (fallan)**

```ts
import { describe, it, expect } from "vitest";
import { lineasA4 } from "./boleta-a4-reglas";
import { armarRecibo } from "./recibo-reglas";

// El A4 muestra los valores SIN IGV (como el original de Alegra) y la suma de la columna
// Total tiene que ser «Op. gravada» al centavo: si no, el papel se contradice a simple vista.

const cliente = { tipoDoc: "sin_documento" as const, numDoc: null, nombre: null };
const comprobante = { tipo: "boleta" as const, serie: "B002", numero: 9380, created_at: "2026-09-05T19:40:51Z" };
const linea = (precioUnitario: number, extra: object = {}) => ({ cantidad: 1, referencia: "Polo Zoe", codigo: "POL-1", precioUnitario, descuentoUnitario: 0, ...extra });

describe("lineasA4", () => {
  it("valor unitario y total van sin IGV, a 2 decimales (no «S/42.288136»)", () => {
    const r = armarRecibo({ comprobante, sede: "Tienda TRU", cliente, lineas: [linea(49.9)], pagos: [{ metodo: "efectivo", monto: 49.9 }], tasaIgv: 0.18 });
    const [l] = lineasA4(r);
    expect(l).toMatchObject({ cantidad: 1, unidad: "Unidad", valorUnitario: 42.29, total: 42.29 });
  });

  it("la columna Total suma exactamente la Op. gravada, aunque el redondeo por línea no cuadre", () => {
    // 3 × 10.00 con IGV: 10/1.18 = 8.47 por línea (25.41) pero la gravada es 25.42.
    const r = armarRecibo({ comprobante, sede: "Tienda TRU", cliente, lineas: [linea(10), linea(10), linea(10)], pagos: [{ metodo: "efectivo", monto: 30 }], tasaIgv: 0.18 });
    const ls = lineasA4(r);
    expect(r.subtotal).toBe(25.42);
    expect(ls.map((l) => l.total)).toEqual([8.47, 8.47, 8.48]); // el centavo de ajuste cae en la última línea
    expect(Math.round(ls.reduce((a, l) => a + l.total, 0) * 100) / 100).toBe(r.subtotal);
  });

  it("el descuento es el importe por unidad sin IGV (no un %)", () => {
    const r = armarRecibo({ comprobante, sede: "Tienda TRU", cliente, lineas: [linea(49.9, { descuentoUnitario: 2.5 })], pagos: [{ metodo: "efectivo", monto: 47.4 }], tasaIgv: 0.18 });
    expect(lineasA4(r)[0]?.descuento).toBe(2.12); // 2.50 / 1.18
  });

  it("lleva el código y el detalle (talla · color) a la línea", () => {
    const r = armarRecibo({ comprobante, sede: "Tienda TRU", cliente, lineas: [linea(20, { detalle: "M · Negro" })], pagos: [{ metodo: "efectivo", monto: 20 }], tasaIgv: 0.18 });
    expect(lineasA4(r)[0]).toMatchObject({ codigo: "POL-1", detalle: "M · Negro" });
  });

  it("sin líneas no rompe", () => {
    const r = armarRecibo({ comprobante, sede: "Tienda TRU", cliente, lineas: [], pagos: [], tasaIgv: 0.18 });
    expect(lineasA4(r)).toEqual([]);
  });
});
```

Run: `npx vitest run lib/boleta-a4-reglas.test.ts` — Expected: FAIL (módulo inexistente).

- [ ] **Step 2: Implementar `boleta-a4-reglas.ts`**

```ts
// Reglas puras de la boleta/factura A4. Sin DOM ni React. El A4 muestra valores SIN IGV
// (valor unitario, descuento, total por línea) y al pie el desglose: la suma de la columna
// Total ES la «Op. gravada». Como cada línea se redondea por separado, la suma puede
// quedar a un centavo de la gravada que calculó la base: ese centavo se le da a la última
// línea, para que el papel no se contradiga.

import type { ReciboVenta } from "./recibo-reglas";

const redondear2 = (n: number) => Math.round(n * 100) / 100;

export type LineaA4 = {
  cantidad: number;
  unidad: string;
  descripcion: string;
  detalle: string | null;
  codigo: string | null;
  valorUnitario: number;
  descuento: number;
  total: number;
};

export function lineasA4(recibo: ReciboVenta, tasaIgv = 0.18): LineaA4[] {
  const f = 1 + tasaIgv;
  const lineas: LineaA4[] = recibo.lineas.map((l) => ({
    cantidad: l.cantidad,
    unidad: "Unidad",
    descripcion: l.descripcion,
    detalle: l.detalle ?? null,
    codigo: l.codigo,
    valorUnitario: redondear2(l.precioUnitario / f),
    descuento: redondear2(l.descuentoUnitario / f),
    total: redondear2(l.importe / f),
  }));
  const ultima = lineas[lineas.length - 1];
  if (ultima) {
    const diferencia = redondear2(recibo.subtotal - lineas.reduce((a, l) => a + l.total, 0));
    if (diferencia !== 0) ultima.total = redondear2(ultima.total + diferencia);
  }
  return lineas;
}
```

Run: `npx vitest run lib/boleta-a4-reglas.test.ts` — Expected: PASS.
(Si `descuento` da `2.12` distinto por redondeo de flotantes, ajustar el valor esperado al resultado exacto de `2.5/1.18 = 2.1186… → 2.12`; no cambiar la fórmula.)

- [ ] **Step 3: Escribir `BoletaA4.tsx`**

Es la boleta que se ve en pantalla en la maqueta y que se imprime igual (el Task 8 la envuelve en la raíz de impresión). Dirección de diseño del spec: jerarquía clara, recuadro del documento, tabla que crece y repite encabezado, QR junto a los importes, total destacado, firmas solo en factura, y legible en blanco y negro.

```tsx
import { QRCodeSVG } from "qrcode.react";
import { DIAS_PLAZO_CAMBIO } from "@/lib/cambios-reglas";
import { EMISOR, type Emisor } from "@/lib/emisor";
import { lineasA4 } from "@/lib/boleta-a4-reglas";
import { fechaHoraLima, montoEnLetras, NOMBRE_METODO, textoNumeroRecibo, textoQrSunat, TITULO_DOCUMENTO, type ReciboVenta } from "@/lib/recibo-reglas";

const s = (n: number) => `S/ ${n.toFixed(2)}`;
// Tinte suave para los encabezados: se imprime con `print-color-adjust: exact` pero, si la
// impresora es en blanco y negro, el filete y el texto siguen diciendo todo.
const cab = "border-y border-black/60 bg-[#f1ece4] px-2 py-1.5 text-[7.5pt] font-semibold uppercase tracking-wide [print-color-adjust:exact]";

/**
 * La representación impresa A4 de una boleta o factura electrónica. Solo pintura: todo número
 * viene de `ReciboVenta` (la misma cuenta del ticket) y de `lineasA4`. De la resolución del
 * PSE solo se imprime la que esté configurada en `emisor` (la de Alegra NO es la nuestra).
 */
export function BoletaA4({
  recibo,
  emisor = EMISOR,
  vendedor = null,
  hash = null,
  leyenda = null,
}: {
  recibo: ReciboVenta;
  emisor?: Emisor;
  vendedor?: string | null;
  hash?: string | null;
  /** «Comprobante pendiente de validación en SUNAT.», si aplica. */
  leyenda?: string | null;
}) {
  const { fecha, hora } = fechaHoraLima(recibo.emitidoEn);
  const cli = recibo.cliente;
  const tieneDoc = cli.tipoDoc !== "sin_documento" && !!cli.numDoc;
  const esFactura = recibo.tipo === "factura";
  const lineas = lineasA4(recibo);
  const qr = emisor.ruc ? textoQrSunat(recibo, emisor.ruc) : null;
  const nombreDoc = esFactura ? "factura" : "boleta de venta";

  return (
    <div data-testid="boleta-a4" className="boleta-a4 mx-auto w-[186mm] bg-white font-sans text-[9pt] leading-snug text-black">
      {/* ---------- Cabecera ---------- */}
      <header className="flex items-start justify-between gap-6">
        <div className="flex min-w-0 items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- se imprime: una <img> normal se decodifica antes de `print()` */}
          <img src="/cayla-isotipo.png" alt="" className="h-auto w-16 shrink-0" />
          <div className="min-w-0">
            <p className="font-display text-[22pt] leading-none tracking-[0.14em] text-taupe-profundo">{emisor.nombreComercial}</p>
            <p className="mt-1.5 font-semibold">{emisor.razonSocial}</p>
            <p className="text-[8pt] text-black/75">{emisor.direccion.join(" · ")}</p>
            <p className="text-[8pt] text-black/75">{[emisor.telefono, emisor.email, emisor.web].filter(Boolean).join(" · ")}</p>
          </div>
        </div>
        <div className="w-[62mm] shrink-0 rounded-md border-[1.4pt] border-black px-3 py-2.5 text-center">
          <p className="text-[9.5pt] font-semibold">RUC {emisor.ruc}</p>
          <p className="mt-1 text-[10pt] font-bold leading-tight">{TITULO_DOCUMENTO[recibo.tipo]}</p>
          <p className="mt-1.5 font-mono text-[12.5pt] font-bold tabular-nums">{textoNumeroRecibo(recibo)}</p>
        </div>
      </header>

      {leyenda && <p className="mt-3 rounded border border-black/60 px-3 py-1.5 text-center text-[8.5pt] font-semibold">{leyenda}</p>}

      {/* ---------- Clienta y fechas ---------- */}
      <section className="mt-5 grid grid-cols-[1fr_auto] gap-x-8 rounded-md border border-black/50 px-4 py-3 text-[8.5pt]">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="font-semibold uppercase">Señor(es)</dt>
          <dd>{cli.nombre?.trim() || "Cliente general"}</dd>
          <dt className="font-semibold uppercase">{cli.tipoDoc === "ruc" ? "RUC" : "DNI"}</dt>
          <dd>{tieneDoc ? cli.numDoc : "—"}</dd>
          {esFactura && (
            <>
              <dt className="font-semibold uppercase">Dirección</dt>
              <dd className="min-h-[1.2em] border-b border-black/30" />
            </>
          )}
        </dl>
        <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-1">
          <dt className="font-semibold uppercase">Emisión</dt>
          <dd className="tabular-nums">{fecha} · {hora}</dd>
          <dt className="font-semibold uppercase">Vence</dt>
          <dd className="tabular-nums">{fecha}</dd>
          <dt className="font-semibold uppercase">Moneda</dt>
          <dd>Soles (PEN)</dd>
          <dt className="font-semibold uppercase">Tienda</dt>
          <dd>{recibo.sede}</dd>
        </dl>
      </section>

      {/* ---------- Ítems: la tabla crece con las líneas y repite su encabezado al cambiar de página ---------- */}
      <table className="mt-4 w-full border-collapse text-[8.5pt]">
        <thead className="table-header-group">
          <tr>
            <th className={`${cab} w-[11mm] text-center`}>Cant.</th>
            <th className={`${cab} w-[15mm] text-center`}>Unidad</th>
            <th className={`${cab} text-left`}>Descripción</th>
            <th className={`${cab} w-[23mm] text-right`}>V. unitario</th>
            <th className={`${cab} w-[19mm] text-right`}>Dscto.</th>
            <th className={`${cab} w-[24mm] text-right`}>Total</th>
          </tr>
        </thead>
        <tbody>
          {lineas.map((l, i) => (
            <tr key={i} className="break-inside-avoid border-b border-black/15 align-top">
              <td className="px-2 py-1.5 text-center tabular-nums">{l.cantidad}</td>
              <td className="px-2 py-1.5 text-center">{l.unidad}</td>
              <td className="px-2 py-1.5">
                {l.descripcion}
                {(l.detalle || l.codigo) && <span className="block text-[7.5pt] text-black/60">{[l.detalle, l.codigo].filter(Boolean).join(" · ")}</span>}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">{s(l.valorUnitario)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{l.descuento > 0 ? s(l.descuento) : "—"}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{s(l.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 border-t border-black/60 pt-2 text-[8.5pt]">
        <b>SON:</b> {montoEnLetras(recibo.total)}
      </p>

      {/* ---------- Banda inferior: QR y pago a la izquierda, importes a la derecha ---------- */}
      <section className="mt-5 grid break-inside-avoid grid-cols-[1fr_66mm] gap-8">
        <div className="flex gap-4">
          {qr && <QRCodeSVG value={qr} size={256} level="M" marginSize={0} style={{ width: "27mm", height: "27mm", flexShrink: 0 }} />}
          <div className="min-w-0 space-y-2 text-[8pt] text-black/80">
            <div>
              <p className="font-semibold uppercase">Forma de pago</p>
              {recibo.pagos.map((p) => (
                <p key={p.metodo}>
                  {NOMBRE_METODO[p.metodo]} {s(p.monto)}
                  {p.recibido !== null && p.metodo === "efectivo" && ` · recibió ${s(p.recibido)} · vuelto ${s(p.vuelto)}`}
                </p>
              ))}
            </div>
            {vendedor && <p>Atendió: {vendedor}</p>}
            {hash && <p className="break-all text-[6.5pt] text-black/55">Hash: {hash}</p>}
          </div>
        </div>
        <table className="h-fit w-full text-[8.5pt] tabular-nums">
          <tbody>
            <tr><td className="py-0.5 text-right">Op. gravada</td><td className="w-[26mm] py-0.5 text-right">{s(recibo.subtotal)}</td></tr>
            <tr><td className="py-0.5 text-right">Op. inafecta</td><td className="py-0.5 text-right">{s(0)}</td></tr>
            <tr><td className="py-0.5 text-right">Op. exonerada</td><td className="py-0.5 text-right">{s(0)}</td></tr>
            <tr><td className="py-0.5 text-right">IGV (18.00%)</td><td className="py-0.5 text-right">{s(recibo.igv)}</td></tr>
            <tr className="border-y-[1.4pt] border-black bg-[#f1ece4] text-[11pt] font-bold [print-color-adjust:exact]">
              <td className="px-2 py-1.5 text-right">TOTAL</td>
              <td className="py-1.5 text-right">{s(recibo.total)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* ---------- Notas ---------- */}
      <section className="mt-5 break-inside-avoid text-[8pt] text-black/75">
        <p className="font-semibold uppercase text-black">Notas</p>
        <p>Cambios dentro de los {DIAS_PLAZO_CAMBIO} días posteriores a la compra, con este comprobante.</p>
        {emisor.web && <p>Visite {emisor.web} para más.</p>}
      </section>

      {/* La firma solo tiene sentido en la factura; en la boleta de contado sobra. */}
      {esFactura && (
        <section className="mt-12 grid break-inside-avoid grid-cols-2 gap-16 text-center text-[8pt]">
          <p className="border-t border-black/60 pt-1">ELABORADO POR</p>
          <p className="border-t border-black/60 pt-1">ACEPTADA, FIRMA Y/O SELLO Y FECHA</p>
        </section>
      )}

      <footer className="mt-6 break-inside-avoid text-center text-[8pt]">
        <p className="font-semibold">Representación impresa de la {nombreDoc} electrónica</p>
        {emisor.resolucion && <p>Autorizado mediante resolución N° {emisor.resolucion}</p>}
      </footer>
    </div>
  );
}
```

- [ ] **Step 4: Vista previa temporal con la boleta de referencia**

`apps/web/app/login/vista-previa-a4/page.tsx` (los datos de la boleta B002-00009380 del PDF de Alegra, pasados a precios con IGV):

```tsx
"use client";
// TEMPORAL — maqueta del A4 con los datos de la boleta B002-00009380. Se borra antes de commitear.
import { BoletaA4 } from "@/components/BoletaA4";
import { armarRecibo } from "@/lib/recibo-reglas";

const l = (referencia: string, precioUnitario: number, extra: object = {}) => ({ cantidad: 1, referencia, codigo: null, precioUnitario, descuentoUnitario: 0, ...extra });

export default function Vista() {
  const recibo = armarRecibo({
    comprobante: { tipo: "boleta", serie: "B002", numero: 9380, created_at: "2026-09-05T19:40:51Z" },
    sede: "Tienda TRU",
    cliente: { tipoDoc: "dni", numDoc: "00000000", nombre: null },
    lineas: [
      l("Stren Top Luana", 39.9, { codigo: "TOP-0012-NEG-M", detalle: "M · Negro" }),
      l("Polo Zoe (Polos - Básico Manga Larga)", 39.9, { codigo: "POL-0031-BLA-S", detalle: "S · Blanco" }),
      l("Bandana Paisley", 19.9, { codigo: "BAN-0004-NRB-U", detalle: "Única · Negro/Rojo/Blanco" }),
      l("Cartera Carmen", 49.9, { codigo: "CAR-0007-CAF-U", detalle: "Única · Café", descuentoUnitario: 2.5 }),
      l("Bolsa de papel", 0.5, { codigo: "BOL-0001-UNI-U" }),
    ],
    pagos: [{ metodo: "efectivo", monto: 100, recibido: 150 }, { metodo: "yape", monto: 47.6 }],
    tasaIgv: 0.18,
  });
  return (
    <div className="min-h-screen bg-neutral-300 p-8">
      <div className="mx-auto w-[210mm] bg-white p-[12mm] shadow-xl">
        <BoletaA4 recibo={recibo} vendedor="Rosa" hash="Zm9vYmFyMTIzNDU2Nzg5MA==" leyenda={null} />
      </div>
    </div>
  );
}
```

Abrir `http://localhost:3000/login/vista-previa-a4`, tomar captura a 1024 px de ancho y revisarla contra el PDF de referencia (`D:\Cayla Data\Ticket de venta B002-00009380.pdf`). Cambiar `leyenda` y `tipo: "factura"` para ver las variantes (leyenda pendiente; firmas y «Dirección» en factura).

- [ ] **Step 5: Tipos y lint**

Run: `pnpm typecheck`, `npx eslint components/BoletaA4.tsx lib/boleta-a4-reglas.ts`, `npx vitest run`.
El único `eslint-disable` permitido es el del `<img>`; si `next/image` es obligatorio por lint en este repo, usar `<Image ... unoptimized width={221} height={150}>` como `ReciboTermico`.

- [ ] **Step 6: Commit de las reglas y el componente (sin la vista previa)**

Borrar `apps/web/app/login/vista-previa-a4` (desde la raíz). Commit: `feat(caja): boleta A4 — reglas y componente (maqueta)`.

> **CHECKPOINT B — maqueta.** Mostrar a Felipe la captura de la vista previa (boleta y factura, con y sin leyenda) junto al PDF de referencia y pedir cambios. Puntos a decidirle: (1) «Importe de venta» se retiró porque duplica el Total; (2) la dirección de la clienta solo aparece en factura y vacía; (3) el tinte `#f1ece4` de los encabezados; (4) el wordmark «CAYLA» en serif con el colibrí. **No seguir al Task 8 sin su visto bueno.** Los cambios de diseño se hacen en `BoletaA4.tsx` y se commitean como `style(caja): ajusta la boleta A4 según la maqueta`.

---

### Task 8: Botón «Imprimir boleta A4» y CSS de impresión

**Files:**
- Modify: `apps/web/app/globals.css` (al final)
- Modify: `apps/web/components/DetalleVentaModal.tsx`

**Interfaces:**
- Consumes: `BoletaA4`, `puedeImprimir(...).leyenda`, `detalle.comprobante.hash` (Tasks 3, 7).

- [ ] **Step 1: CSS de impresión del A4 (al final de `globals.css`)**

```css
/* ==================================================================
   Boleta / factura A4. `#boleta-a4-print` lo monta el detalle de venta pegado a <body>
   y en pantalla no se ve. Al imprimir desaparece TODO lo demás (`display:none`, no
   `visibility`: lo oculto seguiría ocupando alto y sacaría hojas en blanco). Es una
   raíz aparte de `#comprobante-print` (la térmica): nunca están montadas a la vez.
   `@page a4` es una página NOMBRADA: el A4 lleva sus márgenes y su tamaño sin pisar la
   regla de la térmica (`@page { margin: 0 }`).
   ================================================================== */
#boleta-a4-print {
  display: none;
}
@page a4 {
  size: A4;
  margin: 12mm;
}
@media print {
  body:has(#boleta-a4-print) > *:not(#boleta-a4-print) {
    display: none !important;
  }
  html:has(#boleta-a4-print),
  body:has(#boleta-a4-print) {
    height: auto !important;
    overflow: visible !important;
    background: #fff !important;
    margin: 0 !important;
  }
  #boleta-a4-print {
    display: block;
    page: a4;
    color: #000;
    background: #fff;
  }
}
```

- [ ] **Step 2: El botón y la raíz de impresión en `DetalleVentaModal.tsx`**

Agregar el import:
```tsx
import { BoletaA4 } from "@/components/BoletaA4";
```
Junto al botón del ticket (dentro del `<div className="flex flex-wrap gap-2.5">`), agregar:
```tsx
                <button type="button" className={`${botonCancelar} inline-flex items-center justify-center gap-2`} disabled={!imprimible || imprimiendo !== null} onClick={() => setImprimiendo("a4")}>
                  <Printer size={14} aria-hidden /> Imprimir boleta A4
                </button>
```
(el texto del botón dice «boleta» aun para una factura; si `d.recibo.tipo === "factura"`, mostrar «Imprimir factura A4»: `Imprimir {d.recibo?.tipo === "factura" ? "factura" : "boleta"} A4`).

Y bajo la raíz del ticket, la del A4:
```tsx
            {imprimiendo === "a4" && d.recibo && createPortal(
              <div id="boleta-a4-print">
                <BoletaA4 recibo={d.recibo} vendedor={vendedor} hash={d.comprobante?.hash ?? null} leyenda={permiso.ok ? permiso.leyenda : null} />
              </div>,
              document.body
            )}
```

- [ ] **Step 3: Verificar la impresión**

Con la vista previa del detalle (`/login/vista-previa-detalle?id=v0`, recreándola si se borró): «Imprimir boleta A4» debe abrir la vista previa de impresión con **solo** la boleta en A4 con márgenes de 12 mm (Chrome: Ctrl+P → «Diseño: Vertical», tamaño A4). Comprobar: una sola página; el QR se ve; el tinte sale con «Gráficos de fondo» activado y la hoja se lee igual en blanco y negro; con un pedido de 40 líneas la tabla pasa a la 2.ª página **repitiendo el encabezado** y la banda de importes no se parte. En `v1` la leyenda sale impresa.
Si Felipe usa la térmica: comprobar que «Imprimir ticket» sigue saliendo como antes (raíz `#comprobante-print`, sin márgenes) — las dos raíces no pueden coexistir.

- [ ] **Step 4: Tipos, lint, suite, commit**

`pnpm typecheck`, `npx eslint components/DetalleVentaModal.tsx`, `npx vitest run`. Borrar temporales. Commit: `feat(caja): reimpresión de la boleta o factura en A4 desde el detalle de venta`.

---

### Task 9: Documentación y cierre

**Files:**
- Modify: `docs/superpowers/specs/2026-09-19-caja-detalle-de-venta-y-reimpresion-design.md`, `docs/BITACORA.md`, `docs/BACKLOG.md`, `docs/ARQUITECTURA.md`
- Create: `docs/adr/<número libre>-vuelto-guardado-y-reimpresion-de-comprobantes.md`

- [ ] **Step 1: Alinear el spec con lo construido**

Registrar en el spec las desviaciones: (a) no hay `pegar-en-produccion-…sql` aparte: la migración ya es pegable; (b) «Importe de venta» se retiró del bloque de importes por redundante con el Total; (c) la dirección y el teléfono de la clienta solo aparecen en factura (vacía) y no en boleta; (d) el redondeo del A4 se resolvió dando el centavo de diferencia a la última línea.

- [ ] **Step 2: ADR**

Elegir el número **mirando las ramas remotas y los otros worktrees**, no solo `docs/adr/` (hubo colisiones): `git fetch origin && git branch -r`, `git worktree list`, y `pnpm adr:numeros`. Contenido en 3 secciones (Contexto / Decisión / Consecuencias): el vuelto se guarda como `venta_pagos.recibido` (y por qué no se guarda el vuelto), el A4 sale de nuestra fila `comprobantes` y no de Lucode, una raíz de impresión por vez, y la regla de despliegue «migración antes que código».

- [ ] **Step 3: `BITACORA.md` (3 líneas, entrada nueva arriba), `BACKLOG.md` y `ARQUITECTURA.md`**

BITACORA: qué se cerró / qué se aprendió / pendiente. BACKLOG: marcar hecho lo de este plan y agregar como pendiente «Punto de venta (`/vender`): misma cabecera y entrada que Caja» y «diccionario `docs/datos/generado/` al aplicar la migración en producción». ARQUITECTURA: `registrar_venta` ahora lee `recibido`; `venta_pagos.recibido`; rutas/componentes nuevos de Caja (`DetalleVentaModal`, `MovimientosCajaModal`, `BoletaA4`) y `lib/venta-detalle*.ts`.

- [ ] **Step 4: Verificaciones finales**

Run: `pnpm typecheck`, `npx vitest run` (apps/web), `pnpm migraciones:verificar` (debe mostrar `20260919210000_venta_pagos_recibido.sql` como pendiente de producción, no como error). **No** correr `pnpm datos:generar` a secas (pisa los diccionarios con la foto local).

- [ ] **Step 5: Commit y entrega**

Commit: `docs(caja): cierre de detalle de venta y reimpresión — ADR, bitácora, backlog y arquitectura`. Entregar a Felipe la lista de lo que **él** debe hacer:
1. Pegar `20260919210000_venta_pagos_recibido.sql` en el SQL Editor de cayla-dynamic **antes** de mergear.
2. Después de aplicarla, refrescar el volcado del diccionario (`docs/datos/generado/COMO-REFRESCAR.md`) y correr `pnpm datos:generar:produccion`.
3. Probar con su impresora térmica y con una A4 real.

---

## Autorrevisión del plan contra el spec

| Requisito del spec | Task |
|---|---|
| D1/D2 vuelto guardado, ventas viejas sin vuelto | 1, 2, 3 (caso `recibido: null`) |
| D3 A4 desde nuestra base | 4, 7 (`ReciboVenta` desde filas) |
| D4 estructura de Alegra, sin resolución de Alegra | 7 (`emisor.resolucion` solo si está configurada) |
| D5 venta sin comprobante → «Sin comprobante», botones apagados | 3 (`recibo: null`), 6 |
| D6 estados imprimibles | 3 (`puedeImprimir`), 6, 8 |
| «Ver todo» con scroll interno | 5 |
| Clic en venta → detalle | 5, 6 |
| Ticket con vuelto | 3, 6 |
| A4 con la dirección de diseño mejorada | 7, 8 |
| Error de lectura con «Reintentar» | 6 |
| Migración antes que código | Checkpoint A, 9 |
| Maqueta A4 aprobada antes de cablear | Checkpoint B |
| Redondeo del A4 | 7 (`lineasA4`), 9 |
