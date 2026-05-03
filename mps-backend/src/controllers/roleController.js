import * as roleRepository from '../repositories/roleRepository.js';

export async function getAll(req, res, next) {
  try {
    const roles = await roleRepository.findAll();
    res.json(roles);
  } catch (err) {
    next(err);
  }
}
