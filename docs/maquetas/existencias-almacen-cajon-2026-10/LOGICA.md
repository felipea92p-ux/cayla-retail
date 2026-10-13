# Existencias: el almacén en la tarjeta y el cajón de la prenda — propuesta y contrato

Maqueta del 2026-10-12. Ver: `index.html` (botón «Ver en oscuro»; `?tema=oscuro` abre ya en oscuro).
Datos: nombres y precios de la captura de Felipe (Tienda TRU, 12-10); cantidades del almacén, otras sedes y ritmo **inventados**.
Las cifras de la cabecera (403 colgadas · 881 guardadas) y las del aviso son **reales**, leídas en producción el 12-10 en solo lectura.

Estado: **propuesta, sin implementar.** Lo que Felipe apruebe se implementa con `/construir`; lo que no, se tacha aquí.
No cambia ninguna regla de negocio ni la base: cambia cómo se ven y dónde se tocan cosas que ya existen.

---

## 0. Qué pidió Felipe y qué encontré

Pidió tres cosas: (1) que el almacén se entienda en la lista («confuso para las chicas»), (2) un cajón con más información y mejor
ordenada, (3) desde el cajón, todo lo de la prenda, incluidas etiquetas y rótulos.

Lo que vi en su captura y en el código (`ExistenciasTarjetas.tsx`, `existencias/PanelTalla.tsx`, `lib/existencias-lugar.ts`):

- La captura está en el modo **«Piso»** del selector «Piso · Almacén · Ambos» (09-10, `localStorage["cayla-existencias-lugar"]`): la
  fila «Almacén» desapareció de las tarjetas y las que no tienen nada colgado se esconden. Aun así el pie dice «Colgar en el piso»,
  porque hay algo guardado que la tarjeta no muestra. El selector se guarda **por computadora**: dos equipos de la misma tienda ven
  tarjetas distintas.
- En «Ambos», las dos filas son de 13 px con rótulos de 10,5 px a la izquierda («En el piso» / «Almacén»): por eso nació el selector.
- Hay cuatro vocabularios para dos lugares: cabecera «Colgadas en el piso / Guardadas en el almacén», tarjeta «En el piso / Almacén»,
  cajón «en el piso / en almacén», filtro «Sin stock atrás».
- El cajón dice la misma cifra tres veces (el 46 px, «1 en piso · 0 en almacén», la casilla), lista hasta 6 acciones con las
  imposibles apagadas (≈190 px), y esconde lo de la prenda: etiquetas e historial detrás de «Ver ficha», código y ritmo detrás de
  «¿Cómo se vende?», y el rótulo del anaquel no está (sí en la vista rápida de Catálogo, ADR-0366 c).
- **Producción (12-10, solo lectura):** TRU tiene 767 tallas con stock, 428 (56 %) con 0 colgadas y algo guardado, 881 unidades
  «guardadas» contra 403 «colgadas», y **`retail.cuadres_piso` tiene 0 filas**: ninguna tienda cuadró nunca su piso. El motor del
  piso ya lo sabe (en pausa, ADR-0328 d.5) y la cabecera dice «· por cuadrar»; la tarjeta no.

---

## 1. La tarjeta (una por modelo, se ve un color a la vez)

### 1.1 Qué cambia
| Parte | Hoy | Propuesta |
|---|---|---|
| Tallas | Tabla de 2 filas con rótulos a la izquierda; con el selector, 1 fila grande y el otro lugar oculto | **Una columna por talla**: nombre de la talla (11 px), **colgadas en 21 px**, debajo «**+N guardadas**» (10,5 px, N en negrita). Sin columna de rótulos |
| Falta colgar | celda «En el piso» en ámbar | la **columna** en ámbar (0 colgadas, N guardadas) |
| Se acabó | columna en rojo, «—» arriba, 0 abajo | columna en rojo: «—» y «se acabó» (con 4 tallas o más, «acabó») |
| 0 guardadas | «0» tenue | «0 guardadas» tenue (con 4 tallas o más, «0») |
| Selector Piso · Almacén · Ambos | por computadora; esconde filas y tarjetas | **se va** (§1.3) |
| Leyenda del pie | «Falta colgar · Se acabó · Toca una talla» | «**2** colgadas en el piso · **+1** guardadas en el almacén · falta colgar · se acabó en esta tienda · Toca una talla para colgarla» |
| Pie, colores, insignias, «Más ⌄» | — | sin cambio (`PieTarjeta`, `lib/existencias-acciones.ts`) |

