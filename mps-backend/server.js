import 'dotenv/config';
import app from './src/app.js';
import { startBillingCycleJob } from './src/services/billingCycleJobService.js';

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`MPS backend running on port ${PORT}`);
  startBillingCycleJob();
});
