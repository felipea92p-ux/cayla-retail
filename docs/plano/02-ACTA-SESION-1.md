# Acta de la Sesión 1 — Negocio + Glosario (PL-25 a PL-53)

> **Fecha:** 2026-09-22 · **Quién decide:** Felipe Alvarez · **De dónde salen:** las 29 preguntas de la
> Sesión 1 del banco (`01-BANCO-PREGUNTAS.md`), frentes «El negocio real» (16) y «Glosario y vocabulario» (13).
> Continúa la numeración de `00-ACTA-24-DECISIONES.md` (que terminó en PL-24).
>
> Tres preguntas se resolvieron con análisis en profundidad, no solo con la opción marcada — verificadas contra
> código y, en dos casos, contra producción en vivo (consultas de solo lectura): **PL-29** (anular venta),
> **PL-48** (corregida en vivo — el análisis inicial estaba mal, se revirtió con evidencia) y **PL-50**
> (comprobante/nota de crédito). Están marcadas abajo.

---

## Bloque A — El negocio real (PL-25 a PL-40)

| # | Decisión |
|---|---|
| PL-25 | **Flete de traslado:** sigue pagando la tienda que recibe, sin excepción. |
| PL-26 | **Umbral de «estancado»:** un solo número para arrancar (30 días), se ajusta por categoría después con las líderes de equipo. |
| PL-27 | **Rol Compras:** nace un nivel de permiso propio — crea/edita proveedor, registra orden y pago; no cierra caja ni ve otras sedes. |
| PL-28 | **Vale/saldo de clienta:** se construye aparte de la nota de crédito SUNAT — un saldo por clienta, con o sin comprobante, canjeable en cualquier compra futura. |
| PL-29 | **Anular venta** *(analizado en profundidad)*: exige **mismo día calendario (hora Lima) Y caja abierta**, comparando `ventas.created_at` — verificado contra el código real que **no hace falta columna nueva en `cajas`** (la pregunta original lo sobrestimaba); basta una línea más en `anular_venta`. |
| PL-30 | **Pago en efectivo ≥ S/2,000 a proveedor (ley 28194):** solo avisa, nunca bloquea. |
| PL-31 | **Orden de compra recibida a medias:** botón «Cerrar con faltante», el líder de equipo confirma que no va a llegar el resto. |
| PL-32 | **Reverso de un pago mal registrado:** solo el líder de equipo, con motivo obligatorio; el pago original queda visible como anulado, nunca se borra. |
| PL-33 | **Estado «confirmada» de una orden de compra:** se usa de verdad — el proveedor confirma antes de que llegue el fardo. |
| PL-34 | **Validar RUC de proveedor:** sí, igual que en Facturación — consulta al padrón, autocompleta, pero se puede guardar sin RUC. |
| PL-35 | **Cuentas bancarias** *(parcial)*: Interbank y BCP quedan confirmadas como las 2 cuentas reales, destino de todo cobro electrónico (POS/Yape/Plin/transferencias). **Pendiente, dueño Felipe, sin fecha:** cuál es Operativa y cuál Reserva, y cómo entran las «otras cuentas» que Felipe usa para mover dinero — no bloquea nada mientras tanto. |
| PL-36 | **Herramientas del Taller** (tijeras, abre ojal): se registran como gasto al comprarlas; se revisa la clasificación con el contador cuando exista Contabilidad completa. |
| PL-37 | **Tope de efectivo en tienda:** sí, un monto por tienda que Felipe define, con aviso cuando el efectivo esperado del día lo supera. |
| PL-38 | **Categorías de gasto:** se cierra ya una lista real (rubros de compra de R-51 + gastos de operación del día a día), sin reabrir Contabilidad completa. |
| PL-39 | **«Eficiencia» del Taller:** significa tela aprovechada — metros consumidos vs. lo que Audaces dice que debía consumir esa corrida. |
| PL-40 | **Caja offline:** se construye abrir/cerrar caja sin internet también, extendiendo el mismo mecanismo que ya protege la venta (ADR-0036). |

