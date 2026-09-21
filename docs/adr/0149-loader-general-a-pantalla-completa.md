# ADR-0149 — Loader general a pantalla completa: un solo aviso de espera, que se cumple solo

- **Fecha:** 2026-09-21
- **Estado:** Aceptado (Felipe, 2026-09-21: el ERP tendrá **un solo loader a pantalla completa**, con el lenguaje visual del aviso
  de cambio de sede, y se usa siempre —al cargar una pantalla, al guardar y al cambiar de sede—; es regla). Implementado en
  `apps/web/lib/espera-reglas.ts` y `apps/web/components/ui/Espera.tsx`. **Numeración provisional: renumerar al subir sin
  reemplazar en masa** (los números de ADR chocan entre sesiones paralelas; ver la nota de memoria «Renumerar un ADR sin
  pisar el otro»).
- **Decide:** Felipe. Arquitectura: este documento.
- **Diseño de referencia:** `docs/maquetas/cargando-general-spike-2026-09/` (el aviso de cambio de sede es su origen visual).
- **Toca** la regla de movimiento de modales (ADR-0136: el loader hereda su hoja) y el aviso de cambio de sede
  (`AvisoCambioDeSede`, que deja de dibujar su propio overlay). **No toca el modelo de datos ni ninguna migración.**

## Contexto — el problema

Una colaboradora presiona «Guardar» y no pasa nada visible durante un segundo, dos, cuatro. No sabe si su clic se registró.
Vuelve a presionar, o cierra la pestaña, o llama a la líder. Lo mismo al abrir una pantalla lenta: el lateral cambia de
resaltado pero el contenido sigue siendo el anterior, o queda en blanco. En una tienda con conexión de celular, ese silencio
es el caso normal, no la excepción (principio 10: ergonomía = potencia).

Antes de esta decisión la espera se resolvía de cinco maneras distintas: el giro propio de cada botón («Guardando…»), algún
«Cargando…» suelto en texto, esqueletos por pantalla, el `loading.tsx` de Next, y el overlay del aviso de cambio de sede —el
único que se sentía bien—. Cada pantalla nueva volvía a decidir, o se olvidaba de decidir, y quedaban acciones que guardaban
en silencio.

## Decisión — un loader, montado una vez, que reacciona a las peticiones

**El ERP tiene UN solo loader a pantalla completa. Cubre incluso el lateral y la cabecera (`fixed inset-0 z-[60]`, portal a
`body`, el resto de la app queda `inert`). Dura solo lo que tarda la respuesta. Se usa SIEMPRE en tres casos: (a) al
navegar/cargar una pantalla, (b) al presionar un botón que guarda algo, (c) al cambiar de sede.** Nadie construye otro overlay de
carga a pantalla completa ni deja un «Cargando…» suelto.

Lenguaje visual (el del aviso de cambio de sede): isotipo con arco que gira, velo con desenfoque, hoja con el movimiento de
modales (ADR-0136) y un hilo que barre al pie. Con movimiento reducido: sin giro ni barrido.

### Cómo se activa: interceptando `fetch` en un solo lugar

`<EsperaGlobal />` (`components/ui/Espera.tsx`, `'use client'`) se monta **una sola vez** en el layout raíz
`app/layout.tsx` —por eso vale también en `/login`—. Parchea `window.fetch`: cada petición que merece espera registra una
«ficha» en un almacén (`useSyncExternalStore`), y el overlay se muestra mientras haya alguna. Ni los botones ni las pantallas
saben que existe.

Qué peticiones merecen espera lo decide una función pura y testeada, `clasificarPeticion(...)` en `lib/espera-reglas.ts`, que
devuelve `'carga' | 'guardado' | null`:

| Clase | Qué es |
|---|---|
| `'carga'` | Un GET de navegación de Next: header `RSC: 1` sin `Next-Router-Prefetch` (el prefetch no bloquea a nadie). |
| `'guardado'` | Un POST con header `Next-Action` (server actions); un POST/PUT/PATCH/DELETE same-origin a `/api/*`; y toda escritura al host de Supabase (REST, RPC y storage) **excepto** las RPC de lectura (prefijos `fn_`, `previsualizar_`, `campanas_`, `resumen_`, `buscar_`, `get_`) y `/auth/v1/token`. |
| `null` | Todo lo demás: no muestra nada. |

**Opt-out por petición:** el header `x-espera: no`.

### Tiempos

| Qué | Valor | Por qué |
|---|---|---|
| Aparece a los | 200 ms | Anti-parpadeo: una respuesta rápida no lo muestra. |
| Una vez visible, dura al menos | 400 ms | Un destello de 80 ms es peor que nada. |
| Gracia al terminar | 150 ms | Fusiona peticiones encadenadas (guardar → `router.refresh`) en un solo loader. |
| Texto «Está tardando más de lo normal» | a los 4 s | La persona sabe que sigue vivo, no colgado. |
| La ficha se suelta sola a los | 30 s | Nunca queda la app bloqueada por una petición que no termina. |

