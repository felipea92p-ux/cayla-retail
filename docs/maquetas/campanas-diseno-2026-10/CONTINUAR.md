# Continuar «Tienda web ▸ Campañas» desde otra cuenta de Claude (misma PC)

Escrito el 2026-10-17. Sin llaves ni contraseñas (el repo es público): dice dónde están, no cuáles son.

## Dónde está todo

- **Carpeta de trabajo (worktree):** `/Volumes/CAYLA-SSD/Developer/cayla-retail/.claude/worktrees/campanas-design-customization-ddbd90`
  (también se ve como `/Users/ArchiCaylo/Developer/cayla-retail/.claude/worktrees/...`; **para escribir con Write/Edit usa la ruta
  `/Users/ArchiCaylo/...`**, la otra la bloquea el guardia). Abre Claude Code **dentro de esa carpeta**: así lee su `CLAUDE.md`.
- **Rama:** `claude/campanas-design-customization-ddbd90`. Árbol limpio salvo `.claude/launch.json`
  (sin commitear a propósito: trae las llaves LOCALES de los servidores de prueba).
- **Qué se construye y por qué:** `docs/adr/0436-campanas-con-diseno-propio-en-la-portada.md` (decisiones de Felipe, DECIDÍ/DESCARTÉ por
  actividad). **Maqueta aprobada «tal cual»:** `docs/maquetas/campanas-diseno-2026-10/index.html` (+ su README). **Dónde quedó:**
  `docs/backlog/2026-10-16-campanas-design-customization-ddbd90.md`, sección «Dónde quedó».
- **Las 9 actividades (lista aprobada por Felipe, método `/construir`: una por una, cada una con su commit):**
  1 menú y lista ✔ · 2 Datos y Prendas con una sola llave ✔ · 3 la portada en una sola pieza (`packages/portada`) ✔ ·
  4 diseñar y publicar ✔ · **5 la tienda pinta el diseño publicado** · 6 campañas sin descuento y cuál va primero ·
  7 el resto del editor (fondo liso/degradado/dibujo, acomodos, texto, prendas, detalles, Sorpréndeme, Deshacer) · 8 fondo con foto ·
  9 cierre (`/chaos`, `/formidable`, `tema:auditar`, 375 px, ADR, PR con `/abrir-pr`).

## Lo siguiente (actividad 5)

La actividad 4 está cerrada (ver la sección «Actividad 4» del ADR-0436 y el backlog). Sigue la **5: la tienda pinta el diseño publicado**:
`retail.tienda_portada()` devuelve el `diseno` publicado de la campaña que sale; `apps/tienda/lib/portada.ts` lo valida (`leerDiseno` del
paquete) y la portada y el Inicio lo pintan con `HeroeDePortada` + `variablesDePaleta`; si falta, no pasa o no se lee (`revisarDiseno`),
sale el rojo de siempre. Se verifica en la tienda local (puerto 3048) sin cuenta y con cuenta, en claro, oscuro y 375 px.

## Reglas que ya costaron tiempo

- **Nada se pega en producción sin el OK de Felipe.** Las migraciones `20261017144000`, `20261017151000` y `20261017160000` NO están en
  producción. No uses el SQL Editor ni el MCP de Supabase de producción para escribir.
- **No uses la base local compartida** (`supabase_db_cayla-retail`): hay otras sesiones. Usa la pila propia de esta rama (abajo).
- Números (ADR, migración): se reservan con `pnpm reservar adr|migracion`. Los de esta rama ya están tomados (ADR-0436 y las tres migraciones).
- Colores: solo tokens; el color de la portada de una campaña es **dato** (`data-color-dato`, comentario `// tema-fijo: …`).
- Vocabulario: «colaborador», «sede», «cliente» (nunca «clienta» en pantalla), español en comentarios de negocio.
- Terminales Almacén y Ventas pierden la configuración de campañas hasta que el líder les dé el módulo «Campañas»: avisarle a Felipe al publicar.
- Los botones «Volver al anterior» llevan `unificar-fijo` (no son la vuelta de una pantalla); no los cambies a `<Volver>`.

## La pila local (base + servidores)

