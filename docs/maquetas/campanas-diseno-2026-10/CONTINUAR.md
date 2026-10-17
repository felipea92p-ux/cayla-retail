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
  4 diseñar y publicar ✔ · 5 la tienda pinta el diseño publicado ✔ · 6 campañas sin descuento y el carrusel ✔ ·
  **7 el resto del editor** (fondo liso/degradado/dibujo, acomodos, texto, prendas, detalles, Sorpréndeme, Deshacer) · 8 fondo con foto ·
  9 cierre (`/chaos`, `/formidable`, `tema:auditar`, 375 px, ADR, PR con `/abrir-pr`).

## Lo siguiente (actividad 7)

Las actividades 4, 5 y 6 (6a, campañas sin descuento; 6b, el carrusel) están cerradas: ADR-0436, secciones «Actividad 4», «Actividad 5» y
«Actividad 6». Sigue la **7: el resto del editor** —el fondo (liso, degradado, con dibujo y su intensidad), cómo se acomoda (polaroids,
foto grande, mosaico, solo letras), el texto (desde qué palabra va la cursiva, el tamaño y la frase propia), las prendas (cuáles y en qué
orden), los detalles (contador, % gigante, colibrí, sello), «Sorpréndeme» y «Deshacer»—, que el héroe compartido (`packages/portada`) tiene que
saber dibujar para la tienda y la vista previa a la vez. Lo anotado para la 7 está en el backlog (el nombre largo bajo las polaroids, la
polaroid sin foto distinta entre el ERP y la tienda).

## Lo pegado en producción y lo que falta

**Pegadas el 2026-10-17 y CONGELADAS** (tal como estaban en el commit `d32f50113`; Supabase las registró con otra versión). No se editan:
todo cambio va en una migración NUEVA, reservada con `pnpm reservar migracion`. Lo vigila `apps/web/lib/campanas-migraciones-pegadas.test.ts`
(la huella de cada archivo), y las suites ya no las vuelven a pegar sobre la base final.

| Archivo | Registro en producción |
|---|---|
| `20261017144000_campanas_modulo_y_portada_por_dia.sql` | `20261017202815` |
| `20261017160000_campanas_diseno.sql` | `20261017202943` |
| `20261017200000_campanas_diseno_en_la_tienda.sql` | `20261017203014` |
| `20261017151000_campanas_una_sola_llave.sql` | `20261017203618` (Felipe: «acepto que las terminales no puedan poner prendas en campañas hasta que se publique la web») |

**Faltan pegar, en este orden y con el OK de Felipe:** `20261017204000` (campañas sin descuento) → `20261017210000` (el carrusel). Van con la
web que las lee: una tienda o un ERP de antes las tolera (siguen leyendo `campana`, la primera), pero sin la web nueva una campaña sin
descuento no se ve. **Volver a pegar una de las congeladas después de estas** las deshace (reescribe `tienda_portada()` y la regla como eran):
se arregla pegando otra vez, en orden, las que siguen.

**La puerta de Editar producto (Felipe 2026-10-17, por construir en su propio commit):** `retail.actualizar_variantes_etiquetas(jsonb)`, la de
Editar producto (`ProductoForm.tsx`), deja poner o quitar una campaña con Etiquetas o con Productos/Atributos, sin mirar la llave de
Campañas; las dos terminales tienen Productos. Va en una migración NUEVA con un ancla (cada etiqueta de campaña pasa por
`fn_puede_tocar_etiqueta`; las demás, como hoy, ADR-0293), sin que quien no tiene la llave pueda QUITAR una campaña ni que la prenda la pierda
al guardar la ficha; antes, leer en producción la huella del cuerpo vivo (empieza con el comentario «P4 (20260923140000)») y compararla con el
repo. Pruebas en `campanas_llave.mjs` con una terminal que tiene Productos y no Campañas, y en la web que `ProductoForm` no ofrezca (o avise
bien) las campañas a quien no tiene la llave. **Se pega EL DÍA QUE SE PUBLIQUE LA WEB, justo antes de fusionar, no antes.**

## Reglas que ya costaron tiempo

- **Nada se pega en producción sin el OK de Felipe.** Ninguna migración de esta rama está en producción (el orden, arriba). No uses el SQL Editor ni el MCP de Supabase de producción para escribir.
- **No uses la base local compartida** (`supabase_db_cayla-retail`): hay otras sesiones. Usa la pila propia de esta rama (abajo).
- Números (ADR, migración): se reservan con `pnpm reservar adr|migracion`. Los de esta rama ya están tomados (ADR-0436 y las seis migraciones del orden de pegado).
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
  Si el 3047 está ocupado (el 17-oct otra sesión servía una maqueta en `127.0.0.1:3047` y `localhost` le llegaba a ella), hay una entrada
  `campanas-web-3051` igual pero en el 3051; los arneses toman `ERP=http://localhost:3051`.
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
