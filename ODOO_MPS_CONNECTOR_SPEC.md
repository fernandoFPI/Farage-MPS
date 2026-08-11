# MPS × Odoo Integration — Complete Implementation Spec
**For: Future Claude session tasked with building the Odoo connector module**
**Source documents: MPS_Odoo_Integration_API_v3.docx + Amendment v3.1 (August 2026)**
**MPS Platform:** https://mps.farage.com/api
**Last updated:** 2026-08-11

---

## PRE-FLIGHT: Open Questions (resolve before writing a single line of Odoo code)

### Q1 — Service account credentials
The API docs list example credentials (redacted here — do not commit real credentials to source control). The MPS codebase seeds the `odoo_integration` **role** but seeds **no users** — the actual user account must be created manually through the MPS admin UI (Users page → create user, assign `odoo_integration` role). Before starting:
- Log in to the MPS platform as admin → Users → confirm whether the service account exists
- If it doesn't exist, create it with a strong random password (24+ chars)
- Set `mps.service_email` and `mps.service_password` in Odoo `ir.config_parameter` immediately after — never put credentials in code

### Q2 — Network reachability
`https://mps.farage.com` must be reachable from wherever the Odoo cron job runs. Confirm:
- From the Odoo server: `curl -I https://mps.farage.com/api/auth/login` (expect 404 or 400, not timeout)
- If MPS runs on the internal network (e.g. `192.168.20.230` in production), the DNS name may not resolve externally — check with the network team before assuming the FQDN works

### Q3 — Staging environment
No staging MPS environment is known to exist. Calling `/odoo-export` has a real side effect — it flips the cycle's sync status to `pending` in MPS. For first-end-to-end testing, pick ONE low-stakes confirmed cycle and test against production carefully. Verify the cycle ID is for a small customer and check the MPS Operations Monitor after to confirm the status changed to `pending` as expected.

### Q4 — UUID bulk mapping (one-time setup)
There is no `/api/customers` list endpoint for Odoo. Run these queries directly against the MPS PostgreSQL DB to get the UUIDs needed to populate the custom fields in Odoo:

```sql
-- Customers (→ res.partner.x_mps_customer_id)
-- Note: customers has no is_active column — rows are hard-deleted when removed
SELECT id, name FROM customers ORDER BY name;

-- Contracts (→ account.analytic.account.x_mps_contract_id)
SELECT co.id, co.contract_number, co.official_contract_number, cu.name AS customer_name
FROM contracts co
JOIN customers cu ON co.customer_id = cu.id
WHERE co.is_active = true
ORDER BY cu.name, co.contract_number;

-- Printers (→ maintenance.equipment.x_mps_printer_id)
SELECT p.id, p.serial_number, p.model, p.city, cu.name AS customer_name
FROM printers p
JOIN contract_printers cp ON cp.printer_id = p.id
JOIN contracts co ON cp.contract_id = co.id
JOIN customers cu ON co.customer_id = cu.id
WHERE co.is_active = true AND (cp.assigned_until IS NULL OR cp.assigned_until >= CURRENT_DATE)
ORDER BY cu.name, p.serial_number;
```

Export as CSV and use Odoo's import feature or a bulk-write script to set the `x_mps_*` fields.

### Q5 — Confirmed uninvoiced cycle for end-to-end test
Check what cycles are ready:
```sql
SELECT bc.id, bc.status, bc.odoo_status, co.contract_number, cu.name, bc.period_start, bc.period_end
FROM billing_cycles bc
JOIN contracts co ON bc.contract_id = co.id
JOIN customers cu ON co.customer_id = cu.id
WHERE bc.status = 'confirmed'
  AND bc.odoo_invoice_id IS NULL
  AND bc.is_cancelled = false
  AND bc.deleted_at IS NULL
ORDER BY bc.period_end DESC;
```

---

## KNOWN MISMATCH — Company Name Case (fix before go-live)

**MPS enforces** `['FPI', 'AL Farage']` as the only valid values (validated in `contractService.js`).
**Odoo has** `FPI` ✅ and `Al Farage` ❌ (different casing — capital `AL` vs `Al`).

A direct name search will silently miss `"AL Farage"` and fall back to the default company with only a log warning — no crash, no visible error, wrong company on the invoice.

**Resolution options (pick one):**
1. **Rename** the Odoo company from `Al Farage` to `AL Farage` (Settings → Companies) — exact match, no code needed
2. **Use the explicit mapping dict in the Python code** (see §4 below) — safer, survives any future rename

The spec uses option 2 (explicit mapping) so the Odoo company names don't have to match MPS exactly. Update the dict if company names change.

---

## 0. What You Are Building

