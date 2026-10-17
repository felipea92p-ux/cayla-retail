## 2026-10-16 (La tienda se puede añadir a la pantalla de inicio del celular)
**Qué se cerró:** quien entra a la tienda desde el celular ve, una sola vez y sin tapar lo que hace, un aviso para tenerla a un toque
(hoja de abajo, o franja si el Inicio ya trae el aviso del Club); el iPhone recibe la guía de tres toques, tras separar un pedido sale una
tarjeta y «Mi perfil» guarda una fila fija. «Ahora no» calla 30 días. **Por qué así:** es una app web instalable (no Play Store): lo que
manda es no estorbar la compra, así que todo lo que podía estorbar (esperar, no tocar un gesto, no empujar la página leída) está en
`lib/instalar.ts` con su prueba. **Qué falta:** probarlo en un Android y un iPhone de verdad; ADR-0431.
