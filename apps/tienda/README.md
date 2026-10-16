# Tienda online CAYLA (`apps/tienda`)

La tienda de los clientes: catálogo, «Separar» y recojo en tienda. Es una app aparte del ERP (`apps/web`), con su propio
dominio y su propio inicio de sesión. La arquitectura y el porqué: `docs/adr/0408-…`. Lo que se construye y en qué orden:
`docs/backlog/2026-10-14-customer-catalog-reservation-system-409dbc.md`. Cómo se ve: `docs/maquetas/tienda-online-2026-10/`.

## La única regla

La tienda habla con la base del ERP **solo** por funciones `retail.tienda_*`, con un usuario que hereda el rol `tienda_web`
(sin permiso sobre ninguna tabla). Nunca la llave de servicio ni las llaves públicas del ERP, y nunca un `import` de
`apps/web`. La conexión vive en `lib/base.ts`, y cada tema la usa desde su propio `lib/<tema>-servidor.ts` (que empieza con
`import "server-only"`); en ningún archivo se nombra una tabla. Lo vigilan `lib/candados.test.ts` y, en la base,
`pnpm pruebas:tienda-puerta`. Una función nueva para la tienda nace `security definer`, con su `search_path` y cerrada a
`public`, `anon` y `authenticated`.

## Las cuentas de los clientes

Viven en un proyecto de inicio de sesión **aparte**, solo de clientes (ADR-0408, decisión 2): nunca en el del ERP. En la base del
ERP cada cuenta es una fila de `cuentas_web` unida a su ficha del Club, y la tienda llega a ella por `tienda_registrar_cuenta`,
`tienda_mi_cuenta` y sus hermanas (`20261014223000` y `20261014224000`).

- **Crear la cuenta** lo hace el servidor (`app/acciones/cuenta.ts`), y la cuenta nace recién con el correo confirmado con el
  **código de 6 cifras** (actividad 2b), que desde el 2026-10-15 se pide y se escribe **bajo el correo**, antes de lo demás.
  «Obtener código», al lado del correo: la base cuenta la consulta (`tienda_consultar_correo`, con los topes por ip del cartel del
  Club, `club_intento`) y dice si el correo ya tiene cuenta → reserva el envío (`tienda_reservar_envio`: 60 s entre uno y otro, 5
  por hora) → el proyecto de clientes **invita** el correo (un usuario sin contraseña, que no puede entrar; el correo usa
  `supabase/plantillas/codigo.html`) → `tienda_anotar_invitado`. La caja del código, debajo, se revisa sola con sus 6 números: la
  base cuenta el intento (`tienda_intento_de_codigo`: 5 por código; con el quinto, 15 minutos de bloqueo; vence a los 30) → el
  proyecto de clientes lo verifica → el servidor deja en el aparato una **prueba firmada** de que confirmó ESE correo (una cookie
  httpOnly que dura 30 minutos, `lib/correo-confirmado.ts`). «Crear mi cuenta» vuelve a exigir esa prueba y que el usuario siga
  confirmado (nunca lo que diga el navegador) → la base revisa el correo, el DNI y los topes (`tienda_revisar_registro`) → el
  nombre del padrón → la contraseña → la base crea la cuenta y la deja en el Club, todo o nada (`tienda_registrar_cuenta`, que
  exige el pendiente de ESE correo y ese usuario con su código probado). Si algo dice que no, la confirmación se queda: se arregla
  el dato y se vuelve a crear, sin otro código. Ningún correo queda tomado por quien no lo confirmó: pedir otro código invita de
  nuevo al mismo usuario; uno confirmado sin cuenta se respeta 30 minutos (puede estar terminando en otro aparato) y después se
  borra; si la persona cambia de correo, el usuario del correo de antes se borra en el acto; y los pendientes de más de un día se
  limpian solos (`lib/usuarios-servidor.ts`).