An Odoo custom module (`mps_connector`) that syncs confirmed billing cycles from the MPS Managed Print Services platform into Odoo Sale Orders. MPS is the source of truth for print data. Odoo is the source of truth for accounting. The integration is **pull-only** — Odoo polls MPS on a schedule; MPS never pushes to Odoo.

The module must handle:
- Single-SO contracts (one Sale Order per billing cycle)
- Multi-SO contracts (2 or 3 Sale Orders per cycle, split by charge type)
- Company routing (FPI or AL Farage)
- Per-SO acknowledgement back to MPS
- Idempotency (safe to re-run if a cron job crashes mid-way)

---

## 1. MPS API Reference

### 1.1 Auth

```
POST https://mps.farage.com/api/auth/login
Content-Type: application/json

{ "email": "<mps.service_email from ir.config_parameter>", "password": "<mps.service_password>" }

Response:
{ "token": "<JWT>", "user": { "id": "...", "role": "odoo_integration", "email": "..." } }
```

Use the token as `Authorization: Bearer <token>` on every subsequent request.
- Token expires server-side — catch HTTP 401, re-login, retry once.
- **Never log the token.**
- Store credentials in Odoo `ir.config_parameter` (`mps.service_email`, `mps.service_password`).

### 1.2 Rate Limits

- 100 requests per 15-minute window (shared across all Odoo-accessible endpoints)
- HTTP 429 on breach — honour `Retry-After` header (seconds)
- No burst tolerance

### 1.3 Error Format

All 4xx/5xx responses return:
```json
{ "error": "Human-readable description" }
```

| Status | Meaning | Action |
|--------|---------|--------|
| 200 | Success | Process normally |
| 400 | Bad request | Fix before retrying — do NOT auto-retry |
| 401 | Expired/missing token | Re-login and retry once |
| 403 | Wrong role or blocked endpoint | Alert admin — misconfiguration |
| 404 | Cycle not found (may have been deleted) | Skip, log warning |
| 409 | `mark-invoiced` called on already-invoiced cycle | Treat as success |
| 429 | Rate limit | Wait `Retry-After` seconds |
| 500 | Server fault | Wait 60s, retry once, then alert |

---

### 1.4 Endpoints

#### GET /api/billing-cycles
**Entry point.** Returns confirmed + uninvoiced cycles (scoped automatically for `odoo_integration` role).

Response (array):
```json
[
  {
    "id":             "550e8400-e29b-41d4-a716-446655440000",
    "cycleName":      "Acme Corp — June 2026",
    "contractNumber": "CTR-0042",
    "customerName":   "Acme Corporation",
    "periodStart":    "2026-05-04",
    "periodEnd":      "2026-06-03",
    "status":         "confirmed"
  }
]
```

---

#### GET /api/billing-cycles/:id/odoo-export
**Primary integration endpoint.** Calling this automatically sets the cycle's sync status to `pending` in MPS.

Full response shape:
```json
{
  "exportedAt": "2026-06-30T09:15:42.310Z",
  "cycle": {
    "id":          "a1b2c3d4-0000-0000-0000-111122223333",
    "name":        "Acme Corporation — June 2026",
    "periodStart": "2026-05-04",
    "periodEnd":   "2026-06-03",
    "status":      "confirmed"
  },
  "contract": {
    "id":                    "c0c0c0c0-aaaa-bbbb-cccc-ddddeeee0001",
    "contractNumber":         "CTR-0042",
    "officialContractNumber": "PO-2024-009",
    "serviceType":            "FSMA",
    "contractMode":           "osg",
    "odoo_company":           "FPI"
  },
  "customer": {
    "id":   "d1d2d3d4-1111-2222-3333-444455556666",
    "name": "Acme Corporation"
  },
  "billing": {
    "totalBillableBw":    12450,
    "totalBillableColor": 3820,
    "grandTotal":         487.50,
    "invoiceLines": [ ... ],
    "orders": [
      {
        "orderType": "fixed_charge",
        "label":     "Fixed Charges — Jun 2026",
        "subtotal":  291.10,
        "lines": [
          {
            "type":        "fixed_charge",
            "description": "Fixed Charge — Bizhub C368 (SN: A8F2019482) — Jun 2026",
            "qty":         1,
            "unitPrice":   291.10,
            "subtotal":    291.10
          }
        ]
      },
      {
        "orderType": "bw_clicks",
        "label":     "BW Impressions — Jun 2026",
        "subtotal":  98.00,
        "lines": [
          {
            "type":        "bw_clicks",
            "description": "BW Impressions — Bizhub C368 (SN: A8F2019482) — Jun 2026",
            "qty":         2450,
            "unitPrice":   0.04,
            "subtotal":    98.00
          }
        ]
      },
      {
        "orderType": "color_clicks",
        "label":     "Color Impressions — Jun 2026",
        "subtotal":  98.40,
        "lines": [ ... ]
      }
    ]
  },
  "printers": [
    {
      "id":           "eeeeeeee-ffff-0000-aaaa-bbbbccccdddd",
      "serialNumber": "A8F2019482",
      "model":        "Bizhub C368",
      "isBwOnly":     false,
      "engineer":     { "id": "uuid", "name": "Ahmad Al-Rashidi" },
      "pagesUsed":    { "a4Bw": 3820, "a3Bw": 640, "a4Color": 1910, "a3Color": 210 },
      "billable":     { "bw": 4460, "color": 2120 },
      "toner":        { "c": 68.0, "m": 72.5, "y": 81.0, "k": 55.3, "r1": 90.0, "r2": 88.0, "r3": null, "r4": null },
      "flagged":      false,
      "flagReason":   null
    }
  ],
  "engineerPerformance": [
    {
      "id":                    "uuid",
      "name":                  "Ahmad Al-Rashidi",
      "readingsInCycle":       3,
      "avgDurationSeconds":    142,
      "readingsWithPhotos":    3,
      "readingsWithoutPhotos": 0,
      "flaggedReadings":       0
    }
  ]
}
```