Todo en `/Volumes/CAYLA-SSD/.pila-campanas` (fuera del repo). Contenedores Docker `supabase_*_cayla-pila-campanas` (hoy encendidos):
API `http://127.0.0.1:56021`, Postgres `127.0.0.1:56022`. Si están apagados: `cd /Volumes/CAYLA-SSD/.pila-campanas && supabase start`.
Las llaves locales salen de `supabase status -o env` (nunca las copies a un archivo versionado).

- **ERP** (puerto 3047) y **tienda** (3048): entradas `campanas-web` y `campanas-tienda` de `.claude/launch.json` (están en el árbol sin
  commitear; si faltan, recréalas: ERP `PORT=3047 NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:56021 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable> pnpm --filter web dev`;
  tienda `TIENDA_DB_URL=postgres://tienda_web_local:tienda-local@127.0.0.1:56022/postgres NEXT_PUBLIC_TIENDA_AUTH_URL=http://127.0.0.1:56021
  NEXT_PUBLIC_TIENDA_AUTH_ANON_KEY=<publishable> TIENDA_INTENTOS_SAL=<cualquier texto> TIENDA_FOTOS_ORIGEN=http://127.0.0.1:56021 pnpm --filter tienda exec next dev --port 3048`).
  Lánzalos con `preview_start` (nunca con Bash).
- **Cuentas del ERP local:** `felipe@cayla.local` (líder/Admin), `micaela@cayla.local` (colaboradora, sin Campañas), `sandra@cayla.local`;
  contraseña `cayla-local`. **Cliente de la tienda:** `cliente.prueba@cayla.local`, su clave en `/Volumes/CAYLA-SSD/.pila-campanas/arnes/clave-cliente.txt`.
- **Datos de prueba ya creados:** campañas «Día Internacional del Gato» (15 %, 1–30 oct), Halloween, Aniversario, «Día del Abuelo», con prendas.
- **Pruebas de base:** `node scripts/pruebas/campanas_diseno.mjs --contenedor supabase_db_cayla-pila-campanas` (43/43), igual con
  `campanas_portada.mjs` (25/25) y `campanas_llave.mjs` (26/26). Si cambias la migración, reaplícala:
  `docker exec -i supabase_db_cayla-pila-campanas psql -U postgres -v ON_ERROR_STOP=1 -q < supabase/migrations/20261017160000_campanas_diseno.sql`
  (es idempotente). Las suites viejas (`tienda_puerta`, `tienda_inicio`) fallan en los casos «como tienda_web» por un bug de la imagen
  local de Postgres (`grant … with set`), no por esta rama.
- **Capturas sin ventana** (el panel del navegador puede estar oculto): scripts Playwright en `/Volumes/CAYLA-SSD/.pila-campanas/arnes/`
  (`tienda.mjs`, `inicio.mjs`, `erp.mjs`). Importan Playwright de `…/worktrees/agent-acf8ddc739e377514/node_modules/.pnpm/playwright@1.63.0/…`;
  si esa carpeta ya no existe, cambia la ruta a cualquier `node_modules/.pnpm/playwright@*` del repo y usa Chrome del sistema (`channel: "chrome"`).
  `erp.mjs` guarda la sesión como `sesion-<correo>.json` junto al script (no versionar).
- **Guías interactivas en local:** `pnpm --filter web guias:recorrer -- --base-url http://localhost:3047`. El modo desarrollo tiene un bug
  de Strict Mode con `?demo=1`; parche temporal (NO commitear): mover `ultimaDemo.current = {…}` dentro del timeout en
  `components/guias/MotorGuias.tsx`, correr, y `git checkout -- components/guias/MotorGuias.tsx`.

## Prompt para pegar en la otra cuenta

> Estoy en `/Volumes/CAYLA-SSD/Developer/cayla-retail/.claude/worktrees/campanas-design-customization-ddbd90`. Lee
> `docs/maquetas/campanas-diseno-2026-10/CONTINUAR.md`, el ADR-0436 y la sección «Dónde quedó» del backlog de esta rama, y continúa la
> actividad 4 de «Tienda web ▸ Campañas» con `/construir` (las 9 actividades ya están aprobadas por Felipe; no hace falta volver a pedir
> la lista). No pegues SQL en producción ni toques la base compartida.
