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

## Actualización 2026-09-29 (e) — la skill `/focus` y dónde está aplicada la guía

Felipe (2026-09-29): una skill «focus» que, al invocarla, **recorra cada pantalla que se está construyendo o editando, verifique si
tiene la guía estandarizada y, si no la tiene, se lo avise y la implemente**.

- **`.claude/skills/focus/SKILL.md`**: recorre → avisa → implementa (en ese orden; el aviso va antes de tocar código). Con `todo` solo
  informa el tablero de las 85 pantallas; con una ruta o un módulo trabaja solo eso. Tiene «paradas» donde pregunta en vez de decidir:
  cuando «qué falta» no sale de una validación existente, cuando exigir algo bloquearía una operación que hoy se permite, cuando el
  estándar no cabe, o cuando otra sesión toca los mismos archivos.
- **`scripts/focus/escanear.mjs`** (`pnpm focus`; 17 pruebas en `escanear.test.mjs`) es su ojo determinista: archivos cambiados (la
  rama contra `origin/main` + sin commitear) → pantallas que los usan → ¿tiene campos o pasos? ¿usa las piezas de la guía? ¿qué dice
  `lib/guia-de-foco-pantallas.ts`? Un veredicto por pantalla: `con-guia`, `sin-guia` o `no-aplica`. **Es por texto y no juzga**: sirve
  para no olvidarse; la skill confirma cada veredicto leyendo. Detalles que costaron un falso positivo y ya están cubiertos por
  pruebas: `fin-guia` y `recepcion-guia` no son la guía de foco (se exige el **uso** de las piezas, no el nombre), y los archivos que
  definen las piezas (`guia.tsx`, `piezas.tsx`, `useGuiaAlta.ts`, `TiraFicha.tsx`) no cuentan como «tener guía». Los archivos que
  8 o más pantallas comparten (el combo «Responsable», `kit.tsx`…) no cuentan como «de una pantalla», para que tocar un combo no
  marque medio ERP.
- **Dónde está aplicada hoy:** `/productos/nuevo` y `/productos/[id]/editar` (2 de 85). El escáner ve 68 pantallas con campos y sin guía,
  y 15 sin campos (solo 3 están declaradas `no-aplica`: las otras 12 son candidatas, con su motivo, cuando Felipe repase cada módulo).
- **Sin correr en el CI todavía:** `escanear.test.mjs` se corre a mano (`node --test scripts/focus/escanear.test.mjs`); no se tocó
  `.github/workflows/ci.yml` en este cambio.

## Actualización 2026-09-29 (f) — los modales, y la luz sobre el control que sigue

Felipe (2026-09-29): «que la skill de focus también aplique para **modales**, y dentro de ellos **ilumine los textbox** para indicar el
camino; no solo los textbox, también los **combos** o demás componentes que se encuentren ahí».

- **La luz.** Dentro de un modal (y ahora también en las filas del alta, para que el estándar sea uno solo) el control que sigue se
  ENCIENDE: un halo suave alrededor del bloque (`box-shadow`, borde de tinta al 24 % y un halo al 5 %), la caja de texto, el combo o el
  botón desplegable de adentro con el fondo más claro (`papel`, contra el hueso de sus vecinos) y el borde firme, y la marca «Sigue
  aquí» en su título. Llega con un solo respiro de 700 ms y se queda quieta; con movimiento reducido, sin nada de eso. Solo tokens, sin
  rojo. Se pinta **por detrás y por fuera** (`.hilo-luz::before`, `box-shadow`): no cambia el tamaño de nada ni empuja a los vecinos
  (un primer intento con margen negativo se descartó: `space-y-*` pisa el margen y corría los campos).
- **Sirve a cualquier control.** `<CampoGuiado>` envuelve un bloque y no conoce el control: caja de texto, combo (`ComboBuscable`,
  `Desplegable`, `ComboResponsable`), chips, interruptor, segmentado, o un grupo de varios. Una regla de **grupo** («basta uno de tres
  datos») es UN campo virtual que enciende el bloque entero.
- **Las piezas** (`components/guia-de-foco/`): `useGuiaCampos` (estado del modal; la luz se mueve al completar y, si el siguiente queda
  fuera de vista dentro del modal, se le trae con `nearest`; **nunca mientras se teclea**), `CampoGuiado` y `PieGuia` («Falta: …»
  tocable sobre el botón principal, «Todo listo» si no falta nada). La lógica pura es `lib/guia-campos.ts` (13 casos), que comparte tipo
  con la del alta (`EstadoCampo`). `FaltanDelPaso` ahora es genérico y sirve a los dos.
