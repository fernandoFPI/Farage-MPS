import * as service from '../services/cycleGroupService.js';

export async function create(req, res, next) {
  try {
    const group = await service.createGroup(req.body, req.user.id);
    res.status(201).json(group);
  } catch (err) { next(err); }
}

export async function getById(req, res, next) {
  try {
    res.json(await service.getGroup(req.params.id));
  } catch (err) { next(err); }
}

export async function list(req, res, next) {
  try {
    res.json(await service.listGroups(req.query));
  } catch (err) { next(err); }
}

export async function remove(req, res, next) {
  try {
    if (req.user.role?.name !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }
    res.json(await service.deleteGroup(req.params.id));
  } catch (err) { next(err); }
}
