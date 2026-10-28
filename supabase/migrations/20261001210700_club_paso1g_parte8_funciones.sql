-- ============================================================================
-- 20261001210700_club_paso1g_parte8_funciones.sql — CAYLA V2 · Club de clientas · paso 1, tanda 1g · PARTE 8 de 8
-- ADR-0288 («Actualización 2026-10-01 (g)», G-1 a G-16, y «Contrato de la tanda 1g»). OCHO PARTES, sin políticas ni
-- `drop trigger` (CLAUDE.md, «Políticas y deadlocks»).
--
-- EL PROBLEMA. El club se armaba en caja: la asesora pedía celular y cumpleaños, leía un texto, mostraba un QR personal y
-- esperaba un mensaje de WhatsApp para dar la publicidad. Felipe (2026-10-01) lo cambió: ella escanea el cartel de la tienda
-- y se une sola en una página de CAYLA; el club es WhatsApp de promociones (opcional) y dos beneficios: el cupón de
-- cumpleaños (ya existía) y un vale de aniversario que crece cada año (nuevo). La base tenía que poder: recibir el registro
-- de una página sin sesión (sin `auth.uid()`, sin responsable) sin abrirle la puerta a nadie; frenar el abuso del cartel;
-- guardar la prueba del consentimiento (texto, versión y hora: Ley 29733 y su reglamento); calcular el aniversario con
-- compras netas; canjear el vale en la venta como el cumpleaños; armar la lista de avisos con el tope y el grupo testigo; y
-- anonimizar sola una ficha a los 3 años sin compras (G-15).
--
-- QUÉ HACE (las PARTES 1 a 7 dejan el esquema; esta, las funciones)
--   PARTE 1 (clientas, sola): `correo`, `registro_origen` (caja | cartel), `club_ubicacion_id`, sus candados y dos
--     disparadores (correo y tienda del club se vacían al anonimizar o dejar el club; los avisos pierden teléfono y texto).
--   PARTE 2 (configuracion_empresa, sola): `club_aniversario_compras` (6), `club_aniversario_monto` (600) y
--     `club_aniversario_dias` (60).
--   PARTE 3 (club_canjes, sola): tipo `aniversario`, `anio_club`, `pct` nulo en el aniversario, un canje vivo por año de club.
--   PARTE 4 (club_textos, sola): los tipos nuevos y sus textos v1 (términos, privacidad, casilla, saludo y 4 plantillas).
--   PARTE 5 (club_permisos, sola): el medio `pagina_cartel` y la anonimización automática sin persona (con nota).
--   PARTE 6 (modulos): el módulo `avisos_club`, sin rol.
--   PARTE 7 (tablas nuevas): `club_aniversario_escala` (20/30/40/50/60), `club_intentos_registro`, `club_avisos_enviados`.
--   PARTE 8 (este archivo), las funciones del contrato:
--    1. `fn_club_pagina(p_ubicacion_id)` (anon): la tienda, su WhatsApp, el % del cumpleaños, la escala, el umbral, los días
--       y los cuatro textos vigentes con su versión y su fecha. `null` si no es una tienda activa. Y, sin tienda (ajuste del
--       contrato para /club/privacidad y /club/terminos), `fn_club_textos_legales()` (anon): lo mismo con términos y
--       privacidad.
--    2. `club_intento(p_tipo, p_ip_hash, p_documento_hash, p_celular)` (servidor): anota y dice si está dentro del límite:
--       consultas ≤ 20 por ip y hora; registros ≤ 5 por ip, ≤ 3 por celular y ≤ 3 por documento, por hora.
--    3. `registrarse_en_el_club(…)` (servidor): G-3, G-4, G-5, G-10, G-12 (detalle en su PROMETE).
--    4. `fn_club_aniversario(p_clienta_id)` (Clientas): año de club, umbral en compras netas, pausa y vale.
--    5. `resumen_clienta_caja` suma `aniversario_disponible`, `aniversario_monto` y `aniversario_vence`.
--    6. `registrar_venta` suma `p_canjear_aniversario` (18 parámetros): reparte el vale en `descuento_club_unitario`, una
--       sola ventaja del club por venta.
--    7. `fn_club_avisos_pendientes(p_ubicacion_id)` (Avisos del club): cumpleaños, aniversario, rebaja y novedades.
--    8. `registrar_aviso_enviado` y `deshacer_aviso_enviado` (Avisos del club; firman con el responsable), y
--       `fn_club_avisos_enviados_hoy(p_ubicacion_id)` (ajuste del contrato: cuántos se mandaron hoy, por tipo).
--    9. `guardar_beneficios_club` (solo el líder): % , umbral, días y escala; publica una versión nueva de `terminos`.
--   10. `fn_club_anonimizar_inactivas()` (servidor, cron diario): 3 años sin compras → anonimizada, con la rutina de
--       `archivar_clienta` (`fn_clienta_anonimizar`, que ahora usan las dos).
--   11. Retiro sin borrar funciones: `unirse_al_club`, `crear_invitacion_club`, `registrar_mensaje_publicidad` y
--       `registrar_desde_whatsapp` sin EXECUTE para `authenticated`; `fn_invitacion_club` y `confirmar_invitacion_club` sin
--       EXECUTE para `anon` (ni `authenticated`, ver DECIDÍ). `registrar_baja_whatsapp` sigue, y ahora la puede usar también
--       quien tiene «Avisos del club».
--
-- EL REPARTO DEL VALE (registrar_venta, p_canjear_aniversario). Cobrar manda en cada línea su parte del vale
-- (`descuento_club_unitario`, por unidad; `descuento_unitario` sigue siendo el TOTAL) y la base la recalcula con la MISMA
-- regla que la web (`repartirVale` de apps/web/lib/club-aniversario-canje-reglas.ts); tiene que coincidir EXACTA al céntimo
-- (`aniversario_descuento_distinto`), o los pagos no sumarían lo mismo en las dos. En céntimos enteros:
--   1. n_i = precio_i − (descuento_unitario_i − descuento_club_unitario_i)  (lo que cobra la prenda sin el club; ≥ 0);
--      q_i = cantidad_i;  T = Σ n_i·q_i  (T = 0 → `aniversario_sin_monto`).
--   2. E = mín(vale, T): el vale no descuenta más que el ticket (no da vuelto).
--   3. u_i = ⌊E·n_i / T⌋ por unidad;  R = E − Σ u_i·q_i.
--   4. Mientras quede R: se recorren las líneas de mayor a menor fracción (E·n_i mod T) y, a igual fracción, en el orden
--      del ticket; cada una suma 1 céntimo por unidad si le cabe (q_i ≤ R) y no pasa su neto (u_i < n_i). Se para cuando
--      R = 0 o cuando una vuelta entera no pudo sumar nada.
--   5. la parte del club de la línea i es u_i / 100, y `club_canjes.monto` = Σ u_i·q_i / 100: lo APLICADO, no el vale.
-- Nunca pasa el neto de una línea, ni el total, ni el vale. Puede quedar unos céntimos por debajo del vale cuando el resto
-- no se puede repartir por unidades. Ejemplos (los prueba scripts/pruebas/club_aniversario.mjs, sección a):
--   vale 20, una prenda de 79.90               → 20.00                      (cobra 59.90)
--   vale 30, 79.90 y 40.10                     → 19.98 y 10.02              (fracciones iguales: la primera del ticket)
--   vale 20, 79.90 y 45.00                     → 12.79 y 7.21               (el céntimo va a la de mayor fracción)
--   vale 60, una prenda de 45.00               → la regla daría 45.00, pero la venta quedaría en S/ 0: se rechaza
--                                                 (`aniversario_cubre_todo`, ver abajo)
--   vale 20, una prenda de 10.00 × 3           → 6.66 × 3 = 19.98           (sobran 2 céntimos: no se reparten por unidad)
--   vale 50, 79.90 × 2 y 45.00 × 3             → 13.55 × 2 y 7.63 × 3 = 49.99
--
-- DECIDÍ: un vale que cubre TODA la compra (vale ≥ total) se rechaza con `aniversario_cubre_todo`. Los términos dicen que «si
--   la compra es menor que el vale, la diferencia no se conserva», pero hoy una venta en S/ 0 no se puede registrar: todo
--   pago tiene que ser mayor que cero (`venta_pagos_monto_check`) y una boleta en S/ 0 es una «transferencia gratuita» ante
--   SUNAT, que no está modelada. Queda para Felipe: o se cobra al menos S/ 0.01 (E = mín(vale, T − 0.01), y la web cambia
--   su regla igual), o se modela la venta gratuita y su comprobante (toca SUNAT/Lucode: su OK primero). Mientras tanto, la
--   caja dice por qué y nada queda a medias.
-- DECIDÍ: «año de club» n = [club_desde + (n−1) años, club_desde + n años), en fechas de Lima; el aniversario n es el día
--   club_desde + n años, y ese día ya es del año n+1. El año n CUENTA si en él hizo ≥ club_aniversario_compras compras netas o
--   sumó ≥ club_aniversario_monto. Compras netas = las de la 1f (`fn_club_compras_netas`: completadas, sin las de prueba, sin
--   las devueltas enteras); el monto de cada una resta lo devuelto en devoluciones aprobadas (`fn_club_monto_neto_venta`,
--   el mismo criterio de «aprobada» que `fn_venta_devuelta_entera`). Un año que no cuenta pausa: el vale del siguiente que
--   cuente es el de la escala según cuántos años que cuentan lleva (k), y desde el quinto se repite el del 5.
-- DECIDÍ: el vale vence el aniversario + club_aniversario_dias (inclusive: «tienes 60 días desde tu aniversario»). Solo el
--   vale del ÚLTIMO aniversario cumplido puede estar abierto (con ≤ 180 días nunca se cruzan dos).
-- DECIDÍ: `registrarse_en_el_club` con un documento ARCHIVADO (sin anonimizar) rechaza con `club_documento_archivado` y no
--   lo reactiva: archivar es una decisión de la tienda con su motivo («pidió que no la contacten», «duplicada», «prueba»), y
--   una página sin sesión no la deshace. En caja, `registrar_clienta` la reactiva con su historial (Felipe, 2026-09-27) y
--   desde ahí ella se une escaneando el cartel; es el mismo criterio de `unirse_al_club` (rechazaba `clienta_archivada`).
--   Una ANONIMIZADA no tiene documento (se borró): ese documento crea una ficha nueva, nunca reusa la anonimizada.
-- DECIDÍ: con DNI, la base exige `p_nombre_del_padron = true` (G-10: el DNI tiene que existir en el padrón; lo comprueba el
--   servidor al consultarlo). Con carné o pasaporte el nombre lo escribe ella, y sobre una ficha que ya existe NO reemplaza
--   el nombre que tenía (no hay padrón que diga que es el suyo); solo completa uno vacío.
-- DECIDÍ: si se registra con OTRO celular y la ficha tenía publicidad, primero se la quita (medio `pagina_cartel`, accion
--   revoca: la publicidad era del número de antes, ajuste d de la 1b) y después cambia el celular; si marcó la casilla, la
--   vuelve a dar para el número nuevo con el texto que aceptó. Con el mismo celular y la casilla marcada, deja un `otorga`
--   nuevo (la prueba de lo que aceptó hoy) y conserva `publicidad_desde`. Sin la casilla, no toca lo que había (G-12).
-- DECIDÍ: el permiso del club cita `terminos` (la llave foránea admite un solo texto) y su `nota` dice la versión de
--   `privacidad` que aceptó en la misma casilla: las dos versiones quedan con la hora.
-- DECIDÍ: el grupo testigo (CL-20, 1 de cada 5) es fijo por clienta y reproducible: `fn_club_es_testigo` toma los primeros
--   32 bits del md5 de su id, módulo 5. No se guarda (se calcula igual siempre) y no aplica al cumpleaños ni al aniversario.
-- DECIDÍ: el tope CL-21 (2 promocionales al mes) cuenta novedades y rebajas NO deshechas en el mes calendario de Lima; la
--   lista ofrece a cada socia a lo más lo que le queda (primero la rebaja en su talla, después las novedades) y
--   `registrar_aviso_enviado` lo vuelve a comprobar (`aviso_tope_mes`): la pantalla no puede pasarse.
-- DECIDÍ: novedades = productos con una LLEGADA a esa tienda en los últimos 14 días (`fn_es_llegada`, la de Frescura y
--   Análisis: lote, producción o recepción de un traslado) que siguen con stock libre allí, sin la carga inicial (registrar
--   lo que ya estaba no es que llegó algo) ni productos de prueba. Igual para todas las socias de la tienda; a lo más una por
--   socia cada 7 días (referencia = la semana ISO).
-- DECIDÍ: rebaja = una prenda con campaña vigente hoy (`campanas_vigentes()`, la misma que cobra la caja) con stock libre en
--   esa tienda, de una categoría y talla que ella compró: su talla deducida es la de su compra completada más reciente de esa
--   categoría (la regla de `deducirTallas`, lib/clienta-actividad-reglas.ts, sobre las mismas filas que `fn_clienta_compras`).
--   Una por socia y por campaña (referencia = etiqueta y su vigente_desde: si la campaña se vuelve a abrir, es otra).
-- DECIDÍ: `registrar_baja_whatsapp` acepta también el módulo «Avisos del club»: la BAJA tiene que poder anotarla quien
--   maneja el WhatsApp (G-7: «La BAJA se registra en su ficha y en Avisos»; Ley 29733: baja sencilla). Solo cambia esa
--   puerta; md5 «antes» 4c7d6ca5….
-- DECIDÍ: el retiro de `fn_invitacion_club` y `confirmar_invitacion_club` también le quita EXECUTE a `authenticated` (el
--   contrato nombra solo a `anon`): la página del QR personal se retira, y un enlace viejo abierto con la sesión del ERP no
--   debe poder dar la publicidad por un camino que ya no existe.
-- DECIDÍ: `archivar_clienta` se reescribe solo para llamar a `fn_clienta_anonimizar` (la rutina de anonimizar, la misma
--   que usa el cron): mismo comportamiento, mismo detalle en la actividad; md5 «antes» 5e20213a….
-- DECIDÍ: `club_intento` serializa con un candado consultivo (`pg_advisory_xact_lock`): con tres tiendas el volumen es
--   mínimo, y así dos intentos a la vez no pasan los dos el último lugar del límite.
-- DESCARTÉ: guardar la talla deducida o el grupo testigo en `clientas` (se calculan al leer, como su sede: D-103); un
--   `pct` del aniversario (es un monto, no un %); dejar que la base reparta el vale ignorando lo que manda Cobrar (los pagos
--   no cuadrarían y la boleta diría otra cosa que la pantalla); reactivar sola una ficha archivada desde el cartel (ver
--   arriba); mandar avisos sin publicidad aunque sean «promesas del club» (el acta: el saludo de cumpleaños por WhatsApp ya
--   es publicidad; sin la casilla, sus beneficios siguen en tienda).
-- SE ROMPE SI: una migración futura recrea `registrar_venta` desde un archivo viejo (su candado de versión lo impide); o
--   alguien cambia el umbral, los días o la escala con un `update` a mano (los términos dirían otra cosa: el camino es
--   `guardar_beneficios_club`); o una función nueva escribe un aviso sin pasar por `registrar_aviso_enviado` (no tendría
--   tope ni testigo). La web tiene que repartir el vale con la MISMA regla de arriba (la prueba lo compara con ejemplos).
--
-- CANDADO DE VERSIÓN. La sección 0 compara el md5 NORMALIZADO (sin comentarios ni espacios) del cuerpo vivo de lo que
-- reescribe con el de producción el 2026-10-01 («antes»: registrar_venta 2b55a94a…, resumen_clienta_caja fa690d7f…,
-- archivar_clienta 5e20213a…, registrar_baja_whatsapp 4c7d6ca5…) o con el de después de este archivo. Con cualquier otro,
-- aborta sin tocar nada. Las funciones nuevas: que no existan, o que sean las de este archivo. También aborta si falta
-- alguna de las PARTES 1 a 7.
--
-- CÓMO SE PEGA EN PRODUCCIÓN — OCHO ARCHIVOS, CADA UNO SOLO EN EL SQL EDITOR, EN ORDEN (el SQL Editor corre todo lo pegado
-- en UNA transacción):
--   1. 20261001210000_club_paso1g_parte1_clientas.sql        (solo `clientas`)
--   2. 20261001210100_club_paso1g_parte2_configuracion.sql   (solo `configuracion_empresa`)
--   3. 20261001210200_club_paso1g_parte3_canjes.sql          (solo `club_canjes`)
--   4. 20261001210300_club_paso1g_parte4_textos.sql          (solo `club_textos`, y sus textos v1)
--   5. 20261001210400_club_paso1g_parte5_permisos.sql        (solo `club_permisos`)
--   6. 20261001210500_club_paso1g_parte6_modulo_avisos.sql   (el módulo)
--   7. 20261001210600_club_paso1g_parte7_tablas.sql          (las tablas nuevas)
--   8. 20261001210700_club_paso1g_parte8_funciones.sql       (este)
--   Cada `alter` de una tabla en uso va en su parte: juntas, una venta a medio camino que ya tomó una y espera la otra se
--   trabaría con la migración (deadlock). Cada parte espera como mucho 3 s un candado (`lock_timeout`): si la tienda está
--   usando esa tabla, falla limpio y se vuelve a pegar ESA parte. Todas se pueden pegar dos veces (idempotentes). En local y
--   en el CI corren seguidas. Entre las partes, vender funciona igual (las columnas nuevas nacen con su default y la firma
--   vieja de registrar_venta sigue hasta la PARTE 8). Después de la PARTE 8, la pantalla de hoy sigue vendiendo (no manda
--   `p_canjear_aniversario`: queda en `false`). Fusionar el PR de la web DESPUÉS de pegar las ocho.
--
-- VERIFICACIÓN (solo lectura, después de pegar las ocho partes):
--   select p.oid::regprocedure, md5(regexp_replace(regexp_replace(regexp_replace(p.prosrc, '/\*.*?\*/', '', 'g'),
--          '--[^' || chr(10) || ']*', '', 'g'), '\s+', '', 'g'))
--     from pg_proc p
--    where p.pronamespace = 'retail'::regnamespace
--      and p.proname in ('registrar_venta', 'resumen_clienta_caja', 'archivar_clienta', 'registrar_baja_whatsapp',
--                        'fn_club_pagina', 'fn_club_textos_legales', 'club_intento', 'registrarse_en_el_club',
--                        'fn_club_aniversario', 'fn_club_avisos_pendientes', 'fn_club_avisos_enviados_hoy',
--                        'registrar_aviso_enviado', 'deshacer_aviso_enviado', 'guardar_beneficios_club',
--                        'fn_club_anonimizar_inactivas')
--    order by 1;
--   → exactamente 15 filas (una sola firma de registrar_venta, la de 18), cada una con su md5 «después» de la sección 0; y
--   select tipo, version from retail.club_textos where tipo in ('terminos', 'privacidad', 'casilla_publicidad', 'saludo',
--     'aviso_cumpleanos', 'aviso_aniversario', 'aviso_novedades', 'aviso_rebaja') order by 1;   → 8 filas, versión 1
--   select anio, monto from retail.club_aniversario_escala order by 1;   → 1|20.00 · 2|30.00 · 3|40.00 · 4|50.00 · 5|60.00
--   select club_aniversario_compras, club_aniversario_monto, club_aniversario_dias from retail.configuracion_empresa;
--     → 6 | 600.00 | 60
--   select clave, grupo, orden, solo_lider, delegable from retail.modulos where clave = 'avisos_club';
--     → avisos_club | Ventas | 75 | f | t      (y 0 filas en rol_modulos con ese módulo)
--   select has_function_privilege('anon', 'retail.fn_club_pagina(uuid)', 'execute'),
--          has_function_privilege('anon', 'retail.registrarse_en_el_club(uuid,text,text,text,text,date,text,boolean,boolean,boolean,jsonb,boolean)', 'execute'),
--          has_function_privilege('authenticated', 'retail.registrarse_en_el_club(uuid,text,text,text,text,date,text,boolean,boolean,boolean,jsonb,boolean)', 'execute'),
--          has_function_privilege('service_role', 'retail.registrarse_en_el_club(uuid,text,text,text,text,date,text,boolean,boolean,boolean,jsonb,boolean)', 'execute'),
--          has_function_privilege('authenticated', 'retail.unirse_al_club(uuid,text,smallint,smallint,smallint,text,uuid,uuid,integer)', 'execute'),
--          has_function_privilege('anon', 'retail.confirmar_invitacion_club(text,integer)', 'execute');
--     → t | f | f | t | f | f
--   select relname, relrowsecurity, (select count(*) from pg_policy where polrelid = c.oid) from pg_class c
--    where c.oid in ('retail.club_aniversario_escala'::regclass, 'retail.club_intentos_registro'::regclass,
--                    'retail.club_avisos_enviados'::regclass);   → las 3 con t | 0
--
-- CONCURRENCIA. Dos cajas canjean el vale de la misma socia: las dos toman su ficha `for no key update` en la lectura de la
-- D-1 (como el cumpleaños); la segunda espera y, cuando la primera confirma, ve su canje y se rechaza con
-- `aniversario_ya_canjeado` (y si igual llegara a insertar, el único parcial lo impide y se traduce al mismo hint). Dos
-- registros del mismo documento a la vez desde el cartel: el primero crea la ficha; el segundo espera en el alta (el único
-- por tipo y número), la encuentra creada y sigue como «ya era socia». Dos «Enviar» del mismo aviso: el único parcial
-- (clienta, tipo, referencia) vivo deja uno y el segundo recibe el mismo id; el tope del mes se cuenta con un candado
-- consultivo por clienta. El cron toma cada ficha `for update skip locked`: una ficha que alguien está usando se queda para
-- mañana.
-- CAÍDA EXTERNA. Nada de esto llama a WhatsApp, al padrón ni a Lucode: el padrón lo consulta el servidor ANTES de llamar a
-- `registrarse_en_el_club` (si no responde, la página dice «acércate a caja» y no se guarda nada); el envío por WhatsApp
-- Web lo hace la encargada y la base solo lo anota.
-- ============================================================================

