import 'dotenv/config';
import express from 'express';

const app = express();
const port = Number(process.env.PORT) || 5000;

app.use(express.json());

app.get('/', (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'Welcome to StockSense AI System',
  });
});

app.listen(port, () => {
  console.log('');
  console.log('==============================================');
  console.log('       WELCOME TO STOCKSENSE AI SYSTEM');
  console.log('       Stock Market API Backend Starter');
  console.log('==============================================');
  console.log(`Server running at http://localhost:${port}`);
  console.log('');
});
