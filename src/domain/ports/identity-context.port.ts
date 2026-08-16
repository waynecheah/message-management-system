export type Identity = { readonly tenantId: string; readonly senderId: string };

export interface IdentityContext {
  /** Throws MissingIdentityError when there is no ambient identity. */
  require(): Identity;
}

export const IDENTITY_CONTEXT = Symbol('IdentityContext');
