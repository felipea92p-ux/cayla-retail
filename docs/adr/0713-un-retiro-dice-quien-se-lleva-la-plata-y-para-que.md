# ADR-0713 — Un retiro dice quién se lleva la plata y para qué

- **Fecha:** 2026-11-27 · **Estado:** construido en la rama `claude/retiro-quien-y-para-que`, migración `20261127150000` **sin pegar en
  producción**. Números reservados con `pnpm reservar`.
- **Pidió:** Felipe, 2026-11-27, sobre «Plata del dueño»: «¿para qué sacó plata [una encargada]?». Se le propuso que cada retiro exija quién se lleva
  la plata y para qué, y respondió «Sí, hazlo» y, tras aclarar que esos retiros eran del cuadre de caja de octubre, «Sí, sigue».
- **Cambia:** ADR-0195 F3 (un retiro y una devolución de préstamo guardan quién se llevó la plata; un retiro, para qué) y el gráfico «Quién
  puso y sacó plata» del rediseño de Dinero (2026-10-31): lo que salió cuenta para quien se lo llevó.
- **No cambia:** cómo se asienta un retiro (591 | 104), «CAYLA te debe» (sigue siendo una sola bolsa), los movimientos de antes, ni quién puede
  registrar (solo el líder saca plata del dueño).

## El problema

La tarjeta decía que una encargada de AQP «sacó S/ 2,812.10». En producción eran dos retiros de la caja fuerte de AQP que ella **anotó**: el del 18-oct
(S/ 1,500) decía «se llevó Felipe dinero en efectivo»; el del 14-oct (S/ 1,312.10) no decía nada, y era un ajuste del cuadre de caja. La base
solo guardaba quién registró (`registrado_por`), y el gráfico agrupaba por eso. Resultado: la fila de Felipe salía más baja de lo real, la de
la encargada mostraba plata que nunca se llevó, y nadie podía saber para qué salieron S/ 1,312.10.

## La decisión

1. **`movimientos_dinero.se_la_lleva_persona_id`** (un colaborador): quién se llevó la plata de un retiro o una devolución de préstamo. Un
   `check` impide que lo lleve cualquier otro tipo de movimiento.
2. **La puerta lo exige.** `registrar_movimiento_dinero` llama, dentro de su `insert`, a `fn_quien_se_la_lleva(p_tipo, v_ref)`, que lee a
   la persona del encabezado `x-se-la-lleva` y rechaza (sin dejar nada a medias, tampoco el egreso de caja) un retiro o una devolución sin
   quién, con alguien que no es colaborador, o un retiro sin para qué (su `referencia`).
3. **La hoja «Registrar movimiento»** pide «¿Quién se lleva la plata?» (sin nadie elegido de entrada: quien anota no siempre es quien se la
   lleva) y, en un retiro, la nota se llama «Para qué» y es obligatoria.
4. **«Plata del dueño» ▸ Por quién**: lo que salió cuenta para quien se lo llevó (`fn_quien_se_la_llevo`, solo el líder); lo que entró, y lo
   de antes sin quién, para quien lo anotó, y la ayuda de la fila lo dice. La ayuda muestra soles, no números crudos.

DECIDÍ el encabezado `x-se-la-lleva` y un ayudante dentro del `insert`.
DESCARTÉ un parámetro nuevo en `registrar_movimiento_dinero` porque cambiar su firma obliga a borrarla y recrearla entera (10 mil
caracteres con varios parches vivos) y rompe las guardas de las migraciones que la nombran por su firma de diez argumentos; es el mismo
camino que ya tomó ADR-0683 con `x-aliada` en esta misma función. DESCARTÉ un `check` de «no nulo» en la tabla porque quince pruebas
siembran retiros insertando directo, y la única puerta real de un retiro es esta función (consultado en producción: las otras seis funciones
que insertan en `movimientos_dinero` no escriben retiros ni devoluciones).
SE ROMPE SI alguien agrega otra función que inserte un retiro o una devolución sin pasar por `fn_quien_se_la_lleva`: se guardaría sin quién.

## Lo que queda fuera

- **Quién PUSO la plata** (aportes y préstamos): un aporte del cajón lo registra la tienda («Entrega del líder · plata del dueño»), que no
  siempre sabe de quién es. Hoy «Puso» sigue contando por quien anotó.
- **«CAYLA te debe» por persona:** los préstamos de Felipe y de Claudia siguen en una sola bolsa; con el quién guardado, partirla es posible
  después.
- **Los retiros de antes** (19 movimientos del dueño en producción al 2026-11-27) siguen sin quién. Si uno estuvo mal registrado (el ajuste
  de S/ 1,312.10 del 14-oct, que no es un retiro), se anula y se vuelve a anotar como lo que fue.

## Orden de pegado

La migración se pega **después** de fusionar y de que Vercel publique la web. Al revés, la web de antes no manda quién se lleva la plata y
todo retiro se rechazaría hasta publicar. La web nueva con la base vieja funciona: el encabezado se ignora y el gráfico cuenta como antes.
Lo único que se pierde en ese rato es el quién de los retiros que se registren.

## Cómo se verifica

- `pnpm pruebas:retiro-quien-y-para-que` (15 casos; con la regla quitada de la función, 11 en rojo).
- `pnpm pruebas:cuentas-dinero`, `pruebas:balance`, `pruebas:patrimonio-cambios`, `pruebas:saldos-por-cuenta` siguen en verde con el quién.
- `lib/cuentas-dinero-reglas.test.ts` y `lib/dinero-dueno-cobros-reglas.test.ts`.
- En el navegador (pila local): sin persona avisa «Elige quién se lleva la plata.», sin para qué «Di para qué es el retiro.», y completo
  guarda a quien se la llevó; el gráfico lo pone en su fila.
