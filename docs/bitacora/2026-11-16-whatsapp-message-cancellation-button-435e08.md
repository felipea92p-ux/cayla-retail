## 2026-11-16 (Al cancelar un apartado, la tienda le avisa al cliente por WhatsApp)
Qué hice: al liberar un apartado (en «Entregar» o en «Todos»), la hoja ya no se cierra: muestra el mensaje para el cliente según el motivo elegido —venció, desistió o fue un error— con cómo vuelve su adelanto, y el botón «Avisar por WhatsApp» lo abre en wa.me (lo envía la persona). Sin celular, se cierra como antes. Regla pura `mensajeLiberacion` (`lib/separaciones-reglas.ts`) con su prueba; la guía de Apartados lo menciona y su huella quedó aceptada.
Por qué así: el chat solo puede abrirse en un toque, no después de esperar a la base, por eso es un paso propio tras liberar; no se anota nada nuevo en la base (no hay RPC ni migración).
Cómo verificas: Vender ▸ Apartados ▸ elegir uno con celular ▸ «Liberar apartado» ▸ motivo + responsable ▸ «Liberar prendas»: sale «Avisarle a …» con el mensaje; «Avisar por WhatsApp» abre el chat. No se probó en el navegador: la base local estaba apagada.

## 2026-11-16 (Auditoría al milímetro de la hoja «Avisarle a …»)
Qué hice: medí la hoja nueva con los seis medidores en claro, oscuro, vivo y celular; 0 graves y 1 media, que corregí: el monto del mensaje sale «S/ 90.00» con `soles`, como en todo el ERP.
Por qué así: el PR #1888 se fusionó antes de la auditoría, así que la corrección va en su propia rama.
Felipe se lleva: `docs/milimetro/auditorias/2026-11-16-apartados-avisar-al-liberar.md`; queda sin medir el área de 44 px con el dedo y `/chaos` de liberar.
