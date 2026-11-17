import * as cycleRepo from '../repositories/billingCycleRepository.js';

// A locked billing cycle serves a frozen snapshot of its figures, so anything that would change
// those figures (unconfirm, readings, period, baseline, manual amount, cancel/delete) must be
// refused until an admin unlocks it. 423 Locked, same shape as every other service error.
export function cycleLockedError() {
  const err = new Error('This billing cycle is locked. An admin must unlock it before it can be changed.');
  err.status = 423;
  return err;
}

// Accepts a cycle object (already loaded — free) or a cycle id (one cheap lookup).
// Missing cycles are left for the caller's own "not found" handling.
export async function assertCycleNotLocked(cycleOrId) {
  const cycle = cycleOrId && typeof cycleOrId === 'object'
    ? cycleOrId
    : await cycleRepo.findById(cycleOrId);
  if (cycle?.isLocked) throw cycleLockedError();
}
