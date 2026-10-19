# Llevar «A · Muro» a la tienda online (traspaso, 2026-10-17)

**Rama:** `claude/install-design-skills-4f1aae` · **Worktree:** `/Volumes/CAYLA-SSD/Developer/cayla-retail/.claude/worktrees/no-view-page-image-animation-972032`
(el mismo, por el enlace: `/Users/ArchiCaylo/Developer/cayla-retail/.claude/worktrees/no-view-page-image-animation-972032`; Write/Edit solo
aceptan esta segunda ruta). **Sin push ni PR.** Todo en local.

## El pedido

Felipe miró las maquetas de `docs/maquetas/tienda-rediseno-2026-10/` (A a L) y dijo: **«Me quedo con la A. Implementa tal cual al sistema de
manera local para ir probando y ajustando ciertas cosas.»** La maqueta es `a-muro.html` (léela entera antes de seguir: es la fuente).

A «Muro» en una línea: lujo silencioso, la tienda como una galería; cada prenda es una obra colgada en un muro de yeso frío con su cédula de
museo; el rojo cochinilla casi no aparece (lo carga el colibrí del logo).

- **Paleta de A** (ya en `apps/tienda/app/globals.css`, con los nombres de token de siempre): muro `#ecebe7` → `--crema`; lienzo `#e1ded7`
  → `--hueso` y `--t-foto`; línea `#cbc7be` → `--sand`; grafito `#1c1c1a` → `--tinta`; piedra `#615e57` → `--taupe`; cochinilla `#9e1d32`
  → `--rojo` (`--rojo-profundo` `#7d1627`); `--papel` `#f4f3f0` (lo que se levanta del muro). Verde y ámbar siguen para «hay» / «queda poco».
  El oscuro **no estaba en A**: lo derivé (fondo `#161615`, texto `#ecebe7`); `--t-foto` sigue claro en oscuro (es parte de la foto).
- **Letras de A** (ya en `app/layout.tsx`): Archivo con eje `wdth` para todo; **títulos** en Archivo ensanchada (`font-variation-settings:
  var(--ancho)` = `"wdth" 125`), mayúsculas, peso 200 (titular grande, `.a-display`) o 250 (título de sección, `.a-titulo`); **nombres de
  prenda y cifras grandes** en Newsreader cursiva (`--nombre`); **EB Garamond solo para la palabra CAYLA del logo** (`--marca`).
  `--serif` quedó como alias de `--nombre`: lo que todavía no se pasó a A sale en Newsreader derecha (ver «Falta», punto 1).
- **Piezas de A:** botón grafito sin esquinas que al pasar el mouse se vacía (fondo transparente, letra grafito; nunca se tiñe de rojo);
  enlace con una línea fina debajo; versalitas de 11 px, `.16em`, peso 500, ancho 125; la obra = foto sobre lienzo con `padding: 9%` y
  `mix-blend-mode: multiply`, hover `scale(1.03)` en 1,2 s; la cédula = nombre en Newsreader cursiva (21 px; 17 en celular) y precio a la
  derecha, debajo sus colores y cuánto hay; movimiento mínimo: aparece una vez (`a-aparece`, 10 px, 1 s), nada en bucle.

## Lo que ya cambió y por qué no es «la maqueta tal cual» en todo

La maqueta A se dibujó antes del **ADR-0438** (en main desde hoy): la tienda ya **muestra precios y stock sin cuenta** y pide la cuenta al
separar. Por eso A se aplica sobre la tienda real: **cambia cómo se ve cada pieza, nunca qué hace**. Se conservan campaña, ofertas, looks,
más vendidos, campanita, probador, favoritos y «Agregar» rápido, que A no tenía: van vestidos con el idioma de A.

Hecho (sin commit hasta este traspaso; ver el commit «wip»):
- `app/layout.tsx` (Archivo + Newsreader + EB Garamond), `app/manifest.ts` y `app/global-error.tsx` (colores y letras), color de la barra
  del navegador.
