# ADR-0459 — El programa de puntos del Club CAYLA

- **Fecha:** 2026-10-19 · **Estado:** construido en la rama `claude/cayla-points-loyalty-d8d7d5` y probado en local; **nada pegado en producción** (cada migración espera el OK de Felipe) y **los Términos esperan al abogado**.
- **Relacionados:** ADR-0288 (el Club y sus avisos), ADR-0438 (tienda sin cuenta; Club al separar), ADR-0408 (pedidos web), ADR-0253 (módulos delegables), ADR-0161/0162 (responsable), ADR-0413 (montos sin corte). Maqueta: `docs/maquetas/puntos-2026-10/`. Texto legal: `docs/club/texto-legal-puntos-v1-borrador.md` (borrador para el abogado).

## El problema

El Club daba dos beneficios sueltos: un 10 % en una compra del mes de cumpleaños y un vale de aniversario que dependía de cuánto se compró en el año. Ninguno premiaba
volver a comprar, los dos se explicaban mal en caja («¿y el vale de cuánto es?») y el vale no se podía usar en la tienda web. Además, al crear una ficha se le ligaban
TODAS las boletas viejas con su mismo DNI (CL-27): un cliente se encontraba con un historial que no había aceptado compartir.

## Lo que decidió Felipe

1. **1 punto por cada S/ 1 pagado; 100 puntos valen S/ 5.** Se canjea desde 200, de a 100. Lo calcula la base desde la venta guardada (`fn_club_puntos_por_venta`), no la caja.
2. **El canje da un cupón con código `CAY-XXXX-XXXX`, al portador, de un solo uso, que dura 7 días.** Si vence sin usarse, los puntos vuelven al saldo. Nunca hay dos cupones con el mismo código (índice único + clave por toque + bloqueo de fila). La compra mínima es 3× el valor del cupón y el cupón nunca cubre toda la compra; no vale con prendas de liquidación.
3. **En caja:** «Usar puntos» (el miembro del ticket) y «Código de cupón» (cualquiera que lo traiga). El ticket dice cuántos puntos gana la compra.
4. **Regalo de cumpleaños: 100 puntos con la primera compra del mes de cumpleaños**, en tienda o en la web. Si se anula esa venta, el regalo se revierte y vuelve a estar disponible.
5. **Se retiran** el 10 % de cumpleaños, el vale de aniversario y el ligado retroactivo de boletas: el historial y los puntos cuentan desde el registro. `registrar_venta` rechaza los canjes viejos (`beneficio_retirado`).
6. **Módulo nuevo «Beneficios del club»** (Clientes): cuánto vale un punto, desde cuántos se canjea, la compra mínima, los días del cupón y el regalo, con lo que cuesta al negocio. Un cambio de lo que valen los puntos o del canje mínimo **rige 15 días después** (se avisa); lo demás, desde hoy. Delegable (ADR-0253): nace solo para el líder.
7. **Conservación: a los 3 años sin compras se eliminan los datos y los puntos** (`fn_club_anonimizar_inactivas`, que usa la misma fecha que «Mi Club»). 30 días antes, quien autorizó WhatsApp recibe el aviso «Puntos por vencer» en Clientes ▸ Avisos.
8. **El DNI de la boleta nunca registra a nadie:** un cliente entra al Club solo por «Agregar cliente», el cartel o la tienda web.
9. **En la web, el cupón se reserva al separar el pedido:** el total nace rebajado, el cupón queda reservado (nadie más lo usa), se consume al venderse y se libera si el pedido se anula, vence o no se confirma.

## Cómo quedó (base)

- `club_puntos_movimientos` es de solo agregar (compra, cumple, canje, devuelve, revierte, ajuste, pierde); `club_puntos_saldos` es su derivado y nadie lo edita. Toda reversa es un movimiento nuevo que apunta al que revierte.
- `club_puntos_config` guarda versiones con `rige_desde`: `fn_club_puntos_config(fecha)` da la vigente en una fecha.
- `club_cupones` solo cambia de estado (activo → usado | vencido; usado → activo | vencido al anular la venta); un disparador de guardas lo impide de otra forma. Leer libera lo vencido.
- Anular una venta o aprobar una devolución revierte sus puntos y devuelve su cupón por disparadores que **no pueden tumbar la anulación**.
- Las funciones vivas se tocaron con reemplazos anclados idempotentes (`pg_temp.reemplazar`) o, si se reescriben enteras, con candado de md5 de su cuerpo en producción.

Migraciones, en el orden en que se pegan: `20261019201000` base · `202000` ganar · `203000` cupones · `204000` cobrar con cupón · `205000` resumen de caja ·
`213000` Mi Club en la tienda · `215000` módulo «Beneficios del club» · `220000` conservación · `221000` retira 10 %, vale y ligado · `222000` cartel y avisos ·
`224000` pedido web (en construcción). Cada una lleva `set lock_timeout = '3s'` y es idempotente.

## Descarté

- **Puntos que vencen por fecha:** Felipe prefirió que no venzan mientras se compre; los elimina solo la conservación de 3 años.
- **Un `unique` para el regalo de cumpleaños:** no dejaría volver a darlo tras anular la venta. Se controla con «uno vivo por año» (los revertidos no cuentan).
- **Que la caja mande los puntos que gana:** la caja puede equivocarse o ir sin conexión; la base los calcula desde la venta.
- **Aplicar el cupón web recién al pagar:** el cliente vería un total que cambia después de separar. Se reserva al separar.
- **Publicar los Términos nuevos en `club_textos`:** esperan al abogado (`docs/club/club_textos-v3-para-pegar-tras-el-abogado.sql`).

## Lo que queda (de Felipe)

- El retorno nominal es 5 % y el Club tenía un tope de 2 %: decidir cuánto margen se dedica.
- Abogado (Términos y Política) y contador (los puntos pendientes como deuda).
- El OK para pegar cada migración en producción, en el orden de arriba, y el día del lanzamiento el borrado de las fichas de prueba (con ensayo antes).
