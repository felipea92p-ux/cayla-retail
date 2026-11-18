-- ============================================================================
-- 20261118151000_libro_reclamaciones_erp.sql — CAYLA V2 · Tienda web ▸ Libro de Reclamaciones · PARTE 3: el ERP lo ve con su plazo
-- (ADR-0679, Felipe 2026-11-18)
--
-- EL PROBLEMA PRIMERO. Las hojas que deja un cliente en el Libro de Reclamaciones virtual (PARTES 1 y 2) se guardan, pero nadie en CAYLA
-- las ve. La ley da 15 días hábiles para responder (DS 011-2011-PCM, modificado por DS 101-2022-PCM): si nadie sabe que llegó una hoja,
-- el plazo vence solo y la multa la paga CAYLA.
--
-- ANALOGÍA CAYLA. El libro físico junto a la caja, pero con una cinta roja en cada hoja que dice cuántos días le quedan. La encargada no
-- tiene que contar días en el calendario: la hoja se lo dice.
--
-- QUÉ HACE
--   1. `retail.feriados_nacionales`: los feriados nacionales que no son día hábil (2026 y 2027). Sin ellos, contar lunes a viernes.
--   2. `fn_libro_vence_el(fecha)`: el último día del plazo: 15 días hábiles (lunes a viernes, sin feriados) contados desde el día
--      siguiente al que llegó la hoja (en hora de Lima).
--   3. El módulo «Libro de Reclamaciones» (grupo Tienda web, orden 65, junto a Pedidos web). Nace SIN rol: solo lo ve el líder, que
--      decide después a quién se lo da (ADR-0161).
--   4. `fn_libro_reclamaciones()`: las hojas, la más nueva primero, cada una completa y con su plazo (vence el, días hábiles que le
--      quedan). Pide el módulo.
--
-- DECIDÍ: los feriados son solo los de siempre (Año Nuevo, Jueves y Viernes Santo, 1 de mayo, San Pedro y San Pablo, Fiestas Patrias,
--   Santa Rosa, Angamos, Todos los Santos, la Inmaculada y Navidad). Los que se sumaron desde 2022 (6 de agosto, 9 de diciembre, 23 de
--   julio, 7 de junio) se agregan cuando la revisión legal los confirme con su norma: si sobra un feriado, el plazo que muestra el ERP
--   termina un día DESPUÉS del de la ley (peligroso); si falta uno, termina un día ANTES (CAYLA responde antes: inofensivo).
-- DECIDÍ: el plazo se calcula al leer, no se guarda: si mañana se corrige un feriado, todas las hojas lo ven igual, sin migrar datos.
-- DESCARTÉ: reusar `fn_dias_habiles` (Caja, ADR de tarifas POS): cuenta los sábados y no descuenta feriados, a propósito para el abono de
--   una tarjeta; para un plazo legal, contar un sábado lo acortaría por un lado y alargaría por otro.
--
-- SE ROMPE SI: pasa 2027 sin sumar los feriados de 2028 (los Jueves y Viernes Santo cambian de fecha cada año): el plazo de una hoja
--   de 2028 contaría esos días como hábiles y terminaría antes (inofensivo, pero hay que sumarlos).
--
-- PRODUCCIÓN. NO está aplicada: va DESPUÉS de las PARTES 1 y 2, y espera el OK de Felipe. Una sola parte, idempotente. Una tabla nueva,
-- una fila nueva en `modulos` (sin `rol_modulos`), funciones nuevas. Sin políticas, sin `drop trigger`, sin `select … into` entre comillas.
--
-- VERIFICACIÓN (solo lectura, después de pegar):
--   select retail.fn_libro_vence_el('2026-11-18');                                   → 2026-12-10 (el 8 de diciembre es feriado)
--   select clave, grupo, orden from retail.modulos where clave = 'libro_reclamaciones';   → libro_reclamaciones | Tienda web | 65
--   select count(*) from retail.rol_modulos where modulo = 'libro_reclamaciones';         → 0
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $guarda$
begin
  if to_regclass('retail.hojas_reclamacion') is null then
    raise exception 'Falta la hoja: pega antes 20261118145000_libro_reclamaciones_tienda.sql y 20261118150000.';
  end if;
  if to_regprocedure('retail.fn_exigir_modulo(text)') is null then
    raise exception 'Falta fn_exigir_modulo (ADR-0161).';
  end if;
