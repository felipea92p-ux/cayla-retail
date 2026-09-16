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
   Sin stock.** "Stock bajo" (nuevo) = piso + almacén de ESA tienda ≤ 6 (Felipe:
   "6 o menos", el doble del umbral de piso que ya había fijado en 4). Bajar del
   almacén no lo arregla: hay que pedir traslado. Gana sobre "Reponer piso" a
   propósito — una prenda con 1 y 1 se puede reponer, pero eso no es lo que la
   encargada necesita saber; el botón "Reponer" se sigue ofreciendo aparte
   (`necesitaReponerPiso`), independiente del estado. Es distinto de
   `productos.stock_minimo` (Catálogo), que mira la red entera por modelo y avisa cuándo
   pedir al proveedor: dos preguntas distintas, dos números.
   - DESCARTÉ calcularlo contra la demanda (ventas/día) en vez de un número fijo: ya
     existe esa señal a nivel producto (`reponer_de_proveedor`, ADR de punto de reorden)
     y tener dos fórmulas para "me estoy quedando sin" en dos pantallas es justo la
     inconsistencia que este proyecto evita.
   - SE ROMPE SI una prenda de talla única vive normalmente con 6 unidades en una
     tienda: se verá "Stock bajo" aunque para ella sea normal. Si pasa seguido, el
     umbral se vuelve por categoría, no se parcha con un `if`.

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
