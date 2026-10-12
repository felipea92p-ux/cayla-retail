---
name: chaos
description: Usa MAL el ERP de CAYLA a propósito, pantalla por pantalla y en local, para encontrar lo que se rompe antes de que lo rompa una colaboradora un sábado a las 7 de la tarde. Elige los ataques de un catálogo de 8 familias (entradas hostiles, doble clic, navegación torcida, concurrencia entre cuentas, permisos y URL ajena, red y sesión, celular 375 px, teclado) más un azar con semilla reproducible, los ejecuta en el navegador y directo en la base, y después de cada ataque que escribe mira las invariantes de la base (stock contra movimientos, venta contra pagos, caja, comprobantes) — porque lo grave no es la pantalla caída sino el descuadre que nadie ve. Entrega un informe rankeado (estado imposible primero) y, con el OK de Felipe, una prueba de regresión y el arreglo de UNA pantalla. Obligatoria al cerrar toda pantalla o modal que guarda (CLAUDE.md «Caos»). Úsala cuando Felipe diga «chaos», «rómpelo», «qué pasa si lo usan mal», o antes de dar por terminada una pantalla que guarda.
---

Ataca esta pantalla, módulo o ruta: $ARGUMENTS

**Contrato.**
Promete: de UNA pantalla (o un módulo), un informe de lo que se rompe cuando se usa mal —con pasos para repetirlo, la semilla, y la evidencia de la base— ordenado de lo peor a lo menos malo, y nada escrito en la base local que no se deshaga.
Asume: Docker con el Supabase local de este repo (`54421`), tu rama actual, las cuentas del seed y datos inventados.
No hace: tocar producción, aplicar migraciones, cambiar una regla de dinero, stock, permisos o SUNAT, ni arreglar nada antes de que Felipe lea el informe.

**Uso.** `/chaos /vender` (una pantalla) · `/chaos vender` (un módulo, pantalla por pantalla) · `/chaos todo` (solo informa el tablero de `docs/chaos/README.md`: no corre nada) · banderas: `--semilla 42` (repite una corrida exacta), `--azar 8` (cuántos ataques sorteados además del núcleo), `--familias doble-clic,concurrencia` (acota). Sin argumento: pregunta cuál y para.

**Por qué importa lo que mira.** Un ataque casi nunca tira la pantalla; lo que deja es un estado que nadie ve: un stock que ya no cuadra con `movimientos`, una venta cuyos pagos no suman, dos comprobantes. «No se cayó» no prueba nada. Por eso cada ataque que escribe termina mirando la base (Fase 3). Principio 2 de CLAUDE.md: si el inventario puede quedar en un estado imposible, el diseño está mal, no el código.

## Candados (no se negocian; si uno falla, se para y se dice cuál)

1. **Solo local.** La web debe hablar con `127.0.0.1:54421` o `localhost:54421` (`node scripts/local/donde-estoy.mjs`; el `54321` es Dynamic y falla a medias sin avisar). Nunca el conector de Supabase de producción, nunca `pnpm datos:*` contra producción, nunca SQL que no sea de lectura sobre la base local fuera de lo que traen `estado.mjs` y `invariantes.mjs`.
2. **Escribe de verdad, y se deshace.** Un ataque hecho desde el navegador *guarda* en el Postgres local compartido. Todo ataque que escribe pasa por `node scripts/flujo-de-negocio/estado.mjs` (foto antes, restaurar después, todo o nada). **Y la base es compartida con otras sesiones**: restaurar deshace también lo ajeno. Antes de empezar (Fase 0) y antes de cada restauración se comprueba que nadie más escribió; si otra tabla cambió, se para y se le dice a Felipe. (El 2026-10-06, probando este instrumento, apareció un movimiento de otra sesión a mitad de la prueba.)
3. **Datos inventados.** Cuentas del seed (`felipe` y `sandra` líderes, `micaela` colaboradora fija a una sede). Lee las credenciales del seed en el momento y no las repitas en tus respuestas ni en un archivo. Nada de datos reales, ni en una captura.
4. **Repo público.** Informes, capturas y fotos viven en `.chaos/` (fuera de git). **Un hallazgo de PERMISOS o de seguridad (familia `permisos`, `PER-*`) nunca entra a un archivo versionado**: ni al tablero, ni al ADR, ni a la bitácora; solo al chat y a `.chaos/`. En el tablero se anota «hallazgo de seguridad: ver chat», sin detalle.
5. **Nada hacia afuera sin ok.** Ni publicar, ni enviar, ni abrir un PR.
6. **Los arreglos vienen después del informe**, nunca durante el ataque (Fase 5), y lo de dinero, stock, permisos, RPC, migraciones o SUNAT es siempre de Felipe.

