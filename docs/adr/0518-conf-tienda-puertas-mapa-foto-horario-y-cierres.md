# ADR-0518 — Tienda web ▸ Conf. Tienda: puertas, mapa, foto, horario por días y cierres

**Estado:** aceptada, **construida en su PR; la migración `20261026162000` NO está pegada en producción** (se pega en dos partes, ver «Cómo se publica»).
**Fecha:** 2026-10-26 · **Decidió:** Felipe (la revisión «¿está completa?» del 2026-10-26, la maqueta aprobada mirándola y la lista de 8 actividades) ·
**Sigue a:** ADR-0408 (act. 6, la pantalla original), ADR-0430 (el grupo Tienda web y el módulo `ajustes_web`), ADR-0358 (una función, una pieza),
ADR-0284 (guía de foco), ADR-0195 (partes que se pegan por separado)

## Contexto

Felipe pidió revisar si «Conf. Tienda» (`/tienda-web/ajustes`) estaba completa. Hacía bien lo que prometía (nombre, WhatsApp, dirección, horario como
texto, «Se ve en la web», plazos) pero le faltaba lo que un cliente espera de una tienda en internet y lo que un dueño espera poder decir: dónde queda
exactamente, cómo es por fuera, **si está abierta ahora**, qué día no abre, en qué orden se muestran. El horario era un texto libre que la web solo repetía:
no podía decir «Abierta · cierra 9 p. m.» ni «Cerrada hoy». Y la pantalla era una tarjeta larga por tienda con párrafos de ayuda en cada caja.

Felipe pidió una maqueta (`docs/maquetas/tienda-web-conf-2026-10/`) «entendible, con pocas palabras, intuitiva y fuera de lo común». La aprobó mirándola, con dos
ajustes (la escala de «Stock en la web» y que el horario se entendiera sin explicar). `/formidable` y `/chaos` **van después de que todo esté hecho**, a pedido suyo.

## Decisión

**1 · La pantalla.** Una fila de **puertas** (una por tienda: fachada con el color de su sede, el estado «Se ve en la web», el anillo de 3 datos, lo que
falta con UNA palabra —«Nombre», «WhatsApp», «Dónde»— y el interruptor) y, bajo ella, **el taller** de la tienda abierta con **el teléfono** fijo al lado: la
tarjeta tal como la lee el cliente, en vivo. Cada tarjeta se sigue guardando con su botón «Guardar», firmado por el responsable (ADR-0408 act. 6): lo que se
guarda y las funciones que lo guardan no cambian de significado.

**2 · Lo que se suma, cada cosa con su función en la base** (todas: `fn_puede_ajustes_tienda_web()` —el líder o el módulo `ajustes_web`—, firma
`fn_actor_persona_id(true)`, rastro en `configuracion_historial`, «si nada cambió no escribe ni anota»):

| Qué | Dónde vive | Función | Regla que cierra la base |
|---|---|---|---|
| Orden de las tiendas | `ubicacion_datos_web.orden` | `guardar_orden_tiendas_web(uuid[])` | solo tiendas abiertas, sin repetir; se arrastra y se guarda al soltar |
| Mapa | `ubicacion_datos_web.mapa_url` | `guardar_mapa_tienda_web` | CHECK: solo enlaces de Google Maps (`https`, hasta 400 letras, sin espacios) |
| Foto de la fachada | `foto_ruta` + almacén público `retail-tiendas` | `guardar_foto_tienda_web` | CHECK: `tiendas/<SU tienda>/<uuid>.webp|jpg`; solo se sube, nunca se pisa ni se borra |
| Horario por días | `ubicacion_horario_web` (una fila por día abierto) | `guardar_horario_tienda_web(uuid, jsonb, text)` | CHECK: de media en media hora, abre antes de cerrar, dentro del día; guarda también el texto corto en `horario` en el mismo paso |
| Cierres por fecha | `ubicacion_cierres_web` | `guardar_cierres_tienda_web(uuid, jsonb)` | fechas reales, de hoy (Lima) a 2 años, sin repetir, hasta 60; no toca los días pasados |