Con 4 tallas o más la línea chica queda en «+3» / «0» / «acabó» (la palabra la pone la leyenda): cabe hasta 6 tallas en los 304 px de
hoy (medido en la maqueta: 6 columnas de 46 px). En producción (12-10) la mediana de variantes por modelo en TRU es 3 y el p90 es 9
**contando colores**; por color, casi todas las tarjetas tienen 3 tallas o menos.

### 1.2 Vocabulario (uno solo en Existencias)
- Piso de venta = **colgada(s)** · almacén de tienda = **guardada(s)**: las palabras de la cabecera (`ResumenSede`).
- Las acciones conservan su nombre del sistema: «Colgar en el piso» (ADR-0339), «Subir a almacén».
- **Pendiente de Felipe:** si el filtro «Sin stock atrás» (ADR-0331) pasa a «Sin guardadas».

### 1.3 En vez del selector: las cifras de la cabecera filtran
- `TarjetaCifra` «Guardadas en el almacén» con filtro: deja solo las prendas con algo guardado, ordenadas por lo guardado. «Colgadas en
  el piso», igual con lo colgado. La que filtra «se rellena de arena» (pieza única, ADR-0358). La tarjeta no cambia de forma.
- Reemplaza el modo «Almacén» (que escondía tarjetas) y el modo «Piso». Se borra `lib/existencias-lugar.ts` y su clave de
  `localStorage` (al leerla, se ignora).

  DECIDÍ: una sola lectura fija por talla, igual en todas las computadoras.
  DESCARTÉ: mantener el selector como «modo» porque se guarda por aparato y dos computadoras de la misma tienda muestran tarjetas
  distintas (la confusión que Felipe describe).
  SE ROMPE SI: una tienda usaba «Almacén» para contar lo guardado: por eso la cifra «Guardadas» pasa a filtrar.
  Alternativa si Felipe quiere conservar el selector: que SOLO cambie qué número va grande, nunca que esconda el otro ni tarjetas.

### 1.4 Aviso «piso sin cuadrar»
- Sobre la lista, hasta el primer cuadre de esa tienda: `<Aviso tono="atencion">` «El piso de esta tienda nunca se ha cuadrado. Lo que
  dice “guardada” puede estar colgado.» + «Cuadrar el piso →» (`/inventario/cuadrar`).
- Dato: `cuadres_piso` por sede (ya viaja la fecha del último cuadre en la lectura del plan, `fn_piso_plan_lectura`). Sin migración.
- No es un detalle: un rediseño de tarjeta no corrige un número que nadie verificó.

---

## 2. El cajón (panel de la talla)

Mismo ancho (480 px; en celular, hoja desde abajo). Mismo velo, mismo cierre, mismo «¿Salir sin guardar?», mismas teclas (← → talla,
↑ ↓ color, 1–7 acción). Ordenado por cuatro preguntas:

### 2.1 ¿Qué prenda? — cabecera + la fila de la prenda
- Cabecera igual: foto (toca → grande), nombre, marca · categoría · precio (y «Precio de esta tienda»), descripción, ✕.
- **Nueva: la fila de la prenda**, cuatro botones iguales (`btn-secundario`, 36 px; 44 px con dedo), siempre a la vista:

| Botón | Qué abre | Cómo |
|---|---|---|
| Etiquetas | `/etiquetas-de-precio?variantes=<tallas de este color>&desde=existencias` | `EnlaceEtiquetas` (pregunta si hay unidades antes de navegar); `urlEtiquetas(prenda.tallas)` + `desde` para que «Volver» regrese a Existencias |
| Rótulo | `/rotulos?productos=<modelo>&origen=existencias` | `urlRotulos([productoId], { desde: "existencias" })`; es del MODELO y no depende del stock (como la vista rápida, ADR-0366 c) |
| Historial | `/productos/<id>/historial` | hoy detrás de «Ver ficha» |
| Catálogo | `/productos?q=<referencia>` (o la vista rápida si se llega a un modelo) | la ficha completa: tejido, patrón, proveedor, fotos; hoy «hrefCatalogo» del panel |

  Son las mismas cuatro de la vista rápida de Productos (Etiquetas · Rótulo · Historial · Ver en Existencias), al revés: una función,
  una pieza.