-- ============================== PARTE 8 · las funciones ==============================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 0. las PARTES 1 a 7 tienen que estar, y candado de versión ----------
do $guarda$
declare
  r record;
  v_md5 text;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'retail' and table_name = 'clientas' and column_name = 'club_ubicacion_id') then
    raise exception 'Falta la PARTE 1 de esta tanda (clientas.club_ubicacion_id): pega antes 20261001210000.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'retail' and table_name = 'configuracion_empresa' and column_name = 'club_aniversario_dias') then
    raise exception 'Falta la PARTE 2 de esta tanda (configuracion_empresa.club_aniversario_dias): pega antes 20261001210100.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'retail' and table_name = 'club_canjes' and column_name = 'anio_club') then
    raise exception 'Falta la PARTE 3 de esta tanda (club_canjes.anio_club): pega antes 20261001210200.';
  end if;
  if not exists (select 1 from retail.club_textos where tipo = 'terminos') then
    raise exception 'Falta la PARTE 4 de esta tanda (los textos del club): pega antes 20261001210300.';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'club_permisos_pagina_cartel_lo_registra_ella') then
    raise exception 'Falta la PARTE 5 de esta tanda (el medio pagina_cartel): pega antes 20261001210400.';
  end if;
  if not exists (select 1 from retail.modulos where clave = 'avisos_club') then
    raise exception 'Falta la PARTE 6 de esta tanda (el módulo avisos_club): pega antes 20261001210500.';
  end if;
  if to_regclass('retail.club_avisos_enviados') is null or to_regclass('retail.club_intentos_registro') is null
     or to_regclass('retail.club_aniversario_escala') is null then
    raise exception 'Falta la PARTE 7 de esta tanda (las tablas nuevas): pega antes 20261001210600.';
  end if;
  for r in
    select * from (values
      -- firma                                                                                                                        antes (producción 2026-10-01)        despues (este archivo)
      ('retail.registrar_venta(uuid,jsonb,jsonb,uuid,uuid,text,text,text,text,text,text,uuid,text,numeric,uuid,text,boolean)',         '2b55a94a754e7708f5b133008f30469f',  null),
      ('retail.registrar_venta(uuid,jsonb,jsonb,uuid,uuid,text,text,text,text,text,text,uuid,text,numeric,uuid,text,boolean,boolean)', null,                                '156fd99a4b558670029ab73e04f7ceb1'),
      ('retail.resumen_clienta_caja(uuid)',                                                                                            'fa690d7f1a5e1fa2412f9be78cb784a6',  '391f37d6941dc03cde25804c9d277834'),
      ('retail.archivar_clienta(uuid,text,boolean,integer)',                                                                           '5e20213a48c0b617ea92f7394d40eec9',  '73cb792a340c57f7239106bd21feccfe'),
      ('retail.registrar_baja_whatsapp(text,uuid)',                                                                                    '4c7d6ca5bac17c826b129f1f4764a0f5',  'a3026ba7024de52985cee3336522f0ba'),
      ('retail.fn_club_beneficios()',                                                                                                  null,                                'e1d027bb44232d5e6c94f4c67804ddf5'),
      ('retail.fn_club_nombre_de_pila(text)',                                                                                          null,                                '0c4da098feb20e976b64d48c58f86c80'),
      ('retail.fn_club_es_testigo(uuid)',                                                                                              null,                                'fb9ee7764849903b615b47197661ad53'),
      ('retail.fn_club_soles_texto(numeric)',                                                                                          null,                                '3efa7a8adbb250b894ad0b9c7fd4f334'),
      ('retail.fn_club_fecha_texto(date)',                                                                                             null,                                '35016f9e8221269f5fb0f091209aaccc'),
      ('retail.fn_club_monto_neto_venta(uuid)',                                                                                        null,                                'bd412f05c8d3509ee7f83d1c3ab0ad72'),
      ('retail.fn_club_aniversario_calculo(uuid)',                                                                                     null,                                '72c2a6cb88b99cb3ce8da04650252b01'),
      ('retail.fn_clienta_anonimizar(uuid,uuid,boolean)',                                                                              null,                                'f6a34ec2c9175faf4224999a3e89dde6'),
      ('retail.fn_club_ofrece_json(text[])',                                                                                           null,                                '75bf19f91e5c8a9bbaa04288dea6ab72'),
      ('retail.fn_club_pagina(uuid)',                                                                                                  null,                                '70a5d6e3d9970d33d9ffded02e3dcd61'),
      ('retail.fn_club_textos_legales()',                                                                                              null,                                'dc3dd4f092fbfa464241d93743bc8b5a'),
      ('retail.club_intento(text,text,text,text)',                                                                                     null,                                '9009590c9d0aeb380974301b8987a2e7'),
      ('retail.registrarse_en_el_club(uuid,text,text,text,text,date,text,boolean,boolean,boolean,jsonb,boolean)',                      null,                                '757afd3b843156eb2ba87524ce5966a4'),
      ('retail.fn_club_aniversario(uuid)',                                                                                             null,                                '282471f877ab4a15ec46dacee4b9a785'),
      ('retail.fn_club_avisos_pendientes(uuid)',                                                                                       null,                                '1a56c3845ec6a58c36bce194b3480800'),
      ('retail.fn_club_avisos_enviados_hoy(uuid)',                                                                                     null,                                'fce281b11b652b44e85138b1b0132704'),
      ('retail.registrar_aviso_enviado(uuid,text,text,text,uuid)',                                                                     null,                                'af6c2e295e28d9f924cea52ea7dbfa49'),
      ('retail.deshacer_aviso_enviado(uuid)',                                                                                          null,                                'a15339b79133df9ce23c7091b9751bbf'),
      ('retail.guardar_beneficios_club(numeric,integer,numeric,integer,jsonb)',                                                        null,                                'ec8403e9e7ec52a7553931f3811e4274'),
      ('retail.fn_club_anonimizar_inactivas()',                                                                                        null,                                'bb5b5e43cf86a237ed2f88fcb0c46df8')
    ) as t(firma, antes, despues)
  loop
    select md5(regexp_replace(regexp_replace(regexp_replace(p.prosrc, '/\*.*?\*/', '', 'g'), '--[^' || chr(10) || ']*', '', 'g'), '\s+', '', 'g'))
      into v_md5
      from pg_proc p
     where p.oid = to_regprocedure(r.firma);
    if v_md5 is null then
      -- Que no exista es «después» para la firma vieja de registrar_venta (este archivo la suelta) y «antes» para lo nuevo.
      if r.antes is not null and r.despues is not null then
        raise exception '% no existe en esta base: pega antes la tanda 1c del club (20260930230200).', r.firma;
      end if;
    elsif v_md5 is distinct from r.antes and v_md5 is distinct from r.despues then
      raise exception '% cambió desde que se escribió esta migración (md5 normalizado %; se esperaba % —antes— o % —después—). No se reemplaza a ciegas: lee su definición viva y rehace este cambio sobre ESA versión.',
        r.firma, v_md5, coalesce(r.antes, 'que no exista'), coalesce(r.despues, 'que ya no exista');
    end if;
  end loop;
end
$guarda$;

-- ---------- 1. ayudantes (internos: sin EXECUTE para la API) ----------
-- PROMETE: el % del cumpleaños y el umbral, los días del aniversario, con los defaults si no hay fila de configuración.
create or replace function retail.fn_club_beneficios()
returns table (pct numeric, compras integer, monto numeric, dias integer)
language sql
stable
set search_path = retail, public, extensions
as $$
  select coalesce(max(e.club_cumple_pct), 10.00), coalesce(max(e.club_aniversario_compras), 6),
         coalesce(max(e.club_aniversario_monto), 600.00), coalesce(max(e.club_aniversario_dias), 60)
    from retail.configuracion_empresa e;
$$;

-- PROMETE: su nombre de pila, como lo dice la página del QR desde la 1b: la primera palabra y, si viene toda en mayúsculas
--   (del padrón), con mayúscula inicial. Null si no hay nombre.
create or replace function retail.fn_club_nombre_de_pila(p_nombre text)
returns text
language plpgsql
immutable
set search_path = retail, public, extensions
as $$
declare
  v_pila text := (regexp_split_to_array(btrim(coalesce(p_nombre, '')), '\s+'))[1];
begin
  if v_pila is null or v_pila = '' then
    return null;
  end if;
  if v_pila = upper(v_pila) then
    v_pila := initcap(lower(v_pila));
  end if;
  return v_pila;
end;
$$;

-- PROMETE (CL-20): si la clienta es del grupo testigo (1 de cada 5): fijo para ella y reproducible, sin guardarse.
create or replace function retail.fn_club_es_testigo(p_clienta_id uuid)
returns boolean
language sql
immutable
set search_path = retail, public, extensions
as $$
  select ('x' || substr(md5(p_clienta_id::text), 1, 8))::bit(32)::bigint % 5 = 0;
$$;

-- PROMETE: soles para un texto: «20» si es entero, «20.50» si no.
create or replace function retail.fn_club_soles_texto(p_monto numeric)
returns text
language sql
immutable
set search_path = retail, public, extensions
as $$
  select case when p_monto is null then null
              when p_monto = trunc(p_monto) then trunc(p_monto)::text
              else to_char(p_monto, 'FM999999990.00') end;
$$;

-- PROMETE: una fecha para un texto: «30 de noviembre».
create or replace function retail.fn_club_fecha_texto(p_fecha date)
returns text
language sql
immutable
set search_path = retail, public, extensions
as $$
  select extract(day from p_fecha)::int || ' de ' ||
         (array['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre',
                'noviembre', 'diciembre'])[extract(month from p_fecha)::int];
$$;

-- PROMETE (G-13, «compras netas»): lo que de verdad pagó en una venta: Σ (precio − descuento) × (cantidad − lo devuelto en
--   devoluciones APROBADAS). El mismo criterio de «aprobada» que fn_venta_devuelta_entera (1f). Un cambio no resta.
create or replace function retail.fn_club_monto_neto_venta(p_venta_id uuid)
returns numeric
language sql
stable
set search_path = retail, public, extensions
as $$
  select coalesce(sum((vi.precio_unitario - vi.descuento_unitario) * greatest(vi.cantidad - coalesce(d.devuelto, 0), 0)), 0)
    from retail.venta_items vi
    left join lateral (
      select sum(di.cantidad) as devuelto
        from retail.devolucion_items di
        join retail.devoluciones dv on dv.id = di.devolucion_id
       where di.venta_item_id = vi.id and dv.estado = 'aprobada'
    ) d on true
   where vi.venta_id = p_venta_id;
$$;

-- PROMETE (G-9, G-13): el aniversario de una socia, calculado al leer. Una fila si la ficha existe (ninguna si no):
--   · año de club n = [club_desde + (n−1) años, club_desde + n años) en fechas de Lima; el día del aniversario ya es del
--     año siguiente;
--   · un año CUENTA con ≥ compras netas o ≥ monto neto del umbral (configuracion_empresa); los años cumplidos que cuentan
--     son `anios_que_cuentan`; el año en curso, sus compras, su monto y si ya cuenta;
--   · el vale: el del ÚLTIMO aniversario cumplido, si ese año contó: la escala según cuántos años que cuentan lleva (desde
--     el 5, el del 5), vence aniversario + días, canjeado si tiene un canje vivo de ese año de club; disponible si es socia
--     viva, no lo canjeó, no venció y hay monto.
--   Sin club: ceros y nulos. Interno: lo leen fn_club_aniversario, resumen_clienta_caja, registrar_venta y los avisos.
create or replace function retail.fn_club_aniversario_calculo(p_clienta_id uuid)
returns table (
  es_socia_activa boolean,
  anios_que_cuentan integer,
  anio_en_curso_cuenta boolean,
  compras_anio integer,
  monto_anio numeric,
  proximo_aniversario date,
  vale_anio_club smallint,
  vale_aniversario date,
  vale_disponible boolean,
  vale_monto numeric,
  vale_vence date,
  vale_canjeado_el date
)
language plpgsql
stable
set search_path = retail, public, extensions
as $$
declare
  v_hoy date := retail.fn_hoy_lima();
  v_existe boolean := false;
  v_desde date;
  v_desde_ts timestamptz;
  v_activa boolean;
  v_min_compras integer;
  v_min_monto numeric;
  v_dias integer;
  v_cumplidos integer := 0;
  r record;
  v_cuentan integer := 0;
  v_ult_n integer;
  v_ult_fin date;
  v_ult_cuenta boolean := false;
  v_cur_compras integer := 0;
  v_cur_monto numeric := 0;
  v_cur_fin date;
  v_monto numeric;
  v_vence date;
  v_canje date;
begin
  for v_existe, v_desde_ts, v_activa in
    select true, c.club_desde,
           c.club_desde is not null and not c.anonimizada and c.archivada_en is null and c.fusionada_en_id is null
      from retail.clientas c where c.id = p_clienta_id
  loop
    exit;
  end loop;
  -- Sin fila, el `for` deja las variables en nulo (no en su valor inicial): `is not true`, no `not`.
  if v_existe is not true then
    return;
  end if;
  if v_desde_ts is null then
    return query select false, 0, false, 0, 0::numeric, null::date, null::smallint, null::date, false, null::numeric,
                        null::date, null::date;
    return;
  end if;
  v_desde := (v_desde_ts at time zone 'America/Lima')::date;
  select b.compras, b.monto, b.dias into v_min_compras, v_min_monto, v_dias from retail.fn_club_beneficios() b;

  -- Cuántos aniversarios ya cumplió (cada uno contado desde su club_desde: el 29 de febrero cae el 28 en un año normal).
  while (v_desde + make_interval(years => v_cumplidos + 1))::date <= v_hoy loop
    v_cumplidos := v_cumplidos + 1;
  end loop;

  for r in
    with anios as (
      select g.n, (v_desde + make_interval(years => g.n - 1))::date as ini, (v_desde + make_interval(years => g.n))::date as fin
        from generate_series(1, v_cumplidos + 1) as g(n)
    ),
    netas as (
      select x.venta_id, (x.fecha at time zone 'America/Lima')::date as dia, retail.fn_club_monto_neto_venta(x.venta_id) as neto
        from retail.fn_club_compras_netas(p_clienta_id) x
       where x.fecha >= v_desde::timestamp at time zone 'America/Lima'
    )
    select a.n, a.ini, a.fin, count(t.venta_id)::integer as q_compras, coalesce(sum(t.neto), 0) as q_monto
      from anios a
      left join netas t on t.dia >= a.ini and t.dia < a.fin
     group by a.n, a.ini, a.fin
     order by a.n
  loop
    if r.fin <= v_hoy then
      v_ult_n := r.n;
      v_ult_fin := r.fin;
      v_ult_cuenta := r.q_compras >= v_min_compras or r.q_monto >= v_min_monto;
      if v_ult_cuenta then
        v_cuentan := v_cuentan + 1;
      end if;
    else
      v_cur_compras := r.q_compras;
      v_cur_monto := r.q_monto;
      v_cur_fin := r.fin;
    end if;
  end loop;

  if v_ult_n is not null and v_ult_cuenta then
    v_monto := (select s.monto from retail.club_aniversario_escala s where s.anio <= least(v_cuentan, 5)
                 order by s.anio desc limit 1);
    v_vence := v_ult_fin + v_dias;
    v_canje := (select (k.created_at at time zone 'America/Lima')::date from retail.club_canjes k
                 where k.clienta_id = p_clienta_id and k.tipo = 'aniversario' and k.anio_club = v_ult_n and k.anulado_en is null
                 limit 1);
  end if;

  return query select
    v_activa, v_cuentan, (v_cur_compras >= v_min_compras or v_cur_monto >= v_min_monto), v_cur_compras, v_cur_monto, v_cur_fin,
    case when v_ult_cuenta then v_ult_n::smallint end, case when v_ult_cuenta then v_ult_fin end,
    coalesce(v_activa and v_ult_cuenta and v_monto is not null and v_hoy <= v_vence and v_canje is null, false),
    v_monto, v_vence, v_canje;
