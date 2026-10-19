-- Tienda web ▸ Campañas (ADR-0436): la ficha de la prenda (Editar producto) también pide la llave de Campañas para poner o quitar una
-- campaña.
--
-- EL PROBLEMA. Desde 20261017151000 una campaña se configura con el módulo Campañas (`fn_puede_tocar_etiqueta`). Pero
-- `actualizar_variantes_etiquetas`, la que guarda las etiquetas de cada variante desde Editar producto (`ProductoForm.tsx`), deja entrar con
-- Etiquetas o con Productos y Atributos (`fn_puede_editar_catalogo`, P4 de 20260923140000) y no mira la llave de cada etiqueta. Las dos
-- terminales (Almacén y Ventas) tienen Productos: desde la ficha seguían poniendo prendas en Halloween, con su descuento, sin Campañas.
-- Felipe (2026-10-17): «que la sesión de Campañas construya la migración que cierra la puerta de Editar producto (cada etiqueta de campaña
-- pide Campañas) y que se pegue el día que se publique la web».
--
-- LO QUE HACE. Un parche ANCLADO a `actualizar_variantes_etiquetas`, antes de que borre lo que sale y ponga lo que entra:
--   · una campaña que la variante NO lleva y que viene en la lista entra solo con la llave de Campañas; sin ella, error 42501 que dice dónde
--     se hace (Tienda web ▸ Campañas ▸ Prendas);
--   · una campaña que la variante YA lleva y que no viene en la lista se queda si quien guarda no tiene la llave: guardar la ficha nunca
--     saca una prenda de su campaña (la ficha de quien no tiene Campañas ni siquiera la muestra, y la mandaría sin ella);
--   · las demás etiquetas siguen como hoy (Etiquetas o Productos y Atributos, ADR-0293).
-- La entrada de la función no cambia: Productos sigue cambiando las etiquetas que no son campaña.
--
-- QUÉ NO HACE. No toca `crear_producto_con_variantes` (Nuevo producto también pone etiquetas y deja elegir una campaña: es otra puerta, que
-- decide Felipe) ni `etiquetar_variantes` (ya mira la llave de cada etiqueta).
--
-- CUÁNDO SE PEGA. EL DÍA QUE SE PUBLIQUE LA WEB, justo antes de fusionar (casilla 1 de CONTINUAR.md), no antes: la web publicada todavía
-- ofrece las campañas en la ficha a quien no tiene Campañas y su guardado fallaría.
--
-- La función viva se revisó el 2026-10-17 en producción (md5 del cuerpo ce8f37f3…, con «P4 (20260923140000)» y ADR-0354) y en el repo
-- (e9979200…: solo cambia un comentario del medio). El tramo del ancla es igual en las dos. Si la función cambió, no se aplica nada y lo
-- dice. Idempotente y sin políticas: se pega de una vez.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function pg_temp.reemplazar_anclado(p_firma text, p_viejos text[], p_nuevos text[])
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
  v_cambio boolean := false;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  for i in 1 .. cardinality(p_viejos) loop
    -- Ya aplicado: el texto nuevo está. Se mira primero porque, una vez aplicado, el ancla vieja ya no aparece y el conteo abortaría.
    continue when position(p_nuevos[i] in v_def) > 0;
    v_n := (length(v_def) - length(replace(v_def, p_viejos[i], ''))) / length(p_viejos[i]);
    if v_n <> 1 then
      raise exception '% cambió desde que se escribió esta migración: el ancla % aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición real.',
        p_firma, i, v_n;
    end if;
    v_def := replace(v_def, p_viejos[i], p_nuevos[i]);
    v_cambio := true;
  end loop;
  if v_cambio then
    execute v_def;
  end if;
end;
$f$;

-- 1. La función es la que se revisó (o ya trae este parche) -------------------------------------------------------------------------

do $$
declare
  v_cuerpo text := (select prosrc from pg_proc where oid = 'retail.actualizar_variantes_etiquetas(jsonb)'::regprocedure);
begin
  if position('ADR-0436 (20261017212000)' in v_cuerpo) = 0
     and md5(v_cuerpo) not in ('ce8f37f3b64ca54bb79372192ae5fc8e', 'e99792003daba86220744fce7431ed4f') then
    raise exception 'actualizar_variantes_etiquetas cambió desde el 2026-10-17 (md5 %): regenera esta migración desde su definición real.', md5(v_cuerpo);
  end if;
end;
$$;

-- 2. El parche ------------------------------------------------------------------------------------------------------------------

select pg_temp.reemplazar_anclado(
  'retail.actualizar_variantes_etiquetas(jsonb)',
  array[$a$    -- ADR-0354: solo sale lo que ya no está y solo entra lo nuevo (antes se borraba todo y se volvía a poner).
    delete from retail.variante_etiquetas$a$],
  array[$n$    -- ADR-0436 (20261017212000): una campaña se pone o se quita con la llave de Campañas (`fn_puede_tocar_etiqueta`), también desde
    -- la ficha. Sin la llave, una campaña nueva no entra (lo dice) y una que la variante ya lleva se queda aunque la ficha no la mande:
    -- guardar la ficha nunca saca una prenda de su campaña. Las demás etiquetas, como siempre.
    if exists (
      select 1
      from unnest(coalesce(v_etiqueta_ids, '{}'::uuid[])) as x(id)
      join retail.etiquetas e on e.id = x.id and e.estilo = 'campana'
      where not exists (select 1 from retail.variante_etiquetas ve where ve.variante_id = v_variante_id and ve.etiqueta_id = x.id)
        and not retail.fn_puede_tocar_etiqueta(x.id)
    ) then
      raise exception 'Poner una prenda en una campaña necesita el módulo «Campañas» en tu rol: se hace en Tienda web ▸ Campañas ▸ Prendas.'
        using errcode = '42501', hint = 'campana_sin_llave';
    end if;
    v_etiqueta_ids := coalesce(v_etiqueta_ids, '{}'::uuid[]) || array(
      select ve.etiqueta_id
      from retail.variante_etiquetas ve
      join retail.etiquetas e on e.id = ve.etiqueta_id and e.estilo = 'campana'
      where ve.variante_id = v_variante_id
        and not (ve.etiqueta_id = any (coalesce(v_etiqueta_ids, '{}'::uuid[])))
        and not retail.fn_puede_tocar_etiqueta(ve.etiqueta_id)
    );

    -- ADR-0354: solo sale lo que ya no está y solo entra lo nuevo (antes se borraba todo y se volvía a poner).
    delete from retail.variante_etiquetas$n$]
);

-- 3. Comprobación -------------------------------------------------------------------------------------------------------------------

do $$
begin
  if position('ADR-0436 (20261017212000)' in (select prosrc from pg_proc where oid = 'retail.actualizar_variantes_etiquetas(jsonb)'::regprocedure)) = 0 then
    raise exception 'campanas_llave_en_editar_producto: actualizar_variantes_etiquetas no quedó con la llave de Campañas';
  end if;
end $$;

reset lock_timeout;
