import http from 'k6/http';
import { check, sleep } from 'k6';

// This test can be run against any of the backends by changing the target URL
// k6 run -e TARGET_URL=http://localhost:9988 load_tests/k6_load_test.js

export const options = {
  stages: [
    { duration: '30s', target: 50 },  // Ramp up to 50 users
    { duration: '1m', target: 200 }, // Ramp up to 200 users
    { duration: '30s', target: 0 },   // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<100'], // 95% of requests must complete below 100ms
    http_req_failed: ['rate<0.01'],    // Less than 1% failure rate
  },
};

const BASE_URL = __ENV.TARGET_URL || 'http://localhost:9988';

export default function () {
  const clientId = `client-${__VU}-${__ITER}`;
  const lat = -23.5505 + (Math.random() - 0.5) * 0.1;
  const lon = -46.6333 + (Math.random() - 0.5) * 0.1;

  // 1. Register Client
  const regPayload = JSON.stringify({
    github_username: `user-${__VU}-${__ITER}`,
    techs: 'react,node',
    latitude: lat,
    longitude: lon,
  });
  const regParams = { headers: { 'Content-Type': 'application/json' } };
  const regRes = http.post(`${BASE_URL}/v1/devs`, regPayload, regParams);
  
  check(regRes, {
    'registered successfully': (r) => r.status === 200 || r.status === 201,
  });

  sleep(0.5);

  // 2. Search (this triggers spatial logic)
  const searchRes = http.get(`${BASE_URL}/v1/search?latitude=${lat}&longitude=${lon}&techs=react`);

  check(searchRes, {
    'search successful': (r) => r.status === 200,
  });


  sleep(1);
}
