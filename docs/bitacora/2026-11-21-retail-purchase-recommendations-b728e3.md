# 2026-11-21 — Skill `/actualizar-lista-compra`

- **QUÉ HICE:** una skill que renueva desde producción (solo lectura) la copia de datos del tablero «Qué comprar esta semana» de claude.ai: dos consultas en `.claude/skills/actualizar-lista-compra/consultas/`, `guardar.mjs`, `comprobar.mjs` y los pasos para reemplazar los adjuntos del tablero.
- **POR QUÉ ASÍ:** el tablero no puede leer la base para quien entra por el enlace (cada consulta corre con el acceso de quien lo abre), así que lee una copia. Con el procedimiento en el repo lo renueva cualquier cuenta de Claude con el conector de Supabase y permiso de editar, no una sola. Las cifras y la dirección del tablero no entran al git: el repositorio es público.
- **QUÉ SE ROMPERÍA SIN ESTO:** la lista solo se podría renovar desde la sesión que la creó, y con esa cuenta sin uso el equipo vería datos viejos sin saberlo.

Probado en local con una respuesta guardada (las sumas de control cuadran). No probado desde otra cuenta. La misma cuenta dentro del ERP es la pantalla «Qué comprar» de Compras, aprobada y sin empezar.
