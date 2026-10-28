# Inicio de la cuenta de Almacén: tres maquetas (2026-09-30)

> **Construida en la app el 2026-09-30 (ADR-0292):** `components/inicio-almacen/` y `app/estilos/inicio-almacen.css`, sobre `app/(app)/page.tsx`.
> Esta carpeta queda como referencia visual; las diferencias están en el ADR («Lo que quedó fuera a propósito»).

**Archivo:** [`inicio-almacen.html`](inicio-almacen.html). Es autocontenido (isotipo incrustado, datos inventados): se abre con doble clic.
No toca `app/(app)/page.tsx`, ni la base, ni ningún RPC. Sirve para decidir antes de construir.

## El pedido (Felipe, 2026-09-30)

El Inicio de «Almacén Trujillo» (terminal de la Tienda TRU) tiene hoy dos bloques: «Te toca» con «Nada pendiente» y cuatro accesos
(Stock, Traslados, Recibir, Buscar). Felipe pidió: lo más esencial para quien trabaja en almacén, **un atajo muy notorio a Nuevo
producto**, **ver qué productos nuevos se crearon en otras sedes en los últimos 2 días** y más cosas importantes; sofisticado,
futurista, con animaciones suaves y muy responsive.

## Cómo verlo

La barra oscura de arriba **no existe en el ERP**; solo cambia lo que se ve:

| Control | Opciones |
|---|---|
| Dirección | **A · Cabina** · B · Recorrido · C · Radar |
| Ver como | Escritorio · Tablet · Celular. El marco usa *container queries*: al cambiar de ancho el diseño se reordena igual que en una ventana de ese ancho (en un teléfono real el marco ocupa toda la pantalla) |
| Escenario | Día movido · Todo al día · **Falla de lectura** (una cola no se pudo leer: se dice, no se dibuja como 0; principio 9) |
| Movimiento | Completo · Sobrio · Apagado (también se apaga solo con `prefers-reduced-motion`) |

Atajos dentro de la maqueta: **N** abre Nuevo producto; tocar cualquier fila, tarjeta o botón muestra a qué ruta llevaría.

## Segunda ronda: color de la cabina → **Papel** (Felipe, 2026-09-30)

Felipe eligió la dirección **A con movimiento completo** y pidió bajar el contraste de la cabina (el hero de «Nuevo producto»), que estaba en tinta. Se compararon seis
colores, todos de tokens de `globals.css` y sin rojo. **Se quedó Papel**: fondo `papel` con borde `sand` y texto `tinta` (16.4:1, texto secundario 5.3:1). Es la misma superficie
que ya usan las tarjetas del ERP, así que la cabina deja de ser un bloque de color aparte. Las otras cinco (Tinta, Arena, Taupe, Pizarra, Café) se quitaron del HTML; sus contrastes quedan aquí de registro:

| Opción | Fondo | Texto / secundario (WCAG) |
|---|---|---|
| Tinta *(descartada)* | `tinta` | 15.4 / 6.2 |
| **Papel** *(elegida)* | `papel` + borde `sand` | 16.4 / 5.3 |
| Arena | `sand` → `hueso` | 13.3 / 4.8 |
| Taupe | `taupe` → taupe 80 % + `tinta` | 5.2 / 4.7 |
| Pizarra | `pizarra` → pizarra 82 % + `tinta` | 6.0 / 4.7 |
| Café | `taupe` → `tinta-60` | 5.2 / 4.7 |

El color vive en las variables `--h-*` de `.hero`: cambiarlo es tocar un solo lugar.

## Tercera ronda: contenido de la cabina → **Nuevos a la vista, sin buscador** (Felipe, 2026-09-30)

Felipe pidió ver qué más podía ir en la cabina; se compararon seis contenidos (Actual, Dos puertas, Buscar antes de crear, Nuevos a la vista, Recorrido y Foto primero) y
se quedó con la idea de **mostrar lo último de otras sedes en el primer pliegue**, pero **sin el campo de búsqueda**: solo el botón de crear. Las otras variantes se quitaron del HTML.

La cabina final, de izquierda a derecha:

- **Izquierda:** «Registrar mercadería» → «Nuevo producto» → botón «Crear producto» (tecla `N`) → «Lo último de otras sedes» con las tres más recientes (sede, código, hace cuánto, «Ver →») y el enlace «Ver los 6», que baja a la lista completa con sus filtros.
- **Derecha:** «Sigue ahora» (la tarea más urgente y su botón «Empezar»), **«Después»** con las tres siguientes y su cifra, y el avance del día («4 de 12 resueltos hoy»).

«Después» ocupa el espacio que antes quedaba libre: en los tres escenarios el hueco entre lo último de la tarjeta y su pie mide 12 px. En «Todo al día» esa zona muestra tres colas con su ✓.

