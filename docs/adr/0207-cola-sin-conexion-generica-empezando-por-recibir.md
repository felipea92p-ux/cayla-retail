# ADR-0207 · Cola sin conexión genérica, empezando por Recibir mercadería

- **Fecha:** 2026-09-25 · **Estado:** Aceptado y construido (paso 1: Recibir). **Producción:** ninguna migración ni RPC
  nueva. `recibir_envio` y `recibir_lote` ya eran idempotentes por `p_token` (`envios.token_cliente`, ADR-0113;
  `lotes.token_cliente`, ADR-0190).
- **Extiende:** ADR-0063 (cola de la venta sin red). Esa cola sigue igual en `PuntoDeVenta.tsx`: necesita el overlay
  de stock y el envío a SUNAT de esa pantalla.
- **Alcance:** `lib/cola-offline.ts` (+ test), `lib/useColaOffline.ts`, `lib/useColaRecibir.ts`,
  `components/ColaOfflineAviso.tsx`, `components/ColasSinConexion.tsx` (montado en `app/(app)/layout.tsx`),
  `RecepcionEnvio.tsx`, `RecepcionFormV2.tsx`, `RecibirLotePanel.tsx`, `EnvioRecibido.tsx`, `lib/envio-reglas.ts`
  (`pendienteEnCola`).
- **Decide:** Felipe, 2026-09-25: «el modo sin conexión que tiene Vender, ahora para los módulos de agregar
  productos». Eligió empezar por Recibir (1A). Para el alta de producto: **el código se asigna al sincronizar** (2A).

## Problema

Llega un envío, se cuentan 110 prendas y al confirmar se cae el internet de la tienda. Hoy la pantalla muestra un
error y el conteo queda solo en la memoria de esa pestaña: si alguien recarga, se pierde y hay que volver a contar o
anotarlo en papel. La base ya no duplica un reintento; lo que faltaba era algo en el navegador que lo reintente.

## Decisión

- **D1 — Una cola genérica, no una copia por módulo.** `lib/cola-offline.ts` guarda operaciones
  `{token, rpc, params, firma, creadoEn, resumen, rechazo}` en `localStorage` (llave `cayla:<modulo>:cola`, una por
  MÓDULO y no por sede: cada operación lleva su sede en la firma). Es lógica pura y probada. El alta de producto se
  suma con otra llave y otra lista blanca, sin tocar este mecanismo.
- **D2 — Se intenta siempre; solo se encola si falla la RED** (`esFalloDeRed`, la misma huella de ADR-0063). Nada de
  adivinar con `navigator.onLine`. Un rechazo de la base deja de reintentarse y espera un «Descartar» en dos pasos.
- **D3 — La firma se congela con la hora en que se hizo** (`x-momento` = `creadoEn`, ADR-0162). Al subir mañana, la
  base valida que el responsable estaba de turno CUANDO recibió, no cuando volvió el internet.
- **D4 — UN solo lugar sube, desde cualquier pantalla.** `ColasSinConexion` vive en el layout de la app: sube al
  montar, al volver la red, apenas se encola algo y cada 30 s. Las pantallas solo pintan y encolan (`useColaRecibir()`
  sin `subir`). Así hay una subida y un aviso por operación, y lo recibido sin red sube aunque la persona ya esté en
  Vender. La subida lleva `x-espera: no`: no tapa la pantalla con el loader (ADR-0149).
- **D5 — Lo guardado en el navegador es dato, no instrucción.** Solo se ejecutan las RPC de la lista blanca del
  módulo (`RPCS_RECIBIR = recibir_envio, recibir_lote`); una fila rota o con otra RPC se descarta al leer.
- **D6 — Lo que ya se contó sale de «pendientes» mientras espera.** Es el equivalente al overlay de stock de Vender.
  Un comprobante o traslado cuyo envío está en la cola no se puede volver a marcar, ni desde la lista ni desde el
  indicador «La más atrasada». Tampoco en el rato entre que sube y llega la lista nueva del servidor
  (`subidasEntre`), porque la lista vieja lo mostraría otra vez. Sin esto, dos personas contarían el mismo comprobante
  y al volver la red subirían dos recepciones de la misma mercadería (principio 2).
- **D7 — Sin red no hay lote, así que no hay etiqueta de precio todavía.** La pantalla de éxito dice «guardado sin
  conexión»: nube en ámbar, sin el «visto» verde y sin «Imprimir etiquetas» ni «Ver recibidas» (navegar sin red deja
  la pestaña en una página que no carga).

## Alternativas descartadas

- **IndexedDB / service worker ahora:** la cola cabe holgada en `localStorage` (un envío grande pesa unos KB). Un
  service worker permitiría abrir la pantalla sin red, pero es un paso propio. Queda el mismo límite de Vender: **la
  pestaña tiene que haberse abierto con internet**.
- **Una cola por pantalla:** con dos llaves, lo encolado en `/inventario/recibir` no subiría si la persona sigue en
  `/recibir`, y habría dos avisos.

## Límites conocidos

- La pestaña debe estar abierta desde antes del corte (igual que Vender, ADR-0063).
- Entre pestañas no hay candado; protege el `token_cliente` de la base (medido: un segundo envío con el mismo token
  devolvió lo ya guardado y el stock subió una sola vez).
- Un rechazo transitorio del servidor se trata como definitivo (mismo hueco anotado en ADR-0063).
- Pasado ~7 días la firma queda fuera de la ventana de `x-momento` y la base la rechaza. Es a propósito.

## Paso siguiente

Alta de producto (`crear_producto_con_variantes`) con la misma cola: llave `cayla:productos:cola`, la prenda se
muestra «pendiente de código» hasta que sube. Las fotos se suben después de sincronizar. Después, el alta al vuelo del
conteo, que antes necesita `p_token` en `censo_crear_variante` (migración).
