const sanitizeUser = (user) => {
  if (!user) return null;

  const sanitizedUser = user.toObject ? user.toObject() : { ...user };

  // Remove sensitive fields
  delete sanitizedUser.password;
  delete sanitizedUser.referrer;
  delete sanitizedUser.password;

  return sanitizedUser;
};

module.exports = sanitizeUser;
