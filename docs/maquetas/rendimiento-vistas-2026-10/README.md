# Rendimiento e Inicio de la integrante: cuatro vistas cada uno (spike, 2026-10-03)

Dos archivos autocontenidos (se abren en el navegador). **Datos inventados.** No tocan la web ni la base. La barra oscura de arriba
(variante, rol, hora, ancho) no existe en el ERP. Extienden `../rendimiento-meta-2026-09/` (ADR-0318, D-142 a D-160).

| Archivo | Pregunta que responde |
|---|---|
| `rendimiento-vistas.html` | ¿Cómo mostrar las tres tiendas? A · pestañas por tienda (idea de Felipe) · B · tienda activa + las otras al costado · C · tablero de la cadena · D · día en vivo, hora a hora |
| `inicio-colaboradora-vistas.html` | ¿Cómo le decimos a la integrante «cómo voy»? A · anillo del día · B · mi turno en línea · C · mi mes en calendario · D · reconocer |

## Qué se puede probar
- **Rendimiento:** Ver como Admin o Líder (la líder no ve pestañas: ve una sola tienda); «Sesión activa en» cambia qué tienda abre primero;
  Hoy · Semana · Mes; 11:00 a. m. y 5:40 p. m.; celular a 375 px; y tres medidas candidatas (proyección del mes, ventas por hora, prendas por venta).
  En A, tocar una pestaña que no se había visto simula la carga de esa tienda (solo se pide lo que se mira).
- **Inicio:** momento del día (9:30, 1:00, 5:40), «Meta superada», «Sin meta aún» (el Inicio queda como hoy y lo dice) y celular o computadora.
  En C se toca un día del calendario.

## Reglas que ninguna variante rompe
Reconocer y acompañar, sin dinero ni bono (D-65, D-112) · la integrante ve solo lo suyo y nunca a una compañera (D-149; el top 3 de D-66 sigue en pausa) ·
las devoluciones no restan (D-79) · sin rojo para juzgar: «Adelante / En ritmo / Por debajo».

## Lo que NO existe hoy y las variantes suponen
- Ventas con la **hora de cada venta**, por persona (B del Inicio, D de Rendimiento).
- «El ticket subió X % frente al mes pasado» (D del Inicio): no hay lectura que compare meses.
- La curva «cómo suele ir un día normal» sale de ventas históricas por hora de la tienda: hoy el «ritmo esperado» es solo la parte del turno que pasó.

## Propuesta final (Felipe, 2026-10-03)
- `rendimiento-final.html`: variante **A** (pestañas por tienda, abre en la de la sesión, comparativo arriba) con las tres medidas siempre visibles: proyección del mes, ventas por hora y prendas por venta.
- `inicio-final.html`: **anillo del día** + **«Lo que va bien»** + «Tu mes» (con el próximo hito dicho en días de su promedio). Accesos: «Nuevo producto» entra en lugar de «Apartados» para quien puede dar de alta productos; sin ese permiso queda «Apartados».

Qué datos hay hoy para construirlo: el Inicio entero sale de `fn_mis_ventas_por_dia` (día, total, ventas) y `fn_mi_meta` (mejor día, racha, ticket contra el mes pasado). En Rendimiento, la proyección sale de `fn_rendimiento_serie`.
**Falta una lectura nueva** para «ventas por hora» (`ventas.created_at` existe, nadie la devuelve por hora) y para «prendas por venta» de la tienda (`fn_rendimiento_equipo` no trae prendas).

### Propuesta final con notas en «!» (2026-10-03, segunda versión de `rendimiento-final.html`)
Las notas explicativas pasan a un «!» como en Productos: uno en la cabecera («Cómo se lee Rendimiento») y uno junto a cada título de ranking. Se agregó la sección «Rankings del mes» con el orden nuevo (opción C): el
número que se muestra es el corregido, el orden sale de lo que podemos asegurar de él. «Mostrar la cota del ranking» (solo del demo) enseña por qué Lucía, con 8 ventas y un número alto, queda al final.
