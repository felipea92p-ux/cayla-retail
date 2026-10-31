# Backlog — cerrar el pegado de celdas en todos los lectores (2026-10-31)

## NO TRAE SQL

Reglas puras de `apps/web/lib/`, un filtro de campo y una prueba. Sin migración, nada que pegar en producción.

## DECISIONES QUE TE TOCAN A TI

1. ~~«S/. 25»~~ **HECHO en este PR** (Felipe, 31-oct: «sí, unifícalo»): los ocho lectores con símbolo de moneda
   leen «S/. 25» como veinticinco soles, con su candado en `lib/pegado-de-celdas.test.ts`. Antes cuatro leían
   veinticinco céntimos y dos lo rechazaban.
2. **`parsearPorcentaje` sugiere algo que después rechaza.** Su mensaje dice «por ejemplo 25 o −15» con el menos
   tipográfico (U+2212), y la función solo acepta el guion: quien copie el ejemplo del aviso recibe otro aviso. Es
   anterior a este PR y es de una línea. Principio 12 (el error es del diseño, no de la persona).

## LO QUE QUEDÓ FUERA, A PROPÓSITO

**Los filtros de tecleo de Caja** (`gasto-rapido-reglas.ts:294` `limpiarMonto` e `ingreso-rapido-reglas.ts:101`
`limpiarMontoIngreso`) borran los blancos de lo que se escribe, así que pegar tres celdas deja «1285» en el campo.
**No son lectores: son filtros**, y la diferencia importa — ahí lo pegado **se ve** escrito, mientras que en los doce
de este PR el campo mostraba «12 8 5» y por debajo entraba 1 285. Cerrarlos bien no es la misma línea: hay que
decidir qué se le muestra a la persona cuando pega, y eso es diseño de pantalla. Queda para cuando lo quieras.

Lo mismo, más abajo en la lista: los campos de **días** (`PlazoModal`, `RelojDelPedido`) borran todo lo que no sea
dígito; pegar tres celdas daría 1 285 días. No es plata ni stock y se ve escrito, pero es el mismo molde.

## EL CANDADO, Y CÓMO SE CONVIVE CON ÉL

`lib/pegado-de-celdas.test.ts` recorre `lib/` y `components/` y falla si un archivo vuelve a borrar TODOS los blancos
de un texto. Lo que no persigue, porque es correcto: colapsarlos a un espacio (`, " "`) y recortar un prefijo o un
sufijo (lleva ancla: `/^Tienda\s+/`). Un borrado legítimo se declara en su propia línea con
`// blanco-fijo: <motivo de 10 caracteres o más>`; hoy lo usan el DNI de un gasto fijo, el código del escáner de
Liquidación, los dígitos de un RUC, una plantilla del asistente, el XML de SUNAT y los tres `limpio` que solo arman
la frase de la duda de miles. La lista `NO_LEEN_CIFRAS` (teléfonos, búsquedas) **solo baja**: un archivo nuevo no
entra ahí.

## SIGUE PENDIENTE DE `/chaos` SOBRE «NUEVO AVÍO» (informe en `.chaos/`)

Seis hallazgos sin arreglar, por gravedad:

1. **Medio botón entra y la pantalla dice que es uno** (g2): «0,5» se acepta, la base guarda `0.500`, la pantalla
   muestra «1 unid.». Nadie exige entero para unidades, conos, pares ni docenas.
2. **Un invisible crea dos fichas del mismo botón** (g2): U+200B pegado de la web. **Es el mismo agujero del 30-oct
   en Atributos**: una causa, dos pantallas, y el arreglo toca la base (`fn_clave_texto`).
3. **Enter guarda el avío** (g2), sin tocar «Crear el avío», en una hoja que fija una decisión irreversible.
4. **Una clase nueva se recorta a 60 letras en silencio** (g2) y el aviso de éxito muestra el nombre mutilado.
5. **«Si cierras ahora, se pierde lo que escribiste» … y se guarda** (g3).
6. **Un botón sin medida no se puede registrar** (g3), aunque el diseño y la base la hacen opcional.

Y aparte: **en «Nuevo avío» el costo por unidad usa el lector de plata**, así que 0,045 —lo que cuesta un botón— se
rechaza (`lib/avio-nuevo-reglas.ts:97`). Es el G13 ya arreglado para telas que no llegó a avíos.

## SIGUE PENDIENTE DE ADR-0580

- `pnpm --filter web tema:auditar` con escenarios para «Nuevo avío» y Catálogo ▸ Atributos ▸ Avíos.
- `guias:recorrer`: las dos huellas se aceptaron revisando los pasos a mano.
- `/formidable` con una persona sin contexto.
