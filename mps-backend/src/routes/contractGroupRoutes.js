import { Router } from 'express';
import { verifyToken, requirePermission } from '../middleware/auth.js';
import { blockOdoo, requireOdooOrFinance } from '../middleware/odooGuard.js';
import {
  listGroups, getGroup, createGroup, updateGroup, deleteGroup,
  addMember, removeMember, getGroupSummary, getGroupByContract,
  billingSummary, markInvoiced,
} from '../controllers/contractGroupController.js';

const router = Router();
const edit = [verifyToken, blockOdoo, requirePermission('can_edit_contracts')];
const del  = [verifyToken, blockOdoo, requirePermission('can_delete_contracts')];
const view = [verifyToken, blockOdoo, requirePermission('can_view_operational_data')];

// Management endpoints — blocked for Odoo
router.get('/',                              ...view,                 listGroups);
router.post('/',                             ...edit,                createGroup);
router.get('/by-contract/:contractId',       ...view,                 getGroupByContract);
router.get('/:id',                           ...view,                 getGroup);
router.put('/:id',                           ...edit,                updateGroup);
router.delete('/:id',                        ...del,                 deleteGroup);
router.get('/:id/summary',                   ...view, requirePermission('can_view_billing_totals'), getGroupSummary);
router.post('/:id/members',                  ...edit,                addMember);
router.delete('/:id/members/:contractId',    ...edit,                removeMember);

// Odoo-accessible endpoints
router.get('/:id/billing-summary',           verifyToken, requireOdooOrFinance, billingSummary);
router.post('/:id/mark-invoiced',            verifyToken, requireOdooOrFinance, markInvoiced);

export default router;