## Fase 0 — Terreno (si algo falla, para y dilo)

1. `git status --short` y `git rev-list --left-right --count HEAD...origin/main`: qué rama y cuántos commits detrás de `main`. **Se ataca el código de tu rama**, no el de producción; dilo.
2. `node scripts/local/donde-estoy.mjs` (candado 1). Contenedor `supabase_db_cayla-retail` arriba (`docker ps`). Si no, para: «no pude mirar» no es «está limpio».
3. **Nadie más escribe.** `docker exec -i supabase_db_cayla-retail psql -U supabase_admin -d postgres -At -c "select greatest((select max(created_at) from retail.movimientos),(select max(created_at) from retail.ventas),(select max(abierta_en) from retail.cajas)), now()"`. Si lo último escrito tiene menos de 10 minutos, **pregunta a Felipe** antes de seguir (puede ser tu propia sesión anterior).
4. Revisa que el detector está vivo: `node scripts/chaos/invariantes.mjs --autoprueba`. Todas deben salir `detecta` o `sin autoprueba` (con su motivo); una `CIEGA` o con error se arregla primero (un detector ciego da calma falsa).
5. **Servidor y navegador.** `lsof -iTCP:3010` y `3070`: un puerto ocupado por **otro worktree** sirve otro código y todo lo que midas es de otra rama. En la app de escritorio, `preview_start` con `cayla-retail-dev` (o `cayla-retail-dev-3070` si el 3010 es ajeno). Abre una **pestaña propia** y pasa su `tabId` siempre; usa `http://localhost:…`, nunca `127.0.0.1` (Next no hidrata ahí). **El panel del navegador debe estar visible** (`tabs_context` no puede decir «hidden»): con el panel oculto la página no se dibuja y las capturas y los clics no funcionan. Si está oculto, pídele a Felipe que lo muestre.
6. Entra con una cuenta del seed. Un navegador comparte cookies entre pestañas: **un ataque de dos cuentas a la vez no se hace con dos pestañas** sino en la capa de base (dos sesiones `psql`) o se declara «no cubierto».

## Fase 1 — Ingredientes y plan

Lee la `page.tsx` y los componentes que usa (`node scripts/focus/escanear.mjs --ruta <ruta>` da el grafo) y declara los **ingredientes** de la pantalla, con el vocabulario de `catalogo.mjs`:

| Ingrediente | Cómo lo reconoces |
|---|---|
| `texto` `numero` `monto` `documento` `telefono` `email` `fecha` | qué campos tiene (`CampoTexto`, `type="number"`, montos con «S/», DNI/RUC, WhatsApp…) |
| `guarda` `pasos` `modal` `combo` `lista` `busqueda-url` | un botón que llama una RPC o `.insert/.update`; un formulario por pasos; `<Modal>`; combos; tablas; `useBusquedaEnUrl` |
| `dinero` `stock` `comprobante` | toca caja, cobros, `movimientos`, `registrar_venta`, comprobantes (**esto es lo que hace que un fallo sea de gravedad 1**) |
| `id-en-url` `sede` `celular` | `[id]` en la ruta; depende de la sede de arriba; Vender, Cambios o Devoluciones (PL-105) |

Luego: `node scripts/chaos/catalogo.mjs plan --aplica <ingredientes> --semilla <N> --azar 8` (sin `--semilla`, usa una y **anótala**: sin ella un hallazgo no se repite). Dile a Felipe en dos líneas: la pantalla, los ingredientes, cuántos ataques de núcleo y cuántos de azar. Con más de 40 ataques, acota con `--familias` y avísale; no hay otra pausa.

El **núcleo corre siempre**; el azar descubre lo que no se nos ocurrió. `node scripts/chaos/catalogo.mjs --familia <f>` y `valores --tipo monto` muestran el catálogo y los valores hostiles exactos.

## Fase 2 — Estado inicial

