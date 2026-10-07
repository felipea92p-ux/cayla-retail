# ADR-0359 — El recordatorio de cierre se muda a la barra superior: el «Marcador»

**Fecha:** 2026-10-06 · **Estado:** construido y probado en local (escritorio, 375 px, claro y oscuro); sin migración ·
**Decide:** Felipe (que viva en el centro de la barra, la maqueta 3, el preaviso de 15 min, el despliegue cada 5 min, el resplandor
más largo en rojo, quitar el nombre de la tienda de la cápsula); Claude (cortes por ancho, qué pasa en celular) ·
**Maqueta:** `docs/maquetas/recordatorio-cierre-barra-superior-2026-10/` (maqueta 3, «Marcador»). **Reemplaza la forma** de la
«Isla» de ADR-0305; las reglas de quién lo ve, el sondeo y «Cerrar caja → /caja?cerrar=1» siguen siendo las de ese ADR.

## 1. El problema, primero

La Isla de ADR-0305 vivía abajo a la derecha y, plegada, era una píldora que había que mirar a propósito; no avisaba ANTES de la
hora y, pasada, se abría una sola vez por caja y pestaña. Felipe pidió que se vea desde la barra de arriba (donde ya está la
mirada: buscador, Actividad, modo oscuro, sede), que empiece a avisar un cuarto de hora antes y que «insista» cada 5 minutos hasta
que la caja se cierre.

## 2. Decisión

```
DECIDÍ:    una cápsula oscura montada UNA vez en el layout, pero dibujada en el medio de la cabecera (`position: fixed` con la
           misma caja que la barra: `inset-x-0 top-0 sm:left-lateral`, así «el medio» es el de la barra con el lateral abierto o
           plegado). Lleva una luz (LED), el rótulo, un contador de paletas (horas : minutos) y el botón «Cerrar». De ella cuelga
           una pestaña (el «ticket») con el efectivo a cuadrar, el turno y las ventas. Debajo, un resplandor del color del nivel.
           · Aparece 15 min ANTES de la hora de cierre (7:30 p. m. si la tienda cierra a las 7:45) en nivel 1 «Cierra en» y cuenta
             lo que falta; a la hora cuenta lo que pasó. Niveles de siempre: 30 y 60 min → ámbar y rojo.
           · Desde la hora de cierre y cada 5 minutos redondos (7:45, 7:50, 7:55…), la pestaña se despliega sola hacia abajo, se
             queda 5 s (más si el mouse está encima) y se pliega; hasta que la caja se cierre.
           · No se quita el nombre de la sede de la pestaña, solo de la cápsula (Felipe: «quita el texto de Tienda Trujillo de
             arriba de Caja sin cerrar»).
DESCARTÉ:  (a) `estadoRecordatorio` con preaviso: el botón «Cerrar caja» de Caja (ADR-0318) cuelga de él y diría «es hora» a
           las 7:30; el preaviso vive en una función aparte (`estadoAviso`); (b) escribir 7:30 y 7:45 en el código: el preaviso es
           `MINUTOS_PREAVISO = 15` sobre `ubicaciones.hora_cierre`, para cualquier tienda; (c) montar la cápsula DENTRO de
           `AppShell`: toca un archivo de 1.200 líneas que no es de este aviso, y la raíz fija copia su caja sin tocarlo;
           (d) abrir la pestaña al cargar la pantalla a mitad de camino: caería encima del trabajo; solo se despliega cuando el
           número de despliegue CRECE (la primera lectura no cuenta); (e) que la pestaña se abra sola en el preaviso: Felipe
           pidió el despliegue «a partir de las 7:45»; de 7:30 a 7:44 solo está la cápsula, y se abre al tocarla.
SE ROMPE SI: la barra no tiene sitio. Por eso la cápsula mide el hueco real de la barra y se achica por tramos (ver §3); si ni el
           más chico cabe, cuelga justo bajo la cabecera.
```

## 3. Las reglas nuevas

