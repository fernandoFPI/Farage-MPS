# MPS Backend — Build Conversation Log

**Date:** 2026-04-21  
**Project:** Managed Print Services (MPS) Billing System  
**Stack:** Node.js (ESM) · Express · PostgreSQL (`pg`) · JWT · multer · xlsx

---

## Project Overview

A complete MPS billing backend built phase-by-phase:

- Tracks customers, contracts, printers, and contract-printer assignments
- Captures monthly meter readings (OSG and PSG printer types)
- Computes net usage and billing amounts per billing cycle
- Imports readings from XSM Excel exports
- Auto-creates billing cycles monthly via a server-side job

---

## Architecture

```
server.js
└── src/
    ├── app.js                         Express app + route registration
    ├── middleware/
    │   ├── auth.js                    verifyToken + requirePermission(flag)
    │   └── upload.js                  multer memoryStorage, .xlsx only, 10MB
    ├── routes/
    │   ├── authRoutes.js
    │   ├── userRoutes.js
    │   ├── customerRoutes.js
    │   ├── contractRoutes.js
    │   ├── printerRoutes.js
    │   ├── contractPrinterRoutes.js
    │   ├── meterReadingRoutes.js
    │   ├── billingCycleRoutes.js
    │   └── xsmRoutes.js
    ├── controllers/                   Thin — validate input, call service, respond
    ├── services/
    │   ├── meterReadingService.js     Net calculation + validation logic
    │   ├── billingCycleService.js     State machine + billing summary
    │   ├── billingCycleJobService.js  Monthly auto-create job (setInterval)
    │   ├── netCalculationService.js   Pure OSG/PSG math functions
    │   └── xsmImportService.js        Excel parse + per-printer import loop
    └── repositories/                  Raw SQL, no ORM
```

---

## Database Migrations

| # | File | Purpose |
|---|------|---------|
| 001 | `create_roles.sql` | Roles table with permission flags |
| 002 | `create_users.sql` | Users with bcrypt password, role FK |
| 003 | `create_customers.sql` | Customer master |
| 004 | `create_contracts.sql` | Contract with pricing columns |
| 005 | `create_printers.sql` | Printer master with serial number |
| 006 | `create_contract_printers.sql` | Printer ↔ contract assignments |
| 007 | `create_billing_cycles.sql` | Billing cycle state machine table |
| 008 | `create_meter_readings.sql` | Raw + net counter readings |
| 009 | `alter_contract_printers_add_printer_type.sql` | Added `contract_type` (osg/psg) |
| 010 | `alter_meter_readings_add_psg_fields.sql` | Added `xls`, `a4_bw_net`, `a3_bw_net`, `a4_color_net`, `a3_color_net` |
| 011 | `simplify_contract_prices.sql` | Replaced 4 per-format price cols with `bw_price`, `color_price`, etc. |
| 014 | `create_xsm_import_logs.sql` | Import audit log table |

---

## Key Design Decisions

### OSG vs PSG Net Calculation (`netCalculationService.js`)

**OSG** — simple subtraction:
```
net = current - previous (raw counters)
```

**PSG** — two-step derivation:
```
Step 1 (derive net counters from raw):
  a4BwNet    = a4Bw - a3Bw
  a3BwNet    = a3Bw
  a4ColorNet = (a4Color - xls) - a3Color
  a3ColorNet = a3Color

Step 2 (subtract previous net):
  usage = currentNet - previousNet
```

### Historical Average & Spike Detection

- Fetches 4 most recent readings before `period_start`
- Computes 3 pairwise raw differences → averages them
- Returns `null` if fewer than 2 readings (spike check skipped)
- Spike threshold: 3× historical average

### Billing Cycle State Machine

```
open → confirmed | disputed
pending_confirmation → confirmed | disputed
disputed → open
```
State transitions enforced in `billingCycleService.js` only.

### Mixed OSG+PSG Contracts

When a contract has both OSG and PSG printers:
- Separate `osgUsage` and `psgUsage` accumulators
- Separate billing functions called per type
- Results merged into one response object (non-applicable fields set to 0)

