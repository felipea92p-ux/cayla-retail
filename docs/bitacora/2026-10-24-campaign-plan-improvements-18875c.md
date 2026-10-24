# 2026-10-24 — Plan de campaña: descuento de la campaña y fecha límite para pedir

- **Qué se hizo:** el Plan calcula cuánto comprar con el precio de la campaña (precio × (1 − descuento)) y dice hasta cuándo pedir (inicio de la campaña − días para llegar). Dos migraciones nuevas (descuento por categoría con sugerido de la campaña; plazo por campaña con autor), la hoja «Días para llegar» y el campo «Descuento en la campaña». Probado en local (19/19 y 11/11 en base, 335 pruebas web, navegador).
- **Por qué así:** quedarse corto cuesta menos con descuento y, si el descuento se come el margen, nadie lo veía; y una campaña falla antes por pedir tarde que por pedir mal. Se guarda el descuento supuesto para que se pueda revisar después qué se asumió.
- **Qué se rompería sin esto:** comprar de más con precio de lista, una campaña que pierde plata en una categoría sin aviso, o un pedido que llega después de que empieza la campaña.
- **Estado:** rama `claude/campaign-plan-improvements-18875c`, ADR-0499 reservado (sin escribir). **Nada en producción**; ver `docs/backlog/2026-10-24-campaign-plan-improvements-18875c.md`.
