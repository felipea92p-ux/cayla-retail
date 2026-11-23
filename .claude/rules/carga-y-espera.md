---
paths:
  - "apps/web/components/**/*.tsx"
  - "apps/web/app/**/*.tsx"
  - "apps/web/app/**/*.css"
  - "apps/web/lib/espera-*"
---

## Carga y espera (regla — ADR-0149)

**El ERP tiene UN solo loader a pantalla completa (`apps/web/components/ui/Espera.tsx`, `<EsperaGlobal />` montado una vez en
`app/layout.tsx`): cubre incluso el lateral y la cabecera, hereda el movimiento de modales y dura solo lo que tarda la
respuesta.** Se usa al presionar un botón que guarda y al cambiar de sede — y se activa solo. **Cambiar de pantalla ya no lo muestra
(ADR-0623, Felipe 2026-11-07):** cada `loading.tsx` dibuja el esqueleto (`<EsperaPantalla />` → `EsqueletoPantalla`) bajo el menú y la cabecera,
que siguen vivos; una ficha de carga solo sostiene el velo que un guardado ya puso a la vista (el refresco encadenado). Para detectar qué es qué,
parchea `window.fetch` y `lib/espera-reglas.ts` (`clasificarPeticion`, lógica pura y testeada) decide qué es `'carga'` o
`'guardado'`. **No construyas otro overlay de carga a pantalla completa ni dejes un «Cargando…» suelto**; un botón o una
pantalla nueva no tiene que hacer nada para tenerlo. Los botones conservan su «Guardando…» con el hilo (`<Boton cargando>`, ronda 12 de `/unificar`; el loader se suma), y un
`Suspense` de una sección dentro de una pantalla sigue siendo esqueleto parcial, no el loader global.
**El aviso de éxito (`avisar.*`, esquina superior derecha) sale DESPUÉS del loader, nunca encima** (`lib/espera-estado.ts`): el
loader dice «espera, se está procesando» y el aviso dice «listo, se guardó bien». Mientras haya una petición en curso o el
loader esté a la vista, ningún aviso se pinta; al liberarse aparecen. Nadie tiene que coordinarlos: se llama
`avisar.exito(...)` en el mismo instante en que responde la base y el aviso sale solo. Un guardado tan rápido que el loader ni
llega a verse (< 200 ms) muestra su aviso apenas termina. **Un aviso que ya se vio no vuelve** si otra petición ocupa la
pantalla (volvería con reloj nuevo y un «Deshacer» viejo), **un aviso con botón dura 7 s como mínimo**, y **un clic en un aviso no cierra la hoja
ni el cajón abierto**: la pila es rama (`DismissableLayer.Branch`) de toda capa de Radix, sin que ninguna hoja haga nada
(`lib/avisos-reglas.ts`, `lib/hojas-avisos.test.ts`; ADR-0146 act. 2026-10-14). Detalle en la «Actualización 2026-09-21» del ADR-0149.

Para lo que no pasa por `fetch`: `useEsperando(activo, mensaje?)` (hook), `esperar(mensaje?) → fin()` (imperativo) y
`<EsperaPantalla />` en cada `loading.tsx`. Una petición que no debe bloquear lleva el header `x-espera: no`. **Al agregar una
RPC de solo lectura llamada desde el navegador, suma su prefijo o nombre a la lista de lectura de `espera-reglas.ts`** (hoy
`fn_`, `previsualizar_`, `campanas_`, `ofertas_`, `resumen_`, `buscar_`, `get_`, `validar_`); si no, el loader bloqueará la pantalla mientras se busca
o se escribe. **Un buscador que filtra por URL (`?q=`) se arma con `useBuscarAlEscribir`
(`components/ui/BusquedaEnUrl.tsx`: la pausa única de 350 ms, una letra sola no busca y no ensucia «Atrás»; lo vigila `lib/busqueda-al-escribir.test.ts`), nunca con `router.push` suelto:** lo tipeado no abre el loader; el campo dice «Buscando…»
(`<Buscador buscando>`) y la lista marcada con `data-resultados` se atenúa (Felipe 2026-09-28). Un filtro por clic sigue con el loader.
Análisis (v4, ADR-0357) busca en el navegador, sin URL: lo tipeado filtra las prendas ya leídas, sin loader.
**Única excepción a «el botón que guarda lleva el loader»: la pila de la bandeja de Gastos** (`GastosPulso`): «Listo» quita la tarjeta al
instante, guarda con `x-espera: no` y, si la base dice que no, la tarjeta vuelve (Felipe 2026-10-31, ADR-0149 act. 2026-10-31). Otra
pantalla no la copia sin que Felipe lo decida.
Tiempos, alternativas y verificación: `docs/adr/0149-loader-general-a-pantalla-completa.md`.
**Un guardado que se queda sin respuesta (corte de red) rehace la pantalla solo** cuando la base vuelve a responder, sin loader y sin tocar lo escrito (`<RefrescoTrasCorte />`, ADR-0411): una pantalla nueva no hace nada, nadie escribe su propio refresco tras un corte, y una pantalla con cola sin conexión propia se suma a `PANTALLAS_SIN_CONEXION` (ahí no se refresca).