### NUMERIC Columns Cast to float8

`pg` returns `NUMERIC`/`DECIMAL` columns as strings by default.  
Fix: all price/amount columns cast with `::float8` inside `json_build_object` in `billingCycleRepository.findById`.

---

## XSM Excel Import (`xsmImportService.js`)

### File Format Validation (hardcoded)

| Check | Value |
|-------|-------|
| Sheet name | `Asset with Meters` |
| Row 8, col 0 (Account Name) | `Farage Printing Industries Iraq` |

Both checks throw `400` with a descriptive error message before any DB work.

### Column Mapping

| Column Index | Field | Parsing |
|---|---|---|
| 2 | model | `safeCell()` — formula → null |
| 4 | serialNumber | `String(row[4]).trim()` — always a number in Excel |
| 8 | branch | `safeCell()` |
| 9 | location | `safeCell()` |
| 13 | endReadDate | `row[13] instanceof Date ? row[13].toISOString() : null` |
| 14 | blackA4 | `safeCell()` |
| 15 | blackA3 | `safeCell()` |
| 21 | colorA4 | `safeCell()` |
| 22 | colorA3 | `safeCell()` |

`safeCell()` treats any string starting with `=` as an unresolved formula and returns `null`.

### Import Flow

```
parseSheet(buffer)
  → validate sheet name
  → validate account name (row 8 col 0)
  → group by serial, keep latest endReadDate per printer

For each parsed row:
  1. Find printer by serial number
  2. Check xsmEnabled flag
  3. Find active contract assignment (as of periodStart)
  4. Auto-create billing cycle if missing
  5. Skip if cycle is confirmed/disputed/invoiced
  6. Guard against duplicate XSM reading (source='xsm' + billingCycleId)
  7. createReading() via meterReadingService (reuses net calc + spike detection)
  8. Accumulate match/unmatch/flag/skip counters

Log the import to xsm_import_logs
Return summary + errors[]
```

---

## Monthly Billing Cycle Job (`billingCycleJobService.js`)

```javascript
export function startBillingCycleJob() {
  autoCreateMonthlyCycles().catch(console.error);          // run on startup
  setInterval(() => {
    const now = new Date();
    if (now.getDate() === 1 && now.getHours() === 8)       // 1st of month 08:xx
      autoCreateMonthlyCycles().catch(console.error);
  }, 60 * 60 * 1000);                                      // checks every hour
}
```

- Fetches all active contracts
- Creates a billing cycle for the current calendar month if one doesn't already exist
- Skips contracts that already have a cycle for the period

---

## API Routes

| Method | Path | Permission |
|--------|------|------------|
| POST | `/api/auth/login` | public |
| GET/POST/PATCH/DELETE | `/api/users` | `can_manage_users` |
| CRUD | `/api/customers` | `can_manage_billing` |
| CRUD | `/api/contracts` | `can_manage_billing` |
| CRUD | `/api/printers` | `can_manage_billing` |
| CRUD | `/api/contract-printers` | `can_manage_billing` |
| POST/GET | `/api/meter-readings` | `can_manage_billing` |
| GET/POST/PATCH | `/api/billing-cycles` | `can_manage_billing` |
| POST | `/api/xsm/import` | `can_manage_billing` |
| GET | `/api/xsm/logs` | `can_manage_billing` |
| GET | `/api/xsm/logs/:id` | `can_manage_billing` |
| GET | `/health` | public |

---

## Notable Fixes Made During Build

| Issue | Fix |
|-------|-----|
| `printer_type` renamed to `contract_type` | Updated migration 009, repository mapRow/columnMap/INSERT, service error message, controller destructuring |
| NUMERIC prices returning as JS strings | `::float8` cast in `billingCycleRepository.findById` `json_build_object` |
| XSM serial number was run through formula check | Read `row[4]` directly, skip `safeCell()` |
| XSM date fallback to `String(val)` | Use `instanceof Date` check → `.toISOString()` only |
| No account name validation on import | Added check: `allRows[7][0] !== 'Farage Printing Industries Iraq'` → 400 |
