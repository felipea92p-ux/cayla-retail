# ADR-0699 — Recibir: cada modelo sale al stock desde el contador

- **Fecha:** 2026-11-24 · **Estado:** actividad 1 construida y verificada en local; actividad 2 construida y probada en local; 2c (foto por QR) construida, con migración `20261124161000` SOLO en local; sin PR.
- **Rama:** `claude/mejora-recepcion-mercaderia-2c864b`. Número reservado con `pnpm reservar adr`.
- **Relacionados:** ADR-0393 (Recibir contando primero, «Por terminar»), ADR-0645 (Contar en dos mitades: «lo nuevo queda para después»),
  ADR-0260 (los puntos de avance de Nuevo producto), ADR-0389 (guías interactivas).
- **Maqueta:** `docs/maquetas/recibir-terminar-en-el-contador/index.html`. **Plan:** `docs/backlog/2026-11-24-mejora-recepcion-mercaderia-2c864b.md`.

## El problema

Felipe (2026-11-24): «que no tengan luego que ir a otro apartado para terminar de recibir mercadería». En el código, la razón era una
decisión: ADR-0645 contestó sola la pregunta de cada modelo nuevo con «queda para después» (`modoDeTallas`, `lib/recepcion-tallas-reglas.ts`).
Crear la prenda era un botón fantasma en la tarjeta de tallas, y el envío se cerraba con lo nuevo contado pero fuera del stock. Eso es justo lo
que llena «Por terminar» (ADR-0393), que obliga a volver otro día. Además, la placa numeraba dos pasos («1 · cuántas», «2 · tallas»), y
crear y llevar al stock no aparecían como pasos.

## La decisión

```
DECIDÍ:     Cada modelo muestra arriba de su placa los pasos que le faltan para venderse (Cuántas → Crear, solo si es nueva → Tallas →
            Llevar), con la pieza de los puntos de avance que ya usa Nuevo producto. Una prenda nueva ya contada tiene como botón
            principal «Crear la prenda»; dejarla para después sigue a un toque y se puede deshacer. La línea de avance del envío dice
            cuántas prendas ya están a la venta, porque contar no es terminar.
DESCARTÉ:   (1) Quitar «Por terminar» y obligar a crear todo antes de cerrar: un fardo de 135 prendas con una sola persona a las 7 de
            la noche se cerraría mal o no se cerraría, y lo contado quedaría sin registro. (2) Dibujar una tira de pasos propia, como
            la maqueta: sería una segunda forma de lo mismo (ADR-0358); los puntos de Nuevo producto ya resuelven estados, toques y
            movimiento.
SE ROMPE SI: un envío trae 20 modelos nuevos y quien recibe no tiene acceso a crear prendas en el catálogo. El botón principal le
            pide algo que no puede terminar, y tiene que tocar «Dejar para después» en cada uno. Si pasa, el botón tiene que leer el
            permiso (`fn_puede_editar_catalogo`) antes de ofrecer crear.
```

## Lo que cambia

- `lib/recepcion-pasos-reglas.ts` (nuevo, con su prueba): los pasos del modelo en orden. Nunca hay dos abiertos, lo anterior al abierto
  está hecho, «Llevar» no se abre desde la tira (pide costo y quién con su botón) y un modelo que no llegó no muestra pasos.
- `botonPrincipal` (`lib/recepcion-tallas-reglas.ts`): una nueva manda su tarjeta, salvo `nuevaParaDespues`.
- `TarjetaDeTallas`: la nueva tiene «Crear la prenda» (primario) y «Dejar para después». Lo dejado para después mantiene la cara de antes.
- `PuntosAvance`: prop `etiqueta` (el nombre del conjunto para el lector de pantalla); sus anclas de guía no cambian.
- `cifrasDelResumen` suma `enStock`; `AvanceDelEnvio` dice «N ya a la venta».
- Con la tira a la vista, los números de los bloques de la placa se esconden: un marcador para lo mismo (ADR-0260).

## Lo que sigue (plan)

Actividades 2 a 5 del plan: la foto primero, la galería «¿ya la tenemos?» con el enlace al catálogo (la hoja «¿Esta prenda ya existe?» ya
muestra las prendas de la categoría con su foto cuando no hay coincidencia por nombre), temporada y etiquetas al crear, y quitar lo que
sobra. La comparación por foto con IA va después, solo como sugerencia (Felipe 2026-11-24).

## Actividad 2 · La foto primero (2026-11-24)

