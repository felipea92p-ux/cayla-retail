# ADR-0319 — Caja compara hoy contra ayer

**Fecha:** 2026-10-03 · **Estado:** construido y probado en local (escritorio, datos inventados); **migración sin pegar en producción** ·
**Decide:** Felipe (diseño A de la maqueta; sin metas diarias: la meta es ayer; siempre día completo; siempre contra ayer) ·
**Maqueta:** `docs/maquetas/caja-comparativa-2026-10/` · **Rama:** `claude/box-design-improvement-443039`

## 1. El problema, primero
Caja decía cuánto había en el cajón y cuánto se cobró, pero no si el día iba bien o mal. Para saberlo hacía falta acordarse de ayer.

## 2. Decisión
```
DECIDÓ:    Caja abre con un titular («Llevas 41 % de lo que vendió ayer»), un anillo, el gráfico de venta acumulada de hoy contra
           ayer con la brecha sombreada, «Cómo te pagaron» y «Dónde ganas y dónde pierdes» (hora por hora). Se recalcula cada minuto.
           La meta es el día completo de ayer: se retiran la tarjeta «Meta de hoy», «Ritmo del turno» y «Cobrado en el turno».
           Se conserva «Al cerrar» (el fondo del cierre no es la meta).
BASE:      `retail.fn_comparativa_caja(p_ubicacion_id, p_dia)`: un pago por fila con el minuto de Lima. Solo lectura, sin tocar tablas.
           Sin ventas anuladas; todas las cajas de la sede ese día; líder (cualquier sede) o la sede de la cuenta.
DESCARTÉ:  (a) prorratear la hora en curso: se compara por minutos reales (a las 15:10, 15:00–15:10 de hoy contra 15:00–15:10 de ayer);
           (b) comparar el cajón: es un estado, no un resultado del día; (c) rojo para «aún no llegas»: es ámbar (informativo).
SE ROMPE SI: la base no tiene la función → `getPagosDelDia` devuelve null y Caja se ve como antes (respaldo, nunca se cae).
           «Vendido» aquí es la suma de pagos, no de ítems: puede diferir en el redondeo (ADR-0311) de lo que muestra Vender.
```
Lógica pura y probada: `lib/caja-comparativa-reglas.ts` (16 pruebas). UI: `components/CajaComparativa.tsx`, `app/estilos/caja-comparativa.css`.
Además se corrigió `useCountUp`: en desarrollo (React corre el efecto dos veces) la cifra se quedaba en 0.

## 3. Pendiente
- **Pegar la migración `20261003230000_comparativa_de_caja_ventas_del_dia.sql` en producción** (pide tu OK; es una función nueva, sin alter de tablas). Hasta entonces Caja usa el diseño anterior.
- No probado: celular a 375 px, cuenta real, el tic de cada minuto sobre datos reales, la función contra Postgres (no hay `psql` en esta máquina).
- Quién ve la comparación: hoy todo el que ve Caja (como el cajón, ADR-0226). Decisión abierta.
- Rojo de acento: botón de cierre + «ahora» ya no es rojo en el gráfico real (tinta).
