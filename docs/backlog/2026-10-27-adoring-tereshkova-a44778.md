## 🧾 Recibir: el papel cuenta por prenda + «Subir foto» (2026-10-27, ADR-0538) — rama `claude/adoring-tereshkova-a44778`
- [x] «Lo que anotó X» se cuenta por lo identificado de cada prenda, no por el reparto del total de la categoría.
- [x] Botón «Subir foto» en un papel sin foto (web, guía interactiva y huella al día).
- [x] Migración `20261027210000` **en producción desde 2026-10-27** (OK de Felipe, MCP de Supabase, verificada). La web de «Subir foto» funciona cuando se publique este PR.
- [ ] Probar en el navegador con el stack local completo (subida real al depósito, cámara en el celular a 375 px) y capturar antes/después.
- [ ] Decidir si una foto ya subida se puede cambiar (hoy solo se agrega).
