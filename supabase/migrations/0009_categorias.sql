-- Taxonomía real del catálogo: familia (6, fija) + categoría (dentro de cada
-- familia, editable por Líder sin necesitar un deploy de código). Antes `categoria`
-- era texto libre en `productos` — permitía "estados imposibles" como una categoría
-- de Calzado mal escrita o repetida con variaciones. Diseñado con Felipe a partir de
-- cómo LVMH separa "Perfumes & Cosmetics" como sector propio, y Zara trata "Beauty"
-- como categoría independiente, no como accesorio.

create table categorias (
  id uuid primary key default gen_random_uuid(),
  familia text not null check (familia in ('indumentaria', 'calzado', 'accesorios', 'bisuteria', 'belleza', 'papeleria')),
  nombre text not null,
  tallas_sugeridas text[],
  created_at timestamptz not null default now(),
  unique (familia, nombre)
);

insert into categorias (familia, nombre, tallas_sugeridas) values
  ('indumentaria', 'Blusas', array['Estándar','XS','S','M','L','XL','XXL']),
  ('indumentaria', 'Camisas', array['Estándar','XS','S','M','L','XL','XXL']),
  ('indumentaria', 'Polos/Camisetas', array['Estándar','XS','S','M','L','XL','XXL']),
  ('indumentaria', 'Poleras/Sudaderas', array['Estándar','XS','S','M','L','XL','XXL']),
  ('indumentaria', 'Chompas', array['Estándar','XS','S','M','L','XL','XXL']),
  ('indumentaria', 'Tops', array['Estándar','XS','S','M','L','XL','XXL']),
  ('indumentaria', 'Vestidos', array['XS','S','M','L','XL','XXL']),
  ('indumentaria', 'Faldas', array['XS','S','M','L','XL','XXL']),
  ('indumentaria', 'Pantalones', array['26','28','30','32','34']),
  ('indumentaria', 'Jeans', array['26','28','30','32','34']),
  ('indumentaria', 'Shorts/Bermudas', array['XS','S','M','L','XL','XXL']),
  ('indumentaria', 'Casacas/Chaquetas', array['XS','S','M','L','XL','XXL']),
  ('indumentaria', 'Abrigos', array['XS','S','M','L','XL','XXL']),
  ('indumentaria', 'Ropa interior/Lencería', array['XS','S','M','L','XL']),
  ('indumentaria', 'Trajes de baño', array['XS','S','M','L','XL']),
  ('calzado', 'Zapatillas', array['34','35','36','37','38','39','40','41','42']),
  ('calzado', 'Sandalias', array['34','35','36','37','38','39','40','41','42']),
  ('calzado', 'Botas', array['34','35','36','37','38','39','40','41','42']),
  ('calzado', 'Zapatos formales', array['34','35','36','37','38','39','40','41','42']),
  ('accesorios', 'Carteras/Bolsos', null),
  ('accesorios', 'Mochilas', null),
  ('accesorios', 'Cinturones', array['S','M','L','XL']),
  ('accesorios', 'Bufandas/Chalinas', null),
  ('accesorios', 'Gorros/Sombreros', array['Único']),
  ('accesorios', 'Lentes de sol', array['Único']),
  ('bisuteria', 'Pulseras', array['Único']),
  ('bisuteria', 'Aretes', array['Único']),
  ('bisuteria', 'Anillos', array['6','7','8','9']),
  ('bisuteria', 'Collares', array['Único']),
  ('belleza', 'Maquillaje', array['Único']),
  ('papeleria', 'Lapiceros', array['Único']),
  ('papeleria', 'Colores', array['Único']);

-- productos.categoria (texto libre) → productos.categoria_id (referencia real).
-- Sin catálogo real cargado todavía (solo datos de prueba) — se reemplaza directo,
-- sin backfill: más barato cambiar el terreno ahora que después de cargar 900+ SKUs
-- reales (Kent Beck: haz fácil el cambio, luego cámbialo).
alter table productos add column categoria_id uuid references categorias (id);
alter table productos drop column categoria;

-- ==================== RLS ====================
alter table categorias enable row level security;
create policy categorias_select_autenticado on categorias for select
  using (auth.role() = 'authenticated');
create policy categorias_insert_lider on categorias for insert
  with check (fn_es_lider());
create policy categorias_update_lider on categorias for update
  using (fn_es_lider());

-- ==================== recibir_lote: categoria (texto) → categoria_id (uuid) ====================
create or replace function recibir_lote(
  p_sede_id uuid,
  p_origen text,
  p_items jsonb,
  p_proveedor text default null,
  p_numero_guia text default null,
  p_nota text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_persona_id uuid;
  v_lote_id uuid;
  v_item jsonb;
  v_variante_id uuid;
  v_producto_id uuid;
  v_movimiento_id uuid;
  v_contenedor_id uuid;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'El lote no tiene ítems';
  end if;

  select id into v_persona_id from personas where auth_user_id = auth.uid();

  insert into lotes (sede_id, origen, proveedor, numero_guia, recibido_por, nota)
    values (p_sede_id, p_origen, p_proveedor, p_numero_guia, v_persona_id, p_nota)
    returning id into v_lote_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    if (v_item ->> 'variante_id') is not null then
      v_variante_id := (v_item ->> 'variante_id')::uuid;
    else
      if (v_item ->> 'producto_id') is not null then
        v_producto_id := (v_item ->> 'producto_id')::uuid;
      else
        insert into productos (sku_padre, referencia, categoria_id, genero, marca, temporada)
          values (
            v_item ->> 'sku_padre', v_item ->> 'referencia',
            case when (v_item ->> 'categoria_id') is not null then (v_item ->> 'categoria_id')::uuid else null end,
            v_item ->> 'genero', v_item ->> 'marca', v_item ->> 'temporada'
          )
          returning id into v_producto_id;
      end if;

      insert into variantes (producto_id, sku, talla, color, costo, precio, stock_minimo)
        values (
          v_producto_id, v_item ->> 'sku', v_item ->> 'talla', v_item ->> 'color',
          coalesce((v_item ->> 'costo')::numeric, 0), coalesce((v_item ->> 'precio')::numeric, 0),
          coalesce((v_item ->> 'stock_minimo')::integer, 0)
        )
        returning id into v_variante_id;
    end if;

    v_contenedor_id := case when (v_item ->> 'contenedor_id') is not null
      then (v_item ->> 'contenedor_id')::uuid else null end;

    insert into movimientos (variante_id, sede_id, tipo, cantidad, motivo, usuario_id, lote_id, contenedor_id)
      values (
        v_variante_id, p_sede_id, 'entrada', (v_item ->> 'cantidad')::integer,
        'ingreso de lote', v_persona_id, v_lote_id, v_contenedor_id
      )
      returning id into v_movimiento_id;
    perform fn_aplicar_movimiento(v_movimiento_id);
  end loop;

  return v_lote_id;
end;
$$;
