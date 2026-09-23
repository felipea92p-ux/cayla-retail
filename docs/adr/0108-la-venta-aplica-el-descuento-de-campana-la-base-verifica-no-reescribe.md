# ADR-0108 — La venta aplica el descuento de campaña: la caja lo calcula, la base lo verifica

**Fecha:** 2026-09-18
**Estado:** Construido. SQL probado en un Postgres de prueba (25 escenarios + 2 candados de
esquema); reglas de la caja con pruebas (579 en total) y pantallas verificadas en navegador
sin base. **NO en producción**: falta pegar
`20260918170000_venta_aplica_descuento_de_campana.sql`, que cambia `registrar_venta`.
**Afecta:** `registrar_venta` (misma firma de 11 parámetros), `venta_items`
(`descuento_etiqueta_id`, motivo `campana`), funciones nuevas `fn_hoy_lima`,
`fn_campanas_por_variante`, `campanas_vigentes`; `PuntoDeVenta*.tsx`, `vender-reglas.ts`,
`error-escritura.ts`, `/vender`, modal de campaña. Continúa ADR-0107.

## Decisión

DECIDÍ: la caja calcula el descuento de campaña y lo manda con motivo `campana` y el id de la
etiqueta; `registrar_venta` lo **verifica** contra la misma regla y rechaza lo que no cuadre.
La regla vive UNA vez, en SQL (`fn_campanas_por_variante`), y la leen la caja
(`campanas_vigentes()`) y la base — no hay una copia en TypeScript que se pueda desincronizar.

DESCARTÉ: que la base reescriba el descuento por su cuenta. Los pagos que suma la caja y el
comprobante SUNAT (que guarda las líneas tal como llegan) ya vienen con el descuento; cambiarlo
en la base dejaba ticket, pagos y comprobante con tres números distintos. Esto **ajusta** lo
escrito en ADR-0107 («la base calcula, el navegador no manda el %»): el navegador manda el
monto, pero la base decide si es válido.

Reglas (Felipe, 2026-09-18):
- **Un descuento por prenda: el mayor** entre las campañas que la alcanzan (etiqueta a mano o
  categoría). Desempate: mayor %, luego nombre, luego id — igual en caja y base.
- **La campaña no pide código, motivo escrito ni argumento.** Un descuento manual solo vale si
  la supera (entonces sigue todas las reglas manuales). El tope del código es de la línea
  completa: una colaboradora no puede «mejorar» una campaña salvo que su código permita más.
- **Sin límite propio para la campaña:** puede pasar de 35 % y bajar del costo (una
  liquidación). El aviso de costo vive donde decide el Líder: el modal marca en rojo el
  descuento y dice «Por debajo del costo: N prendas». No bloquea.
- **Fecha de Lima**, no `current_date` (UTC): pasadas las 7 pm una campaña que termina hoy
  dejaba de aplicarse con la tienda abierta. De paso, la vigencia de `codigos_descuento` en
  `registrar_venta` pasa a la misma fecha (era el mismo defecto).
- **Venta sin red:** la base ACEPTA una campaña terminada hace hasta 3 días
  (`c_tolerancia_campana`) para no perder una venta física que se sube tarde. Lo que se
  EXIGE (`venta_campana_omitida`) sigue siendo solo lo vigente hoy.

Estados imposibles cerrados en el esquema: `venta_items_campana_coherente` (motivo `campana` ⇔
hay etiqueta; un descuento «de campaña» sin etiqueta no se puede auditar).

SE ROMPE SI: (1) se configura una campaña antes de pegar el SQL y desplegar la caja nueva — con
la caja vieja, una prenda en campaña se rechaza en el mostrador (`venta_campana_omitida`). Orden:
pegar SQL → desplegar → configurar. (2) Se abusa de la tolerancia de 3 días con una caja
manipulada: `descuento_etiqueta_id` + `ventas.created_at` permiten auditarlo; el paso siguiente
sería mandar la fecha de la venta (firma nueva de `registrar_venta`).

## No cubre
`registrar_cambio` (cambio de prenda) y `liquidar_prenda_danada` escriben `venta_items` por su
lado y no aplican campañas. Un ticket en espera se pone al día al retomarlo (`conCampanas`);
una campaña que empieza con el ticket ya armado se rechaza al cobrar con la frase «recarga
Vender» — no se re-evalúa sola en pantalla.

## Actualización 2026-09-23 — el monto baja al .90 (ADR-0182)
El descuento de campaña ya no es `round(precio × % / 100, 2)`: el precio rebajado se redondea hacia abajo a .90 con una sola regla, `retail.fn_descuento_campana` en la base y `descuentoDeCampana` en la caja, verificadas iguales al céntimo. Lo demás de este ADR (la caja calcula, la base verifica, un solo descuento por prenda, el mayor) no cambia.