end
$guarda$;

-- ---------- 1. Los feriados nacionales ----------
create table if not exists retail.feriados_nacionales (
  fecha  date primary key,
  nombre text not null check (char_length(btrim(nombre)) between 3 and 80)
);
comment on table retail.feriados_nacionales is
  'Feriados nacionales del Perú que no son día hábil para los plazos legales (Libro de Reclamaciones, ADR-0679). Los de siempre; los sumados desde 2022 entran cuando la revisión legal los confirme. Un año nuevo se agrega con su migración (Jueves y Viernes Santo cambian de fecha). RLS sin políticas: solo sus funciones.';
alter table retail.feriados_nacionales enable row level security;
revoke all on retail.feriados_nacionales from public, anon, authenticated;

insert into retail.feriados_nacionales (fecha, nombre) values
  ('2026-01-01', 'Año Nuevo'),
  ('2026-04-02', 'Jueves Santo'),
  ('2026-04-03', 'Viernes Santo'),
  ('2026-05-01', 'Día del Trabajo'),
  ('2026-06-29', 'San Pedro y San Pablo'),
  ('2026-07-28', 'Fiestas Patrias'),
  ('2026-07-29', 'Fiestas Patrias'),
  ('2026-08-30', 'Santa Rosa de Lima'),
  ('2026-10-08', 'Combate de Angamos'),
  ('2026-11-01', 'Todos los Santos'),
  ('2026-12-08', 'Inmaculada Concepción'),
  ('2026-12-25', 'Navidad'),
  ('2027-01-01', 'Año Nuevo'),
  ('2027-03-25', 'Jueves Santo'),
  ('2027-03-26', 'Viernes Santo'),
  ('2027-05-01', 'Día del Trabajo'),
  ('2027-06-29', 'San Pedro y San Pablo'),
  ('2027-07-28', 'Fiestas Patrias'),
  ('2027-07-29', 'Fiestas Patrias'),
  ('2027-08-30', 'Santa Rosa de Lima'),
  ('2027-10-08', 'Combate de Angamos'),
  ('2027-11-01', 'Todos los Santos'),
  ('2027-12-08', 'Inmaculada Concepción'),
  ('2027-12-25', 'Navidad')
on conflict (fecha) do nothing;

-- ---------- 2. El plazo ----------
create or replace function retail.fn_es_dia_habil(p_dia date)
returns boolean
language sql
stable
set search_path = retail, public
as $$
  select extract(isodow from p_dia) < 6 and not exists (select 1 from retail.feriados_nacionales f where f.fecha = p_dia)
$$;
comment on function retail.fn_es_dia_habil(date) is
  'Libro de Reclamaciones (ADR-0679): ¿es día hábil? Lunes a viernes, sin feriados nacionales (feriados_nacionales). Interna.';

create or replace function retail.fn_libro_vence_el(p_llego date)
returns date
language plpgsql
stable
set search_path = retail, public
as $$
declare
  v_dia date := p_llego;
  v_contados integer := 0;
begin
  if p_llego is null then
    return null;
  end if;
  -- Desde el día siguiente al que llegó: el día 15 hábil es el último para responder.
  while v_contados < 15 loop
    v_dia := v_dia + 1;
    if retail.fn_es_dia_habil(v_dia) then
      v_contados := v_contados + 1;
    end if;
  end loop;
  return v_dia;
end;
$$;
comment on function retail.fn_libro_vence_el(date) is
  'Libro de Reclamaciones (ADR-0679): el último día para responder una hoja que llegó ese día (fecha de Lima): 15 días hábiles contados desde el día siguiente. Interna.';