**Pendientes que nacen de este bloque:**
- PL-29: una línea nueva en `anular_venta` (comparación de fecha, sin columna nueva).
- PL-35: fijar Operativa/Reserva y resolver las «otras cuentas» — Felipe, sin fecha.
- PL-27, PL-31, PL-32, PL-40: RPCs y niveles de permiso nuevos por construir.

### Reflexión del bloque
- **Lo que ya hacemos bien:** las reglas de negocio (`docs/datos/15-COMO-OPERA-CAYLA.md`) ya traían casi todos los huecos nombrados con su propia cita (R-xx/A-xx) — la mayoría de estas 16 preguntas no hubo que inventarlas, hubo que encontrarlas.
- **Qué podría hacer mejor que yo un integrante:** cualquiera de las líderes de equipo tiene mejor criterio que yo sobre el umbral real de «estancado» por categoría (PL-26) y sobre cuánto efectivo es razonable acumular por tienda (PL-37) — son números de piso de tienda, no de arquitectura.
- **La próxima objeción que quiero escuchar:** si el nivel «Compras» (PL-27) resulta ser, en la práctica, casi idéntico a Líder de equipo salvo por dos permisos — en ese caso construir un rol nuevo fue sobre-ingeniería y debí decirlo antes.

---

## Bloque B — Glosario y vocabulario canónico (PL-41 a PL-53)

| # | Decisión |
|---|---|
| PL-41 | **Sede vs. Ubicación en pantalla:** «Sede» gana en toda pantalla cara al colaborador. |
| PL-42 | **Colaborador vs. Integrante en pantalla:** «Integrante» gana en toda pantalla. |
| PL-43 | **Rol en código y base:** se migra `colaboradores.rol` de `'colaborador'` a `'integrante'` en producción (25 colaboradores reales) y se corrigen los 83 archivos que aún tipan `'lider'\|'integrante'` a mano — sigue el proceso de PL-10/PL-11 (PR+CI, Felipe + segundo pegador), no se hace en el chat. |
| PL-44 | **Palabra paraguas para las 4 sedes:** «Sede» incluye al Taller; «tienda» se reserva para las 3 que venden. |
| PL-45 | **Códigos LIM/003 de Dynamic:** nunca se muestran a un colaborador — se enmascaran (siempre «Tienda Lima»/«Taller» completos); la integración con Dynamic no se toca. |
| PL-46 | **OTRU (Oficina Trujillo):** queda fuera del glosario de retail; se documenta solo en el contrato con Dynamic. |
| PL-47 | **«Encargada»:** se corrige a «Líder de equipo» sin excepción, incluidas las guías de mostrador que hoy sí lo dicen. |
| PL-48 | **Cuarto nivel de permiso (D-12)** *(corregido en vivo con evidencia)*: se llama **Admin**, igual que en Dynamic — no «Dueño». La objeción inicial (colisión con Dynamic) se verificó y **no se sostuvo**: `fn_es_lider()` en producción ya no lee el `admin` de Dynamic desde 2026-09-14 (migración `0016`), y en Dynamic «admin» = «Gerencia General», el mismo concepto que D-12 describe para retail. Único guardarraíl real: el Admin de retail debe seguir siendo una columna/allowlist propia, nunca derivada automáticamente del `admin` de Dynamic — el mismo candado que ya cerró el bug de «control total temporal». |
| PL-49 | **4 nombres del módulo de venta** (ruta/id/grupo «Ventas»/pantalla «Punto de Venta»): quedan como están, documentando la regla — código en id/ruta, negocio en «Ventas»/«Punto de Venta». |
| PL-50 | **«Comprobante» y «Nota de crédito»** *(analizado en profundidad — cambia la recomendación original)*: son 3 y 2 tablas realmente distintas, no una compartida. Solo la de Ventas (`retail.comprobantes`) toca SUNAT de verdad (`respuesta_sunat`, estados `enviado/aceptado/rechazado`); Compras (`retail.compras`) y el Taller (`retail.comprobantes_produccion`) son puro registro interno, sin ningún campo fiscal. Se renombran: Ventas mantiene **«Comprobante»** / **«Nota de crédito»** en exclusiva; Compras pasa a **«Factura de proveedor»** / **«Nota de crédito de proveedor»** (esta última ya es el nombre real de la tabla `compra_notas_credito`); el Taller pasa a **«Factura de insumos»**. |
| PL-51 | **Verbo para mover de sede:** «Cambiar de sede» gana en los dos casos (colaborador y aviso de sesión). |
| PL-52 | **Tercera palabra «unidad» (V1 muerto):** nunca reaparece; Finanzas (cuando se construya) usa `ubicacion_id`, igual que todo V2. |
| PL-53 | **«Fábrica» como sinónimo del Taller:** se purga por completo, incluso al hablar con terceros (maquila, proveedores). |

