# Formidable — tablero

El skill `/formidable` (ADR-0350, `.claude/skills/formidable/`) califica cada pantalla con dos notas: **leyes** (comprensión, 9 leyes) y **oficio visual**
(se mide en el navegador). Este tablero es el avance **módulo por módulo**; cada fila enlaza a su informe (`docs/formidable/<slug>.md`, historial, no se sobrescribe).

Es obligatorio **con tablero y sin prueba en el CI** por ahora: al terminar una pantalla o modal, correr `/formidable`. Una pantalla no cuenta como
Formidable porque sus modales lo sean, ni al revés.

**Estados:** `sin probar` · `en piloto` · `ciega ✓ · real sin probar` · `formidable` (leyes y oficio ≥ 8, y pasada real hecha) · `en deuda` (alguna ley < 5).

| Módulo | Pantalla / modal | Estado | Leyes | Oficio | Informe | Última medición |
|---|---|---|---|---|---|---|
| Inventario | Frescura del piso (`/inventario/frescura`) | en piloto: cambios 1–3 ejecutados (2026-10-05); falta recalificar con datos y colaboradoras reales | 4,5 (±1) · ley 1 sin nota | 5 (provisional) | [inventario-frescura](inventario-frescura.md) | 2026-10-05 |

## Orden de despliegue (módulo por módulo, decidido 2026-10-05)
Inventario (piloto: Frescura del piso) → el resto del módulo → siguiente módulo que Felipe indique. El orden dentro de un módulo sale de
dónde duele más (mostrador antes que configuración).

## Cómo se agrega una fila
Al cerrar una corrida de `/formidable`: copia la nota de leyes y de oficio del informe, el estado, el enlace y la fecha. No inventes una nota sin evidencia: pon «sin probar».
