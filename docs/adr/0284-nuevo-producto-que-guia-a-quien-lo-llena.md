# ADR-0284 · Nuevo producto que guía a quien lo llena («el hilo»)

- **Fecha:** 2026-09-29 · **Estado:** implementado en local (escritorio y 375 px), **a probar con una trabajadora real**. Solo
  web, sin migración.
- **Pedido:** Felipe, 2026-09-29, después de probar el sistema con una trabajadora en tienda: «no sabía por dónde ir, qué
  seguía o qué le faltaba»; quiere «un focus importante en lo que falta por llenar o lo que sigue, algo sofisticado, sutil y
  de ayuda», empezando por Catálogo → Nuevo producto.
- **Complementa:** ADR-0260 (Nuevo producto en cuatro preguntas): no cambia sus pasos, sus campos ni sus reglas.
- **Descarta por ahora:** la maqueta `docs/maquetas/ayuda-guiada-spike-2026-09/` (tour con velo oscuro y círculo, por
  módulo). Es otra cosa —enseñar una tarea— y no está construida; esto guía dentro del propio formulario.

## Qué había

El alta ya decía «qué falta», pero en letra chica: la frase gris al fondo de cada paso, una línea en la lista «Avance» y otra
bajo «Crear». **Los campos mismos no decían nada**: cinco filas del mismo peso en «¿Cómo es?», tres decisiones seguidas en el
paso 4. Recorrido real en el navegador (2026-09-29) encontró cuatro fallas concretas:

1. Al tocar una familia, sus categorías aparecen **debajo**, a veces cortadas, sin nada que diga «ahora elige una».
2. Al elegir la categoría, el paso 2 se abría con su título **cortado arriba**, sin cursor en «Nombre», y el «Seguir →» quedaba
   fuera de vista al fondo.
3. **El paso 3 salía con ✓ «Listo» sin haberlo abierto**, con las tallas que el sistema marca de antemano y **cero colores**
   (`pasoHecho` solo miraba que no hubiera problemas).
4. En el paso 4, «cuántas hay hoy» (o «todavía no tengo») es obligatorio pero nada lo marcaba como pregunta.

## Decisión

**Cada campo del paso abierto tiene un estado —hecho, sigue aquí, falta, opcional— y se ve en el campo mismo.**

| Pieza | Qué hace |
|---|---|
| Marca en el título del campo (`MarcaCampo`) | ✓ verde que se dibuja al completarlo · círculo de tinta con un solo pulso = «sigue aquí» · anillo vacío = falta · anillo punteado = opcional |
| Campo que sigue | Tinte suave (hueso al 55 %) y la etiqueta «SIGUE AQUÍ». Solo uno a la vez |
| Pie del paso: «Faltan: ● Nombre ○ Marca y proveedor ○ Tejido» | Cada cosa es un botón que **lleva al campo** (lo deja a la vista, lo destella una vez y, si es de texto, le pone el cursor). Pegado abajo desde `lg` |
| «Siguiente: …» de la ficha y de la barra del celular | Ahora es un toque que lleva al campo (incluso de otro paso). Con solo sugerencias dice «Ya puedes crear. Sin elegir todavía: colores.» |
| Al abrir un paso | Sube al **título** del paso (antes «nearest» lo cortaba) y, si lo primero que pide es una caja de texto vacía (nombre, precio), deja el cursor ahí |
| Al completar un campo | Si el siguiente quedó fuera de vista, se le trae con suavidad. **Nunca se desplaza la página mientras hay foco en una caja de texto** (al teclear el precio no puede saltar) |
| Paso 1 | «Familia · Sigue aquí» → al tocar una familia, «Categoría · Sigue aquí» y las categorías se traen a la vista |
| Paso 4 | Tres filas guiadas: **Precio y costo · Unidades de hoy · Quién lo registra** |
| ✓ de un paso | **Solo si la persona lo abrió** y no le falta nada (`pasoConfirmado`). Uno que viene armado dice «Por revisar: colores» en la lista «Avance» |