end;
$$;

-- PROMETE (G-15 y Ley 29733): anonimiza una ficha que quien llama YA tomó (`for update`): primero la historia registra que
--   se fue (un `revoca` por cada permiso vigente, medio `anonimizar`, con quien lo hace o, si lo hace el sistema, con su
--   nota), después vacía todo dato personal y el club, vence sus invitaciones sin usar, limpia las fotos de sus fusiones y
--   anota la actividad sin datos suyos. Los disparadores de `clientas` vacían su correo, su tienda del club, sus
--   preferencias y el teléfono y el texto de sus avisos. La usan archivar_clienta (una persona, `p_automatica = false`) y
--   fn_club_anonimizar_inactivas (el cron, sin persona). Devuelve cuántos permisos revocó.
create or replace function retail.fn_clienta_anonimizar(p_id uuid, p_persona uuid, p_automatica boolean)
returns integer
language plpgsql
volatile
set search_path = retail, public, extensions
as $$
declare
  v_club_desde timestamptz;
  v_publicidad_desde timestamptz;
  v_nota text := case when p_automatica then 'conservación: 3 años sin compras (ADR-0288 G-15)' end;
  v_revocados integer := 0;
  v_fusiones integer := 0;
begin
  select c.club_desde, c.publicidad_desde into v_club_desde, v_publicidad_desde from retail.clientas c where c.id = p_id;
  if not found then
    raise exception 'Esa clienta ya no existe — actualiza la pantalla.';
  end if;
  if (v_club_desde is not null or v_publicidad_desde is not null) and p_persona is null and not p_automatica then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;

  if v_publicidad_desde is not null then
    insert into retail.club_permisos (clienta_id, finalidad, accion, medio, registrado_por, nota)
    values (p_id, 'publicidad_whatsapp', 'revoca', 'anonimizar', p_persona, v_nota);
    v_revocados := v_revocados + 1;
  end if;
  if v_club_desde is not null then
    insert into retail.club_permisos (clienta_id, finalidad, accion, medio, registrado_por, nota)
    values (p_id, 'club', 'revoca', 'anonimizar', p_persona, v_nota);
    v_revocados := v_revocados + 1;
  end if;

  update retail.clientas set
    archivada_por = case when archivada_en is null then p_persona else archivada_por end,
    archivada_en = coalesce(archivada_en, now()),
    -- El motivo escrito no se guarda: puede nombrar a la clienta (Ley 29733, Felipe 2026-09-27).
    motivo_archivo = case when p_automatica then 'Anonimizada: 3 años sin compras (Ley 29733)' else 'Anonimizada (Ley 29733)' end,
    anonimizada = true,
    documento_numero = null,
    nombre = 'Clienta anonimizada',
    telefono_whatsapp = null,
    whatsapp_consentimiento_en = null,
    cumple_dia = null,
    cumple_mes = null,
    cumple_anio = null,
    tallas = null,
    club_desde = null,
    publicidad_desde = null,
    codigo_club = null
  where id = p_id;

  -- Sus invitaciones sin usar (camino B, retirado) vencen ahora: el enlace muere. Nada se borra.
  update retail.club_invitaciones i set vence_en = now()
   where i.clienta_id = p_id and i.usada_en is null and i.vence_en > now();

  -- La foto que unir_clientas guardó de cada ficha que se le unió a ésta, o a una que se le unió (son la misma persona),
  -- pierde todo dato personal: queda solo cuándo se anonimizó. Se mira el lado que sea de cada fusión.
  with recursive arbol (id) as (
    select p_id
    union
    select c.id from retail.clientas c join arbol a on c.fusionada_en_id = a.id
  )
  update retail.clientas_fusiones f
     set ficha_fusionada = jsonb_build_object('anonimizada_en', now())
   where f.clienta_mantiene_id in (select id from arbol)
      or f.clienta_fusionada_id in (select id from arbol);
  get diagnostics v_fusiones = row_count;

  -- Sin nombre, DNI ni el motivo escrito: quién es queda en registro_id (ADR-0249, 2026-09-28).
  perform retail.fn_actividad_anotar(
    'clientas', 'anonimizar',
    case when p_automatica then 'anonimizó la ficha de una clienta: 3 años sin compras (conservación, Ley 29733)'
         else 'anonimizó la ficha de una clienta (Ley 29733)' end,
    p_persona, null, null, null, 'clientas', p_id::text, now(),
    jsonb_build_object('anonimizada', true, 'fusiones_limpiadas', v_fusiones, 'permisos_revocados', v_revocados,
                       'automatica', case when p_automatica then true end),
    'vivo'
  );
  return v_revocados;
end;
$$;

revoke all on function
  retail.fn_club_beneficios(),
  retail.fn_club_nombre_de_pila(text),
  retail.fn_club_es_testigo(uuid),
  retail.fn_club_soles_texto(numeric),
  retail.fn_club_fecha_texto(date),
  retail.fn_club_monto_neto_venta(uuid),
  retail.fn_club_aniversario_calculo(uuid),
  retail.fn_clienta_anonimizar(uuid, uuid, boolean)
from public, anon, authenticated;

-- ---------- 2. archivar_clienta: la misma, con la rutina de anonimizar en un solo lugar ----------
-- Sobre su definición viva (la de la 1b, md5 5e20213a…). Cambia SOLO que anonimizar llama a fn_clienta_anonimizar.
create or replace function retail.archivar_clienta(p_id uuid, p_motivo text, p_anonimizar boolean default false, p_version_esperada integer default null)
returns integer
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_persona uuid;
  v_actual record;
  v_motivo text := nullif(btrim(p_motivo), '');
begin
  perform retail.fn_exigir_modulo('clientas');
  v_persona := retail.fn_actor_persona_id(true);

  if v_motivo is null then
    raise exception 'Escribe un motivo antes de archivar a esta clienta.';
  end if;

  -- `for update` desde la primera lectura: los `revoca` salen de lo que la ficha tiene AHORA, y nadie la une al club en el
  -- medio.
  select * into v_actual from retail.clientas where id = p_id for update;
  if v_actual.id is null then
    raise exception 'Esa clienta ya no existe — actualiza la pantalla.';
  end if;
  if v_actual.archivada_en is not null then
    raise exception 'Esta ficha ya está archivada.';
  end if;

  if p_version_esperada is not null and v_actual.version <> p_version_esperada then
    raise exception 'Alguien más cambió esta ficha mientras la mirabas. Recarga para ver sus cambios.'
      using errcode = 'PT409', hint = 'version_cambiada';
  end if;

  if p_anonimizar then
    -- ADR-0288 G-15: la misma rutina que el cron de conservación (revoca, vacía, vence invitaciones, limpia fusiones y
    -- anota la actividad). Con permisos del club, exige quién lo hace (responsable_requerido).
    perform retail.fn_clienta_anonimizar(p_id, v_persona, false);
  else
    update retail.clientas set
      archivada_en = now(),
      archivada_por = v_persona,
      motivo_archivo = v_motivo
    where id = p_id;

    -- ADR-0288 (camino B): una ficha archivada no confirma nada desde un QR que le mostraron antes. Sus invitaciones sin
    -- usar vencen ahora. Nada se borra.
    update retail.club_invitaciones i set vence_en = now()
     where i.clienta_id = p_id and i.usada_en is null and i.vence_en > now();

    perform retail.fn_actividad_anotar(
      'clientas', 'archivar', 'archivó la ficha de una clienta',
      v_persona, null, null, null, 'clientas', p_id::text, now(),
      jsonb_build_object('anonimizada', false), 'vivo'
    );
  end if;

  return (select version from retail.clientas where id = p_id);
end;
$$;

-- ---------- 3. fn_club_pagina y fn_club_textos_legales: la página del cartel y sus textos (anon) ----------
-- PROMETE (interno): lo que el club ofrece hoy, igual para toda tienda: el % del cumpleaños, la escala del vale, el umbral
--   y los días; y los textos vigentes pedidos, cada uno {version, texto, vigente_desde} (vigente_desde = el día de Lima en
--   que se publicó esa versión).
create or replace function retail.fn_club_ofrece_json(p_tipos text[])
returns jsonb
language sql
stable
set search_path = retail, public, extensions
as $$
  select jsonb_build_object(
    'pct', b.pct,
    'escala', coalesce((select jsonb_agg(jsonb_build_object('anio', s.anio, 'monto', s.monto) order by s.anio)
                          from retail.club_aniversario_escala s), '[]'::jsonb),
    'compras', b.compras,
    'monto_minimo', b.monto,
    'dias', b.dias,
    'textos', coalesce((select jsonb_object_agg(t.tipo, jsonb_build_object(
                                 'version', t.version, 'texto', t.texto,
                                 'vigente_desde', (t.vigente_desde at time zone 'America/Lima')::date))
                          from (select distinct on (x.tipo) x.tipo, x.version, x.texto, x.vigente_desde
                                  from retail.club_textos x
                                 where x.tipo = any (p_tipos)
                                 order by x.tipo, x.version desc) t), '{}'::jsonb))
    from retail.fn_club_beneficios() b;
$$;
revoke all on function retail.fn_club_ofrece_json(text[]) from public, anon, authenticated;

