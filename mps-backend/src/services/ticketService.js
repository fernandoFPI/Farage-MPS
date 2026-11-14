import * as draftRepo from '../repositories/ticketDraftRepository.js';
import * as cycleRepo from '../repositories/billingCycleRepository.js';
import * as printerRepo from '../repositories/printerRepository.js';
import * as cpRepo from '../repositories/contractPrinterRepository.js';
import * as readingRepo from '../repositories/meterReadingRepository.js';
import * as printerService from './printerService.js';
import { createReading } from './meterReadingService.js';
import { createConsumableReading } from './consumableReadingService.js';
import { updateCustomerStorage } from './customerStorageService.js';
import { syncCityStatus } from './cityCycleStatusService.js';
import { unlockPrinter } from './billingCycleService.js';

const WRITABLE_STATUSES = ['open', 'pending_confirmation'];
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
const MAX_PHOTOS = 5;
const MAX_DRAFT_BYTES = 9 * 1024 * 1024; // stays under express.json's 10 MB body limit

const BW_PCT_KEYS    = ['kPct', 'r1Pct', 'wasteTonePct'];
const COLOR_PCT_KEYS = ['cPct', 'mPct', 'yPct', 'kPct', 'r1Pct', 'r2Pct', 'r3Pct', 'r4Pct', 'wasteTonePct'];
const QTY_KEYS       = ['cQty', 'mQty', 'yQty', 'kQty', 'r1Qty', 'r2Qty', 'r3Qty', 'r4Qty', 'wasteTonQty'];

function httpError(status, message, extra) {
  const err = new Error(message);
  err.status = status;
  if (extra) Object.assign(err, extra);
  return err;
}

const isAdmin = user => user?.role?.name === 'admin';

async function loadCycle(billingCycleId) {
  const cycle = await cycleRepo.findById(billingCycleId);
  if (!cycle) throw httpError(404, 'Billing cycle not found');
  return cycle;
}

async function loadPrinter(printerId) {
  const printer = await printerRepo.findById(printerId);
  if (!printer) throw httpError(404, 'Printer not found');
  return printer;
}

function requireWritableCycle(cycle) {
  if (!WRITABLE_STATUSES.includes(cycle.status)) {
    throw httpError(400, 'Billing cycle is closed');
  }
}

// pg returns DATE columns as local-midnight Date objects; read them with local
// getters so the calendar day never shifts with the server timezone.
function ymd(v) {
  if (v instanceof Date) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  }
  return String(v).slice(0, 10);
}

// Same active-assignment rule the Tickets page uses to list a cycle's printers.
async function activeAssignments(cycle) {
  const ref = ymd(cycle.periodStart);
  const all = await cpRepo.findAll({ contractId: cycle.contractId });
  return all.filter(a => !a.assignedUntil || ymd(a.assignedUntil) >= ref);
}

function locationOf(printer) {
  return (printer.location ?? '').trim();
}

// ── Context (drafts + which locations already have stock this cycle) ──────────

export async function getContext(billingCycleId) {
  const cycle = await loadCycle(billingCycleId);
  const customerId = cycle.contract?.customer?.id;
  const [drafts, stockLocations] = await Promise.all([
    draftRepo.findSummariesByCycle(billingCycleId),
    customerId ? draftRepo.findStockLocationsForCycle(billingCycleId, customerId) : [],
  ]);
  return { drafts, stockLocations };
}

// ── Drafts ────────────────────────────────────────────────────────────────────

function validateDraftPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw httpError(400, 'Draft payload must be an object');
  }
  const photos = payload.photos ?? [];
  if (!Array.isArray(photos) || photos.length > MAX_PHOTOS) {
    throw httpError(400, `A draft can hold at most ${MAX_PHOTOS} photos`);
  }
  for (const [i, p] of photos.entries()) {
    if (!p?.data || !ALLOWED_MIME_TYPES.includes(p?.mimeType)) {
      throw httpError(400, `Photo ${i + 1}: unsupported or missing image data`);
    }
  }
  if (Buffer.byteLength(JSON.stringify(payload)) > MAX_DRAFT_BYTES) {
    throw httpError(413, 'Draft is too large — remove a photo and try again');
  }
}

async function assertDraftAccess(cycleId, printerId, user) {
  const existing = await draftRepo.findOne(cycleId, printerId);
  if (existing && existing.savedByUserId !== user.id && !isAdmin(user)) {
    throw httpError(403, `This ticket is a draft saved by ${existing.savedByName} — only they or an admin can change it`);
  }
  return existing;
}

export async function saveDraft({ billingCycleId, printerId, payload }, user) {
  if (!billingCycleId || !printerId) throw httpError(400, 'billingCycleId and printerId are required');
  validateDraftPayload(payload);

  const [cycle] = await Promise.all([loadCycle(billingCycleId), loadPrinter(printerId)]);
  requireWritableCycle(cycle);

  if (await readingRepo.existsForPrinterAndCycle(printerId, billingCycleId)) {
    throw httpError(409, 'A reading was already submitted for this printer in this cycle');
  }
  await assertDraftAccess(billingCycleId, printerId, user);

  await draftRepo.upsert({ billingCycleId, printerId, userId: user.id, payload });

  // A draft must not keep the printer locked for the rest of the lock window.
  try { await unlockPrinter(billingCycleId, printerId, user.id); } catch { /* lock expires on its own */ }

  return { message: 'Draft saved' };
}

