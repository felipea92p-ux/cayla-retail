# Dónde quedó y cómo seguir (para retomarlo en otra máquina)

Rama `claude/apartados-screen-clarity-adcc8e`. Escrito el 2026-11-26, al cortar la sesión.

## Qué pidió Felipe
1. Revisar si TODO Apartados (Apartar, Entregar, Historial y sus hojas) se entiende y está bien distribuido para cualquier persona.
2. Como resultado, **una maqueta navegable** del nuevo diseño.

## Qué está hecho (todo en este PR, solo documentos: el ERP no cambió)
- **Diagnóstico** `/formidable`: `docs/formidable/vender-apartados.md` (leyes 5,3 · oficio 5; 17 hallazgos con el veredicto del escéptico; 3 pruebas ciegas) y su fila en `docs/formidable/README.md`.
- **Maqueta navegable**: esta carpeta. `index.html` es la portada; 20 pantallas con el interruptor **Hoy / Propuesta** y «Qué cambia aquí».
- **Capturas** antes/después a 1440 × 900: `capturas/` (se rehacen con `node herramientas/capturar.mjs`).
- Bitácora y backlog del día: `docs/bitacora/2026-11-26-apartados-screen-clarity-adcc8e.md` y `docs/backlog/2026-11-26-apartados-screen-clarity-adcc8e.md`.

## En qué me quedé (lo siguiente, en orden)
1. **Felipe todavía no vio la maqueta ni respondió.** Lo primero es mostrársela (abrir `index.html`) y que elija qué entra de los 3 cambios:
   (1) botón principal siempre a la vista · (2) pestaña «Pendientes» + Historial con la lista arriba · (3) una palabra para cada cosa y las
   condiciones a la vista. Preguntar con el cuadro (AskUserQuestion), no en texto suelto.
2. **Pulido de la maqueta que quedó a medias** (visto en las capturas, sin arreglar):
   - En «Apartado registrado», «Sin imprimir» quedó a media fila (venía en una grilla de dos): debe ocupar el ancho.
   - La barra negra de la maqueta tapa el borde inferior de las hojas; subirla o correrla cuando hay una hoja abierta.
   - En el Historial propuesto, a 1440 px el nombre de la prenda todavía se corta («Chompa Al…»): falta `title` o ceder ancho de la columna de acciones.
   - `apartar-cobro-listo.html` se congeló con el paso «Cliente» abierto (en el ERP se pliega al completarse): volver a congelarlo plegado.
   - Falta verla en modo oscuro y a 1920 px.
3. **Lo que la maqueta no cubre:** el celular (375 px, obligatorio en Apartados). La pantalla congelada es de escritorio; el celular pide
   congelar los estados otra vez a 375 (ver «Rehacer una pantalla»). El hallazgo grave ahí: la fila de la lista de Entregar parte el nombre
   y el código en 3 líneas.
4. **Con el OK de Felipe, construir** lo elegido con `/construir`, una actividad por cambio. Antes: `/milimetro diseñar` de la pestaña
   «Pendientes» y de la tabla del Historial. Después: `/focus`, `/sugerir`, `/guia` (la huella de `vender.apartados` cambia) y `/chaos`.
   Dónde tocar (del escéptico): el panel de cobro es `.ap-ticket` en `app/estilos/vidrio/vender.css:297` (no es `sticky`; el de Vender sí,
   `:45-47`); pies sin `pie-hoja-fijo` en `ModalesApartado.tsx:823, 537, 1160`; el del detalle está dentro de un `div.space-y-2`
   (`DetalleApartado.tsx:295-299`) y por eso no pega; la fila del Historial es una grilla por `<li>` (`TodosVista.tsx:502`); «Hoy» fijo al
   centro en `EntregarVista.tsx:499`.
5. **Repetir las 3 pruebas ciegas** sobre lo construido y una pasada con una colaboradora real (la ley 1 no pasa de 8 sin ella).

## Decisiones de Felipe que este trabajo toca (decirlo al preguntarle)
- El nombre **«Historial»** lo pidió él (ADR-0367, 2026-10-09). La propuesta lo conserva y saca de ahí el trabajo del día.
- Las **condiciones tras el «?»** las eligió él el 2026-11-16 (maqueta `apartar-compacto-2026-11`, opción A). La propuesta lo reabre: la
  ciega marcó «Le leí las condiciones» sin haber leído nada.
- Los **tres botones** de «Apartado registrado» vienen de «Venta registrada» (ADR-0114).
- **«Liberar» → «Cancelar apartado»** es cambio de palabra en pantalla; en la base sigue siendo `liberar_separacion`.

## Rehacer una pantalla de la maqueta (si cambia el ERP o para el celular)
La maqueta se hizo sin base de datos y sin sesión:
1. Copiar `herramientas/pagina-de-prueba.tsx.txt` a `apps/web/app/auth/prueba-apartados/page.tsx` (ruta pública; **no se commitea**).
2. `node docs/maquetas/apartados-claro-2026-11/herramientas/base-de-mentira.mjs` (puerto 3084).
3. Levantar la web contra ella, en un host propio para no tocar la sesión de nadie:
   `cd apps/web && NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:3084 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_prueba ./node_modules/.bin/next dev -p 3083`
   y abrir `http://apartados.localhost:3083/auth/prueba-apartados` (nunca `localhost` a secas).
4. Pegar `herramientas/congelar-en-el-navegador.js` en la consola, llevar la pantalla al estado y `await __mq.congelar('<nombre>')`.
   El archivo cae en `herramientas/congelado/hoy-<nombre>.html`: copiarlo a esta carpeta sin el prefijo y agregarle
   `<script src="maqueta.js"></script>` antes de `</body>`.
5. Al terminar: borrar `apps/web/app/auth/` y apagar los dos procesos.

`erp.css` es la hoja del ERP ya compilada, tal como la sirve `next dev` (1,9 MB); si cambian los estilos, se rehace con `__mq.css()`.
`maqueta.js` es lo único escrito a mano: cada cambio de la propuesta es una función con su porqué.

## Trampas que costaron tiempo
- La máquina se quedó sin memoria (16 GB de intercambio llenos por otras sesiones y Docker): el navegador sin ventana no abría. Con la
  máquina libre, `herramientas/capturar.mjs` corre en 20 segundos.
- El texto de un botón del ERP puede venir pegado («ApartarS/219.80») o traer oculto su «Guardando…»: buscar por cómo empieza.
- El ancho de las pestañas cambia cuando llegan las letras: lo que mide (`alListo` en `maqueta.js`) se vuelve a medir con `document.fonts.ready`.
- Las pruebas ciegas usaron una página que no cambia sus datos al guardar: dos «no pude confirmar que quedó» son del entorno, no del ERP.
