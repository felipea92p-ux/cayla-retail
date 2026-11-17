# ADR-0675 — Lo que respondió SUNAT lo escribe el servidor

- **Fecha:** 2026-11-17 · **Estado:** construido en la rama `claude/brave-goldstine-30992d`. La migración
  `20261117141000_transmision_la_escribe_el_servidor.sql` NO está en producción: va DESPUÉS de publicar la web (ver «Orden»). Huella viva de
  `actualizar_transmision_comprobante` en la copia de producción del 2026-11-16: `d80791c0…`; con la migración, `e20ebf49…`.
- **Decidió:** Felipe, 2026-11-17, eligiendo entre «solo el servidor escribe los tres estados» y «solo los estados finales».
- **Sigue a:** ADR-0386 (lo que SUNAT aceptó no retrocede), PL-113 (el cron de SUNAT con la llave de servicio, `20260924113817`),
  ADR-0378 (Lucode ya tiene el número), ADR-0673 (la baja la confirma el servidor: la misma regla para la anulación).

## Contexto

El estado de un comprobante ante SUNAT (`enviado`, `aceptado`, `rechazado`) el ERP lo toma de una sola fuente: lo que respondió Lucode. Lo
guarda `actualizar_transmision_comprobante`, que la llamaban la pantalla (envío al cobrar, «Reintentar ahora», el barrido) con la sesión de
la persona y el cron con la llave de servicio. Desde la base, una respuesta de Lucode que pasó por el servidor y un dato escrito por una
sesión de persona se ven iguales; lo único que solo el servidor tiene es la llave de servicio.

## Decisión

1. **`actualizar_transmision_comprobante` es solo de `service_role`** (42501 para cualquier otra sesión, líder incluido) y no se le da a
   `public`, `anon` ni `authenticated`. Con la llave de servicio nada cambia: el `for update`, la respuesta vieja que no pisa un aceptado
   (ADR-0386), los estados que admite y el disparador `comprobantes_estado_no_retrocede`.
2. **La web escribe con `crearClienteAdmin()` solo ese paso.** `transmitirComprobante`, `resolverYaEmitido` y `consultarComprobante`
   reciben un segundo cliente, `servidor` (tipo `ClienteServidor`): lo que se lee, y devolver a la cola (`fn_marcar_reintento_transmision`),
   sigue con la sesión, así que la base sigue decidiendo qué comprobantes puede transmitir cada cuenta.
3. **La llave se pide ANTES de llamar a Lucode.** `/api/lucode/emitir` y el `POST` de `/api/lucode/reintentar` crean el cliente de servicio
   antes de transmitir: sin llave responden 503 y no transmiten, porque lo que llega a SUNAT no se deshace y no se podría guardar. El
   comprobante sigue pendiente y lo toma la cola. El cron ya entraba con esa llave (`barrer(supabase, supabase, …)`).

## DESCARTÉ

- **Cerrar solo «aceptado» y «rechazado»:** «enviado» también saca al comprobante de la cola de reenvío.
- **Exigir que `p_respuesta_sunat` traiga algo de Lucode:** ese JSON lo arma quien llama, no prueba nada.
- **Crear el cliente de servicio dentro de `lib/transmitir-comprobante.ts`:** escondería que la ruta necesita la llave, y se crearía después
  de llamar a Lucode. Pasarlo explícito obliga a cada llamador a tenerlo antes de transmitir, y deja probar en vitest quién escribe.

## Orden

**Primero se publica la web, después se pega la migración.** La web nueva funciona con la base de antes (la llave de servicio ya pasaba el
candado) y con la nueva. Al revés, lo que se transmite desde una pantalla queda en SUNAT sin guardarse en el ERP, con su alerta, hasta que el
cron lo reenvía, Lucode dice «ya emitido» y lo guarda (ADR-0378).

## Consecuencias

- La web necesita `SUPABASE_SERVICE_ROLE_KEY` para transmitir desde una pantalla (el cron de SUNAT y las bajas de ADR-0673 ya la necesitaban).
- Pruebas: `pnpm pruebas:actualizar-transmision-permisos` (nueva, en el CI). Las suites que preparan un comprobante aceptado o rechazado
  (`sunat-estado-no-retrocede`, `sunat-reintento-por-cron`, `anular-venta-comprobante`, `notas-credito-serie-por-letra`,
  `comprobante-carne-pasaporte`) escriben ese paso con la llave de servicio. Una prueba nueva que necesite un comprobante aceptado hace lo
  mismo (`request.jwt.claim.role = 'service_role'`). `resolver-ya-emitido.test.ts` comprueba que la escritura va por el servidor.
