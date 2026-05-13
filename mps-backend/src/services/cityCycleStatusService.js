import pool from '../config/db.js';
import * as repo from '../repositories/cityCycleStatusRepository.js';

async function getCitySubmissionCounts(cycleId) {
  const { rows } = await pool.query(
    `SELECT
       p.city,
       COUNT(DISTINCT p.id) AS total_printers,
       COUNT(DISTINCT mr.printer_id) AS submitted_printers
     FROM contract_printers cp
     JOIN printers p ON cp.printer_id = p.id
     JOIN billing_cycles bc ON bc.contract_id = cp.contract_id
     LEFT JOIN meter_readings mr ON mr.printer_id = p.id
       AND mr.billing_cycle_id = bc.id
     WHERE bc.id = $1
       AND (cp.assigned_until IS NULL OR cp.assigned_until >= bc.period_start)
     GROUP BY p.city
     ORDER BY p.city`,
    [cycleId],
  );
  return rows;
}

function deriveStatus(total, submitted) {
  if (submitted === 0) return 'pending';
  if (submitted >= total) return 'complete';
  return 'partial';
}

export async function syncCityStatus(cycleId) {
  const counts = await getCitySubmissionCounts(cycleId);
  const existing = await repo.findByCycleId(cycleId);
  const existingMap = Object.fromEntries(existing.map(e => [e.city, e]));

  const results = [];
  for (const row of counts) {
    const city = row.city ?? 'Unknown';
    const total = Number(row.total_printers);
    const submitted = Number(row.submitted_printers);
    const current = existingMap[city];

    // Keep confirmed status if manually set
    if (current?.status === 'confirmed') {
      results.push(current);
      continue;
    }

    const status = deriveStatus(total, submitted);
    const updated = await repo.upsert(cycleId, city, { status, totalPrinters: total, submittedPrinters: submitted });
    results.push(updated);
  }
  return results;
}

export async function canConfirmCycle(cycleId) {
  const cities = await repo.findByCycleId(cycleId);
  if (cities.length === 0) return { canConfirm: true, reason: null };

  const notReady = cities.filter(c => c.status !== 'complete' && c.status !== 'confirmed');
  if (notReady.length > 0) {
    return {
      canConfirm: false,
      reason: `${notReady.length} cities still have pending readings: ${notReady.map(c => c.city).join(', ')}`,
    };
  }
  return { canConfirm: true, reason: null };
}

export async function getCityStatuses(cycleId) {
  return repo.findByCycleId(cycleId);
}

export async function confirmCity(cycleId, city, userId) {
  const existing = await repo.findByCycleAndCity(cycleId, city);
  if (!existing) {
    const err = new Error('City not found for this billing cycle');
    err.status = 404;
    throw err;
  }
  return repo.confirmCity(cycleId, city, userId);
}

export async function resetCity(cycleId, city) {
  const counts = await getCitySubmissionCounts(cycleId);
  const cityData = counts.find(r => (r.city ?? 'Unknown') === city);
  if (!cityData) {
    const err = new Error('City not found for this billing cycle');
    err.status = 404;
    throw err;
  }
  const total = Number(cityData.total_printers);
  const submitted = Number(cityData.submitted_printers);
  const status = deriveStatus(total, submitted);
  return repo.resetCity(cycleId, city, { status, totalPrinters: total, submittedPrinters: submitted });
}
