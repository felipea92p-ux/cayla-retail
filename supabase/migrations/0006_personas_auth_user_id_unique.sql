-- Un auth_user_id de Supabase Auth debe mapear a una sola persona, nunca a varias:
-- requirePersonaActual() (apps/web/lib/persona.ts) usa .single() y falla con error
-- (no "cuál elijo") si hay más de una fila — el mismo error que "no existe ninguna".
-- Encontrado en producción: un INSERT corrido más de una vez dejó 4 filas para el
-- mismo auth_user_id, dejando esa cuenta inutilizable pese a estar "dada de alta".
-- Este constraint hace que ese estado sea imposible de crear de nuevo, en vez de
-- confiar en que nadie vuelva a pegar el INSERT dos veces.

alter table personas
  add constraint personas_auth_user_id_unique unique (auth_user_id);
