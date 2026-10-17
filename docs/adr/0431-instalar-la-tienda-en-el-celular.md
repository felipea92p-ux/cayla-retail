# ADR-0431 — Instalar la tienda en el celular: un aviso que se puede ignorar

- **Fecha:** 2026-10-16 · **Estado:** aceptado (Felipe eligió el camino de cuatro escalones sobre las plantillas A a F). Solo web y tienda,
  sin migración.
- **Relacionados:** ADR-0408 (la tienda online), ADR-0136 (movimiento sin rebote). Plantillas aprobadas:
  `docs/maquetas/tienda-instalar-2026-10/index.html`.

## El problema

Quien compra en la tienda lo hace desde el celular y vuelve cada vez buscando el enlace. Se puede añadir la tienda a la pantalla de inicio
(una app web instalable, **no** una app de Play Store ni de App Store), pero nadie lo sabe. El riesgo de avisarlo es el contrario: un
cartel que tapa lo que la persona vino a hacer, o que vuelve cada vez, malogra la compra.

## Decisión

Un camino de cuatro escalones, del menos al más insistente, con reglas que protegen la compra (todas en `lib/instalar.ts`, con su prueba):

1. **Al entrar (Inicio y catálogo), una sola vez por visita.** La **hoja de abajo** (plantilla C), o la **franja** bajo la cabecera
   (plantilla A) **si el Inicio ya trae el aviso del Club** (uno espera al otro: no se apilan dos tarjetas). Sale **ni bien entra** (0,8 s: lo que tarda la página en pintarse; con 8 s, Felipe la
   probó y «demoraba un rato en aparecer», 2026-10-16). Nunca encima de un gesto:
   si la persona acaba de tocar o de bajar la página, se espera a que se quede quieta 1,2 s (hasta 5 intentos y se deja para otra visita);
   tampoco con un campo en uso ni con otra hoja abierta. La franja empuja la página, así que **solo sale con la página arriba del todo**
   (en Safari de iPhone no hay anclaje de scroll y lo que se lee saltaría).
2. **iPhone:** el botón no instala (el iPhone no deja): abre la **guía de tres toques** (plantilla D) y dice «Ver cómo añadirla», no
   «Añadir». En Android con el aviso de Chrome (`beforeinstallprompt`), un toque llama a `prompt()`. Android sin ese aviso (otro
   navegador, o ya lo descartó) solo ve la guía desde «Mi perfil».
3. **Tras separar un pedido:** una tarjeta debajo del WhatsApp y del resumen (plantilla E, `TarjetaInstalar` en `/bolsa/separado/[numero]`).
4. **«Mi perfil»:** una fila fija en «Tu cuenta» (plantilla F) que **no insiste nunca**: ignora los «Ahora no», dice «Ya la tienes» una vez
   instalada y no sale en computadora ni a quien ya abre CAYLA desde su pantalla de inicio.

**«Ahora no» se respeta:** un cierre (la ×, «Ahora no», Escape o tocar el velo) calla 30 días; dos, para siempre. Lo decidido se guarda en
`localStorage` de este aparato (`cayla-instalar`), nunca en la base: es una preferencia del celular, no del Club. Si el navegador no deja
guardar, vale hasta cerrar la página.

## Cómo está hecho

- `app/manifest.ts` (nombre, `start_url: /inicio`, `display: standalone`, crema de la marca, íconos 192/512 y uno «maskable» con el colibrí
  en la zona segura) y `public/cayla-app-*.png`, `cayla-apple-180.png` (el colibrí rojo de `cayla-isotipo.png` al 62 % sobre `#f5f0e8`; el
  maskable al 50 %). `appleWebApp` y `icons.apple` en `app/layout.tsx` para el iPhone.
- `public/sw.js`: un service worker **sin caché y sin tocar ninguna petición**. Existe para que Chrome de Android trate la tienda como
  instalable; la tienda muestra stock por tienda y cuentas con sesión, y una copia vieja sería un error. Solo se registra en Android.
  Funcionar sin conexión sería otra decisión.
- Un script de dos líneas en el `<head>` (`SCRIPT_DEL_AVISO`, `app/layout.tsx`) guarda el aviso de Chrome si llega antes de que la página se arme:
  llega una sola vez y, sin esto, en un celular lento (o apenas inicia sesión) se perdería y en Android no saldría nada.
- `proxy.ts`: el `matcher` ahora también excluye `.js` y `.webmanifest`: el navegador pide el manifiesto sin cookies y no debe toparse con
  una redirección a «Entrar».
- `components/instalar/`: `ProveedorInstalar` (en la raíz: el aviso de Chrome llega una vez y se pierde si nadie lo guarda), `InstalarCayla`
  (la hoja o la franja), `GuiaInstalar`, `TarjetaInstalar`, `FilaInstalar`, `HojaNativa` (un `<dialog>`: velo, foco y Escape gratis).
  Estilos en `app/estilos/instalar.css`, solo con tokens (el crema del ícono es el del archivo y no cambia con el tema).

## Qué se verificó

En Chrome (Playwright) con aparato móvil emulado: la hoja sale a los ~10 s y no a los 5; «Añadir» llama a `prompt()` una vez y deja la
marca de instalada; «Ahora no» y Escape cuentan un cierre y la visita siguiente no ofrece nada, pero la fila sigue; con el aviso del Club
sale la franja y no la hoja; con la página ya bajada la franja no sale; el iPhone abre la guía de tres toques; en computadora no sale
nada; con un campo en uso no sale. Las herramientas de Chrome (`Page.getInstallabilityErrors`) solo reportan «en incógnito»: manifiesto,
íconos y service worker cumplen. `next build` compila y `/manifest.webmanifest` sale estático.

## Lo que NO se verificó

- Un Android ni un iPhone de verdad: el aviso de Chrome se simuló con un evento falso, y la guía de iPhone no se probó en Safari real.
  Los textos de la guía (dónde está «Compartir») cambian con la versión de iOS; por eso no se dice dónde está, solo cómo se ve y qué hacer
  si no se ve (la pista del «⋯»).
- Que la franja tenga buena conversión: a propósito es la menos insistente y puede que casi nadie la use. Se mide con la práctica.
- No hay medición de cuántas personas instalan: la tienda no guarda nada de esto fuera del aparato.

## Qué se rompería sin esto

Sin la regla de quietud, la hoja subiría en medio de un desplazamiento y la persona tocaría «Ahora no» sin querer; sin el silencio de 30
días, el aviso volvería en cada visita y la tienda parecería insistente; sin el service worker sin caché (o con uno que cachea), Chrome no
la ofrecería o la tienda mostraría un stock viejo.

## Actualización 2026-10-17 (ADR-0446)

Los íconos (`public/cayla-app-*.png`, `cayla-apple-180.png`) se rehicieron con el colibrí del logo oficial, en la misma caja que
ocupaba el de antes y en su rojo (`#d13730`) sobre `#f5f0e8`. `public/cayla-isotipo.png` ya no existe: el colibrí de la tienda es
`<Isotipo>` (`components/Isotipo.tsx`), que dibuja el trazo de `lib/marca.ts`.