-- Cuántos días hábiles faltan de hoy (sin contarlo) hasta el último día (contándolo). 0: vence hoy; negativo: ya venció.
create or replace function retail.fn_libro_dias_habiles_restantes(p_hoy date, p_vence date)
returns integer
language sql
stable
set search_path = retail, public
as $$
  select case
    when p_vence is null or p_hoy is null then null
    when p_vence >= p_hoy then (select count(*)::integer from generate_series(p_hoy + 1, p_vence, interval '1 day') d where retail.fn_es_dia_habil(d::date))
    else -(select count(*)::integer from generate_series(p_vence + 1, p_hoy, interval '1 day') d where retail.fn_es_dia_habil(d::date))
  end
$$;
comment on function retail.fn_libro_dias_habiles_restantes(date, date) is
  'Libro de Reclamaciones (ADR-0679): días hábiles que quedan de hoy al último día del plazo (0: vence hoy; negativo: días hábiles vencidos). Interna.';

-- ---------- 3. El módulo ----------
insert into retail.modulos (clave, grupo, nombre, incluye, orden, solo_lider, delegable) values
  ('libro_reclamaciones', 'Tienda web', 'Libro de Reclamaciones',
   'Ver las hojas que los clientes dejan en el Libro de Reclamaciones de la tienda online, con sus datos, lo que reclaman y cuántos días hábiles quedan para responder, y responderles por correo dentro del plazo de la ley',
   65, false, true)
on conflict (clave) do nothing;

-- ---------- 4. La lista ----------
create or replace function retail.fn_libro_reclamaciones()
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public
as $$
declare
  v_hoy date := (now() at time zone 'America/Lima')::date;
begin
  perform retail.fn_exigir_modulo('libro_reclamaciones');
  return jsonb_build_object(
    'hoy', v_hoy,
    'hojas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.id, 'codigo', x.codigo, 'creada_en', x.creada_en, 'tipo', x.tipo,
               'tienda', x.ubicacion_nombre,
               'consumidor', jsonb_build_object(
                 'nombre', x.consumidor_nombre, 'tipo_documento', x.consumidor_tipo_documento, 'documento', x.consumidor_documento,
                 'domicilio', x.consumidor_domicilio, 'telefono', x.consumidor_telefono, 'correo', x.consumidor_correo,
                 'menor_de_edad', x.menor_de_edad, 'apoderado', x.apoderado_nombre),
               'bien', jsonb_build_object('tipo', x.bien_tipo, 'monto', x.bien_monto, 'descripcion', x.bien_descripcion),
               'detalle', x.detalle, 'pedido', x.pedido,
               'copia_enviada', x.copia_enviada_en is not null,
               'vence_el', x.vence,
               'dias_restantes', retail.fn_libro_dias_habiles_restantes(v_hoy, x.vence))
             order by x.creada_en desc, x.id)
        from (select h.*, retail.fn_libro_vence_el((h.creada_en at time zone 'America/Lima')::date) as vence
                from retail.hojas_reclamacion h
               order by h.creada_en desc, h.id
               limit 1000) x), '[]'::jsonb),
    'hay_mas', (select count(*) > 1000 from retail.hojas_reclamacion));
end;
$$;
comment on function retail.fn_libro_reclamaciones() is
  'Tienda web ▸ Libro de Reclamaciones (ADR-0679): las hojas (las 1000 más nuevas), cada una completa y con su plazo {vence_el, dias_restantes}. Pide el módulo libro_reclamaciones (42501 si no).';

-- ---------- 5. Permisos ----------
revoke all on function retail.fn_es_dia_habil(date) from public, anon, authenticated;
revoke all on function retail.fn_libro_vence_el(date) from public, anon, authenticated;
revoke all on function retail.fn_libro_dias_habiles_restantes(date, date) from public, anon, authenticated;
revoke all on function retail.fn_libro_reclamaciones() from public, anon, authenticated;
grant execute on function retail.fn_libro_reclamaciones() to authenticated;
