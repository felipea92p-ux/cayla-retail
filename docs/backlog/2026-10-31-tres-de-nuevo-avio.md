# Backlog — los tres últimos de «Nuevo avío» (2026-10-31)

## NO TRAE SQL

Solo web: una regla nueva en `avio-clases-reglas.ts`, el API que la usa, una línea de `problemasDeLaMedida` y dos
propiedades del modal. Nada que pegar en producción.

## LO QUE NO SE VERIFICÓ EN PANTALLA

El cartel «todavía no se creó… se pierde lo que escribiste» mientras la escritura está en camino. Para provocarlo
hay que retrasar la RPC a propósito (como hizo `/chaos`). El arreglo usa `<Modal bloqueado>`, que ya existía
documentado para esto, y apaga «Cancelar» con el mismo estado que apaga el botón de guardar. Está probado por
lectura, no por uso.

## UNA DECISIÓN QUE PUEDE INTERESARTE

Un botón **sin medida** ahora se puede registrar. Es lo que el diseño decía desde el principio
(`COMPORTAMIENTOS.pieza.requerida = false`) y lo que la base acepta, y evita que alguien invente una línea que se
queda en el nombre para siempre. El costo: dos botones distintos sin medida chocan por nombre (el índice único los
trata como el mismo). Si prefieres que la medida sea obligatoria en los botones, es cambiar `requerida` a `true` en
una línea — pero entonces vuelve el número inventado.

## QUEDA DE `/chaos` SOBRE «NUEVO AVÍO»

Un solo hallazgo, de gravedad 4: **`desactivar_categoria` dice «Solo un Líder puede…»** cuando su candado real es
`fn_puede_editar_catalogo()`. Es un mensaje que culpa al rol equivocado; no bloquea a nadie que deba pasar.

Y aparte, de otra corrida: **en «Nuevo avío» el costo por unidad usa el lector de plata**, así que 0,045 —lo que
cuesta un botón— se rechaza (`lib/avio-nuevo-reglas.ts:97`). Es el G13 ya arreglado para telas que no llegó a avíos.

## SIGUE PENDIENTE DE ADR-0580

- `pnpm --filter web tema:auditar` con escenarios para «Nuevo avío» y Catálogo ▸ Atributos ▸ Avíos.
- `guias:recorrer`: las dos huellas se aceptaron revisando los pasos a mano.
- `/formidable` con una persona sin contexto.
