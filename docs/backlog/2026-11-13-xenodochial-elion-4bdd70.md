## 🧹 Retirar Catálogo ▸ Liquidación (2026-11-13, ADR-0653) — web + migración SIN pegar; rama `claude/xenodochial-elion-4bdd70`

- [x] Web: ruta, componentes, reglas, guía de foco, guía interactiva, huella, estilos, menú, ícono y clave del módulo.
- [x] Vender sin la lectura de etiquetas `LQ` ni lo que solo servía a la pieza en el ticket.
- [x] Migración `20261113174000_retirar_modulo_liquidacion.sql` (se detiene si hay historia; quita el módulo; `revoke execute` a 6 funciones).
- [x] Prueba `pruebas:liquidacion-retirada` en el CI (reemplaza a `pruebas:piezas-liquidacion`).
- [x] Confirmado en producción (Felipe, 2026-11-13, solo lectura): 0 piezas, 0 etiquetas, 0 actividad, 0 pantalla principal, 0 ocultos. El rol «Compras» tiene el módulo asignado: la migración se lo quita.
- [ ] **Pegar la migración en producción** DESPUÉS de publicar la web, solo con el OK de Felipe. Sin políticas ni `alter`: un solo pegado.
- [ ] Refrescar el diccionario (`pnpm datos:generar:produccion`) después de pegarla: los comentarios de las tablas dicen «RETIRADA».
- [ ] Quitar `--papel-en-bandeja-sombra` de `vidrio/recetas.css` en una pasada coordinada con Dynamic (quedó sin uso).