- `app/globals.css`: paleta clara y oscura; `--sans`, `--nombre`, `--marca`, `--ancho`; `.t-btn` y variantes; `.t-enlace`; `.t-ceja`;
  `.t-anuncio`; `.t-cab`/`.t-cab-fila`; el héroe (`.t-hero*`, cuenta regresiva en cifras cursivas entre líneas); secciones (`.t-sec*`,
  `.t-ver`); el Club como banda de lienzo con la lista en dos columnas (la tarjeta del Club se esconde en el Inicio: A no la tiene); pie claro;
  `@keyframes a-aparece`; cuerpo de 15 px / 1,65.
- `estilos/cabecera.css`: navegación en versalitas anchas a la izquierda y **logo centrado** (absoluto); entre 960 y 1239 px el logo vuelve
  a la izquierda (no cabía con la navegación); menú, buscador, mega-menú y menú de la persona sin esquinas.
- `estilos/catalogo.css`: la tarjeta como obra + cédula; filtros como palabras subrayadas entre dos líneas (sin píldoras); «Ver lo que hay
  en» igual; grilla de **3 columnas** desde 700 px (A), 2 en celular; carril de 3 por vista; título de la lista en el titular de A; flechas
  del carril cuadradas; esqueletos sin esquinas.
- `estilos/collage.css` + `components/HeroeDelInicio.tsx`: el héroe cuelga **una** obra con su cédula (las otras dos piezas del collage no
  se dibujan); el titular «Lo nuevo» parte en «LO / NUEVO» y la ceja dice «Llegó en los últimos 30 días»; el % de una campaña va en cursiva
  cochinilla sobre la obra.
- `estilos/inicio.css`: categorías como obras chicas cuadradas (sin aros rojos; lo nuevo, un punto grafito); ofertas en banda de lienzo
  (no negra); el puesto de «Más vendidos» en cursiva maciza.
- `estilos/portada.css` (franja de confianza con líneas, sin íconos), `estilos/ayuda.css` (números de «Así se separa» en cursiva grafito),
  `estilos/tiendas.css` (tiendas sin tarjeta: raya de grafito arriba, nombre en versalitas anchas), `estilos/club.css` (corazón sin
  círculo), `estilos/bolsa.css` (solo el globito de la bolsa: grafito), `estilos/pie.css` (la ayuda del pie con los colores claros).
- **Verificado a ojo solo el Inicio en escritorio (1440)**, antes de los últimos ajustes (nav vs. logo, tamaño del titular, tiendas, pie).

## Falta (en este orden)

1. **Mirar el Inicio otra vez** (1440 y 390) tras los últimos ajustes: que «OFERTAS» no choque con el logo (medir con `getBoundingClientRect`
   el borde derecho de `.t-nav` contra el izquierdo de `.t-logo`; si choca, bajar `letter-spacing` o el `gap` de `.t-nav`), que «LO /
   NUEVO» no se parta a media palabra, las tiendas y el pie. Y la sección «Arma tu look» (`estilos/looks.css`, sin tocar todavía).
2. **Ficha de prenda** (`estilos/ficha.css`, `components/FichaPrenda.tsx`): como `a-muro.html` `prenda()`: ruta en versalitas; galería a la
   izquierda (obra grande y miniaturas en 4 columnas); panel pegajoso a la derecha: nombre en Newsreader cursiva `clamp(36px, 4.2cqi,
   56px)`, precio 20 px, colores como botones cuadrados con su punto (44 px de alto), tallas cuadradas 52×48 (la elegida, grafito lleno),
   «En tienda» como lista con líneas, botón grafito, aviso, «No pagas nada en la web…» en piedra, y acordeones «+ / –» (Medidas y calce,
   Cambios y devoluciones). «Va con» / «Combínalo con» como 3 obras.
3. **Bolsa y separar** (`estilos/bolsa.css`, `app/bolsa/`, `components/bolsa/*`): líneas con obra de 120 px (88 en celular), nombre
   cursiva 22 px, «Color · Talla» en versalitas, «Quitar» subrayado; resumen en lienzo pegajoso (padding 32); tiendas como opciones con
   filo (la elegida con doble filo grafito); total 26 px; confirmación con filo grafito y el mensaje en lienzo. No cambiar el flujo real
   (ADR-0438: «Entra para separar», documento + celular al separar).