export async function getDraft(billingCycleId, printerId, user) {
  const draft = await draftRepo.findOne(billingCycleId, printerId);
  if (!draft) throw httpError(404, 'Draft not found');
  if (draft.savedByUserId !== user.id && !isAdmin(user)) {
    throw httpError(403, `This ticket is a draft saved by ${draft.savedByName}`);
  }
  return draft;
}

export async function deleteDraft(billingCycleId, printerId, user) {
  await assertDraftAccess(billingCycleId, printerId, user);
  await draftRepo.deleteByCycleAndPrinter(billingCycleId, printerId);
  return { message: 'Draft discarded' };
}

// ── Final submission ──────────────────────────────────────────────────────────

function validateConsumables(consumables, isBwOnly) {
  const required = isBwOnly ? BW_PCT_KEYS : COLOR_PCT_KEYS;
  const clean = {};
  for (const key of required) {
    const n = Number(consumables?.[key]);
    if (consumables?.[key] === '' || consumables?.[key] == null || !Number.isInteger(n) || n < 0 || n > 100) {
      throw httpError(422, 'Consumable levels are required for every item (whole numbers from 0 to 100)');
    }
    clean[key] = n;
  }
  return clean;
}

export async function submitTicket(body, user) {
  const { printerId, billingCycleId, photos, storage, coordinates } = body ?? {};
  if (!printerId || !billingCycleId) throw httpError(400, 'printerId and billingCycleId are required');

  const [cycle, printer] = await Promise.all([loadCycle(billingCycleId), loadPrinter(printerId)]);
  requireWritableCycle(cycle);

  if (await readingRepo.existsForPrinterAndCycle(printerId, billingCycleId)) {
    throw httpError(409, 'A reading was already submitted for this printer in this cycle');
  }
  // Another engineer's draft blocks a fresh submission for the same printer.
  await assertDraftAccess(billingCycleId, printerId, user);

  // ── Validate everything BEFORE writing anything ──
  if (!Array.isArray(photos) || photos.length === 0) {
    throw httpError(400, 'At least one photo is required');
  }

  const pctData = validateConsumables(body.consumables, printer.isBwOnly);

  const hasCoords = printer.latitude != null && printer.longitude != null;
  const gotCoords = coordinates && Number.isFinite(Number(coordinates.latitude)) && Number.isFinite(Number(coordinates.longitude));
  if (!hasCoords && !gotCoords) {
    throw httpError(400, 'The printer location is required (capture GPS or drop a pin)');
  }

  const customerId = cycle.contract?.customer?.id;
  const location = locationOf(printer);
  const updates = Array.isArray(storage?.updates) ? storage.updates : [];

  // Only real stock quantities count. A "stock unavailable" reason never satisfies this:
  // that ticket is held as a draft until the quantities are entered.
  const stockLocations = customerId ? await draftRepo.findStockLocationsForCycle(billingCycleId, customerId) : [];
  const alreadyCovered = stockLocations.includes(location);

  let storageMode;
  if (updates.length > 0) {
    storageMode = 'stock';
    // Stock must cover every printer model at this location, so it is complete.
    const here = (await activeAssignments(cycle)).filter(a => locationOf(a.printer ?? {}) === location);
    const modelsHere = [...new Set(here.map(a => a.printer?.model).filter(Boolean))];
    const given = new Set(updates.map(u => u.printerModel));
    const missing = modelsHere.filter(m => !given.has(m));
    if (missing.length > 0) {
      throw httpError(422, `Stock is missing for: ${missing.join(', ')}`);
    }
  } else if (alreadyCovered) {
    storageMode = 'covered';
  } else {
    throw httpError(422, 'Stock quantities are required to submit this ticket. If stock is not available yet, save the ticket as a draft and submit it once the stock is entered');
  }

  // ── Write: reading first (it validates counters and the lock), then the rest ──
  const reading = await createReading({
    printerId,
    billingCycleId,
    source: 'manual',
    a4Bw: body.a4Bw,
    a3Bw: body.a3Bw,
    a4Color: body.a4Color,
    a3Color: body.a3Color,
    xls: body.xls,
    photos,
    readAt: body.readAt,
    lockAcquiredAt: body.lockAcquiredAt,
  }, user.id);

  try {
    await createConsumableReading({
      meterReadingId: reading.id,
      printerId,
      billingCycleId,
      ...pctData,
    }, user.id);

    if (storageMode === 'stock') {
      await Promise.all(updates.map(u => {
        const qty = {};
        for (const k of QTY_KEYS) qty[k] = u[k];
        return updateCustomerStorage(customerId, u.printerModel, { ...qty, location, billingCycleId }, user.id);
      }));
      await cycleRepo.markStorageSubmitted(billingCycleId, user.id, null);
    }
  } catch (err) {
    // Roll the reading back (consumable_readings cascades) so a half-saved ticket never exists.
    await readingRepo.deleteById(reading.id).catch(() => {});
    syncCityStatus(billingCycleId).catch(() => {});
    throw err;
  }

  // Non-fatal: the reading is already complete without it.
  let locationSaved = false;
  if (gotCoords && body.saveCoordinates !== false) {
    try {
      await printerService.updatePrinter(printerId, {
        latitude: Number(coordinates.latitude),
        longitude: Number(coordinates.longitude),
      });
      locationSaved = true;
    } catch { /* surfaced to the client as locationSaved: false */ }
  }

  await draftRepo.deleteByCycleAndPrinter(billingCycleId, printerId);

  return { ...reading, consumablesSaved: true, stockMode: storageMode, locationSaved };
}
