# 2026-10-30 — El detector de descuadres se había quedado ciego con los avíos (ADR-0580)

**QUÉ HICE.** Corregí el detector que vigila que cada color de una ficha de insumo sea el reflejo de su ficha
(INV-24 de `/chaos`). Desde ADR-0580 la base compone el nombre de cada color metiéndole la medida —«Botón nácar
**18 L** · Negro»—, pero el detector seguía esperando «Botón nácar · Negro». Ahora cuenta la medida, y una prueba
del CI se pone en rojo si alguien se la vuelve a quitar.

**POR QUÉ ASÍ.** Porque un detector que grita siempre no es un detector: es ruido. Tal como estaba, **todo** avío
con medida —o sea, casi todos— salía como descuadre, así que un descuadre de verdad (un color que apunta a la
ficha equivocada, una ficha que cambió de medida y dejó a sus colores diciendo la vieja) quedaba indistinguible
del montón. Lo arreglé en la condición, no en el informe: el detector compara el nombre contra las tres formas
legítimas que puede tener —solo la ficha, la ficha con su medida, o la ficha con su medida y un color detrás— y
nada más. La medida la lee con la misma función que usa el disparador al componer el nombre
(`retail.fn_medida_texto`), para que no haya dos maneras de escribir «18 L».

**QUÉ SE ROMPERÍA SIN ESTO.** El día que un color de botón quede apuntando a la ficha equivocada, nadie lo vería:
la corrida de `/chaos` ya venía con veintitantos avíos «violando» la misma regla, y uno más no llama la atención.
Eso es tela o avío que se ve en el sistema y no se puede cortar, o que se corta y no se ve, descubierto meses
después contando a mano.

---

**Lo encontró `/chaos`** en su primera corrida sobre «Nuevo avío» (la hoja que ADR-0580 estrenó): gravedad 2,
«dato malo en silencio». El fallo era de mi propio cambio del día anterior, no de una pantalla.

**Verificado** rompiendo la regla a propósito en las dos direcciones que importan, contra una base privada al día:

| Caso | Antes | Ahora |
|---|---|---|
| Avío con medida y nombres correctos | violado (falso positivo) | limpio |
| Un color renombrado a «Cualquier cosa · Amarillo» | violado | violado ✔ |
| Ficha a 24 L con su color diciendo 18 L | se ahogaba en el ruido | violado ✔ |

Y de punta a punta: tras crear un avío de verdad desde la hoja, con login real, INV-24 quedó limpia.
`node --test scripts/chaos/invariantes.test.mjs scripts/chaos/catalogo.test.mjs` → **32/32**, ya con INV-26 de
#1499 fusionado.

**Lo que esa corrida de `/chaos` sí alcanzó a probar** (10 de 22 ataques): enviar la hoja vacía la rechaza sin un
solo error de Postgres y dice qué falta, cada falta tocable; y diez clics en «Guardar» en el mismo instante crean
**una** ficha, **un** color y **una** línea de Actividad — con el botón todavía habilitado en el momento de la
ráfaga, lo que prueba que lo que aguantó fue el candado de la base, no React.
