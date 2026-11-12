// Datos legales de la tienda: ÚNICO sitio donde se rellenan.
// Los valores entre corchetes son marcadores: hay que sustituirlos por los datos reales
// antes de abrir la tienda. Los textos legales deben revisarlos un profesional.

export const LEGAL_CONFIG = {
  storeName: 'SeToTes',
  domain: '[RELLENAR: dominio de la tienda, p. ej. www.setotes.es]',
  lastUpdated: '[RELLENAR: fecha de última actualización, p. ej. 10 de noviembre de 2026]',

  owner: {
    name: 'Inmaculada ',
    nif: '[RELLENAR: NIF del titular]',
    address: '[RELLENAR: domicilio completo del titular]',
    email: '[RELLENAR: email de contacto]',
    phone: '[RELLENAR: teléfono de contacto]',
    // Solo si el titular es una sociedad; si es autónomo, déjalo en null
    registryData: '[RELLENAR: datos del Registro Mercantil, o null si no aplica]' as string | null,
  },

  privacy: {
    // Email o dirección para ejercer los derechos de protección de datos
    contactEmail: '[RELLENAR: email para ejercer los derechos de protección de datos]',
    // Encargados del tratamiento: se muestran como "cuando existan"
    // Pasarela de pago (Stripe Checkout). La entidad concreta depende del contrato con Stripe
    paymentProvider: 'Stripe [REVISAR: entidad de Stripe con la que se contrata y su domicilio]',
    emailProvider: '[RELLENAR: servicio de email, cuando exista]',
    hostingProvider: '[RELLENAR: proveedor de alojamiento del servidor]',
    // Almacenamiento de las fotos del catálogo (compatible con S3: R2, S3, B2…). Ve la IP de quien
    // descarga una imagen. Si se usa un dominio propio con funciones antibots, revisar si pone cookies
    storageProvider: '[RELLENAR: proveedor de almacenamiento de imágenes]',
  },

  shipping: {
    // Debe coincidir con SHIPPING_COST de backend/config/constants.js (el backend es quien lo cobra)
    costEur: 7.5,
    deliveryTime: '[RELLENAR: plazo de entrega, p. ej. 3 a 5 días laborables]',
    shippingArea: '[RELLENAR: zonas de envío, p. ej. España peninsular]',
    carrier: '[RELLENAR: empresa de transporte]',
    returnsAddress: '[RELLENAR: dirección para devoluciones]',
  },

  // Se indica en las condiciones si alguno de los productos se hace a medida
  customProductsNote:
    '[RELLENAR: indicar si hay productos personalizados o hechos a medida y, en ese caso, cuáles quedan fuera del derecho de desistimiento]',
} as const;