`fn_configuracion_tienda_web()` (el ERP) y `tienda_sedes()` (la web) se reescriben **una vez**, solo **agregando claves** al JSON (`orden`, `mapa_url`/`mapa`,
`foto_ruta`/`foto`, `dias`, `cierres`): ninguna clave que alguien ya leyera cambia de nombre ni de forma, y `tienda_sedes()` sigue ordenando por nombre si no
hay orden guardado. Los plazos de los pedidos y el umbral de stock **no cambian en la base**: solo se dibujan distinto (el hilo separa → confirmas → paga →
recoge con − y + bajo cada paso, y la escala 1·2·3·«4+ siempre Hay»).

**3 · «Abierta ahora» se calcula en el navegador, con la hora de Lima.** `@cayla-retail/shared/horario-de-tienda` (puro: leer los días, armar el texto
corto, decir «Abierta · cierra 9 p. m.» / «Cerrada · abre mañana 10 a. m.» / «Cerrada hoy», saltar los días con cierre) lo usan el ERP y la tienda online. La
tienda sale armada de antemano (cache components, ADR-0432): un «Abierta» escrito en el servidor seguiría diciéndose horas después de cerrar, así que el
servidor no dice nada y el estado entra al cargar y se renueva cada medio minuto (`useSyncExternalStore`). Sin horario por días no se dice nada: una tienda no
se declara cerrada por falta de datos. La hora de Lima se saca con `Intl` (no con la zona del aparato) y asume UTC−5 sin horario de verano.

**4 · Una sola regla en las dos apps.** El enlace de mapa, la ruta de la foto y todo lo del horario viven en `packages/shared` (`tienda-web-sede`,
`horario-de-tienda`) y la base las repite en sus CHECK: la pantalla avisa ANTES lo que la base diría DESPUÉS, y una prueba (`horario-de-tienda.test.ts`,
`tienda-web-sede-compartido.test.ts`, `pruebas:tienda-web-conf`) usa las mismas listas de casos para que no discrepen.

## Por qué así

- **El texto corto del horario se sigue guardando** (`ubicacion_datos_web.horario`), derivado de los días en el mismo paso: lo que ya lee la web, y cualquier
  función vieja, sigue viendo un horario; una tienda con el texto de antes y sin días sigue mostrándolo hasta que alguien pinte sus días.
- **Una función por cosa, no una gigante** (principio 3): cada una se prueba, se anota y se puede volver a llamar sola. A cambio, guardar una tarjeta con
  varias cosas cambiadas hace varias llamadas, **en este orden: WhatsApp → datos de la tienda → mapa → foto → horario → cierres** (el WhatsApp primero porque
  encender la tienda lo exige; el horario después de los datos porque también escribe `horario`). Si una falla, lo escrito se queda para corregirlo y volver
  a guardar; todas son idempotentes.
- **Solo se sube a `retail-tiendas`** (como las campañas, ADR-0408 act. 21): la foto nueva lleva un nombre nuevo, volver a una anterior es guardar su ruta,
  y un archivo huérfano pesa a lo más 200 KB. Sin política de borrar ni de cambiar.
- **Las puertas se ordenan arrastrando, con Alt + flechas y, con el dedo, con dos botones** (HTML5 no arrastra en el celular). Se ve al instante y vuelve atrás si
  la base no lo acepta.

## Lo que descarté

- **Un motivo en cada cierre («Feriado», «Inventario»):** la maqueta lo mostraba, pero pedía una palabra más en cada cierre y nadie lo necesita para decidir.
  La tabla no tiene la columna; sumarla después es una migración chica.
- **Guardar el horario solo como texto y que la web lo interprete:** imposible de validar y de calcular «abierta ahora». Sí se descartó **borrar** el texto: se deriva.
- **Calcular «Abierta ahora» en el servidor de la tienda:** queda congelado en el prerender (ver arriba).
- **Un selector de hora al tocar «10 a. m.» de una barra:** una pieza más; las asas, la barra entera y el teclado (←/→, Mayús, Alt, Suprimir) alcanzan.
- **Cerrar pasada la medianoche:** una tienda que cierra a las 2 a. m. no cabe todavía (cada día va de las 0:00 a las 24:00). Si aparece, es otro modelo (el cierre
  del día siguiente).

