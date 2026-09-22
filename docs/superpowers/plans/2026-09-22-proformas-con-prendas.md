# Proformas con prendas y hoja A4 con fotos — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que una proforma lleve prendas reales del catálogo (cantidad, descuento, nota), se imprima en una hoja
A4 con la foto de cada prenda y se cobre cargándola en el Punto de Venta.

**Architecture:** las líneas viven como copia en `proformas.items` (jsonb, convención de `registrar_venta`:
precio con IGV); la base valida y calcula el total (`crear_proforma` v2). El cobro reusa el Punto de Venta
(`/vender?proforma=<id>`) y, tras `registrar_venta`, `marcar_proforma_cobrada` la enlaza a la venta. La hoja A4
reusa la raíz de impresión `#boleta-a4-print` de la boleta.

**Tech Stack:** Next.js 16 App Router + Supabase (Postgres, RLS, RPC security definer), Tailwind, vitest.

**Spec:** `docs/superpowers/specs/2026-09-22-proformas-con-prendas-design.md`

## Global Constraints

- Español en textos y comentarios de negocio; nombres de funciones como ya hace el repo.
- Precio de línea = precio de etiqueta **con IGV** (`registrar_venta`); `igv = round(total − total/1.18, 2)`.
- Tope de descuento en la proforma: **20 %** por línea, motivo de la lista de `registrar_venta`
  (`cumpleanos_clienta_top`, `prenda_con_desperfecto`, `liquidacion_temporada`, `cerrar_venta`, `otro`; «otro» exige detalle).
- Migraciones en `supabase/migrations/*.sql` SIN prefijo `retail.` en las tablas del cuerpo (ver CLAUDE.md), pero las
  funciones se crean como `retail.<nombre>` como hace el resto del repo. A producción solo con OK de Felipe.
- Modales con `<Modal>` (ADR-0136). Sin overlays propios. Sin `Date.now()` en render (regla `react-hooks/purity`).
- Nunca `DELETE`: la función vieja `convertir_proforma_a_comprobante` se queda, sin `grant`.
- Local: aplicar SOLO el archivo nuevo con `psql` (memoria «aplicar migración con psql»), probar antes dentro de
  `begin … rollback`.

---

### Task 1: Reglas puras de las líneas de una proforma

**Files:**
- Modify: `apps/web/lib/proformas-reglas.ts`
- Test: `apps/web/lib/proformas-reglas.test.ts`

**Interfaces:**
- Produces:
  - `type LineaProforma = { variante_id: string; cantidad: number; precio_unitario: number; descuento_unitario: number; motivo_descuento: string | null; motivo_descuento_detalle: string | null; descripcion: string; codigo: string | null }`
  - `const TOPE_DESCUENTO_PROFORMA = 0.2`
  - `lineasDeLaProforma(items: unknown): LineaProforma[] | null` — `null` = formato anterior (sin `variante_id`).
  - `totalesDeLineas(lineas: Pick<LineaProforma,"cantidad"|"precio_unitario"|"descuento_unitario">[]): { total: number; igv: number; subtotal: number; descuentos: number; prendas: number }`
  - `numeroDeProforma(n: number | null): string` → `"PRO-000123"`, `"PRO-—"` sin número.
  - `precioAlCobrarDeLaProforma(linea: LineaProforma, precioHoy: number, numero: string): { precioUnitario: number; descuentoUnitario: number; motivo: string; motivoDetalle: string }`
  - `ProformaFila` suma `numero: number | null; nota: string | null; venta_id: string | null; items: unknown`.

- [ ] **Step 1: Escribir las pruebas que fallan** (agregar al final de `proformas-reglas.test.ts`)

```ts
import { lineasDeLaProforma, numeroDeProforma, precioAlCobrarDeLaProforma, totalesDeLineas, type LineaProforma } from "./proformas-reglas";

const linea = (extra: Partial<LineaProforma> = {}): LineaProforma => ({
  variante_id: "v1", cantidad: 1, precio_unitario: 179.9, descuento_unitario: 0,
  motivo_descuento: null, motivo_descuento_detalle: null, descripcion: "Casaca Ximena · M · Negro", codigo: "CAS-0001-NEG-M", ...extra,
});

describe("lineasDeLaProforma", () => {
  it("lee las líneas con prenda", () => {
    expect(lineasDeLaProforma([linea()])).toEqual([linea()]);
  });
  it("formato anterior (una línea «Venta» sin prenda) → null", () => {
    expect(lineasDeLaProforma([{ descripcion: "Venta", cantidad: 1, precio_unitario: 7000 }])).toBeNull();
    expect(lineasDeLaProforma(null)).toBeNull();
    expect(lineasDeLaProforma([])).toBeNull();
  });
});

describe("totalesDeLineas (la misma cuenta que hace crear_proforma)", () => {
  it("suma (precio − descuento) × cantidad y separa el IGV del total", () => {
    const t = totalesDeLineas([
      linea({ descuento_unitario: 18 }),
      linea({ precio_unitario: 79.9, cantidad: 2 }),
      linea({ precio_unitario: 109.9 }),
    ]);
    expect(t).toEqual({ total: 431.6, igv: 65.84, subtotal: 365.76, descuentos: 18, prendas: 4 });
  });
});

describe("numeroDeProforma", () => {
  it("rellena a seis dígitos", () => {
    expect(numeroDeProforma(123)).toBe("PRO-000123");
    expect(numeroDeProforma(null)).toBe("PRO-—");
  });
});

describe("precioAlCobrarDeLaProforma", () => {
  it("mismo precio: conserva el descuento y el motivo de la proforma", () => {
    const l = linea({ descuento_unitario: 18, motivo_descuento: "cerrar_venta" });
    expect(precioAlCobrarDeLaProforma(l, 179.9, "PRO-000123")).toEqual({ precioUnitario: 179.9, descuentoUnitario: 18, motivo: "cerrar_venta", motivoDetalle: "" });
  });
  it("subió de precio: cobra lo de la proforma, la diferencia es descuento «otro»", () => {
    const l = linea({ descuento_unitario: 18, motivo_descuento: "cerrar_venta" });
    expect(precioAlCobrarDeLaProforma(l, 199.9, "PRO-000123")).toEqual({ precioUnitario: 199.9, descuentoUnitario: 38, motivo: "otro", motivoDetalle: "Precio de la proforma PRO-000123" });
  });
  it("bajó de precio: paga lo menor, sin descuento si el precio nuevo ya es menor que lo cotizado", () => {
    const l = linea({ descuento_unitario: 18, motivo_descuento: "cerrar_venta" });
    expect(precioAlCobrarDeLaProforma(l, 150, "PRO-000123")).toEqual({ precioUnitario: 150, descuentoUnitario: 0, motivo: "", motivoDetalle: "" });
  });
  it("sin descuento y mismo precio: línea limpia", () => {
    expect(precioAlCobrarDeLaProforma(linea(), 179.9, "PRO-000001")).toEqual({ precioUnitario: 179.9, descuentoUnitario: 0, motivo: "", motivoDetalle: "" });
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `cd apps/web && npx vitest run lib/proformas-reglas.test.ts`
Expected: FAIL — `lineasDeLaProforma is not a function` (o error de import).

- [ ] **Step 3: Implementar** (agregar a `proformas-reglas.ts`; sumar los cuatro campos a `Proforma`)

```ts
// En el tipo `Proforma`, después de `vence_at`:
  /** Correlativo interno («PRO-000123»); null en filas de antes de la migración. */
  numero: number | null;
  /** Texto libre que sale impreso al pie. */
  nota: string | null;
  /** La venta con que se cobró (`marcar_proforma_cobrada`). */
  venta_id: string | null;
  /** Las líneas tal como las guardó `crear_proforma`: leerlas SIEMPRE con `lineasDeLaProforma`. */
  items: unknown;

/** Una línea de proforma: copia de la prenda al momento de cotizar (el papel no cambia si cambia el catálogo).
 *  `precio_unitario` es el de etiqueta CON IGV, como en `registrar_venta`. */
export type LineaProforma = {
  variante_id: string;
  cantidad: number;
  precio_unitario: number;
  descuento_unitario: number;
  motivo_descuento: string | null;
  motivo_descuento_detalle: string | null;
  descripcion: string;
  codigo: string | null;
};

/** Hasta dónde se puede descontar una línea en la proforma. Es la banda que el Punto de Venta cobra sin
 *  argumento escrito; lo que pase de ahí lo decide un líder al cobrar (spec 2026-09-22). */
export const TOPE_DESCUENTO_PROFORMA = 0.2;

