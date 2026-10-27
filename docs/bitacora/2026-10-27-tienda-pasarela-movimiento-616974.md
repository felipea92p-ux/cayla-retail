# 2026-10-27 · Tienda «G · Pasarela»: paquete 1 de movimiento (rama tienda-pasarela-movimiento-616974)

- **Qué quedó:** las 4 animaciones del paquete 1 del traspaso (`PASARELA-PENDIENTES.md`, en la rama del PR #1386): transiciones de talla y opción de entrega a .35 s;
  entrada de la ficha (foto que se descubre de arriba abajo, panel en cascada, solo al cargar); revelado al bajar por tiempo (títulos que cierran su espaciado);
  cortina de las fotos de la grilla escalonada por columna con el pie después.
- **Decisión de Felipe (2026-10-27):** las actividades 1 y 2 van por tiempo con un `IntersectionObserver` mínimo (`components/RevelaAlBajar.tsx`), no atadas al scroll
  con `view()`: el `view()` avanza con el dedo y no calza con los 1–1,6 s de la maqueta. Sustituye al viejo `t-revela`.
- **Cómo no esconde nada por error:** solo lo que está bajo el pliegue espera; sin JavaScript o con «reducir movimiento» todo se ve.
- **Verificado:** pruebas (980), tsc, eslint, knip; en el navegador, cada animación. **Falta:** captura a 1440 y 375 px en claro y oscuro de cada una (barrido
  final), la cortina de la ficha con una foto real (la base local no tiene fotos en esas prendas), y `.t-top` (carril de «Más vendidos») sin cortina a propósito.