### 2.2 ¿Cuál? — vistas, color y talla
- «Esta talla / Todas» pasa a la pieza única `<Pestanas>` (ADR-0358). «Todas» no cambia (la matriz colores × tallas del 09-10).
- Color y talla como hoy (chips con su estado: ámbar falta colgar, rojo se acabó, punteada no hay aquí). Bajo la talla: «1 colgada» /
  «+2 guardadas» en vez de «1 piso».
- **El código de la talla junto a la talla**, copiable con un toque (`navigator.clipboard`, aviso «Copiado»). Deja «¿Cómo se vende?».
- La vista «Ficha» desaparece: todo lo suyo está en la fila de la prenda y en Catálogo.

### 2.3 ¿Dónde está y cuántas? — una sola vez
- Título «DÓNDE ESTÁ» + el chip de hoy (`insigniaDeTalla`, misma lógica) + su porqué en una frase corta.
- Las cuatro casillas con ícono y las palabras de la cabecera: **colgada(s) · guardada(s) · apartada(s) · dañada(s)**. En 0 se apagan
  (borde punteado); colgadas en 0 con algo guardado va en ámbar; apartadas y dañadas con algo se tocan y abren su lista (como hoy).
- Debajo, **siempre**: «→ En camino: N» y «Otras tiendas: AQP n · LIM n» (hoy solo si hay).
- **Se va el número de 46 px** («1 en esta sede») y la línea «1 en piso · 0 en almacén».

  DECIDÍ: el veredicto + las casillas, sin la suma grande.
  DESCARTÉ: el 46 px porque era la suma de las casillas y la línea de abajo lo repetía: la misma cifra tres veces en 90 px.
  SE ROMPE SI: Felipe extraña el número grande: vuelve como el número de la casilla «colgadas» a 28 px, sin la línea repetida.

### 2.4 ¿Qué hago? — solo lo posible
- Título «QUÉ HAGO». Filas solo para las acciones que **hoy se pueden**; la sugerida primero y teñida (ámbar colgar, pizarra pedir);
  cada una con su tecla fija por acción (`accionesDeTalla`, sin cambio de lógica).
- Las que no se pueden, en **una línea**: «No ahora: Colgar (nada guardado) · Enviar (nada guardado) · Pedir (ninguna tienda tiene).»
  Sus teclas no hacen nada (como hoy, apagadas).
- **Reportar dañada entra a la lista** (hoy detrás de «Ver ficha»; tecla 7, que era «Ficha»).
- **Eliminar el producto sale del cajón** (queda en la vista rápida de Catálogo, ADR-0252). Era la D4 abierta del análisis del 03-10.

### 2.5 ¿Cómo se vende? — a la vista
- Una fila: el aro (`AroSemanas`) + «Beige: 3 vendidas en 14 días · una cada 5 días» + «Esta talla: 1 vendida».
- **Opcional (decisión de Felipe):** «llegó el 2 de oct · última venta hace 3 días». Hoy esos dos datos no viajan al cajón: una
  lectura más de `movimientos` al abrir (talla × sede, dos fechas). Se degrada sola: si no responde, la fila sale sin fechas.

### 2.6 Celular (375 px)
Hoja desde abajo como hoy. La fila de la prenda en 2 × 2 (44 px de alto); las casillas en 2 × 2; sin teclas a la vista. Vender,
Cambios y Devoluciones siguen siendo las de celular obligatorio (PL-105); Existencias se adapta.

---

## 3. Qué NO cambia
- Las RPC y lo que guarda cada acción (`FlujoTalla`: colgar, subir, enviar, pedir, ajustar, colgar varias), el responsable, los
  permisos (`puedeReponer`, `puedeEnviar`, `puedeAjustar`, `puedeApartar`, `puedePedir`) y el motor del piso.
- Los filtros, la búsqueda, la pistola, «Pendientes», la tabla «Por prenda / Por talla», la barra de lo marcado (que ya lleva
  Etiquetas y Rótulo) y la matriz «Todas».
