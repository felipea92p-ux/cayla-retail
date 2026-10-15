# ADR-0423 · Gestión e Inicio después de /chaos: la meta tiene techo y el adjunto, la forma de la pantalla

- **Fecha:** 2026-10-15 · **Estado:** construido y verificado en local (suite de base con controles, suites vecinas, el mismo ataque
  repetido con la misma semilla). **Las dos migraciones NO están en producción:** esperan el OK de Felipe. Rama `claude/chaos-gestion-5c56e1`.
- **Pedido:** Felipe, 2026-10-15: «pega las migraciones y continúa con el siguiente módulo». Era el último grupo del tablero de `/chaos` sin
  corrida con arreglos: Gestión (Frescura, Plan del piso, Análisis), Inicio, Rendimiento, CAYLA Global, Actividad, Comercial y Buscar.
- **Extiende:** ADR-0421 (Compras), ADR-0412 y ADR-0405 (textos con tope). **Complementa:** ADR-0356 (`/chaos`).

## Lo que se atacó (semilla `20261015`, 14 de núcleo + 8 de azar)

- **En la base, revertidos:** 67 ataques a lo que guarda este grupo: `anotar_decision_frescura` y `anular_decision_frescura` (acción, plazo
  0 y de 32 bits, nota de 281 y 5000 letras, inyección, color en minúsculas o con espacio, traslado que no calza, antecedente de otra prenda,
  el mismo token con otro contenido, sede sin piso, sin módulo, sin sesión), `fijar_grupos_de_categorias` (lote vacío, de 201, repetida,
  versión negativa, `NaN`, 1.5 o de 32 bits, grupo inventado, integrante), `fijar_meta_persona` (`NaN`, infinito, un centavo negativo, seis
  decimales, motivo de 81 y 5000 letras, motivo inventado, 2999, integrante, meta que cambió mientras se editaba, el mismo cambio reenviado),
  `registrar_adjunto_compra` (el que se sube desde Inicio y desde Compras), `marcar_guia_vista` y `cerrar_cola_arranque`.
- **Concurrencia, con COMMIT y la foto restaurada:** dos primeras decisiones de la misma prenda a la vez, quitar y anotar encima de la misma
  decisión a la vez, dos líderes que mueven la misma categoría del Plan del piso a grupos distintos. En las tres, la segunda espera y recibe
  «Otra persona…», sin dos cabezas ni historial doble.
- **URL:** 30 rutas con ids, textos de 1500 «ñ», comodines, `%00`, HTML y redirecciones hacia afuera en `desde`; y una integrante entrando
  por URL a los ocho módulos. Ninguna tumbó la pantalla ni salió del ERP; la integrante cae en «Sin acceso».

## Lo que quedó abierto, y la decisión

Todo solo por la API (la pantalla no lo arma), y nada de gravedad 1:

1. **Gravedad 2 · la meta de una persona para enero de 2999.** Rendimiento edita solo el mes en curso y la función ya rechazaba los meses
   pasados; el futuro no tenía techo. **Decisión:** hasta 12 meses adelante (`meta_mes_lejano`), el horizonte del plan de campaña.
2. **Gravedad 4 · un motivo de 81 letras** respondía con el texto crudo del candado de la tabla. **Decisión:** la función lo dice antes, con
   la misma regla (`meta_detalle_largo`).
3. **Gravedad 2 · el adjunto de una factura** aceptaba un nombre de 5000 letras y una ruta con más carpetas que la de su factura (o de 5000
   letras). **Decisión:** nombre hasta 255 letras y la ruta, la carpeta de su factura y UN archivo con letras, números, punto, guion o guion
   bajo: exactamente lo que arma `rutaPara` (`lib/adjuntos-compra.ts`). En la función (`adjunto_nombre_largo`, `adjunto_ruta_invalida`) y en
   la tabla, como último guardián (`compra_adjuntos_textos_con_tope`, `compra_adjuntos_ruta_un_archivo`).
4. **Gravedad 4 · el mismo archivo dos veces** respondía con el índice único. **Decisión:** «Ese archivo ya está adjunto a esta factura»
   (`adjunto_repetido`).

**Lo que no se cambia y por qué:**
- Un «12.500» escrito en la meta se lee como S/ 12.50 (`leerSoles`): es la pregunta transversal de la coma decimal que ya está abierta para
  Felipe desde Producción («1.299,50» leído como 1.2995). No se decide aquí.
- Una meta `NaN` por la API responde «no puede pasar de la de la tienda»: el mensaje no es exacto, pero no entra nada (la tabla tiene su
  candado de montos finitos, ADR-0416). Queda en el backlog.
- En el navegador, Frescura no tenía prendas «Por decidir» en la base local, así que la ráfaga de clics se probó en la base (el mismo token
  devuelve la misma decisión, una sola fila) y en el código (`enVuelo` y la marca por prenda que se conserva tras una respuesta incierta).

## Cómo se pega en producción

Dos partes, cada una en su llamada y en este orden: `20261015174000` (solo `alter table` sobre `compra_adjuntos`) y `20261015175000` (dos
reemplazos anclados que se detienen sin tocar nada si un ancla cambió). Ninguna lleva políticas. Antes (verificado el 2026-10-15): ninguna fila
en `compra_adjuntos` ni en `metas_persona_ajustes`; `fijar_meta_persona` y `registrar_adjunto_compra` idénticas a las de local (md5 `90183f3e…`
y `0eeeb824…`), cada ancla una sola vez. Después: los dos candados con `convalidated = true`, `meta_mes_lejano` en `fijar_meta_persona` y
`adjunto_repetido` en `registrar_adjunto_compra`.

## Cómo se verifica

- `pnpm pruebas:gestion-meta-y-adjunto`: 18 casos, cada uno con su control (sin las migraciones, el ataque entraba), lo válido que manda la
  pantalla, y la tabla escrita directo.
- Las suites vecinas: `metas-persona`, `notas-credito-modulo`, `dinero-compras-solo-lider`, `roles-por-modulo`, `roles-cobertura-modulos`.
- El ataque repetido con la misma semilla: los 18 de la meta y del adjunto resisten.