const redondear = (n: number) => Math.round(n * 100) / 100;

/** Las líneas con prenda, o `null` si la proforma es del formato anterior (un total suelto sin prenda):
 *  esas no se cobran, no se duplican ni se imprimen. */
export function lineasDeLaProforma(items: unknown): LineaProforma[] | null {
  if (!Array.isArray(items) || items.length === 0) return null;
  if (!items.every((i) => typeof i === "object" && i !== null && typeof (i as { variante_id?: unknown }).variante_id === "string")) return null;
  return items as LineaProforma[];
}

/** La cuenta de la proforma, idéntica a la de `crear_proforma` (la base manda; esto es para mostrarla
 *  mientras se arma). */
export function totalesDeLineas(lineas: Pick<LineaProforma, "cantidad" | "precio_unitario" | "descuento_unitario">[]) {
  const total = redondear(lineas.reduce((s, l) => s + (l.precio_unitario - l.descuento_unitario) * l.cantidad, 0));
  const igv = redondear(total - total / 1.18);
  return {
    total,
    igv,
    subtotal: redondear(total - igv),
    descuentos: redondear(lineas.reduce((s, l) => s + l.descuento_unitario * l.cantidad, 0)),
    prendas: lineas.reduce((s, l) => s + l.cantidad, 0),
  };
}

export function numeroDeProforma(n: number | null): string {
  return n === null ? "PRO-—" : `PRO-${String(n).padStart(6, "0")}`;
}

/** Cómo entra una línea de la proforma al carrito del Punto de Venta. `registrar_venta` exige el precio de
 *  catálogo de HOY, así que lo prometido se expresa como descuento: se cobra lo menor entre lo cotizado y
 *  la etiqueta de hoy (decisión de Felipe: si subió, se respeta la proforma). Si subió, el motivo es «otro»
 *  con el número de la proforma; si no, el de la proforma. La campaña del día la aplica después el carrito
 *  (gana el descuento mayor). */
export function precioAlCobrarDeLaProforma(linea: LineaProforma, precioHoy: number, numero: string) {
  const cotizado = redondear(linea.precio_unitario - linea.descuento_unitario);
  const cobrado = Math.min(cotizado, precioHoy);
  const descuentoUnitario = redondear(precioHoy - cobrado);
  if (descuentoUnitario === 0) return { precioUnitario: precioHoy, descuentoUnitario: 0, motivo: "", motivoDetalle: "" };
  if (redondear(precioHoy) === redondear(linea.precio_unitario)) {
    return { precioUnitario: precioHoy, descuentoUnitario, motivo: linea.motivo_descuento ?? "", motivoDetalle: linea.motivo_descuento_detalle ?? "" };
  }
  return { precioUnitario: precioHoy, descuentoUnitario, motivo: "otro", motivoDetalle: `Precio de la proforma ${numero}` };
}
```

Nota: `ProformaFila = Omit<Proforma, "porVencer" | "vencida">` ya hereda los cuatro campos nuevos. Actualizar las
fábricas de filas en `proformas-reglas.test.ts`, `proformas.test.ts`, `facturacion-reglas.test.ts` y
`facturacion-proformas-reglas.test.ts` agregando `numero: null, nota: null, venta_id: null, items: []`.

- [ ] **Step 4: Correr y ver que pasa**

Run: `cd apps/web && npx vitest run lib/proformas-reglas.test.ts lib/proformas.test.ts lib/facturacion-reglas.test.ts lib/facturacion-proformas-reglas.test.ts && npx tsc --noEmit -p . 2>&1 | grep -v "^.next/"`
Expected: PASS, tsc sin errores.

- [ ] **Step 5: Commit** — `feat(proformas): reglas puras de las líneas y del cobro de una proforma`

---

### Task 2: Migración — número, nota, venta enlazada, `crear_proforma` v2 y `marcar_proforma_cobrada`

**Files:**
- Create: `supabase/migrations/20260922235700_proformas_con_prendas.sql` (antes de crear: `ls supabase/migrations | sort | tail -3` y usar un timestamp posterior al último, minutos no redondos)
- Modify: `packages/database/src/types.ts` (regenerar después de aplicar en local)

**Interfaces:**
- Produces (RPC):
  - `crear_proforma(p_ubicacion_id uuid, p_items jsonb, p_cliente_nombre text default null, p_cliente_num_doc text default null, p_vence_at timestamptz default null, p_nota text default null) returns uuid` — `p_items`: `[{variante_id, cantidad, precio_unitario, descuento_unitario?, motivo_descuento?, motivo_descuento_detalle?}]`.
  - `marcar_proforma_cobrada(p_proforma_id uuid, p_venta_id uuid) returns void`.
  - Columnas `proformas.numero bigint`, `proformas.nota text`, `proformas.venta_id uuid`.

- [ ] **Step 1: Escribir la migración**

```sql
-- Proformas con prendas del catálogo (spec docs/superpowers/specs/2026-09-22-proformas-con-prendas-design.md).
-- Hasta hoy una proforma era un total suelto (una línea «Venta») y convertirla creaba un comprobante SIN venta
-- ni movimiento de stock. Ahora lleva prendas reales, la base calcula el total y se cobra en el Punto de Venta
-- (registrar_venta) y luego se enlaza con marcar_proforma_cobrada.

-- ---------- Columnas ----------
alter table proformas add column if not exists numero bigint generated by default as identity;
alter table proformas add constraint proformas_numero_unico unique (numero);
alter table proformas add column if not exists nota text check (nota is null or char_length(nota) <= 500);
alter table proformas add column if not exists venta_id uuid references ventas(id);

-- ---------- crear_proforma v2 ----------
-- La firma vieja recibía subtotal/igv/total de la pantalla y guardaba el total CON IGV como precio SIN IGV
-- (error de IGV del 2026-09-22). Se BORRA en esta misma migración: dos sobrecargas vivas ya tumbaron una
-- pantalla (PostgREST no sabe cuál elegir).
drop function if exists retail.crear_proforma(uuid, jsonb, numeric, numeric, numeric, text, text, timestamptz);

create function retail.crear_proforma(
  p_ubicacion_id uuid,
  p_items jsonb,
  p_cliente_nombre text default null,
  p_cliente_num_doc text default null,
  p_vence_at timestamptz default null,
  p_nota text default null
) returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_id uuid; v_persona uuid; v_item jsonb; v_lineas jsonb := '[]'::jsonb;
  v_precio numeric; v_activo boolean; v_descripcion text; v_codigo text;
  v_cantidad integer; v_descuento numeric; v_motivo text; v_detalle text;
  v_total numeric := 0; v_igv numeric;