-- PROMETE: lo que la página pública del cartel muestra de una tienda, sin datos de ninguna clienta: su nombre, su WhatsApp
--   (puede ser nulo: sin él la página no ofrece el saludo), el % del cumpleaños, la escala del vale, el umbral, los días y
--   los cuatro textos vigentes (términos, privacidad, casilla de publicidad y saludo) con su versión y su fecha. `null` si
--   no es una tienda activa (un QR viejo o inventado).
create or replace function retail.fn_club_pagina(p_ubicacion_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_tienda text;
  v_whatsapp text;
begin
  select u.nombre, u.whatsapp_numero into v_tienda, v_whatsapp
    from retail.ubicaciones u
   where u.id = p_ubicacion_id and u.tipo = 'tienda' and u.activo;
  if v_tienda is null then
    return null;
  end if;
  return jsonb_build_object('tienda', v_tienda, 'whatsapp', v_whatsapp)
      || retail.fn_club_ofrece_json(array['terminos', 'privacidad', 'casilla_publicidad', 'saludo']);
end;
$$;

comment on function retail.fn_club_pagina(uuid) is
  'La página pública del cartel (ADR-0288 act. g, G-3): {tienda, whatsapp, pct, escala:[{anio, monto}], compras, monto_minimo, dias, textos:{terminos, privacidad, casilla_publicidad, saludo: {version, texto, vigente_desde}}}. null si no es una tienda activa. Sin datos de ninguna clienta. Para anon y authenticated. Lectura (prefijo fn_).';

-- PROMETE: lo mismo que fn_club_pagina sin la tienda, para /club/privacidad y /club/terminos (no dependen de un cartel):
--   {pct, escala, compras, monto_minimo, dias, textos:{terminos, privacidad: {version, texto, vigente_desde}}}.
create or replace function retail.fn_club_textos_legales()
returns jsonb
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select retail.fn_club_ofrece_json(array['terminos', 'privacidad']);
$$;

comment on function retail.fn_club_textos_legales() is
  'Los textos legales vigentes del club (ADR-0288 G-11) para /club/privacidad y /club/terminos: {pct, escala, compras, monto_minimo, dias, textos:{terminos, privacidad: {version, texto, vigente_desde}}}. Sin tienda ni datos de ninguna clienta. Para anon y authenticated. Lectura (prefijo fn_).';

-- ---------- 4. club_intento: el freno contra el abuso del cartel (servidor) ----------
-- PROMETE (G-10): anota el intento y dice si está dentro del límite de la última hora, contándolo: consulta (buscar un DNI
--   en el padrón) ≤ 20 por ip; registro ≤ 5 por ip, ≤ 3 por celular y ≤ 3 por documento. La ip y el documento llegan como
--   huellas (las calcula el servidor con su sal); el celular, como lo escribió (se guarda normalizado; uno que no es un
--   celular no se guarda, y la página igual lo rechaza). Uno a la vez (candado consultivo). Solo el servidor.
create or replace function retail.club_intento(p_tipo text, p_ip_hash text, p_documento_hash text default null, p_celular text default null)
returns boolean
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_ip text := nullif(btrim(coalesce(p_ip_hash, '')), '');
  v_documento text := nullif(btrim(coalesce(p_documento_hash, '')), '');
  v_celular text := retail.fn_celular_normalizado(p_celular);
begin
  if p_tipo is null or p_tipo not in ('consulta', 'registro') or v_ip is null then
    raise exception 'Intento sin tipo o sin ip.' using errcode = '22023', hint = 'club_datos_invalidos';
  end if;
  if v_celular is not null and v_celular !~ '^[0-9]{9}$' then
    v_celular := null;
  end if;
  perform pg_advisory_xact_lock(hashtext('retail.club_intento'));
  insert into retail.club_intentos_registro (tipo, ip_hash, documento_hash, celular)
  values (p_tipo, v_ip, v_documento, v_celular);

  if p_tipo = 'consulta' then
    return (select count(*) from retail.club_intentos_registro i
             where i.tipo = 'consulta' and i.ip_hash = v_ip and i.creado_en > now() - interval '1 hour') <= 20;
  end if;
  return (select count(*) from retail.club_intentos_registro i
           where i.tipo = 'registro' and i.ip_hash = v_ip and i.creado_en > now() - interval '1 hour') <= 5
     and (v_celular is null
          or (select count(*) from retail.club_intentos_registro i
               where i.tipo = 'registro' and i.celular = v_celular and i.creado_en > now() - interval '1 hour') <= 3)
     and (v_documento is null
          or (select count(*) from retail.club_intentos_registro i
               where i.tipo = 'registro' and i.documento_hash = v_documento and i.creado_en > now() - interval '1 hour') <= 3);
end;
$$;

comment on function retail.club_intento(text, text, text, text) is
  'El freno del cartel (ADR-0288 G-10): anota el intento y devuelve true si está dentro del límite de la última hora (consulta ≤ 20 por ip; registro ≤ 5 por ip, ≤ 3 por celular, ≤ 3 por documento). Solo el servidor (llave de servicio).';

-- ---------- 5. registrarse_en_el_club: ella se une sola desde el cartel (servidor) ----------
-- PROMETE (G-3, G-4, G-5, G-10, G-12): con la tienda del cartel, su documento, nombre (del padrón si es DNI), celular,
--   fecha de nacimiento completa, correo opcional, las dos casillas obligatorias y la de publicidad, y las versiones de los
--   textos que leyó:
--   · rechaza sin guardar nada: datos inválidos (`club_datos_invalidos`, con el campo en `detail`: tienda, terminos,
--     mayor_de_edad, documento, nombre, celular, nacimiento, correo, versiones), menor de 18 a la fecha de Lima
--     (`club_menor`), textos que ya no son los vigentes (`club_texto_cambio`) y un documento de una ficha archivada
--     (`club_documento_archivado`). Ningún mensaje dice nada de la ficha de nadie;
--   · documento nuevo → crea la ficha completa (`registro_origen = 'cartel'`, sin `created_por`) y le liga sus compras
--     anteriores con ese documento (CL-27, como la caja);
--   · documento que existe → reemplaza celular, fecha de nacimiento y correo (un correo vacío no borra el que había) y el
--     nombre si viene del padrón; conserva `club_desde` y `codigo_club` (G-4);
--   · la deja socia (si no lo era: desde ahora y con código nuevo), con `club_ubicacion_id` = esta tienda, y el permiso del
--     club por `pagina_cartel` citando los términos que aceptó (la nota dice la versión de la privacidad);
--   · casilla de publicidad marcada → otorga por `pagina_cartel` citando la casilla (después de cambiar el celular, que antes
--     le quita la de un número anterior); sin marcar → no toca un permiso anterior.
--   Devuelve su id, su código, desde cuándo es socia, si ya lo era y su nombre de pila. Solo el servidor (sin sesión: no hay
--   auth.uid() ni responsable; los eventos van sin persona y la actividad, también).
create or replace function retail.registrarse_en_el_club(
  p_ubicacion_id uuid,
  p_documento_tipo text,
  p_documento_numero text,
  p_nombre text,
  p_telefono text,
  p_nacimiento date,
  p_correo text,
  p_mayor_de_edad boolean,
  p_acepta_terminos boolean,
  p_acepta_publicidad boolean,
  p_versiones jsonb,
  p_nombre_del_padron boolean
)
returns table (clienta_id uuid, codigo_club text, club_desde timestamptz, era_socia boolean, nombre_corto text)
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
#variable_conflict use_column
declare
  v_hoy date := retail.fn_hoy_lima();
  v_ahora timestamptz := now();
  v_tipo text := lower(btrim(coalesce(p_documento_tipo, '')));
  v_numero text;
  v_nombre text := nullif(regexp_replace(btrim(coalesce(p_nombre, '')), '\s+', ' ', 'g'), '');
  v_del_padron boolean := coalesce(p_nombre_del_padron, false);
  v_publicidad boolean := coalesce(p_acepta_publicidad, false);
  v_celular text;
  v_correo text := nullif(lower(btrim(coalesce(p_correo, ''))), '');
  v_terminos integer;
  v_privacidad integer;
  v_casilla integer;
  v_saludo integer;
  v_lee_terminos integer;
  v_lee_privacidad integer;
  v_lee_casilla integer;
  v_lee_saludo integer;
  v_id uuid;
  v_nueva boolean := false;
  v_archivada boolean;
  v_club_desde timestamptz;
  v_publicidad_desde timestamptz;
  v_codigo text;
  v_telefono text;
  v_nombre_actual text;
  v_nombre_final text;
  v_era_socia boolean;
  v_ligadas integer := 0;
  v_quito_publicidad boolean := false;
begin
  -- 1. La tienda del cartel.
  if p_ubicacion_id is null
     or not exists (select 1 from retail.ubicaciones u where u.id = p_ubicacion_id and u.tipo = 'tienda' and u.activo) then
    raise exception 'Este cartel no es de una tienda CAYLA.' using errcode = '22023', hint = 'club_datos_invalidos', detail = 'tienda';
  end if;

  -- 2. Las dos casillas obligatorias.
  if not coalesce(p_acepta_terminos, false) then
    raise exception 'Para unirte, acepta la Política de privacidad y los Términos del Club CAYLA.'
      using errcode = '22023', hint = 'club_datos_invalidos', detail = 'terminos';
  end if;
  if not coalesce(p_mayor_de_edad, false) then
    raise exception 'Confirma que eres mayor de 18 años.' using errcode = '22023', hint = 'club_datos_invalidos', detail = 'mayor_de_edad';
  end if;

  -- 3. El documento (y, con DNI, el nombre del padrón: G-10).
  begin
    v_numero := retail.fn_documento_clienta(v_tipo, p_documento_numero);
  exception when sqlstate '22023' then
    raise exception 'Revisa el tipo y el número de tu documento.' using errcode = '22023', hint = 'club_datos_invalidos', detail = 'documento';
  end;
  if v_numero is null then
    raise exception 'Escribe el número de tu documento.' using errcode = '22023', hint = 'club_datos_invalidos', detail = 'documento';
  end if;
  if v_tipo = 'dni' and (not v_del_padron or v_nombre is null) then
    raise exception 'No encontramos ese DNI. Revisa el número; si es correcto, acércate a caja y te ayudamos.'
      using errcode = '22023', hint = 'club_datos_invalidos', detail = 'documento';
  end if;
  if v_nombre is not null and char_length(v_nombre) > 200 then
    raise exception 'El nombre es demasiado largo.' using errcode = '22023', hint = 'club_datos_invalidos', detail = 'nombre';
  end if;

  -- 4. El celular (9 dígitos que empiezan en 9; se guarda normalizado).
  begin
    v_celular := retail.fn_exigir_celular(p_telefono);
  exception when sqlstate '22023' then
    raise exception 'El celular tiene 9 dígitos y empieza en 9.' using errcode = '22023', hint = 'club_datos_invalidos', detail = 'celular';
  end;

  -- 5. La fecha de nacimiento completa, real, y 18 años cumplidos a la fecha de Lima (la casilla, además, lo comprueba aquí).
  if p_nacimiento is null or p_nacimiento > v_hoy or p_nacimiento < date '1900-01-01' then
    raise exception 'Revisa tu fecha de nacimiento.' using errcode = '22023', hint = 'club_datos_invalidos', detail = 'nacimiento';
  end if;
  if (p_nacimiento + interval '18 years')::date > v_hoy then
    raise exception 'El Club CAYLA es para mayores de 18 años.' using errcode = '22023', hint = 'club_menor';
  end if;

  -- 6. El correo, opcional (formato básico).
  if v_correo is not null
     and (char_length(v_correo) > 254 or v_correo !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
    raise exception 'Revisa tu correo, o déjalo vacío.' using errcode = '22023', hint = 'club_datos_invalidos', detail = 'correo';
  end if;

  -- 7. Los textos que leyó tienen que ser los vigentes: el permiso cita lo que ella aceptó.
  v_terminos := (select max(t.version) from retail.club_textos t where t.tipo = 'terminos');
  v_privacidad := (select max(t.version) from retail.club_textos t where t.tipo = 'privacidad');
  v_casilla := (select max(t.version) from retail.club_textos t where t.tipo = 'casilla_publicidad');
  v_saludo := (select max(t.version) from retail.club_textos t where t.tipo = 'saludo');
  if v_terminos is null or v_privacidad is null or (v_publicidad and v_casilla is null) then
    raise exception 'Todavía no están publicados los textos del club.' using errcode = 'P0001', hint = 'club_sin_texto';
  end if;
  begin
    v_lee_terminos := (p_versiones ->> 'terminos')::integer;
    v_lee_privacidad := (p_versiones ->> 'privacidad')::integer;
    v_lee_casilla := (p_versiones ->> 'casilla_publicidad')::integer;
    v_lee_saludo := (p_versiones ->> 'saludo')::integer;
  exception when others then
    raise exception 'Las versiones de los textos no son válidas.' using errcode = '22023', hint = 'club_datos_invalidos', detail = 'versiones';
  end;
  if v_lee_terminos is distinct from v_terminos or v_lee_privacidad is distinct from v_privacidad
     or (v_publicidad and v_lee_casilla is distinct from v_casilla)
     or (v_lee_saludo is not null and v_lee_saludo is distinct from v_saludo) then
    raise exception 'Los textos del club cambiaron mientras te registrabas: vuelve a leerlos.'
      using errcode = 'P0001', hint = 'club_texto_cambio';
  end if;

  -- 8. La ficha, por documento, tomada (`for update`): dos registros del mismo documento a la vez hacen fila aquí.
  select c.id, c.archivada_en is not null, c.club_desde, c.publicidad_desde, c.codigo_club, c.telefono_whatsapp, c.nombre
    into v_id, v_archivada, v_club_desde, v_publicidad_desde, v_codigo, v_telefono, v_nombre_actual
    from retail.clientas c
   where c.documento_tipo = v_tipo and c.documento_numero = v_numero
     for update;

  if v_id is null then
    if v_nombre is null then
      raise exception 'Escribe tus nombres y apellidos.' using errcode = '22023', hint = 'club_datos_invalidos', detail = 'nombre';
    end if;
    -- Nueva: la ficha completa. El único parcial por (tipo, número) cierra la carrera: si otra pestaña la creó en este
    -- instante, `do nothing` no devuelve nada y se toma la que quedó.
    insert into retail.clientas (documento_tipo, documento_numero, nombre, telefono_whatsapp, cumple_dia, cumple_mes,
                                 cumple_anio, correo, registro_origen, created_por)
    values (v_tipo, v_numero, v_nombre, v_celular, extract(day from p_nacimiento)::smallint,
            extract(month from p_nacimiento)::smallint, extract(year from p_nacimiento)::smallint, v_correo, 'cartel', null)
    on conflict (documento_tipo, documento_numero) where documento_numero is not null do nothing
    returning id into v_id;
    if v_id is not null then
      v_nueva := true;
      v_nombre_final := v_nombre;
      -- CL-27: sus compras anteriores con ese documento pasan a su ficha (como en caja).
      v_ligadas := retail.fn_ligar_ventas_por_documento(v_id, v_tipo, v_numero);
    else
      select c.id, c.archivada_en is not null, c.club_desde, c.publicidad_desde, c.codigo_club, c.telefono_whatsapp, c.nombre
        into v_id, v_archivada, v_club_desde, v_publicidad_desde, v_codigo, v_telefono, v_nombre_actual
        from retail.clientas c
       where c.documento_tipo = v_tipo and c.documento_numero = v_numero
         for update;
    end if;
  end if;

  if not v_nueva then
    -- Archivada (sin anonimizar): la página no la reactiva; en caja, sí (ver DECIDÍ de la cabecera).
    if v_archivada then
      raise exception 'Para unirte necesitamos revisar tus datos en tienda: acércate a caja y te ayudamos.'
        using errcode = 'P0001', hint = 'club_documento_archivado';
    end if;
    -- G-4: con DNI, el nombre del padrón reemplaza al que había; con carné o pasaporte, solo completa uno vacío.
    v_nombre_final := case when v_tipo = 'dni' and v_del_padron then v_nombre
                           else coalesce(nullif(btrim(v_nombre_actual), ''), v_nombre) end;
    if v_nombre_final is null then
      raise exception 'Escribe tus nombres y apellidos.' using errcode = '22023', hint = 'club_datos_invalidos', detail = 'nombre';
    end if;
    -- Un celular NUEVO sobre una ficha con publicidad se la quita ANTES de guardarlo: la publicidad era del número de
    -- antes (ADR-0288 D-4, ajuste d). Si marcó la casilla, la recupera abajo para el número nuevo.
    if v_publicidad_desde is not null and v_celular is distinct from retail.fn_celular_normalizado(v_telefono) then
      update retail.clientas c set publicidad_desde = null where c.id = v_id;
      insert into retail.club_permisos (clienta_id, finalidad, accion, medio, ubicacion_id, nota)
      values (v_id, 'publicidad_whatsapp', 'revoca', 'pagina_cartel', p_ubicacion_id,
              'se volvió a registrar en el cartel con otro celular');
      v_publicidad_desde := null;
      v_quito_publicidad := true;
    end if;
    update retail.clientas c set
      nombre = v_nombre_final,
      telefono_whatsapp = v_celular,
      cumple_dia = extract(day from p_nacimiento)::smallint,
      cumple_mes = extract(month from p_nacimiento)::smallint,
      cumple_anio = extract(year from p_nacimiento)::smallint,
      correo = coalesce(v_correo, c.correo)
    where c.id = v_id;
  end if;

  -- 9. Socia (G-4): si ya lo era, conserva su fecha y su código; si no, desde ahora y con código nuevo.
  v_era_socia := v_club_desde is not null;
  if not v_era_socia then
    v_codigo := retail.fn_club_codigo_nuevo();
    v_club_desde := v_ahora;
  end if;
  update retail.clientas c set
    club_desde = v_club_desde,
    codigo_club = v_codigo,
    club_ubicacion_id = p_ubicacion_id
  where c.id = v_id;
  insert into retail.club_permisos (clienta_id, finalidad, accion, medio, texto_tipo, texto_version, ubicacion_id, nota)
  values (v_id, 'club', 'otorga', 'pagina_cartel', 'terminos', v_terminos, p_ubicacion_id,
          'aceptó también la privacidad v' || v_privacidad);

  -- 10. La publicidad, solo si marcó la casilla (G-12): ella escaneó el cartel y la marcó (Ley 32323).
  if v_publicidad then
    insert into retail.club_permisos (clienta_id, finalidad, accion, medio, texto_tipo, texto_version, ubicacion_id)
    values (v_id, 'publicidad_whatsapp', 'otorga', 'pagina_cartel', 'casilla_publicidad', v_casilla, p_ubicacion_id);
    update retail.clientas c set publicidad_desde = coalesce(c.publicidad_desde, v_ahora) where c.id = v_id;
  end if;

  -- La actividad, sin datos suyos (quién es queda en registro_id) y sin persona: lo hizo ella.
  perform retail.fn_actividad_anotar(
    'clientas', 'registro_cartel',
    case when v_nueva then 'una clienta se registró sola en el club desde el cartel'
         when v_era_socia then 'una socia actualizó sus datos desde el cartel'
         else 'una clienta se unió sola al club desde el cartel' end,
    null, null, p_ubicacion_id, null, 'clientas', v_id::text, v_ahora,
    jsonb_build_object('nueva', v_nueva, 'era_socia', v_era_socia, 'publicidad', v_publicidad,
                       'quito_publicidad_por_celular', v_quito_publicidad, 'ventas_ligadas', v_ligadas,
                       'terminos', v_terminos, 'privacidad', v_privacidad,
                       'casilla_publicidad', case when v_publicidad then v_casilla end),
    'vivo'
  );

  return query select v_id, v_codigo, v_club_desde, v_era_socia, retail.fn_club_nombre_de_pila(v_nombre_final);
end;
$$;

comment on function retail.registrarse_en_el_club(uuid, text, text, text, text, date, text, boolean, boolean, boolean, jsonb, boolean) is
  'Ella se une sola al club desde el cartel de una tienda (ADR-0288 act. g: G-3, G-4, G-5, G-10, G-12). Crea o actualiza la ficha por documento (DNI con nombre del padrón; carné o pasaporte con el nombre que escribe), la deja socia (conserva club_desde y codigo_club), con permiso del club por pagina_cartel citando los términos y, si marcó la casilla, la publicidad citando la casilla. Hints: club_menor, club_datos_invalidos (detail = el campo), club_texto_cambio, club_documento_archivado. Solo el servidor (llave de servicio): sin sesión ni responsable.';

-- ---------- 6. fn_club_aniversario: su aniversario en el club (Clientas) ----------
create or replace function retail.fn_club_aniversario(p_clienta_id uuid)
returns table (
  anios_que_cuentan integer,
  anio_en_curso_cuenta boolean,
  compras_anio integer,
  monto_anio numeric,
  proximo_aniversario date,
  vale_disponible boolean,
  vale_monto numeric,
  vale_vence date,
  vale_canjeado_el date
)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  -- La ficha es del módulo «Clientas» (42501 clientas_sin_modulo). Va primero: si falla, no se lee nada.
  select retail.fn_exigir_modulo('clientas');

  select a.anios_que_cuentan, a.anio_en_curso_cuenta, a.compras_anio, a.monto_anio, a.proximo_aniversario,
         a.vale_disponible, a.vale_monto, a.vale_vence, a.vale_canjeado_el
    from retail.fn_club_aniversario_calculo(p_clienta_id) a;
$$;

comment on function retail.fn_club_aniversario(uuid) is
  'El aniversario de una socia en el club (ADR-0288 G-9, G-13): años que cuentan (6 compras o S/ 600 netos en el año de club, configurable), el año en curso (compras, monto, si ya cuenta), el próximo aniversario y el vale del último aniversario (disponible, monto de la escala, vence, canjeado el). Sin club: ceros. Lectura (prefijo fn_). Módulo «Clientas».';

-- ---------- 7. resumen_clienta_caja: suma el vale de aniversario ----------
-- Cambia su tipo de retorno (3 columnas más): `drop` y `create`, con la misma lectura (la de la 1c) y los mismos permisos.
drop function if exists retail.resumen_clienta_caja(uuid);

create function retail.resumen_clienta_caja(p_clienta_id uuid)
returns table (
  es_socia boolean,
  codigo_club text,
  club_desde timestamptz,
  con_publicidad boolean,
  celular text,
  cumple_dia smallint,
  cumple_mes smallint,
  cumple_disponible boolean,
  cumple_pct numeric,
  cumple_canjeado_este_anio boolean,
  cumple_canjeado_el date,
  aniversario_disponible boolean,
  aniversario_monto numeric,
  aniversario_vence date
)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  -- La ficha es del módulo «Clientas» (42501 clientas_sin_modulo). Va primero: si falla, no se lee nada.
  select retail.fn_exigir_modulo('clientas');

  -- ADR-0288 D-5: disponible = socia activa, en el mes de su cumpleaños (Lima) y sin un canje vivo este año. Es lo mismo
  -- que exige registrar_venta; la caja solo lo muestra.
  -- ADR-0288 G-13 (tanda 1g): el vale de aniversario disponible hoy (monto y vence solo si lo está). Lo mismo que exige
  -- registrar_venta con p_canjear_aniversario; la caja ofrece uno solo de los dos por compra.
  select c.club_desde is not null, c.codigo_club, c.club_desde, c.publicidad_desde is not null,
         c.telefono_whatsapp, c.cumple_dia, c.cumple_mes,
         c.club_desde is not null and not c.anonimizada and c.archivada_en is null
           and c.cumple_mes is not null and c.cumple_mes = extract(month from retail.fn_hoy_lima())
           and k.id is null,
         coalesce((select e.club_cumple_pct from retail.configuracion_empresa e limit 1), 10.00),
         k.id is not null,
         -- El día (en Lima, como el año del canje) en que lo canjeó: «Cumpleaños canjeado el 12 sep».
         (k.created_at at time zone 'America/Lima')::date,
         coalesce(a.vale_disponible, false),
         case when a.vale_disponible then a.vale_monto end,
         case when a.vale_disponible then a.vale_vence end
    from retail.clientas c
    left join lateral (
      select x.id, x.created_at from retail.club_canjes x
       where x.clienta_id = c.id and x.tipo = 'cumpleanos'
         and x.anio = extract(year from retail.fn_hoy_lima()) and x.anulado_en is null
       limit 1
    ) k on true
    left join lateral retail.fn_club_aniversario_calculo(c.id) a on true
   where c.id = p_clienta_id;
$$;

comment on function retail.resumen_clienta_caja(uuid) is
  'La tarjeta de la clienta en Cobrar (ADR-0288 D-8): socia, código, desde cuándo, con publicidad, celular y cumpleaños; el canje del cumpleaños (D-5: disponible hoy, %, canjeado este año y qué día); y el vale de aniversario (G-13: disponible hoy, monto y vence). Uno solo de los dos por compra. Lectura (prefijo resumen_: no abre el loader). Módulo «Clientas».';

revoke execute on function retail.resumen_clienta_caja(uuid) from public, anon;
grant execute on function retail.resumen_clienta_caja(uuid) to authenticated;

-- ---------- 8. registrar_venta: el vale de aniversario, una sola ventaja del club por compra ----------
-- Sobre la definición viva (la de la 1c, md5 2b55a94a… en producción). Lo que cambia está marcado «ADR-0288 G-13». Cambia
-- de firma (18 parámetros): `drop` de la de 17 y `create` de la nueva, o quedaría una sobrecarga.
drop function if exists retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text, text, uuid, text, numeric, uuid, text, boolean);

create or replace function retail.registrar_venta(
  p_ubicacion_id uuid,
  p_items jsonb,
  p_pagos jsonb,
  p_cliente_id uuid default null,
  p_token uuid default null,
  p_tipo_comprobante text default null,
  p_cliente_tipo_doc text default 'sin_documento',
  p_cliente_num_doc text default null,
  p_cliente_nombre text default null,
  p_codigo_descuento text default null,
  p_nota text default null,
  p_asesora_id uuid default null,
  p_emisor text default 'retail',
  p_descuento_pct numeric default 0,
  p_autorizado_por uuid default null,
  p_motivo_descuento text default null,
  p_canjear_cumpleanos boolean default false,
  p_canjear_aniversario boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_venta_id uuid; v_existente ventas%rowtype; v_item jsonb; v_pago jsonb;
  v_item_id uuid; v_mov_id uuid; v_costo numeric; v_persona uuid;
  v_sub uuid;
  v_caja_id uuid;
  v_total_items numeric := 0;
  v_total_pagos numeric := 0;
  v_igv numeric;
  v_subtotal numeric;
  v_precio_catalogo numeric; v_referencia text; v_sku text;
  c_cargo_especial constant uuid := '22222222-2222-4222-8222-222222222222';
  -- Días después de terminar que la base todavía ACEPTA el descuento de una
  -- campaña (venta hecha sin red y subida más tarde). No afecta lo que se exige.
  c_tolerancia_campana constant integer := 3;
  v_descuento numeric;               -- ADR-0288 D-5: el descuento de la línea SIN la parte del club
  v_hay_descuento boolean := false;  -- descuento MANUAL (el que pide código a una colaboradora)
  v_codigo codigos_descuento%rowtype;
  v_codigo_limpio text := upper(btrim(coalesce(p_codigo_descuento, '')));
  v_motivo text; v_motivo_otro text; v_argumento text;
  v_hoy date := fn_hoy_lima();
  v_c_id uuid; v_c_nombre text; v_c_pct numeric; v_c_unit numeric;
  v_etq_id uuid; v_etq_pct numeric;
  v_tope_descuento numeric;  -- D-67: tope de descuento de VENTA de quien vende (NULL = sin tope)
  -- ADR-0288 D-5 (tanda 1c): el cumpleaños de la socia.
  v_club numeric;                        -- la parte del club de la línea (descuento_club_unitario que mandó Cobrar)
  v_club_calc numeric;                   -- la misma, calculada aquí
  v_club_pct numeric;                    -- configuracion_empresa.club_cumple_pct (solo si se canjea)
  v_club_monto numeric := 0;             -- lo que regala el club en esta venta: Σ parte del club × cantidad
  v_anio_lima smallint := extract(year from v_hoy)::smallint;
  -- ADR-0288 G-13 (tanda 1g): el vale de aniversario.
  v_aniv_monto numeric;                  -- el vale (S/), de la escala
  v_aniv_anio_club smallint;             -- el año de club cuyo aniversario dio el vale
  v_aniv_fecha date;                     -- ese aniversario (su año va en club_canjes.anio)
  v_aniv_partes numeric[] := '{}';       -- la parte del vale de cada línea (por unidad), en el orden de p_items
  v_idx integer := 0;                    -- la línea que se está mirando (1, 2, …)
begin
  -- ADR-0288 D-5: un null explícito es «no canjear» (con null, `if not …` tomaría la rama equivocada).
  p_canjear_cumpleanos := coalesce(p_canjear_cumpleanos, false);
  p_canjear_aniversario := coalesce(p_canjear_aniversario, false);
  -- ADR-0288 G-13: una sola ventaja del club por compra (el cumpleaños o el vale de aniversario).
  if p_canjear_cumpleanos and p_canjear_aniversario then
    raise exception 'El cumpleaños y el vale de aniversario no se juntan en una misma compra: elige uno.'
      using hint = 'club_un_cupon_por_compra';
  end if;

  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para vender en esa ubicación';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'El carrito está vacío';
  end if;
  if p_pagos is null or jsonb_array_length(p_pagos) = 0 then
    raise exception 'Falta indicar cómo se pagó la venta';
  end if;
  if p_tipo_comprobante is not null and p_tipo_comprobante not in ('boleta', 'factura', 'nota_venta') then
    raise exception 'Una venta solo puede facturarse como boleta o factura (se pidió %)', p_tipo_comprobante;
  end if;
  if p_emisor not in ('alegra', 'retail') then
    raise exception 'p_emisor solo puede ser "alegra" o "retail" (se pidió %)', p_emisor;
  end if;
  if p_descuento_pct < 0 or p_descuento_pct > 100 then
    raise exception 'El descuento de la venta debe estar entre 0%% y 100%% (se pidió %)', p_descuento_pct;
  end if;

  if p_token is not null then
    select * into v_existente from ventas where token_cliente = p_token;
    if found then return v_existente.id; end if;
  end if;

  select id into v_caja_id from cajas where ubicacion_id = p_ubicacion_id and estado = 'abierta' for share;
  -- ADR-0190: los candados en orden fijo antes de mover nada (sin bloqueos mutuos entre dos operaciones).
  perform fn_bloquear_en_orden(p_ubicacion_id, fn_ids_de_items(p_items));
  if v_caja_id is null then
    raise exception 'No hay una caja abierta en esta ubicación — ábrela antes de registrar una venta';
  end if;

  v_persona := retail.fn_actor_persona_id(true);

  -- ADR-0288 D-1: la clienta del ticket. Si su ficha se unió a otra, la venta va a la que quedó (unir_clientas ya movió
  -- las anteriores); si está anonimizada, pidió que la olvidaran y no se le cuelga nada nuevo.
  -- Variables sueltas y no un `record`: sin clienta (la mayoría de las ventas) nadie las asigna, y leer un campo de un
  -- `record` sin asignar falla («record is not assigned yet») aunque el `and` de al lado ya sea falso.
  -- `for key share`: si otra caja está uniendo esta ficha (unir_clientas la toma con `for update`), la venta espera a que
  -- termine y sigue la unión; sin él, leía la ficha de antes de la unión y la venta quedaba colgada de la ficha unida.
  -- ADR-0288 D-5: si se canjea el cumpleaños, la misma lectura la toma `for no key update`: dos cajas que canjean a la misma
  -- socia hacen fila aquí (tomarla primero `for key share` y subirla después las trabaría entre sí). Una venta sin canje no
  -- espera a un canje: su `for key share` no choca con `for no key update`.
  declare
    v_ficha_id uuid;
    v_ficha_anonimizada boolean;
    v_ficha_fusionada_en uuid;
    v_saltos_union integer := 0;
  begin
    while p_cliente_id is not null loop
      -- Sin `select … into` a propósito: el SQL Editor de Supabase lo confunde, dentro de un texto, con un `SELECT INTO`
      -- que crea una tabla (pasó el 2026-09-30). El `for` lee la misma fila; si no hay, las variables quedan en null.
      v_ficha_id := null;
      v_ficha_anonimizada := null;
      v_ficha_fusionada_en := null;
      -- ADR-0288 G-13: el vale de aniversario hace fila igual que el cumpleaños.
      if p_canjear_cumpleanos or p_canjear_aniversario then
        for v_ficha_id, v_ficha_anonimizada, v_ficha_fusionada_en in
          select c.id, c.anonimizada, c.fusionada_en_id from retail.clientas c where c.id = p_cliente_id for no key update
        loop
          exit;
        end loop;
      else
        for v_ficha_id, v_ficha_anonimizada, v_ficha_fusionada_en in
          select c.id, c.anonimizada, c.fusionada_en_id from retail.clientas c where c.id = p_cliente_id for key share
        loop
          exit;
        end loop;
      end if;
      if v_ficha_id is null then
        raise exception 'Esa clienta ya no está en la libreta. Quítala del ticket y vuelve a buscarla.'
          using hint = 'clienta_no_existe';
      end if;
      exit when v_ficha_fusionada_en is null;
      v_saltos_union := v_saltos_union + 1;
      if v_saltos_union > 10 then
        raise exception 'La ficha de esta clienta tiene una cadena de uniones demasiado larga. Avísale al líder.';
      end if;
      p_cliente_id := v_ficha_fusionada_en;
    end loop;
    if v_ficha_anonimizada then
      raise exception 'Esta clienta pidió borrar sus datos: la venta no se puede guardar a su nombre. Quítala del ticket y vende sin clienta.'
        using hint = 'clienta_anonimizada';
    end if;
  end;

  -- ADR-0288 D-5 (tanda 1c): el cumpleaños. Cobrar solo dice «canjear»; si puede y cuánto lo decide la base.
  if p_canjear_cumpleanos then
    if p_cliente_id is null then
      raise exception 'El cumpleaños es de una socia del club: elige a la clienta en el ticket antes de canjearlo.'
        using hint = 'cumple_sin_clienta';
    end if;
    -- Un reintento de ESTA venta que esperó en la ficha mientras la primera se guardaba: ya está, se devuelve.
    if p_token is not null then
      select * into v_existente from ventas where token_cliente = p_token;
      if found then return v_existente.id; end if;
    end if;
    declare
      v_socia boolean;
      v_cumple_mes smallint;
    begin
      for v_socia, v_cumple_mes in
        select c.club_desde is not null and not c.anonimizada and c.archivada_en is null, c.cumple_mes
          from retail.clientas c where c.id = p_cliente_id
      loop
        exit;
      end loop;
      if not coalesce(v_socia, false) then
        raise exception 'El descuento de cumpleaños es para las socias del club: esta clienta no es socia.'
          using hint = 'cumple_no_socia';
      end if;
      if v_cumple_mes is null or v_cumple_mes <> extract(month from v_hoy) then
        raise exception 'El descuento de cumpleaños se canjea en el mes de su cumpleaños, y este no es.'
          using hint = 'cumple_fuera_de_mes';
      end if;
    end;
    if exists (select 1 from club_canjes k
                where k.clienta_id = p_cliente_id and k.tipo = 'cumpleanos' and k.anio = v_anio_lima and k.anulado_en is null) then
      raise exception 'Esta socia ya canjeó su cumpleaños este año.'
        using hint = 'cumple_ya_canjeado';
    end if;
    v_club_pct := coalesce((select e.club_cumple_pct from configuracion_empresa e limit 1), 10.00);
  end if;

  -- ADR-0288 G-13 (tanda 1g): el vale de aniversario. Cobrar solo dice «canjear» y manda su reparto; si puede, cuánto vale
  -- y cómo se reparte lo decide la base (fn_club_aniversario_calculo y la regla de abajo), y lo de Cobrar tiene que ser eso.
  if p_canjear_aniversario then
    if p_cliente_id is null then
      raise exception 'El vale de aniversario es de una socia del club: elige a la clienta en el ticket antes de canjearlo.'
        using hint = 'aniversario_no_disponible';
    end if;
    -- Un reintento de ESTA venta que esperó en la ficha mientras la primera se guardaba: ya está, se devuelve.
    if p_token is not null then
      select * into v_existente from ventas where token_cliente = p_token;
      if found then return v_existente.id; end if;
    end if;
    declare
      v_disponible boolean;
      v_canjeado date;
    begin
      for v_disponible, v_aniv_monto, v_aniv_anio_club, v_aniv_fecha, v_canjeado in
        select a.vale_disponible, a.vale_monto, a.vale_anio_club, a.vale_aniversario, a.vale_canjeado_el
          from retail.fn_club_aniversario_calculo(p_cliente_id) a
      loop
        exit;
      end loop;
      if v_canjeado is not null then
        raise exception 'Esta socia ya usó el vale de este aniversario.' using hint = 'aniversario_ya_canjeado';
      end if;
      if not coalesce(v_disponible, false) then
        raise exception 'Esta clienta no tiene un vale de aniversario para usar hoy.' using hint = 'aniversario_no_disponible';
      end if;
    end;
    -- El reparto, en céntimos enteros: la MISMA regla que la web (apps/web/lib/club-aniversario-canje-reglas.ts,
    -- `repartirVale`; está en la cabecera de esta migración). Proporcional al neto de cada línea hacia abajo, y el resto de a
    -- 1 céntimo por unidad, de la mayor fracción a la menor (a igual fracción, en el orden del ticket), vuelta tras vuelta,
    -- mientras alguna línea pueda recibirlo. Nunca pasa el neto de una línea, ni el total, ni el vale.
    declare
      v_netos bigint[] := '{}';
      v_cants integer[] := '{}';
      v_unid bigint[] := '{}';
      v_orden integer[];
      v_total bigint := 0;
      v_vale bigint;
      v_resto bigint;
      v_neto bigint;
      v_q integer;
      v_sumo boolean := true;
      v_i integer;
    begin
      for v_item in select * from jsonb_array_elements(p_items) loop
        v_q := (v_item ->> 'cantidad')::integer;
        if v_q is null or v_q <= 0 then
          raise exception 'La cantidad de cada prenda tiene que ser mayor que cero.';
        end if;
        v_neto := greatest(round((v_item ->> 'precio_unitario')::numeric * 100)
                           - round((coalesce((v_item ->> 'descuento_unitario')::numeric, 0)
                                    - coalesce((v_item ->> 'descuento_club_unitario')::numeric, 0)) * 100), 0)::bigint;
        v_netos := v_netos || v_neto;
        v_cants := v_cants || v_q;
        v_total := v_total + v_neto * v_q;
      end loop;
      if v_total <= 0 then
        raise exception 'En esta venta no queda nada que descontar con el vale: no se canjea.' using hint = 'aniversario_sin_monto';
      end if;
      v_vale := least(greatest(round(v_aniv_monto * 100), 0)::bigint, v_total);
      -- Una venta en S/ 0 no se puede cobrar (todo pago es mayor que cero) ni emitir: el vale que cubre TODA la compra se
      -- rechaza con un aviso claro, en vez de caer en el candado de los pagos. Cómo regalar una compra entera (y su
      -- comprobante ante SUNAT) lo decide Felipe: ver la cabecera.
      if v_vale >= v_total then
        raise exception 'El vale de aniversario cubre toda la compra, y una venta en S/ 0 no se puede cobrar ni emitir: suma otra prenda o úsalo en una compra mayor.'
          using hint = 'aniversario_cubre_todo';
      end if;
      v_resto := v_vale;
      for i in 1 .. array_length(v_netos, 1) loop
        v_unid := v_unid || ((v_vale * v_netos[i]) / v_total);
        v_resto := v_resto - v_unid[i] * v_cants[i];
      end loop;
      v_orden := (select array_agg(g.i order by (v_vale * v_netos[g.i]) % v_total desc, g.i)
                    from generate_subscripts(v_netos, 1) as g(i));
      while v_resto > 0 and v_sumo loop
        v_sumo := false;
        foreach v_i in array v_orden loop
          continue when v_cants[v_i] > v_resto or v_unid[v_i] >= v_netos[v_i];
          v_unid[v_i] := v_unid[v_i] + 1;
          v_resto := v_resto - v_cants[v_i];
          v_sumo := true;
          exit when v_resto = 0;
        end loop;
      end loop;
      for i in 1 .. array_length(v_unid, 1) loop
        v_aniv_partes := v_aniv_partes || (v_unid[i]::numeric / 100);
      end loop;
    end;
  end if;

  v_sub := fn_sububicacion_por_defecto(p_ubicacion_id, 'venta');

  -- D-67: descuento a nivel de VENTA (distinto del descuento por línea, que sigue su propio
  -- candado más abajo sin cambios). Solo se evalúa si de verdad se pidió uno.
  -- ADR-0288 D-5: la parte del club nunca entra aquí: p_descuento_pct lo declara la caja aparte, no sale de las líneas.
  if p_descuento_pct > 0 then
    -- ADR-0162: el tope es un PERMISO de la CUENTA, no de quien firma (v_persona puede ser el responsable
    -- elegido en el combo, sin PIN). Una terminal descuenta SIN tope ni autorización (Felipe, 2026-09-22):
    -- NULL = «sin tope», igual que un líder.
    select tope_descuento_pct into v_tope_descuento from colaboradores
      where persona_id = (select id from personas where auth_user_id = auth.uid());
    if exists (select 1 from retail.fn_terminal_actual()) then
      v_tope_descuento := null;
    end if;
    if v_tope_descuento is not null and p_descuento_pct > v_tope_descuento then
      if p_autorizado_por is null or not fn_es_lider_persona(p_autorizado_por) then
        raise exception 'Ese descuento (%.2f%%) supera tu tope (%.2f%%) — necesita la autorización de un líder de equipo', p_descuento_pct, v_tope_descuento
          using errcode = '42501';
      end if;
    end if;
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select v.precio, p.referencia, coalesce(v.codigo, v.sku, 'sin código')
      into v_precio_catalogo, v_referencia, v_sku
      from variantes v join productos p on p.id = v.producto_id
      where v.id = (v_item ->> 'variante_id')::uuid;
    if v_precio_catalogo is null then
      raise exception 'La variante % no existe', v_item ->> 'variante_id';
    end if;

    if (v_item ->> 'variante_id')::uuid <> c_cargo_especial
       and not fn_variante_permitida_en_sede((v_item ->> 'variante_id')::uuid, p_ubicacion_id) then
      raise exception 'venta_variante_restringida_a_otra_sede' using detail = v_referencia || ' (' || v_sku || ')';
    end if;

    if (v_item ->> 'variante_id')::uuid <> c_cargo_especial
       and round((v_item ->> 'precio_unitario')::numeric, 2) <> round(v_precio_catalogo, 2) then
      raise exception 'venta_precio_cambiado'
        using detail = v_referencia || ' (' || v_sku || ')',
              hint = format('En catálogo vale S/%s y la caja mandó S/%s', v_precio_catalogo, v_item ->> 'precio_unitario');
    end if;

    -- ADR-0179: una prenda sin registrar sin sus datos no se puede regularizar después.
    if (v_item ->> 'variante_id')::uuid = c_cargo_especial and (
         btrim(coalesce(v_item ->> 'descripcion_libre', '')) = ''
         or nullif(v_item ->> 'categoria_id', '') is null
         or nullif(v_item ->> 'talla_id', '') is null
         or nullif(v_item ->> 'color_codigo', '') is null
         or (v_item ->> 'cantidad')::integer <> 1
         or (v_item ->> 'precio_unitario')::numeric - coalesce((v_item ->> 'descuento_unitario')::numeric, 0) <= 0) then
      raise exception 'prenda_sin_registrar_incompleta'
        using hint = 'Una prenda sin registrar necesita descripción, categoría, talla, color, precio y cantidad 1';
    end if;

    -- ADR-0288 D-5: `descuento_unitario` es el TOTAL; `descuento_club_unitario`, la parte del cumpleaños. Todo lo que sigue
    -- (campaña, descuento a mano, costo, 35 %, argumento) mide el descuento SIN el club: v_descuento.
    v_club := coalesce((v_item ->> 'descuento_club_unitario')::numeric, 0);
    v_descuento := coalesce((v_item ->> 'descuento_unitario')::numeric, 0) - v_club;
    v_idx := v_idx + 1;
    if p_canjear_aniversario then
      -- ADR-0288 G-13: la parte del vale de esta línea es la del reparto de arriba, exacta al céntimo.
      if v_club <> v_aniv_partes[v_idx] then
        raise exception 'El vale de aniversario en % no es el que corresponde (S/% y la caja mandó S/%). Vuelve a abrir el cobro.',
          v_referencia || ' (' || v_sku || ')', v_aniv_partes[v_idx], v_club
          using detail = v_referencia || ' (' || v_sku || ')', hint = 'aniversario_descuento_distinto';
      end if;
      v_club_monto := v_club_monto + v_club * (v_item ->> 'cantidad')::integer;
    elsif not p_canjear_cumpleanos then
      if v_club <> 0 then
        raise exception 'Esta venta trae un descuento del club sin canjearlo. Vuelve a tocar «Canjear» o quítalo.'
          using detail = v_referencia || ' (' || v_sku || ')', hint = 'cumple_sin_canje';
      end if;
    else
      -- CL-11: en cascada, sobre lo que queda de la prenda. El mismo redondeo que la web (lib/club-cumple-canje-reglas.ts).
      v_club_calc := round(((v_item ->> 'precio_unitario')::numeric - v_descuento) * v_club_pct / 100, 2);
      if abs(v_club - v_club_calc) > 0.01 then
        raise exception 'El descuento de cumpleaños de % no es el que corresponde (S/% y la caja mandó S/%). Vuelve a abrir el cobro.',
          v_referencia || ' (' || v_sku || ')', v_club_calc, v_club
          using detail = v_referencia || ' (' || v_sku || ')', hint = 'cumple_descuento_distinto';
      end if;
      v_club_monto := v_club_monto + v_club * (v_item ->> 'cantidad')::integer;
    end if;
    v_motivo := btrim(coalesce(v_item ->> 'motivo_descuento', ''));

    -- La campaña que RIGE HOY para esta prenda (la de mayor %). El "Monto
    -- manual" no es una prenda del catálogo: no entra en campañas.
    v_c_id := null; v_c_nombre := null; v_c_pct := null;
    if (v_item ->> 'variante_id')::uuid <> c_cargo_especial then
      select c.etiqueta_id, c.etiqueta_nombre, c.descuento_pct
        into v_c_id, v_c_nombre, v_c_pct
        from fn_campanas_por_variante(v_hoy, 0, array[(v_item ->> 'variante_id')::uuid]) c
        order by c.descuento_pct desc, c.etiqueta_nombre, c.etiqueta_id
        limit 1;
    end if;
    v_c_unit := case when v_c_pct is null then 0
                     else retail.fn_descuento_campana((v_item ->> 'precio_unitario')::numeric, v_c_pct) end;

    -- Lo EXIGIDO: si la prenda tiene campaña hoy, la clienta la recibe. La caja
    -- no puede cobrar menos descuento (el 0,01 absorbe el redondeo del navegador).
    if v_c_id is not null and v_descuento < v_c_unit - 0.01 then
      raise exception 'venta_campana_omitida'
        using detail = v_referencia || ' (' || v_sku || ')',
              hint = format('«%s» da %s %% y la caja mandó S/%s de descuento', v_c_nombre,
                            trim(trailing '.' from trim(trailing '0' from v_c_pct::text)), v_descuento);
    end if;

    if v_motivo = 'campana' then
      -- Descuento de campaña: se verifica contra la etiqueta que la caja dice
      -- (aceptando una terminada hace pocos días, por la venta sin red).
      v_etq_id := nullif(btrim(coalesce(v_item ->> 'descuento_etiqueta_id', '')), '')::uuid;
      if v_etq_id is null then
        raise exception 'venta_campana_sin_etiqueta' using detail = v_referencia || ' (' || v_sku || ')';
      end if;
      select c.descuento_pct into v_etq_pct
        from fn_campanas_por_variante(v_hoy, c_tolerancia_campana, array[(v_item ->> 'variante_id')::uuid]) c
        where c.etiqueta_id = v_etq_id;
      if not found then
        raise exception 'venta_campana_no_vigente' using detail = v_referencia || ' (' || v_sku || ')';
      end if;
      if v_descuento <= 0
         or abs(v_descuento - retail.fn_descuento_campana((v_item ->> 'precio_unitario')::numeric, v_etq_pct)) > 0.011 then
        raise exception 'venta_campana_monto_no_coincide'
          using detail = v_referencia || ' (' || v_sku || ')',
                hint = format('La etiqueta da %s %% y la caja mandó S/%s de descuento',
                              trim(trailing '.' from trim(trailing '0' from v_etq_pct::text)), v_descuento);
      end if;

    elsif v_descuento > 0 then
      -- Descuento MANUAL. Con campaña, solo vale si la supera: un solo descuento.
      if v_c_id is not null and v_descuento <= v_c_unit + 0.01 then
        raise exception 'venta_descuento_no_supera_campana'
          using detail = v_referencia || ' (' || v_sku || ')',
                hint = format('«%s» ya da S/%s por prenda', v_c_nombre, v_c_unit);
      end if;

      v_hay_descuento := true;

      v_motivo_otro := btrim(coalesce(v_item ->> 'motivo_descuento_detalle', ''));
      v_argumento := btrim(coalesce(v_item ->> 'argumento_descuento', ''));

      if v_motivo not in ('cumpleanos_clienta_top', 'prenda_con_desperfecto', 'liquidacion_temporada', 'cerrar_venta', 'otro') then
        raise exception 'venta_descuento_requiere_motivo' using detail = v_referencia || ' (' || v_sku || ')';
      end if;
      if v_motivo = 'otro' and v_motivo_otro = '' then
        raise exception 'venta_descuento_otro_sin_detalle' using detail = v_referencia || ' (' || v_sku || ')';
      end if;

      -- ADR-0288 D-5 (Felipe, 2026-09-30): el costo se mide SIN el cumpleaños; el regalo del club puede dejarla bajo costo.
      select costo into v_costo from variantes where id = (v_item ->> 'variante_id')::uuid;
      if (v_item ->> 'precio_unitario')::numeric - v_descuento < v_costo then
        raise exception 'venta_descuento_bajo_costo' using detail = v_referencia || ' (' || v_sku || ')';
      end if;

      if fn_es_lider() and v_descuento > round((v_item ->> 'precio_unitario')::numeric * 0.35, 2) + 0.01 then
        raise exception 'venta_descuento_supera_autorizacion' using detail = v_referencia || ' (' || v_sku || ')';
      end if;
      -- Felipe 2026-09-25: pasado el 15 %, argumento escrito para cualquiera (antes: Líder, 20 %).
      if v_descuento > round((v_item ->> 'precio_unitario')::numeric * 0.15, 2) + 0.01 and v_argumento = '' then
        raise exception 'venta_descuento_requiere_argumento' using detail = v_referencia || ' (' || v_sku || ')';
      end if;
    end if;

    v_total_items := v_total_items +
      (((v_item ->> 'precio_unitario')::numeric - v_descuento - v_club) * (v_item ->> 'cantidad')::integer);
  end loop;

  -- ADR-0288 D-5: un canje que no regala nada gastaría el cumpleaños del año por nada.
  if p_canjear_cumpleanos and v_club_monto <= 0 then
    raise exception 'En esta venta no queda nada que descontar por el cumpleaños: no se canjea.'
      using hint = 'cumple_sin_monto';
  end if;
  -- ADR-0288 G-13: un vale que no descuenta nada gastaría el aniversario por nada.
  if p_canjear_aniversario and v_club_monto <= 0 then
    raise exception 'En esta venta no queda nada que descontar con el vale: no se canjea.'
      using hint = 'aniversario_sin_monto';
  end if;

  -- El código de una colaboradora autoriza solo los descuentos MANUALES: una
  -- campaña no lo pide (y una línea de campaña no cuenta contra el tope).
  -- ADR-0288 D-5: la parte del club tampoco cuenta contra el código.
  if v_hay_descuento and not fn_es_lider() then
    if v_codigo_limpio = '' then
      raise exception 'venta_descuento_requiere_codigo';
    end if;
    select * into v_codigo from codigos_descuento
      where codigo = v_codigo_limpio
        and activo
        and (vigente_desde is null or vigente_desde <= v_hoy)
        and (vigente_hasta is null or vigente_hasta >= v_hoy)
        and (ubicacion_id is null or ubicacion_id = p_ubicacion_id);
    if not found then
      raise exception 'venta_codigo_descuento_invalido' using detail = v_codigo_limpio;
    end if;
    for v_item in select * from jsonb_array_elements(p_items) loop
      if btrim(coalesce(v_item ->> 'motivo_descuento', '')) <> 'campana'
         and coalesce((v_item ->> 'descuento_unitario')::numeric, 0) - coalesce((v_item ->> 'descuento_club_unitario')::numeric, 0)
             > round((v_item ->> 'precio_unitario')::numeric * v_codigo.porcentaje / 100, 2) + 0.01 then
        raise exception 'venta_descuento_supera_codigo'
          using detail = trim(trailing '.' from trim(trailing '0' from v_codigo.porcentaje::text)),
                hint = format('La línea %s pide S/%s de descuento', v_item ->> 'variante_id', v_item ->> 'descuento_unitario');
      end if;
    end loop;
  end if;

  for v_pago in select * from jsonb_array_elements(p_pagos) loop
    v_total_pagos := v_total_pagos + (v_pago ->> 'monto')::numeric;
  end loop;
  if round(v_total_items, 2) <> round(v_total_pagos, 2) then
    raise exception 'Los pagos (S/%) no cuadran con el total de la venta (S/%)', v_total_pagos, v_total_items;
  end if;

  begin
    insert into ventas (
      ubicacion_id, cliente_id, caja_id, usuario_id, token_cliente, nota,
      asesora_id, emisor, descuento_pct, descuento_autorizado_por, descuento_motivo
    )
      values (
        p_ubicacion_id, p_cliente_id, v_caja_id, v_persona, p_token, nullif(btrim(p_nota), ''),
        p_asesora_id, p_emisor, p_descuento_pct, p_autorizado_por,
        nullif(btrim(coalesce(p_motivo_descuento, '')), '')
      )
      returning id into v_venta_id;
  exception when unique_violation then
    if p_token is null then raise; end if;
    select * into v_existente from ventas where token_cliente = p_token;
    if not found then raise; end if;
    return v_existente.id;
  end;

  -- ADR-0288 D-5: el canje queda anotado con su venta. El único parcial (clienta, tipo, año) lo hace imposible dos veces;
  -- si otra caja ganó la carrera por otro camino, se traduce al mismo aviso.
  if p_canjear_cumpleanos then
    begin
      insert into club_canjes (clienta_id, venta_id, tipo, anio, pct, monto, registrado_por)
        values (p_cliente_id, v_venta_id, 'cumpleanos', v_anio_lima, v_club_pct, v_club_monto, v_persona);
    exception when unique_violation then
      raise exception 'Esta socia ya canjeó su cumpleaños este año.'
        using hint = 'cumple_ya_canjeado';
    end;
    -- La actividad, sin datos de la clienta: la venta y cuánto regaló el club. Si no se puede anotar, la venta sigue.
    begin
      perform retail.fn_actividad_anotar(
        'vender', 'cumpleanos_canjeado',
        'canjeó el cumpleaños de una socia: ' || trim_scale(v_club_pct)::text || ' % menos, ' || retail.fn_actividad_soles(v_club_monto),
        v_persona, (select v.terminal_id from ventas v where v.id = v_venta_id), p_ubicacion_id, null,
        'ventas', v_venta_id::text, now(),
        jsonb_build_object('pct', v_club_pct, 'monto', v_club_monto), 'vivo');
    exception when others then
      raise warning 'actividad: no se anotó el canje de cumpleaños de la venta % (%)', v_venta_id, sqlerrm;
    end;
  end if;

  -- ADR-0288 G-13: el vale queda anotado con su venta. El único parcial (clienta, año de club) lo hace imposible dos veces;
  -- si otra caja ganó la carrera por otro camino, se traduce al mismo aviso. `anio` = el año del aniversario que lo dio.
  if p_canjear_aniversario then
    begin
      insert into club_canjes (clienta_id, venta_id, tipo, anio, anio_club, pct, monto, registrado_por)
        values (p_cliente_id, v_venta_id, 'aniversario', extract(year from v_aniv_fecha)::smallint, v_aniv_anio_club, null,
                v_club_monto, v_persona);
    exception when unique_violation then
      raise exception 'Esta socia ya usó el vale de este aniversario.'
        using hint = 'aniversario_ya_canjeado';
    end;
    -- La actividad, sin datos de la clienta: la venta, el año de club y cuánto regaló el club. Si no se anota, la venta sigue.
    begin
      perform retail.fn_actividad_anotar(
        'vender', 'aniversario_canjeado',
        'canjeó el vale de aniversario de una socia: ' || retail.fn_actividad_soles(v_club_monto),
        v_persona, (select v.terminal_id from ventas v where v.id = v_venta_id), p_ubicacion_id, null,
        'ventas', v_venta_id::text, now(),
        jsonb_build_object('anio_club', v_aniv_anio_club, 'vale', v_aniv_monto, 'monto', v_club_monto), 'vivo');
    exception when others then
      raise warning 'actividad: no se anotó el canje del vale de aniversario de la venta % (%)', v_venta_id, sqlerrm;
    end;
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select costo into v_costo from variantes where id = (v_item ->> 'variante_id')::uuid;
    if v_costo is null then
      raise exception 'La variante % no existe', v_item ->> 'variante_id';
    end if;

    insert into venta_items (
      venta_id, variante_id, cantidad, precio_unitario, descuento_unitario, costo_unitario,
      motivo_descuento, motivo_descuento_detalle, argumento_descuento, descuento_etiqueta_id,
      descuento_club_unitario
    )
      values (
        v_venta_id, (v_item ->> 'variante_id')::uuid, (v_item ->> 'cantidad')::integer,
        (v_item ->> 'precio_unitario')::numeric, coalesce((v_item ->> 'descuento_unitario')::numeric, 0), v_costo,
        nullif(btrim(coalesce(v_item ->> 'motivo_descuento', '')), ''),
        nullif(btrim(coalesce(v_item ->> 'motivo_descuento_detalle', '')), ''),
        nullif(btrim(coalesce(v_item ->> 'argumento_descuento', '')), ''),
        case when btrim(coalesce(v_item ->> 'motivo_descuento', '')) = 'campana'
             then nullif(btrim(coalesce(v_item ->> 'descuento_etiqueta_id', '')), '')::uuid end,
        coalesce((v_item ->> 'descuento_club_unitario')::numeric, 0)
      )
      returning id into v_item_id;

    -- ADR-0179: la prenda sin registrar no mueve stock (no está en el sistema); queda en la cola
    -- y su único movimiento es el real, el que escribe almacén al regularizarla.
    if (v_item ->> 'variante_id')::uuid = c_cargo_especial then
      insert into prendas_por_regularizar (venta_item_id, ubicacion_id, descripcion, categoria_id, talla_id,
                                           color_codigo, precio_cobrado, vendido_por)
        values (v_item_id, p_ubicacion_id, btrim(v_item ->> 'descripcion_libre'),
                (v_item ->> 'categoria_id')::uuid, (v_item ->> 'talla_id')::uuid, v_item ->> 'color_codigo',
                (v_item ->> 'precio_unitario')::numeric - coalesce((v_item ->> 'descuento_unitario')::numeric, 0),
                coalesce(p_asesora_id, v_persona));
      continue;
    end if;

    insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, venta_item_id, usuario_id)
      values ((v_item ->> 'variante_id')::uuid, p_ubicacion_id, v_sub, 'salida',
              (v_item ->> 'cantidad')::integer, 'venta', v_item_id, v_persona)
      returning id into v_mov_id;
    perform fn_aplicar_movimiento(v_mov_id);
  end loop;

  for v_pago in select * from jsonb_array_elements(p_pagos) loop
    -- `recibido`: lo que la clienta entregó en efectivo (para reimprimir el ticket con su
    -- vuelto). Solo cuenta en efectivo; cualquier otro medio lo deja en NULL.
    insert into venta_pagos (venta_id, metodo, monto, recibido, referencia)
      values (
        v_venta_id, v_pago ->> 'metodo', (v_pago ->> 'monto')::numeric,
        case when v_pago ->> 'metodo' = 'efectivo' then nullif(v_pago ->> 'recibido', '')::numeric end,
        case when v_pago ->> 'metodo' in ('yape', 'plin', 'transferencia')
             then nullif(left(regexp_replace(coalesce(v_pago ->> 'referencia', ''), '[^0-9A-Za-z]', '', 'g'), 40), '') end
      );
  end loop;

  -- D-56: solo retail reserva comprobante. Cuando el emisor es Alegra, la venta queda
  -- registrada completa (stock, caja, pagos) y el comprobante se emite aparte, en Alegra.
  -- ADR-0288 D-5: el comprobante lleva el descuento TOTAL de cada línea (descuento_unitario), cumpleaños incluido.
  if p_tipo_comprobante is not null and p_emisor = 'retail' then
    v_igv := case when p_tipo_comprobante = 'nota_venta' then 0 else round((v_total_items - v_total_items / 1.18) * 100) / 100 end;
    v_subtotal := round((v_total_items - v_igv) * 100) / 100;
    perform emitir_comprobante(
      p_ubicacion_id, p_tipo_comprobante, v_subtotal, v_igv, v_total_items,
      v_venta_id, p_cliente_tipo_doc, p_cliente_num_doc, p_cliente_nombre, p_items
    );
  end if;

  return v_venta_id;
end;
$$;

-- Los permisos de siempre (20260922231700): solo `authenticated`, sin PUBLIC ni `anon`.
revoke all on function retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text, text, uuid, text, numeric, uuid, text, boolean, boolean) from public, anon;
grant execute on function retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text, text, uuid, text, numeric, uuid, text, boolean, boolean) to authenticated;

