-- 20261101004000_trafico_web_funciones_sin_ajustes.sql — CAYLA V2 · Tienda web ▸ Tráfico (ADR-0495)
--
-- QUÉ ARREGLA. Tráfico mostraba «No se pudo leer el tráfico de la tienda web» a ratos. `resumen_trafico_web` tardaba ~9,9 s en producción
-- (2026-10-31, con 475 filas y 185 visitantes) y Supabase corta a quien tiene sesión a los 8 s: según el momento entraba o no.
--
-- POR QUÉ TARDABA. `fn_trafico_web_personas` y `fn_trafico_web_prendas` eran `security definer` con `set search_path`. Medido en
-- producción con el mismo cuerpo, la misma tabla y 90 días: sin ninguno de los dos ajustes, 10,6 ms; con solo `security definer`,
-- 1.320 ms; con solo `set search_path`, 1.168 ms; con los dos (la real), 1.226 ms. Cualquiera de los dos basta, y la pantalla llama a
-- `fn_trafico_web_personas` unas 10 veces por apertura (y a `fn_trafico_web_prendas` 3, que la llama a su vez). No es el tamaño de la
-- tabla ni la lógica: el cuerpo instalado es idéntico al del repo (misma huella md5) y corre en 7 ms escrito directo.
--
-- QUÉ HACE. Les quita los dos ajustes. No cambia quién puede ver qué:
--   · Las dos las llama SOLO `resumen_trafico_web`, que sigue siendo `security definer` con `search_path = retail, public`; una función
--     que se llama desde otra hereda ese rol (`postgres`) y ese `search_path`, así que leen las mismas filas que antes.
--   · A ninguna la puede ejecutar `anon` ni `authenticated`: el `revoke` de 20261023231000 sigue en pie. Quien entra por
--     `resumen_trafico_web` pasa por su chequeo `fn_ve_modulo('trafico')`, como siempre.
--
-- MEDIDO ANTES DE ESCRIBIRLA (producción, con `begin … rollback`): `resumen_trafico_web(current_date - 29, current_date)` pasó de
-- 9.893 ms a 436 ms con este mismo cambio.
--
-- QUÉ NO HACE. No toca datos, tablas ni políticas (`alter function` solo toma esas dos funciones): se puede pegar entera, de una vez.
-- Se puede pegar dos veces. Para volver atrás: `alter function … security definer; alter function … set search_path = retail, public;`.
-- Una función nueva de Tráfico que solo se llame desde `resumen_trafico_web` NO lleva `security definer` ni `set search_path`.

set lock_timeout = '3s';

alter function retail.fn_trafico_web_personas(date, date, text, text) security invoker;
alter function retail.fn_trafico_web_personas(date, date, text, text) reset search_path;
alter function retail.fn_trafico_web_prendas(date, date, text, text) security invoker;
alter function retail.fn_trafico_web_prendas(date, date, text, text) reset search_path;

reset lock_timeout;