4. **Entrar, crear cuenta y la cuenta** (`estilos/cuenta.css`, `estilos/entrada.css`, `estilos/perfil.css`, `estilos/mi-cuenta.css`): A
   `entrar()`: dos columnas, formulario a la izquierda con el titular «ENTRAR», etiquetas en versalitas, cajas de 52 px transparentes con
   filo de línea (grafito al enfocar), botones a lo ancho, «¿Todavía no tienes cuenta?» entre dos líneas; a la derecha una obra con cédula
   «Con tu cuenta». `entrada.css` todavía dibuja el panel oscuro (`--t-hero*`, ahora grafito): pasarlo al muro.
5. **Barrido de títulos:** las ~30 reglas que aún dicen `font-family: var(--serif)` para un TÍTULO (perfil, probador, looks, ayuda,
   recomendaciones, instalar, club, mi-cuenta, bolsa `.t-resumen h3`) pasan al título de A (Archivo ancha, mayúsculas, 200/250, sin cursiva
   ni `em` rojo); las de cifras y nombres (`.t-look-card h3`, `.lg-nombre h1`, totales) quedan en `--nombre` cursiva. Lista:
   `grep -rn "var(--serif)" apps/tienda/app apps/tienda/components`.
6. **Bordes redondos y píldoras que quedan** fuera de las pantallas de arriba (`border-radius: 999px` / `50%` en botones y cajas): A no tiene
   esquinas (los puntos de color y los avatares sí son redondos).
7. **Verificar de punta a punta:** `pnpm --filter tienda typecheck`, `lint`, `test` (`lib/candados.test.ts` y compañía), `pnpm knip`;
   capturas a 1440 y 390 de Inicio, catálogo, ficha, bolsa (con 2 prendas), entrar y crear cuenta, en claro y en oscuro; comparar al mismo
   ancho con `a-muro.html`; contraste (piedra sobre muro y sobre lienzo); «reducir movimiento»; separar de punta a punta con una cuenta de
   prueba de la pila de clientes (buzón en http://127.0.0.1:58424).
8. **Al ir a PR (cuando Felipe lo diga):** ADR de la identidad de la tienda (`pnpm reservar adr` primero), `/abrir-pr`, captura a 375 px.

## Decisiones abiertas para Felipe (no las tomes tú)

- ~~Choque con el PR #1172 (Heebo y el logo oficial, ADR-0446)~~ **Decidido el 2026-10-19: A completa.** Las letras de A (Archivo +
  Newsreader) reemplazan a Heebo; el logo oficial y el colibrí de #1172 se quedan (la palabra CAYLA es `components/Marca.tsx`, en
  `--t-logo`). EB Garamond ya no se carga. Está escrito en la «Actualización 2026-10-19» del ADR-0446.
- El **modo oscuro** no estaba en A: está derivado; Felipe tiene que mirarlo.
- Lo que A no tenía y se vistió con su idioma: franja de arriba, campaña, ofertas, categorías, más vendidos, looks; la **tarjeta del Club
  se escondió en el Inicio** (A lista lo que da el Club, sin tarjeta).
- La maqueta A suponía «sin cuenta no hay precios»; la tienda real ya los muestra (ADR-0438). Se siguió la tienda real.

## Cómo levantarla en local (todo ya está corriendo si es la misma máquina; revisa con `docker ps`)

La base local compartida (`supabase_db_cayla-retail`, 54422) va tres semanas atrás y **no tiene ninguna función de la tienda**: no la uses
ni la actualices (solo Felipe ordena eso). Hay una pila propia, al día con main:

1. **Base propia** `cayla-pila-tienda-a` en `/Volumes/CAYLA-SSD/Developer/.pila-tienda-a` (api 56121, base **56122**). Si no está arriba:
   `/opt/homebrew/bin/supabase start --workdir /Volumes/CAYLA-SSD/Developer/.pila-tienda-a -x studio,mailpit,postgres-meta,storage-api,imgproxy,edge-runtime,logflare,vector,supavisor,realtime`
   (≈2 min, en segundo plano). Si no existe la carpeta: `rsync -a --exclude .temp --exclude .branches supabase/ <carpeta>/supabase/`,
   copiar `supabase/0000_local_stub_dynamic.sql.example` a `<carpeta>/supabase/migrations/0000_local_stub_dynamic.sql` y cambiar en su
   `config.toml` el `project_id` y los puertos 5442x/8083 → 5612x/8693.
2. **Datos para mirar** (solo esa pila): `docker exec -i supabase_db_cayla-pila-tienda-a psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q < docs/maquetas/tienda-rediseno-2026-10/implementar-a/sembrar-tienda-a.sql`
   → publica las 10 prendas del seed, Trujillo y Lima en la web, y les pone fotos públicas del almacén de producción (las de las maquetas).
   Después de las 19:00 de Lima el seed de un `db reset` falla por la zona horaria (ver la memoria «Pila Supabase propia»).
3. **Usuario de la tienda:** `node apps/tienda/scripts/rol-local.mjs --contenedor supabase_db_cayla-pila-tienda-a`.
4. **Pila de clientes** (cuentas, puertos 5842x) **con la CLI 2.118** (la 2.109 de la Mac falla con «supabase/supabase/plantillas»; lo
   arregla el PR #1182): `npx -y supabase@2.118.0 start --workdir apps/tienda -x realtime,storage-api,imgproxy,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor`.
5. **`apps/tienda/.env.local`** (no va a git; ya existe en este worktree): copia de `.env.example` con
   `TIENDA_DB_URL=postgres://tienda_web_local:tienda-local@127.0.0.1:56122/postgres`, `NEXT_PUBLIC_TIENDA_AUTH_URL=http://127.0.0.1:58421`,
   la llave pública de `.env.example`, `TIENDA_AUTH_SERVICE_KEY` = la `SECRET_KEY` de `npx -y supabase@2.118.0 status --workdir apps/tienda -o env`,
   `TIENDA_PADRON_SUNAT_PUBLICO=no` y `TIENDA_FOTOS_ORIGEN=https://vovjyyiafkxteijimpuy.supabase.co`.
6. **La tienda:** `preview_start` con `{name: "tienda-dev"}` (puerto 3100) o `pnpm --filter tienda dev`.
7. **Capturas sin el panel** (Chrome del sistema, «reducir movimiento», página entera):
   `PW_DESDE=<worktree>/node_modules/.pnpm/playwright-core@1.63.0/node_modules node docs/maquetas/tienda-rediseno-2026-10/implementar-a/foto-tienda.mjs <carpeta> 1440 <prefijo> /inicio /catalogo`.
   La maqueta A se sirve con `python3 -m http.server 3032 --bind 127.0.0.1 --directory docs/maquetas` (o un servidor estático de node si
   Python no tiene permiso) → http://localhost:3032/tienda-rediseno-2026-10/a-muro.html#portada (`#catalogo`, `#prenda/kalessi`, `#bolsa`, `#entrar`).
8. **Editar reglas de una línea por su selector:** `python3 docs/maquetas/tienda-rediseno-2026-10/implementar-a/reglas.py <archivo.css> <cambios.py>`
   (`CAMBIOS = {selector: línea nueva | None}`; la sangría cuenta: `"  .x"` es la regla dentro de un `@container`; una línea con un
   comentario al final no la toma).

## Trampas que ya costaron una vuelta

- El sincronizador de la app no trae main (`.claude/launch.json` protegido): `git merge --no-edit origin/main` a mano funcionó.
- `next dev` muestra «1 Issue» por `new Date()` al prerenderizar `/inicio`: es de antes de este cambio, no de A.
- `font-variation-settings` se hereda: el `body` lleva `"wdth" 100` para que lo de adentro de un título ancho no quede ancho por error.
- En zsh, `echo "====="` falla (expansión de `=`): usa `echo '-----'`.
- Las maquetas J, K y L quedaron hechas pero `index.html` y `README.md` de la carpeta no las presentan (Felipe ya eligió A: no hace falta).
