# ADR-0563 — Una prenda lleva su tela y también forro u otras telas: los complementos de la orden

**Estado:** aceptada; **la base y la web construidas y probadas en local; migración `20261029021000` SIN pegar en producción (va antes de publicar la web)** · **Fecha:** 2026-10-29 ·
**Decidió:** Felipe (opción A, aprobada el 2026-10-29) · **Sigue a:** ADR-0510 (editar la tela y los avíos de una orden abierta) y ADR-0513 (la ficha de consumo del modelo)

## Contexto

Felipe (2026-10-29, con la captura de la sección «Tela y avíos» de una orden): «una prenda lleva tela pero también otros materiales como el forro o distintas telas y aquí me deja agregar solo una».

El límite estaba solo en la pantalla, no en la base:

- La base ya admite varios materiales para un mismo color: el candado único de `produccion_insumos` es (orden, material, color).
- La hoja arma **una** fila de tela por color (`TelaDeLaOrden`, «la primera que calza y no es un avío»), y «+ Agregar avío» solo ofrece materiales dados de alta como avío. Un forro es una tela comprada por metro: no tiene dónde entrar. En «Nueva orden» es peor: `telasDeLaHoja` descarta cualquier segunda tela.
- El resto ya trabaja por material: la tabla de la orden, «Anotar lo que usaste» y el costo de la orden (suma todo lo consumido, sin mirar el tipo).

**Dejarlo entrar como «otra tela más» habría envenenado lo que el modelo aprende.** Al pasar un lote al stock, `cerrar_produccion` suma TODOS los metros de tela gastados ÷ las prendas buenas y lo guarda como «lo medido» del modelo; tras 3 órdenes cerradas ese número manda sobre lo declarado (`fn_consumo_efectivo`) y «Nueva orden» lo propone como lo que lleva la tela de cada color. Con un forro como tela, el modelo aprendería «tela + forro» (1.2 + 0.9 = 2.1 m) y la orden siguiente propondría 2.1 m por prenda para cada color: un 75 % de más, sin que nadie lo vea. Y `abrir_orden_produccion` declara el consumo del modelo con «la primera tela» de la lista, así que un forro puesto antes que la tela lo declararía mal.

## Decisión

**1. Un rol por FILA de la orden: `produccion_insumos.es_complemento`** (boolean, nace en falso). La fila es un complemento de la prenda (forro, entretela, una tela de contraste, un avío) y no la tela principal de su color. Todas las filas que ya existen quedan en falso: su tela es la principal. Una orden que no manda nada queda como estaba.

**2. La base lee el rol de la lista que llega** (`complemento: true|false` en cada fila de `p_insumos`) con una función chica, `fn_produccion_insumos_marcar_complementos`, que lo valida y se lo agrega a la lista ya normalizada. Un valor que Postgres no lee como verdadero o falso se rechaza (`insumo_invalido`).

**3. Un complemento no es la tela del modelo.** Ni `abrir_orden_produccion` ni `guardar_insumos_orden` lo usan para declarar `producto_consumos`, y `cerrar_produccion` ignora sus metros al calcular lo medido. **Su costo SÍ entra a la orden** (el costo suma todo lo consumido) y su consumo anotado, su devolución y su estante funcionan como los de cualquier material.

**4. Cambiar solo el rol de una fila que ya estaba cuenta como «corregida» y no mueve su plan** (se congeló al abrir, igual que con el consumo). Repetir la misma lista no cambia nada ni anota otra edición.

**5. La orden en una sola lectura devuelve `es_complemento`** en cada fila, para que la hoja de editar reconstruya la lista.

## DESCARTÉ

- **Solo pantalla, sin SQL (opción B).** Sale hoy, pero el primer forro cargado como tela empieza a envenenar lo medido: el error aparece 3 órdenes después y nadie sabe de dónde viene.
- **Derivar «el complemento» por forma o por tejido (opción C):** la segunda tela de un color, o la de un tejido distinto al del modelo. La pantalla y la base seguirían dos reglas que se pueden desencontrar, y un forro del mismo tejido que la tela contaminaría lo medido en silencio.
- **Una columna en `insumos`.** «Es el forro» es un hecho de ESTA prenda, no del material: la misma tela es la principal de un modelo y el forro de otro.
- **Parchar `fn_produccion_insumos_normalizar`.** Ya tiene cuatro parches vivos y no sabe de roles; otro más sube el riesgo de ancla sin ganancia.
- **Reescribir las líneas de las funciones vivas.** Cada cambio de la migración es una INSERCIÓN que deja intacto el texto que otras migraciones anclan: así `20261026150000`, `20261026151000` y `20261026152000` se pueden volver a cargar encima de esta sin perder su ancla (lo comprueba la prueba M2).

