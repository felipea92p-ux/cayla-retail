-- ============================================================================
-- 20261001100000_frescura_decisiones_tabla.sql — CAYLA V2 · ADR-0208 «Frescura del piso» · paso 4b, PARTE 1 de 3.
-- La libreta de «Ya decidí»: la tabla y los candados que hacen imposibles los estados que nunca deben existir.
--
-- EL PROBLEMA PRIMERO. El paso 4 (la pantalla, en producción desde el 2026-09-29) dice qué prendas están «Por decidir»,
-- pero no hay dónde ANOTAR lo que la encargada ya decidió: la prenda sigue ahí mientras siga colgada, y una tienda que ya
-- movió la blusa a la entrada vuelve a ver el mismo aviso cada mañana. Un aviso que no se puede contestar deja de leerse.
-- Esta tabla es esa respuesta: una libreta por prenda (modelo + color) y por sede, de solo agregar. Se anota qué se hizo
-- (la cambié de lugar / la dejo hasta agotar / la trasladé / la rebajé), quién, cuándo y por cuántos días vale.
--
-- CUATRO COSAS QUE NO SE GUARDAN A PROPÓSITO (se calculan al leer, desde el libro, en `frescura-decisiones-reglas.ts`):
--   · si la decisión SIGUE vigente (depende de hoy, de si llegó mercadería, de si terminó la temporada);
--   · si SIRVIÓ (una venta anulada después cambiaría el hecho, y un resultado guardado mentiría);
--   · qué se sugiere después;
--   · «Por decidir» (es «quieta y sin decisión vigente»; sale de la lectura del paso 3 y de esta libreta).
-- Lo único que se guarda es el HECHO: qué, quién, cuándo, sobre qué traslado y por cuántos días.
--
-- EL PLAZO SÍ SE GUARDA (`plazo_dias`, respuesta P1 de Felipe, 2026-09-28): «30 días es excesivo; compararía los días de
-- rotación de piso de la categoría y le daría plazo en base a eso: si en jeans es 15, le doy 15 más». Ese número se calcula
-- al decidir con la rotación que hay ESE día y se congela en la fila: si cambiara solo, «el martes 6 te digo» se movería
-- sin que nadie hiciera nada. La regla que lo calcula vive en la web (la curva de Kaplan-Meier es de TypeScript); la base
-- solo exige que sea un número razonable (1 a 30). Una anulación no lleva plazo.
--
-- ESTADOS QUE NUNCA DEBEN EXISTIR (Lamport) y QUÉ LOS IMPIDE — en la base, no en una función:
--   E1  dos decisiones «actuales» sobre la misma prenda y sede (dos personas en el mismo segundo)
--         → `una_respuesta` (unique sobre `anterior_id`: cada renglón tiene UNA sola respuesta) y `una_cabeza` (un índice
--           único parcial: una sola primera línea por prenda y sede). La libreta es una fila recta; la segunda persona en
--           llegar espera a la primera y choca.
--   E2  una libreta que salta de prenda o de sede → la llave foránea compuesta `misma_prenda`. `color_clave` es una columna
--         GENERADA (`coalesce(color_codigo, '')`): con el color nulo, una llave compuesta MATCH SIMPLE no se revisa (pasa en
--         producción: 19 de 306 variantes no tienen color). Generada, no puede mentir.
--   E3  anular algo que no es una decisión (otra anulación, o nada) → `anterior_accion` es parte de la llave foránea (no
--         puede mentir) y el `check` `anula_una_decision` exige que la anulación responda a una de las cuatro acciones.
--         OJO con el NULL: `accion <> 'anulacion' or anterior_accion in (…)` da NULL —y un CHECK deja pasar el NULL— cuando
--         no hay anterior; por eso el `check` termina en `is true`.
--   E4  «la trasladé» sin traslado, o un traslado colgado de otra acción → `(accion = 'traslade') = (transferencia_id is not null)`.
--   E5  un renglón que se responde a sí mismo → `anterior_id is distinct from id`. Un ciclo más largo no cabe: solo se apunta
--         a filas que ya existen y ninguna se edita.
--   E6  una decisión borrada o editada → disparadores `before update or delete` y `before truncate`, RLS encendido sin
--         políticas y `revoke all`. La única puerta es `eliminar_producto_con_historia` (parte 3), que apaga el disparador
--         SOLO dentro de su transacción y respalda cada fila antes.
--   E7  una decisión sin firma o sin fecha → `persona_id not null` (con llave a `public.personas`) y `creado_en not null`.
--   E8  el mismo toque guardado dos veces (reintento tras un corte de red) → `unique (token_cliente)`.
--   E9  una acción inventada, un plazo absurdo o una nota sin sentido → tres `check`.
-- Lo que NO es un estado imposible y por eso no es constraint: una anulación sin motivo (el «Deshacer» de 10 segundos no
-- puede pedir texto) y «tiene algo colgado / el traslado sale de esa sede»: son hechos del momento, no del renglón; los
-- revisa `anotar_decision_frescura` (parte 2) al guardar.
--
-- CUÁNTAS FILAS (números antes que opiniones): 3 tiendas × unas 100 prendas colgadas; del 20 al 30 % quietas; una decisión
-- cada 2 a 3 semanas por prenda quieta y un 10 % de anulaciones y cambios → unas 11 por tienda y semana → ~5.200 filas en 3
-- años. Techo absurdo (las 100 prendas decididas cada semana): ~47.000 filas, ~250 B por fila → menos de 20 MB. Lectura por
-- sede a 120 días: como mucho ~1.700 filas por índice. Escritura pico: unas 40 en 10 minutos (la revisión del martes). No
-- hace falta caché, foto diaria ni cola. Sin índice en `producto_id`: solo lo usaría el borrado de un producto (raro, lo hace
-- el Admin, y recorre ≤47.000 filas).
--
-- CÓMO SE PEGA EN PRODUCCIÓN. Sola, en el SQL Editor, tal cual (trae `retail.` y su `set search_path`), ANTES de la web del
-- paso 4b y ANTES de las partes 2 y 3. Una tabla nueva, sus índices, dos disparadores (con `create or replace trigger`, nunca
-- `drop trigger`: toma en exclusiva las tablas de auth y storage), RLS sin políticas: sin `alter` de tablas en uso ni
-- políticas (CLAUDE.md, «Políticas y deadlocks»). Las llaves foráneas toman un candado breve sobre `productos`, `ubicaciones`,
-- `transferencias`, `colores` y `terminales`: con `lock_timeout` de 3 s, si vence, se vuelve a pegar. Re-ejecutable.
--
-- VERIFICACIÓN después de pegar (solo lectura; tiene que dar exactamente esto):
--   select count(*) from pg_constraint where conrelid = 'retail.frescura_decisiones'::regclass and contype <> 'n';   → 17
--     (1 llave primaria, 7 llaves foráneas, 3 únicas y 6 check; en Postgres 18 los NOT NULL también salen, con contype n)
--   select count(*) from pg_trigger where tgrelid = 'retail.frescura_decisiones'::regclass and not tgisinternal;   → 2
--   select count(*) from retail.frescura_decisiones;                                                  → 0
--
-- SE ROMPE SI:
--   · alguien quiere anular una decisión falsa que ya tiene otra encima: hoy solo se anula la última línea; habría que sumar
--     una acción «corrección» que responda a un renglón que no es el último.
--   · CAYLA exhibe tallas del mismo modelo+color en zonas distintas y quiere decidir por talla: la unidad es la prenda
--     (modelo+color, ADR-0208 decisión 4); una prenda de 5 tallas pediría 5 anotaciones y podría quedar decidida la M y no
--     la L, algo que la fila de la pantalla no puede mostrar.
--   · el bloque 7 (rebaja por sede) crea rebajas reales: entonces `rebaje` tiene que enlazarlas con una llave, como `traslade`.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $$
begin
  if not exists (select 1 from retail.modulos where clave = 'frescura') then
    raise exception 'Falta el módulo Frescura: pega antes 20260929100000_frescura_modulo_y_candado.sql.';
  end if;
  if to_regclass('retail.transferencias') is null or to_regclass('retail.terminales') is null or to_regclass('public.personas') is null then
    raise exception 'Faltan transferencias, terminales o personas: esta migración se escribió contra producción. Revisa qué cambió.';
  end if;
