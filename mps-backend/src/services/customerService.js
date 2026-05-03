import * as repo from '../repositories/customerRepository.js';

export async function listCustomers(query) {
  return repo.findAll({ name: query.name });
}

export async function createCustomer({ name, contactPerson, phone, email, requiresConfirmation }) {
  if (!name) {
    const err = new Error('name is required');
    err.status = 400;
    throw err;
  }
  return repo.create({ name, contactPerson, phone, email, requiresConfirmation });
}

export async function getCustomerById(id) {
  const customer = await repo.findById(id);
  if (!customer) {
    const err = new Error('Customer not found');
    err.status = 404;
    throw err;
  }
  return customer;
}

export async function updateCustomer(id, { name, contactPerson, phone, email, requiresConfirmation }) {
  const existing = await repo.findById(id);
  if (!existing) {
    const err = new Error('Customer not found');
    err.status = 404;
    throw err;
  }
  return repo.update(id, { name, contactPerson, phone, email, requiresConfirmation });
}

export async function deleteCustomer(id) {
  const existing = await repo.findById(id);
  if (!existing) {
    const err = new Error('Customer not found');
    err.status = 404;
    throw err;
  }

  const blocked = await repo.hasActiveContracts(id);
  if (blocked) {
    const err = new Error('Customer has active contracts');
    err.status = 400;
    throw err;
  }

  await repo.deleteById(id);
  return { message: 'Customer deleted' };
}
