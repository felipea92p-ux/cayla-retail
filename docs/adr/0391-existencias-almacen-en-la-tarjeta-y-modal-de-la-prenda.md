# ADR-0391 · Existencias: el almacén en la tarjeta, el modal de la prenda y «Todas» con filtros

- **Fecha:** 2026-10-12 · **Estado:** construido y verificado en local (rama `claude/inventory-display-garment-details-03c3fa`); sin SQL.
  Número reservado con `pnpm reservar adr` (ADR-0381).
- **Pedido:** Felipe, 2026-10-12: «mejorar la forma en que se muestran las existencias del almacén, ya que hasta cierto punto es confuso
  para las chicas», «cambiar el detalle lateral que se abre al hacer clic en una prenda» por algo «que se muestre mejor dando más
  información y más ordenada», y que desde ahí se tenga «acceso a todo lo que tenga que ver con una prenda, como imprimir las etiquetas y los
  rótulos». Primero una propuesta y un spike para elegir; después «listo, implementa tal cual al sistema».
- **Propuesta y prototipo:** `docs/maquetas/existencias-almacen-cajon-2026-10/` (`index.html` con las láminas, `prototipo.html` con los tres
  enfoques y los cuatro contenedores, `LOGICA.md` con el contrato). Lo que sigue es lo que Felipe eligió mirando, no por descripción.
- **Complementa:** ADR-0344 (la tarjeta con un ícono y el cajón de la prenda, que esta decisión reemplaza), ADR-0328 (el motor del piso y
  `plan.enPausa`), ADR-0326/0308 (los filtros de Existencias viven en la URL), ADR-0136 (movimiento de modales), ADR-0358 (una función, una
  pieza), ADR-0333 (la prenda sin foto), ADR-0389 (la guía interactiva cambia con la pantalla).

## El problema (lo medido en producción, 2026-10-12, solo lectura)

En Tienda Trujillo, 767 tallas con stock: **428 (el 56 %) tienen 0 colgadas y algo guardado**; la sede figura con 881 «guardadas» y 403
«colgadas» y `retail.cuadres_piso` está vacía: el piso nunca se cuadró. La tarjeta mostraba piso y almacén en una tabla chica con un selector
«Piso · Almacén · Ambos» que se guardaba **por computadora** (dos equipos de la misma tienda veían tarjetas distintas) y, en «Piso», el
almacén desaparecía aunque el botón dijera «Colgar en el piso». El detalle de la prenda era un cajón lateral angosto: la foto en 46 px, dos
palabras distintas para el mismo lugar, acciones mezcladas con las que no se podían hacer, y para imprimir etiquetas había que salir a
Catálogo.

## Decisiones de Felipe (2026-10-12, elegidas sobre el prototipo)

1. **La tarjeta A, «Claro y grande».** Una columna por talla: el número grande es lo COLGADO (lo que el cliente puede comprar) y debajo
   «+N guardadas»; con 4 tallas o más, solo el número (la leyenda del pie pone la palabra). Rojo suave si se acabó, ámbar si falta colgar.
   Sin el selector Piso · Almacén · Ambos. Descartadas: B «Sofisticada» (una barra por talla) y C «Con movimiento» (cifras que cuentan).
2. **El contenedor es un modal al centro**, no un cajón lateral ni la vista «lugar» ni el «mostrador». Descartados en la lámina de
   contenedores (§7 de `LOGICA.md`).
3. **La distribución «Foto y lista»** (foto grande a la izquierda con las vistas, el color y las tallas; a la derecha «Dónde está» y «Qué
   hago»). Las otras tres distribuciones (`ficha`, `foto`, `accion`) quedaron en el prototipo para comparar.
4. **«Todas» mejor, y sus casillas filtran:** tocar «colgadas» o «guardadas» deja ver solo esa capa, con totales por color y por talla;
   la celda que falta colgar sigue en ámbar dentro del filtro.
5. **Supuestos que Felipe no objetó:** las palabras son «colgadas / guardadas»; «Etiquetas» imprime las tallas del color con unidades aquí;
   «Eliminar el producto» sale del modal (sigue en Catálogo); las fechas «llegó el… / última venta» quedan para después; cuadrar el piso es
   tarea de la tienda, no de esta pantalla.

## Lo que decidí yo (técnico)

- **DECIDÍ:** las cifras de la cabecera («Colgadas en el piso», «Guardadas en el almacén») **filtran** la lista escribiendo el mismo filtro
  «Condición» de la URL (`condicion=colgadas|guardadas`, `lib/existencias-filtros.ts`), sin loader. **DESCARTÉ:** un estado por computadora
  (lo que tenía el selector: dos personas veían cosas distintas) y un filtro propio fuera de la URL (recargar o copiar el enlace lo
  perdía). **SE ROMPE SI:** alguien agrega una tercera cifra que filtre por otro eje y las dos píldoras compiten por la misma clave
  `condicion`: la cifra es un atajo de un filtro que ya existe, no un filtro nuevo.
