# Prendas sin registrar — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la caja venda una prenda que todavía no está en el sistema dejando rastro completo, y que almacén la regularice después sin descuadrar el stock.

**Architecture:** Se reutiliza la variante centinela «Cargo especial» (`22222222-…`), que ya no controla stock ni precio. `registrar_venta` (misma firma) exige descripción, categoría, talla y color en esas líneas y crea una fila en la tabla nueva `retail.prendas_por_regularizar`. La RPC nueva `regularizar_prenda` pasa la línea a la variante real y escribe los movimientos. `anular_venta` pasa a buscar la salida de la variante ACTUAL de la línea.

**Tech Stack:** Postgres/Supabase (plpgsql, RLS), Next.js App Router, vitest, scripts de prueba `scripts/pruebas/*.mjs` (psql vía `docker exec`, cada caso en `begin … rollback`).

**Spec:** `docs/superpowers/specs/2026-09-23-prendas-sin-registrar-design.md`

## Global Constraints

- Migraciones SIN prefijo `retail.` en tablas si usan `set search_path`; el repo usa `retail.` explícito en DDL: seguir el archivo vecino. Nunca pegar en producción sin OK de Felipe.
- Aplicar en local con `psql` SOLO el archivo nuevo (memoria «aplicar migración con psql»), nunca `migration up`.
- `registrar_venta` y `anular_venta`: `create or replace` con **la misma firma exacta** (cero sobrecargas nuevas); `revoke … from public, anon` + `grant … to authenticated` al final.
- Toda política RLS nueva: después de crearla, `select retail.fn_rls_una_vez_por_consulta();` en la misma migración.
- Colores solo por tokens de `globals.css`; modales con `<Modal>`; cabecera `<CabeceraPantalla>` solo si la pantalla es nueva (aquí es pestaña: se reutiliza el encabezado de `/recibir`).
- Firmas de escritura de tienda: `retail.fn_actor_persona_id(true)`; la pantalla usa `useResponsable` + `<ComboResponsable>`.
- Español en textos y comentarios de negocio. Vocabulario: colaboradora, sede, clienta.
- Plazo de «Vencida»: **2 días** (constante única `DIAS_PARA_VENCER = 2` en `lib/por-regularizar-reglas.ts` y `c_dias_para_vencer` en SQL).
- Commits Conventional, scope `ventas` o `inventario`, terminados en `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; mensaje por archivo (`git commit -F`).

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/20260923161700_prendas_por_regularizar.sql` (nuevo) | Tabla, RLS, `registrar_venta` que crea la fila, triggers de anulación y de devolución/cambio |
| `supabase/migrations/20260923162300_regularizar_prenda.sql` (nuevo) | RPC `regularizar_prenda`, `anular_venta` filtrando por variante |
| `scripts/pruebas/prendas_por_regularizar.mjs` (nuevo) + script en `package.json` | Pruebas SQL de ambas migraciones |
| `apps/web/lib/prenda-sin-registrar-reglas.ts` (+ `.test.ts`) (nuevo) | Validación pura del formulario de caja |
| `apps/web/components/PuntoDeVenta.tsx` | Modal «Prenda sin registrar» en lugar de «Monto manual»; campos nuevos en `p_items` |
| `apps/web/app/(app)/vender/page.tsx` | Carga categorías, tallas y colores para el modal |
| `apps/web/lib/por-regularizar-reglas.ts` (+ `.test.ts`) (nuevo) | Vencida, tipo de diferencia, cifras |
| `apps/web/lib/por-regularizar.ts` (nuevo) | Lectura server-side de la cola |
| `apps/web/components/PorRegularizarLista.tsx` (nuevo) | Tabla + modal de regularizar |
| `apps/web/app/(app)/recibir/page.tsx` | Pestaña `?vista=por-regularizar` |
| `apps/web/app/(app)/page.tsx` | Cifra de vencidas para el líder |
| `docs/adr/0178-prendas-sin-registrar.md`, `docs/BACKLOG.md`, `docs/BITACORA.md`, `docs/ARQUITECTURA.md` | Documentación |