- **Las casillas**: «Soy mayor de 18 años» (obligatoria; la base también la exige) y «Avisos del Club por WhatsApp» (opcional,
  con el texto aprobado del Club, `tienda_casilla_whatsapp`): marcada, la base anota el permiso de publicidad del Club con origen
  `tienda_web`, solo para el celular que la persona escribió.
- **Entrar** y **pedir el enlace de «Olvidé mi contraseña»** se hacen desde el navegador (`lib/auth-navegador.ts`): así el
  proyecto de clientes pone sus topes a la ip de cada persona. El enlace del correo lleva a `/nueva-contrasena`, que canjea su
  código recién al guardar (un lector de correos que abre enlaces solo no lo gasta).
- `proxy.ts` refresca la sesión y lleva a cada uno a su lado (con sesión, de la portada y de «Entrar» al Inicio, `/inicio`; sin
  sesión, del Inicio, el catálogo y «Mi perfil» a «Entrar»).
- La llave secreta del proyecto de clientes solo la lee `lib/sesion-servidor.ts`; la cookie se llama `tienda-sesion` (en local
  el ERP también vive en `localhost` y no deben pisarse).
- **Un correo es de una sola persona** (Felipe 2026-10-14, `20261015054000`): el correo de contacto de OTRA ficha del Club no sirve
  para crear la cuenta. `tienda_revisar_registro` lo dice antes de mandar el código (`correo_de_otra_persona`) y la tienda responde
  sin decir de quién es (`MENSAJES.correoDeOtraPersona`); si alguien lo toma entre el código y «Crear mi cuenta», la base lo frena igual
  (`correo_repetido`).

## Entrar cuenta para el Club, y la cuenta que se cierra

El Club guarda los datos de una persona 3 años desde su última compra **o su última entrada a su cuenta web** (Felipe 2026-10-14;
Términos del Club, 7, y Privacidad, 6). La base lo lleva en `cuentas_web.ultima_entrada_en` (`20261015055000`):

- **La entrada se anota** con `tienda_anotar_entrada` (`app/acciones/entrada.ts`) al iniciar sesión («Entrar»), al crear la cuenta y,
  si la sesión sigue abierta otro día, una vez al día desde el marco de las páginas con cuenta (`components/cuenta/EntradaDelDia.tsx`,
  con la marca `tienda-entrada` de este aparato). Nunca en cada petición: `proxy.ts` no le pregunta nada a la base.
- **Si aun así la ficha se anonimiza** (la conservación del ERP, o porque lo pidió en tienda), la base cierra su cuenta web en la
  misma escritura: sin correo ni usuario, con sus favoritos y sus esperas quitados (no borrados). Ninguna función `tienda_*` la vuelve a
  encontrar. Su usuario del proyecto de clientes queda «por borrar» y lo borra este servidor: cuando la persona intenta entrar
  (`tienda_anotar_entrada` dice `cerrada`: se borra el usuario, se cierra la sesión y «Entrar» lo explica) y, si nunca vuelve, la ruta
  programada `/api/cuentas-cerradas` (`vercel.json`, cada madrugada a las 03:30 de Lima, con `CRON_SECRET`).

## Mi perfil: cambiar el correo, restablecer el acceso y eliminar la cuenta

Felipe 2026-10-15, `20261015132000` (y `20261015131000`, la anonimización que espera un pedido web pagado). Las acciones están en
`app/acciones/mi-cuenta.ts`, lo que habla con la base y el proyecto de clientes en `lib/mi-cuenta-servidor.ts` y las reglas puras en
`lib/mi-cuenta.ts`. **La forma es la de «Crear cuenta»**: el correo con «Obtener código» al lado y, DEBAJO, la caja del código con
«Reenviar» y «✓ Correo confirmado» (`components/cuenta/CorreoConCodigo.tsx`).