end $$;

create table if not exists retail.frescura_decisiones (
  id               uuid primary key default gen_random_uuid(),
  ubicacion_id     uuid not null references retail.ubicaciones(id),
  producto_id      uuid not null references retail.productos(id),
  color_codigo     text references retail.colores(codigo),
  -- La clave del color: la de `clavePrendaDe` en la web. GENERADA, así no puede contradecir a `color_codigo`.
  color_clave      text generated always as (coalesce(color_codigo, '')) stored,
  accion           text not null,
  -- El renglón al que responde (null = primera línea de la libreta) y la acción de ESE renglón, verificada por la llave.
  anterior_id      uuid,
  anterior_accion  text,
  transferencia_id uuid references retail.transferencias(id),
  nota             text,
  -- Días de calendario de Lima, contando el día en que se decide como día 1; se congela al decidir (P1, Felipe 2026-09-28).
  plazo_dias       integer,
  persona_id       uuid not null references public.personas(id),   -- el responsable del combo: fn_actor_persona_id(true)
  terminal_id      uuid references retail.terminales(id),           -- desde qué terminal se anotó (auditoría, como transferencias)
  token_cliente    uuid not null,
  creado_en        timestamptz not null default now(),
  constraint frescura_decisiones_accion_valida check (accion in ('cambie_lugar', 'hasta_agotar', 'traslade', 'rebaje', 'anulacion')),
  constraint frescura_decisiones_token_unico unique (token_cliente),
  constraint frescura_decisiones_renglon unique (id, ubicacion_id, producto_id, color_clave, accion),
  constraint frescura_decisiones_misma_prenda foreign key (anterior_id, ubicacion_id, producto_id, color_clave, anterior_accion)
    references retail.frescura_decisiones (id, ubicacion_id, producto_id, color_clave, accion),
  constraint frescura_decisiones_una_respuesta unique (anterior_id),
  constraint frescura_decisiones_anterior_coherente check ((anterior_id is null) = (anterior_accion is null) and anterior_id is distinct from id),
  constraint frescura_decisiones_anula_una_decision check (accion <> 'anulacion' or (anterior_accion in ('cambie_lugar', 'hasta_agotar', 'traslade', 'rebaje')) is true),
  constraint frescura_decisiones_traslado check ((accion = 'traslade') = (transferencia_id is not null)),
  constraint frescura_decisiones_plazo check ((accion = 'anulacion') = (plazo_dias is null) and (plazo_dias is null or plazo_dias between 1 and 30)),
  constraint frescura_decisiones_nota check (nota is null or char_length(btrim(nota)) between 1 and 280)
);