---

### Task 1: Tabla y venta que crea la fila pendiente

**Files:**
- Create: `supabase/migrations/20260923161700_prendas_por_regularizar.sql`
- Create: `scripts/pruebas/prendas_por_regularizar.mjs`
- Modify: `package.json` (script `pruebas:prendas-por-regularizar`)

**Interfaces:**
- Produces: tabla `retail.prendas_por_regularizar(id, venta_item_id unique, ubicacion_id, descripcion, categoria_id, talla_id, color_codigo, precio_cobrado, vendido_por, vendido_en, estado, variante_id, forma, precio_oficial, diferencia, regularizado_por, regularizado_en)`; ítems de `p_items` con claves `descripcion_libre`, `categoria_id`, `talla_id`, `color_codigo` para la variante centinela.

- [ ] **Step 1: Escribir las pruebas que fallan** (`scripts/pruebas/prendas_por_regularizar.mjs`), copiando la cabecera, `psql`, `correr`, `comoPersona`, `fixture` y el runner de `scripts/pruebas/registrar_venta.mjs`. Casos:
  1. error `prenda_sin_registrar_incompleta`: venta con la centinela sin `descripcion_libre`.
  2. éxito: venta con la centinela + `descripcion_libre='Blusa lino beige'`, `categoria_id` (primera activa), `talla_id` (primera aprobada), `color_codigo` (primero activo), precio 50 → `select estado, descripcion, precio_cobrado from retail.prendas_por_regularizar where venta_item_id = (select id from retail.venta_items where venta_id = :'venta_id')` devuelve `pendiente|Blusa lino beige|50.00`.
  3. éxito: esa venta anulada con `retail.anular_venta(:'venta_id', 'prueba', jsonb_build_array(jsonb_build_object('venta_item_id', <id>, 'condicion', 'vendible')))` → la fila queda `anulada`.
  4. error `prenda_sin_regularizar`: `insert into retail.cambios (venta_item_id, …)` sobre esa línea pendiente (usar las columnas mínimas de `0007_cambios.sql`).
  5. éxito: una venta normal (BLU-EMMA-NEG-M) no crea filas en la tabla.

- [ ] **Step 2: Correr y ver que fallan**
  Run: `node scripts/pruebas/prendas_por_regularizar.mjs`
  Expected: FAIL (`relation "retail.prendas_por_regularizar" does not exist`).

- [ ] **Step 3: Escribir la migración.** Contenido:

```sql
-- Prendas sin registrar (ADR-0178, Felipe 2026-09-23). Spec: docs/superpowers/specs/2026-09-23-prendas-sin-registrar-design.md
set search_path = retail, public, extensions;

create table if not exists retail.prendas_por_regularizar (
  id uuid primary key default gen_random_uuid(),
  venta_item_id uuid not null unique references retail.venta_items (id),
  ubicacion_id uuid not null references retail.ubicaciones (id),
  descripcion text not null check (btrim(descripcion) <> ''),
  categoria_id uuid not null references retail.categorias (id),
  talla_id uuid not null references retail.tallas (id),
  color_codigo text not null references retail.colores (codigo),
  precio_cobrado numeric(12,2) not null check (precio_cobrado > 0),
  vendido_por uuid references public.personas (id),
  vendido_en timestamptz not null default now(),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'regularizada', 'anulada')),
  variante_id uuid references retail.variantes (id),
  forma text check (forma in ('ya_registrada', 'llego_nueva')),
  precio_oficial numeric(12,2),
  diferencia numeric(12,2),
  regularizado_por uuid references public.personas (id),
  regularizado_en timestamptz,
  -- Regularizada ⇔ trae todo lo de almacén; nunca a medias (principio 2).
  constraint prendas_por_regularizar_completa check (
    (estado = 'regularizada') = (variante_id is not null and forma is not null and precio_oficial is not null
                                  and diferencia is not null and regularizado_en is not null)
  )
);
create index if not exists prendas_por_regularizar_pendientes_idx
  on retail.prendas_por_regularizar (ubicacion_id, vendido_en) where estado = 'pendiente';

alter table retail.prendas_por_regularizar enable row level security;
-- Solo lectura desde el cliente; se escribe por registrar_venta y regularizar_prenda (security definer).
create policy prendas_por_regularizar_select on retail.prendas_por_regularizar for select
  using (retail.fn_puede_operar_ubicacion(ubicacion_id));
grant select on retail.prendas_por_regularizar to authenticated;
```

  Después, `registrar_venta`: copiar **verbatim** las líneas 317–613 de `20260922150000_venta_asesora_emisor_descuento_lider.sql` (sin el `drop function`) y aplicar estas dos ediciones:

  (a) dentro del primer `for v_item` (validación), justo después del bloque `if v_precio_catalogo is null … end if;`:

```sql
    -- Prenda sin registrar: sin sus datos no hay forma de regularizarla después.
    if (v_item ->> 'variante_id')::uuid = c_cargo_especial and (
         btrim(coalesce(v_item ->> 'descripcion_libre', '')) = ''
         or nullif(v_item ->> 'categoria_id', '') is null
         or nullif(v_item ->> 'talla_id', '') is null
         or nullif(v_item ->> 'color_codigo', '') is null
         or (v_item ->> 'cantidad')::integer <> 1
         or (v_item ->> 'precio_unitario')::numeric <= 0) then
      raise exception 'prenda_sin_registrar_incompleta'
        using hint = 'Una prenda sin registrar necesita descripción, categoría, talla, color, precio y cantidad 1';
    end if;
```

  (b) en el segundo `for v_item` (inserción), después de `perform fn_aplicar_movimiento(v_mov_id);`:

```sql
    if (v_item ->> 'variante_id')::uuid = c_cargo_especial then
      insert into prendas_por_regularizar (venta_item_id, ubicacion_id, descripcion, categoria_id, talla_id,
                                           color_codigo, precio_cobrado, vendido_por)
        values (v_item_id, p_ubicacion_id, btrim(v_item ->> 'descripcion_libre'),
                (v_item ->> 'categoria_id')::uuid, (v_item ->> 'talla_id')::uuid, v_item ->> 'color_codigo',
                (v_item ->> 'precio_unitario')::numeric - coalesce((v_item ->> 'descuento_unitario')::numeric, 0),
                coalesce(p_asesora_id, v_persona));
    end if;
```

  Cerrar con el `revoke`/`grant` de `20260922231700` (misma firma de 16 parámetros).

  Triggers:

```sql
-- Anular la venta saca de la cola lo que seguía pendiente.
create or replace function retail.fn_prendas_por_regularizar_al_anular()
returns trigger language plpgsql security definer set search_path = retail, public as $$
begin
  if new.estado = 'anulada' and old.estado is distinct from 'anulada' then
    update prendas_por_regularizar p set estado = 'anulada'
      from venta_items vi
      where vi.id = p.venta_item_id and vi.venta_id = new.id and p.estado = 'pendiente';
  end if;
  return new;
end $$;
drop trigger if exists trg_prendas_por_regularizar_al_anular on retail.ventas;
create trigger trg_prendas_por_regularizar_al_anular after update of estado on retail.ventas
  for each row execute function retail.fn_prendas_por_regularizar_al_anular();

-- Cambio o devolución de una prenda que almacén aún no identificó: no se sabe a qué stock vuelve.
create or replace function retail.fn_exige_prenda_regularizada()
returns trigger language plpgsql security definer set search_path = retail, public as $$
begin
  if exists (select 1 from prendas_por_regularizar where venta_item_id = new.venta_item_id and estado = 'pendiente') then
    raise exception 'prenda_sin_regularizar'
      using hint = 'Pide a almacén que regularice esta prenda (Recibir ▸ Por regularizar) antes de cambiarla o devolverla';
  end if;
  return new;
end $$;
drop trigger if exists trg_cambios_exige_regularizada on retail.cambios;
create trigger trg_cambios_exige_regularizada before insert on retail.cambios
  for each row execute function retail.fn_exige_prenda_regularizada();
drop trigger if exists trg_devolucion_items_exige_regularizada on retail.devolucion_items;
create trigger trg_devolucion_items_exige_regularizada before insert on retail.devolucion_items
  for each row execute function retail.fn_exige_prenda_regularizada();
revoke all on function retail.fn_prendas_por_regularizar_al_anular() from public, anon, authenticated;
revoke all on function retail.fn_exige_prenda_regularizada() from public, anon, authenticated;

select retail.fn_rls_una_vez_por_consulta();
```

