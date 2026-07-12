import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import * as userRepo from '../repositories/userRepository.js';
import { applyOverrides } from '../utils/permissions.js';

export async function login(email, password) {
  const user = await userRepo.findByEmailWithPassword(email);
  if (!user) {
    const err = new Error('Invalid credentials');
    err.status = 401;
    throw err;
  }

  if (!user.is_active) {
    const err = new Error('Account disabled');
    err.status = 403;
    throw err;
  }

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    const err = new Error('Invalid credentials');
    err.status = 401;
    throw err;
  }

  await userRepo.updateLastLogin(user.id);

  const token = jwt.sign(
    { id: user.id, email: user.email, roleId: user.role_id },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' },
  );

  const effectiveRole = applyOverrides(user.role, user.permission_overrides ?? {});
  return {
    token,
    user: {
      id: user.id,
      fullName: user.full_name,
      email: user.email,
      role: effectiveRole,
    },
  };
}

export async function getMe(userId) {
  const user = await userRepo.findById(userId);
  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }
  const effectiveRole = applyOverrides(user.role, user.permissionOverrides);
  return { ...user, role: effectiveRole };
}
