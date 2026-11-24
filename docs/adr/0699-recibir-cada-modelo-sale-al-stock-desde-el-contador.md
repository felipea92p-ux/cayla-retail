# ADR-0699 — Recibir: cada modelo sale al stock desde el contador

- **Fecha:** 2026-11-24 · **Estado:** actividad 1 construida y verificada en local; actividad 2 construida, con pruebas en verde y sin probar en el navegador; sin PR. Sin migración ni RPC nuevas.
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