- [ ] **Step 4: Aplicar en local y correr**
  Run: `docker exec -i supabase_db_cayla-retail psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - < supabase/migrations/20260923161700_prendas_por_regularizar.sql && node scripts/pruebas/prendas_por_regularizar.mjs && pnpm pruebas:registrar-venta && pnpm pruebas:anular-venta-comprobante`
  Expected: todo PASS (las pruebas viejas de venta y anulación siguen verdes).

- [ ] **Step 5: Commit** — `feat(ventas): prenda sin registrar queda en cola para regularizar`

---

### Task 2: `regularizar_prenda` y anulación de una prenda regularizada

**Files:**
- Create: `supabase/migrations/20260923162300_regularizar_prenda.sql`
- Modify: `scripts/pruebas/prendas_por_regularizar.mjs`

**Interfaces:**
- Consumes: tabla de Task 1.
- Produces: `retail.regularizar_prenda(p_id uuid, p_variante_id uuid, p_forma text) returns numeric` (devuelve la diferencia).

- [ ] **Step 1: Agregar casos que fallan**
  6. `ya_registrada`: stock de BLU-EMMA-NEG-M en la sede baja 1; `venta_items.variante_id` = BLU; `diferencia` = 50 − 79.90 = `-29.90`.
  7. `llego_nueva`: stock no cambia; hay 1 `entrada` `ingreso_regularizado` y 1 `salida` `venta` de BLU con ese `venta_item_id`.
  8. precio cobrado 90 → diferencia `10.10`.
  9. error `prenda_ya_regularizada` al regularizar dos veces.
  10. anular una venta ya regularizada (`ya_registrada`) → el stock de BLU vuelve al de antes de la venta.
  11. error `prenda_forma_invalida` con `p_forma = 'x'`; error `No tienes permiso` con Micaela en Tienda Lima.

- [ ] **Step 2: Correr — FAIL** (`function retail.regularizar_prenda does not exist`).

- [ ] **Step 3: Migración**

