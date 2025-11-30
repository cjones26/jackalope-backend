// Type definitions

export interface JWTPayload {
  sub: string;
  email: string;
  aud?: string;
  exp?: number;
  iat?: number;
  iss?: string;
  role?: string;
}
