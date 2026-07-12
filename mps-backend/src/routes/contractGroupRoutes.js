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

// Management endpoints — blocked for Odoo
router.get('/',                              verifyToken, blockOdoo, listGroups);
router.post('/',                             ...edit,                createGroup);
router.get('/by-contract/:contractId',       verifyToken, blockOdoo, getGroupByContract);
router.get('/:id',                           verifyToken, blockOdoo, getGroup);
router.put('/:id',                           ...edit,                updateGroup);
router.delete('/:id',                        ...del,                 deleteGroup);
router.get('/:id/summary',                   verifyToken, blockOdoo, getGroupSummary);
router.post('/:id/members',                  ...edit,                addMember);
router.delete('/:id/members/:contractId',    ...edit,                removeMember);

// Odoo-accessible endpoints
router.get('/:id/billing-summary',           verifyToken, requireOdooOrFinance, billingSummary);
router.post('/:id/mark-invoiced',            verifyToken, requireOdooOrFinance, markInvoiced);

export default router;
