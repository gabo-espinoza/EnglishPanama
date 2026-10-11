// Roles de gestion de la plataforma (Fase A y siguientes).
//
// Los 2 usuarios de plataforma son `student` y `teacher` (tabla users).
// Los roles de gestion viven en `staff_accounts` y cada uno pertenece a un area.
// El area viaja en el token (`aud`) y el middleware valida area Y rol.
//
// El gestor de base de datos y el gestor de la aplicacion NO son cuentas de la app:
// son usuarios del sistema operativo (documentado aparte).
const STAFF_ROLE_AREA = {
    access_manager: 'access',
    auditor: 'audit',
    content_manager: 'content',
    content_reviewer: 'content',
    game_manager: 'game',
    support: 'support',
    analyst: 'analytics',
    moderator: 'moderation'
};

const STAFF_ROLES = Object.keys(STAFF_ROLE_AREA);

function areaForRole(role) {
    return STAFF_ROLE_AREA[role] || null;
}

function isStaffRole(role) {
    return Object.prototype.hasOwnProperty.call(STAFF_ROLE_AREA, role);
}

module.exports = { STAFF_ROLE_AREA, STAFF_ROLES, areaForRole, isStaffRole };
