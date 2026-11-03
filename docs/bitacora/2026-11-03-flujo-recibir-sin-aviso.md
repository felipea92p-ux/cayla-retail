## 2026-11-03 — Recibir ▸ recepción sin aviso, de punta a punta (`/flujo-de-negocio`)

Qué hice: escribí el caso `docs/flujos/recibir/sin-aviso-de-punta-a-punta.md` con 35 casuísticas y lo corrí en local, con una pasada ciega y una informada. No cambié el ERP.
Por qué así: Felipe quería revisar el flujo entero y lo grave no se ve en pantalla. Se encontró un costo fuera de lo normal que entra sin aviso, por un NULL en el filtro de `fn_recepcion_entrar`.
Verificado: invariantes limpias tras cada cierre y base restaurada idéntica. Sin probar: 375 px, teléfono real, colaboradora real y el precio rechazado en pantalla.