| Cuándo | Comando |
|---|---|
| Antes de preparar nada | `node scripts/flujo-de-negocio/estado.mjs guardar chaos-origen --reemplazar` |
| Tras preparar lo que la pantalla pide (caja abierta, stock de arranque, una prenda con UNA unidad para el ataque de la última prenda) | `node scripts/flujo-de-negocio/estado.mjs guardar chaos-<slug> --reemplazar` y `node scripts/chaos/invariantes.mjs --guardar chaos-<slug> --reemplazar` |
| Entre un ataque que escribió y el siguiente | `node scripts/flujo-de-negocio/estado.mjs restaurar chaos-<slug> --si` (sin `--si` solo muestra qué deshace: léelo; si aparece una tabla que ningún ataque tocó, **otra sesión escribió: para**) |
| Al terminar, siempre, aunque falle | `estado.mjs restaurar chaos-origen --si` |

**La preparación se ensaya con `begin; …; rollback;` y se mira con un SELECT** (lección de `/flujo-de-negocio`: una caja abierta con otro monto levantó una alerta que no era del caso). Cada ataque parte del MISMO estado: así un ataque no contamina al siguiente y la semilla repite lo mismo.

## Fase 3 — Los ataques

Por cada ataque del plan, en orden, uno por uno:

1. **Anuncia** su `id` y qué vas a hacer (una línea). Sus pasos y lo esperado son los de `catalogo.mjs`.
2. **Ejecútalo** en la capa que dice `capa`:
   - `navegador`: con las herramientas del navegador (`computer`, `find`, `form_input`, `read_page`, `javascript_tool`). **Para el doble clic**, `double_click` y, para ráfagas, `javascript_tool` con `for (…) boton.click()` en el mismo tick. **Para la red**, parchea `window.fetch` con `javascript_tool` (después de que cargó la página: el loader único también lo parchea, ADR-0149) para que falle, tarde 8 s o descarte la respuesta; restáuralo al terminar. **Para el celular**, `resize_window` con `preset: "mobile"`; al terminar, `preset: "desktop"` (el tamaño emulado se borra al acabar tu turno). Mira la consola y la red (`read_console_messages`, `read_network_requests`): un error crudo de Postgres a la vista es hallazgo.
   - `base`: consulta directa en el contenedor local, **dentro de `begin; … rollback;`** siempre que no necesites que dos sesiones se vean entre sí. Para concurrencia usa dos conexiones `psql` en paralelo (el patrón de `scripts/pruebas/concurrencia_orden_y_doble_clic.mjs` y `bajada_al_piso_concurrencia.mjs`: `spawn`, sesión simulada con `request.jwt.claim.sub`). Los uuid de las cuentas del seed salen de `supabase/seed.sql`. Un script temporal va al directorio de scratchpad de la sesión, nunca al repo.
   - `ambas`: primero el navegador (qué ve la persona), luego la base (qué quedó).
3. **Evidencia**: captura de la pantalla en el momento, y lo que dijo la consola/red. Etiqueta cada dato: `[visto]` (pantalla), `[base]` (consulta/invariante), `[código archivo:línea]`, `[inferido]`. Nunca captures con la página a medio animar.
4. **Si el ataque escribió** (`escribe: true` en el catálogo): **mira la base ahora** — `node scripts/chaos/invariantes.mjs --contra chaos-<slug>`. Las violaciones NUEVAS son lo que el ataque rompió; las que ya estaban en la foto no son culpa suya. Una `sospecha` (INV-11, INV-12) se confirma con una consulta a mano antes de afirmar que hubo doble cobro. Luego restaura (Fase 2).
5. **Clasifica** (ver «Gravedad») y sigue. No arregles nada ahora, ni siquiera lo obvio: anótalo.

## Gravedad (de peor a menos mala; la decide la EVIDENCIA, no el ataque)

| | Qué es | Ejemplo |
|---|---|---|
| **1 · Estado imposible** | la base quedó inconsistente: inventario, dinero o comprobante que no cuadra | doble clic en Cobrar y hay dos ventas; el stock bajó 6 por un ajuste de 3 |
| **2 · Dato malo en silencio** | se guardó algo dudoso y nadie avisó | «1,299.50» guardado como 1.29; un nombre de 5000 letras; un movimiento sin autor |
| **3 · Pantalla caída** | se rompe lo que se ve, la base queda bien | página en blanco al recargar; un 500; el layout se parte |
| **4 · Error feo pero seguro** | rechaza bien, pero con un mensaje que nadie entiende | «23502 null value in column» a la vista; foco perdido al cerrar |