- **La guía no cambia qué se puede confirmar.** `hecho` y `requerido` salen de la validación real del modal; el `disabled` del botón
  principal es el de siempre (la guía solo le agrega `title` con lo que falta y un aro cuando ya se puede).
- **Piloto:** `components/NuevaClientaModal.tsx` (el alta de una clienta): el bloque «Identificación» (DNI, nombre y WhatsApp; basta
  uno) se enciende como un solo grupo, el permiso de WhatsApp y el cumpleaños son opcionales, y el combo «Responsable» se enciende si
  falta. Verificado en el navegador: la luz aparece en el grupo, se apaga al escribir el DNI y el pie pasa a «Todo listo para
  registrar.»; el modal no se movió al teclear. No se tocó ninguna regla ni redacción de Clientas (hay un plan escrito en
  `docs/datos/DECISIONES-2026-09-26-clientas.md`, D-92 a D-111): la guía copia la validación de hoy —basta un dato: DNI, nombre o
  WhatsApp— y, si el plan la cambia, la guía la sigue; el permiso de WhatsApp sigue siendo un opcional más, no «el paso que da el permiso».
- **Los modales entran al registro y a la prueba obligatoria** (`lib/guia-de-foco-pantallas.ts`, `MODALES`): un modal es todo archivo de
  `components/` o `app/(app)/` que dibuja un `<Modal>`, `<ModalRuta>` o `Dialog.Content` con campos. Hay **90** (1 `aplicada`, 89
  `pendiente`; la cuenta `MODALES_PENDIENTES_HOY` es exacta y solo baja). **Un modal nuevo no puede nacer `pendiente`.** Cada `pendiente`
  lleva en un comentario cuántos controles trae: con UNO solo no hay camino que indicar y suele ser `no-aplica` (con motivo). Antes la
  prueba «no veía» a los modales y la única barrera era la casilla del PR. Se comprobó que falla con un modal sin declarar, con la
  cuenta subida, con una evidencia falsa y con un modal fantasma.
- **La skill `/focus`** trata a los modales como objetivo propio (escáner: tabla de modales con controles y desde qué pantallas se
  abren; 25 pruebas en `escanear.test.mjs`). Las pantallas dejaron de contar los campos de sus modales: una pantalla no queda «con guía»
  porque uno de sus modales la tenga. Límite conocido: un archivo que es a la vez el formulario principal y dibuja un `<Modal>` cuenta
  como modal.
- **Decisión de Felipe:** ¿un modal de un solo control (un motivo, una confirmación) debe llevar la luz o basta con `no-aplica`? Hoy la
  skill los propone `no-aplica` con motivo y los deja en la lista del cierre para que los revises.

## Actualización 2026-09-30 (g) — Catálogo, módulo por módulo

Felipe (2026-09-30): recorrer el módulo Catálogo con `/focus`, pantalla por pantalla y modal por modal.

- **Con guía:** `FamiliasLista`, `ColoresLista` (nuevo y editar), `PatronesLista`, `TejidosLista`, `TallasLista`, `EtiquetasLista` (nueva etiqueta y
  campaña), `TemporadasLista` (`ModalFecha` y `ModalAnio`), `PrendasDeEtiquetaModal`, `EditarMarcaModal` y `alta-producto/NuevaMarcaForm.tsx` (la pantalla
  `/productos/marcas`, y el mismo formulario dentro de Nuevo producto). Cada ventana vive en su propio componente o, si su estado vive en la lista,
  lleva el `useGuiaCampos` ahí mismo; ninguna cambió qué se puede guardar.
- **Lógica pura con prueba de coherencia:** `lib/etiqueta-campana-guia.ts` (la campaña es toda opcional: un campo solo es «requerido» cuando ya se
  escribió algo en él), `lib/marcas-guia.ts` (`problemaEdicionMarca`) y `lib/marca-registro-guia.ts` (`registroListo`).
