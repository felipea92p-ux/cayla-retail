// `crypto.randomUUID` solo existe en un «contexto seguro» (HTTPS o localhost). Probando el ERP local desde otro equipo de la
// red (`http://192.168.x.x:3010`) no existe, y todo guardado que crea su token de intento (cobrar, ajustar inventario, registrar
// un gasto…: más de 30 componentes) revienta con «crypto.randomUUID is not a function» antes de llegar a la base.
//
// Este script lo define con `crypto.getRandomValues`, que SÍ existe sin HTTPS, y solo si falta. Va en el <head>, antes de que
// hidrate React. Solo se pone en `next dev` (`app/layout.tsx`): producción es siempre HTTPS y no lo lleva.
export const SCRIPT_UUID_SIN_HTTPS = `(function(){var c=window.crypto;if(!c||typeof c.randomUUID==="function"||typeof c.getRandomValues!=="function")return;c.randomUUID=function(){var b=c.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;var h=[];for(var i=0;i<16;i++)h.push((b[i]+256).toString(16).slice(1));return h.slice(0,4).join("")+"-"+h.slice(4,6).join("")+"-"+h.slice(6,8).join("")+"-"+h.slice(8,10).join("")+"-"+h.slice(10).join("")}})();`;