- **DECIDÍ:** el aviso «El piso de esta tienda nunca se ha cuadrado» sale cuando `plan.enPausa === true` (ADR-0328 d.5), con el botón
  «Cuadrar el piso». **DESCARTÉ:** esconder lo guardado hasta que se cuadre (la pantalla mentiría por omisión) y un cálculo propio de
  «sospechoso» (una regla más que mantener). **SE ROMPE SI:** una sede cuadra el piso una vez y nunca más: el aviso se apaga para siempre
  aunque los números vuelvan a estar mal; eso lo tiene que decir Frescura, no esta pantalla.
- **DECIDÍ:** el modal es el `<Modal variante="hoja">` del sistema (ADR-0136) con `antesDeCerrar` para «¿Salir sin guardar?», la foto que
  cruza desde la miniatura (un clon que viaja 420 ms, como la vista rápida de Catálogo), las acciones separadas en «posibles» y una línea
  «No ahora: … (por qué)», y el flujo de cada acción (`FlujoTalla`) en la columna derecha. **DESCARTÉ:** otra animación de entrada y un
  overlay propio (la regla de modales no lo permite) y mostrar las acciones imposibles apagadas en la lista (ocupaban la mitad de la lista
  diciendo que no). **SE ROMPE SI:** una acción nueva no declara su «por qué no ahora»: `accionesDeTalla` exige `sub` para cada una.
- **DECIDÍ:** «Reportar dañada» entra a la lista de acciones de la talla (tecla 7) y «Eliminar el producto» sale del modal. **DESCARTÉ:**
  dejar Eliminar «por si acaso»: borrar un producto no es una acción sobre una talla y es irreversible.
- **DECIDÍ:** el chip de «Todas» (el modelo entero) usa **la misma regla que el pie de la tarjeta** (`botonDeTarjeta`): el motor gana
  (ámbar «por colgar»), si no lo físico en neutro («N tallas sin colgar») y «Todo en el piso» solo cuando nada falta (`insigniaDelModelo`,
  `lib/existencias-panel-talla.ts`, con su prueba). **DESCARTÉ:** mirar solo al motor (lo que había el primer día): con el piso en pausa
  decía «Todo en el piso» con tres tallas a 0; lo encontró `/formidable` (la ciega leyó «Por colgar 0» en la barra y «Falta colgar» en el
  modal). **SE ROMPE SI:** `tallasSinColgar` y `tallasQueFaltan` dejan de contar sobre las mismas filas (`colores[].tallas`).
- **DECIDÍ:** al cerrar, el modal devuelve el foco a quien lo tenía al abrir (`document.activeElement` tomado una vez al montar, pasado a
  `<Modal alCerrarEnfocar>`). **DESCARTÉ:** confiar en Radix: solo devuelve el foco cuando el modal se abre desde su propio disparador y
  este se abre por estado; `/chaos` TEC-06 lo midió (el foco caía al lateral).
- **DECIDÍ:** «Otras **sedes**: Taller 14» (no «tiendas»): el Taller no es tienda y «Pedir (ninguna tienda tiene)» de la misma línea ya lo
  decía bien; la ciega de `/formidable` leyó las dos frases como una contradicción. Y el cuadrito ámbar de la leyenda «Faltan en el piso…»
  va en línea con el texto (antes era un ítem de flex aparte y, con un texto de 252 px en una columna de 272, se iba solo a un renglón y
  parecía una casilla).
- **DECIDÍ:** tres ceros que se pintaban atenuados (`taupe/55`, `taupe/70`) pasan a taupe pleno: el auditor del tema los midió en 2,3:1 y
  3,0:1 en claro, y un 0 colgadas es un dato, no un adorno. Lo atenuado a propósito (tallas que no cumplen el filtro, filas sin nada en la
  capa elegida, la casilla no elegida) se queda: es la señal de «esto no es lo que preguntaste».

## Qué cambia (archivos)

- `apps/web/components/ExistenciasTarjetas.tsx` (`ColumnasTallas`), `lib/existencias-tarjeta-compacta.ts` (`lineaGuardadas`),
  `lib/existencias-filtros.ts` (condiciones `colgadas` y `guardadas`), `components/existencias/CifrasExistencias.tsx` (nuevo),
  `app/(app)/inventario/page.tsx`, `components/InventarioPanel.tsx` (aviso de cuadre, sin `existencias-lugar`), `components/FiltrosExistencias.tsx`.
