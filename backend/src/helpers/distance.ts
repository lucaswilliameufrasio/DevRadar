//Fórmula de Haversine
export function degreesToRadius(deg: number) {
  return deg * (Math.PI / 180);
}

export function getDistanceFromLatLonInKm(
  centerCoordinates: { latitude: number; longitude: number },
  pointCoordinates: { latitude: number; longitude: number }
) {
  const radius = 6371;

  const { latitude: lat1, longitude: lon1 } = centerCoordinates;
  const { latitude: lat2, longitude: lon2 } = pointCoordinates;

  const dLat = degreesToRadius(lat2 - lat1);
  const dLon = degreesToRadius(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(degreesToRadius(lat1)) *
      Math.cos(degreesToRadius(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const center = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = radius * center;

  return distance;
}