**Key notes on `billing.orders`:**
- Always iterate the actual array — never assume a fixed count
- Empty SOs are omitted (e.g. no colour usage → no `color_clicks` entry)
- Quarterly fixed charges: the fixed-charge SO only appears in the billing month; deferred months only have usage SOs
- `billing.invoiceLines` is still present for backward compatibility (single-SO legacy path)

**`contractMode` values and what they mean:**
| contractMode | invoiceLine type(s) | Meaning |
|---|---|---|
| `osg` | `osg_default` + optional `osg_override` | All printers pool volume; one line covers the group |
| `psg` | `psg` | Each printer billed individually by A4/A3 |
| `psg_simple` | `psg_simple` | Like OSG but uses excess counters |

---

#### POST /api/billing-cycles/:id/mark-invoiced
**Single-SO contracts only.** After creating the invoice in Odoo, acknowledge MPS.

```json
POST /api/billing-cycles/a1b2c3d4-.../mark-invoiced
{ "odooInvoiceId": "INV/2026/00182" }

Response 200:
{
  "message":       "Billing cycle marked as invoiced",
  "cycleId":       "a1b2c3d4-...",
  "odooInvoiceId": "INV/2026/00182",
  "invoicedAt":    "2026-06-30T09:17:05.000Z",
  "cycleName":     "Acme Corporation — June 2026"
}
```

- HTTP 409 = already invoiced → treat as success (idempotent)
- **Do NOT call for multi-SO cycles** — use `/callback` instead

---

#### POST /api/odoo/callback
**Multi-SO contracts.** Call once per SO in `billing.orders`, immediately after creation or failure.

```json
POST /api/odoo/callback
Authorization: Bearer <token>
Content-Type: application/json

{
  "cycleId":      "a1b2c3d4-0000-0000-0000-111122223333",
  "orderType":    "fixed_charge",
  "status":       "synced",
  "odooRef":      "S00042",
  "errorCode":    null,
  "errorMessage": null
}
```

On failure:
```json
{
  "cycleId":      "a1b2c3d4-...",
  "orderType":    "bw_clicks",
  "status":       "error",
  "odooRef":      null,
  "errorCode":    "PROD_NOT_FOUND",
  "errorMessage": "Product with ref BW-CLICK-IQD not found in company FPI"
}
```

Response 200:
```json
{
  "cycleId":    "a1b2c3d4-...",
  "odooStatus": "partial",
  "orders": [
    { "orderType": "fixed_charge",  "status": "synced",  "odooRef": "S00042", "syncedAt": "..." },
    { "orderType": "bw_clicks",     "status": "error",   "odooRef": null,     "syncedAt": "..." },
    { "orderType": "color_clicks",  "status": "pending", "odooRef": null,     "syncedAt": null }
  ]
}
```

**`orderType` values:**
| orderType | Split mode | Contains |
|---|---|---|
| `all` | `single` | Fixed + BW + Colour combined |
| `fixed_charge` | `fixed_separate`, `all_separate` | Fixed charges only |
| `clicks` | `fixed_separate` | BW + Colour clicks combined |
| `bw_clicks` | `all_separate` | BW impressions only |
| `color_clicks` | `all_separate` | Colour impressions only |

**Aggregate `odooStatus` logic:**
- All SOs synced → `synced`
- All SOs errored → `error`
- Any SO still pending → `pending`
- Mix of synced + error → `partial`

Idempotent: calling callback again for the same `cycleId + orderType` overwrites the previous result. Safe to retry.

---

