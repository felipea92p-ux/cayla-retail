# Maqueta · Apartados más claro (2026-11-26)

Felipe pidió revisar si **todo** Apartados (Apartar, Entregar, Historial y sus hojas) se entiende y está bien distribuido para cualquier
persona, y una maqueta navegable del nuevo diseño. El diagnóstico con sus notas está en `docs/formidable/vender-apartados.md`.

**Cómo se ve:** abre `index.html` (sirve con doble clic, o con el servidor `maquetas` de `.claude/launch.json`). Cada pantalla trae abajo
un interruptor **Hoy / Propuesta** y el botón «Qué cambia aquí», que dice cada cambio y la evidencia que lo pide.

**Cómo está hecha (para que se pueda confiar en ella):** cada `*.html` es la pantalla REAL del ERP congelada —su HTML y su CSS ya
compilado (`erp.css`), con datos inventados—. «Hoy» la muestra tal cual. «Propuesta» le aplica encima los cambios de `maqueta.js`, que es el
único archivo escrito a mano: lo que no cambia es idéntico a lo de hoy, y cada cambio se lee ahí en una función con su porqué.

**Qué propone** (los tres cambios de mayor impacto):
1. El botón principal, siempre a la vista: el panel de cobro de Apartar y de Entregar se queda quieto, y el pie de las hojas va pegado.
2. Pestaña **Pendientes** para lo que pide algo hoy; **Historial** con la lista arriba, en una tabla que alinea.
3. Una palabra para cada cosa («Le falta», «Cancelar apartado», «Seguir: datos del cliente», «Se le guarda hasta») y las condiciones que
   se le leen al cliente, a la vista.

**Lo que NO es:** no es producción ni cambió nada del ERP. Es de escritorio (1440 px): el celular se dibuja después de elegir qué entra.
Los nombres, montos y códigos son inventados.

**Capturas** antes/después a 1440 × 900: `capturas/`. **Herramientas** para rehacer una pantalla (página de prueba con datos inventados,
base de mentira, guion para congelar y para capturar): `herramientas/`.

**Estado:** espera la decisión de Felipe. Dónde quedó el trabajo y cómo seguirlo: `CONTINUAR.md`. Pesa unos 9 MB (la mitad son las
capturas; el resto, casi todo `erp.css`, la hoja de estilos del ERP sin recortar).
