## 🧭 La ida y vuelta de las guías (2026-11-18, ADR-0389) — solo herramientas, sin migración; rama `claude/guias-ida-y-vuelta`

- [x] `pnpm --filter web guias:recorrer -- --ida-y-vuelta`: → hasta el último paso, ← hasta el primero y → otra vez. Falla si un paso
  se salta al volver o en la segunda ida, si aparece una nota que no estaba o si cambian las hojas abiertas, y dice qué paso y en qué
  pasada. La comparación es pura y tiene su prueba (`guias/ida-y-vuelta.mjs`, `lib/guias-ida-y-vuelta.test.ts`). La skill `/guia` la
  pide en su paso 4.
- [x] El recorredor espera mientras la tarjeta sigue «ocupada» en vez de repetir la tecla (Mi plata tardaba casi un minuto en descartar
  opcionales y se anotaba el mismo paso cuatro veces), y lee las RPC de lectura de `lib/espera-reglas.ts`: `ofertas_` salía como
  «ESCRIBIÓ EN LA BASE» en Vender y Apartados.
- [x] **Corrida completa**: las 122 guías a 1440×900 y a 375×812, contra una base local propia con todas las migraciones de main y el
  motor del PR #1954 (todavía abierto) fusionado en una copia aparte. 244 resultados: ✓ 154 · ✗ 64 · ⚠ 26 (sin datos locales).
