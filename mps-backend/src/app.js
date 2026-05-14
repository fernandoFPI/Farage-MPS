import express from 'express';
import cors from 'cors';
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import roleRoutes from './routes/roleRoutes.js';
import customerRoutes from './routes/customerRoutes.js';
import contractRoutes from './routes/contractRoutes.js';
import printerRoutes from './routes/printerRoutes.js';
import contractPrinterRoutes from './routes/contractPrinterRoutes.js';
import meterReadingRoutes from './routes/meterReadingRoutes.js';
import billingCycleRoutes from './routes/billingCycleRoutes.js';
import cycleGroupRoutes from './routes/cycleGroupRoutes.js';
import xsmRoutes from './routes/xsmRoutes.js';
import performanceRoutes from './routes/performanceRoutes.js';
import printerImportRoutes from './routes/printerImportRoutes.js';
import readingImportRoutes from './routes/readingImportRoutes.js';
import consumableReadingRoutes from './routes/consumableReadingRoutes.js';
import customerStorageRoutes from './routes/customerStorageRoutes.js';
import contractGroupRoutes from './routes/contractGroupRoutes.js';
import systemSettingsRoutes from './routes/systemSettingsRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';

const app = express();

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/contracts', contractRoutes);
app.use('/api/printers/import', printerImportRoutes);
app.use('/api/printers', printerRoutes);
app.use('/api/contract-printers', contractPrinterRoutes);
app.use('/api/meter-readings/import', readingImportRoutes);
app.use('/api/meter-readings', meterReadingRoutes);
app.use('/api/billing-cycles', billingCycleRoutes);
app.use('/api/cycle-groups', cycleGroupRoutes);
app.use('/api/xsm', xsmRoutes);
app.use('/api/performance', performanceRoutes);
app.use('/api/consumable-readings', consumableReadingRoutes);
app.use('/api/customer-storage', customerStorageRoutes);
app.use('/api/contract-groups', contractGroupRoutes);
app.use('/api/settings', systemSettingsRoutes);
app.use('/api/analytics', analyticsRoutes);

// Odoo integration audit logger
app.use((req, res, next) => {
  if (req.user?.role?.name === 'odoo_integration') {
    console.log(`[ODOO] ${req.method} ${req.path} — ${new Date().toISOString()} — user: ${req.user.email}`)
  }
  next()
})

// Global error handler — must be last
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

export default app;
