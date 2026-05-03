import * as svc from '../services/contractGroupService.js';

export async function listGroups(req, res, next) {
  try {
    res.json(await svc.listGroups());
  } catch (e) { next(e); }
}

export async function getGroup(req, res, next) {
  try {
    res.json(await svc.getGroupById(req.params.id));
  } catch (e) { next(e); }
}

export async function createGroup(req, res, next) {
  try {
    const group = await svc.createGroup(req.body);
    res.status(201).json(group);
  } catch (e) { next(e); }
}

export async function updateGroup(req, res, next) {
  try {
    res.json(await svc.updateGroup(req.params.id, req.body));
  } catch (e) { next(e); }
}

export async function deleteGroup(req, res, next) {
  try {
    res.json(await svc.deleteGroup(req.params.id));
  } catch (e) { next(e); }
}

export async function addMember(req, res, next) {
  try {
    const { contractId } = req.body;
    if (!contractId) return res.status(400).json({ error: 'contractId is required' });
    res.json(await svc.addMember(req.params.id, contractId));
  } catch (e) { next(e); }
}

export async function removeMember(req, res, next) {
  try {
    res.json(await svc.removeMember(req.params.id, req.params.contractId));
  } catch (e) { next(e); }
}

export async function getGroupSummary(req, res, next) {
  try {
    const { periodStart } = req.query;
    res.json(await svc.getGroupSummary(req.params.id, periodStart));
  } catch (e) { next(e); }
}

export async function getGroupByContract(req, res, next) {
  try {
    const groups = await svc.getGroupByContractId(req.params.contractId);
    res.json(groups);
  } catch (e) { next(e); }
}