```sql
set search_path = retail, public, extensions;

create or replace function retail.regularizar_prenda(p_id uuid, p_variante_id uuid, p_forma text)
returns numeric language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  c_cargo_especial constant uuid := '22222222-2222-4222-8222-222222222222';
  v_p prendas_por_regularizar%rowtype;
  v_var variantes%rowtype;
  v_persona uuid := fn_actor_persona_id(true);
  v_sub uuid; v_mov uuid; v_dif numeric;
begin
  if p_forma is null or p_forma not in ('ya_registrada', 'llego_nueva') then
    raise exception 'prenda_forma_invalida';
  end if;
  select * into v_p from prendas_por_regularizar where id = p_id for update;
  if not found then raise exception 'La prenda % no existe', p_id; end if;
  if not fn_puede_operar_ubicacion(v_p.ubicacion_id) then
    raise exception 'No tienes permiso para regularizar en esa ubicación';
  end if;
  if v_p.estado <> 'pendiente' then raise exception 'prenda_ya_regularizada'; end if;
  select * into v_var from variantes where id = p_variante_id;
  if not found or p_variante_id = c_cargo_especial then raise exception 'La variante % no existe', p_variante_id; end if;

  v_sub := fn_sububicacion_por_defecto(v_p.ubicacion_id, 'venta');
  if p_forma = 'llego_nueva' then
    -- Se contó lo físico al registrar el lote: esta prenda nunca entró. Entra y sale, el stock no cambia.
    insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, venta_item_id, usuario_id)
      values (p_variante_id, v_p.ubicacion_id, v_sub, 'entrada', 1, 'ingreso_regularizado', v_p.venta_item_id, v_persona)
      returning id into v_mov;
    perform fn_aplicar_movimiento(v_mov);
  end if;
  -- Motivo 'venta' para que rotación, resumen y alertas la cuenten como cualquier venta.
  insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, venta_item_id, usuario_id)
    values (p_variante_id, v_p.ubicacion_id, v_sub, 'salida', 1, 'venta', v_p.venta_item_id, v_persona)
    returning id into v_mov;
  perform fn_aplicar_movimiento(v_mov);

  -- De «desconocido» a «conocido», una sola vez (la fila ya no está pendiente).
  update venta_items set variante_id = p_variante_id, costo_unitario = v_var.costo
    where id = v_p.venta_item_id and variante_id = c_cargo_especial;

  v_dif := v_p.precio_cobrado - v_var.precio;
  update prendas_por_regularizar
    set estado = 'regularizada', variante_id = p_variante_id, forma = p_forma, precio_oficial = v_var.precio,
        diferencia = v_dif, regularizado_por = v_persona, regularizado_en = now()
    where id = p_id;
  return v_dif;
end $$;
revoke all on function retail.regularizar_prenda(uuid, uuid, text) from public, anon;
grant execute on function retail.regularizar_prenda(uuid, uuid, text) to authenticated;
```

  `anular_venta`: copiar verbatim la definición completa de `20260922151500_comprobantes_cola_de_reintento.sql` (misma firma; buscar `create or replace function retail.anular_venta`) y en las DOS consultas `from movimientos where venta_item_id = v_venta_item.id and tipo = 'salida' and motivo = 'venta'` agregar `and variante_id = v_venta_item.variante_id` (comentario: «una prenda regularizada tiene además la salida de la centinela; la que vuelve al stock es la de su variante actual»). Repetir su `revoke`/`grant`.

- [ ] **Step 4: Aplicar con psql y correr** `node scripts/pruebas/prendas_por_regularizar.mjs && pnpm pruebas:anular-venta-comprobante && pnpm pruebas:comprobante-venta-anulada` → PASS.
- [ ] **Step 5: Commit** — `feat(inventario): regularizar_prenda une la venta con su prenda real`

---

### Task 3: Caja — «Prenda sin registrar»

**Files:**
- Create: `apps/web/lib/prenda-sin-registrar-reglas.ts`, `apps/web/lib/prenda-sin-registrar-reglas.test.ts`
- Modify: `apps/web/components/PuntoDeVenta.tsx` (`ItemCarrito` ~l.89, `agregarMontoManual` l.558, `params` l.836, modal l.1213), `apps/web/app/(app)/vender/page.tsx`, `apps/web/components/PuntoDeVentaTicket.tsx:1067`

**Interfaces:**
- Produces: `type DatosPrendaSinRegistrar = { descripcion: string; categoriaId: string; tallaId: string; colorCodigo: string; precio: number }`; `faltaEnPrendaSinRegistrar(d: Partial<DatosPrendaSinRegistrar>): string | null` (mensaje del primer campo que falta, o null).

- [ ] **Step 1: Test** (`prenda-sin-registrar-reglas.test.ts`):