- **`no-aplica` con motivo:** `DetalleMuestraModal`, `EliminarProductoModal`, `ConfirmarConResponsable` (un solo control o acciones opcionales),
  `ElegirTallas`, `ElegirEtiquetas` y `ElegirMuestra` (hojas que sirven a filas de Nuevo producto, que ya tienen su guía); pantallas `/productos/familias`,
  `/productos/atributos`, `/productos/[id]/historial` y `/etiquetas-de-precio`. El escáner sigue marcando `/productos/atributos` como «sin guía» porque
  ve `GeneradorDibujo.tsx` (un campo opcional dentro de una ventana de detalle): es un falso positivo de texto, con su motivo en el registro.
- **Falta (por choque con otras sesiones):** `CategoriasLista`, `ProductosGrilla`, `ProductosTabla`, `FiltrosProductos` y `FotosPorColor`.
- **Cuentas:** `PENDIENTES_HOY` 79 → 73; `MODALES_PENDIENTES_HOY` 89 → 74.

## Actualización 2026-09-30 (h) — la luz espera a quien escribe, y un valor de fábrica también pasa por la guía

**Lo que se vio (Felipe, probando «Nuevo color del vocabulario»):** con escribir UNA letra en Nombre la luz «Sigue aquí» saltaba a Código;
al completarse el código sugerido saltaba a Color, sin pasar por Familia. La guía apuraba a quien todavía tecleaba y se saltaba un combo.

**Dos causas, dos arreglos** (los dos generales, no de esta pantalla):
1. **`hecho` es instantáneo, escribir no.** Con una letra el nombre ya era «hecho», así que la luz se iba a mitad de palabra. Ahora el campo de
   TEXTO donde la persona está escribiendo conserva la luz hasta que sale de él (`siguienteDe(campos, enFoco)` en `lib/guia-campos.ts`; lo informa
   `CampoGuiado` con `onFocus`/`onBlur`, solo si el control es una caja de texto). **Un combo, una casilla o un chip no retienen nada:** elegir es
   el «terminé» y la luz avanza en ese instante. Solo retiene un campo guiado (requerido o sugerido): entrar a una nota opcional no le quita la luz
   a lo que sigue.
2. **Un valor de fábrica cuenta como «lleno».** «Familia» viene en «Neutro»; como no bloquea y ya tiene valor, no estaba en la guía y la luz
   nunca pasaba por ella (un color nuevo casi nunca es neutro; la familia lo ordena en la lista y alimenta el aviso «se ve casi igual que…»). Un
   combo con valor de fábrica que importa entra a la guía como **sugerido con `hecho` = «la persona eligió»** (aunque sea el mismo valor):
   el pie dice «Sin elegir: Familia · puedes seguir así» y **nunca bloquea** `Guardar`.

**Dos trampas que costaron la prueba en el navegador** (quedan escritas en el código de `CampoGuiado`):
- Soltar la luz DENTRO del `blur` movía nodos del DOM cuando el foco aún no llegaba al siguiente control (`document.activeElement` = `<body>`);
  el `FocusScope` de Radix lo leía como «se perdió el foco», lo devolvía al contenedor del modal y **Tab nunca llegaba al campo de al lado**.
  Ahora el «soltar» va un tick después (`setTimeout 0`).
- La limpieza al desmontar soltaba el registro también en el desmontaje simulado de React StrictMode (bloque aún en pantalla, foco puesto por
  `autoFocus`): borraba justo lo recién registrado. Solo suelta si el bloque ya salió del DOM (`isConnected`).

**Verificado:** `lib/guia-campos.test.ts` y `lib/alta-producto-guia.test.ts` (+9 y +8 casos: una letra no mueve la luz, el que sigue tras salir, Familia antes de Color, opcional con foco no
roba luz, id desconocido, el foco no cambia qué falta ni qué se confirma), vitest completo (259 archivos), `tsc` y eslint limpios, y recorrido
en el navegador: escritorio (una letra → nombre completo → Tab → Tab → combo por teclado y por clic → Color) y 375 px, más «Editar color».
No se cambió qué se puede guardar en ningún modal.

**Nuevo producto tenía el mismo defecto** (Felipe, mismo día): con una letra en «Nombre» —apenas terminaba la comprobación de que no exista—
«Sigue aquí» saltaba a «Tejido»; igual con un dígito del precio o de una cantidad. El alta no usa `CampoGuiado` sino `FilaAlta` +
`lib/alta-producto-guia.ts`, así que se le puso lo mismo: `campoAhora` y `estadosDeCampos` reciben `enFoco` (y reusan `siguienteDe`, una sola
definición), el formulario guarda `escribiendoEn` y cada `FilaAlta` lo informa por el foco. La mitad que mira a la persona quedó en una pieza
compartida, `components/guia-de-foco/useRetenerLuz.ts` (la usan `CampoGuiado` y `FilaAlta`; el formulario la provee por
`RetencionLuzContexto`). Solo retiene el campo del paso abierto que es requerido o sugerido; la descripción y la marca (opcionales) no.

