# ADR-0673 — La baja de un comprobante: la pide su sede, la confirma el servidor

- **Fecha:** 2026-11-17 · **Estado:** construido en la rama `claude/anular-comprobante-permisos`. La migración
  `20261117021000_baja_de_comprobante_sede_y_servidor.sql` se pega en producción con el OK de Felipe (2026-11-17), antes de publicar la web.
- **Decidió:** Felipe, 2026-11-17, eligiendo entre «sede + servidor» y «solo la sede».
- **Sigue a:** ADR-0016 (la baja anula la venta), ADR-0534 (anula quien ve Facturación), `20261007200000` (`fn_confirmar_baja_sunat`).

## Contexto

Anular un comprobante es irreversible ante SUNAT, y un comprobante es de una sede. La baja tiene dos momentos: alguien la **pide** (la
pantalla de Facturación llama a `/api/lucode/anular`, que se la pide a Lucode) y SUNAT la **confirma** (enseguida, o más tarde: lo
pregunta `/api/lucode/consultar-anulacion` o el barrido de `/api/lucode/reintentar`). Las tres rutas hablaban con la base con la sesión
de la persona, y la base guardaba el estado que la ruta le decía. Desde la base, una respuesta de SUNAT que pasó por el servidor y un
dato escrito por una sesión de persona se ven iguales; lo único que solo el servidor tiene es la llave de servicio.

## Decisión

1. **Pedir la baja es de la sede del comprobante.** `anular_comprobante` exige, además del módulo Facturación (ADR-0534),
   `fn_puede_operar_ubicacion(v_comp.ubicacion_id)`, como toda operación de una sede. Un líder opera todas.
2. **`anular_comprobante` solo pide.** Anota motivo, quién, cuándo y la respuesta de Lucode; el comprobante sigue «aceptado» con la baja en
   trámite. Su `p_confirmada` se queda en la firma (PostgREST y las anclas de ADR-0671 no cambian) y ya no cambia el estado.
3. **«Anulado» lo escribe solo el servidor:** `fn_confirmar_baja_sunat` acepta únicamente `service_role` y no confirma una baja que nadie
   pidió. La web la llama con `crearClienteAdmin()` desde `lib/confirmar-baja-sunat.ts`, y solo después de que Lucode respondió que SUNAT
   confirmó: en `/api/lucode/anular` (si SUNAT confirma al instante), en `/api/lucode/consultar-anulacion` y en `lib/consultar-comprobante.ts`.
4. **Si la confirmación no se puede escribir** (sin llave en el servidor, la base no responde), la baja queda en trámite y el barrido del
   cron la confirma al preguntarle a Lucode. La pantalla lo dice así; nunca se pide la baja otra vez.
5. `/api/lucode/consultar-anulacion` ya no pide el responsable del combo: confirmar no firma a nadie (quien pidió la baja quedó en
   `anulado_por`). La pantalla lo sigue enviando y no estorba.

## DESCARTÉ

- **Solo la sede:** dentro de su sede, una sesión seguiría pudiendo escribir «anulado» sin respuesta de SUNAT, con la venta viva (el estado
  imposible de ADR-0016).
- **Exigir que `p_respuesta` traiga la confirmación de Lucode:** ese JSON lo arma quien llama.
- **Rechazar `p_confirmada = true` con un error:** una web publicada antes que la migración quedaría con la baja pedida a SUNAT y sin
  guardar. Ignorarlo la deja en trámite, y el cron la confirma.
- **Que también el pedido pase por la llave de servicio:** cambia la firma de `anular_comprobante` (choca con ADR-0671) y saca la firma del
  responsable de la sesión de quien pide. Pedir una baja sin confirmarla no cambia nada ante SUNAT.

## Consecuencias

- **Orden de publicación:** la migración puede ir antes que la web. Con la web vieja, la baja confirmada al instante queda en trámite hasta
  la pasada del cron (cada 5 min) y el barrido de la pantalla registra un aviso en Sentry al no poder confirmar; con la web nueva, nada de eso.
- La web necesita `SUPABASE_SERVICE_ROLE_KEY` también para confirmar bajas (el cron de SUNAT ya la necesitaba).
- Pruebas: `pnpm pruebas:anular-comprobante-permisos` (nueva) y `pnpm pruebas:anular-venta-comprobante` (su escenario de la baja confirmada
  pasa a confirmar con la llave de servicio).
