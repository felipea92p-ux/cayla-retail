# ADR-0207 · Cola sin conexión genérica, empezando por Recibir mercadería

- **Fecha:** 2026-09-25 · **Estado:** Aceptado y construido (paso 1: Recibir · paso 2: alta de producto · paso 3: abrir
  pantallas sin red con un service worker; ver «Actualización 2026-09-25 (b)» al final). **Producción:** ninguna migración ni RPC
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

## Actualización 2026-09-25 (b) — alta de producto, combo «Responsable» y abrir pantallas sin red

Felipe: «sigamos, lo de abrir otra pantalla sin red y todo lo que falte».

- **D8 — Alta de producto sin red** (`/productos/nuevo`). Misma cola, llave `cayla:productos:cola`, lista blanca
  `crear_producto_con_variantes` (`lib/useColaProductos.ts`). La prenda queda **«pendiente de código»**: el código
  `PREFIJO-NNNN` y el de barras los reparte la base al subir (decisión 2A de Felipe). La pantalla de éxito sigue la
  cola y cambia sola a «ya subió» o «rechazada». Antes de encolar se frena un segundo alta con el **mismo nombre**
  (`nombreEnCola`): sin red no se puede preguntar a la base, pero dos iguales en la cola chocarían al subir.
- **D9 — Las fotos del alta no se pierden**: `localStorage` no guarda archivos, así que van a **IndexedDB**
  (`lib/fotos-pendientes.ts`) bajo el token del alta. Suben DESPUÉS del producto, igual que en línea: `alSubir` anota el
  id que dio la base (`marcarCreado`) y el paso `trasPasada` del sincronizador las sube y las borra. Sin red a mitad, se
  reintenta; un error de otro tipo se avisa («agrégalas desde la ficha») y se suelta. Descartar el alta rechazada borra
  sus fotos.
- **D10 — El combo «Responsable» recuerda la última lista de turno** por sede (`cayla:turno:<sede>`, `useDeTurno`).
  Una pantalla que se ABRE sin red arranca con ella si tiene **menos de 12 h** (`turnoGuardadoVigente`) y lo dice
  («Sin conexión: lista de turno de las 10:32»). No es un permiso nuevo: al subir, la base valida la presencia a la hora
  de la operación (`x-momento`). Sin red y sin memoria, el combo dice «no se pudo leer» en vez de quedarse cargando.
- **D11 — Service worker** (`public/sw.js`, registrado por `components/SinConexion.tsx` en el layout de la app).
  - Guarda la última copia de **4 pantallas**: Vender, Recibir mercadería, Ingreso sin comprobante y Nuevo producto
    (`PANTALLAS_SIN_CONEXION`). Son las que tienen cola. Finanzas o Colaboradores no se guardan: dejarían datos
    sensibles en un equipo compartido sin ganar nada, porque sin red tampoco se podría guardar nada ahí.
  - Al abrir cualquiera de ellas: primero la red, y sin red la copia. Cualquier otra pantalla sin red muestra
    `/sin-conexion.html` en vez del error del navegador.
  - `/_next/static`, `/_next/image` y las imágenes propias van primero desde la copia (llevan hash).
  - El SW nunca responde por la base: las escrituras las guarda la cola del módulo.
- **D12 — Vender solo abre con la copia DE HOY** (hora de Lima). Decisión de Felipe, 2026-09-25, «Copia de hoy»:
  vender con el stock de una copia de ayer daría demasiadas ventas rechazadas o stock negativo al subir. La regla de
  dejar ≥1 unidad en piso sigue.
  - **Riesgo aceptado:** si otra sede vendió la última unidad después de la copia, la venta sube igual y ese stock
    queda negativo hasta regularizar.
- **D13 — Se sabe que es una copia**: el layout sella cada carga con la hora del servidor (`generadoEn`). Si al
  montar tiene más de 3 min (`esCopiaGuardada`), un aviso ámbar dice «Estás viendo la copia guardada en este equipo
  (25/09 · 14:13)».
- **D14 — Las copias son de una cuenta.**
  - Al cerrar sesión, o si en el navegador entra otra persona o terminal, se borran las copias y las listas de turno
    recordadas (`borrarCopiasSinConexion`).
  - Las **colas NO se borran**: son trabajo de la tienda que todavía no subió (principio 9).
- **D15 — En desarrollo el SW no se registra** (serviría JavaScript viejo tras cada cambio). Para probarlo:
  `localStorage["cayla:sw-dev"] = "1"`. `sw.js` y `sin-conexion.html` quedan fuera del `matcher` de `proxy.ts`.

**Probado en local** (servidor de Next apagado para simular la caída):
- Las 4 copias se guardaron.
- `/inventario/recibir` abrió desde su copia.
- Un clic del menú a `/recibir` terminó en su copia.
- `/finanzas/gastos` mostró «Sin conexión».
- Vender con una copia envejecida a ayer no abrió.
- El aviso de copia salió con la hora de Lima.
- Alta de «Cinturon Prueba Sinred» sin red: al volver quedó `CIN-0001` con `CIN-0001-S/M/L`.

**Límites que quedan:**
- Una pieza que se carga recién al usarla (el código de un modal que nunca se abrió con red) puede no estar en la
  copia.
- El alta al vuelo del conteo NO entra: el conteo guarda escaneo por escaneo (`conteo_contar`). Hacer offline solo el
  alta al vuelo no sirve si el conteo entero no funciona sin red. Es un módulo propio y está en el BACKLOG.
- Abrir y cerrar caja sin red (PL-40) tampoco: es de Caja, no de agregar productos.