- `components/existencias/PanelTalla.tsx` (reescrito: el modal «Foto y lista» y «Todas»), `lib/existencias-panel-talla.ts` (`danada`,
  `separarAcciones`, `lineaNoAhora`, `insigniaDelModelo`, `subtituloColgarVarias`), `lib/guias/pantallas/inventario.ts` (la guía, 33 pasos),
  `tema/escenarios/registro.mjs` (tres escenarios del modal; «Ver detalle» reparado), `guias/recorrer.mjs` (`NAVEGADOR_CANAL`).
- Borrados: `lib/existencias-lugar.ts` y su prueba. Sin migraciones: la pantalla sigue leyendo `fn_stock_por_sede_json` y escribiendo por las
  mismas funciones (`bajar_al_piso`, `retirar_del_piso`, `subir_para_enviar`, `ajustar_inventario`, `reportar_danada`, `pedir_*`).

## Cómo se verificó

- **Pruebas puras:** 324 en los archivos de Existencias y las guardias (`guias`, `unificar`, `tema-colores`, `sugerir`, `guia-de-foco`,
  `modulos`); `tsc` y `eslint` en verde; huella de la guía aceptada después de revisarla (`guias:huella inventario`).
- **Guía interactiva:** `guias:recorrer -- --guia inventario`: 33 pasos en verde, capturas revisadas en escritorio y a 375 px.
- **Tema claro y oscuro:** `tema:auditar --cuenta admin,terminal-administrativa --ruta /inventario --escenarios`: 23 visitas, **0 hallazgos
  solo en oscuro**; lo heredado del claro es la atenuación a propósito y la barra de filtros (de antes).
- **`/chaos`** sobre el modal (semilla `20261012`, 24 ataques, 16 de núcleo + 8 de azar): **21 resistieron, 0 estados imposibles**; doble
  clic, ráfaga de diez, dos clics con 3, red cortada, respuesta perdida, recarga al guardar, Atrás/Adelante, cookie de otra sede, diez
  sesiones a la vez y los parámetros hostiles de `bajar_al_piso`/`ajustar_inventario` dejan UNA bajada y la base idéntica a la foto. Tres
  hallazgos de gravedad 4: el foco al cerrar (cerrado aquí), un mensaje crudo de `ajustar_inventario` con la sububicación de otra sede (RPC,
  solo por API: de Felipe) y un `SecurityError` sin capturar con el almacenamiento bloqueado (chrome global). Informe en
  `.chaos/informes/existencias-modal-2026-10-12.md` (local); fila en `docs/chaos/README.md`.
- **`/formidable`** (primera corrida de Existencias): medición a 1440, 1024 y 375, prueba ciega sobre capturas y escéptico; informe en
  `docs/formidable/inventario-existencias.md` y su fila en el tablero. Los tres cambios propuestos esperan el OK de Felipe.

## Actualización 2026-10-13 (Felipe, probando en local)

1. **Las casillas de «Dónde está» dicen «En piso» y «En almacén»** (no «colgadas / guardadas») **y las dos se tocan: llevan a «Todas» con esa
   capa ya puesta** (`irATodas`). Las casillas de «Todas» y su leyenda («Arriba: en piso · Abajo: en almacén», «Ver piso y almacén») usan las
   mismas palabras, así que dentro del modal hay un solo vocabulario, el de las fichas de talla («0 piso») y de las acciones («4 unidades en
   almacén»). Resuelve de paso el cambio 3 que proponía `/formidable`. **Y la tarjeta se alineó el mismo día (Felipe):** la línea chica dice
   «+N en almacén» (`lineaGuardadas`), la leyenda del pie «2 en piso · +1 en almacén», y la lectura de cada columna «Talla S: 0 en piso y 6 en
   almacén». En toda Existencias el lugar se nombra igual: «en piso / en almacén»; «colgadas / guardadas» quedan solo como las cifras de la
   cabecera que filtran («Colgadas en el piso», «Guardadas en el almacén»), que son frases.
   **El efecto al pasar el mouse es uno solo** para las dos parejas de casillas («Esta talla» y «Todas»): el filo fino de tinta
   (`HOVER_CASILLA`), sin cambiar fondo ni borde (antes «Todas» cambiaba el color del borde).
2. **Las pestañas «Esta talla / Todas» van centradas y del ancho de su contenido:** la pieza del sistema ya lo hace, pero como ítem de la
   grilla de la columna izquierda se estiraba a las 17 rem enteras («ocupa más espacio del que debería»).
3. Para probar con varios colores y tallas se creó en la base LOCAL «Vestido Prueba Colores» (4 colores × 5 tallas, stock repartido entre
   piso y almacén de Lima y un color solo en Trujillo). No va en el repo. Se aprendió que la web **excluye de Existencias los productos con
   `es_prueba = true`** (`lib/inventario-v2.ts`), así que la prenda quedó sin esa marca.

