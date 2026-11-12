module.exports = {
  apiBase: 'https://your-api.example.com',
  requestTimeout: 10000,
  quality: 'low', // low / medium / high; validate high on a real device first
  adaptiveResolution: true, // lower the render scale automatically when frames get slow
  antialias: true // MSAA; set false if a device reports a context error
};
