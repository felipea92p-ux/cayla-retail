/**
 * Una unión de fichas de ANTES, armada a mano, para las pruebas de base (ADR-0288 D-99; Felipe 2026-10-14).
 *
 * `unir_clientas` se borró en `20261015054000_clientas_correo_unico_y_sin_unir_fichas.sql`: con el documento y el correo de una sola
 * persona no nacen fichas repetidas. En producción nunca se usó (`clientas_fusiones` vacía el 2026-10-14), pero lo que una unión
 * dejaba se sigue leyendo y se sigue cuidando: la foto de la ficha que se fue (`clientas_fusiones`), que anonimizar limpia; la
 * ficha que se fue, anonimizada con `fusionada_en_id` (el candado `clientas_fusionada_implica_anonimizada`); y la venta de una ficha
 * unida, que va a la que quedó (`registrar_venta`). Para seguir probando eso sin la función, esto deja lo MISMO que dejaba ella en
 * esas dos tablas: la foto completa de la que se va y la que se va vacía, archivada y apuntando a la que queda.
 *
 * `queda` y `seVa` son expresiones SQL (una variable de psql como `:'x'`, o un id entre comillas). Solo se usa dentro de una
 * transacción que termina en ROLLBACK.
 */
export function unionDeAntes(queda, seVa) {
  return `-- Una unión de antes (unir_clientas ya no existe): lo que dejaba, a mano.
insert into retail.clientas_fusiones (clienta_mantiene_id, clienta_fusionada_id, ficha_fusionada, fusionada_por)
  select ${queda}, c.id, to_jsonb(c), (select p.id from public.personas p where p.auth_user_id = '22222222-2222-4222-8222-000000000001')
    from retail.clientas c where c.id = ${seVa};
update retail.clientas set
  documento_numero = null, nombre = 'Clienta anonimizada', telefono_whatsapp = null, whatsapp_consentimiento_en = null,
  cumple_dia = null, cumple_mes = null, cumple_anio = null, tallas = null, club_desde = null, publicidad_desde = null,
  codigo_club = null, anonimizada = true, archivada_en = now(), motivo_archivo = 'Se unió a otra ficha de clienta (unir_clientas)',
  fusionada_en_id = ${queda}
 where id = ${seVa};
`;
}