begin
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para crear proformas en esa ubicación' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La proforma necesita al menos una prenda';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select v.precio, v.activo,
           concat_ws(' · ', p.referencia, t.valor, c.nombre),
           v.codigo
      into v_precio, v_activo, v_descripcion, v_codigo
      from variantes v
      join productos p on p.id = v.producto_id
      left join tallas t on t.id = v.talla_id
      left join colores c on c.codigo = v.color_codigo
     where v.id = (v_item ->> 'variante_id')::uuid;
    if v_precio is null or not v_activo then
      raise exception 'proforma_prenda_no_disponible' using detail = coalesce(v_item ->> 'variante_id', '(sin prenda)');
    end if;

    v_cantidad := (v_item ->> 'cantidad')::integer;
    if v_cantidad is null or v_cantidad <= 0 or (v_item ->> 'cantidad')::numeric <> v_cantidad then
      raise exception 'La cantidad de % tiene que ser un entero mayor que 0', v_descripcion;
    end if;

    -- El mismo candado que registrar_venta: el precio de la línea es el de catálogo de HOY.
    if round((v_item ->> 'precio_unitario')::numeric, 2) <> round(v_precio, 2) then
      raise exception 'venta_precio_cambiado'
        using detail = v_descripcion,
              hint = format('En catálogo vale S/%s y la pantalla mandó S/%s', v_precio, v_item ->> 'precio_unitario');
    end if;

    v_descuento := round(coalesce((v_item ->> 'descuento_unitario')::numeric, 0), 2);
    v_motivo := nullif(btrim(coalesce(v_item ->> 'motivo_descuento', '')), '');
    v_detalle := nullif(btrim(coalesce(v_item ->> 'motivo_descuento_detalle', '')), '');
    if v_descuento < 0 or v_descuento > round(v_precio * 0.20, 2) + 0.01 then
      raise exception 'proforma_descuento_fuera_de_tope' using detail = v_descripcion,
        hint = 'En la proforma el descuento va de 0 a 20 % por prenda; más que eso lo decide un líder al cobrar.';
    end if;
    if v_descuento > 0 then
      if v_motivo is null or v_motivo <> all (array['cumpleanos_clienta_top', 'prenda_con_desperfecto', 'liquidacion_temporada', 'cerrar_venta', 'otro']) then
        raise exception 'venta_descuento_sin_motivo' using detail = v_descripcion;
      end if;
      if v_motivo = 'otro' and v_detalle is null then
        raise exception 'venta_descuento_sin_motivo' using detail = v_descripcion, hint = 'El motivo «Otro» necesita el detalle.';
      end if;
    else
      v_motivo := null; v_detalle := null;
    end if;

    v_total := v_total + (v_precio - v_descuento) * v_cantidad;
    -- La base copia la descripción y el código: no se cree lo que manda la pantalla.
    v_lineas := v_lineas || jsonb_build_object(
      'variante_id', v_item ->> 'variante_id', 'cantidad', v_cantidad, 'precio_unitario', v_precio,
      'descuento_unitario', v_descuento, 'motivo_descuento', v_motivo, 'motivo_descuento_detalle', v_detalle,
      'descripcion', v_descripcion, 'codigo', v_codigo);
  end loop;

  v_total := round(v_total, 2);
  if v_total <= 0 then
    raise exception 'El total de la proforma tiene que ser mayor que 0';
  end if;
  v_igv := round(v_total - v_total / 1.18, 2);

  select id into v_persona from public.personas where auth_user_id = auth.uid();
  insert into proformas (ubicacion_id, items, subtotal, igv, total, cliente_nombre, cliente_num_doc, usuario_id, vence_at, nota)
    values (p_ubicacion_id, v_lineas, v_total - v_igv, v_igv, v_total,
            nullif(btrim(p_cliente_nombre), ''), nullif(btrim(p_cliente_num_doc), ''), v_persona, p_vence_at, nullif(btrim(p_nota), ''))
    returning id into v_id;
  return v_id;
end;
$$;

revoke all on function retail.crear_proforma(uuid, jsonb, text, text, timestamptz, text) from public, anon;
grant execute on function retail.crear_proforma(uuid, jsonb, text, text, timestamptz, text) to authenticated;

-- ---------- marcar_proforma_cobrada ----------
-- Paso 2 del cobro: registrar_venta ya movió stock, caja y comprobante; esto solo enlaza la proforma.
-- Idempotente (reintento del Punto de Venta tras un corte de red).
create function retail.marcar_proforma_cobrada(p_proforma_id uuid, p_venta_id uuid)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare v_proforma proformas%rowtype; v_venta ventas%rowtype;
begin
  select * into v_proforma from proformas where id = p_proforma_id for update;
  if not found then raise exception 'La proforma no existe'; end if;
  if not fn_puede_operar_ubicacion(v_proforma.ubicacion_id) then
    raise exception 'No tienes permiso sobre esa proforma' using errcode = '42501';
  end if;
  if v_proforma.estado = 'convertida' and v_proforma.venta_id = p_venta_id then
    return;
  end if;
  if v_proforma.estado <> 'vigente' then
    raise exception 'La proforma ya no está vigente (está %)', v_proforma.estado;
  end if;
  select * into v_venta from ventas where id = p_venta_id;
  if not found or v_venta.estado <> 'completada' then
    raise exception 'La venta no existe o está anulada';
  end if;
  if v_venta.ubicacion_id <> v_proforma.ubicacion_id then
    raise exception 'La venta es de otra tienda que la proforma';
  end if;
  update proformas set estado = 'convertida', venta_id = p_venta_id where id = p_proforma_id;
end;
$$;

revoke all on function retail.marcar_proforma_cobrada(uuid, uuid) from public, anon;
grant execute on function retail.marcar_proforma_cobrada(uuid, uuid) to authenticated;

-- ---------- convertir_proforma_a_comprobante: fuera de la pantalla ----------
-- Crea un comprobante sin venta ni stock y arrastra el error de IGV. No se borra (historia): se le quita
-- el permiso para que nadie la llame.
revoke execute on function retail.convertir_proforma_a_comprobante from authenticated;
```

- [ ] **Step 2: Ensayar en local dentro de una transacción** (no deja nada)

```bash
cd supabase/migrations && sed 's/\r$//' 20260922235700_proformas_con_prendas.sql > "$TEMP/m.sql"
```

Luego, en una sola llamada: `(echo "begin; set search_path to retail, public;"; cat "$TEMP/m.sql"; cat pruebas.sql; echo "rollback;") | docker exec -i supabase_db_cayla-retail psql -U postgres -v ON_ERROR_STOP=1`, con `pruebas.sql` (en el scratchpad):

```sql
-- Como el líder de prueba (auth.uid) para que fn_puede_operar_ubicacion pase.
select set_config('request.jwt.claims', json_build_object('sub', (select auth_user_id from public.personas p join colaboradores c on c.persona_id = p.id where c.rol = 'lider' limit 1))::text, true);
do $$
declare v_var record; v_id uuid; v_p proformas%rowtype;
begin
  select v.id, v.precio, (select id from ubicaciones where tipo = 'tienda' limit 1) as ub into v_var from variantes v where v.activo and v.precio > 0 limit 1;
  -- total lo calcula la base
  v_id := retail.crear_proforma(v_var.ub, jsonb_build_array(jsonb_build_object('variante_id', v_var.id, 'cantidad', 2, 'precio_unitario', v_var.precio)), 'Ana', null, now() + interval '7 days', 'nota');
  select * into v_p from proformas where id = v_id;
  assert v_p.total = round(v_var.precio * 2, 2), 'total mal calculado';
  assert v_p.igv = round(v_p.total - v_p.total / 1.18, 2), 'igv mal';
  assert v_p.numero is not null and v_p.items -> 0 ->> 'descripcion' is not null, 'falta número o copia';
  -- precio falso
  begin perform retail.crear_proforma(v_var.ub, jsonb_build_array(jsonb_build_object('variante_id', v_var.id, 'cantidad', 1, 'precio_unitario', 1)));
        raise exception 'debió rechazar precio'; exception when others then assert sqlerrm = 'venta_precio_cambiado', sqlerrm; end;
  -- cantidad 0
  begin perform retail.crear_proforma(v_var.ub, jsonb_build_array(jsonb_build_object('variante_id', v_var.id, 'cantidad', 0, 'precio_unitario', v_var.precio)));
        raise exception 'debió rechazar cantidad'; exception when others then assert sqlerrm like 'La cantidad%', sqlerrm; end;
  -- descuento > 20 %
  begin perform retail.crear_proforma(v_var.ub, jsonb_build_array(jsonb_build_object('variante_id', v_var.id, 'cantidad', 1, 'precio_unitario', v_var.precio, 'descuento_unitario', round(v_var.precio * 0.5, 2), 'motivo_descuento', 'cerrar_venta')));
        raise exception 'debió rechazar tope'; exception when others then assert sqlerrm = 'proforma_descuento_fuera_de_tope', sqlerrm; end;
  -- descuento sin motivo
  begin perform retail.crear_proforma(v_var.ub, jsonb_build_array(jsonb_build_object('variante_id', v_var.id, 'cantidad', 1, 'precio_unitario', v_var.precio, 'descuento_unitario', 1)));
        raise exception 'debió pedir motivo'; exception when others then assert sqlerrm = 'venta_descuento_sin_motivo', sqlerrm; end;
  -- una sola firma viva
  assert (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'crear_proforma') = 1, 'sobrecarga vieja viva';
  raise notice 'OK crear_proforma';