- **Cambiar mi correo** (`/cuenta/correo`): su contraseña (`tienda_intento_de_clave`: 5 cada 15 minutos) → la base revisa el correo nuevo
  (ni el de otra cuenta, ni el de contacto de otra ficha, ni el que otra cuenta está confirmando) y reserva el envío
  (`tienda_pedir_cambio_correo`, los topes de la 2b) → el proyecto de clientes manda el código SOLO al correo nuevo
  (`plantillas/correo-nuevo.html`). Con el código: la base cuenta el intento (`tienda_intento_cambio_correo`) → el proyecto lo verifica
  (el correo de entrada cambia AHÍ y le avisa al anterior con `plantillas/correo-cambiado.html`) → la base aplica el correo que el
  proyecto dice que quedó (`tienda_correo_confirmado`). Si la base no contestó en ese momento, «Mi perfil» lo concilia al abrirse.
- **Restablecer mi acceso** (`/restablecer-acceso`, pública): quien perdió su correo lo pide en una tienda; el ERP (ficha del cliente ▸
  «Restablecer acceso») anota el pedido y le pasa a `POST /api/restablecer-acceso` una ficha de un solo uso (10 minutos) para mandar el
  primer código. En la página, ella escribe su correo nuevo, el código y su contraseña nueva, y todo se confirma junto («Guardar y
  entrar»): nunca hay una puerta de «poner contraseña sin la de antes». Poner la contraseña cierra todas las sesiones de antes. Responde
  lo mismo exista o no un pedido con ese correo.
- **Eliminar mi cuenta** (`/cuenta/eliminar`): su contraseña → `tienda_eliminar_mi_cuenta`, que frena con un pedido web en curso o un
  apartado abierto (dice cuáles y qué hacer) y, si no, anonimiza su ficha a pedido suyo con la rutina de siempre (deja el Club; la
  cuenta se cierra en la misma escritura) → su usuario se borra del proyecto de clientes (si no contesta, la ruta de la madrugada).

**En producción, en el proyecto de clientes (panel de Supabase, a mano), los mismos ajustes de `supabase/config.toml`:** «Confirm email»
ENCENDIDO (apagado, el correo cambia SIN código: medido con GoTrue v2.196), «Secure email change» APAGADO (si no, el código iría también
al correo anterior, que quien restablece ya no tiene), la plantilla «Change email address» con `correo-nuevo.html`, el aviso de
seguridad «Email address changed» encendido con `correo-cambiado.html`, y `https://<dominio>/cuenta/correo` y
`https://<dominio>/restablecer-acceso` en las direcciones permitidas. En el ERP, la variable `TIENDA_URL`.

## Cómo se ordena el código

- `lib/<tema>.ts`: las reglas puras del tema, con su prueba al lado. `lib/<tema>-servidor.ts`: lo que lee o guarda en la base.
- Los estilos de la marca están en `app/globals.css` (tokens claro y oscuro, cabecera, pie). Los de cada tema van en su propia
  hoja, `app/estilos/<tema>.css`, importada desde su página o su layout.

## Rápida para cualquiera (2026-10-16, ADR-0408 act. h)

- **Lo que es igual para todos se comparte entre visitas** con `lecturaCompartida` (`lib/compartido-servidor.ts`): el catálogo, los looks
  y la ficha 30 s; la campaña y las tiendas 60 s; los plazos y los beneficios del Club 300 s. Lo de una persona (su cuenta, sus favoritos,
  su bolsa, sus pedidos) nunca: se lee en cada visita. Una lectura nueva de la base decide primero de cuál de los dos es.
- **El 404 raíz (`app/not-found.tsx`) y el layout raíz nunca leen la sesión ni cookies:** en Next 16 son parte de toda ruta, y al leerlas
  todas las páginas se armaban en cada visita. Así `/`, `/entrar` y `/crear-cuenta` salen estáticas (`○` en `next build`) y Vercel las
  sirve desde su caché.
