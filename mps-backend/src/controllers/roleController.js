import * as roleRepository from '../repositories/roleRepository.js';
import { ALL_PERMISSION_FLAGS } from '../utils/permissions.js';

// Roles whose name other code checks for directly (blockOdoo, requireAdmin,
// requireOdooOrFinance) — deleting the row wouldn't break those checks, but
// renaming/removing them would silently strand the accounts that depend on
// that exact behavior, so the API keeps them out of reach.
const PROTECTED_ROLE_NAMES = ['admin', 'odoo_integration'];
const NAME_PATTERN = /^[a-z][a-z0-9_]*$/;

function buildFlags(source) {
  const flags = {};
  for (const flag of ALL_PERMISSION_FLAGS) {
    flags[flag] = source[flag] === true;
  }
  return flags;
}

export async function getAll(req, res, next) {
  try {
    const roles = await roleRepository.findAll();
    res.json(roles);
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const name = String(req.body.name || '').trim().toLowerCase();
    if (!NAME_PATTERN.test(name)) {
      return res.status(400).json({
        error: 'Role name must start with a letter and contain only lowercase letters, numbers and underscores',
      });
    }
    const description = req.body.description ? String(req.body.description).trim() : null;
    const role = await roleRepository.create({ name, description, flags: buildFlags(req.body) });
    res.status(201).json(role);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A role with this name already exists' });
    }
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const existing = await roleRepository.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Role not found' });
    if (PROTECTED_ROLE_NAMES.includes(existing.name) && req.body.name && req.body.name !== existing.name) {
      return res.status(403).json({ error: `The ${existing.name} role cannot be renamed` });
    }
    const description = req.body.description !== undefined
      ? (req.body.description ? String(req.body.description).trim() : null)
      : existing.description;
    const role = await roleRepository.update(req.params.id, {
      description,
      flags: buildFlags({ ...existing, ...req.body }),
    });
    res.json(role);
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    const existing = await roleRepository.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Role not found' });
    if (PROTECTED_ROLE_NAMES.includes(existing.name)) {
      return res.status(403).json({ error: `The ${existing.name} role cannot be deleted` });
    }
    const usersWithRole = await roleRepository.countUsersWithRole(req.params.id);
    if (usersWithRole > 0) {
      return res.status(409).json({ error: `${usersWithRole} user(s) still have this role — reassign them before deleting it` });
    }
    await roleRepository.remove(req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