-- ---------- 9. fn_club_avisos_pendientes: Clientas ▸ Avisos (Avisos del club) ----------
-- PROMETE (G-8, CL-20, CL-21): los mensajes por mandar HOY a las socias de esa tienda (`club_ubicacion_id`; sin ella, su
--   sede, la de la 1f) que tienen publicidad vigente y celular, ni archivadas ni anonimizadas. Una fila por aviso, con su
--   texto listo (la plantilla `aviso_*` vigente con sus marcadores completos) y un detalle para la encargada:
--   · cumpleanos: desde el día 1 de su mes, con el cupón sin canjear; uno por año (referencia = el año);
--   · aniversario: con el vale disponible; uno por vale (referencia = el año de club);
--   · rebaja: una prenda con campaña vigente hoy, con stock libre en esa tienda, de una categoría y talla que ella compró
--     (su talla deducida); una por campaña (referencia = etiqueta:vigente_desde). La de mayor %;
--   · novedades: lo que llegó a esa tienda en los últimos 14 días y sigue a la venta allí (hasta tres nombres en el
--     detalle); a lo más una cada 7 días (referencia = la semana ISO).
--   Rebaja y novedades son promocionales: fuera del grupo testigo (1 de cada 5, fijo) y con el tope de 2 al mes (lo que le
--   queda, primero la rebaja). Cumpleaños y aniversario son promesas del club: sin testigo ni tope. Lo que ya se mandó y no
--   se deshizo no vuelve a salir.
-- ASUME: el módulo «Avisos del club» (42501 avisos_club_sin_modulo) y que la cuenta opera esa tienda.
create or replace function retail.fn_club_avisos_pendientes(p_ubicacion_id uuid)
returns table (clienta_id uuid, nombre text, telefono text, tipo text, referencia text, texto text, detalle text)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
#variable_conflict use_column
declare
  v_hoy date := retail.fn_hoy_lima();
  v_anio integer := extract(year from retail.fn_hoy_lima())::integer;
  v_mes_desde timestamptz := date_trunc('month', retail.fn_hoy_lima()::timestamp) at time zone 'America/Lima';
  v_semana text := to_char(retail.fn_hoy_lima(), 'IYYY-"S"IW');
  v_tienda text;
  v_pct numeric;
  v_t_cumple text;
  v_t_aniv text;
  v_t_novedades text;
  v_t_rebaja text;
  v_llegadas text;
