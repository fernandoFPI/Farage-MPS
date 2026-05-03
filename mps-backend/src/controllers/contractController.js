import * as service from '../services/contractService.js';

export async function list(req, res, next) {
  try {
    res.json(await service.listContracts(req.query));
  } catch (err) { next(err); }
}

export async function create(req, res, next) {
  try {
    res.status(201).json(await service.createContract(req.body));
  } catch (err) { next(err); }
}

export async function getById(req, res, next) {
  try {
    res.json(await service.getContractById(req.params.id));
  } catch (err) { next(err); }
}

export async function update(req, res, next) {
  try {
    res.json(await service.updateContract(req.params.id, req.body));
  } catch (err) { next(err); }
}

export async function remove(req, res, next) {
  try {
    res.json(await service.deleteContract(req.params.id));
  } catch (err) { next(err); }
}