## Cómo se publica (decisión de Felipe: UNA migración, pegada al final)

`supabase/migrations/20261026162000_tienda_web_conf_tienda.sql`, reservada con `pnpm reservar migracion`. **Dos partes, por separado y en orden** (ADR-0195: en
Supabase, `create policy` toma en exclusiva las tablas de `auth` y `storage`): **(1)** todo hasta la línea «PARTE FINAL»; **(2)** «PARTE FINAL · la política de
subida de la foto», sola y fuera del horario de tienda. Las dos se pueden volver a correr. Después: dar `ajustes_web` en Roles y accesos a quien deba usarla, y
refrescar el volcado del diccionario (`docs/datos/generado/COMO-REFRESCAR.md`; incluye tres tablas y un almacén nuevos). La tienda online necesita
`TIENDA_FOTOS_ORIGEN` (la misma variable de las imágenes de campaña) para mostrar las fotos.

## Verificado / no verificado

**Verificado:** `pnpm pruebas:tienda-web-conf` (103 escenarios con ROLLBACK, también «se puede pegar dos veces») y la prueba antigua `pruebas:tienda-web-configuracion`
(63, con y sin la migración); typecheck de las dos apps, lint, Knip y Knip de producción; las guardianas del repo (colores, una función-una pieza, guía de foco,
sugerencias, guías, hover, tokens). La pantalla en el navegador con datos de ejemplo, en claro y oscuro y a 375 px sin desborde: los gestos del horario
(estirar un borde, correr la barra, pintar un hueco, un toque, el teclado, un arrastre que se sale de la pista), «Cerrar hoy», el orden, los − y + del reloj, la
escala y sus flechas, el campo del mapa; y **la foto**: una JPG de 2,8 MB se reduce a un WebP de 196 KB y sube a `retail-tiendas/tiendas/<tienda>/<uuid>.webp`
(con la respuesta del almacén simulada).

**NO verificado:** (a) la subida real de una foto al almacén con una sesión de verdad (el local no tiene Storage con login: la respuesta se simuló); (b) los
gestos con el mouse real y con el dedo: se probaron despachando eventos de puntero, y fue ahí donde apareció un fallo real (soltar el mouse antes de que React
pintara dejaba el arrastre sin confirmar), ya corregido; falta ver el celular de verdad (arrastrar el horario, los dos botones de orden); (c) `pnpm guias:recorrer`
de la guía nueva (pide la base local al día y una cuenta); (d) la migración contra producción; (e) `/formidable` y `/chaos`, que Felipe quiso al final.

## Actualización 2026-10-26 (b) — el taller, compacto como la maqueta

Felipe vio la pantalla construida y preguntó por qué no estaba compacta: **tenía razón, me aparté de la maqueta aprobada sin decirlo.** La construcción dejó los campos
en una sola columna, cada uno con su párrafo de ayuda (heredados de la pantalla anterior), cuando la maqueta los ponía en dos columnas y casi sin texto. Se corrige:
**nombre | WhatsApp** y **(dirección + mapa) | foto** van en dos columnas (una en el celular), el mapa se explica con su placeholder y su chip, y los párrafos bajo
nombre, WhatsApp, dirección, mapa, foto, horario y cierres desaparecen (el horario conserva su chip «Arrastra los bordes o la barra»); también sale el párrafo de
arriba del todo. Lo único que se queda dicho es lo que la pantalla de abajo ya repite en su nota. Solo cambia cómo se ve: ni la base ni lo que se guarda. Lección: una
maqueta aprobada se compara con la pantalla construida, imagen contra imagen, ANTES de darla por terminada (ya lo pide CLAUDE.md para Finanzas; aquí no se hizo).

## Actualización 2026-10-26 (c) — el horario va de a 15 minutos

