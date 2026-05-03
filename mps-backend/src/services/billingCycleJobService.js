import * as contractRepo from '../repositories/contractRepository.js';
import * as cycleRepo from '../repositories/billingCycleRepository.js';

async function autoCreateMonthlyCycles() {
  const now   = new Date();
  const year  = now.getFullYear();
  const month = now.getMonth();

  // First and last day of the current calendar month
  const periodStartDate = new Date(year, month, 1);
  const periodEndDate   = new Date(year, month + 1, 0);

  const periodStart = periodStartDate.toISOString().slice(0, 10);
  const periodEnd   = periodEndDate.toISOString().slice(0, 10);

  const monthLabel =
    periodStartDate.toLocaleString('en-US', { month: 'long' }) + ' ' + year;

  console.log(`[BillingCycleJob] Running for ${monthLabel}...`);

  let contracts;
  try {
    contracts = await contractRepo.findActiveContracts();
  } catch (err) {
    console.error(`[BillingCycleJob] Failed to fetch active contracts: ${err.message}`);
    return;
  }

  for (const contract of contracts) {
    try {
      const exists = await cycleRepo.cycleExists(contract.id, periodStart);

      if (exists) {
        console.log(
          `[BillingCycleJob] Cycle already exists for ${contract.contractNumber} — ${monthLabel}`,
        );
        continue;
      }

      await cycleRepo.create({
        contractId:      contract.id,
        periodStart,
        periodEnd,
        specialistUserId: null,
      });

      console.log(
        `[BillingCycleJob] Created cycle for contract ${contract.contractNumber} — ${monthLabel}`,
      );
    } catch (err) {
      console.error(
        `[BillingCycleJob] Error for contract ${contract.contractNumber}: ${err.message}`,
      );
    }
  }
}

export function startBillingCycleJob() {
  if (process.env.AUTO_BILLING_CYCLE_JOB !== 'true') {
    console.log('[BillingCycleJob] Scheduler disabled — set AUTO_BILLING_CYCLE_JOB=true to enable');
    return;
  }

  // Run immediately on server start
  autoCreateMonthlyCycles().catch(console.error);

  // Then check every hour: if it's the 1st of the month at 08:xx, run again
  setInterval(() => {
    const now = new Date();
    if (now.getDate() === 1 && now.getHours() === 8) {
      autoCreateMonthlyCycles().catch(console.error);
    }
  }, 60 * 60 * 1000);

  console.log('[BillingCycleJob] Scheduler enabled');
}
