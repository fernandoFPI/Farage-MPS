import * as userService from '../services/userService.js';

export async function list(req, res, next) {
  try {
    const users = await userService.listUsers(req.query);
    res.json(users);
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const { fullName, email, password, roleId } = req.body;
    const user = await userService.createUser({ fullName, email, password, roleId });
    res.status(201).json(user);
  } catch (err) {
    next(err);
  }
}

export async function getById(req, res, next) {
  try {
    const user = await userService.getUserById(req.params.id);
    res.json(user);
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const { fullName, email, roleId, isActive, password } = req.body;
    const user = await userService.updateUser(req.params.id, {
      fullName,
      email,
      roleId,
      isActive,
      password,
    });
    res.json(user);
  } catch (err) {
    next(err);
  }
}

export async function deactivate(req, res, next) {
  try {
    const result = await userService.deactivateUser(req.params.id, req.user.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
}
