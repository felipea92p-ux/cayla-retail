# ADR-0318 — El botón «Cerrar caja» se nota

**Fecha:** 2026-10-03 · **Estado:** construido y probado en local (escritorio); sin migración · **Decide:** Felipe (que el
botón sea notorio, no un recordatorio) · **Rama:** `claude/box-design-improvement-443039` · **Maqueta:** `docs/maquetas/caja-comparativa-2026-10/`

## 1. El problema, primero
Las vendedoras se olvidan de cerrar la caja. El botón de la cabecera era `Boton primario` (oscuro, igual a cualquier otro) y
al terminar el turno nada en Caja lo distinguía. La «Isla» (ADR-0305) avisa desde otras pantallas, pero hoy no puede
aparecer: `ubicaciones.hora_cierre` está vacía en las tres tiendas (consultado en producción el 2026-10-02).

## 2. Decisión
```
DECIDÍ:    el propio botón es notorio todo el día, y sube de nivel con la hora de cierre de la tienda.
           · Cabecera: botón grande, rojo, con candado y «Abierta hace N h» debajo.
           · Escritorio: barra pegada al borde de abajo con el mismo botón; neutra antes de la hora, tinta al llegar la hora,
             rojo profundo a los 30 min. Un destello al subir de nivel.
           · Celular: el cuadrado «Cerrar» de la barra fija va en rojo.
           · Quien no puede cerrar ve el aviso «avisa a un líder», sin botón.
DESCARTÉ:  (a) otro recordatorio flotante (ya existe la Isla); (b) inventar cortes propios: se reusa `estadoRecordatorio`
           (30 min) para que las dos piezas no discrepen; (c) un bucle o latido: ADR-0136 solo permite un destello al cambiar.
SE ROMPE SI: la tienda no tiene `hora_cierre` → el botón sigue notorio pero no sube de nivel. La Isla y esta barra comparten
           ese dato: hay que cargarlo en Configuración ▸ Tiendas y caja.
```
Lógica pura y probada: `lib/caja-cierre-boton-reglas.ts` (7 pruebas). Piezas: `components/BarraCierreCaja.tsx`,
`app/estilos/caja-cierre.css`. La Isla mide `sticky` además de `fixed` para no taparse con esta barra.

## 3. Pendiente
- Rojo de acento: la regla pide máximo 2 por pantalla; el botón suma uno. Revisar el «ahora» rojo si se rediseña el gráfico.
- No probado: celular a 375 px (el panel no mantuvo el ancho), cuenta real, y `hora_cierre` real.
- El rediseño con comparativa vs ayer sigue solo en maqueta (falta la lectura `fn_comparativa_caja` y elegir diseño).
