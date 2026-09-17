# ADR-0071 — Inventario se lee como cuatro pantallas: Existencias, Movimientos, Traslados, Conteo

**Numeración:** nació como ADR-0070 en esta rama; al fusionar con `main` ese número ya lo
tenía "Colores: proponer/aprobar" (PR #59, `0070-colores-proponer-aprobar.md`), fusionado
mientras esta pieza seguía en PR sin fusionar. Se renumera a 0071, siguiendo el mismo
protocolo que ADR-0067/0068 (quien fusiona en segundo lugar renumera).

**Fecha:** 2026-09-16
**Estado:** Aplicado en local. La migración `20260916200000_numeracion_traslados_conteos.sql`
está **pendiente de aplicar en producción** — Felipe autorizó la pieza (número corrido) al
elegir la opción, pero el paso concreto contra `cayla-dynamic` espera su ok puntual, como
siempre.
**Afecta:** `AppShell.tsx` (grupo "Inventario"), `InventarioNav.tsx` (pestañas), ruta
`/movimientos` → `/inventario/movimientos`, `lib/inventario-reglas.ts` (semáforo de 4
estados), `retail.transferencias.numero`, `retail.conteos.numero`, función nueva
`retail.fn_conteos_resumen`. **Ninguna tabla de stock ni `movimientos` cambia de forma;
ninguna RPC de escritura cambia.**

## Contexto

Felipe diseñó en Stitch cuatro pantallas para Inventario (Existencias, Movimientos,
Transferencias, Conteos) y pidió integrarlas "sin aplastar nada de lo que ya tenemos".
Se auditaron contra el código real, no contra los diseños: la mayor parte de lo que
mostraban ya existía como dato (piso/almacén, traslados en dos fases —ADR-0068—,
conteos con alcance, `fn_stock_por_sede`) y solo faltaba la pantalla que lo mostrara
junto. Una parte describía otra empresa y no entró: "Almacén Central" (CAYLA no tiene
hub, cada sede manda a cada sede), guías SUNAT (traslados entre sedes todavía no emiten
Guía de Remisión — hueco legal aparte, ya anotado), courier, "actualizado hace 2 min"
(la app no sincroniza en segundo plano), percheros y turnos (no existen como dato).

Cuatro cosas cambiaban estructura o reglas de negocio y se le preguntaron a Felipe con
Ganas/Pagas. Sus respuestas gobiernan este ADR.

## Decisiones

1. **Inventario es un grupo del lateral con cuatro hijos, y las mismas cuatro son las
   pestañas del módulo.** Mismo patrón que Catálogo y Compras (que Felipe pidió el
   mismo día). Movimientos se muda a `/inventario/movimientos`; `/movimientos` queda
   como `permanentRedirect` que conserva la query — un `?mov=<id>` mandado por
   WhatsApp ayer sigue abriendo ese movimiento. "Recibir" y "Mover" dejan de ser
   pestañas porque son ACCIONES, no pantallas: mover es el botón "+ Nuevo traslado";
   recibir sin factura sigue en su ruta y en "+ Nuevo" (Compras tiene el camino
   principal). Ninguna ruta se borra.
   - DESCARTÉ dejar el lateral como estaba (Movimientos, Inventario, Traslados sueltos):
     la barra de pestañas de los diseños no existiría y Movimientos seguiría viviendo
     fuera de Inventario. Y descarté seis pestañas (con Recibir y Mover): no caben en
     una pantalla mediana, y "Mover" y "Traslados" son la misma cosa vista dos veces.
   - SE ROMPE SI un enlace externo apunta a `/movimientos` con un parámetro que no sea
     string (arrays) — el redirect los reenvía con `append`, probado con `?cat=entrada`.

2. **Semáforo de Existencias con cuatro estados: Normal · Reponer piso · Stock bajo ·
   Sin stock**, corregido el mismo día probando la pantalla con datos reales — ver
   "Corrección 2026-09-16" más abajo, que reemplaza los umbrales originales de este
   punto (4 y 6) por los que rigen hoy (7 y 20) y cambia a qué mira "Stock bajo".
   Es distinto de `productos.stock_minimo` (Catálogo), que mira la red entera por
   modelo y avisa cuándo pedir al proveedor: dos preguntas distintas, dos números.
   - DESCARTÉ calcularlo contra la demanda (ventas/día) en vez de un número fijo: ya
     existe esa señal a nivel producto (`reponer_de_proveedor`, ADR de punto de reorden)
     y tener dos fórmulas para "me estoy quedando sin" en dos pantallas es justo la
     inconsistencia que este proyecto evita.

3. **Número corrido para traslados y conteos** (`transferencias.numero`,
   `conteos.numero`; sequence propia cada uno, default al insertar, rellenado por
   `created_at` para las filas que ya existían). "Traslado 12" es lo que se dice por
   WhatsApp; el uuid no. Global en toda la red, no por sede: dos sedes hablan del
   mismo traslado con el mismo número. El prefijo ("#TR-") es presentación, no dato.
   - DESCARTÉ un contador por sede ("TRU-0012"): exige una tabla de contadores y no
     resuelve nada que el número global no resuelva.
   - SE ROMPE SI alguien inserta con un `numero` explícito repetido — el `unique` lo
     rechaza. Un hueco en la numeración por transacción abortada es esperado: el número
     identifica, no cuenta.

4. **Conteo NO gana un estado "por revisar".** Felipe: "eso lo hace la misma persona
   que realiza el conteo". Un conteo está abierto o cerrado. La pantalla muestra, del
   abierto, su avance (`previsualizar_cierre_conteo` ya distingue contado/no contado —
   no hizo falta consulta nueva) y su diferencia acumulada en soles; del historial,
   resultado y responsables vía `fn_conteos_resumen` (sumas en Postgres, no en
   TypeScript: traer los `conteo_items` de 20 conteos para pintar 20 totales sería
   miles de filas por carga).
   - DESCARTÉ el estado intermedio con RPC `terminar_conteo`: era un paso más para
     quien cuenta y una migración más, para un caso que Felipe dice que no ocurre.
   - SE ROMPE SI en la práctica una integrante cuenta y un líder cierra en otro
     momento: hoy `cerrar_conteo` exige líder, y ella no puede avisar que terminó más
     que de palabra. No se cambió el permiso de cierre (no se pidió); queda anotado.

## Corrección 2026-09-16 (mismo día, probando la pantalla ya construida)

Felipe probó Existencias y pidió cinco ajustes puntuales — cuatro visuales y uno de
regla de negocio real, que reemplaza al punto 2 original:

1. **Los umbrales del semáforo cambian, y "Stock bajo" deja de sumar piso + almacén.**
   `UMBRAL_REPOSICION_PISO` sube de 4 a 7 (con 4 el aviso llegaba tarde). El cambio de
   fondo: `UMBRAL_STOCK_BAJO_TIENDA` (piso+almacén ≤ 6) se retira; nace
   `UMBRAL_STOCK_BAJO_ALMACEN` = 20, que mira **solo el almacén**, sin sumar el piso.
   La pregunta que resuelve pasó de "¿cuánto hay hoy en total?" a "¿a esta tienda
   todavía le queda de dónde sacar?" — una prenda con el piso lleno y el almacén en 15
   igual pide traslado, porque cuando el piso se vacíe no habrá con qué reponerlo.
   `calcularEstado` queda con sus tres `if` en orden estricto de severidad
   (sin_stock → stock_bajo → reponer_piso → normal): con este orden, "Reponer piso"
   solo aparece cuando el almacén YA tiene más de 20 — hay reserva sana, solo falta
   bajarla; si la reserva misma está baja, gana "Stock bajo" sobre "Reponer piso"
   siempre, no como antes (que "Reponer" se ofrecía aparte del estado, con su propia
   función `necesitaReponerPiso`, retirada en esta corrección).
   - DESCARTÉ mantener dos condiciones independientes (piso bajo Y almacén bajo,
     evaluadas por separado): con los `if` encadenados, la severidad se decide sola —
     agregar una tabla de combinaciones al lado hubiera sido la misma regla, escrita
     dos veces, con más chance de desincronizarse.
   - SE ROMPE SI una prenda con el piso lleno (>7) y el almacén exactamente en el
     umbral (=20) es normal en la práctica pero el sistema la marca "Stock bajo": el
     número es de Felipe, ajustable en `UMBRAL_STOCK_BAJO_ALMACEN`, una sola constante.
2. **"Reponer" solo aparece en el estado "Reponer piso"** — antes se ofrecía también en
   "Stock bajo" (con algo en el almacén, aunque fuera poco). Con la nueva definición de
   "Stock bajo" (ya no importa el piso) esto ya no hacía falta separado: el botón
   ahora solo mira `f.estado === "reponer_piso"`, directo, sin una segunda función.
3. **Miniatura de la prenda** en la columna "Prenda · variante" — la foto principal del
   producto (`producto_fotos.es_principal`, o la de menor `orden` si ninguna está
   marcada), 36×36, con un marcador de perchero (mismo trazo que `IC.inventario` en
   `AppShell.tsx`) cuando el producto no tiene fotos. Primera pantalla de LISTADO que
   muestra fotos de producto en esta app — hasta hoy solo vivían en la ficha
   (`/productos/[id]`) y en el formulario de alta/edición.
4. **"En la red" cambia de formato**: de "15 en Taller" (una línea) a "Disponible en 2
   sedes: 20 uds" arriba y "Taller: 15 · Lima: 5" abajo — el formato de la referencia
   operativa de Felipe. Función nueva `resumenRed()` en `lib/stock-por-sede.ts`, **no**
   un cambio a `textoOtrasSedes()` — esa la usa también Vender
   (`PuntoDeVentaCatalogo.tsx`, "no hay tu talla aquí, pero sí en Trujillo") con su
   propio formato de una línea, y las dos pantallas no tenían por qué leer igual.
5. **Confirmado, no cambiado: "Piso · Almacén" ya estaba centrado.** Medido en el DOM
   (no a ojo): la celda es un *grid item* — CSS "blockifica" todo hijo directo de un
   contenedor `display:grid`, así que `text-align:center` sobre un `<span>` sí centra
   su contenido ahí, con la misma separación a cada lado (45px/45px en la fila medida).
   Lo que se veía descentrado en la captura de Felipe era la fila completa, más angosta
   antes de sumar la miniatura de la prenda (punto 3) — no esta columna en particular.

## Corrección 2026-09-17 (probando en producción con datos reales)

Felipe probó Existencias ya con productos de arranque reales en producción y pidió tres
ajustes más:

1. **"Stock bajo" baja de 20 a 10** en el umbral de almacén — con 20, un lote chico de
   boutique (10-15 unidades, normal para una tienda de 2 sedes) caía en "Stock bajo" de
   entrada, sin haber vendido nada todavía. 10 separa mejor "recién llegado en cantidad
   razonable" de "de verdad crítico".
2. **"Reponer" deja de estar atado al chip de estado.** Hasta ayer el botón solo
   aparecía en el estado "Reponer piso" — la corrección del propio Felipe, pensando que
   "Stock bajo" significaba "no hay nada que reponer, hay que pedir traslado sí o sí".
   Probándolo se dio cuenta de que las dos cosas conviven: si el almacén tiene 9
   unidades y el chip dice "Stock bajo" (⩽10), pedir el traslado sigue siendo correcto
   PERO esas 9 unidades igual se pueden bajar al piso ahora mismo. Se revive
   `necesitaReponerPiso()` (retirada en la corrección del 16) como una condición
   independiente del chip: `piso ⩽ 7 && almacén > 0`. El chip (qué tan grave es) y el
   botón (si hay algo que mover) vuelven a ser dos preguntas separadas — que es,
   estrictamente, lo que eran en el primer diseño; el vaivén de estos tres días fue
   encontrar juntos, probando con datos reales, dónde estaba el balance correcto.
   - SE ROMPE SI se vuelve a fusionar "chip" y "botón" en una sola condición — ya pasó
     dos veces en tres días (primero mostrando de más, después de menos). Quedan
     como funciones separadas a propósito: `calcularEstado()` decide el chip,
     `necesitaReponerPiso()` decide el botón, y no se tocan entre sí.
3. **"Piden atención" tenía un bug real, no solo una confusión de UX.** Felipe no
   entendía a qué se refería la tarjeta — al revisar el código, la razón era concreta:
   el NÚMERO de la tarjeta sumaba solo `reponer_piso + stock_bajo`, pero el TEXTO debajo
   de ese mismo número (su propio desglose) ya incluía "sin stock". La tarjeta se
   contradecía a sí misma — mostraba un número y, un renglón más abajo, una cuenta que
   no cuadraba con él. Se corrigió a `reponer_piso + stock_bajo + sin_stock`: ahora
   "Piden atención" es, de verdad, "todo lo que no está en Normal", y el número
   coincide siempre con su propio desglose. No se eliminó — el defecto era la
   definición, no el concepto (una cuenta rápida de "cuánto necesita acción hoy" sigue
   siendo útil para quien abre la pantalla en la mañana).

## Consecuencias

- La "exactitud del inventario" que muestra Conteo es sobre LÍNEAS de conteos
  cerrados (una línea +1 y otra −1 no se cancelan), sin meta ni comparación contra el
  mes anterior: un número real, no un tablero.
- Existencias muestra también las prendas que vienen en camino y que la tienda nunca
  tuvo (fila en cero con "+N en camino"): encontrado probando — Blusa Emma viajando a
  Trujillo, que solo vendía Blusa Valentina, no aparecía.
- Lo que los diseños tenían y NO se construyó, a propósito y anotado en BACKLOG:
  exportar a Excel/CSV, campana de notificaciones, "Ajuste rápido" desde la cabecera de
  Movimientos, y una "solicitud de traslado" desde la sede que se queda sin stock (hoy
  "pedir traslado" es un llamado, no una acción del sistema).
- Timestamp de la migración: nació como `20260916190000`; `main` recibió ese mismo
  minuto de otra sesión (`variantes_identidad_unica`) mientras se construía esto. Se
  renombró a `20260916200000` antes de fusionar — cuarta colisión de este tipo en el
  repo, misma regla: el que fusiona renumera.