-- Una sola primera línea por prenda y sede (E1): la segunda persona en llegar choca aquí.
create unique index if not exists frescura_decisiones_una_cabeza
  on retail.frescura_decisiones (ubicacion_id, producto_id, color_clave) where anterior_id is null;
-- La lectura de una sede: sus renglones de los últimos días.
create index if not exists frescura_decisiones_sede_fecha on retail.frescura_decisiones (ubicacion_id, creado_en desc);

alter table retail.frescura_decisiones enable row level security;            -- sin políticas: solo funciones security definer
revoke all on retail.frescura_decisiones from public, anon, authenticated;

create or replace function retail.fn_frescura_decisiones_inmutable() returns trigger
language plpgsql
as $f$
begin
  raise exception 'Una decisión anotada no se edita ni se borra: se quita o se cambia con un renglón nuevo.' using errcode = '42501';
end
$f$;

create or replace trigger frescura_decisiones_inmutable
  before update or delete on retail.frescura_decisiones
  for each row execute function retail.fn_frescura_decisiones_inmutable();

create or replace trigger frescura_decisiones_sin_truncate
  before truncate on retail.frescura_decisiones
  for each statement execute function retail.fn_frescura_decisiones_inmutable();

comment on table retail.frescura_decisiones is
  'Frescura del piso, paso 4b (ADR-0208): la libreta de «Ya decidí». Una libreta por prenda (modelo+color) y sede, de solo agregar: cada renglón responde a UN renglón anterior (anterior_id) y anular es un renglón más (accion = anulacion). Se guarda el hecho (qué, quién, cuándo, por cuántos días); si sigue vigente y si sirvió se calcula al leer. Nunca se edita ni se borra (disparador); solo eliminar_producto_con_historia la borra, con respaldo. Se escribe solo con anotar_decision_frescura y anular_decision_frescura.';
comment on column retail.frescura_decisiones.accion is
  'cambie_lugar (la moví de lugar en el piso: 7 días) · hasta_agotar (la dejo hasta que se agote) · traslade (la mandé a otra tienda, con su traslado) · rebaje (la rebajé, solo líder) · anulacion (quita el renglón al que responde).';
comment on column retail.frescura_decisiones.anterior_id is
  'El renglón de la misma prenda y sede al que responde; null = la primera línea de la libreta. Nadie más puede responder al mismo renglón (unique): así la libreta es una fila recta.';
comment on column retail.frescura_decisiones.plazo_dias is
  'Cuántos días vale la decisión antes de volver a «Por decidir» si sigue quieta: días de calendario de Lima, el día de la decisión es el día 1, vence a las 00:00. Se calcula en la web al decidir (rotación de su categoría en su sede, tope 30) y se congela. Null solo en una anulación.';
comment on column retail.frescura_decisiones.token_cliente is
  'La marca de este toque: el mismo toque enviado dos veces (un corte de red) devuelve el mismo renglón y no anota dos.';
comment on column retail.frescura_decisiones.persona_id is
  'Quién decidió: el responsable del combo (fn_actor_persona_id(true)), no la cuenta.';
