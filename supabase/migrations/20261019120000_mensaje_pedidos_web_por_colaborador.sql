-- Mensaje predeterminado de WhatsApp para los pedidos de la tienda web, PROPIO de cada colaborador (decisión de Felipe, 2026-10-19).
-- Cada persona edita su propio texto; si nunca lo editó (o lo borró), el pedido usa el de fábrica de la web. No aplica a los pedidos
-- de otros canales.
--
-- Por qué una tabla aparte y no una columna en `colaboradores`: `colaboradores` es el padrón de quién puede estar en retail (acceso),
-- y esta es una preferencia de cada persona. Separarlas deja el padrón con una sola razón de cambiar y permite agregar otras
-- preferencias personales sin tocar los permisos.
--
-- Por qué sin políticas RLS: nadie lee ni escribe la tabla directamente; solo las dos funciones de abajo (security definer), que
-- usan la persona de la sesión. Así una persona no puede leer ni cambiar el mensaje de otra.

set search_path = retail, public, extensions;

create table if not exists retail.preferencias_colaborador (
  persona_id              uuid primary key references public.personas (id),
  -- null = usar el de fábrica. Con texto: entre 1 y 600 letras, sin espacios sobrantes.
  mensaje_pedidos_web     text check (mensaje_pedidos_web is null or (length(mensaje_pedidos_web) between 1 and 600)),
  actualizado_en          timestamptz not null default now()
);

alter table retail.preferencias_colaborador enable row level security;

-- Lee el mensaje de la persona de la sesión. Sin persona (una terminal sin cuenta) o sin texto propio: null, y la web usa el de fábrica.
create or replace function retail.fn_mensaje_pedidos_web_mio()
returns text
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select p.mensaje_pedidos_web
  from retail.preferencias_colaborador p
  where p.persona_id = retail.fn_actor_persona_id(false)
$$;

-- Guarda el mensaje de la persona de la sesión. Vacío = volver al de fábrica (se borra el texto propio). Devuelve lo guardado.
-- Se firma con la persona misma (false), no con el responsable del combo: es su preferencia, no una operación de tienda.
create or replace function retail.fn_guardar_mensaje_pedidos_web(p_texto text)
returns text
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_persona uuid := retail.fn_actor_persona_id(false);
  v_texto   text := nullif(btrim(coalesce(p_texto, '')), '');
begin
  if v_persona is null then
    raise exception 'Inicia sesión con tu cuenta para guardar tu mensaje.' using hint = 'pedidos_web_mensaje_sin_persona';
  end if;
  if v_texto is not null and length(v_texto) > 600 then
    raise exception 'El mensaje es demasiado largo: máximo 600 letras.' using hint = 'pedidos_web_mensaje_largo';
  end if;

  insert into retail.preferencias_colaborador (persona_id, mensaje_pedidos_web, actualizado_en)
  values (v_persona, v_texto, now())
  on conflict (persona_id) do update
    set mensaje_pedidos_web = excluded.mensaje_pedidos_web,
        actualizado_en = excluded.actualizado_en;

  return v_texto;
end
$$;

revoke all on function retail.fn_mensaje_pedidos_web_mio() from public;
revoke all on function retail.fn_guardar_mensaje_pedidos_web(text) from public;
grant execute on function retail.fn_mensaje_pedidos_web_mio() to authenticated;
grant execute on function retail.fn_guardar_mensaje_pedidos_web(text) to authenticated;
