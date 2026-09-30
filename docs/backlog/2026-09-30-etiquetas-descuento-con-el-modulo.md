## 🏷️ El descuento por etiqueta con el módulo (2026-09-30, ADR-0293) — rama `claude/etiquetas-descuento-con-el-modulo`

- [x] Migración `20261001130000` (funciones + catálogo) y `20261001130100` (política `etiquetas_insert_autenticado`), re-ejecutables, probadas en una copia de la base local.
- [x] Web: Nuevo producto ofrece todas las etiquetas; Atributos ▸ Etiquetas muestra «Prendas» y «Configurar campaña» a quien tiene el módulo; suite web, `tsc` y eslint en verde.
- [ ] **Pegar en producción, primero la base y después la web** (ADR-0293, «Se rompe si»): `20261001130000`, luego `20261001130100` SOLA (es política: no se mezcla con lo demás, ADR-0195). Después refrescar el volcado de `docs/datos/generado/` (`fn_puede_dar_descuento_por_etiqueta` cambia de cuerpo).
- [ ] **Probar con la terminal real «Almacén Trujillo»**: Nuevo producto ▸ Etiquetas ▸ «Ver todos» muestra «Para liquidar» y «Últimas unidades»; Atributos ▸ Etiquetas trae «Prendas» y «Configurar campaña» en esas dos tarjetas. La terminal necesita el módulo Etiquetas en su rol para configurar (Roles y accesos); para solo etiquetar al crear, no.
- [ ] Decidir si la caja necesita un freno propio para una campaña que alguien configuró por error (hoy: solo la vigencia y el tope de descuento que ya existían).