**La ficha de una petición se suelta cuando termina de llegar el CUERPO de la respuesta**, no solo los headers: Next responde
por streaming, y soltarla al recibir los headers apagaría el loader con la pantalla aún a medias.

### API para lo que no pasa por `fetch`

- `useEsperando(activo, mensaje?)` — hook: mientras `activo` sea `true` hay una ficha. Es lo que usa `AvisoCambioDeSede` con su
  mensaje «Cambiando de sede A → B» (ya no dibuja su propio overlay).
- `esperar(mensaje?) → fin()` — imperativo, para flujos fuera de React: llama `fin()` al terminar.
- `<EsperaPantalla />` — va en cada `loading.tsx`; cubre la carga en frío, cuando aún no hay cliente que haya parcheado nada.

### Convivencia con lo que ya existía

- Los botones **conservan** su propio giro/estado «Guardando…» (excepción ya escrita en `CLAUDE.md`): el loader se suma, no lo
  reemplaza.
- Un `Suspense` de una sección dentro de una pantalla (esqueleto parcial) **no** usa el loader global: sigue siendo esqueleto.
  El loader es para «toda la pantalla espera», no para «esta tarjeta espera».

## Alternativas descartadas

- **Un `useTransition` / estado `pendiente` por botón, en cada componente.** Son ~50 componentes con acciones de guardado, y la
  regla dependería de que cada persona (o sesión) que escribe el siguiente botón se acuerde. Es exactamente lo que ya
  fallaba: las acciones que guardan en silencio son las que nadie recordó. Costo aceptado de no hacerlo: el loader no sabe *qué*
  botón se pulsó (solo que hay un guardado en vuelo), y no hace falta más.
- **Un contador por pantalla** (cada pantalla cuenta sus cargas pendientes y decide si mostrar el loader). Mismo defecto:
  obliga a tocar cada pantalla, y una pantalla nueva nace sin contador.
- **Un esqueleto por pantalla.** Bien para el caso parcial (se conserva ahí), pero es un diseño por pantalla, dobla el
  trabajo de cada módulo y no cubre el guardado ni el cambio de sede. El loader único cubre los tres casos con una sola pieza.
- **Interceptar en el servidor o en una capa de API propia.** CAYLA no tiene esa capa (Supabase + RLS, principio 11); lo
  único común a todas las esperas es que salen del navegador por `fetch`.
- **Interceptar `fetch` en un solo lugar** — *la elegida*. **Se cumple sola y una pantalla nueva no puede olvidarla:** basta
  con que haga una petición. Costo aceptado: hay que mantener la lista de RPC de lectura (ver Consecuencias) y parchear
  `window.fetch` es una pieza global que hay que probar bien (de ahí que la clasificación sea lógica pura, con pruebas).
- **Que cada pantalla dibuje su overlay** (lo que pasaba con el cambio de sede). Es justo lo que esta regla prohíbe.

## Consecuencias

- **Regla para toda sesión futura:** no se construye otro overlay de carga a pantalla completa ni se deja un «Cargando…» suelto.
  Vive en `CLAUDE.md` (sección «Carga y espera»), que es lo primero que lee una sesión nueva.
- **Al agregar una RPC de solo lectura llamada desde el navegador, hay que sumar su prefijo o nombre a la lista de lectura de
  `lib/espera-reglas.ts`.** Si no, el loader bloqueará la pantalla mientras la persona escribe o busca (cada búsqueda
  parecería un guardado). Esta es la única costura manual de la decisión; se cubre con las pruebas de `espera-reglas`.
- `AvisoCambioDeSede` pierde su overlay propio y pasa por `useEsperando`; su aspecto es el que el loader heredó, así que
  la persona no ve un cambio.
- El overlay pone el resto de la app en `inert`: mientras espera, no se puede hacer clic ni tabular detrás. Es intencional
  (evita el doble guardado), y el tope de 30 s garantiza que no se queda así para siempre.
- Una petición legítimamente larga (importaciones, reportes) mostrará el texto «Está tardando más de lo normal» a los 4 s. Si un
  caso concreto no debe bloquear, usa el opt-out `x-espera: no`.

## Cómo se verifica

1. Abrir una pantalla con la red lenta: aparece el loader a los 200 ms, con el aviso sobre lateral y cabecera; se va cuando
   llega el contenido. Con red rápida, no se ve nada (anti-parpadeo).
2. Presionar un botón que guarda (p. ej. registrar un pago): el loader aparece, dura al menos 400 ms si llegó a verse, y un
   guardado seguido de `router.refresh` es **un solo** loader, no dos.
3. Cambiar de sede: sale «Cambiando de sede A → B» en el mismo loader.
4. Buscar escribiendo en un campo cuya búsqueda es una RPC de lectura: el loader **no** aparece.
5. Simular una petición que no termina: a los 4 s el texto admite la demora; a los 30 s la ficha se suelta y la app vuelve a
   responder.
6. Activar «reducir movimiento»: el loader aparece sin giro ni barrido.
7. Pruebas unitarias de `clasificarPeticion` (`lib/espera-reglas.ts`): cada fila de la tabla de clases, el opt-out y las
   RPC de lectura.
