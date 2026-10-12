## 🖼️ La foto de la prenda a un costado de Reponer, Subir a almacén y Ajustar (2026-10-01, ADR-0136 act. e) — solo web; rama `claude/foto-en-reponer-subir-ajustar`

- [x] `<Modal lateral>` + `.hoja-con-lateral` (globals.css) + `components/ui/FotoDePrenda.tsx`; las tres ventanas pasan `fotoUrl` de la prenda (`PrendaParaReponer.fotoUrl`, `PrendaAjuste.fotoUrl`).
- [ ] **Sin probar con foto real dentro de las ventanas:** la base local no tiene fotos; verlo contra una prenda de producción con foto (la foto real sí se vio en una página temporal).
- [ ] **Celular:** el costado no se muestra bajo 640 px; si se quiere una foto chica arriba en celular, es otra decisión.
- [ ] **Ajustar desde la ficha del producto en edición** (hoy lo abre `ProductoForm`; `ficha-producto/AjusteDeStock.tsx` se borró sin uso el 2026-10-06) va sin foto: esa pantalla no trae la foto del color.
- [ ] Otras hojas con una prenda como protagonista (por ejemplo «Corregir color») podrían usar `lateral`; no se tocaron.
