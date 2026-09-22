# «Quién vendió» en el ticket del Punto de venta — diseño

> **Reemplazado el 2026-09-22** (ADR-0163): la columna es `ventas.asesora_id` y la lista sale de la asistencia de Dynamic, no de un interruptor del líder. Se conserva como historia.

**Fecha:** 2026-09-21 · **Estado:** diseño aprobado en el chat el 2026-09-21; falta la revisión de este documento.
**Rama:** `claude/pos-ticket-seller-selection-95d5b3` · **ADR:** pendiente (el número se toma al cerrar, mirando las ramas remotas; el «siguiente libre» de `main` ya chocó varias veces).
**Siguiente paso:** el plan de implementación (`superpowers:writing-plans`).

## 1. Qué se construye y por qué

En Tienda TRU hay varias colaboradoras y **un solo equipo de caja**. Hoy `ventas.usuario_id` es la persona de la **sesión** que cobró (la RPC lo saca de `auth.uid()`; no viaja desde el navegador), así que todas las ventas del equipo salen a nombre de quien tenga la sesión abierta. Nadie puede saber quién atendió a la clienta, y ni la boleta ni el ticket lo dicen.

Se agrega, en el apartado del ticket del Punto de venta, una **fila de chips con el nombre** de las colaboradoras que atienden en caja: se toca una, sin abrir ningún desplegable. Quién vendió queda guardado en la venta y se imprime en el ticket térmico y en la boleta A4.

## 2. Decisiones tomadas

| Tema | Decisión | Por qué |
|---|---|---|
| Cómo se elige | Chips con el primer nombre (`nombresCortos`), no un desplegable. **Sin preselección**: Cobrar queda bloqueado hasta tocar uno y la fila se limpia tras cobrar. (Usuario, 2026-09-21) | Una venta nunca se atribuye a la persona equivocada; cuesta 1 toque por venta, menos que escanear una prenda. |
| Quién aparece | Solo las colaboradoras **marcadas «atiende en caja»** (interruptor que cambia un líder). (Usuario, 2026-09-21) | En producción TRU tiene **11** colaboradoras activas con login y solo 6 venden; la fila debe mostrar exactamente las que venden. |
| Dónde vive el interruptor | En el propio Punto de venta, visible solo para un líder (un `<Modal>` con casillas), **no** en `/colaboradores`. | Otra sesión (`colaboradores-rediseno`) está reescribiendo `/colaboradores`; ahí habría choque. Se puede mover luego. |
| Sede sin ninguna marcada | La fila no aparece y se vende **como hoy**. | Si no, el día del despliegue nadie en TRU podría cobrar hasta que un líder marque a las 6. Con 1 sola marcada, queda elegida sola. |
| Dónde se guarda | Columna nueva `ventas.vendedora_id`, **además de** `usuario_id`. | La sesión sigue siendo la auditoría de quién operó el equipo (caja, anulaciones); `vendedora_id` dice quién atendió. Sobrescribir `usuario_id` perdería esa auditoría. |
| Alcance fiscal | Solo cambia el **diseño impreso**. No toca lo que se envía a SUNAT/Nubefact. | El nombre de la colaboradora no es dato del comprobante electrónico. |

## 3. Diseño

### 3.1 Base (una migración, sin prefijo `retail.` en el archivo)

- `colaboradores.atiende_en_caja boolean not null default false`.
- `ventas.vendedora_id uuid null references personas(id)`.
- `registrar_venta(…, p_vendedora_id uuid default null)`: **drop + create de la firma** (dos sobrecargas a la vez ya tumbaron `/productos` una vez). Si `p_vendedora_id` viene, debe ser colaboradora **de esa sede** (`colaboradores.persona_id = p_vendedora_id and ubicacion_asignada_id = p_ubicacion_id`). **No** exige el interruptor ni el estado al subir: una venta guardada offline no debe perderse porque un líder la desmarcó entre tanto. `null` sigue siendo válido (cola offline ya guardada; equipos que aún no recargaron).
- `fn_vendedoras_de_sede(p_ubicacion_id)`, `security definer`: lista `(persona_id, nombre)` de las **marcadas y activas** de la sede, para cualquier sesión que pueda operar esa sede. Hace falta porque `colaboradores` solo la lee un líder (RLS) y una sesión de colaboradora no vería a sus compañeras. El prefijo `fn_` ya está en la lista de lecturas de `lib/espera-reglas.ts`, así que el loader global no bloquea la pantalla.
- `marcar_atiende_en_caja(p_persona_id, p_atiende bool)`: exige `fn_es_lider()`.
- `fn_ventas_del_dia`: `vendedor` pasa a `vendedora ?? usuario`, **misma firma**, partiendo del cuerpo vigente (`20260921103000`) y no de una copia vieja (la leen Caja, Vender y Facturación).
- Migración a producción: **solo con OK explícito de Felipe para esa migración**, con la receta de verificación por huella (`docs/datos/generado/COMO-REFRESCAR.md`).

### 3.2 Punto de venta

