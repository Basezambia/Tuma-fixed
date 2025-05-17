// Use relative path in production, absolute path in development
const API_BASE_URL = process.env.NODE_ENV === 'production'
  ? '/api'
  : 'http://localhost:4000/api';

export const createCharge = async (chargeData: any) => {
  const response = await fetch(`${API_BASE_URL}/createCharge`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(chargeData),
  });
  return response.json();
};

export const getChargeStatus = async (chargeId: string) => {
  const response = await fetch(`${API_BASE_URL}/chargeStatus?chargeId=${chargeId}`);
  return response.json();
};