- Lo que se cuenta como libre: lo apartado y lo dañado no se cuelgan, no se suben ni se envían.

## 4. Qué se toca al implementar (estimado)
| Archivo | Cambio |
|---|---|
| `components/ExistenciasTarjetas.tsx` | `TablaTallas` → columnas por talla (colgadas grande, «+N guardadas»); leyenda nueva |
| `lib/existencias-tarjeta-compacta.ts` (+ prueba) | el texto de la línea chica según tallas (≤ 3: con palabra; ≥ 4: solo el número) |
| `lib/existencias-lugar.ts` (+ prueba) y `InventarioPanel.tsx` | se borra el selector y su `localStorage`; las cifras de la cabecera filtran (`page.tsx`: `href`/filtro en `cifras`) |
| `app/(app)/inventario/page.tsx` | aviso «piso sin cuadrar» (lee el último cuadre de la sede) |
| `components/existencias/PanelTalla.tsx` | fila de la prenda, `<Pestanas>`, código junto a la talla, «Dónde está» sin el 46 px, «No ahora», ritmo a la vista; se va la vista «ficha» |
| `lib/existencias-panel-talla.ts` (+ prueba) | `accionesDeTalla` devuelve también `danada`; separa posibles / «no ahora» |
| `lib/existencias-prendas.ts` | `urlEtiquetas` con `desde` |
| `lib/guias/pantallas/inventario.ts` + huella | la guía de Existencias cambia en el mismo PR (ADR-0389): nuevos `data-guia` de la fila de la prenda, «Dónde está», «Qué hago» |
| `tema/escenarios/registro.mjs` | escenarios del cajón nuevo (claro y oscuro) |
| `docs/adr/` | un ADR con estas decisiones (número con `pnpm reservar adr`) |

Verificación: pruebas de `lib`, `/focus`, `/sugerir`, `/unificar` (pestañas y botones), `/guia`, `tema:auditar` en claro y oscuro,
375 px, `/chaos` sobre el cajón (guarda), y captura al mismo ancho que esta maqueta. Existencias (`/inventario`) todavía no tiene su
`/formidable`: este cambio es la ocasión de pasarlo.

## 5. Lo que decide Felipe
1. ¿Se va el selector «Piso · Almacén · Ambos» y lo reemplazan las cifras que filtran? (o conservarlo solo como «qué número va grande»)
2. ¿«colgadas / guardadas» en todo Existencias? ¿«Sin stock atrás» → «Sin guardadas»?
3. Etiquetas desde el cajón: ¿las tallas de este color con unidades aquí (propuesta) o solo la talla abierta?
4. ¿«Eliminar el producto» sale del cajón?
5. ¿Vale la lectura extra para «llegó el …» y «última venta hace …»?
6. Cuadrar el piso de TRU (una tarde con la pistola, `/inventario/cuadrar`) antes o en paralelo: sin eso, la tarjeta nueva mostrará
   mejor los mismos números sin verificar.

---

## 6. El prototipo interactivo: tres enfoques (12-10, tarde)

`prototipo.html` (abrir por un servidor local, no por `file://`: el panel del Mac lo pinta como foto estática; `pnpm` no hace falta,
basta `python3 -m http.server` en esta carpeta). Todo se toca: color, talla, cajón, los pasos (colgar, subir, enviar, pedir, ajustar,
dañada, colgar varias), «Todas», la fila de la prenda (muestra la URL que abriría), teclado (← → talla · ↑ ↓ color · 1–7 acción · Esc),
claro/oscuro y 375 px. `?enfoque=A|B|C`, `?tema=oscuro` y `?abre=<modelo>:<color>:<talla>` abren ya en ese estado.
Los **datos y las reglas son los mismos en los tres** (qué se puede hacer, qué se sugiere, el veredicto): cambia cómo se ve y cómo se mueve.

