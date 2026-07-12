import bcrypt from 'bcryptjs';
import * as userRepo from '../repositories/userRepository.js';
import { sanitiseOverrides } from '../utils/permissions.js';

export async function listUsers(query) {
  const filter = {};
  if (query.is_active !== undefined) {
    filter.isActive = query.is_active === 'true';
  }
  return userRepo.findAll(filter);
}

export async function createUser({ fullName, email, password, roleId }) {
  if (!fullName || !email || !password || !roleId) {
    const err = new Error('fullName, email, password, and roleId are required');
    err.status = 400;
    throw err;
  }

  const taken = await userRepo.emailExists(email);
  if (taken) {
    const err = new Error('Email already in use');
    err.status = 409;
    throw err;
  }

  const validRole = await userRepo.roleExists(roleId);
  if (!validRole) {
    const err = new Error('Invalid role');
    err.status = 400;
    throw err;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  return userRepo.create({ fullName, email, passwordHash, roleId });
}

export async function getUserById(id) {
  const user = await userRepo.findById(id);
  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }
  return user;
}

export async function updateUser(id, { fullName, email, roleId, isActive, password }) {
  const existing = await userRepo.findById(id);
  if (!existing) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }

  if (email && email !== existing.email) {
    const taken = await userRepo.emailExists(email, id);
    if (taken) {
      const err = new Error('Email already in use');
      err.status = 409;
      throw err;
    }
  }

  if (roleId !== undefined) {
    const validRole = await userRepo.roleExists(roleId);
    if (!validRole) {
      const err = new Error('Invalid role');
      err.status = 400;
      throw err;
    }
  }

  const passwordHash = password ? await bcrypt.hash(password, 12) : undefined;
  return userRepo.update(id, { fullName, email, roleId, isActive, passwordHash });
}

export async function updateUserPermissions(id, rawOverrides) {
  const existing = await userRepo.findById(id);
  if (!existing) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }
  return userRepo.updatePermissionOverrides(id, sanitiseOverrides(rawOverrides));
}

export async function deactivateUser(id, requesterId) {
  if (id === requesterId) {
    const err = new Error('Cannot deactivate your own account');
    err.status = 400;
    throw err;
  }

  const existing = await userRepo.findById(id);
  if (!existing) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }

  await userRepo.update(id, { isActive: false });
  return { message: 'User deactivated' };
}
