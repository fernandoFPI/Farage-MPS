import { Router } from 'express';
import { verifyToken, requirePermission } from '../middleware/auth.js';
import { blockOdoo, requireOdooOrFinance } from '../middleware/odooGuard.js';
import {
  listGroups, getGroup, createGroup, updateGroup, deleteGroup,
  addMember, removeMember, getGroupSummary, getGroupByContract,
  billingSummary, markInvoiced,
} from '../controllers/contractGroupController.js';

const router = Router();
const manage = [verifyToken, blockOdoo, requirePermission('can_manage_contracts')];

// Management endpoints — blocked for Odoo
router.get('/',                              verifyToken, blockOdoo, listGroups);
router.post('/',                             ...manage,              createGroup);
router.get('/by-contract/:contractId',       verifyToken, blockOdoo, getGroupByContract);
router.get('/:id',                           verifyToken, blockOdoo, getGroup);
router.put('/:id',                           ...manage,              updateGroup);
router.delete('/:id',                        ...manage,              deleteGroup);
router.get('/:id/summary',                   verifyToken, blockOdoo, getGroupSummary);
router.post('/:id/members',                  ...manage,              addMember);
router.delete('/:id/members/:contractId',    ...manage,              removeMember);

// Odoo-accessible endpoints
router.get('/:id/billing-summary',           verifyToken, requireOdooOrFinance, billingSummary);
router.post('/:id/mark-invoiced',            verifyToken, requireOdooOrFinance, markInvoiced);

export default router;