**Pendientes que nacen de este bloque:**
- PL-43: migración real en producción + 83 archivos de código (estructural, sigue PL-10/PL-11).
- PL-47: corregir 4+ documentos operativos (`GUIA-CARGA-CATALOGO.md`, `PLAN-DE-TRABAJO.md`, `ESTUDIO-CONTABILIDAD.md`, `MANUAL-CONTABLE-CAYLA.md`).
- PL-48: corregir `docs/datos/DECISIONES-2026-09-12.md:67` y `apps/web/lib/menu.ts:43` si ya citan «Admin» con otro nombre.
- PL-50: corregir `apps/web/lib/menu.ts:163,187` y toda mención en ADR-0111/0142/BACKLOG.
- PL-41, PL-42, PL-44, PL-51, PL-53: corregir los componentes citados en cada pregunta (`PerfilModal.tsx`, `ColaboradoresTablas.tsx`, `CajaAbiertaPanel.tsx`, `ColaboradoresModales.tsx`, `AvisoCambioDeSede.tsx`, `packages/shared/src/enums.ts`).

### Reflexión del bloque
- **Lo que ya hacemos bien:** el vocabulario obligatorio de CLAUDE.md (colaborador/integrante, sede/tienda/boutique, nunca «encargada») ya estaba bien pensado desde el principio — casi todas estas preguntas fueron de aplicarlo consistentemente, no de inventarlo.
- **Qué podría hacer mejor que yo un integrante:** una líder de equipo que atiende proveedores de Gamarra a diario sabe mejor que yo si «Factura de proveedor» (PL-50) suena natural o si el equipo real dirá otra cosa en el mostrador — el nombre técnico correcto no siempre es el que la gente va a usar hablando.
- **La próxima objeción que quiero escuchar:** en PL-48 me equivoqué primero y Felipe me hizo verificar — la lección real no es «Admin está bien», es que **debí verificar antes de objetar**, no después. La próxima vez que frene una decisión con un argumento técnico, debería confirmarlo contra el código antes de presentarlo como un hecho.

---

## Nota sobre PL-50, hallazgo colateral (no resuelto, nombrado)

Al verificar PL-50 apareció un patrón que no es de vocabulario: `retail.comprobantes_produccion` +
`retail.proveedores_produccion` duplican casi exactamente la forma de `retail.compras` + `retail.proveedores`,
en vez de que el Taller reuse `compras` con `ubicacion_destino_id` apuntando a su propia sede (que la tabla ya
admite). Puede ser una separación intencional (proveedores de insumos vs. proveedores de mercadería son
negocios distintos) o puede ser el mismo problema resuelto dos veces (principio 2, Brooks). No se resolvió acá
porque es una decisión de modelo de datos, no de nombre — queda para el frente de Modelo de datos (Sesión 2).
