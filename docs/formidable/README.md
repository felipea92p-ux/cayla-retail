# Formidable — tablero

El skill `/formidable` (ADR-0350, `.claude/skills/formidable/`) califica cada pantalla con dos notas: **leyes** (comprensión, 9 leyes) y **oficio visual**
(se mide en el navegador). Este tablero es el avance **módulo por módulo**; cada fila enlaza a su informe (`docs/formidable/<slug>.md`, historial, no se sobrescribe).

Es obligatorio **con tablero y sin prueba en el CI** por ahora: al terminar una pantalla o modal, correr `/formidable`. Una pantalla no cuenta como
Formidable porque sus modales lo sean, ni al revés.

**Estados:** `sin probar` · `en piloto` · `ciega ✓ · real sin probar` · `formidable` (leyes y oficio ≥ 8, y pasada real hecha) · `en deuda` (alguna ley < 5).

| Módulo | Pantalla / modal | Estado | Leyes | Oficio | Informe | Última medición |
|---|---|---|---|---|---|---|
| Inventario | Frescura del piso (`/inventario/frescura`) | en piloto: cambios 1–3 ejecutados (2026-10-05); dos niveles y vara de CAYLA de respaldo en `main` (PR #889, 2026-10-09, ADR-0208 act. 2026-10-07) sin recalificar; `tema:auditar` 2026-10-09 en verde (0 hallazgos); falta `/formidable` sobre la pantalla nueva y recalificar con datos y colaboradoras reales | 4,5 (±1) · ley 1 sin nota | 5 (provisional) | [inventario-frescura](inventario-frescura.md) | 2026-10-09 (tema) |
| Inventario | Traslados, billetera de pases (`/inventario/traslados`) | ciega ✓ · real sin probar; cambios 1–3 hechos (2026-10-06) | 7,5 · ley 1: 7 | 7 | [inventario-traslados](inventario-traslados.md) | 2026-10-06 |
| Inventario | Ventas sin registrar, la mesa «Puente» (`/inventario/por-regularizar`) | ciega ✓✓ (dos pruebas) · real sin probar; los 3 cambios hechos y recalificada (2026-10-07) | 7,0 (provisional) · ley 1: 8 | 6 (provisional) | [inventario-ventas-sin-registrar](inventario-ventas-sin-registrar.md) | 2026-10-07 |
| Inventario | Rótulos de anaquel (`/rotulos`) | ciega ✓ (sobre capturas) · real sin probar; los 3 cambios hechos y recalificada (2026-10-09) | 8,0 · ley 1: 7 | 8 | [rotulos](rotulos.md) | 2026-10-09 |
| Catálogo | Liquidación (`/productos/liquidacion`, ADR-0371) | ciega ✓ (sobre capturas) · real sin probar; 3 cambios propuestos, esperan el OK | 6,6 · ley 1: 5 | 8 | [productos-liquidacion](productos-liquidacion.md) | 2026-10-10 |
| Catálogo | Editar producto ▸ «Precio por tienda» y su hoja (`/productos/[id]/editar`) | ciega ✓ · real sin probar; un error corregido y los 3 cambios hechos (2026-10-10) | 8,3 · ley 1: 7 | 10 | [catalogo-precio-por-tienda](catalogo-precio-por-tienda.md) | 2026-10-10 |

## Orden de despliegue (módulo por módulo, decidido 2026-10-05)
Inventario (piloto: Frescura del piso) → el resto del módulo → siguiente módulo que Felipe indique. El orden dentro de un módulo sale de
dónde duele más (mostrador antes que configuración).

## Cómo se agrega una fila
Al cerrar una corrida de `/formidable`: copia la nota de leyes y de oficio del informe, el estado, el enlace y la fecha. No inventes una nota sin evidencia: pon «sin probar».