```ts
import { describe, expect, it } from "vitest";
import { faltaEnPrendaSinRegistrar } from "./prenda-sin-registrar-reglas";

const completa = { descripcion: "Blusa lino beige", categoriaId: "c", tallaId: "t", colorCodigo: "BEI", precio: 50 };

describe("faltaEnPrendaSinRegistrar", () => {
  it("completa → null", () => expect(faltaEnPrendaSinRegistrar(completa)).toBeNull());
  it("descripción en blanco", () => expect(faltaEnPrendaSinRegistrar({ ...completa, descripcion: "  " })).toBe("Escribe una descripción corta"));
  it("sin categoría", () => expect(faltaEnPrendaSinRegistrar({ ...completa, categoriaId: "" })).toBe("Elige la categoría"));
  it("sin talla", () => expect(faltaEnPrendaSinRegistrar({ ...completa, tallaId: "" })).toBe("Elige la talla"));
  it("sin color", () => expect(faltaEnPrendaSinRegistrar({ ...completa, colorCodigo: "" })).toBe("Elige el color"));
  it("precio 0", () => expect(faltaEnPrendaSinRegistrar({ ...completa, precio: 0 })).toBe("Escribe el precio que cobraste"));
});
```

- [ ] **Step 2:** `pnpm --filter web exec vitest run lib/prenda-sin-registrar-reglas.test.ts` → FAIL (módulo no existe).
- [ ] **Step 3: Implementar**

```ts
// Lo mínimo que caja anota de una prenda que aún no está en el sistema (ADR-0178): con esto almacén la reconoce después.
export type DatosPrendaSinRegistrar = { descripcion: string; categoriaId: string; tallaId: string; colorCodigo: string; precio: number };

export function faltaEnPrendaSinRegistrar(d: Partial<DatosPrendaSinRegistrar>): string | null {
  if (!d.descripcion?.trim()) return "Escribe una descripción corta";
  if (!d.categoriaId) return "Elige la categoría";
  if (!d.tallaId) return "Elige la talla";
  if (!d.colorCodigo) return "Elige el color";
  if (!d.precio || d.precio <= 0) return "Escribe el precio que cobraste";
  return null;
}
```

- [ ] **Step 4: UI.**
  - `vender/page.tsx`: sumar al `Promise.all` las tres lecturas `supabase.from("categorias").select("id, nombre").eq("activo", true).order("nombre")`, `from("tallas").select("id, valor").eq("activo", true).eq("estado", "aprobado").order("valor")`, `from("colores").select("codigo, nombre").eq("activo", true).order("orden")`, y pasarlas a `<PuntoDeVenta listasPrendaLibre={{ categorias, tallas, colores }} />`.
  - `PuntoDeVenta.tsx`: `ItemCarrito` suma `prendaLibre?: Omit<DatosPrendaSinRegistrar, "precio">`. `agregarMontoManual` → `agregarPrendaSinRegistrar(d: DatosPrendaSinRegistrar)`: misma línea que hoy, pero `referencia: d.descripcion.trim()`, `sku: "SIN-REGISTRAR"`, `prendaLibre: {…}`. En `params.p_items` agregar `descripcion_libre: it.prendaLibre?.descripcion, categoria_id: it.prendaLibre?.categoriaId, talla_id: it.prendaLibre?.tallaId, color_codigo: it.prendaLibre?.colorCodigo` (undefined para prendas normales). El modal pasa a `titulo="Prenda sin registrar"`, `subtitulo="Para una prenda que todavía no tiene etiqueta. Almacén la registrará después."`: input de descripción (`caja`), tres `<select className="caja">`, el teclado numérico actual para el precio, mensaje de `faltaEnPrendaSinRegistrar` debajo y el botón «Agregar al ticket» deshabilitado mientras falte algo. El botón que abre el modal cambia su texto de «Monto manual» a «Prenda sin registrar».
  - `PuntoDeVentaTicket.tsx:1067`: `"Prenda sin registrar — almacén la regulariza."`.
  - Error de la base `prenda_sin_registrar_incompleta` (venta encolada sin red con el formato viejo): mostrar su `hint`.