Lo que quedó fuera a propósito, por si se retoma: el buscador previo a crear (la maqueta lo resolvía con los últimos 2 días; el catálogo entero usaría `/buscar`), «Recibir mercadería» como segunda puerta,
el recorrido dentro de la cabina y el visor «Foto primero» (depende de «¿Es alguna de estas?», que hoy no existe). **Nota:** la lista de la cabina repite las tres primeras de «Nuevo en otras sedes», más abajo; si estorba, se puede quitar una de las dos.

## Qué es «esencial» para Almacén (mi criterio, con la razón)

Un almacén trabaja en un recorrido: **llega → se registra → se prepara → se verifica**. El Inicio actual solo cubre traslados y
conteo. Faltaba lo que ocurre entre «llegó la mercadería» y «está en el piso»:

1. **Registrar lo nuevo** (Nuevo producto, con tecla `N`): la mercadería llega antes que el papeleo (ADR-0283) y hoy hay que entrar por el menú.
2. **Ver lo que otras sedes acaban de registrar** (últimos 2 días): antes de crear otro producto, mirar si ya existe. Es la mitad
   que falta de «¿es alguna de estas?» (la foto identifica la prenda entre sedes; cualquiera en almacén puede tomarla). Cada tarjeta trae sede, quién,
   cuándo, si tiene foto, precio y **cuánto hay ya en TRU**; si no tiene foto, «Tomar foto» ahí mismo.
3. **Lo que entra:** mercadería por recibir (factura de compra) y traslados en camino, con hora estimada y barra de trayecto.
4. **Lo que sale a piso:** «Reponer a piso hoy» (ya existe como tarjeta en Existencias) y etiquetas por imprimir.
5. **Lo incompleto:** fotos que faltan, productos sin marca o proveedor, prendas por regularizar (urgente a los 2 días, ADR-0179), facturas que vencen.

Se conserva de ADR-0225: «Te toca» como lista con niveles (urgente/por hacer/informativo), «Ajustar», lo urgente no se apaga, una sola
cosa por fila que lleva a su pantalla, y cada bloque falla solo.

## Las tres direcciones

| | A · Cabina *(recomendada)* | B · Recorrido | C · Radar |
|---|---|---|---|
| Idea | «Nuevo producto» es la pieza más grande; al lado, «Sigue ahora» (la guía de foco de ADR-0284 llevada al Inicio); debajo, Te toca y lo nuevo | Cuatro etapas del almacén, cada una con su cuenta; la más urgente se enciende («Sigue aquí») | Mapa esquemático de las 4 sedes: dónde se registró qué y qué traslado viene en camino; tocar una sede filtra lo nuevo |
| Se lee como | Panel de mando | Línea de tiempo | Instrumento |
| Celular | Hero compacto, botón fijo que aparece al salir de él | Línea vertical con acordeón + tarjeta «Sigue aquí» arriba | Radar reducido, lista debajo |
| Costo | **Bajo** | Medio | Alto |
| Riesgo | Ninguno nuevo | Cambia el modelo mental del Inicio: probar con una trabajadora real, como se hizo con Nuevo producto | Decora más de lo que decide; con 3 tiendas y un taller, una lista dice lo mismo (principio 5) |

**Recomiendo A**, con dos préstamos: de B, la cinta de avance («4 de 12 resueltos hoy») ya está en «Sigue ahora»; de C, el chip de sede de cada tarjeta
ya sirve de filtro. C se queda en maqueta como vitrina.

## Qué ya existe y qué hay que construir

| Bloque | Fuente | Estado |
|---|---|---|
| Atajo Nuevo producto | ruta `/productos/nuevo`, módulo `productos` | **Existe.** Solo se pinta si la cuenta ve el módulo (ADR-0161) |
| Te toca: traslados, prendas por regularizar, facturas por vencer, conteo | `lib/inicio-avisos.ts` (`avisosInicio`) | **Existe** |
| Te toca: mercadería por recibir | ADR-0225 lo lista como «sin lectura todavía» | Por construir (una lectura) |
| Te toca: productos por completar (sin marca/proveedor) | `productos.marca_id` / `proveedor_id` nulos (ADR-0283, en producción) | Por construir (un conteo) |
| Te toca: fotos que faltan | «Fotos que faltan», `/inventario/fotos` (memoria de sesión, ADR-0283) | **No está en `main`** ni en las ramas remotas que revisé; confirmar dónde vive |
| Te toca: etiquetas por imprimir | `/etiquetas-de-precio` | La ruta existe; el conteo «pendientes de imprimir» no lo encontré |
| Reponer a piso hoy | `TarjetaReponerAPiso` + `accionHoy` | La regla corre en TypeScript sobre todo el stock. Para el Inicio hay que contarla en base: ADR-0225 quitó la suma de stock en JS por el tope de 1.000 filas |
| En camino (hora, barra) | `transferencias.fecha_estimada_llegada`, `created_at` | **Existe**; el % de trayecto se calcula |
| Pulso: recibidas/salieron hoy | `movimientos` (append-only) | Por construir (dos conteos) |
| Pulso: en almacén, % con foto | `stock`, fotos por color (ADR-0279) | Por construir, **en base, no en JS** |
| **Nuevo en otras sedes** | `productos.created_at` | **Falta la sede de origen:** `productos` no la guarda y las RPC de alta no escriben en `actividad`. Ver decisión abajo |