```
DECIDÍ:     Un modelo nuevo que todavía no tiene prenda lleva «Tomar foto» en su placa (en el celular abre la cámara). La foto le pone
            cara al modelo en la lista y en la placa, y al crear la prenda entra sola a «Fotos y colores»: de ella sale su color, como
            si se hubiera elegido ahí. Vive en el navegador mientras la pantalla está abierta.
DESCARTÉ:   (1) Un paso «Qué es» obligatorio antes de contar, como en la maqueta: frenaría el conteo de cada modelo nuevo, y lo que
            más se repite al abrir un fardo es contar. (2) Subir la foto apenas se toma: no hay prenda a la que colgarla
            (`producto_fotos` pide un producto), y una foto suelta en el almacén es basura si el modelo termina siendo una prenda
            que ya existía.
SE ROMPE SI: alguien toma las fotos de 15 modelos y recarga la página antes de crearlos: se pierden y hay que volver a tomarlas.
            Si pasa seguido, guardarlas en el navegador (IndexedDB) por envío y modelo.
```

Quien no tiene permiso de fotos del catálogo igual ve la foto para reconocer el modelo; la hoja de crear no la sube, como hoy.

## Actividad 2c · La foto con el celular, por QR y sin sesión (2026-11-24)

Felipe eligió que el celular suba la foto **sin entrar al ERP** («Sin sesión (B)»), después de ver la alternativa con sesión.

```
DECIDÍ:     El QR trae un permiso de 32 caracteres al azar que vale para UN modelo de UN envío abierto, vence a los 10 minutos y sube
            como mucho 3 fotos (lo exige la tabla, no el código). La base guarda solo su huella sha256. El celular abre `/foto/<permiso>`
            y sube a `POST /api/foto-qr/<permiso>`, que revisa la forma del permiso, su vigencia y la firma del archivo (no su nombre)
            con la llave de servicio, y la guarda en un almacén privado SIN políticas. La computadora pregunta cada 2,5 s
            (`fn_fotos_por_qr_llegadas`, sin loader), la recoge por `GET /api/recibir/foto-qr/<archivo>` (con sesión: solo la cuenta
            que pidió el QR) y el servidor la borra del almacén al entregarla.
DESCARTÉ:   (A) El celular con su sesión del ERP: era la recomendada (nadie sin cuenta sube nada) y Felipe prefirió cero pasos.
            (C) Abrirle el almacén o una función a `anon`: una política mal puesta abriría más que una foto; con la ruta, la única
            puerta es una.
SE ROMPE SI: alguien fotografía el QR de la pantalla del almacén y, en esos 10 minutos, sube 3 fotos que no son de la prenda: el
            modelo queda con una foto ajena hasta que se cambie. Lo acota el tope de 3, el vencimiento y que la foto solo entra
            al catálogo cuando alguien crea la prenda mirándola.
```

**Si algo no responde:** sin `SUPABASE_SERVICE_ROLE_KEY` o con la base caída, el celular dice «No se pudo subir la foto» y la computadora
sigue esperando; una foto que la base no anotó se borra en el acto. **Pendiente:** los permisos vencidos quedan como filas (no se borran
datos); las fotos nunca recogidas quedan en el almacén privado hasta una limpieza que todavía no existe.

## Actividades 3, 5 y 5a · Igual a la maqueta, con las piezas del ERP (2026-11-24)

Felipe: «que se vea similar a la maqueta cumpliendo la unificación de diseño». Lo que cambió:
- **La cabecera de categoría, en una línea** (`CategoriasAcordeon`, `vidrio/recibir-mesa.css`): el nombre a la izquierda, cómo va a la
  derecha y el avance como un filo de 4 px al pie (antes, una barra de 11 px bajo el nombre y la baldosa de la categoría). 44 px de alto.
- **La foto de cada modelo en la lista, de 60 px** (antes 44): la prenda manda sobre la categoría.
- **«¿Esta prenda ya existe?» con la galería primero** (`ElegirPrendaExistente`, `galeriaSiNoHay`): si el nombre que anotó Compras no
  coincide con ninguna, se ven todas las de su categoría y marca («No hay «…». ¿Es alguna de estas?»), con la foto que se tomó arriba
  para comparar y «Ver el catálogo» en otra pestaña (`/productos?cat=…&marca=…`). Antes decía «No hay…» y había que tocar «Ver todas».
- **El aviso de Admin**, mientras se cuenta, deja su franja y va detrás del «?» de la chapa «Admin · queda a tu nombre». Antes de abrir el
  envío sigue a la vista.
- **«Por terminar» sale del camino** (`Trayecto`): cuatro paradas; «Por terminar» se dibuja solo si el envío de verdad quedó ahí.

Lo que NO se copió de la maqueta, a propósito: las cajitas de los pasos (se quedan los puntos de Nuevo producto, ADR-0358) y un paso «Qué
es» obligatorio (actividad 2).
