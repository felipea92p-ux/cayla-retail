# Backlog — el pegado de varias celdas inventaba un número (2026-10-31)

## NO TRAE SQL

Solo reglas puras de la web (`apps/web/lib/`) y su prueba. No hay migración, nada que pegar en producción.

## EL MISMO AGUJERO, EN OTRAS DOS PANTALLAS (decisión tuya: es plata)

El borrado de blancos que causaba esto vive en dos sitios más, que **no toqué**:

1. **`lib/precio-sede-reglas.ts`** — el precio de una sede. Mismo caso exacto: pegar dos celdas da un precio
   inventado. El arreglo es la misma línea.
2. **`lib/balance-reglas.ts`** — lee cifras de un extracto bancario **pegado**, donde un pegado de varias celdas
   es lo normal y lo esperado. Ahí la regla tiene que ser otra (partir por filas, no rechazarlas), así que no
   es un copiar y pegar del arreglo: hay que mirar la pantalla primero.

Los lectores de teléfono (`club-*`, `clienta-ticket`) también borran blancos, pero un número de WhatsApp no es
una cifra que se sume: quedan fuera a propósito.

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