## Decisión de esquema que pide esta pantalla — decidida y aplicada en producción el 2026-09-30

Para decir «Rosa, de AQP, lo registró hoy» hay que guardar en qué sede se dio de alta. Felipe lo pidió así: *«necesito ver dónde fue registrado,
si en AQP o en TRU, ya que comparten el mismo catálogo global y solo se diferencian en inventario»*. Esa frase cambió el enfoque: como el catálogo
es UNO, la sede de registro **no es de quién es el producto**, es solo dónde se dio de alta. Por eso el título es «Nuevo en el catálogo» y la sigla
va en cada producto.

Se tomó una **cuarta opción**, mejor que las tres que se habían planteado: una tabla aparte `retail.producto_origen` llenada por un disparador
sobre `productos`. No reescribe las tres RPC de alta (sus cuerpos vivos en producción no son los del repo), no toca el núcleo `productos` y no
mezcla un dato del catálogo con la bitácora Actividad. Detalle y descartes: ADR-0292, decisión 4. Migración
`supabase/migrations/20260930170000_producto_anota_donde_se_registro.sql` (**aplicada en producción el 2026-09-30**, tras un ensayo 12 de 12); prueba `pnpm pruebas:producto-origen`.
Los productos anteriores a la migración salen sin sigla.

Las tres opciones originales, por si conviene recordar por qué se descartaron:

- *1. Anotar `producto_creado` en `retail.actividad` desde las tres puertas de alta:* obliga a reescribir las tres RPC desde su cuerpo vivo y a
  cambiar la pantalla Actividad.
- *2. Columna `productos.creado_en_ubicacion_id`:* `alter table` sobre el núcleo, y sugiere que el producto es «de» una sede.
- *3. Sin sede, solo `created_at`:* se pierde el «¿de qué sede?».

## Orden de construcción propuesto (cada paso se prueba en el navegador)

1. Botón «Nuevo producto» en cabecera (escritorio) y fijo (celular). *Se verifica:* como terminal de Almacén con y sin el módulo `productos`.
2. Hero y «Sigue ahora» (salen del primer aviso urgente; front puro).
3. Los avisos nuevos de «Te toca» (los que ya tienen fuente) y la cola «Sin leer» cuando falla una lectura.
4. «Nuevo en el catálogo» sin sede; después, con `producto_origen`, con la sigla de la sede donde se registró y con «cuánto hay en tu sede».

## Lo que esta maqueta se aparta del sistema (Felipe decide qué se queda)

- **Cabina de A con cuadrícula fina y brillos suaves** sobre `papel`: la superficie es la del sistema, pero ese fondo decorado no está en ADR-0169.
- **Bucles ambientales** (aurora, órbita, barrido del radar, hilo de flujo): ADR-0136 solo admite señales (el punto que late, el giro del botón). Están aislados en `.amb`; **«Sobrio» los quita** y deja entradas, cifras que cuentan, foco de luz y las señales.
- **Sombra al levantar tarjetas** en hover y **leve inclinación 3D** de las tarjetas de producto: ADR-0169 pide superficies sin sombra.
- **Botón fijo de celular con tres acciones** (Nuevo producto, Recibir, Escanear): hoy el botón fijo de Almacén es solo «Recibir mercadería». ADR-0206 sigue en pie (el menú es el ☰; esto no es una barra de navegación).
- **Pantalla de Almacén en celular:** PL-105 deja Almacén como pantalla de escritorio; se hizo el celular igual porque se pidió «muy responsive».

## Verificado y no verificado

- **Verificado en el navegador** (a 1520 px, 900 px y 390 px): la cabina final (27 combinaciones de ancho × dirección × escenario, sin desbordes; espacio libre de «Sigue ahora» medido en los tres escenarios), las tres direcciones, los tres escenarios, los tres modos de movimiento, filtros (por sede y «sin foto»),
  tecla `N`, «Ver más», cruce sede ↔ tarjeta en C, botón fijo que aparece al salir del hero, sin errores en consola, sin scroll horizontal.
- **No verificado:** Safari y Firefox (usa *container queries*, `view-transition` con respaldo, `mask-composite` y SMIL `animateMotion`); contraste medido de los textos sobre el panel oscuro;
  cifras reales (todo es inventado); rendimiento con datos reales.