#### POST /api/odoo/resolution-error
**New (2026-08-11).** For failures that happen *before* any Sale Order can be determined — the MPS customer, contract, or company couldn't be resolved to an Odoo record at all. Deliberately separate from `/odoo/callback`: there's no real `orderType` to attach a pre-flight failure to, and forcing one through `/odoo/callback` would leave a stale error entry in `odoo_orders` forever once the mapping is fixed and the cycle later syncs successfully (nothing would ever overwrite that entry — callbacks only replace entries matching their own `orderType`).

```json
POST /api/odoo/resolution-error
Authorization: Bearer <token>
Content-Type: application/json

{
  "cycleId":      "a1b2c3d4-...",
  "errorCode":    "UNMAPPED_CUSTOMER",
  "errorMessage": "No Odoo partner mapped to MPS customer 'Acme Corporation' (d1d2d3d4-...). Set x_mps_customer_id on the correct res.partner record."
}
```

`errorCode` is one of `UNMAPPED_CUSTOMER`, `UNMAPPED_CONTRACT`, `UNMAPPED_COMPANY` (informational — not validated server-side).

Response 200:
```json
{ "cycleId": "a1b2c3d4-...", "odooStatus": "error" }
```

Effect: writes a `success = false` row to `invoice_logs` (visible in the Operations Monitor's existing error-log detail) and sets `billing_cycles.odoo_status = 'error'` directly. Does **not** touch `odoo_orders` — the next real `/odoo/callback` call, once the mapping is fixed and the cycle actually syncs, recomputes `odoo_status` fresh from `odoo_orders` as normal and naturally supersedes this.

The "Odoo Sync Log" page (`OdooSyncPage.jsx`) now surfaces this: `getSyncLog()` returns a `resolutionError` string (the latest unresolved `invoice_logs` message) whenever `odooOrders` is still empty, and the sync log row shows it under "Sync never started: …" instead of the generic "No sync records yet" placeholder.

---

#### GET /api/billing-cycles/:id/summary
Lightweight billing summary — aggregate totals only, no per-printer data. Use for quick validation if needed; not required in main flow.

#### GET /api/performance/engineers
All-time engineer performance. Returns: `userId`, `fullName`, `email`, `totalReadings`, `totalCycles`, `avgDurationSeconds`, `minDurationSeconds`, `maxDurationSeconds`, `readingsWithPhotos`, `readingsWithoutPhotos`, `flaggedReadings`, `lastSubmissionAt`.

#### GET /api/performance/engineers/:id
Single engineer. Same fields plus `recentReadings` (up to 50). Filterable by `cycleId`, `from`, `to` query params.

---

## 2. Odoo Module Structure

```
mps_connector/
├── __init__.py
├── __manifest__.py
├── models/
│   ├── __init__.py
│   ├── mps_sync.py           ← main sync logic + cron entry point
│   ├── res_partner_ext.py    ← x_mps_customer_id field
│   ├── analytic_ext.py       ← x_mps_contract_id field
│   ├── maintenance_ext.py    ← x_mps_printer_id + toner fields
│   └── account_move_ext.py   ← x_mps_cycle_id + x_mps_order_type fields
└── data/
    └── mps_cron.xml          ← scheduled action
```

### `__manifest__.py`
```python
{
    'name': 'MPS Connector',
    'version': '1.0',
    'category': 'Accounting',
    'depends': ['account', 'analytic', 'maintenance', 'sale'],
    'data': ['data/mps_cron.xml'],
    'installable': True,
}
```

---

## 3. Custom Fields

### res.partner (`res_partner_ext.py`)
```python
from odoo import models, fields

class ResPartner(models.Model):
    _inherit = "res.partner"
    x_mps_customer_id = fields.Char(
        string="MPS Customer UUID",
        help="Stable UUID from MPS — maps this partner to an MPS customer"
    )
```
**Usage:** Before go-live, open each customer in Odoo → set `x_mps_customer_id` to the UUID from MPS.

### account.analytic.account (`analytic_ext.py`)
```python
from odoo import models, fields

class AnalyticAccount(models.Model):
    _inherit = "account.analytic.account"
    x_mps_contract_id = fields.Char(
        string="MPS Contract UUID",
        help="MPS contract UUID — maps this analytic account to an MPS contract"
    )
```
**Usage:** Each MPS contract needs a corresponding analytic account in Odoo with this UUID set.

### maintenance.equipment (`maintenance_ext.py`)
```python
from odoo import models, fields

class MaintenanceEquipment(models.Model):
    _inherit = "maintenance.equipment"
    x_mps_printer_id = fields.Char(string="MPS Printer UUID")
    x_toner_c  = fields.Float(string="Toner Cyan %")
    x_toner_m  = fields.Float(string="Toner Magenta %")
    x_toner_y  = fields.Float(string="Toner Yellow %")
    x_toner_k  = fields.Float(string="Toner Black %")
    x_toner_r1 = fields.Float(string="Drum R1 %")
    x_toner_r2 = fields.Float(string="Drum R2 %")
```
**Usage:** Optional but recommended. Set `x_mps_printer_id` on each printer's maintenance.equipment record to keep toner levels current automatically.

### account.move (`account_move_ext.py`)
```python
from odoo import models, fields

class AccountMove(models.Model):
    _inherit = "account.move"
    x_mps_cycle_id   = fields.Char(
        string="MPS Cycle UUID",
        help="MPS billing cycle UUID — used for idempotency checks"
    )
    x_mps_order_type = fields.Char(
        string="MPS Order Type",
        help="all | fixed_charge | clicks | bw_clicks | color_clicks"
    )
```
**Critical:** `x_mps_cycle_id` is the idempotency key. Always search for an existing `account.move` with this field before creating a new one.

---

## 4. Company Routing

MPS sends `contract.odoo_company` as either `"FPI"`, `"AL Farage"`, or `null`.
The Odoo company names may not match these strings exactly (see KNOWN MISMATCH above).

**Use an explicit mapping dict** — never do a raw name search:

```python
# At module level in mps_sync.py
# Key = what MPS sends, Value = exact Odoo company name (Settings → Companies)
MPS_COMPANY_MAP = {
    'FPI':       'FPI',
    'AL Farage': 'Al Farage',   # MPS sends "AL Farage"; Odoo is named "Al Farage"
}
```

Then in `_process_cycle`:
```python
odoo_company_name = data["contract"].get("odoo_company")  # "FPI", "AL Farage", or None
company = None
if odoo_company_name:
    odoo_name = MPS_COMPANY_MAP.get(odoo_company_name)
    if odoo_name:
        company = self.env["res.company"].search([("name", "=", odoo_name)], limit=1)
    if not company:
        raise UserError(
            f"MPS company '{odoo_company_name}' could not be resolved to an Odoo company. "
            f"Check MPS_COMPANY_MAP in mps_sync.py and verify Settings → Companies."
        )
```

**Raise, don't warn** — silently falling back to the default company creates invoices in the wrong entity with no audit trail.

All SOs within the same cycle go to the same company (read once from the export, apply to all).

---

## 5. System Parameters (ir.config_parameter)

Set these in Odoo → Settings → Technical → Parameters → System Parameters:

| Key | Value |
|-----|-------|
| `mps.service_email` | The MPS service account email (see team password manager) |
| `mps.service_password` | The MPS service account password (see team password manager) |

**Never hardcode credentials in Python source.**

---

## 6. Complete Python Implementation

### `models/mps_sync.py`

```python
import logging
import requests
from odoo import models, fields, api
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)

MPS_BASE = "https://mps.farage.com/api"
TIMEOUT  = 30  # seconds per HTTP request

# MPS sends these exact strings. Map them to the actual Odoo company name.
# If Odoo company names change, update this dict.
MPS_COMPANY_MAP = {
    'FPI':       'FPI',
    'AL Farage': 'Al Farage',   # MPS enforces "AL Farage"; Odoo company is named "Al Farage"
}


class MpsSync(models.Model):
    _name        = "mps.sync"
    _description = "MPS Platform Billing Sync"

    # ── Auth ──────────────────────────────────────────────────────────────────

    def _get_credentials(self):
        cfg      = self.env["ir.config_parameter"].sudo()
        email    = cfg.get_param("mps.service_email")
        password = cfg.get_param("mps.service_password")
        if not email or not password:
            raise UserError("MPS service credentials not configured in ir.config_parameter.")
        return email, password

    def _login(self) -> str:
        email, password = self._get_credentials()
        resp = requests.post(
            f"{MPS_BASE}/auth/login",
            json={"email": email, "password": password},
            timeout=TIMEOUT,
        )
        resp.raise_for_status()
        return resp.json()["token"]

    def _headers(self, token: str) -> dict:
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # ── Entity resolution ─────────────────────────────────────────────────────

    def _resolve_partner(self, mps_customer_id: str):
        p = self.env["res.partner"].search(
            [("x_mps_customer_id", "=", mps_customer_id)], limit=1
        )
        if not p:
            raise UserError(
                f"No Odoo partner mapped to MPS customer {mps_customer_id}. "
                f"Set x_mps_customer_id on the correct res.partner record."
            )
        return p

    def _resolve_analytic(self, mps_contract_id: str):
        a = self.env["account.analytic.account"].search(
            [("x_mps_contract_id", "=", mps_contract_id)], limit=1
        )
        if not a:
            raise UserError(
                f"No analytic account mapped to MPS contract {mps_contract_id}. "
                f"Set x_mps_contract_id on the correct account.analytic.account record."
            )
        return a

    def _resolve_printer(self, mps_printer_id: str):
        # Optional — returns None if not mapped; toner update is skipped
        return self.env["maintenance.equipment"].search(
            [("x_mps_printer_id", "=", mps_printer_id)], limit=1
        ) or None

    # ── Idempotency ───────────────────────────────────────────────────────────

    def _already_processed(self, mps_cycle_id: str) -> bool:
        """True if ANY account.move already exists for this cycle."""
        return bool(
            self.env["account.move"].search(
                [("x_mps_cycle_id", "=", mps_cycle_id)], limit=1
            )
        )

    # ── Cron entry point ──────────────────────────────────────────────────────

    @api.model
    def sync_billing_cycles(self):
        """Scheduled action entry point. Safe to call manually or from cron."""
        token   = self._login()
        headers = self._headers(token)

        # Poll for confirmed, uninvoiced cycles
        resp = requests.get(f"{MPS_BASE}/billing-cycles", headers=headers, timeout=TIMEOUT)
        if resp.status_code == 401:
            token   = self._login()
            headers = self._headers(token)
            resp    = requests.get(f"{MPS_BASE}/billing-cycles", headers=headers, timeout=TIMEOUT)
        resp.raise_for_status()

        cycles = resp.json()
        if not cycles:
            _logger.info("MPS sync: no pending cycles.")
            return

        _logger.info("MPS sync: processing %d cycle(s).", len(cycles))
        for cycle_stub in cycles:
            cycle_id = cycle_stub["id"]
            try:
                self._process_cycle(cycle_id, headers)
            except Exception as exc:
                _logger.error(
                    "MPS sync error on cycle %s: %s", cycle_id, exc, exc_info=True
                )
                # Continue to next cycle — do not abort the whole run

    # ── Per-cycle processing ──────────────────────────────────────────────────

    def _process_cycle(self, cycle_id: str, headers: dict):
        if self._already_processed(cycle_id):
            _logger.info("Cycle %s already processed — skipping.", cycle_id)
            return

        # Fetch full export (this auto-sets cycle status to 'pending' in MPS)
        resp = requests.get(
            f"{MPS_BASE}/billing-cycles/{cycle_id}/odoo-export",
            headers=headers, timeout=TIMEOUT,
        )
        if resp.status_code == 404:
            _logger.warning("Cycle %s not found in MPS — skipping.", cycle_id)
            return
        resp.raise_for_status()
        data = resp.json()

        # Resolve Odoo entities
        partner  = self._resolve_partner(data["customer"]["id"])
        analytic = self._resolve_analytic(data["contract"]["id"])

        # Resolve company routing using explicit map (never raw name-search — names may differ)
        odoo_company_name = data["contract"].get("odoo_company")  # "FPI", "AL Farage", or None
        company = None
        if odoo_company_name:
            odoo_name = MPS_COMPANY_MAP.get(odoo_company_name)
            if odoo_name:
                company = self.env["res.company"].search([("name", "=", odoo_name)], limit=1)
            if not company:
                raise UserError(
                    f"MPS company '{odoo_company_name}' → Odoo name '{odoo_name}' not found. "
                    f"Check MPS_COMPANY_MAP and Settings → Companies."
                )

        # Multi-SO path (v3.1): use billing.orders
        orders = data["billing"].get("orders", [])
        if orders:
            for order in orders:
                self._create_and_acknowledge_so(
                    cycle_id   = cycle_id,
                    order      = order,
                    partner    = partner,
                    analytic   = analytic,
                    company    = company,
                    period_end = data["cycle"]["periodEnd"],
                    headers    = headers,
                )
        else:
            # Legacy single-SO path (v3.0): use billing.invoiceLines
            self._process_single_so_legacy(cycle_id, data, partner, analytic, headers)

        # Optional: update toner levels on maintenance.equipment records
        for printer in data.get("printers", []):
            equipment = self._resolve_printer(printer["id"])
            if equipment and printer.get("toner"):
                t = printer["toner"]
                equipment.write({
                    "x_toner_c":  t.get("c"),
                    "x_toner_m":  t.get("m"),
                    "x_toner_y":  t.get("y"),
                    "x_toner_k":  t.get("k"),
                    "x_toner_r1": t.get("r1"),
                    "x_toner_r2": t.get("r2"),
                })

    def _create_and_acknowledge_so(
        self, cycle_id, order, partner, analytic, company, period_end, headers
    ):
        """Create one Odoo invoice for a billing.orders entry and call /callback."""
        order_type = order["orderType"]
        try:
            invoice_lines = []
            for line in order["lines"]:
                invoice_lines.append({
                    "name":                  line["description"],  # ready-to-use — no formatting needed
                    "quantity":              line["qty"],
                    "price_unit":            line["unitPrice"],
                    "analytic_account_id":   analytic.id,
                })

            move_vals = {
                "move_type":         "out_invoice",
                "partner_id":        partner.id,
                "invoice_date":      period_end,
                "x_mps_cycle_id":    cycle_id,
                "x_mps_order_type":  order_type,
                "invoice_line_ids":  [(0, 0, l) for l in invoice_lines],
            }
            if company:
                move_vals["company_id"] = company.id

            move = self.env["account.move"].create(move_vals)
            move.action_post()

            self._acknowledge_order(
                headers    = headers,
                cycle_id   = cycle_id,
                order_type = order_type,
                status     = "synced",
                odoo_ref   = move.name,
            )
            _logger.info("Cycle %s / %s → Odoo %s. Done.", cycle_id, order_type, move.name)

        except Exception as exc:
            _logger.error(
                "Error on cycle %s / %s: %s", cycle_id, order_type, exc, exc_info=True
            )
            self._acknowledge_order(
                headers       = headers,
                cycle_id      = cycle_id,
                order_type    = order_type,
                status        = "error",
                error_code    = "ODOO_ERROR",
                error_message = str(exc)[:500],
            )

    def _acknowledge_order(
        self, headers, cycle_id, order_type, status,
        odoo_ref=None, error_code=None, error_message=None
    ):
        """POST /api/odoo/callback for one Sale Order."""
        payload = {
            "cycleId":      cycle_id,
            "orderType":    order_type,
            "status":       status,
            "odooRef":      odoo_ref,
            "errorCode":    error_code,
            "errorMessage": error_message,
        }
        resp = requests.post(
            f"{MPS_BASE}/odoo/callback",
            json=payload, headers=headers, timeout=TIMEOUT,
        )
        if resp.status_code != 200:
            _logger.warning(
                "Callback for %s/%s returned %s.", cycle_id, order_type, resp.status_code
            )

    def _process_single_so_legacy(self, cycle_id, data, partner, analytic, headers):
        """
        Legacy single-SO path using billing.invoiceLines (v3.0 behaviour).
        Used as fallback when billing.orders is absent.
        """
        invoice_lines = []
        for line in data["billing"]["invoiceLines"]:
            b = line["billing"]
            cycle_name = data["cycle"]["name"]
            if b.get("bwCost", 0):
                invoice_lines.append({
                    "name":                f"BW Pages — {cycle_name}",
                    "quantity":            b["bwExcess"],
                    "price_unit":          b["bwPrice"],
                    "analytic_account_id": analytic.id,
                })
            if b.get("colorCost", 0):
                invoice_lines.append({
                    "name":                f"Colour Pages — {cycle_name}",
                    "quantity":            b["colorExcess"],
                    "price_unit":          b["colorPrice"],
                    "analytic_account_id": analytic.id,
                })
            if b.get("fixedCharge", 0):
                invoice_lines.append({
                    "name":                f"Fixed Service Charge — {cycle_name}",
                    "quantity":            1,
                    "price_unit":          b["fixedCharge"],
                    "analytic_account_id": analytic.id,
                })

        move = self.env["account.move"].create({
            "move_type":        "out_invoice",
            "partner_id":       partner.id,
            "invoice_date":     data["cycle"]["periodEnd"],
            "x_mps_cycle_id":   cycle_id,
            "x_mps_order_type": "all",
            "invoice_line_ids": [(0, 0, l) for l in invoice_lines],
        })
        move.action_post()

        ack = requests.post(
            f"{MPS_BASE}/billing-cycles/{cycle_id}/mark-invoiced",
            json={"odooInvoiceId": move.name},
            headers=headers, timeout=TIMEOUT,
        )
        if ack.status_code not in (200, 409):
            ack.raise_for_status()
        _logger.info("Cycle %s (legacy) → Odoo %s. Done.", cycle_id, move.name)
```

---

## 7. Cron Job XML

```xml
<!-- mps_connector/data/mps_cron.xml -->
<odoo>
  <data noupdate="1">
    <record id="ir_cron_mps_sync" model="ir.cron">
      <field name="name">MPS: Sync Billing Cycles</field>
      <field name="model_id" ref="model_mps_sync"/>
      <field name="state">code</field>
      <field name="code">model.sync_billing_cycles()</field>
      <field name="interval_number">1</field>
      <field name="interval_type">hours</field>
      <field name="numbercall">-1</field>
      <field name="active">True</field>
      <field name="user_id" ref="base.user_root"/>
    </record>
  </data>
</odoo>
```

Adjust `interval_number` and `interval_type` to suit the billing cadence. Most deployments run once daily.

---

## 8. UUID Mapping Strategy

Every entity in MPS has a stable UUID that never changes and is never reused. Store these as foreign keys on the corresponding Odoo records:

| MPS entity | UUID location in payload | Odoo model | Custom field |
|---|---|---|---|
| Customer | `customer.id` | `res.partner` | `x_mps_customer_id` |
| Contract | `contract.id` | `account.analytic.account` | `x_mps_contract_id` |
| Printer | `printers[].id` | `maintenance.equipment` | `x_mps_printer_id` |
| Engineer | `printers[].engineer.id` | `res.users` or `hr.employee` | `x_mps_engineer_id` (optional) |
| Cycle | `cycle.id` | `account.move` | `x_mps_cycle_id` |

**One-time setup:** For each customer, contract, and printer in MPS, find or create the corresponding Odoo record and set the UUID field. After that, the integration runs fully automatically with no manual mapping.

---

## 9. Integration Workflow (Step by Step)

1. **Authenticate** — POST `/auth/login` → cache JWT for the run
2. **Poll** — GET `/billing-cycles` → list of confirmed, uninvoiced cycles
3. **Idempotency check** — for each cycle, search `account.move` where `x_mps_cycle_id = cycle.id`. If found, skip.
4. **Fetch export** — GET `/billing-cycles/:id/odoo-export` (auto-sets MPS status to `pending`)
5. **Resolve entities** — look up `res.partner` by `x_mps_customer_id`, `account.analytic.account` by `x_mps_contract_id`, `res.company` by name from `contract.odoo_company`
6. **Create SOs** — iterate `billing.orders`; create one `account.move` per entry; set `company_id` from step 5
7. **Acknowledge each SO** — POST `/odoo/callback` with `orderType`, `status=synced`, `odooRef=move.name` (or `status=error` on exception)
8. **Update toner** — write toner % fields to `maintenance.equipment` records (optional)
9. **Log & alert** — structured log per cycle; alert on unhandled errors

---

## 10. Go-Live Checklist

### Critical (must have before production)
- [ ] Service account credentials stored in `ir.config_parameter` — NOT in source code
- [ ] MPS API served over HTTPS only
- [ ] JWT token never appears in any log file
- [ ] `x_mps_cycle_id` idempotency check in place before creating any `account.move`
- [ ] All customers, contracts in MPS have UUID fields set on their Odoo counterparts
- [ ] 401 re-auth logic implemented and tested
- [ ] Rate limit handling (429 + `Retry-After`) implemented
- [ ] Multi-SO: `/callback` used for each SO, NOT `/mark-invoiced`

### Important
- [ ] Cron job runs as a restricted Odoo user, not Administrator
- [ ] Errors send alert to monitored channel (email or Teams/Slack)
- [ ] Test run against staging MPS environment completed before production

### Recommended
- [ ] Printer toner fields written to `maintenance.equipment`
- [ ] Monthly reconciliation: compare MPS cycle IDs against `account.move` records with `x_mps_cycle_id`
- [ ] `x_mps_order_type` field set on each move for audit trail

---

## 11. MPS Billing Terminology (for Odoo line naming)

| Term | Definition |
|---|---|
| Excess BW | Cumulative BW counter on device. MPS subtracts previous cycle's value for period delta. |
| Excess Colour | Same as Excess BW but for colour. |
| Billable BW | `max(0, currentBw - previousBw)`. Zero for baseline cycles. |
| Billable Colour | Same as Billable BW for colour. |
| Minimum Volume | Contractual minimum — customer billed for this even if actual usage is below it. |
| Fixed Charge | Flat monthly/quarterly fee, independent of page volume. |
| OSG | One-Service-Group — all printers pool volume, one invoice line. |
| PSG | Per-Service-Group — each printer billed individually by A4/A3. |
| PSG Simple | Simplified PSG — uses excess counters, not per-category A4/A3 math. |
| Baseline Cycle | Establishes starting counter values — billing amounts always zero. |

---

## 12. What the MPS Side Already Has (DO NOT re-implement on Odoo)

- `GET /api/billing-cycles` endpoint (filters by role automatically)
- `GET /api/billing-cycles/:id/odoo-export` endpoint (auto-sets pending status)
- `POST /api/billing-cycles/:id/mark-invoiced` endpoint
- `POST /api/odoo/callback` endpoint (tracks per-SO sync status, updates `odoo_orders` JSONB column)
- `POST /api/odoo/resolution-error` endpoint (whole-cycle pre-flight failures — unmapped customer/contract/company — logged to `invoice_logs`, surfaced in the Odoo Sync Log page; see §1.4)
- `GET /api/performance/engineers` and `/:id` endpoints
- `odoo_integration` role with blockOdoo middleware scoping access to only these endpoints
- Rate limiter (100 req / 15-min window, shared across all Odoo endpoints)
- `invoice_logs` table for sync audit trail (errors logged there, visible in Operations Monitor)
- `odoo_status` field on `billing_cycles` table: `pending / synced / partial / error / none`
- `odoo_orders` JSONB column on `billing_cycles` table (tracks per-SO state from callbacks)

The Odoo module only needs to: call the APIs, create `account.move` records, and call back. Everything else is handled by MPS.
