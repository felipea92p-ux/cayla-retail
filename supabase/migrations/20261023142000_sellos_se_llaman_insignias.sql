-- ============================================================================
-- 20261023142000_sellos_se_llaman_insignias.sql — CAYLA V2 · Catálogo ▸ Insignias (ADR-0481, actualización 2026-10-23)
-- Lo que se le marca a una prenda (Nuevo, Top ventas, Hecho a mano, las campañas) deja de llamarse «Sellos» y se llama «Insignias».
--
-- EL PROBLEMA PRIMERO. Felipe (2026-10-23), antes de abrir el PR de Catálogo ▸ Sellos: «quiero cambiar el nombre de sellos a
--   Insignias», en todo el ERP. La web ya lo dice, pero dos cosas vienen de la base: el nombre del módulo en Roles y accesos
--   (`modulos.nombre`, «Sellos» desde 20261022151000) y diez mensajes de error de siete funciones que nombran ese módulo
--   («necesita el módulo «Campañas», «Campañas de la tienda web» o «Sellos»»). Sin esto, Roles diría «Sellos» y un error le pediría
--   a una colaboradora un módulo que en su pantalla ya no existe con ese nombre.
--
-- ANALOGÍA CAYLA. Es cambiar el letrero del perchero: la ropa colgada es la misma, solo el cartel dice otra cosa.
--
-- QUÉ HACE.
--   1. `modulos`: `etiquetas` se llama «Insignias» y su `incluye` habla de insignias. De paso, `campanas_web` deja de decir que las
--      fechas se arman «en Etiquetas» (nombre de antes de ADR-0473): se arman en Catálogo ▸ Insignias.
--   2. Siete funciones (`activar_campana`, `actualizar_campana_etiqueta`, `campana_detalle`, `crear_campana`, `etiquetar_variantes`,
--      `fn_campana_nombre_valido`, `guardar_campana`): solo el TEXTO de sus mensajes, con un reemplazo anclado. Ningún permiso,
--      ninguna regla ni ninguna firma cambia. Los comentarios internos que dicen «Sellos» se quedan como están.
-- DECIDÍ: las claves no se renombran (`etiquetas`, la tabla `retail.etiquetas`, `fn_puede_editar_etiquetas`), igual que cuando
--   «Etiquetas» pasó a decir «Sellos» (ADR-0473): renombrarlas obligaría a tocar roles, políticas y cada llamador por un cambio
--   que solo es de cartel.
-- DESCARTÉ: `create or replace` de las siete funciones enteras: copiaría ~500 líneas para cambiar diez frases, y si producción
--   tuviera una versión más nueva de alguna, la pisaría. El reemplazo anclado solo toca la frase y se detiene si no la encuentra.
--
-- SE ROMPE SI: alguien reescribe una de estas funciones con el texto viejo («Sellos»): el mensaje volvería a nombrar un módulo que
--   en Roles ya se llama distinto (sin error: solo el texto). `scripts/pruebas/campanas_llave_unica.mjs` espera el texto nuevo.
--
-- PRODUCCIÓN. Una sola parte, idempotente (se puede pegar dos veces). Sin políticas ni `drop trigger` (sin riesgo de 40P01); el
--   `update` de `modulos` toca una tabla que la tienda solo lee al entrar. `lock_timeout` 3 s. Cada ancla tiene que aparecer UNA
--   vez: si alguien cambió la función, se detiene sin tocar nada (todo va en una transacción). Sin `select … into` dentro de un
--   texto entre comillas. Al final, una comprobación que aborta si queda algún mensaje con «Sellos». El orden con la publicación
--   de la web no importa: la web no compara estos textos. Requiere 20261022151000 y 20261022203000.
-- CAÍDA EXTERNA. Nada llama a la red.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. Roles y accesos ----------
update retail.modulos
   set nombre = 'Insignias',
       incluye = 'Crear, editar, aprobar y archivar las insignias de las prendas (Nuevo, Top ventas, Hecho a mano…), con descuento o sin él, y ponérselas a las prendas'
 where clave = 'etiquetas'
   and (nombre is distinct from 'Insignias' or incluye not like '%las insignias de las prendas%');

update retail.modulos
   set incluye = 'Elegir cómo se ve la tienda online durante cada campaña (el ambiente, los colores, el movimiento, los textos o una imagen propia y dónde se muestra), programarlo y verlo antes con un enlace privado. Las fechas, el descuento y las prendas se siguen armando en Catálogo ▸ Insignias'
 where clave = 'campanas_web'
   and incluye like '%se siguen armando en Etiquetas';

-- ---------- 2. Los mensajes de error ----------
create or replace function pg_temp.reemplazar_anclado(p_firma text, p_viejo text, p_nuevo text)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  -- Ya aplicado: el texto nuevo está. Se mira primero porque, una vez aplicado, el ancla vieja ya no aparece y el conteo abortaría.
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el ancla aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición real.',
      p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