- Estado `vendedoraId` en `PuntoDeVenta.tsx`; la fila de chips va arriba del ticket, en `PuntoDeVentaTicket.tsx`.
- `motivoBloqueoCobro` (`lib/vender-reglas.ts`, puro y con pruebas) gana `vendedoraFalta` → «Elige quién atendió a la clienta.» Solo aplica si la sede tiene 2 o más marcadas.
- `p_vendedora_id` entra en `ParamsRegistrarVenta` (`lib/ventas-offline.ts`); la cola offline lo lleva sin más cambios.
- `TicketEnEspera` guarda también `vendedoraId` (opcional: un ticket en espera anterior no lo trae).
- Si la elegida deja de estar en la fila mientras el ticket sigue armado (la desmarcaron o suspendieron), se limpia y se pide elegir de nuevo.
- El interruptor: un enlace «Elegir quiénes atienden», solo para líderes, abre un `<Modal>` (ADR-0136) con casillas → `marcar_atiende_en_caja`.

### 3.3 Impresos

- `ReciboVenta` (`lib/recibo-reglas.ts`) gana `atendio: string | null`; `ReciboTermico` imprime «Atendió: María» (nombre corto) bajo fecha y hora.
- `BoletaA4` ya recibe `vendedor`. `leerVentaDetalle` / `DetalleVentaModal` pasan `vendedora ?? usuario`, así la reimpresión desde el historial trae el mismo dato.

### 3.4 Reportes

El filtro «vendedor» del historial (`lib/ventas-historial.ts`, hoy `usuario_id`) y «Ventas de hoy» cuentan a la vendedora si existe y, si no, a la sesión. Es una línea en `vender/historial/page.tsx`, que otra sesión también toca.

## 4. Casos borde

| Caso | Resultado |
|---|---|
| Sede con 0 marcadas | Sin fila; se vende como hoy (`vendedora_id` vacío). |
| Sede con 1 marcada | Queda elegida sola; no se pide tocar nada. |
| Marcada pero suspendida o inactiva | No aparece (la función solo lista activas). |
| Líder que atiende en mostrador | No aparece en la fila en v1: los líderes no tienen sede asignada. Sus ventas quedan a nombre de la sesión. |
| Equipo sin recargar tras el despliegue / cola offline vieja | Llega `null`: válido, sale a nombre de la sesión. |
| Vendedora de otra sede | La RPC lo rechaza. |
| Anulación o devolución | Sin cambio: la venta conserva su `vendedora_id`. |

## 5. Fuera de alcance

Comisiones o metas por vendedora, PIN por colaboradora, líderes como vendedoras, reescribir ventas anteriores, y mover el interruptor a `/colaboradores`.

## 6. Verificación

- Pruebas puras: la regla de bloqueo (0, 1 y ≥2 marcadas; con y sin elección) y el armado del recibo con y sin `atendio`.
- Script en `scripts/pruebas/` contra el Postgres local: vendedora de otra sede rechazada, `null` aceptado, elegida correcta guardada, `fn_vendedoras_de_sede` solo lista marcadas y activas, `marcar_atiende_en_caja` rechaza a quien no es líder. Se aplica la migración con `psql` dentro de una transacción con ROLLBACK, no con `migration up`.
- Navegador con datos locales: elegir, cobrar, ver «Atendió:» en el modal, en el ticket impreso (PDF real) y en la reimpresión desde el historial.
- Después, con OK explícito, pegar la migración en producción y verificar por huella.

## 7. Coordinación y riesgos

- `docs/SESIONES-ACTIVAS.md`: agregar una fila antes de tocar código. Otras sesiones tocan `PuntoDeVenta*.tsx` (`claude/local-work-3a718a`, `ventas-visual-redesign`) y `/colaboradores` (`colaboradores-rediseno`, `colaboradores-auditoria`). Fusionar `origin/main` antes de empezar y antes de cada push.
- Producción: `retail.registrar_venta` mueve dinero; el cambio de firma es el punto de mayor riesgo y se pega solo con OK explícito y verificación de una única sobrecarga en `pg_proc`.

## 8. Ajustes descubiertos al escribir el plan (2026-09-21)

Ninguno cambia lo aprobado; son consecuencias de leer el código y las migraciones vigentes. Detalle en `docs/superpowers/plans/2026-09-21-vendedora-en-el-ticket.md`.

- **Suspender mueve la fila** de `colaboradores` a `colaboradores_suspendidos` (migración `20260922110000`, ADR-0148). Consecuencias: una suspendida sale de la fila del ticket y, al reactivarla, **vuelve sin la marca** `atiende_en_caja` (un líder la marca otra vez). **Cambiarla de sede apaga la marca** (un trigger), para que no aparezca sola en la otra tienda.
- **`registrar_venta` acepta también a una colaboradora suspendida** de esa sede: una venta guardada sin red no debe perderse porque un líder la suspendió entre que se cobró y se subió. Sigue sin exigir el interruptor.
- **Una tercera función de lectura**, `fn_candidatas_vendedora_de_sede` (solo líder), para el modal «¿Quiénes atienden en caja?»: `fn_vendedoras_de_sede` solo trae las ya marcadas.
- **La lectura degrada con gracia:** si `fn_vendedoras_de_sede` aún no existe en la base (la web desplegada antes que la migración) se vende como siempre; si falla por otra causa, el ticket lo dice. El orden de despliegue sigue siendo **migración primero, web después**.
- **Cuatro sitios del front** resolvían «el vendedor» con `usuario_id` (historial, buscador de Cambios/Devoluciones, detalle de caja y `fn_ventas_del_dia`); los cuatro pasan a `vendedora_id ?? usuario_id`.
- **Permisos:** las funciones nuevas y la `registrar_venta` recreada llevan exactamente los de hoy en local y producción: `{postgres=X/postgres,authenticated=X/postgres}`.