| Regla | Dónde vive |
|---|---|
| **Preaviso:** nivel 1 con `previo` entre −15 y −1 min; el rótulo dice «Cierra en» y las paletas cuentan lo que falta (`-minutos`) | `lib/recordatorio-cierre-reglas.ts:estadoAviso`, `MINUTOS_PREAVISO` |
| **Despliegue cada 5 min:** `cicloDeDespliegue(minutos)` = −1 antes de la hora y `⌊minutos / 5⌋` desde ella; la pestaña baja cuando ese número crece. Pasado un día, deja de contar sola | `cicloDeDespliegue`, `MINUTOS_ENTRE_DESPLIEGUES`; efecto en el componente |
| **El reloj es de 5 s** (antes 15): la pestaña baja a la hora y no hasta 15 s después | `TICK_MS` |
| **Un clic fuera pliega la pestaña** (no hay ✕: el aviso no se descarta, solo se guarda) | `RecordatorioCierreCaja.tsx` |
| **Responsive medido, no adivinado:** el componente mide el hueco real entre el último elemento a la izquierda del centro de la cabecera y el primero a la derecha (`data-cabecera-app` en `AppShell`), y elige el tramo más completo que cabe: 0 todo · 1 sin botón «Cerrar» · 2 sin «h : min» · 3 solo luz y paletas · 4 lo mismo, más apretado · 5 colgando bajo la cabecera si ni eso cabe. Se vuelve a medir al cambiar de pantalla, de tamaño o de contenido; nunca tapa un botón (en celular tapaba «Actividad» con los cortes por ancho de la primera versión) | `medirHueco` en `RecordatorioCierreCaja.tsx`, `data-tramo` en el CSS |
| **Siempre oscura** en claro y oscuro (`papel-fijo`), con filo `crema` al 14 % para verse sobre una barra oscura | `recordatorio-cierre.css` |
| **Resplandor** del color del nivel: 190 px en azul, 340 en ámbar, **600 en rojo y más intenso** (Felipe). En celular, 200 / 240 / 300 y más suave: no puede lavar el cobro de Vender (PL-105) | `.rcc-aurora` |

## 4. El movimiento (ADR-0136, actualización 2026-10-06 (b))

Es dato: las paletas giran solo cuando cambia su dígito (220 + 260 ms, sin rebote), la pestaña baja por el despliegue, la barra del
turno se llena, la cifra del efectivo cuenta. Desde la hora de cierre la cápsula **emite ondas sin parar** (las mismas de cuando sube de nivel: dos anillos desfasados, 2,6 s en azul,
2,3 en ámbar y 1,9 en rojo; pedido de Felipe el 2026-10-06; no hay en el preaviso): dicen «ya es la hora» y se apagan al cerrar la caja.
Los otros **adornos en bucle** son los que Felipe vio en la maqueta 3 y eligió: el
resplandor que deriva lento (8 s) y un destello que cruza la cápsula cada 6 s en «sin cerrar»; más el punto que late (ya admitido).
Con `prefers-reduced-motion` todo pasa en un instante.

## 5. Lo que se probó y lo que no

- Probado: `lib/recordatorio-cierre-reglas.test.ts` (preaviso, ciclo, textos; 31 pruebas con las de `caja-cierre-boton-reglas`),
  tipos, lint, y en el navegador contra la base local (Tienda Trujillo con la hora de cierre movida): el preaviso, los tres
  niveles, el despliegue a las `:00` del minuto 15 (se abrió solo y se plegó a los 5 s), la pestaña, el modo oscuro y 375 px.
- **Sin probar:** la despedida («Caja cerrada», ✓ verde) con una caja cerrada de verdad (no se cerró la caja de la base
  compartida); el escenario del auditor del modo oscuro (`tema/escenarios/registro.mjs`, `estructura.recordatorio`) se actualizó a las
  clases nuevas pero no se corrió; Caja/Devoluciones/Cambios a 375 px.
