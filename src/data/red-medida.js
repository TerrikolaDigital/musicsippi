// Decide si la red es «medida» (datos móviles o ahorro de datos) sin tocar el
// sistema: pura para probarla. Falla cerrada: si en Android no hay forma de
// saberlo, se asume medida y se pide permiso antes de descargar el modelo.
const medidaPorConnection = (c) => c.type === 'cellular' || c.saveData === true;

export function decidirRedMedida({ nativo, errorNativo = false, connection, esAndroid }) {
  if (nativo && !errorNativo && typeof nativo.medida === 'boolean') return nativo.medida;
  if (connection) return medidaPorConnection(connection);
  return !!esAndroid;
}
