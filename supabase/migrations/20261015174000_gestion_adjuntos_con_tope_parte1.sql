-- ============================================================================
-- 20261015174000_gestion_adjuntos_con_tope_parte1.sql — CAYLA V2 (/chaos de Gestión e Inicio, ADR-0423, 2026-10-15) · PARTE 1 de 2
--
-- EL PROBLEMA PRIMERO. /chaos del último grupo del ERP (Gestión, Inicio, Rendimiento, CAYLA Global, Actividad, Comercial, Buscar; corrida
-- del 2026-10-15, semilla 20261015) encontró, solo por la API, que el adjunto de una factura de compra (el que se sube desde Inicio y desde
-- Compras) aceptaba un nombre de archivo de 5000 letras y una ruta de 5000 letras o con más carpetas que la de su factura. La pantalla
-- nunca los arma así (`rutaPara` en `lib/adjuntos-compra.ts`: `<compra>/<uuid>-<nombre en ASCII, hasta 80>`), pero la tabla tampoco los frenaba.
--
-- LA DECISIÓN. El último guardián en la tabla, como en el resto de Compras (ADR-0421):
--   · `compra_adjuntos_textos_con_tope`: el nombre hasta 255 letras (lo que deja un sistema de archivos) y la ruta hasta 300.
--   · `compra_adjuntos_ruta_un_archivo`: la ruta es la carpeta de su factura y UN archivo con letras, números, punto, guion o guion bajo,
--     sin más carpetas: lo mismo que arma la pantalla. El mensaje claro lo da `registrar_adjunto_compra` (parte 2).
--
-- CONTRATO (Liskov)
--   PROMETE: ninguna fila nueva o editada de `compra_adjuntos` los viola. Cada candado nace `not valid` y se valida si ninguna fila vieja
--            lo viola (en producción, ninguna: el 2026-10-15 no había adjuntos); si alguna lo viola, avisa y vale para lo nuevo.
--   ASUME:   las columnas `nombre`, `ruta` y `compra_id` de `compra_adjuntos` a la fecha.
--   NO HACE: no toca funciones, datos ni políticas; no toca el archivo guardado en Storage.
--
-- CÓMO SE PEGA. Una sola parte con SOLO `alter table` (ADR-0195). Idempotente. Antes de la parte 2 (20261015175000), que no depende de esta.
-- ============================================================================
set lock_timeout = '3s';

-- Agrega un CHECK `not valid` si no existe y lo valida si ninguna fila lo viola.
create or replace function pg_temp.candado(p_tabla text, p_nombre text, p_expresion text)
returns void
language plpgsql
as $f$
begin
  if not exists (select 1 from pg_constraint where conname = p_nombre and conrelid = ('retail.' || p_tabla)::regclass) then
    execute format('alter table retail.%I add constraint %I check (%s) not valid', p_tabla, p_nombre, p_expresion);
  end if;
  begin
    execute format('alter table retail.%I validate constraint %I', p_tabla, p_nombre);
  exception when check_violation then
    raise notice 'retail.%: hay filas viejas que no cumplen % — el candado vale para lo nuevo; corrígelas y luego valida a mano.', p_tabla, p_nombre;
  end;
end;
$f$;

select pg_temp.candado('compra_adjuntos', 'compra_adjuntos_textos_con_tope',
  $c$char_length(nombre) <= 255 and char_length(ruta) <= 300$c$);
select pg_temp.candado('compra_adjuntos', 'compra_adjuntos_ruta_un_archivo',
  $c$ruta ~ ('^' || compra_id::text || '/[A-Za-z0-9._-]{1,200}$')$c$);
