import jwt from 'jsonwebtoken';

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret === 'REPLACE_WITH_A_STRONG_RANDOM_SECRET') {
    throw new Error('JWT_SECRET is missing or insecure.');
  }

  if (Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('JWT_SECRET must be at least 32 bytes long.');
  }

  return secret;
};

export function generateAccessToken(user) {
  return jwt.sign(
    {
      sub: String(user.id),
      role: user.role
    },
    getJwtSecret(),
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '15m',
      issuer: 'satyajit-portfolio',
      audience: 'satyajit-portfolio-api'
    }
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, getJwtSecret(), {
    issuer: 'satyajit-portfolio',
    audience: 'satyajit-portfolio-api'
  });
}