Una falla en un ataque de `dinero`, `stock` o `comprobante` se sube de nivel si la base quedó mal. Un rechazo claro y sin nada escrito **no es hallazgo**: es el sistema funcionando; se anota como «resistió» (también cuenta: dice qué se probó).

## Fase 4 — Informe

Primero en el chat, y copia en `.chaos/informes/<slug>-<AAAA-MM-DD>.md` (fuera de git). Tres líneas de entrada: pantalla, rama y SHA, **semilla**, cuántos ataques (núcleo + azar) y cuántos resistieron. Después, los hallazgos numerados, **agrupados por causa** (el mismo defecto en varios ataques es UNO, con la lista de ataques):

```
#N · [Gravedad 1–4] Módulo ▸ pantalla — ataques: DC-01, NAV-03
Qué pasó: una frase, con la medida («la venta quedó duplicada: 2 filas en ventas, stock −2 en vez de −1»).
Cómo repetirlo: pasos exactos + `--semilla N`.
Evidencia: [base] INV-01 violación nueva {…} · [visto] captura H<N>_…
Dónde: `archivo` [probable] o `archivo:línea` [código] — cómo lo ubicaste.
Arreglo sugerido: una línea, sin aplicarlo. Si toca dinero/stock/permisos/RPC/migración: «es de Felipe».
```

Termina siempre con **«No cubierto»**: ataques del plan que no se pudieron correr y por qué (dos cuentas en un navegador, SUNAT real, el celular real), lo que el seed local no prueba (volumen, nombres largos reales), y que **el informe vale para esta rama y esta semilla, no para producción**. Y con la pregunta: «¿Cuáles arreglo? (por ejemplo: arregla el 1 y el 3)».

## Fase 5 — Arreglos (solo con el OK de Felipe)

Cada hallazgo que Felipe elija, **en este orden y en su propio commit**:
1. **Primero la prueba de regresión que falla** (un `*.test.ts` en `apps/web/lib/` si es lógica pura; un `scripts/pruebas/*.mjs` con `ROLLBACK` si es de la base; el modelo es el de `concurrencia_orden_y_doble_clic.mjs`). El hallazgo se vuelve prueba o vuelve a ocurrir.
2. **Después el arreglo, de UNA pantalla** y con las piezas que ya existen (el loader único, el token de reintento, los avisos de `avisar.*`, `useEscapeLibre`). **Nunca**: migraciones, RPC, permisos, RLS, reglas de dinero o de SUNAT; si el arreglo está ahí, la skill lo deja escrito y es Felipe quien lo ordena (`/construir`, `/decide`).
3. **Vuelve a correr el mismo ataque con la misma semilla**: tiene que resistir. Y `node scripts/chaos/invariantes.mjs --contra chaos-<slug>` limpio.

## Fase 6 — Cierre

- `estado.mjs restaurar chaos-origen --si` (candado 2) y `estado.mjs comparar chaos-origen`: idéntico.
- Restablece lo que parcheaste en el navegador (`fetch`, viewport `desktop`).
- **Tablero**: una fila en `docs/chaos/README.md` (pantalla, estado, semilla, hallazgos por gravedad y cuántos quedan abiertos; **sin detalle de seguridad**).
- Bitácora y backlog en sus archivos propios (ADR-0259: `docs/bitacora/AAAA-MM-DD-<tema>.md`, `docs/backlog/AAAA-MM-DD-<tema>.md`), ADR si hubo una decisión estructural.
- `QUÉ HICE / POR QUÉ ASÍ / QUÉ SE ROMPERÍA SIN ESTO` de CLAUDE.md.
- Lo que veas de paso y no sea de la pantalla va a `spawn_task`, no al código.

## Lo que esta skill no hace

- No juzga si la pantalla se entiende (eso es `/formidable`), ni su guía de foco (`/focus`), ni su responsive de escritorio (`/multi-view-responsive`), ni un caso de negocio de punta a punta (`/flujo-de-negocio`).
- No prueba carga ni rendimiento con volumen real: el seed local es chico.
- No ataca producción, SUNAT real, ni la pasarela de nadie.
- No es un escáner de seguridad: la familia `permisos` comprueba que los candados que CAYLA ya declaró (ADR-0126, 0161, 0178) aguantan, no busca vulnerabilidades nuevas ni hace pruebas de penetración.