begin
  perform retail.fn_exigir_modulo('avisos_club');
  if not retail.fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No puedes ver los avisos de esa tienda.' using errcode = '42501';
  end if;
  v_tienda := (select u.nombre from retail.ubicaciones u where u.id = p_ubicacion_id and u.tipo = 'tienda');
  if v_tienda is null then
    return;
  end if;
  v_pct := (select b.pct from retail.fn_club_beneficios() b);
  v_t_cumple := (select t.texto from retail.club_textos t where t.tipo = 'aviso_cumpleanos' order by t.version desc limit 1);
  v_t_aniv := (select t.texto from retail.club_textos t where t.tipo = 'aviso_aniversario' order by t.version desc limit 1);
  v_t_novedades := (select t.texto from retail.club_textos t where t.tipo = 'aviso_novedades' order by t.version desc limit 1);
  v_t_rebaja := (select t.texto from retail.club_textos t where t.tipo = 'aviso_rebaja' order by t.version desc limit 1);

  -- Lo que llegó a esta tienda en 14 días y sigue con stock libre aquí (igual para todas): hasta tres, lo último primero.
  v_llegadas := (
    select string_agg(x.referencia, ', ' order by x.llego desc)
      from (select p.referencia, max(m.created_at) as llego
              from retail.movimientos m
              join retail.variantes v on v.id = m.variante_id
              join retail.productos p on p.id = v.producto_id
             where m.ubicacion_id = p_ubicacion_id
               and m.created_at >= now() - interval '14 days'
               and retail.fn_es_llegada(m.tipo, m.motivo, m.lote_id, m.produccion_id, m.transferencia_recepcion_id)
               and m.motivo is distinct from 'carga_inicial'
               and not p.es_prueba
               and exists (select 1 from retail.stock s
                            where s.ubicacion_id = p_ubicacion_id and s.variante_id in (select w.id from retail.variantes w where w.producto_id = p.id)
                              and s.cantidad - s.cantidad_apartada > 0)
             group by p.id, p.referencia
             order by max(m.created_at) desc
             limit 3) x);

  return query
  with socias as (
    select c.id, c.nombre as nombre_completo, c.telefono_whatsapp as tel, c.cumple_mes,
           retail.fn_club_nombre_de_pila(c.nombre) as pila, retail.fn_club_es_testigo(c.id) as testigo
      from retail.clientas c
     where c.club_desde is not null and c.publicidad_desde is not null
       and not c.anonimizada and c.archivada_en is null and c.fusionada_en_id is null
       and c.telefono_whatsapp is not null
       and coalesce(c.club_ubicacion_id, (select rc.su_sede_id from retail.fn_club_resumen_compras(c.id) rc)) = p_ubicacion_id
  ),
  vivos as (
    select e.clienta_id as cid, e.tipo as etipo, e.referencia as eref, e.creado_en
      from retail.club_avisos_enviados e
     where e.deshecho_en is null and e.clienta_id in (select s.id from socias s)
  ),
  cumple as (
    select s.id, 'cumpleanos'::text as atipo, v_anio::text as aref,
           replace(replace(replace(v_t_cumple, '{nombre}', s.pila), '{pct}', trim_scale(v_pct)::text), '{tienda}', v_tienda) as atexto,
           'Cupón de cumpleaños: ' || trim_scale(v_pct)::text || ' % en una compra este mes' as adetalle,
           1 as orden, s.nombre_completo, s.tel
      from socias s
     where v_t_cumple is not null
       and s.cumple_mes = extract(month from v_hoy)
       and not exists (select 1 from retail.club_canjes k
                        where k.clienta_id = s.id and k.tipo = 'cumpleanos' and k.anio = v_anio and k.anulado_en is null)
       and not exists (select 1 from vivos w where w.cid = s.id and w.etipo = 'cumpleanos' and w.eref = v_anio::text)
  ),
  aniv as (
    select s.id, 'aniversario'::text as atipo, a.vale_anio_club::text as aref,
           replace(replace(replace(replace(v_t_aniv, '{nombre}', s.pila), '{monto}', retail.fn_club_soles_texto(a.vale_monto)),
                           '{vence}', retail.fn_club_fecha_texto(a.vale_vence)), '{tienda}', v_tienda) as atexto,
           'Vale de aniversario de S/ ' || retail.fn_club_soles_texto(a.vale_monto) || ' (año ' || a.vale_anio_club
             || '), hasta el ' || retail.fn_club_fecha_texto(a.vale_vence) as adetalle,
           2 as orden, s.nombre_completo, s.tel
      from socias s
      cross join lateral retail.fn_club_aniversario_calculo(s.id) a
     where v_t_aniv is not null and a.vale_disponible
       and not exists (select 1 from vivos w where w.cid = s.id and w.etipo = 'aniversario' and w.eref = a.vale_anio_club::text)
  ),
  -- Su talla deducida por categoría: la de su compra completada más reciente de esa categoría (deducirTallas, sobre las
  -- mismas filas que fn_clienta_compras). Solo de quienes pueden recibir una rebaja.
  tallas as (
    select distinct on (x.cid, x.categoria_id) x.cid, x.categoria_id, x.talla_id
      from (select v.cliente_id as cid, pr.categoria_id, va.talla_id, v.created_at, vi.id as item_id
              from retail.ventas v
              join retail.venta_items vi on vi.venta_id = v.id
              join retail.variantes va on va.id = vi.variante_id
              join retail.productos pr on pr.id = va.producto_id
             where v.estado = 'completada'
               and v.cliente_id in (select s.id from socias s where not s.testigo)
               and pr.categoria_id is not null and va.talla_id is not null) x
     order by x.cid, x.categoria_id, x.created_at desc, x.item_id
  ),
  -- Lo que está en campaña hoy (la que cobra la caja) con stock libre en esta tienda.
  ofertas as (
    select cv.etiqueta_id, cv.descuento_pct, e.vigente_desde, pr.categoria_id, va.talla_id, pr.referencia as prenda,
           ta.valor as talla
      from retail.campanas_vigentes() cv
      join retail.etiquetas e on e.id = cv.etiqueta_id
      join retail.variantes va on va.id = cv.variante_id
      join retail.productos pr on pr.id = va.producto_id
      join retail.tallas ta on ta.id = va.talla_id
     where not pr.es_prueba
       and exists (select 1 from retail.stock st
                    where st.variante_id = va.id and st.ubicacion_id = p_ubicacion_id and st.cantidad - st.cantidad_apartada > 0)
  ),
  rebaja as (
    select distinct on (s.id) s.id, 'rebaja'::text as atipo,
           o.etiqueta_id::text || ':' || coalesce(o.vigente_desde::text, '-') as aref,
           replace(replace(replace(replace(v_t_rebaja, '{nombre}', s.pila), '{prenda}', o.prenda),
                           '{pct}', trim_scale(o.descuento_pct)::text), '{tienda}', v_tienda) as atexto,
           o.prenda || ' talla ' || o.talla || ': ' || trim_scale(o.descuento_pct)::text || ' % menos' as adetalle,
           3 as orden, s.nombre_completo, s.tel
      from socias s
      join tallas t on t.cid = s.id
      join ofertas o on o.categoria_id = t.categoria_id and o.talla_id = t.talla_id
     where v_t_rebaja is not null and not s.testigo
       and not exists (select 1 from vivos w
                        where w.cid = s.id and w.etipo = 'rebaja'
                          and w.eref = o.etiqueta_id::text || ':' || coalesce(o.vigente_desde::text, '-'))
     order by s.id, o.descuento_pct desc, o.prenda, o.etiqueta_id
  ),
  novedades as (
    select s.id, 'novedades'::text as atipo, v_semana as aref,
           replace(replace(v_t_novedades, '{nombre}', s.pila), '{tienda}', v_tienda) as atexto,
           'Llegó: ' || v_llegadas as adetalle,
           4 as orden, s.nombre_completo, s.tel
      from socias s
     where v_t_novedades is not null and v_llegadas is not null and not s.testigo
       and not exists (select 1 from vivos w where w.cid = s.id and w.etipo = 'novedades' and w.creado_en > now() - interval '7 days')
  ),
  -- CL-21: a lo más 2 promocionales en el mes calendario de Lima (los no deshechos ya enviados cuentan).
  promos_del_mes as (
    select w.cid, count(*)::integer as enviadas
      from vivos w where w.etipo in ('rebaja', 'novedades') and w.creado_en >= v_mes_desde
     group by w.cid
  ),
  promos as (
    select p.*, row_number() over (partition by p.id order by p.orden) as puesto
      from (select * from rebaja union all select * from novedades) p
  ),
  todo as (
    select * from cumple
    union all
    select * from aniv
    union all
    select p.id, p.atipo, p.aref, p.atexto, p.adetalle, p.orden, p.nombre_completo, p.tel
      from promos p
      left join promos_del_mes m on m.cid = p.id
     where p.puesto <= 2 - coalesce(m.enviadas, 0)
  )
  select t.id, t.nombre_completo, t.tel, t.atipo, t.aref, t.atexto, t.adetalle
    from todo t
   order by t.orden, t.nombre_completo, t.id;
