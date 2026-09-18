-- ============================================================================
-- 20260918060000 — Estilo visual (color) por etiqueta
--
-- Felipe pidió color por etiqueta (ejemplo: badges de Shopify) y luego
-- confirmó "colores suaves dentro de nuestra paleta" — nunca color libre.
-- Con el brandbook CAYLA (rojo = acento sagrado, MÁX. 2 usos por pantalla,
-- nunca decoración — `MAX_ROJO_POR_PANTALLA` en design-tokens.ts) un badge
-- rojo por cada etiqueta de una grilla de 20 tarjetas violaría esa regla de
-- inmediato. Se usan los 3 tonos semánticos ya verificados por contraste
-- (2026-09-08, ver globals.css) que NO son el acento:
--   verde  #556e49 — "va bien/hecho", reusado acá para artesanal/calidad
--   ambar  #8c631f — "al filo/en proceso", reusado para rotación/urgencia
--   taupe  — SOLO bordes/tintes (taupe-profundo #805c4c es el que sirve de
--            texto), reusado para campaña/festividad
-- `neutral` (sin color, texto tinta normal) queda de default para lo que no
-- encaje en ninguna categoría — no todo necesita un color.
--
-- POR QUÉ UN CHECK DE 4 VALORES Y NO UN HEX LIBRE
--   Mismo argumento que "Para liquidar" (20260918030000): un campo abierto
--   es una invitación a que alguien meta un color fuera de la paleta la
--   primera vez que tenga prisa. El check constraint hace ese error
--   imposible en vez de confiar en que nadie lo cometa (principio 4).
-- ============================================================================

set search_path = retail, public, extensions;

alter table retail.etiquetas add column if not exists estilo text not null default 'neutral';
alter table retail.etiquetas add constraint etiquetas_estilo_valido
  check (estilo in ('neutral', 'urgencia', 'positivo', 'campana'));

comment on column retail.etiquetas.estilo is
  'Badge visual: neutral (sin color) | urgencia (ámbar, rotación) | positivo (verde, artesanal/calidad) | campana (taupe, festividad/campaña). Paleta cerrada a propósito — nunca color libre.';

-- Clasificación de las 20 etiquetas ya existentes.
update retail.etiquetas set estilo = 'urgencia'
  where nombre in ('Nuevo', 'Últimas unidades', 'Top ventas', 'Para liquidar');

update retail.etiquetas set estilo = 'positivo'
  where nombre in ('Hecho a mano', 'Pieza única', 'Reedición');

update retail.etiquetas set estilo = 'campana'
  where nombre in (
    'San Valentín', 'Día de la Madre', 'Día de la Mujer', 'Halloween', 'Navidad',
    'Fiestas Patrias', 'Black Friday', 'CyberWow', 'Aniversario CAYLA',
    'Galentine''s Day', 'Día Internacional del Gato', 'Día Internacional del Perro',
    'Día de la Tierra'
  );