**Por qué el foco y no el movimiento del mouse** (idea de Felipe: «cuando escribe no suele mover el mouse»). Comparten la intuición —mientras se teclea,
la luz espera— pero el foco es la señal más fiable de «el cursor sigue en esta caja»: sirve igual con Tab y con lector de pantalla, y en el celular
(Vender, Cambios y Devoluciones se usan en un teléfono) no hay mouse que mover; y un mouse que se roza a media palabra adelantaría la luz antes de tiempo.
Si se quisiera que la luz avance apenas la mano va al mouse (antes de hacer clic en otro campo), se suma como una segunda señal sobre esta, sin cambiar lo demás.

**Tallas y Colores también esperan** (Felipe, mismo día: «que también esperen»). Son campos de VARIAS opciones, y con la primera elegida ya eran «hechos»:
la luz saltaba aunque la persona quisiera marcar más. Ahí ningún campo de texto avisa, y en Safari un botón ni siquiera toma el foco al hacer clic,
así que `useRetenerLuz` tiene un segundo modo, `"fila"` (`FilaAlta retiene="fila"` y `CampoGuiado retiene="fila"`): la luz se queda mientras la persona
siga tocando algo DENTRO del bloque (foco o clic; cuenta también el de una hoja que el bloque abrió, porque React lo sube por su árbol) y se suelta cuando
toca o enfoca cualquier otra cosa de la página. Lo hace un oyente de `document` dentro del propio hook, que compara cada evento con el último que React
vio dentro del bloque: **no pide cableado a quien lo usa** (un primer intento con un manejador en el `<form>` de Nuevo producto no servía a los modales y se descartó).
Combos de una sola opción (tejido, patrón, familia) no cambian: elegir ahí es «terminé». Una consecuencia a la vista: si la persona toca una talla, la luz
se va a Tallas aunque ya estuviera «hecha» (la luz acompaña a donde se trabaja).

**La skill `/focus` se reescribió con todo esto** (`.claude/skills/focus/SKILL.md`): una «segunda regla madre» (la guía acompaña, no apura), una tabla de qué hace la
luz con cada tipo de control, una «mirada de tolerancia» en el Paso 1 (buscar controles de varias opciones y valores de fábrica que la guía no mira) y un Paso 4 de
verificación con el recorrido «una letra → Tab → combo», las dos trampas de foco y el entorno (puerto libre, `.env.local`, base local atrasada, panel oculto). El
escáner reconoce `useRetenerLuz` como pieza de la guía.

## Actualización 2026-10-01 (i) — Ventas: empieza por «Prenda sin registrar»

Felipe (2026-10-01): `/focus` en todo Ventas, empezando por el Punto de venta y, dentro, por el botón «Prenda sin registrar».

- **`components/PrendaSinRegistrarModal.tsx` pasa a `aplicada`** (`MODALES_PENDIENTES_HOY` baja en uno: 72 → 71 al juntarse con `main`). Lógica en
  `lib/prenda-sin-registrar-guia.ts`: los cinco campos (categoría, talla, color, descripción, precio), todos requeridos porque los cinco
  ya apagaban «Agregar al ticket»; `hecho` se le pregunta a `pasoSiguiente` (la regla de siempre), sin copiarla. La prueba recorre las
  64 combinaciones de datos vacíos y exige que «falta algo» ⇔ el botón apagado, y que una letra en la descripción no mueva la luz.
- **Se va el rojo.** El modal marcaba «el paso que toca» con la etiqueta en rojo (2026-09-25); lo reemplaza la luz de la guía.
- La talla pasa de desplegable a botones de **una** opción: elegir es «terminé» y la luz avanza en el acto (sin `retiene`). Ningún
  campo trae valor de fábrica que importe: «Única» se pone sola solo cuando la categoría tiene una sola talla, y ahí no hay elección.
- Pendiente en `/vender`: la pantalla, `PuntoDeVentaTicket` (12 controles), `CerrarCajaModalV2` (10), `Esperas` (2); `PuntoDeVenta`
  (1 control) es candidato a `no-aplica`.

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
