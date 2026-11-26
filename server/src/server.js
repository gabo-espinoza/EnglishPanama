const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const app = require('./app');
const { assertAuditConfig } = require('./config/auditDb');
const { assertAuthConfig } = require('./config/authConfig');

// En produccion no se arranca sin la base de auditoria separada.
assertAuditConfig();

// En produccion tampoco se arranca sin los secretos de firma y cifrado, ni con secretos cortos o
// repetidos entre la plataforma y gestion (ver config/authConfig.js).
assertAuthConfig();

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`English Panama API escuchando en el puerto ${PORT}`);
});
