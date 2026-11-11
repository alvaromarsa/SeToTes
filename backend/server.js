const app = require('./app');
const { startAbandonedOrdersJob } = require('./jobs/cancel-abandoned-orders');

const port = Number(process.env.PORT) || 3000;

app.listen(port, () => {
  console.log(`Backend disponible en http://localhost:${port}`);
});

// Tareas periódicas: solo al arrancar el servidor, nunca al importar app.js
startAbandonedOrdersJob();
