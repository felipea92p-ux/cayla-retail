## 2026-11-06 — La marca en «Revisar compras» · en curso · rama `claude/marca-razon-social-cc6b22`

- [x] `fn_revisar_compras` entrega `marca` en cada línea (`20261106154000`, solo en el Postgres local compartido).
- [x] La lista, el detalle y las prendas la muestran; sin el dato, la pantalla sigue como antes.
- [ ] Abrir el PR con `/abrir-pr` y ver en el CI `pruebas:compras-simple-revisar` (su caso nuevo no corrió en local: la base compartida no tiene la semilla de esa prueba).
- [ ] Pegar `20261106154000` en producción, con el OK de Felipe, y comprobar que `fn_revisar_compras` trae `marca`.
- [ ] Refrescar el volcado de `docs/datos/generado/` después de pegarla.
