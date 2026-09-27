# ADR-0245 · Análisis conectado: «Qué hacer», por prenda, con sus pantallas vecinas y hecho para el celular

- **Fecha:** 2026-09-26 · **Estado:** Implementado en web (PR pendiente de fusión por Felipe). La web **no necesita
  migración propia**. Su botón «Pedir a otra sede» usa la migración `20260927210000_pedir_a_otra_sede.sql`, que es la
  tanda 4 de ADR-0242 (D-7), va en el mismo PR y **no está en producción**: necesita el OK de Felipe para pegarse.
- **Numeración:** 0243 lo tomó la ficha de producto (PR #520) y 0244 Conteo conectado (#523).
- **Pedido:** Felipe pasó 5 capturas de `/inventario/resumen` (TRU) y pidió conectar Análisis con las pantallas nuevas,
  agilizar a la colaboradora y hacerlo usable en el celular, «que la mayoría usará el teléfono gran parte del día».
  - Pidió además analizar funciones de otras empresas, sacar lo redundante y resolver las dudas con preguntas.
  - Eligió las **cuatro conexiones**: Bajar al piso y Trasladar, Etiquetas para rebajar, Pedidos no atendidos, y
    Reponer por Compras o Producción. Pidió analizar cuál conviene en cada caso.
  - Sobre el spike eligió: tabla con **Interruptor**, **«Qué hacer» + gráficos plegados** y **dos pestañas
    arregladas** para Comparar.
  - Sobre «Pedir traslado»: «si no hay restricción, que todos los integrantes puedan verlo». La restricción existe
    (abajo). La salida es la solicitud de ADR-0242 D-7, que la base deja pedir a quien ve Análisis o Traslados.
  - Cerró con «realiza la primera pero con migración de todo».
- **Spike:** `docs/maquetas/analisis-conectado-2026-09/spike.html` (computadora y celular; ✓ = lo elegido). Su README
  tiene el diagnóstico completo.
- **Complementa:**
  - ADR-0138: Desempeño y Comparar.
  - ADR-0121: Análisis sugiere y nunca mueve stock.
  - ADR-0231: nunca cantidades sugeridas.
  - ADR-0237: Existencias por prenda, marcar varias, escáner.
  - ADR-0242 D-7: pedir a otra sede.
  - ADR-0161: accesos por módulo.
  - ADR-0206: celular sin barra de navegación.

## Problema

1. **La lectura decía qué hacer y no dejaba hacerlo.** «Liquidar o trasladar» era texto. `lib/resumen-acciones.ts`
   (`resolverAccion`, ADR-0121) armaba esos enlaces, pero ninguna pantalla lo usaba desde el rediseño de ADR-0138.
2. **La tabla tenía 10 columnas por talla, casi todas en N/D**, y repetía la misma lectura en cada fila.
3. **Cinco medidas parecidas en una pantalla.** Rotación valorizada, de piso y total, sell-through clásico y de
   exposición. El Top rotación decía 32× al lado de la cifra de 0.25×. Era jerga sin salida para quien vende.
4. **Dos gráficos no decían nada con poco historial.** La tendencia estaba vacía y la distribución tenía todo en
   una sola barra.
5. **En el celular no se podía usar.** La tabla medía 81 rem de ancho mínimo, los filtros estaban en dos lugares y no
   había forma de escanear.
6. **Defectos en las capturas:**
   - Las pestañas mostraban una barra de scroll y cortaban «Comparar períodos».
   - «Nunca vendió (1 día expuesto)» se montaba sobre Tendencia, y un SKU largo sobre «Stock actual».
   - Comparar con un período A anterior al historial mostraba todo en «0 →» y «N/D →» sin explicar por qué.
7. **La integrante que ve una prenda agotada que otra sede tiene no podía hacer nada con eso.**
   - `iniciar_traslado` exige operar la sede de ORIGEN (`fn_puede_operar_ubicacion`,
     `supabase/migrations/0003_funciones.sql:297`, y la RLS de `transferencias`, `0004_rls.sql:149`).
   - Mover mercadería solo respeta un `?origen=` ajeno si quien entra es líder.
   - Esa restricción es correcta: nadie saca stock de otra tienda sin que esa tienda lo sepa.

## Decidí

1. **Cuatro cifras en palabras de tienda:**
   - Vendido.
   - Vendió de lo colgado (el sell-through de exposición del conjunto).
   - Piden algo hoy: lleva a «Se agotaron».
   - Quieto sin vender: unidades estancadas, y el líder lo ve al costo cuando todas tienen costo confiable.
   - En el celular van 2 × 2, con solo el número en grande.
   - Rotación valorizada y capital bajan a los gráficos plegados.
2. **«Qué hacer»: cuatro grupos de trabajo y la tarjeta «Pidieron y no había».**
   - Los grupos son «Se agotaron», «Duermen en almacén», «Estancadas» y «Las que más venden». Cada uno filtra la tabla
     (`?grupo=`).
   - La tarjeta «Pidieron y no había» lleva a `/pedidos-no-atendidos`.
   - Los grupos **no son reglas nuevas**: salen de `lecturaDesempeno` (las 7 categorías canónicas):
     - agotada → Se agotaron.
     - problema de reposición o sobrestock → Duermen en almacén, **solo si hoy hay algo en el almacén**.
     - estancamiento → Estancadas.
     - saludable y entre las 10 más vendidas → Las que más venden.
   - Lo recién colgado se dice una vez, en una línea, y no en cada fila.
3. **La tabla entra por prenda (modelo + color), con «Por talla» a un toque (`?ver=talla`).**
   - La fila por prenda lleva la curva de tallas (vendidas · hoy piso · almacén), lo vendido, «vendió de lo colgado»,
     «sin venta», la tendencia de la prenda y «Qué hacer» con su botón.
   - «Por talla» es la tabla de siempre, con los defectos arreglados y el mismo botón bajo la lectura.
   - En el celular son tarjetas con el botón a la vista.
4. **La acción que conviene** (`accionPrincipal`, `lib/analisis-que-hacer.ts`, con pruebas):
   - Se agotó:
     - Bajar al piso las tallas con almacén.
     - Si no hay en el almacén, **Pedir a la tienda** que cubre más tallas.
     - Si nadie tiene, Reponer: Producción u orden de Compras según `origen_abastecimiento`, y solo si el rol ve el
       módulo.
   - Duerme en almacén: Bajar al piso.
   - Estancada: Trasladar lo del almacén; si todo está colgado, Rebajar (etiquetas).
   - Vende bien: Bajar al piso la talla que se está cortando.
   - Cada enlace lleva una unidad por talla (ADR-0231) y va a la pantalla que ya hace el trabajo (ADR-0121).
   - Un botón que terminaría en «Sin acceso» no se muestra.
5. **Detalle de la prenda (`<Modal>`)** con:
   - el porqué y tres cifras;
   - las tallas, con «Bajar» en cada una;
   - todas las acciones (Historial y Existencias incluidos) y dónde más hay;
   - las rotaciones técnicas plegadas.
6. **Marcar varias** lleva a una barra con Bajar al piso, Trasladar y Etiquetas, como Existencias.
7. **Celular:** «Escanear prenda» fijo abajo, con el mismo `EscanerBusqueda`. El código leído busca, y si queda una
   sola prenda su detalle se abre solo: «¿esta se vende?».
8. **Pedir a otra sede, para todas.**
   - El botón abre `PedirAOtraSedeModal` → `pedir_a_otra_sede`. La base lo acepta con Análisis o Traslados, operando
     la sede que pide.
   - La otra sede lo ve en Traslados («Te piden») y lo envía con un toque (`enviar_pedido_a_otra_sede`, que usa
     `iniciar_traslado` desde el origen).
   - Así se respeta la restricción y queda registro de quién pidió, cuándo y si se atendió.
   - El diseño de la base está en ADR-0242, «Tanda 4».
9. **Defectos arreglados:**
   - Las pestañas quedan sin barra de scroll. La causa: `overflow-x-auto` vuelve `auto` también el eje vertical, y el
     `-mb-px` lo desbordaba 1 px.
   - Las celdas ya no se montan.
   - Comparar avisa cuando el período A es anterior al historial (`avisoSinHistorialEnA`).

## Descarté

- **«Ventas por semana» del spike.** Pide ventas por día, que la RPC de Análisis no trae. Entró en su lugar «Qué tallas
  salen», que sí sale de los datos.
- **Una tabla propia de solicitudes de traslado** (la primera idea de esta sesión). ADR-0242 D-7 ya había decidido
  extender `separacion_pedidos`: habrían quedado dos listas de pedidos.
- **Reponer con la lista cargada.** `/compras/nueva` y `/produccion/ordenes` no leen `?variantes=`. El botón abre la
  pantalla vacía y en la barra de varias no hay «Reponer». Queda en BACKLOG.
- **«Trasladar a la sede donde sí se vende».** No hay ventas por sede en la lectura de Análisis. «Trasladar» abre Mover
  con la lista y la persona elige el destino.
- **Rotaciones solo para el líder en el detalle.** «Por talla» las muestra a todos, así que se pliegan para todos.

## Riesgos y cómo se verifica

- **Pruebas:**
  - `lib/analisis-que-hacer.test.ts` (20): grupos desde las lecturas, agrupado por prenda, tendencia, cada acción y
    sus límites (sin almacén no hay Bajar; sin nadie con stock no hay Pedir; sin acceso no hay botón), una unidad por
    talla, cifras.
  - Todo `lib/` en verde (78.088 pruebas).
- **La red** (otras tiendas y abastecimiento) sale de `fn_resumen_variantes_json`, la misma lectura de Existencias,
  en caché por pedido. Si falla, Análisis sigue entero y solo se pierden «Pedir» y «Reponer» (principio 9).
- **Pedidos no atendidos** también es un dato secundario: si su lectura falla, la tarjeta no sale.
- **Verificado en el navegador** con una página de prueba temporal, sin sesión y con datos inventados, a 1440 y 375 px:
  - cifras 2 × 2 en el celular y sin scroll horizontal;
  - grupos que filtran;
  - tabla por prenda con su botón;
  - detalle;
  - barra de marcadas con los enlaces correctos (`/inventario/bajar?lineas=p4-S:1,p4-M:1`, …);
  - «Por talla» sin columnas montadas;
  - la hoja «Pedir a Tienda AQP».
- **Falta:** verlo con una cuenta real y datos de producción, y la cámara en un teléfono (el panel la bloquea).
- **Producción:** la web se puede publicar antes que la migración 20260927210000. Mientras tanto, «Pedir a otra sede»
  falla con el error de «función no existe», y el resto de Análisis funciona igual.
  - Orden recomendado: pegar la migración (una parte, sin políticas ni `drop trigger`) → fusionar → publicar.
