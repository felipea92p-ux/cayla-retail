## Mis compras: la cuenta de la devolución y «Reabrir» (ADR-0571)
- [x] ~~Pegar en producción `20261029165000` y `20261029170000`~~ (hecho el 2026-10-29, verificado por objeto). Ya se puede fusionar y publicar la web.
- [ ] Refrescar el volcado del diccionario (`pnpm datos:refrescar`, `docs/datos/generado/COMO-REFRESCAR.md`): `compra_cierres.cuenta_indicada_id` y `fn_cuentas_para_devolver_compras` ya existen en producción.
- [ ] Ver la hoja «Cerrar mi ronda» con «Lo devuelvo» y «Revisar compras ▸ Rondas cerradas» con una cuenta real (a 375 px también) y correr `/formidable` y `/chaos`.
- [ ] Decidir: ¿la cuenta debe llegar sugerida (p. ej. la caja fuerte de su tienda) en vez de vacía? Hoy llega vacía a propósito.
- [ ] `pruebas:compras-simple-revisar` falla en el preludio con la base local compartida (`no rows returned for \gset`): revisarla en un stack desechable.