| | A · Claro y grande | B · Riel y almacén | C · Tablero |
|---|---|---|---|
| Para quién | la colaboradora nueva: palabras y números grandes | quien entiende mejor viendo que leyendo | quien trabaja con mouse en el Mac mini y quiere todo a la vista |
| La tarjeta | banda arriba con lo que toca («Falta colgar M» + botón); una columna por talla, colgadas en 22 px y «+N guardadas» | el riel: una percha por prenda colgada (hasta 4) y una caja por guardada bajo una línea punteada; debajo «colgadas · guardadas» | una fila por talla con una barra (verde colgadas, pizarra guardadas), la cifra y el estado; al pasar el mouse por una fila ámbar aparece «Colgar» |
| El cajón | cuatro preguntas en una columna: qué prenda · cuál · dónde está (chip + 4 casillas + en camino y otras tiendas) · qué hago | «el viaje de la prenda»: Guardadas → Colgadas con un punto por unidad; apartadas y dañadas aparte; las tres tiendas como mapa (la que tiene, se toca y abre «Pedir»); acciones en mosaico, la sugerida a lo ancho | 37 rem y dos columnas: a la izquierda la barra apilada (colgadas · guardadas · apartadas · dañadas), en camino, otras tiendas y los 14 días de ventas en barritas; a la derecha, la lista de acciones con sus teclas |
| Movimiento | cascada del sistema, luz que cruza los botones, el número que entra, el visto que se dibuja | lo de A + las perchas que cuelgan una a una, las cajas que se apilan, y **los puntos que cruzan del almacén al piso al colgar** (o al dañadas) | lo de A + las barras que crecen al abrir, la barra apilada que se reacomoda, las filas que avanzan al pasar el mouse |
| Lo que cuesta | la banda repite el pie en tarjetas con una sola talla | con más de 4 unidades el riel ya no «cuenta»: pasa al número; es el más caro de implementar (puntos que vuelan) | denso: en una tienda con una talla por modelo, la barra sobra; el cajón ancho tapa más lista |

Lo que es igual en los tres (y lo que propongo sea igual se elija el que se elija): la fila de la prenda arriba (Etiquetas · Rótulo · Historial ·
Catálogo), el código junto a la talla, «No ahora: …» en una línea en vez de acciones apagadas, Reportar dañada en la lista, Eliminar fuera, el
ritmo a la vista, sin el selector Piso · Almacén · Ambos, las cifras de la cabecera que filtran y el aviso «piso sin cuadrar».

**Mi recomendación:** **A** como base (es el que una colaboradora nueva entiende en 5 segundos y el más barato), con **dos préstamos de B**:
el mapa de las tres tiendas en «Dónde está» (se toca y abre «Pedir») y los puntos que cruzan al colgar (solo ahí: una animación que explica,
no adorna). C queda como la vista «Por talla» de la tabla, que ya existe, y no como cajón. Se decide mirando, no leyendo: Felipe elige.

---

## 7. Cómo se abre la prenda: tres formas nuevas en vez del cajón lateral (12-10, tarde)

Felipe eligió la tarjeta **A** y pidió reemplazar el cajón lateral. En `prototipo.html`, el segundo selector («Modal · En el lugar ·
Mostrador · Cajón») cambia SOLO el contenedor; el contenido (las cuatro preguntas de A) y las reglas son los mismos. `?detalle=modal|lugar|mostrador|cajon`,
y `&paso=colgar` (o subir, enviar, pedir, ajustar, danada, colgarVarias) y `&vista=todas` abren ya en ese estado.