**Colores: el único campo «sugerido».** Casi toda prenda tiene color, y una blusa con «sin color» era exactamente el «Listo» falso.
No se vuelve obligatorio (un llavero o un cuaderno no lo llevan, y la base lo admite): el pie dice «Sin elegir: ● Colores · puedes
seguir así» y «Seguir →» sigue habilitado. Ver «Lo que queda a decisión de Felipe».

### Dónde vive

- **Reglas puras, con prueba:** `lib/alta-producto-guia.ts` (`camposDelAlta`, `estadosDeCampos`, `campoAhora`, `faltanDelPaso`,
  `faltanHastaElPaso`, `resumenFaltan`, `siguienteDelHilo`, `pasoConfirmado`) y `lib/alta-producto-guia.test.ts` (41 casos).
  **No agrega reglas de negocio:** una prueba recorre 19 escenarios y exige que «campo requerido sin hacer» y «hay un problema
  en `problemasAlta`» digan siempre lo mismo. Lo que bloquea crear sigue decidiéndolo `problemasAlta`.
- **Piezas visuales:** `components/alta-producto/guia.tsx` (`MarcaCampo`, `EtiquetaAhora`, `FaltanDelPaso`), `FilaAlta` y `PasoAlta`
  en `piezas.tsx`, y `app/estilos/alta-guia.css` (clases `hilo-*`).
- **Tacto:** `components/alta-producto/useGuiaAlta.ts` (`asegurarVisible`, `irAlCampoAlta`, `useGuiaAlta`): mueve la vista y el foco,
  no decide qué sigue. Los campos se encuentran por `data-campo`, nunca por clases de estilo.
- **Cableado:** `NuevoProductoForm.tsx` (estado `vistos`, `campos`, `irACampo`), `FichaPrevia.tsx` (`guia` en `DatosFicha`),
  `ArbolCategoria.tsx`.

### Movimiento y paleta (ADR-0136, ADR-0169)

Un solo pulso al llegar, un ✓ que se dibuja, un destello de 1,1 s al ser llevado a un campo y un aro de 1 s sobre «Seguir →» /
«Crear producto» cuando el paso queda listo: respuestas a lo que la persona hace, `--ease-cayla`, **sin rebote ni bucle**, y todo se
apaga con `prefers-reduced-motion`. Solo tokens de `globals.css`; **no usa rojo** (aquí nada es un error, es un camino). Sigue
valiendo «sin obligatorio en rojo» del ADR-0260: lo requerido no se grita, se acompaña.

### Celular (375 px)

El pie del paso **no** se pega por debajo de `lg`: la barra de la ficha ya va pegada abajo con el «Siguiente: …» tocable, y las dos
juntas tapaban ~190 px de 812. El desplazamiento automático descuenta el alto de esa barra (`data-barra-ficha`).

## Actualización 2026-09-29 (b) — la lista de un combo se despega de lo que tapa

Con el campo que sigue teñido (hueso al 55 %), la lista flotante del combo «Marca y proveedor» (`papel`, borde `sand`, sombra corta)
quedaba del mismo tono que el campo y la tarjeta que tapa, y se fundía (Felipe, con captura: «no se diferencia mucho del fondo»).
**Cambio compartido, no solo del alta:** las cuatro listas flotantes —`ComboBuscable`, `Desplegable` (`campos.tsx`), las píldoras de
filtro (`FiltrosPildora`) y `ComboResponsable`— comparten ahora `.lista-flotante` (`globals.css`, junto a `.card-cayla`): superficie
`papel` (no hay blanco), **borde de tinta al 22 %** y una **sombra de elevación larga y tibia** (la de `ComboResponsable`, ahora
para todas). El radio lo sigue poniendo cada lista. Sin colores nuevos ni cambio de comportamiento. Si se quiere solo en el alta, se
vuelve a las clases anteriores en las otras tres listas (`border border-sand bg-papel shadow-md`).