## Lo que no se hizo (a propósito) y lo que queda

- Subir, Enviar y Reportar dañada **no se atacaron**: la base local (migración `20260930010100`) no tiene `retirar_del_piso`,
  `subir_para_enviar` ni `reportar_danada`. Son las mismas funciones que ya llamaba el cajón; conviene repetir `/chaos` con una base al día.
- El aviso «piso sin cuadrar» no se pudo ver en local (`fn_piso_plan_lectura` no existe ahí): verificado por tipos y pruebas, no en el navegador.
- Las fechas «llegó el… / última venta» en el modal, y la prueba con colaboradoras reales (`/formidable`, pasada 2), quedan pendientes.

## Actualización 2026-11-24: el modal liviano (Felipe, maqueta `docs/maquetas/existencias-modal-liviano-2026-11/`)

Felipe, mirando el modal de los Aretes Grandes: «¿no está muy cargado?». Lo medido: «nada en el piso» se decía seis veces, «9 en almacén»
tres, y las acciones vivían en cuatro lugares (la fila de cuatro botones, la banda de Ajustar, «Qué hago» y «No ahora»). Aprobó la maqueta
después de cuatro rondas (seis casos, cinco anchos, la vista «Todas», el celular). Lo que cambia, sin quitar ninguna función:

1. **La bajada del título sin «·»:** marca y categoría como etiquetas (`<Chip versalitas={false}>`), el precio solo. Felipe: «hay que evitar
   usar esto como separador». A la derecha, **«Más»** (`<MenuAcciones texto="Más">`) con Etiquetas, Rótulo, Historial y Catálogo, que
   antes eran una fila de cuatro botones. Etiquetas sigue sin navegar si no hay nada que imprimir (`avisoSinStock`).
2. **La frase grande** (`resumenDeLugar`, `lib/existencias-panel-talla.ts`): dónde están las libres, con sus números («Las 9 están en el
   almacén»), y lo apartado o dañado en la bajada. Debajo, el estado de `insigniaDeTalla` en una línea con su punto, con un porqué que no
   repite los números (`fraseDelEstado`: «Falta colgar: cuelga 1», «Se acabó: Lima tiene 2»; «Todo bien» va solo). **El botón oscuro es la
   acción que el sistema sugiere** (colgar, pedir) y solo aparece cuando sugiere algo; con el piso en pausa no hay botón. Felipe vio la
   alternativa de quitar la frase porque repite las casillas y eligió dejarla.
3. **Las cuatro casillas siempre**, también apartadas y dañadas en 0: «un 0 también informa». En una sola fila, también en el celular
   (cambia lo del 2026-11-17, que las ponía de a dos con la cifra a 28 px: Felipe eligió la fila mirando la hoja entera).
4. **En camino y otras sedes:** cada dato con su rótulo arriba y su valor abajo, y cada sede en su etiqueta («Lima 3», «Arequipa 1»).
5. **La banda de Ajustar stock se queda donde está** (ADR-0494: nadie la encontraba como fila), con el botón **claro**: el oscuro es solo
   el de la sugerida. En el celular, una línea: «¿No es lo que ves?» y su botón.
6. **«Qué hago» pasa a «También puedes»**, sin la sugerida (ya está arriba) y **sin «No ahora»**: la frase y las casillas dicen por qué no
   se puede. El orden sigue siendo el de la talla (pedido del 2026-10-06), con las teclas de siempre. Cada acción, en una línea.
7. **Cómo se vende** (el ritmo del color) pasa detrás del «?» del estado, y sale la línea «Sin colgar, según el sistema» (el ámbar de cada
   talla ya lo dice). Con una sola talla no hay fila de tallas: la talla va en una etiqueta junto al color.
8. **«Todas»:** la frase con la suma del modelo y «Colgar varias tallas y colores» arriba (oscuro si algo falta colgar, claro si no; antes
   estaba al pie de la tabla). Sin chips de estado ni «3 colores · 5 tallas»: la tabla ya lo dice. Felipe: «¿es necesaria esa información?
   En “todas” pueden verlo». La leyenda usa los íconos de la celda (percha para el piso, caja para el almacén) en vez de cuadritos de color,
   y las celdas van sin fondo de color: el ámbar queda solo para lo que falta colgar.
9. **Celular:** la foto se achica a 64 px junto al color y las tallas, «Esta talla / Todas» va primero y las teclas no se dibujan.

Verificado en el navegador con datos inventados (página temporal, sin base) a 1440, 1024 y 375 px, en claro y en oscuro. Falta: recorrer la
guía con `guias:recorrer` y `/chaos` con una base al día (no hubo base local en esta sesión), y verlo con una cuenta real.
