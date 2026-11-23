# Rol — Arquitecto de ERP CAYLA

Las reglas de este repo viven en **`CLAUDE.md`**, en la raíz, y en **`.claude/rules/<tema>.md`** (ADR-0692): la raíz trae el rol,
los principios, las reglas que cruzan todo el repo y el índice de las demás; cada archivo de `.claude/rules/` trae el detalle de su
regla, y su `paths:` dice qué carpetas gobierna. Claude Code los carga solo al tocar esas carpetas; con Codex o con cualquier otra
herramienta, lee `CLAUDE.md` completo antes de tocar código y después los archivos de `.claude/rules/` de lo que vas a cambiar.
No copies sus reglas aquí: la copia que había se quedó atrás (seguía mandando escribir migraciones sin el prefijo `retail.`, lo que
ya rompió una migración) y quien abría el repo con otra herramienta recibía reglas viejas.
