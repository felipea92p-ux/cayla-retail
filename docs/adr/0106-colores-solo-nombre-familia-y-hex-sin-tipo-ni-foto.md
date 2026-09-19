# ADR-0106 — Un color es nombre, familia y hex; la textura es de Tejidos y el estampado de Patrones

**Fecha:** 2026-09-18
**Estado:** Construido y verificado en navegador (ruta temporal, sin base). Sin cambios de
esquema: nada que pegar en producción.
**Afecta:** `ColoresLista.tsx`, `/api/productos/colores`, `/productos/atributos`; borra
`lib/colores-muestra.ts`; nuevo `lib/color-entrada.ts`.

## El problema

`colores.tipo` (sólido/textura/estampado) y `colores.imagen_muestra_url` nacieron el 15-sep
(`20260915230000_colores_tipo_y_muestra.sql`), antes de que existieran Tejidos y Patrones
(17-sep). Desde entonces había dos lugares para decir lo mismo: «este azul es jaspeado» podía
vivir en el color o en el tejido, y «este es floral» en el color o en el patrón. Producción
(2026-09-18): 35 colores, **los 35 en `solido`**, 3 con foto. Nadie usó `tipo`.

## Decisión

Un color es **nombre + familia + hex + orden + notas**. La textura de la tela vive en
`tejidos` y el estampado en `patrones`, que ya se ilustran por nombre y no piden subir nada.
Se sacan Tipo y «Muestra (foto de la tela)» del modal de crear y de editar, de la API y de la
tarjeta.

Las columnas `tipo` e `imagen_muestra_url` **no se borran**: quedan en la base sin uso (las 3
fotos siguen en el bucket `retail-colores-muestras`, y borrar datos es decisión aparte). Si un
día se confirma que no hacen falta, un `drop column` los retira.

De paso, al crear o editar un color se puede escribir el **código HTML** (`#c9b79c`) o el
**RGB** (`rgb(201, 183, 156)`, `201 183 156`) además del selector del navegador. La base sigue
guardando solo el hex.

DESCARTÉ: dejar Tipo «por si acaso» — el costo es que la próxima persona tiene que decidir en
dos pantallas dónde va «jaspeado».
SE ROMPE SI: CAYLA necesita distinguir dos colores idénticos en hex que solo difieren en la tela
(un «Azul marino liso» y uno «jaspeado» de igual hex). Eso ya se resuelve con tejido en el
producto, no con un color distinto; si aun así estorba, se reabre.
