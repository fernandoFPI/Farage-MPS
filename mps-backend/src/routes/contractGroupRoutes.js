import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import {
  listGroups, getGroup, createGroup, updateGroup, deleteGroup,
  addMember, removeMember, getGroupSummary, getGroupByContract,
} from '../controllers/contractGroupController.js';

const router = Router();
router.use(verifyToken);

router.get('/',                              listGroups);
router.post('/',                             createGroup);
router.get('/by-contract/:contractId',       getGroupByContract);
router.get('/:id',                           getGroup);
router.put('/:id',                           updateGroup);
router.delete('/:id',                        deleteGroup);
router.get('/:id/summary',                   getGroupSummary);
router.post('/:id/members',                  addMember);
router.delete('/:id/members/:contractId',    removeMember);

export default router;