Felipe: «si quiero colocar 8:15 no se puede». La construcción dejó el horario de a media hora, y ese límite estaba también **en la base** (el CHECK
`ubicacion_horario_web_horas` y la validación de `guardar_horario_tienda_web`, ambos «múltiplo de 30»), así que no era solo de pantalla. Migración nueva
**`20261026205000_tienda_web_horario_de_a_15_minutos.sql`** (la de `162000` ya está pegada en producción y no se edita): el CHECK pasa a «múltiplo de 15» y la función
valida de a 15 con la frase «de a 15 minutos» (mismo cuerpo, misma firma, mismo permiso). Lo que ya está guardado de a 30 sigue valiendo (lo prueba
`pruebas:tienda-web-conf`, que pega la migración nueva SOBRE filas viejas). En código, `PASO_DE_HORA` pasa de 30 a 15 en `packages/shared` y el borde, la barra y las flechas
caen al cuarto de hora; **una barra sigue sin poder quedar a menos de media hora** (`MINIMO_DE_TRAMO`): la base aceptaría 15 minutos, pero una barra de 15 es un error
de dedo. En el celular cada cuarto de hora mide ~4 px: con el dedo cuesta clavarlo y las flechas del teclado (←/→, 15 minutos) son la salida; si hace falta, se agranda la pista.
**Orden de publicación: primero pegar esta migración, después publicar la web** (con la web nueva y la base vieja, guardar un 8:15 falla con la frase vieja).

## Actualización 2026-10-26 (d) — la fila de «Cierres», alineada y dicha en palabras

Felipe: «esto no está alineado y no es muy entendible lo que hace». La fila tenía «Cerrar hoy» (botón chico) al lado de un campo `dd/mm/aaaa` con un calendario, sin decir qué
hacía el campo, y el botón quedaba más arriba que la caja (el campo de fecha reserva un renglón vacío bajo ella para un error). Ahora: el botón y la caja miden lo mismo (40 px) y
quedan a la misma altura (se oculta el renglón vacío cuando no hay error); entre los dos dice «u otro día»; el título lleva el chip «Un día que no abre: feriado, inventario»;
«u otro día» y su caja bajan **juntas** si la fila no cabe; y tras agregar una fecha la caja vuelve a quedar vacía (antes se quedaba mostrando la fecha ya agregada). Solo
cambia cómo se ve y cómo se siente.

## Actualización 2026-10-26 (e) — los 3 cambios de `/formidable` y el candado de doble clic

Felipe aprobó los tres cambios de `docs/formidable/tienda-web-conf-tienda.md` y el candado de `/chaos`. Solo web, sin migración ni RPC; no cambia qué guarda cada botón.
1. **No perder lo escrito.** La pantalla usa `useSalidaSinGuardar` (el «¿Salir sin guardar?» de las demás): vigila las tiendas y los plazos (`Plazos` avisa su «sucio» al padre). Esc en un plazo revierte solo esa caja, no los cuatro.
2. **Cómo se maneja.** El chip del horario sigue pidiendo arrastrar y agrega «la letra cierra el día»; la letra de cada día lleva su `title` («Cerrar el lunes»). El atajo del orden («Arrastra para ordenar, o Alt + ← →») pasa del agarre (que no recibe el puntero, así que su tooltip nunca salía) a la tarjeta.
3. **Un solo nombre por dato:** «Nombre», «WhatsApp», «Dirección», «Horario» en la etiqueta, la puerta, «Faltan:» y el teléfono (`NOMBRE_DATO`, `PALABRA_FALTA`). El WhatsApp incompleto avisa bajo su caja al salir de ella («Son 9 dígitos y empieza en 9»), no mientras se escribe; el aviso flotante de «Guardar» queda de respaldo.
4. **Candado de re-entrada** (`/chaos`): `guardarTarjeta` y `guardarPlazos` ignoran un segundo clic que llega antes de que el botón se apague. La base ya resistía (idempotente y con `pg_advisory_xact_lock`); solo evita los dos avisos «guardado».
Verificado en el navegador local con la ruta temporal (guardia con una tienda y con solo los plazos; Esc por caja; aviso del WhatsApp; títulos). **Sin verificar:** el candado de doble clic (la ruta de prueba no tiene sesión y no llega a guardar).