- [ ] **Step 5: Verificar** `pnpm --filter web exec vitest run` + `pnpm --filter web typecheck` + en el navegador (preview `/vender`, caja abierta en local): vender una prenda sin registrar y comprobar la fila con `select * from retail.prendas_por_regularizar order by vendido_en desc limit 1`. Captura.
- [ ] **Step 6: Commit** — `feat(ventas): «Prenda sin registrar» reemplaza a Monto manual en caja`

---

### Task 4: Almacén — pestaña «Por regularizar»

**Files:**
- Create: `apps/web/lib/por-regularizar-reglas.ts` (+ `.test.ts`), `apps/web/lib/por-regularizar.ts`, `apps/web/components/PorRegularizarLista.tsx`
- Modify: `apps/web/app/(app)/recibir/page.tsx` (pestañas l.86–96 y rama nueva de `vista`)

**Interfaces:**
- Produces: `DIAS_PARA_VENCER = 2`; `estaVencida(vendidoEn: Date, ahora: Date): boolean`; `tipoDiferencia(d: number): "descuento" | "sobreprecio" | "exacto"`; `cifrasPorRegularizar(filas, ahora) → { pendientes, vencidas, descuentoMes, sobreprecioMes }`; `getPorRegularizar(ubicacionId: string | null)` → filas con `id, descripcion, categoria, talla, color, precioCobrado, vendidoPor, vendidoEn, estado, varianteSku, diferencia`.

- [ ] **Step 1: Test** (`por-regularizar-reglas.test.ts`):

```ts
import { describe, expect, it } from "vitest";
import { cifrasPorRegularizar, estaVencida, tipoDiferencia } from "./por-regularizar-reglas";

const ahora = new Date("2026-09-23T15:00:00-05:00");
describe("estaVencida", () => {
  it("1 día → no", () => expect(estaVencida(new Date("2026-09-22T15:00:00-05:00"), ahora)).toBe(false));
  it("justo 2 días → sí", () => expect(estaVencida(new Date("2026-09-21T15:00:00-05:00"), ahora)).toBe(true));
});
describe("tipoDiferencia", () => {
  it("negativa", () => expect(tipoDiferencia(-20)).toBe("descuento"));
  it("positiva", () => expect(tipoDiferencia(10)).toBe("sobreprecio"));
  it("cero", () => expect(tipoDiferencia(0)).toBe("exacto"));
});
describe("cifrasPorRegularizar", () => {
  it("separa descuento y sobreprecio del mes y cuenta vencidas", () => {
    const f = (estado: string, vendidoEn: string, diferencia: number | null) => ({ estado, vendidoEn: new Date(vendidoEn), diferencia });
    expect(cifrasPorRegularizar([
      f("pendiente", "2026-09-23T10:00:00-05:00", null),
      f("pendiente", "2026-09-20T10:00:00-05:00", null),
      f("regularizada", "2026-09-10T10:00:00-05:00", -20),
      f("regularizada", "2026-09-11T10:00:00-05:00", 10),
      f("regularizada", "2026-08-30T10:00:00-05:00", -99),
    ], ahora)).toEqual({ pendientes: 2, vencidas: 1, descuentoMes: 20, sobreprecioMes: 10 });
  });
});
```

