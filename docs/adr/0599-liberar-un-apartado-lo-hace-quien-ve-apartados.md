# ADR-0599 — Liberar un apartado lo hace quien ve Apartados, y se ofrece desde el detalle de Entregar

- **Fecha:** 2026-11-02 · **Estado:** **construido, sin probar contra Postgres ni en el navegador** (Docker apagado en la sesión). **La migración `20261102152000` NO está en producción.**
- **Decidió:** Felipe, 2026-11-02: «hay que construir el botón para liberar, pero que no solo sea para el líder sino para toda persona que tiene el módulo».
- **Toca:** ADR-0161 (quien ve un módulo hace todo lo que hay en él), ADR-0196 (Apartados, módulo propio). **No toca:** devolver el adelanto (`registrar_devolucion_separacion`), que sigue pidiendo `fn_puede_gestionar_caja` porque es dinero.

## El problema primero

El 2026-10-28 una líder asignada a Arequipa apartó una placa (APT-TRU-0007) con el selector de sede en Trujillo, sin darse cuenta: el apartado, el ajuste de stock de +1 «reposición» y el cobro Yape quedaron en una sede donde la prenda no existía. Dos días después Arequipa vendió esa misma placa al mismo cliente. En Trujillo quedaron una placa fantasma apartada y un adelanto «en custodia» de S/13.90 que no correspondía.

Deshacerlo exige **liberar** el apartado, y no se podía:
- la pantalla solo ofrecía «Liberar» en Historial cuando el apartado ya estaba **vencido** (aquí, después del 04/11, días de espera);
- y la base (`liberar_separacion`) pedía `fn_puede_gestionar_caja()`: líder o quien ve **Caja**. Quien atiende Apartados todos los días no podía corregir su propio error.

## Decisión

DECIDÍ: **liberar lo hace la líder, quien ve Caja (como hasta hoy) y toda cuenta que ve el módulo Apartados.** En la base, `liberar_separacion` pasa a exigir `fn_puede_gestionar_caja() or fn_ve_modulo('apartados')` (reemplazo anclado, migración `20261102152000`). Nada más cambia: sigue pidiendo que la cuenta opere esa tienda, el motivo, que el apartado esté abierto y el responsable firmando.

En la pantalla, «Liberar apartado» (`btn-peligro`, rojo desde el principio) vive en el detalle de **Entregar**, junto a «Editar prendas», para cualquier apartado abierto, no solo vencido. El `LiberarModal` de siempre pide el motivo (venció, el cliente desistió, error al apartar) y el responsable. En Historial, «Liberar» de un vencido deja de depender de `puedeGestionar`; «Aplazar» sí lo sigue pidiendo.

DESCARTÉ:
- **Esperar al vencimiento.** Funciona, pero deja días una prenda inexistente apartada y un cobro en custodia de otra sede.
- **Llamar `liberar_separacion` desde el navegador con la sesión de quien opera.** Se salta la firma del responsable y exige tocar el token de la sesión.
- **Abrir también «Devolver el adelanto» a quien ve Apartados.** Es dinero que sale de la tienda; Felipe no lo pidió, y sigue en manos de quien gestiona la caja.
- **Un botón «mover el apartado a otra sede».** No existe esa operación en la base y el stock no se mueve entre sedes sin traslado.

SE ROMPE SI: alguien libera por apuro un apartado válido. El adelanto queda «por devolver» y el stock se libera, pero ambos son visibles en Historial; deshacerlo es volver a apartar. Si pasa seguido, el siguiente paso es exigir una nota o limitar «Liberar» a quien lo apartó (decisión de Felipe).

## Lo que hay que hacer para el caso real

APT-TRU-0007 no se arregla solo con esta migración: después de publicarla hay que **liberar** el apartado (motivo «Fue un error al apartar»), **registrar el reverso del adelanto** (el cliente pagó una sola vez, ya figura en la venta de Arequipa: sin movimiento de dinero) y **ajustar Trujillo en −1**. Ver `docs/backlog/2026-11-02-liberar-apartado-quien-ve-apartados.md`.
