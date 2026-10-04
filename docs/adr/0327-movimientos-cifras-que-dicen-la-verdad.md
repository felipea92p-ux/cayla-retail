# ADR-0327 · Movimientos: las cifras dicen la verdad

- **Fecha:** 2026-10-03 · **Estado:** Aprobado por Felipe («haz de la #1 a la #5»; palabras y desglose de los ajustes elegidos
  con la recomendación).
- **Origen:** `/pantalla` sobre `/inventario/movimientos` (`docs/pantallas/inventario-movimientos.md`, 5,7/10), con las cifras de
  Tienda TRU contrastadas contra producción en solo lectura.
- **Producción:** **sin migración.** La base ya devolvía lo que sumó y lo que restó por proceso (`fn_movimientos_resumen_procesos`);
  cambia solo cómo se lee. No hay nada que pegar.
- **Complementa:** ADR-0234 (Movimientos leído desde la tienda; D1 no cambia: la anulación de una venta sigue siendo una
  entrada), ADR-0235 (un ajuste no es la primera carga), ADR-0127 (referencias), ADR-0241 (cajón y atajos).

## Problema

Tres cifras llevaban a conclusiones equivocadas, y las tres estaban en lo primero que se lee:

1. **«Ajustes +52»** era un neto. En TRU (30 días) los ajustes sumaron 87 prendas y restaron 35; la tarjeta mostraba la resta
   en tinta, sin alarma, y el desglose además restaba dentro de cada motivo («−5 por conteo» eran +4 y −9). Una encargada que
   abría la pantalla para saber si se perdía ropa leía que sobraba.
2. **«HOY · 14 movimientos»** contaba las operaciones de la **página cargada** (50 filas), no las del día: a las 17:23 TRU llevaba
   unas 90.
3. **«30 vendidas»** incluía 2 ventas que se anularon (quedaron 28); las 2 solo aparecían en «Entró» como «por venta anulada».

Y dos de lectura: «Ajuste · conteo físico» (escrito a mano en Ajustar stock, sin documento) y «Ajuste · Conteo» (del módulo
Conteo) se leían como sinónimos, y la tarjeta mostraba «+1 por ajuste · encontrada tras un conteo», porque `hallazgo_conteo` no
tenía frase y el « · » de la etiqueta partía el desglose en dos.

## Decisiones

```
DECIDÍ: los ajustes van en BRUTO —«−35 faltaron · +87 aparecieron»—, nunca un neto, y cada cara se parte por RESPALDO:
        «26 a mano · 9 en un conteo». Un ajuste es «en un conteo» si su proceso es `conteo` o `hallazgo_conteo` (los dos
        llevan `conteo_item_id`); todo otro —reposición, merma, conteo físico, otro, o un motivo que mañana exista— es «a mano»,
        sin documento. `respaldoDeAjuste` lo decide por el proceso, con «a mano» como valor por omisión: un motivo nuevo cae
        del lado que pide mirar.
DESCARTÉ: (a) seguir con el neto y agregar el bruto debajo: el número grande es lo que se lee, y seguía diciendo +52;
        (b) desglosar por motivo (conteo físico / otro / reposición…): son cinco renglones que estiran la tarjeta, y lo que se
        viene a saber es si hay un documento detrás; el motivo sigue en cada fila y en los filtros de proceso.
SE ROMPE SI: una función nueva escribe un ajuste con documento sin pasar por un conteo (una devolución por ajuste, por
        ejemplo): se leería «a mano» aunque tenga papeles. `lib/movimientos-reglas.test.ts` obliga a decidir el respaldo de todo
        motivo del modal de Ajustar stock, no de los que se agreguen por otra puerta.
```

```
DECIDÍ: «Ajuste a mano · …» para los cuatro motivos de Ajustar stock (reposición, merma, conteo físico, otro), y en la columna
        de la referencia, «Sin documento» con la nota de quien ajustó entre comillas, o «sin nota». La referencia se decide por
        el dato (un ajuste sin conteo enlazado), no por el nombre del motivo (`referenciaSinDocumento`).
DESCARTÉ: «sin documento / con conteo» como nombre (suena a reproche para quien ajustó bien y es más largo) y «manual / por
        conteo» (se confunde con «manual de uso» y no le dice nada a una integrante nueva). Elegidas por Felipe.
SE ROMPE SI: la nota se vuelve obligatoria (decisión pendiente, fuera de esta pantalla): «sin nota» pasaría a ser imposible y
        la línea sobraría.
```

```
DECIDÍ: la banda del día dice solo el día, sin «N movimientos». El número que sí cuenta el día lo dan las tarjetas con el período «Hoy».
DESCARTÉ: traer el conteo del día de la base (otra consulta por cada día visible, para un número que las tarjetas ya dan), y
        dejar la cifra de la página con otro rótulo («en esta página»): sigue siendo la única cifra de la pantalla que depende
        de dónde cae el corte de 50 filas.
SE ROMPE SI: alguien necesita comparar días entre sí de un golpe: entonces el conteo por día es una RPC propia, no una suma en pantalla.
```

```
DECIDÍ: «30 vendidas (2 se anularon)»: junto a «vendidas» se nombra lo que volvió por venta anulada. La anulación SIGUE siendo
        una entrada (ADR-0234 D1): cambia la palabra, no la cifra. Se dice «de ellas» porque `anular_venta` exige la caja de la
        venta abierta (verificado también en producción): la venta y su anulación caen en el mismo turno.
DESCARTÉ: restar las anuladas de «Salió»: rompe la cuenta que la tarjeta promete (lo que salió de la tienda); y moverlas a
        «Salió» como entrada negativa: dos signos en una cifra.
SE ROMPE SI: se permite anular una venta de un turno ya cerrado (una nota de crédito): las anuladas de «Entró» podrían no ser
        de las ventas de «Salió» en el mismo período, y el paréntesis sobrecontaría.
```

## Lo que se hizo

- `lib/movimientos-reglas.ts`: `desgloseAjustes`, `respaldoDeAjuste`, `referenciaSinDocumento`, `ventasAnuladas`; `desgloseCifras`
  pierde la forma «neto» y gana `{ anuladas }`; `FRASE_PROCESO` se exporta y una prueba exige la frase de todo proceso que pueda sumar
  o restar en «Entró» o «Salió» (fallar al quitar una: comprobado).
- `page.tsx` (tarjetas y franja del celular, apiladas a 375 px con su palabra), `FilaMovimiento.tsx` (referencia «Sin documento»),
  `MovimientosLista.tsx` (banda sin cifra). Conteo conserva su banda: cuenta su propia lista.
- Verificado con una base local propia y datos de prueba, en escritorio y a 375 px (sin desborde horizontal ni errores de consola);
  las cifras de la base salen de `fn_movimientos_resumen_procesos` sin tocarla.

## Lo que queda abierto

Tareas #6 a #12 del análisis (decidir «qué pasó» o «excepciones primero», decir cada cosa una vez, una sola unidad por cifra,
filtros en un lenguaje, la banda negra, la fila sin repeticiones y los atajos perdidos). **Fuera de la pantalla:** el 80 % de los
ajustes de TRU no tiene documento y casi ninguno nota; si Ajustar stock exige nota, o «Reposición» se cierra también en el
almacén, es una decisión de negocio de Felipe.