end;
$$;

comment on function retail.fn_club_avisos_pendientes(uuid) is
  'Clientas ▸ Avisos (ADR-0288 G-8): los mensajes del club por mandar hoy a las socias con publicidad de esa tienda (club_ubicacion_id; sin ella, su sede): cumpleanos (su mes, cupón sin canjear, uno por año), aniversario (vale disponible, uno por vale), rebaja (campaña vigente con stock libre aquí en su talla deducida, una por campaña) y novedades (llegadas de 14 días con stock libre, una cada 7 días). Rebaja y novedades: sin el grupo testigo (CL-20) y con el tope de 2 al mes (CL-21). Con el texto de la plantilla aviso_* completo. Lectura (prefijo fn_). Módulo «Avisos del club».';

-- ---------- 10. registrar_aviso_enviado y deshacer_aviso_enviado (Avisos del club) ----------
-- PROMETE: anota que se mandó un aviso (la encargada tocó «Enviar»): a qué número (el celular de la ficha ahora), con qué
--   texto, desde qué tienda, quién (el responsable del combo) y cuándo. Lo que la pantalla no puede saltarse: una socia con
--   publicidad (`aviso_sin_publicidad`), un texto que dice cómo darse de baja (`aviso_sin_baja`), el grupo testigo
--   (`aviso_grupo_testigo`) y el tope de 2 promocionales al mes (`aviso_tope_mes`) en rebaja y novedades. Repetido (misma
--   clienta, tipo y referencia, sin deshacer) devuelve el mismo id sin anotar otro: dos toques no son dos avisos.
create or replace function retail.registrar_aviso_enviado(p_clienta_id uuid, p_tipo text, p_referencia text, p_texto text, p_ubicacion_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_persona uuid;
  v_referencia text := nullif(btrim(coalesce(p_referencia, '')), '');
  v_texto text := nullif(btrim(coalesce(p_texto, '')), '');
  v_telefono text;
  v_con_publicidad boolean;
  v_id uuid;
  v_mes_desde timestamptz := date_trunc('month', retail.fn_hoy_lima()::timestamp) at time zone 'America/Lima';
begin
  perform retail.fn_exigir_modulo('avisos_club');
  v_persona := retail.fn_actor_persona_id(true);
  if v_persona is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  if p_tipo is null or p_tipo not in ('cumpleanos', 'aniversario', 'novedades', 'rebaja') or v_referencia is null
     or v_texto is null or p_clienta_id is null then
    raise exception 'Faltan datos del aviso: actualiza la lista.' using errcode = '22023', hint = 'aviso_invalido';
  end if;
  if not retail.fn_puede_operar_ubicacion(p_ubicacion_id)
     or not exists (select 1 from retail.ubicaciones u where u.id = p_ubicacion_id and u.tipo = 'tienda') then
    raise exception 'No puedes mandar avisos desde esa tienda.' using errcode = '42501';
  end if;
  -- Ley 29733 (baja sencilla): todo mensaje dice cómo dejar de recibirlos.
  if position('responde BAJA' in v_texto) = 0 then
    raise exception 'El mensaje tiene que decir cómo darse de baja («responde BAJA»).' using errcode = '22023', hint = 'aviso_sin_baja';
  end if;

  -- Uno a la vez por clienta: el tope del mes y el repetido se cuentan sin que otro «Enviar» se cruce.
  perform pg_advisory_xact_lock(hashtextextended('retail.club_aviso:' || p_clienta_id::text, 0));

  v_con_publicidad := (select c.club_desde is not null and c.publicidad_desde is not null and not c.anonimizada
                              and c.archivada_en is null and c.fusionada_en_id is null and c.telefono_whatsapp is not null
                         from retail.clientas c where c.id = p_clienta_id);
  if not coalesce(v_con_publicidad, false) then
    raise exception 'Esta clienta ya no recibe mensajes del club (no es socia con WhatsApp o pidió BAJA).'
      using errcode = 'P0001', hint = 'aviso_sin_publicidad';
  end if;
  v_telefono := (select c.telefono_whatsapp from retail.clientas c where c.id = p_clienta_id);

  v_id := (select e.id from retail.club_avisos_enviados e
            where e.clienta_id = p_clienta_id and e.tipo = p_tipo and e.referencia = v_referencia and e.deshecho_en is null);
  if v_id is not null then
    return v_id;
  end if;

  if p_tipo in ('novedades', 'rebaja') then
    if retail.fn_club_es_testigo(p_clienta_id) then
      raise exception 'Esta socia es del grupo de comparación del club: no recibe novedades ni rebajas.'
        using errcode = 'P0001', hint = 'aviso_grupo_testigo';
    end if;
    if (select count(*) from retail.club_avisos_enviados e
         where e.clienta_id = p_clienta_id and e.tipo in ('novedades', 'rebaja') and e.deshecho_en is null
           and e.creado_en >= v_mes_desde) >= 2 then
      raise exception 'Esta socia ya recibió 2 promociones este mes.' using errcode = 'P0001', hint = 'aviso_tope_mes';
    end if;
  end if;

  begin
    insert into retail.club_avisos_enviados (clienta_id, tipo, referencia, telefono, texto, ubicacion_id, enviado_por)
    values (p_clienta_id, p_tipo, v_referencia, v_telefono, v_texto, p_ubicacion_id, v_persona)
    returning id into v_id;
  exception when unique_violation then
    v_id := (select e.id from retail.club_avisos_enviados e
              where e.clienta_id = p_clienta_id and e.tipo = p_tipo and e.referencia = v_referencia and e.deshecho_en is null);
  end;

  -- La actividad, sin datos de la clienta (quién es queda en registro_id).
  perform retail.fn_actividad_anotar(
    'avisos_club', 'aviso_enviado', 'mandó por WhatsApp un aviso del club (' || p_tipo || ') a una socia',
    v_persona, null, p_ubicacion_id, null, 'club_avisos_enviados', v_id::text, now(),
    jsonb_build_object('tipo', p_tipo), 'vivo'
  );
  return v_id;
end;
$$;

comment on function retail.registrar_aviso_enviado(uuid, text, text, text, uuid) is
  'Clientas ▸ Avisos, «Enviar» (ADR-0288 G-8): anota el aviso (número de la ficha, texto, tienda, responsable). Exige socia con publicidad (aviso_sin_publicidad), «responde BAJA» en el texto (aviso_sin_baja) y, en rebaja y novedades, fuera del grupo testigo (aviso_grupo_testigo) y dentro del tope de 2 al mes (aviso_tope_mes). Repetido devuelve el mismo id. Módulo «Avisos del club»; firma con el responsable del combo.';

-- PROMETE: «Deshacer» dentro de 10 minutos (la encargada tocó «Enviar» y no lo mandó): marca deshecho_en y quién; el aviso
--   vuelve a la lista y deja de contar para el tope. Ya deshecho: no hace nada. Pasados 10 minutos: `aviso_fuera_de_plazo`.
create or replace function retail.deshacer_aviso_enviado(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_persona uuid;
  v_creado timestamptz;
  v_deshecho timestamptz;
  v_ubicacion uuid;
begin
  perform retail.fn_exigir_modulo('avisos_club');
  v_persona := retail.fn_actor_persona_id(true);
  if v_persona is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  select e.creado_en, e.deshecho_en, e.ubicacion_id into v_creado, v_deshecho, v_ubicacion
    from retail.club_avisos_enviados e where e.id = p_id for update;
  if v_creado is null then
    raise exception 'Ese aviso ya no está: actualiza la lista.' using errcode = 'P0001', hint = 'aviso_no_existe';
  end if;
  if not retail.fn_puede_operar_ubicacion(v_ubicacion) then
    raise exception 'No puedes deshacer avisos de esa tienda.' using errcode = '42501';
  end if;
  if v_deshecho is not null then
    return;
  end if;
  if v_creado < now() - interval '10 minutes' then
    raise exception 'Ya pasaron más de 10 minutos: ese aviso queda como enviado.' using errcode = 'P0001', hint = 'aviso_fuera_de_plazo';
  end if;
  update retail.club_avisos_enviados set deshecho_en = now(), deshecho_por = v_persona where id = p_id;
  perform retail.fn_actividad_anotar(
    'avisos_club', 'aviso_deshecho', 'deshizo un aviso del club que no se mandó',
    v_persona, null, v_ubicacion, null, 'club_avisos_enviados', p_id::text, now(), '{}'::jsonb, 'vivo'
  );
end;
$$;

comment on function retail.deshacer_aviso_enviado(uuid) is
  'Clientas ▸ Avisos, «Deshacer» (ADR-0288 G-8): dentro de 10 minutos (aviso_fuera_de_plazo), marca el aviso como no enviado (vuelve a la lista, deja de contar para el tope). Ya deshecho: nada. aviso_no_existe. Módulo «Avisos del club»; firma con el responsable del combo.';

-- PROMETE (ajuste del contrato, a pedido de la pantalla de Avisos): cuántos avisos NO deshechos se anotaron HOY (fecha de
--   Lima) desde esa tienda, por tipo. Solo los tipos con al menos uno. Sin datos de ninguna clienta.
create or replace function retail.fn_club_avisos_enviados_hoy(p_ubicacion_id uuid)
returns table (tipo text, enviados integer)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
#variable_conflict use_column
begin
  perform retail.fn_exigir_modulo('avisos_club');
  if not retail.fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No puedes ver los avisos de esa tienda.' using errcode = '42501';
  end if;
  return query
  select e.tipo, count(*)::integer
    from retail.club_avisos_enviados e
   where e.ubicacion_id = p_ubicacion_id
     and e.deshecho_en is null
     and e.creado_en >= retail.fn_hoy_lima()::timestamp at time zone 'America/Lima'
     and e.creado_en < (retail.fn_hoy_lima() + 1)::timestamp at time zone 'America/Lima'
   group by e.tipo
   order by e.tipo;
end;
$$;

comment on function retail.fn_club_avisos_enviados_hoy(uuid) is
  'Clientas ▸ Avisos (ADR-0288 G-8): cuántos avisos no deshechos se anotaron hoy (Lima) desde esa tienda, por tipo. Lectura (prefijo fn_). Módulo «Avisos del club».';

-- ---------- 11. guardar_beneficios_club: Beneficios del club (solo el líder) ----------
-- PROMETE (G-13): guarda el % del cumpleaños (1–50), el umbral del aniversario (compras 1–100, S/ 1–100 000), los días del
--   vale (1–180) y la escala ([{anio: 1..5, monto}], los cinco años, montos > 0 que no bajan: los términos dicen que el vale
--   «crece cada año»), deja rastro en configuracion_historial y, si algo cambió, publica una versión nueva de `terminos`: la
--   vigente con el umbral y los días nuevos escritos (el % y la escala son marcadores, pero también cambian lo que ella
--   acepta, así que también publican versión). Si los términos vigentes no dicen el umbral como el v1, no adivina:
--   `terminos_no_reconocidos` (hay que publicar esa versión a mano). Sin cambios, no hace nada.
create or replace function retail.guardar_beneficios_club(p_pct numeric, p_compras integer, p_monto numeric, p_dias integer, p_escala jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_persona uuid;
  v_escala jsonb;
  v_escala_antes jsonb;
  v_antes record;
  v_version integer;
  v_texto text;
  v_nuevo text;
  r record;
  v_previo numeric := 0;
  v_n integer := 0;
begin
  if not retail.fn_es_lider() then
    raise exception 'Los beneficios del club los cambia el líder.' using errcode = '42501', hint = 'solo_lider';
  end if;
  v_persona := retail.fn_actor_persona_id(true);

  if p_pct is null or p_pct < 1 or p_pct > 50 then
    raise exception 'El %% del cumpleaños va de 1 a 50.' using errcode = '22023', hint = 'beneficios_invalidos', detail = 'pct';
  end if;
  if p_compras is null or p_compras < 1 or p_compras > 100 then
    raise exception 'Las compras del año van de 1 a 100.' using errcode = '22023', hint = 'beneficios_invalidos', detail = 'compras';
  end if;
  if p_monto is null or p_monto <= 0 or p_monto > 100000 or p_monto <> round(p_monto, 2) then
    raise exception 'El monto del año va de S/ 0.01 a S/ 100 000.' using errcode = '22023', hint = 'beneficios_invalidos', detail = 'monto';
  end if;
  if p_dias is null or p_dias < 1 or p_dias > 180 then
    raise exception 'Los días para usar el vale van de 1 a 180.' using errcode = '22023', hint = 'beneficios_invalidos', detail = 'dias';
  end if;
  if p_escala is null or jsonb_typeof(p_escala) <> 'array' or jsonb_array_length(p_escala) <> 5 then
    raise exception 'La escala tiene los cinco años.' using errcode = '22023', hint = 'beneficios_invalidos', detail = 'escala';
  end if;
  begin
    for r in
      select (e ->> 'anio')::smallint as anio, (e ->> 'monto')::numeric as monto
        from jsonb_array_elements(p_escala) e
       order by (e ->> 'anio')::smallint
    loop
      v_n := v_n + 1;
      if r.anio is distinct from v_n or r.monto is null or r.monto <= 0 or r.monto > 100000 or r.monto <> round(r.monto, 2)
         or r.monto < v_previo then
        raise exception 'escala';
      end if;
      v_previo := r.monto;
    end loop;
  exception when others then
    raise exception 'La escala va del año 1 al 5, con montos mayores que cero que no bajan de un año al siguiente.'
      using errcode = '22023', hint = 'beneficios_invalidos', detail = 'escala';
  end;
  v_escala := (select jsonb_agg(jsonb_build_object('anio', (e ->> 'anio')::smallint, 'monto', round((e ->> 'monto')::numeric, 2))
                                order by (e ->> 'anio')::smallint)
                 from jsonb_array_elements(p_escala) e);

  select e.club_cumple_pct as pct, e.club_aniversario_compras as compras, e.club_aniversario_monto as monto,
         e.club_aniversario_dias as dias
    into v_antes
    from retail.configuracion_empresa e
     for update;
  if not found then
    raise exception 'Falta la configuración de la empresa (RUC y razón social): complétala antes.' using errcode = 'P0001';
  end if;
  v_escala_antes := coalesce((select jsonb_agg(jsonb_build_object('anio', s.anio, 'monto', s.monto) order by s.anio)
                                from retail.club_aniversario_escala s), '[]'::jsonb);
  if v_antes.pct = p_pct and v_antes.compras = p_compras and v_antes.monto = p_monto and v_antes.dias = p_dias
     and v_escala_antes = v_escala then
    return;
  end if;

  -- Los términos vigentes con el umbral y los días nuevos (las tres frases del v1; si no están, no se adivina).
  select t.version, t.texto into v_version, v_texto
    from retail.club_textos t where t.tipo = 'terminos' order by t.version desc limit 1;
  if v_version is null
     or (select count(*) from regexp_matches(v_texto, 'al menos\s+[0-9]+\s+compras', 'g')) <> 1
     or (select count(*) from regexp_matches(v_texto, 'al menos\s+S/\s*[0-9]+(?:[.,][0-9]+)?\s+en compras', 'g')) <> 1
     or (select count(*) from regexp_matches(v_texto, 'Tienes\s+[0-9]+\s+días desde tu aniversario', 'g')) <> 1 then
    raise exception 'Los términos vigentes no dicen el umbral ni los días como el texto v1: publica la versión nueva a mano.'
      using errcode = 'P0001', hint = 'terminos_no_reconocidos';
  end if;
  v_nuevo := regexp_replace(v_texto, '(al menos\s+)[0-9]+(\s+compras)', '\1' || p_compras || '\2');
  v_nuevo := regexp_replace(v_nuevo, '(al menos\s+S/\s*)[0-9]+(?:[.,][0-9]+)?(\s+en compras)', '\1' || retail.fn_club_soles_texto(p_monto) || '\2');
  v_nuevo := regexp_replace(v_nuevo, '(Tienes\s+)[0-9]+(\s+días desde tu aniversario)', '\1' || p_dias || '\2');

  update retail.configuracion_empresa set
    club_cumple_pct = p_pct,
    club_aniversario_compras = p_compras,
    club_aniversario_monto = p_monto,
    club_aniversario_dias = p_dias,
    updated_at = now();
  insert into retail.club_aniversario_escala (anio, monto)
  select (e ->> 'anio')::smallint, round((e ->> 'monto')::numeric, 2) from jsonb_array_elements(v_escala) e
  on conflict (anio) do update set monto = excluded.monto;

  insert into retail.club_textos (tipo, version, texto, creado_por) values ('terminos', v_version + 1, v_nuevo, v_persona);

  insert into retail.configuracion_historial (que, detalle, hecho_por)
  values ('beneficios_club',
          jsonb_build_object('antes', jsonb_build_object('pct', v_antes.pct, 'compras', v_antes.compras, 'monto', v_antes.monto,
                                                         'dias', v_antes.dias, 'escala', v_escala_antes),
                             'despues', jsonb_build_object('pct', p_pct, 'compras', p_compras, 'monto', p_monto, 'dias', p_dias,
                                                           'escala', v_escala),
                             'terminos_version', v_version + 1),
          v_persona);
end;
$$;

comment on function retail.guardar_beneficios_club(numeric, integer, numeric, integer, jsonb) is
  'Beneficios del club (ADR-0288 G-13), solo el líder: % del cumpleaños, umbral del aniversario (compras y monto netos del año), días del vale y escala de los cinco años (que no baja). Si algo cambió, publica una versión nueva de los términos (con el umbral y los días escritos) y deja rastro en configuracion_historial. Hints: solo_lider, beneficios_invalidos (detail = el campo), terminos_no_reconocidos.';

-- ---------- 12. fn_club_anonimizar_inactivas: la conservación (servidor, cron diario) ----------
-- PROMETE (G-15, Ley 29733): anonimiza, con la rutina de archivar_clienta (fn_clienta_anonimizar, sin persona y con su
--   nota), toda ficha sin anonimizar cuya última actividad —la última compra completada, o si no la hay, desde que se
--   registró o se unió al club (lo más reciente de las tres)— tiene más de 3 años. No toca una ficha con un apartado abierto
--   (se le debe una prenda) ni una que alguien está usando ahora (`skip locked`: queda para mañana). Además vacía el
--   celular de los intentos del cartel de más de un día (su único dato personal). Devuelve cuántas fichas anonimizó.
create or replace function retail.fn_club_anonimizar_inactivas()
returns integer
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  r record;
  v_n integer := 0;
begin
  for r in
    select c.id
      from retail.clientas c
     where not c.anonimizada
       and c.fusionada_en_id is null
       and greatest(c.created_at, coalesce(c.club_desde, c.created_at),
                    coalesce((select max(v.created_at) from retail.ventas v where v.cliente_id = c.id and v.estado = 'completada'),
                             c.created_at)) < now() - interval '3 years'
       and not exists (select 1 from retail.separaciones s where s.clienta_id = c.id and s.estado = 'abierta')
     order by c.id
       for update of c skip locked
  loop
    perform retail.fn_clienta_anonimizar(r.id, null, true);
    v_n := v_n + 1;
  end loop;

  update retail.club_intentos_registro i set celular = null
   where i.celular is not null and i.creado_en < now() - interval '1 day';

  return v_n;
end;
$$;

comment on function retail.fn_club_anonimizar_inactivas() is
  'La conservación del club (ADR-0288 G-15): anonimiza las fichas sin compra en 3 años (sin compras: 3 años desde que se registró o se unió), con la rutina de archivar_clienta, sin persona y con su nota; no toca una con apartado abierto. Vacía el celular de los intentos del cartel de más de un día. Devuelve cuántas anonimizó. Solo el servidor (cron diario con CRON_SECRET).';

-- ---------- 13. registrar_baja_whatsapp: también desde Avisos del club ----------
-- Sobre la definición viva (la de la 1b, md5 4c7d6ca5…). Cambia SOLO la puerta: el módulo «Clientas» o «Avisos del club».
create or replace function retail.registrar_baja_whatsapp(p_telefono text, p_ubicacion_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_persona uuid;
  v_celular text;
  r record;
  v_fichas integer := 0;
begin
  -- ADR-0288 G-7 (tanda 1g): la BAJA se anota en la ficha (Clientas) o en Avisos (Avisos del club). Sin ninguno de los
  -- dos, el rechazo de siempre (42501 clientas_sin_modulo).
  if not (retail.fn_ve_modulo('clientas') or retail.fn_ve_modulo('avisos_club')) then
    perform retail.fn_exigir_modulo('clientas');
  end if;
  v_persona := retail.fn_actor_persona_id(true);
  if v_persona is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  v_celular := retail.fn_exigir_celular(p_telefono);

  -- En orden de id: dos BAJAs a la vez toman las mismas fichas en el mismo orden (sin deadlock).
  for r in
    select c.id, c.publicidad_desde
      from retail.clientas c
     where not c.anonimizada
       and (c.telefono_whatsapp = v_celular or retail.fn_celular_normalizado(c.telefono_whatsapp) = v_celular)
     order by c.id
       for update
  loop
    v_fichas := v_fichas + 1;
    if r.publicidad_desde is not null then
      insert into retail.club_permisos (clienta_id, finalidad, accion, medio, ubicacion_id, registrado_por)
      values (r.id, 'publicidad_whatsapp', 'revoca', 'baja_whatsapp', p_ubicacion_id, v_persona);
      update retail.clientas set publicidad_desde = null where id = r.id;
      perform retail.fn_actividad_anotar(
        'clientas', 'baja_whatsapp', 'registró la BAJA de publicidad por WhatsApp de una clienta',
        v_persona, null, p_ubicacion_id, null, 'clientas', r.id::text, now(), '{}'::jsonb, 'vivo'
      );
    end if;
  end loop;

  return v_fichas;
end;
$$;

comment on function retail.registrar_baja_whatsapp(text, uuid) is
  'Escribió BAJA: quita la publicidad (medio baja_whatsapp) de toda ficha con ese celular, desde hoy y en todas las tiendas; su club sigue. Devuelve cuántas fichas tienen ese número. Módulo «Clientas» o «Avisos del club» (ADR-0288 G-7); firma con el responsable del combo.';

-- ---------- 14. retiro (sin borrar funciones): el club ya no se arma en caja ni por el QR personal (G-1, G-2, G-7) ----------
revoke execute on function
  retail.unirse_al_club(uuid, text, smallint, smallint, smallint, text, uuid, uuid, integer),
  retail.crear_invitacion_club(uuid, uuid),
  retail.registrar_mensaje_publicidad(uuid, text, uuid),
  retail.registrar_desde_whatsapp(text, text, text, text, uuid)
from public, anon, authenticated;
revoke execute on function
  retail.fn_invitacion_club(text),
  retail.confirmar_invitacion_club(text, integer)
from public, anon, authenticated;

-- ---------- 15. permisos de las funciones nuevas ----------
-- Servidor: solo la llave de servicio (el servidor de la web), nunca anon ni authenticated.
revoke all on function
  retail.club_intento(text, text, text, text),
  retail.registrarse_en_el_club(uuid, text, text, text, text, date, text, boolean, boolean, boolean, jsonb, boolean),
  retail.fn_club_anonimizar_inactivas()
from public, anon, authenticated;
grant execute on function
  retail.club_intento(text, text, text, text),
  retail.registrarse_en_el_club(uuid, text, text, text, text, date, text, boolean, boolean, boolean, jsonb, boolean),
  retail.fn_club_anonimizar_inactivas()
to service_role;

-- La página pública: anon, y authenticated por si la abre un celular con la sesión del ERP. (`anon` necesita USAGE sobre
-- `retail`: lo tiene desde la 1b.)
revoke all on function retail.fn_club_pagina(uuid), retail.fn_club_textos_legales() from public;
grant execute on function retail.fn_club_pagina(uuid), retail.fn_club_textos_legales() to anon, authenticated;

-- Las de la tienda: authenticated (cada una exige su módulo por dentro).
revoke all on function
  retail.fn_club_aniversario(uuid),
  retail.fn_club_avisos_pendientes(uuid),
  retail.fn_club_avisos_enviados_hoy(uuid),
  retail.registrar_aviso_enviado(uuid, text, text, text, uuid),
  retail.deshacer_aviso_enviado(uuid),
  retail.guardar_beneficios_club(numeric, integer, numeric, integer, jsonb)
from public, anon;
grant execute on function
  retail.fn_club_aniversario(uuid),
  retail.fn_club_avisos_pendientes(uuid),
  retail.fn_club_avisos_enviados_hoy(uuid),
  retail.registrar_aviso_enviado(uuid, text, text, text, uuid),
  retail.deshacer_aviso_enviado(uuid),
  retail.guardar_beneficios_club(numeric, integer, numeric, integer, jsonb)
to authenticated;

-- archivar_clienta y registrar_baja_whatsapp: los de siempre (create or replace los conserva; se repiten por claridad).
revoke execute on function retail.archivar_clienta(uuid, text, boolean, integer), retail.registrar_baja_whatsapp(text, uuid) from public, anon;
grant execute on function retail.archivar_clienta(uuid, text, boolean, integer), retail.registrar_baja_whatsapp(text, uuid) to authenticated;

-- ---------- 16. una sola firma de registrar_venta ----------
do $una_firma$
declare
  v_firmas text;
  v_cuantas integer;
begin
  select string_agg(p.oid::regprocedure::text, ', '), count(*)
    into v_firmas, v_cuantas
    from pg_proc p
   where p.pronamespace = 'retail'::regnamespace and p.proname = 'registrar_venta';
  if v_cuantas <> 1
     or to_regprocedure('retail.registrar_venta(uuid,jsonb,jsonb,uuid,uuid,text,text,text,text,text,text,uuid,text,numeric,uuid,text,boolean,boolean)') is null then
    raise exception 'registrar_venta tiene que quedar con UNA firma (la de 18 parámetros) y hay: %', v_firmas;
  end if;
end
$una_firma$;

reset lock_timeout;
notify pgrst, 'reload schema';
-- ============================== FIN DE LA PARTE 8 ==============================
