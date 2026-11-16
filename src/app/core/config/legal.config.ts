// Datos legales de la tienda: ÚNICO sitio donde se rellenan.
// Los valores entre corchetes son marcadores: hay que sustituirlos por los datos reales
// antes de abrir la tienda. Los textos legales deben revisarlos un profesional.

export const LEGAL_CONFIG = {
  storeName: 'SeToTes',
  domain: 'https://setotes-demo.onrender.com',
  lastUpdated: '16 de noviembre de 2026',

  owner: {
    name: 'Tienda de demostración (proyecto de portfolio, sin actividad comercial)',
    nif: 'No aplica (sitio de demostración)',
    address: 'No aplica (sitio de demostración)',
    email: 'demo@setotes.invalid',
    phone: 'No aplica',
    // Solo si el titular es una sociedad; si es autónomo, déjalo en null
    registryData: 'No aplica' as string | null,
  },

  privacy: {
    // Email o dirección para ejercer los derechos de protección de datos
    contactEmail: 'demo@setotes.invalid',
    // Encargados del tratamiento: se muestran como "cuando existan"
    // Pasarela de pago (Stripe Checkout). La entidad concreta depende del contrato con Stripe
    paymentProvider: 'Stripe (modo de pruebas, sin cobros reales)',
    emailProvider: 'No aplica en la demostración',
    hostingProvider: 'Render',
    // Almacenamiento de las fotos del catálogo (compatible con S3: R2, S3, B2…). Ve la IP de quien
    // descarga una imagen. Si se usa un dominio propio con funciones antibots, revisar si pone cookies
    storageProvider: 'Cloudflare R2',
  },

  shipping: {
    // Debe coincidir con SHIPPING_COST de backend/config/constants.js (el backend es quien lo cobra)
    costEur: 7.5,
    // El plazo ESTIMADO lo edita el admin (ajuste shippingTimeText) y se muestra en cada producto
    // y en el resumen del pedido; aquí solo va el plazo MÁXIMO, que no cambia sin revisar los textos
    maxDeliveryTime: 'No aplica (sin ventas reales)',
    shippingArea: 'No aplica',
    carrier: 'No aplica',
    returnsAddress: 'No aplica',
  },

  // Se indica en las condiciones si alguno de los productos se hace a medida
  customProductsNote:
    'No aplica: sitio de demostración sin ventas reales.',
} as const;
