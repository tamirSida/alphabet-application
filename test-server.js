const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Import the Netlify function
const { handler } = require('./netlify/functions/send-email.js');

const app = express();
app.use(cors());
app.use(express.json());

// Middleware to convert Express req/res to Netlify event/context format
app.post('/.netlify/functions/send-email', async (req, res) => {
  const event = {
    httpMethod: 'POST',
    headers: req.headers,
    body: JSON.stringify(req.body)
  };
  
  const context = {};
  
  try {
    const result = await handler(event, context);
    res.status(result.statusCode).json(JSON.parse(result.body));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = 8888;
app.listen(PORT, () => {
  console.log(`Test server running on http://localhost:${PORT}`);
  console.log('Resend API Key loaded:', process.env.RESEND_API_KEY ? 'Yes' : 'No');
});