**La opción activa, en terracota tenue** (Felipe, con captura: «el color en que se resalta el seleccionado es muy parecido al de
fondo»). La opción activa —con el mouse o con las flechas— era arena/hueso (`bg-sand/60`, `bg-hueso`): casi el tono del papel. Ahora es
`rojo` al 10 % mezclado con `papel` (`.opcion-activa`, `globals.css`), **opaca a propósito**: la fila fija «+ Registrar…» del combo con
buscador es `sticky` y no deja leer las opciones que pasan por debajo. El desplegable ya usaba `bg-rojo/10` y las píldoras `bg-rojo/8`
(ahora `/10`); se alinearon `ComboBuscable` (opciones y filas de crear) y `ComboResponsable` (hover). Es un tinte, no un acento: no
cuenta entre los «2 rojos por pantalla».

## Actualización 2026-09-29 (c) — Editar producto: «Para completar esta ficha»

**Editar no es un recorrido, es mantenimiento**: la ficha ya tiene su barra «Tienes N cambios sin guardar → Revisar y guardar» (ADR-0257),
que resuelve muy bien «qué sigue» tras cambiar algo. Lo que **no decía** es qué le falta a la prenda para estar completa. No se
le puso «Sigue aquí» a los once campos: se le dijo lo que importa.

- **Qué cuenta como «falta»** (`lib/producto-ficha-guia.ts`, 13 pruebas): **fotos** (un color sin foto propia y sin la de «Todos los
  colores»; se cuenta con `vistaDeFotos`, la misma cuenta de «3 de 4 colores con foto») y **tejido y patrón** en una prenda de una
  familia de tela, cuando su categoría los ofrece. **Nada más**: descripción, stock mínimo y temporada son opcionales de verdad, y una
  lista que regaña por todo deja de leerse. Una prenda **descontinuada** no se regaña.
- **Es una guía, no un candado.** Nada de esto bloquea guardar (lo siguen decidiendo `revisar()` y la base), y la tira lo dice:
  «· no hace falta para guardar».
- **La tira «Para completar esta ficha»** (`components/ficha-producto/TiraFicha.tsx`), arriba de la ficha: un botón por cosa
  pendiente («Tejido», «Patrón», «Fotos de 2 colores»); cada uno lleva al campo (mismo `irAlIdCampo` del alta, que ahora acepta
  cualquier `data-campo`) y lo destella. El primero lleva la marca de «Sigue aquí».
- **Marcas solo donde hubo algo pendiente.** Tejido, Patrón y la tarjeta de Fotos llevan marca **solo si llegaron pendientes**
  (`pendientesAlAbrir`): pasan a ✓ al completarse. Una ficha que ya venía completa no muestra nada; y si se completa estando aquí, la
  tira dice «✓ Ficha completa».
- En una familia de tela el título dice «Tejido» / «Patrón», sin «(opcional)»: seguía diciendo «opcional» junto a una marca de «falta».
  (Lo de «no hace falta para guardar» sigue escrito bajo el campo.)
- No se tocó `FotosPorColor` (es de otra sesión, ADR-0279): la tarjeta de fotos solo gana su marca arriba y el tinte.

**Verificado** en el navegador con dos prendas locales (una con tejido y patrón pero sin fotos; otra sin nada): la tira, el salto a
«Fotos por color», completar el tejido (la tira se actualiza y «Sigue aquí» pasa al patrón) y el celular a 375 px. No se probó
subir una foto (el ✓ de fotos y «Ficha completa» salen de la misma cuenta que las pruebas, pero no los vi en pantalla).

## Actualización 2026-09-29 (d) — la guía de foco pasa a ser regla obligatoria de todo el ERP

Felipe (2026-09-29): «que cada uno de los módulos tenga esta función de focus para hacer más fácil la ubicación del usuario; que sea
**obligatorio, incluso si se crean interfaces nuevas**. Después seguiré viendo módulo por módulo implementando esto.»

