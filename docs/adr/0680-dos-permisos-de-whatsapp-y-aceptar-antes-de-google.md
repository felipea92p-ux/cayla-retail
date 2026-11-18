# ADR-0680 — Dos permisos de WhatsApp en el Club, y ninguna cuenta con Google sin aceptar los textos

- **Fecha:** 2026-11-18 · **Estado:** construido en la rama `claude/revision-legal-tienda-624642`. **Las tres migraciones ESTÁN EN
  PRODUCCIÓN** desde el 2026-11-18 (Felipe: «pega todas las migraciones en prod»), pegadas en orden y una por una con `apply_migration` del
  MCP de Supabase, que las registró con la hora de aplicación: `20261118164647` (parte 1), `20261118164712` (parte 2) y `20261118164815`
  (parte 3). Antes se comprobó en producción que cada ancla aparecía una vez y que los candados eran los esperados; después, que hay una sola
  `tienda_unirse_al_club` (16 parámetros, solo `tienda_web`), los dos disparadores y los 8 clientes con publicidad con sus avisos desde la
  misma fecha (cero filas nuevas). La web (tienda y ERP) todavía no está publicada: la de antes sigue funcionando con estas migraciones.
- **Pidió:** Felipe, 2026-11-18, después de la revisión legal de la tienda (`docs/legal/2026-11-18-revision-legal-tienda.md`, hallazgos
  H2 y H3): «arregla las dos casillas de WhatsApp y la de Google». Eligió, con sus opciones a la vista: dos permisos reales (no un solo
  permiso con texto más largo); los que ya autorizaron conservan los avisos; la BAJA quita todo; el cartel y el QR quedan para otra obra; y el
  texto de la casilla nueva.

## El problema

1. **WhatsApp (H2).** Un solo permiso, `publicidad_whatsapp`, habilitaba los cuatro avisos del ERP: el regalo de cumpleaños y los puntos por
   eliminarse (servicio) y las novedades y rebajas (publicidad). En la tienda online la casilla se titulaba «Avisos del Club por WhatsApp»,
   su texto decía «novedades y promociones de CAYLA» y la política decía «Sin publicidad por WhatsApp». Un consentimiento para publicidad
   que no se entiende es la puerta de la infracción **muy grave** del Código del Consumidor, art. 58.1.e (Ley 32323), y no cumple el
   consentimiento por finalidad del DS 016-2024-JUS (arts. 1.2 y 6).
2. **Google (H3).** «Continuar con Google» creaba la cuenta y anotaba `textos_aceptados = TEXTOS_VERSION` sin que la persona viera ni
   marcara nada. La prueba del consentimiento es de CAYLA (DS 016-2024-JUS, art. 9): la base guardaba una aceptación que no ocurrió.

## Las decisiones

1. **Una finalidad nueva, `avisos_club_whatsapp`, en la misma historia de solo agregar (`club_permisos`)**, con su texto citado
   (`club_textos` tipo `casilla_avisos_club` v1: «Quiero recibir por WhatsApp los avisos de mi Club: mis puntos, mis cupones, mi regalo de
   cumpleaños y antes de que se venzan mis puntos.») y su foto en la ficha (`clientas.avisos_club_desde`, como `publicidad_desde`).
2. **El historial prueba lo que pasó, sin filas de más.** Los avisos tienen fila propia SOLO cuando su consentimiento fue propio: la casilla
   nueva de la tienda online (`tienda_web`, la única que los otorga) y su baja. En los canales de UN solo consentimiento (su mensaje,
   `whatsapp_propio`, cuyo texto dice «mi saludo de cumpleaños»; la página del QR, igual; el cartel, cuya política v2 dice «novedades,
   promociones y avisos de tus cupones»), la fila de publicidad ya es la prueba de los dos: el disparador `club_permisos_avisos_del_club`
   solo enciende la foto de los avisos. La casilla de publicidad de la tienda online NO enciende los avisos: allí cada permiso tiene la suya.
3. **Quitar es quitar todo** (Felipe: «BAJA quita todo»). Quitar la publicidad o salir del club (BAJA, cambio de celular, el cartel con otro
   número, anonimizar) apaga también los avisos: con su `revoca` propio si tenían fila propia, solo la foto si venían con la publicidad. La
   BAJA de quien solo tenía los avisos se cubre en `registrar_baja_whatsapp` (reemplazo anclado), y el cambio de celular de esa ficha, con el
   disparador `clientas_celular_con_avisos` (salvo que en la misma operación ella haya escrito desde el número nuevo).