| | Modal al centro | En el lugar | Mostrador |
|---|---|---|---|
| Qué es | La hoja del sistema (ADR-0136: velo con desenfoque, sube 18 px y crece, cascada), 1000 px, con la **foto grande** a la izquierda (300 px) y las preguntas a la derecha. **La foto cruza desde la tarjeta** al abrir (como la vista rápida de Catálogo) | La tarjeta que tocas **se abre ahí mismo a lo ancho** de la fila; las demás se corren a su sitio nuevo deslizándose (FLIP, 380 ms). Sin velo: nada se tapa. Tres columnas: prenda y selector · dónde está y cómo se vende · qué hago | Un **panel fijo abajo** (50 % de la pantalla, «Ampliar» a 88 %) que sube como una hoja y se queda. La lista sigue arriba: cada tarjeta que tocas cambia el mostrador sin cerrarlo; **Anterior / Siguiente** recorren las prendas en orden |
| Para qué sirve mejor | Mirar UNA prenda con calma y actuar: la foto y la prenda son el protagonista; nada distrae | Trabajar la lista sin perder el contexto: abres, miras, cierras o tocas otra; en celular es lo natural (la tarjeta crece) | Recorrer muchas prendas seguidas (una tanda de colgar, revisar la fila de «falta colgar»): el ojo no cambia de lugar, cambia la prenda |
| Lo que cuesta | Tapa la lista: para pasar a otra prenda hay que cerrar (o ← → dentro de la misma); en un laptop de 768 px de alto la hoja scrollea por dentro | La página se alarga y se mueve (ADR-0185 pide que un clic no «suba» la vista: al cerrar, las tarjetas vuelven con FLIP, pero la altura cambia); con 4 columnas de tarjetas, la fila abierta queda lejos de la tarjeta que la originó en pantallas angostas | Come la mitad de la pantalla mientras está abierto; en 768 px de alto quedan ~370 px para la lista; un paso largo (Colgar varias) scrollea dentro del mostrador |
| Movimiento | velo + hoja + cascada + la foto que cruza; al cambiar de talla, cascada corta | las tarjetas se deslizan al abrir y al cerrar; la fila abierta entra en cascada por columnas | la hoja sube una vez; al cambiar de prenda el contenido se revela (300 ms), sin volver a subir |
| En el celular (375 px) | hoja desde abajo (como todo modal del sistema), foto a 110 px de alto | la tarjeta ocupa el ancho y crece; el resto baja | hoja desde abajo al 74 %, una columna |
| Pieza del sistema | `<Modal variante="hoja">` ya existe: la implementación es la más barata | pieza nueva (una tarjeta que se vuelve panel); hay que cuidar el scroll y el foco | pieza nueva (panel fijo + navegación entre prendas); hay que cuidar el alto en 768 px |

**Mi recomendación: Modal al centro**, por tres razones: (1) es la pieza que ya existe y que el ERP usa en todas partes (una función, una
pieza, ADR-0358), (2) la foto grande responde la primera pregunta de la colaboradora, «¿cuál es?», antes de que lea nada, y (3) es la que
Felipe ya eligió para Catálogo (la vista rápida): Existencias y Catálogo se parecerían. **Con un préstamo del Mostrador:** Anterior / Siguiente
en la barra de arriba del modal, para recorrer la lista sin cerrar (lo que hoy hacen ← → solo entre tallas). «En el lugar» queda como
la forma de celular, si Felipe la prefiere allí. Se decide mirando: Felipe elige.

---

## 8. Cuatro distribuciones del modal (12-10, noche)

Felipe eligió el **modal**. Antes de implementarlo, el tercer selector del prototipo («Foto y lista · Ficha ancha · Foto protagonista · Acción
primero», `?modal=lista|ficha|foto|accion`) reparte las MISMAS piezas de otra forma dentro del modal. La actual («Foto y lista») se conserva para comparar.

| | Foto y lista (actual) | Ficha ancha | Foto protagonista | Acción primero |
|---|---|---|---|---|
| Ancho | 1000 px | 1100 px, más baja | 1040 px | 660 px, una columna |
| Arriba | fila de la prenda + ✕ | cabecera: foto chica, nombre, precio, fila de la prenda, ✕; debajo una **tira** con pestañas, color, talla y código | la foto llena la mitad izquierda **de arriba abajo**, con el nombre y el precio escritos encima y los colores sobre la foto; a la derecha la fila de la prenda + ✕ | foto chica + nombre + ✕ |
| El cuerpo | izquierda: foto grande, nombre, pestañas, color, talla, código · derecha: dónde está → qué hago (lista) → cómo se vende | **tres columnas**: dónde está (casillas 2 × 2) · qué hago (lista) · cómo se vende | tallas y código → **el veredicto en una banda** → casillas en fila → qué hago en **mosaico** (la sugerida a lo ancho) → cómo se vende | **el veredicto con el botón de lo que toca, primero**; después pestañas, color, talla, casillas, el resto de acciones como **chips**, cómo se vende y, al pie, la fila de la prenda |
| Un paso (Colgar) | a la derecha; la foto se queda | ocupa el cuerpo entero (720 px de ancho útil); la tira muestra color · talla | a la derecha; la foto se queda | ocupa todo bajo la cabecera |
| Para qué sirve mejor | mirar la prenda con calma; equilibrio entre ver y hacer | ver TODO de un vistazo sin scroll en una pantalla ancha (Mac mini) | la prenda manda: la colaboradora reconoce la prenda por la foto antes de leer; el más «boutique» | hacer rápido lo que toca: el botón principal está arriba y es uno |
| Lo que cuesta | la derecha scrollea en 768 px de alto | con una talla por modelo, la tira y las tres columnas quedan medio vacías; el más ancho | la mitad de la pantalla es una foto: menos sitio para las acciones; la foto sin imagen (la mayoría hoy) es un color plano gigante | en pantallas anchas desperdicia espacio; «dónde está» queda debajo del botón: se actúa antes de ver |
| Pieza del sistema | `<Modal variante="hoja">` | igual | igual, con la foto a sangre (hoy ningún modal la tiene) | igual |

