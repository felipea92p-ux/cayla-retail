## «¿De qué banco salió?» al anotar plata (2026-10-26)
- **Hecho (rama `claude/mis-compras-banco-de-la-plata`):** migración en 2 partes, hoja «Me dieron plata» y «Revisar compras» con el banco ya elegido. Detalle y SQL por pegar: `docs/bitacora/2026-10-26-mis-compras-banco-de-la-plata.md`.
- [ ] **Pegar las dos partes en producción** (Felipe, en orden: `20261026165000` y luego `20261026170000`) y verificar con las dos consultas de la bitácora; después refrescar el diccionario de datos.
- [ ] **No se ve el banco en la lista de la compradora** («Te transfirieron · BCP»): `fn_mi_plata_compras` se ha reemplazado seis veces y no se tocó. Si se quiere, va con un reemplazo anclado aparte.
- [ ] La indicación no se valida contra lo que Compras confirma (no hay por qué: son dos cosas distintas, lo dicho y lo verificado). Si Felipe quiere un aviso cuando difieren, es de «Revisar compras».
- [ ] `pruebas:compras-simple-plata`: el caso «Compras ve lo por confirmar con el nombre de la compradora» cuenta filas y falla en una base con plata anotada antes (como la local de pruebas); en el CI, con la base limpia, pasa.