4. **Cada aviso con su permiso** (`fn_club_avisos_pendientes`, reemplazos anclados): cumpleaños y puntos a quien tiene los AVISOS; novedades y
   rebajas a quien tiene la PUBLICIDAD.
5. **El legado sin filas:** quien tenía la publicidad tiene los avisos desde la misma fecha (la foto); su prueba es su fila de publicidad, que
   los incluía. Nadie deja de recibir lo que ya recibía.
6. **La tienda online:** dos casillas opcionales y sin marcar al unirse al Club, cada una con su título igual a su texto («Avisos de mi Club
   por WhatsApp» y «Novedades y promociones por WhatsApp»), cada una citando su versión; `tienda_unirse_al_club` gana `p_avisos_club` y
   `p_casilla_avisos_version` al final, con valor de fábrica (la web de antes sigue funcionando entre la migración y la publicación). Su texto
   lo da `tienda_casilla_avisos_club()`. La política, los Términos del Club y la ficha del ERP (con su guía) nombran los dos permisos, y
   `TEXTOS_VERSION` sube a `borrador-2026-11-18` (las cuentas que ya existían conservan la versión que aceptaron).
7. **Google:** en «Crear cuenta», el bloque de Google lleva su propia casilla obligatoria y el botón manda la versión aceptada en la vuelta
   (`/auth/google?acepto=…`). Al volver, una cuenta NUEVA (o unida a su ficha) solo nace con la versión vigente exacta; si no, no se crea
   nada: se cierra la sesión, se borra el usuario de Google recién creado y la persona va a «Crear cuenta» con `?google=acepta`. Quien ya
   tiene cuenta entra desde «Entrar» como siempre, sin marcar nada (ya aceptó al crearla).

## Lo que se descartó

- **Un solo permiso con un texto que diga las dos cosas:** más rápido, pero quien quiere solo los avisos de sus puntos tendría que aceptar
  promociones (el consentimiento deja de ser libre, DS 016-2024-JUS art. 3.2). Felipe eligió los dos permisos.
- **Una fila de avisos «espejo» por cada fila de publicidad:** se construyó primero y se deshizo. Duplicaba la prueba (dos filas para un solo
  toque de ella) y cambiaba lo que ya registraban el cartel, la BAJA y anonimizar (16 casos de `club_permisos` y otros de cuatro suites lo
  detectaron).
- **Calcular los avisos al vuelo desde la historia, sin foto:** el selector de avisos filtra miles de fichas por la foto, como con la
  publicidad; una foto que solo escribe un disparador no se descuadra.
- **Pedir la casilla también en «Entrar»:** molestaría a cada persona que ya tiene cuenta. Quien llega por primera vez desde «Entrar» vuelve a
  «Crear cuenta» con el aviso.
- **Las dos casillas en el cartel y en la página del QR, ahora:** es otra obra (Felipe). Mientras tanto, su casilla única sigue dando los dos.

## Lo que queda abierto

- Publicar la web (tienda y ERP) y refrescar el diccionario de datos (`pnpm datos:generar:produccion`).
- Las cuentas creadas con Google antes de esto quedaron con una aceptación que no ocurrió: pedirles la aceptación la próxima vez que entren
  (otra obra; necesita saber cuáles son, `cuentas_web` con vía Google).
- El cartel y la página del QR con sus dos casillas (otra obra).
- El abogado revisa los textos nuevos de la política y de los Términos antes de publicarlos como definitivos.

## Cómo se verifica

- `pnpm pruebas:club-avisos-del-club` (15 casos, en el CI): estructura, el cartel, la BAJA, el cambio de celular, anonimizar, el selector,
  las casillas de la tienda, el legado y pegar las partes dos veces. Siguen en verde `club_permisos`, `club_registro_cartel`, `club_avisos`,
  `club_lista_y_ficha`, `tienda_cuentas`, `tienda_cuenta_simple` y las demás del Club (corridas en una base aislada con `main` + estas tres).
- Web: `apps/tienda/lib/google.test.ts` (`aceptoLosTextos`), `apps/tienda/lib/cuentas.test.ts` y `apps/web/lib/historia-permisos-reglas.test.ts`.