end $$;
```

Expected: `NOTICE: OK crear_proforma` y `ROLLBACK`.

- [ ] **Step 3: Aplicar en local solo este archivo y regenerar tipos**

```bash
(echo "set search_path to retail, public;"; cat "$TEMP/m.sql") | docker exec -i supabase_db_cayla-retail psql -U postgres -v ON_ERROR_STOP=1
```

Registrar la versión como aplicada (mismo formato que las otras, `supabase_migrations.schema_migrations`), luego
regenerar `packages/database/src/types.ts` con el comando que usa el repo (`pnpm` script de tipos; ver
`package.json` raíz, `supabase gen types`). Si el clasificador bloquea la escritura persistente, pedirle a Felipe
que corra ese comando (memoria «escrituras persistentes bloqueadas»).

- [ ] **Step 4: Verificar** — `cd apps/web && npx tsc --noEmit -p .` compila con los nuevos tipos (fallarán
`NuevaProformaModal` y `ProformasPanel`, que se reescriben en las tareas 4 y 5: anotar los errores y seguir).

- [ ] **Step 5: Commit** — `feat(proformas): migración de proformas con prendas (crear v2 y marcar cobrada)`

---

### Task 3: Lecturas de proformas con líneas y fotos

**Files:**
- Modify: `apps/web/lib/proformas.ts`
- Modify: `apps/web/lib/catalogo-v2.ts` (solo si hace falta exponer `colorHex` en el tipo de salida: ya existe en el map, línea 71)

**Interfaces:**
- Consumes: `LineaProforma`, `lineasDeLaProforma` (Task 1); columnas nuevas (Task 2).
- Produces:
  - `COLUMNAS_PROFORMA` suma `numero, nota, venta_id, items`.
  - `getProformaParaCobrar(id: string): Promise<Proforma | null>` (null si no existe o no se puede leer).
  - `getFotosDeVariantes(ids: string[]): Promise<Record<string, { fotoUrl: string | null; colorHex: string | null }>>`.

- [ ] **Step 1: Implementar**

```ts
const COLUMNAS_PROFORMA = "id, numero, ubicacion_id, cliente_nombre, cliente_num_doc, total, estado, comprobante_id, venta_id, nota, items, created_at, vence_at";

/** Una proforma para cargarla en el Punto de Venta (`/vender?proforma=<id>`). `null` si no existe o si RLS
 *  no la deja ver: la página lo dice y arranca con el carrito vacío. */
export async function getProformaParaCobrar(id: string): Promise<Proforma | null> {
  const supabase = await createClient();
  const res = await supabase.from("proformas").select(COLUMNAS_PROFORMA).eq("id", id).maybeSingle();
  const { datos } = tolerar(res, "la proforma a cobrar");
  return datos ? marcarPorVencer([datos as ProformaFila])[0] : null;
}

/** Foto (por color) y tinte de cada prenda de las proformas, para la hoja A4 y el detalle. Misma regla
 *  que el catálogo: la foto del producto para ese color; sin foto, el `hex` del color. */
export async function getFotosDeVariantes(ids: string[]): Promise<Record<string, { fotoUrl: string | null; colorHex: string | null }>> {
  if (ids.length === 0) return {};
  const supabase = await createClient();
  const res = await supabase
    .from("variantes")
    .select("id, color_codigo, color:colores ( hex ), producto:productos ( producto_fotos ( url, color_codigo ) )")
    .in("id", ids);
  const { datos } = tolerar(res, "las fotos de las prendas");
  return Object.fromEntries(
    (datos ?? []).map((v) => [
      v.id,
      { fotoUrl: v.producto?.producto_fotos.find((f) => f.color_codigo === v.color_codigo)?.url ?? null, colorHex: v.color?.hex ?? null },
    ]),
  );
}
```

- [ ] **Step 2: Verificar** — `npx tsc --noEmit -p .` sin errores nuevos en `lib/proformas.ts`; `npx vitest run lib/proformas.test.ts` PASS.

- [ ] **Step 3: Commit** — `feat(proformas): lee número, nota, líneas y fotos de las proformas`

---

### Task 4: «Nueva proforma» con prendas, dentro de la pestaña Proformas

**Files:**
- Rewrite: `apps/web/components/NuevaProformaModal.tsx`
- Modify: `apps/web/components/FacturacionShell.tsx` (quitar modal y contexto de acciones)
- Delete: `apps/web/lib/useFacturacionAcciones.ts`
- Modify: `apps/web/lib/facturacion-puerta.test.ts` (el modal ya no vive en el shell)
- Modify: `apps/web/app/(app)/vender/comprobantes/proformas/page.tsx` (lee catálogo y tiendas)
- Modify: `apps/web/app/(app)/vender/comprobantes/layout.tsx` (ya no pasa `tiendas`/`ubicacionActualId` al shell)

**Interfaces:**
- Consumes: `crear_proforma` v2 (Task 2); `totalesDeLineas`, `TOPE_DESCUENTO_PROFORMA` (Task 1); `filtrarPrendasV2`, `resolverCodigoV2` (`lib/buscar-prenda-v2.ts`); `RAZONES_DESCUENTO` (`lib/vender-reglas.ts`); `ConsultaDocumento`.
- Produces: `type PrendaParaProforma = PrendaBuscableV2 & { precio: number; fotoUrl: string | null; colorHex: string | null }`;
  `<NuevaProformaModal abierto onCerrar prendas={PrendaParaProforma[]} ubicaciones={{id,nombre}[]} ubicacionActualId esLider inicial?={Proforma} />`
  (`inicial` = duplicar/renovar: arranca con esas prendas y esa clienta).

- [ ] **Step 1: Prueba del candado actualizada** — en `facturacion-puerta.test.ts`, reemplazar el bloque
«el modal vive una sola vez, en el shell» por:

```ts
describe("Facturación — el shell ya no dibuja modales", () => {
  const shell = readFileSync(join(COMPONENTES, "FacturacionShell.tsx"), "utf8");
  it("ni «Nueva proforma» ni «Emitir comprobante» se montan en el shell (viven en su pestaña o se quitaron)", () => {
    expect(shell).not.toMatch(/<NuevaProformaModal\b|<EmitirComprobanteModal\b/);
  });
});
```

(borrar `condicionadoAlEstado` y su prueba, que quedan sin uso). Run: `npx vitest run lib/facturacion-puerta.test.ts` → FAIL (el shell aún lo monta).

- [ ] **Step 2: Shell y layout** — en `FacturacionShell.tsx` quitar `NuevaProformaModal`, `AccionesFacturacionContext`,
`proformaAbierta`, `abrirProforma`, y las props `tiendas` / `ubicacionActualId`; el comentario de cabecera dice
que el shell es cabecera + pestañas + búsqueda. En `layout.tsx` quitar `getUbicaciones`, `tiendasOperativas`,
`ubicacionActualDe` y esas dos props. Borrar `lib/useFacturacionAcciones.ts`. Run la prueba → PASS.

- [ ] **Step 3: Reescribir `NuevaProformaModal.tsx`**

```tsx
"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Minus, Plus, Search, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { filtrarPrendasV2, resolverCodigoV2, type PrendaBuscableV2 } from "@/lib/buscar-prenda-v2";
import { lineasDeLaProforma, numeroDeProforma, TOPE_DESCUENTO_PROFORMA, totalesDeLineas, type Proforma } from "@/lib/proformas-reglas";
import { RAZONES_DESCUENTO } from "@/lib/vender-reglas";
import { venceDentroDe } from "@/lib/facturacion-proformas-reglas";
import { soles } from "@/lib/compras-reglas";
import { traducirError } from "@/lib/error-escritura";
import { tipoDocumentoDeCliente } from "@/lib/comprobantes-reglas";
import { ConsultaDocumento } from "@/components/ConsultaDocumento";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoSelect, CampoTexto } from "@/components/ui/campos";
import { avisar } from "@/components/ui/Avisos";

export type PrendaParaProforma = PrendaBuscableV2 & { precio: number; fotoUrl: string | null; colorHex: string | null; codigo: string | null };

type Fila = { prenda: PrendaParaProforma; cantidad: number; pct: number; motivo: string; detalle: string };

const PCT_MAX = Math.round(TOPE_DESCUENTO_PROFORMA * 100);
const descuentoDe = (f: Fila) => Math.round(f.prenda.precio * f.pct) / 100;

