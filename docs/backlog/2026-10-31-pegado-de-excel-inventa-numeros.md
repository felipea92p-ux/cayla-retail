# Backlog — el pegado de varias celdas inventaba un número (2026-10-31)

## NO TRAE SQL

Solo reglas puras de la web (`apps/web/lib/`) y su prueba. No hay migración, nada que pegar en producción.

## EL MISMO AGUJERO, EN NUEVE LECTORES MÁS (decisión tuya: es plata y es stock)

Al verificar este arreglo con una revisión adversarial sobre sus llamadores salió que **el borrado de blancos no
estaba en dos sitios, como escribí primero, sino en nueve más**. Y la razón que di para dejar fuera
`lib/balance-reglas.ts` **era equivocada**: `leerMontoArranque` no es el lector de un extracto bancario pegado, es
«un monto escrito por el líder» en una celda de «Saldos de arranque» —el primer número de todo el Balance de
Finanzas—, y su propio comentario dice «con la regla única de `leerMontoPlata`» mientras la anula borrando los
blancos antes de llamarla.

**Ninguno es una regresión de este PR:** todos ya eran así. Lo medí con las funciones reales del repo, pegando las
mismas tres celdas (12, 8 y 5):

| Lector | «12 8 5» | «12 ⇥ 8 ⇥ 5» | Qué se inventa |
|---|---|---|---|
| `balance-reglas.ts:468` `leerMontoArranque` | 1285 | 1285 | el saldo de arranque del Balance (va a `registrar_saldo_inicial`) |
| `orden-compra-alta.ts:79` `leerNumero` | ok 1285 | ok 1285 | cantidad y precio de una orden de compra |
| `ordenes-insumo-reglas.ts:174` `leerCantidadInsumo` | 1 285,000 | 1 285,000 | cuánto se pide de un insumo |
| `ordenes-insumo-reglas.ts:180` `leerPrecioInsumo` | S/ 1 285,0000 | S/ 1 285,0000 | a qué precio |
| `comprobante-orden-reglas.ts:359` `limpio` | (mismo patrón) | | **la factura del proveedor** |
| `recepcion-envio-reglas.ts:820` `leerCosto` | 128 500 céntimos | 128 500 | el costo al recibir mercadería |
| `recepcion-envio-reglas.ts:1526` `leerPrecioVenta` | 128 500 céntimos | 128 500 | el precio de venta al recibir |
| `plan-compra-reglas.ts:398` `leerNumeroDeMonto` | 1285 | 1285 | el tope de inversión, el precio y el costo del plan |
| `plan-compra-reglas.ts:409` `leerDescuento` | 12 («1 2») | 12 | el descuento de una campaña |
| `precio-sede-reglas.ts:98` `leerMonto` | 1285 | 1285 | el precio por sede |
| `rendimiento-meta-reglas.ts:409` `leerSoles` | 1285 | 1285 | la meta de una persona |
| `envio-orden-reglas.ts:90` `leerCantidad` | (mismo borrado) | | cuántas prendas se envían de una orden |

**Qué haría yo, si lo apruebas:** un PR aparte que pase los nueve por `sinBlancosDeMiles`, uno por uno y con su
prueba, empezando por los tres que tocan plata que sale de la empresa (el comprobante del proveedor, el costo al
recibir y el saldo de arranque). Es mecánico, pero son precios, stock y dinero: no lo hago sin tu OK.

En el camino hay que revisar dos cosas de verdad, no por encima: **`leerSoles` y `leerDescuento` borran también lo
que no es cifra** (`replace(/[^\d.,]/g, "")`), que es un borrado más ancho todavía; y **`balance-reglas.ts` tiene
además el lector del extracto bancario pegado**, donde varias celdas SÍ son lo normal y la regla tiene que ser
otra (partir por filas, no rechazarlas). Ese no es copiar y pegar el arreglo.

Los lectores de teléfono (`club-*`, `clienta-ticket`) también borran blancos, pero un número de WhatsApp no es una
cifra que se sume: quedan fuera a propósito. Lo mismo los `replace(/\s+/g, " ")` que COLAPSAN espacios en un
nombre: eso es correcto y no es este patrón.

## HALLAZGO NUEVO, encontrado al verificar este arreglo

**En «Nuevo avío», el costo por unidad usa el lector de plata, no el de costo por unidad.** Escribir **0,045**
—lo que cuesta un botón— da «No se entiende el monto». Es el mismo problema G13 que ya se arregló para «una tela
con sus colores» (`leerCostoUnitario`, hasta 4 decimales), pero la hoja de avíos quedó con `numeroDeMonto`
(`lib/avio-nuevo-reglas.ts:97`). Donde más duele: un avío cuesta céntimos de sol. **No lo arreglé**: es el costo
de un insumo, o sea plata, y la decisión es tuya.

## ¿ADR?

Esta regla la hereda toda pantalla nueva con un campo de cifra, así que podría merecer su propio ADR corto. No lo
escribí porque el número se reserva al empezar (ADR-0381) y este arreglo salió de un hallazgo, no de un plan. Si
lo quieres, se reserva y se escribe; mientras tanto el porqué completo vive en el encabezado de
`apps/web/lib/numero-escrito.ts` y en la bitácora.

## LO QUE SIGUE DE LA CORRIDA DE `/chaos` (informe en `.chaos/2026-10-31-nuevo-avio-segunda-vuelta.md`)

Quedan **siete** hallazgos sin arreglar, por gravedad:

1. **Medio botón entra y la pantalla dice que es uno** (g2). «0,5» se acepta, la base guarda `0.500` y la pantalla
   muestra «1 unid.». Nadie exige entero para unidades, conos, pares ni docenas.
2. **Un invisible crea dos fichas del mismo botón** (g2). «Botón ZW» y «Botón ZW» con un U+200B pegado de la web
   entran como dos. `fn_clave_texto` no quita invisibles. **Es el mismo agujero del 30-oct en Atributos**: una
   sola causa, dos pantallas, y el arreglo toca la base.
3. **Enter guarda el avío** (g2), sin tocar «Crear el avío», en una hoja que fija una decisión irreversible.
4. **Una clase nueva se recorta a 60 letras en silencio** (g2) y el aviso de éxito muestra el nombre mutilado.
5. **«Si cierras ahora, se pierde lo que escribiste» … y se guarda** (g3), con la escritura ya en camino.
6. **Un botón sin medida no se puede registrar** (g3), aunque el diseño y la base la hacen opcional.
7. **`desactivar_categoria` dice «Solo un Líder puede…»** cuando su candado real es `fn_puede_editar_catalogo()` (g4).

## SIGUE PENDIENTE DE ADR-0580 (no de este PR)

- `pnpm --filter web tema:auditar` con escenarios para la hoja «Nuevo avío» y para Catálogo ▸ Atributos ▸ Avíos.
- `guias:recorrer`: las dos huellas se aceptaron revisando los pasos a mano, no con un recorrido en el navegador.
- `/formidable` con una persona sin contexto.