- **El proxy revisa la sesión con `getClaims()`** (la firma ES256, sin llamar al proyecto de clientes); las páginas que muestran datos de
  una cuenta la confirman con `getUser()` (`leerSesion`).

## Levantarla en local

1. La base local del repo arriba (`npx supabase start`) con las migraciones de la tienda (`20261014220000…`, `20261014223000…`,
   `20261014224000…`).
2. `pnpm --filter tienda rol-local` crea el usuario `tienda_web_local` (solo local).
3. La pila del proyecto de clientes (su configuración está en `apps/tienda/supabase/`, puertos 58420–58429):
   `npx supabase start --workdir apps/tienda -x realtime,storage-api,imgproxy,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor`.
   El buzón de prueba, donde llegan el código para crear la cuenta y el correo de «Olvidé mi contraseña», está en
   http://127.0.0.1:58424. Si cambias una plantilla de `supabase/plantillas/`, la pila se reinicia para leerla
   (`npx supabase stop --workdir apps/tienda` y el `start` de arriba).
4. `cp apps/tienda/.env.example apps/tienda/.env.local` y pon en `TIENDA_AUTH_SERVICE_KEY` la `SECRET_KEY` de
   `npx supabase status --workdir apps/tienda -o env`. Para no consultar DNI reales mientras pruebas: `TIENDA_PADRON_SUNAT_PUBLICO=no`
   (la persona escribe su nombre).
5. `pnpm --filter tienda dev` → http://localhost:3100 (o «tienda-dev» en `.claude/launch.json`).

## El Club en la cuenta

«Mi perfil» (`/cuenta`; se llamaba «Mi cuenta» hasta el 2026-10-15, cuando se ordenó: ADR-0408, act. g) muestra arriba cuatro cuadros
con cómo están sus pedidos, su Club, sus favoritos y sus avisos (`lib/perfil.ts`), y lo del Club de ESA persona (actividad 12): su
descuento de cumpleaños y su vale por aniversario con las mismas funciones que cobra la caja, «Novedades para ti» (lo que llegó desde
su visita anterior), sus favoritos y lo que espera (`tienda_mi_club`, `20261015025000`). El corazón (`components/club/BotonFavorito.tsx`) y «Avísame cuando llegue»
(`components/club/BotonAvisame.tsx`) guardan con `tienda_favorito` y `tienda_avisame` (`20261015024000`): por modelo el corazón, y por
prenda y tienda la espera; si la prenda ya hay, no se anota. Lo que esperan los clientes lo ve el ERP en Vitrina web ▸ Esperan una talla
(`fn_vitrina_esperan`, `20261015030000`), sin datos de nadie. El aviso de que llegó está en la cuenta, nunca por WhatsApp.

Pruebas: `pnpm --filter tienda test`, `typecheck` y `lint`; en la base, `pnpm pruebas:tienda-puerta`, `pnpm pruebas:tienda-cuentas`,
`pnpm pruebas:vitrina-web`, `pnpm pruebas:tienda-ficha` (cuánto hay en cada tienda), `pnpm pruebas:tienda-inicio` («Lo nuevo», «Más
vendidos» y los plazos de la ayuda), `pnpm pruebas:tienda-separadas` («otra persona ya separó la última»), `pnpm pruebas:tienda-bolsa`,
`pnpm pruebas:tienda-club` (también la regla única de «hay» y de «nuevo»), `pnpm pruebas:tienda-avisos` (el aviso del Club al entrar),
`pnpm pruebas:clientas-correo` (un correo, una persona; la entrada que cuenta para el Club y la cuenta que se cierra) y
`pnpm pruebas:tienda-mi-cuenta` (cambiar el correo, restablecer el acceso y eliminar la cuenta, también con `-- --mutantes`);
las de la ficha, el Inicio, la bolsa y «otra persona ya separó», con `-- --mutantes`, además contra versiones rotas a propósito de su
migración.