select pg_temp.reemplazar_anclado(
  'retail.activar_campana(uuid, boolean)',
  $v$'Configurar una campaña necesita el módulo «Campañas», «Campañas de la tienda web» o «Sellos» en tu rol.'$v$,
  $v$'Configurar una campaña necesita el módulo «Campañas», «Campañas de la tienda web» o «Insignias» en tu rol.'$v$
);

select pg_temp.reemplazar_anclado(
  'retail.actualizar_campana_etiqueta(uuid, numeric, date, date, uuid[])',
  $v$'Una campaña se configura con «Campañas», «Campañas de la tienda web» o «Sellos»; otro sello con descuento, con «Sellos».'$v$,
  $v$'Una campaña se configura con «Campañas», «Campañas de la tienda web» o «Insignias»; otra insignia con descuento, con «Insignias».'$v$
);

select pg_temp.reemplazar_anclado(
  'retail.campana_detalle(uuid)',
  $v$'Ver una campaña necesita el módulo «Campañas», «Campañas de la tienda web» o «Sellos» en tu rol.'$v$,
  $v$'Ver una campaña necesita el módulo «Campañas», «Campañas de la tienda web» o «Insignias» en tu rol.'$v$
);

select pg_temp.reemplazar_anclado(
  'retail.crear_campana(text, date, date)',
  $v$'Crear una campaña necesita el módulo «Campañas», «Campañas de la tienda web» o «Sellos» en tu rol.'$v$,
  $v$'Crear una campaña necesita el módulo «Campañas», «Campañas de la tienda web» o «Insignias» en tu rol.'$v$
);

select pg_temp.reemplazar_anclado(
  'retail.crear_campana(text, date, date)',
  $v$'Ya hay una campaña o sello «%».'$v$,
  $v$'Ya hay una campaña o insignia «%».'$v$
);

select pg_temp.reemplazar_anclado(
  'retail.crear_campana(text, date, date)',
  $v$'La campaña quedaría por aprobar: créala desde una cuenta con «Campañas», «Campañas de la tienda web» o «Sellos».'$v$,
  $v$'La campaña quedaría por aprobar: créala desde una cuenta con «Campañas», «Campañas de la tienda web» o «Insignias».'$v$
);

select pg_temp.reemplazar_anclado(
  'retail.etiquetar_variantes(jsonb)',
  $v$'Poner o quitar prendas necesita el módulo «Sellos», «Campañas» o «Campañas de la tienda web» en tu rol.'$v$,
  $v$'Poner o quitar prendas necesita el módulo «Insignias», «Campañas» o «Campañas de la tienda web» en tu rol.'$v$
);

select pg_temp.reemplazar_anclado(
  'retail.etiquetar_variantes(jsonb)',
  $v$'Las prendas de una campaña se eligen con «Campañas», «Campañas de la tienda web» o «Sellos»; las de otro sello, con «Sellos».'$v$,
  $v$'Las prendas de una campaña se eligen con «Campañas», «Campañas de la tienda web» o «Insignias»; las de otra insignia, con «Insignias».'$v$
);

select pg_temp.reemplazar_anclado(
  'retail.fn_campana_nombre_valido(text, uuid)',
  $v$'Ya hay una campaña o sello «%».'$v$,
  $v$'Ya hay una campaña o insignia «%».'$v$
);

select pg_temp.reemplazar_anclado(
  'retail.guardar_campana(uuid, text, numeric, date, date, uuid[])',
  $v$'Configurar una campaña necesita el módulo «Campañas», «Campañas de la tienda web» o «Sellos» en tu rol.'$v$,
  $v$'Configurar una campaña necesita el módulo «Campañas», «Campañas de la tienda web» o «Insignias» en tu rol.'$v$
);

-- ---------- 3. Comprobación: ningún mensaje de `retail` nombra ya el módulo «Sellos» ----------
do $c$
declare
  v_quedan text;
begin
  v_quedan := (
    select string_agg(p.proname, ', ' order by p.proname)
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'retail'
       and p.prokind = 'f'
       and pg_get_functiondef(p.oid) ~ 'raise[^;]*(«Sellos»|campaña o sello)'
  );
  if v_quedan is not null then
    raise exception 'Quedan mensajes que nombran «Sellos» en: %', v_quedan;
  end if;
  if (select nombre from retail.modulos where clave = 'etiquetas') is distinct from 'Insignias' then
    raise exception 'El módulo `etiquetas` no quedó como «Insignias».';
  end if;
end;
$c$;

select 'ADR-0481 · Catálogo: «Sellos» se llama «Insignias» (Roles y los mensajes de la base)' as parte, 'QUEDÓ BIEN' as resultado;