- **Regla escrita:** CLAUDE.md, sección «Guía de foco» (qué se exige: marca por campo, «Falta: …» tocable que lleva al campo,
  «Siguiente» tocable, ✓ solo si se visitó, lógica pura con prueba de coherencia con la validación real, tacto y celular), y un
  cuarto paso en la lista de «Módulos y roles → al crear un módulo nuevo».
- **Hecha cumplir por una prueba, no por memoria** (`lib/guia-de-foco.test.ts` + `lib/guia-de-foco-pantallas.ts`, mismo patrón que
  `lib/modulos.test.ts`): cada `page.tsx` de `app/(app)` (85 hoy) se declara `aplicada` (con los archivos que usan las piezas; la
  prueba los abre), `no-aplica` (con motivo) o `pendiente`. **Una pantalla nueva no puede nacer `pendiente`**: la cuenta
  `PENDIENTES_HOY` es exacta y solo baja. Se comprobó que falla ante tres alteraciones (pantalla sin declarar, la cuenta subida, una
  evidencia falsa).
- **Tablero del despliegue:** hoy 2 `aplicada` (Nuevo producto, Editar producto), 3 `no-aplica` (Sin acceso y las dos ranuras
  paralelas `@modal`) y **80 `pendiente`**, agrupadas por módulo. Felipe las revisa módulo por módulo y, en cada una, decide qué cuenta
  como «falta» (una decisión de negocio, como en Editar producto: solo fotos, tejido y patrón).
- **Lo que la prueba no ve:** un modal o un componente con campos que no es una `page.tsx`. Lo cubre el texto de la regla y una
  casilla nueva en `.github/pull_request_template.md`.
- **Numeración:** este ADR se escribió como 0283 y se pasó a **0284** porque otra rama (`claude/product-add-single-validation-0c6fab`, «Una
  identidad para todo el alta de producto») ya usaba 0283. Después `main` recibió DOS ADR-0283 (#620 «Producto sin marca ni proveedor»
  y #621 «Una identidad…») y su CI se puso rojo en `pnpm adr:numeros`; **«Una identidad…» pasó a ADR-0285** (commit aparte de este PR:
  las pocas referencias que eran suyas —`QuienRegistra`, `useFirmaDeMitad`, «las ocho acciones del alta»— se atribuyeron una por una;
  todo el resto de «ADR-0283» en el código es el de la marca y el proveedor y no se tocó).

## Lo que queda a decisión de Felipe

1. **¿Cuánto se debe notar?** Está en «sutil pero claro»: tinte + etiqueta + marca. Si en tienda sigue pasando desapercibido, el
   siguiente escalón es atenuar los campos que aún no tocan; si molesta, se quita la etiqueta «Sigue aquí» y queda la marca.
2. **¿Colores obligatorios para ropa?** Hoy es sugerencia. Si se decide que Indumentaria no se crea sin color, es una línea en
   `problemasAlta` (y la guía lo tomaría sola).
3. **Pasos 3 y 4 en celular:** el «Seguir →» sigue al final del paso. Se podría subir a la barra de abajo mientras el paso esté listo.

## Cómo se verificó

`tsc` limpio, `eslint` limpio en lo tocado, `vitest` completo en verde (243 archivos), y **recorrido completo en el navegador**,
escritorio (1280) y 375 px: categoría → nombre → marca → tejido → patrón → colores → precio → unidades → «Todo listo», más el toque
en un «Falta: …» desde arriba de la página (llega, centra y destella). **No se creó ningún producto** en la prueba: `onSubmit` no
se tocó. Faltan por probar con una persona real: pasos 3 y 4 con varios colores y la pantalla de éxito («crear otro parecido»,
que ahora reinicia los pasos visitados).

**Aviso para el entorno local:** la base de desarrollo no trae patrones (producción tiene 9), y «Indumentaria exige patrón»
dejaba el paso 2 sin salida. Para probar se sembraron 3 patrones de prueba (Liso, Rayas, Floral) en la categoría «Camisas y Blusas»
de la base LOCAL (`notas` = «[sembrado local para probar el alta]»). No tocan producción ni el repo.