## SE ROMPE SI

- **La misma tela es la principal de un color y el forro de otro en la misma orden** (la Milano Blanco como tela de las blancas y forro de las negras). El consumo se anota por material, no por color: no se puede separar lo uno de lo otro. Esa orden NO aporta a lo medido (se salta en silencio; no bloquea el cierre). Prueba C3.
- **Un complemento llega sin la marca** (una pantalla vieja abierta antes de publicar, o la API directa): se guarda como tela principal y vuelve el problema de arriba para esa orden. La pantalla vieja no puede agregar complementos (una sola tela por color), así que solo pasa por la API directa.
- **El rol se marca en un avío:** no se lee (un avío no entra a lo medido ni declara el modelo por su tipo). Es inerte, no un error.
- **Las anclas de producción no coinciden** con las de local (alguien parchó en vivo una de las cuatro funciones): la migración se detiene sin cambiar nada y dice cuál. Se regenera desde la definición real.

## La web (actividad 2)

- **Una sola pieza para las dos hojas:** `TelaDeLaOrden` (la de «Nueva orden» y la de «Editar tela y avíos») deja de tener «avíos» y pasa a tener **«Forro y otros materiales»**: «+ Agregar material» ofrece cualquier tela o avío del Taller (en dos grupos) y «Para» sigue eligiendo toda la orden o un color. Elegir una tela ahí la marca como complemento; elegir un avío, no (`TelaBorrador.complemento`, que viaja a la base solo cuando es verdad).
- **La tela de un color sigue siendo UNA**, en su fila de arriba: la fila de color nunca toma a un complemento por su tela (`telasDeLaHoja`, `porColor`). «Dejar este consumo como el del modelo» también lo ignora.
- **La orden lo muestra:** la tabla pone la tela principal primero, luego los complementos con su etiqueta «Complemento» y al final los avíos. Un forro sin anotar avisa como cualquier tela (su costo también falta en el costo por prenda); una orden con SOLO un forro sigue avisando «no declaró qué tela lleva».
- **El «se rompe si» se avisa a quien lo provoca:** si la misma tela es la de un color y complemento de otro, la hoja dice que esa orden no aportará a lo que el modelo aprende.
- **Guía interactiva** de Producción al día (textos de «Órdenes» y de la orden; huellas aceptadas).
- Verificado en el navegador contra Postgres local: agregar el forro, guardar (`agregaste 1`), reabrir (vuelve al bloque correcto), abrir una orden nueva con tela + forro (la base lo guarda como complemento y el modelo conserva 1.200), 375 px y modo oscuro.

## Lo que queda fuera (y por qué)

La **Ficha del modelo no recuerda los complementos**: la próxima orden del mismo modelo no propone sola el forro. Toca `producto_avios`, `fn_ficha_consumo` y `fn_nueva_orden_opciones` (otra migración, otra decisión de Felipe). Hoy se agrega a mano en cada orden.

## Cómo se pega en producción

`supabase/migrations/20261029021000_produccion_complementos_de_la_orden.sql`, **una sola parte**, después de `20261028221000`: un `alter table … add column` con valor de fábrica (no reescribe filas), una función nueva y cinco reemplazos anclados. Ninguna política, así que no choca con el Asesor de seguridad (ADR-0195). Idempotente. Se pega **antes de fusionar la web** (sin ella, la hoja nueva guardaría un `complemento` que la base ignora).

## Verificación

`pnpm pruebas:produccion-complementos` (17 casos contra Postgres, todos con ROLLBACK; comprobada con tres mutaciones que la hacen fallar: el cierre sin excluir complementos, abrir sin saltarse la declaración del modelo, guardar sin contar el cambio de rol). Con la migración aplicada de verdad pasan sin cambios las suites vecinas: editar tela (18), consumo por talla (19), ficha de consumo (21), avíos del modelo (11), cierre (20), fases, cinco pasos, quitar paso, anulaciones, avances y el recorrido punta a punta.
