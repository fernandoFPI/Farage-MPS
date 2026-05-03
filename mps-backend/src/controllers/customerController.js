import * as service from '../services/customerService.js';

export async function list(req, res, next) {
  try {
    res.json(await service.listCustomers(req.query));
  } catch (err) { next(err); }
}

export async function create(req, res, next) {
  try {
    const { name, contactPerson, phone, email, requiresConfirmation } = req.body;
    res.status(201).json(await service.createCustomer({ name, contactPerson, phone, email, requiresConfirmation }));
  } catch (err) { next(err); }
}

export async function getById(req, res, next) {
  try {
    res.json(await service.getCustomerById(req.params.id));
  } catch (err) { next(err); }
}

export async function update(req, res, next) {
  try {
    const { name, contactPerson, phone, email, requiresConfirmation } = req.body;
    res.json(await service.updateCustomer(req.params.id, { name, contactPerson, phone, email, requiresConfirmation }));
  } catch (err) { next(err); }
}

export async function remove(req, res, next) {
  try {
    res.json(await service.deleteCustomer(req.params.id));
  } catch (err) { next(err); }
}