- [x] **Control**: con el motor de main (sin #1954), Editar producto se salta 3 pasos al volver y Existencias 12, lo mismo que #1954
  dice arreglar. Con #1954, las dos pasan.
- [x] Arreglados aquí, una línea de guía cada uno, y vueltos a correr en los dos anchos (✓): Rótulos («Las marcas» elige Marcas) y Plan
  del piso («Cómo está el riel hoy» elige Propuesta). Apartados pasa en los dos anchos sin el falso positivo de `ofertas_`.

### Fallan la ida y vuelta (sin arreglar)

**Del motor** (`fuenteAlVolver`, `components/guias/GuiaInteractiva.tsx`, PR #1954). Arreglarlo en el motor resuelve varias de abajo:
- [ ] La cadena de reapertura toma como fuente el paso más cercano con `preparar`, aunque ese `preparar` solo cierre (Escape) o vacíe un
  buscador, y ahí se corta. Pasa en Productos, Configuración, Devoluciones, Producción ▸ Proveedores, Colaboradores, Análisis y Recibir.
- [ ] Lo que abre el `demostrar` de un paso (no su `preparar`) no se repite al volver: Compras («Lo que estás filtrando»), Inicio («Una
  tienda de cerca»), Configuración («La propuesta», «Desde cuándo y cuánto»), Flujo de caja («Qué pago y cuántas semanas», «Cada cuánto y
  desde cuándo») y Vender («Lo que encontró»; a 375, la hoja del catálogo).

**De la guía: una pestaña, una vista o una búsqueda que elige un paso de más adelante queda puesta, y nadie la deshace:**
- [ ] `productos`: los últimos pasos pasan a «Tabla»; del paso 11 «Tarjetas grandes o chicas» al 36 «¿Cuál se queda?» (26 pasos) se
  saltan al volver y en la segunda ida, y «Busca una prenda» se queda sin ejemplo. Elegir `productos.vista-grilla` antes de las tarjetas.
- [ ] `productos.atributos`: «Su foto o su dibujo» toca la primera tarjeta sin elegir la pestaña; al volver desde Patrones abre la ficha
  de un patrón («Animal print») y «Sobre este tejido» se salta. Probado y descartado aquí: elegir `atributos.pestana-tejidos` antes del
  toque navega, y la hoja que abre el toque siguiente se cierra al rehacerse la pantalla (el paso 19 queda sin hoja). Pide que el motor
  espere a que la navegación termine, o que la guía elija la pestaña en un paso aparte.
- [ ] `productos.id.historial`: la píldora «Costo» reemplaza el hilo; «Un cambio, una tarjeta» y «Ventas y stock» se saltan. La píldora
  «Todo» no tiene ancla: pide tocar `HistorialPrenda.tsx`.
- [ ] `colaboradores`: «Roles» queda elegida; del 6 «Ver por grupos» al 15 «Quitar el acceso» se saltan. Elegir
  `colaboradores.sec-equipo` en «Ver por grupos» y en «La ficha de una persona».
- [ ] `configuracion`: la pestaña «Empresa» queda elegida; del 26 al 35 (Impuestos) se saltan al volver.
- [ ] `devoluciones`: «Por aprobar» queda elegida; del 9 «Filtrar las compras» al 15 «Anular una venta de hoy» se saltan.
- [ ] `produccion.proveedores`: «Tarifas» queda elegida; los pasos 3 a 11 (con la hoja «Nuevo proveedor») dicen «no está a la vista».
- [ ] `inventario.movimientos`: «Ingresos» queda elegida; los pasos de «Movimientos» (menú, período, tabla, «Nada se borra») no están.
  Elegir `movimientos.pestana-movimientos` en «Descargar o compartir» y en «Nada se borra».
- [ ] `inventario.resumen` (Análisis): «Cuál se acaba» elige otra pestaña; «Las respuestas de hoy» y «Qué hacer hoy» se saltan.
- [ ] `inventario.traslados` (2.ª ida): «Busca una caja» toma su ejemplo de «Te llegan», y la 2.ª ida arranca en otra pestaña.
- [ ] `finanzas.cierre`: «Otra unidad» deja elegida Trujillo, que no tiene nada pendiente: «Resolver lo que falta» se salta.
- [ ] `compras.mi-plata.envios`: «Busca un código» deja «ENV» escrito; «Esta ronda» y «Rondas anteriores» se saltan. Vaciar el
  buscador en esos dos pasos.
- [ ] `cambios`: «Así se ve un cambio por dentro» deja la pantalla en el cambio; del paso 3 al 15 dicen «no está a la vista» o se saltan.
- [ ] `recibir`: al volver desde «¡Listo!» no se reabre «Todo lo recibido»; del 7 al 13 se saltan.
- [ ] `vender.historial` (2.ª ida): «Todos los filtros» toca `historial.filtros`, que ya no está a la vista.

**De la guía: un toque que alterna sin `para`:**
- [ ] `compras`: «Los filtros» y «Ordenar la lista» tocan el mismo botón; al volver el panel queda cerrado. `para: "abrir"` / `"cerrar"`.
- [ ] `productos.nuevo` (2.ª ida): «Y después, la categoría» toca la primera familia, y la segunda vez la desmarca. Hace falta un toque
  que elija sin alternar para una ficha con `aria-pressed`.

**Para mirar:**
- [ ] `produccion.insumos`: en la ida, los pasos de «Nueva tela» cuentan 2 `[role=dialog]`; al volver, 1. Ver si la hoja de «Nuevo avío»
  queda montada debajo, o si el recorredor debería contar solo las hojas que se ven.
- [ ] `produccion.ordenes`: además de lo de la ida (abajo), al volver se saltan pasos de la hoja «Nueva orden».

### Fallan ya en la ida (no es de la vuelta)

- [ ] `finanzas.dinero`, `finanzas.dinero.por-pagar`: «¿Cuánta plata tienes hoy?» / «¿Cuánto debes?» buscan `telar.respuesta`, que la
  pantalla ya no dibuja.
- [ ] `tienda-web.campanas.editor`: 8 pasos de la pestaña Diseño no encuentran su pieza.
- [ ] `tienda-web.pedidos`: «Lo pagado, por entregar» pide tocar un botón que guarda (el motor se niega).
- [ ] `vender.reportes.empresas`: 6 pasos sin pieza.
- [ ] `produccion.ordenes`: «Hoy en el Taller», las pestañas, los filtros y el buscador no aparecen.
- [ ] `inventario.por-regularizar`, `tienda-web.vitrina.esperan`: el buscador no tiene un ejemplo a la vista (base sin esos datos).

### Sin recorrer (⚠ sin datos locales, 13 guías)

Las órdenes de compra (ver, editar, comprobante, envío), la compra repartida, los conteos (revisar, confirmar), las órdenes de insumos
(ver, editar, comprobante), la orden de producción, el envío por recibir y el tráfico de la tienda web. La base del seed no los trae;
se cargaron a mano solo en las bases propias de los PR #1945/#1954.