- [ ] **Step 2:** vitest → FAIL.
- [ ] **Step 3: Implementar** las reglas (mes = mes calendario de Lima vía `hoyLima()` de `lib/fechas-lima.ts`; `estaVencida` = `ahora - vendidoEn >= DIAS_PARA_VENCER * 86_400_000`), `getPorRegularizar` (select a `prendas_por_regularizar` con joins `categorias(nombre)`, `tallas(valor)`, `colores(nombre)`, `variantes(sku)`, `personas!vendido_por(nombre)`; filtro por `ubicacion_id` si no es null; `order vendido_en asc`, límite 200) y `PorRegularizarLista` (cliente): 4 `TarjetaCifra` + tabla (`Tabla`) con `<Chip>` «Vencida» (rojo) / «Pendiente» (ámbar) / «Regularizada» (verde), y por fila pendiente un botón «Regularizar» que abre `<Modal>` con: buscador de variante (reutilizar la lista de `getCatalogo()` que la página ya carga, filtrando por texto sobre referencia/sku), la pregunta en dos `pildora-cayla` («Ya estaba registrada, solo perdió la etiqueta» / «Llegó nueva y no se contó en el lote»), vista previa de la diferencia con `tipoDiferencia`, `<ComboResponsable>` + `useResponsable`, y guardar con `supabase.rpc("regularizar_prenda", { p_id, p_variante_id, p_forma })` firmado; al responder, `avisar.exito(...)` y `router.refresh()`. Si la prenda no existe en el catálogo: enlace «Darla de alta» a `/productos/nuevo` (misma pestaña; al volver aparece en el buscador).
  - `recibir/page.tsx`: tercer ítem de `Pestanas` `{ clave: "por-regularizar", etiqueta: "Por regularizar", href: "/recibir?vista=por-regularizar" }` y rama `if (vista === "por-regularizar")` que renderiza `encabezado`, `pestanas` y `<PorRegularizarLista filas={await getPorRegularizar(esLider ? null : ubicacionMirada)} catalogo={…} />`. Aceptar el valor en el parseo de `vista`.
- [ ] **Step 4: Verificar** vitest + typecheck + navegador: regularizar la prenda vendida en Task 3 con cada forma (dos ventas), comprobar stock en `/inventario` y los movimientos. Captura.
- [ ] **Step 5: Commit** — `feat(inventario): pestaña Por regularizar en Recibir`

---

### Task 5: Aviso al líder y documentación

**Files:**
- Modify: `apps/web/app/(app)/page.tsx`, `apps/web/lib/por-regularizar.ts` (`contarVencidas(): Promise<number>`)
- Create: `docs/adr/0178-prendas-sin-registrar.md` (confirmar antes que 0178 siga libre en `origin/*` y worktrees)
- Modify: `docs/BACKLOG.md`, `docs/BITACORA.md`, `docs/ARQUITECTURA.md`, `apps/web/lib/cargo-especial.ts` (comentario: ahora es «Prenda sin registrar»)

- [ ] **Step 1:** `contarVencidas` = count de `prendas_por_regularizar` con `estado = 'pendiente'` y `vendido_en <= now() - 2 días` (`.lte("vendido_en", new Date(Date.now() - DIAS_PARA_VENCER*86_400_000).toISOString())`, `{ count: "exact", head: true }`).
- [ ] **Step 2:** En el inicio, solo si `esLider`, y solo si es > 0: una `nota-cayla` con enlace «N prendas vendidas sin registrar llevan más de 2 días sin regularizar → Recibir ▸ Por regularizar».
- [ ] **Step 3:** ADR-0178 (contexto, decisiones D1–D6 del spec, alternativas descartadas: opción 4 y tope diario), BACKLOG (hecho + «no está en producción: 2 migraciones por pegar con OK de Felipe»), BITACORA (3 líneas), ARQUITECTURA (tabla y RPC nuevas, ruta `/recibir?vista=por-regularizar`).
- [ ] **Step 4:** `pnpm --filter web lint && pnpm --filter web typecheck && pnpm --filter web exec vitest run && pnpm migraciones:verificar`.
- [ ] **Step 5: Commit** — `docs(inventario): ADR-0178 prendas sin registrar`

## Fuera de este plan

Pegar las dos migraciones en producción (prefijo `retail.` ya está en el DDL; `registrar_venta` y `anular_venta` se verifican contra `pg_proc` por el MCP, una sola sobrecarga cada una) y fusionar a main: cada uno con OK explícito de Felipe.
