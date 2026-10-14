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

- **Crear la cuenta** lo hace el servidor (`app/acciones/cuenta.ts`) en un orden seguro: la base revisa el correo, el DNI y los
  topes del cartel del Club (`club_intento`) → se crea el usuario de inicio de sesión → la base crea la cuenta y la deja en el
  Club, todo o nada. Si la base dice que no, el usuario recién creado se borra (salvo que la base diga que ya tiene cuenta o no
  conteste: entonces no se borra nada, y al entrar la tienda deja crear la cuenta otra vez).
- **Entrar** y **pedir el enlace de «Olvidé mi contraseña»** se hacen desde el navegador (`lib/auth-navegador.ts`): así el
  proyecto de clientes pone sus topes a la ip de cada persona. El enlace del correo lleva a `/nueva-contrasena`, que canjea su
  código recién al guardar (un lector de correos que abre enlaces solo no lo gasta).
- `proxy.ts` refresca la sesión y lleva a cada uno a su lado (con sesión, de la portada y de «Entrar» a «Mi cuenta»).
- La llave secreta del proyecto de clientes solo la lee `lib/sesion-servidor.ts`; la cookie se llama `tienda-sesion` (en local
  el ERP también vive en `localhost` y no deben pisarse).

## Cómo se ordena el código

- `lib/<tema>.ts`: las reglas puras del tema, con su prueba al lado. `lib/<tema>-servidor.ts`: lo que lee o guarda en la base.
- Los estilos de la marca están en `app/globals.css` (tokens claro y oscuro, cabecera, pie). Los de cada tema van en su propia
  hoja, `app/estilos/<tema>.css`, importada desde su página o su layout.

## Levantarla en local

1. La base local del repo arriba (`npx supabase start`) con las migraciones de la tienda (`20261014220000…`, `20261014223000…`,
   `20261014224000…`).
2. `pnpm --filter tienda rol-local` crea el usuario `tienda_web_local` (solo local).
3. La pila del proyecto de clientes (su configuración está en `apps/tienda/supabase/`, puertos 58420–58429):
   `npx supabase start --workdir apps/tienda -x realtime,storage-api,imgproxy,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor`.
   El buzón de prueba, donde llega el correo de «Olvidé mi contraseña», está en http://127.0.0.1:58424.
4. `cp apps/tienda/.env.example apps/tienda/.env.local` y pon en `TIENDA_AUTH_SERVICE_KEY` la `SECRET_KEY` de
   `npx supabase status --workdir apps/tienda -o env`. Para no consultar DNI reales mientras pruebas: `TIENDA_PADRON_SUNAT_PUBLICO=no`
   (la persona escribe su nombre).
5. `pnpm --filter tienda dev` → http://localhost:3100 (o «tienda-dev» en `.claude/launch.json`).

Pruebas: `pnpm --filter tienda test`, `typecheck` y `lint`; en la base, `pnpm pruebas:tienda-puerta` y `pnpm pruebas:tienda-cuentas`.