**Mi recomendación: Ficha ancha** si el equipo trabaja en el Mac mini (todo a la vista, nada que desplazar, la tira de color y talla es
un control que ya conocen de Nuevo producto), y **Foto y lista** si pesa más el celular y los laptops de 768 px (la columna derecha scrollea
bien). «Foto protagonista» se justifica cuando haya fotos reales en la mayoría de las prendas (hoy en producción casi ninguna tiene). Se decide
mirando: Felipe elige.

---

## 9. Decisión y «Todas» con filtros (12-10, noche)

**Felipe conservó «Foto y lista»** (la distribución actual del modal) con la tarjeta A. Pidió mejorar «Todas» y que sus casillas filtren.

«Todas» queda así (prototipo, `?vista=todas` y `&capa=piso|alm`):
1. **Las casillas «colgadas» y «guardadas» son filtros** (como `casillaCapa` de la vista real desde el 09-10): tocas una y la matriz muestra solo
   esa capa, con el número grande en cada celda (verde lo colgado, pizarra lo guardado); la casilla tocada lleva marco negro y ✓, la otra se
   apaga; tocas otra vez y vuelven las dos. «Apartadas» y «dañadas» siguen siendo informativas.
2. **Con «colgadas» puesto, la celda que falta colgar sigue en ámbar** y dice «falta · +N atrás»: el filtro no esconde el problema, lo subraya.
   Una fila (color) sin nada en la capa elegida se atenúa, no desaparece.
3. **Totales**: una columna «Total» por color y una fila «Total» por talla, en hueso, que cambian con el filtro (ambas capas apiladas, o una sola).
4. **Orientación**: la cabecera de la talla abierta va en negro, la fila del color abierto en hueso y la celda abierta con marco negro; arriba,
   «2 colores · 6 tallas». La leyenda cambia con el filtro y dice cómo volver.
5. Tocar una celda abre «Esta talla» en ese color y esa talla (como hoy). «Colgar varias tallas y colores» se apaga si no hay nada guardado.

Mapeo al código real: `PanelTalla.tsx` ya tiene `capa` y `casillaCapa` para «Todas»; lo nuevo son los totales, la celda ámbar con «falta · +N
atrás» dentro de la capa, la fila atenuada, la cabecera de la talla abierta en negro y el botón apagado sin nada guardado.

## 10. Implementado (12-10, noche; ADR-0391)

Felipe: «listo, implementa tal cual al sistema». Lo de §9 está en la rama `claude/inventory-display-garment-details-03c3fa`:
la tarjeta A (`ExistenciasTarjetas.tsx`, `ColumnasTallas`), las cifras que filtran (`existencias/CifrasExistencias.tsx`), el aviso «piso sin
cuadrar» (`InventarioPanel.tsx`), el modal «Foto y lista» con «Todas» y sus filtros (`existencias/PanelTalla.tsx`). Las decisiones, lo
descartado y cómo se verificó (tema, guía, `/chaos`, `/formidable`) viven en `docs/adr/0391-existencias-almacen-en-la-tarjeta-y-modal-de-la-prenda.md`;
este documento queda como la historia de la propuesta y el prototipo (`prototipo.html` conserva las cuatro distribuciones para comparar).