// «Nueva proforma» (spec 2026-09-22): prendas del catálogo con cantidad y descuento (hasta 20 %, con
// motivo), clienta, validez y nota. La cuenta que se ve sale de `totalesDeLineas`, la misma que hace
// `crear_proforma`; la base la vuelve a hacer y es la que manda. Vive en la pestaña Proformas: es la
// única que lee el catálogo. Con `inicial` arranca como copia de otra (Duplicar / Renovar).
export function NuevaProformaModal({
  onCerrar,
  prendas,
  ubicaciones,
  ubicacionActualId,
  esLider,
  inicial,
}: {
  onCerrar: () => void;
  prendas: PrendaParaProforma[];
  ubicaciones: { id: string; nombre: string }[];
  ubicacionActualId: string;
  esLider: boolean;
  inicial?: Proforma | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [ubicacionId, setUbicacionId] = useState(inicial?.ubicacion_id ?? ubicacionActualId);
  const [filas, setFilas] = useState<Fila[]>(() =>
    (lineasDeLaProforma(inicial?.items) ?? []).flatMap((l) => {
      const prenda = prendas.find((p) => p.varianteId === l.variante_id);
      // Una prenda que ya no está en el catálogo no se copia: se avisa al abrir.
      return prenda ? [{ prenda, cantidad: l.cantidad, pct: 0, motivo: "", detalle: "" }] : [];
    }),
  );
  const [q, setQ] = useState("");
  const [clienteNombre, setClienteNombre] = useState(inicial?.cliente_nombre ?? "");
  const [clienteDoc, setClienteDoc] = useState(inicial?.cliente_num_doc ?? "");
  const [dias, setDias] = useState(7);
  const [nota, setNota] = useState(inicial?.nota ?? "");

  const resultados = useMemo(() => (q.trim() ? filtrarPrendasV2(q, prendas, 6) : []), [q, prendas]);
  const totales = totalesDeLineas(filas.map((f) => ({ cantidad: f.cantidad, precio_unitario: f.prenda.precio, descuento_unitario: descuentoDe(f) })));
  const faltaMotivo = filas.some((f) => f.pct > 0 && (!f.motivo || (f.motivo === "otro" && !f.detalle.trim())));

  function agregar(p: PrendaParaProforma) {
    setFilas((actual) =>
      actual.some((f) => f.prenda.varianteId === p.varianteId)
        ? actual.map((f) => (f.prenda.varianteId === p.varianteId ? { ...f, cantidad: f.cantidad + 1 } : f))
        : [...actual, { prenda: p, cantidad: 1, pct: 0, motivo: "", detalle: "" }],
    );
    setQ("");
  }

  function cambiar(id: string, cambio: Partial<Fila>) {
    setFilas((actual) => actual.map((f) => (f.prenda.varianteId === id ? { ...f, ...cambio } : f)));
  }

  async function onCrear(e: React.FormEvent) {
    e.preventDefault();
    if (filas.length === 0) return void avisar.error("Agrega al menos una prenda.");
    if (faltaMotivo) return void avisar.error("Cada descuento necesita su motivo.");
    setLoading(true);
    const { data, error } = await createClient().rpc("crear_proforma", {
      p_ubicacion_id: ubicacionId,
      p_items: filas.map((f) => ({
        variante_id: f.prenda.varianteId,
        cantidad: f.cantidad,
        precio_unitario: f.prenda.precio,
        descuento_unitario: descuentoDe(f),
        motivo_descuento: f.pct > 0 ? f.motivo : undefined,
        motivo_descuento_detalle: f.pct > 0 && f.motivo === "otro" ? f.detalle.trim() : undefined,
      })),
      p_cliente_nombre: clienteNombre.trim() || undefined,
      p_cliente_num_doc: clienteDoc.trim() || undefined,
      p_vence_at: venceDentroDe(dias),
      p_nota: nota.trim() || undefined,
    });
    setLoading(false);
    if (error) return void avisar.error(traducirError(error, "crear la proforma"));
    avisar.exito(`Proforma de ${soles(totales.total)} creada`, { detalle: `${totales.prendas} ${totales.prendas === 1 ? "prenda" : "prendas"} · vence en ${dias} ${dias === 1 ? "día" : "días"}.` });
    void data;
    onCerrar();
    router.refresh();
  }

  return (
    <Modal titulo={inicial ? `Copia de ${numeroDeProforma(inicial.numero)}` : "Nueva proforma"} ancho="max-w-3xl" onClose={onCerrar}>
      {(cerrar) => (
        <form onSubmit={onCrear} className="mt-5 space-y-4">
          {esLider && ubicaciones.length > 1 && (
            <CampoSelect etiqueta="Tienda" valor={ubicacionId} onValor={setUbicacionId} opciones={ubicaciones.map((u) => ({ valor: u.id, texto: u.nombre }))} />
          )}

          {/* Buscador: referencia, SKU o escáner (Enter con un código exacto la agrega). */}
          <div className="relative">
            <label className="vidrio-cayla flex h-10 items-center gap-2 rounded-[10px] px-3 text-sm">
              <Search aria-hidden strokeWidth={1.75} className="h-4 w-4 text-tinta/60" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  const exacta = resolverCodigoV2(q, prendas) ?? resultados[0];
                  if (exacta) agregar(exacta);
                }}
                placeholder="Busca la prenda o escanea su código…"
                aria-label="Buscar prenda"
                autoComplete="off"
                className="min-w-0 flex-1 bg-transparent outline-none"
              />
            </label>
            {resultados.length > 0 && (
              <ul className="card-cayla absolute inset-x-0 top-11 z-10 max-h-72 overflow-auto p-1">
                {resultados.map((p) => (
                  <li key={p.varianteId}>
                    <button type="button" onClick={() => agregar(p)} className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-tinta/[0.05]">
                      <span>
                        <b className="font-semibold">{p.referencia}</b> · {[p.talla, p.color].filter(Boolean).join(" · ")}
                        <span className="ml-2 text-xs text-tinta/55">{p.codigo ?? p.sku}</span>
                      </span>
                      <span className="tabular-nums">{soles(p.precio)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Las prendas de la proforma. */}
          {filas.length === 0 ? (
            <p className="rounded-[12px] border border-dashed border-tinta/25 px-4 py-6 text-center text-sm text-tinta/60">Todavía no hay prendas. Búscalas arriba.</p>
          ) : (
            <ul className="divide-y divide-tinta/10 rounded-[12px] border border-tinta/10">
              {filas.map((f) => (
                <li key={f.prenda.varianteId} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                  <Foto prenda={f.prenda} />
                  <div className="min-w-[10rem] flex-1">
                    <p className="text-sm font-semibold text-tinta">{f.prenda.referencia}</p>
                    <p className="text-xs text-tinta/60">{[f.prenda.talla, f.prenda.color, f.prenda.codigo].filter(Boolean).join(" · ")}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button type="button" aria-label="Una menos" onClick={() => (f.cantidad > 1 ? cambiar(f.prenda.varianteId, { cantidad: f.cantidad - 1 }) : setFilas((a) => a.filter((x) => x !== f)))} className="grid h-7 w-7 place-items-center rounded-md hover:bg-tinta/10"><Minus aria-hidden className="h-3.5 w-3.5" /></button>
                    <span className="w-6 text-center tabular-nums">{f.cantidad}</span>
                    <button type="button" aria-label="Una más" onClick={() => cambiar(f.prenda.varianteId, { cantidad: f.cantidad + 1 })} className="grid h-7 w-7 place-items-center rounded-md hover:bg-tinta/10"><Plus aria-hidden className="h-3.5 w-3.5" /></button>
                  </div>
                  <label className="flex items-center gap-1 text-xs text-tinta/70">
                    Dscto.
                    <input type="number" min={0} max={PCT_MAX} step={1} value={f.pct || ""} placeholder="0"
                      onChange={(e) => cambiar(f.prenda.varianteId, { pct: Math.min(PCT_MAX, Math.max(0, Math.round(Number(e.target.value) || 0))) })}
                      aria-label={`Descuento en % de ${f.prenda.referencia}`} className="w-12 rounded-md border border-tinta/15 px-1.5 py-1 text-right tabular-nums" />%
                  </label>
                  {f.pct > 0 && (
                    <select value={f.motivo} onChange={(e) => cambiar(f.prenda.varianteId, { motivo: e.target.value })} aria-label="Motivo del descuento" className="rounded-md border border-tinta/15 px-1.5 py-1 text-xs">
                      <option value="">Motivo…</option>
                      {RAZONES_DESCUENTO.map((r) => <option key={r.valor} value={r.valor}>{r.etiqueta}</option>)}
                    </select>
                  )}
                  {f.pct > 0 && f.motivo === "otro" && (
                    <input value={f.detalle} onChange={(e) => cambiar(f.prenda.varianteId, { detalle: e.target.value })} placeholder="¿Por qué?" aria-label="Detalle del motivo" className="w-32 rounded-md border border-tinta/15 px-1.5 py-1 text-xs" />
                  )}
                  <p className="ml-auto w-24 text-right tabular-nums">
                    {descuentoDe(f) > 0 && <span className="block text-xs text-tinta/55 line-through">{soles(f.prenda.precio * f.cantidad)}</span>}
                    <b>{soles((f.prenda.precio - descuentoDe(f)) * f.cantidad)}</b>
                  </p>
                  <button type="button" aria-label={`Quitar ${f.prenda.referencia}`} onClick={() => setFilas((a) => a.filter((x) => x !== f))} className="grid h-7 w-7 place-items-center rounded-md text-tinta/60 hover:bg-tinta/10"><X aria-hidden className="h-3.5 w-3.5" /></button>
                </li>
              ))}
            </ul>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <ConsultaDocumento tipo={clienteDoc.length === 11 ? "ruc" : "dni"} obligatorio={false} numero={clienteDoc} onNumero={setClienteDoc} nombre={clienteNombre} onNombre={setClienteNombre} disparo="boton" />
              <CampoTexto etiqueta="Vale por (días)" type="number" min="1" max="60" value={String(dias)} onChange={(e) => setDias(Math.max(1, Math.min(60, Number(e.target.value) || 7)))} />
              <CampoTexto etiqueta="Nota para la clienta" pie="Sale impresa al pie. Opcional." maxLength={500} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Incluye caja de regalo" />
            </div>
            <dl className="space-y-1 self-end rounded-[12px] bg-tinta/[0.03] px-4 py-3 text-sm">
              <div className="flex justify-between text-tinta/70"><dt>{totales.prendas} {totales.prendas === 1 ? "prenda" : "prendas"} · descuentos</dt><dd className="tabular-nums">− {soles(totales.descuentos)}</dd></div>
              <div className="flex justify-between text-tinta/70"><dt>Op. gravada</dt><dd className="tabular-nums">{soles(totales.subtotal)}</dd></div>
              <div className="flex justify-between text-tinta/70"><dt>IGV 18 %</dt><dd className="tabular-nums">{soles(totales.igv)}</dd></div>
              <div className="flex justify-between border-t border-tinta/15 pt-1 font-display text-xl"><dt>Total</dt><dd className="tabular-nums">{soles(totales.total)}</dd></div>
            </dl>
          </div>

          <div className="flex gap-2 pt-1">
            <Boton type="button" peso="fantasma" className="flex-1" onClick={cerrar}>Cancelar</Boton>
            <Boton type="submit" peso="primario" className="flex-1" cargando={loading} disabled={filas.length === 0}>{loading ? "Guardando…" : "Crear proforma"}</Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}

/** La foto de la prenda para su color; sin foto, un recuadro del color (mismo criterio que la hoja A4). */
export function Foto({ prenda, grande = false }: { prenda: { fotoUrl: string | null; colorHex: string | null; referencia: string }; grande?: boolean }) {
  const tam = grande ? "h-[58px] w-[46px]" : "h-12 w-10";
  if (prenda.fotoUrl) {
    return (
      <span className={`relative ${tam} shrink-0 overflow-hidden rounded-[4px] bg-sand/40`}>
        <Image src={prenda.fotoUrl} alt={prenda.referencia} fill sizes="46px" className="object-cover" unoptimized />
      </span>
    );
  }
  return <span aria-hidden className={`${tam} shrink-0 rounded-[4px] border border-tinta/10`} style={{ background: prenda.colorHex ?? "#e9e2d6" }} />;
}
```

Notas: `tipoDocumentoDeCliente` no hace falta (quitar el import si no se usa). Revisar la firma real de
`ConsultaDocumento` (`disparo` acepta `"automatico" | ...`); usar el valor que exista.

- [ ] **Step 4: Página Proformas** — `proformas/page.tsx` lee además `getCatalogo()` y `getUbicaciones()` y arma
`prendas: PrendaParaProforma[]` (activas, precio > 0: `varianteId, sku, referencia, talla, color, codigosBarras, marca, codigo, precio, fotoUrl, colorHex`),
`tiendas = tiendasOperativas(...)`, `ubicacionActualId = ubicacionActualDe(tiendas, persona.ubicacionId)`, `esLider`,
y lo pasa a `ProformasPanel`.

- [ ] **Step 5: Verificar** — `npx tsc --noEmit -p .`, `npx eslint` de los archivos tocados, `npx vitest run lib/`.

- [ ] **Step 6: Commit** — `feat(proformas): nueva proforma con prendas del catálogo`

---

### Task 5: Lista de proformas — detalle, Cobrar, Duplicar y formato anterior

**Files:**
- Modify: `apps/web/components/ProformasPanel.tsx`
- Modify: `apps/web/lib/facturacion-proformas-reglas.ts` (+ test): `camposDeBusquedaDeLaProforma` incluye `numeroDeProforma(p.numero)` y las descripciones; `textoWhatsAppDeLaProforma` nombra el número y cuántas prendas.

**Interfaces:**
- Consumes: `NuevaProformaModal`, `Foto`, `PrendaParaProforma` (Task 4); `lineasDeLaProforma`, `numeroDeProforma` (Task 1).
- Produces: props nuevas de `ProformasPanel`: `prendas`, `tiendas`, `ubicacionActualId`, `esLider`, `fotos: Record<string,{fotoUrl,colorHex}>`.

- [ ] **Step 1: Pruebas** (en `facturacion-proformas-reglas.test.ts`)

```ts
it("busca por número de proforma y por prenda", () => {
  const p = proforma({ numero: 123, items: [{ variante_id: "v", cantidad: 1, precio_unitario: 10, descuento_unitario: 0, motivo_descuento: null, motivo_descuento_detalle: null, descripcion: "Blusa Emma · S · Negro", codigo: "CMS-0001-NEG-S" }] });
  expect(camposDeBusquedaDeLaProforma(p)).toEqual(expect.arrayContaining(["PRO-000123", "Blusa Emma · S · Negro"]));
});
it("el WhatsApp dice el número y cuántas prendas", () => {
  expect(textoWhatsAppDeLaProforma({ numero: 7, cliente_nombre: "Ana", total: 150, vence_at: null, items: [{ variante_id: "v", cantidad: 2 }] })).toBe(`Hola Ana, esta es tu proforma PRO-000007 de CAYLA: 2 prendas por ${soles(150)}.`);
});
```

Run → FAIL. Implementar (firma de `textoWhatsAppDeLaProforma` pasa a `Pick<Proforma, "numero" | "cliente_nombre" | "total" | "vence_at" | "items">`, cuenta prendas con `lineasDeLaProforma`; sin líneas dice solo el total). Run → PASS.

- [ ] **Step 2: Panel** — en `ProformasPanel.tsx`:
  - quitar el modal «Convertir a comprobante», `onConvertir`, `confirmacionDeConversion` y sus estados (y la
    función en reglas si queda sin uso, con su prueba);
  - columna de cliente muestra `PRO-000123 · Ana` y debajo «3 prendas»; la fila se despliega (`<details>` o
    estado `abiertaId`) con las líneas: `Foto` + descripción + `cant × precio` + importe;
  - `lineasDeLaProforma(p.items) === null` → `Chip tono="neutro"` «formato anterior» y sin botones;
  - botones (proforma con líneas): **Ver / imprimir** (Task 6), **Cobrar** (`<Link href={`/vender?proforma=${p.id}`}>`,
    solo `vigente`; en una vencida, el enlace lleva `&vencida=1` y Vender pide confirmar), **WhatsApp** (solo vigente
    no vencida), **Duplicar / Renovar** (abre `NuevaProformaModal` con `inicial={p}`; reemplaza `onDuplicar`);
  - «Nueva proforma» abre `NuevaProformaModal` local (estado `nueva: boolean | Proforma`).

- [ ] **Step 3: Verificar** — tsc, eslint, `vitest run lib/`; en el navegador (`/vender/comprobantes/proformas`):
crear una proforma de 3 prendas con un descuento, verla en la lista con su número, desplegar el detalle, duplicarla.

- [ ] **Step 4: Commit** — `feat(proformas): lista con detalle de prendas, cobrar y duplicar`

---

### Task 6: Hoja A4 de la proforma (maqueta C)

**Files:**
- Create: `apps/web/components/ProformaA4.tsx`
- Modify: `apps/web/components/ProformasPanel.tsx` (modal «Proforma PRO-…» con vista previa + Imprimir)

**Interfaces:**
- Consumes: `EMISOR` (`lib/emisor.ts`), `lineasDeLaProforma`, `totalesDeLineas`, `numeroDeProforma`, `Proforma`, `fotos`.
- Produces: `<ProformaA4 proforma tienda atendio fotos emisor? />`.

- [ ] **Step 1: Componente** (estructura de la maqueta C; tamaños en pt/mm como `BoletaA4`)

```tsx
import { EMISOR, type Emisor } from "@/lib/emisor";
import { lineasDeLaProforma, numeroDeProforma, totalesDeLineas, type Proforma } from "@/lib/proformas-reglas";
import { fechaHoraLima } from "@/lib/recibo-reglas";

const s = (n: number) => `S/ ${n.toFixed(2)}`;
const etiqueta = "inline-block rounded-full border border-black/20 px-[5pt] text-[7pt] text-black/60 mr-[3pt]";

/** La hoja A4 de una proforma (maqueta C, 2026-09-22): foto de cada prenda para que la clienta recuerde qué se
 *  probó. Solo pintura: las cuentas salen de `totalesDeLineas` sobre las líneas que guardó `crear_proforma`.
 *  Se imprime dentro de `#boleta-a4-print` (misma raíz y mismo CSS que la boleta A4). */
export function ProformaA4({
  proforma, tienda, atendio, fotos, emisor = EMISOR,
}: {
  proforma: Proforma;
  tienda: string;
  atendio: string | null;
  fotos: Record<string, { fotoUrl: string | null; colorHex: string | null }>;
  emisor?: Emisor;
}) {
  const lineas = lineasDeLaProforma(proforma.items) ?? [];
  const t = totalesDeLineas(lineas);
  const emitida = fechaHoraLima(proforma.created_at).fecha;
  const vence = proforma.vence_at ? fechaHoraLima(proforma.vence_at).fecha : null;
  return (
    <div className="relative mx-auto flex min-h-[270mm] w-[186mm] flex-col bg-white font-sans text-[9pt] leading-snug text-black">
      <header className="flex items-center justify-between border-b-2 border-rojo pb-[3mm] [print-color-adjust:exact]">
        <div>
          <p className="font-display text-[22pt] leading-none tracking-[0.14em] text-rojo">{emisor.nombreComercial}</p>
          <p className="mt-1 text-black/60">{emisor.razonSocial} · RUC {emisor.ruc}</p>
        </div>
        <div className="text-right">
          <p className="text-[12pt] font-bold tracking-[0.1em]">PROFORMA {numeroDeProforma(proforma.numero)}</p>
          <p className="text-black/60">
            Emitida {emitida}
            {vence && <> · <b className="text-rojo [print-color-adjust:exact]">válida hasta {vence}</b></>}
          </p>
        </div>
      </header>

      <section className="my-[4mm] flex gap-[10mm]">
        <p><span className="text-black/55">Clienta</span><br /><b>{proforma.cliente_nombre ?? "Cliente varios"}</b>{proforma.cliente_num_doc && <> · {proforma.cliente_num_doc.length === 11 ? "RUC" : "DNI"} {proforma.cliente_num_doc}</>}</p>
        <p><span className="text-black/55">Tienda</span><br /><b>{tienda}</b>{atendio && <> · atendió {atendio}</>}</p>
      </section>

      <ul>
        {lineas.map((l, i) => {
          const f = fotos[l.variante_id];
          const [ref, ...resto] = l.descripcion.split(" · ");
          return (
            <li key={`${l.variante_id}-${i}`} className="flex items-center gap-[4mm] border-b border-black/10 py-[2.5mm] [break-inside:avoid]">
              {f?.fotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- se imprime: se decodifica antes de print()
                <img src={f.fotoUrl} alt="" className="h-[15mm] w-[12mm] shrink-0 rounded-[1mm] object-cover" />
              ) : (
                <span className="h-[15mm] w-[12mm] shrink-0 rounded-[1mm] border border-black/10 [print-color-adjust:exact]" style={{ background: f?.colorHex ?? "#e9e2d6" }} />
              )}
              <div className="min-w-0 flex-1">
                <b className="text-[10pt]">{ref}</b>
                <br />
                {resto.map((r) => <span key={r} className={etiqueta}>{r}</span>)}
                {l.codigo && <span className="text-black/55">{l.codigo}</span>}
              </div>
              <p className="w-[22mm] text-right tabular-nums text-black/60">{l.cantidad} × {l.precio_unitario.toFixed(2)}</p>
              <p className="w-[26mm] text-right tabular-nums">
                {l.descuento_unitario > 0 && <span className="block text-black/55">− {(l.descuento_unitario * l.cantidad).toFixed(2)}</span>}
                <b>{s((l.precio_unitario - l.descuento_unitario) * l.cantidad)}</b>
              </p>
            </li>
          );
        })}
      </ul>

      <section className="mt-[4mm] flex justify-between gap-[6mm] [break-inside:avoid]">
        {proforma.nota ? (
          <div className="max-w-[95mm] rounded-[1.5mm] bg-[#faf6f0] px-[3mm] py-[2.5mm] [print-color-adjust:exact]">
            <p className="text-black/55">Nota</p>
            <p>{proforma.nota}</p>
          </div>
        ) : <span />}
        <table className="w-[62mm] tabular-nums">
          <tbody>
            <tr><td className="text-black/55">{t.prendas} {t.prendas === 1 ? "prenda" : "prendas"} · descuentos</td><td className="text-right">− {s(t.descuentos)}</td></tr>
            <tr><td className="text-black/55">Op. gravada</td><td className="text-right">{s(t.subtotal)}</td></tr>
            <tr><td className="text-black/55">IGV 18 %</td><td className="text-right">{s(t.igv)}</td></tr>
            <tr className="text-[12pt] font-bold"><td>Total</td><td className="text-right">{s(t.total)}</td></tr>
          </tbody>
        </table>
      </section>

      <footer className="mt-auto border-t border-black/15 pt-[2mm] text-[7.5pt] text-black/60">
        <p>{emisor.direccion.join(", ")} · {[emisor.telefono, emisor.email, emisor.web].filter(Boolean).join(" · ")}</p>
        <p className="mt-[1mm]">Precios con IGV, válidos hasta la fecha indicada. Las prendas no quedan reservadas. <b className="text-black">Este documento no es un comprobante de pago.</b></p>
      </footer>
    </div>
  );
}
```

Las cuentas salen solo de `totalesDeLineas` (misma fórmula que `crear_proforma`): la hoja no mezcla dos fuentes.

- [ ] **Step 2: Imprimir desde el panel** — modal `<Modal titulo={numeroDeProforma(p.numero)} ancho="max-w-4xl">` con
la hoja escalada (`origin-top scale-[0.72]`) y botón «Imprimir o guardar en PDF». Al pulsarlo: estado
`imprimiendo`, `createPortal(<div id="boleta-a4-print"><ProformaA4 … /></div>, document.body)` y el mismo efecto de
`DetalleVentaModal.tsx:67-89` (esperar `img.decode()`, `afterprint`, respaldo de 4 s). Tienda: nombre desde
`tiendas`; «atendió»: no se lee (queda `null`) — la proforma no guarda la asesora (fuera de alcance).

- [ ] **Step 3: Verificar el papel de verdad** — PDF con Playwright `page.pdf({ format: "A4" })` sobre una ruta
temporal (memoria «verificar impresión con page.pdf»): una sola hoja con 3 prendas, fotos visibles, pie abajo,
nada cortado en el margen. Borrar la ruta temporal.

- [ ] **Step 4: Commit** — `feat(proformas): hoja A4 de la proforma con foto de cada prenda`

---

### Task 7: Cobrar la proforma en el Punto de Venta

**Files:**
- Modify: `apps/web/app/(app)/vender/page.tsx` (lee `?proforma=`)
- Modify: `apps/web/components/PuntoDeVenta.tsx` (prop `proforma`, carrito inicial, franja, marcar cobrada)
- Create: `apps/web/lib/proforma-al-carrito.ts` + `apps/web/lib/proforma-al-carrito.test.ts`

**Interfaces:**
- Consumes: `getProformaParaCobrar` (Task 3), `precioAlCobrarDeLaProforma`, `lineasDeLaProforma`, `numeroDeProforma` (Task 1), `marcar_proforma_cobrada` (Task 2), `conDescuentoDeCampana` (`lib/vender-reglas.ts`).
- Produces: `lineasDelCarritoDesdeProforma(p: Proforma, variantes: VarianteBusqueda[]): { lineas: ItemCarrito[]; faltan: string[] }`
  y prop `proforma?: { id: string; numero: string; cliente: string | null; clienteDoc: string | null; vencida: boolean } | null`.

- [ ] **Step 1: Prueba de la conversión a carrito**

```ts
import { describe, expect, it } from "vitest";
import { lineasDelCarritoDesdeProforma } from "./proforma-al-carrito";

const variante = (extra = {}) => ({ varianteId: "v1", sku: "S", codigo: "CAS-0001-NEG-M", referencia: "Casaca Ximena", talla: "M", color: "Negro", categoria: null, precio: 199.9, campana: null, fotoUrl: null, stockAqui: 3, codigosBarras: [], ...extra });
const proforma = (items: unknown) => ({ id: "p", numero: 123, items } as never);

describe("lineasDelCarritoDesdeProforma", () => {
  it("respeta el precio de la proforma si la prenda subió", () => {
    const { lineas, faltan } = lineasDelCarritoDesdeProforma(proforma([{ variante_id: "v1", cantidad: 1, precio_unitario: 179.9, descuento_unitario: 0, motivo_descuento: null, motivo_descuento_detalle: null, descripcion: "Casaca Ximena · M · Negro", codigo: "CAS-0001-NEG-M" }]), [variante()]);
    expect(faltan).toEqual([]);
    expect(lineas[0]).toMatchObject({ varianteId: "v1", cantidad: 1, precioUnitario: 199.9, descuentoUnitario: 20, razonDescuento: "otro", razonDescuentoOtro: "Precio de la proforma PRO-000123" });
  });
  it("una prenda que ya no está en el catálogo de la tienda queda en «faltan»", () => {
    const { lineas, faltan } = lineasDelCarritoDesdeProforma(proforma([{ variante_id: "vX", cantidad: 1, precio_unitario: 10, descuento_unitario: 0, motivo_descuento: null, motivo_descuento_detalle: null, descripcion: "Blusa · S", codigo: null }]), [variante()]);
    expect(lineas).toEqual([]);
    expect(faltan).toEqual(["Blusa · S"]);
  });
  it("la cantidad no pasa del stock de la tienda", () => {
    const { lineas } = lineasDelCarritoDesdeProforma(proforma([{ variante_id: "v1", cantidad: 5, precio_unitario: 199.9, descuento_unitario: 0, motivo_descuento: null, motivo_descuento_detalle: null, descripcion: "Casaca", codigo: null }]), [variante({ stockAqui: 2 })]);
    expect(lineas[0].cantidad).toBe(2);
  });
});
```

Run → FAIL.

- [ ] **Step 2: Implementar `lib/proforma-al-carrito.ts`**

```ts
import type { ItemCarrito, VarianteBusqueda } from "@/components/PuntoDeVenta";
import { lineasDeLaProforma, numeroDeProforma, precioAlCobrarDeLaProforma, type Proforma } from "@/lib/proformas-reglas";
import { conDescuentoDeCampana, porcentajeDeLinea } from "@/lib/vender-reglas";

/** Las líneas de una proforma como carrito del Punto de Venta. Precio = etiqueta de HOY (lo exige
 *  `registrar_venta`) y lo prometido va como descuento (`precioAlCobrarDeLaProforma`). Si la campaña del día
 *  deja la prenda más barata, gana la campaña (un solo descuento, el mayor). La cantidad se recorta al stock
 *  de la tienda; lo que no está en su catálogo se devuelve en `faltan` para avisarlo. */
export function lineasDelCarritoDesdeProforma(p: Proforma, variantes: VarianteBusqueda[]): { lineas: ItemCarrito[]; faltan: string[] } {
  const numero = numeroDeProforma(p.numero);
  const lineas: ItemCarrito[] = [];
  const faltan: string[] = [];
  for (const l of lineasDeLaProforma(p.items) ?? []) {
    const v = variantes.find((x) => x.varianteId === l.variante_id);
    if (!v || v.stockAqui <= 0) {
      faltan.push(l.descripcion);
      continue;
    }
    const cobro = precioAlCobrarDeLaProforma(l, v.precio, numero);
    const base: ItemCarrito = {
      claveLinea: v.varianteId, varianteId: v.varianteId, referencia: v.referencia, sku: v.sku, codigo: v.codigo,
      cantidad: Math.min(l.cantidad, v.stockAqui), precioUnitario: cobro.precioUnitario, descuentoUnitario: 0,
      stockAqui: v.stockAqui, razonDescuento: "", razonDescuentoOtro: "", argumentoDescuento: "", campana: v.campana ?? null,
    };
    const conCampana = conDescuentoDeCampana(base);
    const deProforma = { ...base, descuentoUnitario: cobro.descuentoUnitario, razonDescuento: cobro.motivo, razonDescuentoOtro: cobro.motivoDetalle };
    lineas.push(porcentajeDeLinea(conCampana) >= porcentajeDeLinea(deProforma) ? conCampana : deProforma);
  }
  return { lineas, faltan };
}
```

Run → PASS. (Si `porcentajeDeLinea` o `conDescuentoDeCampana` tienen otra firma, ajustar a la real de
`lib/vender-reglas.ts:254,329`.)

- [ ] **Step 3: Página de Vender** — `VenderPage` recibe `searchParams: Promise<{ proforma?: string }>`, lo pasa a
`Caja`. Si viene `proforma`, `getProformaParaCobrar(id)`; si existe, es de esta sede y está `vigente`, pasa
`proforma={{ id, numero: numeroDeProforma(p.numero), cliente: p.cliente_nombre, clienteDoc: p.cliente_num_doc, vencida: p.vencida }}`
y `lineasProforma = lineasDelCarritoDesdeProforma(p, variantesParaVenta)`. Si no, `proformaAviso` con el porqué
(«ya se cobró», «es de otra tienda», «no existe»).

- [ ] **Step 4: `PuntoDeVenta`**
  - props `proforma`, `lineasProforma`, `proformaAviso`;
  - `useState<ItemCarrito[]>(() => lineasProforma?.lineas ?? [])`; al montar, si hay `faltan`, `avisar.aviso("…ya no hay en esta tienda", { detalle: faltan.join(", ") })`; si hay `proformaAviso`, `avisar.aviso(proformaAviso)`;
  - cliente del comprobante precargado con `proforma.cliente` / `clienteDoc`;
  - franja arriba del ticket: «Cobrando la proforma PRO-000123 de Ana Torres» con «Soltar» (limpia el carrito y la
    proforma: `router.replace("/vender")`); si `vencida`, una casilla «La proforma venció: cobrar igual con su precio» que
    el `motivoBloqueo` exige marcar;
  - en `cobrar()`, después del `registrar_venta` exitoso y SOLO en el camino en línea: 
    ```ts
    if (proforma && ventaId) {
      const { error: errMarcar } = await supabase.rpc("marcar_proforma_cobrada", { p_proforma_id: proforma.id, p_venta_id: ventaId });
      if (errMarcar) avisar.aviso("La venta quedó bien, pero la proforma sigue «vigente»", { detalle: "Márcala desde Proformas: no se cobró dos veces." });
    }
    ```
    y al final `router.replace("/vender")` para que la franja se vaya. En el camino sin conexión la proforma queda
    vigente y se avisa igual.

- [ ] **Step 5: Verificar en el navegador** — desde Proformas, «Cobrar» una de 3 prendas: el carrito llega armado,
se cobra, la proforma pasa a «convertida» (SQL: `select estado, venta_id from proformas where id = …`), el stock
bajó (`movimientos` de la venta) y el comprobante salió al sandbox.

- [ ] **Step 6: Commit** — `feat(vender): cobrar una proforma en el Punto de Venta`

---

### Task 8: Cierre — verificación completa y documentación

**Files:**
- Create: `docs/adr/0167-proformas-con-prendas.md` (confirmar que 0167 sigue libre en `origin/main`, refs remotas y otros worktrees)
- Modify: `docs/BACKLOG.md`, `docs/BITACORA.md`, `docs/ARQUITECTURA.md` (rutas↔RPC: `crear_proforma` v2, `marcar_proforma_cobrada`, `/vender?proforma=`)

- [ ] **Step 1: Suite completa** — `cd apps/web && npx tsc --noEmit -p . && npx eslint . && npx vitest run` (el
`menu.test.ts` por CRLF es el falso positivo conocido: `sed -i 's/\r$//' scripts/datos/aviario.mjs` antes).
- [ ] **Step 2: Navegador** — recorrido completo: crear → ver/imprimir (PDF) → WhatsApp → duplicar → cobrar.
Capturas para Felipe.
- [ ] **Step 3: Docs** — ADR (contexto, decisión, alternativas: tabla aparte de líneas / convertir directo /
reservar stock; consecuencias: dos llamadas no atómicas, 20 % de tope); BACKLOG «Proformas con prendas: migración
`…_proformas_con_prendas.sql` sin pegar en producción»; 3 líneas en BITACORA.
- [ ] **Step 4: Commit** — `docs(proformas): ADR-0167, backlog, bitácora y arquitectura`
- [ ] **Step 5: Producción** — NO se pega sin OK de Felipe para ESTA migración (receta «pegar en producción por
el MCP con verificación»: huella, `retail.` en el SQL, validación al final, humo como líder).
