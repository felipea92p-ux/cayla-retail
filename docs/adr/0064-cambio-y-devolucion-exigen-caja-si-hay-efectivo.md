# ADR-0064 — Cambio y devolución exigen caja abierta si hay efectivo de por medio

**Fecha:** 2026-09-16
**Estado:** Aplicado y probado en local. **No aplicado en producción** — falta el ok
puntual de Felipe antes de pegar `20260916180000_cambio_y_devolucion_exigen_caja_si_hay_efectivo.sql`
(mismo protocolo que ADR-0042/D-11).
**Afecta:** `retail.registrar_cambio` y `retail.aprobar_devolucion` — mismas firmas, sin
columnas ni tablas nuevas.
**Nota de numeración:** puede colisionar con otra sesión concurrente
(`devoluciones-anular-ventas-e282dc`) que también usó 0063/0064 para su propio trabajo —
se resuelve al fusionar ramas, mismo patrón que ya documentó BACKLOG para ADR-0051.

## Contexto

ADR-0052 (devoluciones) y ADR-0053 (cambios) cerraron la fuga principal — la diferencia/
reembolso en efectivo ahora SUMA o RESTA de `cerrar_caja` — pero cada uno dejó escrito, a
propósito, el mismo hueco sin resolver: si no hay caja abierta en la ubicación en el
instante de aprobar/registrar, `caja_id` queda `null`, y ese dinero no entra a NINGÚN
cierre, nunca. La cabecera de `20260915180000_reembolso_en_el_arqueo.sql` lo llama "caso
raro" y lo deja pendiente; la de `20260915200000_diferencia_de_cambio_en_el_arqueo.sql`
dice lo mismo con las mismas palabras.

Encontrado al auditar el módulo Cambios a pedido de Felipe (sesión de pruebas
automatizadas, mismo día) — no había ítem de BACKLOG para esto, vivía solo en los
comentarios de esas dos migraciones.

## Decisión

**DECIDÍ: que ambas RPC exijan una caja abierta ANTES de proceder, pero SOLO cuando de
verdad hay efectivo moviéndose** — mismo mecanismo que `registrar_venta` ya usa para
vender ("No hay una caja abierta en esta ubicación — ábrela antes de..."):

- `registrar_cambio`: rechaza si `v_diferencia <> 0` y `p_metodo_pago_diferencia =
  'efectivo'` y no hay caja abierta. Un cambio sin diferencia, o pagado por tarjeta/yape/
  plin/transferencia, sigue sin necesitar caja — nunca tocó el cajón físico.
- `aprobar_devolucion`: rechaza si `p_reembolso_metodo = 'efectivo'` y
  `p_reembolso_monto > 0` y no hay caja abierta. Una devolución sin reembolso, o
  reembolsada por un método que no es efectivo, sigue sin necesitar caja.

Principio 2 de CLAUDE.md: dinero que salió/entró del cajón sin ninguna caja que lo pueda
absorber es un estado imposible — se corrige en la RPC, no con una validación después del
hecho ni con un reporte que liste "diferencias huérfanas" para que alguien las revise a
mano.

**DESCARTÉ: dejarlo pasar y compensarlo después** (una cola que el próximo `abrir_caja`
recoja). Es más código y un estado nuevo que mantener para un caso que las propias dos ADR
que lo dejaron pendiente ya calificaban de raro. Principio 5: no construir para el volumen
que no llega — si en la operación real esto empieza a bloquear seguido, la señal es que
esa sede necesita abrir caja más temprano, no que el candado esté de más.

**Verificado, no razonado:** 13 escenarios en `scripts/pruebas/registrar_cambio.mjs`
(el nuevo es el #13 — sin caja abierta, una diferencia en efectivo se rechaza con el
mensaje esperado; los 12 anteriores, todos los que no involucran efectivo sin caja, siguen
en verde) y 2 en el nuevo `scripts/pruebas/aprobar_devolucion_caja.mjs` (rechaza con
efectivo sin caja; sigue funcionando sin caja cuando no hay reembolso). Los dos scripts
corren con `pnpm pruebas:registrar-cambio` / `pnpm pruebas:aprobar-devolucion-caja`
(mismo patrón psql + rollback de ADR-0063). `typecheck`/`lint` limpios.

## Se rompe si

Una colaboradora intenta cobrar o devolver una diferencia en efectivo en Cambios, o un
líder intenta aprobar un reembolso en efectivo en Devoluciones, sin abrir la caja primero
— sale el mismo tipo de error que ya sale al intentar vender sin caja abierta. La
respuesta correcta es abrir la caja, no relajar el candado.

## Lo que falta

1. **Aplicar en producción** — falta el ok puntual de Felipe antes de pegar
   `20260916180000_cambio_y_devolucion_exigen_caja_si_hay_efectivo.sql` (con
   `set search_path = retail, public, extensions;` o el prefijo `retail.` en el SQL
   Editor, como manda CLAUDE.md).
2. **Reconciliar el número de ADR** al fusionar con la rama de
   `devoluciones-anular-ventas-e282dc` (ver nota de numeración arriba).
