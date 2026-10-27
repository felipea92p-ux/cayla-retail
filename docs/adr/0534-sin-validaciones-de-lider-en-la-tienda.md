# ADR-0534 — Sin validaciones de líder en la tienda: la líder valida en persona

**Estado:** aceptada · migración `20261027164000` **NO está en producción** (espera el OK de Felipe para pegarla) · la web va en el mismo PR ·
**Fecha:** 2026-10-27 · **Decidió:** Felipe · **Sigue a:** ADR-0306 (un módulo es una entrada del menú; quien lo ve hace lo de adentro),
ADR-0161/0162 (el responsable firma) y ADR-0387 (el costo atípico ya pasó del líder al módulo)

## Contexto

En las tiendas todas las colaboradoras trabajan con las mismas cuentas de terminal (la de caja y la de almacén). Las líderes no se sientan
frente al sistema: **validan en persona**, al lado de la colaboradora, cuando la operación ocurre. El ERP, en cambio, pedía que una cuenta de
líder entrara al equipo para aprobar:

- una devolución quedaba «Esperando aprobación de un líder», y además quien la registró no podía aprobarla;
- el cuadre del piso decía «pídele que entre con su cuenta en este mismo equipo»;
- una prenda dañada no salía de cuarentena, ni se liquidaba;
- un ajuste de efectivo (faltante/sobrante) no se podía anotar;
- cerrar o reabrir ventas sin registrar, revisar sus sugerencias e identificar ventas en lote eran del líder, y quien vendió no podía
  regularizar su propia venta;
- un color, tejido, patrón, talla o insignia nueva quedaba «pendiente de que un Líder la apruebe»;
- una oferta se guardaba como borrador «hasta que un líder la active»; los grupos del plan del piso solo los movía el líder;
- anular un comprobante o liberarlo sin espera era solo del líder.

La validación ya ocurría delante del mostrador; la del sistema solo trababa la terminal.

## Decisión

Felipe (2026-10-27): «Quita todas las validaciones de líder». Se eligieron tres grupos y se dejaron fuera, a propósito, los de
administración (Roles, Colaboradores, Finanzas, Configuración, series de comprobantes): eso no valida una operación, decide quién administra,
y abrirlo dejaría que una terminal compartida cree líderes.

**Cada `fn_es_lider()` de esas operaciones pasa al permiso del módulo donde vive su botón** (ADR-0306), y a la sede donde la operación es de
una sede. Quién lo hizo sigue firmado con el combo «Responsable».

| Operación | Antes | Ahora |
|---|---|---|
| Aprobar / rechazar devolución | líder, y no quien la registró | Devoluciones en esa sede; quien la registró también |
| Confirmar el cuadre del piso | líder | Existencias |
| Resolver / liquidar prenda dañada | líder | Existencias en la sede de la prenda |
| Ajuste de efectivo en caja | líder | quien opera esa caja |
| Cola de ventas sin registrar (cerrar, reabrir, sugerencias) | líder | Existencias |
| Regularizar la propia venta | prohibido salvo líder | permitido |
| Colores, tejidos, patrones, tallas, insignias nuevas | pendientes sin el módulo | nacen aprobados |
| Activar, cambiar o retirar una oferta | líder | quien tiene la llave de campañas |
| Grupos del plan del piso | líder | Plan del piso |
| Anular comprobante / liberar sin espera (SUNAT) | líder | Facturación |

Lo ya pendiente (devoluciones, colores, insignias) no se aprueba solo: se resuelve como antes, ahora sin esperar a una cuenta de líder.

## Consecuencias

- La terminal deja de trabarse: lo que la líder valida en persona se registra en el momento.
- **Quién puede anular un comprobante lo decide ahora Roles y accesos** (el módulo Facturación). Sigue siendo irreversible ante SUNAT y la
  hoja de confirmación se queda. Si un rol no debería anular, se le quita Facturación.
- Se pierde el «cuatro ojos» del sistema en devoluciones y en regularizar la propia venta. Lo reemplaza la líder en persona, y el
  responsable de cada operación sigue quedando en Actividad para revisarlo después.

## Descarté

- **Quitar `fn_es_lider()` sin poner nada.** Las funciones son `security definer`: sin candado las llamaría cualquier cuenta con sesión, aun
  sin el módulo.
- **Volver líder a la cuenta de terminal.** Le abriría Roles, Colaboradores y Finanzas.
- **Reescribir las funciones enteras.** 22 cuerpos copiados chocan con cualquier PR que toque una; el reemplazo anclado (ADR-0288) toca solo
  las líneas del candado y falla fuerte si la función cambió.
- **Aprobar de una vez todo lo pendiente.** Es un cambio de datos en producción que nadie pidió; lo pendiente se revisa como siempre.

## Cómo se pega

`supabase/migrations/20261027164000_quitar_validaciones_del_lider.sql`: una sola parte, sin políticas ni `alter table`, solo reemplazos
anclados. Idempotente. Va después de cualquier migración que ya esté en producción (no depende de las nuevas).
